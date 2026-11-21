
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
     4. Supply the available evidence to Qwen.
     5. Generate actual content for all 12 dimensions.
     6. Validate all generated dimensions.
     7. Validate that generated numerical targets are evidence-based.
     8. Map generated dimensions to the original story fields.
     9. Preserve all other original story fields.
    10. Validate all 31 User Story fields.
    11. Save a new version transactionally.

   IMPORTANT:
     - No PASS / FAIL / PARTIAL assessment.
     - No missing-field assessment.
     - No assessment-result decision.
     - No separate assessment or correction inference.
     - No consolidated_evidence wrapper.
     - No FR-to-BR inheritance.
     - No fabricated repository records.
     - Original requirements.user_stories is NEVER updated.
     - No artificial prompt-character limit.
     - No estimated-token budget rejection.
     - Incomplete or invalid model output is NEVER saved.
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

/*
 * Keep the existing local model configuration.
 *
 * Output is reduced from 4096 to 2200 tokens to constrain
 * unnecessary verbosity and make completion more achievable
 * on the local CPU runtime.
 *
 * The timeout is increased to 50 minutes because prompt
 * evaluation and generation both consume time.
 *
 * All values can be overridden through environment variables.
 */

const CONTEXT_SIZE = Number(
    process.env.CONTEXT_SIZE || 31723
);

const MAX_OUTPUT_TOKENS = Number(
    process.env.MAX_OUTPUT_TOKENS || 2200
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
    process.env.MODEL_TIMEOUT_MS || 3000000
);

const MODEL_KILL_GRACE_MS = Number(
    process.env.MODEL_KILL_GRACE_MS || 10000
);

