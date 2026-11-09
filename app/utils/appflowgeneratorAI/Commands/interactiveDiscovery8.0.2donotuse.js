
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
      '8.0.2.Derive_Information_Requirements'
  },

  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    NGL: '0',
    CONTEXT_SIZE: '31723',
    MAX_OUTPUT_TOKENS: '5500',
    BATCH_SIZE: '128',
    THREADS: '8',
    REASONING_MODE: 'off'
  },

  DISCOVERY: {
    SINGLE_GENERATION: true
  },

  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS:
      '7.6 Business Objects.24-10-26_06:41pm.md',

    STAGE_2_ACTORS:
      '7.7.1 Actors_list.29-10-26_05:14pm.md',

    STAGE_3_RESPONSIBILITIES:
      '7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.',

    STAGE_4_RELATIONSHIPS:
      '7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP.',

    STAGE_5_ACTIVITIES:
      '7.7.0.6.Derive_ACTOR_BUSINESS_Activities.',

    STAGE_6_INFORMATION_REQUIREMENTS:
      '7.7.0.8.Derive_Information_Requirements.05-11-26_03:40pm.md',

    STAGE_7_Merged_INFORMATION_REQUIREMENTS:
      'merged_information_requirements_06_11_26_07_50_PM.json' ,
    
    STAGE_8_validation_INFORMATION_REQUIREMENTS:
      'information_requirements_structural_validation-07-11-26_13:56.json'   
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
    ),

    mergedInformationRequirements: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_7_Merged_INFORMATION_REQUIREMENTS
    ),

    validatedInformationRequirements: resolveLatestStageFile(
      OUTPUT_DIR,
      patterns.STAGE_8_validation_INFORMATION_REQUIREMENTS
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
    ),

    mergedInformationRequirements: fs.readFileSync(
      files.mergedInformationRequirements,
      'utf8'
    ),

    validatedInformationRequirements: fs.readFileSync(
      files.validatedInformationRequirements,
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

    information_system: input.informationRequirements,

    merged_information_system: input.mergedInformationRequirements,

    validated_information_system: input.validatedInformationRequirements
  };
}

// ============================================================================
// 6. BUILD TECHNO-FUNCTIONAL INFORMATION REQUIREMENTS PROMPT
// ============================================================================



