
// 'use strict';

// /* =========================================================================
//    USER STORY ASSESSMENT AND CORRECTION
//    DOMAIN-AGNOSTIC END-TO-END IMPLEMENTATION

//    Original stories:   requirements.user_stories
//    Corrected versions: requirements.user_story_versions

//    PROCESS:
//      1. Retrieve one original story and repository evidence.
//      2. Retain every retrieved business rule.
//      3. Build compact assessment-specific evidence.
//      4. Assess all 12 dimensions.
//      5. Validate assessment and evidence references.
//      6. Correct the story when required.
//      7. Validate all 31 story fields and data types.
//      8. Save a new version transactionally.

//    IMPORTANT:
//      - No artificial prompt-character limit.
//      - No estimated-token budget rejection.
//      - No prompt preflight rejection.
//      - llama-cli handles actual model context constraints.
//      - Original requirements.user_stories is NEVER updated.
//    ========================================================================= */

// const fs = require('fs');
// const path = require('path');
// const { spawn } = require('child_process');
// const { Pool } = require('pg');

// /* =========================================================================
//    1. CONFIGURATION
//    ========================================================================= */

// const ROOT = process.cwd();

// const MODEL =
//     process.env.MODEL_NAME ||
//     'unsloth/Qwen3.5-9B-GGUF';

// const LLAMA_CLI =
//     process.env.LLAMA_CLI_PATH ||
//     'llama-cli';

// const OUTPUT_DIR = path.join(
//     ROOT,
//     'app/utils/appflowgeneratorAI/aiOutput'
// );

// const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
// const TEMP_DIR = path.join(OUTPUT_DIR, 'temp');

// const DB_CONFIG_PATH = path.join(
//     ROOT,
//     'app/config/config.json'
// );

// const DIMENSIONS_CONFIG_PATH = path.join(
//     ROOT,
//     'app/utils/appflowgeneratorAI/Commands/sql/config/UserStoriesAssessmentDimensions.json'
// );

// const CONTEXT_SIZE = Number(
//     process.env.CONTEXT_SIZE || 31723
// );

// const MAX_OUTPUT_TOKENS = Number(
//     process.env.MAX_OUTPUT_TOKENS || 4096
// );

// const MODEL_THREADS = Number(
//     process.env.MODEL_THREADS || 8
// );

// const MODEL_GPU_LAYERS = Number(
//     process.env.MODEL_GPU_LAYERS || 0
// );

// const MODEL_BATCH_SIZE = Number(
//     process.env.MODEL_BATCH_SIZE || 256
// );

// const MODEL_TIMEOUT_MS = Number(
//     process.env.MODEL_TIMEOUT_MS || 1800000
// );

// /*
//  * These limits only compact individual text values in the model input.
//  * They do not limit the number of records or business rules retrieved.
//  *
//  * The original database records remain unchanged.
//  */
// const LIMITS = {
//     story_string: 450,
//     story_json_string: 90,

//     requirement_name: 100,
//     requirement_description: 200,

//     business_rule_name: 90,
//     business_rule_statement: 260,
//     business_rule_condition: 120,
//     business_rule_exception: 100,
//     business_rule_enforcement: 100,

//     knowledge_content: 600,
//     source_metadata: 90,

//     dimension_question: 200,
//     dimension_data: 90,

//     assessment_text: 500
// };

// const REQUIRED_DIMENSIONS = [
//     'user_goal',
//     'preconditions',
//     'postconditions',
//     'trigger',
//     'main_flow',
//     'alternative_flows',
//     'exception_flows',
//     'acceptance_criteria',
//     'given_when_then',
//     'business_rules',
//     'success_criteria',
//     'direct_dependencies'
// ];

// const VALID_FINDING_STATUSES = [
//     'PASS',
//     'PARTIAL',
//     'FAIL',
//     'NOT_APPLICABLE'
// ];

// const STORY_COLUMNS = [
//     'user_story_id',
//     'user_story_title',
//     'user_story_description',
//     'user_story_type',
//     'actor',
//     'user_goal',
//     'business_value',
//     'feature_id',
//     'feature_name',
//     'epic_id',
//     'epic_title',
//     'business_requirement_ids',
//     'functional_requirement_ids',
//     'business_objects',
//     'preconditions',
//     'postconditions',
//     'trigger',
//     'main_flow',
//     'alternative_flows',
//     'exception_flows',
//     'business_rules',
//     'acceptance_criteria',
//     'given_when_then',
//     'success_criteria',
//     'non_functional_requirements',
//     'dependencies',
//     'constraints',
//     'priority',
//     'estimation',
//     'source_references',
//     'status'
// ];

// const JSONB_COLUMNS = new Set([
//     'actor',
//     'business_value',
//     'business_requirement_ids',
//     'functional_requirement_ids',
//     'business_objects',
//     'preconditions',
//     'postconditions',
//     'main_flow',
//     'alternative_flows',
//     'exception_flows',
//     'business_rules',
//     'acceptance_criteria',
//     'given_when_then',
//     'success_criteria',
//     'non_functional_requirements',
//     'dependencies',
//     'constraints',
//     'source_references'
// ]);

// const ASSESSMENT_REFERENCE_KEYS = [
//     'functional_requirement_ids',
//     'business_requirement_ids',
//     'business_rule_ids',
//     'knowledge_record_ids'
// ];

// let pool;

// /* =========================================================================
//    2. GENERAL HELPERS
//    ========================================================================= */

// function ensureDirectories() {
//     fs.mkdirSync(UNIT_DIR, { recursive: true });
//     fs.mkdirSync(TEMP_DIR, { recursive: true });
// }

// function safeFileName(value) {
//     return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
// }

// function compactText(value, maxLength) {
//     if (value === null || value === undefined) {
//         return null;
//     }

//     let text;

//     if (typeof value === 'string') {
//         text = value;
//     } else {
//         try {
//             text = JSON.stringify(value);
//         } catch (_) {
//             text = String(value);
//         }
//     }

//     text = text
//         .replace(/\u0000/g, '')
//         .replace(/\s+/g, ' ')
//         .trim();

//     if (text.length <= maxLength) {
//         return text;
//     }

//     return `${text.slice(0, maxLength)} [TRUNCATED]`;
// }

// function parseJsonValue(value, fallback = null) {
//     if (value === null || value === undefined) {
//         return fallback;
//     }

//     if (typeof value !== 'string') {
//         return value;
//     }

//     try {
//         return JSON.parse(value);
//     } catch (_) {
//         return fallback;
//     }
// }

// function isPlainObject(value) {
//     return (
//         value !== null &&
//         typeof value === 'object' &&
//         !Array.isArray(value)
//     );
// }

// function safeJsonStringify(value) {

// //     fs.writeFileSync(
// //     'output.json',
// //     JSON.stringify(value, null, 2),
// //     'utf8'
// // );
//     return JSON.stringify(value);
// }

// function uniqueStrings(values) {
//     return [
//         ...new Set(
//             (values || [])
//                 .filter(value =>
//                     value !== null &&
//                     value !== undefined &&
//                     String(value).trim() !== ''
//                 )
//                 .map(value => String(value).trim())
//         )
//     ];
// }

// function getArray(value) {
//     const parsed = parseJsonValue(value, []);
//     return Array.isArray(parsed) ? parsed : [];
// }

// function getValue(row, key) {
//     return row[key] === undefined ? null : row[key];
// }

// function logSection(message) {
//     console.log('\n================================================');
//     console.log(message);
//     console.log('================================================');
// }

// /*
//  * Recursively compact nested JSON.
//  *
//  * Every array element and object key is retained.
//  * String values are shortened.
//  *
//  * This operates only on the in-memory model projection.
//  * It never modifies the database record.
//  */
// function compactNestedJson(value, maxTextLength) {
//     if (value === null || value === undefined) {
//         return null;
//     }

//     if (typeof value === 'string') {
//         return compactText(value, maxTextLength);
//     }

//     if (
//         typeof value === 'number' ||
//         typeof value === 'boolean'
//     ) {
//         return value;
//     }

//     if (Array.isArray(value)) {
//         return value.map(item =>
//             compactNestedJson(item, maxTextLength)
//         );
//     }

//     if (isPlainObject(value)) {
//         const result = {};

//         for (const [key, item] of Object.entries(value)) {
//             result[key] = compactNestedJson(
//                 item,
//                 maxTextLength
//             );
//         }

//         return result;
//     }

//     return compactText(value, maxTextLength);
// }

// /* =========================================================================
//    3. DATABASE
//    ========================================================================= */

// function createPool() {
//     if (!fs.existsSync(DB_CONFIG_PATH)) {
//         throw new Error(
//             `Database configuration not found: ${DB_CONFIG_PATH}`
//         );
//     }

//     const config = JSON.parse(
//         fs.readFileSync(DB_CONFIG_PATH, 'utf8')
//     ).development;

//     if (!config) {
//         throw new Error(
//             'Development database configuration is missing.'
//         );
//     }

//     return new Pool({
//         user: config.username,
//         password: config.password,
//         database: config.database,
//         host: config.host,
//         port: Number(config.port),
//         max: 2,
//         idleTimeoutMillis: 30000,
//         connectionTimeoutMillis: 10000
//     });
// }

// /* =========================================================================
//    4. ASSESSMENT DIMENSIONS
//    ========================================================================= */

// function loadDimensions() {
//     if (!fs.existsSync(DIMENSIONS_CONFIG_PATH)) {
//         throw new Error(
//             `Dimensions configuration not found: ${DIMENSIONS_CONFIG_PATH}`
//         );
//     }

//     const config = JSON.parse(
//         fs.readFileSync(DIMENSIONS_CONFIG_PATH, 'utf8')
//     );

//     if (
//         !Array.isArray(config.dimensions) ||
//         config.dimensions.length !== 12
//     ) {
//         throw new Error(
//             'Assessment configuration must contain exactly 12 dimensions.'
//         );
//     }

//     const names = config.dimensions.map(
//         item => item.dimension
//     );

//     if (new Set(names).size !== 12) {
//         throw new Error(
//             'Duplicate assessment dimension identifiers.'
//         );
//     }

//     for (const name of REQUIRED_DIMENSIONS) {
//         if (!names.includes(name)) {
//             throw new Error(
//                 `Missing assessment dimension: ${name}`
//             );
//         }
//     }

//     return config.dimensions.map(item => {
//         if (
//             !item.dimension ||
//             !item.question ||
//             !Array.isArray(item.data_to_supply)
//         ) {
//             throw new Error(
//                 `Invalid dimension configuration: ${JSON.stringify(item)}`
//             );
//         }

//         return {
//             dimension: item.dimension,

//             question: compactText(
//                 item.question,
//                 LIMITS.dimension_question
//             ),

//             data_to_supply: item.data_to_supply.map(value =>
//                 compactText(
//                     value,
//                     LIMITS.dimension_data
//                 )
//             )
//         };
//     });
// }

// const ASSESSMENT_DIMENSIONS = loadDimensions();

// /* =========================================================================
//    5. SELECT NEXT ORIGINAL STORY
//    ========================================================================= */

// async function selectNextUserStory() {
//     const result = await pool.query(`
//         SELECT us.user_story_id
//         FROM requirements.user_stories us
//         WHERE NOT EXISTS (
//             SELECT 1
//             FROM requirements.user_story_versions v
//             WHERE v.user_story_id = us.user_story_id
//         )
//         ORDER BY us.user_story_id
//         LIMIT 1;
//     `);

//     return result.rows[0]?.user_story_id || null;
// }

// /* =========================================================================
//    6. EVIDENCE RETRIEVAL

//    Business-rule matching:
//      A. Rules linked to the story's functional requirements.
//      B. Rules matching BOTH story actors AND story business objects.

//    All matching rules are retained.

//    KB retrieval:
//      A. Rule-linked KB records.
//      B. One-hop related KB records.
//      C. Semantic fallback only when no linked KB records exist.

//    No raw_payload columns are retrieved.
//    ========================================================================= */

// const EVIDENCE_SQL = String.raw`

// WITH

// /* ================================================================
//    1. LOAD ORIGINAL USER STORY
//    ================================================================ */

// assessment_source AS MATERIALIZED
// (
//     SELECT
//         us.*
//     FROM requirements.user_stories us
//     WHERE us.user_story_id = $1
// ),

// /* ================================================================
//    2. NORMALIZE JSON FIELDS
//    ================================================================ */

// normalized_source AS MATERIALIZED
// (
//     SELECT
//         s.*,

//         CASE
//             WHEN jsonb_typeof(
//                 to_jsonb(s) -> 'functional_requirement_ids'
//             ) = 'array'
//                 THEN to_jsonb(s) -> 'functional_requirement_ids'

//             WHEN jsonb_typeof(
//                 to_jsonb(s) -> 'functional_requirement_ids'
//             ) = 'string'
//              AND BTRIM(
//                 to_jsonb(s) ->> 'functional_requirement_ids'
//              ) LIKE '[%'
//                 THEN (
//                     to_jsonb(s) ->> 'functional_requirement_ids'
//                 )::jsonb

//             ELSE '[]'::jsonb
//         END AS fr_ids_json,

//         CASE
//             WHEN jsonb_typeof(
//                 to_jsonb(s) -> 'business_requirement_ids'
//             ) = 'array'
//                 THEN to_jsonb(s) -> 'business_requirement_ids'

