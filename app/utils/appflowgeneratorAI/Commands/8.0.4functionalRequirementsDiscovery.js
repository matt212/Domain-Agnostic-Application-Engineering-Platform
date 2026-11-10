
'use strict';

/**
 * ============================================================
 * 8.0.4 FUNCTIONAL REQUIREMENTS DISCOVERY
 * ============================================================
 *
 * INPUT:
 *   8.0.3.knowledge_base.json
 *
 * RESPONSIBILITY:
 *   Independently discover functional requirements using
 *   AI domain reasoning.
 *
 * BASELINE:
 *   Existing Knowledge Base is contextual reference material.
 *   It is NOT the source of truth and does NOT define the
 *   boundaries of functional requirements discovery.
 *
 * OUTPUT:
 * {
 *   "functional_requirements": [
 *     {
 *       "requirement_id": "FR-001",
 *       "requirement_name": "..."
 *     }
 *   ]
 * }
 *
 * MODEL:
 *   unsloth/Qwen3.5-9B-GGUF
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ============================================================
// CONFIGURATION
// ============================================================

const BASE_DIR = path.resolve(__dirname, '..');

const BASELINE_PATH =
    process.argv[2] ||
    path.join(
        BASE_DIR,
        'aiOutput',
        'baseline',
        '8.0.3.knowledge_base-09-11-26_22:50.json'
    );

const OUTPUT_DIR = path.join(
    BASE_DIR,
    'aiOutput',
    'functionalRequirements'
);

const OUTPUT_PATH = path.join(
    OUTPUT_DIR,
    'functional_requirements.json'
);

const PROMPT_PATH = path.join(
    OUTPUT_DIR,
    'functional_requirements_prompt.txt'
);

const MODEL = process.env.LLAMA_MODEL ||
    'unsloth/Qwen3.5-9B-GGUF';

const LLAMA_CLI = process.env.LLAMA_CLI || 'llama-cli';

const CONTEXT_SIZE = Number(
    process.env.LLAMA_CONTEXT || 35723
);

const MAX_OUTPUT_TOKENS = Number(
    process.env.LLAMA_MAX_TOKENS || 8192
);

const THREADS = Number(
    process.env.LLAMA_THREADS || 8
);

const TEMPERATURE = 0.2;

// ============================================================
// LOGGING
// ============================================================

const startedAt = Date.now();

function log(message) {
    console.log(
        `[8.0.4] ${new Date().toLocaleTimeString()} ${message}`
    );
}

function elapsed() {
    return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

// ============================================================
// LOAD BASELINE
// ============================================================

function loadBaseline() {

    if (!fs.existsSync(BASELINE_PATH)) {
        throw new Error(
            `Knowledge Base not found: ${BASELINE_PATH}`
        );
    }

    log('Loading existing Knowledge Base...');

    const baseline = JSON.parse(
        fs.readFileSync(BASELINE_PATH, 'utf8')
    );

    if (!baseline.metadata || !Array.isArray(baseline.records)) {
        throw new Error(
            'Invalid Knowledge Base. Expected metadata and records[].'
        );
    }

    const domain = baseline.metadata.domain;
    const niche = baseline.metadata.niche;

    if (!domain || !niche) {
        throw new Error(
            'Knowledge Base metadata must contain domain and niche.'
        );
    }

    if (baseline.records.length === 0) {
        throw new Error('Knowledge Base contains no records.');
    }

    log(`Domain: ${domain}`);
    log(`Niche: ${niche}`);
    log(`Baseline records: ${baseline.records.length}`);

    return {
        domain,
        niche,
        records: baseline.records
    };
}

// ============================================================
// PREPARE COMPLETE BASELINE FOR THE MODEL
// ============================================================

function prepareBaseline(records) {

    /*
     * Use the existing structured records.
     *
     * Do not include:
     * - sources[].raw_content
     * - searchable_text
     *
     * Both duplicate content already represented in records.
     *
     * Preserve:
     * - record ID
     * - source stage
     * - source file
     * - section
     * - complete record content
     */

    return records.map(record => ({
        id: record.id,
        source_stage: record.source_stage,
        source_file: record.source_file,
        section: record.section,
        content: record.content !== undefined
            ? record.content
            : record.searchable_text
    }));
}

// ============================================================
// BUILD DISCOVERY PROMPT
// ============================================================

