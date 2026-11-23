
'use strict';

/*

 GGML_METAL_TENSOR_ENABLE=1 \
node app/utils/appflowgeneratorAI/Commands/8.0.14.1.userStoriesAssestment.js


 * USER STORY DIMENSION GENERATOR
 *
 * EXECUTION:
 *
 * async function startScript()
 *
 *   let dbConnection = await connectToPostgreSQL();
 *
 *   while (true) {
 *
 *       let userStoryId = await findNextUserStory(dbConnection);
 *
 *       if (!userStoryId) break;
 *
 *       let originalStory = await retrieveUserStory(
 *           dbConnection, userStoryId
 *       );
 *
 *       let aiInput = prepareAIInput(originalStory);
 *
 *       let prompt = buildPrompt(aiInput);
 *
 *       let qwenOutput = await runQwen(prompt, userStoryId);
 *
 *       let rawResponse = receiveQwenResponse(qwenOutput);
 *
 *       let generatedJSON = extractJSON(rawResponse);
 *
 *       let validatedJSON = validateJSON(generatedJSON);
 *
 *       let newStoryVersion = prepareNewStoryVersion(
 *           originalStory, validatedJSON
 *       );
 *
 *       let verifiedStory = verifyCopiedStory(
 *           newStoryVersion, originalStory
 *       );
 *
 *       let savedVersion = await saveNewVersion(
 *           dbConnection, verifiedStory, validatedJSON
 *       );
 *
 *       let jsonArtifact = writeJSONArtifact(
 *           userStoryId, savedVersion.version_number, validatedJSON
 *       );
 *
 *   }
 *
 *   let finished = await finishScript(dbConnection);
 *
 *
 * TERMINAL OUTPUT:
 * Generated dimensions only.
 */

// ============================================================
// 1. IMPORTS
// ============================================================

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const crypto = require('crypto');

// ============================================================
// 2. CONFIGURATION
// ============================================================

const ROOT = process.cwd();

const MODEL =
    process.env.MODEL_NAME ||
    'unsloth/Qwen3.5-9B-GGUF:Q4_K_M';

const LLAMA_CLI =
    process.env.LLAMA_CLI_PATH ||
    path.resolve(
        ROOT,
        '../llama-metal/build/bin/llama-completion'
    );

const DB_CONFIG_PATH = path.join(
    ROOT,
    'app/config/config.json'
);

const OUTPUT_DIR = path.join(
    ROOT,
    'app/utils/appflowgeneratorAI/aiOutput'
);

const UNIT_DIR = path.join(OUTPUT_DIR, 'units');
const TEMP_DIR = path.join(OUTPUT_DIR, 'temp');

const MAX_PROMPT_CHARACTERS = 7000;
const MAX_OUTPUT_TOKENS = 4750;

const CONTEXT_SIZE = 5096;
const MODEL_THREADS = 8;
const MODEL_GPU_LAYERS = 20;
const MODEL_BATCH_SIZE = 128;
const MODEL_UBATCH_SIZE = 128;

const MODEL_TIMEOUT_MS = 600000;
const MODEL_KILL_GRACE_MS = 6000;


// ============================================================
// 3. CONFIGURABLE OUTPUT DIMENSIONS
// ============================================================

const DIMENSIONS = [
    {
        key: 'given_when_then',
        name: 'Given-When-Then',
        enabled: true,
        databaseColumn: 'given_when_then',

        instructions:
            'Generate distinct, concrete and testable Given-When-Then scenarios. Each scenario must contain exactly given, when and then.',

        schema: [
            {
                given: 'Starting condition',
                when: 'Triggering event',
                then: 'Expected observable result'
            }
        ],

        validate(value) {
            if (!Array.isArray(value) || value.length === 0) {
                throw new Error(
                    'At least one GWT scenario is required.'
                );
            }

            for (const [index, scenario] of value.entries()) {
                if (
                    !scenario ||
                    typeof scenario !== 'object' ||
                    Array.isArray(scenario)
                ) {
                    throw new Error(
                        `GWT scenario ${index + 1} must be an object.`
                    );
                }

                const keys = Object.keys(scenario).sort();

                if (
                    keys.length !== 3 ||
                    keys[0] !== 'given' ||
                    keys[1] !== 'then' ||
                    keys[2] !== 'when'
                ) {
                    throw new Error(
                        `GWT scenario ${index + 1} must contain exactly given, when and then.`
                    );
                }

                validateText(scenario.given, 'GWT given');
                validateText(scenario.when, 'GWT when');
                validateText(scenario.then, 'GWT then');
            }
        }
    },

    {
        key: 'success_criteria',
        name: 'Success Criteria',
        enabled: true,
        databaseColumn: 'success_criteria',

        instructions:
            'Generate observable and specific success criteria. Each criterion must be a plain text string.',

        schema: [
            'Observable success criterion'
        ],

        validate(value) {
            if (!Array.isArray(value) || value.length === 0) {
                throw new Error(
                    'At least one success criterion is required.'
                );
            }

            for (const [index, criterion] of value.entries()) {
                validateText(
                    criterion,
                    `Success criterion ${index + 1}`
                );
            }
        }
    }
];