//             WHEN jsonb_typeof(
//                 to_jsonb(s) -> 'business_requirement_ids'
//             ) = 'string'
//              AND BTRIM(
//                 to_jsonb(s) ->> 'business_requirement_ids'
//              ) LIKE '[%'
//                 THEN (
//                     to_jsonb(s) ->> 'business_requirement_ids'
//                 )::jsonb

//             ELSE '[]'::jsonb
//         END AS br_ids_json

//     FROM assessment_source s
// ),

// /* ================================================================
//    3. BUILD NORMALIZED STORY CONTEXT
//    ================================================================ */

// story_context AS MATERIALIZED
// (
//     SELECT
//         s.*,

//         ARRAY(
//             SELECT DISTINCT BTRIM(value)
//             FROM jsonb_array_elements_text(s.fr_ids_json)
//             WHERE NULLIF(BTRIM(value), '') IS NOT NULL
//         ) AS fr_ids,

//         ARRAY(
//             SELECT DISTINCT BTRIM(value)
//             FROM jsonb_array_elements_text(s.br_ids_json)
//             WHERE NULLIF(BTRIM(value), '') IS NOT NULL
//         ) AS br_ids

//     FROM normalized_source s
// ),

// /* ================================================================
//    4. RETRIEVE DIRECTLY ASSOCIATED FUNCTIONAL REQUIREMENTS
//    ================================================================ */

// functional_requirements AS MATERIALIZED
// (
//     SELECT DISTINCT
//         fr.functional_requirement_pk,
//         fr.functional_requirement_id,
//         fr.name,
//         fr.description,
//         fr.status,

//         'DIRECT_STORY_ASSOCIATION'::text AS retrieval_source

//     FROM story_context s

//     JOIN requirements.functional_requirements fr
//       ON fr.functional_requirement_id = ANY(s.fr_ids)
// ),

// /* ================================================================
//    5. RETRIEVE DIRECTLY ASSOCIATED BUSINESS REQUIREMENTS

//    Only IDs explicitly supplied by the User Story are used.

//    No inherited FR-to-BR retrieval.
//    ================================================================ */

// business_requirement_paths AS
// (
//     SELECT
//         br.business_requirement_pk,
//         br.business_requirement_id,
//         br.name,
//         br.business_requirement,
//         br.business_objective,
//         br.success_measures,
//         br.policies_and_constraints,

//         'DIRECT_STORY_ASSOCIATION'::text AS retrieval_source

//     FROM story_context s

//     JOIN requirements.business_requirements br
//       ON br.business_requirement_id = ANY(s.br_ids)
// ),

// business_requirements AS MATERIALIZED
// (
//     SELECT
//         business_requirement_pk,
//         business_requirement_id,
//         name,
//         business_requirement,
//         business_objective,
//         success_measures,
//         policies_and_constraints,

//         ARRAY_AGG(
//             DISTINCT retrieval_source
//             ORDER BY retrieval_source
//         ) AS retrieval_sources

//     FROM business_requirement_paths

//     GROUP BY
//         business_requirement_pk,
//         business_requirement_id,
//         name,
//         business_requirement,
//         business_objective,
//         success_measures,
//         policies_and_constraints
// ),

// /* ================================================================
//    6. BUILD FUNCTIONAL REQUIREMENT JSON ARRAY
//    ================================================================ */

// functional_requirement_evidence AS MATERIALIZED
// (
//     SELECT
//         COALESCE(
//             jsonb_agg(
//                 jsonb_build_object(
//                     'functional_requirement_pk',
//                         fr.functional_requirement_pk,

//                     'functional_requirement_id',
//                         fr.functional_requirement_id,

//                     'name',
//                         fr.name,

//                     'description',
//                         fr.description,

//                     'status',
//                         fr.status,

//                     'retrieval_source',
//                         fr.retrieval_source
//                 )
//                 ORDER BY fr.functional_requirement_id
//             ),
//             '[]'::jsonb
//         ) AS functional_requirements

//     FROM functional_requirements fr
// ),

// /* ================================================================
//    7. BUILD BUSINESS REQUIREMENT JSON ARRAY
//    ================================================================ */

// business_requirement_evidence AS MATERIALIZED
// (
//     SELECT
//         COALESCE(
//             jsonb_agg(
//                 jsonb_build_object(
//                     'business_requirement_pk',
//                         br.business_requirement_pk,

//                     'business_requirement_id',
//                         br.business_requirement_id,

//                     'name',
//                         br.name,

//                     'business_requirement',
//                         br.business_requirement,

//                     'business_objective',
//                         br.business_objective,

//                     'success_measures',
//                         br.success_measures,

//                     'policies_and_constraints',
//                         br.policies_and_constraints,

//                     'retrieval_sources',
//                         br.retrieval_sources
//                 )
//                 ORDER BY br.business_requirement_id
//             ),
//             '[]'::jsonb
//         ) AS business_requirements

//     FROM business_requirements br
// ),

// /* ================================================================
//    8. EVIDENCE SUMMARY
//    ================================================================ */

// evidence_summary AS MATERIALIZED
// (
//     SELECT
//         jsonb_build_object(

//             'functional_requirement_count',
//                 jsonb_array_length(
//                     fr.functional_requirements
//                 ),

//             'business_requirement_count',
//                 jsonb_array_length(
//                     br.business_requirements
//                 ),

//             'retrieval_status',
//                 CASE
//                     WHEN
//                         jsonb_array_length(
//                             fr.functional_requirements
//                         ) > 0

//                         OR

//                         jsonb_array_length(
//                             br.business_requirements
//                         ) > 0

//                     THEN 'REPOSITORY_EVIDENCE_AVAILABLE'

//                     ELSE 'NO_REPOSITORY_EVIDENCE_FOUND'
//                 END

//         ) AS summary

//     FROM functional_requirement_evidence fr

//     CROSS JOIN business_requirement_evidence br
// )

// /* ================================================================
//    9. FINAL RESULT

//    Original User Story fields individually.
//    Two separate repository evidence arrays.
//    No consolidated_evidence wrapper.
//    ================================================================ */

// SELECT

//     /* Original User Story */

//     s.user_story_id,
//     s.user_story_title,
//     s.user_story_description,
//     s.user_story_type,
//     s.actor,
//     s.user_goal,
//     s.business_value,
//     s.feature_id,
//     s.feature_name,
//     s.epic_id,
//     s.epic_title,
//     s.business_requirement_ids,
//     s.functional_requirement_ids,
//     s.business_objects,
//     s.preconditions,
//     s.postconditions,
//     s.trigger,
//     s.main_flow,
//     s.alternative_flows,
//     s.exception_flows,
//     s.business_rules,
//     s.acceptance_criteria,
//     s.given_when_then,
//     s.success_criteria,
//     s.non_functional_requirements,
//     s.dependencies,
//     s.constraints,
//     s.priority,
//     s.estimation,
//     s.status,

//     /* Retrieved repository evidence */

//     fr.functional_requirements,

//     br.business_requirements,

//     /* Retrieval diagnostics */

//     summary.summary AS evidence_summary

// FROM story_context s

// CROSS JOIN functional_requirement_evidence fr

// CROSS JOIN business_requirement_evidence br

// CROSS JOIN evidence_summary summary;
// `;

// /* =========================================================================
//    7. RETRIEVE STORY AND EVIDENCE
//    ========================================================================= */

// async function retrieveStoryEvidence(userStoryId) {
//     const result = await pool.query(
//         EVIDENCE_SQL,
//         [userStoryId]
//     );

//     if (result.rows.length !== 1) {
//         throw new Error(
//             `Expected one evidence row for ${userStoryId}; received ${result.rows.length}.`
//         );
//     }

//     return result.rows[0];
// }

// /* =========================================================================
//    8. COMPACT ORIGINAL STORY
//    ========================================================================= */

// function compactStoryForPrompt(originalStory) {
//     const result = {};

//     for (const column of STORY_COLUMNS) {
//         const value = originalStory[column];

//         if (value === null || value === undefined) {
//             result[column] = null;
//             continue;
//         }

//         if (
//             column === 'user_story_id' ||
//             column === 'estimation'
//         ) {
//             result[column] = value;
//             continue;
//         }

//         if (JSONB_COLUMNS.has(column)) {
//             result[column] = compactNestedJson(
//                 value,
//                 LIMITS.story_json_string
//             );
//             continue;
//         }

//         result[column] = compactText(
//             value,
//             LIMITS.story_string
//         );
//     }

//     return result;
// }

// /* =========================================================================
//    9. COMPACT FUNCTIONAL REQUIREMENTS
//    ========================================================================= */

// function compactFunctionalRequirements(items) {
//     return (items || []).map(item => ({
//         functional_requirement_id:
//             item.functional_requirement_id,

//         name: compactText(
//             item.name,
//             LIMITS.requirement_name
//         ),

//         description: compactText(
//             item.description,
//             LIMITS.requirement_description
//         ),

//         status: item.status
//     }));
// }

// /* =========================================================================
//    10. COMPACT BUSINESS REQUIREMENTS
//    ========================================================================= */

// function compactBusinessRequirements(items) {
//     return (items || []).map(item => ({
//         business_requirement_id:
//             item.business_requirement_id,

//         name: compactText(
//             item.name,
//             LIMITS.requirement_name
//         ),

//         business_requirement: compactText(
//             item.business_requirement,
//             LIMITS.requirement_description
//         ),

//         business_objective: compactText(
//             item.business_objective,
//             LIMITS.requirement_description
//         ),

//         success_measures: compactNestedJson(
//             item.success_measures,
//             LIMITS.requirement_description
//         ),

//         policies_and_constraints: compactNestedJson(
//             item.policies_and_constraints,
//             LIMITS.requirement_description
//         )
//     }));
// }

// /* =========================================================================
//    11. COMPACT BUSINESS RULES

//    Every retrieved rule is retained.
//    Business-rule identifiers are never removed.
//    ========================================================================= */

// function compactBusinessRules(items) {
//     return (items || []).map(item => ({
//         business_rule_id: item.business_rule_id,

//         name: compactText(
//             item.name,
//             LIMITS.business_rule_name
//         ),

//         statement: compactText(
//             item.statement,
//             LIMITS.business_rule_statement
//         ),

//         type: item.type,

//         condition: compactText(
//             item.condition,
//             LIMITS.business_rule_condition
//         ),

//         exceptions: compactNestedJson(
//             item.exceptions,
//             LIMITS.business_rule_exception
//         ),

//         actors: compactNestedJson(
//             item.actors,
//             LIMITS.business_rule_name
//         ),

//         objects: compactNestedJson(
//             item.objects,
//             LIMITS.business_rule_name
//         ),

//         enforcement: compactNestedJson(
//             item.enforcement,
//             LIMITS.business_rule_enforcement
//         ),

//         severity: item.severity
//     }));
// }

// /* =========================================================================
//    12. COMPACT KNOWLEDGE RECORDS
//    ========================================================================= */

// function compactKnowledgeRecords(items) {
//     return (items || []).map(item => ({
//         record_id: item.record_id,

//         record_type: item.record_type,

//         source_stage: item.source_stage,

//         source_file: compactText(
//             item.source_file,
//             LIMITS.source_metadata
//         ),

//         section: compactText(
//             item.section,
//             LIMITS.source_metadata
//         ),

//         semantic_category: item.semantic_category,

//         content: compactText(
//             item.content,
//             LIMITS.knowledge_content
//         )
//     }));
// }

// /* =========================================================================
//    13. BUILD ASSESSMENT INPUT
//    ========================================================================= */

// function buildAssessmentInput(row) {
//     const originalStory = Object.fromEntries(
//         STORY_COLUMNS.map(column => [
//             column,
//             getValue(row, column)
//         ])
//     );

//     return {
//         original_user_story:
//             compactStoryForPrompt(originalStory),

//         repository_evidence: {
//             functional_requirements:
//                 compactFunctionalRequirements(
//                     row.functional_requirements
//                 ),

//             business_requirements:
//                 compactBusinessRequirements(
//                     row.business_requirements
//                 ),

//             business_rules:
//                 compactBusinessRules(
//                     row.business_rules
//                 ),

//             knowledge_records:
//                 compactKnowledgeRecords(
//                     row.knowledge_records
//                 )
//         },

//         evidence_summary: row.evidence_summary
//     };
// }

// /* =========================================================================
//    14. QWEN EXECUTION

//    NO prompt budget validation.
//    NO artificial character limit.
//    NO estimated token rejection.

//    llama-cli receives the prompt directly and handles the real
//    model context constraints.
//    ========================================================================= */

// function runQwen(prompt, stageName, userStoryId) {
//     return new Promise((resolve, reject) => {
//         let child = null;
//         let timeout = null;
//         let settled = false;

//         let stdout = '';
//         let stderr = '';

//         const uniqueId =
//             `${process.pid}_${Date.now()}_${Math.random()
//                 .toString(36).slice(2, 10)}`;

//         const safeId = safeFileName(userStoryId);
//         const safeStage = safeFileName(stageName);

//         const promptFile = path.join(
//             TEMP_DIR,
//             `${safeId}_${safeStage}_${uniqueId}_prompt.txt`
//         );

//         const responseFile = path.join(
//             TEMP_DIR,
//             `${safeId}_${safeStage}_${uniqueId}_response.txt`
//         );

//         function cleanup() {
//             if (timeout) {
//                 clearTimeout(timeout);
//                 timeout = null;
//             }

