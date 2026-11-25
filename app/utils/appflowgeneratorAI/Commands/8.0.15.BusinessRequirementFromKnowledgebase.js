'use strict';
/**
 * 8.0.15.BusinessRequirementFromKnowledgebase.js
 *
 * DOMAIN-AGNOSTIC BUSINESS REQUIREMENTS GENERATOR
 *
 * Commands:
 *   node app/utils/appflowgeneratorAI/Commands/8.0.15.BusinessRequirementFromKnowledgebase.js load
 *   node app/utils/appflowgeneratorAI/Commands/8.0.15.BusinessRequirementFromKnowledgebase.js generate
 *   node app/utils/appflowgeneratorAI/Commands/8.0.15.BusinessRequirementFromKnowledgebase.js merge
 *   node app/utils/appflowgeneratorAI/Commands/8.0.15.BusinessRequirementFromKnowledgebase.js all
 *
 * Timestamped run structure:
 *
 * aiOutput/businessRequirements/
 *   active_run.json
 *   runs/
 *     BR_YYYYMMDDHHMMSSmmm/
 *       context.json
 *       manifest.json
 *       information_requirements/
 *       final/
 *         business_requirements.json
 *         business_requirements_traceability.json
 *
 * Qwen output:
 *   information_requirement_traceability
 *   business_requirements
 *
 * Final files:
 *   business_requirements.json
 *   business_requirements_traceability.json
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {
    spawn
} = require('child_process');
const {
    Pool
} = require('pg');
// ============================================================
// 1. CONFIGURATION
// ============================================================
const MODEL = process.env.MODEL || 'unsloth/Qwen3.5-9B-GGUF:Q4_K_M';
const LLAMA_CLI = process.env.LLAMA_CLI || '/Users/apple/Documents/Projects/fastify/llama-metal/build/bin/llama-completion';
const THREADS = Number(process.env.THREADS || 8);
const GPU_LAYERS = Number(process.env.GPU_LAYERS || 13);
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 128);
const UBATCH_SIZE = Number(process.env.UBATCH_SIZE || 128);
const CONTEXT_SIZE = Number(process.env.CONTEXT_SIZE || 32768);
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS || 4750);
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 1800000);
const MODEL_KILL_GRACE_MS = Number(process.env.MODEL_KILL_GRACE_MS || 6000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 2);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 10000);
// Approximate characters per generated token.
// Used only for live progress estimation.
const ESTIMATED_CHARS_PER_TOKEN = 4;
const TEMPERATURE = Number(process.env.TEMPERATURE || 0.2);
const SEED = Number(process.env.SEED || 42);
const FROM_IR = process.env.FROM_IR || null;
const TO_IR = process.env.TO_IR || null;
const LIMIT_IR = Number(process.env.LIMIT_IR || process.env.LIMIT || 0);
// Optional explicit run selection.
const RUN_ID = process.env.BR_RUN_ID || null;
const OUTPUT_DIRECTORY = path.resolve(__dirname, '..', 'aiOutput', 'businessRequirements');
const RUNS_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'runs');
const ACTIVE_RUN_FILE = path.join(OUTPUT_DIRECTORY, 'active_run.json');
// ============================================================
// 2. INFORMATION REQUIREMENT SQL
// ============================================================
const INFORMATION_REQUIREMENTS_SQL = `
SELECT
    record_id,
    content -> 'content' ->> 'information_requirement'
        AS information_requirement,
    content -> 'content' ->> 'description'
        AS description,
    content -> 'content' ->> 'business_purpose'
        AS business_purpose,
    content -> 'content' -> 'required_by_actors'
        AS required_by_actors,
    content -> 'content' -> 'related_responsibilities'
        AS related_responsibilities,
    content -> 'content' -> 'related_activities'
        AS related_activities,
    content -> 'content' -> 'related_business_objects'
        AS related_business_objects,
    content -> 'content' ->> 'information_usage'
        AS information_usage,
    content -> 'content' ->> 'information_source'
        AS information_source,
    content -> 'content' -> 'business_decisions_supported'
        AS business_decisions_supported,
    content -> 'content' -> 'required_information_details'
        AS required_information_details,
    content -> 'content' -> 'functional_rules'
        AS functional_rules,
    content -> 'content' -> 'information_validation'
        AS information_validation,
    content -> 'content' -> 'information_flow' ->> 'source'
        AS information_flow_source,
    content -> 'content' -> 'information_flow' ->> 'outcome'
        AS information_flow_outcome,
    content -> 'content' -> 'information_flow' ->> 'trigger'
        AS information_flow_trigger,
    content -> 'content' -> 'information_flow' -> 'consumer'
        AS information_flow_consumer
FROM knowledge_records
WHERE
    semantic_category = 'INFORMATION_REQUIREMENT'
    AND record_type = 'JSON_ARRAY_ITEM'
ORDER BY record_id;
`;
// ============================================================
// 3. ENUMERATIONS
// ============================================================
const VALID_REQUIREMENT_BASES = new Set(['DOCUMENTED_FACT', 'LOGICAL_DEDUCTION', 'PROPOSED_REQUIREMENT']);
const VALID_PRIORITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'TO_BE_DETERMINED']);
const VALID_TARGET_STATUSES = new Set(['NOT_SPECIFIED', 'DOCUMENTED', 'PROPOSED']);
const VALID_QUESTION_IDS = new Set(['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q11', 'Q12']);
// ============================================================
// 4. COMPLETE REASONING INSTRUCTIONS AND OUTPUT STRUCTURE
// ============================================================
/*
 * The twelve internal questions and the complete JSON output
 * structure exist together in this single prompt string.
 *
 * Do not create a separate analytical-question array.
 * Do not append a second copy of the questions.
 * Do not append a second output schema.
 * Do not generate analytical-dimensions output.
 */
// const REASONING_INSTRUCTIONS = `
// You are an independent, domain-agnostic Business Analysis engine.

// TASK
// Analyse ONE complete Information Requirement (IR) and derive zero, one or multiple distinct Business Requirements (BRs). The IR is evidence, not a boundary on independent reasoning.

// INTERNAL ANALYSIS — Q01-Q12
// Evaluate all dimensions internally:
// Q01 Business purpose/value: Why does the business exist and what value must it deliver?
// Q02 Outcomes/success: What outcomes define success and how are they measured?
// Q03 Stakeholders: Who are the stakeholders and what are their needs?
// Q04 Business model: How is the business sustained and what threatens it?
// Q05 Risks/controls: What operational, financial, legal and reputational risks require controls?
// Q06 Regulatory/policy: What regulations, policies and external obligations apply?
// Q07 Exceptions/failures: What must the business guarantee during failures, disputes, fraud, abuse or outages?
// Q08 Growth/scalability: What enables growth in volume, locations, partners and offerings?
// Q09 Information/visibility: What information, reporting and visibility support operations and improvement?
// Q10 External dependencies: Which third parties can disrupt operations and what protections are needed?
// Q11 Missing needs: What important business capabilities, obligations or needs are missing?
// Q12 Launch/priorities: What is essential before launch and what can follow?

// These questions are INTERNAL GUIDANCE ONLY. Do not output question analyses, assessments, findings, indexes or separate datasets. Use Q01-Q12 only in each BR's interview_questions when materially relevant.

// BR DERIVATION
// Generate genuine, distinct business needs, outcomes, controls, obligations or capabilities—not technical instructions or IR restatements. Do not force BRs per question or per IR. Keep distinct needs separate; do not fragment, combine unrelated needs, duplicate within an IR or merge across IRs. An empty BR array is valid.

// EVIDENCE
// requirement_basis:
// - DOCUMENTED_FACT: Explicitly supported by the IR.
// - LOGICAL_DEDUCTION: Logically follows from the IR and its implications.
// - PROPOSED_REQUIREMENT: Reasonable recommendation or gap, not an established commitment.

