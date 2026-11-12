'use strict';

/**
 * 8.3.0 - BUSINESS REQUIREMENTS (domain agnostic, end to end)
 *
 * Baseline : the consolidated functional requirements + the knowledge base, both read from PostgreSQL.
 * AI       : answers a fixed set of business-analyst QUESTIONS about the business, which produces
 *            business needs (including needs the functional requirements do not cover),
 *            then writes each business requirement in full.
 * Code     : dedupes, links functional requirements, validates, and reports gaps both ways.
 *
 *   node 8_3_0_businessRequirements.js all
 * or step by step (each step is resumable):
 *   load -> interview -> draft -> generate -> merge
 *
 * Runs entirely on your local llama-cli (MODEL_NAME, LLAMA_CLI_PATH, THREADS). Nothing leaves the machine.
 * Smoke test first:  LIMIT=2 node 8_3_0_businessRequirements.js all
 */

const fs = require('fs');
const crypto = require('crypto');
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

const OUTPUT_DIR = process.env.BR_OUTPUT_DIR ||
    path.join(ROOT, 'app/utils/appflowgeneratorAI/aiOutput/businessRequirements');
const INTERVIEW_DIR = path.join(OUTPUT_DIR, 'interview');
const WORK_DIR = path.join(OUTPUT_DIR, 'work');
const CONTEXT_FILE = path.join(OUTPUT_DIR, 'context.json');
let timezone=getFormattedDateTime()
const INDEX_FILE = path.join(OUTPUT_DIR, `business_requirement_index-${timezone}.json`);
const FINAL_FILE = path.join(OUTPUT_DIR, `business_requirements-${timezone}.json`);
const TRACE_FILE = path.join(OUTPUT_DIR, `business_requirements-${timezone}.trace.json`);

// functional requirements are found in knowledge_ingestion_runs / knowledge_records by file name
const FR_SOURCE_FILE = process.env.FR_SOURCE_FILE || null;
const FR_SOURCE_PATTERN = process.env.FR_SOURCE_PATTERN || '%consolidated-Functional-Requirements%';

const SETTINGS = {
    threads: Number(process.env.THREADS || 6),
    batch: 512,
    temperature: 0.2,
    timeoutMs: 300 * 60 * 1000,
    heartbeatMs: 30000,
    retries: 1,
    context: 6144,

    digestChars: 7000,
    briefChars: 4500,
    interviewTokens: 1900,
    writeTokens: 9900,

    targetRequirements: Number(process.env.TARGET_BUSINESS_REQUIREMENTS || 25),
    dedupeMinSim: Number(process.env.DEDUPE_MIN_SIM || 0.35),
    orphanSim: Number(process.env.ORPHAN_SIM || 0.10),
    extraCandidates: 6,
    maxCandidates: 14
};

// Generic questions: no domain words. The AI answers them from the baseline.
const QUESTIONS = [
    { id: 'Q01', q: 'Why does this business exist, and what value must it deliver to each kind of customer or beneficiary?' },
    { id: 'Q02', q: 'What outcomes would the business sponsor use to judge success, and how would each be measured?' },
    { id: 'Q03', q: 'Who are the stakeholders, and what does each of them need from this business that is not yet captured?' },
    { id: 'Q04', q: 'How does the business earn money or sustain itself, and what threatens that?' },
    { id: 'Q05', q: 'What are the biggest operational, financial, legal and reputational risks, and what controls does the business need?' },
    { id: 'Q06', q: 'Which regulations, policies or external obligations constrain how the business may operate?' },
    { id: 'Q07', q: 'When things go wrong (failures, disputes, fraud, abuse, outages), what must the business guarantee?' },
    { id: 'Q08', q: 'What must be true for the business to grow: more volume, more locations, more partners, more offerings?' },
    { id: 'Q09', q: 'What information, reporting and visibility does the business need to run itself and improve?' },
    { id: 'Q10', q: 'Which third-party dependencies could stop the business, and what protection does it need?' },
    { id: 'Q11', q: 'What would an experienced business analyst expect in this kind of business that is missing from the functional requirements?' },
    { id: 'Q12', q: 'What must be in place before launch, and what can safely follow later?' }
];

