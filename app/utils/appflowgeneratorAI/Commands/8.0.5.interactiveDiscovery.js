
'use strict';

/*
 * 8.0.5 - AUTONOMOUS FUNCTIONAL REQUIREMENTS DISCOVERY
 *
 * PostgreSQL = baseline knowledge, NOT source of truth.
 * Qwen = internally generates and answers discovery questions.
 *
 * Final JSON contains ONLY:
 * {
 *   "functional_requirements": [
 *     {
 *       "requirement_id": "FR-001",
 *       "requirement_name": "...",
 *       "requirement": "The system shall ..."
 *     }
 *   ]
 * }
 *
 * No llama-server.
 * One llama-cli inference.
 * No human interaction.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { Pool } = require('pg');

const VERSION = '8.0.5';

const ROOT = process.cwd();

const CONFIG_PATH = path.join(
    ROOT,
    'app/config/config.json'
);

const OUTPUT_DIR = path.join(
    ROOT,
    'app/utils/appflowgeneratorAI/aiOutput/functionalRequirements'
);

const TEMP_DIR = path.join(
    os.tmpdir(),
    'discovery-805'
);

const MODEL = process.env.LLM_MODEL ||
    'unsloth/Qwen3.5-9B-GGUF';

const LLAMA_CLI = process.env.LLAMA_CLI_PATH ||
    'llama-cli';

const MODEL_TIMEOUT_MS = 60 * 60 * 1000;

const MODEL_CONTEXT = 8192;
const MAX_OUTPUT_TOKENS = 1800;
const MODEL_THREADS = 8;
const MODEL_BATCH = 512;

const MAX_REPRESENTATIVES = 30;
const MAX_EXCERPT_LENGTH = 190;
const MAX_BASELINE_CHARACTERS = 8500;

function log(message) {
    console.log(
        `[${VERSION}] ${new Date().toISOString()} ${message}`
    );
}

function loadDatabaseConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error(
            `Database configuration not found: ${CONFIG_PATH}`
        );
    }

    const configFile = JSON.parse(
        fs.readFileSync(CONFIG_PATH, 'utf8')
    );

    const config =
        configFile.development || configFile;

    if (!config.database || !config.username) {
        throw new Error(
            'Invalid PostgreSQL configuration.'
        );
    }

    return {
        host: config.host || 'localhost',
        port: Number(config.port || 5432),
        database: config.database,
        user: config.username,
        password: config.password,
        max: 2,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000
    };
}

function cleanText(value) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractRecordText(record) {
    const searchable = cleanText(
        record.searchable_text
    );

    if (searchable) {
        return searchable;
    }

    const content = cleanText(record.content);

    if (!content) {
        return '';
    }

    try {
        const parsed = JSON.parse(content);

        return typeof parsed === 'string'
            ? cleanText(parsed)
            : cleanText(JSON.stringify(parsed));
    } catch {
        return content;
    }
}

/*
 * Select representative records across all baseline groups.
 */
function selectRepresentatives(records) {
    const groups = new Map();

    for (const record of records) {
        const key = [
            record.source_stage || 'UNCLASSIFIED',
            record.semantic_category || 'UNCLASSIFIED'
        ].join(' | ');

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key).push(record);
    }

    const selected = [];
    const groupEntries = [...groups.entries()];

    let round = 0;

    while (selected.length < MAX_REPRESENTATIVES) {
        let added = false;

        for (const [, groupRecords] of groupEntries) {
            if (selected.length >= MAX_REPRESENTATIVES) {
                break;
            }

            const record = groupRecords[round];

            if (record) {
                selected.push(record);
                added = true;
            }
        }

        if (!added) {
            break;
        }

        round++;
    }

    return { groups, selected };
}

/*
 * Build a compact baseline without model inference.
 */