// ============================================================
// 4. ORIGINAL USER STORY COLUMNS
// ============================================================

const BASE_STORY_COLUMNS = [
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
    'non_functional_requirements',
    'dependencies',
    'constraints',
    'priority',
    'estimation',
    'source_references',
    'status'
];

const BASE_JSONB_COLUMNS = new Set([
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
    'non_functional_requirements',
    'dependencies',
    'constraints',
    'source_references'
]);


// ============================================================
// 5. GENERAL HELPERS
// ============================================================

function enabledDimensions() {
    return DIMENSIONS.filter(dimension => dimension.enabled);
}


function validateDimensionConfiguration() {
    const enabled = enabledDimensions();

    if (enabled.length === 0) {
        throw new Error('No output dimensions are enabled.');
    }

    const keys = new Set();

    for (const dimension of enabled) {
        if (
            !dimension.key ||
            !dimension.databaseColumn ||
            typeof dimension.validate !== 'function'
        ) {
            throw new Error(
                'Every enabled dimension requires a key, databaseColumn and validate function.'
            );
        }

        if (keys.has(dimension.key)) {
            throw new Error(
                `Duplicate dimension key: ${dimension.key}`
            );
        }

        keys.add(dimension.key);
    }

    return enabled;
}


function getStoryColumns() {
    return [
        ...BASE_STORY_COLUMNS,
        ...enabledDimensions().map(d => d.databaseColumn)
    ];
}


function getJSONBColumns() {
    return new Set([
        ...BASE_JSONB_COLUMNS,
        ...enabledDimensions().map(d => d.databaseColumn)
    ]);
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


function normalizeText(value) {
    return String(value ?? '')
        .replace(/\u0000/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}


function toCompactText(value) {
    if (value === null || value === undefined) return '';

    if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return normalizeText(value);
    }

    if (Array.isArray(value)) {
        return value
            .map(toCompactText)
            .filter(Boolean)
            .join(', ');
    }

    if (isPlainObject(value)) {
        return Object.entries(value)
            .map(([key, item]) => {
                const text = toCompactText(item);
                return text ? `${key}: ${text}` : '';
            })
            .filter(Boolean)
            .join('; ');
    }

    return '';
}


function validateText(value, label) {
    if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.trim() === '...' ||
        /^__.*__$/.test(value.trim())
    ) {
        throw new Error(
            `${label} must contain meaningful, non-empty text.`
        );
    }

    if (value.length > 2000) {
        throw new Error(
            `${label} exceeds 2000 characters.`
        );
    }

    return value;
}


function ensureDirectories() {
    fs.mkdirSync(UNIT_DIR, { recursive: true });
    fs.mkdirSync(TEMP_DIR, { recursive: true });

    return true;
}



async function startScript() {

    let dimensionConfiguration =
        validateDimensionConfiguration();

    let directoriesCreated =
        ensureDirectories();

    let dbConnection =
        await connectToPostgreSQL();

    const MAX_RETRIES = 3;

    try {

        // Repeat for each User Story.

        while (true) {

            // STEP 1: Find next User Story.

            let userStoryId =
                await findNextUserStory(dbConnection);

            if (!userStoryId) {
                break;
            }

            // STEP 2: Retrieve original User Story.

            let originalStory =
                await retrieveUserStory(
                    dbConnection,
                    userStoryId
                );

            // Retry only the current User Story.

            let validatedJSON = null;

            for (
                let attempt = 1;
                attempt <= MAX_RETRIES;
                attempt++
            ) {

                try {

                    // STEP 3: Prepare AI input.

                    let aiInput =
                        prepareAIInput(originalStory);

                    // STEP 4: Build Qwen prompt.
                    
                    let prompt =
                        buildPrompt(aiInput);

                    // STEP 5: Run Qwen.
let generationSeed =
            crypto.randomInt(1, 2147483647);

        console.log(
            `Generation seed: ${generationSeed}`
        );

                    let qwenOutput =
                        await runQwen(
                            prompt,
                            userStoryId,
                            generationSeed
                        );

                    console.log(
                        `Qwen OUTPUT for User Story ${userStoryId}, attempt ${attempt}:`,
                        qwenOutput
                    );

                    // STEP 6: Receive Qwen response.

                    let rawResponse =
                        receiveQwenResponse(qwenOutput);

                    // STEP 7: Extract JSON.

                    let generatedJSON =
                        extractJSON(rawResponse);

                    // STEP 8: Validate generated JSON.

                    validatedJSON =
                        validateJSON(generatedJSON);

                    // Successful validation: stop retrying.

                    if (validatedJSON) {
                        break;
                    }

                } catch (error) {

                    console.error(
                        `User Story ${userStoryId}: Attempt ${attempt}/${MAX_RETRIES} failed:`,
                        error.message
                    );

                    if (attempt === MAX_RETRIES) {
                        throw error;
                    }

                }

                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve =>
                        setTimeout(resolve, 1000)
                    );
                }
            }

            if (!validatedJSON) {
                throw new Error(
                    `Qwen failed to generate valid JSON for User Story ${userStoryId} after ${MAX_RETRIES} attempts.`
                );
            }

            // STEP 9: Prepare new User Story version.

            let newStoryVersion =
                prepareNewStoryVersion(
                    originalStory,
                    validatedJSON
                );

            // STEP 10: Verify copied User Story.

            let verifiedStory =
                verifyCopiedStory(
                    newStoryVersion,
                    originalStory
                );

            // STEP 11: Save new User Story version.

            let savedVersion =
                await saveNewVersion(
                    dbConnection,
                    verifiedStory,
                    validatedJSON
                );

            // STEP 12: Write JSON artifact.

            let jsonArtifact =
                writeJSONArtifact(
                    userStoryId,
                    savedVersion.version_number,
                    validatedJSON
                );

            // STEP 13: Print generated dimensions.

            let printedDimensions =
                printGeneratedDimensions(
                    userStoryId,
                    validatedJSON
                );

            // STEP 14: Repeat for next User Story.

        }

    } finally {

        // Close PostgreSQL connection.

        let finished =
            await finishScript(dbConnection);

    }

    return true;
}

