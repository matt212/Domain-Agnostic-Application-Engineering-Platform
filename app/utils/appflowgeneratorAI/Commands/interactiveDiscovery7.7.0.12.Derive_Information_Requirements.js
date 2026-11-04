
'use strict';

/**
 * ============================================================================
 * DOMAIN-AGNOSTIC TECHNO-FUNCTIONAL INFORMATION REQUIREMENTS ELABORATION
 * ============================================================================
 *
 * PROCESS:
 * 1. Discover latest business-context input files.
 * 2. Read business objects, actors, responsibilities, relationships,
 *    activities and parent information requirements.
 * 3. Extract domain and niche.
 * 4. Build the techno-functional elaboration prompt.
 * 5. Execute Qwen once and wait for completion.
 * 6. Extract the final assistant response.
 * 7. Save the complete assistant response without parsing or validating it.
 *
 * REUSABILITY:
 * - Input files are resolved using filename prefixes.
 * - New timestamped files can be used without changing exact filenames.
 * - The response is not tied to a JavaScript validation schema.
 *
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// ============================================================================
// 1. CONFIGURATION
// ============================================================================

const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),

    OUTPUT_RELATIVE_DIR:
      'app/utils/appflowgeneratorAI/aiOutput/baseline/',

    TMP_RELATIVE_DIR:
      'app/utils/appflowgeneratorAI/promptFile',

    EXPORT_PREFIX:
      '7.7.0.12.Derive_Information_Requirements'
  },

  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
    NGL: '0',
    CONTEXT_SIZE: '24576',
    MAX_OUTPUT_TOKENS: '8192',
    BATCH_SIZE: '512',
    THREADS: '8',
    REASONING_MODE: 'off'
  },

  DISCOVERY: {
    SINGLE_GENERATION: true
  },

  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS:
      '7.6 Business Objects.',

    STAGE_2_ACTORS:
      '7.7.1 Actors_list.',

    STAGE_3_RESPONSIBILITIES:
      '7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.',

    STAGE_4_RELATIONSHIPS:
      '7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP.',

    STAGE_5_ACTIVITIES:
      '7.7.0.6.Derive_ACTOR_BUSINESS_Activities.',

    STAGE_6_INFORMATION_REQUIREMENTS:
      '7.7.0.8.Derive_Information_Requirements.'
  }
};

const OUTPUT_DIR = path.join(
  CONFIG.PATHS.PROJECT_ROOT,
  CONFIG.PATHS.OUTPUT_RELATIVE_DIR
);

const TEMP_DIR = path.join(
  CONFIG.PATHS.PROJECT_ROOT,
  CONFIG.PATHS.TMP_RELATIVE_DIR
);

// ============================================================================
// 2. FILE DISCOVERY
// ============================================================================

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
  const patterns = CONFIG.SCANNING_PATTERNS;

  const files = {
    businessObjects: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_1_OBJECTS
    ),

    actors: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_2_ACTORS
    ),

    actorResponsibilities: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_3_RESPONSIBILITIES
    ),

    actorBusinessObjectRelationships: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_4_RELATIONSHIPS
    ),

    businessActivities: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_5_ACTIVITIES
    ),

    informationRequirements: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_6_INFORMATION_REQUIREMENTS
    )
  };

  const missingFiles = Object.entries(files)
    .filter(([, filePath]) => !filePath)
    .map(([name]) => name);

  if (missingFiles.length > 0) {
    throw new Error(
      `Required input files not found: ${missingFiles.join(', ')}`
    );
  }

  console.log('\n========== INPUT FILES ==========');

  for (const [name, filePath] of Object.entries(files)) {
    console.log(`${name}: ${path.basename(filePath)}`);
  }

  return files;
}

// ============================================================================
// 3. READ INPUT FILES
// ============================================================================

function readInputFiles(files) {
  return {
    objects: fs.readFileSync(files.businessObjects, 'utf8'),

    actors: fs.readFileSync(files.actors, 'utf8'),

    responsibilities: fs.readFileSync(
      files.actorResponsibilities,
      'utf8'
    ),

    relationships: fs.readFileSync(
      files.actorBusinessObjectRelationships,
      'utf8'
    ),

    activities: fs.readFileSync(
      files.businessActivities,
      'utf8'
    ),

    informationRequirements: fs.readFileSync(
      files.informationRequirements,
      'utf8'
    )
  };
}

// ============================================================================
// 4. EXTRACT DOMAIN, NICHE AND BUSINESS OBJECT CONTENT
// ============================================================================

function extractJsonContent(rawContent) {
  const content = String(rawContent || '').trim();

  // First try parsing the complete content.
  try {
    return JSON.parse(content);
  } catch (_) {
    // Continue to extract JSON if the file contains surrounding text.
  }

  // Remove an optional Markdown JSON code fence.
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

function extractDomain_Niche_Main_Content(objectsData) {
  const parsed = extractJsonContent(objectsData);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
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

// ============================================================================
// 5. BUILD BUSINESS CONTEXT
// ============================================================================

function buildBaseContext(input) {
  const extracted = extractDomain_Niche_Main_Content(
    input.objects
  );

  return {
    domain: extracted.primarydataset.domain,

    niche: extracted.primarydataset.niche,

    business_objects: extracted.mainContent,

    actor_fields: input.actors,

    actor_responsibilities: input.responsibilities,

    actor_business_object_relationships: input.relationships,

    business_activities: input.activities,

    information_system: input.informationRequirements
  };
}

// ============================================================================
// 6. BUILD TECHNO-FUNCTIONAL INFORMATION REQUIREMENTS PROMPT
// ============================================================================

function buildInformationRequirementsPrompt(base) {
  return `
You are a Senior Business Analyst, Domain Architect, Information Architect and Domain Specialist.

Your task is to discover the business information flows associated with every supplied Information Requirement.

Perform intelligent, domain-driven discovery using the supplied business context as a baseline. Do not simply repeat the input. Reason about how information originates, moves between business actors and objects, is consumed, and supports business operations.

Your objective is to identify the actual business information flow, not design technical integrations.

# 1. INPUT CONTEXT

**Domain:**
${base.domain}

**Niche:**
${base.niche}

### 2.1 Existing Business Objects
${JSON.stringify(base.business_objects, null, 2)}

### 2.2 Existing Business Actors
${base.actor_fields}

### 2.3 Actor Responsibilities and Authorizations
${base.actor_responsibilities}

### 2.4 Actor and Business Object Relationships
${base.actor_business_object_relationships}

### 2.5 Existing Business Activities
${base.business_activities}

### 2.6 Information Requirements
${JSON.stringify(base.information_system, null, 2)}

# 2. INFORMATION FLOW DISCOVERY

For every Information Requirement, independently discover its information flow.

Use the following questions as an internal reasoning framework. Explore the relevant questions rather than mechanically producing an answer for each one.

## A. SOURCE DISCOVERY

Determine where the required information originates.

Ask yourself:

1. Which business actor initially provides or creates this information?
2. Which business object contains or represents the originating information?
3. Is the information generated through a business activity or transaction?
4. Is it derived from another business object or existing information?
5. Does another business actor or external business entity provide it?
6. Is the information maintained by an operational business function?
7. Can multiple legitimate sources contribute to the information?
8. Which source is authoritative when multiple sources exist?
9. Is the information directly captured, derived or received?
10. What is the most defensible business source based on the supplied context?

Identify the business source, not an assumed technical system.

## B. CONSUMER DISCOVERY

Determine who or what uses the information.

Ask yourself:

1. Which actors need this information to perform their responsibilities?
2. Which business activities depend on it?
3. Which business objects consume, reference or depend on it?
4. Does the information support a business decision or operational action?
5. Is it consumed by another business function or organisational role?
6. Does it support customer, partner, operational, financial or regulatory activities?
7. Are there multiple legitimate consumers?
8. Which consumers require the information directly versus indirectly?
9. What business responsibility makes each consumer relevant?

Identify actual business consumers. Do not add generic platform components or hypothetical engines without justification.

## C. TRIGGER DISCOVERY

Determine what causes the information to be created, provided, updated or made available.

Ask yourself:

1. What business event first creates the information?
2. Is it triggered by a customer request, business transaction or operational activity?
3. Does a change in a related business object trigger an update?
4. Is it generated by a lifecycle transition or business status change?
5. Is it supplied in response to another actor's request?
6. Is it required before a particular business activity can proceed?
7. Does it change when an underlying business condition changes?
8. Is the trigger event-driven, request-driven, transaction-driven or periodic?
9. Is a periodic trigger genuinely established or necessary?
10. What is the actual business event, rather than an assumed technical scheduling mechanism?

Describe the business trigger. Do not invent update intervals, frequencies or technical event mechanisms.

## D. BUSINESS OUTCOME DISCOVERY

Determine what the information enables or supports.

Ask yourself:

1. What business decision does this information support?
2. What business activity becomes possible through its availability?
3. What business object is created, maintained or updated using it?
4. Does it enable a transaction, fulfilment activity or operational decision?
5. Does it support financial, compliance, service or customer outcomes?
6. What business dependency would be affected if the information were unavailable or incorrect?
7. What is the direct outcome of providing this information?
8. Does the outcome reflect the actual Information Requirement rather than a speculative downstream benefit?

Describe the resulting business outcome, not a technical implementation result.

# 3. CROSS-CONTEXT REASONING

Before determining each flow, correlate:

- Information Requirement and its business purpose.
- Business objects and their relationships.
- Actors and their responsibilities.
- Actor authorisations and permitted business activities.
- Business activities that create, modify or consume the information.
- Dependencies between the information and related business objects.

Use established domain knowledge to identify reasonable implicit information flows.

Distinguish between:
- Information origin and information storage.
- Information provider and information consumer.
- Business event and technical update mechanism.
- Information outcome and downstream workflow action.

Do not assume that the actor who creates information is necessarily its only source or consumer.

# 4. DISCOVERY QUALITY RULES

1. Discover the information flow independently for every Information Requirement.
2. Identify all materially relevant sources and consumers where justified.
3. Do not impose a fixed number of sources or consumers.
4. Use business actors, business objects and activities from the supplied context wherever applicable.
5. Domain knowledge may be used to infer legitimate business sources and consumers.
6. Treat supplied information as a baseline, not a closed set of facts.
7. Do not invent organisation-specific systems, APIs, integrations, vendors or platforms.
8. Do not invent synchronisation intervals, processing frequencies, response times or update schedules.
9. Do not assume a particular technical architecture or communication mechanism.
10. Do not introduce hypothetical actors, consumers or processing engines without a defensible business reason.
11. When the precise source, consumer or trigger is unknown, describe the logical business role or event generically.
12. Do not present uncertain technical assumptions as established business facts.
13. Avoid duplicate consumers and redundant descriptions.
14. Keep each information flow directly relevant to its Information Requirement.

# 5. OUTPUT CONTENT AND LENGTH CONTROL

For each Information Requirement, produce:

**source**
- Concise identification of the originating business actor, object or business function.
- Maximum 120 characters.

**consumer**
- Array of distinct business actors, business functions or justified business objects.
- Maximum 100 characters per consumer entry.

**trigger**
- Concise description of the originating business event or information change.
- Maximum 160 characters.

**outcome**
- Concise description of the business purpose or result supported by the information.
- Maximum 160 characters.

Use precise business terminology. Avoid explanations, examples, alternatives and technical implementation details.

Do not generate additional content merely to increase output size.

# 6. OUTPUT STRUCTURE

Return exactly one object per input Information Requirement, preserving the original order and exact requirement name or description.

[
  {
    "information_requirement": "Exact input Information Requirement",
    "information_flow": {
      "source": "Originating business source",
      "consumer": [
        "Relevant business consumer"
      ],
      "trigger": "Business event that creates or updates the information",
      "outcome": "Business outcome supported by the information"
    }
  }
]

# 7. STRICT OUTPUT CONSTRAINTS

- Return valid JSON only.
- Include exactly one object per Information Requirement.
- Preserve input order and exact requirement names.
- Include exactly the two top-level properties shown.
- information_flow must always be an object.
- source, trigger and outcome must always be non-empty strings.
- consumer must always be a non-empty array.
- Enforce all specified character limits.
- Do not add IDs, functional_rules, information_validation or other properties.
- Do not omit any Information Requirement.
- Do not output internal reasoning or discovery questions.
- Do not include Markdown or commentary outside the JSON array.

Prioritise accurate business information lineage, defensible domain reasoning and logical completeness over technical assumptions or verbosity.
  `
}

// ============================================================================
// 7. EXECUTE QWEN - SINGLE GENERATION
// ============================================================================

function runLlamaGeneration(prompt, tempDirectory) {
  return new Promise((resolve, reject) => {
    const stamp = `${Date.now()}`;

    const promptPath = path.join(
      tempDirectory,
      `information_requirements_prompt_${stamp}.txt`
    );

    const responsePath = path.join(
      tempDirectory,
      `information_requirements_response_${stamp}.txt`
    );

    fs.mkdirSync(tempDirectory, { recursive: true });

    fs.writeFileSync(promptPath, prompt, 'utf8');

    const args = [
      '-hf', CONFIG.MODEL.IDENTIFIER,
      '-ngl', CONFIG.MODEL.NGL,
      '--single-turn',
      '-c', CONFIG.MODEL.CONTEXT_SIZE,
      '-b', CONFIG.MODEL.BATCH_SIZE,
      '-t', CONFIG.MODEL.THREADS,
      '--reasoning', CONFIG.MODEL.REASONING_MODE,
      '--log-disable',
      '-n', CONFIG.MODEL.MAX_OUTPUT_TOKENS,
      '-f', promptPath,
      '-o', responsePath
    ];

    const startedAt = Date.now();

    console.log('\n========== MODEL GENERATION ==========');
    console.log(`Model: ${CONFIG.MODEL.IDENTIFIER}`);
    console.log('Generation: Single pass');
    console.log('Waiting for llama-cli to finish...');

    execFile(
      CONFIG.MODEL.EXEC_BINARY,
      args,
      {
        maxBuffer: 50 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        try {
          const elapsedSeconds = (
            (Date.now() - startedAt) / 1000
          ).toFixed(1);

          if (error) {
            throw new Error(
              `llama-cli execution failed:\n${error.message}\n${stderr || ''}`
            );
          }

          if (!fs.existsSync(responsePath)) {
            throw new Error(
              'llama-cli did not create the response file.'
            );
          }

          const rawResponse = fs.readFileSync(
            responsePath,
            'utf8'
          );

          if (!rawResponse.trim()) {
            throw new Error(
              'llama-cli generated an empty response.'
            );
          }

          console.log(
            `Generation completed in ${elapsedSeconds} seconds.`
          );

          console.log(
            `Raw response length: ${rawResponse.length} characters`
          );

          cleanup();

          resolve(rawResponse);

        } catch (generationError) {
          cleanup();
          reject(generationError);
        }
      }
    );

    function cleanup() {
      for (const filePath of [promptPath, responsePath]) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.warn(
            `Temporary file cleanup warning: ${error.message}`
          );
        }
      }
    }
  });
}

// ============================================================================
// 8. EXTRACT ASSISTANT RESPONSE
// ============================================================================


function extractAssistantResponse(rawResponse) {
  const response = String(rawResponse || '');

  if (!response.trim()) {
    throw new Error('Raw model response is empty.');
  }

  /**
   * Recognizes standalone assistant message headers:
   *
   * assistant
   * assistant:
   * <|im_start|>assistant
   * <|im_start|>assistant:
   *
   * Search backwards, but skip markers that have no actual
   * response content after them.
   */

  const assistantMarker =
    /(?:^|\r?\n)[ \t]*(?:<\|im_start\|>)?assistant(?::)?[ \t]*(?:\r?\n)/gi;

  const matches = [...response.matchAll(assistantMarker)];

  if (!matches.length) {
    throw new Error(
      'No standalone assistant response marker found.'
    );
  }

  // Examine markers from the end towards the beginning.
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];

    const responseStart =
      match.index + match[0].length;

    let candidate = response
      .slice(responseStart)
      .trim();

    // Skip empty assistant headers.
    if (!candidate) {
      continue;
    }

    // Remove a trailing conversation terminator, if present.
    candidate = candidate
      .replace(/\s*(?:<\|im_end\|>|<\|end_of_turn\|>|<\|fim_suffix\|>)\s*$/i, '')
      .trim();

    // Skip markers followed only by an empty terminator.
    if (!candidate) {
      continue;
    }

    console.log('\n========== ASSISTANT RESPONSE EXTRACTION ==========');

    console.log(`Assistant markers found: ${matches.length}`);
    console.log(`Selected marker: ${i + 1}`);
    console.log(`Removed preceding characters: ${responseStart}`);
    console.log(`Extracted response characters: ${candidate.length}`);

    return candidate;
  }

  throw new Error(
    'Assistant markers were found, but none contained response content.'
  );
}


