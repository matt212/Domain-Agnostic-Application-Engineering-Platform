'use strict';

/**
 * 8.5.2 - DIAGRAMS, AI-ENHANCED (Qwen via llama-cli)
 *
 * Baseline : the three PostgreSQL repositories (knowledge base, requirements schema, business_rule_discovery).
 *            The deterministic diagram built from them is the STARTING POINT. The model keeps what is right,
 *            fixes what is wrong and INVENTS what an experienced analyst would expect (marked "inferred").
 * The model returns a small JSON spec per diagram; code validates it and renders the Mermaid, so the
 * diagram syntax is always valid. A unit the model cannot produce falls back to the baseline diagram.
 *
 * Diagrams (one .md file each): use case, process (BPMN-style), sequence, state machine, decision table / DMN.
 *
 * USAGE
 *   node 8.5.2.DiagramsAI.js                                  generate everything missing (resumable), then render
 *   node 8.5.2.DiagramsAI.js --diagram "use case"             only that diagram (still resumable)
 *   node 8.5.2.DiagramsAI.js --rerun --diagram "sequence"     discard and regenerate that diagram
 *   node 8.5.2.DiagramsAI.js --rerun --diagram "state" --failed    redo only the units that failed
 *   node 8.5.2.DiagramsAI.js --rerun --failed                 redo every failed unit of every diagram
 *   node 8.5.2.DiagramsAI.js --rerun --unit STATE-003         redo one unit
 *   node 8.5.2.DiagramsAI.js --status                         show what succeeded, failed or is pending
 *   node 8.5.2.DiagramsAI.js --render                         re-render the .md files from saved results (no AI)
 *   node 8.5.2.DiagramsAI.js --limit 2                        smoke test: first 2 selected units only
 *
 * Diagram names: "use case", "process" (or bpmn), "sequence", "state" (or state machine), "decision" (or dmn), "all".
 * Requires 8.5.0.DiagramCommon.js in the same folder. Local llama-cli only: MODEL_NAME, LLAMA_CLI_PATH, THREADS.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./8.0.12.DiagramCommon.js');

const ROOT = process.cwd();
const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';
const OUTPUT_DIR = process.env.DIAGRAM_OUTPUT_DIR_AI ||
    path.join(ROOT, 'app/utils/appflowgeneratorAI/aiOutput/diagrams/ai');
const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
const PROMPT_VERSION = '1';

const SETTINGS = {
    threads: Number(process.env.THREADS || 6),
    llamaBatch: 512,
    temperature: 0.3,
    timeoutMs: 30 * 60 * 1000,
    heartbeatMs: 30000,
    retries: 1,
    context: 6144,
    tokens: 1800,
    contextChars: 3000,
    baselineChars: 3800,
    decisionGroups: Number(process.env.DECISION_GROUPS || 5)
};

const { log, arr, uniq, cut, norm, same } = C;
const pad = n => String(n).padStart(3, '0');

// ============================================================
// 1. DIAGRAM CATALOGUE AND CLI
// ============================================================

const DIAGRAMS = {
    usecase: { name: 'use case', file: '01_use_case_diagram.md', title: 'Use Case Diagram' },
    process: { name: 'process', file: '02_business_process_bpmn.md', title: 'BPMN-style Business Process Diagram' },
    sequence: { name: 'sequence', file: '03_sequence_diagram.md', title: 'Sequence Diagram' },
    state: { name: 'state', file: '04_state_machine_diagrams.md', title: 'State Machine Diagrams' },
    decision: { name: 'decision', file: '05_decision_table_dmn.md', title: 'Decision Table / DMN' }
};

function diagramKey(name) {
    const t = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (t === 'all') return 'all';
    if (/^usecase/.test(t)) return 'usecase';
    if (/^(process|bpmn|businessprocess)/.test(t)) return 'process';
    if (/^sequence/.test(t)) return 'sequence';
    if (/^state/.test(t)) return 'state';
    if (/^(decision|dmn)/.test(t)) return 'decision';
    throw new Error(`Unknown diagram "${name}". Use one of: "use case", "process", "sequence", "state", "decision", "all".`);
}

function parseArgs(argv) {
    const o = { rerun: false, failed: false, status: false, render: false, help: false, diagram: null, unit: null, limit: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
        if (a === '--rerun') o.rerun = true;
        else if (a === '--failed') o.failed = true;
        else if (a === '--status') o.status = true;
        else if (a === '--render') o.render = true;
        else if (a === '--help' || a === '-h') o.help = true;
        else if (a === '--diagram') o.diagram = diagramKey(val());
        else if (a === '--unit') o.unit = val().toUpperCase();
        else if (a === '--limit') o.limit = Number(val());
        else throw new Error(`Unknown option ${a}. Run with --help.`);
    }
    if (o.rerun && !o.diagram && !o.unit && !o.failed) {
        throw new Error('--rerun needs a target: --diagram <name> (or "all"), --unit <id> or --failed.');
    }
    return o;
}

const USAGE = `Usage: node 8.5.2.DiagramsAI.js [options]
  (no options)               generate every missing unit (resumable), then render the .md files
  --diagram <name>           only that diagram: "use case" | "process" | "sequence" | "state" | "decision" | "all"
  --rerun                    discard saved results of the selected units and regenerate them
  --failed                   restrict to units that failed (combine with --rerun to redo only those)
  --unit <id>                one unit, for example STATE-003 (see --status)
  --limit <n>                only the first n selected units (smoke test)
  --status                   show every unit: ok / failed / pending
  --render                   re-render the .md files from saved results, no AI
Examples:
  --rerun --diagram "use case"      --rerun --diagram "sequence"      --rerun --diagram "process"
  --rerun --diagram "state"         --rerun --diagram "decision"      --rerun --failed`;

// ============================================================
// 2. LOCAL MODEL RUNNER
// ============================================================

function runLocal(label, prompt, maxTokens) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let out = '';
        const args = [
            '-hf', MODEL, '-c', String(SETTINGS.context), '-n', String(maxTokens),
            '-t', String(SETTINGS.threads), '-b', String(SETTINGS.llamaBatch), '-ngl', '0',
            '--temp', String(SETTINGS.temperature), '--reasoning', 'off',
            '--no-display-prompt', '--simple-io', '--log-disable', '-st', '-p', prompt
        ];
        const child = spawn(LLAMA_CLI, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        const hb = setInterval(() => log(`${label} running ${((Date.now() - started) / 1000).toFixed(0)}s, ${out.length} bytes`), SETTINGS.heartbeatMs);
        const to = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, SETTINGS.timeoutMs);
        child.stdout.on('data', d => { out += d.toString(); });
        child.on('error', e => { clearInterval(hb); clearTimeout(to); reject(e); });
        child.on('close', () => { clearInterval(hb); clearTimeout(to); resolve(out); });
    });
}
let runner = runLocal;
const setRunner = fn => { runner = fn; };
const NO_THINK = '<think>\n\n</think>\n\n';

function extractJson(raw) {
    const text = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '');
    const start = text.indexOf('{');
    if (start < 0) throw new Error('no JSON object in output');
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
    throw new Error('unterminated JSON (output hit the token limit)');
}

// parse + validate; the rejection reason is fed back to the model once
async function ask(label, promptFn, parse) {
    let hint = '', error = '';
    for (let a = 0; a <= SETTINGS.retries; a++) {
        try {
            return { ok: true, value: parse(extractJson(await runner(`${label} try ${a + 1}`, promptFn(hint), SETTINGS.tokens))) };
        } catch (e) { hint = e.message; error = e.message; log(`${label} try ${a + 1} rejected: ${hint}`); }
    }
    return { ok: false, error };
}

// ============================================================
// 3. SPEC VALIDATORS (what the model returns is never trusted)
// ============================================================

const clean = (s, n = 80) => cut(String(s ?? '').replace(/\s+/g, ' ').trim(), n);
const bool = v => v === true || /^true$/i.test(String(v));

// give every item a unique string id; accept the model's ids, otherwise number them
function withIds(list, prefix, cap) {
    const seen = new Set();
    return arr(list).slice(0, cap).map((x, i) => {
        let id = x && x.id !== undefined && String(x.id).trim() ? String(x.id).trim() : `${prefix}${i + 1}`;
        while (seen.has(id)) id = `${id}_${i + 1}`;
        seen.add(id);
        return { ...x, id };
    });
}
// resolve a reference that may be an id or a name
const resolver = items => ref => {
    const r = String(ref ?? '').trim();
    const byId = items.find(x => x.id === r);
    if (byId) return byId.id;
    const byName = items.find(x => x.name && same(x.name, r)) || items.find(x => x.label && same(x.label, r));
    return byName ? byName.id : null;
};

function validateUseCase(raw, fallbackSystem) {
    const actors = withIds(raw.actors, 'a', 16).map(a => ({
        id: a.id, name: clean(a.name, 60),
        kind: /system|automat/i.test(a.kind) ? 'system' : /external|third|organi[sz]ation/i.test(a.kind) ? 'external' : 'internal',
        inferred: bool(a.inferred)
    })).filter(a => a.name);
    const useCases = withIds(raw.use_cases, 'u', 30).map(u => ({ id: u.id, name: clean(u.name, 70), inferred: bool(u.inferred) })).filter(u => u.name);
    const ra = resolver(actors), ru = resolver(useCases);
    const links = [];
    arr(raw.links).forEach(l => {
        const a = ra(l.actor), u = ru(l.use_case || l.usecase);
        if (a && u && !links.some(x => x.actor === a && x.use_case === u)) links.push({ actor: a, use_case: u, kind: /support/i.test(l.kind) ? 'supporting' : 'primary' });
    });
    const includes = [];
    arr(raw.includes).forEach(i => {
        const f = ru(i.from), t = ru(i.to);
        if (f && t && f !== t) includes.push({ from: f, to: t, kind: /extend/i.test(i.kind) ? 'extend' : 'include' });
    });
    if (!actors.length) throw new Error('no usable actors');
    if (useCases.length < 2) throw new Error('need at least 2 use cases');
    if (!links.length) throw new Error('no valid links between actors and use cases (use the ids you defined)');
    return { title: clean(raw.title, 80), system_name: clean(raw.system_name, 80) || fallbackSystem, actors, use_cases: useCases, links, includes };
}

function validateProcess(raw) {
    let nodes = withIds(raw.nodes, 'n', 26).map(n => ({
        id: n.id, label: clean(n.label, 70), inferred: bool(n.inferred),
        type: /start/i.test(n.type) ? 'start' : /end|finish/i.test(n.type) ? 'end' : /decision|gateway/i.test(n.type) ? 'decision' : /exception|error/i.test(n.type) ? 'exception' : 'task',
        lane: clean(n.lane, 50)
    })).filter(n => n.label || n.type === 'start' || n.type === 'end');
    nodes.forEach(n => { if (!n.label) n.label = n.type === 'start' ? 'Start' : 'End'; if (['start', 'end'].includes(n.type)) n.lane = ''; else if (!n.lane) n.lane = 'Unassigned'; });
    const firstStart = nodes.find(n => n.type === 'start');
    nodes = nodes.filter(n => n.type !== 'start' || n === firstStart);
    const r = resolver(nodes);
    let flows = [];
    arr(raw.flows).forEach(f => {
        const a = r(f.from), b = r(f.to);
        if (!a || !b || a === b || flows.some(x => x.from === a && x.to === b)) return;
        const toExc = (nodes.find(n => n.id === b) || {}).type === 'exception';
        flows.push({ from: a, to: b, label: clean(f.label, 40), kind: /exception|fail/i.test(f.kind) || toExc ? 'exception' : 'normal' });
    });
    // isolated nodes cannot be drawn meaningfully
    nodes = nodes.filter(n => flows.some(f => f.from === n.id || f.to === n.id));
    flows = flows.filter(f => nodes.some(n => n.id === f.from) && nodes.some(n => n.id === f.to));
    if (nodes.filter(n => n.type === 'task').length < 3) throw new Error('need at least 3 task nodes connected by flows (use the ids you defined)');
    if (!nodes.some(n => n.type === 'start')) {
        const first = nodes.find(n => !flows.some(f => f.to === n.id) && n.type !== 'exception') || nodes[0];
        nodes.unshift({ id: 'start', type: 'start', label: 'Start', lane: '' });
        flows.unshift({ from: 'start', to: first.id, label: '', kind: 'normal' });
    }
    if (!nodes.some(n => n.type === 'end')) {
        const last = [...nodes].reverse().find(n => n.type === 'task' && !flows.some(f => f.from === n.id)) || [...nodes].reverse().find(n => n.type === 'task');
        nodes.push({ id: 'finish', type: 'end', label: 'End', lane: '' });
        flows.push({ from: last.id, to: 'finish', label: '', kind: 'normal' });
    }
    return { title: clean(raw.title, 80), nodes, flows };
}

function validateSequence(raw) {
    const participants = withIds(raw.participants, 'p', 10).map(p => ({
        id: p.id, name: clean(p.name, 40), kind: /participant|system/i.test(p.kind) ? 'participant' : 'actor'
    })).filter(p => p.name);
    if (participants.length < 2) throw new Error('need at least 2 participants');
    const rp = resolver(participants);
    const steps = [];
    let depth = 0;
    arr(raw.steps).slice(0, 44).forEach(s => {
        const type = /note/i.test(s.type) ? 'note' : /^else/i.test(s.type) ? 'else' : /^alt/i.test(s.type) ? 'alt' : /^end/i.test(s.type) ? 'end' : 'message';
        const inferred = bool(s.inferred);
        if (type === 'message') {
            const from = rp(s.from), to = rp(s.to);
            if (!from || !to || !clean(s.text)) return;
            steps.push({ type, from, to, text: clean(s.text, 80), style: from === to ? 'self' : /dash|return|async|reply/i.test(s.style) ? 'dashed' : 'sync', inferred });
        } else if (type === 'note') {
            const over = uniq(arr(s.over).concat(s.from ? [s.from] : []).map(rp));
            if (!over.length || !clean(s.text)) return;
            steps.push({ type, over, text: clean(s.text, 90), inferred });
        } else if (type === 'alt') { depth++; steps.push({ type, text: clean(s.text, 60) || 'Condition', inferred }); }
        else if (type === 'else') { if (depth) steps.push({ type, text: clean(s.text, 60) || 'Otherwise', inferred }); }
        else if (type === 'end') { if (depth) { depth--; steps.push({ type }); } }
    });
    while (depth--) steps.push({ type: 'end' });
    if (steps.filter(s => s.type === 'message').length < 4) throw new Error('need at least 4 messages between the participants you defined');
    return { title: clean(raw.title, 80), participants, steps };
}

function validateState(raw, objectName) {
    const states = withIds(raw.states, 's', 10).map(s => ({ id: s.id, name: clean(s.name, 45), inferred: bool(s.inferred) })).filter(s => s.name);
    if (states.length < 2) throw new Error('need at least 2 states');
    const rs = resolver(states);
    const transitions = [];
    arr(raw.transitions).slice(0, 18).forEach(t => {
        const f = rs(t.from), to = rs(t.to);
        if (f && to) transitions.push({ from: f, to, event: clean(t.event, 45) || 'moves', guard: clean(t.guard, 45), inferred: bool(t.inferred) });
    });
    if (!transitions.length) throw new Error('no valid transitions (use the state ids you defined)');
    const initial = rs(raw.initial) || states[0].id;
    let finals = uniq(arr(raw.finals).map(rs));
    if (!finals.length) finals = states.filter(s => !transitions.some(t => t.from === s.id) && s.id !== initial).map(s => s.id).slice(0, 3);
    if (!finals.length) finals = [states[states.length - 1].id];
    const notes = arr(raw.notes).map(n => ({ state: rs(n.state), text: clean(n.text, 90) })).filter(n => n.state && n.text).slice(0, 3);
    return { object: clean(raw.object, 60) || objectName, states, transitions, notes, initial, finals };
}

const HIT = { U: 'U (Unique)', A: 'A (Any)', P: 'P (Priority)', F: 'F (First)', R: 'R (Rule order)', O: 'O (Output order)', C: 'C (Collect)' };
function validateDecision(raw, model) {
    const inputs = arr(raw.inputs).map(x => clean(typeof x === 'object' ? x.name : x, 40)).filter(Boolean).slice(0, 4);
    const outputs = arr(raw.outputs).map(x => clean(typeof x === 'object' ? x.name : x, 40)).filter(Boolean).slice(0, 3);
    if (!inputs.length || !outputs.length) throw new Error('need at least 1 input column and 1 output column');
    const refs = new Map(model.rules.map(r => [r.ref, r]));
    const fit = (list, n) => Array.from({ length: n }, (_, i) => clean(arr(list)[i], 140) || '-');
    const rows = arr(raw.rows).slice(0, 16).map(r => {
        const base = refs.get(String(r.rule || '').trim());
        return {
            when: fit(r.when, inputs.length), then: fit(r.then, outputs.length), rule: base ? base.ref : '',
            type: base ? base.type : '', severity: base ? base.severity : '', enforcement: base ? base.enforcement : '',
            basis: bool(r.inferred) ? 'inferred' : (base ? base.basis : ''), inferred: bool(r.inferred)
        };
    }).filter(r => r.when.some(x => x !== '-') || r.then.some(x => x !== '-'));
    if (rows.length < 2) throw new Error('need at least 2 rows');
    const key = String(raw.hit_policy || 'C').trim().toUpperCase()[0];
    return { name: clean(raw.name, 70), hit_policy: `${HIT[key] || HIT.C}`, inputs, outputs, rows };
}

function countInferred(spec) {
    return ['actors', 'use_cases', 'nodes', 'flows', 'steps', 'states', 'transitions', 'rows']
        .reduce((n, k) => n + arr(spec[k]).filter(x => x && x.inferred).length, 0);
}

// ============================================================
// 4. UNITS: what is asked of the model, with the baseline it starts from
// ============================================================

function buildUnits(model) {
    const units = [];
    const uc = C.buildUseCaseSpecs(model);
    units.push({ id: 'USECASE-1', diagram: 'usecase', title: 'Use cases from business activities', baseline: uc[0],
        focus: 'Each use case is something an actor wants to achieve with the system. Show all actors, including those the baseline misses, and relations between use cases (include / extend).' });
    if (uc[1]) {
        units.push({ id: 'USECASE-2', diagram: 'usecase', title: 'Functional capabilities', baseline: uc[1],
            focus: 'Group the business requirements into at most 14 functional capabilities (use cases) and connect each to the actors who need it.' });
    }
    const proc = C.buildProcessSpec(model);
    units.push({ id: 'PROCESS-1', diagram: 'process', title: 'Main end-to-end process', baseline: proc,
        focus: 'The main end-to-end business process from its trigger to completion, one lane per responsible actor, with business rule decisions and their exception outcomes.' });
    units.push({ id: 'PROCESS-2', diagram: 'process', title: 'Exceptions and disputes', baseline: proc,
        focus: 'What can go wrong in this business: failures, rejections, timeouts, disputes, cancellations. For each, how it is detected, who handles it, what is done to put it right and how the process ends.' });
    const seq = C.buildSequenceSpec(model);
    [['SEQ-1', 'Core transaction', 'the main end-to-end transaction, from the first request to completion'],
        ['SEQ-2', 'Money and value movement', 'how money or value moves between the parties and is settled, including checks and confirmations'],
        ['SEQ-3', 'Failure and dispute handling', 'what happens over time when something fails or a party raises a dispute, and how it is resolved']]
        .forEach(([id, title, what]) => units.push({ id, diagram: 'sequence', title, baseline: seq, focus: `Draw the interactions over time for ${what}.` }));

    const states = C.buildStateSpecs(model);
    model.objects.forEach((o, i) => {
        const base = states.find(s => s.object === o.name) || { object: o.name, states: [], transitions: [] };
        units.push({ id: `STATE-${pad(i + 1)}`, diagram: 'state', title: o.name, subject: o.name, baseline: base,
            focus: `Draw the lifecycle of the business object "${o.name}": its states, the events that move it, the guards (business rules) on each move, and the abnormal states it can end up in.` });
    });
    const dec = C.buildDecisionSpecs(model);
    dec.tables.slice(0, SETTINGS.decisionGroups).forEach((t, i) => {
        units.push({ id: `DEC-${pad(i + 1)}`, diagram: 'decision', title: t.name, subject: t.subject, baseline: t,
            focus: `Write the decision table for "${t.subject}": the inputs that drive each decision, the outcome, and rows for every important combination. Use several input columns where a decision depends on more than one thing.` });
    });
    return units;
}

const inputHash = u => C.shortHash(JSON.stringify([PROMPT_VERSION, u.id, u.focus, u.baseline]));
const unitPath = u => path.join(UNIT_DIR, `${u.id}.json`);
function readUnit(u) {
    try { return JSON.parse(fs.readFileSync(unitPath(u), 'utf8')); } catch { return null; }
}
// ok = a valid result made from the CURRENT baseline
function unitState(u) {
    const r = readUnit(u);
    if (!r) return 'pending';
    if (r.status === 'ok') return r.input_hash === inputHash(u) ? 'ok' : 'stale';
    return 'failed';
}

// ============================================================
// 5. PROMPTS
// ============================================================

function compact(spec, max) {
    let s = JSON.stringify(spec);
    if (s.length <= max) return s;
    const copy = JSON.parse(s);
    const keys = Object.keys(copy).filter(k => Array.isArray(copy[k]));
    while (JSON.stringify(copy).length > max) {
        const k = [...keys].sort((a, b) => copy[b].length - copy[a].length)[0];
        if (!k || copy[k].length <= 3) break;
        copy[k].pop();
    }
    return JSON.stringify(copy);
}

function contextFor(u, model) {
    const L = [`System: ${model.systemName}`];
    const actors = () => { L.push('ACTORS:', ...model.actors.map(a => `- ${a.name} (${a.kind}): ${cut(a.role, 70)}`)); };
    const acts = (n = 20) => {
        L.push('ACTIVITIES IN ORDER:', ...model.activities.slice(0, n).map((a, i) =>
            `${i + 1}. ${a.name} [${a.stage || '-'}] by ${a.primary}${a.supporting.length ? ' with ' + a.supporting.join(', ') : ''}; in: ${a.inputs.join(', ') || '-'}; out: ${a.outputs.join(', ') || '-'}`));
    };
    const rules = (list, n) => { L.push('BUSINESS RULES:', ...list.slice(0, n).map(r => `- ${r.ref} [${r.type}] ${cut(r.statement, 110)} | if broken: ${cut(r.ifViolated, 50)}`)); };
    if (u.diagram === 'usecase') {
        actors();
        if (u.id === 'USECASE-2') L.push('BUSINESS REQUIREMENTS:', ...model.brs.slice(0, 30).map(b => `- ${b.id} ${b.name}`)); else acts();
    } else if (u.diagram === 'process') {
        acts(); rules(model.rules.filter(r => C.DECISION_TYPES.includes(r.type) || r.type === 'Exception handling'), 14);
    } else if (u.diagram === 'sequence') {
        actors(); acts(14);
        const flows = model.irs.slice(0, 8).map(r => `- ${r.label}: ${cut(r.source, 60)} -> ${r.consumers.slice(0, 3).join(', ')}`);
        if (flows.length) L.push('INFORMATION FLOWS:', ...flows);
    } else if (u.diagram === 'state') {
        const o = model.objects.find(x => x.name === u.subject) || {};
        L.push(`OBJECT: ${u.subject}`, `Purpose: ${o.purpose || '-'}`, `Role in the lifecycle: ${o.lifecycle || '-'}`, `Depends on: ${arr(o.deps).join(', ') || '-'}`);
        L.push('ACTIVITIES THAT TOUCH IT:', ...model.activities.filter(a => [...a.inputs, ...a.outputs].some(x => same(x, u.subject))).map(a => `- ${a.name} [${a.stage || '-'}]: ${a.outcome || a.desc}`));
        rules(model.rules.filter(r => r.objects.some(x => same(x, u.subject))), 10);
    } else if (u.diagram === 'decision') {
        const o = model.objects.find(x => x.name === u.subject) || {};
        L.push(`DECISION SUBJECT: ${u.subject}`, o.purpose ? `Purpose: ${o.purpose}` : '');
        rules(model.rules.filter(r => (r.objects.length ? r.objects.some(x => same(x, u.subject)) : u.subject === 'Cross-cutting')), 14);
    }
    return cut(L.filter(Boolean).join('\n'), SETTINGS.contextChars * 2).slice(0, SETTINGS.contextChars);
}

const COMMON = cap => `You are a senior business analyst and solution architect drawing ONE diagram as structured data.

The BASELINE shows what the repositories already contain. It is a starting point, not a limit and not proof:
keep what is correct, fix what is wrong, and ADD what an experienced analyst would expect in this kind of
business but the baseline lacks (missing actors, steps, alternative paths, exceptions, states, guards,
decisions). Mark every element you add with "inferred": true.

Rules:
- business language only; no technology, screens or databases
- use only ids that you define in your own output
- keep it readable: ${cap}
- return ONLY the JSON object, no Markdown, no commentary`;

const SCHEMAS = {
    usecase: `{"system_name":"","actors":[{"id":"a1","name":"","kind":"human or external or system","inferred":false}],
"use_cases":[{"id":"u1","name":"","inferred":false}],
"links":[{"actor":"a1","use_case":"u1","kind":"primary or supporting"}],
"includes":[{"from":"u1","to":"u2","kind":"include or extend"}]}`,
    process: `{"title":"","nodes":[{"id":"n1","type":"start or task or decision or exception or end","lane":"responsible actor (not for start/end)","label":"","inferred":false}],
"flows":[{"from":"n1","to":"n2","label":"","kind":"normal or exception"}]}`,
    sequence: `{"title":"","participants":[{"id":"p1","name":"","kind":"actor or participant"}],
"steps":[{"type":"message","from":"p1","to":"p2","text":"","style":"sync or dashed","inferred":false},
{"type":"note","over":["p1"],"text":""},{"type":"alt","text":"condition"},{"type":"else","text":"otherwise"},{"type":"end"}]}`,
    state: `{"object":"","states":[{"id":"s1","name":"","inferred":false}],"initial":"s1","finals":["s3"],
"transitions":[{"from":"s1","to":"s2","event":"","guard":"business rule that must hold","inferred":false}],
"notes":[{"state":"s1","text":""}]}`,
    decision: `{"name":"","hit_policy":"U or A or P or F or C","inputs":["input column"],"outputs":["output column"],
"rows":[{"when":["value for each input column"],"then":["value for each output column"],"rule":"rule ref such as R-001 or empty","inferred":false}]}`
};
const CAPS = {
    usecase: 'at most 14 actors and 24 use cases',
    process: 'at most 22 nodes; every node must be connected by a flow; exception nodes describe the outcome in a few words',
    sequence: 'at most 10 participants and 36 steps; close every alt block with an end step',
    state: 'at most 9 states and 16 transitions; name states as business conditions, not technical flags',
    decision: 'at most 4 input columns, 3 output columns and 14 rows; use values such as a range, a category or "any"'
};

function promptFor(u, model, hint) {
    return `<|im_start|>system
${COMMON(CAPS[u.diagram])}

Return JSON of this shape:
${SCHEMAS[u.diagram]}
<|im_end|>
<|im_start|>user
FOCUS: ${u.focus}

BUSINESS KNOWLEDGE:
${contextFor(u, model)}

BASELINE (JSON):
${compact(u.baseline, SETTINGS.baselineChars)}
${hint ? `\nYour previous answer was rejected: ${hint}\nFix it.\n` : ''}
Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

const parserFor = (u, model) => raw => {
    switch (u.diagram) {
        case 'usecase': return validateUseCase(raw, model.systemName);
        case 'process': return validateProcess(raw);
        case 'sequence': return validateSequence(raw);
        case 'state': return validateState(raw, u.subject);
        default: return validateDecision(raw, model);
    }
};

// ============================================================
// 6. RUN UNITS
// ============================================================

function selectUnits(units, o) {
    let sel = units;
    if (o.diagram && o.diagram !== 'all') sel = sel.filter(u => u.diagram === o.diagram);
    if (o.unit) sel = sel.filter(u => u.id === o.unit);
    if (o.unit && !sel.length) throw new Error(`No unit ${o.unit}. Run with --status to list unit ids.`);
    if (o.failed) sel = sel.filter(u => unitState(u) === 'failed');
    return sel;
}

async function runUnit(u, model) {
    const started = Date.now();
    const res = await ask(u.id, h => promptFor(u, model, h), parserFor(u, model));
    const prev = readUnit(u);
    if (res.ok) {
        fs.writeFileSync(unitPath(u), JSON.stringify({
            unit_id: u.id, diagram: u.diagram, title: u.title, status: 'ok', input_hash: inputHash(u), model: MODEL,
            generated_at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000),
            inferred_elements: countInferred(res.value), spec: res.value
        }, null, 2));
        log(`${u.id} ok in ${Math.round((Date.now() - started) / 1000)}s (${countInferred(res.value)} inferred element(s)).`);
        return true;
    }
    // a failed forced rerun must not destroy a previous good result
    if (prev && prev.status === 'ok') { log(`${u.id} FAILED again (${res.error}); the previous good result is kept.`); return false; }
    fs.writeFileSync(unitPath(u), JSON.stringify({
        unit_id: u.id, diagram: u.diagram, title: u.title, status: 'failed', input_hash: inputHash(u), model: MODEL,
        generated_at: new Date().toISOString(), error: res.error
    }, null, 2));
    log(`${u.id} FAILED: ${res.error}. The baseline diagram is used instead.`);
    return false;
}

function printStatus(units) {
    console.log('\nUnit        Diagram    State     Title');
    units.forEach(u => console.log(`${u.id.padEnd(11)} ${u.diagram.padEnd(10)} ${unitState(u).padEnd(9)} ${cut(u.title, 60)}`));
    const c = units.reduce((m, u) => { const s = unitState(u); m[s] = (m[s] || 0) + 1; return m; }, {});
    console.log(`\n${units.length} units: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')}`);
}

// ============================================================
// 7. RENDER THE .md FILES
// ============================================================

// AI result when it is ok and current; otherwise the deterministic baseline
function resultFor(u) {
    const r = readUnit(u);
    if (r && r.status === 'ok' && r.input_hash === inputHash(u)) return { spec: r.spec, source: 'AI', inferred: r.inferred_elements || 0 };
    return { spec: u.baseline, source: unitState(u) === 'failed' ? 'baseline (AI failed)' : unitState(u) === 'stale' ? 'baseline (AI result outdated)' : 'baseline (not generated yet)', inferred: 0 };
}

function statusTable(rows) {
    return ['| Unit | Source | Inferred elements |', '|---|---|---|', ...rows.map(r => `| ${r.id} ${r.title} | ${r.source} | ${r.inferred} |`), ''];
}

function renderAll(model, units) {
    const stamp = `Generated ${new Date().toISOString()} by 8.5.2.DiagramsAI.js using ${MODEL}. ${C.sourceLine(model)}`;
    const legend = 'Dashed outlines and elements marked * were added by the AI model (inferred); solid ones come from the repositories.';
    const written = [];
    const forDiagram = k => units.filter(u => u.diagram === k).map(u => ({ u, ...resultFor(u) }));

    const section = (items, render) => {
        const blocks = [...statusTable(items.map(x => ({ id: x.u.id, title: x.u.title, source: x.source, inferred: x.inferred })))];
        items.forEach(x => blocks.push(`## ${x.u.id}: ${x.spec.title || x.u.title}`, '', `Focus: ${x.u.focus}`, '', render(x), ''));
        return blocks;
    };

    written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.usecase.file, DIAGRAMS.usecase.title,
        ['Actors, system boundary and functional capabilities.', '', legend, '', stamp],
        section(forDiagram('usecase'), x => C.fence(C.renderUseCase({ ...x.spec, system_name: x.spec.system_name || model.systemName })))));

    written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.process.file, DIAGRAMS.process.title,
        ['End-to-end business processes with swimlanes (one per responsible actor), decisions and exception paths.', '', legend, '', stamp],
        section(forDiagram('process'), x => C.fence(C.renderProcess(x.spec)))));

    written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.sequence.file, DIAGRAMS.sequence.title,
        ['Interactions between actors and system participants over time.', '', legend, '', stamp],
        section(forDiagram('sequence'), x => C.fence(C.renderSequence(x.spec)))));

    const stateItems = forDiagram('state').filter(x => x.spec.states && x.spec.states.length >= 2);
    const skipped = forDiagram('state').length - stateItems.length;
    written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.state.file, DIAGRAMS.state.title,
        ['Lifecycle of each business object: states, transitions, guards and abnormal endings.', '', legend,
            skipped ? `${skipped} object(s) have no state diagram yet (AI failed or not generated, and the repositories hold too little to draw one).` : '', stamp],
        section(stateItems, x => C.fence(C.renderState(x.spec)))));

    // decision tables: AI tables for the processed groups, baseline tables for the rest, DRD from the repositories
    const dec = C.buildDecisionSpecs(model);
    const decItems = forDiagram('decision');
    const done = new Set(decItems.map(x => x.u.subject));
    const decBlocks = [...statusTable(decItems.map(x => ({ id: x.u.id, title: x.u.title, source: x.source, inferred: x.inferred })))];
    if (dec.tables.length) decBlocks.push('## Decision requirements diagram', '', C.fence(C.renderDrd(dec.drd)), '', '## Decision tables', '');
    else decBlocks.push('_No business rules were found, so there are no decisions to tabulate._', '');
    decItems.forEach(x => decBlocks.push(C.renderDecisionTable(x.spec), ''));
    dec.tables.filter(t => !done.has(t.subject)).forEach(t => decBlocks.push(C.renderDecisionTable(t), '_Baseline table, not AI-enhanced._', ''));
    written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.decision.file, DIAGRAMS.decision.title,
        ['Business rules, conditions and decision outcomes. Mermaid has no DMN type, so decisions are Markdown tables plus a decision requirements diagram.', '', legend, '', stamp], decBlocks));

    written.push(C.writeDoc(OUTPUT_DIR, 'README.md', 'Diagram set (AI-enhanced)', [stamp, ''], [
        '| Diagram | File | Units ok / total |', '|---|---|---|',
        ...Object.entries(DIAGRAMS).map(([k, d]) => {
            const us = units.filter(u => u.diagram === k);
            return `| ${d.title} | [${d.file}](${d.file}) | ${us.filter(u => unitState(u) === 'ok').length} / ${us.length} |`;
        }), '',
        'Rerun a diagram: `node 8.5.2.DiagramsAI.js --rerun --diagram "use case"` (also process, sequence, state, decision), or `--rerun --failed`.']));
    return written;
}

// ============================================================
// 8. MAIN
// ============================================================

async function main(argv = process.argv.slice(2), injectedPool = null) {
    const o = parseArgs(argv);
    if (o.help) { console.log(USAGE); return null; }

    const pool = injectedPool || C.createPool();
    let model;
    try { model = await C.loadModel(pool); } finally { if (!injectedPool) await pool.end(); }
    log(`Loaded: ${JSON.stringify(model.stats)}`);
    if (!model.activities.length) throw new Error('No business activities were found in the knowledge base; nothing to draw.');

    fs.mkdirSync(UNIT_DIR, { recursive: true });
    const units = buildUnits(model);
    if (o.status) { printStatus(units); return { units }; }

    if (!o.render) {
        let sel = selectUnits(units, o);
        // without --rerun, finished units are left alone
        if (!o.rerun) sel = sel.filter(u => unitState(u) !== 'ok');
        if (o.limit) sel = sel.slice(0, o.limit);
        log(`${sel.length} unit(s) to generate${o.rerun ? ' (forced rerun)' : ''}: ${sel.map(u => u.id).join(', ') || 'none'}`);
        for (const u of sel) await runUnit(u, model);
    }

    const written = renderAll(model, units);
    const failed = units.filter(u => unitState(u) === 'failed');
    log(`Wrote ${written.length} files to ${OUTPUT_DIR}`);
    written.forEach(f => console.log(`  ${f}`));
    if (failed.length) {
        console.log(`\n${failed.length} unit(s) failed and use the baseline diagram instead: ${failed.map(u => u.id).join(', ')}`);
        [...new Set(failed.map(u => u.diagram))].forEach(k => console.log(`  rerun: node 8.5.2.DiagramsAI.js --rerun --diagram "${DIAGRAMS[k].name}" --failed`));
    }
    return { units, written, failed };
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });

module.exports = { main, setRunner, parseArgs, buildUnits, unitState, validateUseCase, validateProcess, validateSequence, validateState, validateDecision, diagramKey };
