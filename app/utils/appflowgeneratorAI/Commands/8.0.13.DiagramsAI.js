// 'use strict';

// /**
//  * 8.5.2 - DIAGRAMS, AI-ENHANCED (Qwen via llama-cli)
//  *
//  * Baseline : the three PostgreSQL repositories (knowledge base, requirements schema, business_rule_discovery).
//  *            The deterministic diagram built from them is the STARTING POINT.
//  * The model returns ONLY what is new or wrong (a small "delta"), never the whole diagram. Code merges the delta
//  * onto the baseline, marks every new element as inferred, validates it and renders the Mermaid, so the syntax
//  * is always valid and the model can no longer hand the baseline back unchanged.
//  * A delta with too few additions is rejected and retried; truncated JSON is salvaged, not thrown away.
//  * A unit the model cannot produce falls back to the baseline diagram.
//  *
//  * Diagrams (one .md file each): use case, process (BPMN-style), sequence, state machine, decision table / DMN.
//  * Scenario titles and unit groupings come from the data; nothing about a specific business is hardcoded.
//  * Every generated file is prefixed with the time of the run, for example 20261115_163042_01_use_case_diagram.md
//  *
//  * USAGE
//  *   node 8.5.2.DiagramsAI.js                                  generate everything missing (resumable), then render
//  *   node 8.5.2.DiagramsAI.js --fast                           the smallest useful set of model calls
//  *   node 8.5.2.DiagramsAI.js --diagram "use case"             only that diagram
//  *   node 8.5.2.DiagramsAI.js --rerun --diagram "sequence"     discard and regenerate that diagram
//  *   node 8.5.2.DiagramsAI.js --rerun --diagram "state" --failed    redo only units that failed or came back partial
//  *   node 8.5.2.DiagramsAI.js --rerun --failed                 redo every failed unit of every diagram
//  *   node 8.5.2.DiagramsAI.js --rerun --unit STATE-2           redo one unit
//  *   node 8.5.2.DiagramsAI.js --status                         show ok / failed / partial / pending per unit
//  *   node 8.5.2.DiagramsAI.js --render                         re-render the .md files from saved results (no AI)
//  *   node 8.5.2.DiagramsAI.js --limit 2                        smoke test: first 2 selected units only
//  *
//  * Diagram names: "use case", "process" (or bpmn), "sequence", "state" (or state machine), "decision" (or dmn), "all".
//  * Tuning (env): STATE_OBJECTS_PER_UNIT (default 5, 0 = all in one call), DECISION_GROUPS (6), DECISION_GROUPS_PER_UNIT (2), THREADS.
//  * Requires 8.5.0.DiagramCommon.js in the same folder. Local llama-cli only: MODEL_NAME, LLAMA_CLI_PATH.
//  */

// const fs = require('fs');
// const path = require('path');
// const { spawn } = require('child_process');
// const C = require('./8.5.0.DiagramCommon.js');

// const ROOT = process.cwd();
// const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
// const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';
// const OUTPUT_DIR = process.env.DIAGRAM_OUTPUT_DIR_AI ||
//     path.join(ROOT, 'app/utils/appflowgeneratorAI/aiOutput/diagrams/ai');
// const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
// const PROMPT_VERSION = '2';

// const SETTINGS = {
//     threads: Number(process.env.THREADS || 6),
//     llamaBatch: 512,
//     temperature: 0.3,
//     timeoutMs: 30 * 60 * 1000,
//     heartbeatMs: 30000,
//     retries: 1,
//     context: 4096,
//     contextChars: 1500,
//     baselineChars: 1800,
//     stateObjectsPerUnit: process.env.STATE_OBJECTS_PER_UNIT === undefined ? 5 : Number(process.env.STATE_OBJECTS_PER_UNIT),
//     decisionGroups: Number(process.env.DECISION_GROUPS || 6),
//     decisionGroupsPerUnit: Number(process.env.DECISION_GROUPS_PER_UNIT || 2)
// };
// // the least the model must ADD on a first attempt (the last attempt accepts any addition)
// const MIN_ADDED = { usecase: 4, capability: 3, process: 4, sequence: 4, state: 3, decision: 2 };

// const { log, arr, uniq, cut, norm, same } = C;

// // ============================================================
// // 1. DIAGRAM CATALOGUE AND CLI
// // ============================================================

// const DIAGRAMS = {
//     usecase: { name: 'use case', file: '01_use_case_diagram.md', title: 'Use Case Diagram' },
//     process: { name: 'process', file: '02_business_process_bpmn.md', title: 'BPMN-style Business Process Diagram' },
//     sequence: { name: 'sequence', file: '03_sequence_diagram.md', title: 'Sequence Diagrams' },
//     state: { name: 'state', file: '04_state_machine_diagrams.md', title: 'State Machine Diagrams' },
//     decision: { name: 'decision', file: '05_decision_table_dmn.md', title: 'Decision Table / DMN' }
// };

// function diagramKey(name) {
//     const t = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
//     if (t === 'all') return 'all';
//     if (/^usecase/.test(t)) return 'usecase';
//     if (/^(process|bpmn|businessprocess)/.test(t)) return 'process';
//     if (/^sequence/.test(t)) return 'sequence';
//     if (/^state/.test(t)) return 'state';
//     if (/^(decision|dmn)/.test(t)) return 'decision';
//     throw new Error(`Unknown diagram "${name}". Use one of: "use case", "process", "sequence", "state", "decision", "all".`);
// }

// function parseArgs(argv) {
//     const o = { rerun: false, failed: false, status: false, render: false, help: false, fast: false, diagram: null, unit: null, limit: null };
//     for (let i = 0; i < argv.length; i++) {
//         const a = argv[i];
//         const val = () => { const v = argv[++i]; if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`); return v; };
//         if (a === '--rerun') o.rerun = true;
//         else if (a === '--failed') o.failed = true;
//         else if (a === '--status') o.status = true;
//         else if (a === '--render') o.render = true;
//         else if (a === '--fast') o.fast = true;
//         else if (a === '--help' || a === '-h') o.help = true;
//         else if (a === '--diagram') o.diagram = diagramKey(val());
//         else if (a === '--unit') o.unit = val().toUpperCase();
//         else if (a === '--limit') o.limit = Number(val());
//         else throw new Error(`Unknown option ${a}. Run with --help.`);
//     }
//     if (o.rerun && !o.diagram && !o.unit && !o.failed) {
//         throw new Error('--rerun needs a target: --diagram <name> (or "all"), --unit <id> or --failed.');
//     }
//     return o;
// }

// const USAGE = `Usage: node 8.5.2.DiagramsAI.js [options]
//   (no options)               generate every missing unit (resumable), then render the .md files
//   --fast                     smallest useful set of model calls (skips the second use case view, the second process,
//                              all but the first sequence scenario and all but the first decision batch)
//   --diagram <name>           only that diagram: "use case" | "process" | "sequence" | "state" | "decision" | "all"
//   --rerun                    discard saved results of the selected units and regenerate them
//   --failed                   restrict to units that failed or came back partial (combine with --rerun)
//   --unit <id>                one unit, for example STATE-2 (see --status)
//   --limit <n>                only the first n selected units (smoke test)
//   --status                   show every unit: ok / failed / partial / pending
//   --render                   re-render the .md files from saved results, no AI
// Examples:
//   --rerun --diagram "use case"      --rerun --diagram "sequence"      --rerun --diagram "process"
//   --rerun --diagram "state"         --rerun --diagram "decision"      --rerun --failed`;

// // ============================================================
// // 2. LOCAL MODEL RUNNER (with salvage of truncated JSON)
// // ============================================================

// function runLocal(label, prompt, maxTokens) {
//     return new Promise((resolve, reject) => {
//         const started = Date.now();
//         let out = '';
//         const args = [
//             '-hf', MODEL, '-c', String(SETTINGS.context), '-n', String(maxTokens),
//             '-t', String(SETTINGS.threads), '-b', String(SETTINGS.llamaBatch), '-ngl', '0',
//             '--temp', String(SETTINGS.temperature), '--reasoning', 'off',
//             '--no-display-prompt', '--simple-io', '--log-disable', '-st', '-p', prompt
//         ];
//         const child = spawn(LLAMA_CLI, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
//         const hb = setInterval(() => log(`${label} running ${((Date.now() - started) / 1000).toFixed(0)}s, ${out.length} bytes`), SETTINGS.heartbeatMs);
//         const to = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, SETTINGS.timeoutMs);
//         child.stdout.on('data', d => { out += d.toString(); });
//         child.on('error', e => { clearInterval(hb); clearTimeout(to); reject(e); });
//         child.on('close', () => { clearInterval(hb); clearTimeout(to); resolve(out); });
//     });
// }
// let runner = runLocal;
// const setRunner = fn => { runner = fn; };
// const NO_THINK = '<think>\n\n</think>\n\n';

// function extractJson(body) {
//     const start = body.indexOf('{');
//     if (start < 0) throw new Error('no JSON object in output');
//     let depth = 0, inStr = false, esc = false;
//     for (let i = start; i < body.length; i++) {
//         const ch = body[i];
//         if (inStr) {
//             if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false;
//             continue;
//         }
//         if (ch === '"') inStr = true;
//         else if (ch === '{') depth++;
//         else if (ch === '}' && --depth === 0) return JSON.parse(body.slice(start, i + 1));
//     }
//     throw new Error('unterminated JSON');
// }

// // When the model runs out of tokens the JSON is cut mid-way. Instead of discarding 20 minutes of output,
// // cut back to the last complete element and close the open brackets.
// function parseLoose(raw) {
//     const body = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '');
//     try { return extractJson(body); } catch (e) { if (!/unterminated/.test(e.message) && !/JSON/.test(e.message)) throw e; }
//     const start = body.indexOf('{');
//     if (start < 0) throw new Error('no JSON object in output');
//     const text = body.slice(start);
//     const stack = [], snaps = [];
//     let inStr = false, esc = false;
//     for (let i = 0; i < text.length; i++) {
//         const ch = text[i];
//         if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
//         if (ch === '"') inStr = true;
//         else if (ch === '{' || ch === '[') stack.push(ch);
//         else if (ch === '}' || ch === ']') stack.pop();
//         else if (ch === ',') snaps.push({ pos: i, stack: stack.slice() });
//     }
//     for (let k = snaps.length - 1; k >= Math.max(0, snaps.length - 600); k--) {
//         const { pos, stack: st } = snaps[k];
//         const closers = st.slice().reverse().map(c => (c === '{' ? '}' : ']')).join('');
//         try { return JSON.parse(text.slice(0, pos) + closers); } catch { /* try an earlier cut */ }
//     }
//     throw new Error('the output could not be parsed or salvaged');
// }

// // parse + apply; the rejection reason is fed back to the model once. Later attempts accept smaller additions.
// async function ask(label, promptFn, tokens, apply) {
//     let hint = '', error = '';
//     for (let a = 0; a <= SETTINGS.retries; a++) {
//         try {
//             const raw = await runner(`${label} try ${a + 1}`, promptFn(hint), tokens);
//             return { ok: true, value: apply(parseLoose(raw), a === SETTINGS.retries) };
//         } catch (e) { hint = e.message; error = e.message; log(`${label} try ${a + 1} rejected: ${hint}`); }
//     }
//     return { ok: false, error };
// }

// // ============================================================
// // 3. VALIDATORS (what ends up in a diagram is always checked)
// // ============================================================

// const clean = (s, n = 80) => cut(String(s ?? '').replace(/\s+/g, ' ').trim(), n);
// const bool = v => v === true || /^true$/i.test(String(v));
// const T = s => String(s ?? '').trim();
// const eq = (a, b) => norm(a) === norm(b);
// const clone = o => JSON.parse(JSON.stringify(o));
// const parts = s => String(s ?? '').split('|').map(T);
// // the model may send strings or small objects; both become "a|b|c"
// const items = v => arr(v).map(x => (typeof x === 'string' ? x : x && typeof x === 'object' ? Object.values(x).map(T).join('|') : String(x)));
// const nextId = (list, prefix) => { let n = list.length + 1; while (list.some(x => x.id === `${prefix}${n}`)) n++; return `${prefix}${n}`; };
// const findBy = (list, ref, key) => list.find(x => x.id === T(ref)) || list.find(x => eq(x[key], ref)) || list.find(x => same(x[key], ref));

// function withIds(list, prefix, cap) {
//     const seen = new Set();
//     return arr(list).slice(0, cap).map((x, i) => {
//         let id = x && x.id !== undefined && String(x.id).trim() ? String(x.id).trim() : `${prefix}${i + 1}`;
//         while (seen.has(id)) id = `${id}_${i + 1}`;
//         seen.add(id);
//         return { ...x, id };
//     });
// }
// const resolver = items2 => ref => {
//     const r = String(ref ?? '').trim();
//     const hit = items2.find(x => x.id === r) || items2.find(x => x.name && same(x.name, r)) || items2.find(x => x.label && same(x.label, r));
//     return hit ? hit.id : null;
// };

// function validateUseCase(raw, fallbackSystem) {
//     const actors = withIds(raw.actors, 'a', 18).map(a => ({
//         id: a.id, name: clean(a.name, 60),
//         kind: /system|automat/i.test(a.kind) ? 'system' : /external|third|organi[sz]ation/i.test(a.kind) ? 'external' : 'internal', inferred: bool(a.inferred)
//     })).filter(a => a.name);
//     const useCases = withIds(raw.use_cases, 'u', 40).map(u => ({ id: u.id, name: clean(u.name, 70), inferred: bool(u.inferred) })).filter(u => u.name);
//     const ra = resolver(actors), ru = resolver(useCases);
//     const links = [];
//     arr(raw.links).forEach(l => {
//         const a = ra(l.actor), u = ru(l.use_case);
//         if (a && u && !links.some(x => x.actor === a && x.use_case === u)) links.push({ actor: a, use_case: u, kind: /support/i.test(l.kind) ? 'supporting' : 'primary' });
//     });
//     const includes = [];
//     arr(raw.includes).forEach(i => {
//         const f = ru(i.from), t = ru(i.to);
//         if (f && t && f !== t) includes.push({ from: f, to: t, kind: /extend/i.test(i.kind) ? 'extend' : 'include' });
//     });
//     if (!actors.length) throw new Error('no usable actors');
//     if (useCases.length < 2) throw new Error('need at least 2 use cases');
//     if (!links.length) throw new Error('no valid links between actors and use cases');
//     return { title: clean(raw.title, 90), system_name: clean(raw.system_name, 80) || fallbackSystem, actors, use_cases: useCases, links, includes };
// }

// function validateProcess(raw) {
//     let nodes = withIds(raw.nodes, 'n', 60).map(n => ({
//         id: n.id, label: clean(n.label, 70), inferred: bool(n.inferred),
//         type: /start/i.test(n.type) ? 'start' : /end|finish/i.test(n.type) ? 'end' : /decision|gateway/i.test(n.type) ? 'decision' : /exception|error/i.test(n.type) ? 'exception' : 'task',
//         lane: clean(n.lane, 50)
//     })).filter(n => n.label || n.type === 'start' || n.type === 'end');
//     nodes.forEach(n => { if (!n.label) n.label = n.type === 'start' ? 'Start' : 'End'; if (['start', 'end'].includes(n.type)) n.lane = ''; else if (!n.lane) n.lane = 'Unassigned'; });
//     const firstStart = nodes.find(n => n.type === 'start');
//     nodes = nodes.filter(n => n.type !== 'start' || n === firstStart);
//     const r = resolver(nodes);
//     let flows = [];
//     arr(raw.flows).forEach(f => {
//         const a = r(f.from), b = r(f.to);
//         if (!a || !b || a === b || flows.some(x => x.from === a && x.to === b)) return;
//         const toExc = (nodes.find(n => n.id === b) || {}).type === 'exception';
//         flows.push({ from: a, to: b, label: clean(f.label, 40), kind: /exception|fail/i.test(f.kind) || toExc ? 'exception' : 'normal' });
//     });
//     nodes = nodes.filter(n => flows.some(f => f.from === n.id || f.to === n.id));
//     flows = flows.filter(f => nodes.some(n => n.id === f.from) && nodes.some(n => n.id === f.to));
//     if (nodes.filter(n => n.type === 'task').length < 3) throw new Error('need at least 3 task nodes connected by flows');
//     if (!nodes.some(n => n.type === 'start')) {
//         const first = nodes.find(n => !flows.some(f => f.to === n.id) && n.type !== 'exception') || nodes[0];
//         nodes.unshift({ id: 'start', type: 'start', label: 'Start', lane: '' });
//         flows.unshift({ from: 'start', to: first.id, label: '', kind: 'normal' });
//     }
//     if (!nodes.some(n => n.type === 'end')) {
//         const last = [...nodes].reverse().find(n => n.type === 'task' && !flows.some(f => f.from === n.id)) || [...nodes].reverse().find(n => n.type === 'task');
//         nodes.push({ id: 'finish', type: 'end', label: 'End', lane: '' });
//         flows.push({ from: last.id, to: 'finish', label: '', kind: 'normal' });
//     }
//     return { title: clean(raw.title, 90), nodes, flows };
// }