// ============================================================
// 7. CONNECT TO POSTGRESQL
// ============================================================

async function connectToPostgreSQL() {

    if (!fs.existsSync(DB_CONFIG_PATH)) {
        throw new Error(
            `Database configuration not found: ${DB_CONFIG_PATH}`
        );
    }

    let configuration =
        JSON.parse(
            fs.readFileSync(DB_CONFIG_PATH, 'utf8')
        );

    let dbConfig = configuration.development;

    if (!dbConfig) {
        throw new Error(
            'Development database configuration is missing.'
        );
    }

    let dbConnection = new Pool({
        user: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
        host: dbConfig.host,
        port: Number(dbConfig.port),
        max: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    });

    await dbConnection.query('SELECT 1');

    return dbConnection;
}


// ============================================================
// 8. FIND NEXT USER STORY
// ============================================================

async function findNextUserStory(dbConnection) {

    let result = await dbConnection.query(`
        SELECT us.user_story_id
        FROM requirements.user_stories us
        WHERE NOT EXISTS (
            SELECT 1
            FROM requirements.user_story_versions v
            WHERE v.user_story_id = us.user_story_id
              AND v.version_type = 'AI_GENERATED'
        )
        ORDER BY us.user_story_id
        LIMIT 1;
    `);

    let userStoryId =
        result.rows[0]?.user_story_id || null;

    return userStoryId;
}


// ============================================================
// 9. RETRIEVE USER STORY
// ============================================================

async function retrieveUserStory(dbConnection, userStoryId) {

    let result = await dbConnection.query(
        `
        SELECT *
        FROM requirements.user_stories
        WHERE user_story_id = $1;
        `,
        [userStoryId]
    );

    if (result.rows.length !== 1) {
        throw new Error(
            `Expected one User Story for ${userStoryId}.`
        );
    }

    let originalStory = {};

    for (const column of BASE_STORY_COLUMNS) {
        originalStory[column] =
            result.rows[0][column] === undefined
                ? null
                : result.rows[0][column];
    }

    return originalStory;
}


// ============================================================
// 10. PREPARE AI INPUT
// ============================================================

function prepareAIInput(originalStory) {
    
    let aiInput = {
        title: originalStory.user_story_title,
        description: originalStory.user_story_description,
        actors: originalStory.actor,
        objects: originalStory.business_objects,
        rules: originalStory.business_rules,
        existing_scenarios: (originalStory.acceptance_criteria || []).map(item => ({
            given: item.given,
            when: item.when,
            then: item.then
        }))
    };

    return JSON.stringify(aiInput);
}


// ============================================================
// 11. BUILD PROMPT
// ============================================================

