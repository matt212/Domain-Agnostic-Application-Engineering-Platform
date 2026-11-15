'use strict';

/**
 * 8.4.0 - BUSINESS RULES (domain agnostic, batched, JSON output)
 *
 * Baseline : business requirements + functional requirements (requirements schema) and the knowledge base.
 *            They are STARTING POINTS, not limits: the AI formalises the statements they contain and also
 *            invents the rules an experienced analyst would expect for each scope.
 * AI       : writes rules, one scope ("unit") per model call: a business requirement, a business object,
 *            optionally an actor. Gap passes cover baseline statements and rule types nobody has covered.
 * Code     : builds units, batches them, validates, dedupes, tags guessed numbers, links rules to
 *            business requirements / functional requirements, and reports coverage.
 *
 *   node 8_4_0_businessRules.js all
 * or step by step (every step is resumable):
 *   load -> plan -> generate -> gap -> generate -> consolidate
 *
 * Batches : units are grouped (BATCH_SIZE, default 4). One JSON file per batch is written to batches/.
 *           MAX_BATCHES=2 runs only two batches per invocation, so you can work in chunks.
 * Smoke   : LIMIT=2 node 8_4_0_businessRules.js all     (first 2 units only)
 * Units   : UNITS=br,object (default) | br,object,actor | br
 * Local llama-cli only (MODEL_NAME, LLAMA_CLI_PATH, THREADS). Nothing leaves the machine.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Pool } = require('pg');

// ============================================================
// 1. CONFIGURATION
// ============================================================

const ROOT = process.cwd();
const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';
const DB_CONFIG_PATH = path.join(ROOT, 'app/config/config.json');

const OUTPUT_DIR = process.env.RULES_OUTPUT_DIR ||
    path.join(ROOT, 'app/utils/appflowgeneratorAI/aiOutput/businessRules');
const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
const BATCH_DIR = path.join(OUTPUT_DIR, 'batches');
const CONTEXT_FILE = path.join(OUTPUT_DIR, 'context.json');
const PLAN_FILE = path.join(OUTPUT_DIR, 'plan.json');
const FINAL_FILE = path.join(OUTPUT_DIR, 'business_rules.json');
const TRACE_FILE = path.join(OUTPUT_DIR, 'business_rules.trace.json');

const REQ_SCHEMA = process.env.REQ_SCHEMA || 'requirements';
const BR_FILE_FALLBACK = process.env.BR_FILE ||
    path.join(ROOT, 'app/utils/appflowgeneratorAI/aiOutput/businessRequirements/business_requirements.json');
const FR_SOURCE_PATTERN = process.env.FR_SOURCE_PATTERN || '%consolidated-Functional-Requirements%';
const UNIT_KINDS = (process.env.UNITS || 'br,object').split(',').map(x => x.trim()).filter(Boolean);
const PROMPT_VERSION = '1';

const SETTINGS = {
    threads: Number(process.env.THREADS || 6),
    llamaBatch: 512,
    temperature: 0.2,
    timeoutMs: 30 * 60 * 1000,
    heartbeatMs: 30000,
    retries: 1,
    context: 6144,

    digestChars: 5000,
    briefChars: 2200,
    ruleTokens: 1400,
    rulesPerUnit: 4,

    unitsPerBatch: Number(process.env.BATCH_SIZE || 4),
    frsPerUnit: 8,
    statementsPerUnit: 10,

    gapStatementsPerCall: 8,
    gapMaxCalls: Number(process.env.GAP_MAX_CALLS || 6),
    minRulesPerType: Number(process.env.MIN_RULES_PER_TYPE || 3),
    typeGapRules: 5,

    dedupeSim: Number(process.env.RULE_DEDUPE_SIM || 0.5),
    coverSim: Number(process.env.COVER_SIM || 0.22)
};

// Generic rule taxonomy (no domain words).
const RULE_TYPES = {
    'Validation': 'what data or input must be correct, complete or consistent before it is accepted',
    'Eligibility': 'who or what qualifies for something, and who or what does not',
    'Calculation': 'how amounts, fees, quantities or other values are derived',
    'Authorization': 'who may perform, approve or see what',
    'Timing': 'deadlines, durations, ordering and time windows',
    'State transition': 'when a record may move from one status to another, and what is forbidden',
    'Limit': 'maximum or minimum quantities, frequencies or exposures',
    'Compliance': 'legal, regulatory and policy obligations',
    'Financial control': 'how money movements are authorised, reconciled and corrected',
    'Exception handling': 'what must happen when something fails, is disputed or is abnormal',
    'Audit and retention': 'what must be recorded, who may change it, and how long it is kept'
};
const TYPE_NAMES = Object.keys(RULE_TYPES);
// normative wording: "must", "shall", "may only", "Only X may ...", "cannot", "is required", "is prohibited" ...
const MODAL = /\b(must|shall|may|cannot|can only|only|required|prohibited|forbidden|not permitted|not allowed)\b/i;
const SYSTEM_ROLE = /\b(automated|system component|software|algorithm|engine|bot)\b/i;

const DIGEST_CATEGORIES = [
    ['BUSINESS_CONTEXT', 4], ['BUSINESS_OPERATING_MODEL', 4], ['BUSINESS_PRODUCT_SERVICE', 6],
    ['BUSINESS_OUTCOME', 8], ['BUSINESS_FUNCTION', 8], ['BUSINESS_MONETIZATION_MODEL', 4],
    ['BUSINESS_LIFECYCLE_STAGE', 12], ['ACTOR_DEFINITION', 12], ['BUSINESS_OBJECT', 20],
    ['BUSINESS_ASSUMPTION', 8], ['UNRESOLVED_DEPENDENCY', 6], ['EVIDENCE_GAP', 6]
];
const KB_CATEGORIES = [...new Set([
    ...DIGEST_CATEGORIES.map(c => c[0]), 'ACTOR_RESPONSIBILITY', 'ACTOR_BUSINESS_OBJECT_RELATIONSHIP',
    'BUSINESS_ACTIVITY', 'INFORMATION_REQUIREMENT'])];

// ============================================================
// 2. HELPERS
// ============================================================

const log = m => console.log(`[8.4.0] ${new Date().toISOString()} ${m}`);
const arr = v => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const uniq = l => [...new Set(l.filter(Boolean))];
const pad = n => String(n).padStart(3, '0');
const shortHash = t => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 8);
const cut = (v, n) => {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim();
    return t.length <= n ? t : t.slice(0, n) + '...';
};
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function same(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'shall', 'system', 'their',
    'have', 'been', 'will', 'such', 'each', 'when', 'then', 'which', 'based', 'business', 'must', 'not', 'only',
    'may', 'are', 'any', 'all', 'its', 'has', 'can', 'who', 'what']);

function stem(w) {
    if (w.length > 5) w = w.replace(/(ations?|ates?|ated|ating|ions?|ings?|ments?)$/, '');
    if (w.length > 4) w = w.replace(/(ies|ied)$/, 'y').replace(/(ed|es|s)$/, '');
    if (w.length > 4) w = w.replace(/e$/, '');
    return w;
}
const stemTokens = s => norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)).map(stem);

function flatText(o) {
    if (o == null) return '';
    if (typeof o !== 'object') return String(o);
    return Object.values(o).map(flatText).join(' ');
}

// knowledge_records.content is a wrapper { id, content: {fields}, ... } or the fields themselves
function inner(row) {
    let c = row.content;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch { return { text: c }; } }
    c = c || {};
    let b = c.content !== undefined ? c.content : c;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return { text: b }; } }
    if (Array.isArray(b)) return { items: b };
    return b && typeof b === 'object' ? b : { text: String(b ?? '') };
}

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

const numbersIn = t => String(t ?? '').match(/\d+(?:\.\d+)?/g) || [];
// a number that is not in the baseline is a guess: mark it as one
function tagUngrounded(text, ground) {
    const nums = numbersIn(text);
    if (!nums.length || /propos/i.test(text)) return text;
    return nums.some(n => !ground.has(n)) ? `${text} (proposed)` : text;
}

// ---- TF-IDF similarity (IDF comes from the texts themselves, so it adapts to any domain) ----
function tfidf(texts) {
    const docs = texts.map(stemTokens), df = new Map();
    docs.forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
    const N = docs.length;
    return docs.map(d => {
        const v = new Map();
        d.forEach(w => v.set(w, (v.get(w) || 0) + Math.log((N + 1) / (df.get(w) + 1)) + 1));
        const n2 = Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0)) || 1;
        v.forEach((x, k) => v.set(k, x / n2));
        return v;
    });
}
function cosine(a, b) {
    let s = 0;
    for (const [k, x] of a) { const y = b.get(k); if (y) s += x * y; }
    return s;
}
function crossSimilarity(textsA, textsB) {
    if (!textsA.length || !textsB.length) return textsA.map(() => textsB.map(() => 0));
    const V = tfidf([...textsA, ...textsB]);
    const A = V.slice(0, textsA.length), B = V.slice(textsA.length);
    return A.map(a => B.map(b => cosine(a, b)));
}
// groups texts whose similarity is >= minSim (average linkage); returns [{members, medoid}]
function groupSimilar(texts, minSim) {
    const n = texts.length;
    if (!n) return [];
    const V = tfidf(texts);
    const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : cosine(V[i], V[j]))));
    const link = (a, b) => { let t = 0; for (const i of a) for (const j of b) t += S[i][j]; return t / (a.length * b.length); };
    let cl = V.map((_, i) => [i]);
    while (cl.length > 1) {
        let best = -1, bi = 0, bj = 0;
        for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
            const l = link(cl[i], cl[j]);
            if (l > best) { best = l; bi = i; bj = j; }
        }
        if (best < minSim) break;
        cl[bi] = cl[bi].concat(cl[bj]);
        cl.splice(bj, 1);
    }
    return cl.map(members => ({ members, medoid: members[0] }));
}

// ============================================================
// 3. MODEL RUNNER (local llama-cli)
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
        const hb = setInterval(() => log(
            `${label} running ${((Date.now() - started) / 1000).toFixed(0)}s, ${out.length} bytes`
        ), SETTINGS.heartbeatMs);
        const to = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, SETTINGS.timeoutMs);
        child.stdout.on('data', d => { out += d.toString(); });
        child.on('error', e => { clearInterval(hb); clearTimeout(to); reject(e); });
        child.on('close', () => { clearInterval(hb); clearTimeout(to); resolve(out); });
    });
}

let runner = runLocal;
const setRunner = fn => { runner = fn; };
const NO_THINK = '<think>\n\n</think>\n\n';

// parse + validate; the rejection reason is fed back once
async function ask(label, promptFn, maxTokens, parse) {
    let hint = '';
    for (let a = 0; a <= SETTINGS.retries; a++) {
        try {
            return parse(extractJson(await runner(`${label} try ${a + 1}`, promptFn(hint), maxTokens)));
        } catch (e) { hint = e.message; log(`${label} try ${a + 1} rejected: ${hint}`); }
    }
    return null;
}

// ============================================================
// 4. DATABASE: requirements schema (columns discovered at run time) + knowledge base
// ============================================================

function createPool() {
    const cfg = JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8')).development;
    return new Pool({
        user: cfg.username, password: cfg.password, database: cfg.database,
        host: cfg.host, port: Number(cfg.port), max: 2
    });
}

async function columnsOf(pool, table) {
    try {
        const r = await pool.query(
            `SELECT column_name, data_type FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [REQ_SCHEMA, table]);
        return r.rows.map(x => `${x.column_name} (${x.data_type})`);
    } catch { return []; }
}

// table names below are constants in this file, never user input
async function tableRows(pool, table) {
    try {
        const r = await pool.query(`SELECT to_jsonb(t) AS row FROM ${REQ_SCHEMA}.${table} t`);
        return r.rows.map(x => x.row);
    } catch (e) { log(`Could not read ${REQ_SCHEMA}.${table}: ${e.message}`); return []; }
}

// nested jsonb objects are merged into one flat map, top-level keys win
function flatten(row) {
    const out = {};
    const walk = (o, depth) => {
        for (const [k, v0] of Object.entries(o)) {
            let v = v0;
            if (typeof v === 'string' && /^\s*[[{]/.test(v)) { try { v = JSON.parse(v); } catch { /* keep string */ } }
            if (v && typeof v === 'object' && !Array.isArray(v) && depth < 2) walk(v, depth + 1);
            if (!(k in out)) out[k] = v;
        }
    };
    walk(row, 0);
    return out;
}