// function validateSequence(raw) {
//     const participants = withIds(raw.participants, 'p', 12).map(p => ({
//         id: p.id, name: clean(p.name, 40), kind: /participant|system/i.test(p.kind) ? 'participant' : 'actor', inferred: bool(p.inferred)
//     })).filter(p => p.name);
//     if (participants.length < 2) throw new Error('need at least 2 participants');
//     const rp = resolver(participants);
//     const steps = [];
//     let depth = 0;
//     arr(raw.steps).slice(0, 90).forEach(s => {
//         const type = /note/i.test(s.type) ? 'note' : /^else/i.test(s.type) ? 'else' : /^alt/i.test(s.type) ? 'alt' : /^end/i.test(s.type) ? 'end' : 'message';
//         const inferred = bool(s.inferred);
//         if (type === 'message') {
//             const from = rp(s.from), to = rp(s.to);
//             if (!from || !to || !clean(s.text)) return;
//             steps.push({ type, from, to, text: clean(s.text, 80), style: from === to ? 'self' : /dash|return|async|reply/i.test(s.style) ? 'dashed' : 'sync', inferred });
//         } else if (type === 'note') {
//             const over = uniq(arr(s.over).map(rp));
//             if (!over.length || !clean(s.text)) return;
//             steps.push({ type, over, text: clean(s.text, 90), inferred });
//         } else if (type === 'alt') { depth++; steps.push({ type, text: clean(s.text, 60) || 'Condition', inferred }); }
//         else if (type === 'else') { if (depth) steps.push({ type, text: clean(s.text, 60) || 'Otherwise', inferred }); }
//         else if (type === 'end') { if (depth) { depth--; steps.push({ type }); } }
//     });
//     while (depth--) steps.push({ type: 'end' });
//     if (steps.filter(s => s.type === 'message').length < 2) throw new Error('need at least 2 messages between participants');
//     return { title: clean(raw.title, 90), participants, steps };
// }

// function validateState(raw, objectName) {
//     const states = withIds(raw.states, 's', 14).map(s => ({ id: s.id, name: clean(s.name, 45), inferred: bool(s.inferred) })).filter(s => s.name);
//     if (states.length < 2) throw new Error('need at least 2 states');
//     const rs = resolver(states);
//     const transitions = [];
//     arr(raw.transitions).slice(0, 24).forEach(t => {
//         const f = rs(t.from), to = rs(t.to);
//         if (f && to) transitions.push({ from: f, to, event: clean(t.event, 45) || 'moves', guard: clean(t.guard, 45), inferred: bool(t.inferred) });
//     });
//     if (!transitions.length) throw new Error('no valid transitions');
//     const initial = rs(raw.initial) || states[0].id;
//     let finals = uniq(arr(raw.finals).map(rs));
//     if (!finals.length) finals = states.filter(s => !transitions.some(t => t.from === s.id) && s.id !== initial).map(s => s.id).slice(0, 3);
//     if (!finals.length) finals = [states[states.length - 1].id];
//     const notes = arr(raw.notes).map(n => ({ state: rs(n.state), text: clean(n.text, 90) })).filter(n => n.state && n.text).slice(0, 3);
//     return { object: clean(raw.object, 60) || objectName, purpose: raw.purpose || '', states, transitions, notes, initial, finals };
// }

// const HIT = { U: 'U (Unique)', A: 'A (Any)', P: 'P (Priority)', F: 'F (First)', R: 'R (Rule order)', O: 'O (Output order)', C: 'C (Collect)' };
// function validateDecision(raw, model) {
//     const inputs = arr(raw.inputs).map(x => clean(typeof x === 'object' ? x.name : x, 40)).filter(Boolean).slice(0, 4);
//     const outputs = arr(raw.outputs).map(x => clean(typeof x === 'object' ? x.name : x, 40)).filter(Boolean).slice(0, 3);
//     if (!inputs.length || !outputs.length) throw new Error('need at least 1 input column and 1 output column');
//     const refs = new Map(model.rules.map(r => [r.ref, r]));
//     const fit = (list, n) => Array.from({ length: n }, (_, i) => clean(arr(list)[i], 140) || '-');
//     const rows = arr(raw.rows).slice(0, 18).map(r => {
//         const base = refs.get(String(r.rule || '').trim());
//         return {
//             when: fit(r.when, inputs.length), then: fit(r.then, outputs.length), rule: base ? base.ref : '',
//             type: base ? base.type : '', severity: base ? base.severity : '', enforcement: base ? base.enforcement : '',
//             basis: bool(r.inferred) ? 'inferred' : (base ? base.basis : ''), inferred: bool(r.inferred)
//         };
//     }).filter(r => r.when.some(x => x !== '-') || r.then.some(x => x !== '-'));
//     if (rows.length < 2) throw new Error('need at least 2 rows');
//     const key = String(raw.hit_policy || 'C').trim().toUpperCase()[0];
//     return { name: clean(raw.name, 70), subject: raw.subject || '', hit_policy: HIT[key] || HIT.C, inputs, outputs, rows };
// }

// // ============================================================
// // 4. APPLY A DELTA TO A BASELINE (the model adds; code merges, marks and validates)
// // ============================================================

// function applyUseCase(base, d, model) {
//     const spec = clone(base);
//     let added = 0;
//     const kindOf = k => (/system|automat/i.test(k) ? 'system' : /external|third|organi[sz]ation/i.test(k) ? 'external' : 'internal');
//     items(d.drop).slice(0, 3).forEach(ref => {
//         const a = findBy(spec.actors, ref, 'name');
//         if (a && spec.actors.length > 2) { spec.actors = spec.actors.filter(x => x !== a); spec.links = spec.links.filter(l => l.actor !== a.id); return; }
//         const u = findBy(spec.use_cases, ref, 'name');
//         if (u && spec.use_cases.length > 3) {
//             spec.use_cases = spec.use_cases.filter(x => x !== u);
//             spec.links = spec.links.filter(l => l.use_case !== u.id);
//             spec.includes = (spec.includes || []).filter(i => i.from !== u.id && i.to !== u.id);
//         }
//     });
//     items(d.actors).forEach(s => {
//         const [name, kind] = parts(s);
//         if (!name || spec.actors.some(a => eq(a.name, name)) || spec.actors.length >= 18) return;
//         spec.actors.push({ id: nextId(spec.actors, 'a'), name: clean(name, 60), kind: kindOf(kind), inferred: true }); added++;
//     });
//     items(d.use_cases).forEach(s => {
//         const [name] = parts(s);
//         if (!name || spec.use_cases.some(u => eq(u.name, name)) || spec.use_cases.length >= 40) return;
//         spec.use_cases.push({ id: nextId(spec.use_cases, 'u'), name: clean(name, 70), inferred: true }); added++;
//     });
//     items(d.links).forEach(s => {
//         const [a, u, k] = parts(s);
//         const A = findBy(spec.actors, a, 'name'), U = findBy(spec.use_cases, u, 'name');
//         if (A && U && !spec.links.some(l => l.actor === A.id && l.use_case === U.id)) {
//             spec.links.push({ actor: A.id, use_case: U.id, kind: /support/i.test(k) ? 'supporting' : 'primary' }); added++;
//         }
//     });
//     spec.includes = spec.includes || [];
//     items(d.includes).forEach(s => {
//         const [f, t, k] = parts(s);
//         const F = findBy(spec.use_cases, f, 'name'), Tt = findBy(spec.use_cases, t, 'name');
//         if (F && Tt && F !== Tt && !spec.includes.some(i => i.from === F.id && i.to === Tt.id)) {
//             spec.includes.push({ from: F.id, to: Tt.id, kind: /extend/i.test(k) ? 'extend' : 'include' }); added++;
//         }
//     });
//     return { spec: validateUseCase(spec, model.systemName), added };
// }

// // the model groups the business requirements into capabilities; code builds the use cases and links
// function applyCapabilities(base, d, model) {
//     const known = new Map(model.brs.map(b => [b.id, b]));
//     const assigned = new Set();
//     const caps = [];
//     arr(d.capabilities).forEach(c => {
//         let name, members;
//         if (typeof c === 'string') { const [n, m] = parts(c); name = n; members = String(m || '').split(/[,;\s]+/); }
//         else { name = c && c.name; members = arr(c && c.members); }
//         const ids = uniq(members.map(m => T(m).toUpperCase()).filter(m => known.has(m) && !assigned.has(m)));
//         if (!clean(name) || !ids.length) return;
//         ids.forEach(i => assigned.add(i));
//         caps.push({ name: clean(name, 70), ids });
//     });
//     if (caps.length < 3) throw new Error('need at least 3 capabilities that list business requirement ids as members');
//     const left = model.brs.filter(b => !assigned.has(b.id));
//     if (left.length) {
//         const sim = C.crossSimilarity(left.map(b => `${b.name} ${b.requirement}`),
//             caps.map(c => `${c.name} ${c.ids.map(i => known.get(i).name).join(' ')}`));
//         left.forEach((b, i) => { caps[sim[i].indexOf(Math.max(...sim[i]))].ids.push(b.id); });
//     }
//     const actors = [], actorId = new Map(), links = [];
//     const useCases = caps.map((c, i) => ({ id: `u${i + 1}`, name: c.name, inferred: true }));
//     caps.forEach((c, i) => {
//         uniq(c.ids.flatMap(id => known.get(id).stakeholders)).forEach(s => {
//             if (C.actorKind(model, s) === 'system') return;
//             if (!actorId.has(s)) { actorId.set(s, `a${actorId.size + 1}`); actors.push({ id: actorId.get(s), name: s, kind: C.actorKind(model, s) }); }
//             links.push({ actor: actorId.get(s), use_case: `u${i + 1}`, kind: 'primary' });
//         });
//     });
//     const spec = { title: 'View 2: functional capabilities (grouped by the AI)', system_name: model.systemName, actors, use_cases: useCases, links, includes: [] };
//     return { spec: validateUseCase(spec, model.systemName), added: caps.length };
// }

// function applyProcess(base, d) {
//     const spec = clone(base);
//     let added = 0;
//     const nodeRef = r => spec.nodes.find(n => n.id === T(r)) || spec.nodes.find(n => eq(n.label, r)) || spec.nodes.find(n => same(n.label, r));
//     items(d.drop).slice(0, 3).forEach(r => {
//         const n = nodeRef(r);
//         if (n && !['start', 'end'].includes(n.type)) { spec.nodes = spec.nodes.filter(x => x !== n); spec.flows = spec.flows.filter(f => f.from !== n.id && f.to !== n.id); }
//     });
//     items(d.cut).slice(0, 6).forEach(s => {
//         const [a, b] = parts(s);
//         const A = nodeRef(a), B = nodeRef(b);
//         if (A && B) spec.flows = spec.flows.filter(f => !(f.from === A.id && f.to === B.id));
//     });
//     const fresh = new Set();
//     items(d.steps).forEach(s => {
//         const [label, lane, type] = parts(s);
//         if (!label || spec.nodes.some(n => eq(n.label, label)) || spec.nodes.length >= 56) return;
//         const id = nextId(spec.nodes, 'i');
//         spec.nodes.push({ id, type: /decision|gateway/i.test(type) ? 'decision' : /exception|error/i.test(type) ? 'exception' : 'task', lane: clean(lane, 50) || 'Unassigned', label: clean(label, 70), inferred: true });
//         fresh.add(id);
//     });
//     items(d.flows).forEach(s => {
//         const [a, b, label, kind] = parts(s);
//         const A = nodeRef(a), B = nodeRef(b);
//         if (!A || !B || A === B || spec.flows.some(f => f.from === A.id && f.to === B.id)) return;
//         spec.flows.push({ from: A.id, to: B.id, label: clean(label, 40), kind: /exception|fail/i.test(kind) || B.type === 'exception' ? 'exception' : 'normal' });
//         added++;
//     });
//     // a new step that no flow reaches cannot be drawn
//     spec.nodes = spec.nodes.filter(n => !fresh.has(n.id) || spec.flows.some(f => f.from === n.id || f.to === n.id));
//     added += spec.nodes.filter(n => fresh.has(n.id)).length;
//     return { spec: validateProcess(spec), added };
// }

// function applySequence(base, d) {
//     const spec = clone(base);
//     let added = 0;
//     const pRef = r => spec.participants.find(p => p.id === T(r)) || spec.participants.find(p => eq(p.name, r)) || spec.participants.find(p => same(p.name, r));
//     items(d.participants).forEach(s => {
//         const [name, kind] = parts(s);
//         if (!name || spec.participants.some(p => eq(p.name, name)) || spec.participants.length >= 12) return;
//         spec.participants.push({ id: nextId(spec.participants, 'q'), name: clean(name, 40), kind: /participant|system/i.test(kind) ? 'participant' : 'actor', inferred: true }); added++;
//     });
//     const dropSet = new Set(items(d.drop).slice(0, 4).map(x => Number(String(x).replace(/\D/g, ''))).filter(n => n >= 1 && n <= spec.steps.length && ['message', 'note'].includes(spec.steps[n - 1].type)));
//     const ins = new Map();
//     items(d.steps).forEach(s => {
//         const [after, type, a, b, c, e] = parts(s);
//         const at = Math.min(Math.max(Number(after) || 0, 0), spec.steps.length);
//         const t = String(type).toLowerCase();
//         let st = null;
//         if (/^(msg|message)/.test(t)) {
//             const from = pRef(a), to = pRef(b);
//             if (from && to && clean(c)) st = { type: 'message', from: from.id, to: to.id, text: clean(c, 80), style: from.id === to.id ? 'self' : /dash|return|async|reply/i.test(e) ? 'dashed' : 'sync', inferred: true };
//         } else if (/^note/.test(t)) {
//             const p = pRef(a);
//             if (p && clean(b)) st = { type: 'note', over: [p.id], text: clean(b, 90), inferred: true };
//         } else if (/^alt/.test(t) && clean(a)) st = { type: 'alt', text: clean(a, 60), inferred: true };
//         else if (/^else/.test(t)) st = { type: 'else', text: clean(a, 60) || 'Otherwise', inferred: true };
//         else if (/^end/.test(t)) st = { type: 'end' };
//         if (!st) return;
//         if (!ins.has(at)) ins.set(at, []);
//         ins.get(at).push(st);
//         if (['message', 'note', 'alt'].includes(st.type)) added++;
//     });
//     const steps = [...(ins.get(0) || [])];
//     spec.steps.forEach((st, i) => { if (!dropSet.has(i + 1)) steps.push(st); steps.push(...(ins.get(i + 1) || [])); });
//     spec.steps = steps;
//     return { spec: validateSequence(spec), added };
// }