// Never present deductions/proposals as facts. Do not invent actors, objects, regulations, policies, vendors, figures, targets, contracts, service levels or commitments. Do not assume an unsupported domain.

// BR FIELDS
// Populate every field in the JSON structure:
// - name: Concise requirement name.
// - business_requirement: Complete, independently understandable business need.
// - business_objective: Supported objective.
// - business_value: Expected outcome/value.
// - requirement_basis: Valid enum above.
// - basis_explanation: Supporting evidence/reasoning.
// - originating_information_requirement_record_id: Exact current IR record_id.
// - originating_information_requirement: Exact current IR name.
// - origin: Exact IR record ID, name and description.
// - interview_questions: Only materially contributing Q01-Q12 IDs; at least one valid ID per BR.
// - stakeholders, policies_and_constraints, assumptions, risks_and_dependencies, related_business_objects: Supported values or [].
// - success_measures: Supported measures or []; never invent numerical targets. Use target=null if unknown and target_status DOCUMENTED, PROPOSED or NOT_SPECIFIED.
// - priority: CRITICAL, HIGH, MEDIUM, LOW or TO_BE_DETERMINED. Do not invent urgency.

// TRACEABILITY
// Every BR must reference the exact current IR record ID and name. Do not generate BR IDs; the application assigns them.

// REQUIRED JSON OUTPUT — EXACT STRUCTURE
// Return exactly these two top-level properties and no others:

// {
//   "information_requirement_traceability": {
//     "originating_information_requirement_record_id": "<EXACT_CURRENT_IR_RECORD_ID>",
//     "information_requirement": "<EXACT_CURRENT_IR_NAME>",
//     "description": "<CURRENT_IR_DESCRIPTION>"
//   },
//   "business_requirements": [
//     {
//       "name": "<BUSINESS_REQUIREMENT_NAME>",
//       "business_requirement": "<COMPLETE_BUSINESS_REQUIREMENT>",
//       "business_objective": "<BUSINESS_OBJECTIVE>",
//       "business_value": "<EXPECTED_BUSINESS_VALUE>",
//       "requirement_basis": "DOCUMENTED_FACT | LOGICAL_DEDUCTION | PROPOSED_REQUIREMENT",
//       "basis_explanation": "<EVIDENCE_OR_REASONING>",
//       "originating_information_requirement_record_id": "<EXACT_CURRENT_IR_RECORD_ID>",
//       "originating_information_requirement": "<EXACT_CURRENT_IR_NAME>",
//       "origin": {
//         "information_requirement_record_id": "<EXACT_CURRENT_IR_RECORD_ID>",
//         "information_requirement": "<EXACT_CURRENT_IR_NAME>",
//         "description": "<CURRENT_IR_DESCRIPTION>"
//       },
//       "interview_questions": ["Q01"],
//       "stakeholders": [],
//       "success_measures": [
//         {
//           "measure": "<BUSINESS_OUTCOME_OR_MEASURE>",
//           "target": null,
//           "target_status": "NOT_SPECIFIED"
//         }
//       ],
//       "priority": "TO_BE_DETERMINED",
//       "policies_and_constraints": [],
//       "assumptions": [],
//       "risks_and_dependencies": [],
//       "related_business_objects": []
//     }
//   ]
// }

// OUTPUT RULES
// - Exactly two top-level keys: information_requirement_traceability and business_requirements.
// - Include every specified BR field; use [] for unavailable collections.
// - Use exact current IR traceability values.
// - Use only valid, materially relevant Q01-Q12 IDs.
// - Empty business_requirements is valid when no defensible BR exists.
// - No analytical_dimensions, information_requirement_analyses, findings, question assessments, question-level output, indexes, derived IDs or additional properties.
// - No BR IDs; application assigns them.
// - Return one complete valid JSON object only. No Markdown, commentary or text outside JSON.
// - Do not expose chain-of-thought.
// `;

function minifyJSON(input) {
    const json = typeof input === 'string'
        ? input
        : JSON.stringify(input);

    let output = '';
    let inString = false;
    let escaped = false;

    for (const char of json) {
        if (inString) {
            output += char;

            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
        } else {
            if (char === '"') {
                inString = true;
                output += char;
            } else if (!/\s/.test(char)) {
                output += char;
            }
        }
    }

    return output;
}

// Usage

const REASONING_INSTRUCTIONS = `
You are an independent, domain-agnostic Business Analysis engine.
TASK
Analyse one complete Information Requirement (IR). Derive zero or more distinct Business Requirements (BRs). The IR is evidence, not a boundary on reasoning.
INTERNAL ANALYSIS
Evaluate:
Q01 Business purpose/value.
Q02 Outcomes/success.
Q03 Stakeholders/needs.
Q04 Business model/sustainability.
Q05 Risks/controls.
Q06 Regulations/policies.
Q07 Exceptions/failures.
Q08 Growth/scalability.
Q09 Information/visibility.
Q10 External dependencies.
Q11 Missing capabilities/needs.
Q12 Launch priorities.
Do not output analysis. Include materially relevant Q01-Q12 IDs in each BR's interview_questions.
DERIVATION
Generate genuine business needs, outcomes, obligations, controls or capabilities, not technical instructions or IR restatements. Keep distinct needs separate. Avoid duplication, fragmentation and unsupported assumptions. Zero BRs is valid.
EVIDENCE
DOCUMENTED_FACT = explicitly supported by IR.
LOGICAL_DEDUCTION = logically follows from IR.
PROPOSED_REQUIREMENT = recommendation or gap.
Never present deductions/proposals as facts. Do not invent actors, objects, policies, regulations, vendors, figures, targets or commitments.
OUTPUT
Return exactly one JSON object with two top-level keys:
1. information_requirement_traceability:
originating_information_requirement_record_id, information_requirement, description.
2. business_requirements: array of objects containing:
name, business_requirement, business_objective, business_value, requirement_basis, basis_explanation, originating_information_requirement_record_id, originating_information_requirement, origin (information_requirement_record_id, information_requirement, description), stakeholders, success_measures, priority, policies_and_constraints, assumptions, risks_and_dependencies, related_business_objects.
RULES
Populate every field. Use [] for unavailable collections. Preserve exact IR ID, name and description in traceability. Use valid evidence enums and relevant Q IDs. Success measures must contain measure, target and target_status (DOCUMENTED, PROPOSED or NOT_SPECIFIED); unknown targets are null. Priority must be CRITICAL, HIGH, MEDIUM, LOW or TO_BE_DETERMINED. Never invent targets or urgency. Do not generate BR IDs; application assigns them. No additional properties or analytical output. Return valid JSON only, without Markdown, commentary or chain-of-thought.
`

// ============================================================
// 5. GENERAL HELPERS
// ============================================================
function log(section, message) {
    console.log(`[${new Date().toISOString()}] [${section}] ${message}`);
}

function ensureDirectory(directory) {
    fs.mkdirSync(directory, {
        recursive: true
    });
}

function writeJSON(filePath, value) {
    ensureDirectory(path.dirname(filePath));
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(temporaryPath, filePath);
}

function readJSON(filePath, fallback = null) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isPlainObject(value) {
    return (value !== null && typeof value === 'object' && !Array.isArray(value));
}

function arr(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === null || value === undefined) {
        return [];
    }
    return [value];
}

function toStringValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value).trim();
}