function buildPrompt(aiInput) {

    let dimensions = enabledDimensions();

    let dimensionInstructions = dimensions
        .map(dimension =>
            `${dimension.key}: ${dimension.instructions}`
        )
        .join('\n');

    let outputSchema = {};


    for (const dimension of dimensions) {
        outputSchema[dimension.key] = dimension.schema;
    }

//     let fixedPrompt = [
//     'TASK: Assess, validate and improve existing User Story dimensions.',
//     '',
//     'OBJECTIVE:',
//     'Determine whether existing Given/When/Then scenarios and success criteria correctly represent this User Story. Do not regenerate populated dimensions unnecessarily.',
//     '',
//     'ASSESSMENT:',
//     '1. What specific behaviour and scope does the User Story describe?',
//     '2. Which actors, business objects, conditions, triggers, outcomes and business rules are relevant?',
//     '3. Which supplied information is inherited context rather than confirmed story-level behaviour?',
//     '4. Does each existing GWT scenario describe relevant, complete, testable and evidence-supported behaviour?',
//     '5. Are scenarios irrelevant, duplicated, incomplete, unsupported or incorrectly inherited?',
//     '6. Does each success criterion describe a relevant, observable and independently verifiable outcome?',
//     '7. Are success criteria duplicated, unsupported, unrelated or merely restating scenarios?',
//     '8. What genuine scenarios or success criteria are missing and can be derived from available evidence?',
//     '9. Which existing dimensions are adequate, need refinement, are irrelevant or lack sufficient evidence?',
//     '',
//     'DECISION RULES:',
//     'Preserve adequate existing content unchanged.',
//     'Refine only demonstrably incomplete, incorrect or unclear content.',
//     'Add only genuinely missing content supported by evidence.',
//     'Do not carry irrelevant inherited content forward as valid story-level behaviour.',
//     'Do not invent actors, rules, triggers, conditions, actions, outcomes, validations, metrics or thresholds.',
//     'Avoid duplication and maintain consistency between scenarios and success criteria.',
//     'Distinguish this User Story from related requirements and other lifecycle stages.',
//     'When evidence is insufficient, do not fabricate content.',
//     'If existing dimensions are adequate, return them unchanged.',
//     '',
//     'DIMENSION-SPECIFIC INSTRUCTIONS:',
//     dimensionInstructions,
//     '',
//     'OUTPUT:',
//     'Return the complete final assessed dimensions, not a separate regenerated set.',
//     'Return valid JSON only, with exactly the requested root keys and schema. No explanations.',
//     '',
//     'OUTPUT JSON STRUCTURE:',
//     '{"given_when_then":[{"given":"","when":"","then":""}],"success_criteria":[]}',
//     '',
//     'USER STORY BASELINE:'
// ].join('\n');





let fixedPrompt = [
    'ROLE: Principal requirements engineer and solution architect.',
    '',
    'MISSION: Independently reconstruct the current User Story into a complete, implementable and testable specification for the requested dimensions.',
    '',
    'STORY INTENT AND SCOPE: First establish what the current User Story actually requires. The User Story defines the scope. Include only behaviours that directly fulfil its intent or are necessary, evidence-supported conditions for fulfilling it. Do not expand a story into adjacent or independently scoped capabilities merely because they are related.',
    '',
    'EVIDENCE: Use the User Story and relevant supplied context, including actors, objects, relationships, requirements, rules, workflows and constraints. Treat existing baseline content and AI-generated content as evidence, never as authoritative truth or a completeness checklist. Use cross-story evidence only when it genuinely clarifies or supports the current story.',
    '',
    'CONTEXTUAL EVIDENCE CONTROL: Actors, objects, relationships, workflows and examples supplied in the broader context are not automatically participants in the current User Story. Do not turn contextual examples into scenarios, requirements, permissions, actor-object combinations or acceptance conditions. Use a specific actor or object only when the current story or directly relevant evidence establishes its involvement. Preserve generic terminology when the story intentionally describes generic system behaviour.',
    '',
    'DISCOVERY: Identify the actual actions, preconditions, triggers, decisions, rules, constraints and observable outcomes required by the current story. Identify applicable success, alternative, exception, validation, failure and recovery behaviours only when they are within the story scope and supported by evidence.',
    '',
    'SPECIFICITY: Use specific actor names, responsibilities, objects and relationships when they are necessary to express the current story accurately and are supported by evidence. Do not force actor or object enumeration into generic requirements. Never invent identities, relationships, permissions, ownership, assignments, business rules or behaviour.',
    '',
    'EVIDENCE CLASSIFICATION: Distinguish explicitly documented requirements, behaviour logically necessary to fulfil the story, contextual information and unsupported possibilities. Include the first two where applicable. Contextual information may clarify requirements but must not independently create them. Exclude unsupported possibilities.',
    '',
    'NO SPECULATIVE EXPANSION: Do not generate exhaustive actor-object-action combinations, permission matrices, example-based scenarios, assumed technical mechanisms or additional system capabilities unless the current User Story explicitly requires them or directly relevant evidence establishes them.',
    '',
    'GWT: Reconstruct only scenarios necessary to express the distinct behaviours and outcomes within the current story scope. Each scenario must have an explicit GIVEN precondition, WHEN trigger and THEN observable, deterministic outcome. Use the minimum number of scenarios needed for complete coverage. Do not create scenarios merely to enumerate actors, objects, examples, permissions or contextual possibilities.',
    '',
    'SUCCESS CRITERIA: Produce objective, independently verifiable outcomes that establish whether the current User Story has been fulfilled. Cover its applicable functional behaviour, business rules and constraints. Complement GWT scenarios without unnecessary repetition. Do not introduce additional capabilities or quality expectations that belong to separate requirements.',
    '',
    'STORY-LEVEL SCOPE BOUNDARY: Do not absorb adjacent security, auditing, session-management, permission propagation, performance, infrastructure, UI or data-protection requirements merely because they are related to the current story. Include them only when they are explicitly part of the story or necessary and evidence-supported conditions for fulfilling it. Leave independently scoped capabilities to their respective User Stories.',
    '',
    'HANDOFF VALIDATION: Validate the reconstructed GWT and success criteria against the current story intent, scope and relevant evidence. Correct genuine omissions, contradictions, ambiguities and untestable outcomes within that scope. Ensure engineers can determine the behaviour required by this story and QA can determine what to verify and what constitutes passing. Do not use the absence of independently scoped system capabilities as a reason to expand this story.',
    '',
    'STRICT RULES: Neither baseline nor AI-generated content is authoritative. Do not merely assess, preserve or minimally modify existing content. Reconstruct independently. Resolve discoverable ambiguities using relevant evidence, but never invent missing business decisions, rules, permissions, metrics, thresholds or technical behaviour. Completeness means complete coverage of the current story, not exhaustive coverage of the surrounding system.',
    '',
    'ACCEPTANCE: Return the most complete, internally consistent and evidence-supported specification possible within the actual scope of the current User Story. Prefer a small number of precise, meaningful scenarios over unnecessary scenario volume.',
    '',
    'DIMENSION-SPECIFIC INSTRUCTIONS:',
    dimensionInstructions,
    '',
    'OUTPUT: Return complete reconstructed dimensions as valid JSON only, with exactly these root keys and schema:',
    '{"given_when_then":[{"given":"","when":"","then":""}],"success_criteria":[]}',
    '',
    'USER STORY AND AVAILABLE EVIDENCE:'
].join('\n');





let availableCharacters =
    MAX_PROMPT_CHARACTERS - fixedPrompt.length - 1;

if (availableCharacters <= 0) {
    throw new Error(
        `Fixed prompt exceeds character limit. ` +
        `Required: ${fixedPrompt.length + 1}, ` +
        `Maximum: ${MAX_PROMPT_CHARACTERS}`
    );
}

if (aiInput.length > availableCharacters) {
    throw new Error(
        `User Story baseline exceeds available prompt space. ` +
        `Baseline: ${aiInput.length}, ` +
        `Available: ${availableCharacters}, ` +
        `Maximum: ${MAX_PROMPT_CHARACTERS}. ` +
        `Increase MAX_PROMPT_CHARACTERS or reduce fixed instructions.`
    );
}

let prompt = fixedPrompt + '\n' + aiInput;

if (prompt.length > MAX_PROMPT_CHARACTERS) {
    throw new Error(
        `Prompt character limit exceeded: ${prompt.length}/${MAX_PROMPT_CHARACTERS}`
    );
}

return prompt;
}