// function applyMachine(base, m, objectName) {
//     const spec = clone(base);
//     spec.object = objectName; spec.states = spec.states || []; spec.transitions = spec.transitions || []; spec.notes = spec.notes || [];
//     let added = 0;
//     const sRef = r => spec.states.find(s => s.id === T(r)) || spec.states.find(s => eq(s.name, r)) || spec.states.find(s => same(s.name, r));
//     const addState = name => {
//         const n = clean(name, 45);
//         if (!n) return null;
//         const hit = sRef(n);
//         if (hit) return hit;
//         if (spec.states.length >= 14) return null;
//         const s = { id: nextId(spec.states, 's'), name: n, inferred: true };
//         spec.states.push(s); added++;
//         return s;
//     };
//     items(m.states).forEach(s => addState(parts(s)[0]));
//     items(m.transitions).forEach(t => {
//         const [f, to, ev, g] = parts(t);
//         const F = addState(f), Tt = addState(to);
//         if (!F || !Tt || F === Tt || spec.transitions.length >= 24) return;
//         if (spec.transitions.some(x => x.from === F.id && x.to === Tt.id && eq(x.event, ev))) return;
//         spec.transitions.push({ from: F.id, to: Tt.id, event: clean(ev, 45) || 'moves', guard: clean(g, 45), inferred: true }); added++;
//     });
//     const init = m.initial ? sRef(m.initial) : null;
//     spec.initial = init ? init.id : (spec.initial && sRef(spec.initial) ? spec.initial : (spec.states[0] || {}).id);
//     const fin = uniq([...arr(spec.finals), ...items(m.finals).map(f => (sRef(f) || {}).id)]).filter(id => spec.states.some(s => s.id === id));
//     spec.finals = fin.length ? fin : spec.states.filter(s => !spec.transitions.some(t => t.from === s.id) && s.id !== spec.initial).map(s => s.id).slice(0, 3);
//     return { spec, added };
// }

// function applyStates(u, d) {
//     const specs = [], incomplete = [];
//     let added = 0;
//     const machines = arr(d.machines);
//     u.subjects.forEach(subject => {
//         const base = u.baseline.machines[subject] || { object: subject, states: [], transitions: [], notes: [], initial: '', finals: [] };
//         const m = machines.find(x => x && eq(x.object, subject)) || machines.find(x => x && same(x.object, subject));
//         const hasBase = (base.states || []).length >= 2;
//         if (!m) { if (hasBase) specs.push(validateState(base, subject)); else incomplete.push(subject); return; }
//         const r = applyMachine(base, m, subject);
//         try { specs.push(validateState(r.spec, subject)); added += r.added; }
//         catch { if (hasBase) specs.push(validateState(base, subject)); else incomplete.push(subject); }
//     });
//     if (!specs.length) throw new Error('no lifecycle could be built; return one entry in "machines" per object, each with states and transitions');
//     return { spec: specs, added, incomplete };
// }

// function parseRow(s) {
//     let str = T(s), rule = '';
//     const m = /\[(R-\d+)\]\s*$/.exec(str);
//     if (m) { rule = m[1]; str = str.slice(0, m.index).trim(); }
//     const idx = str.indexOf('=>');
//     if (idx < 0) return null;
//     return { when: str.slice(0, idx).split('|').map(T), then: str.slice(idx + 2).split('|').map(T), rule };
// }

// function applyDecisions(u, d, model) {
//     const tables = [], incomplete = [];
//     let added = 0;
//     const raw = arr(d.tables);
//     u.subjects.forEach((subject, i) => {
//         const t = raw.find(x => x && (eq(x.subject, subject) || same(x.subject, subject))) || raw[i];
//         const base = u.baseline.tables[subject];
//         if (!t) { if (base) tables.push(base); incomplete.push(subject); return; }
//         const rows = items(t.rows).map(parseRow).filter(Boolean);
//         const known = new Set(model.rules.map(r => r.ref));
//         rows.forEach(r => { r.inferred = !r.rule || !known.has(r.rule); });
//         try {
//             const spec = validateDecision({ ...t, subject, rows }, model);
//             tables.push(spec);
//             added += spec.rows.filter(r => r.inferred).length;
//         } catch { if (base) tables.push(base); incomplete.push(subject); }
//     });
//     if (!tables.length) throw new Error('no decision table could be built; return one entry in "tables" per subject with rows written as: value | value => outcome | outcome [R-001]');
//     return { spec: tables, added, incomplete };
// }

// function countInferred(spec) {
//     const one = s => ['actors', 'use_cases', 'nodes', 'steps', 'states', 'transitions', 'rows', 'participants']
//         .reduce((n, k) => n + arr(s && s[k]).filter(x => x && x.inferred).length, 0);
//     return Array.isArray(spec) ? spec.reduce((n, s) => n + one(s), 0) : one(spec);
// }

// // ============================================================
// // 5. UNITS: derived from the data, batched to keep the number of model calls small
// // ============================================================

// const chunk = (list, n) => {
//     if (!n || n <= 0) return [list];
//     const out = [];
//     for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
//     return out;
// };

// function buildUnits(model, o = {}) {
//     const units = [];
//     const uc = C.buildUseCaseSpecs(model);
//     units.push({ id: 'USECASE-1', diagram: 'usecase', kind: 'usecase', title: 'Use cases from business activities', baseline: uc[0],
//         focus: 'Each use case is something an actor wants to achieve with the system. Add the actors, use cases, links and include/extend relations that are missing.' });
//     if (!o.fast && uc[1]) {
//         units.push({ id: 'USECASE-2', diagram: 'usecase', kind: 'capability', title: 'Functional capabilities', baseline: uc[1],
//             focus: 'Group the business requirements into functional capabilities.' });
//     }
//     units.push({ id: 'PROCESS-1', diagram: 'process', kind: 'process', title: 'Main end-to-end process', baseline: C.buildProcessSpec(model),
//         focus: 'The main end-to-end business process, one lane per responsible actor. Add missing steps, business rule decisions and the exception outcomes of those decisions.' });
//     if (!o.fast) {
//         units.push({ id: 'PROCESS-2', diagram: 'process', kind: 'process', title: 'Exception paths',
//             baseline: C.buildProcessSpec(model, { ruleTypes: ['Exception handling'], title: 'Exception paths' }),
//             focus: 'What can go wrong in this business: failures, rejections, timeouts, cancellations and disagreements between parties. Add each exception path: how it is detected, who handles it, how it is put right and how it ends.' });
//     }
//     const scenarios = C.sequenceScenarios(model);
//     (o.fast ? scenarios.slice(0, 1) : scenarios).forEach((s, i) => {
//         units.push({
//             id: `SEQ-${i + 1}`, diagram: 'sequence', kind: 'sequence', title: s.title, baseline: C.buildSequenceSpec(model, s),
//             focus: s.kind === 'exception'
//                 ? `Interactions over time when something goes wrong in: ${s.title}. Add who detects it, who handles it, how it is put right and how it ends.`
//                 : `Interactions over time for this part of the business: ${s.title}. Add the missing hand-overs, confirmations, checks and alternative branches.`
//         });
//     });

//     const stateSpecs = new Map(C.buildStateSpecs(model).map(s => [s.object, s]));
//     chunk(model.objects.map(x => x.name), SETTINGS.stateObjectsPerUnit).forEach((names, i) => {
//         units.push({
//             id: `STATE-${i + 1}`, diagram: 'state', kind: 'state', subjects: names,
//             title: names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', '),
//             baseline: { machines: Object.fromEntries(names.map(n => [n, stateSpecs.get(n) || { object: n, states: [], transitions: [], notes: [], initial: '', finals: [] }])) },
//             focus: 'The lifecycle of each business object: its states, the events that move it, the guards (business rules) on each move, and the abnormal states it can end up in.'
//         });
//     });

//     const dec = C.buildDecisionSpecs(model);
//     const groups = chunk(dec.tables.slice(0, SETTINGS.decisionGroups), SETTINGS.decisionGroupsPerUnit);
//     (o.fast ? groups.slice(0, 1) : groups).forEach((g, i) => {
//         units.push({
//             id: `DEC-${i + 1}`, diagram: 'decision', kind: 'decision', subjects: g.map(t => t.subject), title: g.map(t => t.subject).join(', '),
//             baseline: { tables: Object.fromEntries(g.map(t => [t.subject, t])) },
//             focus: 'The decisions about each subject: the inputs that drive them, the outcome, and rows for the important combinations the baseline lacks.'
//         });
//     });
//     return units;
// }

// const inputHash = u => C.shortHash(JSON.stringify([PROMPT_VERSION, u.id, u.title, u.focus, u.baseline]));

// // ---- results are timestamped files; the newest usable one wins, older ones stay as history ----
// function unitFiles(u) {
//     try {
//         return fs.readdirSync(UNIT_DIR).filter(f => /^\d{8}_\d{6}_/.test(f) && f.endsWith(`_${u.id}.json`)).sort().reverse()
//             .map(f => { try { return JSON.parse(fs.readFileSync(path.join(UNIT_DIR, f), 'utf8')); } catch { return null; } }).filter(Boolean);
//     } catch { return []; }
// }
// const bestOk = u => unitFiles(u).find(r => r.status === 'ok' && r.input_hash === inputHash(u)) || null;
// function unitState(u) {
//     const files = unitFiles(u);
//     if (!files.length) return 'pending';
//     const ok = bestOk(u);
//     if (ok) return arr(ok.incomplete).length ? 'partial' : 'ok';
//     return files.some(r => r.status === 'ok') ? 'stale' : 'failed';
// }

// // ============================================================
// // 6. PROMPTS (small on purpose: prompt reading and writing are the cost on a CPU)
// // ============================================================

// const spl = (L, label, list) => { if (list.length) L.push(`${label}: ${list.join('; ')}`); };

// function contextFor(u, model) {
//     const L = [`System: ${model.systemName}`];
//     const actors = () => spl(L, 'ACTORS', model.actors.map(a => `${a.name} (${a.kind}${a.role ? ', ' + cut(a.role, 50) : ''})`));
//     const acts = n => L.push('ACTIVITIES IN ORDER:', ...model.activities.slice(0, n).map((a, i) =>
//         `${i + 1}. ${a.name} by ${a.primary}${a.supporting.length ? ' with ' + a.supporting.join(', ') : ''}; in: ${a.inputs.join(', ') || '-'}; out: ${a.outputs.join(', ') || '-'}`));
//     const rules = (list, n) => { if (list.length) L.push('BUSINESS RULES:', ...list.slice(0, n).map(r => `- ${r.ref} ${cut(r.statement, 90)}`)); };
//     if (u.kind === 'usecase') { actors(); acts(12); }
//     else if (u.kind === 'capability') { actors(); }
//     else if (u.kind === 'process') { actors(); acts(12); rules(model.rules.filter(r => C.DECISION_TYPES.includes(r.type) || r.type === 'Exception handling'), 8); }
//     else if (u.kind === 'sequence') { actors(); const f = model.irs.slice(0, 6).map(r => `${cut(r.label, 40)}: ${cut(r.source, 50)}`); spl(L, 'INFORMATION FLOWS', f); }
//     else if (u.kind === 'state') {
//         u.subjects.forEach(s => {
//             const o = model.objects.find(x => x.name === s) || {};
//             L.push(`OBJECT ${s}: ${cut(o.purpose, 70)}; lifecycle role: ${cut(o.lifecycle, 60)}`);
//             const a = model.activities.filter(x => [...x.inputs, ...x.outputs].some(y => same(y, s))).map(x => x.name);
//             if (a.length) L.push(`  touched by: ${a.join('; ')}`);
//         });
//     } else if (u.kind === 'decision') {
//         u.subjects.forEach(s => L.push(`SUBJECT ${s}`));
//     }
//     return L.join('\n').slice(0, SETTINGS.contextChars);
// }

// function baselineText(u) {
//     const b = u.baseline;
//     let t = '';
//     if (u.kind === 'usecase') {
//         t = `ACTORS: ${b.actors.map(a => `${a.id} ${a.name} (${a.kind})`).join('; ')}\nUSE CASES: ${b.use_cases.map(x => `${x.id} ${x.name}`).join('; ')}\nLINKS: ${b.actors.map(a => `${a.id}: ${b.links.filter(l => l.actor === a.id).map(l => l.use_case).join(',')}`).join(' | ')}`;
//     } else if (u.kind === 'capability') {
//         t = `BUSINESS REQUIREMENTS:\n${u.baseline.use_cases.map(x => x.name).join('\n')}`;
//     } else if (u.kind === 'process') {
//         t = `NODES: ${b.nodes.map(n => `${n.id} ${n.type}${n.lane ? ' [' + n.lane + ']' : ''} ${n.label}`).join('; ')}\nFLOWS: ${b.flows.map(f => `${f.from}>${f.to}${f.label ? ' (' + f.label + ')' : ''}`).join(', ')}`;
//     } else if (u.kind === 'sequence') {
//         const name = id => (b.participants.find(p => p.id === id) || { name: id }).name;
//         t = `PARTICIPANTS: ${b.participants.map(p => p.name).join('; ')}\nSTEPS:\n${b.steps.map((s, i) => `${i + 1} ${s.type === 'message' ? `${name(s.from)} -> ${name(s.to)}: ${s.text}` : s.type === 'note' ? `note ${name(s.over[0])}: ${s.text}` : s.type === 'end' ? 'end' : `${s.type} ${s.text || ''}`}`).join('\n')}`;
//     } else if (u.kind === 'state') {
//         t = u.subjects.map(s => {
//             const m = b.machines[s];
//             if (!m.states || m.states.length < 2) return `OBJECT ${s}: (no baseline; write its full lifecycle)`;
//             const nm = id => (m.states.find(x => x.id === id) || { name: id }).name;
//             return `OBJECT ${s}: states ${m.states.map(x => x.name).join('; ')} | transitions ${m.transitions.map(x => `${nm(x.from)}>${nm(x.to)} (${x.event})`).join('; ')}`;
//         }).join('\n');
//     } else if (u.kind === 'decision') {
//         t = u.subjects.map(s => `TABLE ${s}:\n${b.tables[s].rows.slice(0, 7).map(r => `${r.rule} [${r.type}] when ${cut(r.when[0], 50)} then ${cut(r.then[0], 80)}`).join('\n')}`).join('\n');
//     }
//     return t.slice(0, SETTINGS.baselineChars);
// }

// const COMMON = `You are a senior business analyst and solution architect improving ONE diagram.
// The BASELINE was built mechanically from the repositories. It is a starting point, not a limit and not proof.
// Return ONLY what is NEW or WRONG. Do NOT repeat baseline elements: they are kept automatically.
// ADD what an experienced analyst would expect in THIS kind of business but the baseline lacks (missing actors, steps,
// alternative paths, exceptions, states, guards, decisions), in the vocabulary of the business knowledge below.
// Business language only; no technology. Reply with ONLY the JSON object.`;

// const SPEC = {
//     usecase: `{"actors":["<actor name>|human or external or system"],
// "use_cases":["<use case name>"],
// "links":["<actor id or name>|<use case id or name>|primary or supporting"],
// "includes":["<use case>|<use case>|include or extend"],
// "drop":["<baseline id or name that is wrong>"]}
// Add at least 4 new elements.`,
//     capability: `{"capabilities":[{"name":"<capability name>","members":["<business requirement id>"]}]}
// Make 6 to 14 capabilities. Every business requirement id belongs to exactly one capability.`,
//     process: `{"steps":["<step label>|<responsible actor>|task or decision or exception"],
// "flows":["<from id or label>|<to id or label>|<edge label>|normal or exception"],
// "cut":["<from id>|<to id>"],"drop":["<baseline id that is wrong>"]}
// Wire every new step with flows (use baseline ids such as t1 or d1). Add at least 4 new elements.`,
//     sequence: `{"participants":["<name>|actor or participant"],
// "steps":["<after step number>|msg|<from>|<to>|<text>|sync or dashed","<after>|note|<participant>|<text>","<after>|alt|<condition>","<after>|else|<otherwise>","<after>|end"],
// "drop":["<step number>"]}
// Insert after a baseline step number (0 = at the start). Keep alt, else and end together. Add at least 4 new messages.`,
//     state: `{"machines":[{"object":"<object name>","states":["<state>"],"transitions":["<from state>|<to state>|<event>|<guard>"],"initial":"<state>","finals":["<state>"]}]}
// One entry per object. For an object with no baseline write its full lifecycle (at least 4 states, including abnormal endings); otherwise add only what is missing.`,
//     decision: `{"tables":[{"subject":"<subject>","name":"<table name>","hit_policy":"U or A or F or C","inputs":["<input column>"],"outputs":["<output column>"],
// "rows":["<value> | <value> => <outcome> | <outcome> [R-001]"]}]}
// One table per subject. Keep the baseline rules as rows (with their [R-xxx]) and add at least 2 rows without a rule id for combinations the baseline lacks. Use several input columns where a decision depends on more than one thing.`
// };

