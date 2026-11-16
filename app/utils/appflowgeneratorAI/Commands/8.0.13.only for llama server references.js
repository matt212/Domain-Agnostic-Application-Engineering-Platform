'use strict';

/**
 * 8.0.13 - DIAGRAMS, AI-ENHANCED (local Qwen, CPU-only, via llama-server or llama-cli)
 *
 * Baseline : the three PostgreSQL repositories (knowledge base, requirements schema, business_rule_discovery).
 *            The deterministic diagram built from them is the STARTING POINT. The model keeps what is right,
 *            fixes what is wrong and INVENTS what an experienced analyst would expect (marked "inferred").
 * The model returns a small JSON spec per diagram; code validates it and renders the Mermaid, so the
 * diagram syntax is always valid. A unit the model cannot produce falls back to the baseline diagram.
 *
 * Diagrams (one .md file each): use case, process (BPMN-style), sequence, state machine, decision table / DMN.
 * The script is domain-agnostic: every unit title and focus is derived from the knowledge base
 * (stages, activities, information flows, business rules), never from a fixed industry vocabulary.
 *
 * OUTPUT
 *   Every file written in one run carries the same run-timestamp prefix (dd_mm_yy_hh_mm_ss), e.g.
 *   15_01_26_14_30_01_01_use_case_diagram.md, 15_01_26_14_30_01_README.md, units/15_01_26_14_30_01_SEQ-1.json.
 *   Older runs are never overwritten; resume / --rerun use the newest saved result of each unit.
 *   Default folder: <cwd>/app/utils/appflowgeneratorAI/aiOutput/diagrams/ai_8.0.13 (DIAGRAM_OUTPUT_DIR_AI).
 *
 * USAGE
 *   node 8.0.13.ClaudeDiagramsAI.js                                  generate everything missing (resumable), then render
 *   node 8.0.13.ClaudeDiagramsAI.js --diagram "use case"             only that diagram (still resumable)
 *   node 8.0.13.ClaudeDiagramsAI.js --rerun --diagram "sequence"     discard and regenerate that diagram
 *   node 8.0.13.ClaudeDiagramsAI.js --rerun --diagram "state" --failed    redo only the units that failed
 *   node 8.0.13.ClaudeDiagramsAI.js --rerun --failed                 redo every failed unit of every diagram
 *   node 8.0.13.ClaudeDiagramsAI.js --rerun --unit STATE-003         redo one unit
 *   node 8.0.13.ClaudeDiagramsAI.js --status                         show what succeeded, failed or is pending
 *   node 8.0.13.ClaudeDiagramsAI.js --render                         re-render the .md files from saved results (no AI)
 *   node 8.0.13.ClaudeDiagramsAI.js --limit 2                        smoke test: first 2 selected units only
 *
 * Diagram names: "use case", "process" (or bpmn), "sequence", "state" (or state machine), "decision" (or dmn), "all".
 * Requires 8.0.12.DiagramCommon.js in the same folder.
 *
 * ENVIRONMENT (all optional)
 *   MODEL_NAME            Hugging Face repo (default unsloth/Qwen3.5-9B-GGUF) or a local .gguf path.
 *                         A smaller Qwen (e.g. a 4B GGUF) is roughly 2x faster on CPU.
 *   LLAMA_SERVER_PATH     llama-server binary (default "llama-server"). The model is loaded ONCE and every
 *                         unit is sent to it; the server is stopped at the end of the run.
 *   USE_LLAMA_CLI=1       old mode: one llama-cli process per call (reloads the model each time, slow).
 *   LLAMA_CLI_PATH        llama-cli binary (default "llama-cli"); also the automatic fallback if llama-server is missing.
 *   LLAMA_PORT            fixed port for llama-server (default: a free port).
 *   THREADS               generation threads (default: physical cores, estimated as logical cores / 2).
 *   STATE_BATCH           business objects per state-diagram AI call (default 3).
 *   SEQUENCE_UNITS        max sequence diagrams (default 3).    DECISION_GROUPS   max decision tables via AI (default 5).
 *   UNIT_TIMEOUT_MIN      per-call timeout in minutes (default 10). A timed-out call is not retried.
 *   DIAGRAM_OUTPUT_DIR_AI output folder.
 */

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./8.0.12.DiagramCommon.js');

const SCRIPT = path.basename(__filename);
const VERSION = (SCRIPT.match(/^(\d+(?:\.\d+)*)/) || [, 'ai'])[1];
const ROOT = process.cwd();
const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';
const LLAMA_SERVER = process.env.LLAMA_SERVER_PATH || 'llama-server';
const USE_CLI = /^(1|true|yes)$/i.test(process.env.USE_LLAMA_CLI || '');
const OUTPUT_DIR = process.env.DIAGRAM_OUTPUT_DIR_AI ||
    path.join(ROOT, `app/utils/appflowgeneratorAI/aiOutput/diagrams/ai_${VERSION}`);
const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
const PROMPT_VERSION = '2';

