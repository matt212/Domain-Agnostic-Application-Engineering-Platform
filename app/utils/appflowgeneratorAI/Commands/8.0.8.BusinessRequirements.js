
'use strict';

/**
 * 8.0.8 - BUSINESS REQUIREMENTS VALIDATION
 *
 * VALIDATION ONLY. No interview, draft, generation, merge or DB writes.
 *
 * Run:
 *   node app/utils/appflowgeneratorAI/Commands/8.0.8.BusinessRequirements.js
 *
 * Or:
 *   node app/utils/appflowgeneratorAI/Commands/8.0.8.BusinessRequirements.js validate
 *
 * Explicit approval:
 *   Set APPROVE_BUSINESS_REQUIREMENTS = true below,
 *   then run with the "approve" command.
 */

// ============================================================
// 1. IMPORTS
// ============================================================

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

// ============================================================
// 2. CONFIGURATION
// ============================================================

const ROOT = process.cwd();

const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';

const DB_CONFIG_PATH = path.join(ROOT, 'app/config/config.json');

const OUTPUT_DIR = process.env.BR_OUTPUT_DIR ||
    path.join(ROOT, 'app/utils/appflowgeneratorAI/aiOutput/businessRequirements');

const WORK_DIR = path.join(OUTPUT_DIR, 'work');

// SET THE EXISTING CONSOLIDATED FILE HERE.
// Do not pass the filename through the command line.
const BR_FINAL_FILE = 'business_requirements-13-11-26_11:43.json';

const FINAL_FILE_PATH = path.join(OUTPUT_DIR, BR_FINAL_FILE);

// Functional Requirement ingestion selection.
const FR_SOURCE_FILE = process.env.FR_SOURCE_FILE || null;
const FR_SOURCE_PATTERN =
    process.env.FR_SOURCE_PATTERN || '%consolidated-Functional-Requirements%';

// Approval is deliberately disabled by default.
const APPROVE_BUSINESS_REQUIREMENTS = false;

const SETTINGS = {
    threads: Number(process.env.THREADS || 6),
    context: 6144,
    batch: 512,
    temperature: 0.1,
    maxTokens: 1800,
    timeoutMs: 300 * 60 * 1000,
    heartbeatMs: 30000,

    // Candidate generation only. Similarity never confirms a relationship.
    duplicateCandidateThreshold: 0.10,
    relationshipCandidateCount: 4
};

const DIGEST_CATEGORIES = [
    ['BUSINESS_CONTEXT', 4],
    ['BUSINESS_OPERATING_MODEL', 4],
    ['BUSINESS_PRODUCT_SERVICE', 6],
    ['BUSINESS_OUTCOME', 8],
    ['BUSINESS_FUNCTION', 8],
    ['BUSINESS_MONETIZATION_MODEL', 4],
    ['MONETIZATION_STREAM', 6],
    ['BUSINESS_LIFECYCLE_STAGE', 12],
    ['ACTOR_DEFINITION', 12],
    ['BUSINESS_OBJECT', 20],
    ['BUSINESS_ASSUMPTION', 8],
    ['UNRESOLVED_DEPENDENCY', 6],
    ['EVIDENCE_GAP', 6],
    ['ALTERNATIVE_OPERATING_MODEL', 4]
];

const log = message =>
    console.log(`[8.0.8] ${new Date().toISOString()} ${message}`);

const arr = value => Array.isArray(value) ? value : [];

const cut = (value, max = 500) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max) + '...' : text;
};

const pad = value => String(value).padStart(3, '0');

const normalize = value =>
    String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

function flatText(value) {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    return Object.values(value).map(flatText).join(' ');
}

function inner(row) {
    let content = row.content;

    if (typeof content === 'string') {
        try {
            content = JSON.parse(content);
        } catch {
            return { text: content };
        }
    }

    content = content || {};

    let business = content.content !== undefined
        ? content.content
        : content;

    if (typeof business === 'string') {
        try {
            business = JSON.parse(business);
        } catch {
            return { text: business };
        }
    }

    if (Array.isArray(business)) return { items: business };

    return business && typeof business === 'object'
        ? business
        : { text: String(business ?? '') };
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, data) {
    const temp = `${file}.${process.pid}.tmp`;

    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, file);
}