// function promptFor(u, model, hint) {
//     return `<|im_start|>system
// ${COMMON}

// Return JSON of this shape:
// ${SPEC[u.kind]}
// <|im_end|>
// <|im_start|>user
// FOCUS: ${u.focus}
// ${u.kind === 'sequence' || u.kind === 'process' ? `TITLE: ${u.title}\n` : ''}
// BUSINESS KNOWLEDGE:
// ${contextFor(u, model)}

// BASELINE:
// ${u.kind === 'capability' ? `BUSINESS REQUIREMENTS:\n${model.brs.map(b => `${b.id} ${cut(b.name, 60)}`).join('\n')}`.slice(0, 2400) : baselineText(u)}
// ${hint ? `\nYour previous answer was rejected: ${hint}\nFix it.\n` : ''}
// Return the JSON.
// <|im_end|>
// <|im_start|>assistant
// ${NO_THINK}`;
// }

// const tokensFor = u => ({
//     usecase: 700, capability: 800, process: 800, sequence: 900,
//     state: Math.min(3000, 300 + 260 * (u.subjects || []).length), decision: Math.min(2400, 300 + 520 * (u.subjects || []).length)
// }[u.kind]);

// function applyFor(u, model, d, lastTry) {
//     let r;
//     switch (u.kind) {
//         case 'usecase': r = applyUseCase(u.baseline, d, model); break;
//         case 'capability': r = applyCapabilities(u.baseline, d, model); break;
//         case 'process': r = applyProcess(u.baseline, d); break;
//         case 'sequence': r = applySequence(u.baseline, d); break;
//         case 'state': r = applyStates(u, d); break;
//         default: r = applyDecisions(u, d, model);
//     }
//     const need = lastTry ? 1 : MIN_ADDED[u.kind];
//     if (r.added < need) {
//         throw new Error(`you added only ${r.added} new element(s). The baseline is not complete: add at least ${need} NEW elements that are not in the baseline (do not repeat baseline items).`);
//     }
//     return r;
// }

// // ============================================================
// // 7. RUN UNITS
// // ============================================================

// function selectUnits(units, o) {
//     let sel = units;
//     if (o.diagram && o.diagram !== 'all') sel = sel.filter(u => u.diagram === o.diagram);
//     if (o.unit) sel = sel.filter(u => u.id === o.unit);
//     if (o.unit && !sel.length) throw new Error(`No unit ${o.unit}. Run with --status to list unit ids.`);
//     if (o.failed) sel = sel.filter(u => ['failed', 'partial'].includes(unitState(u)));
//     return sel;
// }

// async function runUnit(u, model) {
//     const started = Date.now();
//     const res = await ask(u.id, h => promptFor(u, model, h), tokensFor(u), (d, last) => applyFor(u, model, d, last));
//     const base = { unit_id: u.id, diagram: u.diagram, title: u.title, input_hash: inputHash(u), model: MODEL, generated_at: new Date().toISOString() };
//     fs.mkdirSync(UNIT_DIR, { recursive: true });
//     const file = path.join(UNIT_DIR, `${C.RUN_STAMP}_${u.id}.json`);
//     const secs = Math.round((Date.now() - started) / 1000);
//     if (res.ok) {
//         const v = res.value;
//         fs.writeFileSync(file, JSON.stringify({ ...base, status: 'ok', seconds: secs, added: v.added, incomplete: v.incomplete || [], inferred_elements: countInferred(v.spec), spec: v.spec }, null, 2));
//         log(`${u.id} ok in ${secs}s: ${v.added} new element(s)${(v.incomplete || []).length ? `, incomplete: ${v.incomplete.join(', ')}` : ''}.`);
//         return true;
//     }
//     fs.writeFileSync(file, JSON.stringify({ ...base, status: 'failed', seconds: secs, error: res.error }, null, 2));
//     log(`${u.id} FAILED: ${res.error}. ${bestOk(u) ? 'The previous good result is kept.' : 'The baseline diagram is used instead.'}`);
//     return false;
// }

// function printStatus(units) {
//     console.log('\nUnit        Diagram    State     What');
//     units.forEach(u => console.log(`${u.id.padEnd(11)} ${u.diagram.padEnd(10)} ${unitState(u).padEnd(9)} ${cut(u.title, 70)}`));
//     const c = units.reduce((m, u) => { const s = unitState(u); m[s] = (m[s] || 0) + 1; return m; }, {});
//     console.log(`\n${units.length} units: ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')}`);
// }

// // ============================================================
// // 8. RENDER THE .md FILES
// // ============================================================

// const toArr = s => (Array.isArray(s) ? s : [s]);

// function resultFor(u) {
//     const ok = bestOk(u);
//     if (ok) return { spec: ok.spec, source: arr(ok.incomplete).length ? 'AI (partial)' : 'AI', added: ok.added || 0, incomplete: ok.incomplete || [] };
//     const st = unitState(u);
//     const why = st === 'failed' ? 'baseline (AI failed)' : st === 'stale' ? 'baseline (AI result outdated)' : 'baseline (not generated yet)';
//     if (u.kind === 'state') return { spec: Object.values(u.baseline.machines).filter(m => m.states.length >= 2), source: why, added: 0, incomplete: [] };
//     if (u.kind === 'decision') return { spec: Object.values(u.baseline.tables), source: why, added: 0, incomplete: [] };
//     return { spec: u.baseline, source: why, added: 0, incomplete: [] };
// }

// function statusTable(rows) {
//     return ['| Unit | Covers | Source | New elements |', '|---|---|---|---|',
//         ...rows.map(r => `| ${r.u.id} | ${cut(r.u.title, 60)} | ${r.source} | ${r.added} |`), ''];
// }

// function renderAll(model, units) {
//     const stamp = `Generated ${new Date().toISOString()} by 8.5.2.DiagramsAI.js using ${MODEL}. ${C.sourceLine(model)}`;
//     const legend = 'Dashed outlines and elements marked * were added by the AI model (inferred); solid ones come from the repositories.';
//     const written = [];
//     const forDiagram = k => units.filter(u => u.diagram === k).map(u => ({ u, ...resultFor(u) }));
//     const section = (items2, render) => {
//         const blocks = [...statusTable(items2)];
//         items2.forEach(x => blocks.push(`## ${x.u.id}: ${x.spec.title || x.u.title}`, '', `Focus: ${x.u.focus}`, '', render(x), ''));
//         return blocks;
//     };

//     written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.usecase.file, DIAGRAMS.usecase.title,
//         ['Actors, system boundary and functional capabilities.', '', legend, '', stamp],
//         section(forDiagram('usecase'), x => C.fence(C.renderUseCase({ ...x.spec, system_name: x.spec.system_name || model.systemName })))));
//     written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.process.file, DIAGRAMS.process.title,
//         ['End-to-end business processes with swimlanes (one per responsible actor), decisions and exception paths.', '', legend, '', stamp],
//         section(forDiagram('process'), x => C.fence(C.renderProcess(x.spec)))));
//     written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.sequence.file, DIAGRAMS.sequence.title,
//         ['Interactions between actors and system participants over time. Scenarios come from the data: groups of lifecycle stages and the exception rules.', '', legend, '', stamp],
//         section(forDiagram('sequence'), x => C.fence(C.renderSequence(x.spec)))));

//     // state machines: one section per object, however the objects were batched into model calls
//     const stateItems = forDiagram('state');
//     const machines = stateItems.flatMap(x => toArr(x.spec).map(m => ({ m, source: x.source, u: x.u })));
//     const stBlocks = [...statusTable(stateItems)];
//     machines.forEach(x => stBlocks.push(`## ${x.m.object}`, '', C.fence(C.renderState(x.m)), ''));
//     const missing = stateItems.flatMap(x => arr(x.incomplete));
//     if (missing.length) stBlocks.push(`_No lifecycle yet for: ${missing.join(', ')}. Rerun with \`--rerun --diagram "state" --failed\`._`, '');
//     written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.state.file, DIAGRAMS.state.title,
//         ['Lifecycle of each business object: states, transitions, guards and abnormal endings.', '', legend, '', stamp], stBlocks));

//     // decision tables: AI tables for the processed groups, baseline tables for the rest, DRD from the repositories
//     const dec = C.buildDecisionSpecs(model);
//     const decItems = forDiagram('decision');
//     const done = new Set(decItems.flatMap(x => toArr(x.spec).map(t => t.subject)));
//     const decBlocks = [...statusTable(decItems)];
//     if (dec.tables.length) decBlocks.push('## Decision requirements diagram', '', C.fence(C.renderDrd(dec.drd)), '', '## Decision tables', '');
//     else decBlocks.push('_No business rules were found, so there are no decisions to tabulate._', '');
//     decItems.forEach(x => toArr(x.spec).forEach(t => decBlocks.push(C.renderDecisionTable(t), '')));
//     dec.tables.filter(t => !done.has(t.subject)).forEach(t => decBlocks.push(C.renderDecisionTable(t), '_Baseline table, not AI-enhanced._', ''));
//     written.push(C.writeDoc(OUTPUT_DIR, DIAGRAMS.decision.file, DIAGRAMS.decision.title,
//         ['Business rules, conditions and decision outcomes. Mermaid has no DMN type, so decisions are Markdown tables plus a decision requirements diagram.', '', legend, '', stamp], decBlocks));

//     const link = f => `[${path.basename(f)}](${path.basename(f)})`;
//     written.push(C.writeDoc(OUTPUT_DIR, 'README.md', 'Diagram set (AI-enhanced)', [stamp, ''], [
//         '| Diagram | File | Units ok / total |', '|---|---|---|',
//         ...Object.keys(DIAGRAMS).map((k, i) => {
//             const us = units.filter(u => u.diagram === k);
//             return `| ${DIAGRAMS[k].title} | ${link(written[i])} | ${us.filter(u => unitState(u) === 'ok').length} / ${us.length} |`;
//         }), '',
//         'Rerun a diagram: `node 8.5.2.DiagramsAI.js --rerun --diagram "use case"` (also process, sequence, state, decision), or `--rerun --failed`.']));
//     return written;
// }

// // ============================================================
// // 9. MAIN
// // ============================================================

// async function main(argv = process.argv.slice(2), injectedPool = null) {
//     const o = parseArgs(argv);
//     if (o.help) { console.log(USAGE); return null; }

//     const pool = injectedPool || C.createPool();
//     let model;
//     try { model = await C.loadModel(pool); } finally { if (!injectedPool) await pool.end(); }
//     log(`Loaded: ${JSON.stringify(model.stats)}`);
//     if (!model.activities.length) throw new Error('No business activities were found in the knowledge base; nothing to draw.');

//     fs.mkdirSync(UNIT_DIR, { recursive: true });
//     const units = buildUnits(model, o);
//     if (o.status) { printStatus(units); return { units }; }

//     if (!o.render) {
//         let sel = selectUnits(units, o);
//         if (!o.rerun) sel = sel.filter(u => !['ok', 'partial'].includes(unitState(u)));
//         if (o.limit) sel = sel.slice(0, o.limit);
//         log(`${sel.length} unit(s) to generate${o.rerun ? ' (forced rerun)' : ''}: ${sel.map(u => u.id).join(', ') || 'none'}`);
//         for (const u of sel) await runUnit(u, model);
//     }

//     const written = renderAll(model, units);
//     const bad = units.filter(u => ['failed', 'partial'].includes(unitState(u)));
//     log(`Wrote ${written.length} files to ${OUTPUT_DIR}`);
//     written.forEach(f => console.log(`  ${f}`));
//     if (bad.length) {
//         console.log(`\n${bad.length} unit(s) failed or are partial (the baseline is used for what is missing): ${bad.map(u => u.id).join(', ')}`);
//         [...new Set(bad.map(u => u.diagram))].forEach(k => console.log(`  rerun: node 8.5.2.DiagramsAI.js --rerun --diagram "${DIAGRAMS[k].name}" --failed`));
//     }
//     return { units, written, bad, model };
// }

// if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });

// module.exports = { main, setRunner, parseArgs, parseLoose, buildUnits, unitState, applyUseCase, applyProcess, applySequence, applyStates, applyDecisions, applyCapabilities, diagramKey };
//----------------------------------------------------------------------------------------------------------
'use strict';