// first non-empty value whose key matches the patterns (patterns are tried in priority order)
function pick(flat, patterns) {
    for (const p of patterns) {
        for (const k of Object.keys(flat)) {
            const v = flat[k];
            if (p.test(k) && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) return v;
        }
    }
    return undefined;
}
function toList(v) {
    if (v === undefined || v === null || v === '') return [];
    if (typeof v === 'string' && /^\s*\[/.test(v)) { try { return toList(JSON.parse(v)); } catch { /* fall through */ } }
    return arr(v).map(x => (x && typeof x === 'object' ? flatText(x) : String(x))).map(x => x.trim()).filter(Boolean);
}
const idFrom = (text, prefix) => {
    const m = new RegExp(`\\b${prefix}[-_ ]?(\\d{1,4})\\b`, 'i').exec(String(text || ''));
    return m ? `${prefix}-${pad(Number(m[1]))}` : null;
};
const numOf = id => Number(String(id).replace(/\D+/g, '')) || 0;

function parseFr(row, hintId) {
    const f = flatten(row);
    const id = idFrom(pick(f, [/^(functional_requirement_id|fr_id|requirement_id|external_id|code)$/, /^id$/]), 'FR') ||
        idFrom(hintId, 'FR') || idFrom(JSON.stringify(row).slice(0, 4000), 'FR');
    return {
        id,
        requirement: cut(pick(f, [/^(requirement|requirement_text|requirement_statement|functional_requirement|statement)$/, /^(name|title)$/]), 400),
        need: cut(pick(f, [/^business_need$/]), 300),
        rules: toList(pick(f, [/^business_rules$/])).map(x => cut(x, 240)),
        actors: toList(pick(f, [/^required_by_actors$/, /actors/])),
        objects: toList(pick(f, [/^related_business_objects$/, /business_objects/]))
    };
}

function parseBr(row) {
    const f = flatten(row);
    const id = idFrom(pick(f, [/^(business_requirement_id|br_id|requirement_id|external_id|code)$/, /^id$/]), 'BR') ||
        idFrom(JSON.stringify(row).slice(0, 4000), 'BR');
    const name = cut(pick(f, [/^(name|title|requirement_name)$/]), 120);
    return {
        id, name,
        requirement: cut(pick(f, [/^(business_requirement|requirement|requirement_text|statement)$/]) || name, 400),
        objective: cut(pick(f, [/^business_objective$/]), 300),
        value: cut(pick(f, [/^business_value$/]), 300),
        stakeholders: toList(pick(f, [/^stakeholders$/])),
        priority: cut(pick(f, [/^priority$/]), 20),
        policies: toList(pick(f, [/^policies_and_constraints$/])).map(x => cut(x, 240)),
        frs: toList(pick(f, [/^linked_functional_requirements$/])).map(x => idFrom(x, 'FR')).filter(Boolean)
    };
}

// last resort for functional requirements: records ingested from the consolidated run (result.requirement)
async function loadFrsFromKnowledge(pool) {
    const run = await pool.query(
        `SELECT started_at, completed_at FROM knowledge_ingestion_runs
          WHERE source_file ILIKE $1 AND ingestion_status = 'COMPLETED' ORDER BY ingestion_id DESC LIMIT 1`,
        [FR_SOURCE_PATTERN]);
    if (!run.rows.length) return [];
    const r = await pool.query(
        `SELECT kr.record_id, kr.source_file, kr.content FROM knowledge_records kr
          WHERE kr.created_at BETWEEN $1 AND COALESCE($2, NOW())
            AND kr.content ? 'result' AND NULLIF(kr.content #>> '{result,requirement}', '') IS NOT NULL
          ORDER BY kr.source_file`, [run.rows[0].started_at, run.rows[0].completed_at]);
    return r.rows.map(x => ({ ...parseFr(x.content, x.source_file), recordId: x.record_id }));
}

async function loadRequirements(pool) {
    const cols = {};
    for (const t of ['functional_requirements', 'business_requirements']) {
        cols[t] = await columnsOf(pool, t);
        log(`${REQ_SCHEMA}.${t} columns: ${cols[t].join(', ') || '(table not found)'}`);
    }

    const frRows = await tableRows(pool, 'functional_requirements');
    let frs = frRows.map(r => parseFr(r)).filter(f => f.id && f.requirement);
    if (frs.length && new Set(frs.map(f => f.id)).size < frs.length) {
        log(`WARNING: ${frs.length} functional requirement rows map to only ${new Set(frs.map(f => f.id)).size} distinct ids. Check which column holds the id.`);
    }
    if (!frs.length) {
        log('No usable rows in the requirements schema for functional requirements; reading the consolidated ingestion run instead.');
        frs = (await loadFrsFromKnowledge(pool)).filter(f => f.id && f.requirement);
    }
    const frMap = new Map(frs.map(f => [f.id, f]));
    frs = [...frMap.values()].sort((a, b) => numOf(a.id) - numOf(b.id));
    if (!frs.length) throw new Error(`No functional requirements could be read. Columns seen: ${JSON.stringify(cols)}`);

    let brs = (await tableRows(pool, 'business_requirements')).map(parseBr).filter(b => b.id && b.requirement);
    if (!brs.length && fs.existsSync(BR_FILE_FALLBACK)) {
        log(`No usable business requirement rows in the database; reading ${BR_FILE_FALLBACK}.`);
        brs = arr(JSON.parse(fs.readFileSync(BR_FILE_FALLBACK, 'utf8')).business_requirements).map(parseBr).filter(b => b.id);
    }
    const brMap = new Map(brs.map(b => [b.id, b]));
    brs = [...brMap.values()].sort((a, b) => numOf(a.id) - numOf(b.id));
    if (!brs.length) throw new Error(`No business requirements could be read. Columns seen: ${JSON.stringify(cols)}`);

    // business requirement -> functional requirement links: own array, else the traceability view
    const links = new Map(brs.map(b => [b.id, new Set(b.frs)]));
    for (const row of await tableRows(pool, 'v_fr_br_traceability')) {
        const text = JSON.stringify(row);
        const fr = uniq((text.match(/\bFR-\d{1,4}\b/gi) || []).map(x => idFrom(x, 'FR')));
        const br = uniq((text.match(/\bBR-\d{1,4}\b/gi) || []).map(x => idFrom(x, 'BR')));
        for (const b of br) if (links.has(b)) fr.forEach(f => links.get(b).add(f));
    }
    brs.forEach(b => { b.frs = [...links.get(b.id)].filter(id => frMap.has(id)); });
    log(`Requirements: ${frs.length} functional, ${brs.length} business (${brs.filter(b => b.frs.length).length} with functional links).`);
    return { frs, brs };
}

// ============================================================
// 5. STEP: LOAD
// ============================================================

const labelList = (rows, f) => rows.map(f).filter(Boolean);

async function stepLoad(pool) {
    const { frs, brs } = await loadRequirements(pool);

    const kbRows = await pool.query(
        `SELECT record_id, semantic_category, content FROM knowledge_records
          WHERE semantic_category = ANY($1) ORDER BY record_id`, [KB_CATEGORIES]);
    const kb = kbRows.rows.map(r => ({ category: r.semantic_category, d: inner(r) }));
    const of = c => kb.filter(x => x.category === c).map(x => x.d);

    const lines = [];
    for (const [cat, cap] of DIGEST_CATEGORIES) {
        const rows = of(cat).slice(0, cap);
        if (!rows.length) continue;
        lines.push(`${cat.replace(/_/g, ' ')}:`);
        for (const d of rows) {
            lines.push(`- ${cat === 'BUSINESS_OBJECT' ? d.object_name : cat === 'ACTOR_DEFINITION'
                ? `${d.actor_name}: ${cut(d.operational_role, 100)}` : cut(flatText(d), 180)}`);
        }
    }
    let digest = lines.join('\n');
    if (digest.length > SETTINGS.digestChars) {
        log(`WARNING: knowledge digest truncated ${digest.length} -> ${SETTINGS.digestChars} chars.`);
        digest = digest.slice(0, SETTINGS.digestChars);
    }

    const actorsDetail = labelList(of('ACTOR_DEFINITION'), d => d.actor_name ? { name: d.actor_name, role: cut(d.operational_role, 160) } : null);
    const systemActors = actorsDetail.filter(a => SYSTEM_ROLE.test(a.role)).map(a => a.name);
    const respByActor = new Map();
    for (const d of of('ACTOR_RESPONSIBILITY')) {
        respByActor.set(d.actor, arr(d.responsibilities).map(r => cut(`${r.responsibility}: ${r.responsibility_description || ''}`, 150)));
    }
    const interactions = labelList(of('ACTOR_BUSINESS_OBJECT_RELATIONSHIP'), d => d.actor && d.business_object
        ? { actor: d.actor, object: d.business_object, type: d.interaction_type, desc: cut(d.interaction_description, 140) } : null);
    const activities = labelList(of('BUSINESS_ACTIVITY'), d => d.activity_name ? {
        name: d.activity_name, precondition: cut(d.trigger_or_precondition, 200), primary: d.primary_actor,
        inputs: toList(d.input_business_objects), outputs: toList(d.output_business_objects)
    } : null);
    const irs = labelList(of('INFORMATION_REQUIREMENT'), d => d.description ? {
        label: d.information_requirement || d.requirement_name || cut(d.description, 60),
        description: cut(d.description, 200), rules: toList(d.functional_rules).map(x => cut(x, 240)),
        objects: toList(d.related_business_objects)
    } : null);
    const objects = labelList(of('BUSINESS_OBJECT'), d => d.object_name ? {
        name: d.object_name, purpose: cut(d.purpose, 180), lifecycle: cut(d.lifecycle_role, 160),
        deps: toList(d.dependencies)
    } : null).map(o => ({
        ...o,
        activities: activities.filter(a => [...a.inputs, ...a.outputs].some(x => same(x, o.name))).map(a => a.name),
        irs: irs.filter(i => i.objects.some(x => same(x, o.name)) || norm(i.description).includes(norm(o.name))).map(i => i.label)
    }));

    // baseline statements: everything the earlier stages already say about rules, policies and preconditions
    const seen = new Set(), statements = [];
    const add = (text, origin) => {
        const t = cut(text, 240), k = norm(t);
        if (t.length < 12 || seen.has(k)) return;
        seen.add(k);
        statements.push({ id: `S-${pad(statements.length + 1)}`, text: t, origin });
    };
    frs.forEach(f => f.rules.forEach(r => add(r, f.id)));
    brs.forEach(b => b.policies.forEach(r => add(r, b.id)));
    irs.forEach(i => i.rules.forEach(r => add(r, `IR ${cut(i.label, 40)}`)));
    activities.forEach(a => a.precondition && add(`Precondition for "${a.name}": ${a.precondition}`, `ACT ${a.name}`));

    // numbers already in the baseline are "grounded"; any other number in a rule is a guess
    const groundRows = await pool.query(`SELECT content FROM knowledge_records LIMIT 50000`);
    const groundText = [...groundRows.rows.map(r => flatText(inner(r))),
        ...frs.map(f => flatText(f)), ...brs.map(b => flatText(b))].join(' ');

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(CONTEXT_FILE, JSON.stringify({
        digest, frs, brs, actors: actorsDetail.map(a => a.name), systemActors,
        objects: objects.map(o => o.name), actorsDetail, respByActor: Object.fromEntries(respByActor),
        interactions, activities, objectsDetail: objects, statements,
        groundNumbers: uniq(numbersIn(groundText))
    }, null, 2));
    log(`Loaded ${frs.length} FR, ${brs.length} BR, ${objects.length} objects, ${actorsDetail.length} actors, ` +
        `${activities.length} activities, ${statements.length} baseline statements.`);
}

const loadContext = () => {
    if (!fs.existsSync(CONTEXT_FILE)) throw new Error('Run "load" first.');
    return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
};

// ============================================================
// 6. STEP: PLAN (units and batches)
// ============================================================

// statements attached to the unit first, then topped up by similarity
function pickStatements(ctx, direct, unitText) {
    const chosen = new Map();
    direct.forEach(s => chosen.set(s.id, s));
    const rest = ctx.statements.filter(s => !chosen.has(s.id));
    if (chosen.size < SETTINGS.statementsPerUnit && rest.length) {
        const sim = crossSimilarity([unitText], rest.map(s => s.text))[0];
        rest.map((s, i) => ({ s, v: sim[i] })).filter(x => x.v > 0.05).sort((a, b) => b.v - a.v)
            .slice(0, SETTINGS.statementsPerUnit - chosen.size).forEach(x => chosen.set(x.s.id, x.s));
    }
    return [...chosen.values()].slice(0, SETTINGS.statementsPerUnit)
        .map(s => ({ id: s.id, text: s.text, origin: s.origin }));
}

function topFrs(ctx, preferred, unitText, k = SETTINGS.frsPerUnit) {
    const known = new Map(ctx.frs.map(f => [f.id, f]));
    const pre = uniq(preferred).filter(id => known.has(id));
    const rest = ctx.frs.filter(f => !pre.includes(f.id));
    const sim = rest.length ? crossSimilarity([unitText], rest.map(f => `${f.requirement} ${f.need}`))[0] : [];
    const ranked = rest.map((f, i) => ({ id: f.id, v: sim[i] })).sort((a, b) => b.v - a.v).map(x => x.id);
    const pool = pre.length > k
        ? crossSimilarity([unitText], pre.map(id => `${known.get(id).requirement} ${known.get(id).need}`))[0]
            .map((v, i) => ({ id: pre[i], v })).sort((a, b) => b.v - a.v).map(x => x.id)
        : pre;
    return uniq([...pool, ...ranked]).slice(0, k);
}

function buildUnits(ctx) {
    const units = [];
    if (UNIT_KINDS.includes('br')) {
        for (const b of ctx.brs) {
            const text = `${b.name} ${b.requirement} ${b.objective}`;
            const frs = topFrs(ctx, b.frs, text);
            const direct = ctx.statements.filter(s => s.origin === b.id || frs.includes(s.origin));
            units.push({
                unit_id: b.id, kind: 'business_requirement', title: b.name || cut(b.requirement, 60),
                brief: [`Requirement: ${b.requirement}`, b.objective && `Objective: ${b.objective}`,
                    b.value && `Value: ${b.value}`, b.stakeholders.length && `Stakeholders: ${b.stakeholders.join(', ')}`].filter(Boolean),
                statements: pickStatements(ctx, direct, text), frs, br: b.id,
                actors: b.stakeholders.filter(x => !ctx.systemActors.some(s => same(s, x))), objects: []
            });
        }
    }
    if (UNIT_KINDS.includes('object')) {
        ctx.objectsDetail.forEach((o, i) => {
            const text = `${o.name} ${o.purpose} ${o.lifecycle}`;
            const preferredFr = ctx.frs.filter(f => f.objects.some(x => same(x, o.name))).map(f => f.id);
            const direct = ctx.statements.filter(s => norm(s.text).includes(norm(o.name)) ||
                (s.origin.startsWith('IR') && o.irs.some(l => s.origin.includes(cut(l, 40)))));
            units.push({
                unit_id: `OBJ-${pad(i + 1)}`, kind: 'business_object', title: o.name,
                brief: [`Purpose: ${o.purpose}`, o.lifecycle && `Role in the lifecycle: ${o.lifecycle}`,
                    o.deps.length && `Depends on: ${o.deps.join(', ')}`,
                    o.activities.length && `Used in activities: ${o.activities.join('; ')}`].filter(Boolean),
                statements: pickStatements(ctx, direct, text), frs: topFrs(ctx, preferredFr, text), br: null,
                actors: [], objects: [o.name]
            });
        });
    }
    if (UNIT_KINDS.includes('actor')) {
        ctx.actorsDetail.filter(a => !ctx.systemActors.includes(a.name)).forEach((a, i) => {
            const text = `${a.name} ${a.role}`;
            const resp = ctx.respByActor[a.name] || [];
            const rel = ctx.interactions.filter(x => same(x.actor, a.name));
            units.push({
                unit_id: `ACT-${pad(i + 1)}`, kind: 'actor', title: a.name,
                brief: [`Role: ${a.role}`, resp.length && `Responsibilities: ${resp.join(' | ')}`,
                    rel.length && `Interacts with: ${rel.map(x => `${x.object} (${x.type})`).join('; ')}`].filter(Boolean),
                statements: pickStatements(ctx, [], text),
                frs: topFrs(ctx, ctx.frs.filter(f => f.actors.some(x => same(x, a.name))).map(f => f.id), text), br: null,
                actors: [a.name], objects: uniq(rel.map(x => x.object))
            });
        });
    }
    return units;
}

// firstBatch lets gap units open NEW batches, so a batch file that is already written never changes
function assignBatches(units, firstBatch = 1) {
    units.forEach((u, i) => { u.batch = firstBatch + Math.floor(i / SETTINGS.unitsPerBatch); });
    return units;
}

function stepPlan() {
    if (fs.existsSync(PLAN_FILE) && !process.env.REPLAN) {
        const n = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8')).length;
        log(`Keeping the existing plan (${n} units) so finished work stays valid. Set REPLAN=1 to rebuild it.`);
        return;
    }
    const units = assignBatches(buildUnits(loadContext()));
    fs.writeFileSync(PLAN_FILE, JSON.stringify(units, null, 2));
    const batches = new Set(units.map(u => u.batch)).size;
    log(`Planned ${units.length} units in ${batches} batches of up to ${SETTINGS.unitsPerBatch}.`);
    units.forEach(u => console.log(`  batch ${u.batch}  ${u.unit_id}  [${u.kind}]  ${cut(u.title, 70)}  (${u.statements.length} baseline statements, ${u.frs.length} FRs)`));
}

const loadPlan = () => {
    if (!fs.existsSync(PLAN_FILE)) throw new Error('Run "plan" first.');
    return JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
};

// ============================================================
// 7. STEP: GENERATE (batched, one unit per model call)
// ============================================================

const SYSTEM_RULES = max => `You are a senior business analyst writing BUSINESS RULES.

A business rule is an atomic, testable statement that constrains or governs business behaviour:
what must always be true, what must never happen, what is allowed only under conditions, how a
value is calculated, who may decide, how long something may take, or how a record may change
status. It is not a feature, a screen or a process step.

The baseline is a STARTING POINT, not a limit. Sharpen and formalise the baseline statements, and
ALSO invent the rules an experienced analyst would expect for this scope that the baseline does
not state. Do not copy baseline sentences word for word.

Rules for writing:
- one rule = one obligation, written with must, must not or may only
- business language only: no technology, screens or databases
- prefer named parameters (for example a maximum allowed duration) over fixed numbers; any
  number that is not in the baseline must be followed by "(proposed)"
- severity is the business consequence of breaking the rule

Return ONLY JSON with 1 to ${max} rules:
{"rules":[{
  "name":"short rule name",
  "statement":"The ... must / must not / may only ...",
  "type":"one of: ${TYPE_NAMES.join(', ')}",
  "condition":"when it applies",
  "exceptions":["0 to 2"],
  "actors":["who it binds or protects"],
  "objects":["business objects it is about"],
  "enforcement":"System-enforced or Manual or Both",
  "severity":"Critical or High or Medium or Low",
  "if_violated":"what the business does when the rule is broken",
  "rationale":"why the rule exists, one sentence",
  "parameters":[{"name":"configurable value","description":"what it controls"}],
  "related_functional_requirements":["ids from the list, if any"],
  "basis":"baseline if it formalises a given statement, inferred if you invented it"
}]}
Every string under 240 characters. No Markdown, no commentary.`;

function frLines(ctx, ids) {
    const byId = new Map(ctx.frs.map(f => [f.id, f]));
    return ids.map(id => byId.get(id)).filter(Boolean).map(f => `${f.id}: ${cut(f.requirement, 110)}`);
}

function unitPrompt(ctx, u, hint) {
    const frs = frLines(ctx, u.frs);
    let scope;
    if (u.kind === 'baseline_gap') {
        scope = `UNCOVERED BASELINE STATEMENTS (no rule reflects them yet; formalise them, merging related ones):
${u.statements.map(s => `- ${s.text}`).join('\n')}

EXISTING RULES (do not repeat):
${u.existing.map(n => `- ${n}`).join('\n') || '(none)'}`;
    } else if (u.kind === 'rule_type_gap') {
        scope = `RULE TYPE TO COVER: ${u.rule_type}: ${RULE_TYPES[u.rule_type]}.
Write rules of this type that this business needs and that are not already present.

EXISTING RULES (do not repeat):
${u.existing.map(n => `- ${n}`).join('\n') || '(none)'}`;
    } else {
        scope = `SCOPE: ${u.kind.replace('_', ' ')}: ${u.title}
${u.brief.join('\n')}

BASELINE STATEMENTS (starting points, not limits):
${u.statements.map(s => `- ${s.text}`).join('\n') || '(none)'}`;
    }
    return `<|im_start|>system
${SYSTEM_RULES(SETTINGS.rulesPerUnit)}
<|im_end|>
<|im_start|>user
BUSINESS KNOWLEDGE:
${ctx.digest.slice(0, SETTINGS.briefChars)}

${scope}

FUNCTIONAL REQUIREMENTS YOU MAY REFERENCE:
${frs.join('\n') || '(none)'}
${hint ? `\nYour previous answer was rejected: ${hint}\nFix it.\n` : ''}
Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

function normaliseType(t) {
    const x = String(t || '').toLowerCase();
    const exact = TYPE_NAMES.find(n => n.toLowerCase() === x.trim());
    if (exact) return exact;
    const table = [
        [/state|status|lifecycle|transition/, 'State transition'], [/audit|retention|archiv|logging/, 'Audit and retention'],
        [/financ|reconcil|settle|ledger|refund|payment/, 'Financial control'], [/exception|escalat|fallback|retry|failure|dispute/, 'Exception handling'],
        [/author|permission|access|approv|role/, 'Authorization'], [/elig|entitle|qualif/, 'Eligibility'],
        [/calc|comput|deriv|pricing|fee|tax/, 'Calculation'], [/compl|regulat|legal|policy|privacy|safety/, 'Compliance'],
        [/limit|threshold|maximum|minimum|quota|cap\b/, 'Limit'], [/time|deadline|sla|duration|expir|schedul/, 'Timing'],
        [/valid|integrity|format|complete|mandatory/, 'Validation']
    ];
    for (const [re, name] of table) if (re.test(x)) return name;
    throw new Error(`type "${t}" must be one of: ${TYPE_NAMES.join(', ')}`);
}

const normaliseEnforcement = v => /both/i.test(v) ? 'Both' : /manual|human|people/i.test(v) ? 'Manual' : /system|auto/i.test(v) ? 'System-enforced' : 'Both';
const normaliseSeverity = v => /crit/i.test(v) ? 'Critical' : /high/i.test(v) ? 'High' : /low/i.test(v) ? 'Low' : 'Medium';

// one bad rule must not throw away its neighbours: keep the valid ones, reject only if none survive
function validateRules(j, knownFrIds, max = SETTINGS.rulesPerUnit) {
    const raw = arr(j.rules);
    if (!raw.length) throw new Error('rules array must contain at least one rule');
    const valid = [], errors = [];
    raw.slice(0, max).forEach((o, i) => {
        try { valid.push(validateRule(o, knownFrIds)); } catch (e) { errors.push(`rule ${i + 1}: ${e.message}`); }
    });
    if (!valid.length) throw new Error(errors[0]);
    if (errors.length) log(`Dropped ${errors.length} invalid rule(s), kept ${valid.length}: ${errors.join(' | ')}`);
    return valid;
}

function validateRule(o, knownFrIds) {
    const s = v => typeof v === 'string' && v.trim().length > 0;
    if (!o || typeof o !== 'object') throw new Error('not an object');
    if (!s(o.name)) throw new Error('name missing');
    if (!s(o.statement) || o.statement.trim().length < 20) throw new Error('statement missing or too short');
    if (!MODAL.test(o.statement)) throw new Error('statement must be normative (must, must not, may only, only ... may)');
    if (!s(o.if_violated)) throw new Error('if_violated missing');
    if (!s(o.rationale)) throw new Error('rationale missing');
    return {
        name: cut(o.name, 90),
        statement: cut(o.statement, 320),
        type: normaliseType(o.type),
        condition: cut(o.condition, 220),
        exceptions: uniq(arr(o.exceptions).map(x => cut(x, 200))).slice(0, 3),
        actors: uniq(arr(o.actors).map(x => cut(x, 80))),
        objects: uniq(arr(o.objects).map(x => cut(x, 80))),
        enforcement: normaliseEnforcement(o.enforcement),
        severity: normaliseSeverity(o.severity),
        if_violated: cut(o.if_violated, 240),
        rationale: cut(o.rationale, 240),
        parameters: arr(o.parameters).map(p => (typeof p === 'string'
            ? { name: cut(p, 60), description: '' }
            : { name: cut(p && p.name, 60), description: cut(p && p.description, 160) })).filter(p => p.name).slice(0, 4),
        related_functional_requirements: uniq(arr(o.related_functional_requirements).map(x => idFrom(x, 'FR')).filter(x => knownFrIds.has(x))),
        basis: /baseline/i.test(o.basis) ? 'baseline' : 'inferred'
    };
}

const unitFile = u => path.join(UNIT_DIR, `${u.unit_id}.${shortHash(JSON.stringify([PROMPT_VERSION, u.title, u.brief, u.statements.map(s => s.text), u.rule_type || '']))}.json`);

async function stepGenerate() {
    const ctx = loadContext();
    let plan = loadPlan();
    if (process.env.LIMIT) plan = plan.slice(0, Number(process.env.LIMIT));
    fs.mkdirSync(UNIT_DIR, { recursive: true });
    fs.mkdirSync(BATCH_DIR, { recursive: true });
    const known = new Set(ctx.frs.map(f => f.id));
    const maxBatches = process.env.MAX_BATCHES ? Number(process.env.MAX_BATCHES) : Infinity;

    const batches = new Map();
    plan.forEach(u => { if (!batches.has(u.batch)) batches.set(u.batch, []); batches.get(u.batch).push(u); });

    let worked = 0, failed = 0;
    for (const [bn, units] of [...batches].sort((a, b) => a[0] - b[0])) {
        const pending = units.filter(u => !fs.existsSync(unitFile(u)));
        if (pending.length && worked >= maxBatches) { log(`MAX_BATCHES reached; stopping before batch ${bn}. Run generate again to continue.`); break; }
        if (pending.length) log(`Batch ${bn}: ${pending.length} of ${units.length} unit(s) to write.`);

        for (const u of pending) {
            const started = Date.now();
            const maxRules = u.kind === 'rule_type_gap' ? SETTINGS.typeGapRules : SETTINGS.rulesPerUnit;
            const rules = await ask(u.unit_id, h => unitPrompt(ctx, u, h), SETTINGS.ruleTokens, j => validateRules(j, known, maxRules));
            if (!rules) { failed++; log(`${u.unit_id} FAILED; rerun generate to retry.`); continue; }
            fs.writeFileSync(unitFile(u), JSON.stringify({ unit_id: u.unit_id, kind: u.kind, rules }, null, 2));
            log(`${u.unit_id} done in ${((Date.now() - started) / 1000).toFixed(0)}s: ${rules.length} rule(s).`);
        }
        if (pending.length) worked++;

        // one JSON file per batch, written once every unit in it has its result
        if (units.every(u => fs.existsSync(unitFile(u)))) {
            const batchFile = path.join(BATCH_DIR, `batch_${pad(bn)}.json`);
            fs.writeFileSync(batchFile, JSON.stringify({
                batch: bn, units: units.map(u => u.unit_id),
                rules: units.flatMap(u => JSON.parse(fs.readFileSync(unitFile(u), 'utf8')).rules.map(r => ({ unit_id: u.unit_id, ...r })))
            }, null, 2));
            if (pending.length) log(`Batch ${bn} written to ${batchFile}`);
        }
    }
    log(`Generate finished. units failed: ${failed}`);
}

// ============================================================
// 8. STEP: GAP (baseline statements and rule types nobody has covered)
// ============================================================

function collectRules(plan) {
    const out = [];
    plan.forEach((u, order) => {
        const f = unitFile(u);
        if (!fs.existsSync(f)) return;
        JSON.parse(fs.readFileSync(f, 'utf8')).rules.forEach(rule => out.push({ unit: u, order, rule }));
    });
    return out;
}

const ruleText = r => `${r.name} ${r.statement} ${r.condition}`;

function uncoveredStatements(statements, rules) {
    if (!statements.length) return [];
    if (!rules.length) return [...statements];
    const sim = crossSimilarity(statements.map(s => s.text), rules.map(ruleText));
    return statements.filter((_, i) => Math.max(...sim[i]) < SETTINGS.coverSim);
}

function stepGap() {
    const ctx = loadContext();
    const plan = loadPlan();
    const collected = collectRules(plan);
    const rules = collected.map(c => c.rule);
    const have = new Set(plan.map(u => u.unit_id));
    const fresh = [];

    // 1. baseline statements no rule reflects
    const unc = uncoveredStatements(ctx.statements, rules);
    log(`Baseline statements covered: ${ctx.statements.length - unc.length}/${ctx.statements.length}.`);
    const maxStatements = SETTINGS.gapStatementsPerCall * SETTINGS.gapMaxCalls;
    for (let i = 0; i < Math.min(unc.length, maxStatements); i += SETTINGS.gapStatementsPerCall) {
        const chunk = unc.slice(i, i + SETTINGS.gapStatementsPerCall);
        const text = chunk.map(s => s.text).join(' ');
        const sim = rules.length ? crossSimilarity([text], rules.map(ruleText))[0] : [];
        const existing = rules.map((r, k) => ({ n: r.name, v: sim[k] || 0 })).sort((a, b) => b.v - a.v).slice(0, 20).map(x => cut(x.n, 60));
        const id = `GAP-B-${shortHash(chunk.map(s => s.id).join('|'))}`;
        if (have.has(id)) continue;
        fresh.push({
            unit_id: id, kind: 'baseline_gap', title: `Baseline statements ${chunk[0].id}..${chunk[chunk.length - 1].id}`,
            brief: [], statements: chunk, existing, frs: topFrs(ctx, [], text), br: null, actors: [], objects: []
        });
    }

    // 2. rule types with too few rules
    const counts = Object.fromEntries(TYPE_NAMES.map(t => [t, 0]));
    rules.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    for (const t of TYPE_NAMES) {
        if (counts[t] >= SETTINGS.minRulesPerType) continue;
        const id = `GAP-T-${t.replace(/\W+/g, '-').toLowerCase()}`;
        if (have.has(id)) continue;
        const ofType = rules.filter(r => r.type === t).map(r => cut(r.name, 60));
        const other = rules.filter(r => r.type !== t).map(r => cut(r.name, 60)).slice(0, 15);
        fresh.push({
            unit_id: id, kind: 'rule_type_gap', rule_type: t, title: `Rule type: ${t}`, brief: [],
            statements: [], existing: [...ofType, ...other], frs: topFrs(ctx, [], `${t} ${RULE_TYPES[t]}`),
            br: null, actors: [], objects: []
        });
    }
    log(`Rule types: ${TYPE_NAMES.map(t => `${t} ${counts[t]}`).join(', ')}`);

    if (!fresh.length) { log('No gaps to fill.'); return; }
    assignBatches(fresh, Math.max(0, ...plan.map(u => u.batch)) + 1);
    fs.writeFileSync(PLAN_FILE, JSON.stringify([...plan, ...fresh], null, 2));
    log(`Added ${fresh.length} gap unit(s) to the plan (${fresh.filter(u => u.kind === 'baseline_gap').length} baseline, ${fresh.filter(u => u.kind === 'rule_type_gap').length} rule type). Run generate.`);
}

// ============================================================
// 9. STEP: CONSOLIDATE (dedupe, link, tag, report)
// ============================================================

const SEV = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function consolidate(collected, plan, ctx) {
    const ground = new Set(ctx.groundNumbers || []);
    const sys = ctx.systemActors || [];
    const unitById = new Map(plan.map(u => [u.unit_id, u]));
    const canon = (list, ref, bucket) => uniq(list.map(n => {
        const hit = ref.find(x => same(x, n));
        if (!hit) bucket.push(n);
        return hit || n;
    }));
    const unmatched = { actors: [], objects: [] };

    // 1. normalise every raw rule
    const items = collected.map(({ unit, rule }, i) => {
        let tagged = 0;
        const tag = t => { const x = tagUngrounded(t, ground); if (x !== t) tagged++; return x; };
        const actors = canon(rule.actors.length ? rule.actors : unit.actors, ctx.actors, unmatched.actors);
        const objects = canon(rule.objects.length ? rule.objects : unit.objects, ctx.objects, unmatched.objects);
        return {
            ...rule, actors, objects,
            statement: tag(rule.statement), condition: tag(rule.condition),
            exceptions: rule.exceptions.map(tag), if_violated: tag(rule.if_violated),
            units: [unit.unit_id], order: i, tagged, merged_from: []
        };
    });

    // 2. dedupe near-identical rules, only inside the same type
    const merged = [];
    for (const type of TYPE_NAMES) {
        const group = items.filter(r => r.type === type);
        groupSimilar(group.map(r => `${r.name} ${r.name} ${r.statement} ${r.condition}`), SETTINGS.dedupeSim).forEach(g => {
            const members = g.members.map(i => group[i]);
            const primary = members.reduce((b, r) => (`${r.statement}${r.condition}`.length > `${b.statement}${b.condition}`.length ? r : b), members[0]);
            const rest = members.filter(r => r !== primary);
            const u = (k, cap) => uniq(members.flatMap(r => r[k])).slice(0, cap);
            const params = new Map();
            members.forEach(r => r.parameters.forEach(p => { if (!params.has(norm(p.name))) params.set(norm(p.name), p); }));
            merged.push({
                ...primary,
                exceptions: u('exceptions', 4), actors: u('actors', 10), objects: u('objects', 10),
                related_functional_requirements: u('related_functional_requirements', 12),
                parameters: [...params.values()].slice(0, 5),
                severity: members.reduce((s, r) => (SEV[r.severity] > SEV[s] ? r.severity : s), primary.severity),
                enforcement: members.every(r => r.enforcement === primary.enforcement) ? primary.enforcement : 'Both',
                basis: members.some(r => r.basis === 'baseline') ? 'baseline' : 'inferred',
                units: uniq(members.flatMap(r => r.units)), order: Math.min(...members.map(r => r.order)),
                tagged: members.reduce((n, r) => n + r.tagged, 0),
                merged_from: rest.map(r => `${r.units[0]}: ${r.name}`)
            });
        });
    }
    merged.sort((a, b) => TYPE_NAMES.indexOf(a.type) - TYPE_NAMES.indexOf(b.type) || a.order - b.order);

    // 3. links: functional requirements by similarity when the AI gave none, business requirements by overlap
    const frById = new Map(ctx.frs.map(f => [f.id, f]));
    let linkedBySimilarity = 0;
    merged.forEach(r => {
        r.fr_by_similarity = false;
        if (r.related_functional_requirements.length) return;
        const cands = uniq(r.units.flatMap(id => (unitById.get(id) || {}).frs || [])).map(id => frById.get(id)).filter(Boolean);
        if (!cands.length) return;
        const sim = crossSimilarity([ruleText(r)], cands.map(f => `${f.requirement} ${f.need}`))[0];
        const best = cands.map((f, i) => ({ id: f.id, v: sim[i] })).filter(x => x.v >= 0.1).sort((a, b) => b.v - a.v).slice(0, 2);
        if (best.length) { r.related_functional_requirements = best.map(x => x.id); r.fr_by_similarity = true; linkedBySimilarity++; }
    });
    merged.forEach(r => {
        const own = r.units.map(id => (unitById.get(id) || {}).br).filter(Boolean);
        const byFr = ctx.brs.filter(b => b.frs.some(f => r.related_functional_requirements.includes(f))).map(b => b.id);
        r.related_business_requirements = uniq([...own, ...byFr]);
    });

    // 4. final records
    const rules = merged.map((r, i) => ({
        rule_id: `RULE-${pad(i + 1)}`,
        rule_name: r.name,
        rule_statement: r.statement,
        rule_type: r.type,
        condition: r.condition,
        exceptions: r.exceptions,
        applies_to_actors: r.actors,
        applies_to_business_objects: r.objects,
        enforcement: r.enforcement,
        severity: r.severity,
        violation_handling: r.if_violated,
        rationale: r.rationale,
        parameters: r.parameters,
        related_business_requirements: r.related_business_requirements,
        related_functional_requirements: r.related_functional_requirements,
        basis: r.basis,
        status: 'Proposed'
    }));
    const trace = merged.map((r, i) => ({
        rule_id: rules[i].rule_id, source_units: r.units, merged_from: r.merged_from,
        numbers_marked_proposed: r.tagged, functional_requirements_linked_by_similarity: r.fr_by_similarity
    }));

    // 5. review: coverage in every direction
    const text = rules.map(r => `${r.rule_name} ${r.rule_statement} ${r.condition}`);
    const uncoveredBaseline = uncoveredStatements(ctx.statements, merged);
    const actNames = ctx.activities.map(a => `${a.name} ${a.precondition}`);
    const actSim = actNames.length && text.length ? crossSimilarity(actNames, text) : [];
    const typeCounts = Object.fromEntries(TYPE_NAMES.map(t => [t, rules.filter(r => r.rule_type === t).length]));
    const review = {
        total_rules: rules.length,
        duplicates_merged: trace.reduce((n, t) => n + t.merged_from.length, 0),
        rules_by_type: typeCounts,
        types_with_no_rules: TYPE_NAMES.filter(t => !typeCounts[t]),
        rules_by_basis: { baseline: rules.filter(r => r.basis === 'baseline').length, inferred: rules.filter(r => r.basis === 'inferred').length },
        severity: Object.fromEntries(Object.keys(SEV).map(s => [s, rules.filter(r => r.severity === s).length])),
        numbers_marked_proposed: trace.reduce((n, t) => n + t.numbers_marked_proposed, 0),
        functional_requirement_links_by_similarity: linkedBySimilarity,
        business_requirements_without_rules: ctx.brs.filter(b => !rules.some(r => r.related_business_requirements.includes(b.id))).map(b => b.id),
        business_objects_without_rules: ctx.objects.filter(o => !rules.some(r => r.applies_to_business_objects.some(x => same(x, o)))),
        actors_without_rules: ctx.actors.filter(a => !sys.includes(a) && !rules.some(r => r.applies_to_actors.some(x => same(x, a)))),
        activities_without_rules: ctx.activities.filter((_, i) => !actSim[i] || Math.max(...actSim[i]) < SETTINGS.coverSim).map(a => a.name),
        baseline_statements_total: ctx.statements.length,
        baseline_statements_not_reflected: uncoveredBaseline.length,
        baseline_statements_not_reflected_sample: uncoveredBaseline.slice(0, 10).map(s => `${s.id} (${s.origin}): ${cut(s.text, 100)}`),
        actors_not_in_knowledge_base: uniq(unmatched.actors), objects_not_in_knowledge_base: uniq(unmatched.objects)
    };
    return { rules, trace, review };
}

function stepConsolidate() {
    const ctx = loadContext();
    const plan = loadPlan();
    const collected = collectRules(plan);
    if (!collected.length) throw new Error('No generated rules found. Run generate first.');
    const missing = plan.filter(u => !fs.existsSync(unitFile(u))).length;

    const { rules, trace, review } = consolidate(collected, plan, ctx);
    fs.writeFileSync(FINAL_FILE, JSON.stringify({ business_rules: rules }, null, 2));
    fs.writeFileSync(TRACE_FILE, JSON.stringify({ review, business_rules: trace }, null, 2));

    log(`Wrote ${rules.length} business rules to ${FINAL_FILE}`);
    log(`By type: ${Object.entries(review.rules_by_type).map(([t, n]) => `${t} ${n}`).join(', ')}`);
    log(`Basis: ${review.rules_by_basis.baseline} baseline-derived, ${review.rules_by_basis.inferred} inferred. ` +
        `${review.duplicates_merged} duplicate(s) merged, ${review.numbers_marked_proposed} number(s) marked proposed.`);
    log(`Coverage gaps: ${review.business_requirements_without_rules.length} BR, ${review.business_objects_without_rules.length} objects, ` +
        `${review.actors_without_rules.length} actors, ${review.activities_without_rules.length} activities, ` +
        `${review.baseline_statements_not_reflected}/${review.baseline_statements_total} baseline statements not reflected.`);
    if (missing) log(`${missing} unit(s) have no result yet (rerun generate).`);
}

// ============================================================
// 10. MAIN
// ============================================================

const STEPS = { load: null, plan: stepPlan, generate: stepGenerate, gap: stepGap, consolidate: stepConsolidate };
// gap runs twice: the second pass catches what the first round of gap rules still left uncovered
const ALL = ['load', 'plan', 'generate', 'gap', 'generate', 'gap', 'generate', 'consolidate'];

async function main(cmd = process.argv[2] || 'all', injectedPool = null) {
    if (cmd !== 'all' && !(cmd in STEPS)) throw new Error(`Usage: ${Object.keys(STEPS).join(' | ')} | all`);
    const plan = cmd === 'all' ? ALL : [cmd];
    let pool = injectedPool;
    try {
        for (const step of plan) {
            if (step === 'load') { pool = pool || createPool(); await stepLoad(pool); }
            else await STEPS[step]();
        }
    } finally {
        if (pool && !injectedPool) await pool.end();
    }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { main, setRunner, validateRules, consolidate, parseFr, parseBr, flatten, tagUngrounded, normaliseType, buildUnits, uncoveredStatements };