function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key =>
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        ).join(',')}}`;
    }

    return JSON.stringify(value);
}

// ============================================================
// 3. DATABASE CONNECTION
// Uses the same development configuration as 8.0.7.
// ============================================================

function createPool() {
    if (!fs.existsSync(DB_CONFIG_PATH)) {
        throw new Error(`Database config not found: ${DB_CONFIG_PATH}`);
    }

    const config = JSON.parse(
        fs.readFileSync(DB_CONFIG_PATH, 'utf8')
    ).development;

    if (!config) {
        throw new Error('Missing development database configuration.');
    }

    return new Pool({
        user: config.username,
        password: config.password,
        database: config.database,
        host: config.host,
        port: Number(config.port),
        max: 2
    });
}

// ============================================================
// 4. LOAD EXISTING FUNCTIONAL REQUIREMENTS
// SQL and record interpretation follow 8.0.7.
// ============================================================

const FR_CONTENT_FILTER =
    `kr.content ? 'result'
     AND NULLIF(kr.content #>> '{result,requirement}', '') IS NOT NULL`;

async function resolveFrRun(pool) {
    const columns = `
        ingestion_id,
        source_file,
        ingestion_status,
        records_expected,
        records_imported,
        started_at,
        completed_at
    `;

    const result = FR_SOURCE_FILE
        ? await pool.query(
            `SELECT ${columns}
               FROM knowledge_ingestion_runs
              WHERE source_file = $1
                AND ingestion_status = 'COMPLETED'
              ORDER BY ingestion_id DESC
              LIMIT 1`,
            [FR_SOURCE_FILE]
        )
        : await pool.query(
            `SELECT ${columns}
               FROM knowledge_ingestion_runs
              WHERE source_file ILIKE $1
                AND ingestion_status = 'COMPLETED'
              ORDER BY ingestion_id DESC
              LIMIT 1`,
            [FR_SOURCE_PATTERN]
        );

    if (!result.rows.length) {
        throw new Error(
            `No COMPLETED ingestion run found for ${FR_SOURCE_FILE || FR_SOURCE_PATTERN}.`
        );
    }

    return result.rows[0];
}

async function fetchFrRows(pool, run) {
    const columns = `
        kr.record_id,
        kr.source_file,
        kr.content,
        kr.updated_at
    `;

    if (run.started_at) {
        const result = await pool.query(
            `SELECT ${columns}
               FROM knowledge_records kr
              WHERE kr.created_at BETWEEN $1 AND COALESCE($2, NOW())
                AND ${FR_CONTENT_FILTER}
              ORDER BY kr.source_file, kr.record_id`,
            [run.started_at, run.completed_at]
        );

        if (result.rows.length) {
            return {
                rows: result.rows,
                via: 'ingestion run time window'
            };
        }
    }

    const result = await pool.query(
        `SELECT ${columns}
           FROM knowledge_records kr
          WHERE ${FR_CONTENT_FILTER}
          ORDER BY kr.source_file, kr.record_id`
    );

    return {
        rows: result.rows,
        via: result.rows.length
            ? 'record content shape fallback'
            : null
    };
}

function frIdFrom(value) {
    const match = /FR[-_ ]?(\d{1,4})/i.exec(String(value || ''));

    return match
        ? `FR-${pad(Number(match[1]))}`
        : null;
}

function parseFrRow(row) {
    let content = row.content;

    if (typeof content === 'string') {
        try {
            content = JSON.parse(content);
        } catch {
            content = {};
        }
    }

    content = content || {};

    const data = content.result &&
        typeof content.result === 'object'
        ? content.result
        : inner(row);

    return {
        id: frIdFrom(row.source_file) ||
            frIdFrom(row.record_id) ||
            data.requirement_id ||
            null,

        requirement: cut(data.requirement, 400),
        need: cut(data.business_need, 300),
        actors: arr(data.required_by_actors),
        objects: arr(data.related_business_objects),
        recordId: row.record_id
    };
}

async function loadEvidence(pool) {
    const run = await resolveFrRun(pool);
    const fetched = await fetchFrRows(pool, run);

    if (!fetched.rows.length) {
        throw new Error(
            `No Functional Requirement records found for ${run.source_file}.`
        );
    }

    log(`FR records found via ${fetched.via}: ${fetched.rows.length}.`);

    // Deduplicate by FR ID. Latest encountered record wins,
    // matching the existing 8.0.7 behaviour.
    const byId = new Map();
    let unnamed = 0;

    for (const row of fetched.rows) {
        const fr = parseFrRow(row);

        if (!fr.requirement) continue;

        if (!fr.id) {
            fr.id = `FR-${pad(900 + ++unnamed)}`;
            log(`WARNING: no FR ID found for record ${row.record_id}; assigned ${fr.id}.`);
        }

        byId.set(fr.id, fr);
    }

    const frs = [...byId.values()].sort(
        (a, b) =>
            Number(a.id.replace(/\D/g, '')) -
            Number(b.id.replace(/\D/g, ''))
    );

    if (!frs.length) {
        throw new Error('No usable Functional Requirements were parsed.');
    }

    const expected = run.records_imported == null
        ? null
        : Number(run.records_imported);

    if (expected !== null && expected !== frs.length) {
        log(`WARNING: ingestion reports ${expected} records; parsed ${frs.length} FRs.`);
    }

    // Exclude the FR records from the business-context digest.
    const kbResult = await pool.query(
        `SELECT record_id, semantic_category, content
           FROM knowledge_records
          WHERE semantic_category = ANY($1)
            AND NOT (record_id = ANY($2))
          ORDER BY record_id`,
        [
            DIGEST_CATEGORIES.map(item => item[0]),
            frs.map(fr => fr.recordId)
        ]
    );

    const kb = kbResult.rows.map(row => ({
        category: row.semantic_category,
        data: inner(row)
    }));

    const digestLines = [];

    for (const [category, cap] of DIGEST_CATEGORIES) {
        const rows = kb.filter(item => item.category === category).slice(0, cap);

        if (!rows.length) continue;

        digestLines.push(`${category.replace(/_/g, ' ')}:`);

        for (const item of rows) {
            const data = item.data;

            const label = category === 'BUSINESS_OBJECT'
                ? data.object_name
                : category === 'ACTOR_DEFINITION'
                    ? `${data.actor_name}: ${cut(data.operational_role, 110)}`
                    : cut(flatText(data), 190);

            digestLines.push(`- ${label}`);
        }
    }

    const digest = digestLines.join('\n').slice(0, 7000);

    const actors = [...new Set([
        ...kb
            .filter(item => item.category === 'ACTOR_DEFINITION')
            .map(item => item.data.actor_name)
            .filter(Boolean),
        ...frs.flatMap(fr => fr.actors)
    ])];

    return {
        ingestion: run,
        frs,
        digest,
        actors,
        knowledgeRecordCount: kb.length
    };
}

// ============================================================
// 5. LOCAL LLAMA-CLI RUNNER
// ============================================================

function extractJson(raw) {
    if (!raw || typeof raw !== 'string') {
        throw new Error('Empty model response.');
    }

    const text = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '');

    const start = text.indexOf('{');

    if (start < 0) {
        throw new Error('No JSON object found in model output.');
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;

            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;

            if (depth === 0) {
                return JSON.parse(text.slice(start, i + 1));
            }
        }
    }

    throw new Error('Model JSON is incomplete or truncated.');
}