const LOGICAL_CPUS = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 4;
const SETTINGS = {
    threads: Number(process.env.THREADS) || Math.max(2, Math.floor(LOGICAL_CPUS / 2)),
    batchThreads: Number(process.env.THREADS_BATCH) || Math.max(LOGICAL_CPUS, Number(process.env.THREADS) || 2),
    llamaBatch: 512,
    temperature: 0.3,
    timeoutMs: Number(process.env.UNIT_TIMEOUT_MIN || 10) * 60 * 1000,
    serverStartMs: Number(process.env.SERVER_START_MIN || 30) * 60 * 1000, // first run may download the model
    heartbeatMs: 30000,
    retries: 1,                 // only for malformed / invalid answers, never for timeouts
    context: 6144,
    // per diagram type output budget (was 1800 for every type)
    tokens: { usecase: 1500, process: 1500, sequence: 1200, statePerObject: 480, decision: 900 },
    contextChars: 2400,
    baselineChars: 2800,
    stateObjectChars: 900,
    stateBatch: Math.max(1, Number(process.env.STATE_BATCH || 3)),
    sequenceUnits: Math.max(1, Number(process.env.SEQUENCE_UNITS || 3)),
    decisionGroups: Number(process.env.DECISION_GROUPS || 5)
};

const { log, arr, uniq, cut, same } = C;
const pad = n => String(n).padStart(3, '0');

// ============================================================
// 0. RUN TIMESTAMP (prefix of every file written in this run)
// ============================================================

const two = n => String(n).padStart(2, '0');
const makeStamp = (d = new Date()) =>
    `${two(d.getDate())}_${two(d.getMonth() + 1)}_${two(d.getFullYear() % 100)}_${two(d.getHours())}_${two(d.getMinutes())}_${two(d.getSeconds())}`;
let RUN_STAMP = makeStamp();
const stamped = file => `${RUN_STAMP}_${file}`;
const STAMP_RE = /^(\d{2})_(\d{2})_(\d{2})_(\d{2})_(\d{2})(?:_(\d{2}))?_(.+)$/;
// sortable key yymmddhhmmss for a stamped name, '' for an unstamped (legacy) name
const stampKey = name => { const m = STAMP_RE.exec(name); return m ? `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}${m[6] || '00'}` : ''; };

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

const USAGE = `Usage: node ${SCRIPT} [options]
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
  --rerun --diagram "state"         --rerun --diagram "decision"      --rerun --failed
Environment:
  MODEL_NAME (HF repo or .gguf path), LLAMA_SERVER_PATH, USE_LLAMA_CLI=1 (old per-call llama-cli mode),
  LLAMA_CLI_PATH, LLAMA_PORT, THREADS, STATE_BATCH (objects per state call, default ${SETTINGS.stateBatch}),
  SEQUENCE_UNITS (default ${SETTINGS.sequenceUnits}), DECISION_GROUPS (default ${SETTINGS.decisionGroups}),
  UNIT_TIMEOUT_MIN (default 10), DIAGRAM_OUTPUT_DIR_AI (default ${OUTPUT_DIR})
Every file written carries the run timestamp prefix dd_mm_yy_hh_mm_ss_.`;

// ============================================================
// 2. LOCAL MODEL RUNNERS
//    server mode (default): llama-server loads the model ONCE for the whole run
//    cli mode (USE_LLAMA_CLI=1 or fallback): one llama-cli process per call
// ============================================================

const modelArgs = () => (/\.gguf$/i.test(MODEL) ? ['-m', MODEL] : ['-hf', MODEL]);

function runLocal(label, prompt, maxTokens) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let out = '';
        const args = [
            ...modelArgs(), '-c', String(SETTINGS.context), '-n', String(maxTokens),
            '-t', String(SETTINGS.threads), '-tb', String(SETTINGS.batchThreads), '-b', String(SETTINGS.llamaBatch), '-ngl', '0',
            '--temp', String(SETTINGS.temperature), '--reasoning', 'off',
            '--no-display-prompt', '--simple-io', '--log-disable', '-st', '-p', prompt
        ];
        const child = spawn(LLAMA_CLI, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        const hb = setInterval(() => log(`${label} running ${((Date.now() - started) / 1000).toFixed(0)}s, ${out.length} bytes`), SETTINGS.heartbeatMs);
        const to = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, SETTINGS.timeoutMs);
        child.stdout.on('data', d => { out += d.toString(); });
        child.stderr.on('data', () => {});
        child.on('error', e => { clearInterval(hb); clearTimeout(to); reject(e); });
        child.on('close', () => { clearInterval(hb); clearTimeout(to); resolve(out); });
    });
}

let server = null;          // { child, url, ready: Promise }
let serverFailed = false;

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.unref();
        s.on('error', reject);
        s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
    if (server) return server.ready;
    server = {};
    server.ready = (async () => {
        const port = Number(process.env.LLAMA_PORT) || await freePort();
        const args = [...modelArgs(), '-c', String(SETTINGS.context), '-t', String(SETTINGS.threads),
            '-tb', String(SETTINGS.batchThreads), '-b', String(SETTINGS.llamaBatch), '-ngl', '0',
            '-np', '1', '--host', '127.0.0.1', '--port', String(port)];
        log(`Starting ${LLAMA_SERVER} once for the whole run (${MODEL}, ${SETTINGS.threads} threads, port ${port})...`);
        const child = spawn(LLAMA_SERVER, args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
        server.child = child;
        server.url = `http://127.0.0.1:${port}`;
        let tail = '', exited = null;
        child.stderr.on('data', d => { tail = (tail + d.toString()).slice(-2000); });
        child.on('error', e => { exited = e; });
        child.on('exit', code => { if (!exited) exited = new Error(`llama-server exited with code ${code}: ${cut(tail.trim(), 400)}`); });
        const started = Date.now();
        let lastLog = started;
        while (Date.now() - started < SETTINGS.serverStartMs) {
            if (exited) throw exited;
            try {
                const r = await fetch(`${server.url}/health`);
                if (r.ok) { log(`llama-server ready in ${Math.round((Date.now() - started) / 1000)}s; the model stays loaded for every unit.`); return; }
            } catch { /* not listening yet */ }
            if (Date.now() - lastLog > SETTINGS.heartbeatMs) { lastLog = Date.now(); log(`llama-server loading ${Math.round((Date.now() - started) / 1000)}s...`); }
            await sleep(1000);
        }
        throw new Error('llama-server did not become ready in time');
    })();
    return server.ready;
}