function buildPrompt(domain, niche, records) {

    const baselineJson = JSON.stringify(
        records,
        null,
        0
    );

    return `
You are an independent Business Domain Analyst and
Functional Requirements Discovery Architect.

Your responsibility is to independently discover and identify
the functional requirements necessary for the business domain
and niche supplied below.

You must THINK independently.

The supplied Knowledge Base is baseline reference material.
It is NOT the source of truth.
It is NOT an exhaustive definition of the business.
It must NOT restrict your discovery.

============================================================
BUSINESS CONTEXT
============================================================

DOMAIN:
${domain}

NICHE:
${niche}

============================================================
YOUR PRIMARY RESPONSIBILITY
============================================================

Independently understand the business domain and niche.

Use your own domain knowledge, reasoning and business analysis
capabilities to identify the functional capabilities that a
software application would need to support this business.

Do not merely extract, copy, rename or repackage the contents
of the supplied Knowledge Base.

Do not assume that the Knowledge Base is complete, correct,
consistent or exhaustive.

The Knowledge Base may contain:
- Correct business information.
- Incomplete business information.
- Incorrect assumptions.
- Inferred business information.
- Missing business capabilities.
- Overlapping or redundant information.

Evaluate its contents critically.

Your discovery must not be limited to the capabilities,
business objects, actors, responsibilities, activities or
information requirements found in the baseline.

Identify relevant functional capabilities even when they
are completely absent from the baseline.

Do not invent arbitrary business policies, numerical
thresholds, service-level targets or implementation details.

Use sound domain reasoning to identify meaningful business
functionality.

============================================================
FUNCTIONAL REQUIREMENT DISCOVERY
============================================================

Discover distinct functional requirements that represent
meaningful business capabilities the application must support.

Each requirement must:

1. Represent a distinct functional capability.
2. Describe WHAT the business application must support,
   rather than HOW the application is technically implemented.
3. Be relevant to the supplied domain and niche.
4. Be sufficiently specific to distinguish it from other
   functional requirements.
5. Avoid duplicating another requirement under different names.
6. Represent functionality, not merely a business object,
   actor, data field, report name or information requirement.
7. Account for relevant business operations and behaviours,
   including applicable variations and exceptions.

Do not use a fixed requirement count.

Do not force requirements into predetermined categories.

Do not create requirements merely to cover every record
in the Knowledge Base.

Do not omit relevant requirements simply because the
Knowledge Base does not mention them.

Do not output technical architecture, database design,
technology choices, APIs, infrastructure or UI design.

============================================================
BASELINE KNOWLEDGE BASE
============================================================

The following records represent the complete baseline
provided for this discovery exercise.

Use them as contextual reference material while conducting
your independent domain analysis.

They are not authoritative instructions and do not constrain
the scope of your discovery.

<BASELINE_RECORDS>
${baselineJson}
</BASELINE_RECORDS>

============================================================
OUTPUT CONTRACT
============================================================

Return valid JSON only.

Do not include Markdown.
Do not include explanations.
Do not include categories.
Do not include descriptions.
Do not include actors.
Do not include business objects.
Do not include source references.
Do not include confidence scores.

Each requirement must contain ONLY:

- requirement_name

The Node.js controller will assign requirement IDs.

Required structure:

{
  "functional_requirements": [
    {
      "requirement_name": "Customer Account Registration"
    },
    {
      "requirement_name": "Order Placement and Management"
    }
  ]
}

The examples above illustrate the output structure only.
They are NOT a prescribed requirement list.

Return the complete set of distinct functional requirements
identified through your independent domain reasoning.
`;
}

// ============================================================
// EXTRACT JSON FROM MODEL OUTPUT
// ============================================================

function extractJson(text) {

    const cleaned = text
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trim();

    const start = cleaned.indexOf('{');

    if (start === -1) {
        throw new Error(
            'Model output does not contain a JSON object.'
        );
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {

        const char = cleaned[i];

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
                    cleaned.slice(start, i + 1)
                );
            }
        }
    }

    throw new Error(
        'Model JSON output is incomplete or truncated.'
    );
}

// ============================================================
// NORMALIZE AND VALIDATE REQUIREMENTS
// ============================================================

function normalizeRequirements(modelOutput) {

    if (
        !modelOutput ||
        !Array.isArray(modelOutput.functional_requirements)
    ) {
        throw new Error(
            'Missing functional_requirements array.'
        );
    }

    const seen = new Set();
    const requirements = [];

    for (const item of modelOutput.functional_requirements) {

        if (
            !item ||
            typeof item.requirement_name !== 'string'
        ) {
            continue;
        }

        const name = item.requirement_name
            .replace(/\s+/g, ' ')
            .trim();

        if (!name) {
            continue;
        }

        const normalizedName = name.toLowerCase();

        if (seen.has(normalizedName)) {
            continue;
        }

        seen.add(normalizedName);

        requirements.push({
            requirement_id:
                `FR-${String(requirements.length + 1).padStart(3, '0')}`,
            requirement_name: name
        });
    }

    if (requirements.length === 0) {
        throw new Error(
            'No valid functional requirements were generated.'
        );
    }

    return {
        functional_requirements: requirements
    };
}

