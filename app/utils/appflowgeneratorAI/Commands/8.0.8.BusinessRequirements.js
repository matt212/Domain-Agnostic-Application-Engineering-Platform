
'use strict';

/**
 * 8.0.8 - BUSINESS REQUIREMENTS VALIDATION
 *
 * VALIDATION ONLY.
 *
 * - Does not generate or rewrite business requirements.
 * - Does not create or modify database tables.
 * - Preserves existing BR work files and their result objects.
 * - Reuses existing individual semantic validations.
 * - Performs deterministic structural validation.
 * - Performs batched AI business-quality validation.
 * - Performs one portfolio-level BR duplication assessment.
 * - Performs batched FR-to-BR portfolio relationship assessments.
 * - Writes the final report into the existing consolidated BR JSON.
 *
 * Run:
 * node app/utils/appflowgeneratorAI/commands/8.0.8.BusinessRequirements.js
 *
 * Optional:
 * BR_FORCE_AI=true node app/utils/appflowgeneratorAI/commands/8.0.8.BusinessRequirements.js
 *
 * Explicit approval:
 * Set APPROVE_BUSINESS_REQUIREMENTS=true below,
 * then run with "approve".
 */

// ============================================================
// 1. IMPORTS
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Pool } = require('pg');

// ============================================================
// 2. CONFIGURATION
// ============================================================

const ROOT = process.cwd();

const MODEL =
    process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';

const LLAMA_CLI =
    process.env.LLAMA_CLI_PATH || 'llama-cli';

const DB_CONFIG_PATH =
    path.join(ROOT, 'app/config/config.json');

const OUTPUT_DIR =
    process.env.BR_OUTPUT_DIR ||
    path.join(
        ROOT,
        'app/utils/appflowgeneratorAI/aiOutput/businessRequirements'
    );

const WORK_DIR = path.join(OUTPUT_DIR, 'work');

// Existing consolidated file. Configure here, not through CLI.
const BR_FINAL_FILE =
    'business_requirements-13-11-26_11:43.json';

const FINAL_FILE_PATH =
    path.join(OUTPUT_DIR, BR_FINAL_FILE);

const FR_SOURCE_FILE =
    process.env.FR_SOURCE_FILE || null;

const FR_SOURCE_PATTERN =
    process.env.FR_SOURCE_PATTERN ||
    '%consolidated-Functional-Requirements%';

const APPROVE_BUSINESS_REQUIREMENTS = false;

// Reuse existing semantic validations unless explicitly forced.
const FORCE_AI =
    String(process.env.BR_FORCE_AI || '').toLowerCase() === 'true';

// Existing BR assessments are processed in batches.
const BR_BATCH_SIZE = 5;

// All FRs are assessed, in manageable batches.
const FR_BATCH_SIZE = 16;

// Each FR is compared with its existing BR links and top candidates.
const FR_CANDIDATE_COUNT = 4;