function runLocal(label, prompt, maxTokens = SETTINGS.maxTokens) {
    return new Promise((resolve, reject) => {
        const started = Date.now();

        let output = '';
        let stderr = '';
        let settled = false;

        const args = [
            '-hf', MODEL,
            '-c', String(SETTINGS.context),
            '-n', String(maxTokens),
            '-t', String(SETTINGS.threads),
            '-b', String(SETTINGS.batch),
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

        const heartbeat = setInterval(() => {
            log(`${label}: ${Math.round((Date.now() - started) / 1000)}s; ${output.length} output chars.`);
        }, SETTINGS.heartbeatMs);

        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            finish(new Error(`${label}: model timeout.`));
        }, SETTINGS.timeoutMs);

        function finish(error, result) {
            if (settled) return;
            settled = true;

            clearInterval(heartbeat);
            clearTimeout(timeout);

            if (error) reject(error);
            else resolve(result);
        }

        child.stdout.on('data', data => {
            output += data.toString();
        });

        child.stderr.on('data', data => {
            stderr += data.toString();
        });

        child.on('error', error => finish(error));

        child.on('close', code => {
            if (code !== 0) {
                return finish(new Error(
                    `${label}: llama-cli exit code ${code}: ${cut(stderr, 1200)}`
                ));
            }

            if (!output.trim()) {
                return finish(new Error(`${label}: empty output.`));
            }

            finish(null, output);
        });
    });
}

async function askJson(label, prompt, tokens = SETTINGS.maxTokens) {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const actualPrompt = attempt === 1
                ? prompt
                : `${prompt}

Your previous response was invalid or incomplete.
Return ONLY one complete valid JSON object.
Do not include explanations or Markdown.
Keep the JSON concise and close every object and array.`;

            const raw = await runLocal(
                `${label} attempt ${attempt}`,
                actualPrompt,
                attempt === 1 ? tokens : Math.max(500, Math.floor(tokens * 0.75))
            );

            return extractJson(raw);

        } catch (error) {
            lastError = error;
            log(`${label} attempt ${attempt} failed: ${error.message}`);
        }
    }

    throw lastError;
}

const NO_THINK = '<think>\n\n</think>\n';

// ============================================================
// 6. DISCOVER EVERY EXISTING WORK FILE
// ============================================================

function discoverWorkFiles() {
    if (!fs.existsSync(WORK_DIR)) {
        throw new Error(`BR work directory not found: ${WORK_DIR}`);
    }

    // Accept:
    // BR-001.99eefbf0.json
    // BR-001.json
    //
    // Do not use LIMIT or slice().
    const filenames = fs.readdirSync(WORK_DIR)
        .filter(file => /^BR-\d{3,}(?:\.[^.]+)?\.json$/i.test(file))
        .sort((a, b) => {
            const idA = Number((a.match(/^BR-(\d+)/i) || [])[1] || 0);
            const idB = Number((b.match(/^BR-(\d+)/i) || [])[1] || 0);

            return idA - idB || a.localeCompare(b);
        });

    if (!filenames.length) {
        throw new Error(`No BR JSON files found in ${WORK_DIR}`);
    }

    const files = filenames.map(filename => {
        const fullPath = path.join(WORK_DIR, filename);
        const idMatch = filename.match(/^(BR-\d{3,})/i);

        const item = {
            id: idMatch[1].toUpperCase(),
            file: filename,
            fullPath,
            data: null,
            result: null,
            readError: null
        };

        try {
            item.data = readJson(fullPath);
            item.result = item.data.result || null;
        } catch (error) {
            item.readError = error.message;
        }

        return item;
    });

    log(`Discovered ${files.length} BR work files.`);

    for (const item of files) {
        log(`Discovered ${item.id}: ${item.file}`);
    }

    return files;
}

// ============================================================
// 7. BR STRUCTURAL VALIDATION
// ============================================================

function structuralValidation(br, knownFrIds) {
    const findings = [];
    const result = br.result || {};

    if (br.readError) {
        findings.push({
            dimension: 'FILE',
            severity: 'HIGH',
            finding: `Could not read JSON: ${br.readError}`
        });

        return findings;
    }

    if (!result || typeof result !== 'object' || Array.isArray(result)) {
        findings.push({
            dimension: 'STRUCTURE',
            severity: 'HIGH',
            finding: 'Missing or invalid result object.'
        });

        return findings;
    }

    const requiredFields = [
        'name',
        'business_requirement',
        'business_objective',
        'business_value'
    ];

    for (const field of requiredFields) {
        if (!String(result[field] || '').trim()) {
            findings.push({
                dimension: 'STRUCTURE',
                severity: 'HIGH',
                finding: `Missing required field: ${field}`
            });
        }
    }

    if (!arr(result.stakeholders).length) {
        findings.push({
            dimension: 'STRUCTURE',
            severity: 'HIGH',
            finding: 'No stakeholders supplied.'
        });
    }

    if (!arr(result.success_measures).length) {
        findings.push({
            dimension: 'STRUCTURE',
            severity: 'MEDIUM',
            finding: 'No success measures supplied.'
        });
    }

    const linked = arr(result.linked_functional_requirements);

    if (!linked.length) {
        findings.push({
            dimension: 'FR_RELATIONSHIP',
            severity: 'HIGH',
            finding: 'No linked Functional Requirements.'
        });
    }

    for (const id of linked) {
        if (!knownFrIds.has(id)) {
            findings.push({
                dimension: 'FR_RELATIONSHIP',
                severity: 'HIGH',
                finding: `Unknown Functional Requirement: ${id}`
            });
        }
    }

    return findings;
}