// ============================================================================
// 9. OUTPUT FILE PATH
// ============================================================================

function generateOutputFilePath() {
  const now = new Date();

  const day = String(now.getDate()).padStart(2, '0');

  const month = String(now.getMonth() + 1).padStart(2, '0');

  const year = String(now.getFullYear()).slice(-2);

  let hours = now.getHours();

  const minutes = String(now.getMinutes()).padStart(2, '0');

  const ampm = hours >= 12 ? 'pm' : 'am';

  hours = hours % 12 || 12;

  const formattedHours = String(hours).padStart(2, '0');

  const timestamp =
    `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;

  const outputDirectory = path.dirname(OUTPUT_DIR);

  return path.join(
    outputDirectory,
    `${CONFIG.PATHS.EXPORT_PREFIX}.${timestamp}.md`
  );
}

// ============================================================================
// 10. SAVE COMPLETE ASSISTANT RESPONSE
// ============================================================================

function saveResponseToFile(response, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), {
    recursive: true
  });

  // Save the complete extracted response without parsing,
  // restructuring, validating or filtering its content.

  fs.writeFileSync(
    outputPath,
    response,
    'utf8'
  );

  const stats = fs.statSync(outputPath);

  console.log('\n========== OUTPUT SAVED ==========');
  console.log(`File: ${outputPath}`);
  console.log(`Size: ${stats.size} bytes`);

  return outputPath;
}

// ============================================================================
// 11. MAIN EXECUTION
// ============================================================================

async function generateSemanticBlueprintAI() {
  try {
    console.log('\n');
    console.log('====================================================');
    console.log(' TECHNO-FUNCTIONAL INFORMATION REQUIREMENTS');
    console.log('====================================================');

    // 1. Resolve latest input files.
    const inputFiles = resolveInputFiles();

    // 2. Read all input files.
    const input = readInputFiles(inputFiles);

    // 3. Build business context.
    const base = buildBaseContext(input);

    console.log('\n========== BUSINESS CONTEXT ==========');
    console.log(`Domain: ${base.domain}`);
    console.log(`Niche: ${base.niche}`);

    // 4. Build complete prompt.
    const prompt = buildInformationRequirementsPrompt(base);

    if (!prompt || !prompt.trim()) {
      throw new Error('Prompt generation returned empty content.');
    }

    console.log('\n========== PROMPT ==========');
    console.log(`Prompt length: ${prompt.length} characters`);

    // 5. Execute one model generation and await completion.
    const rawResponse = await runLlamaGeneration(
      prompt,
      TEMP_DIR
    );

    // 6. Extract assistant response.
    const assistantResponse = extractAssistantResponse(
      rawResponse
    );

    if (!assistantResponse || !assistantResponse.trim()) {
      throw new Error('Extracted assistant response is empty.');
    }

    // 7. Generate output path.
    const outputPath = generateOutputFilePath();

    // 8. Save complete assistant response.
    saveResponseToFile(
      assistantResponse,
      outputPath
    );

    console.log('\n====================================================');
    console.log(' GENERATION COMPLETED SUCCESSFULLY');
    console.log('====================================================');

    console.log('Model generation: Completed');
    console.log('Assistant response extraction: Completed');
    console.log('Response parsing: Not performed');
    console.log('Response schema validation: Not performed');
    console.log('Response content filtering: Not performed');
    console.log('Output file writing: Completed');

    console.log(`\nOutput: ${outputPath}`);

    return outputPath;

  } catch (error) {
    console.error('\n====================================================');
    console.error(' GENERATION FAILED');
    console.error('====================================================');

    console.error(error.stack || error.message);

    process.exitCode = 1;

    return null;
  }
}

// ============================================================================
// 12. EXECUTION
// ============================================================================

generateSemanticBlueprintAI();
