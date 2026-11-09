
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

// ============================================================
// 1. CONFIGURATION
// ============================================================

const SOURCE_FILES = {

    STAGE_1_OBJECTS:
        '7.6 Business Objects.24-10-26_06:41pm.md',

    STAGE_2_ACTORS:
        '7.7.1 Actors_list.29-10-26_05:14pm.md',

    STAGE_3_RESPONSIBILITIES:
        '7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.30-10-26_03:13pm.md',

    STAGE_4_RELATIONSHIPS:
        '7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP.31-10-26_09:23am.md',

    STAGE_5_ACTIVITIES:
        '7.7.0.6.Derive_ACTOR_BUSINESS_Activities.31-10-26_06:46pm.md',

    STAGE_6_INFORMATION_REQUIREMENTS:
        '7.7.0.8.Derive_Information_Requirements.05-11-26_03:40pm.md',

    STAGE_7_MERGED_INFORMATION_REQUIREMENTS:
        'merged_information_requirements_06_11_26_07_50_PM.json',

    STAGE_8_VALIDATION_INFORMATION_REQUIREMENTS:
        'information_requirements_structural_validation-07-11-26_13:56.json'
};

const CONFIG = {

    SOURCE_DIRECTORY: path.resolve(
        __dirname,
        '../aiOutput/baseline'
    ),

    KNOWLEDGE_BASE_FILE: path.join(
        __dirname,
        'knowledge_base.json'
    ),

    OUTPUT_FILE: path.join(
        __dirname,
        'functional_requirements.json'
    ),

    MODEL: {
        EXEC_BINARY: 'llama-cli',
        IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
        NGL: '0',
        CONTEXT_SIZE: '31723',
        BATCH_SIZE: '256',
        THREADS: '8',
        REASONING_MODE: 'off'
    },

    MAX_SEARCH_ROUNDS: 10,

    MAX_SEARCH_RESULTS: 5,

    CHUNK_LINES: 70,

    CHUNK_OVERLAP: 10,

    MAX_RETRIEVED_CHARACTERS: 45000,

    FINAL_OUTPUT_TOKENS: '2500',

    DOMAIN: null,

    NICHE: null
};


// ============================================================
// 2. RUNTIME STATE
// ============================================================

const state = {

    knowledgeBase: null,

    knowledgeIndex: [],

    retrievedKnowledge: new Map(),

    conversationHistory: [],

    searchHistory: [],

    searchRounds: 0,

    retrievalCharacters: 0
};


// ============================================================
// 3. DISCOVERY PROMPT
// ============================================================