function stopServer() {
    if (server && server.child && server.child.exitCode === null) {
        try { server.child.kill('SIGTERM'); } catch { /* already gone */ }
        log('llama-server stopped.');
    }
    server = null;
}
process.on('exit', () => { if (server && server.child) try { server.child.kill('SIGKILL'); } catch { /* ignore */ } });
['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => { stopServer(); process.exit(130); }));

async function runServer(label, prompt, maxTokens) {
    await startServer();
    const started = Date.now();
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), SETTINGS.timeoutMs);
    const hb = setInterval(() => log(`${label} running ${((Date.now() - started) / 1000).toFixed(0)}s`), SETTINGS.heartbeatMs);
    try {
        const r = await fetch(`${server.url}/completion`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
            body: JSON.stringify({
                prompt, n_predict: maxTokens, temperature: SETTINGS.temperature,
                cache_prompt: true,                       // reuse the KV cache of the shared instruction prefix
                stop: ['<|im_end|>', '<|endoftext|>']
            })
        });
        if (!r.ok) throw new Error(`llama-server HTTP ${r.status}: ${cut(await r.text(), 200)}`);
        const j = await r.json();
        return String(j.content || '');
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('timeout');
        throw e;
    } finally { clearTimeout(to); clearInterval(hb); }
}

async function defaultRunner(label, prompt, maxTokens) {
    if (USE_CLI || serverFailed || typeof fetch !== 'function') return runLocal(label, prompt, maxTokens);
    try { await startServer(); } catch (e) {
        serverFailed = true; stopServer();
        log(`llama-server unavailable (${e.message}); falling back to ${LLAMA_CLI} per call (slower).`);
        return runLocal(label, prompt, maxTokens);
    }
    return runServer(label, prompt, maxTokens);
}
let runner = defaultRunner;
const setRunner = fn => { runner = fn || defaultRunner; };
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