const SETTINGS = {
    threads: Number(process.env.THREADS || 6),
    context: 6144,
    batch: 512,
    temperature: 0.1,
    timeoutMs: 300 * 60 * 1000,
    heartbeatMs: 30000,
    brMaxTokens: 2400,
    duplicateMaxTokens: 1400,
    frMaxTokens: 2800
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

const NO_THINK = '<think>\n\n</think>\n';

const log = message =>
    console.log(`[8.0.8] ${new Date().toISOString()} ${message}`);

const arr = value =>
    Array.isArray(value) ? value : [];

const cut = (value, max = 500) => {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

    return text.length > max
        ? text.slice(0, max) + '...'
        : text;
};

const pad = value =>
    String(value).padStart(3, '0');

const normalize = value =>
    String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

function flatText(value) {
    if (value == null) return '';

    if (typeof value !== 'object') {
        return String(value);
    }

    return Object.values(value)
        .map(flatText)
        .join(' ');
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, data) {
    const temp = `${file}.${process.pid}.tmp`;

    fs.writeFileSync(
        temp,
        JSON.stringify(data, null, 2)
    );

    fs.renameSync(temp, file);
}

function hash(value) {
    return crypto
        .createHash('sha256')
        .update(
            typeof value === 'string'
                ? value
                : JSON.stringify(value)
        )
        .digest('hex');
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
// Uses the existing 8.0.8 development configuration.
// ============================================================

function createPool() {
    if (!fs.existsSync(DB_CONFIG_PATH)) {
        throw new Error(
            `Database config not found: ${DB_CONFIG_PATH}`
        );
    }

    const config = JSON.parse(
        fs.readFileSync(DB_CONFIG_PATH, 'utf8')
    ).development;

    if (!config) {
        throw new Error(
            'Missing development database configuration.'
        );
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
// 4. LOAD EXISTING FUNCTIONAL REQUIREMENTS AND EVIDENCE
// ============================================================

const FR_CONTENT_FILTER = `
    kr.content ? 'result'
    AND NULLIF(kr.content #>> '{result,requirement}', '') IS NOT NULL
`;

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
            `No COMPLETED ingestion run found for ${
                FR_SOURCE_FILE || FR_SOURCE_PATTERN
            }.`
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
    const match =
        /FR[-_ ]?(\d{1,4})/i.exec(String(value || ''));

    return match
        ? `FR-${pad(Number(match[1]))}`
        : null;
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

    if (Array.isArray(business)) {
        return { items: business };
    }

    return business && typeof business === 'object'
        ? business
        : { text: String(business ?? '') };
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
        id:
            frIdFrom(row.source_file) ||
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

    log(
        `FR records found via ${fetched.via}: ${fetched.rows.length}.`
    );

    const byId = new Map();
    let unnamed = 0;

    for (const row of fetched.rows) {
        const fr = parseFrRow(row);

        if (!fr.requirement) continue;

        if (!fr.id) {
            fr.id = `FR-${pad(900 + ++unnamed)}`;

            log(
                `WARNING: no FR ID found for record ${row.record_id}; assigned ${fr.id}.`
            );
        }

        byId.set(fr.id, fr);
    }

    const frs = [...byId.values()].sort(
        (a, b) =>
            Number(a.id.replace(/\D/g, '')) -
            Number(b.id.replace(/\D/g, ''))
    );

    if (!frs.length) {
        throw new Error(
            'No usable Functional Requirements were parsed.'
        );
    }

    const expected = run.records_imported == null
        ? null
        : Number(run.records_imported);

    if (expected !== null && expected !== frs.length) {
        log(
            `WARNING: ingestion reports ${expected} records; parsed ${frs.length} FRs.`
        );
    }

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
        const rows = kb
            .filter(item => item.category === category)
            .slice(0, cap);

        if (!rows.length) continue;

        digestLines.push(
            `${category.replace(/_/g, ' ')}:`
        );

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

    const digest = digestLines.join('\n').slice(0, 3500);

    return {
        ingestion: run,
        frs,
        digest,
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
                return JSON.parse(
                    text.slice(start, i + 1)
                );
            }
        }
    }

    throw new Error(
        'Model JSON is incomplete or truncated.'
    );
}

function runLocal(label, prompt, maxTokens) {
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
            log(
                `${label}: ${Math.round((Date.now() - started) / 1000)}s; ${output.length} output chars.`
            );
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
                return finish(
                    new Error(
                        `${label}: llama-cli exit code ${code}: ${cut(stderr, 1200)}`
                    )
                );
            }

            if (!output.trim()) {
                return finish(
                    new Error(`${label}: empty output.`)
                );
            }

            finish(null, output);
        });
    });
}

async function askJson(label, prompt, tokens) {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const actualPrompt = attempt === 1
                ? prompt
                : `${prompt}

Your previous response was invalid or incomplete.
Return ONLY one complete valid JSON object.
Do not include Markdown or explanations.
Keep the JSON concise.`;

            const raw = await runLocal(
                `${label} attempt ${attempt}`,
                actualPrompt,
                attempt === 1
                    ? tokens
                    : Math.max(500, Math.floor(tokens * 0.75))
            );

            return extractJson(raw);

        } catch (error) {
            lastError = error;
            log(`${label} attempt ${attempt} failed: ${error.message}`);
        }
    }

    throw lastError;
}

// ============================================================
// 6. DISCOVER EXISTING BR WORK FILES
// ============================================================