//             for (const file of [promptFile, responseFile]) {
//                 try {
//                     if (fs.existsSync(file)) {
//                         fs.unlinkSync(file);
//                     }
//                 } catch (error) {
//                     console.warn(
//                         `[QWEN] Cleanup warning: ${error.message}`
//                     );
//                 }
//             }
//         }

//         function finish(error, result) {
//             if (settled) return;

//             settled = true;
//             cleanup();

//             if (error) {
//                 reject(error);
//             } else {
//                 resolve(result);
//             }
//         }

//         try {
//             if (
//                 typeof prompt !== 'string' ||
//                 !prompt.trim()
//             ) {
//                 throw new Error(
//                     `Empty prompt supplied for ${stageName}.`
//                 );
//             }

//             fs.mkdirSync(TEMP_DIR, {
//                 recursive: true
//             });

//             fs.writeFileSync(
//                 promptFile,
//                 prompt,
//                 'utf8'
//             );

//             console.log(`\n[QWEN] ${stageName}`);
//             console.log(
//                 '[QWEN] Prompt characters:',
//                 prompt.length.toLocaleString()
//             );
//             console.log(
//                 '[QWEN] Estimated tokens: not calculated'
//             );
//             console.log(
//                 '[QWEN] Launching llama-cli...'
//             );

//             const args = [
//                 '-hf', MODEL,
//                 '-ngl', String(MODEL_GPU_LAYERS),
//                 '--single-turn',
//                 '-c', String(CONTEXT_SIZE),
//                 '-b', String(MODEL_BATCH_SIZE),
//                 '-t', String(MODEL_THREADS),
//                 '--reasoning', 'off',
//                 '--log-disable',
//                 '-n', String(MAX_OUTPUT_TOKENS),
//                 '-f', promptFile,
//                 '-o', responseFile
//             ];

//             child = spawn(
//                 LLAMA_CLI,
//                 args,
//                 {
//                     cwd: ROOT,
//                     stdio: ['ignore', 'pipe', 'pipe']
//                 }
//             );

//             child.stdout.setEncoding('utf8');
//             child.stderr.setEncoding('utf8');

//             child.stdout.on('data', chunk => {
//                 stdout += chunk;
//             });

//             child.stderr.on('data', chunk => {
//                 stderr += chunk;
//             });

//             timeout = setTimeout(() => {
//                 if (settled) return;

//                 if (child && child.exitCode === null) {
//                     child.kill('SIGTERM');
//                 }

//                 finish(
//                     new Error(
//                         `Qwen timed out during ${stageName} after ${MODEL_TIMEOUT_MS} ms.`
//                     )
//                 );
//             }, MODEL_TIMEOUT_MS);

//             child.on('error', error => {
//                 finish(
//                     new Error(
//                         `Unable to start llama-cli: ${error.message}`
//                     )
//                 );
//             });

//             child.on('close', (code, signal) => {
//                 if (settled) return;

//                 let response = '';

//                 if (fs.existsSync(responseFile)) {
//                     response = fs.readFileSync(
//                         responseFile,
//                         'utf8'
//                     );
//                 }

//                 const combinedOutput = [
//                     stdout,
//                     stderr,
//                     response
//                 ].join('\n');

//                 const contextFailure =
//                     /exceeds the available context size/i
//                         .test(combinedOutput) ||
//                     /request\s*\(\s*\d+\s*tokens?\s*\)\s*exceeds/i
//                         .test(combinedOutput) ||
//                     /context.*(overflow|too small|exceeded)/i
//                         .test(combinedOutput);

//                 if (contextFailure) {
//                     finish(
//                         new Error([
//                             `llama-cli reported a context problem during ${stageName}.`,
//                             combinedOutput.slice(-5000)
//                         ].join('\n'))
//                     );

//                     return;
//                 }

//                 if (code !== 0) {
//                     finish(
//                         new Error([
//                             `llama-cli failed during ${stageName}.`,
//                             `Exit code: ${code}`,
//                             `Signal: ${signal || 'none'}`,
//                             '',
//                             'STDERR:',
//                             stderr.slice(-5000),
//                             '',
//                             'STDOUT:',
//                             stdout.slice(-3000)
//                         ].join('\n'))
//                     );

//                     return;
//                 }

//                 if (!response.trim()) {
//                     finish(
//                         new Error([
//                             `Qwen produced an empty response during ${stageName}.`,
//                             'Response file was empty.',
//                             '',
//                             'STDERR:',
//                             stderr.slice(-2000),
//                             '',
//                             'STDOUT:',
//                             stdout.slice(-2000)
//                         ].join('\n'))
//                     );

//                     return;
//                 }

//                 console.log(
//                     `[QWEN] ${stageName} output:`,
//                     response.length.toLocaleString(),
//                     'characters'
//                 );

//                 finish(null, {
//                     output: response,
//                     stdout,
//                     stderr
//                 });
//             });

//         } catch (error) {
//             finish(error);
//         }
//     });
// }

// /* =========================================================================
//    15. EXTRACT GENERATED JSON

//    The -o response file contains generated output.
//    It is not required to contain the original prompt.
//    ========================================================================= */

// function extractBalancedJsonObjects(text) {
//     const objects = [];

//     let start = -1;
//     let depth = 0;
//     let inString = false;
//     let escaped = false;

//     for (let i = 0; i < text.length; i++) {
//         const char = text[i];

//         if (start === -1) {
//             if (char === '{') {
//                 start = i;
//                 depth = 1;
//                 inString = false;
//                 escaped = false;
//             }

//             continue;
//         }

//         if (inString) {
//             if (escaped) {
//                 escaped = false;
//             } else if (char === '\\') {
//                 escaped = true;
//             } else if (char === '"') {
//                 inString = false;
//             }

//             continue;
//         }

//         if (char === '"') {
//             inString = true;
//         } else if (char === '{') {
//             depth++;
//         } else if (char === '}') {
//             depth--;

//             if (depth === 0) {
//                 const candidateText = text.slice(
//                     start,
//                     i + 1
//                 );

//                 try {
//                     const candidate = JSON.parse(
//                         candidateText
//                     );

//                     if (isPlainObject(candidate)) {
//                         objects.push(candidate);
//                     }
//                 } catch (_) {
//                     // Ignore malformed candidate.
//                 }

//                 start = -1;
//             }
//         }
//     }

//     return objects;
// }

// function extractJSON(result, type) {
//     if (
//         !result ||
//         typeof result.output !== 'string' ||
//         !result.output.trim()
//     ) {
//         throw new Error(
//             'Qwen returned empty output.'
//         );
//     }

//     const text = result.output
//         .replace(/<\|[^|]*\|>/g, '')
//         .replace(/```(?:json)?/gi, '')
//         .trim();

//     const candidates = extractBalancedJsonObjects(text);

//     if (!candidates.length) {
//         throw new Error([
//             `No generated JSON object found for ${type}.`,
//             'Response preview:',
//             text.slice(0, 3000)
//         ].join('\n'));
//     }

//     const matching = candidates.filter(value => {
//         if (type === 'assessment') {
//             return (
//                 Object.prototype.hasOwnProperty.call(
//                     value,
//                     'user_story_id'
//                 ) &&
//                 Object.prototype.hasOwnProperty.call(
//                     value,
//                     'assessment_result'
//                 ) &&
//                 Object.prototype.hasOwnProperty.call(
//                     value,
//                     'dimension_findings'
//                 )
//             );
//         }

//         if (type === 'correction') {
//             return STORY_COLUMNS.every(column =>
//                 Object.prototype.hasOwnProperty.call(
//                     value,
//                     column
//                 )
//             );
//         }

//         return false;
//     });

//     if (!matching.length) {
//         throw new Error([
//             `No valid ${type} JSON structure was found.`,
//             `JSON objects detected: ${candidates.length}`,
//             '',
//             'Response preview:',
//             text.slice(0, 3000)
//         ].join('\n'));
//     }

//     return matching[matching.length - 1];
// }

// /* =========================================================================
//    16. BUILD DIMENSION INSTRUCTIONS
//    ========================================================================= */

// function buildDimensionInstructions() {
//     return ASSESSMENT_DIMENSIONS.map(item => ({
//         dimension: item.dimension,
//         question: item.question,
//         data_to_supply: item.data_to_supply
//     }));
// }

// /* =========================================================================
//    17. ASSESSMENT PROMPT
//    ========================================================================= */

// function buildAssessmentPrompt(input, userStoryId) {
//     const dimensions = buildDimensionInstructions();

//     return `
// ROLE
// You are an expert Business Analyst assessing user-story quality.

// TASK
// Assess the supplied original user story against all 12 configured
// assessment dimensions using the supplied repository evidence.

// USER STORY ID
// ${JSON.stringify(String(userStoryId))}

// ASSESSMENT DIMENSIONS
// ${safeJsonStringify(dimensions)}

// ASSESSMENT RULES
// 1. Assess actual business behaviour, not wording alone.
// 2. Evaluate every configured dimension independently.
// 3. Use supplied repository evidence where relevant.
// 4. Consider every supplied business rule.
// 5. Do not invent business facts, policies, actors, rules or outcomes.
// 6. Do not assume missing information is established policy.
// 7. Distinguish explicit evidence from inference.
// 8. Identify missing, ambiguous, incomplete and contradictory behaviour.
// 9. A populated field does not automatically pass its dimension.
// 10. Evaluate clarity, consistency, completeness and testability.
// 11. Use NOT_APPLICABLE only when the dimension genuinely does not apply.
// 12. Reference only repository IDs present in the input.
// 13. State evidence limitations where evidence is insufficient.
// 14. user_goal assesses the intended user outcome.
// 15. direct_dependencies assesses the dependencies field.
// 16. Assess alternative and exception behaviour separately.
// 17. Assess business-rule consistency against supplied rules.

// INPUT
// ${safeJsonStringify(input)}

// OUTPUT CONTRACT
// Return exactly one valid JSON object.

// Required top-level fields:
// - user_story_id
// - assessment_result
// - overall_assessment
// - dimension_findings
// - correction_summary
// - evidence_references

// assessment_result:
// PASS or NEEDS_CORRECTION.

// dimension_findings:
// Exactly these 12 keys:
// ${REQUIRED_DIMENSIONS.join(', ')}

// Every dimension finding must contain:
// - status: PASS, PARTIAL, FAIL or NOT_APPLICABLE
// - finding: meaningful assessment
// - issues: array of specific issues
// - evidence_references: array of actual repository IDs
// - recommended_correction: actionable text or empty string

// evidence_references must contain:
// - functional_requirement_ids
// - business_requirement_ids
// - business_rule_ids
// - knowledge_record_ids

// All reference values must exist in the supplied repository evidence.
// Use empty arrays when no reference applies.

// QUALITY RULES
// - NEEDS_CORRECTION when one or more applicable dimensions have material issues.
// - PASS only when the story is sufficiently complete and testable.
// - Do not invent corrections for unsupported business behaviour.
// - Do not omit any dimension.
// - Do not add extra dimension keys.

// Return valid JSON only.
// No Markdown.
// No code fences.
// No commentary.
// No explanation outside the JSON.
// `.trim();
// }

// /* =========================================================================
//    18. VALIDATE ASSESSMENT
//    ========================================================================= */

// function validateAssessment(assessment, userStoryId) {
//     if (!isPlainObject(assessment)) {
//         throw new Error(
//             'Assessment must be a JSON object.'
//         );
//     }

//     const expectedId = String(userStoryId).trim();

//     const receivedId =
//         assessment.user_story_id == null
//             ? ''
//             : String(assessment.user_story_id).trim();

//     if (receivedId !== expectedId) {
//         throw new Error([
//             'Assessment user_story_id mismatch.',
//             `Expected: ${expectedId}`,
//             `Received: ${receivedId}`
//         ].join('\n'));
//     }

//     if (![
//         'PASS',
//         'NEEDS_CORRECTION'
//     ].includes(assessment.assessment_result)) {
//         throw new Error(
//             `Invalid assessment_result: ${assessment.assessment_result}`
//         );
//     }

//     if (
//         typeof assessment.overall_assessment !== 'string' ||
//         !assessment.overall_assessment.trim()
//     ) {
//         throw new Error(
//             'Missing overall_assessment.'
//         );
//     }

//     const findings = assessment.dimension_findings;

//     if (!isPlainObject(findings)) {
//         throw new Error(
//             'Missing dimension_findings.'
//         );
//     }

//     const findingKeys = Object.keys(findings);

//     if (
//         findingKeys.length !== REQUIRED_DIMENSIONS.length ||
//         REQUIRED_DIMENSIONS.some(key => !findingKeys.includes(key))
//     ) {
//         throw new Error(
//             'dimension_findings must contain exactly the 12 required dimensions.'
//         );
//     }

//     for (const dimension of REQUIRED_DIMENSIONS) {
//         const finding = findings[dimension];

//         if (!isPlainObject(finding)) {
//             throw new Error(
//                 `Invalid finding for ${dimension}.`
//             );
//         }

//         if (!VALID_FINDING_STATUSES.includes(finding.status)) {
//             throw new Error(
//                 `Invalid status for ${dimension}: ${finding.status}`
//             );
//         }

//         if (
//             typeof finding.finding !== 'string' ||
//             !finding.finding.trim()
//         ) {
//             throw new Error(
//                 `Missing finding description for ${dimension}.`
//             );
//         }