/**
 * 8.0.13.DiagramsAI.js
 *
 * AI-enhanced business diagrams.
 *
 * Baseline:
 *   PostgreSQL repositories through 8.5.0.DiagramCommon.js.
 *
 * AI:
 *   Returns diagram deltas. The application merges, validates and renders them.
 *
 * Fixes:
 *   - Reconcile duplicate actor aliases against canonical actors.
 *   - Allow incorrect use-case labels to be renamed.
 *   - Avoid treating activity/process stages as business-object states.
 *   - Prevent sequence self-messages from being invented as actor interactions.
 *   - Ensure exception nodes have a terminal outcome.
 *   - Remove exact duplicate DMN rows within each table only.
 *   - Preserve the same business rule in different tables when applicable.
 *   - Report AI-complete, AI-partial and baseline-only units separately.
 *
 * Requires:
 *   ./8.5.0.DiagramCommon.js
 /*
 * ============================================================
 * DIAGRAM GENERATOR — COMMAND REFERENCE
 * ============================================================
 *
 * FIRST-TIME GENERATION
 * ------------------------------------------------------------
 * Generate all diagram types:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js
 *
 * Generate only one diagram type:
 *
 * Use Case:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --diagram "use case"
 *
 * BPMN:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --diagram "bpmn"
 *
 * Sequence:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --diagram "sequence"
 *
 * State Machine:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --diagram "state"
 *
 * Decision Table / DMN:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --diagram "decision"
 *
 *
 * RERUN / REGENERATION
 * ------------------------------------------------------------
 * Rerun all units for one diagram:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --rerun --diagram "decision"
 *
 * Rerun only failed/partial units across all diagrams:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --rerun --failed
 *
 * Rerun only failed/partial units for one diagram:
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --rerun --diagram "decision" --failed
 *
 *
 * RENDER SAVED RESULTS
 * ------------------------------------------------------------
 * Rebuild Markdown diagram files and README from saved results.
 * Does NOT invoke the AI model.
 *
 * node app/utils/appflowgeneratorAI/Commands/8.0.13.DiagramsAI.js --render
 *
 * ============================================================
 
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./8.5.0.DiagramCommon.js');

const ROOT = process.cwd();
const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';

const OUTPUT_DIR = process.env.DIAGRAM_OUTPUT_DIR_AI ||
    path.join(ROOT, 'app/utils/appflowgeneratorAI/aiOutput/diagrams/ai');

const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
const PROMPT_VERSION = '3';

const SETTINGS = {
    threads: Number(process.env.THREADS || 6),
    llamaBatch: 512,
    temperature: 0.3,
    timeoutMs: 30 * 60 * 1000,
    heartbeatMs: 30000,
    retries: 1,
    context: 4096,
    contextChars: 1800,
    baselineChars: 2200,
    stateObjectsPerUnit: process.env.STATE_OBJECTS_PER_UNIT === undefined
        ? 5 : Number(process.env.STATE_OBJECTS_PER_UNIT),
    decisionGroups: Number(process.env.DECISION_GROUPS || 6),
    decisionGroupsPerUnit: Number(process.env.DECISION_GROUPS_PER_UNIT || 2)
};

const MIN_ADDED = {
    usecase: 2,
    capability: 2,
    process: 2,
    sequence: 2,
    state: 1,
    decision: 1
};

const { log, arr, uniq, cut, norm, same } = C;

const DIAGRAMS = {
    usecase: {
        name: 'use case',
        file: '01_use_case_diagram.md',
        title: 'Use Case Diagram'
    },
    process: {
        name: 'process',
        file: '02_business_process_bpmn.md',
        title: 'BPMN-style Business Process Diagram'
    },
    sequence: {
        name: 'sequence',
        file: '03_sequence_diagram.md',
        title: 'Sequence Diagrams'
    },
    state: {
        name: 'state',
        file: '04_state_machine_diagrams.md',
        title: 'State Machine Diagrams'
    },
    decision: {
        name: 'decision',
        file: '05_decision_table_dmn.md',
        title: 'Decision Table / DMN'
    }
};

function diagramKey(name) {
    const t = String(name || '').toLowerCase().replace(/[^a-z]/g, '');

    if (t === 'all') return 'all';
    if (/^usecase/.test(t)) return 'usecase';
    if (/^(process|bpmn|businessprocess)/.test(t)) return 'process';
    if (/^sequence/.test(t)) return 'sequence';
    if (/^state/.test(t)) return 'state';
    if (/^(decision|dmn)/.test(t)) return 'decision';

    throw new Error(`Unknown diagram "${name}".`);
}

function parseArgs(argv) {
    const o = {
        rerun: false,
        failed: false,
        status: false,
        render: false,
        help: false,
        fast: false,
        diagram: null,
        unit: null,
        limit: null
    };

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];

        const val = () => {
            const v = argv[++i];
            if (v === undefined || v.startsWith('--')) {
                throw new Error(`${a} needs a value`);
            }
            return v;
        };

        if (a === '--rerun') o.rerun = true;
        else if (a === '--failed') o.failed = true;
        else if (a === '--status') o.status = true;
        else if (a === '--render') o.render = true;
        else if (a === '--fast') o.fast = true;
        else if (a === '--help' || a === '-h') o.help = true;
        else if (a === '--diagram') o.diagram = diagramKey(val());
        else if (a === '--unit') o.unit = val().toUpperCase();
        else if (a === '--limit') o.limit = Number(val());
        else throw new Error(`Unknown option ${a}`);
    }

    if (o.rerun && !o.diagram && !o.unit && !o.failed) {
        throw new Error('--rerun needs --diagram, --unit or --failed');
    }

    return o;
}

const USAGE = `Usage: node 8.0.13.DiagramsAI.js [options]

  --fast
  --diagram "use case"
  --diagram "process"
  --diagram "sequence"
  --diagram "state"
  --diagram "decision"
  --diagram "all"
  --rerun
  --failed
  --unit STATE-2
  --limit 2
  --status
  --render
  --help

Examples:
  node 8.0.13.DiagramsAI.js --diagram "use case"
  node 8.0.13.DiagramsAI.js --rerun --diagram "state"
  node 8.0.13.DiagramsAI.js --rerun --failed
  node 8.0.13.DiagramsAI.js --status
  node 8.0.13.DiagramsAI.js --render
`;

// ============================================================
// LOCAL MODEL RUNNER
// ============================================================

function runLocal(label, prompt, maxTokens) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let out = '';

        const args = [
            '-hf', MODEL,
            '-c', String(SETTINGS.context),
            '-n', String(maxTokens),
            '-t', String(SETTINGS.threads),
            '-b', String(SETTINGS.llamaBatch),
            '-ngl', '0',
            '--temp', String(SETTINGS.temperature),
            '--reasoning', 'off',
            '--no-display-prompt',
            '--simple-io',
            '--log-disable',
            '-st',
            '-p', prompt
        ];

        const child = spawn(LLAMA_CLI, args, {
            cwd: ROOT,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        const hb = setInterval(() => {
            log(`${label}: ${((Date.now() - started) / 1000).toFixed(0)}s, ${out.length} bytes`);
        }, SETTINGS.heartbeatMs);

        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(new Error('Model execution timed out'));
        }, SETTINGS.timeoutMs);

        child.stdout.on('data', d => {
            out += d.toString();
        });

        child.on('error', e => {
            clearInterval(hb);
            clearTimeout(timeout);
            reject(e);
        });

        child.on('close', () => {
            clearInterval(hb);
            clearTimeout(timeout);
            resolve(out);
        });
    });
}

let runner = runLocal;

const setRunner = fn => {
    runner = fn;
};

const NO_THINK = '<think>\n\n</think>\n\n';

function extractJson(body) {
    const start = body.indexOf('{');

    if (start < 0) {
        throw new Error('No JSON object in model output');
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < body.length; i++) {
        const ch = body[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }

        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) {
            return JSON.parse(body.slice(start, i + 1));
        }
    }

    throw new Error('Unterminated JSON');
}

function parseLoose(raw) {
    const body = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '');

    try {
        return extractJson(body);
    } catch (e) {
        if (!/unterminated/i.test(e.message)) throw e;
    }

    const start = body.indexOf('{');
    if (start < 0) throw new Error('No JSON object in model output');

    const source = body.slice(start);
    const stack = [];
    const snapshots = [];

    let inString = false;
    let escaped = false;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }

        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
        else if (ch === ',') {
            snapshots.push({
                pos: i,
                stack: stack.slice()
            });
        }
    }

    for (let i = snapshots.length - 1; i >= Math.max(0, snapshots.length - 600); i--) {
        const snap = snapshots[i];
        const closers = snap.stack.slice().reverse()
            .map(x => x === '{' ? '}' : ']')
            .join('');

        try {
            return JSON.parse(source.slice(0, snap.pos) + closers);
        } catch {
            // Try the preceding complete JSON element.
        }
    }

    throw new Error('Model output could not be parsed or salvaged');
}

async function ask(label, promptFn, tokens, apply) {
    let hint = '';
    let error = '';

    for (let attempt = 0; attempt <= SETTINGS.retries; attempt++) {
        try {
            const raw = await runner(
                `${label} try ${attempt + 1}`,
                promptFn(hint),
                tokens
            );

            return {
                ok: true,
                value: apply(parseLoose(raw), attempt === SETTINGS.retries)
            };
        } catch (e) {
            hint = e.message;
            error = e.message;
            log(`${label} try ${attempt + 1} rejected: ${hint}`);
        }
    }

    return { ok: false, error };
}

// ============================================================
// SHARED HELPERS
// ============================================================

const clean = (s, n = 80) =>
    cut(String(s ?? '').replace(/\s+/g, ' ').trim(), n);

const bool = v =>
    v === true || /^true$/i.test(String(v));

const T = s => String(s ?? '').trim();

const eq = (a, b) => norm(a) === norm(b);

const clone = o => JSON.parse(JSON.stringify(o));

const parts = s => String(s ?? '').split('|').map(T);

const items = v => arr(v).map(x =>
    typeof x === 'string'
        ? x
        : x && typeof x === 'object'
            ? Object.values(x).map(T).join('|')
            : String(x)
);

const nextId = (list, prefix) => {
    let n = list.length + 1;

    while (list.some(x => x.id === `${prefix}${n}`)) n++;

    return `${prefix}${n}`;
};

const findBy = (list, ref, key) =>
    list.find(x => x.id === T(ref)) ||
    list.find(x => eq(x[key], ref)) ||
    list.find(x => same(x[key], ref));

function withIds(list, prefix, cap) {
    const seen = new Set();

    return arr(list).slice(0, cap).map((x, i) => {
        let id = x && x.id !== undefined && String(x.id).trim()
            ? String(x.id).trim()
            : `${prefix}${i + 1}`;

        while (seen.has(id)) id = `${id}_${i + 1}`;

        seen.add(id);

        return { ...x, id };
    });
}

const resolver = list => ref => {
    const r = String(ref ?? '').trim();

    const hit =
        list.find(x => x.id === r) ||
        list.find(x => x.name && same(x.name, r)) ||
        list.find(x => x.label && same(x.label, r));

    return hit ? hit.id : null;
};

// ============================================================
// USE CASE VALIDATION
// ============================================================

function validateUseCase(raw, fallbackSystem) {
    const actors = withIds(raw.actors, 'a', 18)
        .map(a => ({
            id: a.id,
            name: clean(a.name, 60),
            kind: /system|automat/i.test(a.kind)
                ? 'system'
                : /external|third|organi[sz]ation/i.test(a.kind)
                    ? 'external'
                    : 'internal',
            inferred: bool(a.inferred)
        }))
        .filter(a => a.name);

    const useCases = withIds(raw.use_cases, 'u', 40)
        .map(u => ({
            id: u.id,
            name: clean(u.name, 70),
            inferred: bool(u.inferred)
        }))
        .filter(u => u.name);

    const ra = resolver(actors);
    const ru = resolver(useCases);

    const links = [];

    arr(raw.links).forEach(l => {
        const actor = ra(l.actor);
        const useCase = ru(l.use_case);

        if (
            actor &&
            useCase &&
            !links.some(x => x.actor === actor && x.use_case === useCase)
        ) {
            links.push({
                actor,
                use_case: useCase,
                kind: /support/i.test(l.kind) ? 'supporting' : 'primary'
            });
        }
    });

    const includes = [];

    arr(raw.includes).forEach(i => {
        const from = ru(i.from);
        const to = ru(i.to);

        if (from && to && from !== to) {
            includes.push({
                from,
                to,
                kind: /extend/i.test(i.kind) ? 'extend' : 'include'
            });
        }
    });

    if (!actors.length) throw new Error('No usable actors');
    if (useCases.length < 2) throw new Error('Need at least two use cases');
    if (!links.length) throw new Error('No valid actor/use-case links');

    return {
        title: clean(raw.title, 90),
        system_name: clean(raw.system_name, 80) || fallbackSystem,
        actors,
        use_cases: useCases,
        links,
        includes
    };
}

// ============================================================
// BPMN VALIDATION
// ============================================================

function validateProcess(raw) {
    let nodes = withIds(raw.nodes, 'n', 60)
        .map(n => ({
            id: n.id,
            label: clean(n.label, 70),
            inferred: bool(n.inferred),
            type: /start/i.test(n.type)
                ? 'start'
                : /end|finish/i.test(n.type)
                    ? 'end'
                    : /decision|gateway/i.test(n.type)
                        ? 'decision'
                        : /exception|error/i.test(n.type)
                            ? 'exception'
                            : 'task',
            lane: clean(n.lane, 50)
        }))
        .filter(n => n.label || n.type === 'start' || n.type === 'end');

    nodes.forEach(n => {
        if (!n.label) {
            n.label = n.type === 'start' ? 'Start' : 'End';
        }

        if (['start', 'end'].includes(n.type)) n.lane = '';
        else if (!n.lane) n.lane = 'Unassigned';
    });

    const firstStart = nodes.find(n => n.type === 'start');

    nodes = nodes.filter(n => n.type !== 'start' || n === firstStart);

    const resolve = resolver(nodes);
    let flows = [];

    arr(raw.flows).forEach(f => {
        const from = resolve(f.from);
        const to = resolve(f.to);

        if (
            !from ||
            !to ||
            from === to ||
            flows.some(x => x.from === from && x.to === to)
        ) return;

        const target = nodes.find(n => n.id === to);

        flows.push({
            from,
            to,
            label: clean(f.label, 40),
            kind: /exception|fail/i.test(f.kind) ||
                (target && target.type === 'exception')
                ? 'exception'
                : 'normal'
        });
    });

    nodes = nodes.filter(n =>
        flows.some(f => f.from === n.id || f.to === n.id)
    );

    flows = flows.filter(f =>
        nodes.some(n => n.id === f.from) &&
        nodes.some(n => n.id === f.to)
    );

    if (nodes.filter(n => n.type === 'task').length < 3) {
        throw new Error('Need at least three connected task nodes');
    }

    if (!nodes.some(n => n.type === 'start')) {
        const first =
            nodes.find(n => !flows.some(f => f.to === n.id) && n.type !== 'exception') ||
            nodes[0];

        nodes.unshift({
            id: 'start',
            type: 'start',
            label: 'Start',
            lane: ''
        });

        flows.unshift({
            from: 'start',
            to: first.id,
            label: '',
            kind: 'normal'
        });
    }

    if (!nodes.some(n => n.type === 'end')) {
        const last =
            [...nodes].reverse().find(n =>
                n.type === 'task' && !flows.some(f => f.from === n.id)
            ) ||
            [...nodes].reverse().find(n => n.type === 'task');

        nodes.push({
            id: 'finish',
            type: 'end',
            label: 'End',
            lane: ''
        });

        flows.push({
            from: last.id,
            to: 'finish',
            label: '',
            kind: 'normal'
        });
    }

    // Exception nodes must have an explicit outgoing outcome.
    // Do not silently leave an exception branch dangling.
    const danglingExceptions = nodes.filter(n =>
        n.type === 'exception' &&
        !flows.some(f => f.from === n.id)
    );

    if (danglingExceptions.length) {
        let exceptionEnd = nodes.find(n => n.id === 'exception_end');

        if (!exceptionEnd) {
            exceptionEnd = {
                id: 'exception_end',
                type: 'end',
                label: 'Exception outcome',
                lane: ''
            };

            nodes.push(exceptionEnd);
        }

        danglingExceptions.forEach(n => {
            flows.push({
                from: n.id,
                to: exceptionEnd.id,
                label: 'Exception outcome',
                kind: 'exception'
            });
        });
    }

    return {
        title: clean(raw.title, 90),
        nodes,
        flows
    };
}

// ============================================================
// SEQUENCE VALIDATION
// ============================================================

function validateSequence(raw) {
    const participants = withIds(raw.participants, 'p', 12)
        .map(p => ({
            id: p.id,
            name: clean(p.name, 40),
            kind: /participant|system/i.test(p.kind)
                ? 'participant'
                : 'actor',
            inferred: bool(p.inferred)
        }))
        .filter(p => p.name);

    if (participants.length < 2) {
        throw new Error('Need at least two participants');
    }

    const rp = resolver(participants);
    const steps = [];
    let depth = 0;

    arr(raw.steps).slice(0, 90).forEach(s => {
        const type = /note/i.test(s.type)
            ? 'note'
            : /^else/i.test(s.type)
                ? 'else'
                : /^alt/i.test(s.type)
                    ? 'alt'
                    : /^end/i.test(s.type)
                        ? 'end'
                        : 'message';

        const inferred = bool(s.inferred);

        if (type === 'message') {
            const from = rp(s.from);
            const to = rp(s.to);

            if (!from || !to || !clean(s.text)) return;

            steps.push({
                type,
                from,
                to,
                text: clean(s.text, 80),
                style: from === to
                    ? 'self'
                    : /dash|return|async|reply/i.test(s.style)
                        ? 'dashed'
                        : 'sync',
                inferred
            });
        } else if (type === 'note') {
            const over = uniq(arr(s.over).map(rp));

            if (!over.length || !clean(s.text)) return;

            steps.push({
                type,
                over,
                text: clean(s.text, 90),
                inferred
            });
        } else if (type === 'alt') {
            depth++;
            steps.push({
                type,
                text: clean(s.text, 60) || 'Condition',
                inferred
            });
        } else if (type === 'else') {
            if (depth) {
                steps.push({
                    type,
                    text: clean(s.text, 60) || 'Otherwise',
                    inferred
                });
            }
        } else if (type === 'end' && depth) {
            depth--;
            steps.push({ type });
        }
    });

    while (depth-- > 0) steps.push({ type: 'end' });

    if (steps.filter(s => s.type === 'message').length < 2) {
        throw new Error('Need at least two valid messages');
    }

    return {
        title: clean(raw.title, 90),
        participants,
        steps
    };
}

// ============================================================
// STATE MACHINE VALIDATION
// ============================================================

function validateState(raw, objectName) {
    const states = withIds(raw.states, 's', 14)
        .map(s => ({
            id: s.id,
            name: clean(s.name, 45),
            inferred: bool(s.inferred)
        }))
        .filter(s => s.name);

    if (states.length < 2) {
        throw new Error('Need at least two object states');
    }

    const rs = resolver(states);
    const transitions = [];

    arr(raw.transitions).slice(0, 24).forEach(t => {
        const from = rs(t.from);
        const to = rs(t.to);

        if (from && to && from !== to) {
            transitions.push({
                from,
                to,
                event: clean(t.event, 45) || 'moves',
                guard: clean(t.guard, 45),
                inferred: bool(t.inferred)
            });
        }
    });

    if (!transitions.length) {
        throw new Error('No valid state transitions');
    }

    const initial = rs(raw.initial) || states[0].id;

    let finals = uniq(arr(raw.finals).map(rs));

    if (!finals.length) {
        finals = states
            .filter(s =>
                !transitions.some(t => t.from === s.id) &&
                s.id !== initial
            )
            .map(s => s.id)
            .slice(0, 3);
    }

    if (!finals.length) {
        finals = [states[states.length - 1].id];
    }

    const notes = arr(raw.notes)
        .map(n => ({
            state: rs(n.state),
            text: clean(n.text, 90)
        }))
        .filter(n => n.state && n.text)
        .slice(0, 3);

    return {
        object: clean(raw.object, 60) || objectName,
        purpose: clean(raw.purpose, 120),
        states,
        transitions,
        notes,
        initial,
        finals
    };
}

// ============================================================
// DECISION TABLE VALIDATION
// ============================================================

const HIT = {
    U: 'U (Unique)',
    A: 'A (Any)',
    P: 'P (Priority)',
    F: 'F (First)',
    R: 'R (Rule order)',
    O: 'O (Output order)',
    C: 'C (Collect)'
};

function validateDecision(raw, model) {
    const inputs = arr(raw.inputs)
        .map(x => clean(typeof x === 'object' ? x.name : x, 40))
        .filter(Boolean)
        .slice(0, 4);

    const outputs = arr(raw.outputs)
        .map(x => clean(typeof x === 'object' ? x.name : x, 40))
        .filter(Boolean)
        .slice(0, 3);

    if (!inputs.length || !outputs.length) {
        throw new Error('Need input and output columns');
    }

    const refs = new Map(model.rules.map(r => [r.ref, r]));

    const fit = (list, n) =>
        Array.from({ length: n }, (_, i) =>
            clean(arr(list)[i], 140) || '-'
        );

    const seen = new Set();

    const rows = arr(raw.rows)
        .slice(0, 40)
        .map(r => {
            const base = refs.get(String(r.rule || '').trim());

            return {
                when: fit(r.when, inputs.length),
                then: fit(r.then, outputs.length),
                rule: base ? base.ref : '',
                type: base ? base.type : '',
                severity: base ? base.severity : '',
                enforcement: base ? base.enforcement : '',
                basis: bool(r.inferred)
                    ? 'inferred'
                    : base
                        ? base.basis
                        : '',
                inferred: bool(r.inferred)
            };
        })
        .filter(r =>
            r.when.some(x => x !== '-') ||
            r.then.some(x => x !== '-')
        )
        // Remove only exact duplicate rows within this table.
        // The same rule may legitimately appear in another table.
        .filter(r => {
            const key = JSON.stringify([
                r.rule,
                r.when.map(norm),
                r.then.map(norm)
            ]);

            if (seen.has(key)) return false;

            seen.add(key);
            return true;
        });

    if (rows.length < 2) {
        throw new Error('Need at least two distinct decision rows');
    }

    const key = String(raw.hit_policy || 'C').trim().toUpperCase()[0];

    return {
        name: clean(raw.name, 70),
        subject: clean(raw.subject, 70),
        hit_policy: HIT[key] || HIT.C,
        inputs,
        outputs,
        rows
    };
}

// ============================================================
// USE CASE DELTA MERGE
// ============================================================

function applyUseCase(base, d, model) {
    const spec = clone(base);
    let added = 0;

    const kindOf = k =>
        /system|automat/i.test(k)
            ? 'system'
            : /external|third|organi[sz]ation/i.test(k)
                ? 'external'
                : 'internal';

    items(d.drop).slice(0, 3).forEach(ref => {
        const actor = findBy(spec.actors, ref, 'name');

        if (actor && spec.actors.length > 2) {
            spec.actors = spec.actors.filter(x => x !== actor);
            spec.links = spec.links.filter(l => l.actor !== actor.id);
            return;
        }

        const useCase = findBy(spec.use_cases, ref, 'name');

        if (useCase && spec.use_cases.length > 3) {
            spec.use_cases = spec.use_cases.filter(x => x !== useCase);
            spec.links = spec.links.filter(l => l.use_case !== useCase.id);
            spec.includes = (spec.includes || []).filter(i =>
                i.from !== useCase.id && i.to !== useCase.id
            );
        }
    });

    items(d.actors).forEach(s => {
        const [name, kind] = parts(s);

        if (!name || spec.actors.some(a => eq(a.name, name))) return;
        if (spec.actors.length >= 18) return;

        spec.actors.push({
            id: nextId(spec.actors, 'a'),
            name: clean(name, 60),
            kind: kindOf(kind),
            inferred: true
        });

        added++;
    });

    // Merge actor aliases into the canonical actor.
    // Format: "alias|canonical actor".
    const actorAliases = new Map();

    items(d.actor_aliases).forEach(s => {
        const [alias, canonical] = parts(s);

        if (!alias || !canonical) return;

        const aliasActor = findBy(spec.actors, alias, 'name');
        const canonicalActor = findBy(spec.actors, canonical, 'name');

        if (!aliasActor || !canonicalActor || aliasActor === canonicalActor) return;

        actorAliases.set(aliasActor.name, canonicalActor.name);

        spec.links = spec.links.map(l =>
            l.actor === aliasActor.id
                ? { ...l, actor: canonicalActor.id }
                : l
        );

        spec.actors = spec.actors.filter(a => a !== aliasActor);
    });

    // Rename incorrect baseline use-case labels without changing their IDs.
    // Format: "existing ID or name|correct use-case name".
    items(d.rename).forEach(s => {
        const [ref, newName] = parts(s);
        const useCase = findBy(spec.use_cases, ref, 'name');

        if (!useCase || !newName) return;

        const duplicate = spec.use_cases.some(x =>
            x !== useCase && eq(x.name, newName)
        );

        if (duplicate) return;

        useCase.name = clean(newName, 70);
        useCase.inferred = true;
        added++;
    });

    items(d.use_cases).forEach(s => {
        const [name] = parts(s);

        if (!name || spec.use_cases.some(u => eq(u.name, name))) return;
        if (spec.use_cases.length >= 40) return;

        spec.use_cases.push({
            id: nextId(spec.use_cases, 'u'),
            name: clean(name, 70),
            inferred: true
        });

        added++;
    });

    items(d.links).forEach(s => {
        const [actorName, useCaseName, kind] = parts(s);

        const resolvedActorName = actorAliases.get(actorName) || actorName;

        const actor = findBy(spec.actors, resolvedActorName, 'name');
        const useCase = findBy(spec.use_cases, useCaseName, 'name');

        if (
            actor &&
            useCase &&
            !spec.links.some(l =>
                l.actor === actor.id && l.use_case === useCase.id
            )
        ) {
            spec.links.push({
                actor: actor.id,
                use_case: useCase.id,
                kind: /support/i.test(kind) ? 'supporting' : 'primary'
            });

            added++;
        }
    });

    spec.includes = spec.includes || [];

    items(d.includes).forEach(s => {
        const [fromName, toName, kind] = parts(s);

        const from = findBy(spec.use_cases, fromName, 'name');
        const to = findBy(spec.use_cases, toName, 'name');

        if (
            from &&
            to &&
            from !== to &&
            !spec.includes.some(i =>
                i.from === from.id && i.to === to.id
            )
        ) {
            spec.includes.push({
                from: from.id,
                to: to.id,
                kind: /extend/i.test(kind) ? 'extend' : 'include'
            });

            added++;
        }
    });

    return {
        spec: validateUseCase(spec, model.systemName),
        added
    };
}

// ============================================================
// FUNCTIONAL CAPABILITY VIEW
// ============================================================

function applyCapabilities(base, d, model) {
    const known = new Map(model.brs.map(b => [b.id, b]));
    const assigned = new Set();
    const caps = [];

    arr(d.capabilities).forEach(c => {
        let name;
        let members;

        if (typeof c === 'string') {
            const [n, m] = parts(c);
            name = n;
            members = String(m || '').split(/[,;\s]+/);
        } else {
            name = c && c.name;
            members = arr(c && c.members);
        }

        const ids = uniq(
            members
                .map(m => T(m).toUpperCase())
                .filter(m => known.has(m) && !assigned.has(m))
        );

        if (!clean(name) || !ids.length) return;

        ids.forEach(id => assigned.add(id));

        caps.push({
            name: clean(name, 70),
            ids
        });
    });

    if (caps.length < 2) {
        throw new Error('Need at least two functional capabilities');
    }

    const left = model.brs.filter(b => !assigned.has(b.id));

    if (left.length) {
        const sim = C.crossSimilarity(
            left.map(b => `${b.name} ${b.requirement}`),
            caps.map(c =>
                `${c.name} ${c.ids.map(id => known.get(id).name).join(' ')}`
            )
        );

        left.forEach((b, i) => {
            caps[sim[i].indexOf(Math.max(...sim[i]))].ids.push(b.id);
        });
    }

    const actors = [];
    const actorId = new Map();
    const links = [];

    const useCases = caps.map((c, i) => ({
        id: `u${i + 1}`,
        name: c.name,
        inferred: true
    }));

    caps.forEach((c, i) => {
        uniq(c.ids.flatMap(id => known.get(id).stakeholders)).forEach(s => {
            if (C.actorKind(model, s) === 'system') return;

            if (!actorId.has(s)) {
                actorId.set(s, `a${actorId.size + 1}`);

                actors.push({
                    id: actorId.get(s),
                    name: s,
                    kind: C.actorKind(model, s)
                });
            }

            links.push({
                actor: actorId.get(s),
                use_case: `u${i + 1}`,
                kind: 'primary'
            });
        });
    });

    const spec = {
        title: 'Functional capabilities',
        system_name: model.systemName,
        actors,
        use_cases: useCases,
        links,
        includes: []
    };

    return {
        spec: validateUseCase(spec, model.systemName),
        added: caps.length
    };
}

// ============================================================
// PROCESS DELTA MERGE
// ============================================================

function applyProcess(base, d) {
    const spec = clone(base);
    let added = 0;

    const nodeRef = r =>
        spec.nodes.find(n => n.id === T(r)) ||
        spec.nodes.find(n => eq(n.label, r)) ||
        spec.nodes.find(n => same(n.label, r));

    items(d.drop).slice(0, 3).forEach(r => {
        const n = nodeRef(r);

        if (n && !['start', 'end'].includes(n.type)) {
            spec.nodes = spec.nodes.filter(x => x !== n);
            spec.flows = spec.flows.filter(f =>
                f.from !== n.id && f.to !== n.id
            );
        }
    });

    items(d.cut).slice(0, 6).forEach(s => {
        const [a, b] = parts(s);
        const A = nodeRef(a);
        const B = nodeRef(b);

        if (A && B) {
            spec.flows = spec.flows.filter(f =>
                !(f.from === A.id && f.to === B.id)
            );
        }
    });

    const fresh = new Set();

    items(d.steps).forEach(s => {
        const [label, lane, type] = parts(s);

        if (!label || spec.nodes.some(n => eq(n.label, label))) return;
        if (spec.nodes.length >= 56) return;

        const id = nextId(spec.nodes, 'i');

        spec.nodes.push({
            id,
            type: /decision|gateway/i.test(type)
                ? 'decision'
                : /exception|error/i.test(type)
                    ? 'exception'
                    : 'task',
            lane: clean(lane, 50) || 'Unassigned',
            label: clean(label, 70),
            inferred: true
        });

        fresh.add(id);
    });

    items(d.flows).forEach(s => {
        const [a, b, label, kind] = parts(s);
        const A = nodeRef(a);
        const B = nodeRef(b);

        if (!A || !B || A === B) return;

        if (spec.flows.some(f => f.from === A.id && f.to === B.id)) return;

        spec.flows.push({
            from: A.id,
            to: B.id,
            label: clean(label, 40),
            kind: /exception|fail/i.test(kind) || B.type === 'exception'
                ? 'exception'
                : 'normal'
        });

        added++;
    });

    spec.nodes = spec.nodes.filter(n =>
        !fresh.has(n.id) ||
        spec.flows.some(f => f.from === n.id || f.to === n.id)
    );

    added += spec.nodes.filter(n => fresh.has(n.id)).length;

    return {
        spec: validateProcess(spec),
        added
    };
}

// ============================================================
// SEQUENCE DELTA MERGE
// ============================================================

function applySequence(base, d) {
    const spec = clone(base);
    let added = 0;

    const pRef = r =>
        spec.participants.find(p => p.id === T(r)) ||
        spec.participants.find(p => eq(p.name, r)) ||
        spec.participants.find(p => same(p.name, r));

    items(d.participants).forEach(s => {
        const [name, kind] = parts(s);

        if (!name || spec.participants.some(p => eq(p.name, name))) return;
        if (spec.participants.length >= 12) return;

        spec.participants.push({
            id: nextId(spec.participants, 'q'),
            name: clean(name, 40),
            kind: /participant|system/i.test(kind) ? 'participant' : 'actor',
            inferred: true
        });

        added++;
    });

    const dropSet = new Set(
        items(d.drop)
            .slice(0, 4)
            .map(x => Number(String(x).replace(/\D/g, '')))
            .filter(n =>
                n >= 1 &&
                n <= spec.steps.length &&
                ['message', 'note'].includes(spec.steps[n - 1].type)
            )
    );

    const insertions = new Map();

    items(d.steps).forEach(s => {
        const [after, type, a, b, c, e] = parts(s);

        const at = Math.min(
            Math.max(Number(after) || 0, 0),
            spec.steps.length
        );

        const t = String(type).toLowerCase();
        let step = null;

        if (/^(msg|message)/.test(t)) {
            const from = pRef(a);
            const to = pRef(b);

            if (from && to && clean(c)) {
                step = {
                    type: 'message',
                    from: from.id,
                    to: to.id,
                    text: clean(c, 80),
                    style: from.id === to.id
                        ? 'self'
                        : /dash|return|async|reply/i.test(e)
                            ? 'dashed'
                            : 'sync',
                    inferred: true
                };
            }
        } else if (/^note/.test(t)) {
            const participant = pRef(a);

            if (participant && clean(b)) {
                step = {
                    type: 'note',
                    over: [participant.id],
                    text: clean(b, 90),
                    inferred: true
                };
            }
        } else if (/^alt/.test(t) && clean(a)) {
            step = {
                type: 'alt',
                text: clean(a, 60),
                inferred: true
            };
        } else if (/^else/.test(t)) {
            step = {
                type: 'else',
                text: clean(a, 60) || 'Otherwise',
                inferred: true
            };
        } else if (/^end/.test(t)) {
            step = { type: 'end' };
        }

        if (!step) return;

        if (!insertions.has(at)) insertions.set(at, []);

        insertions.get(at).push(step);

        if (['message', 'note', 'alt'].includes(step.type)) {
            added++;
        }
    });

    const steps = [...(insertions.get(0) || [])];

    spec.steps.forEach((step, i) => {
        if (!dropSet.has(i + 1)) steps.push(step);
        steps.push(...(insertions.get(i + 1) || []));
    });

    spec.steps = steps;

    return {
        spec: validateSequence(spec),
        added
    };
}

// ============================================================
// STATE MACHINE MERGE
// ============================================================

function applyMachine(base, machine, objectName) {
    const spec = clone(base);

    spec.object = objectName;
    spec.states = spec.states || [];
    spec.transitions = spec.transitions || [];
    spec.notes = spec.notes || [];

    let added = 0;

    const stateRef = ref =>
        spec.states.find(s => s.id === T(ref)) ||
        spec.states.find(s => eq(s.name, ref)) ||
        spec.states.find(s => same(s.name, ref));

    const addState = name => {
        const n = clean(name, 45);

        if (!n) return null;

        const existing = stateRef(n);
        if (existing) return existing;

        if (spec.states.length >= 14) return null;

        const state = {
            id: nextId(spec.states, 's'),
            name: n,
            inferred: true
        };

        spec.states.push(state);
        added++;

        return state;
    };

    items(machine.states).forEach(s => {
        addState(parts(s)[0]);
    });

    items(machine.transitions).forEach(t => {
        const [fromName, toName, event, guard] = parts(t);

        const from = addState(fromName);
        const to = addState(toName);

        if (!from || !to || from === to) return;
        if (spec.transitions.length >= 24) return;

        if (spec.transitions.some(x =>
            x.from === from.id &&
            x.to === to.id &&
            eq(x.event, event)
        )) return;

        spec.transitions.push({
            from: from.id,
            to: to.id,
            event: clean(event, 45) || 'moves',
            guard: clean(guard, 45),
            inferred: true
        });

        added++;
    });

    const initial = machine.initial
        ? stateRef(machine.initial)
        : null;

    spec.initial = initial
        ? initial.id
        : (spec.states[0] || {}).id;

    const finals = uniq(
        arr(machine.finals)
            .map(x => (stateRef(x) || {}).id)
            .filter(Boolean)
    );

    spec.finals = finals.length
        ? finals
        : spec.states
            .filter(s =>
                !spec.transitions.some(t => t.from === s.id) &&
                s.id !== spec.initial
            )
            .map(s => s.id)
            .slice(0, 3);

    return { spec, added };
}

function applyStates(u, d) {
    const specs = [];
    const incomplete = [];
    let added = 0;

    const machines = arr(d.machines);

    u.subjects.forEach(subject => {
        // IMPORTANT:
        // Do not use C.buildStateSpecs() as a baseline here.
        // That function derives states from process stages, which are not
        // necessarily states of the business object.
        const empty = {
            object: subject,
            states: [],
            transitions: [],
            notes: [],
            initial: '',
            finals: []
        };

        const machine =
            machines.find(x => x && eq(x.object, subject)) ||
            machines.find(x => x && same(x.object, subject));

        if (!machine) {
            incomplete.push(subject);
            return;
        }

        try {
            const result = applyMachine(empty, machine, subject);
            const validated = validateState(result.spec, subject);

            specs.push(validated);
            added += result.added;
        } catch {
            incomplete.push(subject);
        }
    });

    if (!specs.length) {
        throw new Error('No valid object lifecycle was generated');
    }

    return {
        spec: specs,
        added,
        incomplete
    };
}

// ============================================================
// DMN ROW PARSING AND MERGE
// ============================================================

function parseRow(value) {
    let str = T(value);
    let rule = '';

    const match = /\[(R-\d+)\]\s*$/.exec(str);

    if (match) {
        rule = match[1];
        str = str.slice(0, match.index).trim();
    }

    const idx = str.indexOf('=>');

    if (idx < 0) return null;

    return {
        when: str.slice(0, idx).split('|').map(T),
        then: str.slice(idx + 2).split('|').map(T),
        rule
    };
}

function applyDecisions(u, d, model) {
    const tables = [];
    const incomplete = [];
    let added = 0;

    const raw = arr(d.tables);
    const known = new Set(model.rules.map(r => r.ref));

    u.subjects.forEach((subject, i) => {
        const table =
            raw.find(x => x && (eq(x.subject, subject) || same(x.subject, subject))) ||
            raw[i];

        const base = u.baseline.tables[subject];

        if (!table) {
            if (base) tables.push(base);
            incomplete.push(subject);
            return;
        }

        const seen = new Set();

        const rows = items(table.rows)
            .map(parseRow)
            .filter(Boolean)
            .filter(r => {
                const key = JSON.stringify([
                    r.rule,
                    r.when.map(norm),
                    r.then.map(norm)
                ]);

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            });

        rows.forEach(r => {
            r.inferred = !r.rule || !known.has(r.rule);
        });

        try {
            const spec = validateDecision({
                ...table,
                subject,
                rows
            }, model);

            tables.push(spec);

            added += spec.rows.filter(r => r.inferred).length;
        } catch {
            if (base) tables.push(base);
            incomplete.push(subject);
        }
    });

    if (!tables.length) {
        throw new Error('No valid decision table was generated');
    }

    return {
        spec: tables,
        added,
        incomplete
    };
}

// ============================================================
// UNIT GENERATION
// ============================================================

const chunk = (list, size) => {
    if (!size || size <= 0) return [list];

    const out = [];

    for (let i = 0; i < list.length; i += size) {
        out.push(list.slice(i, i + size));
    }

    return out;
};

function buildUnits(model, o = {}) {
    const units = [];

    const useCases = C.buildUseCaseSpecs(model);

    units.push({
        id: 'USECASE-1',
        diagram: 'usecase',
        kind: 'usecase',
        title: 'Use cases from business activities',
        baseline: useCases[0],
        focus: 'Identify actor goals, use cases, actor associations and valid include/extend relationships.'
    });

    if (!o.fast && useCases[1]) {
        units.push({
            id: 'USECASE-2',
            diagram: 'usecase',
            kind: 'capability',
            title: 'Functional capabilities',
            baseline: useCases[1],
            focus: 'Group business requirements into coherent functional capabilities.'
        });
    }

    units.push({
        id: 'PROCESS-1',
        diagram: 'process',
        kind: 'process',
        title: 'Main end-to-end process',
        baseline: C.buildProcessSpec(model),
        focus: 'Improve the end-to-end process, decisions, branches and exception outcomes.'
    });

    if (!o.fast) {
        units.push({
            id: 'PROCESS-2',
            diagram: 'process',
            kind: 'process',
            title: 'Exception paths',
            baseline: C.buildProcessSpec(model, {
                ruleTypes: ['Exception handling'],
                title: 'Exception paths'
            }),
            focus: 'Describe how failures, rejections, cancellations and exceptions are detected, handled, corrected and concluded.'
        });
    }

    const scenarios = C.sequenceScenarios(model);

    (o.fast ? scenarios.slice(0, 1) : scenarios).forEach((scenario, i) => {
        units.push({
            id: `SEQ-${i + 1}`,
            diagram: 'sequence',
            kind: 'sequence',
            title: scenario.title,
            baseline: C.buildSequenceSpec(model, scenario),
            focus: scenario.kind === 'exception'
                ? `Interactions when something goes wrong in ${scenario.title}.`
                : `Interactions, handovers, confirmations, checks and alternatives for ${scenario.title}.`
        });
    });

    // Empty state baselines: object lifecycle states must be derived from
    // object-specific lifecycle evidence, not process-stage names.
    chunk(
        model.objects.map(x => x.name),
        SETTINGS.stateObjectsPerUnit
    ).forEach((names, i) => {
        units.push({
            id: `STATE-${i + 1}`,
            diagram: 'state',
            kind: 'state',
            subjects: names,
            title: names.length > 3
                ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
                : names.join(', '),
            baseline: {
                machines: Object.fromEntries(
                    names.map(name => [
                        name,
                        {
                            object: name,
                            states: [],
                            transitions: [],
                            notes: [],
                            initial: '',
                            finals: []
                        }
                    ])
                )
            },
            focus: 'Generate the lifecycle of each business object. Use object conditions as states, business events as transitions, and applicable rules as guards. Do not use process stages or activities as object states.'
        });
    });

    const decisions = C.buildDecisionSpecs(model);

    const groups = chunk(
        decisions.tables.slice(0, SETTINGS.decisionGroups),
        SETTINGS.decisionGroupsPerUnit
    );

    (o.fast ? groups.slice(0, 1) : groups).forEach((group, i) => {
        units.push({
            id: `DEC-${i + 1}`,
            diagram: 'decision',
            kind: 'decision',
            subjects: group.map(t => t.subject),
            title: group.map(t => t.subject).join(', '),
            baseline: {
                tables: Object.fromEntries(
                    group.map(t => [t.subject, t])
                )
            },
            focus: 'Build coherent decision tables with meaningful inputs, outputs, decision rows and applicable business rules.'
        });
    });

    return units;
}

// ============================================================
// UNIT RESULT STORAGE
// ============================================================

const inputHash = u =>
    C.shortHash(JSON.stringify([
        PROMPT_VERSION,
        u.id,
        u.title,
        u.focus,
        u.baseline
    ]));

// function unitFiles(u) {
//     try {
//         return fs.readdirSync(UNIT_DIR)
//             .filter(f =>
//                 /^\d{8}_\d{6}_/.test(f) &&
//                 f.endsWith(`_${u.id}.json`)
//             )
//             .sort()
//             .reverse()
//             .map(f => {
//                 try {
//                     return JSON.parse(
//                         fs.readFileSync(path.join(UNIT_DIR, f), 'utf8')
//                     );
//                 } catch {
//                     return null;
//                 }
//             })
//             .filter(Boolean);
//     } catch {
//         return [];
//     }
// }
function unitFiles(u) {
    try {
        return fs.readdirSync(UNIT_DIR)
            .filter(f => f.endsWith(`_${u.id}.json`))
            .map(f => {
                const fullPath = path.join(UNIT_DIR, f);

                try {
                    return {
                        data: JSON.parse(fs.readFileSync(fullPath, 'utf8')),
                        modified: fs.statSync(fullPath).mtimeMs
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => b.modified - a.modified)
            .map(x => x.data);
    } catch {
        return [];
    }
}
const bestOk = u =>
    unitFiles(u).find(r =>
        r.status === 'ok' &&
        r.input_hash === inputHash(u)
    ) || null;

function unitState(u) {
    const files = unitFiles(u);

    if (!files.length) return 'pending';

    const ok = bestOk(u);

    if (ok) {
        return arr(ok.incomplete).length ? 'partial' : 'ok';
    }

    return files.some(r => r.status === 'ok')
        ? 'stale'
        : 'failed';
}

// ============================================================
// PROMPTS
// ============================================================

const spl = (lines, label, list) => {
    if (list.length) lines.push(`${label}: ${list.join('; ')}`);
};

function contextFor(u, model) {
    const lines = [`System: ${model.systemName}`];

    const actors = () => spl(
        lines,
        'ACTORS',
        model.actors.map(a =>
            `${a.name} (${a.kind}${a.role ? ', ' + cut(a.role, 50) : ''})`
        )
    );

    const activities = count => {
        lines.push(
            'ACTIVITIES IN ORDER:',
            ...model.activities.slice(0, count).map((a, i) =>
                `${i + 1}. ${a.name} by ${a.primary}; ` +
                `supporting: ${a.supporting.join(', ') || '-'}; ` +
                `inputs: ${a.inputs.join(', ') || '-'}; ` +
                `outputs: ${a.outputs.join(', ') || '-'}`
            )
        );
    };

    const rules = list => {
        if (list.length) {
            lines.push(
                'BUSINESS RULES:',
                ...list.slice(0, 10).map(r =>
                    `- ${r.ref} ${cut(r.statement, 100)}`
                )
            );
        }
    };

    if (u.kind === 'usecase') {
        actors();
        activities(12);
    } else if (u.kind === 'capability') {
        actors();
    } else if (u.kind === 'process') {
        actors();
        activities(12);
        rules(model.rules);
    } else if (u.kind === 'sequence') {
        actors();

        spl(
            lines,
            'INFORMATION FLOWS',
            model.irs.slice(0, 8).map(r =>
                `${cut(r.label, 40)}: ${cut(r.source, 60)}`
            )
        );
    } else if (u.kind === 'state') {
        u.subjects.forEach(name => {
            const object = model.objects.find(x => x.name === name) || {};

            lines.push(
                `OBJECT ${name}: ${cut(object.purpose, 100)}; ` +
                `lifecycle: ${cut(object.lifecycle, 100)}`
            );

            const related = model.activities
                .filter(a =>
                    [...a.inputs, ...a.outputs].some(x => same(x, name))
                )
                .map(a => a.name);

            if (related.length) {
                lines.push(`Related activities: ${related.join('; ')}`);
            }
        });
    } else if (u.kind === 'decision') {
        u.subjects.forEach(subject => {
            lines.push(`DECISION SUBJECT: ${subject}`);

            const related = model.rules.filter(r =>
                same(r.object, subject) ||
                same(r.subject, subject)
            );

            rules(related);
        });
    }

    return lines.join('\n').slice(0, SETTINGS.contextChars);
}

function baselineText(u) {
    const b = u.baseline;

    if (u.kind === 'usecase') {
        return [
            `ACTORS: ${b.actors.map(a => `${a.id} ${a.name} (${a.kind})`).join('; ')}`,
            `USE CASES: ${b.use_cases.map(x => `${x.id} ${x.name}`).join('; ')}`,
            `LINKS: ${b.links.map(l => `${l.actor}>${l.use_case}`).join('; ')}`
        ].join('\n');
    }

    if (u.kind === 'capability') {
        return `BUSINESS REQUIREMENTS:\n${b.use_cases.map(x => x.name).join('\n')}`;
    }

    if (u.kind === 'process') {
        return [
            `NODES: ${b.nodes.map(n => `${n.id} ${n.type} ${n.label}`).join('; ')}`,
            `FLOWS: ${b.flows.map(f => `${f.from}>${f.to} ${f.label}`).join('; ')}`
        ].join('\n');
    }

    if (u.kind === 'sequence') {
        const name = id =>
            (b.participants.find(p => p.id === id) || { name: id }).name;

        return [
            `PARTICIPANTS: ${b.participants.map(p => p.name).join('; ')}`,
            'STEPS:',
            ...b.steps.map((s, i) =>
                `${i + 1} ${s.type === 'message'
                    ? `${name(s.from)} -> ${name(s.to)}: ${s.text}`
                    : s.type === 'note'
                        ? `NOTE ${name(s.over[0])}: ${s.text}`
                        : `${s.type} ${s.text || ''}`
                }`
            )
        ].join('\n');
    }

    if (u.kind === 'state') {
        return u.subjects.map(subject =>
            `OBJECT ${subject}: no process-stage baseline. Generate object states from its lifecycle evidence.`
        ).join('\n');
    }

    if (u.kind === 'decision') {
        return u.subjects.map(subject => {
            const table = b.tables[subject];

            return `TABLE ${subject}:\n` +
                table.rows.slice(0, 8).map(r =>
                    `${r.rule || ''} when ${r.when.join(' | ')} => ${r.then.join(' | ')}`
                ).join('\n');
        }).join('\n');
    }

    return '';
}

const COMMON = `You are a senior business analyst improving one business diagram.

The repository baseline is a starting point, not a limit and not proof.
Return only additions and corrections.
Do not repeat existing baseline elements.
Do not invent actors, interactions, object states, business rules or outcomes.
Use the supplied business evidence.
Do not use process stages as business-object states.
Do not use actor-to-self messages to represent missing system interactions.
Do not duplicate an existing actor under another name.
Use business language only.
Return only the requested JSON object.`;

const SPEC = {
    usecase: `{
"actor_aliases":["<alias>|<canonical actor>"],
"actors":["<actor name>|human or external or system"],
"use_cases":["<actor goal, not an activity or process step>"],
"rename":["<existing use case ID or name>|<correct use case goal>"],
"links":["<actor ID or canonical name>|<use case ID or name>|primary or supporting"],
"includes":["<use case>|<use case>|include or extend"],
"drop":["<incorrect baseline actor/use-case ID or name>"]
}
Use actor_aliases to reconcile duplicate identities. Use rename for incorrect labels.
Use cases must express actor goals, not activity names.`,

    capability: `{
"capabilities":[
{"name":"<functional capability>","members":["<business requirement ID>"]}
]
}
Group related requirements into meaningful capabilities.
Every business requirement ID must belong to one capability.`,

    process: `{
"steps":["<step label>|<responsible actor>|task or decision or exception"],
"flows":["<from ID or label>|<to ID or label>|<edge outcome>|normal or exception"],
"cut":["<from ID>|<to ID>"],
"drop":["<incorrect baseline node ID or label>"]
}
Represent meaningful branches and outcomes. Connect every new node.
Exception branches must reach an explicit outcome.`,

    sequence: `{
"participants":["<name>|actor or participant"],
"steps":[
"<after step number>|msg|<from>|<to>|<message>|sync or dashed",
"<after step number>|note|<participant>|<note>",
"<after step number>|alt|<condition>",
"<after step number>|else|<alternative>",
"<after step number>|end"
],
"drop":["<baseline step number>"]
}
Only use real actors and system participants supported by evidence.
Messages must represent actual communication between distinct participants.
Do not invent actor self-messages.`,

    state: `{
"machines":[
{
"object":"<business object name>",
"purpose":"<object lifecycle purpose>",
"states":["<object condition/state>"],
"transitions":["<from state>|<to state>|<business event>|<guard/business rule>"],
"initial":"<initial state>",
"finals":["<terminal state>"],
"notes":["<state>|<meaning or condition>"]
}
]
}
Return one machine per requested object.
States must be conditions of that object, not activities, workflow stages or process phases.
Use evidence to identify valid transitions and terminal/abnormal states.`,

    decision: `{
"tables":[
{
"subject":"<decision subject>",
"name":"<decision name>",
"hit_policy":"U or A or P or F or C",
"inputs":["<decision input>"],
"outputs":["<decision outcome>"],
"rows":[
"<input value> | <input value> => <outcome> [R-001]"
]
}
]
}
Create a coherent table for each subject.
Preserve applicable baseline rules.
Do not repeat identical rows within a table.
A rule may legitimately apply to more than one table.
Use meaningful input combinations and outcomes.`
};

function promptFor(u, model, hint) {
    const baseline = u.kind === 'capability'
        ? `BUSINESS REQUIREMENTS:\n${model.brs.map(b => `${b.id} ${cut(b.name, 70)}`).join('\n')}`
        : baselineText(u);

    return `<|im_start|>system
${COMMON}

Return JSON in this exact structure:
${SPEC[u.kind]}
<|im_end|>
<|im_start|>user
FOCUS:
${u.focus}

TITLE:
${u.title}

BUSINESS KNOWLEDGE:
${contextFor(u, model)}

BASELINE:
${baseline.slice(0, SETTINGS.baselineChars)}

${hint ? `PREVIOUS VALIDATION ERROR:\n${hint}\nCorrect the response.\n` : ''}

Return only JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

const tokensFor = u => ({
    usecase: 900,
    capability: 900,
    process: 1000,
    sequence: 1000,
    state: Math.min(3000, 400 + 300 * (u.subjects || []).length),
    decision: Math.min(2600, 400 + 600 * (u.subjects || []).length)
}[u.kind]);

// ============================================================
// APPLY AND VALIDATE
// ============================================================

function applyFor(u, model, d, lastTry) {
    let result;

    switch (u.kind) {
        case 'usecase':
            result = applyUseCase(u.baseline, d, model);
            break;

        case 'capability':
            result = applyCapabilities(u.baseline, d, model);
            break;

        case 'process':
            result = applyProcess(u.baseline, d);
            break;

        case 'sequence':
            result = applySequence(u.baseline, d);
            break;

        case 'state':
            result = applyStates(u, d);
            break;

        case 'decision':
            result = applyDecisions(u, d, model);
            break;

        default:
            throw new Error(`Unsupported unit kind: ${u.kind}`);
    }

    const minimum = lastTry ? 1 : MIN_ADDED[u.kind];

    if (result.added < minimum) {
        throw new Error(
            `Only ${result.added} valid new element(s) were added. ` +
            `At least ${minimum} are required.`
        );
    }

    return result;
}

// ============================================================
// RUN UNITS
// ============================================================

function selectUnits(units, o) {
    let selected = units;

    if (o.diagram && o.diagram !== 'all') {
        selected = selected.filter(u => u.diagram === o.diagram);
    }

    if (o.unit) {
        selected = selected.filter(u => u.id === o.unit);
    }

    if (o.unit && !selected.length) {
        throw new Error(`No unit ${o.unit}. Use --status to list unit IDs.`);
    }

    if (o.failed) {
        selected = selected.filter(u =>
            ['failed', 'partial'].includes(unitState(u))
        );
    }

    return selected;
}

async function runUnit(u, model) {
    const started = Date.now();

    const result = await ask(
        u.id,
        hint => promptFor(u, model, hint),
        tokensFor(u),
        (d, lastTry) => applyFor(u, model, d, lastTry)
    );

    const base = {
        unit_id: u.id,
        diagram: u.diagram,
        title: u.title,
        input_hash: inputHash(u),
        model: MODEL,
        generated_at: new Date().toISOString()
    };

    fs.mkdirSync(UNIT_DIR, { recursive: true });

    const file = path.join(
        UNIT_DIR,
        `${C.RUN_STAMP}_${u.id}.json`
    );

    const seconds = Math.round((Date.now() - started) / 1000);

    if (result.ok) {
        const value = result.value;

        fs.writeFileSync(file, JSON.stringify({
            ...base,
            status: 'ok',
            seconds,
            added: value.added,
            incomplete: value.incomplete || [],
            inferred_elements: countInferred(value.spec),
            spec: value.spec
        }, null, 2));

        log(
            `${u.id} ok in ${seconds}s: ${value.added} additions` +
            (value.incomplete && value.incomplete.length
                ? `; incomplete: ${value.incomplete.join(', ')}`
                : '')
        );

        return true;
    }

    fs.writeFileSync(file, JSON.stringify({
        ...base,
        status: 'failed',
        seconds,
        error: result.error
    }, null, 2));

    log(
        `${u.id} FAILED: ${result.error}. ` +
        `${bestOk(u) ? 'Previous valid result retained.' : 'Baseline will be used.'}`
    );

    return false;
}

function countInferred(spec) {
    const countOne = s =>
        [
            'actors',
            'use_cases',
            'nodes',
            'steps',
            'states',
            'transitions',
            'rows',
            'participants'
        ].reduce((total, key) =>
            total + arr(s && s[key]).filter(x => x && x.inferred).length,
        0);

    return Array.isArray(spec)
        ? spec.reduce((total, s) => total + countOne(s), 0)
        : countOne(spec);
}

function printStatus(units) {
    console.log('\nUnit        Diagram    State     Description');

    units.forEach(u => {
        console.log(
            `${u.id.padEnd(11)} ` +
            `${u.diagram.padEnd(10)} ` +
            `${unitState(u).padEnd(9)} ` +
            `${cut(u.title, 70)}`
        );
    });

    const counts = units.reduce((map, u) => {
        const state = unitState(u);
        map[state] = (map[state] || 0) + 1;
        return map;
    }, {});

    console.log(
        `\n${units.length} units: ` +
        Object.entries(counts)
            .map(([key, value]) => `${value} ${key}`)
            .join(', ')
    );
}

// ============================================================
// RENDER
// ============================================================

const toArr = s => Array.isArray(s) ? s : [s];

function resultFor(u) {
    const ok = bestOk(u);

    if (ok) {
        return {
            spec: ok.spec,
            source: arr(ok.incomplete).length
                ? 'AI partial'
                : 'AI complete',
            added: ok.added || 0,
            incomplete: ok.incomplete || []
        };
    }

    const state = unitState(u);

    const reason = state === 'failed'
        ? 'Baseline only - AI failed'
        : state === 'stale'
            ? 'Baseline only - AI result outdated'
            : 'Baseline only - not generated';

    if (u.kind === 'state') {
        return {
            spec: [],
            source: reason,
            added: 0,
            incomplete: u.subjects
        };
    }

    if (u.kind === 'decision') {
        return {
            spec: Object.values(u.baseline.tables),
            source: reason,
            added: 0,
            incomplete: []
        };
    }

    return {
        spec: u.baseline,
        source: reason,
        added: 0,
        incomplete: []
    };
}

function statusTable(rows) {
    return [
        '| Unit | Covers | Source | New elements |',
        '|---|---|---|---|',
        ...rows.map(r =>
            `| ${r.u.id} | ${cut(r.u.title, 60)} | ${r.source} | ${r.added} |`
        ),
        ''
    ];
}

function renderAll(model, units) {
    const stamp =
        `Generated ${new Date().toISOString()} by ` +
        `8.0.13.DiagramsAI.js using ${MODEL}. ${C.sourceLine(model)}`;

    const legend =
        'Dashed outlines and elements marked * were added by AI. ' +
        'Solid elements come from the repositories.';

    const written = [];

    const forDiagram = key =>
        units
            .filter(u => u.diagram === key)
            .map(u => ({ u, ...resultFor(u) }));

    const section = (rows, render) => {
        const blocks = [...statusTable(rows)];

        rows.forEach(x => {
            blocks.push(
                `## ${x.u.id}: ${x.spec.title || x.u.title}`,
                '',
                `Focus: ${x.u.focus}`,
                '',
                render(x),
                ''
            );
        });

        return blocks;
    };

    written.push(C.writeDoc(
        OUTPUT_DIR,
        DIAGRAMS.usecase.file,
        DIAGRAMS.usecase.title,
        [
            'Actors, system boundary and functional capabilities.',
            '',
            legend,
            '',
            stamp
        ],
        section(
            forDiagram('usecase'),
            x => C.fence(C.renderUseCase({
                ...x.spec,
                system_name: x.spec.system_name || model.systemName
            }))
        )
    ));

    written.push(C.writeDoc(
        OUTPUT_DIR,
        DIAGRAMS.process.file,
        DIAGRAMS.process.title,
        [
            'End-to-end business processes, swimlanes, decisions and exception paths.',
            '',
            legend,
            '',
            stamp
        ],
        section(
            forDiagram('process'),
            x => C.fence(C.renderProcess(x.spec))
        )
    ));

    written.push(C.writeDoc(
        OUTPUT_DIR,
        DIAGRAMS.sequence.file,
        DIAGRAMS.sequence.title,
        [
            'Interactions between actors and system participants over time.',
            '',
            legend,
            '',
            stamp
        ],
        section(
            forDiagram('sequence'),
            x => C.fence(C.renderSequence(x.spec))
        )
    ));

    // State diagrams: only successfully generated object lifecycles are rendered.
    const stateItems = forDiagram('state');

    const machines = stateItems.flatMap(x =>
        toArr(x.spec).map(m => ({
            machine: m,
            source: x.source,
            unit: x.u
        }))
    );

    const stateBlocks = [...statusTable(stateItems)];

    machines.forEach(x => {
        stateBlocks.push(
            `## ${x.machine.object}`,
            '',
            `Source: ${x.source}`,
            '',
            C.fence(C.renderState(x.machine)),
            ''
        );
    });

    const missingStates = stateItems.flatMap(x =>
        arr(x.incomplete)
    );

    if (missingStates.length) {
        stateBlocks.push(
            `No valid object lifecycle generated for: ${missingStates.join(', ')}.`,
            ''
        );
    }

    written.push(C.writeDoc(
        OUTPUT_DIR,
        DIAGRAMS.state.file,
        DIAGRAMS.state.title,
        [
            'Business-object lifecycles: object states, transitions, guards and abnormal endings.',
            '',
            legend,
            '',
            stamp
        ],
        stateBlocks
    ));

    // Decision tables: AI output for completed subjects, baseline for the rest.
    const decisionBaseline = C.buildDecisionSpecs(model);
    const decisionItems = forDiagram('decision');

    const completedSubjects = new Set(
        decisionItems.flatMap(x =>
            toArr(x.spec).map(t => t.subject)
        )
    );

    const decisionBlocks = [...statusTable(decisionItems)];

    if (decisionBaseline.tables.length) {
        decisionBlocks.push(
            '## Decision requirements diagram',
            '',
            C.fence(C.renderDrd(decisionBaseline.drd)),
            '',
            '## Decision tables',
            ''
        );
    } else {
        decisionBlocks.push(
            '_No business rules were found, so there are no decision tables._',
            ''
        );
    }

    decisionItems.forEach(x => {
        toArr(x.spec).forEach(table => {
            decisionBlocks.push(
                C.renderDecisionTable(table),
                `Source: ${x.source}`,
                ''
            );
        });
    });

    decisionBaseline.tables
        .filter(t => !completedSubjects.has(t.subject))
        .forEach(table => {
            decisionBlocks.push(
                C.renderDecisionTable(table),
                '_Baseline only - not AI-enhanced._',
                ''
            );
        });

    written.push(C.writeDoc(
        OUTPUT_DIR,
        DIAGRAMS.decision.file,
        DIAGRAMS.decision.title,
        [
            'Business rules, decision conditions and outcomes.',
            '',
            legend,
            '',
            stamp
        ],
        decisionBlocks
    ));

    // README: explicitly distinguish complete, partial and baseline-only.
    const link = file =>
        `[${path.basename(file)}](${path.basename(file)})`;

    const readmeRows = Object.keys(DIAGRAMS).map((key, i) => {
        const diagramUnits = units.filter(u => u.diagram === key);

        const complete = diagramUnits.filter(u =>
            unitState(u) === 'ok'
        ).length;

        const partial = diagramUnits.filter(u =>
            unitState(u) === 'partial'
        ).length;

        const baselineOnly = diagramUnits.length - complete - partial;

        return (
            `| ${DIAGRAMS[key].title} | ${link(written[i])} | ` +
            `${complete} | ${partial} | ${baselineOnly} | ${diagramUnits.length} |`
        );
    });

    written.push(C.writeDoc(
        OUTPUT_DIR,
        'README.md',
        'Diagram set',
        [
            stamp,
            '',
            'AI-complete, AI-partial and baseline-only counts are reported separately.'
        ],
        [
            '| Diagram | File | AI complete | AI partial | Baseline only | Total units |',
            '|---|---|---:|---:|---:|---:|',
            ...readmeRows,
            '',
            'Rerun a diagram: `node 8.0.13.DiagramsAI.js --rerun --diagram "use case"`.',
            'Rerun failed or partial units: `node 8.0.13.DiagramsAI.js --rerun --failed`.',
            'Render saved results without AI: `node 8.0.13.DiagramsAI.js --render`.'
        ]
    ));

    return written;
}

// ============================================================
// MAIN
// ============================================================

async function main(argv = process.argv.slice(2), injectedPool = null) {
    const options = parseArgs(argv);

    if (options.help) {
        console.log(USAGE);
        return null;
    }

    const pool = injectedPool || C.createPool();

    let model;

    try {
        model = await C.loadModel(pool);
    } finally {
        if (!injectedPool) await pool.end();
    }

    log(`Loaded: ${JSON.stringify(model.stats)}`);

    if (!model.activities.length) {
        throw new Error(
            'No business activities were found in the knowledge base.'
        );
    }

    fs.mkdirSync(UNIT_DIR, { recursive: true });

    const units = buildUnits(model, options);

    if (options.status) {
        printStatus(units);
        return { units };
    }

    if (!options.render) {
        let selected = selectUnits(units, options);

        if (!options.rerun) {
            selected = selected.filter(u =>
                !['ok', 'partial'].includes(unitState(u))
            );
        }

        if (options.limit) {
            selected = selected.slice(0, options.limit);
        }

        log(
            `${selected.length} unit(s) to generate: ` +
            `${selected.map(u => u.id).join(', ') || 'none'}`
        );

        for (const unit of selected) {
            await runUnit(unit, model);
        }
    }

    const written = renderAll(model, units);

    const bad = units.filter(u =>
        ['failed', 'partial', 'stale', 'pending'].includes(unitState(u))
    );

    log(`Wrote ${written.length} files to ${OUTPUT_DIR}`);

    written.forEach(file => console.log(`  ${file}`));

    if (bad.length) {
        console.log(
            `\n${bad.length} unit(s) are failed, partial, stale or pending: ` +
            bad.map(u => u.id).join(', ')
        );

        [...new Set(bad.map(u => u.diagram))].forEach(key => {
            console.log(
                `  rerun: node 8.0.13.DiagramsAI.js ` +
                `--rerun --diagram "${DIAGRAMS[key].name}" --failed`
            );
        });
    }

    return {
        units,
        written,
        bad,
        model
    };
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.stack || error.message);
        process.exit(1);
    });
}

module.exports = {
    main,
    setRunner,
    parseArgs,
    parseLoose,
    buildUnits,
    unitState,
    applyUseCase,
    applyProcess,
    applySequence,
    applyStates,
    applyDecisions,
    applyCapabilities,
    diagramKey
};