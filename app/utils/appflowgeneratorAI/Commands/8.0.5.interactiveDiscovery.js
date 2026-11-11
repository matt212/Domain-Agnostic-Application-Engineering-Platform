'use strict';

/**
 * 8.2.0 - AI-DISCOVERED FUNCTIONAL REQUIREMENTS
 *
 * The MODEL reasons about the business and decides what requirements exist.
 * The knowledge base is a BASELINE: every baseline item must be covered by a requirement
 * (checked in code, gaps sent back to the AI), and the AI then adds more beyond it.
 *
 *   node 8_2_0_aiFunctionalRequirements.js discover   Step 1: AI discovers requirement NAMES (several "lens" passes)
 *   node 8_2_0_aiFunctionalRequirements.js consolidate Step 1b: safe automatic dedupe of near-duplicates (no model call)
 *   node 8_2_0_aiFunctionalRequirements.js generate   Step 2: AI writes the full structure per requirement (resumable)
 *   node 8_2_0_aiFunctionalRequirements.js merge      Step 3: assemble final JSON
 *   node 8_2_0_aiFunctionalRequirements.js all
 *ONLY=FR-061,FR-062,FR-063,FR-064,FR-065,FR-066,FR-067,FR-068,FR-069,FR-070 caffeinate -i node app/utils/appflowgeneratorAI/commands/8.0.5.interactiveDiscovery.js generate
 * Between step 1 and 2 you can edit requirement_index.json (rename / delete / add).
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

// ============================================================
// 1. CONFIGURATION
// ============================================================

const ROOT = process.cwd();
const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';
const DB_CONFIG_PATH = path.join(ROOT, 'app/config/config.json');

const OUTPUT_DIR = path.join(
    ROOT,
    'app/utils/appflowgeneratorAI/aiOutput/functionalRequirements'
);
const WORK_DIR = path.join(OUTPUT_DIR, 'work');
const DISCOVERY_DIR = path.join(OUTPUT_DIR, 'discovery');
const INDEX_FILE = path.join(OUTPUT_DIR, 'requirement_index.json');
const RAW_INDEX_FILE = path.join(OUTPUT_DIR, 'requirement_index.raw.json');
const FINAL_FILE = path.join(OUTPUT_DIR, 'functional_requirements.json');
const TRACE_FILE = path.join(OUTPUT_DIR, 'functional_requirements.trace.json');

const SETTINGS = {
    threads: Number(process.env.THREADS || 6),
    batch: 512,
    temperature: 0.2,
    timeoutMs: 30 * 60 * 1000,
    heartbeatMs: 30000,
    retries: 1,

    discoverContext: 6144,
    discoverTokens: 700,
    namesPerPass: 8,
    digestChars: 7000,

    targetRequirements: Number(process.env.TARGET_REQUIREMENTS || 28),
    consolidateTokens: 1400,
    dedupeMinSim: Number(process.env.DEDUPE_MIN_SIM || 0.35),

    generateContext: 6144,
    generateTokens: 1000,
    evidenceRecords: 8,
    evidenceChars: 240
};

// Each pass makes the model look at the business from a different angle,
// so a small CPU model still covers the whole space.
const LENSES = [
    'End-to-end business workflows from first trigger to final outcome',
    'Business object creation, change, status lifecycle, cancellation and archival',
    'What each actor needs to do their job, including authorization and access control',
    'Business rules, validations, eligibility checks and regulatory compliance',
    'Integrations and information exchange with external parties and systems',
    'Exception handling, failure recovery, retry, rollback, disputes and refunds',
    'Financial controls, settlement, pricing, reporting, monitoring and auditability',
    'Important capabilities this business would need that are NOT mentioned in the context at all'
];

// Used only for the digest / naming reference / evidence.
const CATEGORIES = [
    'ACTOR_DEFINITION', 'ACTOR_RESPONSIBILITY', 'ACTOR_BUSINESS_OBJECT_RELATIONSHIP',
    'BUSINESS_OBJECT', 'BUSINESS_ACTIVITY', 'INFORMATION_REQUIREMENT',
    'BUSINESS_CONTEXT', 'BUSINESS_OPERATING_MODEL', 'BUSINESS_PRODUCT_SERVICE',
    'BUSINESS_LIFECYCLE_STAGE', 'BUSINESS_OUTCOME', 'BUSINESS_FUNCTION'
];
const CONTEXT_CATEGORIES = [
    'BUSINESS_CONTEXT', 'BUSINESS_OPERATING_MODEL', 'BUSINESS_PRODUCT_SERVICE',
    'BUSINESS_LIFECYCLE_STAGE', 'BUSINESS_OUTCOME'
];

// ============================================================
// 2. HELPERS
// ============================================================

const log = m => console.log(`[8.2.0] ${new Date().toISOString()} ${m}`);
const arr = v => (Array.isArray(v) ? v : v ? [v] : []);
const uniq = l => [...new Set(l.filter(Boolean))];
const pad = n => String(n).padStart(3, '0');
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

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'shall',
    'system', 'their', 'have', 'been', 'will', 'such', 'each', 'when', 'then', 'which', 'based']);
const tokens = s => norm(s).split(' ').filter(w => w.length >= 4 && !STOP.has(w));

function jaccard(a, b) {
    const x = new Set(tokens(a)), y = new Set(tokens(b));
    if (!x.size || !y.size) return 0;
    let hit = 0;
    for (const t of x) if (y.has(t)) hit++;
    return hit / (x.size + y.size - hit);
}

function inner(row) {
    let c = row.content;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch { return {}; } }
    c = c || {};
    let b = c.content !== undefined ? c.content : c;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return {}; } }
    return b && typeof b === 'object' ? b : {};
}

function flatText(o) {
    if (o == null) return '';
    if (typeof o !== 'object') return String(o);
    return Object.values(o).map(flatText).join(' ');
}

function irLabel(d) {
    return d.information_requirement || d.requirement_name || d.name ||
        d.title || d.information_name || cut(d.description, 70);
}

// ============================================================
// 3. DATABASE (context only)
// ============================================================

function createPool() {
    const cfg = JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8')).development;
    return new Pool({
        user: cfg.username, password: cfg.password, database: cfg.database,
        host: cfg.host, port: Number(cfg.port), max: 2
    });
}

async function loadKnowledge(pool) {
    const r = await pool.query(
        `SELECT record_id, semantic_category, content
           FROM knowledge_records
          WHERE semantic_category = ANY($1)
          ORDER BY record_id`, [CATEGORIES]);
    const recs = r.rows.map(row => {
        const d = inner(row);
        return { id: row.record_id, category: row.semantic_category, data: d, text: flatText(d) };
    });
    const by = c => recs.filter(x => x.category === c);
    return {
        recs,
        actors: uniq([...by('ACTOR_DEFINITION').map(x => x.data.actor_name),
            ...by('ACTOR_RESPONSIBILITY').map(x => x.data.actor)]),
        objects: uniq(by('BUSINESS_OBJECT').map(x => x.data.object_name)),
        infoReqs: uniq(by('INFORMATION_REQUIREMENT').map(x => irLabel(x.data))),
        by
    };
}

// compact picture of the business for the discovery prompt
function buildDigest(k) {
    const lines = [];
    const ctx = CONTEXT_CATEGORIES.flatMap(c => k.by(c)).slice(0, 8);
    if (ctx.length) lines.push('BUSINESS CONTEXT:', ...ctx.map(x => `- ${cut(x.text, 170)}`));

    lines.push('ACTORS:', ...k.by('ACTOR_DEFINITION')
        .map(x => `- ${x.data.actor_name}: ${cut(x.data.operational_role, 90)}`));
    lines.push('BUSINESS OBJECTS:', ...k.by('BUSINESS_OBJECT')
        .map(x => `- ${x.data.object_name}: ${cut(x.data.purpose, 80)}`));
    lines.push('ACTIVITIES:', ...k.by('BUSINESS_ACTIVITY')
        .map(x => `- ${x.data.activity_name} (${x.data.primary_actor}): ${cut(x.data.business_outcome, 80)}`));
    lines.push('INFORMATION NEEDS:', ...k.infoReqs.map(n => `- ${cut(n, 90)}`));

    const full = lines.join('\n');
    if (full.length > SETTINGS.digestChars) log(`WARNING: digest truncated ${full.length} -> ${SETTINGS.digestChars} chars. Raise digestChars/context.`);
    return full.slice(0, SETTINGS.digestChars);
}

// top-k records most related to a requirement (word overlap, no vectors needed at this size)
function retrieveEvidence(k, query) {
    const q = new Set(tokens(query));
    const scored = k.recs.map(r => {
        const t = tokens(r.text);
        let s = 0;
        for (const w of t) if (q.has(w)) s++;
        return { r, s: s / Math.sqrt(t.length || 1) };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    return scored.slice(0, SETTINGS.evidenceRecords)
        .map(x => `[${x.r.category}] ${cut(x.r.text, SETTINGS.evidenceChars)}`);
}

// ============================================================
// 4. LOCAL MODEL
// ============================================================

function runModel(label, prompt, context, maxTokens, opts = {}) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let out = '';
        const args = [
            '-hf', MODEL, '-c', String(context), '-n', String(maxTokens),
            '-t', String(SETTINGS.threads), '-b', String(SETTINGS.batch), '-ngl', '0',
            '--temp', String(SETTINGS.temperature), '--reasoning', 'off',
            '--no-display-prompt', '--simple-io', '--log-disable', '-st', '-p', prompt
        ];
        const child = spawn(LLAMA_CLI, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
        const hb = setInterval(() => log(
            `${label} running ${((Date.now() - started) / 1000).toFixed(0)}s, ${out.length} bytes`
        ), SETTINGS.heartbeatMs);
        const to = setTimeout(() => {
            child.kill('SIGKILL');
            if (opts.salvage && out.length) { clearInterval(hb); resolve(out); }
            else reject(new Error('timeout'));
        }, SETTINGS.timeoutMs);
        child.stdout.on('data', d => { out += d.toString(); });
        child.on('error', e => { clearInterval(hb); clearTimeout(to); reject(e); });
        child.on('close', () => { clearInterval(hb); clearTimeout(to); resolve(out); });
    });
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

const NO_THINK = '<think>\n\n</think>\n\n';

// ============================================================
// 5. STEP 1 - AI DISCOVERS REQUIREMENT NAMES
// ============================================================

function discoverPrompt(digest, lens, found) {
    return `<|im_start|>system
You are a senior enterprise business analyst and functional requirements architect.

Read the business context. Then use your OWN business reasoning to decide
which functional requirements this business application needs.

The context is background, NOT a checklist and NOT a limit. Include requirements
the context never mentions if the business would logically need them.
Do not invent specific policies, thresholds, vendors or technologies.

Each requirement must be one distinct capability, named in 3 to 8 words.

Return ONLY JSON:
{"requirements":[{"name":"Short requirement name","summary":"One sentence: what the system must enable"}]}

Return ${SETTINGS.namesPerPass} requirements. No Markdown, no commentary.
<|im_end|>
<|im_start|>user
BUSINESS CONTEXT:
${digest}

FOCUS FOR THIS PASS: ${lens}

ALREADY DISCOVERED (do not repeat or rephrase these):
${found.length ? found.map(f => `- ${f.name}`).join('\n') : '(none yet)'}

Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

function addDiscovered(found, items, lens) {
    let added = 0;
    for (const it of arr(items)) {
        const name = cut(it && it.name, 90);
        if (!name) continue;
        const summary = cut(it.summary, 220);
        const dup = found.some(f => same(f.name, name) || jaccard(f.name + ' ' + f.summary, name + ' ' + summary) >= 0.6);
        if (dup) continue;
        found.push({ name, summary, lens });
        added++;
    }
    return added;
}

// ---- baseline coverage: the knowledge base is the FLOOR, the AI goes beyond it ----

function baselineItems(k) {
    const items = [];
    for (const x of k.by('BUSINESS_ACTIVITY'))
        items.push({ type: 'activity', label: x.data.activity_name, detail: cut(x.data.business_outcome || x.data.activity_description, 120) });
    for (const x of k.by('BUSINESS_OBJECT'))
        items.push({ type: 'business object', label: x.data.object_name, detail: cut(x.data.purpose, 120) });
    for (const x of k.by('INFORMATION_REQUIREMENT'))
        items.push({ type: 'information need', label: irLabel(x.data), detail: cut(x.data.business_purpose || x.data.description, 120) });
    return items.filter(i => tokens(i.label).length);
}

// words that appear in many baseline labels ("order", "delivery") prove nothing about coverage
function genericTokens(items) {
    const df = new Map();
    for (const it of items) for (const w of new Set(tokens(it.label))) df.set(w, (df.get(w) || 0) + 1);
    const limit = Math.max(3, items.length * 0.15);
    return new Set([...df].filter(([, n]) => n > limit).map(([w]) => w));
}

// covered when at least half of an item's DISTINCTIVE label words appear in the requirement
function coveredBy(item, found, generic = new Set()) {
    const all = tokens(item.label);
    let L = all.filter(w => !generic.has(w)), need = 0.5;
    if (!L.length) { L = all; need = 0.75; }
    return found.filter(f => {
        const T = new Set(tokens(`${f.name} ${f.summary}`));
        return L.length && L.filter(w => T.has(w)).length / L.length >= need;
    });
}

function gapPrompt(digest, uncovered, found) {
    return `<|im_start|>system
You are a senior enterprise business analyst and functional requirements architect.

The business knowledge below is a BASELINE. Every baseline item must be
supported by at least one functional requirement. Using your own business
reasoning, write requirements that cover the uncovered baseline items listed.
Merge closely related items into one requirement; split large ones if needed.
You may also add related requirements the baseline implies but does not state.

Each requirement is one distinct capability, named in 3 to 8 words.
Do not invent specific policies, thresholds, vendors or technologies.

Return ONLY JSON:
{"requirements":[{"name":"Short requirement name","summary":"One sentence: what the system must enable"}]}
No Markdown, no commentary.
<|im_end|>
<|im_start|>user
BUSINESS CONTEXT:
${digest}

UNCOVERED BASELINE ITEMS:
${uncovered.map(i => `- [${i.type}] ${i.label}: ${i.detail}`).join('\n')}

ALREADY DISCOVERED (do not repeat these):
${found.map(f => `- ${f.name}`).join('\n')}

Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

async function runPass(label, file, promptFn) {
    if (fs.existsSync(file)) { log(`${label} loaded from disk.`); return JSON.parse(fs.readFileSync(file, 'utf8')); }
    for (let a = 0; a <= SETTINGS.retries; a++) {
        try {
            const raw = await runModel(label, promptFn(), SETTINGS.discoverContext, SETTINGS.discoverTokens);
            const j = extractJson(raw);
            if (!Array.isArray(j.requirements)) throw new Error('missing requirements array');
            fs.writeFileSync(file, JSON.stringify(j, null, 2));
            return j;
        } catch (e) { log(`${label} attempt ${a + 1} rejected: ${e.message}`); }
    }
    log(`${label} failed; rerun discover to retry.`);
    return null;
}

async function stepDiscover(pool) {
    const k = await loadKnowledge(pool);
    const digest = buildDigest(k);
    const items = baselineItems(k);
    const generic = genericTokens(items);
    log(`Digest: ${digest.length} chars from ${k.recs.length} records. Baseline items to cover: ${items.length}.`);

    fs.mkdirSync(DISCOVERY_DIR, { recursive: true });
    const found = [];

    // Phase 1: AI reasons freely, one lens at a time
    for (let i = 0; i < LENSES.length; i++) {
        const j = await runPass(`discover pass ${i + 1}`, path.join(DISCOVERY_DIR, `pass_${i + 1}.json`),
            () => discoverPrompt(digest, LENSES[i], found));
        if (!j) continue;
        const n = addDiscovered(found, j.requirements, LENSES[i]);
        log(`Pass ${i + 1}/${LENSES.length}: +${n} (total ${found.length}). Lens: ${LENSES[i]}`);
    }

    // Phase 2: the baseline must be covered; AI fills what its free reasoning missed
    for (let round = 1; round <= 3; round++) {
        const uncovered = items.filter(i => !coveredBy(i, found, generic).length);
        log(`Baseline coverage: ${items.length - uncovered.length}/${items.length} covered.`);
        if (!uncovered.length) break;
        const batch = uncovered.slice(0, 10);
        const j = await runPass(`baseline gap pass ${round}`, path.join(DISCOVERY_DIR, `gap_${round}.json`),
            () => gapPrompt(digest, batch, found));
        if (!j) break;
        const n = addDiscovered(found, j.requirements, 'baseline coverage');
        log(`Gap pass ${round}: +${n} (total ${found.length}).`);
    }

    const index = found.map((f, i) => {
        const covers = items.filter(it => coveredBy(it, [f], generic).length).map(it => `${it.type}: ${it.label}`);
        return {
            requirement_id: `FR-${pad(i + 1)}`,
            requirement_name: f.name,
            summary: f.summary,
            origin: covers.length ? 'baseline_covered' : 'ai_extension',
            covers_baseline: covers,
            lens: f.lens
        };
    });
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));

    const stillUncovered = items.filter(i => !coveredBy(i, found, generic).length);
    log(`Discovered ${index.length} requirements ` +
        `(${index.filter(r => r.origin === 'baseline_covered').length} cover baseline, ` +
        `${index.filter(r => r.origin === 'ai_extension').length} are AI extensions beyond the baseline).`);
    index.forEach(r => console.log(`  ${r.requirement_id}  [${r.origin === 'ai_extension' ? 'AI+' : 'base'}]  ${r.requirement_name}`));
    if (stillUncovered.length) {
        log(`Baseline items still not matched by name (check manually): ${stillUncovered.map(i => i.label).join('; ')}`);
    }
    log(`Saved ${INDEX_FILE}. Edit it if you want, then run: generate`);
}

// ============================================================
// 5b. CONSOLIDATE - AI merges overlapping requirements into a manageable set
// ============================================================

function consolidatePrompt(raw, target) {
    return `<|im_start|>system
You consolidate a long, overlapping list of numbered functional requirement names
into a clean set of about ${target} business capabilities.

Group items that describe the same capability or business outcome.
Keep genuinely different capabilities in separate groups.
Name each group at business-capability level, 3 to 8 words.
Every number must appear in exactly one group.

Return ONLY compact JSON, no summaries, no commentary:
{"groups":[{"name":"<your own capability name>","ids":[1,5,9]}]}
<|im_end|>
<|im_start|>user
${raw.map((r, i) => `${i + 1}: ${r.requirement_name}`).join('\n')}

Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

// Works even if the output was cut off: keeps every COMPLETE {"name":..,"ids":[..]} group.
function parseGroups(rawText, raw) {
    const text = String(rawText).replace(/<think>[\s\S]*?<\/think>/g, '');
    const re = /\{\s*"name"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"ids"\s*:\s*\[([\d,\s]*)\]\s*\}/g;
    const groups = [];
    let m;
    while ((m = re.exec(text))) {
        const merges = m[2].split(',').map(x => parseInt(x, 10))
            .filter(n => n >= 1 && n <= raw.length).map(n => raw[n - 1].requirement_id);
        if (merges.length) groups.push({ name: m[1].replace(/\\"/g, '"'), summary: '', merges });
    }
    return groups;
}

// ---- Domain-agnostic, no-model dedupe: TF-IDF cosine + average-linkage clustering ----
// IDF is computed from the list itself, so generic words of ANY domain get low weight.

function stem(w) {
    if (w.length > 5) w = w.replace(/(ations?|ates?|ated|ating|ions?|ings?|ments?)$/, '');
    if (w.length > 4) w = w.replace(/(ies|ied)$/, 'y').replace(/(ed|es|s)$/, '');
    if (w.length > 4) w = w.replace(/e$/, '');
    return w;
}
const stemTokens = text => tokens(text).map(stem);

function tfidfVectors(texts) {
    const docs = texts.map(stemTokens), df = new Map();
    docs.forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
    const N = docs.length;
    return docs.map(d => {
        const v = new Map();
        d.forEach(w => v.set(w, (v.get(w) || 0) + Math.log((N + 1) / (df.get(w) + 1)) + 1));
        const norm2 = Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0)) || 1;
        v.forEach((x, k) => v.set(k, x / norm2));
        return v;
    });
}

function cosine(a, b) {
    let sum = 0;
    for (const [k, x] of a) { const y = b.get(k); if (y) sum += x * y; }
    return sum;
}

// merge the most similar clusters until `target` is reached or nothing is similar enough
function clusterRequirements(raw, target, minSim) {
    const V = tfidfVectors(raw.map(r => `${r.requirement_name} ${r.requirement_name} ${r.summary || ''}`));
    const n = V.length;
    const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : cosine(V[i], V[j]))));
    const link = (a, b) => { let t = 0; for (const i of a) for (const j of b) t += S[i][j]; return t / (a.length * b.length); };
    let cl = V.map((_, i) => [i]);
    while (cl.length > target) {
        let best = -1, bi = 0, bj = 0;
        for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
            const l = link(cl[i], cl[j]);
            if (l > best) { best = l; bi = i; bj = j; }
        }
        if (best < minSim) break;
        cl[bi] = cl[bi].concat(cl[bj]);
        cl.splice(bj, 1);
    }
    // name each cluster after its most central member (the one most similar to the rest)
    return cl.map(c => {
        const medoid = c.reduce((b, i) => {
            const sc = c.reduce((t, j) => t + S[i][j], 0);
            return sc > b.sc ? { i, sc } : b;
        }, { i: c[0], sc: -1 }).i;
        return { name: raw[medoid].requirement_name, summary: raw[medoid].summary || '', merges: c.map(i => raw[i].requirement_id) };
    });
}

// Pure + testable: nothing discovered is ever dropped.
function applyConsolidation(raw, groups, items) {
    const byId = new Map(raw.map(r => [r.requirement_id, r]));
    const seen = new Set();
    const merged = [];

    for (const g of arr(groups)) {
        const members = arr(g.merges).filter(id => byId.has(id) && !seen.has(id));
        if (!members.length || !g.name) continue;
        members.forEach(id => seen.add(id));
        merged.push({ name: cut(g.name, 90), summary: cut(g.summary || byId.get(members[0]).summary, 220), members });
    }

    for (const r of raw.filter(r => !seen.has(r.requirement_id))) {
        let best = null, score = 0;
        for (const m of merged) {
            const sc = jaccard(r.requirement_name, `${m.name} ${m.summary}`);
            if (sc > score) { score = sc; best = m; }
        }
        if (best && score >= 0.15) best.members.push(r.requirement_id);
        else merged.push({ name: r.requirement_name, summary: r.summary, members: [r.requirement_id] });
    }

    const generic = genericTokens(items);
    return merged.map((m, i) => {
        const rows = m.members.map(id => byId.get(id));
        const text = { name: m.name, summary: `${m.summary} ${rows.map(r => `${r.requirement_name} ${r.summary}`).join(' ')}` };
        const covers = items.filter(it => coveredBy(it, [text], generic).length).map(it => `${it.type}: ${it.label}`);
        return {
            requirement_id: `FR-${pad(i + 1)}`,
            requirement_name: m.name,
            summary: m.summary,
            origin: covers.length ? 'baseline_covered' : 'ai_extension',
            covers_baseline: covers,
            lens: uniq(rows.map(r => r.lens))[0],
            merged_from: rows.map(r => `${r.requirement_id} ${r.requirement_name}`)
        };
    });
}

async function stepConsolidate(pool) {
    if (!fs.existsSync(RAW_INDEX_FILE)) {
        if (!fs.existsSync(INDEX_FILE)) throw new Error('Run "discover" first.');
        fs.copyFileSync(INDEX_FILE, RAW_INDEX_FILE);
    }
    const raw = JSON.parse(fs.readFileSync(RAW_INDEX_FILE, 'utf8'));
    const items = baselineItems(await loadKnowledge(pool));
    fs.mkdirSync(DISCOVERY_DIR, { recursive: true });

    const overrideFile = path.join(DISCOVERY_DIR, 'consolidation.override.json');
    let groups = null;

    if (fs.existsSync(overrideFile)) {
        groups = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
        log(`Using your manual override: ${overrideFile}`);
    } else if (process.env.CONSOLIDATE_WITH_LLM === '1') {
        // Opt-in: only worthwhile with a model strong enough to restructure a long list.
        log(`Consolidating ${raw.length} requirements with the model toward ~${SETTINGS.targetRequirements}...`);
        const file = path.join(DISCOVERY_DIR, 'consolidation.llm.json');
        if (fs.existsSync(file)) { groups = JSON.parse(fs.readFileSync(file, 'utf8')); log('LLM consolidation loaded from disk.'); }
        else {
            for (let a = 0; a <= SETTINGS.retries && !groups; a++) {
                try {
                    const out = await runModel('consolidate', consolidatePrompt(raw, SETTINGS.targetRequirements),
                        SETTINGS.discoverContext, SETTINGS.consolidateTokens, { salvage: true });
                    const g = parseGroups(out, raw).filter(x => !/your own capability name/i.test(x.name));
                    if (g.length < 3) throw new Error(`only ${g.length} usable groups parsed`);
                    groups = { requirements: g };
                    fs.writeFileSync(file, JSON.stringify(groups, null, 2));
                } catch (e) { log(`consolidate attempt ${a + 1} rejected: ${e.message}`); }
            }
        }
    } else {
        log(`Deduplicating ${raw.length} requirements (no model call, similarity >= ${SETTINGS.dedupeMinSim}, target ~${SETTINGS.targetRequirements})...`);
        groups = { requirements: clusterRequirements(raw, SETTINGS.targetRequirements, SETTINGS.dedupeMinSim) };
    }
    if (!groups) throw new Error('Consolidation failed; rerun consolidate (raw list is untouched).');

    const index = applyConsolidation(raw, groups.requirements, items);
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));

    const generic = genericTokens(items);
    const uncovered = items.filter(it => !index.some(r => coveredBy(it, [{
        name: r.requirement_name, summary: `${r.summary} ${r.merged_from.join(' ')}`
    }], generic).length));
    log(`Consolidated ${raw.length} -> ${index.length} requirements ` +
        `(${index.filter(r => r.origin === 'baseline_covered').length} cover baseline, ` +
        `${index.filter(r => r.origin === 'ai_extension').length} AI extensions). ` +
        `Baseline covered: ${items.length - uncovered.length}/${items.length}.`);
    index.forEach(r => console.log(`  ${r.requirement_id}  [${r.origin === 'ai_extension' ? 'AI+' : 'base'}]  ${r.requirement_name}  (merged ${r.merged_from.length})`));
    if (uncovered.length) log(`Baseline items not clearly covered: ${uncovered.map(i => i.label).join('; ')}`);
    log(`Saved ${INDEX_FILE} (raw list kept in requirement_index.raw.json). Edit if you want, then run: generate`);
}

// ============================================================
// 6. STEP 2 - AI WRITES EACH FULL REQUIREMENT
// ============================================================

function relatedNames(entry) {
    return arr(entry.merged_from).map(x => String(x).replace(/^FR-\d+\s*/, ''))
        .filter(n => n && !same(n, entry.requirement_name));
}