//         if (!Array.isArray(finding.issues)) {
//             throw new Error(
//                 `issues must be an array for ${dimension}.`
//             );
//         }

//         if (!Array.isArray(finding.evidence_references)) {
//             throw new Error(
//                 `evidence_references must be an array for ${dimension}.`
//             );
//         }

//         if (
//             typeof finding.recommended_correction !== 'string'
//         ) {
//             throw new Error(
//                 `recommended_correction must be a string for ${dimension}.`
//             );
//         }
//     }

//     if (!isPlainObject(assessment.evidence_references)) {
//         throw new Error(
//             'Missing assessment evidence_references.'
//         );
//     }

//     for (const key of ASSESSMENT_REFERENCE_KEYS) {
//         if (!Array.isArray(assessment.evidence_references[key])) {
//             throw new Error(
//                 `evidence_references.${key} must be an array.`
//             );
//         }
//     }

//     if (typeof assessment.correction_summary !== 'string') {
//         throw new Error(
//             'correction_summary must be a string.'
//         );
//     }

//     return true;
// }

// /* =========================================================================
//    19. ASSESS STORY
//    ========================================================================= */

// async function assessUserStory(input, userStoryId) {
//     const prompt = buildAssessmentPrompt(
//         input,
//         userStoryId
//     );

//     const result = await runQwen(
//         prompt,
//         '12-DIMENSION-ASSESSMENT',
//         userStoryId
//     );

//     const assessment = extractJSON(
//         result,
//         'assessment'
//     );

//     validateAssessment(
//         assessment,
//         userStoryId
//     );

//     return assessment;
// }

// /* =========================================================================
//    20. BUILD COMPACT CORRECTION INPUT
//    ========================================================================= */

// function compactAssessmentForCorrection(assessment) {
//     const findings = {};

//     for (const dimension of REQUIRED_DIMENSIONS) {
//         const item = assessment.dimension_findings[dimension];

//         findings[dimension] = {
//             status: item.status,

//             finding: compactText(
//                 item.finding,
//                 LIMITS.assessment_text
//             ),

//             issues: (item.issues || []).map(issue =>
//                 compactNestedJson(
//                     issue,
//                     LIMITS.assessment_text
//                 )
//             ),

//             evidence_references: item.evidence_references,

//             recommended_correction: compactText(
//                 item.recommended_correction,
//                 LIMITS.assessment_text
//             )
//         };
//     }

//     return {
//         assessment_result: assessment.assessment_result,

//         overall_assessment: compactText(
//             assessment.overall_assessment,
//             1000
//         ),

//         dimension_findings: findings,

//         correction_summary: compactText(
//             assessment.correction_summary,
//             1000
//         ),

//         evidence_references: assessment.evidence_references
//     };
// }

// function buildCorrectionInput(input, assessment) {
//     return {
//         original_user_story: input.original_user_story,

//         repository_evidence: input.repository_evidence,

//         evidence_summary: input.evidence_summary,

//         assessment: compactAssessmentForCorrection(assessment)
//     };
// }

// /* =========================================================================
//    21. CORRECTION PROMPT
//    ========================================================================= */

// function buildCorrectionPrompt(
//     input,
//     assessment,
//     userStoryId
// ) {
//     const correctionInput = buildCorrectionInput(
//         input,
//         assessment
//     );

//     return `
// ROLE
// You are an expert Business Analyst responsible for correcting user stories.

// TASK
// Produce one corrected user story using:
// 1. The original user story.
// 2. Repository evidence.
// 3. Assessment findings across all 12 dimensions.

// USER STORY ID
// ${JSON.stringify(String(userStoryId))}

// CORRECTION RULES
// 1. Preserve user_story_id exactly.
// 2. Preserve the original business intent.
// 3. Preserve valid original content.
// 4. Correct material issues identified by the assessment.
// 5. Use repository evidence where relevant.
// 6. Consider all supplied business rules.
// 7. Do not invent unsupported rules, policies, actors, permissions,
//    data, dependencies or business outcomes.
// 8. Do not manufacture facts where evidence is insufficient.
// 9. Keep related story fields consistent.
// 10. Maintain logical ordering in the main flow.
// 11. Distinguish main, alternative and exception behaviour.
// 12. Make acceptance criteria observable and testable.
// 13. Keep Given-When-Then scenarios consistent with acceptance criteria.
// 14. Preserve valid requirement, feature, epic and source identifiers.
// 15. Preserve unrelated fields.
// 16. Keep genuinely unavailable information null.
// 17. Do not add assessment metadata to the story.
// 18. Do not change fields merely to make them sound different.
// 19. Do not remove valid original business information.
// 20. Correct only what is supported by the assessment and evidence.

// INPUT
// ${safeJsonStringify(correctionInput)}

// OUTPUT CONTRACT
// Return exactly one JSON object containing all 31 fields:

// ${STORY_COLUMNS.join(', ')}

// DATA TYPES
// - JSONB columns must contain valid JSON values or null.
// - Text columns must contain strings or null.
// - estimation must be a finite number or null.
// - user_story_id must equal ${JSON.stringify(String(userStoryId))}.

// JSONB COLUMNS
// ${[...JSONB_COLUMNS].join(', ')}

// TEXT COLUMNS
// ${STORY_COLUMNS.filter(column =>
//         !JSONB_COLUMNS.has(column) &&
//         column !== 'estimation'
//     ).join(', ')}

// Do not omit fields.
// Do not add fields.
// Do not return assessment metadata.
// Do not return Markdown.
// Do not return code fences.
// Do not return commentary.

// Return valid JSON only.
// `.trim();
// }

// /* =========================================================================
//    22. VALIDATE CORRECTED STORY
//    ========================================================================= */

// function validateCorrectedStory(corrected, original) {
//     if (!isPlainObject(corrected)) {
//         throw new Error(
//             'Corrected story must be a JSON object.'
//         );
//     }

//     const receivedKeys = Object.keys(corrected);

//     for (const column of STORY_COLUMNS) {
//         if (!Object.prototype.hasOwnProperty.call(corrected, column)) {
//             throw new Error(
//                 `Corrected story is missing ${column}.`
//             );
//         }
//     }

//     const unexpectedKeys = receivedKeys.filter(
//         key => !STORY_COLUMNS.includes(key)
//     );

//     if (unexpectedKeys.length) {
//         throw new Error(
//             `Unexpected corrected story fields: ${unexpectedKeys.join(', ')}`
//         );
//     }

//     if (
//         String(corrected.user_story_id) !==
//         String(original.user_story_id)
//     ) {
//         throw new Error(
//             'Corrected story ID does not match original.'
//         );
//     }

//     if (
//         corrected.estimation !== null &&
//         (
//             typeof corrected.estimation !== 'number' ||
//             !Number.isFinite(corrected.estimation)
//         )
//     ) {
//         throw new Error(
//             'estimation must be a finite number or null.'
//         );
//     }

//     for (const column of STORY_COLUMNS) {
//         if (column === 'estimation') continue;

//         const value = corrected[column];

//         if (JSONB_COLUMNS.has(column)) {
//             if (value === undefined) {
//                 throw new Error(
//                     `${column} cannot be undefined.`
//                 );
//             }

//             try {
//                 const serialized = JSON.stringify(value);

//                 if (serialized === undefined) {
//                     throw new Error(
//                         'Value cannot be serialized as JSON.'
//                     );
//                 }
//             } catch (error) {
//                 throw new Error(
//                     `${column} is not JSON serializable: ${error.message}`
//                 );
//             }
//         } else if (
//             value !== null &&
//             typeof value !== 'string'
//         ) {
//             throw new Error(
//                 `${column} must be a string or null.`
//             );
//         }
//     }

//     return true;
// }

// /* =========================================================================
//    23. CORRECT STORY
//    ========================================================================= */

// async function correctUserStory(
//     input,
//     assessment,
//     original,
//     userStoryId
// ) {
//     const prompt = buildCorrectionPrompt(
//         input,
//         assessment,
//         userStoryId
//     );

//     const result = await runQwen(
//         prompt,
//         'USER-STORY-CORRECTION',
//         userStoryId
//     );

//     const corrected = extractJSON(
//         result,
//         'correction'
//     );

//     validateCorrectedStory(
//         corrected,
//         original
//     );

//     return corrected;
// }

// /* =========================================================================
//    24. BUILD COMPLETE EVIDENCE REFERENCES
//    ========================================================================= */

// function buildEvidenceReferences(row) {
//     const uniqueIds = (items, key) => uniqueStrings(
//         (items || []).map(item => item[key])
//     );

//     return {
//         functional_requirement_ids: uniqueIds(
//             row.functional_requirements,
//             'functional_requirement_id'
//         ),

//         business_requirement_ids: uniqueIds(
//             row.business_requirements,
//             'business_requirement_id'
//         ),

//         business_rule_ids: uniqueIds(
//             row.business_rules,
//             'business_rule_id'
//         ),

//         knowledge_record_ids: uniqueIds(
//             row.knowledge_records,
//             'record_id'
//         )
//     };
// }

// /* =========================================================================
//    25. VALIDATE ASSESSMENT REFERENCES
//    ========================================================================= */

// function validateAssessmentEvidenceReferences(
//     assessment,
//     evidenceRow
// ) {
//     const available = buildEvidenceReferences(
//         evidenceRow
//     );

//     for (const key of ASSESSMENT_REFERENCE_KEYS) {
//         const validIds = new Set(
//             available[key].map(String)
//         );

//         for (const id of assessment.evidence_references[key]) {
//             if (!validIds.has(String(id))) {
//                 throw new Error(
//                     `Unknown ${key} reference: ${id}`
//                 );
//             }
//         }
//     }

//     const allAvailableIds = new Set(
//         Object.values(available)
//             .flat()
//             .map(String)
//     );

//     for (const dimension of REQUIRED_DIMENSIONS) {
//         const finding =
//             assessment.dimension_findings[dimension];

//         for (const reference of finding.evidence_references) {
//             const value = isPlainObject(reference)
//                 ? (
//                     reference.id ??
//                     reference.reference_id ??
//                     reference.business_rule_id ??
//                     reference.functional_requirement_id ??
//                     reference.business_requirement_id ??
//                     reference.record_id
//                 )
//                 : reference;

//             if (
//                 value !== undefined &&
//                 value !== null &&
//                 !allAvailableIds.has(String(value))
//             ) {
//                 throw new Error(
//                     `Unknown evidence reference in ${dimension}: ${JSON.stringify(reference)}`
//                 );
//             }
//         }
//     }

//     return true;
// }

// /* =========================================================================
//    26. SAVE VERSION TRANSACTIONALLY

//    - Original story is never updated.
//    - First version number is 1.
//    - Advisory lock serializes writes for the same story.
//    ========================================================================= */

// async function saveCorrectedVersion(
//     corrected,
//     assessment,
//     evidenceRow
// ) {
//     const client = await pool.connect();

//     try {
//         await client.query('BEGIN');

//         await client.query(
//             'SELECT pg_advisory_xact_lock(hashtext($1));',
//             [String(corrected.user_story_id)]
//         );

//         const versionResult = await client.query(
//             `
//             SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
//             FROM requirements.user_story_versions
//             WHERE user_story_id = $1;
//             `,
//             [corrected.user_story_id]
//         );

//         const versionNumber = Number(
//             versionResult.rows[0].next_version
//         );

//         const columns = [
//             'user_story_id',
//             'version_number',
//             'version_type',

//             ...STORY_COLUMNS.filter(
//                 column => column !== 'user_story_id'
//             ),

//             'assessment_result',
//             'dimension_findings',
//             'correction_summary',
//             'evidence_references',
//             'model_name'
//         ];

//         const values = [
//             corrected.user_story_id,
//             versionNumber,
//             assessment.assessment_result === 'PASS'
//                 ? 'AI_ASSESSED'
//                 : 'AI_CORRECTED'
//         ];

//         for (const column of STORY_COLUMNS) {
//             if (column === 'user_story_id') continue;

//             const value =
//                 corrected[column] === undefined
//                     ? null
//                     : corrected[column];

//             values.push(
//                 JSONB_COLUMNS.has(column) && value !== null
//                     ? JSON.stringify(value)
//                     : value
//             );
//         }

//         values.push(
//             assessment.assessment_result,

//             JSON.stringify(
//                 assessment.dimension_findings
//             ),

//             assessment.correction_summary,

//             JSON.stringify(
//                 buildEvidenceReferences(evidenceRow)
//             ),

//             MODEL
//         );

//         const placeholders = values.map(
//             (_, index) => `$${index + 1}`
//         );

//         const sql = `
//             INSERT INTO requirements.user_story_versions
//             (
//                 ${columns.join(', ')}
//             )
//             VALUES
//             (
//                 ${placeholders.join(', ')}
//             )
//             RETURNING
//                 version_id,
//                 user_story_id,
//                 version_number,
//                 version_type;
//         `;

//         const result = await client.query(
//             sql,
//             values
//         );

//         await client.query('COMMIT');

//         return result.rows[0];

//     } catch (error) {
//         try {
//             await client.query('ROLLBACK');
//         } catch (rollbackError) {
//             console.error(
//                 '[DATABASE] Rollback error:',
//                 rollbackError.message
//             );
//         }

//         throw error;

//     } finally {
//         client.release();
//     }
// }

// /* =========================================================================
//    27. WRITE LOCAL OUTPUT
//    ========================================================================= */