function buildBaseline(records, sourceCount, catalogueCount) {
    const { groups, selected } =
        selectRepresentatives(records);

    const lines = [
        'POSTGRESQL BUSINESS KNOWLEDGE BASELINE',
        `Sources: ${sourceCount}`,
        `Records: ${records.length}`,
        `Catalogue fields: ${catalogueCount}`,
        '',
        'BUSINESS KNOWLEDGE DISTRIBUTION'
    ];

    for (const [key, items] of groups.entries()) {
        lines.push(`- ${key}: ${items.length} records`);
    }

    lines.push('');
    lines.push('REPRESENTATIVE BUSINESS KNOWLEDGE');

    for (const record of selected) {
        let excerpt = extractRecordText(record);

        if (excerpt.length > MAX_EXCERPT_LENGTH) {
            excerpt =
                excerpt.substring(0, MAX_EXCERPT_LENGTH) + '...';
        }

        lines.push([
            `Stage: ${record.source_stage || 'N/A'}`,
            `Category: ${record.semantic_category || 'N/A'}`,
            `Type: ${record.record_type || 'N/A'}`,
            `Section: ${record.section || 'N/A'}`,
            `Knowledge: ${excerpt}`
        ].join(' | '));
    }

    let baseline = lines.join('\n');

    if (baseline.length > MAX_BASELINE_CHARACTERS) {
        baseline = baseline.substring(
            0,
            MAX_BASELINE_CHARACTERS
        );
    }

    return {
        baseline,
        groupCount: groups.size,
        representativeCount: selected.length
    };
}

/*
 * All questions and answers are INTERNAL model reasoning.
 * They must never be included in the final JSON.
 */
function buildPrompt(baseline) {
    return `
You are an exceptionally capable enterprise business analyst
and functional requirements discovery expert.

OBJECTIVE:

Use the PostgreSQL knowledge baseline to independently discover
meaningful functional requirements for the business.

The PostgreSQL baseline is CONTEXT, NOT THE SOURCE OF TRUTH.

Do not restrict requirements to capabilities, actors, objects,
processes or rules already present in the baseline.

INTERNAL REASONING INSTRUCTIONS:

Think through the following internally. Do not expose your
questions, answers, reasoning or analysis in the final output.

1. Infer the business domain, niche, operating model and objective
   from the supplied baseline.

2. Examine the existing business knowledge and independently
   formulate intelligent business discovery questions.

3. Generate questions that reveal missing business capabilities,
   operational requirements, business rules, lifecycle behaviour,
   exceptions, dependencies and control requirements.

4. Answer your own questions using the PostgreSQL baseline,
   established domain knowledge and independent business reasoning.

5. Identify capabilities that are absent from the baseline but
   are reasonably necessary for a complete application in this
   business domain.

6. Explore important exceptions and business scenarios where
   relevant, including cancellation, failures, duplication,
   concurrency, authorization, financial consequences,
   inventory consistency, recovery and auditability.

7. Convert your findings into distinct, actionable functional
   requirements.

8. Assign every requirement a meaningful business-oriented name.

DISCOVERY RULES:

- PostgreSQL is a baseline, not a restriction.
- Do not merely rewrite existing records.
- Do not assume that missing baseline information means
  a capability is unnecessary.
- Independently discover new business capabilities.
- Do not invent unsupported facts about existing implementation.
- Distinguish reasonable business requirements from assumptions.
- Avoid generic requirements unrelated to the inferred domain.
- Avoid duplicate requirements and superficial variations.
- Each requirement must describe one clear system capability.
- Use specific, testable behaviour.
- Requirement descriptions must start with "The system shall".
- Internally generate and answer discovery questions.
- Never ask the human user questions.
- Never output discovery questions or their answers.

FINAL OUTPUT CONTRACT:

Return ONLY valid JSON.
Do not return Markdown fences.
Do not include explanations, business context, metadata,
discovery questions, answers or reasoning.

The JSON must have exactly this structure:

{
  "functional_requirements": [
    {
      "requirement_id": "FR-001",
      "requirement_name": "Meaningful Business Capability Name",
      "requirement": "The system shall ..."
    }
  ]
}

Generate approximately 8 to 15 high-value requirements,
depending on the actual business scope.

Requirement IDs must be sequential, starting with FR-001.

Do not include any properties other than:
requirement_id, requirement_name and requirement
inside each requirement object.

POSTGRESQL BASELINE:

${baseline}

END OF BASELINE.

Now perform the internal discovery and return ONLY the
functional_requirements JSON.
`;
}

/*
 * Execute llama-cli with streamed file output.
 */