// parse + validate; the rejection reason is fed back to the model once. Timeouts / runner errors are not retried.
async function ask(label, promptFn, parse, maxTokens) {
    let hint = '', error = '';
    for (let a = 0; a <= SETTINGS.retries; a++) {
        let raw;
        try { raw = await runner(`${label} try ${a + 1}`, promptFn(hint), maxTokens); } catch (e) {
            log(`${label} try ${a + 1} failed: ${e.message} (not retried)`);
            return { ok: false, error: e.message };
        }
        try { return { ok: true, value: parse(extractJson(raw)) }; } catch (e) {
            hint = e.message; error = e.message; log(`${label} try ${a + 1} rejected: ${hint}`);
        }
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
            const over = uniq(arr(s.over).concat(s.from ? [s.from] : []).map(rp)).filter(Boolean);
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
    let finals = uniq(arr(raw.finals).map(rs)).filter(Boolean);
    if (!finals.length) finals = states.filter(s => !transitions.some(t => t.from === s.id) && s.id !== initial).map(s => s.id).slice(0, 3);
    if (!finals.length) finals = [states[states.length - 1].id];
    const notes = arr(raw.notes).map(n => ({ state: rs(n.state), text: clean(n.text, 90) })).filter(n => n.state && n.text).slice(0, 3);
    return { object: objectName || clean(raw.object, 60), states, transitions, notes, initial, finals };
}

// several business objects in one answer: {"objects":[<state spec>, ...]}; split back to one machine per object
function validateStateBatch(raw, subjects) {
    let list = arr(raw.objects || raw.machines || raw.lifecycles);
    if (!list.length && raw.states && subjects.length === 1) list = [raw];
    const machines = {}, errors = {};
    subjects.forEach((s, i) => {
        const entry = list.find(x => x && x.object && same(x.object, s)) || (list[i] && !subjects.some(o => o !== s && list[i].object && same(list[i].object, o)) ? list[i] : null);
        if (!entry) { errors[s] = 'missing from the answer'; return; }
        try { machines[s] = validateState(entry, s); } catch (e) { errors[s] = e.message; }
    });
    if (!Object.keys(machines).length) {
        throw new Error(`no valid lifecycle for any object (${Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join('; ')}); return one entry per object in "objects"`);
    }
    return { machines, errors };
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
    if (spec && spec.machines) return Object.values(spec.machines).reduce((n, m) => n + countInferred(m), 0);
    return ['actors', 'use_cases', 'nodes', 'flows', 'steps', 'states', 'transitions', 'rows']
        .reduce((n, k) => n + arr(spec[k]).filter(x => x && x.inferred).length, 0);
}

// ============================================================
// 4. UNITS: what is asked of the model, with the baseline it starts from
//    Everything is derived from the knowledge base; no domain vocabulary is hard-coded.
// ============================================================

const listText = (items, n, len = 60) => items.slice(0, n).map(x => cut(x, len)).join('; ');
const touches = (a, obj) => [...arr(a.inputs), ...arr(a.outputs)].some(x => same(x, obj));
const exceptionRules = model => model.rules.filter(r => r.type === 'Exception handling' ||
    (r.ifViolated && !/^\s*-?\s*$/.test(String(r.ifViolated))));
const STATE_WORDS = /\b(status|state|stage|lifecycle|approv|reject|cancel|expir|clos|complet|suspend|activat|deactivat|pending|draft|submit|confirm|archiv|revok|renew|transition|before|after|once|until|no longer)/i;

// which business objects really have a lifecycle worth a state diagram
function lifecycleObjects(model, stateSpecs) {
    const keep = [], skip = [];
    model.objects.forEach(o => {
        const base = stateSpecs.find(s => s.object === o.name) || { object: o.name, states: [], transitions: [] };
        const acts = model.activities.filter(a => touches(a, o.name));
        const changers = model.activities.filter(a => arr(a.outputs).some(x => same(x, o.name)));
        const stateRules = model.rules.filter(r => arr(r.objects).some(x => same(x, o.name)) && STATE_WORDS.test(`${r.statement} ${r.ifViolated || ''}`));
        const reasons = [];
        if (arr(base.states).length >= 2) reasons.push(`baseline holds ${base.states.length} states`);
        if (stateRules.length) reasons.push(`${stateRules.length} business rule(s) govern its condition`);
        if (changers.length && acts.length >= 2) reasons.push(`changed by ${changers.length} activit${changers.length === 1 ? 'y' : 'ies'} across ${acts.length}`);
        if (STATE_WORDS.test(String(o.lifecycle || '')) && (acts.length || stateRules.length)) reasons.push('its lifecycle description names states');
        (reasons.length ? keep : skip).push({ object: o, baseline: base, reasons });
    });
    return { keep, skip };
}

function sequenceUnits(model, seq) {
    const acts = model.activities;
    const stages = uniq(acts.map(a => a.stage).filter(Boolean));
    const out = [];
    const push = (kind, title, focus, extra = {}) => out.push({ kind, title: clean(title, 90), focus, ...extra });

    // 1. the main end-to-end flow, named after the domain's own stages / activities
    const first = stages[0] || (acts[0] && acts[0].name) || 'start';
    const last = stages[stages.length - 1] || (acts[acts.length - 1] && acts[acts.length - 1].name) || 'completion';
    push('main', first === last ? `Main flow: ${first}` : `Main flow: ${first} to ${last}`,
        `Draw the interactions over time for the main end-to-end flow of ${model.systemName}, following the activities in order (${listText(acts.map(a => a.name), 6, 50)}), from the trigger to completion.`);

    // 2. the most important information flows between the parties
    const irs = [...arr(model.irs)].sort((a, b) => arr(b.consumers).length - arr(a.consumers).length).slice(0, 4);
    if (irs.length) {
        push('flows', `Information flow: ${listText(irs.map(r => r.label), 3, 30)}`,
            `Draw how this information is produced, passed between the parties and used, including checks and confirmations: ${irs.map(r => `${cut(r.label, 40)} (${cut(r.source, 30)} -> ${arr(r.consumers).slice(0, 3).join(', ')})`).join('; ')}.`,
            { irs: irs.map(r => r.label) });
    } else {
        const handoffs = acts.filter((a, i) => i && a.primary && acts[i - 1].primary && !same(a.primary, acts[i - 1].primary));
        if (handoffs.length) {
            push('flows', `Hand-offs: ${listText(uniq(handoffs.map(a => a.primary)), 3, 25)}`,
                `Draw the hand-offs between the parties over time, at these activities: ${listText(handoffs.map(a => `${a.name} (to ${a.primary})`), 6, 60)}.`);
        }
    }

    // 3. exception handling, from the business rules
    const ex = exceptionRules(model).slice(0, 6);
    if (ex.length) {
        push('exceptions', `Exception handling: ${listText(ex.map(r => r.statement), 2, 35)}`,
            `Draw what happens over time when these business rules are broken, who detects it and how each case is resolved: ${ex.map(r => `${r.ref} ${cut(r.statement, 60)}${r.ifViolated ? ` -> ${cut(r.ifViolated, 40)}` : ''}`).join('; ')}.`,
            { rules: ex.map(r => r.ref) });
    }

    // fill any remaining slots with per-stage flows
    stages.forEach(s => {
        if (out.length >= SETTINGS.sequenceUnits) return;
        const sa = acts.filter(a => a.stage === s);
        if (sa.length >= 2) push('stage', `Stage flow: ${s}`, `Draw the interactions over time within the "${s}" stage: ${listText(sa.map(a => a.name), 6, 50)}.`, { stage: s });
    });
    return out.slice(0, SETTINGS.sequenceUnits).map((x, i) => ({ id: `SEQ-${i + 1}`, diagram: 'sequence', baseline: seq, ...x }));
}

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
    const ex = exceptionRules(model);
    units.push({ id: 'PROCESS-2', diagram: 'process', title: 'Exceptions and alternative paths', baseline: proc,
        focus: `What can go wrong in this business${ex.length ? `, starting from the business rules: ${listText(ex.map(r => `${r.ref} ${r.statement}`), 6, 70)}` : ' (failures, rejections, timeouts, cancellations)'}. For each, how it is detected, who handles it, what is done to put it right and how the process ends.` });

    units.push(...sequenceUnits(model, C.buildSequenceSpec(model)));

    // state machines: only objects with a real lifecycle, several objects per AI call
    const { keep } = lifecycleObjects(model, C.buildStateSpecs(model));
    for (let i = 0, b = 1; i < keep.length; i += SETTINGS.stateBatch, b++) {
        const group = keep.slice(i, i + SETTINGS.stateBatch);
        const subjects = group.map(g => g.object.name);
        units.push({ id: `STATE-${pad(b)}`, diagram: 'state', title: subjects.join(', '), subjects,
            baseline: Object.fromEntries(group.map(g => [g.object.name, g.baseline])),
            reasons: Object.fromEntries(group.map(g => [g.object.name, g.reasons])),
            focus: `Draw the lifecycle of each business object (${subjects.map(s => `"${s}"`).join(', ')}): its states, the events that move it, the guards (business rules) on each move, and the abnormal states it can end up in.` });
    }

    const dec = C.buildDecisionSpecs(model);
    dec.tables.slice(0, SETTINGS.decisionGroups).forEach((t, i) => {
        units.push({ id: `DEC-${pad(i + 1)}`, diagram: 'decision', title: t.name, subject: t.subject, baseline: t,
            focus: `Write the decision table for "${t.subject}": the inputs that drive each decision, the outcome, and rows for every important combination. Use several input columns where a decision depends on more than one thing.` });
    });
    return units;
}