// function writeOutput(
//     userStoryId,
//     assessment,
//     corrected,
//     savedVersion
// ) {
//     fs.mkdirSync(UNIT_DIR, {
//         recursive: true
//     });

//     const safeId = safeFileName(userStoryId);

//     const output = {
//         user_story_id: userStoryId,

//         version: savedVersion,

//         model_name: MODEL,

//         assessment,

//         corrected_user_story: corrected,

//         processed_at: new Date().toISOString()
//     };

//     const outputPath = path.join(
//         UNIT_DIR,
//         `${safeId}_version_${savedVersion.version_number}.json`
//     );

//     fs.writeFileSync(
//         outputPath,
//         JSON.stringify(output, null, 2),
//         'utf8'
//     );

//     return outputPath;
// }

// /* =========================================================================
//    28. PROCESS ONE USER STORY
//    ========================================================================= */

// async function processOneUserStory(userStoryId) {
//     logSection(
//         `PROCESSING USER STORY: ${userStoryId}`
//     );

//     console.log(
//         '\n[STEP 1] Retrieving original story and evidence...'
//     );

//     const evidenceRow = await retrieveStoryEvidence(
//         userStoryId
//     );
// // fs.writeFileSync(
// //     'output.json',
// //     JSON.stringify(evidenceRow, null, 2),
// //     'utf8'
// // );
//     console.log(
//         '[EVIDENCE]',
//         evidenceRow.evidence_summary
//     );

//     const originalStory = Object.fromEntries(
//         STORY_COLUMNS.map(column => [
//             column,
//             getValue(evidenceRow, column)
//         ])
//     );

//     console.log(
//         '\n[STEP 2] Building compact assessment input...'
//     );

//     const input = buildAssessmentInput(
//         evidenceRow
//     );
  

//     const inputText = safeJsonStringify(input);

//     const originalRuleCount = getArray(
//         evidenceRow.business_rules
//     ).length;

//     const compactRuleCount =
//         input.repository_evidence.business_rules.length;

//     console.log(
//         '[INPUT] Total characters:',
//         inputText.length.toLocaleString()
//     );

//     console.log(
//         '[INPUT] Business rules retained:',
//         compactRuleCount
//     );

//     console.log(
//         '[INPUT] Functional requirements:',
//         input.repository_evidence.functional_requirements.length
//     );

//     console.log(
//         '[INPUT] Business requirements:',
//         input.repository_evidence.business_requirements.length
//     );

//     console.log(
//         '[INPUT] Knowledge records:',
//         input.repository_evidence.knowledge_records.length
//     );

//     console.log(
//         '[INPUT] Dimension definitions in evidence:',
//         0
//     );

//     console.log(
//         '[INPUT] Dimension definitions in assessment prompt:',
//         ASSESSMENT_DIMENSIONS.length
//     );

//     if (compactRuleCount !== originalRuleCount) {
//         throw new Error(
//             `Business-rule count changed during compaction. Original: ${originalRuleCount}; compacted: ${compactRuleCount}.`
//         );
//     }

//     console.log('\n[INPUT BREAKDOWN]');

//     for (const [name, value] of Object.entries(input)) {
//         console.log(
//             `[INPUT] ${name}: ${JSON.stringify(value).length.toLocaleString()} characters`
//         );
//     }

//     console.log(
//         '\n[STEP 3] Assessing all 12 dimensions...'
//     );

//     const assessment = await assessUserStory(
//         input,
//         userStoryId
//     );

//     validateAssessmentEvidenceReferences(
//         assessment,
//         evidenceRow
//     );

//     console.log(
//         '[ASSESSMENT]',
//         assessment.assessment_result
//     );

//     console.log(
//         '[ASSESSMENT] All 12 dimensions validated.'
//     );

//     let corrected;

//     if (
//         assessment.assessment_result === 'NEEDS_CORRECTION'
//     ) {
//         console.log(
//             '\n[STEP 4] Correcting user story...'
//         );

//         corrected = await correctUserStory(
//             input,
//             assessment,
//             originalStory,
//             userStoryId
//         );

//         console.log(
//             '[CORRECTION] All 31 story fields validated.'
//         );

//     } else {
//         console.log(
//             '\n[STEP 4] Assessment passed. No correction required.'
//         );

//         corrected = originalStory;

//         validateCorrectedStory(
//             corrected,
//             originalStory
//         );
//     }

//     console.log(
//         '\n[STEP 5] Saving story version...'
//     );

//     const savedVersion = await saveCorrectedVersion(
//         corrected,
//         assessment,
//         evidenceRow
//     );

//     console.log(
//         '[DATABASE] Version saved:',
//         savedVersion.version_number
//     );

//     console.log(
//         '[DATABASE] Version type:',
//         savedVersion.version_type
//     );

//     const outputPath = writeOutput(
//         userStoryId,
//         assessment,
//         corrected,
//         savedVersion
//     );

//     console.log(
//         '[OUTPUT]',
//         outputPath
//     );

//     console.log(
//         `\n[COMPLETED] ${userStoryId}, version ${savedVersion.version_number}`
//     );

//     return savedVersion;
// }

// /* =========================================================================
//    29. MAIN
//    ========================================================================= */

// async function main() {
//     let processedCount = 0;

//     logSection(
//         'USER STORY ASSESSMENT STARTED'
//     );

//     console.log('[MODEL]', MODEL);
//     console.log('[LLAMA CLI]', LLAMA_CLI);
//     console.log('[DATABASE]', 'demodb');
//     console.log('[DIMENSIONS]', ASSESSMENT_DIMENSIONS.length);
//     console.log('[CONTEXT]', CONTEXT_SIZE);
//     console.log('[MAX OUTPUT TOKENS]', MAX_OUTPUT_TOKENS);
//     console.log('[THREADS]', MODEL_THREADS);
//     console.log('[BATCH SIZE]', MODEL_BATCH_SIZE);
//     console.log('[GPU LAYERS]', MODEL_GPU_LAYERS);

//     if (
//         CONTEXT_SIZE <= 0 ||
//         MAX_OUTPUT_TOKENS <= 0 ||
//         MODEL_THREADS <= 0 ||
//         MODEL_BATCH_SIZE <= 0
//     ) {
//         throw new Error(
//             'Invalid model configuration.'
//         );
//     }

//     ensureDirectories();

//     pool = createPool();

//     try {
//         await pool.query('SELECT 1');

//         console.log(
//             '\n[DATABASE] Connection successful.'
//         );

//         while (true) {
//             const userStoryId = await selectNextUserStory();

//             if (!userStoryId) {
//                 console.log(
//                     '\n[COMPLETE] No more eligible user stories.'
//                 );

//                 break;
//             }

//             await processOneUserStory(
//                 userStoryId
//             );

//             processedCount++;

//             console.log(
//                 `\n[PROGRESS] Processed ${processedCount} user story/stories.`
//             );
//         }

//         logSection(
//             'USER STORY ASSESSMENT FINISHED'
//         );

//         console.log(
//             '[TOTAL PROCESSED]',
//             processedCount
//         );

//     } catch (error) {
//         console.error(
//             '\n[PROCESSING ERROR]'
//         );

//         console.error(
//             error.stack || error
//         );

//         process.exitCode = 1;

//     } finally {
//         if (pool) {
//             await pool.end();
//             pool = null;

//             console.log(
//                 '\n[DATABASE] Connection pool closed.'
//             );
//         }
//     }
// }

// /* =========================================================================
//    30. START
//    ========================================================================= */

// main().catch(async error => {
//     console.error(
//         '\n[FATAL ERROR]'
//     );

//     console.error(
//         error.stack || error
//     );

//     if (pool) {
//         try {
//             await pool.end();
//         } catch (closeError) {
//             console.error(
//                 '[DATABASE] Pool shutdown error:',
//                 closeError.message
//             );
//         }

//         pool = null;
//     }

//     process.exitCode = 1;
// });
'use strict';

/* =========================================================================
   USER STORY — 12 DIMENSION CONTENT GENERATOR
   DOMAIN-AGNOSTIC END-TO-END IMPLEMENTATION

   SOURCE:
     requirements.user_stories
     requirements.functional_requirements
     requirements.business_requirements

   DESTINATION:
     requirements.user_story_versions

   PROCESS:
     1. Retrieve original User Story.
     2. Retrieve directly associated Functional Requirements.
     3. Retrieve directly associated Business Requirements.
     4. Supply the complete available evidence to Qwen.
     5. Generate actual content for all 12 dimensions.
     6. Validate all 12 generated dimensions.
     7. Map generated dimensions to the original story fields.
     8. Preserve all other original story fields.
     9. Validate all 31 User Story fields.
    10. Save a new version transactionally.

   IMPORTANT:
     - No PASS / FAIL / PARTIAL assessment.
     - No missing-field assessment.
     - No assessment-result decision.
     - No consolidated_evidence wrapper.
     - No FR-to-BR inheritance.
     - No fabricated repository records.
     - Original requirements.user_stories is NEVER updated.
     - No artificial prompt-character limit.
     - No estimated-token budget rejection.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');

/* =========================================================================
   1. CONFIGURATION
   ========================================================================= */

const ROOT = process.cwd();

const MODEL =
    process.env.MODEL_NAME ||
    'unsloth/Qwen3.5-9B-GGUF';

const LLAMA_CLI =
    process.env.LLAMA_CLI_PATH ||
    'llama-cli';

const OUTPUT_DIR = path.join(
    ROOT,
    'app/utils/appflowgeneratorAI/aiOutput'
);

const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
const TEMP_DIR = path.join(OUTPUT_DIR, 'temp');

const DB_CONFIG_PATH = path.join(
    ROOT,
    'app/config/config.json'
);

const DIMENSIONS_CONFIG_PATH = path.join(
    ROOT,
    'app/utils/appflowgeneratorAI/Commands/sql/config/UserStoriesAssessmentDimensions.json'
);

const CONTEXT_SIZE = Number(
    process.env.CONTEXT_SIZE || 31723
);

const MAX_OUTPUT_TOKENS = Number(
    process.env.MAX_OUTPUT_TOKENS || 4096
);

const MODEL_THREADS = Number(
    process.env.MODEL_THREADS || 8
);

const MODEL_GPU_LAYERS = Number(
    process.env.MODEL_GPU_LAYERS || 0
);

const MODEL_BATCH_SIZE = Number(
    process.env.MODEL_BATCH_SIZE || 256
);

const MODEL_TIMEOUT_MS = Number(
    process.env.MODEL_TIMEOUT_MS || 1800000
);

/*
 * These limits compact individual text values supplied to Qwen.
 * They do not limit the number of FRs, BRs, or array elements.
 */
const LIMITS = {
    story_string: 1200,
    story_json_string: 1200,

    requirement_name: 500,
    requirement_description: 2500,

    dimension_question: 1000,
    dimension_data: 500
};

const REQUIRED_DIMENSIONS = [
    'user_goal',
    'preconditions',
    'postconditions',
    'trigger',
    'main_flow',
    'alternative_flows',
    'exception_flows',
    'acceptance_criteria',
    'given_when_then',
    'business_rules',
    'success_criteria',
    'direct_dependencies'
];

const STORY_COLUMNS = [
    'user_story_id',
    'user_story_title',
    'user_story_description',
    'user_story_type',
    'actor',
    'user_goal',
    'business_value',
    'feature_id',
    'feature_name',
    'epic_id',
    'epic_title',
    'business_requirement_ids',
    'functional_requirement_ids',
    'business_objects',
    'preconditions',
    'postconditions',
    'trigger',
    'main_flow',
    'alternative_flows',
    'exception_flows',
    'business_rules',
    'acceptance_criteria',
    'given_when_then',
    'success_criteria',
    'non_functional_requirements',
    'dependencies',
    'constraints',
    'priority',
    'estimation',
    'source_references',
    'status'
];

const JSONB_COLUMNS = new Set([
    'actor',
    'business_value',
    'business_requirement_ids',
    'functional_requirement_ids',
    'business_objects',
    'preconditions',
    'postconditions',
    'main_flow',
    'alternative_flows',
    'exception_flows',
    'business_rules',
    'acceptance_criteria',
    'given_when_then',
    'success_criteria',
    'non_functional_requirements',
    'dependencies',
    'constraints',
    'source_references'
]);

/*
 * Generated dimension -> actual database story column.
 */
const DIMENSION_FIELD_MAPPING = {
    user_goal: 'user_goal',
    preconditions: 'preconditions',
    postconditions: 'postconditions',
    trigger: 'trigger',
    main_flow: 'main_flow',
    alternative_flows: 'alternative_flows',
    exception_flows: 'exception_flows',
    acceptance_criteria: 'acceptance_criteria',
    given_when_then: 'given_when_then',
    business_rules: 'business_rules',
    success_criteria: 'success_criteria',
    direct_dependencies: 'dependencies'
};

const ARRAY_DIMENSIONS = new Set([
    'preconditions',
    'postconditions',
    'main_flow',
    'alternative_flows',
    'exception_flows',
    'acceptance_criteria',
    'given_when_then',
    'business_rules',
    'success_criteria',
    'direct_dependencies'
]);

let pool;

/* =========================================================================
   2. GENERAL HELPERS
   ========================================================================= */

