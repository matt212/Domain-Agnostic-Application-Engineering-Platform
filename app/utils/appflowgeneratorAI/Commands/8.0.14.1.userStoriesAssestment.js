
'use strict';

/*
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

const MAX_PROMPT_CHARACTERS = 4000;
const MAX_OUTPUT_TOKENS = 350;

const CONTEXT_SIZE = 4096;
const MODEL_THREADS = 8;
const MODEL_GPU_LAYERS = 99;
const MODEL_BATCH_SIZE = 128;
const MODEL_UBATCH_SIZE = 128;

const MODEL_TIMEOUT_MS = 300000;
const MODEL_KILL_GRACE_MS = 5000;


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


// ============================================================
// 6. START SCRIPT
//
// Every execution step is explicitly visible here.
// Each step stores its returned result in a let variable.
// ============================================================

async function startScript() {

    let dimensionConfiguration =
        validateDimensionConfiguration();

    let directoriesCreated =
        ensureDirectories();

    let dbConnection =
        await connectToPostgreSQL();


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


            // STEP 3: Prepare AI input.
            let aiInput =
                prepareAIInput(originalStory);


            // STEP 4: Build Qwen prompt.
console.log(`\nBuilding prompt for User Story: ${aiInput}\n`);
            let prompt =
                buildPrompt(aiInput);
console.log(`\nPrompt built for User Story: ${prompt}\n`);

            // STEP 5: Run Qwen.

            let qwenOutput =
                await runQwen(
                    prompt,
                    userStoryId
                );


            // STEP 6: Receive Qwen response.

            let rawResponse =
                receiveQwenResponse(qwenOutput);


            // STEP 7: Extract JSON.

            let generatedJSON =
                extractJSON(rawResponse);


            // STEP 8: Validate generated JSON.

            let validatedJSON =
                validateJSON(generatedJSON);


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


            // STEP 14: Repeat.
            // Execution returns to STEP 1.

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

    let fixedPrompt = [
    'TASK: Generate the requested User Story output dimensions.',
    '',
    'SOURCE DATA:',
    'Use the supplied User Story as the evidence baseline.',
    'Title and description are the primary sources of story-specific behaviour.',
    'Actors identify participants. Business objects identify relevant entities.',
    'Business rules constrain behaviour only when relevant to this story.',
    'Existing acceptance criteria are supporting evidence, not automatically validated story-level behaviour.',
    'Assess inherited acceptance criteria for relevance before reuse.',
    'Do not invent actors, rules, conditions, triggers, outcomes, validation, error handling, thresholds or behaviour.',
    'Do not assume missing information.',
    '',
    'INTERNAL ANALYSIS:',
    'Before generation, answer internally:',
    '1. What behaviour does this story describe?',
    '2. Which actors and objects are involved?',
    '3. What conditions and events are supported?',
    '4. What observable outcomes are supported?',
    '5. Which business rules apply?',
    '6. Which existing scenarios are relevant?',
    '7. What information is missing?',
    'Use these answers to generate the dimensions. Do not include the answers in the output.',
    '',
    'GENERATION:',
    'Generate distinct, meaningful and testable results supported by the supplied evidence.',
    'Do not duplicate existing scenarios unnecessarily or manufacture additional results.',
    '',
    'OUTPUT:',
    'Return valid JSON only. No Markdown or explanations.',
    'Return exactly the requested root keys and follow the supplied schema.',
    dimensionInstructions,
    'OUTPUT JSON STRUCTURE:',
    JSON.stringify(outputSchema),
    'USER STORY BASELINE:'
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

async function runQwen(prompt, userStoryId) {

    let promptFile = path.join(
        TEMP_DIR,
        `${safeFileName(userStoryId)}_${process.pid}_${Date.now()}.txt`
    );

    let qwenOutput = await new Promise((resolve, reject) => {

        let stdout = '';
        let stderr = '';
        let settled = false;
        let timedOut = false;
        let timeout;
        let killTimeout;

        function cleanup() {
            clearTimeout(timeout);
            clearTimeout(killTimeout);

            try {
                if (fs.existsSync(promptFile)) {
                    fs.unlinkSync(promptFile);
                }
            } catch (_) {
                // No terminal output.
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

            if (!fs.existsSync(LLAMA_CLI)) {
                throw new Error(
                    `llama-completion not found: ${LLAMA_CLI}`
                );
            }

            fs.writeFileSync(promptFile, prompt, 'utf8');

            let args = [
                '-hf', MODEL,
                '-ngl', String(MODEL_GPU_LAYERS),
                '--single-turn',
                '-c', String(CONTEXT_SIZE),
                '-b', String(MODEL_BATCH_SIZE),
                '-ub', String(MODEL_UBATCH_SIZE),
                '-t', String(MODEL_THREADS),
                '--reasoning', 'off',
                '-n', String(MAX_OUTPUT_TOKENS),
                '-f', promptFile
            ];

            let child = spawn(LLAMA_CLI, args, {
                cwd: ROOT,
                stdio: ['ignore', 'pipe', 'pipe']
            });

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

                timedOut = true;

                child.kill('SIGTERM');

                killTimeout = setTimeout(() => {
                    if (!settled) {
                        child.kill('SIGKILL');
                    }
                }, MODEL_KILL_GRACE_MS);

            }, MODEL_TIMEOUT_MS);

            child.on('error', error => {
                finish(
                    new Error(
                        `Unable to launch Qwen: ${error.message}`
                    )
                );
            });

            child.on('close', (code, signal) => {

                if (settled) return;

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
                            `Qwen exited with code ${code}; signal ${signal || 'none'}. ${stderr.slice(-2000)}`
                        )
                    );
                    return;
                }

                if (!stdout.trim()) {
                    finish(
                        new Error('Qwen returned no output.')
                    );
                    return;
                }

                finish(null, stdout);

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