// ============================================================
// 4b. SAVED RESULTS: units/<stamp>_<unit>.json, newest per unit wins
// ============================================================

const inputHash = u => C.shortHash(JSON.stringify([PROMPT_VERSION, u.id, u.focus, u.baseline]));
let INDEX = null;       // unit id -> { file, key, record }
function loadIndex() {
    INDEX = new Map();
    let files = [];
    try { files = fs.readdirSync(UNIT_DIR).filter(f => f.endsWith('.json')); } catch { return INDEX; }
    files.forEach(f => {
        const m = STAMP_RE.exec(f);
        const id = (m ? m[7] : f).replace(/\.json$/, '');
        let record;
        try { record = JSON.parse(fs.readFileSync(path.join(UNIT_DIR, f), 'utf8')); } catch { return; }
        const key = `${stampKey(f)}|${record.generated_at || ''}`;
        const cur = INDEX.get(id);
        if (!cur || key > cur.key) INDEX.set(id, { file: f, key, record });
    });
    return INDEX;
}
function readUnit(u) {
    if (!INDEX) loadIndex();
    const e = INDEX.get(u.id);
    return e ? e.record : null;
}
function writeUnit(u, record) {
    const file = stamped(`${u.id}.json`);
    fs.writeFileSync(path.join(UNIT_DIR, file), JSON.stringify(record, null, 2));
    if (!INDEX) loadIndex();
    INDEX.set(u.id, { file, key: `${stampKey(file)}|${record.generated_at}~`, record });
    return file;
}
// ok = a valid result made from the CURRENT baseline
function unitState(u) {
    const r = readUnit(u);
    if (!r) return 'pending';
    if (r.status === 'ok') return r.input_hash === inputHash(u) ? 'ok' : 'stale';
    return 'failed';
}

// ============================================================
// 5. PROMPTS (shared instruction prefix first, so llama-server can reuse its cache)
// ============================================================

function compact(spec, max) {
    const s = JSON.stringify(spec);
    if (s.length <= max) return s;
    const copy = JSON.parse(s);
    const keys = Object.keys(copy).filter(k => Array.isArray(copy[k]));
    while (JSON.stringify(copy).length > max) {
        const k = [...keys].sort((a, b) => copy[b].length - copy[a].length)[0];
        if (!k || copy[k].length <= 3) break;
        copy[k].pop();
    }
    return JSON.stringify(copy).slice(0, max * 1.2);
}

function stateObjectContext(model, name) {
    const o = model.objects.find(x => x.name === name) || {};
    const L = [`OBJECT: ${name}`, `Purpose: ${cut(o.purpose || '-', 120)}`, `Lifecycle: ${cut(o.lifecycle || '-', 100)}`];
    const acts = model.activities.filter(a => touches(a, name)).slice(0, 8);
    if (acts.length) L.push('Activities:', ...acts.map(a => `- ${a.name} [${a.stage || '-'}]: ${cut(a.outcome || a.desc || '', 60)}`));
    const rules = model.rules.filter(r => arr(r.objects).some(x => same(x, name))).slice(0, 6);
    if (rules.length) L.push('Rules:', ...rules.map(r => `- ${r.ref} ${cut(r.statement, 90)}`));
    return L.join('\n').slice(0, SETTINGS.stateObjectChars);
}