function generatePrompt(entry, k, evidence, hint) {
    return `<|im_start|>system
You are a senior business analyst writing ONE complete functional requirement.

Reason about the business yourself. The reference lists and evidence are
background to keep naming consistent; you may add actors, objects, information
needs or rules that are not listed if the requirement logically needs them.
Do not invent specific numeric thresholds, vendors or technologies.

Prefer these exact names where they fit:
ACTORS: ${k.actors.join('; ')}
BUSINESS OBJECTS: ${k.objects.join('; ')}

Return ONLY this JSON:
{
  "requirement": "The system shall ...",
  "business_need": "one sentence on why the business needs this",
  "functional_behaviour": ["3 to 6 statements, each starting with 'The system shall'"],
  "required_by_actors": ["actor names"],
  "related_business_objects": ["business object names"],
  "related_information_requirements": ["information the system must capture, hold or expose"],
  "business_rules": ["2 to 5 testable rules, no invented numbers"],
  "acceptance_criteria": [
    {"given": "...", "when": "...", "then": "..."},
    {"given": "...", "when": "...", "then": "..."}
  ]
}

Rules: exactly 2 acceptance_criteria (one normal flow, one exception flow).
Every string under 220 characters. No Markdown, no commentary.
<|im_end|>
<|im_start|>user
REQUIREMENT TO WRITE: ${entry.requirement_name}
INTENT: ${entry.summary || ''}
${relatedNames(entry).length ? `THIS REQUIREMENT MUST ALSO COVER THESE RELATED CAPABILITIES (they were merged into it):\n${relatedNames(entry).map(n => `- ${n}`).join('\n')}\n` : ''}
SUPPORTING EVIDENCE FROM THE KNOWLEDGE BASE (may be incomplete):
${evidence.length ? evidence.map(e => `- ${e}`).join('\n') : '(none found)'}
${hint ? `\nYour previous answer was rejected: ${hint}\nFix it.\n` : ''}
Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

function cleanList(v, min, field) {
    const out = uniq(arr(v).map(x => cut(x, 220)));
    if (out.length < min) throw new Error(`${field} needs at least ${min} item(s)`);
    return out;
}

function validateFull(o) {
    const s = v => typeof v === 'string' && v.trim().length > 0;
    if (!s(o.requirement) || !/^the system shall/i.test(o.requirement.trim()))
        throw new Error('requirement must start with "The system shall"');
    if (!s(o.business_need)) throw new Error('business_need missing');
    if (!Array.isArray(o.acceptance_criteria) || !o.acceptance_criteria.length ||
        !o.acceptance_criteria.every(c => c && s(c.given) && s(c.when) && s(c.then)))
        throw new Error('acceptance_criteria need given/when/then');
    return {
        requirement: o.requirement.trim(),
        business_need: o.business_need.trim(),
        functional_behaviour: cleanList(o.functional_behaviour, 2, 'functional_behaviour'),
        required_by_actors: cleanList(o.required_by_actors, 1, 'required_by_actors'),
        related_business_objects: uniq(arr(o.related_business_objects).map(x => cut(x, 120))),
        related_information_requirements: uniq(arr(o.related_information_requirements).map(x => cut(x, 220))),
        business_rules: cleanList(o.business_rules, 1, 'business_rules'),
        acceptance_criteria: o.acceptance_criteria.map(c => ({
            given: c.given.trim(), when: c.when.trim(), then: c.then.trim()
        }))
    };
}

// Snap model names to the knowledge base spelling when they match; report the rest.
function canonicalise(k, r) {
    const unmatched = { actors: [], objects: [] };
    const snap = (list, ref, bucket) => uniq(list.map(n => {
        const hit = ref.find(x => same(x, n));
        if (!hit) bucket.push(n);
        return hit || n;
    }));
    r.required_by_actors = snap(r.required_by_actors, k.actors, unmatched.actors);
    r.related_business_objects = snap(r.related_business_objects, k.objects, unmatched.objects);
    r.related_information_requirements = uniq(r.related_information_requirements.map(n =>
        k.infoReqs.find(x => same(x, n)) || n));
    return unmatched;
}

async function stepGenerate(pool) {
    if (!fs.existsSync(INDEX_FILE)) throw new Error('Run "discover" first.');
    let index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    if (process.env.ONLY) {
        const only = new Set(process.env.ONLY.split(',').map(x => x.trim()));
        index = index.filter(e => only.has(e.requirement_id));
    }
    if (process.env.LIMIT) index = index.slice(0, Number(process.env.LIMIT));
    const k = await loadKnowledge(pool);
    fs.mkdirSync(WORK_DIR, { recursive: true });

    let done = 0, failed = 0;
    for (const entry of index) {
        const file = path.join(WORK_DIR, `${entry.requirement_id}.json`);
        if (fs.existsSync(file)) { done++; continue; }

        const evidence = retrieveEvidence(k, `${entry.requirement_name} ${entry.summary || ''} ${relatedNames(entry).join(' ')}`);
        const started = Date.now();
        let hint = '', result = null;

        for (let a = 0; a <= SETTINGS.retries && !result; a++) {
            const label = `${entry.requirement_id} attempt ${a + 1}`;
            try {
                const raw = await runModel(label, generatePrompt(entry, k, evidence, hint),
                    SETTINGS.generateContext, SETTINGS.generateTokens);
                result = validateFull(extractJson(raw));
            } catch (e) { hint = e.message; log(`${label} rejected: ${hint}`); }
        }
        if (!result) { failed++; log(`${entry.requirement_id} FAILED; rerun generate to retry.`); continue; }

        const unmatched = canonicalise(k, result);
        fs.writeFileSync(file, JSON.stringify({ result, unmatched, evidence_count: evidence.length }, null, 2));
        done++;
        log(`${entry.requirement_id} done in ${((Date.now() - started) / 1000).toFixed(0)}s (${done}/${index.length})`);
    }
    log(`Generate finished. done=${done} failed=${failed}`);
}

// ============================================================
// 7. STEP 3 - MERGE
// ============================================================

function stepMerge() {
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const requirements = [], trace = [], missing = [];

    for (const e of index) {
        const file = path.join(WORK_DIR, `${e.requirement_id}.json`);
        if (!fs.existsSync(file)) { missing.push(e.requirement_id); continue; }
        const { result, unmatched } = JSON.parse(fs.readFileSync(file, 'utf8'));
        const id = `FR-${pad(requirements.length + 1)}`;
        requirements.push({
            requirement_id: id,
            requirement: result.requirement,
            business_need: result.business_need,
            functional_behaviour: result.functional_behaviour,
            required_by_actors: result.required_by_actors,
            related_business_objects: result.related_business_objects,
            related_information_requirements: result.related_information_requirements,
            business_rules: result.business_rules,
            acceptance_criteria: result.acceptance_criteria
        });
        trace.push({
            requirement_id: id, requirement_name: e.requirement_name, lens: e.lens,
            origin: e.origin, covers_baseline: e.covers_baseline || [],
            actors_not_in_knowledge_base: unmatched.actors,
            objects_not_in_knowledge_base: unmatched.objects
        });
    }

    fs.writeFileSync(FINAL_FILE, JSON.stringify({ functional_requirements: requirements }, null, 2));
    fs.writeFileSync(TRACE_FILE, JSON.stringify(trace, null, 2));
    log(`Wrote ${requirements.length} requirements to ${FINAL_FILE}`);
    if (missing.length) log(`Not generated yet: ${missing.join(', ')}`);
}

// ============================================================
// 8. MAIN
// ============================================================

async function main() {
    const cmd = process.argv[2] || 'all';
    if (!['discover', 'consolidate', 'generate', 'merge', 'all'].includes(cmd))
        throw new Error('Usage: discover | consolidate | generate | merge | all');
    const pool = cmd === 'merge' ? null : createPool();
    try {
        if (cmd === 'discover' || cmd === 'all') await stepDiscover(pool);
        if (cmd === 'consolidate' || cmd === 'all') await stepConsolidate(pool);
        if (cmd === 'generate' || cmd === 'all') await stepGenerate(pool);
        if (cmd === 'merge' || cmd === 'all') stepMerge();
    } finally {
        if (pool) await pool.end();
    }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { generatePrompt, clusterRequirements, parseGroups, applyConsolidation, genericTokens, baselineItems, coveredBy, buildDigest, retrieveEvidence, addDiscovered, validateFull, canonicalise, extractJson };