function buildInformationRequirementsPrompt(base) {
  return `


You are an expert Business Analyst, Enterprise Solution Analyst and Functional Requirements Architect.

Your task is to independently discover, reason, derive and establish the Functional Requirements for the given business domain and niche.

The objective is to produce a comprehensive, logically consistent and business-relevant Functional Requirements Catalogue.

IMPORTANT PRINCIPLE:

The supplied data sources are BASELINE BUSINESS CONTEXT, NOT THE COMPLETE DEFINITION OF THE BUSINESS AND NOT THE SOURCE OF TRUTH FOR ALL FUNCTIONAL REQUIREMENTS.

They provide initial knowledge about the business, its objects, actors, responsibilities, activities and information requirements.

You are responsible for using advanced reasoning and domain understanding to independently identify what functionality the application should provide.

Do not restrict your discovery to what is explicitly mentioned in the supplied sources.

Do not simply transform existing business activities or information requirements into functional requirements.

Do not assume that the absence of a requirement in the baseline means that the functionality is unnecessary.

Do not invent unconfirmed business policies, operational decisions, thresholds, financial rules or organisational procedures and present them as established facts.

==================================================
1. BASELINE DATA SOURCES
==================================================

DOMAIN AND NICHE:

Domain: ${base.domain}
Niche: ${base.niche}

SOURCE 1 — MERGED INFORMATION REQUIREMENTS:

${JSON.stringify(base.merged_information_system, null, 2)}

SOURCE 2 — BUSINESS OBJECTS:

${JSON.stringify(base.business_objects, null, 2)}

SOURCE 3 — ACTORS:

${base.actor_fields}

SOURCE 4 — ACTOR RESPONSIBILITIES AND AUTHORIZATIONS:

${base.actor_responsibilities}

SOURCE 5 — ACTOR–BUSINESS OBJECT RELATIONSHIPS:

${base.actor_business_object_relationships}

SOURCE 6 — BUSINESS ACTIVITIES:

${base.business_activities}

==================================================
2. INDEPENDENT FUNCTIONAL REQUIREMENTS DISCOVERY
==================================================

Analyse the supplied baseline sources together with your understanding of the specified domain and niche.

Independently reason about:

- What the business needs an application to accomplish.
- What functionality the application must provide.
- What behaviour users and other authorised actors should be able to perform.
- What information the application must capture, process, retrieve, update and communicate.
- What conditions, constraints and business rules govern that behaviour.
- What validations and exception handling are necessary.
- What outcomes must be achieved for the functionality to be considered successful.

Identify functional requirements that are:

1. Explicitly supported by the baseline.
2. Implied by relationships between baseline information.
3. Necessary to fulfil the identified business outcomes.
4. Missing from the baseline but reasonably required by the domain and niche.
5. Dependent on additional business decisions that must be clarified.

Use independent reasoning to discover missing functionality. Do not wait for the user to identify gaps.

Avoid:
- Merely renaming business activities as functional requirements.
- Creating generic CRUD requirements without meaningful business behaviour.
- Producing duplicate or overlapping requirements.
- Creating requirements that describe technical implementation rather than business functionality.
- Assuming that every business object requires a separate functional requirement.
- Treating every possible domain feature as mandatory.

==================================================
3. FUNCTIONAL REQUIREMENT DEFINITION
==================================================

Each functional requirement must describe a meaningful application capability or behaviour.

For every requirement, establish:

A. REQUIREMENT

Provide a clear, concise and uniquely identifiable functional requirement.

B. BUSINESS NEED

Explain what business need or outcome the functionality addresses.

C. FUNCTIONAL BEHAVIOUR

Describe the actual behaviour the application must provide.

Identify relevant inputs, processing, conditions, outputs and resulting actions wherever applicable.

The behaviour must be sufficiently detailed to communicate what the application is expected to do.

D. REQUIRED BY ACTORS

Identify actors who need or interact with the functionality.

Use baseline actors where applicable.

If additional actors appear necessary, do not silently invent them as established actors. Ask for clarification where their existence or responsibilities affect the requirement.

E. RELATED BUSINESS OBJECTS

Identify relevant business objects involved in the functionality.

Do not force unrelated objects into a requirement.

F. RELATED INFORMATION REQUIREMENTS

Identify relevant information requirements that support the functionality.

Do not assume that information requirements fully define the functional behaviour.

G. BUSINESS RULES

Derive meaningful business rules governing the functionality.

Consider applicable:
- Eligibility and preconditions.
- Validation and constraints.
- Calculation and decision conditions.
- Authorisation and responsibility.
- State and transition conditions.
- Exception and failure handling.
- Consistency and integrity requirements.

Rules must be specific and testable wherever possible.

Distinguish established rules from rules requiring business confirmation.

H. ACCEPTANCE CRITERIA

Define measurable and verifiable acceptance criteria.

Use Given / When / Then format.

Acceptance criteria must demonstrate:
- Expected successful behaviour.
- Relevant validation behaviour.
- Important alternative outcomes.
- Relevant exception or failure behaviour.

Do not create vague acceptance criteria such as "the system should work correctly".

Do not repeat the requirement statement as an acceptance criterion.

==================================================
4. INTELLIGENT BUSINESS QUESTIONING
==================================================

You are responsible for identifying missing business knowledge.

Do not ask the user to identify missing requirements or tell you what functionality to discover.

Instead:

1. Analyse the baseline and your independently derived candidate requirements.
2. Identify ambiguities, missing business decisions, incomplete behaviour and unresolved policies.
3. Determine which missing information materially affects the correctness or completeness of a functional requirement.
4. Generate a specific, contextual and intelligent question to establish that information.
5. Ask ONE highest-priority question at a time.
6. Wait for the user's answer.
7. Interpret the answer in the context of the domain, baseline and existing discoveries.
8. Update the affected requirements, behaviours, rules and acceptance criteria.
9. Identify the next most important unresolved question.

Questions must be generated through your own reasoning.

Do not ask questions whose answers are already established in the baseline or previous user responses.

Do not ask generic questions such as:
- What else should the application do?
- Are there any other requirements?
- Is anything missing?

Instead, ask questions that expose a specific business decision or expected application behaviour.

When a question involves multiple valid business policies, briefly explain the relevant alternatives where useful, without assuming which one is correct.

Do not block discovery of unrelated requirements while waiting for an answer to one question.

==================================================
5. DISCOVERY QUALITY
==================================================

Before considering a functional requirement complete, assess:

1. Is the business need clear?
2. Is the expected application behaviour sufficiently defined?
3. Are relevant actors identified?
4. Are relevant business objects and information requirements linked?
5. Are business rules meaningful and sufficiently defined?
6. Are acceptance criteria verifiable?
7. Are important exceptions and alternative outcomes addressed?
8. Are unresolved business decisions explicitly identified?

Use domain reasoning to determine what is relevant. Do not force every consideration into every requirement.

Do not mark a requirement as complete merely because all JSON fields are populated.

A requirement containing generic, superficial or invented content is not a complete requirement.

==================================================
6. FINAL OUTPUT
==================================================

Only after interactive discovery and clarification are complete, produce the final output.

Return ONLY valid JSON using exactly the following structure:

{
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

FINAL OUTPUT RULES:

- Return valid JSON only.
- Do not include Markdown fences or explanatory text.
- Generate unique sequential requirement IDs beginning with FR-001.
- Do not create duplicate functional requirements.
- Use arrays for all array-valued fields.
- Keep acceptance criteria in Given / When / Then structure.
- Include only relevant actor, business object and information requirement references.
- Preserve unresolved business decisions in unresolved_questions.
- Do not represent assumptions as confirmed business rules.
- Do not add additional JSON fields.
- Do not create a separate Business Capability Catalogue.
- Do not impose an arbitrary requirement count.
- Do not omit necessary functionality merely because it is absent from the baseline.

The final catalogue must represent the functional behaviour the application needs to provide for the specified domain and niche, established through baseline analysis, independent reasoning and user-confirmed business decisions.


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
    // const assistantResponse = extractAssistantResponse(
    //   rawResponse
    // );

    // if (!assistantResponse || !assistantResponse.trim()) {
    //   throw new Error('Extracted assistant response is empty.');
    // }

    // 7. Generate output path.
    const outputPath = generateOutputFilePath();

    // 8. Save complete assistant response.
    saveResponseToFile(
      rawResponse,
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