function normalizeText(value) {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values) {
    const seen = new Set();
    return arr(values).map(toStringValue).filter(Boolean).filter(value => {
        const key = normalizeText(value);
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function parseJSONValue(value) {
    if (typeof value !== 'string') {
        return value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return value;
    }
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function safeFileName(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 100);
}

function shortHash(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function compareRecordIds(a, b) {
    const left = Number(a);
    const right = Number(b);
    if (Number.isFinite(left) && Number.isFinite(right)) {
        return left - right;
    }
    return String(a).localeCompare(String(b));
}

function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function timestampRunId(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
}

function createRunId() {
    return `BR_${timestampRunId()}`;
}

function getTimestampFromRunId(runId) {
    const match = String(runId || '').match(/^BR_(\d{17})$/);
    return match ? match[1] : null;
}

function normalizeEnum(value, validValues) {
    const normalized = toStringValue(value).toUpperCase();
    return validValues.has(normalized) ? normalized : '';
}
// ============================================================
// 6. DATABASE CONFIGURATION
// ============================================================
function findDatabaseConfigFile() {
    const candidates = [
        path.resolve(__dirname, '../../config/config.json'),
        path.resolve(__dirname, '../config/config.json'),
        path.resolve(process.cwd(), 'app/config/config.json'),
        path.resolve(process.cwd(), 'config/config.json')
    ];
    const found = candidates.find(candidate => fs.existsSync(candidate));
    if (!found) {
        throw new Error('Unable to locate app/config/config.json. Checked:\n' + candidates.join('\n'));
    }
    return found;
}

function loadDatabaseConfiguration() {
    const configPath = findDatabaseConfigFile();
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const environment = process.env.NODE_ENV || 'development';
    const config = raw[environment] || raw.development || raw;
    if (!config.database) {
        throw new Error(`Database name missing in ${configPath}`);
    }
    const user = config.username || config.user;
    if (!user) {
        throw new Error(`Database username missing in ${configPath}`);
    }
    return {
        host: config.host || 'localhost',
        port: Number(config.port || 5432),
        database: config.database,
        user,
        password: config.password,
        ssl: config.ssl || false,
        max: 3,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    };
}
async function connectToPostgreSQL() {
    const pool = new Pool(loadDatabaseConfiguration());
    pool.on('error', error => {
        log('DATABASE', `Unexpected pool error: ${error.message}`);
    });
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        log('DATABASE', 'PostgreSQL connection established.');
    } finally {
        client.release();
    }
    return pool;
}
// ============================================================
// 7. RUN MANAGEMENT — TIMESTAMP IS THE RUN ID
// ============================================================
function getRunDirectory(runId) {
    return path.join(RUNS_DIRECTORY, runId);
}

function getManifestPath(runId) {
    return path.join(getRunDirectory(runId), 'manifest.json');
}

function getContextPath(runId) {
    return path.join(getRunDirectory(runId), 'context.json');
}

function getIRResultsDirectory(runId) {
    return path.join(getRunDirectory(runId), 'information_requirements');
}

function getIRResultPath(runId, recordId) {
    return path.join(getIRResultsDirectory(runId), `IR_${safeFileName(recordId)}_${shortHash(recordId)}.json`);
}

function getFinalDirectory(runId) {
    return path.join(getRunDirectory(runId), 'final');
}
/**
 * Persist the manifest and the exact active timestamped run.
 *
 * generate and merge use this pointer to locate the run created
 * by load. They do not create a new run.
 */
function persistManifest(manifest) {
    manifest.updated_at = new Date().toISOString();
    writeJSON(getManifestPath(manifest.run_id), manifest);
    writeJSON(ACTIVE_RUN_FILE, {
        run_id: manifest.run_id,
        run_timestamp: manifest.run_timestamp,
        created_at: manifest.created_at,
        updated_at: manifest.updated_at,
        manifest_file: getManifestPath(manifest.run_id)
    });
}
/**
 * Find the most recent valid timestamped run.
 * Used only when active_run.json is unavailable or invalid.
 */
function findLatestTimestampedRun() {
    if (!fs.existsSync(RUNS_DIRECTORY)) {
        return null;
    }
    const runDirectories = fs.readdirSync(RUNS_DIRECTORY, {
        withFileTypes: true
    }).filter(entry => entry.isDirectory() && /^BR_\d{17}$/.test(entry.name)).map(entry => entry.name).sort().reverse();
    for (const runId of runDirectories) {
        const manifestPath = getManifestPath(runId);
        if (!fs.existsSync(manifestPath)) {
            continue;
        }
        try {
            const manifest = readJSON(manifestPath);
            if (manifest && manifest.run_id === runId && Array.isArray(manifest.statistics ? [manifest.statistics] : [])) {
                return {
                    run_id: runId,
                    run_timestamp: manifest.run_timestamp || getTimestampFromRunId(runId),
                    manifest
                };
            }
        } catch (error) {
            log('RUN', `Ignoring invalid manifest ${manifestPath}: ${error.message}`);
        }
    }
    return null;
}
/**
 * Resolve run in this order:
 * 1. Explicit BR_RUN_ID.
 * 2. Timestamped run recorded in active_run.json by load.
 * 3. Latest valid timestamped run directory.
 */
function resolveRunId() {
    if (RUN_ID) {
        return RUN_ID;
    }
    const activeRun = readJSON(ACTIVE_RUN_FILE);
    if (activeRun && activeRun.run_id && fs.existsSync(getManifestPath(activeRun.run_id))) {
        return activeRun.run_id;
    }
    const latestRun = findLatestTimestampedRun();
    if (latestRun) {
        log('RUN', `active_run.json unavailable or invalid. Using latest timestamped run: ${latestRun.run_id}`);
        return latestRun.run_id;
    }
    throw new Error('No timestamped run found. Execute the load command first.');
}

function loadManifest() {
    const runId = resolveRunId();
    const manifest = readJSON(getManifestPath(runId));
    if (!manifest) {
        throw new Error(`Manifest not found for timestamped run ${runId}. Execute load first or provide a valid BR_RUN_ID.`);
    }
    if (manifest.run_id !== runId) {
        throw new Error(`Run ID mismatch. Requested ${runId}; manifest contains ${manifest.run_id}.`);
    }
    const timestamp = manifest.run_timestamp || getTimestampFromRunId(runId);
    if (!timestamp) {
        throw new Error(`Run ${runId} does not contain a valid timestamp.`);
    }
    log('RUN', `Using timestamped run: ${runId}`);
    log('RUN', `Run timestamp: ${timestamp}`);
    return manifest;
}

function loadContext(manifest) {
    const context = readJSON(manifest.context_file || getContextPath(manifest.run_id));
    if (!context || !Array.isArray(context.information_requirements)) {
        throw new Error(`Run context is missing or invalid for ${manifest.run_id}.`);
    }
    return context;
}
// ============================================================
// 8. LOAD INFORMATION REQUIREMENTS
// ============================================================
async function loadInformationRequirements(db) {
    log('LOAD', 'Loading Information Requirements using configured SQL.');
    const result = await db.query(INFORMATION_REQUIREMENTS_SQL);
    const requirements = result.rows.map(row => ({
        ...row,
        required_by_actors: parseJSONValue(row.required_by_actors),
        related_responsibilities: parseJSONValue(row.related_responsibilities),
        related_activities: parseJSONValue(row.related_activities),
        related_business_objects: parseJSONValue(row.related_business_objects),
        business_decisions_supported: parseJSONValue(row.business_decisions_supported),
        required_information_details: parseJSONValue(row.required_information_details),
        functional_rules: parseJSONValue(row.functional_rules),
        information_validation: parseJSONValue(row.information_validation),
        information_flow_consumer: parseJSONValue(row.information_flow_consumer)
    }));
    log('LOAD', `Information Requirements loaded: ${requirements.length}`);
    return requirements;
}
async function stepLoad(db) {
    ensureDirectory(OUTPUT_DIRECTORY);
    ensureDirectory(RUNS_DIRECTORY);
    // Create the timestamp exactly once for this load operation.
    const loadDate = new Date();
    const runTimestamp = timestampRunId(loadDate);
    const runId = RUN_ID || `BR_${runTimestamp}`;
    const runDirectory = getRunDirectory(runId);
    if (fs.existsSync(getManifestPath(runId))) {
        throw new Error(`Run ${runId} already exists. Use its existing run for generate/merge, or select a new BR_RUN_ID.`);
    }
    log('LOAD', `Creating timestamped run: ${runId}`);
    log('LOAD', `Run timestamp: ${runTimestamp}`);
    ensureDirectory(runDirectory);
    ensureDirectory(getIRResultsDirectory(runId));
    ensureDirectory(getFinalDirectory(runId));
    const informationRequirements = await loadInformationRequirements(db);
    const context = {
        run_id: runId,
        run_timestamp: runTimestamp,
        created_at: loadDate.toISOString(),
        model: MODEL,
        information_requirements: informationRequirements,
        statistics: {
            information_requirements: informationRequirements.length
        }
    };
    const contextPath = getContextPath(runId);
    writeJSON(contextPath, context);
    const manifest = {
        run_id: runId,
        run_timestamp: runTimestamp,
        model: MODEL,
        created_at: loadDate.toISOString(),
        updated_at: loadDate.toISOString(),
        run_directory: runDirectory,
        context_file: contextPath,
        information_requirements_directory: getIRResultsDirectory(runId),
        final_directory: getFinalDirectory(runId),
        statistics: context.statistics,
        status: 'LOADED',
        generation_progress: null,
        generation_summary: null,
        merge_summary: null,
        failures: []
    };
    // This writes manifest.json and active_run.json.
    persistManifest(manifest);
    log('LOAD', `Run created: ${runId}`);
    log('LOAD', `Context file: ${contextPath}`);
    log('LOAD', `Manifest file: ${getManifestPath(runId)}`);
    log('LOAD', `Active run pointer: ${ACTIVE_RUN_FILE}`);
    log('LOAD', `IR count: ${informationRequirements.length}`);
    return {
        manifest,
        context
    };
}
// ============================================================
// 9. BUILD GENERATION PROMPT
// ============================================================
/**
 * The complete JSON schema already exists in
 * REASONING_INSTRUCTIONS.
 *
 * Do not append a second output schema here.
 */
function buildGenerationPrompt(ir, correctionError = null) {
    const sections = [
        REASONING_INSTRUCTIONS, '\n============================================================\n', 'CURRENT INFORMATION REQUIREMENT\n', '============================================================\n',
        minifyJSON(ir)
    ];
    if (correctionError) {
        sections.push('\n\n============================================================\n', 'CORRECTION REQUIRED\n', '============================================================\n', `The previous response failed validation:\n${correctionError}\n\n`, 'Regenerate the COMPLETE JSON response from the original IR.\n', 'Do not return a partial correction.\n', 'Return exactly the two required top-level properties already defined in the instructions.\n', 'Include every required BR field.\n', 'Use exact current IR traceability values.\n', 'Do not add analytical dimensions or other properties.\n', 'Return valid JSON only.\n');
    }
    return sections.join('');
}
// ============================================================
// 10. PROMPT CAPACITY PREFLIGHT
// ============================================================
function estimateTokenCount(text) {
    return Math.ceil(Buffer.byteLength(text, 'utf8') / 3);
}

function validatePromptCapacity(prompt, maxTokens) {
    const estimatedPromptTokens = estimateTokenCount(prompt);
    const reservedTokens = 128;
    const requiredContext = estimatedPromptTokens + maxTokens + reservedTokens;
    if (requiredContext > CONTEXT_SIZE) {
        throw new Error(
            ['Prompt exceeds configured context capacity.', `Estimated prompt tokens: ${estimatedPromptTokens}`, `Requested output tokens: ${maxTokens}`, `Reserved tokens: ${reservedTokens}`, `Required context: ${requiredContext}`, `Configured context: ${CONTEXT_SIZE}`, 'No prompt or IR content was truncated.', 'Increase CONTEXT_SIZE or reduce MAX_OUTPUT_TOKENS.'].join('\n'));
    }
}
// ============================================================
// 11. QWEN EXECUTION
// ============================================================
// function runQwen(
//     prompt,
//     maxTokens = MAX_OUTPUT_TOKENS
// ) {
//     return new Promise((resolve, reject) => {
//         if (!fs.existsSync(LLAMA_CLI)) {
//             reject(
//                 new Error(
//                     `llama-completion executable not found: ${LLAMA_CLI}`
//                 )
//             );
//             return;
//         }
//         validatePromptCapacity(prompt, maxTokens);
//         const promptFile = path.join(
//             os.tmpdir(),
//             `br_prompt_${process.pid}_${crypto.randomBytes(6).toString('hex')}.txt`
//         );
//         fs.writeFileSync(
//             promptFile,
//             prompt,
//             'utf8'
//         );
//         const args = [
//             '-hf', MODEL,
//             '-no-cnv',
//             '--verbose',
//             '-ngl', String(GPU_LAYERS),
//             '--fit', 'off',
//             '--single-turn',
//             '-c', String(CONTEXT_SIZE),
//             '-b', String(BATCH_SIZE),
//             '-ub', String(UBATCH_SIZE),
//             '-t', String(THREADS),
//             '--reasoning', 'off',
//             '-s', String(SEED),
//             '--temp', String(TEMPERATURE),
//             '-n', String(maxTokens),
//             '-f', promptFile
//         ];
//         if (process.env.METAL_DEVICE) {
//             args.push(
//                 '--device',
//                 process.env.METAL_DEVICE
//             );
//         }
//         log('QWEN', `Model: ${MODEL}`);
//         log(
//             'QWEN',
//             `Prompt characters: ${prompt.length}`
//         );
//         log(
//             'QWEN',
//             `Estimated prompt tokens: ${estimateTokenCount(prompt)}`
//         );
//         log(
//             'QWEN',
//             `Output token allowance: ${maxTokens}`
//         );
//         const child = spawn(
//             LLAMA_CLI,
//             args,
//             {
//                 stdio: [
//                     'ignore',
//                     'pipe',
//                     'pipe'
//                 ],
//                 env: process.env
//             }
//         );
//         let stdout = '';
//         let stderr = '';
//         let settled = false;
//         let timedOut = false;
//         let killTimer = null;
//         const startedAt = Date.now();
//         const heartbeat = setInterval(() => {
//             const elapsed = Math.round(
//                 (Date.now() - startedAt) / 1000
//             );
//             log(
//                 'QWEN',
//                 `Still running. Elapsed: ${elapsed}s`
//             );
//         }, HEARTBEAT_MS);
//         const timeout = setTimeout(() => {
//             timedOut = true;
//             log(
//                 'QWEN',
//                 'Timeout reached. Sending SIGTERM.'
//             );
//             child.kill('SIGTERM');
//             killTimer = setTimeout(() => {
//                 if (!settled) {
//                     child.kill('SIGKILL');
//                 }
//             }, MODEL_KILL_GRACE_MS);
//         }, MODEL_TIMEOUT_MS);
//         function cleanup() {
//             clearInterval(heartbeat);
//             clearTimeout(timeout);
//             if (killTimer) {
//                 clearTimeout(killTimer);
//             }
//             try {
//                 fs.unlinkSync(promptFile);
//             } catch {
//                 // Best-effort temporary-file cleanup.
//             }
//         }
//         child.stdout.on('data', chunk => {
//             // Never truncate model stdout.
//             stdout += chunk.toString('utf8');
//         });
//         child.stderr.on('data', chunk => {
//             stderr += chunk.toString('utf8');
//             if (stderr.length > 100000) {
//                 stderr = stderr.slice(-100000);
//             }
//         });
//         child.on('error', error => {
//             if (settled) return;
//             settled = true;
//             cleanup();
//             reject(error);
//         });
//         child.on('close', (code, signal) => {
//             if (settled) return;
//             settled = true;
//             cleanup();
//             if (timedOut) {
//                 reject(
//                     new Error(
//                         `Qwen timed out after ${MODEL_TIMEOUT_MS}ms.`
//                     )
//                 );
//                 return;
//             }
//             if (!stdout.trim()) {
//                 reject(
//                     new Error(
//                         `Qwen returned empty stdout. Exit code: ${code}. ` +
//                         stderr.slice(-3000)
//                     )
//                 );
//                 return;
//             }
//             if (code !== 0) {
//                 log(
//                     'QWEN',
//                     `Process returned exit code ${code}.`
//                 );
//             }
//             log(
//                 'QWEN',
//                 `Process finished. Exit code: ${code}; signal: ${signal || 'none'}`
//             );
//             log(
//                 'QWEN',
//                 `Elapsed: ${Math.round(
//                     (Date.now() - startedAt) / 1000
//                 )}s`
//             );
//             resolve({
//                 stdout,
//                 stderr,
//                 exitCode: code,
//                 signal
//             });
//         });
//     });
// }
// ============================================================
// 11. QWEN EXECUTION
// ============================================================
// ----------------------------------------------------
// PRE-RUN QWEN EXECUTION TIME ESTIMATION
// ----------------------------------------------------
function estimateQwenExecutionTime({
    prompt,
    maxTokens,
    promptTokensPerSecond = 10,
    generationTokensPerSecond = 30,
    modelLoadingSeconds = 15,
    expectedOutputTokens = null
}) {
    // Rough estimate: 4 characters per token.
    const estimatedPromptTokens = Math.ceil(prompt.length / 4);
    // Prefer historical average output size when available.
    const estimatedOutputTokens = expectedOutputTokens !== null ? Math.min(expectedOutputTokens, maxTokens) : maxTokens;
    const modelLoadingTime = modelLoadingSeconds;
    const promptProcessingTime = estimatedPromptTokens / promptTokensPerSecond;
    const generationTime = estimatedOutputTokens / generationTokensPerSecond;
    const totalSeconds = modelLoadingTime + promptProcessingTime + generationTime;
    return {
        estimatedPromptTokens,
        estimatedOutputTokens,
        modelLoadingSeconds: modelLoadingTime,
        promptProcessingSeconds: promptProcessingTime,
        generationSeconds: generationTime,
        totalSeconds
    };
}

function runQwen(prompt, maxTokens = MAX_OUTPUT_TOKENS) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        let stdout = '';
        let stderr = '';
        let stderrBuffer = '';
        let gpuLogLines = [];
        let settled = false;
        let timedOut = false;
        let timeout = null;
        let killTimer = null;
        let heartbeat = null;
        let firstOutputAt = null;
        let lastOutputAt = null;
        let stdoutChunks = 0;
        let stderrChunks = 0;
        let lastReportedCharacters = 0;
        let child = null;
        const promptFile = path.join(os.tmpdir(), `br_prompt_${process.pid}_${crypto.randomBytes(6).toString('hex')}.txt`);
        // ----------------------------------------------------
        // PRE-RUN ESTIMATION CONFIGURATION
        // ----------------------------------------------------
        const ESTIMATED_PROMPT_TOKENS_PER_SECOND = 10;
        const ESTIMATED_GENERATION_TOKENS_PER_SECOND = 30;
        const ESTIMATED_MODEL_LOADING_SECONDS = 15;
        // ----------------------------------------------------
        // ELAPSED TIME
        // ----------------------------------------------------
        function elapsed() {
            return (
                (Date.now() - startedAt) / 1000).toFixed(2);
        }
        // ----------------------------------------------------
        // QWEN LOGGING
        // ----------------------------------------------------
        function qwenLog(message) {
            log('QWEN', `[${elapsed()}s] ${message}`);
        }
        // ----------------------------------------------------
        // PRE-RUN EXECUTION TIME ESTIMATE
        // ----------------------------------------------------
        function estimateExecutionTime() {
            const promptTokens = estimateTokenCount(prompt);
            const estimatedOutputTokens = maxTokens;
            const promptProcessingSeconds = promptTokens / ESTIMATED_PROMPT_TOKENS_PER_SECOND;
            const generationSeconds = estimatedOutputTokens / ESTIMATED_GENERATION_TOKENS_PER_SECOND;
            const modelLoadingSeconds = ESTIMATED_MODEL_LOADING_SECONDS;
            const totalSeconds = modelLoadingSeconds + promptProcessingSeconds + generationSeconds;
            return {
                promptTokens,
                estimatedOutputTokens,
                promptProcessingSeconds,
                generationSeconds,
                modelLoadingSeconds,
                totalSeconds
            };
        }

        function formatDuration(seconds) {
            const totalSeconds = Math.ceil(seconds);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const remainingSeconds = totalSeconds % 60;
            if (hours > 0) {
                return `${hours}h ${minutes}m ${remainingSeconds}s`;
            }
            return `${minutes}m ${remainingSeconds}s`;
        }
        // ----------------------------------------------------
        // CLEANUP
        // ----------------------------------------------------
        function cleanup() {
            if (heartbeat) {
                clearInterval(heartbeat);
                heartbeat = null;
            }
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
            if (killTimer) {
                clearTimeout(killTimer);
                killTimer = null;
            }
            try {
                if (fs.existsSync(promptFile)) {
                    fs.unlinkSync(promptFile);
                }
            } catch (error) {
                qwenLog(`Temporary prompt cleanup warning: ${error.message}`);
            }
        }
        // ----------------------------------------------------
        // PROMISE COMPLETION
        // ----------------------------------------------------
        function finish(error, result) {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        }
        // ----------------------------------------------------
        // STDERR DIAGNOSTICS
        // ----------------------------------------------------
        function processStderrLine(line) {
            const trimmed = String(line || '').trim();
            if (!trimmed) {
                return;
            }
            if (/offloaded\s+\d+\/\d+\s+layers\s+to\s+GPU/i.test(trimmed)) {
                gpuLogLines.push(trimmed);
                qwenLog(`GPU OFFLOAD: ${trimmed}`);
            }
        }
        // ----------------------------------------------------
        // START QWEN
        // ----------------------------------------------------
        try {
            qwenLog('Checking executable...');
            if (!fs.existsSync(LLAMA_CLI)) {
                throw new Error(`llama-completion executable not found: ${LLAMA_CLI}`);
            }
            qwenLog(`Executable: ${LLAMA_CLI}`);
            qwenLog(`Model: ${MODEL}`);
            qwenLog(`Prompt characters: ${prompt.length}`);
            qwenLog(`Estimated prompt tokens: ${estimateTokenCount(prompt)}`);
            qwenLog(`Context size: ${CONTEXT_SIZE}`);
            qwenLog(`Maximum output tokens: ${maxTokens}`);
            qwenLog(`Threads: ${THREADS}`);
            qwenLog(`GPU layers requested: ${GPU_LAYERS}`);
            qwenLog(`Batch size: ${BATCH_SIZE}`);
            qwenLog(`UBatch size: ${UBATCH_SIZE}`);
            qwenLog(`Temperature: ${TEMPERATURE}`);
            qwenLog(`Seed: ${SEED}`);
            qwenLog('Reasoning setting: off');
            // --------------------------------------------
            // PROMPT CAPACITY VALIDATION
            // --------------------------------------------
            validatePromptCapacity(prompt, maxTokens);
            // --------------------------------------------
            // WRITE TEMPORARY PROMPT
            // --------------------------------------------
            qwenLog('Writing temporary prompt file...');
            fs.writeFileSync(promptFile, prompt, 'utf8');
            qwenLog(`Prompt file: ${promptFile}`);
            // --------------------------------------------
            // LLAMA ARGUMENTS
            // --------------------------------------------
            const args = ['-hf', MODEL, '-no-cnv', '--verbose', '-ngl', String(GPU_LAYERS), '--fit', 'off', '--single-turn', '-c', String(CONTEXT_SIZE), '-b', String(BATCH_SIZE), '-ub', String(UBATCH_SIZE), '-t', String(THREADS), '--reasoning', 'off','--perf', '-s', String(SEED), '--temp', String(TEMPERATURE), '-n', String(maxTokens), '-f', promptFile];
            if (process.env.METAL_DEVICE) {
                args.push('--device', process.env.METAL_DEVICE);
                qwenLog(`Configured device: ${process.env.METAL_DEVICE}`);
            } else {
                qwenLog('No explicit METAL_DEVICE configured.');
            }
            // --------------------------------------------
            // PRE-RUN TIME ESTIMATE
            // THIS RUNS BEFORE spawn()
            // --------------------------------------------
            const estimate = estimateExecutionTime();
            qwenLog('============================================');
            qwenLog('PRE-RUN EXECUTION TIME ESTIMATE');
            qwenLog('============================================');
            qwenLog(`Estimated prompt tokens: ${estimate.promptTokens}`);
            qwenLog(`Estimated output tokens: ${estimate.estimatedOutputTokens}`);
            qwenLog(`Assumed model loading speed: ${formatDuration(estimate.modelLoadingSeconds)}`);
            qwenLog(`Estimated prompt processing: ${formatDuration(estimate.promptProcessingSeconds)}`);
            qwenLog(`Estimated generation: ${formatDuration(estimate.generationSeconds)}`);
            qwenLog('--------------------------------------------');
            qwenLog(`ESTIMATED TOTAL EXECUTION TIME: ${formatDuration(estimate.totalSeconds)}`);
            qwenLog('Note: Estimate assumes generation reaches the configured token limit.');
            qwenLog('Note: Actual duration depends on model loading, prompt processing and actual output length.');
            qwenLog('============================================');
            // --------------------------------------------
            // LAUNCH PROCESS
            // --------------------------------------------
            qwenLog('Launching Qwen process...');
            qwenLog(`Command arguments: ${args.join(' ')}`);
            child = spawn(LLAMA_CLI, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: process.env
            });
            if (child.stdout) {
                child.stdout.setEncoding('utf8');
            }
            if (child.stderr) {
                child.stderr.setEncoding('utf8');
            }
            qwenLog(`Process PID: ${child.pid || 'not available'}`);
            qwenLog('Waiting for model output...');
            // --------------------------------------------
            // STDOUT: MODEL OUTPUT
            // --------------------------------------------
            child.stdout.on('data', chunk => {
                const now = Date.now();
                stdout += chunk;
                stdoutChunks++;
                lastOutputAt = now;
                if (firstOutputAt === null) {
                    firstOutputAt = now;
                    qwenLog(`FIRST OUTPUT RECEIVED after ${(
                            (now - startedAt) / 1000
                        ).toFixed(2)} seconds`);
                }
            });
            // --------------------------------------------
            // STDERR: DIAGNOSTICS
            // --------------------------------------------
            child.stderr.on('data', chunk => {
                const text = chunk.toString('utf8');
                stderrChunks++;
                stderr += text;
                if (stderr.length > 100000) {
                    stderr = stderr.slice(-100000);
                }
                stderrBuffer += text;
                const lines = stderrBuffer.split(/\r?\n/);
                stderrBuffer = lines.pop() || '';
                for (const line of lines) {
                    processStderrLine(line);
                }
            });
            // --------------------------------------------
            // PERIODIC PROGRESS
            // --------------------------------------------
            heartbeat = setInterval(() => {
                const currentCharacters = stdout.length;
                const newCharacters = currentCharacters - lastReportedCharacters;
                const idleSeconds = lastOutputAt ? (
                    (Date.now() - lastOutputAt) / 1000).toFixed(1) : 'No output yet';
                qwenLog(
                    ['PROGRESS',
                        //`Output chars: ${currentCharacters}`,
                        `New chars: ${newCharacters}`,
                        //`Stdout chunks: ${stdoutChunks}`,
                        //`Stderr chunks: ${stderrChunks}`,
                        //`Idle: ${idleSeconds}s`
                    ].join(' | '));
                lastReportedCharacters = currentCharacters;
            }, HEARTBEAT_MS);
            // --------------------------------------------
            // TIMEOUT
            // --------------------------------------------
            timeout = setTimeout(() => {
                if (settled) {
                    return;
                }
                timedOut = true;
                qwenLog(`TIMEOUT: Qwen exceeded ${MODEL_TIMEOUT_MS}ms`);
                qwenLog('Sending SIGTERM...');
                if (child && !child.killed) {
                    child.kill('SIGTERM');
                }
                killTimer = setTimeout(() => {
                    if (!settled && child) {
                        qwenLog('Process did not terminate. Sending SIGKILL...');
                        child.kill('SIGKILL');
                    }
                }, MODEL_KILL_GRACE_MS);
            }, MODEL_TIMEOUT_MS);
            // --------------------------------------------
            // PROCESS ERROR
            // --------------------------------------------
            child.on('error', error => {
                qwenLog(`PROCESS ERROR: ${error.message}`);
                finish(new Error(`Unable to launch Qwen: ${error.message}`));
            });
            // --------------------------------------------
            // PROCESS CLOSE
            // --------------------------------------------
            child.on('close', (code, signal) => {
                if (stderrBuffer.trim()) {
                    processStderrLine(stderrBuffer);
                }
                qwenLog('Qwen process closed.');
                qwenLog(`Exit code: ${code}`);
                qwenLog(`Signal: ${signal || 'none'}`);
                qwenLog(`Timed out: ${timedOut}`);
                qwenLog(`Total duration: ${elapsed()} seconds`);
                qwenLog(`Stdout characters: ${stdout.length}`);
                qwenLog(`Stderr characters: ${stderr.length}`);
                qwenLog(`Stdout chunks: ${stdoutChunks}`);
                qwenLog(`Stderr chunks: ${stderrChunks}`);
                qwenLog(`Device diagnostic lines captured: ${gpuLogLines.length}`);
                qwenLog(`First output delay: ${
                        firstOutputAt
                            ? (
                                (firstOutputAt - startedAt) / 1000
                            ).toFixed(2) + ' seconds'
                            : 'No output received'
                    }`);
                qwenLog(`Last output received: ${
                        lastOutputAt
                            ? (
                                (Date.now() - lastOutputAt) / 1000
                            ).toFixed(2) + ' seconds before close'
                            : 'No output received'
                    }`);
                // ----------------------------------------
                // TIMEOUT RESULT
                // ----------------------------------------
                if (timedOut) {
                    finish(new Error(`Qwen timed out after ${MODEL_TIMEOUT_MS}ms. ` + `Stdout characters: ${stdout.length}. ` + `Stderr characters: ${stderr.length}.`));
                    return;
                }
                // ----------------------------------------
                // EMPTY OUTPUT
                // ----------------------------------------
                if (!stdout.trim()) {
                    finish(new Error(
                        ['Qwen returned empty stdout.', `Exit code: ${code}.`, `Signal: ${signal || 'none'}.`, `Stderr: ${stderr.slice(-3000)}`].join('\n')));
                    return;
                }
                // ----------------------------------------
                // NON-ZERO EXIT
                // ----------------------------------------
                if (code !== 0) {
                    finish(new Error(
                        [`Qwen exited with code ${code}.`, `Signal: ${signal || 'none'}.`,
                            stderr.slice(-3000)
                        ].join('\n')));
                    return;
                }
                // ----------------------------------------
                // SUCCESS
                // ----------------------------------------
                qwenLog('Qwen generation completed successfully.');
                finish(null, {
                    stdout,
                    stderr,
                    exitCode: code,
                    signal
                });
            });
        } catch (error) {
            qwenLog(`EXECUTION ERROR: ${error.message}`);
            finish(error);
        }
    });
}
// ============================================================
// 12. JSON EXTRACTION
// ============================================================
function extractJSON(text) {
    const input = String(text || '').replace(/```json/gi, '').replace(/```/g, '');
    const candidates = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = 0; index < input.length; index++) {
        const character = input[index];
        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (character === '\\') {
                escaped = true;
                continue;
            }
            if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
            continue;
        }
        if (character === '{') {
            if (depth === 0) {
                start = index;
            }
            depth++;
            continue;
        }
        if (character === '}') {
            depth--;
            if (depth < 0) {
                depth = 0;
                start = -1;
                continue;
            }
            if (depth === 0 && start >= 0) {
                const candidate = input.slice(start, index + 1);
                try {
                    candidates.push(JSON.parse(candidate));
                } catch {
                    // Ignore malformed JSON candidate.
                }
                start = -1;
            }
        }
    }
    const matching = candidates.filter(candidate => isPlainObject(candidate) && Array.isArray(candidate.business_requirements) && isPlainObject(candidate.information_requirement_traceability));
    if (!matching.length) {
        throw new Error('No complete JSON object containing information_requirement_traceability and business_requirements was found.');
    }
    return matching[matching.length - 1];
}
// ============================================================
// 13. NORMALIZATION
// ============================================================
function normalizeInterviewQuestions(value) {
    return uniqueStrings(value).map(item => item.toUpperCase()).filter(item => VALID_QUESTION_IDS.has(item));
}