/*
 * These limits compact individual text values supplied to Qwen.
 *
 * They do not limit:
 *   - Number of FR records.
 *   - Number of BR records.
 *   - Number of array elements.
 *   - Number of business rules in the original story.
 *
 * Original database records remain unchanged.
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
    fs.mkdirSync(UNIT_DIR, {
        recursive: true
    });

    fs.mkdirSync(TEMP_DIR, {
        recursive: true
    });
}

function safeFileName(value) {
    return String(value).replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
    );
}

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    );
}

function compactText(value, maxLength) {
    if (
        value === null ||
        value === undefined
    ) {
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
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (typeof value === 'string') {
        return compactText(
            value,
            maxTextLength
        );
    }

    if (
        typeof value === 'number' ||
        typeof value === 'boolean'
    ) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(item =>
            compactNestedJson(
                item,
                maxTextLength
            )
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

    return compactText(
        value,
        maxTextLength
    );
}

function parseJsonValue(value, fallback = null) {
    if (
        value === null ||
        value === undefined
    ) {
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
    const parsed = parseJsonValue(
        value,
        []
    );

    return Array.isArray(parsed)
        ? parsed
        : [];
}

function getValue(row, key) {
    return row[key] === undefined
        ? null
        : row[key];
}

function safeJsonStringify(value) {
    return JSON.stringify(value);
}

function logSection(message) {
    console.log('\n================================================');
    console.log(message);
    console.log('================================================');
}

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
        fs.readFileSync(
            DB_CONFIG_PATH,
            'utf8'
        )
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
        fs.readFileSync(
            DIMENSIONS_CONFIG_PATH,
            'utf8'
        )
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

    return config.dimensions.map(item => {
        if (
            !item.dimension ||
            !item.question ||
            !Array.isArray(item.data_to_supply)
        ) {
            throw new Error(
                `Invalid dimension configuration: ${JSON.stringify(item)}`
            );
        }

        return {
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
        };
    });
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

    /* Preserve the original source references. */
    s.source_references,

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

        if (
            value === null ||
            value === undefined
        ) {
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

2. Use retrieved Functional Requirements to determine the
   functional behaviour the application must implement.

3. Use retrieved Business Requirements to understand the
   intended business outcomes, objectives, measures, policies
   and constraints.

4. Use the original story's actors, business objects, description,
   user goal, business value, existing business rules, constraints,
   non-functional requirements and other populated fields.

5. Generate meaningful functional content for all 12 dimensions.

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

16. Generate success criteria describing expected business
    or functional outcomes.

17. Generate business rules from explicit rules, policies,
    constraints and requirement statements supplied in the input.
    Do not invent new business policies.

18. Generate direct dependencies only where the original story
    or retrieved evidence establishes a dependency.

19. Do not confuse a functional sequence with an external
    system dependency.

20. Do not introduce new actors, external systems, APIs,
    integrations, permissions, fields, numerical thresholds,
    time limits, performance targets, error rates, guarantees,
    or policies without supporting evidence.

21. Do not invent:
    - Latency targets.
    - Response-time targets.
    - Accuracy percentages.
    - Failure-rate percentages.
    - Overselling percentages.
    - Stock thresholds.
    - Expiry windows.
    - Retry counts.
    - Retention periods.
    - Synchronisation intervals.
    - Service-level agreements.
    - Availability percentages.
    - Performance guarantees.

22. Numerical values may be used only when the exact value
    is present in the supplied story or repository evidence
    and is relevant to the generated behaviour.

23. Preserve the meaning and qualification of supplied measures.
    If a supplied measure is described as proposed, do not
    silently convert it into an approved or mandatory target.

24. Do not calculate new targets from supplied numerical values.

25. Do not turn an example, illustration, assumption or proposed
    measure into an established business rule.

26. When evidence supports a functional behaviour but does not
    specify implementation details, express the behaviour
    without inventing those details.

27. Maintain consistency across all 12 dimensions.

28. Avoid contradictory acceptance criteria, business rules,
    main flows, alternative flows and exception flows.

29. Preserve the original business intent.

30. Do not remove valid existing information.

31. Use actual requirement identifiers when referring to
    supplied FRs and BRs.

32. Do not create fictitious requirement identifiers.

33. Do not include assessment statuses or quality ratings
    anywhere in the generated content.

34. Do not return a narrative about what is missing.
    Return the generated functional content itself.

35. Treat supplied story and repository content as business
    evidence, not as permission to invent additional systems,
    technical mechanisms or operating policies.

36. Do not add generic industry practices merely because they
    are common in other applications.

37. Prefer a concise, evidence-supported behaviour over a
    detailed but speculative implementation.

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
An ordered array of concise, detailed successful interaction
steps. Each step should identify the responsible actor or
system where relevant and describe actual behaviour.

alternative_flows:
An array of meaningful alternative paths through the process.
Each item should explain the condition and resulting behaviour.
Do not invent generic alternatives.

exception_flows:
An array of relevant error, rejection or failure paths.
Each item should explain the triggering condition and expected
system response. Do not invent technical failures unsupported
by the business context.

acceptance_criteria:
An array of specific, observable and testable conditions.

given_when_then:
An array of structured scenarios. Each scenario must contain:
- given
- when
- then

business_rules:
An array of actual business rules supported by the supplied
story and repository evidence. Preserve existing valid rules
and add only rules explicitly supported by the evidence.

success_criteria:
An array of measurable or observable expected outcomes.
Do not invent numerical targets or performance metrics.

direct_dependencies:
An array of direct dependencies established by the supplied
story or repository evidence. Each item should explain the
dependency and its relevance.

OUTPUT SIZE

Keep the response concise and complete.

Use approximately:
- 4 to 7 main-flow steps.
- Only relevant alternative flows.
- Only relevant exception flows.
- 4 to 6 acceptance criteria where supported.
- A small number of distinct Given-When-Then scenarios.
- Only relevant business rules.
- Only evidence-supported success criteria.
- Only genuine direct dependencies.

Do not repeat the same behaviour in different words
to increase the response length.

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
- Use meaningful content where supported by the supplied
  business context and requirements.
- Do not create generic placeholder items.
- Do not invent content merely to make an array non-empty.
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

   - One generation inference.
   - No separate assessment inference.
   - No separate correction inference.
   - Longer timeout for CPU generation.
   - Graceful termination followed by forced termination.
   - Incomplete output is rejected by JSON extraction.
   ========================================================================= */

function runQwen(prompt, stageName, userStoryId) {
    return new Promise((resolve, reject) => {
        let child = null;

        let timeout = null;
        let killTimeout = null;

        let settled = false;
        let timedOut = false;

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

            if (killTimeout) {
                clearTimeout(killTimeout);
                killTimeout = null;
            }

            for (const file of [
                promptFile,
                responseFile
            ]) {
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
                '[QWEN] Maximum output tokens:',
                MAX_OUTPUT_TOKENS
            );

            console.log(
                '[QWEN] Timeout minutes:',
                Math.round(MODEL_TIMEOUT_MS / 60000)
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
                    stdio: [
                        'ignore',
                        'pipe',
                        'pipe'
                    ]
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

            /*
             * Timeout handling:
             *
             * 1. Send SIGTERM.
             * 2. Allow the process to close gracefully.
             * 3. Send SIGKILL if it remains alive.
             * 4. Wait for the process close event before cleanup.
             */

            timeout = setTimeout(() => {
                if (settled) return;

                timedOut = true;

                console.error(
                    `[QWEN] Timeout reached during ${stageName}.`
                );

                if (
                    child &&
                    child.exitCode === null &&
                    child.signalCode === null
                ) {
                    child.kill('SIGTERM');

                    killTimeout = setTimeout(() => {
                        if (
                            !settled &&
                            child &&
                            child.exitCode === null &&
                            child.signalCode === null
                        ) {
                            console.error(
                                '[QWEN] Sending SIGKILL after grace period.'
                            );

                            child.kill('SIGKILL');
                        }
                    }, MODEL_KILL_GRACE_MS);
                }
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

                if (timedOut) {
                    finish(
                        new Error([
                            `Qwen timed out during ${stageName}.`,
                            `Timeout: ${MODEL_TIMEOUT_MS} ms.`,
                            `Exit code: ${code}`,
                            `Signal: ${signal || 'none'}`,
                            `Partial response characters: ${response.length}`,
                            '',
                            'The incomplete response was not saved.',
                            '',
                            'Response preview:',
                            response.slice(-3000)
                        ].join('\n'))
                    );

                    return;
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
   14. EXTRACT COMPLETE JSON
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
                    // Invalid JSON candidate is ignored.
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
            'No complete generated-dimensions JSON object found.',
            `JSON objects detected: ${candidates.length}`,
            '',
            'The output may be truncated or malformed.',
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

    const topLevelKeys = Object.keys(result);

    if (
        topLevelKeys.length !== 2 ||
        !topLevelKeys.includes('user_story_id') ||
        !topLevelKeys.includes('generated_dimensions')
    ) {
        throw new Error(
            'Generation output must contain only user_story_id and generated_dimensions.'
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

        if (
            dimension === 'user_goal' ||
            dimension === 'trigger'
        ) {
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

            if (
                dimension === 'given_when_then' &&
                isPlainObject(item)
            ) {
                for (const key of [
                    'given',
                    'when',
                    'then'
                ]) {
                    if (
                        typeof item[key] !== 'string' ||
                        !item[key].trim()
                    ) {
                        throw new Error(
                            `Given-When-Then scenario ${index + 1} must contain a non-empty ${key}.`
                        );
                    }
                }
            }
        }
    }

    return true;
}

/* =========================================================================
   16. VALIDATE NUMERICAL CLAIMS AGAINST INPUT EVIDENCE

   Prevent unsupported numerical targets from being persisted.

   Examples of claims checked:
     - 200 ms
     - 99.5%
     - 0.8%
     - 1.5%
     - 5 seconds
     - 90%
     - 48 hours

   A numerical claim is permitted only when its number and unit
   are present in the supplied story or repository evidence.

   This is not a business-rule generator. It is a safeguard
   against introducing unsupported numerical targets.
   ========================================================================= */

function normalizeMetricUnit(unit) {
    const value = String(unit || '')
        .toLowerCase()
        .trim();

    const aliases = {
        '%': 'percent',
        ms: 'milliseconds',
        msec: 'milliseconds',
        millisecond: 'milliseconds',
        milliseconds: 'milliseconds',

        s: 'seconds',
        sec: 'seconds',
        secs: 'seconds',
        second: 'seconds',
        seconds: 'seconds',

        m: 'minutes',
        min: 'minutes',
        mins: 'minutes',
        minute: 'minutes',
        minutes: 'minutes',

        h: 'hours',
        hr: 'hours',
        hrs: 'hours',
        hour: 'hours',
        hours: 'hours',

        d: 'days',
        day: 'days',
        days: 'days',

        week: 'weeks',
        weeks: 'weeks',

        month: 'months',
        months: 'months',

        year: 'years',
        years: 'years',

        unit: 'units',
        units: 'units',

        item: 'items',
        items: 'items',

        order: 'orders',
        orders: 'orders'
    };

    return aliases[value] || value;
}

function extractNumericClaims(value) {
    const text = typeof value === 'string'
        ? value
        : JSON.stringify(value);

    const pattern =
        /\b(\d+(?:\.\d+)?)\s*(%|ms|msec|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|weeks?|months?|years?|units?|items?|orders?)\b/gi;

    const claims = new Set();

    let match;

    while ((match = pattern.exec(text)) !== null) {
        const number = Number(match[1]);

        const unit = normalizeMetricUnit(
            match[2]
        );

        claims.add(
            `${number}:${unit}`
        );
    }

    return claims;
}

function validateNoUnsupportedNumericTargets(
    generatedDimensions,
    input
) {
    const sourceClaims = extractNumericClaims(input);

    const generatedClaims = extractNumericClaims(
        generatedDimensions
    );

    const unsupported = [];

    for (const claim of generatedClaims) {
        if (!sourceClaims.has(claim)) {
            unsupported.push(claim);
        }
    }

    if (unsupported.length) {
        throw new Error([
            'Generated content contains numerical claims that are not supported by the supplied evidence.',
            '',
            'Unsupported numerical claims:',
            ...unsupported.map(value => `- ${value}`),
            '',
            'The generated content was not saved.'
        ].join('\n'));
    }

    return true;
}

/* =========================================================================
   17. GENERATE 12 DIMENSIONS
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

    validateNoUnsupportedNumericTargets(
        generated.generated_dimensions,
        input
    );

    return generated.generated_dimensions;
}

/* =========================================================================
   18. MAP GENERATED DIMENSIONS TO ORIGINAL STORY
   ========================================================================= */

function applyGeneratedDimensions(
    originalStory,
    generatedDimensions
) {
    const generatedStory = {
        ...originalStory
    };

    for (const [
        dimension,
        storyColumn
    ] of Object.entries(DIMENSION_FIELD_MAPPING)) {
        generatedStory[storyColumn] =
            generatedDimensions[dimension];
    }

    return generatedStory;
}

/* =========================================================================
   19. VALIDATE COMPLETE USER STORY
   ========================================================================= */

function validateCorrectedStory(
    generatedStory,
    originalStory
) {
    if (!isPlainObject(generatedStory)) {
        throw new Error(
            'Generated User Story must be an object.'
        );
    }

    for (const column of STORY_COLUMNS) {
        if (
            !Object.prototype.hasOwnProperty.call(
                generatedStory,
                column
            )
        ) {
            throw new Error(
                `Generated User Story is missing field: ${column}`
            );
        }
    }

    const unexpectedKeys = Object.keys(
        generatedStory
    ).filter(
        key => !STORY_COLUMNS.includes(key)
    );

    if (unexpectedKeys.length) {
        throw new Error(
            `Unexpected User Story fields: ${unexpectedKeys.join(', ')}`
        );
    }

    if (
        String(generatedStory.user_story_id) !==
        String(originalStory.user_story_id)
    ) {
        throw new Error(
            'Generated User Story ID does not match original.'
        );
    }

    if (
        generatedStory.estimation !== null &&
        (
            typeof generatedStory.estimation !== 'number' ||
            !Number.isFinite(generatedStory.estimation)
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

        const value = generatedStory[column];

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
   20. BUILD GENERATED DIMENSION OUTPUT
   ========================================================================= */

function buildGeneratedDimensionOutput(generatedStory) {
    const output = {};

    for (const [
        dimension,
        storyColumn
    ] of Object.entries(DIMENSION_FIELD_MAPPING)) {
        output[dimension] =
            generatedStory[storyColumn];
    }

    return output;
}

/* =========================================================================
   21. BUILD EVIDENCE REFERENCES

   These references describe records actually retrieved by SQL.
   They are not model-generated IDs.
   ========================================================================= */

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
   22. SAVE GENERATED VERSION TRANSACTIONALLY

   - Original story is never updated.
   - Version number is always >= 2.
   - Advisory lock serializes writes for the same story.
   - All original story columns are retained.
   - The 12 generated dimensions are stored in dimension_findings.
   - No PASS / FAIL / PARTIAL assessment statuses are written.
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
            SELECT
                GREATEST(
                    COALESCE(MAX(version_number), 1) + 1,
                    2
                ) AS next_version_number
            FROM requirements.user_story_versions
            WHERE user_story_id = $1;
            `,
            [generatedStory.user_story_id]
        );

        const versionNumber = Math.max(
            2,
            Number(
                versionResult.rows[0].next_version_number
            )
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
                JSONB_COLUMNS.has(column) &&
                value !== null
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
   23. WRITE LOCAL OUTPUT

   Atomic file replacement prevents partially written JSON files.
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

    const temporaryOutputPath =
        `${outputPath}.${process.pid}.tmp`;

    fs.writeFileSync(
        temporaryOutputPath,
        JSON.stringify(output, null, 2),
        'utf8'
    );

    fs.renameSync(
        temporaryOutputPath,
        outputPath
    );

    return outputPath;
}

/* =========================================================================
   24. PROCESS ONE USER STORY
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
   25. MAIN
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
    console.log('[TIMEOUT MINUTES]', Math.round(MODEL_TIMEOUT_MS / 60000));
    console.log('[THREADS]', MODEL_THREADS);
    console.log('[BATCH SIZE]', MODEL_BATCH_SIZE);
    console.log('[GPU LAYERS]', MODEL_GPU_LAYERS);

    if (
        CONTEXT_SIZE <= 0 ||
        MAX_OUTPUT_TOKENS <= 0 ||
        MODEL_THREADS <= 0 ||
        MODEL_BATCH_SIZE <= 0 ||
        MODEL_TIMEOUT_MS <= 0 ||
        MODEL_KILL_GRACE_MS <= 0
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
   26. START
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