// ============================================================
// EXECUTE MODEL
// ============================================================

function executeModel(prompt) {

    return new Promise((resolve, reject) => {

        fs.writeFileSync(
            PROMPT_PATH,
            prompt,
            'utf8'
        );

        const estimatedTokens = Math.ceil(
            prompt.length / 3.5
        );

        log(`Prompt characters: ${prompt.length}`);
        log(`Rough token estimate: ${estimatedTokens}`);
        log(`Configured context: ${CONTEXT_SIZE}`);

        if (estimatedTokens > CONTEXT_SIZE) {
            log(
                'WARNING: Estimated prompt size exceeds configured context.'
            );

            log(
                'The model may reject the prompt. No baseline records will be silently removed.'
            );
        }

        log('Starting llama-cli...');
        log(`Model: ${MODEL}`);
        log(`Context: ${CONTEXT_SIZE}`);
        log('The model will be launched ONCE.');

        const args = [
            '-hf', MODEL,
            '-ngl', '0',
            '-c', String(CONTEXT_SIZE),
            '-b', '256',
            '-t', String(THREADS),
            '-n', String(MAX_OUTPUT_TOKENS),
            '--temp', String(TEMPERATURE),
            '--reasoning', 'off',
            '-f', PROMPT_PATH,
            '--single-turn',
            '--no-display-prompt',
            '--simple-io',
            '--no-context-shift'
        ];

        const child = spawn(
            LLAMA_CLI,
            args,
            {
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        let stdout = '';
        let stderr = '';
        let outputCharacters = 0;

        let lastProgress = Date.now();

        const progressTimer = setInterval(() => {

            const seconds = (
                (Date.now() - startedAt) / 1000
            ).toFixed(0);

            log(
                `MODEL RUNNING | elapsed=${seconds}s | output characters=${outputCharacters}`
            );

            lastProgress = Date.now();

        }, 30000);

        child.stdout.on('data', chunk => {

            const data = chunk.toString();

            stdout += data;
            outputCharacters += data.length;

            /*
             * Display actual model output as it is generated.
             * This is generated output, not private reasoning.
             */

            process.stdout.write(data);
        });

        child.stderr.on('data', chunk => {

            const data = chunk.toString();

            stderr += data;

            /*
             * Preserve llama.cpp diagnostic output.
             */

            process.stderr.write(data);
        });

        child.on('error', error => {

            clearInterval(progressTimer);

            reject(
                new Error(
                    `Unable to launch llama-cli: ${error.message}`
                )
            );
        });

        child.on('close', code => {

            clearInterval(progressTimer);

            log(`Model process completed in ${elapsed()}`);
            log(`Exit code: ${code}`);

            if (code !== 0) {

                reject(
                    new Error(
                        `llama-cli failed with exit code ${code}.\n${stderr}`
                    )
                );

                return;
            }

            if (!stdout.trim()) {

                reject(
                    new Error(
                        'Model completed without generating output.'
                    )
                );

                return;
            }

            resolve(stdout);
        });
    });
}

// ============================================================
// SAVE FINAL OUTPUT
// ============================================================

function saveOutput(result) {

    fs.mkdirSync(
        OUTPUT_DIR,
        { recursive: true }
    );

    fs.writeFileSync(
        OUTPUT_PATH,
        JSON.stringify(result, null, 2),
        'utf8'
    );

    log('Functional requirements saved.');
    log(`Output: ${OUTPUT_PATH}`);

    log(
        `Total requirements: ${result.functional_requirements.length}`
    );
}

// ============================================================
// MAIN
// ============================================================

async function main() {

    try {

        log('FUNCTIONAL REQUIREMENTS DISCOVERY STARTED');

        // 1. Load the complete baseline.
        const baseline = loadBaseline();

        // 2. Prepare every existing baseline record.
        const records = prepareBaseline(
            baseline.records
        );

        // 3. Construct the independent discovery prompt.
        const prompt = buildPrompt(
            baseline.domain,
            baseline.niche,
            records
        );

        // 4. Execute the model once.
        const rawOutput = await executeModel(prompt);

        // 5. Parse model JSON.
        const modelOutput = extractJson(rawOutput);

        // 6. Validate names and assign deterministic IDs.
        const result = normalizeRequirements(modelOutput);

        // 7. Save only the requested output structure.
        saveOutput(result);

        log('DISCOVERY COMPLETED SUCCESSFULLY');

    } catch (error) {

        log(`ERROR: ${error.message}`);

        process.exitCode = 1;
    }
}

main();