// category -> how many records to show in the digest
const DIGEST_CATEGORIES = [
    ['BUSINESS_CONTEXT', 4], ['BUSINESS_OPERATING_MODEL', 4], ['BUSINESS_PRODUCT_SERVICE', 6],
    ['BUSINESS_OUTCOME', 8], ['BUSINESS_FUNCTION', 8], ['BUSINESS_MONETIZATION_MODEL', 4],
    ['MONETIZATION_STREAM', 6], ['BUSINESS_LIFECYCLE_STAGE', 12], ['ACTOR_DEFINITION', 12],
    ['BUSINESS_OBJECT', 20], ['BUSINESS_ASSUMPTION', 8], ['UNRESOLVED_DEPENDENCY', 6],
    ['EVIDENCE_GAP', 6], ['ALTERNATIVE_OPERATING_MODEL', 4]
];

// ============================================================
// 2. HELPERS
// ============================================================

const log = m => console.log(`[8.3.0] ${new Date().toISOString()} ${m}`);
const arr = v => (Array.isArray(v) ? v : v ? [v] : []);
const uniq = l => [...new Set(l.filter(Boolean))];
const shortHash = t => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 8);
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

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'shall', 'system',
    'their', 'have', 'been', 'will', 'such', 'each', 'when', 'then', 'which', 'based', 'business',
    'needs', 'need', 'must', 'real', 'time', 'automated']);

function stem(w) {
    if (w.length > 5) w = w.replace(/(ations?|ates?|ated|ating|ions?|ings?|ments?)$/, '');
    if (w.length > 4) w = w.replace(/(ies|ied)$/, 'y').replace(/(ed|es|s)$/, '');
    if (w.length > 4) w = w.replace(/e$/, '');
    return w;
}
function getFormattedDateTime() {
  const now = new Date();

  const pad = (value) => String(value).padStart(2, '0');

  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${String(now.getFullYear()).slice(-2)}_${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
const stemTokens = s => norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)).map(stem);

function flatText(o) {
    if (o == null) return '';
    if (typeof o !== 'object') return String(o);
    return Object.values(o).map(flatText).join(' ');
}

// record wrapper is { id, content: {business fields}, section, ... }
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
    let cleanJsonString = '';
    let data;

    try {

       if(raw.includes("Return ONLY JSON, at most 3 needs:")) {
        const middle = raw
            .split("Return ONLY JSON, at most 3 needs:")[1]
            .split("[ Prompt:")[0]
            .trim();

        cleanJsonString = middle.split("\n")[1];

        data = JSON.parse(cleanJsonString);

        return data;
       }
       else if (raw.includes("baseline")) {
        let middles = raw
            .split("\"baseline\":")[1]
            .split("[ Prompt:")[0]
            .trim();
        //    console.log("-----")
        //     console.log(JSON.parse(middles.slice(0, -1)))
            return JSON.parse(middles.slice(0, -1))
        }
    } catch (e) {
        console.log(`Error parsing JSON: ${e.message}`);
        console.log(`Raw string that caused the error: ${cleanJsonString}`);
        console.log(`Complete model output:\n${raw}`);

        throw e;
    }
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

// similarity of every A text to every B text, with IDF learned from both together
function crossSimilarity(textsA, textsB) {
    const V = tfidf([...textsA, ...textsB]);
    const A = V.slice(0, textsA.length), B = V.slice(textsA.length);
    return A.map(a => B.map(b => cosine(a, b)));
}

// average-linkage grouping: always merges near-duplicates (>= minSim); while above `target`, accepts looser merges (>= 0.7 x minSim)
function groupSimilar(texts, target, minSim) {
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
        // near-duplicates always merge; looser merges only while we are above the target count
        if (best < (cl.length > target ? minSim * 0.7 : minSim)) break;
        cl[bi] = cl[bi].concat(cl[bj]);
        cl.splice(bj, 1);
    }
    return cl.map(members => {
        const medoid = members.reduce((b, i) => {
            const sc = members.reduce((t, j) => t + S[i][j], 0);
            return sc > b.sc ? { i, sc } : b;
        }, { i: members[0], sc: -1 }).i;
        return { members, medoid };
    });
}

async function runPool(items, concurrency, worker) {
    const queue = [...items];
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
        while (queue.length) await worker(queue.shift());
    }));
}

// one model call at a time: several llama-cli processes would fight over RAM and CPU cores
const concurrency = () => 1;