// ============================================================
// 8. INDIVIDUAL BR BUSINESS-QUALITY VALIDATION
// ============================================================

function individualPrompt(br, linkedFrs, evidence) {
    return `<|im_start|>system
You are an independent senior business analyst auditing a business requirement.

Do not rewrite the requirement. Assess it as supplied.

Assess:
1. Business-level quality and clarity.
2. Whether the underlying business need is meaningful and sufficiently clear.
3. Whether business value is explained rather than merely asserted.
4. Solution leakage: implementation, technology, architecture, UI or system
   design being prescribed without a business-level justification.
5. Unsupported assumptions, claims, policies, targets or metrics.
6. Internal contradictions and inconsistencies.
7. Whether each linked Functional Requirement substantively supports this BR.

Rules:
- Similar wording is not proof of a valid relationship.
- Do not invent facts, regulations, metrics or targets.
- A proposed target is acceptable only when explicitly labelled proposed.
- Distinguish unsupported evidence from a confirmed false statement.
- Do not treat every reference to a system as solution leakage.
- Do not change any original BR content.

Return ONLY JSON:
{
  "status":"PASS|REVIEW|FAIL",
  "business_quality":"PASS|REVIEW|FAIL",
  "solution_leakage":"NONE|POSSIBLE|CONFIRMED",
  "unsupported_assumptions":"NONE|POSSIBLE|CONFIRMED",
  "fr_relationships":[
    {
      "functional_requirement_id":"FR-001",
      "status":"SUPPORTED|PARTIAL|UNSUPPORTED|UNCLEAR",
      "reason":"Evidence-based explanation"
    }
  ],
  "findings":[
    {
      "dimension":"BUSINESS_QUALITY|SOLUTION_LEAKAGE|UNSUPPORTED_ASSUMPTION|FR_RELATIONSHIP|CONSISTENCY",
      "severity":"HIGH|MEDIUM|LOW",
      "finding":"Specific issue",
      "evidence":"Text or evidence gap",
      "recommendation":"What needs review"
    }
  ],
  "assessment_summary":"Concise assessment"
}
<|im_end|>
<|im_start|>user
BUSINESS CONTEXT:
${evidence.digest}

FUNCTIONAL REQUIREMENTS LINKED TO THIS BR:
${JSON.stringify(linkedFrs, null, 2)}

BUSINESS REQUIREMENT:
${JSON.stringify({
    business_requirement_id: br.id,
    ...br.result
}, null, 2)}
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

async function validateIndividual(br, evidence, knownFrIds) {
    const structural = structuralValidation(br, knownFrIds);

    if (br.readError || !br.result || typeof br.result !== 'object') {
        return {
            status: 'FAIL',
            validated_at: new Date().toISOString(),
            structural_findings: structural,
            semantic: null
        };
    }

    const linkedIds = arr(br.result.linked_functional_requirements);

    const linkedFrs = evidence.frs.filter(fr =>
        linkedIds.includes(fr.id)
    );

    let semantic;

    try {
        semantic = await askJson(
            `Individual BR validation ${br.id}`,
            individualPrompt(br, linkedFrs, evidence)
        );
    } catch (error) {
        semantic = {
            status: 'REVIEW',
            business_quality: 'REVIEW',
            findings: [{
                dimension: 'VALIDATION_EXECUTION',
                severity: 'HIGH',
                finding: error.message,
                evidence: null,
                recommendation: 'Rerun this BR validation.'
            }],
            assessment_summary: 'AI assessment could not be completed.'
        };
    }

    const aiStatus = ['PASS', 'REVIEW', 'FAIL'].includes(
        String(semantic.status).toUpperCase()
    )
        ? String(semantic.status).toUpperCase()
        : 'REVIEW';

    const structuralFail = structural.some(
        finding => finding.severity === 'HIGH'
    );

    return {
        status: structuralFail ? 'FAIL' : aiStatus,
        validated_at: new Date().toISOString(),
        validator: MODEL,
        structural_findings: structural,
        semantic,
        linked_fr_count: linkedIds.length,
        known_linked_fr_count: linkedFrs.length
    };
}

// ============================================================
// 9. SIMILARITY: CANDIDATE DISCOVERY ONLY
// ============================================================

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into',
    'shall', 'system', 'their', 'have', 'been', 'will', 'such',
    'each', 'when', 'then', 'which', 'based', 'business',
    'needs', 'need', 'must', 'through', 'using'
]);

function words(text) {
    return normalize(text)
        .split(' ')
        .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
}

function vectorize(texts) {
    const documents = texts.map(words);
    const documentFrequency = new Map();

    for (const document of documents) {
        for (const word of new Set(document)) {
            documentFrequency.set(
                word,
                (documentFrequency.get(word) || 0) + 1
            );
        }
    }

    const count = documents.length;

    return documents.map(document => {
        const vector = new Map();

        for (const word of document) {
            const weight =
                (vector.get(word) || 0) +
                Math.log((count + 1) / ((documentFrequency.get(word) || 0) + 1)) + 1;

            vector.set(word, weight);
        }

        const magnitude = Math.sqrt(
            [...vector.values()].reduce((sum, value) => sum + value * value, 0)
        ) || 1;

        for (const [word, value] of vector) {
            vector.set(word, value / magnitude);
        }

        return vector;
    });
}

function cosine(a, b) {
    let score = 0;

    for (const [word, value] of a) {
        score += value * (b.get(word) || 0);
    }

    return score;
}

function brText(br) {
    const result = br.result || {};

    return [
        result.name,
        result.business_requirement,
        result.business_objective,
        result.business_value
    ].join(' ');
}

function frText(fr) {
    return [
        fr.requirement,
        fr.need,
        ...fr.actors,
        ...fr.objects
    ].join(' ');
}

function similarityMatrix(textsA, textsB) {
    const vectors = vectorize([...textsA, ...textsB]);

    const A = vectors.slice(0, textsA.length);
    const B = vectors.slice(textsA.length);

    return A.map(a => B.map(b => cosine(a, b)));
}

// ============================================================
// 10. BR-TO-BR SEMANTIC DUPLICATION VALIDATION
// ============================================================

function buildDuplicateCandidates(brs) {
    const texts = brs.map(brText);
    const vectors = vectorize(texts);

    const candidates = [];

    // Every BR is compared with every other BR for candidate discovery.
    // No fixed BR count or generation batch boundary is used.
    for (let i = 0; i < brs.length; i++) {
        for (let j = i + 1; j < brs.length; j++) {
            const score = cosine(vectors[i], vectors[j]);

            if (score >= SETTINGS.duplicateCandidateThreshold) {
                candidates.push({
                    br_a: brs[i],
                    br_b: brs[j],
                    similarity: Number(score.toFixed(4))
                });
            }
        }
    }

    return candidates.sort((a, b) => b.similarity - a.similarity);
}

function duplicatePrompt(pair) {
    return `<|im_start|>system
You are evaluating two business requirements for semantic duplication.

Classify them as:
DUPLICATE: substantially the same underlying business need and outcome.
OVERLAPPING: some shared scope, but distinct business needs remain.
DISTINCT: materially different business needs.
UNCLEAR: insufficient evidence.

Do not call them duplicates merely because they share keywords,
stakeholders, business objects, functional requirements or a broad objective.

Compare their underlying intent, scope, outcomes and responsibilities.
Do not merge, delete or rewrite either BR.

Return ONLY JSON:
{
  "classification":"DUPLICATE|OVERLAPPING|DISTINCT|UNCLEAR",
  "confidence":"HIGH|MEDIUM|LOW",
  "reason":"Evidence-based explanation",
  "overlapping_scope":"What overlaps",
  "recommendation":"Reviewer action"
}
<|im_end|>
<|im_start|>user
BR A:
${JSON.stringify({ id: pair.br_a.id, ...pair.br_a.result }, null, 2)}

BR B:
${JSON.stringify({ id: pair.br_b.id, ...pair.br_b.result }, null, 2)}
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

async function validateDuplicates(brs) {
    const candidates = buildDuplicateCandidates(brs);
    const results = [];

    log(`BR-to-BR candidate pairs: ${candidates.length}.`);

    for (const pair of candidates) {
        try {
            const assessment = await askJson(
                `BR duplication ${pair.br_a.id}/${pair.br_b.id}`,
                duplicatePrompt(pair),
                1000
            );

            results.push({
                br_a: pair.br_a.id,
                br_b: pair.br_b.id,
                lexical_similarity: pair.similarity,
                ...assessment
            });

        } catch (error) {
            results.push({
                br_a: pair.br_a.id,
                br_b: pair.br_b.id,
                lexical_similarity: pair.similarity,
                classification: 'UNCLEAR',
                confidence: 'LOW',
                reason: error.message,
                recommendation: 'Rerun this comparison.'
            });
        }
    }

    return {
        candidate_pair_count: candidates.length,
        assessed_pair_count: results.length,
        results,
        confirmed_duplicates: results.filter(
            item => item.classification === 'DUPLICATE'
        ),
        overlapping_pairs: results.filter(
            item => item.classification === 'OVERLAPPING'
        ),
        unresolved_pairs: results.filter(
            item => item.classification === 'UNCLEAR'
        )
    };
}

// ============================================================
// 11. FR-TO-BR SEMANTIC RELATIONSHIP VALIDATION
//
// Every FR is assessed against:
// - BRs already linked to it.
// - Its top similarity-ranked BR candidates.
//
// Similarity proposes candidates only.
// The model determines the semantic relationship.
// ============================================================

function buildRelationshipCandidates(frs, brs) {
    const matrix = similarityMatrix(
        frs.map(frText),
        brs.map(brText)
    );

    return frs.map((fr, index) => {
        const existingLinks = new Set();

        for (const br of brs) {
            if (arr(br.result?.linked_functional_requirements).includes(fr.id)) {
                existingLinks.add(br.id);
            }
        }

        const ranked = brs
            .map((br, brIndex) => ({
                br,
                score: matrix[index][brIndex]
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, SETTINGS.relationshipCandidateCount);

        const selected = new Map();

        for (const item of ranked) {
            selected.set(item.br.id, item);
        }

        // Never omit an existing link, even if its similarity is low.
        for (const br of brs) {
            if (existingLinks.has(br.id) && !selected.has(br.id)) {
                selected.set(br.id, {
                    br,
                    score: matrix[index][brs.indexOf(br)]
                });
            }
        }

        return {
            fr,
            existing_links: [...existingLinks],
            candidates: [...selected.values()]
        };
    });
}

function relationshipPrompt(item) {
    const candidates = item.candidates.map(candidate => ({
        business_requirement_id: candidate.br.id,
        existing_link: item.existing_links.includes(candidate.br.id),
        candidate_similarity: Number(candidate.score.toFixed(4)),
        name: candidate.br.result?.name,
        business_requirement: candidate.br.result?.business_requirement,
        business_objective: candidate.br.result?.business_objective
    }));

    return `<|im_start|>system
You are independently validating whether a Functional Requirement
substantively contributes to a Business Requirement.

A candidate may be an existing link or a newly discovered possible link.

Classify each candidate:
SUPPORTED: the FR directly implements or materially contributes to the BR.
PARTIAL: the FR contributes to only part of the BR.
UNSUPPORTED: the FR does not substantively support the BR.
UNCLEAR: insufficient information.

Do not infer support from keyword similarity alone.
Do not force every FR to link to a BR.
An FR may support multiple BRs where the business meaning justifies it.
Do not invent missing business scope.

Return ONLY JSON:
{
  "functional_requirement_id":"FR-001",
  "relationships":[
    {
      "business_requirement_id":"BR-001",
      "status":"SUPPORTED|PARTIAL|UNSUPPORTED|UNCLEAR",
      "reason":"Evidence-based explanation"
    }
  ],
  "assessment_summary":"Concise assessment"
}
<|im_end|>
<|im_start|>user
FUNCTIONAL REQUIREMENT:
${JSON.stringify(item.fr, null, 2)}

EXISTING LINKS:
${JSON.stringify(item.existing_links)}

BUSINESS REQUIREMENT CANDIDATES:
${JSON.stringify(candidates, null, 2)}
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

async function validateFrRelationships(frs, brs) {
    const candidates = buildRelationshipCandidates(frs, brs);
    const results = [];

    log(`Validating semantic FR relationships for all ${frs.length} FRs.`);

    // Sequential execution: one local llama-cli process at a time.
    for (const item of candidates) {
        try {
            const assessment = await askJson(
                `FR relationship ${item.fr.id}`,
                relationshipPrompt(item),
                1400
            );

            results.push({
                functional_requirement_id: item.fr.id,
                existing_links: item.existing_links,
                candidate_business_requirements: item.candidates.map(
                    candidate => candidate.br.id
                ),
                relationships: arr(assessment.relationships),
                assessment_summary: assessment.assessment_summary
            });

        } catch (error) {
            results.push({
                functional_requirement_id: item.fr.id,
                existing_links: item.existing_links,
                relationships: [],
                status: 'UNCLEAR',
                error: error.message
            });
        }
    }

    return results;
}

// ============================================================
// 12. CONSOLIDATED FILE VALIDATION
// ============================================================

function validateConsolidatedStructure(finalData, workBrs, evidence) {
    const findings = [];

    const consolidated = arr(finalData.business_requirements);

    const workIds = new Set(
        workBrs.map(br => br.id)
    );

    const consolidatedIds = new Set(
        consolidated.map(br => br.business_requirement_id)
    );

    for (const br of workBrs) {
        if (!consolidatedIds.has(br.id)) {
            findings.push({
                dimension: 'CONSOLIDATION',
                severity: 'HIGH',
                finding: `${br.id} exists in work/ but is missing from the consolidated file.`
            });
        }
    }

    for (const br of consolidated) {
        if (!workIds.has(br.business_requirement_id)) {
            findings.push({
                dimension: 'CONSOLIDATION',
                severity: 'HIGH',
                finding: `${br.business_requirement_id} exists in the consolidated file but has no matching work file.`
            });
        }
    }

    const knownFrIds = new Set(
        evidence.frs.map(fr => fr.id)
    );

    const linkedByFr = new Map();

    for (const br of consolidated) {
        const id = br.business_requirement_id;

        for (const frId of arr(br.linked_functional_requirements)) {
            if (!knownFrIds.has(frId)) {
                findings.push({
                    dimension: 'FR_RELATIONSHIP',
                    severity: 'HIGH',
                    finding: `${id} references unknown ${frId}.`
                });
            }

            if (!linkedByFr.has(frId)) {
                linkedByFr.set(frId, []);
            }

            linkedByFr.get(frId).push(id);
        }
    }

    const frCoverage = evidence.frs.map(fr => ({
        functional_requirement_id: fr.id,
        linked_business_requirements: linkedByFr.get(fr.id) || [],
        status: linkedByFr.has(fr.id) ? 'STRUCTURALLY_LINKED' : 'UNLINKED'
    }));

    const brCoverage = consolidated.map(br => ({
        business_requirement_id: br.business_requirement_id,
        linked_functional_requirements: arr(br.linked_functional_requirements),
        status: arr(br.linked_functional_requirements).length
            ? 'STRUCTURALLY_LINKED'
            : 'UNLINKED'
    }));

    return {
        findings,
        functional_requirement_coverage: frCoverage,
        business_requirement_coverage: brCoverage,
        unlinked_functional_requirements:
            frCoverage.filter(item => item.status === 'UNLINKED'),
        business_requirements_without_functional_requirements:
            brCoverage.filter(item => item.status === 'UNLINKED')
    };
}

function compareWorkWithConsolidated(workBrs, finalData) {
    const findings = [];

    const consolidated = new Map(
        arr(finalData.business_requirements).map(br => [
            br.business_requirement_id,
            br
        ])
    );

    const fields = [
        'name',
        'business_requirement',
        'business_objective',
        'business_value',
        'stakeholders',
        'success_measures',
        'priority',
        'policies_and_constraints',
        'assumptions',
        'risks_and_dependencies',
        'linked_functional_requirements'
    ];

    for (const work of workBrs) {
        if (!work.result) continue;

        const finalBr = consolidated.get(work.id);

        if (!finalBr) continue;

        for (const field of fields) {
            if (
                stableStringify(work.result[field] ?? null) !==
                stableStringify(finalBr[field] ?? null)
            ) {
                findings.push({
                    dimension: 'CONSOLIDATION_MISMATCH',
                    severity: 'HIGH',
                    business_requirement_id: work.id,
                    field,
                    work_file: work.file,
                    finding: `Consolidated ${field} differs from the work file.`
                });
            }
        }
    }

    return findings;
}

// ============================================================
// 13. VALIDATION WORKFLOW
// ============================================================

async function validate() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    if (!fs.existsSync(FINAL_FILE_PATH)) {
        throw new Error(
            `Configured consolidated BR file does not exist: ${FINAL_FILE_PATH}`
        );
    }

    const pool = createPool();

    try {
        // A. Load existing evidence.
        log('Loading existing Functional Requirements and business context.');

        const evidence = await loadEvidence(pool);

        log(`Loaded ${evidence.frs.length} Functional Requirements.`);
        log(`Loaded ${evidence.knowledgeRecordCount} knowledge records.`);

        const knownFrIds = new Set(
            evidence.frs.map(fr => fr.id)
        );

        // B. Discover every existing BR work file.
        const workBrs = discoverWorkFiles();

        // C. Validate every work file, sequentially.
        const individualResults = [];

        log(`Starting individual validation for all ${workBrs.length} BR files.`);

        for (let index = 0; index < workBrs.length; index++) {
            const br = workBrs[index];

            log(
                `Individual BR ${index + 1}/${workBrs.length}: ${br.id} (${br.file})`
            );

            const validation = await validateIndividual(
                br,
                evidence,
                knownFrIds
            );

            individualResults.push({
                business_requirement_id: br.id,
                file: br.file,
                status: validation.status
            });

            // A malformed JSON file cannot safely be overwritten.
            if (br.readError) {
                log(`SKIPPED WRITE for ${br.file}: ${br.readError}`);
                continue;
            }

            // Preserve the original BR payload.
            // Only add/update the validation property.
            br.data.validation = validation;

            // Keep a one-time backup of the original work file.
            const backup = `${br.fullPath}.pre-validation`;

            if (!fs.existsSync(backup)) {
                fs.copyFileSync(br.fullPath, backup);
            }

            writeJsonAtomic(br.fullPath, br.data);

            log(`${br.id}: ${validation.status}`);
        }

        // D. Use only readable BRs for semantic portfolio comparisons.
        const validWorkBrs = workBrs.filter(
            br => !br.readError &&
                br.result &&
                typeof br.result === 'object'
        );

        if (!validWorkBrs.length) {
            throw new Error('No readable BR work files available for portfolio validation.');
        }

        // E. Validate BR-to-BR duplication across all discovered BRs.
        log('Starting BR-to-BR semantic duplication assessment.');

        const portfolio = await validateDuplicates(validWorkBrs);

        // F. Validate FR-to-BR relationships for every FR.
        log('Starting FR-to-BR semantic relationship assessment.');

        const frRelationships = await validateFrRelationships(
            evidence.frs,
            validWorkBrs
        );

        // G. Read and validate the configured consolidated file.
        log(`Reading configured consolidated file: ${BR_FINAL_FILE}`);

        const finalData = readJson(FINAL_FILE_PATH);

        if (!Array.isArray(finalData.business_requirements)) {
            throw new Error(
                'Consolidated file must contain a business_requirements array.'
            );
        }

        const consolidatedStructure = validateConsolidatedStructure(
            finalData,
            validWorkBrs,
            evidence
        );

        const contentComparison = compareWorkWithConsolidated(
            validWorkBrs,
            finalData
        );

        // H. Aggregate semantic relationship results.
        const semanticRelationships = [];

        for (const frResult of frRelationships) {
            for (const relationship of frResult.relationships) {
                semanticRelationships.push({
                    functional_requirement_id: frResult.functional_requirement_id,
                    ...relationship
                });
            }
        }

        const unsupportedLinks = semanticRelationships.filter(
            item => item.status === 'UNSUPPORTED'
        );

        const partialLinks = semanticRelationships.filter(
            item => item.status === 'PARTIAL'
        );

        const unclearLinks = semanticRelationships.filter(
            item => item.status === 'UNCLEAR'
        );

        const structurallyLinkedPairs = new Set();

        for (const br of finalData.business_requirements) {
            for (const frId of arr(br.linked_functional_requirements)) {
                structurallyLinkedPairs.add(`${frId}|${br.business_requirement_id}`);
            }
        }

        const semanticallySupportedPairs = new Set(
            semanticRelationships
                .filter(item => item.status === 'SUPPORTED')
                .map(item => `${item.functional_requirement_id}|${item.business_requirement_id}`)
        );

        const structurallyLinkedButNotSupported = [
            ...structurallyLinkedPairs
        ].filter(pair => !semanticallySupportedPairs.has(pair));

        // I. Determine overall validation status.
        const counts = {
            PASS: individualResults.filter(item => item.status === 'PASS').length,
            REVIEW: individualResults.filter(item => item.status === 'REVIEW').length,
            FAIL: individualResults.filter(item => item.status === 'FAIL').length
        };

        const highStructuralFindings =
            consolidatedStructure.findings.filter(
                item => item.severity === 'HIGH'
            );

        const highMismatchFindings =
            contentComparison.filter(
                item => item.severity === 'HIGH'
            );

        const hasFailure =
            counts.FAIL > 0 ||
            highStructuralFindings.length > 0 ||
            highMismatchFindings.length > 0;

        const hasReview =
            counts.REVIEW > 0 ||
            portfolio.confirmed_duplicates.length > 0 ||
            portfolio.overlapping_pairs.length > 0 ||
            portfolio.unresolved_pairs.length > 0 ||
            unsupportedLinks.length > 0 ||
            partialLinks.length > 0 ||
            unclearLinks.length > 0 ||
            structurallyLinkedButNotSupported.length > 0 ||
            frRelationships.some(item => item.error);

        const overallStatus = hasFailure
            ? 'FAIL'
            : hasReview
                ? 'REVIEW'
                : 'PASS';

        // J. Attach validation to the existing consolidated artifact.
        const validation = {
            validation_version: '8.0.8',
            validated_at: new Date().toISOString(),
            validator: MODEL,
            status: overallStatus,

            source: {
                ingestion_id: evidence.ingestion.ingestion_id,
                functional_requirement_source: evidence.ingestion.source_file,
                functional_requirement_count: evidence.frs.length,
                work_directory: WORK_DIR,
                discovered_work_file_count: workBrs.length,
                readable_work_file_count: validWorkBrs.length,
                consolidated_file: BR_FINAL_FILE
            },

            individual_validation: {
                counts,
                results: individualResults
            },

            portfolio_validation: portfolio,

            fr_to_br_validation: {
                functional_requirements_assessed: frRelationships.length,
                semantic_relationships: frRelationships,
                unsupported_links: unsupportedLinks,
                partial_links: partialLinks,
                unclear_links: unclearLinks,
                structurally_linked_but_not_semantically_supported:
                    structurallyLinkedButNotSupported
            },

            consolidated_validation: {
                structure: consolidatedStructure,
                work_file_comparison_findings: contentComparison
            },

            approval: {
                status: 'NOT_APPROVED',
                approved_at: null,
                approved_by: null
            }
        };

        // Backup consolidated file once.
        const finalBackup = `${FINAL_FILE_PATH}.pre-validation`;

        if (!fs.existsSync(finalBackup)) {
            fs.copyFileSync(FINAL_FILE_PATH, finalBackup);
        }

        // Existing BRs are untouched; only top-level validation is added.
        finalData.validation = validation;

        writeJsonAtomic(FINAL_FILE_PATH, finalData);

        log('================================================');
        log('BUSINESS REQUIREMENTS VALIDATION COMPLETE');
        log(`Overall status: ${overallStatus}`);
        log(`Discovered BR files: ${workBrs.length}`);
        log(`Readable BR files: ${validWorkBrs.length}`);
        log(`PASS: ${counts.PASS}`);
        log(`REVIEW: ${counts.REVIEW}`);
        log(`FAIL: ${counts.FAIL}`);
        log(`BR duplication candidates assessed: ${portfolio.assessed_pair_count}`);
        log(`Confirmed duplicate pairs: ${portfolio.confirmed_duplicates.length}`);
        log(`FRs semantically assessed: ${frRelationships.length}`);
        log(`Unsupported FR-BR links: ${unsupportedLinks.length}`);
        log(`Unlinked FRs: ${consolidatedStructure.unlinked_functional_requirements.length}`);
        log(`Consolidated file updated: ${BR_FINAL_FILE}`);
        log('Approval: NOT_APPROVED');
        log('================================================');

    } finally {
        await pool.end();
    }
}

// ============================================================
// 14. EXPLICIT APPROVAL
// ============================================================

function approve() {
    if (!APPROVE_BUSINESS_REQUIREMENTS) {
        throw new Error(
            'Approval is disabled. Set APPROVE_BUSINESS_REQUIREMENTS = true after review.'
        );
    }

    if (!fs.existsSync(FINAL_FILE_PATH)) {
        throw new Error(`Consolidated file not found: ${FINAL_FILE_PATH}`);
    }

    const data = readJson(FINAL_FILE_PATH);

    if (!data.validation) {
        throw new Error('No validation results exist. Run validation first.');
    }

    if (data.validation.status !== 'PASS') {
        throw new Error(
            `Cannot approve: validation status is ${data.validation.status}.`
        );
    }

    data.validation.approval = {
        status: 'APPROVED',
        approved_at: new Date().toISOString(),
        approved_by: process.env.BR_APPROVED_BY || 'USER'
    };

    writeJsonAtomic(FINAL_FILE_PATH, data);

    log(`Approval recorded in ${BR_FINAL_FILE}.`);
}

// ============================================================
// 15. COMMAND
// ============================================================

async function main() {
    const command = process.argv[2] || 'validate';

    if (command === 'validate') {
        await validate();
        return;
    }

    if (command === 'approve') {
        approve();
        return;
    }

    throw new Error(
        `Unsupported command: ${command}. Use validate or approve.`
    );
}

if (require.main === module) {
    main().catch(error => {
        console.error('[8.0.8] FATAL:', error);
        process.exitCode = 1;
    });
}

module.exports = {
    main,
    extractJson,
    parseFrRow,
    discoverWorkFiles,
    structuralValidation,
    buildDuplicateCandidates,
    buildRelationshipCandidates,
    validateConsolidatedStructure,
    compareWorkWithConsolidated
};