const DISCOVERY_PROMPT = `

# ROLE

Act as an expert Business Analyst, Enterprise Solution Analyst,
and Functional Requirements Architect.

You are responsible for independently discovering, analysing,
and defining complete, meaningful, and business-ready
Functional Requirements for the specified business domain
and niche.

# OBJECTIVE

Discover Functional Requirements that satisfy all three objectives:

1. Sufficient for business decisions.
2. Supported by meaningful functional rules and validation.
3. Complete in their required information details.

Do not simply convert existing business activities, objects,
or information requirements into Functional Requirements.

Independently reason about what the business needs the system
to do.

# BASELINE KNOWLEDGE

You will receive:

- Domain and niche.
- An inventory of available Knowledge Base sources.
- Business knowledge retrieved from the Knowledge Base
  in response to your own search requests.
- Answers to business clarification questions, when applicable.

The original eight source files are baseline business context,
not a complete definition of the required system and not a
restriction on your reasoning.

Use them to understand the business, its objects, actors,
responsibilities, relationships, activities, and information
requirements.

Do not assume that the supplied information already defines
all required functionality.

Do not discard relevant information simply because it is not
present in the initially retrieved knowledge.

# INDEPENDENT BUSINESS REASONING

Think independently about the business domain and niche.

For every relevant business capability, consider:

- What business outcome must be achieved?
- What business decisions must the system support?
- What must happen before an operation can proceed?
- What conditions determine whether an operation is permitted?
- What information must be available to make the decision?
- Which actors are responsible or authorised?
- Which business objects are created, updated, validated,
  or affected?
- What business rules govern the behaviour?
- What exceptions, conflicts, failures, and alternative
  outcomes must be handled?
- What information must be retained or communicated?
- What must be true for the operation to be considered successful?

Identify functionality that is genuinely necessary for the
business, including functionality not explicitly described
in the baseline sources.

Do not invent unconfirmed business policies as established facts.

When a business decision, policy, threshold, or operational
choice cannot be established from available knowledge, ask
the user.

# KNOWLEDGE BASE RETRIEVAL

You have access to a Knowledge Base containing the original
baseline business information.

You must independently determine what additional business
knowledge you need before defining Functional Requirements.

When you identify missing knowledge:

1. Formulate a specific internal knowledge-search question.
2. Return a SEARCH action containing that question.
3. Wait for the application to retrieve matching knowledge.
4. Analyse the retrieved information.
5. Decide whether further knowledge searches are necessary.

You may perform multiple searches.

Search for the actual business concepts, relationships,
rules, responsibilities, activities, information requirements,
and exceptions relevant to the functionality being analysed.

Do not restrict searches to exact terminology used in the
source files. Consider equivalent business terminology and
related concepts.

IMPORTANT:

- You decide what knowledge is required.
- The application only executes your search requests.
- Search results are original baseline information with
  source provenance.
- Retrieved information is not automatically proof that a
  business policy or decision has been confirmed.
- Absence of retrieved information does not mean the
  functionality is unnecessary.
- Do not ask the user about information that can reasonably
  be retrieved from the Knowledge Base.
- Do not treat the retrieval mechanism's ranking or result
  count as proof of business completeness.
- If a search returns no results, reconsider the search
  terminology before concluding that information is absent.

# BUSINESS CLARIFICATION

After analysing the available baseline knowledge and relevant
retrieved information, identify unresolved business decisions
that materially affect the Functional Requirements.

Ask the user one highest-priority, specific, contextual
question at a time.

Each question must:

- Address an actual business uncertainty.
- Explain the relevant business situation through its wording.
- Be specific enough to obtain a meaningful business decision.
- Avoid generic questions such as "Are there any other
  requirements?"
- Avoid asking for information already established by the
  available sources or previous answers.

Wait for the user's answer before continuing.

Incorporate the answer into subsequent reasoning.

If the answer introduces new business concepts or dependencies,
search the Knowledge Base again where necessary.

Do not invent a business decision on behalf of the user.

# FUNCTIONAL REQUIREMENT DERIVATION

Derive each Functional Requirement from the actual business
need and expected system behaviour.

Each requirement must describe meaningful functionality
rather than merely naming an activity, object, screen,
process, or data field.

For every Functional Requirement, establish:

1. Requirement:
   What the system must do.

2. Business need:
   Why the functionality is required.

3. Functional behaviour:
   The specific system behaviour, including relevant
   processing, decisions, validations, and outcomes.

4. Required actors:
   The actors who initiate, perform, approve, control,
   or otherwise participate in the functionality.

5. Related business objects:
   The business objects created, read, validated,
   modified, or affected.

6. Related information requirements:
   The relevant information required to support the
   functionality.

7. Business rules:
   The conditions, restrictions, calculations, decision
   criteria, and policies governing the behaviour.

8. Acceptance criteria:
   Observable conditions demonstrating whether the
   functionality works correctly.

Avoid:

- Generic CRUD requirements without meaningful business
  behaviour.
- Duplicate requirements expressed using different wording.
- Requirements that merely repeat existing business activities.
- Unnecessary technical implementation details.
- Unconfirmed business policies presented as facts.
- Arbitrary requirements created only to increase the
  requirement count.
- Superficial acceptance criteria that do not validate
  actual business outcomes.

# QUALITY ASSESSMENT

Before finalising, independently assess every Functional
Requirement.

Ask yourself:

- Does it support a meaningful business decision or outcome?
- Is the expected system behaviour sufficiently clear?
- Are relevant business conditions and validations covered?
- Are the necessary actors and business objects identified?
- Are the required information details sufficient?
- Are important exceptions and alternative outcomes addressed?
- Can the acceptance criteria demonstrate actual business
  correctness?
- Is the requirement distinct and non-duplicative?

Improve incomplete requirements before finalising.

If a material business decision remains unresolved, ask the
user rather than silently assuming an answer.

Do not claim that requirements are complete merely because
every supplied source has been examined.

# ORCHESTRATION RESPONSE PROTOCOL

You are operating within an application that executes your
Knowledge Base searches and manages interaction with the user.

For every response, return exactly one valid JSON object
using one of the following action formats.

## ACTION 1 — SEARCH

Use when you need additional baseline business knowledge.

{
  "action": "SEARCH",
  "query": "A specific question describing the business knowledge you need to retrieve."
}

The query is an internal Knowledge Base search request,
not a question for the user.

## ACTION 2 — ASK_USER

Use when a material business decision cannot be established
from available baseline knowledge and previous answers.

{
  "action": "ASK_USER",
  "question": "One specific contextual business clarification question."
}

The application will present this question to the user
and return the answer.

## ACTION 3 — FINAL

Use only when you have completed your analysis and no material
business clarification is required before producing the result.

{
  "action": "FINAL",
  "result": {
    "functional_requirements": [
      {
        "requirement_id": "FR-001",
        "requirement": "",
        "business_need": "",
        "functional_behaviour": [],
        "required_by_actors": [],
        "related_business_objects": [],
        "related_information_requirements": [],
        "business_rules": [],
        "acceptance_criteria": [
          {
            "given": "",
            "when": "",
            "then": ""
          }
        ]
      }
    ],
    "unresolved_questions": [
      {
        "question": "",
        "affected_requirement": "FR-001"
      }
    ]
  }
}

# FINAL OUTPUT RULES

The FINAL action's result must contain exactly these two
top-level properties:

- functional_requirements
- unresolved_questions

Every Functional Requirement must contain exactly these
properties:

- requirement_id
- requirement
- business_need
- functional_behaviour
- required_by_actors
- related_business_objects
- related_information_requirements
- business_rules
- acceptance_criteria

Every acceptance criterion must contain:

- given
- when
- then

Use sequential requirement identifiers beginning with FR-001.

Use arrays for all array-valued properties.

Use meaningful, specific business descriptions.

Do not add additional JSON properties.

Do not wrap the final result in Markdown.

If no unresolved questions remain, return an empty
unresolved_questions array.

Do not produce a FINAL action while additional knowledge
retrieval or material business clarification is necessary.

# IMPORTANT EXECUTION RULE

During discovery, always return the SEARCH, ASK_USER, or
FINAL action envelope.

The required Functional Requirements JSON belongs inside
FINAL.result.

Never return the Functional Requirements JSON directly
outside the FINAL action envelope.

`;