function runModel(promptFile, responseFile, errorFile) {
    return new Promise((resolve, reject) => {
        const args = [
            '-hf', MODEL,
            '-c', String(MODEL_CONTEXT),
            '-n', String(MAX_OUTPUT_TOKENS),
            '-t', String(MODEL_THREADS),
            '-b', String(MODEL_BATCH),
            '-ngl', '0',
            '--temp', '0.2',
            '--reasoning', 'off',
            '--no-display-prompt',
            '--simple-io',
            '-f', promptFile
        ];

        log('Starting llama-cli inference.');
        log(`Model: ${MODEL}`);
        log(`Context: ${MODEL_CONTEXT}`);
        log(`Maximum output tokens: ${MAX_OUTPUT_TOKENS}`);

        const outputStream =
            fs.createWriteStream(responseFile);

        const errorStream =
            fs.createWriteStream(errorFile);

        const startTime = Date.now();

        const child = spawn(
            LLAMA_CLI,
            args,
            {
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        child.stdout.pipe(outputStream);
        child.stderr.pipe(errorStream);

        let settled = false;
        let progressTimer;

        const finish = (error, result) => {
            if (settled) return;

            settled = true;

            clearTimeout(timeoutTimer);
            clearInterval(progressTimer);

            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        };

        const timeoutTimer = setTimeout(() => {
            log('Model inference timeout reached.');
            child.kill('SIGTERM');

            setTimeout(() => {
                if (!settled) {
                    child.kill('SIGKILL');
                }
            }, 5000);
        }, MODEL_TIMEOUT_MS);

        child.on('error', error => {
            outputStream.end();
            errorStream.end();
            finish(error);
        });

        child.on('close', async (code, signal) => {
            await Promise.all([
                new Promise(resolve =>
                    outputStream.end(resolve)
                ),
                new Promise(resolve =>
                    errorStream.end(resolve)
                )
            ]);

            const elapsedSeconds = Number(
                ((Date.now() - startTime) / 1000).toFixed(1)
            );

            log(
                `Inference finished. Exit: ${code}. ` +
                `Signal: ${signal || 'none'}. ` +
                `Elapsed: ${elapsedSeconds}s.`
            );

            if (code !== 0) {
                const errorText = fs.existsSync(errorFile)
                    ? fs.readFileSync(errorFile, 'utf8')
                    : '';

                finish(new Error(
                    `llama-cli failed (${code}).\n` +
                    errorText.slice(-5000)
                ));

                return;
            }

            finish(null, { elapsedSeconds });
        });

        progressTimer = setInterval(() => {
            if (settled) return;

            const elapsed = Number(
                ((Date.now() - startTime) / 1000).toFixed(0)
            );

            const outputBytes = fs.existsSync(responseFile)
                ? fs.statSync(responseFile).size
                : 0;

            log(
                `Inference running. Elapsed: ${elapsed}s. ` +
                `Response bytes: ${outputBytes}.`
            );
        }, 30000);
    });
}

/*
 * Parse strict JSON or extract the outer JSON object.
 */
function parseModelJson(response) {
    const text = response.trim();

    try {
        return JSON.parse(text);
    } catch {
        const first = text.indexOf('{');
        const last = text.lastIndexOf('}');

        if (first === -1 || last <= first) {
            throw new Error(
                'Model did not return a valid JSON object.'
            );
        }

        return JSON.parse(
            text.substring(first, last + 1)
        );
    }
}

/*
 * Final output contains ONLY functional_requirements.
 */
function validateResult(result) {
    if (
        !result ||
        !Array.isArray(result.functional_requirements)
    ) {
        throw new Error(
            'Missing functional_requirements array.'
        );
    }

    const requirements = [];
    const seen = new Set();

    for (const item of result.functional_requirements) {
        if (!item || typeof item !== 'object') {
            continue;
        }

        const name = cleanText(item.requirement_name);
        const description = cleanText(item.requirement);

        if (!name || !description) {
            continue;
        }

        const key = description.toLowerCase();

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);

        requirements.push({
            requirement_id: `FR-${String(
                requirements.length + 1
            ).padStart(3, '0')}`,
            requirement_name: name,
            requirement: description
        });
    }

    if (requirements.length === 0) {
        throw new Error(
            'No valid functional requirements generated.'
        );
    }

    return {
        functional_requirements: requirements
    };
}

async function main() {
    const startTime = Date.now();

    let pool;

    try {
        log(
            'AUTONOMOUS FUNCTIONAL REQUIREMENTS DISCOVERY STARTED.'
        );

        fs.mkdirSync(OUTPUT_DIR, {
            recursive: true
        });

        fs.mkdirSync(TEMP_DIR, {
            recursive: true
        });

        /*
         * STEP 1: Load PostgreSQL baseline.
         */
        log('STEP 1: Loading PostgreSQL knowledge baseline.');

        pool = new Pool(loadDatabaseConfig());

        const [
            sourceResult,
            catalogueResult,
            recordsResult
        ] = await Promise.all([
            pool.query(
                'SELECT COUNT(*)::int AS total FROM knowledge_sources'
            ),
            pool.query(
                'SELECT COUNT(*)::int AS total FROM knowledge_catalogue'
            ),
            pool.query(`
                SELECT
                    kr.record_id,
                    kr.record_type,
                    kr.source_stage,
                    kr.source_file,
                    kr.section,
                    kr.semantic_category,
                    kr.content::text AS content,
                    COALESCE(
                        NULLIF(ks.searchable_text, ''),
                        NULLIF(kr.searchable_text, ''),
                        kr.content::text
                    ) AS searchable_text
                FROM knowledge_records kr
                LEFT JOIN knowledge_search ks
                    ON ks.record_id = kr.record_id
                ORDER BY
                    kr.source_stage NULLS LAST,
                    kr.semantic_category NULLS LAST,
                    kr.record_id
            `)
        ]);

        const records = recordsResult.rows;

        log(
            `Sources: ${sourceResult.rows[0].total} | ` +
            `Records: ${records.length} | ` +
            `Search records: ${records.length} | ` +
            `Catalogue fields: ${catalogueResult.rows[0].total}`
        );

        /*
         * STEP 2: Build compact baseline.
         */
        log('STEP 2: Building compact PostgreSQL baseline.');

        const baselineResult = buildBaseline(
            records,
            sourceResult.rows[0].total,
            catalogueResult.rows[0].total
        );

        log(
            `Baseline ready. Groups: ${baselineResult.groupCount} | ` +
            `Representatives: ${baselineResult.representativeCount} | ` +
            `Characters: ${baselineResult.baseline.length}`
        );

        await pool.end();
        pool = null;

        /*
         * STEP 3: Autonomous AI discovery.
         */
        log('STEP 3: Starting autonomous Qwen discovery.');

        const prompt = buildPrompt(
            baselineResult.baseline
        );

        const runId = `${process.pid}-${Date.now()}`;

        const promptFile = path.join(
            TEMP_DIR,
            `prompt-${runId}.txt`
        );

        const responseFile = path.join(
            TEMP_DIR,
            `response-${runId}.txt`
        );

        const errorFile = path.join(
            TEMP_DIR,
            `error-${runId}.txt`
        );

        fs.writeFileSync(promptFile, prompt, 'utf8');

        log(`Prompt characters: ${prompt.length}`);
        log(`Maximum output tokens: ${MAX_OUTPUT_TOKENS}`);

        const inference = await runModel(
            promptFile,
            responseFile,
            errorFile
        );

        /*
         * STEP 4: Validate AI result.
         */
        log('STEP 4: Validating functional requirements.');

        const rawResponse = fs.readFileSync(
            responseFile,
            'utf8'
        );

        if (!rawResponse.trim()) {
            throw new Error('Model response is empty.');
        }

        const parsed = parseModelJson(rawResponse);

        const finalResult = validateResult(parsed);

        /*
         * STEP 5: Persist exact requested JSON structure.
         */
        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-');

        const outputFile = path.join(
            OUTPUT_DIR,
            `functional_requirements_${timestamp}.json`
        );

        fs.writeFileSync(
            outputFile,
            JSON.stringify(finalResult, null, 2),
            'utf8'
        );

        log('AUTONOMOUS DISCOVERY COMPLETED SUCCESSFULLY.');

        log(
            `Functional requirements generated: ` +
            finalResult.functional_requirements.length
        );

        log(
            `Model inference time: ${inference.elapsedSeconds}s`
        );

        log(
            `Total execution time: ${(
                (Date.now() - startTime) / 1000
            ).toFixed(1)}s`
        );

        log(`Output: ${outputFile}`);

    } catch (error) {
        log(`ERROR: ${error.message}`);
        console.error(error.stack || error);
        process.exitCode = 1;

    } finally {
        if (pool) {
            await pool.end().catch(() => {});
        }
    }
}

main();