function ensureDirectories() {
    fs.mkdirSync(UNIT_DIR, { recursive: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function safeFileName(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    );
}

function compactText(value, maxLength) {
    if (value === null || value === undefined) {
        return null;
    }

    let text;

    if (typeof value === 'string') {
        text = value;
    } else {
        text = JSON.stringify(value);
    }

    text = text
        .replace(/\u0000/g, '')
        .trim();

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength)} [TRUNCATED]`;
}

function compactNestedJson(value, maxTextLength) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'string') {
        return compactText(value, maxTextLength);
    }

    if (
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item =>
            compactNestedJson(item, maxTextLength)
        );
    }

    if (isPlainObject(value)) {
        const result = {};

        for (const [key, item] of Object.entries(value)) {
            result[key] = compactNestedJson(
                item,
                maxTextLength
            );
        }

        return result;
    }

    return compactText(value, maxTextLength);
}

function parseJsonValue(value, fallback = null) {
    if (value === null || value === undefined) {
        return fallback;
    }

    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function getArray(value) {
    const parsed = parseJsonValue(value, []);
    return Array.isArray(parsed) ? parsed : [];
}

function getValue(row, key) {
    return row[key] === undefined ? null : row[key];
}

function safeJsonStringify(value) {
    return JSON.stringify(value);
}

function logSection(message) {
    console.log('\n================================================');
    console.log(message);
    console.log('================================================');
}

/* =========================================================================
   3. DATABASE
   ========================================================================= */

function createPool() {
    if (!fs.existsSync(DB_CONFIG_PATH)) {
        throw new Error(
            `Database configuration not found: ${DB_CONFIG_PATH}`
        );
    }

    const config = JSON.parse(
        fs.readFileSync(DB_CONFIG_PATH, 'utf8')
    ).development;

    if (!config) {
        throw new Error(
            'Development database configuration is missing.'
        );
    }

    return new Pool({
        user: config.username,
        password: config.password,
        database: config.database,
        host: config.host,
        port: Number(config.port),
        max: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    });
}

/* =========================================================================
   4. LOAD 12 DIMENSION DEFINITIONS
   ========================================================================= */

function loadDimensions() {
    if (!fs.existsSync(DIMENSIONS_CONFIG_PATH)) {
        throw new Error(
            `Dimensions configuration not found: ${DIMENSIONS_CONFIG_PATH}`
        );
    }

    const config = JSON.parse(
        fs.readFileSync(DIMENSIONS_CONFIG_PATH, 'utf8')
    );

    if (
        !Array.isArray(config.dimensions) ||
        config.dimensions.length !== 12
    ) {
        throw new Error(
            'Dimension configuration must contain exactly 12 dimensions.'
        );
    }

    const names = config.dimensions.map(
        item => item.dimension
    );

    if (new Set(names).size !== 12) {
        throw new Error(
            'Duplicate dimension identifiers found.'
        );
    }

    for (const name of REQUIRED_DIMENSIONS) {
        if (!names.includes(name)) {
            throw new Error(
                `Missing configured dimension: ${name}`
            );
        }
    }

    return config.dimensions.map(item => ({
        dimension: item.dimension,

        question: compactText(
            item.question,
            LIMITS.dimension_question
        ),

        data_to_supply: item.data_to_supply.map(value =>
            compactText(
                value,
                LIMITS.dimension_data
            )
        )
    }));
}

const DIMENSIONS = loadDimensions();

/* =========================================================================
   5. SELECT NEXT ORIGINAL STORY
   ========================================================================= */

async function selectNextUserStory() {
    const result = await pool.query(`
        SELECT us.user_story_id
        FROM requirements.user_stories us
        WHERE NOT EXISTS (
            SELECT 1
            FROM requirements.user_story_versions v
            WHERE v.user_story_id = us.user_story_id
        )
        ORDER BY us.user_story_id
        LIMIT 1;
    `);

    return result.rows[0]?.user_story_id || null;
}

/* =========================================================================
   6. SQL EVIDENCE RETRIEVAL

   FR:
     Directly associated through user_story.functional_requirement_ids.

   BR:
     Directly associated through user_story.business_requirement_ids.

   No FR-to-BR inheritance.

   This query does not claim to retrieve separate Business Rule
   Repository records or Knowledge Base records.
   ========================================================================= */

const EVIDENCE_SQL = String.raw`

WITH

assessment_source AS MATERIALIZED
(
    SELECT
        us.*
    FROM requirements.user_stories us
    WHERE us.user_story_id = $1
),

normalized_source AS MATERIALIZED
(
    SELECT
        s.*,

        CASE
            WHEN jsonb_typeof(
                to_jsonb(s) -> 'functional_requirement_ids'
            ) = 'array'
                THEN to_jsonb(s) -> 'functional_requirement_ids'

            WHEN jsonb_typeof(
                to_jsonb(s) -> 'functional_requirement_ids'
            ) = 'string'
             AND BTRIM(
                to_jsonb(s) ->> 'functional_requirement_ids'
             ) LIKE '[%'
                THEN (
                    to_jsonb(s) ->> 'functional_requirement_ids'
                )::jsonb

            ELSE '[]'::jsonb
        END AS fr_ids_json,

        CASE
            WHEN jsonb_typeof(
                to_jsonb(s) -> 'business_requirement_ids'
            ) = 'array'
                THEN to_jsonb(s) -> 'business_requirement_ids'

            WHEN jsonb_typeof(
                to_jsonb(s) -> 'business_requirement_ids'
            ) = 'string'
             AND BTRIM(
                to_jsonb(s) ->> 'business_requirement_ids'
             ) LIKE '[%'
                THEN (
                    to_jsonb(s) ->> 'business_requirement_ids'
                )::jsonb

            ELSE '[]'::jsonb
        END AS br_ids_json

    FROM assessment_source s
),

story_context AS MATERIALIZED
(
    SELECT
        s.*,

        ARRAY(
            SELECT DISTINCT BTRIM(value)
            FROM jsonb_array_elements_text(s.fr_ids_json)
            WHERE NULLIF(BTRIM(value), '') IS NOT NULL
        ) AS fr_ids,

        ARRAY(
            SELECT DISTINCT BTRIM(value)
            FROM jsonb_array_elements_text(s.br_ids_json)
            WHERE NULLIF(BTRIM(value), '') IS NOT NULL
        ) AS br_ids

    FROM normalized_source s
),

functional_requirements AS MATERIALIZED
(
    SELECT DISTINCT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name,
        fr.description,
        fr.status,

        'DIRECT_STORY_ASSOCIATION'::text AS retrieval_source

    FROM story_context s

    JOIN requirements.functional_requirements fr
      ON fr.functional_requirement_id = ANY(s.fr_ids)
),

business_requirements AS MATERIALIZED
(
    SELECT DISTINCT
        br.business_requirement_pk,
        br.business_requirement_id,
        br.name,
        br.business_requirement,
        br.business_objective,
        br.success_measures,
        br.policies_and_constraints,

        'DIRECT_STORY_ASSOCIATION'::text AS retrieval_source

    FROM story_context s

    JOIN requirements.business_requirements br
      ON br.business_requirement_id = ANY(s.br_ids)
),

functional_requirement_evidence AS MATERIALIZED
(
    SELECT
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'functional_requirement_pk',
                        fr.functional_requirement_pk,

                    'functional_requirement_id',
                        fr.functional_requirement_id,

                    'name',
                        fr.name,

                    'description',
                        fr.description,

                    'status',
                        fr.status,

                    'retrieval_source',
                        fr.retrieval_source
                )
                ORDER BY fr.functional_requirement_id
            ),
            '[]'::jsonb
        ) AS functional_requirements

    FROM functional_requirements fr
),

business_requirement_evidence AS MATERIALIZED
(
    SELECT
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'business_requirement_pk',
                        br.business_requirement_pk,

                    'business_requirement_id',
                        br.business_requirement_id,

                    'name',
                        br.name,

                    'business_requirement',
                        br.business_requirement,

                    'business_objective',
                        br.business_objective,

                    'success_measures',
                        br.success_measures,

                    'policies_and_constraints',
                        br.policies_and_constraints,

                    'retrieval_source',
                        br.retrieval_source
                )
                ORDER BY br.business_requirement_id
            ),
            '[]'::jsonb
        ) AS business_requirements

    FROM business_requirements br
),

evidence_summary AS MATERIALIZED
(
    SELECT
        jsonb_build_object(
            'functional_requirement_count',
                jsonb_array_length(
                    fr.functional_requirements
                ),

            'business_requirement_count',
                jsonb_array_length(
                    br.business_requirements
                ),

            'retrieval_status',
                CASE
                    WHEN
                        jsonb_array_length(
                            fr.functional_requirements
                        ) > 0

                        OR

                        jsonb_array_length(
                            br.business_requirements
                        ) > 0

                    THEN 'REPOSITORY_EVIDENCE_AVAILABLE'

                    ELSE 'NO_REPOSITORY_EVIDENCE_FOUND'
                END
        ) AS summary

    FROM functional_requirement_evidence fr
    CROSS JOIN business_requirement_evidence br
)

SELECT

    s.user_story_id,
    s.user_story_title,
    s.user_story_description,
    s.user_story_type,
    s.actor,
    s.user_goal,
    s.business_value,
    s.feature_id,
    s.feature_name,
    s.epic_id,
    s.epic_title,
    s.business_requirement_ids,
    s.functional_requirement_ids,
    s.business_objects,
    s.preconditions,
    s.postconditions,
    s.trigger,
    s.main_flow,
    s.alternative_flows,
    s.exception_flows,
    s.business_rules,
    s.acceptance_criteria,
    s.given_when_then,
    s.success_criteria,
    s.non_functional_requirements,
    s.dependencies,
    s.constraints,
    s.priority,
    s.estimation,
    s.status,

    fr.functional_requirements,

    br.business_requirements,

    summary.summary AS evidence_summary

FROM story_context s

CROSS JOIN functional_requirement_evidence fr
CROSS JOIN business_requirement_evidence br
CROSS JOIN evidence_summary summary;
`;

/* =========================================================================
   7. RETRIEVE STORY AND EVIDENCE
   ========================================================================= */

async function retrieveStoryEvidence(userStoryId) {
    const result = await pool.query(
        EVIDENCE_SQL,
        [userStoryId]
    );

    if (result.rows.length !== 1) {
        throw new Error(
            `Expected one evidence row for ${userStoryId}; received ${result.rows.length}.`
        );
    }

    return result.rows[0];
}

/* =========================================================================
   8. COMPACT ORIGINAL STORY
   ========================================================================= */

function compactStoryForPrompt(originalStory) {
    const result = {};

    for (const column of STORY_COLUMNS) {
        const value = originalStory[column];

        if (value === null || value === undefined) {
            result[column] = null;
            continue;
        }

        if (
            column === 'user_story_id' ||
            column === 'estimation'
        ) {
            result[column] = value;
            continue;
        }

        if (JSONB_COLUMNS.has(column)) {
            result[column] = compactNestedJson(
                value,
                LIMITS.story_json_string
            );
            continue;
        }

        result[column] = compactText(
            value,
            LIMITS.story_string
        );
    }

    return result;
}

/* =========================================================================
   9. COMPACT RETRIEVED REQUIREMENTS
   ========================================================================= */

function compactFunctionalRequirements(items) {
    return (items || []).map(item => ({
        functional_requirement_id:
            item.functional_requirement_id,

        name: compactText(
            item.name,
            LIMITS.requirement_name
        ),

        description: compactText(
            item.description,
            LIMITS.requirement_description
        ),

        status: item.status
    }));
}

function compactBusinessRequirements(items) {
    return (items || []).map(item => ({
        business_requirement_id:
            item.business_requirement_id,

        name: compactText(
            item.name,
            LIMITS.requirement_name
        ),

        business_requirement: compactText(
            item.business_requirement,
            LIMITS.requirement_description
        ),

        business_objective: compactText(
            item.business_objective,
            LIMITS.requirement_description
        ),

        success_measures: compactNestedJson(
            item.success_measures,
            LIMITS.requirement_description
        ),

        policies_and_constraints: compactNestedJson(
            item.policies_and_constraints,
            LIMITS.requirement_description
        )
    }));
}

/* =========================================================================
   10. BUILD QWEN INPUT
   ========================================================================= */

function buildGenerationInput(row) {
    const originalStory = Object.fromEntries(
        STORY_COLUMNS.map(column => [
            column,
            getValue(row, column)
        ])
    );

    return {
        original_user_story:
            compactStoryForPrompt(originalStory),

        repository_evidence: {
            functional_requirements:
                compactFunctionalRequirements(
                    row.functional_requirements
                ),

            business_requirements:
                compactBusinessRequirements(
                    row.business_requirements
                )
        },

        evidence_summary: row.evidence_summary
    };
}

/* =========================================================================
   11. BUILD DIMENSION DEFINITIONS
   ========================================================================= */

function buildDimensionInstructions() {
    return DIMENSIONS.map(item => ({
        dimension: item.dimension,
        question: item.question,
        data_to_supply: item.data_to_supply
    }));
}

/* =========================================================================
   12. GENERATION PROMPT
   ========================================================================= */

function buildGenerationPrompt(input, userStoryId) {
    const dimensions = buildDimensionInstructions();

    return `
ROLE

You are a senior Business Analyst and Functional Requirements
Engineer responsible for producing complete, implementable,
testable User Story content.

TASK

Generate the actual functional content for all 12 dimensions
of the supplied User Story.

This is a CONTENT GENERATION task.

You are NOT being asked to assess the story.