// ============================================================
// 12. RUN QWEN
// ============================================================


// ============================================================
// 12. RUN QWEN — DETAILED INFERENCE LOGGING
// ============================================================

async function runQwen(prompt, userStoryId,generationSeed) {

    let promptFile = path.join(
        TEMP_DIR,
        `${safeFileName(userStoryId)}_${process.pid}_${Date.now()}.txt`
    );

    let qwenOutput = await new Promise((resolve, reject) => {

        let stdout = '';
        let stderr = '';
        let stderrBuffer = '';

        let gpuLogLines = [];

        let settled = false;
        let timedOut = false;

        let timeout;
        let killTimeout;
        let progressInterval;

        let startedAt = Date.now();
        let firstOutputAt = null;
        let lastOutputAt = null;

        let stdoutChunks = 0;
        let stderrChunks = 0;

        let lastReportedCharacters = 0;

        function elapsed() {
            return (
                (Date.now() - startedAt) / 1000
            ).toFixed(2);
        }

        function qwenLog(message) {
            console.log(
                `[QWEN ${elapsed()}s] ${message}`
            );
        }

        function cleanup() {

            clearTimeout(timeout);
            clearTimeout(killTimeout);
            clearInterval(progressInterval);

            try {
                if (fs.existsSync(promptFile)) {
                    fs.unlinkSync(promptFile);
                }
            } catch (_) {
                // Ignore cleanup errors.
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

            qwenLog('Checking executable...');

            if (!fs.existsSync(LLAMA_CLI)) {
                throw new Error(
                    `llama-completion not found: ${LLAMA_CLI}`
                );
            }

            qwenLog(`Executable: ${LLAMA_CLI}`);
            qwenLog(`Model: ${MODEL}`);
            qwenLog(`Prompt characters: ${prompt.length}`);
            qwenLog(`Context size: ${CONTEXT_SIZE}`);
            qwenLog(`Maximum output tokens: ${MAX_OUTPUT_TOKENS}`);
            qwenLog(`Threads: ${MODEL_THREADS}`);
            qwenLog(`GPU layers requested: ${MODEL_GPU_LAYERS}`);
            qwenLog(`Batch size: ${MODEL_BATCH_SIZE}`);
            qwenLog(`UBatch size: ${MODEL_UBATCH_SIZE}`);
            qwenLog('Reasoning setting: off');

            qwenLog('Writing prompt file...');

            fs.writeFileSync(
                promptFile,
                prompt,
                'utf8'
            );

            let args = [
                '-hf', MODEL,
                '-no-cnv',
                '--verbose',
                '-ngl', String(MODEL_GPU_LAYERS),
                '--device', 'MTL0:AMD Radeon Pro 5300M',
                '--fit', 'off',
                '--single-turn',
                '-c', String(CONTEXT_SIZE),
                '-b', String(MODEL_BATCH_SIZE),
                '-ub', String(MODEL_UBATCH_SIZE),
                '-t', String(MODEL_THREADS),
                '--reasoning', 'off',
                 '-s', String(generationSeed),
                '-n', String(MAX_OUTPUT_TOKENS),
                '-f', promptFile
            ];

            qwenLog('Launching Qwen process...');

            qwenLog(
                `Command arguments: ${args.join(' ')}`
            );

            let child = spawn(LLAMA_CLI, args, {
                cwd: ROOT,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    GGML_METAL_TENSOR_ENABLE: '1'
                }
            });

            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');

            qwenLog(`Process PID: ${child.pid}`);
            qwenLog('Waiting for model output...');

            // --------------------------------------------
            // STDOUT: GENERATED MODEL OUTPUT
            // --------------------------------------------

            child.stdout.on('data', chunk => {

                let now = Date.now();

                stdout += chunk;
                stdoutChunks++;

                if (firstOutputAt === null) {

                    firstOutputAt = now;

                    qwenLog(
                        `FIRST OUTPUT RECEIVED after ${(
                            (now - startedAt) / 1000
                        ).toFixed(2)} seconds`
                    );
                }

                lastOutputAt = now;
            });

            // --------------------------------------------
            // STDERR: CAPTURE EVERYTHING
            // PRINT ONLY GPU ASSIGNMENT/OFFLOAD MESSAGES
            // --------------------------------------------

            child.stderr.on('data', chunk => {

                stderr += chunk;
                stderrChunks++;

                stderrBuffer += chunk;

                let lines = stderrBuffer.split(/\r?\n/);

                stderrBuffer = lines.pop() || '';

                for (const line of lines) {

                    if (
                        /offload|assigned to device|MTL0_Private model buffer/i.test(line)
                    ) {

                        gpuLogLines.push(line);

                        qwenLog(
                            `GPU: ${line.trim()}`
                        );
                    }
                }
            });

            // --------------------------------------------
            // PROCESS CLOSE
            // --------------------------------------------

            child.on('close', (code, signal) => {

                // Process any final stderr line without a newline.
                if (stderrBuffer.trim()) {

                    if (
                        /offload|assigned to device|MTL0_Private model buffer/i.test(stderrBuffer)
                    ) {

                        gpuLogLines.push(stderrBuffer);

                        qwenLog(
                            `GPU: ${stderrBuffer.trim()}`
                        );
                    }
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

                qwenLog(
                    `GPU diagnostic lines captured: ${gpuLogLines.length}`
                );

                qwenLog(
                    `First output delay: ${
                        firstOutputAt
                            ? ((firstOutputAt - startedAt) / 1000).toFixed(2) + ' seconds'
                            : 'No output received'
                    }`
                );

                qwenLog(
                    `Last output received: ${
                        lastOutputAt
                            ? ((Date.now() - lastOutputAt) / 1000).toFixed(2) + ' seconds before close'
                            : 'No output received'
                    }`
                );

                if (timedOut) {

                    finish(
                        new Error(
                            `Qwen timed out after ${MODEL_TIMEOUT_MS} ms.`
                        )
                    );

                    return;
                }

                if (code !== 0) {

                    finish(
                        new Error(
                            `Qwen exited with code ${code}; ` +
                            `signal ${signal || 'none'}. ` +
                            stderr.slice(-3000)
                        )
                    );

                    return;
                }

                if (!stdout.trim()) {

                    finish(
                        new Error(
                            'Qwen returned no output.'
                        )
                    );

                    return;
                }

                qwenLog('Qwen generation completed successfully.');

                finish(null, stdout);
            });

            // --------------------------------------------
            // PERIODIC GENERATION PROGRESS
            // --------------------------------------------

            progressInterval = setInterval(() => {

                let currentCharacters = stdout.length;

                let idleSeconds = lastOutputAt
                    ? ((Date.now() - lastOutputAt) / 1000).toFixed(1)
                    : 'No output yet';

                let newCharacters =
                    currentCharacters - lastReportedCharacters;

                qwenLog(
                    `PROGRESS | Output chars: ${currentCharacters} | ` +
                    `New chars since last check: ${newCharacters} | ` +
                    `Stdout chunks: ${stdoutChunks} | ` +
                    `Idle: ${idleSeconds}s`
                );

                lastReportedCharacters =
                    currentCharacters;

            }, 10000);

            // --------------------------------------------
            // TIMEOUT
            // --------------------------------------------

            timeout = setTimeout(() => {

                if (settled) return;

                timedOut = true;

                qwenLog(
                    `TIMEOUT: Qwen exceeded ${MODEL_TIMEOUT_MS} ms`
                );

                qwenLog('Sending SIGTERM...');

                child.kill('SIGTERM');

                killTimeout = setTimeout(() => {

                    if (!settled) {

                        qwenLog(
                            'Process did not terminate; sending SIGKILL...'
                        );

                        child.kill('SIGKILL');
                    }

                }, MODEL_KILL_GRACE_MS);

            }, MODEL_TIMEOUT_MS);

            // --------------------------------------------
            // PROCESS ERROR
            // --------------------------------------------

            child.on('error', error => {

                qwenLog(
                    `PROCESS ERROR: ${error.message}`
                );

                finish(
                    new Error(
                        `Unable to launch Qwen: ${error.message}`
                    )
                );
            });

        } catch (error) {

            finish(error);
        }

    });

    return qwenOutput;
}


// ============================================================
// 13. RECEIVE QWEN RESPONSE
// ============================================================

function receiveQwenResponse(qwenOutput) {

    if (
        typeof qwenOutput !== 'string' ||
        !qwenOutput.trim()
    ) {
        throw new Error(
            'Qwen returned an empty response.'
        );
    }

    let rawResponse = qwenOutput;

    return rawResponse;
}


// ============================================================
// 14. EXTRACT JSON
// ============================================================

function extractJSON(rawResponse) {

    let cleaned = String(rawResponse)
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<\|[^|]*\|>/g, '')
        .replace(/```(?:json)?/gi, '')
        .trim();

    let candidates = [];

    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < cleaned.length; i++) {

        let char = cleaned[i];

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

                let candidate =
                    cleaned.slice(start, i + 1);

                try {
                    let parsed = JSON.parse(candidate);

                    if (isPlainObject(parsed)) {
                        candidates.push(parsed);
                    }
                } catch (_) {
                    // Ignore invalid candidate.
                }

                start = -1;
            }
        }
    }

    let validCandidates = [];

    for (const candidate of candidates) {

        try {
            validateJSON(candidate);
            validCandidates.push(candidate);

        } catch (_) {
            // Ignore templates and invalid candidates.
        }
    }

    if (validCandidates.length === 0) {
        throw new Error(
            'Qwen did not return valid JSON for the enabled dimensions.'
        );
    }

    let generatedJSON =
        validCandidates[validCandidates.length - 1];

    return generatedJSON;
}


// ============================================================
// 15. VALIDATE JSON
// ============================================================

function validateJSON(generatedJSON) {

    if (!isPlainObject(generatedJSON)) {
        throw new Error(
            'Generated output must be a JSON object.'
        );
    }

    let dimensions = enabledDimensions();

    let expectedKeys = dimensions
        .map(d => d.key)
        .sort();

    let actualKeys = Object.keys(generatedJSON).sort();

    if (
        expectedKeys.length !== actualKeys.length ||
        expectedKeys.some(
            (key, index) => key !== actualKeys[index]
        )
    ) {
        throw new Error(
            `Generated JSON must contain exactly: ${expectedKeys.join(', ')}.`
        );
    }

    for (const dimension of dimensions) {
        dimension.validate(
            generatedJSON[dimension.key]
        );
    }

    let validatedJSON = generatedJSON;

    return validatedJSON;
}


// ============================================================
// 16. PREPARE NEW STORY VERSION
// ============================================================

function prepareNewStoryVersion(originalStory, validatedJSON) {

    let newStoryVersion = {
        ...originalStory
    };

    for (const dimension of enabledDimensions()) {

        newStoryVersion[dimension.databaseColumn] =
            validatedJSON[dimension.key];

    }

    return newStoryVersion;
}


// ============================================================
// 17. VERIFY COPIED STORY
// ============================================================

function verifyCopiedStory(newStoryVersion, originalStory) {

    let columns = getStoryColumns();

    let expectedKeys = [...columns].sort();

    let actualKeys = Object.keys(newStoryVersion).sort();

    if (
        expectedKeys.length !== actualKeys.length ||
        expectedKeys.some(
            (key, index) => key !== actualKeys[index]
        )
    ) {
        throw new Error(
            'New version does not contain the expected story columns.'
        );
    }

    let generatedColumns = new Set(
        enabledDimensions().map(d => d.databaseColumn)
    );

    for (const column of BASE_STORY_COLUMNS) {

        if (
            JSON.stringify(newStoryVersion[column]) !==
            JSON.stringify(originalStory[column])
        ) {
            throw new Error(
                `Original story field changed: ${column}`
            );
        }
    }

    for (const column of generatedColumns) {

        if (newStoryVersion[column] === undefined) {
            throw new Error(
                `Generated dimension is missing: ${column}`
            );
        }
    }

    let verifiedStory = newStoryVersion;

    return verifiedStory;
}


// ============================================================
// 18. SAVE NEW VERSION
// ============================================================

async function saveNewVersion(
    dbConnection,
    verifiedStory,
    validatedJSON
) {

    let client = await dbConnection.connect();

    try {

        await client.query('BEGIN');

        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1));',
            [String(verifiedStory.user_story_id)]
        );

        let versionResult = await client.query(
            `
            SELECT COALESCE(MAX(version_number), 1) + 1
                   AS next_version_number
            FROM requirements.user_story_versions
            WHERE user_story_id = $1;
            `,
            [verifiedStory.user_story_id]
        );

        let versionNumber = Math.max(
            2,
            Number(versionResult.rows[0].next_version_number)
        );

        if (!Number.isInteger(versionNumber)) {
            throw new Error('Invalid version number.');
        }

        let storyColumns = getStoryColumns();

        let jsonbColumns = getJSONBColumns();

        let columns = [
            'user_story_id',
            'version_number',
            'version_type',
            ...storyColumns.filter(
                column => column !== 'user_story_id'
            ),
            'assessment_result',
            'dimension_findings',
            'correction_summary',
            'evidence_references',
            'model_name'
        ];

        let values = [
            verifiedStory.user_story_id,
            versionNumber,
            'AI_GENERATED'
        ];

        for (const column of storyColumns) {

            if (column === 'user_story_id') continue;

            let value = verifiedStory[column];

            values.push(
                jsonbColumns.has(column) && value !== null
                    ? JSON.stringify(value)
                    : value
            );
        }

        values.push(
            'CONTENT_GENERATED',
            JSON.stringify(validatedJSON),
            'Generated configured User Story dimensions.',
            JSON.stringify([]),
            MODEL
        );

        let placeholders = values.map(
            (_, index) => `$${index + 1}`
        );

        let sql = `
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

        let result = await client.query(sql, values);

        await client.query('COMMIT');

        let savedVersion = result.rows[0];

        return savedVersion;

    } catch (error) {

        await client.query('ROLLBACK');

        throw error;

    } finally {

        client.release();

    }
}


