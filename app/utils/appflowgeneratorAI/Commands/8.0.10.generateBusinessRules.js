
'use strict';

/**
 * 8.0.10 - INDEPENDENT BUSINESS RULE GENERATION
 *
 * File:
 *   app/utils/appflowgeneratorAI/commands/8.0.10.generateBusinessRules.js
 *
 * ARCHITECTURE
 *
 * Knowledge Base + Requirements Repository
 *                  |
 *                  v
 *       Combined Baseline Foundation
 *                  |
 *                  v
 *             Local Qwen AI
 *                  |
 *                  v
 *    Independent Business Understanding
 *                  |
 *          Targeted SQL retrieval
 *          (read-only, when needed)
 *                  |
 *                  v
 *       Independent Business Reasoning
 *                  |
 *                  v
 *        NEW Business Rules
 *                  |
 *                  v
 *          JSON FILE ONLY
 *
 * DATABASE ACCESS:
 *   READ ONLY.
 *
 * No PostgreSQL INSERT, UPDATE, DELETE, or DDL.
 * No generated_business_rules table.
 * No new tables or columns.
 * No database persistence of generated rules.
 *
 * Run from project root:
 *
 *   node app/utils/appflowgeneratorAI/commands/8.0.10.generateBusinessRules.js
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
// Uses the conventions from the working 8.0.8 script.
// ============================================================

const ROOT = process.cwd();

const MODEL =
    process.env.MODEL_NAME ||
    'unsloth/Qwen3.5-9B-GGUF';

const LLAMA_CLI =
    process.env.LLAMA_CLI_PATH ||
    'llama-cli';

const DB_CONFIG_PATH =
    path.join(ROOT, 'app/config/config.json');

const OUTPUT_DIR =
    process.env.BUSINESS_RULE_OUTPUT_DIR ||
    path.join(
        ROOT,
        'app/utils/appflowgeneratorAI/aiOutput/businessRules'
    );

const SETTINGS = {
    context: 35723,
    batch: 256,
    threads: Number(process.env.THREADS || 8),
    temperature: 0.2,
    maxTokens: 14096,

    timeoutMs: 300 * 60 * 1000,
    heartbeatMs: 30000,

    maxQueries: Number(
        process.env.BUSINESS_RULE_MAX_QUERIES || 24
    ),

    maxRowsPerQuery: 100,
    maxQueryResultChars: 24000,
    maxHistoryChars: 95000
};

const KNOWLEDGE_BASE_TABLES = [
    'knowledge_sources',
    'knowledge_records',
    'knowledge_search',
    'knowledge_relationships',
    'knowledge_catalogue',
    'knowledge_ingestion_runs'
];

const REQUIREMENTS_TABLES = [
    'ingestion_runs',
    'source_files',
    'functional_requirements',
    'business_requirements',
    'requirement_versions',
    'source_records',
    'requirement_relationships',
    'br_validation_runs',
    'br_validation_findings',
    'br_consolidation_runs',
    'br_overlap_pairs',
    'br_consolidation_findings',
    'br_consolidation_decisions',
    'br_alternatives'
];

const REQUIREMENTS_VIEWS = [
    'v_business_requirements',
    'v_fr_br_traceability'
];

// ============================================================
// 3. UTILITIES
// ============================================================

function log(message) {
    console.log(
        `[8.0.10] ${new Date().toISOString()} ${message}`
    );
}

function fail(message) {
    throw new Error(message);
}

function cut(value, max = 1000) {
    const text = String(value ?? '');

    return text.length > max
        ? text.slice(0, max) + '...'
        : text;
}

function isObject(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    );
}

function arr(value) {
    return Array.isArray(value) ? value : [];
}

function timestamp() {
    return new Date()
        .toISOString()
        .replace(/:/g, '-');
}

function quoteIdentifier(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

function readJson(filePath) {
    return JSON.parse(
        fs.readFileSync(filePath, 'utf8')
    );
}

function writeJsonAtomic(filePath, data) {
    const temporaryPath =
        `${filePath}.${process.pid}.tmp`;

    fs.writeFileSync(
        temporaryPath,
        JSON.stringify(data, null, 2),
        'utf8'
    );

    fs.renameSync(temporaryPath, filePath);
}

// ============================================================
// 4. POSTGRESQL CONNECTION
// Exact 8.0.8 configuration convention.
// ============================================================

function createPool() {
    if (!fs.existsSync(DB_CONFIG_PATH)) {
        fail(
            `Database config not found: ${DB_CONFIG_PATH}`
        );
    }

    const fullConfig = readJson(DB_CONFIG_PATH);
    const config = fullConfig.development;

    if (!config) {
        fail(
            'Missing development database configuration.'
        );
    }

    for (const key of [
        'username',
        'database',
        'host',
        'port'
    ]) {
        if (
            config[key] === undefined ||
            config[key] === null ||
            config[key] === ''
        ) {
            fail(
                `Missing development database configuration property: ${key}`
            );
        }
    }

    return new Pool({
        user: config.username,
        password: config.password || '',
        database: config.database,
        host: config.host,
        port: Number(config.port),
        max: 1,
        application_name: 'business-rule-generation-read-only'
    });
}

// ============================================================
// 5. ENFORCE READ-ONLY DATABASE SESSION
// ============================================================

async function enforceReadOnlySession(client) {
    await client.query(
        'SET default_transaction_read_only = on'
    );

    const result = await client.query(
        'SHOW default_transaction_read_only'
    );

    if (
        result.rows[0].default_transaction_read_only !== 'on'
    ) {
        fail(
            'Could not enforce read-only PostgreSQL session.'
        );
    }

    log('PostgreSQL session enforced as READ ONLY.');
}

// ============================================================
// 6. DATABASE METADATA DISCOVERY
// ============================================================

async function discoverKnowledgeBaseSchema(client) {
    const result = await client.query(
        `
        SELECT
            table_schema,
            table_name
        FROM information_schema.tables
        WHERE table_name = ANY($1)
          AND table_type = 'BASE TABLE'
          AND table_schema NOT IN (
              'pg_catalog',
              'information_schema'
          )
        ORDER BY table_schema, table_name
        `,
        [KNOWLEDGE_BASE_TABLES]
    );

    const schemas = new Map();

    for (const row of result.rows) {
        if (!schemas.has(row.table_schema)) {
            schemas.set(
                row.table_schema,
                new Set()
            );
        }

        schemas
            .get(row.table_schema)
            .add(row.table_name);
    }

    const candidates = [...schemas.entries()]
        .filter(([, tables]) =>
            KNOWLEDGE_BASE_TABLES.every(
                table => tables.has(table)
            )
        )
        .map(([schema]) => schema);

    if (candidates.length === 0) {
        fail(
            'Could not find a schema containing all six Knowledge Base tables.'
        );
    }

    if (candidates.length > 1) {
        fail(
            `Multiple Knowledge Base schemas found: ${candidates.join(', ')}.`
        );
    }

    return candidates[0];
}

async function relationExists(client, schema, relation) {
    const result = await client.query(
        `
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = $1
              AND table_name = $2

            UNION ALL

            SELECT 1
            FROM information_schema.views
            WHERE table_schema = $1
              AND table_name = $2
        ) AS present
        `,
        [schema, relation]
    );

    return result.rows[0].present;
}

async function getRelationColumns(client, schema, relation) {
    const result = await client.query(
        `
        SELECT
            column_name,
            data_type,
            udt_name,
            is_nullable,
            column_default,
            ordinal_position
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
        ORDER BY ordinal_position
        `,
        [schema, relation]
    );

    return result.rows;
}

async function inspectRelations(
    client,
    schema,
    relations,
    relationType
) {
    const metadata = {};

    for (const relation of relations) {
        const exists = await relationExists(
            client,
            schema,
            relation
        );

        if (!exists) {
            fail(
                `Required ${relationType} relation missing: ${schema}.${relation}`
            );
        }

        metadata[relation] = await getRelationColumns(
            client,
            schema,
            relation
        );
    }

    return metadata;
}

async function inspectDatabase(client) {
    const databaseResult = await client.query(
        'SELECT current_database() AS database_name'
    );

    const databaseName =
        databaseResult.rows[0].database_name;

    if (databaseName !== 'demodb') {
        fail(
            `Connected to "${databaseName}", expected "demodb".`
        );
    }

    log('Discovering Knowledge Base schema.');

    const knowledgeBaseSchema =
        await discoverKnowledgeBaseSchema(client);

    log(
        `Knowledge Base schema discovered: ${knowledgeBaseSchema}`
    );

    log('Inspecting Knowledge Base metadata.');

    const knowledgeBase = {
        schema: knowledgeBaseSchema,
        tables: await inspectRelations(
            client,
            knowledgeBaseSchema,
            KNOWLEDGE_BASE_TABLES,
            'Knowledge Base'
        )
    };

    log('Inspecting Requirements Repository metadata.');

    const requirementsRepository = {
        schema: 'requirements',

        tables: await inspectRelations(
            client,
            'requirements',
            REQUIREMENTS_TABLES,
            'Requirements Repository'
        ),

        views: await inspectRelations(
            client,
            'requirements',
            REQUIREMENTS_VIEWS,
            'Requirements Repository'
        )
    };

    return {
        database: databaseName,
        knowledge_base: knowledgeBase,
        requirements_repository: requirementsRepository
    };
}

// ============================================================
// 7. BUILD SCHEMA DESCRIPTION
// Metadata only. No bulk loading of repository records.
// ============================================================

function buildSchemaDescription(metadata) {
    const lines = [];

    lines.push(
        `DATABASE: ${metadata.database}`
    );

    lines.push(
        `KNOWLEDGE BASE SCHEMA: ${metadata.knowledge_base.schema}`
    );

    for (const [table, columns] of Object.entries(
        metadata.knowledge_base.tables
    )) {
        lines.push('');
        lines.push(
            `${metadata.knowledge_base.schema}.${table}`
        );

        for (const column of columns) {
            lines.push(
                `  ${column.column_name}: ${column.data_type}` +
                `${column.is_nullable === 'NO' ? ' NOT NULL' : ''}`
            );
        }
    }

    lines.push('');
    lines.push(
        'REQUIREMENTS REPOSITORY SCHEMA: requirements'
    );

    for (const [table, columns] of Object.entries(
        metadata.requirements_repository.tables
    )) {
        lines.push('');
        lines.push(`requirements.${table}`);

        for (const column of columns) {
            lines.push(
                `  ${column.column_name}: ${column.data_type}` +
                `${column.is_nullable === 'NO' ? ' NOT NULL' : ''}`
            );
        }
    }

    for (const [view, columns] of Object.entries(
        metadata.requirements_repository.views
    )) {
        lines.push('');
        lines.push(`requirements.${view} (VIEW)`);

        for (const column of columns) {
            lines.push(
                `  ${column.column_name}: ${column.data_type}`
            );
        }
    }

    return lines.join('\n');
}

// ============================================================
// 8. READ-ONLY SQL VALIDATION AND EXECUTION
// ============================================================

function validateReadOnlySql(sql) {
    if (
        typeof sql !== 'string' ||
        !sql.trim()
    ) {
        fail('Qwen returned an empty SQL query.');
    }

    const statement = sql.trim().replace(/;+$/, '').trim();

    if (statement.length > 12000) {
        fail(
            'Qwen SQL query exceeds the 12000-character limit.'
        );
    }

    if (!/^(SELECT|WITH)\b/i.test(statement)) {
        fail(
            'Only SELECT and WITH queries are permitted.'
        );
    }

    // Prevent multiple SQL statements.
    if (statement.includes(';')) {
        fail(
            'Multiple SQL statements are not permitted.'
        );
    }

    // Defense-in-depth validation.
    // PostgreSQL read-only transaction is the primary write protection.
    const forbidden = [
        /\bINSERT\b/i,
        /\bUPDATE\b/i,
        /\bDELETE\b/i,
        /\bMERGE\b/i,
        /\bCREATE\b/i,
        /\bALTER\b/i,
        /\bDROP\b/i,
        /\bTRUNCATE\b/i,
        /\bGRANT\b/i,
        /\bREVOKE\b/i,
        /\bCOPY\b/i,
        /\bCALL\b/i,
        /\bDO\b/i,
        /\bEXECUTE\b/i,
        /\bVACUUM\b/i,
        /\bREFRESH\b/i,
        /\bPG_READ_FILE\b/i,
        /\bPG_WRITE_FILE\b/i,
        /\bDBLINK\b/i,
        /\bLO_IMPORT\b/i,
        /\bLO_EXPORT\b/i
    ];

    for (const pattern of forbidden) {
        if (pattern.test(statement)) {
            fail(
                `Rejected SQL containing prohibited operation: ${pattern}`
            );
        }
    }

    return statement;
}

async function executeReadOnlyQuery(
    client,
    sql,
    knowledgeBaseSchema
) {
    const statement = validateReadOnlySql(sql);

    await client.query('BEGIN READ ONLY');

    try {
        await client.query(
            `SET LOCAL search_path TO ${quoteIdentifier(knowledgeBaseSchema)}, "requirements", pg_catalog`
        );

        await client.query(
            "SET LOCAL statement_timeout = '30000ms'"
        );

        const wrappedQuery = `
            SELECT *
            FROM (
                ${statement}
            ) AS qwen_read_result
            LIMIT ${SETTINGS.maxRowsPerQuery}
        `;

        const result = await client.query(
            wrappedQuery
        );

        await client.query('COMMIT');

        let serializedRows = JSON.stringify(
            result.rows
        );

        if (
            serializedRows.length >
            SETTINGS.maxQueryResultChars
        ) {
            serializedRows =
                serializedRows.slice(
                    0,
                    SETTINGS.maxQueryResultChars
                ) +
                '... [RESULT TRUNCATED]';
        }

        return {
            status: 'SUCCESS',
            row_count: result.rows.length,
            columns: result.fields.map(
                field => field.name
            ),
            rows: serializedRows
        };

    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // Preserve the original query error.
        }

        return {
            status: 'ERROR',
            error: error.message
        };
    }
}

// ============================================================
// 9. LOCAL LLAMA-CLI RUNNER
// Matches 8.0.8 executable and model conventions.
// ============================================================

function runLocal(label, prompt, maxTokens) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();

        let stdout = '';
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

        const child = spawn(
            LLAMA_CLI,
            args,
            {
                cwd: ROOT,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: process.env
            }
        );

        const heartbeat = setInterval(() => {
            log(
                `${label}: ${Math.round((Date.now() - startedAt) / 1000)}s; output ${stdout.length} chars.`
            );
        }, SETTINGS.heartbeatMs);

        const timeout = setTimeout(() => {
            child.kill('SIGKILL');

            finish(
                new Error(`${label}: llama-cli timed out.`)
            );
        }, SETTINGS.timeoutMs);

        function finish(error, result) {
            if (settled) return;

            settled = true;

            clearInterval(heartbeat);
            clearTimeout(timeout);

            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        }

        child.stdout.on('data', data => {
            stdout += data.toString();
        });

        child.stderr.on('data', data => {
            stderr += data.toString();
        });

        child.on('error', error => {
            if (error.code === 'ENOENT') {
                finish(
                    new Error(
                        `llama-cli executable not found: ${LLAMA_CLI}. Set LLAMA_CLI_PATH or make llama-cli available on PATH.`
                    )
                );

                return;
            }

            finish(error);
        });

        child.on('close', code => {
            if (code !== 0) {
                finish(
                    new Error(
                        `${label}: llama-cli exited with code ${code}: ${cut(stderr, 2500)}`
                    )
                );

                return;
            }

            if (!stdout.trim()) {
                finish(
                    new Error(
                        `${label}: llama-cli returned empty output. ${cut(stderr, 1500)}`
                    )
                );

                return;
            }

            finish(null, stdout);
        });
    });
}

// ============================================================
// 10. JSON EXTRACTION
// ============================================================

function extractJson(raw) {
    if (
        typeof raw !== 'string' ||
        !raw.trim()
    ) {
        fail('Empty model response.');
    }

    const text = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    const startObject = text.indexOf('{');

    if (startObject < 0) {
        fail(
            'No JSON object found in Qwen response.'
        );
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (
        let index = startObject;
        index < text.length;
        index++
    ) {
        const char = text[index];

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
                return JSON.parse(
                    text.slice(startObject, index + 1)
                );
            }
        }
    }

    fail(
        'Qwen response contains incomplete or truncated JSON.'
    );
}

async function askJson(label, prompt, maxTokens) {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            let actualPrompt = prompt;

            if (attempt === 2) {
                actualPrompt += `

CORRECTION:
Your previous response was not valid complete JSON.
Return exactly one complete JSON object.
Do not include Markdown fences, explanations, or thinking text.
Do not truncate the response.`;
            }

            const raw = await runLocal(
                `${label}, attempt ${attempt}`,
                actualPrompt,
                maxTokens
            );

            return extractJson(raw);

        } catch (error) {
            lastError = error;

            log(
                `${label}, attempt ${attempt} failed: ${error.message}`
            );
        }
    }

    throw lastError;
}

// ============================================================
// 11. QWEN SYSTEM PROMPT
// ============================================================

function buildSystemPrompt(schemaDescription) {
    return `<|im_start|>system
You are an independent senior business analyst and business-rule
architect.

YOUR OBJECTIVE
Understand the business represented by the supplied Knowledge Base
and Requirements Repository, reason independently, and generate
NEW business rules.

============================================================
BASELINE FOUNDATION
============================================================

The Knowledge Base and Requirements Repository together constitute
the combined baseline foundation for business understanding.

They provide contextual business information, including available
business objects, actors, responsibilities, relationships,
activities, requirements, and associated information.

These repositories are the foundation for reasoning.

They are NOT:
- A fixed list of rules to extract.
- A fixed domain coverage checklist.
- A restriction on the scope of business reasoning.
- A requirement reconciliation exercise.
- A source for copying or rewriting existing rules.

Do not treat the existing repository contents as an exhaustive
description of all possible business rules.

============================================================
INDEPENDENT BUSINESS REASONING
============================================================

Reason independently about the business.

Identify business constraints, policies, decision conditions,
obligations, eligibility rules, calculations, invariants, and
exceptions that are necessary or materially appropriate.

You may identify rules not explicitly documented in the repositories
when they follow logically from the understood business.

Do not invent arbitrary policies, legal obligations, numeric
thresholds, or unsupported business facts.

Do not create a hardcoded domain coverage list.

Do not ask the user discovery questions.

Do not generate a separate discovery plan.

Do not perform a separate planning inference.

============================================================
TARGETED SQL RETRIEVAL
============================================================

You may request additional information from PostgreSQL while
reasoning.

Use targeted SQL when additional repository context is useful.

The database connection is READ ONLY.

You may query:
- Knowledge Base tables.
- Requirements Repository tables.
- Requirements Repository views.

Use the actual schema and column names supplied below.

Use targeted columns and appropriate filters.
Use joins where they provide useful context.
Use JSONB operators where appropriate.
Avoid unnecessarily broad queries.

Do not request INSERT, UPDATE, DELETE, DDL, or any other write
operation.

Do not request a database table for storing generated rules.

Do not attempt to store generated rules in PostgreSQL.

============================================================
BUSINESS RULE QUALITY
============================================================

Each rule must express enforceable business behaviour.

A business rule may define:
- A business constraint.
- A condition or decision.
- An obligation.
- An eligibility criterion.
- A calculation or validation.
- A business invariant.
- A restriction or permission.
- An exception or alternative business outcome.

Rules must be:
- Clear.
- Unambiguous.
- Business-oriented.
- Independently understandable.
- Actionable.
- Testable.
- Consistent with the understood business.

Do not produce:
- Generic advice.
- Aspirational statements.
- Process descriptions without a normative rule.
- User stories.
- Functional requirements.
- Technical implementation instructions.
- Duplicate rules with different wording.
- Simple copies or paraphrases of existing requirements.
- Unsupported legal or regulatory claims.
- Invented numeric values or thresholds.

When a threshold or policy value is not established, do not invent
one. Express the business rule without an unsupported value.

============================================================
OUTPUT PROTOCOL
============================================================

During reasoning, if more repository information is required,
return exactly:

{
  "action": "query",
  "reason": "Why the additional information is required",
  "sql": "One read-only SELECT or WITH query"
}

After receiving the SQL results, continue reasoning.

You may request another targeted query if necessary.

When reasoning is complete, return exactly:

{
  "action": "final",
  "generation_summary": "Concise explanation of the independently reasoned output",
  "business_rules": [
    {
      "business_rule_name": "Concise descriptive name",
      "business_rule": "Complete enforceable business rule",
      "rationale": "Why this rule is necessary",
      "applicability": "Where and when the rule applies",
      "conditions": [],
      "exceptions": [],
      "contextual_basis": []
    }
  ]
}

FIELD DEFINITIONS

business_rule_name:
A concise descriptive name.

business_rule:
The complete normative business rule. Use terms such as must,
must not, may only, or is required to where appropriate.

rationale:
The business reason for the rule.

applicability:
The situations, actors, objects, or lifecycle contexts where it
applies.

conditions:
An array of conditions governing the rule.

exceptions:
An array of legitimate exceptions.

contextual_basis:
An array of concise references to the business context used.
Do not invent record identifiers.

FINAL OUTPUT RESTRICTIONS

Return only the JSON object.

Do not include Markdown fences.

Do not include commentary outside the JSON.

Do not return database INSERT or UPDATE statements.

Do not return SQL for persisting generated rules.

============================================================
AVAILABLE DATABASE SCHEMA
============================================================

${schemaDescription}
<|im_end|>`;
}

// ============================================================
// 12. REASONING PROMPTS AND HISTORY
// ============================================================

function buildInitialPrompt(systemPrompt) {
    return `${systemPrompt}

<|im_start|>user
Begin independent business understanding and business-rule
generation using the combined Knowledge Base and Requirements
Repository foundation.

The repository schemas are available above.

Do not bulk-extract all repository records.

Determine what additional business context is useful and retrieve
it through targeted read-only SQL queries when necessary.

Reason independently.

Generate NEW business rules.

Do not copy or rewrite existing requirements or rules.

Return either:
1. One targeted SQL query; or
2. The final independently generated business rules.

<|im_end|>
<|im_start|>assistant`;
}

function compactHistory(history) {
    const serialized = JSON.stringify(history);

    if (
        serialized.length <= SETTINGS.maxHistoryChars
    ) {
        return serialized;
    }

    const first = history.slice(0, 2);
    const recent = history.slice(-8);

    return JSON.stringify([
        ...first,
        {
            role: 'system',
            content:
                'Earlier intermediate retrieval history was compacted. Continue from the latest supplied SQL results.'
        },
        ...recent
    ]);
}

function buildContinuationPrompt(
    systemPrompt,
    history
) {
    return `${systemPrompt}

============================================================
REASONING HISTORY
============================================================

${compactHistory(history)}

Continue independent business reasoning.

If additional repository context is required, return one targeted
read-only SQL query.

If reasoning is complete, return the final business rules.

Return only one valid JSON object.

<|im_start|>assistant`;
}

// ============================================================
// 13. QUERY-DRIVEN QWEN REASONING LOOP
// No separate discovery-planning inference.
// ============================================================

async function runReasoningAgent(
    client,
    metadata
) {
    const schemaDescription =
        buildSchemaDescription(metadata);

    const systemPrompt =
        buildSystemPrompt(schemaDescription);

    const history = [];

    let prompt =
        buildInitialPrompt(systemPrompt);

    let queryCount = 0;
    let finalResponse = null;
    let reasoningTurns = 0;

    for (
        let turn = 1;
        turn <= SETTINGS.maxQueries + 2;
        turn++
    ) {
        reasoningTurns = turn;

        log(
            `Qwen reasoning turn ${turn}; SQL queries executed: ${queryCount}.`
        );

        const response = await askJson(
            `Business-rule reasoning turn ${turn}`,
            prompt,
            SETTINGS.maxTokens
        );

        if (!isObject(response)) {
            fail(
                `Invalid Qwen response on reasoning turn ${turn}.`
            );
        }

        const action = String(
            response.action || ''
        ).toLowerCase();

        if (action === 'query') {
            if (
                queryCount >= SETTINGS.maxQueries
            ) {
                fail(
                    `Maximum SQL query limit (${SETTINGS.maxQueries}) reached.`
                );
            }

            log(
                `Qwen requested query ${queryCount + 1}: ${cut(response.reason, 250)}`
            );

            const queryResult =
                await executeReadOnlyQuery(
                    client,
                    response.sql,
                    metadata.knowledge_base.schema
                );

            queryCount++;

            history.push({
                role: 'assistant',
                action: 'query',
                reason: cut(response.reason, 1000),
                sql: cut(response.sql, 12000)
            });

            history.push({
                role: 'database',
                query_number: queryCount,
                result: queryResult
            });

            prompt = buildContinuationPrompt(
                systemPrompt,
                history
            );

            continue;
        }

        if (action === 'final') {
            finalResponse = response;
            break;
        }

        fail(
            `Unsupported Qwen action "${response.action}". Expected "query" or "final".`
        );
    }

    if (!finalResponse) {
        fail(
            'Qwen did not return final business rules within the allowed reasoning turns.'
        );
    }

    return {
        response: finalResponse,
        query_count: queryCount,
        reasoning_turns: reasoningTurns,
        history
    };
}

// ============================================================
// 14. NORMALIZE GENERATED BUSINESS RULES
// ============================================================

function normalizeArray(value, fieldName) {
    if (
        value === undefined ||
        value === null
    ) {
        return [];
    }

    if (!Array.isArray(value)) {
        fail(
            `Business rule field "${fieldName}" must be an array.`
        );
    }

    return value
        .map(item => {
            if (typeof item === 'string') {
                return item.trim();
            }

            if (isObject(item)) {
                return item;
            }

            return String(item);
        })
        .filter(item =>
            typeof item !== 'string' ||
            item.length > 0
        );
}

function normalizeBusinessRule(rule, index) {
    if (!isObject(rule)) {
        fail(
            `Business rule at index ${index} is not an object.`
        );
    }

    const businessRuleName = String(
        rule.business_rule_name || ''
    ).trim();

    const businessRule = String(
        rule.business_rule || ''
    ).trim();

    if (!businessRuleName) {
        fail(
            `Business rule ${index + 1} has no business_rule_name.`
        );
    }

    if (!businessRule) {
        fail(
            `Business rule "${businessRuleName}" has no business_rule text.`
        );
    }

    return {
        business_rule_name: businessRuleName,
        business_rule: businessRule,

        rationale: String(
            rule.rationale || ''
        ).trim(),

        applicability: String(
            rule.applicability || ''
        ).trim(),

        conditions: normalizeArray(
            rule.conditions,
            'conditions'
        ),

        exceptions: normalizeArray(
            rule.exceptions,
            'exceptions'
        ),

        contextual_basis: normalizeArray(
            rule.contextual_basis,
            'contextual_basis'
        )
    };
}

function normalizeGeneratedRules(response) {
    const rawRules = arr(
        response.business_rules
    );

    if (!rawRules.length) {
        fail(
            'Qwen returned an empty business_rules array.'
        );
    }

    const rules = rawRules.map(
        normalizeBusinessRule
    );

    const seen = new Set();

    for (const rule of rules) {
        const key = [
            rule.business_rule_name.toLowerCase().trim(),
            rule.business_rule.toLowerCase().trim()
        ].join('|');

        if (seen.has(key)) {
            fail(
                `Duplicate generated business rule: ${rule.business_rule_name}`
            );
        }

        seen.add(key);
    }

    return rules;
}

// ============================================================
// 15. BUILD JSON OUTPUT
// JSON FILE IS THE ONLY OUTPUT DESTINATION.
// ============================================================

function buildOutput(
    rules,
    generation,
    metadata
) {
    return {
        generated_at: new Date().toISOString(),

        generator: {
            name: 'Independent Business Rule Generation',
            version: '8.0.10',
            model: MODEL,
            reasoning_method:
                'QWEN_QUERY_DRIVEN_INDEPENDENT_REASONING'
        },

        baseline_foundation: {
            database: metadata.database,

            knowledge_base_schema:
                metadata.knowledge_base.schema,

            requirements_repository_schema:
                metadata.requirements_repository.schema,

            knowledge_base_tables:
                Object.keys(
                    metadata.knowledge_base.tables
                ),

            requirements_repository_tables:
                Object.keys(
                    metadata.requirements_repository.tables
                ),

            requirements_repository_views:
                Object.keys(
                    metadata.requirements_repository.views
                )
        },

        architecture: {
            knowledge_base_role:
                'BASELINE_BUSINESS_FOUNDATION',

            requirements_repository_role:
                'BASELINE_BUSINESS_FOUNDATION',

            repositories_are_scope_boundary: false,

            fixed_domain_coverage_checklist: false,

            separate_discovery_planning_inference: false,

            independent_business_reasoning: true,

            targeted_sql_retrieval: true,

            database_access: 'READ_ONLY',

            database_writes: false,

            generated_rules_database_persistence: false,

            generated_rules_output: 'JSON_FILE_ONLY'
        },

        execution: {
            reasoning_turns:
                generation.reasoning_turns,

            sql_queries_executed:
                generation.query_count,

            generated_rule_count:
                rules.length,

            status: 'COMPLETED'
        },

        generation_summary: cut(
            generation.response.generation_summary || '',
            5000
        ),

        business_rules: rules
    };
}

// ============================================================
// 16. MAIN
// ============================================================

async function main() {
    log('Starting 8.0.10 independent business-rule generation.');

    log(`Project root: ${ROOT}`);
    log(`Model: ${MODEL}`);
    log(`llama-cli: ${LLAMA_CLI}`);
    log(`Database config: ${DB_CONFIG_PATH}`);

    fs.mkdirSync(
        OUTPUT_DIR,
        { recursive: true }
    );

    const pool = createPool();
    const client = await pool.connect();

    try {
        // First enforce read-only mode.
        await enforceReadOnlySession(client);

        log('Checking PostgreSQL connection.');

        const connection = await client.query(
            `
            SELECT
                current_database() AS database_name,
                current_user AS database_user
            `
        );

        log(
            `Connected to ${connection.rows[0].database_name} as ${connection.rows[0].database_user}.`
        );

        if (
            connection.rows[0].database_name !== 'demodb'
        ) {
            fail(
                'Expected PostgreSQL database demodb.'
            );
        }

        // Discover repository schemas and metadata.
        log('Inspecting baseline repository schemas.');

        const metadata = await inspectDatabase(client);

        log(
            `Knowledge Base schema: ${metadata.knowledge_base.schema}`
        );

        log(
            `Requirements Repository schema: ${metadata.requirements_repository.schema}`
        );

        log(
            'Repository metadata inspection completed.'
        );

        log(
            'Repository records will be retrieved selectively through Qwen-requested SQL.'
        );

        // Independent Qwen reasoning.
        log(
            'Starting independent Qwen business reasoning.'
        );

        const generation = await runReasoningAgent(
            client,
            metadata
        );

        log(
            'Qwen returned its final business-rule response.'
        );

        // Validate generated rules.
        const rules = normalizeGeneratedRules(
            generation.response
        );

        log(
            `Validated ${rules.length} generated business rules.`
        );

        // Build output.
        const output = buildOutput(
            rules,
            generation,
            metadata
        );

        const outputFile = path.join(
            OUTPUT_DIR,
            `business_rules_${timestamp()}.json`
        );

        // The ONLY persistence operation is writing this JSON file.
        writeJsonAtomic(
            outputFile,
            output
        );

        log('==============================================');
        log('BUSINESS RULE GENERATION COMPLETED');
        log('==============================================');
        log(`Generated rules: ${rules.length}`);
        log(`Reasoning turns: ${generation.reasoning_turns}`);
        log(`SQL queries: ${generation.query_count}`);
        log(`JSON output: ${outputFile}`);
        log('PostgreSQL access: READ ONLY');
        log('PostgreSQL writes: NONE');
        log('PostgreSQL schema changes: NONE');
        log('Generated rules database persistence: NONE');
        log('==============================================');

        return {
            status: 'COMPLETED',
            generated_rule_count: rules.length,
            reasoning_turns: generation.reasoning_turns,
            sql_queries: generation.query_count,
            output_file: outputFile
        };

    } catch (error) {
        log('BUSINESS RULE GENERATION FAILED.');

        console.error(
            error.stack || error.message
        );

        throw error;

    } finally {
        client.release();
        await pool.end();
    }
}

// ============================================================
// 17. ENTRY POINT
// ============================================================

if (require.main === module) {
    main()
        .then(result => {
            if (result) {
                log(
                    `Final status: ${result.status}`
                );
            }
        })
        .catch(() => {
            process.exitCode = 1;
        });
}

module.exports = {
    main,
    createPool,
    enforceReadOnlySession,
    discoverKnowledgeBaseSchema,
    inspectDatabase,
    buildSchemaDescription,
    validateReadOnlySql,
    executeReadOnlyQuery,
    extractJson,
    buildSystemPrompt,
    runReasoningAgent,
    normalizeGeneratedRules,
    buildOutput
};