// ============================================================
// 4. EXTRACT JSON CONTENT
// ============================================================

function extractJsonContent(rawContent) {

    const content = String(rawContent || '').trim();

    try {
        return JSON.parse(content);
    } catch (_) {
        // Try removing Markdown fences.
    }

    const cleaned = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch (_) {
        throw new Error(
            'Business Objects input could not be parsed as JSON.'
        );
    }
}


// ============================================================
// 5. RESOLVE BUSINESS OBJECTS FILE
// ============================================================

function resolveLatestStageFile(directory, prefix) {

    if (!fs.existsSync(directory)) {
        return null;
    }

    const files = fs.readdirSync(directory)
        .filter(file => file.startsWith(prefix))
        .filter(file => /\.(md|txt|json)$/i.test(file))
        .map(file => {

            const fullPath = path.join(directory, file);

            return {
                path: fullPath,
                modified: fs.statSync(fullPath).mtimeMs
            };
        })
        .sort((a, b) => b.modified - a.modified);

    return files.length ? files[0].path : null;
}


function resolveInputFiles() {

    const businessObjectsFile = resolveLatestStageFile(
        CONFIG.SOURCE_DIRECTORY,
        SOURCE_FILES.STAGE_1_OBJECTS
    );

    if (!businessObjectsFile) {
        throw new Error(
            `Business Objects file not found: ${SOURCE_FILES.STAGE_1_OBJECTS}`
        );
    }

    console.log('\n========== BUSINESS OBJECTS INPUT ==========');

    console.log(
        path.basename(businessObjectsFile)
    );

    return {
        businessObjects: businessObjectsFile
    };
}


// ============================================================
// 6. EXTRACT DOMAIN, NICHE AND BUSINESS OBJECTS
// ============================================================

function readInputFiles(files) {

    return {
        objects: fs.readFileSync(
            files.businessObjects,
            'utf8'
        )
    };
}


function extractDomain_Niche_Main_Content(objectsData) {

    const parsed = extractJsonContent(objectsData);

    if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            'Business Objects input must contain a JSON object.'
        );
    }

    const domain = parsed.domain;
    const niche = parsed.niche;

    if (!domain || !niche) {
        throw new Error(
            'Domain or niche is missing from Business Objects input.'
        );
    }

    const mainContent = { ...parsed };

    delete mainContent.domain;
    delete mainContent.niche;

    return {
        primarydataset: {
            domain,
            niche
        },
        mainContent
    };
}