function contextFor(u, model) {
    const L = [`System: ${model.systemName}`];
    const actors = () => { L.push('ACTORS:', ...model.actors.map(a => `- ${a.name} (${a.kind}): ${cut(a.role, 60)}`)); };
    const acts = (list = model.activities, n = 18) => {
        L.push('ACTIVITIES IN ORDER:', ...list.slice(0, n).map((a, i) =>
            `${i + 1}. ${a.name} [${a.stage || '-'}] by ${a.primary}${arr(a.supporting).length ? ' with ' + a.supporting.join(', ') : ''}; in: ${arr(a.inputs).join(', ') || '-'}; out: ${arr(a.outputs).join(', ') || '-'}`));
    };
    const rules = (list, n) => { if (list.length) L.push('BUSINESS RULES:', ...list.slice(0, n).map(r => `- ${r.ref} [${r.type}] ${cut(r.statement, 100)} | if broken: ${cut(r.ifViolated, 45)}`)); };
    if (u.diagram === 'usecase') {
        actors();
        if (u.id === 'USECASE-2') L.push('BUSINESS REQUIREMENTS:', ...model.brs.slice(0, 30).map(b => `- ${b.id} ${b.name}`)); else acts();
    } else if (u.diagram === 'process') {
        acts();
        rules(u.id === 'PROCESS-2' ? exceptionRules(model) : model.rules.filter(r => C.DECISION_TYPES.includes(r.type) || r.type === 'Exception handling'), 12);
    } else if (u.diagram === 'sequence') {
        actors();
        if (u.kind === 'stage') acts(model.activities.filter(a => a.stage === u.stage), 12);
        else acts(model.activities, u.kind === 'main' ? 14 : 8);
        if (u.kind === 'flows' || u.kind === 'main') {
            const flows = arr(model.irs).filter(r => !u.irs || u.irs.includes(r.label)).slice(0, 8)
                .map(r => `- ${r.label}: ${cut(r.source, 50)} -> ${arr(r.consumers).slice(0, 3).join(', ')}`);
            if (flows.length) L.push('INFORMATION FLOWS:', ...flows);
        }
        if (u.kind === 'exceptions') rules(model.rules.filter(r => arr(u.rules).includes(r.ref)), 6);
    } else if (u.diagram === 'state') {
        u.subjects.forEach(s => L.push('', stateObjectContext(model, s)));
        return L.join('\n').slice(0, SETTINGS.stateObjectChars * u.subjects.length + 200);
    } else if (u.diagram === 'decision') {
        const o = model.objects.find(x => x.name === u.subject) || {};
        L.push(`DECISION SUBJECT: ${u.subject}`, o.purpose ? `Purpose: ${o.purpose}` : '');
        rules(model.rules.filter(r => (arr(r.objects).length ? r.objects.some(x => same(x, u.subject)) : u.subject === 'Cross-cutting')), 12);
    }
    return L.filter(Boolean).join('\n').slice(0, SETTINGS.contextChars);
}

const COMMON = cap => `You are a senior business analyst drawing diagrams as structured data for the business described by the user.

The BASELINE shows what the repositories already contain. It is a starting point, not a limit and not proof:
keep what is correct, fix what is wrong, and ADD what an experienced analyst would expect for THIS business
but the baseline lacks (missing actors, steps, alternative paths, exceptions, states, guards, decisions).
Mark every element you add with "inferred": true. Use the business's own vocabulary; do not import terms from other industries.

Rules:
- business language only; no technology, screens or databases
- use only ids that you define in your own output
- keep it readable: ${cap}
- return ONLY the JSON object, no Markdown, no commentary`;

const STATE_SHAPE = `{"object":"exact object name","states":[{"id":"s1","name":"","inferred":false}],"initial":"s1","finals":["s3"],
"transitions":[{"from":"s1","to":"s2","event":"","guard":"business rule that must hold","inferred":false}],"notes":[{"state":"s1","text":""}]}`;
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
    state: `{"objects":[${STATE_SHAPE}]}
One entry in "objects" per business object listed by the user, in the same order, with "object" set to its exact name.`,
    decision: `{"name":"","hit_policy":"U or A or P or F or C","inputs":["input column"],"outputs":["output column"],
"rows":[{"when":["value for each input column"],"then":["value for each output column"],"rule":"rule ref such as R-001 or empty","inferred":false}]}`
};
const CAPS = {
    usecase: 'at most 14 actors and 24 use cases',
    process: 'at most 22 nodes; every node must be connected by a flow; exception nodes describe the outcome in a few words',
    sequence: 'at most 10 participants and 32 steps; close every alt block with an end step',
    state: 'per object at most 8 states and 12 transitions; name states as business conditions, not technical flags',
    decision: 'at most 4 input columns, 3 output columns and 12 rows; use values such as a range, a category or "any"'
};

function baselineFor(u) {
    if (u.diagram !== 'state') return compact(u.baseline, SETTINGS.baselineChars);
    const per = Math.floor(SETTINGS.baselineChars / u.subjects.length);
    return u.subjects.map(s => `${s}: ${compact(u.baseline[s], per)}`).join('\n');
}

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
${baselineFor(u)}
${hint ? `\nYour previous answer was rejected: ${hint}\nFix it.\n` : ''}
Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

const tokensFor = u => (u.diagram === 'state' ? SETTINGS.tokens.statePerObject * u.subjects.length + 100 : SETTINGS.tokens[u.diagram]);