// ============================================================
// 3. MODEL RUNNER (local llama-cli)
// ============================================================

function runLocal(label, prompt, maxTokens) {
    return new Promise((resolve, reject) => {
        const started = Date.now();
        let out = '';
        const args = [
            '-hf', MODEL, '-c', String(SETTINGS.context), '-n', String(maxTokens),
            '-t', String(SETTINGS.threads), '-b', String(SETTINGS.batch), '-ngl', '0',
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

// retry wrapper: parse + validate, feed the rejection reason back once
// async function ask(label, promptFn, maxTokens, parse) {
//     let hint = '';
//     for (let a = 0; a <= SETTINGS.retries; a++) {
//         try {
//             return parse(extractJson(await runner(`${label} try ${a + 1}`, promptFn(hint), maxTokens)));
//         } catch (e) { hint = e.message; log(`${label} try ${a + 1} rejected: ${hint}`); }
//     }
//     return null;
// }
async function ask(label, promptFn, maxTokens, parse) {
    let lastError = null;

    for (let attempt = 1; attempt <= SETTINGS.retries + 1; attempt++) {
        try {
            const isRetry = attempt > 1;

            const retryInstruction = isRetry
                ? `
IMPORTANT RETRY INSTRUCTIONS:
- Your previous response was invalid or truncated.
- Do not repeat lengthy explanations.
- Return ONLY valid JSON.
- Return no more than 3 concise items.
- Keep every string short and complete.
- Close every JSON object and array.
- Do not use Markdown fences.
`
                : '';

            const prompt = `${promptFn(retryInstruction)}`;

            const tokens = isRetry
                ? Math.max(300, Math.floor(maxTokens * 0.5))
                : maxTokens;

            const output = await runner(
                `${label} try ${attempt}`,
                prompt,
                tokens
            );

            // console.log('\n========== RAW MODEL OUTPUT ==========');
            // console.log(output);
            // console.log('======================================');

const parsed = extractJson(output);

// console.log('\n========== EXTRACTED JSON ==========');
// console.log(JSON.stringify(parsed, null, 2));
// console.log('====================================');

// console.log('\n========== BEFORE VALIDATION ==========');
// console.log('Parsed is undefined:', parsed === undefined);
// console.log('Parsed type:', typeof parsed);
// console.log('======================================');

return parse(parsed);

        } catch (error) {
            lastError = error;

            log(
                `${label} try ${attempt} rejected: ${error.message}`
            );
        }
    }

    throw new Error(
        `${label} failed after ${SETTINGS.retries + 1} attempts. ` +
        `Last error: ${lastError?.message || 'Unknown error'}`
    );
}
// ============================================================
// 4. STEP 1 - LOAD BASELINE FROM POSTGRES
// ============================================================

function createPool() {
    const cfg = JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8')).development;
    return new Pool({
        user: cfg.username, password: cfg.password, database: cfg.database,
        host: cfg.host, port: Number(cfg.port), max: 2
    });
}

// The consolidated file name identifies the INGESTION RUN. Each functional requirement was ingested as its
// own source/record inside that run's time window, with content = { "result": { "requirement": ... } }.
async function resolveFrRun(pool) {
    const cols = 'ingestion_id, source_file, ingestion_status, records_expected, records_imported, started_at, completed_at';
    const r = FR_SOURCE_FILE
        ? await pool.query(`SELECT ${cols} FROM knowledge_ingestion_runs
                             WHERE source_file = $1 AND ingestion_status = 'COMPLETED'
                             ORDER BY ingestion_id DESC LIMIT 1`, [FR_SOURCE_FILE])
        : await pool.query(`SELECT ${cols} FROM knowledge_ingestion_runs
                             WHERE source_file ILIKE $1 AND ingestion_status = 'COMPLETED'
                             ORDER BY ingestion_id DESC LIMIT 1`, [FR_SOURCE_PATTERN]);
    if (!r.rows.length) {
        throw new Error(`No COMPLETED ingestion run found for ${FR_SOURCE_FILE || FR_SOURCE_PATTERN}. ` +
            'Set FR_SOURCE_FILE to the exact run source_file.');
    }
    return r.rows[0];
}

const FR_CONTENT_FILTER = `kr.content ? 'result' AND NULLIF(kr.content #>> '{result,requirement}', '') IS NOT NULL`;

// 1) records created inside the run window (same rule as your validation script)
// 2) fallback: any record shaped like a functional requirement
async function fetchFrRows(pool, run) {
    const cols = 'kr.record_id, kr.source_file, kr.content, kr.updated_at';
    if (run.started_at) {
        const r = await pool.query(
            `SELECT ${cols} FROM knowledge_records kr
              WHERE kr.created_at BETWEEN $1 AND COALESCE($2, NOW())
                AND ${FR_CONTENT_FILTER}
              ORDER BY kr.source_file, kr.record_id`, [run.started_at, run.completed_at]);
        if (r.rows.length) return { rows: r.rows, via: 'ingestion run time window' };
    }
    const r = await pool.query(
        `SELECT ${cols} FROM knowledge_records kr WHERE ${FR_CONTENT_FILTER}
          ORDER BY kr.source_file, kr.record_id`);
    if (r.rows.length) return { rows: r.rows, via: 'record content shape (no time window match)' };
    return { rows: [], via: null };
}

async function describeIngestion(pool, run) {
    const lines = [`Ingestion run: ${JSON.stringify(run)}`];
    const q = async (label, sql, params, fmt) => {
        try { lines.push(`${label}: ${fmt((await pool.query(sql, params)).rows) || 'none'}`); }
        catch (e) { lines.push(`${label}: (query failed: ${e.message})`); }
    };
    await q('Records created inside the run window',
        `SELECT count(*)::int AS n FROM knowledge_records
          WHERE created_at BETWEEN $1 AND COALESCE($2, NOW())`,
        [run.started_at, run.completed_at], rows => rows.map(r => r.n).join(''));
    await q('Records anywhere with a "result" object',
        `SELECT source_stage, record_type, count(*)::int AS n FROM knowledge_records
          WHERE content ? 'result' GROUP BY 1, 2 ORDER BY n DESC LIMIT 10`,
        [], rows => rows.map(r => `\n   ${r.n} x [${r.source_stage}] ${r.record_type}`).join(''));
    return lines.join('\n');
}

// FR id comes from the file name (FR-007.json), else the record id, else the content
function frIdFrom(text) {
    const m = /FR[-_ ]?(\d{1,4})/i.exec(String(text || ''));
    return m ? `FR-${pad(Number(m[1]))}` : null;
}

function parseFrRow(row) {
    let c = row.content;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = {}; } }
    c = c || {};
    const d = c.result && typeof c.result === 'object' ? c.result : inner(row);
    return {
        id: frIdFrom(row.source_file) || frIdFrom(row.record_id) || d.requirement_id || null,
        requirement: cut(d.requirement, 400),
        need: cut(d.business_need, 300),
        actors: arr(d.required_by_actors),
        objects: arr(d.related_business_objects)
    };
}

const frNumber = id => Number(String(id).replace(/\D+/g, '')) || 0;

async function stepLoad(pool) {
    const run = await resolveFrRun(pool);
    const sourceFile = run.source_file;
    const frRows = await fetchFrRows(pool, run);
    if (!frRows.rows.length) {
        throw new Error(`No functional requirement records found for run "${sourceFile}".\n${await describeIngestion(pool, run)}`);
    }
    log(`Functional requirement rows found via ${frRows.via}: ${frRows.rows.length}.`);

    // same requirement ingested twice? the most recently updated record wins
    const byId = new Map();
    let unnamed = 0;
    for (const r of frRows.rows) {
        const f = parseFrRow(r);
        if (!f.requirement) continue;
        if (!f.id) { f.id = `FR-${pad(900 + ++unnamed)}`; log(`WARNING: no FR id found for record ${r.record_id}; using ${f.id}.`); }
        f.recordId = r.record_id;
        byId.set(f.id, f);
    }
    const frs = [...byId.values()].sort((a, b) => frNumber(a.id) - frNumber(b.id));
    const expected = run.records_imported === null || run.records_imported === undefined ? null : Number(run.records_imported);

    if (!frs.length) {
        throw new Error(`Found ${frRows.rows.length} rows but none had result.requirement.`);
    }
    if (expected !== null && expected !== frs.length) {
        log(`WARNING: the ingestion run says ${expected} records imported, but ${frs.length} functional requirements were parsed.`);
    }

    const kbRows = await pool.query(
        `SELECT record_id, semantic_category, content FROM knowledge_records
          WHERE semantic_category = ANY($1) AND NOT (record_id = ANY($2)) ORDER BY record_id`,
        [DIGEST_CATEGORIES.map(c => c[0]), frs.map(f => f.recordId)]);
    const kb = kbRows.rows.map(r => ({ category: r.semantic_category, d: inner(r) }));

    const lines = [];
    for (const [cat, cap] of DIGEST_CATEGORIES) {
        const rows = kb.filter(x => x.category === cat).slice(0, cap);
        if (!rows.length) continue;
        lines.push(`${cat.replace(/_/g, ' ')}:`);
        for (const x of rows) {
            const label = cat === 'BUSINESS_OBJECT' ? x.d.object_name : cat === 'ACTOR_DEFINITION'
                ? `${x.d.actor_name}: ${cut(x.d.operational_role, 110)}` : cut(flatText(x.d), 190);
            lines.push(`- ${label}`);
        }
    }
    let digest = lines.join('\n');
    if (digest.length > SETTINGS.digestChars) {
        log(`WARNING: knowledge digest truncated ${digest.length} -> ${SETTINGS.digestChars} chars.`);
        digest = digest.slice(0, SETTINGS.digestChars);
    }

    const actors = uniq([
        ...kb.filter(x => x.category === 'ACTOR_DEFINITION').map(x => x.d.actor_name),
        ...frs.flatMap(f => f.actors)
    ]);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(CONTEXT_FILE, JSON.stringify({ sourceFile, digest, actors, frs }, null, 2));
    log(`Loaded ${frs.length} functional requirements from "${sourceFile}" and ${kb.length} knowledge records. Digest ${digest.length} chars.`);
}

const loadContext = () => {
    console.log(`Loading context from ${CONTEXT_FILE}`);
    if (!fs.existsSync(CONTEXT_FILE)) throw new Error('Run "load" first.');
    return JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
};

// ============================================================
// 5. STEP 2 - INTERVIEW: the AI answers business-analyst questions
// ============================================================

const interviewFile = q => path.join(INTERVIEW_DIR, `${q.id}.${shortHash(q.q)}.json`);
const workFile = c => path.join(WORK_DIR, `${c.business_requirement_id}.${shortHash(c.need + '|' + c.why)}.json`);

function interviewPrompt(ctx, q, hint) {
    return `<|im_start|>system
You are a senior business analyst. You are answering one question about a business
using your own business reasoning.

The knowledge below is a BASELINE, not a limit. Prefer needs that the existing functional
requirements do NOT already cover, but you may also restate important covered needs at the
business level. Do not invent numbers, vendors or technologies.

Return ONLY JSON, at most 3 needs:
{"needs":[{"need":"The business needs to ...","why":"one sentence on why, in business terms"}]}
No Markdown, no commentary.
<|im_end|>
<|im_start|>user
BUSINESS KNOWLEDGE:
${ctx.digest}

EXISTING FUNCTIONAL REQUIREMENTS (names only):
${ctx.frs.map(f => `${f.id}: ${cut(f.requirement, 70)}`).join('\n')}

QUESTION: ${q.q}
${hint ? `\nYour previous answer was rejected: ${hint}\nFix it.\n` : ''}
Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

function parseNeeds(j) {
    const needs = arr(j.needs).map(n => ({ need: cut(n && n.need, 220), why: cut(n && n.why, 260) }))
        .filter(n => n.need && n.why).slice(0, 3);
    if (!needs.length) throw new Error('needs array must contain items with need and why');
    return needs;
}

async function stepInterview() {
    const ctx = loadContext();
    fs.mkdirSync(INTERVIEW_DIR, { recursive: true });
    const qs = process.env.LIMIT ? QUESTIONS.slice(0, Number(process.env.LIMIT)) : QUESTIONS;
    await runPool(qs, concurrency(), async q => {
        const file = interviewFile(q);
        if (fs.existsSync(file)) { log(`${q.id} loaded from disk.`); return; }
        const needs = await ask(q.id, h => interviewPrompt(ctx, q, h), SETTINGS.interviewTokens, parseNeeds);
        if (!needs) { log(`${q.id} FAILED; rerun interview to retry.`); return; }
        fs.writeFileSync(file, JSON.stringify({ question: q.q, needs }, null, 2));
        log(`${q.id} done: ${needs.length} needs.`);
    });
}

// ============================================================
// 6. STEP 3 - DRAFT: dedupe needs, link functional requirements, seed from orphans
// ============================================================

function buildDraft(needs, frs, opts = SETTINGS) {
    const groups = groupSimilar(needs.map(n => `${n.need} ${n.need} ${n.why}`),
        opts.targetRequirements, opts.dedupeMinSim);
    const cands = groups.map(g => ({
        need: needs[g.medoid].need,
        why: needs[g.medoid].why,
        origin: 'interview',
        sources: uniq(g.members.map(i => needs[i].source)),
        frs: []
    }));

    const frText = frs.map(f => `${f.requirement} ${f.need || ''}`);
    const orphans = [];
    if (cands.length) {
        const sim = crossSimilarity(cands.map(c => `${c.need} ${c.why}`), frText);
        frs.forEach((f, j) => {
            let best = -1, bi = -1;
            cands.forEach((_, i) => { if (sim[i][j] > best) { best = sim[i][j]; bi = i; } });
            if (bi >= 0 && best >= opts.orphanSim) cands[bi].frs.push(f.id); else orphans.push(j);
        });
    } else frs.forEach((_, j) => orphans.push(j));

    // functional requirements no business need explains become their own candidate needs
    groupSimilar(orphans.map(j => frText[j]), orphans.length, opts.dedupeMinSim).forEach(g => {
        const m = frs[orphans[g.medoid]];
        cands.push({
            need: cut(m.need || m.requirement, 220),
            why: cut(m.requirement, 260),
            origin: 'seeded_from_functional_requirements',
            sources: [],
            frs: g.members.map(i => frs[orphans[i]].id)
        });
    });

    return cands.map((c, i) => ({ business_requirement_id: `BR-${pad(i + 1)}`, ...c }));
}

function stepDraft() {
    const ctx = loadContext();
    const needs = [];
    for (const q of QUESTIONS) {
        const file = interviewFile(q);
        if (!fs.existsSync(file)) { log(`${q.id} has no answer yet.`); continue; }
        JSON.parse(fs.readFileSync(file, 'utf8')).needs.forEach(n => needs.push({ ...n, source: q.id }));
    }
    const index = buildDraft(needs, ctx.frs);
    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    const seeded = index.filter(c => c.origin !== 'interview').length;
    log(`${needs.length} needs from interview -> ${index.length} business requirement candidates (${seeded} seeded from uncovered functional requirements).`);
    index.forEach(c => console.log(`  ${c.business_requirement_id}  [${c.origin === 'interview' ? 'AI' : 'FR'}]  ${cut(c.need, 95)}  (FRs: ${c.frs.length})`));
    log(`Saved ${INDEX_FILE}. Edit if you want, then run: generate`);
}

// ============================================================
// 7. STEP 4 - GENERATE each business requirement
// ============================================================

function normalisePriority(v) {
    const t = String(v || '').toLowerCase();
    if (/must|high|critical|essential|mandatory/.test(t)) return 'Must';
    if (/could|low|nice|optional/.test(t)) return 'Could';
    return 'Should';
}

function writePrompt(ctx, cand, frList, hint) {
    return `<|im_start|>system
You are a senior business analyst writing ONE business requirement.

A business requirement states what the BUSINESS needs, in business language, for a sponsor
to approve. It is not a system feature. Do not invent numbers, vendors or technologies;
where you propose a target, say "proposed".

Prefer these stakeholder names where they fit: ${ctx.actors.join('; ')}

Return ONLY this JSON:
{
  "baseline":
{
  "name": "3 to 8 word title",
  "business_requirement": "The business requires ... (1 or 2 sentences)",
  "business_objective": "which business goal this serves",
  "business_value": "benefit if met, harm if not",
  "stakeholders": ["names"],
  "success_measures": ["1 to 3 measurable indicators; mark invented targets as proposed"],
  "priority": "Must or Should or Could",
  "policies_and_constraints": ["0 to 3"],
  "assumptions": ["0 to 3"],
  "risks_and_dependencies": ["0 to 3"],
  "linked_functional_requirements": ["ids from the list below that help realise it; empty list if none"]
}
}
Every string under 220 characters. No Markdown, no commentary.
<|im_end|>
<|im_start|>user
BUSINESS KNOWLEDGE:
${ctx.digest.slice(0, SETTINGS.briefChars)}

BUSINESS NEED TO WRITE UP: ${cand.need}
WHY: ${cand.why}

FUNCTIONAL REQUIREMENTS THAT MAY REALISE IT:
${frList.length ? frList.map(f => `${f.id}: ${cut(f.requirement, 140)}`).join('\n') : '(none)'}
${hint ? `\nYour previous answer was rejected: ${hint}\nFix it.\n` : ''}
Return the JSON.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

function validateBR(o, knownFrIds) {
    console.log('Validating business requirement:', o);
    const s = v => typeof v === 'string' && v.trim().length > 0;
    if (!s(o.business_requirement)) throw new Error('business_requirement missing');
    if (!s(o.business_objective)) throw new Error('business_objective missing');
    if (!s(o.business_value)) throw new Error('business_value missing');
    const list = (v, min, f) => {
        const out = uniq(arr(v).map(x => cut(x, 220)));
        if (out.length < min) throw new Error(`${f} needs at least ${min} item(s)`);
        return out;
    };
    return {
        name: cut(o.name || o.business_requirement, 80),
        business_requirement: cut(o.business_requirement, 400),
        business_objective: cut(o.business_objective, 300),
        business_value: cut(o.business_value, 300),
        stakeholders: list(o.stakeholders, 1, 'stakeholders'),
        success_measures: list(o.success_measures, 1, 'success_measures'),
        priority: normalisePriority(o.priority),
        policies_and_constraints: list(o.policies_and_constraints, 0),
        assumptions: list(o.assumptions, 0),
        risks_and_dependencies: list(o.risks_and_dependencies, 0),
        linked_functional_requirements: uniq(arr(o.linked_functional_requirements)
            .map(x => String(x).trim()).filter(x => knownFrIds.has(x)))
    };
}

async function stepGenerate() {
    const ctx = loadContext();
    console.log(INDEX_FILE)
    if (!fs.existsSync(INDEX_FILE)) throw new Error('Run "draft" first.');
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const toWrite = process.env.LIMIT ? index.slice(0, Number(process.env.LIMIT)) : index;
    fs.mkdirSync(WORK_DIR, { recursive: true });

    const frById = new Map(ctx.frs.map(f => [f.id, f]));
    const known = new Set(frById.keys());
    const sim = crossSimilarity(index.map(c => `${c.need} ${c.why}`), ctx.frs.map(f => `${f.requirement} ${f.need || ''}`));

    log(`Writing business requirements with the local model (${MODEL}).`);
    let done = 0, failed = 0;

    await runPool(toWrite.map((c) => ({ c, i: index.indexOf(c) })), concurrency(), async ({ c, i }) => {
        const file = workFile(c);
        if (fs.existsSync(file)) { done++; return; }

        const near = ctx.frs.map((f, j) => ({ id: f.id, s: sim[i][j] }))
            .filter(x => !c.frs.includes(x.id)).sort((a, b) => b.s - a.s)
            .slice(0, SETTINGS.extraCandidates).map(x => x.id);
        const frList = uniq([...c.frs, ...near]).slice(0, SETTINGS.maxCandidates).map(id => frById.get(id));

        const started = Date.now();
        const result = await ask(c.business_requirement_id, h => writePrompt(ctx, c, frList, h),
            SETTINGS.writeTokens, j => validateBR(j, known));
        if (!result) { failed++; log(`${c.business_requirement_id} FAILED; rerun generate to retry.`); return; }

        const unmatched = [];
        result.stakeholders = uniq(result.stakeholders.map(n => {
            const hit = ctx.actors.find(a => same(a, n));
            if (!hit) unmatched.push(n);
            return hit || n;
        }));
        fs.writeFileSync(file, JSON.stringify({ result, unmatched_stakeholders: unmatched }, null, 2));
        done++;
        log(`${c.business_requirement_id} done in ${((Date.now() - started) / 1000).toFixed(0)}s (${done}/${toWrite.length})`);
    });
    log(`Generate finished. done=${done} failed=${failed}`);
}

// ============================================================
// 8. STEP 5 - MERGE: final file + two-way coverage report
// ============================================================

function assemble(index, works, frs) {
    const brs = [], trace = [];
    for (const c of index) {
        const w = works[c.business_requirement_id];
        if (!w) continue;
        const id = `BR-${pad(brs.length + 1)}`;
        const r = w.result;
        brs.push({
            business_requirement_id: id,
            name: r.name,
            business_requirement: r.business_requirement,
            business_objective: r.business_objective,
            business_value: r.business_value,
            stakeholders: r.stakeholders,
            success_measures: r.success_measures,
            priority: r.priority,
            policies_and_constraints: r.policies_and_constraints,
            assumptions: r.assumptions,
            risks_and_dependencies: r.risks_and_dependencies,
            linked_functional_requirements: [...r.linked_functional_requirements]
        });
        trace.push({
            business_requirement_id: id, origin: c.origin, interview_questions: c.sources,
            stakeholders_not_in_knowledge_base: w.unmatched_stakeholders || [],
            functional_requirements_linked_by_similarity: []
        });
    }

    // every functional requirement must trace to at least one business requirement
    const linked = new Set(brs.flatMap(b => b.linked_functional_requirements));
    const orphans = frs.filter(f => !linked.has(f.id));
    if (orphans.length && brs.length) {
        const sim = crossSimilarity(
            brs.map(b => `${b.business_requirement} ${b.business_objective}`),
            orphans.map(f => `${f.requirement} ${f.need || ''}`));
        orphans.forEach((f, j) => {
            let bi = 0;
            brs.forEach((_, i) => { if (sim[i][j] > sim[bi][j]) bi = i; });
            brs[bi].linked_functional_requirements.push(f.id);
            trace[bi].functional_requirements_linked_by_similarity.push(f.id);
        });
    }
    brs.forEach(b => { b.linked_functional_requirements.sort((x, y) => frNumber(x) - frNumber(y)); });

    const noFr = brs.filter(b => !b.linked_functional_requirements.length).map(b => b.business_requirement_id);
    trace.forEach(t => { t.needs_functional_requirements = noFr.includes(t.business_requirement_id); });
    return { brs, trace, orphanCount: orphans.length, noFr };
}

function stepMerge() {
    const ctx = loadContext();
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const works = {};
    for (const c of index) {
        const f = workFile(c);
        if (fs.existsSync(f)) works[c.business_requirement_id] = JSON.parse(fs.readFileSync(f, 'utf8'));
    }
    const { brs, trace, orphanCount, noFr } = assemble(index, works, ctx.frs);

    fs.writeFileSync(FINAL_FILE, JSON.stringify({ business_requirements: brs }, null, 2));
    fs.writeFileSync(TRACE_FILE, JSON.stringify({
        functional_requirements_total: ctx.frs.length,
        functional_requirements_attached_by_similarity: orphanCount,
        business_requirements_without_functional_requirements: noFr,
        business_requirements: trace
    }, null, 2));

    log(`Wrote ${brs.length} business requirements to ${FINAL_FILE}`);
    log(`Coverage: all ${ctx.frs.length} functional requirements trace to a business requirement ` +
        `(${orphanCount} had to be attached by similarity).`);
    log(`Gaps: ${noFr.length} business requirement(s) have NO functional requirement yet${noFr.length ? ': ' + noFr.join(', ') : ''}.`);
    if (index.length > brs.length) log(`Not generated yet: ${index.length - brs.length} (rerun generate).`);
}

// ============================================================
// 9. MAIN
// ============================================================

async function main(cmd = process.argv[2] || 'all', injectedPool = null) {
    const steps = ['load', 'interview', 'draft', 'generate', 'merge'];
    if (cmd !== 'all' && !steps.includes(cmd)) throw new Error(`Usage: ${steps.join(' | ')} | all`);
    const run = s => cmd === 'all' || cmd === s;
    let pool = injectedPool;
    try {
        if (run('load')) { pool = pool || createPool(); await stepLoad(pool); }
        if (run('interview')) await stepInterview();
        if (run('draft')) stepDraft();
        if (run('generate')) await stepGenerate();
        if (run('merge')) stepMerge();
    } finally {
        if (pool && !injectedPool) await pool.end();
    }
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { main, setRunner, buildDraft, validateBR, assemble, groupSimilar, inner, extractJson, parseNeeds, QUESTIONS };