function buildBaseContext() {

    const inputFiles = resolveInputFiles();

    const input = readInputFiles(inputFiles);

    const extracted = extractDomain_Niche_Main_Content(
        input.objects
    );

    return {
        domain: extracted.primarydataset.domain,
        niche: extracted.primarydataset.niche,
        business_objects: extracted.mainContent
    };
}


// ============================================================
// 7. LOAD ORIGINAL KNOWLEDGE SOURCES
// ============================================================

function loadKnowledgeSources() {

    const sources = {};

    for (const [stage, filename] of Object.entries(SOURCE_FILES)) {

        const sourcePath = path.join(
            CONFIG.SOURCE_DIRECTORY,
            filename
        );

        if (!fs.existsSync(sourcePath)) {
            throw new Error(
                `Missing source file: ${sourcePath}`
            );
        }

        const content = fs.readFileSync(
            sourcePath,
            'utf8'
        );

        if (!content.trim()) {
            throw new Error(
                `Empty source file: ${filename}`
            );
        }

        sources[stage] = {
            source_file: filename,
            original_content: content
        };

        console.log(
            `Loaded ${stage}: ${content.length} characters`
        );
    }

    return sources;
}


// ============================================================
// 8. BUILD LOSSLESS KNOWLEDGE BASE
// ============================================================

function buildKnowledgeBase(sources) {

    const knowledgeBase = {

        metadata: {
            name: 'Business Knowledge Base',
            version: '1.0',
            created_at: new Date().toISOString(),
            source_count: Object.keys(sources).length
        },

        domain: CONFIG.DOMAIN,

        niche: CONFIG.NICHE,

        sources
    };

    fs.writeFileSync(
        CONFIG.KNOWLEDGE_BASE_FILE,
        JSON.stringify(knowledgeBase, null, 2),
        'utf8'
    );

    return knowledgeBase;
}


// ============================================================
// 9. CREATE SEARCHABLE KNOWLEDGE INDEX
// ============================================================

function buildKnowledgeIndex(knowledgeBase) {

    const index = [];

    for (const [stage, source] of Object.entries(
        knowledgeBase.sources
    )) {

        const lines = source.original_content.split('\n');

        let chunkNumber = 0;

        const stepSize =
            CONFIG.CHUNK_LINES - CONFIG.CHUNK_OVERLAP;

        for (
            let start = 0;
            start < lines.length;
            start += stepSize
        ) {

            const end = Math.min(
                start + CONFIG.CHUNK_LINES,
                lines.length
            );

            const content = lines
                .slice(start, end)
                .join('\n');

            if (content.trim()) {

                index.push({

                    chunk_id: `${stage}_${chunkNumber++}`,

                    stage,

                    source_file: source.source_file,

                    start_line: start + 1,

                    end_line: end,

                    content
                });
            }

            if (end === lines.length) {
                break;
            }
        }
    }

    return index;
}


// ============================================================
// 10. SEARCH KNOWLEDGE BASE
// ============================================================

// Mechanical keyword matching only.
// Qwen decides what to search and whether retrieved
// information is sufficient for the discovery task.

function searchKnowledgeBase(query) {

    const stopWords = new Set([
        'what', 'which', 'where', 'when', 'does', 'this',
        'that', 'with', 'from', 'have', 'has', 'will',
        'must', 'should', 'would', 'could', 'about',
        'into', 'their', 'them', 'they', 'there', 'then',
        'than', 'also', 'need', 'required', 'requirements',
        'business', 'system', 'information', 'functionality',
        'and', 'the', 'for', 'are', 'was', 'were', 'how'
    ]);

    const terms = [
        ...new Set(
            String(query)
                .toLowerCase()
                .match(/[\p{L}\p{N}]+/gu) || []
        )
    ].filter(term =>
        term.length > 2 &&
        !stopWords.has(term)
    );

    if (!terms.length) {
        return [];
    }

    const results = [];

    for (const chunk of state.knowledgeIndex) {

        const content = chunk.content.toLowerCase();

        let score = 0;

        for (const term of terms) {

            let position = 0;
            let occurrences = 0;

            while (
                (position = content.indexOf(term, position)) !== -1
            ) {
                occurrences++;
                position += term.length;
            }

            score += occurrences;
        }

        if (score > 0) {

            results.push({
                ...chunk,
                relevance_score: score
            });
        }
    }

    results.sort(
        (a, b) => b.relevance_score - a.relevance_score
    );

    return results.slice(
        0,
        CONFIG.MAX_SEARCH_RESULTS
    );
}


// ============================================================
// 11. LOAD DISCOVERY INSTRUCTIONS
// ============================================================