function discoverWorkFiles() {
    if (!fs.existsSync(WORK_DIR)) {
        throw new Error(
            `BR work directory not found: ${WORK_DIR}`
        );
    }

    const filenames = fs.readdirSync(WORK_DIR)
        .filter(file =>
            /^BR-\d{3,}(?:\.[^.]+)?\.json$/i.test(file)
        )
        .sort((a, b) => {
            const idA = Number(
                (a.match(/^BR-(\d+)/i) || [])[1] || 0
            );

            const idB = Number(
                (b.match(/^BR-(\d+)/i) || [])[1] || 0
            );

            return idA - idB || a.localeCompare(b);
        });

    if (!filenames.length) {
        throw new Error(
            `No BR JSON files found in ${WORK_DIR}`
        );
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

    return files;
}

// ============================================================
// 7. DETERMINISTIC STRUCTURAL VALIDATION
// No LLM.
// ============================================================

function structuralValidation(br, knownFrIds, duplicateIds) {
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

    if (!result ||
        typeof result !== 'object' ||
        Array.isArray(result)) {
        findings.push({
            dimension: 'STRUCTURE',
            severity: 'HIGH',
            finding: 'Missing or invalid result object.'
        });

        return findings;
    }

    if (duplicateIds.has(br.id)) {
        findings.push({
            dimension: 'STRUCTURE',
            severity: 'HIGH',
            finding: `Duplicate BR ID: ${br.id}.`
        });
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

    for (const field of [
        'stakeholders',
        'success_measures',
        'policies_and_constraints',
        'assumptions',
        'risks_and_dependencies',
        'linked_functional_requirements'
    ]) {
        if (result[field] !== undefined &&
            !Array.isArray(result[field])) {
            findings.push({
                dimension: 'STRUCTURE',
                severity: 'HIGH',
                finding: `${field} must be an array.`
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

    if (new Set(linked).size !== linked.length) {
        findings.push({
            dimension: 'FR_RELATIONSHIP',
            severity: 'MEDIUM',
            finding: 'Duplicate FR IDs exist in linked_functional_requirements.'
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
// 8. COMPACT BR DATA FOR AI BATCH ASSESSMENT
// ============================================================

function compactBr(br) {
    const r = br.result || {};

    return {
        business_requirement_id: br.id,
        name: cut(r.name, 160),
        business_requirement: cut(r.business_requirement, 450),
        business_objective: cut(r.business_objective, 250),
        business_value: cut(r.business_value, 250),
        stakeholders: arr(r.stakeholders).map(x => cut(x, 100)),
        success_measures: arr(r.success_measures).map(x => cut(x, 140)),
        policies_and_constraints:
            arr(r.policies_and_constraints).map(x => cut(x, 140)),
        assumptions: arr(r.assumptions).map(x => cut(x, 180)),
        risks_and_dependencies:
            arr(r.risks_and_dependencies).map(x => cut(x, 160))
    };
}

function hasReusableSemanticValidation(br) {
    return Boolean(
        !FORCE_AI &&
        br.data &&
        br.data.validation &&
        br.data.validation.semantic &&
        br.data.validation.validated_at
    );
}

function buildBrBatchPrompt(brs, evidence) {
    const compact = brs.map(compactBr);

    return `<|im_start|>system
You are an independent senior business analyst auditing generated
Business Requirements against supplied discovery evidence.

Assess EACH supplied BR independently.

For every BR assess:
1. Business quality: genuine business need, clarity, business value.
2. Solution leakage: technical implementation or architecture prescribed
   instead of a business outcome.
3. Unsupported assumptions, claims, success measures and metrics.
4. Contradictions or unclear business meaning.

Evidence rules:
- Use only the supplied business context as evidence.
- Missing evidence means UNVERIFIED, not FALSE.
- Use CONTRADICTED only when supplied evidence directly conflicts.
- Do not invent facts, regulations, metrics or targets.
- A proposed measure must be labelled as proposed.
- Do not prescribe APIs, integrations, databases, software or architecture.
- Do not rewrite the BR.
- Do not treat ordinary references to systems as automatic solution leakage.
- Keep findings concise and specific.

Return ONLY JSON:
{
  "assessments": [
    {
      "business_requirement_id": "BR-001",
      "status": "PASS|REVIEW|FAIL",
      "business_quality": "PASS|REVIEW|FAIL",
      "solution_leakage": "NONE|POSSIBLE|CONFIRMED",
      "unsupported_assumptions": "NONE|UNVERIFIED|CONTRADICTED",
      "findings": [
        {
          "dimension": "BUSINESS_QUALITY|SOLUTION_LEAKAGE|UNSUPPORTED_ASSUMPTION|UNSUPPORTED_METRIC|CONSISTENCY",
          "severity": "HIGH|MEDIUM|LOW",
          "finding": "Specific issue",
          "evidence": "Relevant supplied evidence or evidence gap",
          "recommendation": "Business-level review action"
        }
      ],
      "assessment_summary": "Concise assessment"
    }
  ]
}
<|im_end|>
<|im_start|>user
DISCOVERY BUSINESS CONTEXT:
${evidence.digest}

BUSINESS REQUIREMENTS:
${JSON.stringify(compact, null, 2)}
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

function normalizeBrAssessment(assessment, br) {
    const allowed = ['PASS', 'REVIEW', 'FAIL'];

    const status = allowed.includes(
        String(assessment.status || '').toUpperCase()
    )
        ? String(assessment.status).toUpperCase()
        : 'REVIEW';

    return {
        status,
        business_quality: allowed.includes(
            String(assessment.business_quality || '').toUpperCase()
        )
            ? String(assessment.business_quality).toUpperCase()
            : 'REVIEW',

        solution_leakage: [
            'NONE', 'POSSIBLE', 'CONFIRMED'
        ].includes(
            String(assessment.solution_leakage || '').toUpperCase()
        )
            ? String(assessment.solution_leakage).toUpperCase()
            : 'POSSIBLE',

        unsupported_assumptions: [
            'NONE', 'UNVERIFIED', 'CONTRADICTED'
        ].includes(
            String(assessment.unsupported_assumptions || '').toUpperCase()
        )
            ? String(assessment.unsupported_assumptions).toUpperCase()
            : 'UNVERIFIED',

        findings: arr(assessment.findings),

        assessment_summary: cut(
            assessment.assessment_summary ||
            'Assessment returned without a summary.',
            1000
        )
    };
}

function saveBrValidation(br, validation) {
    if (br.readError) return;

    // Preserve the original BR result and all existing properties.
    br.data.validation = validation;

    const backup = `${br.fullPath}.pre-validation`;

    if (!fs.existsSync(backup)) {
        fs.copyFileSync(br.fullPath, backup);
    }

    writeJsonAtomic(br.fullPath, br.data);

    // Keep in-memory data synchronized.
    br.result = br.data.result;
}

async function validateBrBatches(workBrs, evidence, knownFrIds) {
    const duplicateIds = new Set();

    const idCounts = new Map();

    for (const br of workBrs) {
        idCounts.set(
            br.id,
            (idCounts.get(br.id) || 0) + 1
        );
    }

    for (const [id, count] of idCounts) {
        if (count > 1) duplicateIds.add(id);
    }

    const pending = [];
    const results = [];

    // First run deterministic structural checks on every BR.
    for (const br of workBrs) {
        const structural = structuralValidation(
            br,
            knownFrIds,
            duplicateIds
        );

        if (hasReusableSemanticValidation(br)) {
            const existing = br.data.validation;

            const highStructural = structural.some(
                item => item.severity === 'HIGH'
            );

            const status = highStructural
                ? 'FAIL'
                : existing.status || existing.semantic.status || 'REVIEW';

            const validation = {
                ...existing,
                status,
                validation_version: '8.0.8-batched',
                source_hash: hash(br.result),
                structural_findings: structural,
                reused_existing_semantic_assessment: true
            };

            saveBrValidation(br, validation);

            results.push({
                business_requirement_id: br.id,
                file: br.file,
                status,
                semantic_reused: true
            });

            log(`${br.id}: reusing existing semantic assessment.`);
        } else {
            const validation = {
                status: structural.some(
                    item => item.severity === 'HIGH'
                ) ? 'FAIL' : 'REVIEW',
                validation_version: '8.0.8-batched',
                validated_at: new Date().toISOString(),
                structural_findings: structural,
                semantic: null,
                source_hash: hash(br.result),
                reused_existing_semantic_assessment: false
            };

            if (br.readError) {
                results.push({
                    business_requirement_id: br.id,
                    file: br.file,
                    status: 'FAIL',
                    semantic_reused: false
                });

                continue;
            }

            br.data.validation = validation;
            pending.push(br);
        }
    }

    log(
        `Existing semantic assessments reused: ${results.filter(x => x.semantic_reused).length}.`
    );

    log(
        `BRs requiring AI assessment: ${pending.length}.`
    );

    // Assess unvalidated BRs in batches instead of one process per BR.
    for (
        let start = 0;
        start < pending.length;
        start += BR_BATCH_SIZE
    ) {
        const batch = pending.slice(
            start,
            start + BR_BATCH_SIZE
        );

        log(
            `Business-quality AI batch ${Math.floor(start / BR_BATCH_SIZE) + 1}: ${batch.map(br => br.id).join(', ')}`
        );

        let assessments = [];

        try {
            const response = await askJson(
                `BR quality batch ${Math.floor(start / BR_BATCH_SIZE) + 1}`,
                buildBrBatchPrompt(batch, evidence),
                SETTINGS.brMaxTokens
            );

            assessments = arr(response.assessments);

        } catch (error) {
            log(`BR batch assessment failed: ${error.message}`);
        }

        const byId = new Map(
            assessments.map(item => [
                String(item.business_requirement_id || '').toUpperCase(),
                item
            ])
        );

        // Save each BR after its batch finishes.
        for (const br of batch) {
            const structural = structuralValidation(
                br,
                knownFrIds,
                duplicateIds
            );

            const assessment = byId.get(br.id);

            let semantic;

            if (assessment) {
                semantic = normalizeBrAssessment(
                    assessment,
                    br
                );
            } else {
                semantic = {
                    status: 'REVIEW',
                    business_quality: 'REVIEW',
                    solution_leakage: 'POSSIBLE',
                    unsupported_assumptions: 'UNVERIFIED',
                    findings: [{
                        dimension: 'VALIDATION_EXECUTION',
                        severity: 'HIGH',
                        finding: 'No usable AI assessment returned for this BR.',
                        evidence: null,
                        recommendation: 'Rerun this BR assessment.'
                    }],
                    assessment_summary:
                        'AI assessment was incomplete or missing.'
                };
            }

            const structuralFail = structural.some(
                item => item.severity === 'HIGH'
            );

            const validation = {
                validation_version: '8.0.8-batched',
                validated_at: new Date().toISOString(),
                validator: MODEL,
                status: structuralFail
                    ? 'FAIL'
                    : semantic.status,
                source_hash: hash(br.result),
                structural_findings: structural,
                semantic,
                reused_existing_semantic_assessment: false
            };

            saveBrValidation(br, validation);

            results.push({
                business_requirement_id: br.id,
                file: br.file,
                status: validation.status,
                semantic_reused: false
            });

            log(`${br.id}: ${validation.status} (saved).`);
        }
    }

    // Include reused and newly generated results in BR file order.
    const resultById = new Map(
        results.map(item => [item.business_requirement_id, item])
    );

    return {
        results: workBrs.map(br =>
            resultById.get(br.id) || {
                business_requirement_id: br.id,
                file: br.file,
                status: 'REVIEW'
            }
        ),
        duplicateIds: [...duplicateIds]
    };
}

// ============================================================
// 9. BR-TO-BR PORTFOLIO DUPLICATION
// One portfolio-level AI assessment.
// ============================================================

function compactBrPortfolio(brs) {
    return brs.map(br => {
        const r = br.result || {};

        return {
            id: br.id,
            name: cut(r.name, 120),
            business_requirement: cut(r.business_requirement, 300),
            business_objective: cut(r.business_objective, 160),
            business_value: cut(r.business_value, 120)
        };
    });
}

function duplicatePortfolioPrompt(brs) {
    return `<|im_start|>system
You are auditing a complete portfolio of Business Requirements.

Compare the underlying business needs, intended outcomes, scope and
responsibilities across the entire portfolio.

Identify pairs that are:
DUPLICATE: substantially the same underlying business need and outcome.
OVERLAPPING: materially shared scope, but distinct needs remain.

Do not classify requirements as duplicates merely because they share:
- keywords
- actors
- business objects
- broad business objectives
- functional requirements

Do not merge, delete or rewrite any requirement.
Do not invent requirements.
If no duplicate or overlapping pair exists, return an empty pairs array.

Return ONLY JSON:
{
  "pairs": [
    {
      "br_a": "BR-001",
      "br_b": "BR-002",
      "classification": "DUPLICATE|OVERLAPPING",
      "confidence": "HIGH|MEDIUM|LOW",
      "reason": "Specific comparison of underlying business needs",
      "overlapping_scope": "What overlaps",
      "recommendation": "Reviewer action"
    }
  ],
  "assessment_summary": "Concise portfolio assessment"
}
<|im_end|>
<|im_start|>user
COMPLETE BUSINESS REQUIREMENT PORTFOLIO:
${JSON.stringify(compactBrPortfolio(brs), null, 2)}
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

async function validateBrPortfolio(brs, previousValidation) {
    const portfolioHash = hash(
        brs.map(br => ({
            id: br.id,
            result: br.result
        }))
    );

    const previous = previousValidation?.portfolio_validation;

    if (
        !FORCE_AI &&
        previous &&
        previous.source_hash === portfolioHash
    ) {
        log('Reusing cached BR-to-BR portfolio assessment.');

        return previous;
    }

    log(
        `Starting one portfolio-level BR duplication assessment for ${brs.length} BRs.`
    );

    try {
        const response = await askJson(
            'BR portfolio duplication',
            duplicatePortfolioPrompt(brs),
            SETTINGS.duplicateMaxTokens
        );

        const pairs = arr(response.pairs)
            .filter(pair =>
                brs.some(br => br.id === pair.br_a) &&
                brs.some(br => br.id === pair.br_b)
            );

        return {
            source_hash: portfolioHash,
            assessed_at: new Date().toISOString(),
            method: 'single_portfolio_ai_assessment',
            br_count: brs.length,
            results: pairs,
            confirmed_duplicates: pairs.filter(
                item => item.classification === 'DUPLICATE'
            ),
            overlapping_pairs: pairs.filter(
                item => item.classification === 'OVERLAPPING'
            ),
            assessment_summary: cut(
                response.assessment_summary,
                1500
            ),
            execution_status: 'COMPLETED'
        };

    } catch (error) {
        return {
            source_hash: portfolioHash,
            assessed_at: new Date().toISOString(),
            method: 'single_portfolio_ai_assessment',
            br_count: brs.length,
            results: [],
            confirmed_duplicates: [],
            overlapping_pairs: [],
            assessment_summary:
                'Portfolio duplication assessment could not be completed.',
            execution_status: 'FAILED',
            error: error.message
        };
    }
}

// ============================================================
// 10. FR-TO-BR PORTFOLIO RELATIONSHIPS
// Every FR is assessed. Existing links are never omitted.
// ============================================================

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from',
    'into', 'shall', 'system', 'their', 'have', 'been',
    'will', 'such', 'each', 'when', 'then', 'which',
    'based', 'business', 'needs', 'need', 'must',
    'through', 'using'
]);

function words(text) {
    return normalize(text)
        .split(' ')
        .filter(word =>
            word.length >= 3 && !STOP_WORDS.has(word)
        );
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
                Math.log(
                    (count + 1) /
                    ((documentFrequency.get(word) || 0) + 1)
                ) + 1;

            vector.set(word, weight);
        }

        const magnitude = Math.sqrt(
            [...vector.values()].reduce(
                (sum, value) => sum + value * value,
                0
            )
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
    const r = br.result || {};

    return [
        r.name,
        r.business_requirement,
        r.business_objective,
        r.business_value
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

function buildRelationshipItems(frs, brs) {
    const vectors = vectorize([
        ...frs.map(frText),
        ...brs.map(brText)
    ]);

    const frVectors = vectors.slice(0, frs.length);
    const brVectors = vectors.slice(frs.length);

    return frs.map((fr, index) => {
        const existingLinks = new Set();

        for (const br of brs) {
            if (
                arr(br.result?.linked_functional_requirements)
                    .includes(fr.id)
            ) {
                existingLinks.add(br.id);
            }
        }

        const ranked = brs
            .map((br, brIndex) => ({
                br,
                score: cosine(
                    frVectors[index],
                    brVectors[brIndex]
                )
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, FR_CANDIDATE_COUNT);

        const selected = new Map();

        for (const item of ranked) {
            selected.set(item.br.id, item);
        }

        // Preserve all existing links, regardless of similarity.
        for (const br of brs) {
            if (
                existingLinks.has(br.id) &&
                !selected.has(br.id)
            ) {
                const brIndex = brs.indexOf(br);

                selected.set(br.id, {
                    br,
                    score: cosine(
                        frVectors[index],
                        brVectors[brIndex]
                    )
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

function relationshipBatchPrompt(items) {
    const compact = items.map(item => ({
        functional_requirement: {
            id: item.fr.id,
            requirement: item.fr.requirement,
            business_need: item.fr.need,
            actors: item.fr.actors,
            objects: item.fr.objects
        },

        existing_links: item.existing_links,

        candidate_business_requirements:
            item.candidates.map(candidate => ({
                id: candidate.br.id,
                existing_link:
                    item.existing_links.includes(candidate.br.id),
                name: cut(candidate.br.result?.name, 100),
                business_requirement:
                    cut(candidate.br.result?.business_requirement, 220),
                business_objective:
                    cut(candidate.br.result?.business_objective, 140)
            }))
    }));

    return `<|im_start|>system
You are independently validating the relationship between Functional
Requirements and Business Requirements across a business portfolio.

Assess EVERY supplied FR.

For each candidate BR classify:
SUPPORTED: the FR directly implements or materially contributes to the BR.
PARTIAL: it contributes to only part of the BR.
UNSUPPORTED: it does not substantively support the BR.
UNCLEAR: insufficient information.

Rules:
- Existing links must be assessed.
- Candidate links may reveal a missing relationship.
- Similar wording is not proof of support.
- Do not force every FR to link to a BR.
- An FR may support multiple BRs.
- Do not invent missing business scope.
- Do not recommend technical solutions.
- Assess the actual business intent and outcomes.
- Return one result for every supplied FR.
- Keep reasons concise.

Return ONLY JSON:
{
  "functional_requirements": [
    {
      "functional_requirement_id": "FR-001",
      "relationships": [
        {
          "business_requirement_id": "BR-001",
          "status": "SUPPORTED|PARTIAL|UNSUPPORTED|UNCLEAR",
          "existing_link": true,
          "reason": "Specific business-level explanation"
        }
      ]
    }
  ]
}
<|im_end|>
<|im_start|>user
FR AND BR PORTFOLIO CANDIDATES:
${JSON.stringify(compact, null, 2)}
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

async function validateFrPortfolio(frs, brs, previousValidation) {
    const sourceHash = hash({
        frs,
        brs: brs.map(br => ({
            id: br.id,
            result: br.result
        }))
    });

    const previous = previousValidation?.fr_to_br_validation;

    if (
        !FORCE_AI &&
        previous &&
        previous.source_hash === sourceHash &&
        previous.execution_status === 'COMPLETED'
    ) {
        log('Reusing cached FR-to-BR portfolio assessment.');

        return previous;
    }

    const items = buildRelationshipItems(frs, brs);
    const allResults = [];

    const batches = [];

    for (
        let start = 0;
        start < items.length;
        start += FR_BATCH_SIZE
    ) {
        batches.push(
            items.slice(start, start + FR_BATCH_SIZE)
        );
    }

    log(
        `Assessing all ${frs.length} FRs in ${batches.length} portfolio batches.`
    );

    for (let index = 0; index < batches.length; index++) {
        const batch = batches[index];

        log(
            `FR relationship batch ${index + 1}/${batches.length}: ${batch.length} FRs.`
        );

        try {
            const response = await askJson(
                `FR portfolio batch ${index + 1}`,
                relationshipBatchPrompt(batch),
                SETTINGS.frMaxTokens
            );

            const returned = arr(
                response.functional_requirements
            );

            const byId = new Map(
                returned.map(item => [
                    String(item.functional_requirement_id || '').toUpperCase(),
                    item
                ])
            );

            for (const item of batch) {
                const assessment = byId.get(item.fr.id);

                allResults.push({
                    functional_requirement_id: item.fr.id,
                    existing_links: item.existing_links,
                    candidate_business_requirements:
                        item.candidates.map(candidate => candidate.br.id),
                    relationships: assessment
                        ? arr(assessment.relationships)
                        : [],
                    status: assessment ? 'ASSESSED' : 'UNCLEAR',
                    error: assessment
                        ? null
                        : 'Model omitted this FR from its response.'
                });
            }

        } catch (error) {
            for (const item of batch) {
                allResults.push({
                    functional_requirement_id: item.fr.id,
                    existing_links: item.existing_links,
                    candidate_business_requirements:
                        item.candidates.map(candidate => candidate.br.id),
                    relationships: [],
                    status: 'UNCLEAR',
                    error: error.message
                });
            }
        }
    }

    const allPairs = [];

    for (const item of allResults) {
        for (const relationship of item.relationships) {
            allPairs.push({
                functional_requirement_id:
                    item.functional_requirement_id,
                ...relationship
            });
        }
    }

    return {
        source_hash: sourceHash,
        assessed_at: new Date().toISOString(),
        execution_status: allResults.every(
            item => item.status === 'ASSESSED'
        )
            ? 'COMPLETED'
            : 'PARTIAL',
        functional_requirements_assessed: allResults.length,
        functional_requirements_expected: frs.length,
        results: allResults,
        semantic_relationships: allPairs,
        unsupported_links: allPairs.filter(
            item => item.status === 'UNSUPPORTED'
        ),
        partial_links: allPairs.filter(
            item => item.status === 'PARTIAL'
        ),
        unclear_links: allPairs.filter(
            item => item.status === 'UNCLEAR'
        )
    };
}

// ============================================================
// 11. CONSOLIDATED FILE AND TWO-WAY STRUCTURAL COVERAGE
// ============================================================

function validateConsolidatedStructure(finalData, workBrs, evidence) {
    const findings = [];

    const consolidated =
        arr(finalData.business_requirements);

    const workIds = new Set(
        workBrs.map(br => br.id)
    );

    const consolidatedIdCounts = new Map();

    for (const br of consolidated) {
        const id = br.business_requirement_id;

        consolidatedIdCounts.set(
            id,
            (consolidatedIdCounts.get(id) || 0) + 1
        );
    }

    for (const [id, count] of consolidatedIdCounts) {
        if (count > 1) {
            findings.push({
                dimension: 'STRUCTURE',
                severity: 'HIGH',
                finding: `Duplicate consolidated BR ID: ${id}.`
            });
        }
    }

    const consolidatedIds = new Set(
        consolidated.map(br => br.business_requirement_id)
    );

    for (const br of workBrs) {
        if (!consolidatedIds.has(br.id)) {
            findings.push({
                dimension: 'CONSOLIDATION',
                severity: 'HIGH',
                finding:
                    `${br.id} exists in work/ but is missing from the consolidated file.`
            });
        }
    }

    for (const br of consolidated) {
        if (!workIds.has(br.business_requirement_id)) {
            findings.push({
                dimension: 'CONSOLIDATION',
                severity: 'HIGH',
                finding:
                    `${br.business_requirement_id} exists in the consolidated file but has no matching work file.`
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
        linked_business_requirements:
            linkedByFr.get(fr.id) || [],
        status: linkedByFr.has(fr.id)
            ? 'STRUCTURALLY_LINKED'
            : 'UNLINKED'
    }));

    const brCoverage = consolidated.map(br => ({
        business_requirement_id: br.business_requirement_id,
        linked_functional_requirements:
            arr(br.linked_functional_requirements),
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
                    finding:
                        `Consolidated ${field} differs from the work file.`
                });
            }
        }
    }

    return findings;
}

// ============================================================
// 12. OVERALL VALIDATION AND REPORT
// ============================================================

function determineOverallStatus({
    individualResults,
    duplicatePortfolio,
    frPortfolio,
    structural,
    comparison
}) {
    const failCount = individualResults.filter(
        item => item.status === 'FAIL'
    ).length;

    const reviewCount = individualResults.filter(
        item => item.status === 'REVIEW'
    ).length;

    const highStructural = structural.findings.some(
        item => item.severity === 'HIGH'
    );

    const highMismatch = comparison.some(
        item => item.severity === 'HIGH'
    );

    if (failCount > 0 || highStructural || highMismatch) {
        return 'FAIL';
    }

    const hasDuplicate =
        duplicatePortfolio.confirmed_duplicates?.length > 0;

    const hasOverlap =
        duplicatePortfolio.overlapping_pairs?.length > 0;

    const hasFrIssues =
        frPortfolio.execution_status !== 'COMPLETED' ||
        frPortfolio.unsupported_links?.length > 0 ||
        frPortfolio.partial_links?.length > 0 ||
        frPortfolio.unclear_links?.length > 0;

    const hasCoverageIssues =
        structural.unlinked_functional_requirements.length > 0 ||
        structural.business_requirements_without_functional_requirements.length > 0;

    if (
        reviewCount > 0 ||
        hasDuplicate ||
        hasOverlap ||
        hasFrIssues ||
        hasCoverageIssues
    ) {
        return 'REVIEW';
    }

    return 'PASS';
}

// ============================================================
// 13. MAIN VALIDATION WORKFLOW
// ============================================================

async function validate() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    if (!fs.existsSync(FINAL_FILE_PATH)) {
        throw new Error(
            `Configured consolidated BR file does not exist: ${FINAL_FILE_PATH}`
        );
    }

    const finalData = readJson(FINAL_FILE_PATH);

    if (!Array.isArray(finalData.business_requirements)) {
        throw new Error(
            'Consolidated file must contain a business_requirements array.'
        );
    }

    const pool = createPool();

    try {
        log('Loading existing Functional Requirements and business context.');

        const evidence = await loadEvidence(pool);

        log(`Loaded ${evidence.frs.length} Functional Requirements.`);
        log(`Loaded ${evidence.knowledgeRecordCount} knowledge records.`);

        const knownFrIds = new Set(
            evidence.frs.map(fr => fr.id)
        );

        const workBrs = discoverWorkFiles();

        const validWorkBrs = workBrs.filter(
            br =>
                !br.readError &&
                br.result &&
                typeof br.result === 'object' &&
                !Array.isArray(br.result)
        );

        if (!validWorkBrs.length) {
            throw new Error(
                'No readable BR work files available.'
            );
        }

        // A. Deterministic structure + batched individual AI assessments.
        log('STEP 1: Structural and business-quality validation.');

        const individual = await validateBrBatches(
            workBrs,
            evidence,
            knownFrIds
        );

        // B. BR-to-BR portfolio duplication.
        log('STEP 2: BR-to-BR portfolio duplication.');

        const duplicatePortfolio = await validateBrPortfolio(
            validWorkBrs,
            finalData.validation
        );

        // C. Complete FR-to-BR relationship assessment.
        log('STEP 3: FR-to-BR portfolio relationship assessment.');

        const frPortfolio = await validateFrPortfolio(
            evidence.frs,
            validWorkBrs,
            finalData.validation
        );

        // D. Consolidated structure and two-way coverage.
        log('STEP 4: Consolidated structure and two-way coverage.');

        const structural = validateConsolidatedStructure(
            finalData,
            validWorkBrs,
            evidence
        );

        const comparison = compareWorkWithConsolidated(
            validWorkBrs,
            finalData
        );

        // E. Overall status.
        const overallStatus = determineOverallStatus({
            individualResults: individual.results,
            duplicatePortfolio,
            frPortfolio,
            structural,
            comparison
        });

        const counts = {
            PASS: individual.results.filter(
                item => item.status === 'PASS'
            ).length,

            REVIEW: individual.results.filter(
                item => item.status === 'REVIEW'
            ).length,

            FAIL: individual.results.filter(
                item => item.status === 'FAIL'
            ).length
        };

        const validation = {
            validation_version: '8.0.8-batched',
            validated_at: new Date().toISOString(),
            validator: MODEL,
            status: overallStatus,

            source: {
                ingestion_id: evidence.ingestion.ingestion_id,
                functional_requirement_source:
                    evidence.ingestion.source_file,
                functional_requirement_count: evidence.frs.length,
                discovered_work_file_count: workBrs.length,
                readable_work_file_count: validWorkBrs.length,
                consolidated_file: BR_FINAL_FILE
            },

            individual_validation: {
                counts,
                results: individual.results,
                duplicate_work_file_ids: individual.duplicateIds
            },

            portfolio_validation: duplicatePortfolio,

            fr_to_br_validation: frPortfolio,

            consolidated_validation: {
                structure: structural,
                work_file_comparison_findings: comparison
            },

            approval: {
                status: 'NOT_APPROVED',
                approved_at: null,
                approved_by: null
            }
        };

        // Preserve the original consolidated requirements.
        // Only add/update the top-level validation property.
        const backup = `${FINAL_FILE_PATH}.pre-validation`;

        if (!fs.existsSync(backup)) {
            fs.copyFileSync(FINAL_FILE_PATH, backup);
        }

        finalData.validation = validation;

        writeJsonAtomic(FINAL_FILE_PATH, finalData);

        log('================================================');
        log('BUSINESS REQUIREMENTS VALIDATION COMPLETE');
        log(`Overall status: ${overallStatus}`);
        log(`BR files: ${workBrs.length}`);
        log(`FRs: ${evidence.frs.length}`);
        log(`Individual PASS: ${counts.PASS}`);
        log(`Individual REVIEW: ${counts.REVIEW}`);
        log(`Individual FAIL: ${counts.FAIL}`);
        log(
            `BR duplicates: ${duplicatePortfolio.confirmed_duplicates?.length || 0}`
        );
        log(
            `BR overlaps: ${duplicatePortfolio.overlapping_pairs?.length || 0}`
        );
        log(
            `FR relationships assessed: ${frPortfolio.functional_requirements_assessed}/${evidence.frs.length}`
        );
        log(
            `Unsupported FR relationships: ${frPortfolio.unsupported_links?.length || 0}`
        );
        log(
            `Unlinked FRs: ${structural.unlinked_functional_requirements.length}`
        );
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
        throw new Error(
            `Consolidated file not found: ${FINAL_FILE_PATH}`
        );
    }

    const data = readJson(FINAL_FILE_PATH);

    if (!data.validation) {
        throw new Error(
            'No validation results exist. Run validation first.'
        );
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
    buildRelationshipItems,
    validateConsolidatedStructure,
    compareWorkWithConsolidated
};