Do not report that a field is empty.
Do not report that a field is missing.
Do not assign PASS, FAIL, PARTIAL or NOT_APPLICABLE.
Do not produce assessment findings.
Do not produce a list of missing fields.
Do not produce a correction recommendation report.

Generate the actual content that belongs in each dimension.

USER STORY ID

${JSON.stringify(String(userStoryId))}

THE 12 DIMENSIONS

${safeJsonStringify(dimensions)}

INPUT DATA

${safeJsonStringify(input)}

EVIDENCE AND REASONING RULES

1. Use the original User Story as the starting business context.

2. Use the retrieved Functional Requirements to determine the
   functional behaviour the application must implement.

3. Use the retrieved Business Requirements to understand the
   intended business outcomes, objectives, measures, policies
   and constraints.

4. Use the original story's actors, business objects, description,
   user goal, business value, existing business rules, constraints,
   non-functional requirements and other populated fields.

5. Generate meaningful functional content for every one of
   the 12 dimensions.

6. Do not simply copy the original fields.

7. Expand abbreviated or incomplete content into clear,
   actionable and logically ordered functional behaviour.

8. Convert requirement statements into implementable application
   behaviour where the supplied evidence supports that behaviour.

9. Derive preconditions and postconditions from the actual
   business process and supplied requirements.

10. Define a meaningful trigger based on the event or action
    described by the story and its requirements.

11. Produce a sequential main flow describing the expected
    successful business interaction.

12. Produce alternative flows for legitimate variations in
    the supported business process.

13. Produce exception flows for relevant failure and rejection
    scenarios supported by the business context.

14. Generate observable and testable acceptance criteria.

15. Generate consistent Given-When-Then scenarios.

16. Generate success criteria that describe the expected
    business or functional outcome.

17. Generate business rules from explicit rules, policies,
    constraints and requirement statements supplied in the input.
    Do not invent new business policies.

18. Generate direct dependencies only where the original story
    or retrieved evidence establishes a dependency.

19. Do not confuse a functional sequence with an external
    system dependency.

20. Do not introduce new actors, external systems, APIs,
    integrations, permissions, fields, numerical thresholds,
    time limits, or policies without supporting evidence.

21. Do not turn an example or assumption into an established
    business rule.

22. When the evidence supports a functional behaviour but does
    not specify implementation details, express the behaviour
    without inventing those details.

23. Maintain consistency across all 12 dimensions.

24. Avoid contradictory acceptance criteria, business rules,
    main flows, alternative flows and exception flows.

25. Preserve the original business intent.

26. Do not remove valid existing information.

27. Use actual requirement identifiers when referring to
    supplied FRs and BRs.

28. Do not create fictitious requirement identifiers.

29. Do not include assessment statuses or quality ratings
    anywhere in the generated content.

30. Do not return a narrative about what is missing.
    Return the generated functional content itself.

DIMENSION-SPECIFIC OUTPUT EXPECTATIONS

user_goal:
A clear statement of the outcome the actor wants to achieve.

preconditions:
An array of concrete conditions that must hold before the
main business interaction can begin.

postconditions:
An array of expected system or business states after successful
completion.

trigger:
A clear event or action that initiates the User Story.

main_flow:
An ordered array of detailed successful interaction steps.
Each step should identify the responsible actor or system
where relevant and describe the actual behaviour.

alternative_flows:
An array of meaningful alternative paths through the process.
Each item should explain the condition and resulting behaviour.

exception_flows:
An array of relevant error, rejection or failure paths.
Each item should explain the triggering condition and expected
system response.

acceptance_criteria:
An array of specific, observable and testable conditions.

given_when_then:
An array of structured scenarios containing:
- given
- when
- then

business_rules:
An array of actual business rules supported by the supplied
story and repository evidence. Preserve existing valid rules
and add only rules explicitly supported by the evidence.

success_criteria:
An array of measurable or observable expected outcomes.
Do not invent numerical targets.

direct_dependencies:
An array of direct dependencies established by the supplied
story or repository evidence. Each item should explain the
dependency and its relevance.

OUTPUT CONTRACT

Return exactly one valid JSON object with these fields:

{
  "user_story_id": "US-001",
  "generated_dimensions": {
    "user_goal": "...",
    "preconditions": [],
    "postconditions": [],
    "trigger": "...",
    "main_flow": [],
    "alternative_flows": [],
    "exception_flows": [],
    "acceptance_criteria": [],
    "given_when_then": [],
    "business_rules": [],
    "success_criteria": [],
    "direct_dependencies": []
  }
}

OUTPUT REQUIREMENTS

- Include exactly all 12 dimensions.
- Use a string for user_goal.
- Use a string for trigger.
- Use arrays for all other dimensions.
- Each array must contain meaningful content where supported
  by the supplied business context and requirements.
- Do not return status fields.
- Do not return issues.
- Do not return findings.
- Do not return recommended_correction.
- Do not return assessment_result.
- Do not return correction_summary.
- Do not return Markdown or code fences.
- Do not return commentary.

Return valid JSON only.
`.trim();
}

/* =========================================================================
   13. QWEN EXECUTION
   ========================================================================= */

function runQwen(prompt, stageName, userStoryId) {
    return new Promise((resolve, reject) => {
        let child = null;
        let timeout = null;
        let settled = false;

        let stdout = '';
        let stderr = '';

        const uniqueId =
            `${process.pid}_${Date.now()}_${Math.random()
                .toString(36).slice(2, 10)}`;

        const safeId = safeFileName(userStoryId);
        const safeStage = safeFileName(stageName);

        const promptFile = path.join(
            TEMP_DIR,
            `${safeId}_${safeStage}_${uniqueId}_prompt.txt`
        );

        const responseFile = path.join(
            TEMP_DIR,
            `${safeId}_${safeStage}_${uniqueId}_response.txt`
        );

        function cleanup() {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }

            for (const file of [promptFile, responseFile]) {
                try {
                    if (fs.existsSync(file)) {
                        fs.unlinkSync(file);
                    }
                } catch (error) {
                    console.warn(
                        `[QWEN] Cleanup warning: ${error.message}`
                    );
                }
            }
        }

        function finish(error, result) {
            if (settled) return;

            settled = true;
            cleanup();

            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        }

        try {
            if (
                typeof prompt !== 'string' ||
                !prompt.trim()
            ) {
                throw new Error(
                    `Empty prompt supplied for ${stageName}.`
                );
            }

            fs.mkdirSync(TEMP_DIR, {
                recursive: true
            });

            fs.writeFileSync(
                promptFile,
                prompt,
                'utf8'
            );

            console.log(`\n[QWEN] ${stageName}`);

            console.log(
                '[QWEN] Prompt characters:',
                prompt.length.toLocaleString()
            );

            console.log(
                '[QWEN] Launching llama-cli...'
            );

            const args = [
                '-hf', MODEL,
                '-ngl', String(MODEL_GPU_LAYERS),
                '--single-turn',
                '-c', String(CONTEXT_SIZE),
                '-b', String(MODEL_BATCH_SIZE),
                '-t', String(MODEL_THREADS),
                '--reasoning', 'off',
                '--log-disable',
                '-n', String(MAX_OUTPUT_TOKENS),
                '-f', promptFile,
                '-o', responseFile
            ];

            child = spawn(
                LLAMA_CLI,
                args,
                {
                    cwd: ROOT,
                    stdio: ['ignore', 'pipe', 'pipe']
                }
            );

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');

            child.stdout.on('data', chunk => {
                stdout += chunk;
            });

            child.stderr.on('data', chunk => {
                stderr += chunk;
            });

            timeout = setTimeout(() => {
                if (settled) return;

                if (child && child.exitCode === null) {
                    child.kill('SIGTERM');
                }

                finish(
                    new Error(
                        `Qwen timed out during ${stageName} after ${MODEL_TIMEOUT_MS} ms.`
                    )
                );
            }, MODEL_TIMEOUT_MS);

            child.on('error', error => {
                finish(
                    new Error(
                        `Unable to start llama-cli: ${error.message}`
                    )
                );
            });

            child.on('close', (code, signal) => {
                if (settled) return;

                let response = '';

                if (fs.existsSync(responseFile)) {
                    response = fs.readFileSync(
                        responseFile,
                        'utf8'
                    );
                }

                const combinedOutput = [
                    stdout,
                    stderr,
                    response
                ].join('\n');

                const contextFailure =
                    /exceeds the available context size/i
                        .test(combinedOutput) ||
                    /request\s*\(\s*\d+\s*tokens?\s*\)\s*exceeds/i
                        .test(combinedOutput) ||
                    /context.*(overflow|too small|exceeded)/i
                        .test(combinedOutput);

                if (contextFailure) {
                    finish(
                        new Error([
                            `llama-cli reported a context problem during ${stageName}.`,
                            combinedOutput.slice(-5000)
                        ].join('\n'))
                    );

                    return;
                }

                if (code !== 0) {
                    finish(
                        new Error([
                            `llama-cli failed during ${stageName}.`,
                            `Exit code: ${code}`,
                            `Signal: ${signal || 'none'}`,
                            '',
                            'STDERR:',
                            stderr.slice(-5000),
                            '',
                            'STDOUT:',
                            stdout.slice(-3000)
                        ].join('\n'))
                    );

                    return;
                }

                if (!response.trim()) {
                    finish(
                        new Error([
                            `Qwen produced an empty response during ${stageName}.`,
                            'Response file was empty.',
                            '',
                            'STDERR:',
                            stderr.slice(-2000),
                            '',
                            'STDOUT:',
                            stdout.slice(-2000)
                        ].join('\n'))
                    );

                    return;
                }

                console.log(
                    `[QWEN] ${stageName} output:`,
                    response.length.toLocaleString(),
                    'characters'
                );

                finish(null, {
                    output: response,
                    stdout,
                    stderr
                });
            });

        } catch (error) {
            finish(error);
        }
    });
}

/* =========================================================================
   14. EXTRACT JSON
   ========================================================================= */

function extractBalancedJsonObjects(text) {
    const objects = [];

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (start === -1) {
            if (char === '{') {
                start = i;
                depth = 1;
                inString = false;
                escaped = false;
            }

            continue;
        }

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }

            continue;
        }

        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;

            if (depth === 0) {
                const candidateText = text.slice(
                    start,
                    i + 1
                );

                try {
                    const candidate = JSON.parse(
                        candidateText
                    );

                    if (isPlainObject(candidate)) {
                        objects.push(candidate);
                    }
                } catch (_) {
                    // Ignore malformed JSON candidate.
                }

                start = -1;
            }
        }
    }

    return objects;
}

function extractGenerationJSON(result, userStoryId) {
    if (
        !result ||
        typeof result.output !== 'string' ||
        !result.output.trim()
    ) {
        throw new Error(
            'Qwen returned empty output.'
        );
    }

    const text = result.output
        .replace(/<\|[^|]*\|>/g, '')
        .replace(/```(?:json)?/gi, '')
        .trim();

    const candidates = extractBalancedJsonObjects(text);

    const matching = candidates.filter(candidate => (
        String(candidate.user_story_id) === String(userStoryId) &&
        isPlainObject(candidate.generated_dimensions)
    ));

    if (!matching.length) {
        throw new Error([
            'No valid generated-dimensions JSON object found.',
            `JSON objects detected: ${candidates.length}`,
            '',
            'Response preview:',
            text.slice(0, 5000)
        ].join('\n'));
    }

    return matching[matching.length - 1];
}

/* =========================================================================
   15. VALIDATE GENERATED DIMENSIONS
   ========================================================================= */

function validateGeneratedDimensions(result, userStoryId) {
    if (!isPlainObject(result)) {
        throw new Error(
            'Generation result must be a JSON object.'
        );
    }

    if (
        String(result.user_story_id) !==
        String(userStoryId)
    ) {
        throw new Error(
            'Generated User Story ID does not match original.'
        );
    }

    const dimensions = result.generated_dimensions;

    if (!isPlainObject(dimensions)) {
        throw new Error(
            'generated_dimensions must be an object.'
        );
    }

    const actualKeys = Object.keys(dimensions);

    if (
        actualKeys.length !== REQUIRED_DIMENSIONS.length ||
        REQUIRED_DIMENSIONS.some(key => !actualKeys.includes(key))
    ) {
        throw new Error(
            'Generated output must contain exactly the 12 required dimensions.'
        );
    }

    for (const dimension of REQUIRED_DIMENSIONS) {
        const value = dimensions[dimension];

        if (dimension === 'user_goal' || dimension === 'trigger') {
            if (
                typeof value !== 'string' ||
                !value.trim()
            ) {
                throw new Error(
                    `${dimension} must contain generated text.`
                );
            }

            continue;
        }

        if (!Array.isArray(value)) {
            throw new Error(
                `${dimension} must be an array.`
            );
        }

        for (let index = 0; index < value.length; index++) {
            const item = value[index];

            if (
                item === null ||
                item === undefined ||
                (
                    typeof item !== 'string' &&
                    !isPlainObject(item)
                )
            ) {
                throw new Error(
                    `Invalid ${dimension} item at index ${index}.`
                );
            }

            if (
                typeof item === 'string' &&
                !item.trim()
            ) {
                throw new Error(
                    `Empty ${dimension} item at index ${index}.`
                );
            }
        }
    }

    return true;
}

/* =========================================================================
   16. GENERATE 12 DIMENSIONS
   ========================================================================= */