function loadDiscoveryInstructions() {

    return DISCOVERY_PROMPT;
}


// ============================================================
// 12. KNOWLEDGE BASE MANIFEST
// ============================================================

function getKnowledgeManifest() {

    return Object.entries(
        state.knowledgeBase.sources
    ).map(([stage, source]) => ({

        stage,

        source_file: source.source_file,

        character_count: source.original_content.length

    }));
}


// ============================================================
// 13. CREATE AI CONTROL PROMPT
// ============================================================

function createAIPrompt() {

    const discoveryInstructions =
        loadDiscoveryInstructions();

    const retrievedContent = Array.from(
        state.retrievedKnowledge.values()
    );

    return `

============================================================
DOMAIN AND NICHE
============================================================

Domain: ${CONFIG.DOMAIN}

Niche: ${CONFIG.NICHE}


============================================================
DISCOVERY INSTRUCTIONS
============================================================

${discoveryInstructions}


============================================================
AVAILABLE BUSINESS KNOWLEDGE BASE
============================================================

The following original sources are available for retrieval.

${JSON.stringify(getKnowledgeManifest(), null, 2)}


============================================================
PREVIOUSLY RETRIEVED KNOWLEDGE
============================================================

${JSON.stringify(retrievedContent, null, 2)}


============================================================
PREVIOUS KNOWLEDGE SEARCH RESULTS
============================================================

${JSON.stringify(state.searchHistory, null, 2)}


============================================================
PREVIOUS USER INTERACTIONS
============================================================

${JSON.stringify(state.conversationHistory, null, 2)}


============================================================
YOUR TASK
============================================================

Independently conduct the discovery task using your
business understanding and the available knowledge base.

Knowledge retrieval is an INTERNAL activity.

You are responsible for deciding:

- What business knowledge you need.
- What questions you need to investigate.
- Which information should be retrieved.
- Whether retrieved information answers your questions.
- Whether further searches are necessary.
- Whether an unresolved issue requires user clarification.
- When you have sufficient knowledge to proceed.

Do not use predetermined source-selection rules.

Do not assume that all relevant knowledge has already
been retrieved.

Do not assume that the available sources define the
complete business.

Do not expose internal reasoning or search activity
as the discovery output.

You must return exactly ONE of the following JSON actions.

------------------------------------------------------------
ACTION 1 — REQUEST KNOWLEDGE
------------------------------------------------------------

Use this when you need additional information from
the Business Knowledge Base.

{
  "action": "SEARCH",
  "query": "Your specific natural-language search question"
}

Generate the search question yourself.

------------------------------------------------------------
ACTION 2 — ASK THE USER
------------------------------------------------------------

Use this when an important business decision cannot
be established from the available knowledge.

{
  "action": "ASK_USER",
  "question": "One specific contextual business question"
}

Ask only ONE question at a time.

Do not ask the user to provide information that can
be retrieved from the existing knowledge base.

------------------------------------------------------------
ACTION 3 — FINAL OUTPUT
------------------------------------------------------------

Use this only when you have completed the necessary
knowledge analysis and interactive clarification.

{
  "action": "FINAL",
  "result": {
    "functional_requirements": [],
    "unresolved_questions": []
  }
}

The result MUST follow the exact final JSON schema
defined in the discovery instructions.

Do not add additional fields to the result.

------------------------------------------------------------
IMPORTANT
------------------------------------------------------------

The three actions above control the application workflow.

They do not replace the Functional Requirements
Discovery instructions.

Your final result must follow the discovery prompt's
requirements, quality criteria and JSON schema.

Return one valid JSON object only.

Do not return Markdown fences.

`;
}


// ============================================================
// 14. EXECUTE QWEN
// ============================================================