// ============================================================
// 19. WRITE JSON ARTIFACT
// ============================================================

function writeJSONArtifact(
    userStoryId,
    versionNumber,
    validatedJSON
) {

    validateJSON(validatedJSON);

    let output = {};

    for (const dimension of enabledDimensions()) {
        output[dimension.key] =
            validatedJSON[dimension.key];
    }

    let outputPath = path.join(
        UNIT_DIR,
        `${safeFileName(userStoryId)}_version_${versionNumber}.json`
    );

    let temporaryPath = `${outputPath}.tmp`;

    fs.writeFileSync(
        temporaryPath,
        JSON.stringify(output, null, 2),
        'utf8'
    );

    fs.renameSync(temporaryPath, outputPath);

    let verification = JSON.parse(
        fs.readFileSync(outputPath, 'utf8')
    );

    validateJSON(verification);

    let jsonArtifact = outputPath;

    return jsonArtifact;
}


// ============================================================
// 20. PRINT GENERATED DIMENSIONS
// ============================================================

function printGeneratedDimensions(userStoryId, validatedJSON) {

    console.log(`\nUSER STORY: ${userStoryId}\n`);

    for (const dimension of enabledDimensions()) {

        console.log(
            `${dimension.name.toUpperCase()}\n`
        );

        console.log(
            JSON.stringify(
                validatedJSON[dimension.key],
                null,
                2
            )
        );

        console.log('');

    }

    let printedDimensions = true;

    return printedDimensions;
}


// ============================================================
// 21. FINISH SCRIPT
// ============================================================

async function finishScript(dbConnection) {

    if (dbConnection) {
        await dbConnection.end();
    }

    let finished = true;

    return finished;
}


// ============================================================
// 22. MAIN EXECUTION
// ============================================================

async function main() {

    let executionResult =
        await startScript();

    return executionResult;
}


// ============================================================
// 23. ERROR HANDLING
// ============================================================

main().catch(error => {

    // Errors only.
    // Never print Qwen's raw response.

    console.error(error.message);

    process.exitCode = 1;

});