const parserFor = (u, model) => raw => {
    switch (u.diagram) {
        case 'usecase': return validateUseCase(raw, model.systemName);
        case 'process': return validateProcess(raw);
        case 'sequence': return validateSequence(raw);
        case 'state': return validateStateBatch(raw, u.subjects);
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
    const res = await ask(u.id, h => promptFor(u, model, h), parserFor(u, model), tokensFor(u));
    const prev = readUnit(u);
    const secs = Math.round((Date.now() - started) / 1000);
    if (res.ok) {
        writeUnit(u, {
            unit_id: u.id, diagram: u.diagram, title: u.title, status: 'ok', input_hash: inputHash(u), model: MODEL,
            script: SCRIPT, run_stamp: RUN_STAMP, generated_at: new Date().toISOString(), seconds: secs,
            inferred_elements: countInferred(res.value), spec: res.value
        });
        const partial = res.value.errors && Object.keys(res.value.errors).length ? `; baseline kept for ${Object.keys(res.value.errors).join(', ')}` : '';
        log(`${u.id} ok in ${secs}s (${countInferred(res.value)} inferred element(s))${partial}.`);
        return true;
    }
    // a failed forced rerun must not destroy a previous good result
    if (prev && prev.status === 'ok') { log(`${u.id} FAILED again (${res.error}); the previous good result is kept.`); return false; }
    writeUnit(u, {
        unit_id: u.id, diagram: u.diagram, title: u.title, status: 'failed', input_hash: inputHash(u), model: MODEL,
        script: SCRIPT, run_stamp: RUN_STAMP, generated_at: new Date().toISOString(), seconds: secs, error: res.error
    });
    log(`${u.id} FAILED: ${res.error}. The baseline diagram is used instead.`);
    return false;
}

function printStatus(units, skipped = []) {
    console.log('\nUnit        Diagram    State     Title');
    units.forEach(u => console.log(`${u.id.padEnd(11)} ${u.diagram.padEnd(10)} ${unitState(u).padEnd(9)} ${cut(u.title, 60)}`));
    const c = units.reduce((m, u) => { const s = unitState(u); m[s] = (m[s] || 0) + 1; return m; }, {});
    console.log(`\n${units.length} units: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')}`);
    if (skipped.length) console.log(`${skipped.length} business object(s) without a lifecycle get no state diagram: ${skipped.join(', ')}`);
}

// ============================================================
// 7. RENDER THE .md FILES (all prefixed with the run timestamp)
// ============================================================

const sourceOf = u => {
    const s = unitState(u);
    return s === 'failed' ? 'baseline (AI failed)' : s === 'stale' ? 'baseline (AI result outdated)' : 'baseline (not generated yet)';
};
// AI result when it is ok and current; otherwise the deterministic baseline
function resultFor(u) {
    const r = readUnit(u);
    if (r && r.status === 'ok' && r.input_hash === inputHash(u)) return { spec: r.spec, source: 'AI', inferred: r.inferred_elements || 0 };
    return { spec: u.baseline, source: sourceOf(u), inferred: 0 };
}

function statusTable(rows) {
    return ['| Unit | Source | Inferred elements |', '|---|---|---|', ...rows.map(r => `| ${r.id} ${r.title} | ${r.source} | ${r.inferred} |`), ''];
}

function renderAll(model, units, skippedObjects) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const stamp = `Generated ${new Date().toISOString()} (run ${RUN_STAMP}) by ${SCRIPT} using ${MODEL}. ${C.sourceLine(model)}`;
    const legend = 'Dashed outlines and elements marked * were added by the AI model (inferred); solid ones come from the repositories.';
    const written = [];
    const files = Object.fromEntries(Object.entries(DIAGRAMS).map(([k, d]) => [k, stamped(d.file)]));
    const forDiagram = k => units.filter(u => u.diagram === k).map(u => ({ u, ...resultFor(u) }));

    const section = (items, render) => {
        const blocks = [...statusTable(items.map(x => ({ id: x.u.id, title: x.u.title, source: x.source, inferred: x.inferred })))];
        items.forEach(x => blocks.push(`## ${x.u.id}: ${x.spec.title || x.u.title}`, '', `Focus: ${x.u.focus}`, '', render(x), ''));
        return blocks;
    };

    written.push(C.writeDoc(OUTPUT_DIR, files.usecase, DIAGRAMS.usecase.title,
        ['Actors, system boundary and functional capabilities.', '', legend, '', stamp],
        section(forDiagram('usecase'), x => C.fence(C.renderUseCase({ ...x.spec, system_name: x.spec.system_name || model.systemName })))));

    written.push(C.writeDoc(OUTPUT_DIR, files.process, DIAGRAMS.process.title,
        ['End-to-end business processes with swimlanes (one per responsible actor), decisions and exception paths.', '', legend, '', stamp],
        section(forDiagram('process'), x => C.fence(C.renderProcess(x.spec)))));

    written.push(C.writeDoc(OUTPUT_DIR, files.sequence, DIAGRAMS.sequence.title,
        ['Interactions between actors and system participants over time.', '', legend, '', stamp],
        section(forDiagram('sequence'), x => C.fence(C.renderSequence(x.spec)))));

    // state: each batch unit is split back into one diagram per business object
    const stateRows = [], stateBlocks = [];
    let noDiagram = 0;
    units.filter(u => u.diagram === 'state').forEach(u => {
        const r = readUnit(u);
        const ok = r && r.status === 'ok' && r.input_hash === inputHash(u);
        u.subjects.forEach(s => {
            const ai = ok && r.spec.machines && r.spec.machines[s];
            const spec = ai || u.baseline[s];
            const source = ai ? 'AI' : ok ? 'baseline (AI gave no valid lifecycle)' : sourceOf(u);
            stateRows.push({ id: u.id, title: s, source, inferred: ai ? countInferred(ai) : 0 });
            if (!spec || arr(spec.states).length < 2) { noDiagram++; return; }
            stateBlocks.push(`## ${u.id}: ${s}`, '', `Why a lifecycle: ${arr(u.reasons && u.reasons[s]).join('; ') || '-'}`, '', C.fence(C.renderState({ ...spec, object: s })), '');
        });
    });
    const stateIntro = ['Lifecycle of each business object that has one: states, transitions, guards and abnormal endings.', '', legend];
    if (noDiagram) stateIntro.push('', `${noDiagram} object(s) have no state diagram yet (AI failed or not generated, and the repositories hold too little to draw one).`);
    if (skippedObjects.length) stateIntro.push('', `Not drawn, no lifecycle found in the repositories (no state-changing rules or activities, fewer than 2 baseline states): ${skippedObjects.join(', ')}.`);
    stateIntro.push('', stamp);
    written.push(C.writeDoc(OUTPUT_DIR, files.state, DIAGRAMS.state.title, stateIntro,
        stateRows.length ? [...statusTable(stateRows), ...stateBlocks] : ['_No business object with a lifecycle was found._', '']));

    // decision tables: AI tables for the processed groups, baseline tables for the rest, DRD from the repositories
    const dec = C.buildDecisionSpecs(model);
    const decItems = forDiagram('decision');
    const done = new Set(decItems.map(x => x.u.subject));
    const decBlocks = [...statusTable(decItems.map(x => ({ id: x.u.id, title: x.u.title, source: x.source, inferred: x.inferred })))];
    if (dec.tables.length) decBlocks.push('## Decision requirements diagram', '', C.fence(C.renderDrd(dec.drd)), '', '## Decision tables', '');
    else decBlocks.push('_No business rules were found, so there are no decisions to tabulate._', '');
    decItems.forEach(x => decBlocks.push(C.renderDecisionTable(x.spec), ''));
    dec.tables.filter(t => !done.has(t.subject)).forEach(t => decBlocks.push(C.renderDecisionTable(t), '_Baseline table, not AI-enhanced._', ''));
    written.push(C.writeDoc(OUTPUT_DIR, files.decision, DIAGRAMS.decision.title,
        ['Business rules, conditions and decision outcomes. Mermaid has no DMN type, so decisions are Markdown tables plus a decision requirements diagram.', '', legend, '', stamp], decBlocks));

    written.push(C.writeDoc(OUTPUT_DIR, stamped('README.md'), 'Diagram set (AI-enhanced)', [stamp, ''], [
        '| Diagram | File | Units ok / total |', '|---|---|---|',
        ...Object.entries(DIAGRAMS).map(([k, d]) => {
            const us = units.filter(u => u.diagram === k);
            return `| ${d.title} | [${files[k]}](${files[k]}) | ${us.filter(u => unitState(u) === 'ok').length} / ${us.length} |`;
        }), '',
        `Rerun a diagram: \`node ${SCRIPT} --rerun --diagram "use case"\` (also process, sequence, state, decision), or \`--rerun --failed\`.`]));
    return written;
}