async function generateUserStoryDimensions(input, userStoryId) {
    const prompt = buildGenerationPrompt(
        input,
        userStoryId
    );

    const result = await runQwen(
        prompt,
        'GENERATE-12-USER-STORY-DIMENSIONS',
        userStoryId
    );

    const generated = extractGenerationJSON(
        result,
        userStoryId
    );

    validateGeneratedDimensions(
        generated,
        userStoryId
    );

    return generated.generated_dimensions;
}

/* =========================================================================
   17. MAP GENERATED DIMENSIONS TO ORIGINAL STORY
   ========================================================================= */

function applyGeneratedDimensions(originalStory, generatedDimensions) {
    const corrected = {
        ...originalStory
    };

    for (const [dimension, storyColumn] of Object.entries(
        DIMENSION_FIELD_MAPPING
    )) {
        const generatedValue = generatedDimensions[dimension];

        if (dimension === 'user_goal' || dimension === 'trigger') {
            corrected[storyColumn] = generatedValue;
        } else {
            corrected[storyColumn] = generatedValue;
        }
    }

    return corrected;
}

/* =========================================================================
   18. VALIDATE COMPLETE USER STORY
   ========================================================================= */

function validateCorrectedStory(corrected, original) {
    if (!isPlainObject(corrected)) {
        throw new Error(
            'Generated User Story must be an object.'
        );
    }

    for (const column of STORY_COLUMNS) {
        if (!Object.prototype.hasOwnProperty.call(corrected, column)) {
            throw new Error(
                `Generated User Story is missing field: ${column}`
            );
        }
    }

    const unexpectedKeys = Object.keys(corrected).filter(
        key => !STORY_COLUMNS.includes(key)
    );

    if (unexpectedKeys.length) {
        throw new Error(
            `Unexpected User Story fields: ${unexpectedKeys.join(', ')}`
        );
    }

    if (
        String(corrected.user_story_id) !==
        String(original.user_story_id)
    ) {
        throw new Error(
            'Generated User Story ID does not match original.'
        );
    }

    if (
        corrected.estimation !== null &&
        (
            typeof corrected.estimation !== 'number' ||
            !Number.isFinite(corrected.estimation)
        )
    ) {
        throw new Error(
            'estimation must be a finite number or null.'
        );
    }

    for (const column of STORY_COLUMNS) {
        if (column === 'estimation') {
            continue;
        }

        const value = corrected[column];

        if (JSONB_COLUMNS.has(column)) {
            if (value === undefined) {
                throw new Error(
                    `${column} cannot be undefined.`
                );
            }

            try {
                const serialized = JSON.stringify(value);

                if (serialized === undefined) {
                    throw new Error(
                        'Value cannot be serialized as JSON.'
                    );
                }
            } catch (error) {
                throw new Error(
                    `${column} is not JSON serializable: ${error.message}`
                );
            }
        } else if (
            value !== null &&
            typeof value !== 'string'
        ) {
            throw new Error(
                `${column} must be a string or null.`
            );
        }
    }

    return true;
}

/* =========================================================================
   19. BUILD GENERATED DIMENSION OUTPUT
   ========================================================================= */

function buildGeneratedDimensionOutput(corrected) {
    const output = {};

    for (const [dimension, storyColumn] of Object.entries(
        DIMENSION_FIELD_MAPPING
    )) {
        output[dimension] = corrected[storyColumn];
    }

    return output;
}

/* =========================================================================
   20. BUILD EVIDENCE REFERENCES

   These references describe records actually retrieved by SQL.
   They are not model-generated IDs.
   ========================================================================= */

function uniqueStrings(values) {
    return [
        ...new Set(
            (values || [])
                .filter(value =>
                    value !== null &&
                    value !== undefined &&
                    String(value).trim() !== ''
                )
                .map(value => String(value).trim())
        )
    ];
}

function buildEvidenceReferences(evidenceRow) {
    return {
        functional_requirement_ids: uniqueStrings(
            getArray(evidenceRow.functional_requirements)
                .map(item => item.functional_requirement_id)
        ),

        business_requirement_ids: uniqueStrings(
            getArray(evidenceRow.business_requirements)
                .map(item => item.business_requirement_id)
        )
    };
}

/* =========================================================================
   21. SAVE GENERATED VERSION TRANSACTIONALLY

   The supplied version table structure from the previous script
   includes assessment_result, dimension_findings,
   correction_summary, evidence_references and model_name.

   Here:
     - assessment_result = CONTENT_GENERATED
     - dimension_findings = the 12 generated content values
     - correction_summary = generation description

   No PASS / FAIL / PARTIAL dimension statuses are written.
   ========================================================================= */

async function saveGeneratedVersion(
    generatedStory,
    generatedDimensions,
    evidenceRow
) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1));',
            [String(generatedStory.user_story_id)]
        );

        const versionResult = await client.query(
            `
            SELECT COALESCE(MAX(version_number), 1) + 1 AS next_version_number
    FROM requirements.user_story_versions
    WHERE user_story_id = $1
            `,
            [generatedStory.user_story_id]
        );

        const versionNumber = Math.max(
    2,
    Number(versionResult.rows[0].next_version_number)
);

        const columns = [
            'user_story_id',
            'version_number',
            'version_type',

            ...STORY_COLUMNS.filter(
                column => column !== 'user_story_id'
            ),

            'assessment_result',
            'dimension_findings',
            'correction_summary',
            'evidence_references',
            'model_name'
        ];

        const values = [
            generatedStory.user_story_id,
            versionNumber,
            'AI_GENERATED'
        ];

        for (const column of STORY_COLUMNS) {
            if (column === 'user_story_id') {
                continue;
            }

            const value = generatedStory[column];

            values.push(
                JSONB_COLUMNS.has(column) && value !== null
                    ? JSON.stringify(value)
                    : value
            );
        }

        values.push(
            'CONTENT_GENERATED',

            JSON.stringify(generatedDimensions),

            'Generated functional content for all 12 User Story dimensions.',

            JSON.stringify(
                buildEvidenceReferences(evidenceRow)
            ),

            MODEL
        );

        const placeholders = values.map(
            (_, index) => `$${index + 1}`
        );

        const sql = `
            INSERT INTO requirements.user_story_versions
            (
                ${columns.join(', ')}
            )
            VALUES
            (
                ${placeholders.join(', ')}
            )
            RETURNING
                version_id,
                user_story_id,
                version_number,
                version_type;
        `;

        const result = await client.query(
            sql,
            values
        );

        await client.query('COMMIT');

        return result.rows[0];

    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error(
                '[DATABASE] Rollback error:',
                rollbackError.message
            );
        }

        throw error;

    } finally {
        client.release();
    }
}

/* =========================================================================
   22. WRITE LOCAL OUTPUT
   ========================================================================= */

function writeOutput(
    userStoryId,
    originalStory,
    generatedStory,
    generatedDimensions,
    evidenceRow,
    savedVersion
) {
    fs.mkdirSync(UNIT_DIR, {
        recursive: true
    });

    const output = {
        user_story_id: userStoryId,

        version: savedVersion,

        model_name: MODEL,

        original_user_story: originalStory,

        generated_dimensions: generatedDimensions,

        generated_user_story: generatedStory,

        repository_evidence: {
            functional_requirements:
                evidenceRow.functional_requirements,

            business_requirements:
                evidenceRow.business_requirements,

            evidence_summary:
                evidenceRow.evidence_summary,

            evidence_references:
                buildEvidenceReferences(evidenceRow)
        },

        processed_at: new Date().toISOString()
    };

    const outputPath = path.join(
        UNIT_DIR,
        `${safeFileName(userStoryId)}_version_${savedVersion.version_number}.json`
    );

    fs.writeFileSync(
        outputPath,
        JSON.stringify(output, null, 2),
        'utf8'
    );

    return outputPath;
}

/* =========================================================================
   23. PROCESS ONE USER STORY
   ========================================================================= */

async function processOneUserStory(userStoryId) {
    logSection(
        `GENERATING USER STORY: ${userStoryId}`
    );

    console.log(
        '\n[STEP 1] Retrieving original story and repository evidence...'
    );

    const evidenceRow = await retrieveStoryEvidence(
        userStoryId
    );

    console.log(
        '[EVIDENCE SUMMARY]',
        JSON.stringify(evidenceRow.evidence_summary)
    );

    const originalStory = Object.fromEntries(
        STORY_COLUMNS.map(column => [
            column,
            getValue(evidenceRow, column)
        ])
    );

    console.log(
        '\n[STEP 2] Building Qwen generation input...'
    );

    const input = buildGenerationInput(
        evidenceRow
    );

    const inputText = safeJsonStringify(input);

    console.log(
        '[INPUT] Total characters:',
        inputText.length.toLocaleString()
    );

    console.log(
        '[INPUT] Functional requirements:',
        input.repository_evidence.functional_requirements.length
    );

    console.log(
        '[INPUT] Business requirements:',
        input.repository_evidence.business_requirements.length
    );

    console.log(
        '[INPUT] Existing story business-rule content:',
        JSON.stringify(originalStory.business_rules).length
    );

    console.log(
        '[INPUT] Configured dimensions:',
        DIMENSIONS.length
    );

    console.log(
        '\n[STEP 3] Generating functional content for all 12 dimensions...'
    );

    const generatedDimensions =
        await generateUserStoryDimensions(
            input,
            userStoryId
        );

    console.log(
        '[GENERATION] All 12 dimensions generated and validated.'
    );

    console.log('\n[GENERATED DIMENSIONS]');

    for (const dimension of REQUIRED_DIMENSIONS) {
        const value = generatedDimensions[dimension];

        console.log(
            `[GENERATED] ${dimension}:`,
            Array.isArray(value)
                ? `${value.length} item(s)`
                : 'text generated'
        );
    }

    console.log(
        '\n[STEP 4] Mapping generated content to User Story fields...'
    );

    const generatedStory = applyGeneratedDimensions(
        originalStory,
        generatedDimensions
    );

    validateCorrectedStory(
        generatedStory,
        originalStory
    );

    console.log(
        '[VALIDATION] All 31 User Story fields validated.'
    );

    console.log(
        '[VALIDATION] All 12 generated dimensions mapped.'
    );

    console.log(
        '\n[STEP 5] Saving generated User Story version...'
    );

    const savedVersion = await saveGeneratedVersion(
        generatedStory,
        generatedDimensions,
        evidenceRow
    );

    console.log(
        '[DATABASE] Version saved:',
        savedVersion.version_number
    );

    console.log(
        '[DATABASE] Version type:',
        savedVersion.version_type
    );

    const outputPath = writeOutput(
        userStoryId,
        originalStory,
        generatedStory,
        generatedDimensions,
        evidenceRow,
        savedVersion
    );

    console.log(
        '[OUTPUT]',
        outputPath
    );

    console.log(
        `\n[COMPLETED] ${userStoryId}, version ${savedVersion.version_number}`
    );

    return savedVersion;
}

/* =========================================================================
   24. MAIN
   ========================================================================= */

async function main() {
    let processedCount = 0;

    logSection(
        'USER STORY 12-DIMENSION CONTENT GENERATION STARTED'
    );

    console.log('[MODEL]', MODEL);
    console.log('[LLAMA CLI]', LLAMA_CLI);
    console.log('[DATABASE]', 'demodb');
    console.log('[DIMENSIONS]', DIMENSIONS.length);
    console.log('[CONTEXT]', CONTEXT_SIZE);
    console.log('[MAX OUTPUT TOKENS]', MAX_OUTPUT_TOKENS);
    console.log('[THREADS]', MODEL_THREADS);
    console.log('[BATCH SIZE]', MODEL_BATCH_SIZE);
    console.log('[GPU LAYERS]', MODEL_GPU_LAYERS);

    if (
        CONTEXT_SIZE <= 0 ||
        MAX_OUTPUT_TOKENS <= 0 ||
        MODEL_THREADS <= 0 ||
        MODEL_BATCH_SIZE <= 0
    ) {
        throw new Error(
            'Invalid model configuration.'
        );
    }

    ensureDirectories();

    pool = createPool();

    try {
        await pool.query('SELECT 1');

        console.log(
            '\n[DATABASE] Connection successful.'
        );

        while (true) {
            const userStoryId = await selectNextUserStory();

            if (!userStoryId) {
                console.log(
                    '\n[COMPLETE] No more eligible User Stories.'
                );

                break;
            }

            await processOneUserStory(
                userStoryId
            );

            processedCount++;

            console.log(
                `\n[PROGRESS] Processed ${processedCount} User Story/stories.`
            );
        }

        logSection(
            'USER STORY CONTENT GENERATION FINISHED'
        );

        console.log(
            '[TOTAL PROCESSED]',
            processedCount
        );

    } catch (error) {
        console.error(
            '\n[PROCESSING ERROR]'
        );

        console.error(
            error.stack || error
        );

        process.exitCode = 1;

    } finally {
        if (pool) {
            await pool.end();
            pool = null;

            console.log(
                '\n[DATABASE] Connection pool closed.'
            );
        }
    }
}

/* =========================================================================
   25. START
   ========================================================================= */

main().catch(async error => {
    console.error(
        '\n[FATAL ERROR]'
    );

    console.error(
        error.stack || error
    );

    if (pool) {
        try {
            await pool.end();
        } catch (closeError) {
            console.error(
                '[DATABASE] Pool shutdown error:',
                closeError.message
            );
        }

        pool = null;
    }

    process.exitCode = 1;
});