function normalizeSuccessMeasures(value) {
    return arr(value).filter(isPlainObject).map(item => {
        const status = normalizeEnum(item.target_status || 'NOT_SPECIFIED', VALID_TARGET_STATUSES);
        return {
            measure: toStringValue(item.measure),
            target: item.target === undefined ? null : item.target,
            target_status: status || 'NOT_SPECIFIED'
        };
    }).filter(item => item.measure);
}


// ============================================================
// 15. ASK QWEN WITH VALIDATION RETRIES
// ============================================================
async function ask(label, promptBuilder, maxTokens = MAX_OUTPUT_TOKENS, validator = null) {
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        log(label, `Attempt ${attempt}/${MAX_RETRIES + 1}`);
        try {
            const prompt = promptBuilder(attempt, lastError);
            const response = await runQwen(prompt, maxTokens);
            const parsed = extractJSON(response.stdout);
            if (validator) {
                return validator(parsed);
            }
            return parsed;
        } catch (error) {
            lastError = error;
            log(label, `Attempt ${attempt} failed: ${error.message}`);
            if (attempt >= MAX_RETRIES + 1) {
                throw error;
            }
            await sleep(1500);
        }
    }
    throw lastError || new Error('Qwen request failed.');
}
// ============================================================
// 16. BR ID ALLOCATION
// ============================================================
function getExistingBRNumber(runId) {
    const directory = getIRResultsDirectory(runId);
    if (!fs.existsSync(directory)) {
        return 0;
    }
    let maximum = 0;
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
    for (const file of files) {
        const data = readJSON(path.join(directory, file));
        if (!data || !Array.isArray(data.business_requirements)) {
            continue;
        }
        for (const br of data.business_requirements) {
            const match = String(br.business_requirement_id || br.requirement_id || '').match(/^BR-(\d+)$/);
            if (match) {
                maximum = Math.max(maximum, Number(match[1]));
            }
        }
    }
    return maximum;
}