function runModel(prompt, maxOutputTokens) {

    return new Promise((resolve, reject) => {

        const outputTokens = Number(
            maxOutputTokens || CONFIG.FINAL_OUTPUT_TOKENS
        );

        if (
            !Number.isInteger(outputTokens) ||
            outputTokens <= 0
        ) {
            return reject(
                new Error(
                    `Invalid model output token limit: ${maxOutputTokens}`
                )
            );
        }

        const runtimeDirectory = path.join(
            os.tmpdir(),
            'business-knowledge-discovery'
        );

        fs.mkdirSync(
            runtimeDirectory,
            { recursive: true }
        );

        const callId = `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;

        const promptPath = path.join(
            runtimeDirectory,
            `${callId}_prompt.txt`
        );

        const responsePath = path.join(
            runtimeDirectory,
            `${callId}_response.txt`
        );

        fs.writeFileSync(
            promptPath,
            prompt,
            'utf8'
        );

        const args = [
            '-hf', CONFIG.MODEL.IDENTIFIER,
            '-ngl', CONFIG.MODEL.NGL,
            '--single-turn',
            '-c', CONFIG.MODEL.CONTEXT_SIZE,
            '-b', CONFIG.MODEL.BATCH_SIZE,
            '-t', CONFIG.MODEL.THREADS,
            '--reasoning', CONFIG.MODEL.REASONING_MODE,
            '--log-disable',
            '-n', String(outputTokens),
            '-f', promptPath,
            '-o', responsePath
        ];

        console.log('\n========== QWEN EXECUTION ==========');

        console.log(
            `Prompt length: ${prompt.length} characters`
        );

        console.log(
            `Maximum output tokens: ${outputTokens}`
        );

        execFile(
            CONFIG.MODEL.EXEC_BINARY,
            args,
            {
                maxBuffer: 50 * 1024 * 1024
            },
            (error, stdout, stderr) => {

                try {

                    if (error) {
                        throw new Error(
                            `llama-cli failed:\n${error.message}\n${stderr || ''}`
                        );
                    }

                    if (!fs.existsSync(responsePath)) {
                        throw new Error(
                            'Model response file was not created.'
                        );
                    }

                    const response = fs.readFileSync(
                        responsePath,
                        'utf8'
                    );

                    if (!response.trim()) {
                        throw new Error(
                            'Model returned an empty response.'
                        );
                    }

                    resolve(response.trim());

                } catch (err) {

                    reject(err);

                } finally {

                    fs.rmSync(promptPath, { force: true });

                    fs.rmSync(responsePath, { force: true });
                }
            }
        );
    });
}


// ============================================================
// 15. EXTRACT JSON FROM MODEL RESPONSE
// ============================================================

function extractJSON(response) {

    const cleaned = String(response)
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    const start = cleaned.indexOf('{');

    if (start === -1) {
        throw new Error(
            'Model did not return a JSON object.'
        );
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < cleaned.length; i++) {

        const character = cleaned[i];

        if (inString) {

            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }

            continue;
        }

        if (character === '"') {
            inString = true;
        } else if (character === '{') {
            depth++;
        } else if (character === '}') {

            depth--;

            if (depth === 0) {

                const jsonText = cleaned.slice(
                    start,
                    i + 1
                );

                try {
                    return JSON.parse(jsonText);
                } catch (error) {
                    throw new Error(
                        `Model returned invalid JSON: ${error.message}`
                    );
                }
            }
        }
    }

    throw new Error(
        'Model returned incomplete JSON.'
    );
}


// ============================================================
// 16. EXECUTE AI KNOWLEDGE SEARCH
// ============================================================

function executeKnowledgeSearch(query) {

    state.searchRounds++;

    if (state.searchRounds > CONFIG.MAX_SEARCH_ROUNDS) {
        throw new Error(
            'Maximum knowledge-search rounds reached. Review the discovery session.'
        );
    }

    console.log('\n========== INTERNAL KNOWLEDGE SEARCH ==========');

    console.log(`AI search request: ${query}`);

    const results = searchKnowledgeBase(query);

    console.log(
        `Matching knowledge chunks: ${results.length}`
    );

    let newlyAdded = 0;

    let addedCharacters = 0;

    for (const result of results) {

        if (state.retrievedKnowledge.has(result.chunk_id)) {
            continue;
        }

        const record = {

            chunk_id: result.chunk_id,

            source_file: result.source_file,

            source_stage: result.stage,

            source_lines: {
                start: result.start_line,
                end: result.end_line
            },

            original_content: result.content
        };

        const recordSize = JSON.stringify(record).length;

        if (
            state.retrievalCharacters +
            addedCharacters +
            recordSize >
            CONFIG.MAX_RETRIEVED_CHARACTERS
        ) {
            console.log(
                'Retrieval character limit reached.'
            );
            break;
        }

        addedCharacters += recordSize;

        newlyAdded++;

        state.retrievedKnowledge.set(
            result.chunk_id,
            record
        );
    }

    state.retrievalCharacters += addedCharacters;

    const searchResult = {

        query,

        matches_found: results.length,

        newly_added: newlyAdded

    };

    state.searchHistory.push(searchResult);

    console.log(
        `New knowledge chunks added: ${newlyAdded}`
    );

    console.log(
        `Total retrieved characters: ${state.retrievalCharacters}`
    );

    return searchResult;
}


// ============================================================
// 17. VALIDATE FINAL DISCOVERY OUTPUT
// ============================================================

function validateFinalOutput(result) {

    if (
        !result ||
        typeof result !== 'object' ||
        Array.isArray(result)
    ) {
        throw new Error(
            'Final result is not a JSON object.'
        );
    }

    const expectedTopLevelKeys = [
        'functional_requirements',
        'unresolved_questions'
    ];

    const actualTopLevelKeys = Object.keys(result);

    if (
        actualTopLevelKeys.length !== expectedTopLevelKeys.length ||
        !expectedTopLevelKeys.every(
            key => actualTopLevelKeys.includes(key)
        )
    ) {
        throw new Error(
            'Final output must contain exactly functional_requirements and unresolved_questions.'
        );
    }

    if (!Array.isArray(result.functional_requirements)) {
        throw new Error(
            'Final output is missing functional_requirements array.'
        );
    }

    if (!Array.isArray(result.unresolved_questions)) {
        throw new Error(
            'Final output is missing unresolved_questions array.'
        );
    }

    const requiredFields = [
        'requirement_id',
        'requirement',
        'business_need',
        'functional_behaviour',
        'required_by_actors',
        'related_business_objects',
        'related_information_requirements',
        'business_rules',
        'acceptance_criteria'
    ];

    const arrayFields = [
        'functional_behaviour',
        'required_by_actors',
        'related_business_objects',
        'related_information_requirements',
        'business_rules',
        'acceptance_criteria'
    ];

    for (
        let i = 0;
        i < result.functional_requirements.length;
        i++
    ) {

        const requirement =
            result.functional_requirements[i];

        if (
            !requirement ||
            typeof requirement !== 'object' ||
            Array.isArray(requirement)
        ) {
            throw new Error(
                `Invalid requirement at position ${i + 1}.`
            );
        }

        const actualFields = Object.keys(requirement);

        if (
            actualFields.length !== requiredFields.length ||
            !requiredFields.every(
                field => actualFields.includes(field)
            )
        ) {
            throw new Error(
                `Requirement at position ${i + 1} has missing or additional fields.`
            );
        }

        for (const field of requiredFields) {

            if (!(field in requirement)) {
                throw new Error(
                    `Requirement ${i + 1} is missing ${field}.`
                );
            }
        }

        for (const field of arrayFields) {

            if (!Array.isArray(requirement[field])) {
                throw new Error(
                    `${requirement.requirement_id} has invalid ${field}.`
                );
            }
        }

        if (
            !Array.isArray(requirement.acceptance_criteria)
        ) {
            throw new Error(
                `${requirement.requirement_id} has invalid acceptance_criteria.`
            );
        }

        for (const criterion of requirement.acceptance_criteria) {

            if (
                !criterion ||
                typeof criterion !== 'object' ||
                Array.isArray(criterion)
            ) {
                throw new Error(
                    `Invalid acceptance criterion in ${requirement.requirement_id}.`
                );
            }

            const criterionKeys = [
                'given',
                'when',
                'then'
            ];

            const actualCriterionKeys = Object.keys(criterion);

            if (
                actualCriterionKeys.length !== 3 ||
                !criterionKeys.every(
                    key => actualCriterionKeys.includes(key)
                )
            ) {
                throw new Error(
                    `Acceptance criterion in ${requirement.requirement_id} must contain exactly given, when and then.`
                );
            }
        }

        const expectedId =
            `FR-${String(i + 1).padStart(3, '0')}`;

        if (requirement.requirement_id !== expectedId) {
            throw new Error(
                `Expected ${expectedId}, received ${requirement.requirement_id}.`
            );
        }
    }

    for (const question of result.unresolved_questions) {

        if (
            !question ||
            typeof question !== 'object' ||
            Array.isArray(question)
        ) {
            throw new Error(
                'Invalid unresolved question.'
            );
        }

        const keys = Object.keys(question);

        if (
            keys.length !== 2 ||
            !keys.includes('question') ||
            !keys.includes('affected_requirement')
        ) {
            throw new Error(
                'Each unresolved question must contain exactly question and affected_requirement.'
            );
        }
    }

    return result;
}


// ============================================================
// 18. AI-DIRECTED DISCOVERY LOOP
// ============================================================

async function discoveryLoop() {

    const rl = readline.createInterface({
        input: stdin,
        output: stdout
    });

    try {

        while (true) {

            const prompt = createAIPrompt();

            const rawResponse = await runModel(
                prompt,
                CONFIG.FINAL_OUTPUT_TOKENS
            );

            const decision = extractJSON(rawResponse);

            // ------------------------------------------------
            // ACTION 1 — AI REQUESTS KNOWLEDGE
            // ------------------------------------------------

            if (decision.action === 'SEARCH') {

                if (
                    typeof decision.query !== 'string' ||
                    !decision.query.trim()
                ) {
                    throw new Error(
                        'AI generated an invalid knowledge search request.'
                    );
                }

                executeKnowledgeSearch(
                    decision.query.trim()
                );

                continue;
            }

            // ------------------------------------------------
            // ACTION 2 — AI ASKS USER
            // ------------------------------------------------

            if (decision.action === 'ASK_USER') {

                if (
                    typeof decision.question !== 'string' ||
                    !decision.question.trim()
                ) {
                    throw new Error(
                        'AI generated an invalid user question.'
                    );
                }

                console.log('\n======================================');

                console.log(
                    'BUSINESS CLARIFICATION REQUIRED'
                );

                console.log('======================================\n');

                console.log(decision.question);

                const answer = await rl.question(
                    '\nYour answer: '
                );

                if (!answer.trim()) {

                    console.log(
                        '\nNo answer supplied. Please provide an answer.'
                    );

                    continue;
                }

                state.conversationHistory.push({

                    question: decision.question,

                    answer: answer.trim()

                });

                continue;
            }

            // ------------------------------------------------
            // ACTION 3 — FINAL DISCOVERY OUTPUT
            // ------------------------------------------------

            if (decision.action === 'FINAL') {

                const finalResult = validateFinalOutput(
                    decision.result
                );

                fs.writeFileSync(
                    CONFIG.OUTPUT_FILE,
                    JSON.stringify(finalResult, null, 2),
                    'utf8'
                );

                console.log('\n======================================');

                console.log(
                    'DISCOVERY COMPLETED'
                );

                console.log('======================================\n');

                console.log(
                    `Functional requirements: ${finalResult.functional_requirements.length}`
                );

                console.log(
                    `Unresolved questions: ${finalResult.unresolved_questions.length}`
                );

                console.log(
                    `Knowledge searches: ${state.searchRounds}`
                );

                console.log(
                    `Retrieved knowledge chunks: ${state.retrievedKnowledge.size}`
                );

                console.log(
                    `Output: ${CONFIG.OUTPUT_FILE}`
                );

                break;
            }

            // ------------------------------------------------
            // INVALID ACTION
            // ------------------------------------------------

            throw new Error(
                `Unknown AI action: ${decision.action}`
            );
        }

    } finally {

        rl.close();
    }
}


// ============================================================
// 19. MAIN
// ============================================================

async function main() {

    try {

        console.log('\n======================================');

        console.log(
            'BUSINESS KNOWLEDGE DISCOVERY'
        );

        console.log('======================================\n');

        // ----------------------------------------------
        // A. Extract domain and niche.
        // ----------------------------------------------

        const baseContext = buildBaseContext();

        CONFIG.DOMAIN = baseContext.domain;

        CONFIG.NICHE = baseContext.niche;

        console.log(`Domain: ${CONFIG.DOMAIN}`);

        console.log(`Niche: ${CONFIG.NICHE}`);

        // ----------------------------------------------
        // B. Load all eight original baseline sources.
        // ----------------------------------------------

        const sources = loadKnowledgeSources();

        // ----------------------------------------------
        // C. Build consolidated Knowledge Base.
        // ----------------------------------------------

        state.knowledgeBase = buildKnowledgeBase(
            sources
        );

        // ----------------------------------------------
        // D. Create searchable knowledge index.
        // ----------------------------------------------

        state.knowledgeIndex = buildKnowledgeIndex(
            state.knowledgeBase
        );

        console.log('\n========== KNOWLEDGE BASE CREATED ==========');

        console.log(
            `Original sources: ${Object.keys(sources).length}`
        );

        console.log(
            `Searchable chunks: ${state.knowledgeIndex.length}`
        );

        console.log(
            `Knowledge Base: ${CONFIG.KNOWLEDGE_BASE_FILE}`
        );

        // ----------------------------------------------
        // E. Start AI-directed discovery.
        // ----------------------------------------------

        await discoveryLoop();

    } catch (error) {

        console.error('\nDISCOVERY FAILED:\n');

        console.error(
            error.stack || error.message
        );

        process.exitCode = 1;
    }
}


// ============================================================
// 20. START APPLICATION
// ============================================================

main();