// ============================================================
// 8. MAIN
// ============================================================

async function main(argv = process.argv.slice(2), injectedPool = null) {
    const o = parseArgs(argv);
    if (o.help) { console.log(USAGE); return null; }
    RUN_STAMP = makeStamp();
    INDEX = null;

    const pool = injectedPool || C.createPool();
    let model;
    try { model = await C.loadModel(pool); } finally { if (!injectedPool) await pool.end(); }
    log(`Loaded: ${JSON.stringify(model.stats)}`);
    if (!model.activities.length) throw new Error('No business activities were found in the knowledge base; nothing to draw.');

    fs.mkdirSync(UNIT_DIR, { recursive: true });
    const units = buildUnits(model);
    const skipped = lifecycleObjects(model, C.buildStateSpecs(model)).skip.map(x => x.object.name);
    if (o.status) { printStatus(units, skipped); return { units, skipped }; }

    try {
        if (!o.render) {
            let sel = selectUnits(units, o);
            // without --rerun, finished units are left alone
            if (!o.rerun) sel = sel.filter(u => unitState(u) !== 'ok');
            if (o.limit) sel = sel.slice(0, o.limit);
            log(`Run ${RUN_STAMP}: ${sel.length} unit(s) to generate${o.rerun ? ' (forced rerun)' : ''}: ${sel.map(u => u.id).join(', ') || 'none'}`);
            if (skipped.length) log(`State diagrams skipped (no lifecycle): ${skipped.join(', ')}`);
            const t0 = Date.now();
            for (const u of sel) await runUnit(u, model);
            if (sel.length) log(`Generation took ${Math.round((Date.now() - t0) / 1000)}s for ${sel.length} unit(s).`);
        }
    } finally { stopServer(); }

    const written = renderAll(model, units, skipped);
    const failed = units.filter(u => unitState(u) === 'failed');
    log(`Wrote ${written.length} files to ${OUTPUT_DIR}`);
    written.forEach(f => console.log(`  ${f}`));
    if (failed.length) {
        console.log(`\n${failed.length} unit(s) failed and use the baseline diagram instead: ${failed.map(u => u.id).join(', ')}`);
        [...new Set(failed.map(u => u.diagram))].forEach(k => console.log(`  rerun: node ${SCRIPT} --rerun --diagram "${DIAGRAMS[k].name}" --failed`));
    }
    return { units, written, failed, skipped, stamp: RUN_STAMP };
}

if (require.main === module) main().catch(e => { stopServer(); console.error(e.message); process.exit(1); });

module.exports = { main, setRunner, parseArgs, buildUnits, unitState, validateUseCase, validateProcess, validateSequence, validateState, validateStateBatch, validateDecision, diagramKey, lifecycleObjects, makeStamp };