function allocateBRIds(runId, requirements) {
    let nextNumber = getExistingBRNumber(runId) + 1;
    for (const br of requirements) {
        br.business_requirement_id = `BR-${String(nextNumber).padStart(3, '0')}`;
        nextNumber++;
    }
    return requirements;
}
// ============================================================
// 17. PER-IR RESULT MANAGEMENT
// ============================================================
function isCompletedIR(runId, recordId) {
    const result = readJSON(getIRResultPath(runId, recordId));
    return Boolean(result && result.status === 'COMPLETED' && Array.isArray(result.business_requirements) && isPlainObject(result.information_requirement_traceability));
}

function saveIRResult(runId, ir, generation, metadata = {}) {
    const manifest = readJSON(getManifestPath(runId), {});
    const result = {
        status: 'COMPLETED',
        run_id: runId,
        run_timestamp: manifest.run_timestamp || getTimestampFromRunId(runId),
        generated_at: new Date().toISOString(),
        information_requirement_record_id: String(ir.record_id),
        information_requirement: toStringValue(ir.information_requirement),
        information_requirement_traceability: generation.information_requirement_traceability,
        generated_count: generation.business_requirements.length,
        business_requirements: generation.business_requirements,
        metadata
    };
    writeJSON(getIRResultPath(runId, ir.record_id), result);
    return result;
}
// ============================================================
// 18. FILTER INFORMATION REQUIREMENTS
// ============================================================
function filterInformationRequirements(requirements) {
    let filtered = [...requirements];
    if (FROM_IR !== null) {
        filtered = filtered.filter(ir => compareRecordIds(ir.record_id, FROM_IR) >= 0);
    }
    if (TO_IR !== null) {
        filtered = filtered.filter(ir => compareRecordIds(ir.record_id, TO_IR) <= 0);
    }
    if (LIMIT_IR > 0) {
        filtered = filtered.slice(0, LIMIT_IR);
    }
    return filtered;
}
// ============================================================
// 19. GENERATE ONE INFORMATION REQUIREMENT
// ============================================================
async function generateForInformationRequirement(manifest, ir, position, total) {

    const recordId = String(ir.record_id);

    log('GENERATE', `Processing IR ${position}/${total}: ${recordId}`);

    if (isCompletedIR(manifest.run_id, recordId)) {
        log('GENERATE', `Skipping completed IR: ${recordId}`);

        return {
            skipped: true,
            record_id: recordId,
            generated_count: 0
        };
    }

    // 1. Build prompt
    const prompt = buildGenerationPrompt(ir);
console.log(prompt)
    // 2. Execute AI and await response
   // 1. Generate BRs
const response = await ask(
    `IR ${recordId}`,
    () => prompt,
    MAX_OUTPUT_TOKENS
);

// 2. Allocate BR IDs
const requirementsWithIds = allocateBRIds(
    manifest.run_id,
    response.business_requirements
);

// 3. Save generated result
const saved = saveIRResult(
    manifest.run_id,
    ir,
    {
        information_requirement_traceability: response.information_requirement_traceability,
        business_requirements: requirementsWithIds
    },
    {
        model: MODEL,
        run_id: manifest.run_id,
        run_timestamp: manifest.run_timestamp,
        generated_at: new Date().toISOString()
    }
);

log('GENERATE', `IR ${recordId} completed. BRs generated: ${saved.generated_count}`);

return {
    skipped: false,
    record_id: recordId,
    generated_count: saved.generated_count

}
};
// ============================================================
// 20. GENERATE STAGE
// ============================================================
async function stepGenerate() {
    // Reads the timestamped run created by load.
    const manifest = loadManifest();
    const context = loadContext(manifest);
    log('GENERATE', `Run: ${manifest.run_id}`);
    log('GENERATE', `Run timestamp: ${manifest.run_timestamp}`);
    const requirements = filterInformationRequirements(context.information_requirements);
    if (!requirements.length) {
        log('GENERATE', 'No Information Requirements match the selected filters.');
        return;
    }
    log('GENERATE', `Selected Information Requirements: ${requirements.length}`);
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];
    // Strictly sequential: one IR at a time.
    for (let index = 0; index < requirements.length; index++) {
        const ir = requirements[index];
        try {
            const result = await generateForInformationRequirement(manifest, ir, index + 1, requirements.length);
            if (result.skipped) {
                skipped++;
            } else {
                completed++;
            }
        } catch (error) {
            failed++;
            failures.push({
                record_id: String(ir.record_id),
                error: error.message,
                failed_at: new Date().toISOString()
            });
            log('ERROR', `IR ${ir.record_id} failed: ${error.message}`);
        }
        manifest.generation_progress = {
            selected: requirements.length,
            completed,
            skipped,
            failed,
            last_processed_record_id: String(ir.record_id),
            updated_at: new Date().toISOString()
        };
        persistManifest(manifest);
    }
    manifest.status = failed > 0 ? 'GENERATION_COMPLETED_WITH_ERRORS' : 'GENERATION_COMPLETED';
    manifest.generation_summary = {
        selected: requirements.length,
        completed,
        skipped,
        failed,
        failures
    };
    manifest.failures = failures;
    persistManifest(manifest);
    log('GENERATE', `Finished. Completed: ${completed}; skipped: ${skipped}; failed: ${failed}`);
}
// ============================================================
// 21. LOAD PER-IR RESULTS
// ============================================================
function loadAllIRResults(manifest) {
    const directory = getIRResultsDirectory(manifest.run_id);
    if (!fs.existsSync(directory)) {
        return [];
    }
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.json'));
    const results = [];
    for (const file of files) {
        const result = readJSON(path.join(directory, file));
        if (!result || result.status !== 'COMPLETED' || result.run_id !== manifest.run_id || !Array.isArray(result.business_requirements) || !isPlainObject(result.information_requirement_traceability)) {
            continue;
        }
        results.push(result);
    }
    results.sort((a, b) => compareRecordIds(a.information_requirement_record_id, b.information_requirement_record_id));
    return results;
}
// ============================================================
// 22. CONSOLIDATE BUSINESS REQUIREMENTS
// ============================================================
function assembleBusinessRequirements(manifest, context, irResults) {
    const businessRequirements = [];
    const traceability = [];
    const irById = new Map(context.information_requirements.map(ir => [
        String(ir.record_id),
        ir
    ]));
    const seenBRIds = new Set();
    for (const result of irResults) {
        const irRecordId = String(result.information_requirement_record_id);
        const ir = irById.get(irRecordId);
        const irName = ir?.information_requirement || result.information_requirement;
        for (const br of result.business_requirements) {
            if (!br.business_requirement_id) {
                throw new Error(`BR from IR ${irRecordId} has no business_requirement_id.`);
            }
            if (seenBRIds.has(br.business_requirement_id)) {
                throw new Error(`Duplicate BR ID detected during merge: ${br.business_requirement_id}`);
            }
            seenBRIds.add(br.business_requirement_id);
            // Preserve independent BRs from every IR.
            // No cross-IR deduplication or merging.
            businessRequirements.push(br);
            traceability.push({
                business_requirement_id: br.business_requirement_id,
                name: br.name,
                originating_information_requirement_record_id: irRecordId,
                originating_information_requirement: irName,
                requirement_basis: br.requirement_basis
            });
        }
    }
    return {
        metadata: {
            run_id: manifest.run_id,
            run_timestamp: manifest.run_timestamp,
            model: manifest.model,
            generated_at: new Date().toISOString(),
            information_requirements_loaded: context.information_requirements.length,
            information_requirements_processed: irResults.length,
            business_requirements_generated: businessRequirements.length
        },
        business_requirements: businessRequirements,
        traceability
    };
}
// ============================================================
// 23. MERGE STAGE
// ============================================================
async function stepMerge() {
    // Reads the SAME timestamped run used by generate.
    const manifest = loadManifest();
    const context = loadContext(manifest);
    log('MERGE', `Run: ${manifest.run_id}`);
    log('MERGE', `Run timestamp: ${manifest.run_timestamp}`);
    const irResults = loadAllIRResults(manifest);
    log('MERGE', `Completed IR result files found: ${irResults.length}`);
    const consolidated = assembleBusinessRequirements(manifest, context, irResults);
    const finalDirectory = getFinalDirectory(manifest.run_id);
    ensureDirectory(finalDirectory);
    const finalFile = path.join(finalDirectory, 'business_requirements.json');
    const traceFile = path.join(finalDirectory, 'business_requirements_traceability.json');
    writeJSON(finalFile, {
        metadata: consolidated.metadata,
        business_requirements: consolidated.business_requirements
    });
    writeJSON(traceFile, {
        run_id: manifest.run_id,
        run_timestamp: manifest.run_timestamp,
        generated_at: new Date().toISOString(),
        traceability: consolidated.traceability
    });
    const generationHadErrors = Number(manifest.generation_summary?.failed || 0) > 0;
    manifest.status = generationHadErrors ? 'MERGED_WITH_ERRORS' : 'MERGED';
    manifest.final_file = finalFile;
    manifest.traceability_file = traceFile;
    manifest.merge_summary = {
        processed_information_requirements: irResults.length,
        generated_business_requirements: consolidated.business_requirements.length,
        merged_at: new Date().toISOString()
    };
    persistManifest(manifest);
    log('MERGE', `Business Requirements: ${consolidated.business_requirements.length}`);
    log('MERGE', `Final output: ${finalFile}`);
    log('MERGE', `Traceability output: ${traceFile}`);
    return consolidated;
}
// ============================================================
// 24. DATABASE CLEANUP
// ============================================================
async function finishScript(db) {
    if (!db) {
        return;
    }
    try {
        await db.end();
        log('DATABASE', 'PostgreSQL connection pool closed.');
    } catch (error) {
        log('DATABASE', `Error closing PostgreSQL pool: ${error.message}`);
    }
}
// ============================================================
// 25. START SCRIPT
// ============================================================
async function startScript() {
    const command = (process.argv[2] || 'all').toLowerCase();
    let db = null;
    try {
        log('START', 'Domain-Agnostic Business Requirements Generator');
        log('START', `Command: ${command}`);
        log('START', `Model: ${MODEL}`);
        log('START', `llama-completion: ${LLAMA_CLI}`);
        if (RUN_ID) {
            log('START', `Explicit run override: ${RUN_ID}`);
        }
        if (command === 'load') {
            db = await connectToPostgreSQL();
            await stepLoad(db);
            return;
        }
        if (command === 'generate') {
            await stepGenerate();
            return;
        }
        if (command === 'merge') {
            await stepMerge();
            return;
        }
        if (command === 'all') {
            db = await connectToPostgreSQL();
            // LOAD creates the timestamped run.
            await stepLoad(db);
            // Close PostgreSQL before Qwen generation.
            await finishScript(db);
            db = null;
            // GENERATE reads the timestamped run created above.
            await stepGenerate();
            // MERGE reads that same timestamped run.
            await stepMerge();
            return;
        }
        throw new Error(`Unknown command "${command}". Use load, generate, merge or all.`);
    } catch (error) {
        log('FATAL', error.stack || error.message);
        process.exitCode = 1;
    } finally {
        if (db) {
            await finishScript(db);
        }
    }
}
// ============================================================
// 26. EXECUTION AND EXPORTS
// ============================================================
if (require.main === module) {
    startScript();
}
module.exports = {
    startScript,
    stepLoad,
    stepGenerate,
    stepMerge,
    loadInformationRequirements,
    buildGenerationPrompt,
    extractJSON,
    assembleBusinessRequirements,
    allocateBRIds,
    loadManifest,
    loadContext,
    resolveRunId,
    findLatestTimestampedRun,
    getRunDirectory,
    getManifestPath,
    getContextPath,
    getIRResultsDirectory,
    getIRResultPath,
    getFinalDirectory,
    INFORMATION_REQUIREMENTS_SQL,
    REASONING_INSTRUCTIONS
};
