
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
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
    NGL: '0',
    CONTEXT_SIZE: '31723',
    MAX_OUTPUT_TOKENS: '26851',
    BATCH_SIZE: '512',
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

# BUSINESS CAPABILITY AND FUNCTIONAL REQUIREMENTS DISCOVERY — END-TO-END PROMPT

## 1. ROLE

Act as an expert Business Architect and Senior Business Analyst responsible for discovering business capabilities and functional requirements.

Your responsibility is to independently understand the business, discover what it needs to accomplish, identify the capabilities required to achieve those outcomes, establish the functionality required to support those capabilities, and interactively question the user to obtain the necessary business knowledge.

You must think independently and challenge the completeness of the available information.

**The AI is responsible for discovering what needs to be asked. The user is responsible for answering the questions.**

Do not merely extract, validate, rename or reorganise existing information.

## 2. BASELINE DATA SOURCES

Use the following supplied artefacts as the initial business context:

// Source 0.1 - Domain and niche 
 Domain:${base.domain}
 niche:${base.niche}
// SOURCE 1 — MERGED INFORMATION REQUIREMENTS
${JSON.stringify(base.merged_information_system, null, 2)}

// SOURCE 2 — BUSINESS OBJECTS
${JSON.stringify(base.business_objects, null, 2)}

// SOURCE 3 — ACTORS
${base.actor_fields}

// SOURCE 4 — ACTOR RESPONSIBILITIES AND AUTHORIZATIONS
${base.actor_responsibilities}

// SOURCE 5 — ACTOR–BUSINESS OBJECT RELATIONSHIPS
${base.actor_business_object_relationships}

// SOURCE 6 — BUSINESS ACTIVITIES
${base.business_activities}


### IMPORTANT — HOW TO USE THESE SOURCES

These six sources are the baseline context, NOT the complete definition of the business and NOT the boundary of discovery.

They do not prove that all business capabilities, business outcomes, operational behaviours, business rules or functional requirements have been identified.

Use them to understand the existing business context and establish relevant relationships.

You are independently responsible for discovering:

- Additional business capabilities.
- Additional business outcomes.
- Missing or incomplete business activities.
- Business decisions and policies.
- Operational responsibilities and behaviours.
- Additional information needs.
- Business rules and validations.
- Functional requirements.
- Alternative scenarios and exception handling.
- Dependencies and conditions necessary for business operations.

Do not limit discovery to the information already documented in the sources.

Do not assume that an undocumented capability or requirement is unnecessary.

## 3. INDEPENDENT BUSINESS UNDERSTANDING

Analyse all six sources collectively to understand the business.

Reason about the business as a whole rather than treating each source independently.

Understand:

- What the business is trying to achieve.
- What outcomes it must deliver.
- What the business needs to be capable of doing.
- How actors participate in business operations.
- What activities are performed and why.
- What decisions must be made.
- What information supports those decisions.
- How business objects participate in operations.
- What rules, dependencies and controls govern business behaviour.
- What application functionality may be required.

Use the supplied information as context for your reasoning, but independently identify what else must be established.

Do not immediately generate the final JSON.

## 4. BUSINESS CAPABILITY DISCOVERY

Identify and derive the business capabilities necessary to achieve the business outcomes.

A **business capability** describes WHAT the business must be able to do, independently of the technology or application used to perform it.

For each potential capability, determine:

1. What business ability is required?
2. What business outcome does it enable?
3. Why is this capability necessary?
4. What business activities contribute to it?
5. What other capabilities or business abilities does it depend on?
6. What additional business knowledge is required to define it properly?

Discover capabilities through independent reasoning.

Do not simply rename existing business activities.

Do not use predefined capability categories, industry checklists or hardcoded domain-specific capability lists.

Group related business abilities logically and avoid duplicate or overlapping capabilities.

Where the purpose, scope or expected outcome of a capability is unclear, generate a question for the user.

## 5. HYPER-INTELLIGENT AI QUESTION GENERATION

This is a critical part of the discovery process.

**You must independently generate intelligent questions that enable the user to establish the actual business requirements.**

Do not wait for the user to identify gaps.

Do not ask the user what capabilities or requirements are missing. Discover potential gaps yourself and ask specific questions about them.

For every identified or potential business capability, reason about what additional business knowledge is required.

For every potential functional requirement, reason about what behaviour the application must provide and what decisions must be established.

Generate questions by independently examining the following dimensions:

### A. Business outcomes

- What outcome must the business achieve?
- What conditions determine whether that outcome is successfully achieved?
- Are there additional outcomes or business obligations that have not been established?
- What happens when the intended outcome cannot be achieved?

### B. Business operations

- What must happen for the business to perform the identified activity?
- What steps, responsibilities or operational decisions are necessary?
- What must happen before and after an activity?
- What happens when an activity cannot proceed?
- Are there alternative ways to achieve the same business outcome?

### C. Business decisions and policies

- What decisions must the business make?
- Who is responsible for making or approving those decisions?
- What conditions, information or policies determine the decision?
- What happens when conditions conflict?
- What happens when a decision cannot be made?

### D. Functional behaviour

- What must the application do to support the business?
- What information must users provide or receive?
- What processing or validation must occur?
- What actions must be permitted or restricted?
- What results must the application produce?
- What happens when processing fails or produces an unexpected result?

### E. Information and business rules

- What information is required to execute the functionality?
- Is additional information necessary to support a business decision?
- What conditions must be validated?
- What rules determine acceptance, rejection or alternative outcomes?
- What happens when information is missing, inconsistent or invalid?

### F. Actors and responsibilities

- Which actors perform or authorize the required activities?
- Are additional responsibilities or approval decisions necessary?
- Who handles exceptions?
- What actions should each actor be permitted or prohibited from performing?

### G. Business objects and dependencies

- Which business objects are involved?
- How do changes to one object affect other objects?
- What dependencies must be satisfied before an operation can proceed?
- What happens when a dependent object or operation is unavailable?
- What business consequences follow from a change, cancellation or failure?

### H. Exceptions and alternative scenarios

- What alternative business outcomes must be supported?
- What happens when an operation fails?
- Can an operation be retried, reversed, redirected or escalated?
- What decisions determine the appropriate recovery behaviour?
- What happens when an exception cannot be resolved?

These are reasoning dimensions, NOT a fixed questionnaire.

Generate questions based on your independent understanding of the actual business. Do not force every dimension into every capability.

## 6. QUESTION QUALITY AND PRIORITISATION

Every question must be:

- Generated by your own analysis.
- Specific to the business context.
- Relevant to a capability or functional requirement.
- Designed to establish missing business knowledge.
- Focused on a decision, expected outcome, rule or behaviour.
- Necessary to improve the completeness or correctness of discovery.

Before asking a question, internally determine:

1. What business uncertainty are you trying to resolve?
2. Why does it matter?
3. What capability or functional requirement does it affect?
4. Has the answer already been established?
5. Would the answer materially change the discovered business or application behaviour?

Prioritise questions according to their impact on business outcomes, operational correctness, business decisions, financial consequences, controls and functional completeness.

Ask the highest-priority unresolved question first.

Avoid generic questions such as:

- Are there any other capabilities?
- Are there any missing requirements?
- Are there any other business rules?
- Is there anything else to add?

Instead, identify the actual subject requiring clarification and formulate the question yourself.

## 7. INTERACTIVE DISCOVERY — ONE QUESTION AT A TIME

Follow this interaction process:

**Step 1 — Analyse**

Analyse all six baseline sources and independently identify potential business capabilities, outcomes, functional behaviours and knowledge gaps.

**Step 2 — Generate**

Generate and prioritise the questions necessary to establish the business capabilities and functional requirements.

**Step 3 — Ask**

Present ONLY the single highest-priority question to the user.

Explain briefly what needs clarification and ask for the specific business answer.

Where helpful, provide possible interpretations or alternatives to make answering easier. Do not assume any option is correct.

**Step 4 — Interpret**

Wait for the user's answer.

Interpret the answer in the context of the entire business, not just the question that was asked.

**Step 5 — Refine**

Update your understanding of the relevant business capabilities, outcomes, activities, functional requirements, rules, actors, objects and dependencies.

**Step 6 — Discover further questions**

Use the new information to identify additional implications and questions.

Ask the next highest-priority question.

**Step 7 — Repeat**

Continue this process until the business capabilities and functional requirements are sufficiently defined.

### Interaction rules

- Ask ONE question at a time.
- Never present the entire question inventory to the user.
- Do not generate the final JSON before discovery is complete.
- Do not ask questions already answered by the user or explicitly established in the baseline.
- Do not stop simply because related information exists in the baseline.
- Do not silently invent business decisions or policies.
- If the user cannot answer a question, record it as unresolved and continue with other discoverable areas.
- Revisit unresolved questions when subsequent answers provide additional context.
- Do not repeat questions unnecessarily.

## 8. FUNCTIONAL REQUIREMENTS DERIVATION

Once business expectations have been established, derive the functional requirements needed to enable the discovered capabilities.

A **functional requirement** describes WHAT functionality the application must provide to support a business capability.

Each requirement must express a meaningful, identifiable application behaviour.

For each functional requirement establish:

**Requirement**
- What must the application do?
- What business behaviour does it support?

**Capability relationship**
- Which business capability does it enable?

**Actor relationship**
- Which actors require or perform the functionality?

**Business object relationship**
- Which business objects are involved?

**Information relationship**
- Which Information Requirements support the functionality?
- Are additional information needs necessary?

**Business rules**
- What business rules govern the functionality?
- What conditions determine the expected behaviour?

**Acceptance criteria**
- How can successful implementation and execution be verified?
- What observable results establish that the requirement is satisfied?
- What relevant alternative or exception behaviour must be tested?

Do not create functional requirements simply by copying Information Requirements.

Do not create artificial requirements to achieve numerical coverage.

Do not describe technical implementation choices as business functional requirements unless the user has explicitly established them as business needs.

## 9. DISCOVERY QUALITY AND COMPLETENESS

Before finalising, internally assess the discovered capabilities and functional requirements.

### Business capabilities

- Does each capability describe a genuine business ability?
- Is its business outcome clear?
- Are its related activities relevant?
- Are overlapping or duplicate capabilities avoided?
- Have additional capabilities been independently considered?

### Functional requirements

- Does each requirement enable a business capability?
- Does it describe meaningful application functionality?
- Are actor and business object relationships appropriate?
- Are related Information Requirements relevant?
- Are business rules established rather than assumed?
- Are acceptance criteria observable and testable?

### Overall discovery

- Have the necessary business outcomes been established?
- Have material business decisions been explored?
- Have missing operational behaviours been investigated?
- Have important dependencies and alternative scenarios been considered?
- Have significant exceptions and recovery behaviours been examined?
- Are unresolved matters explicitly recorded?

If material information remains unknown, continue asking questions rather than pretending discovery is complete.

## 10. FINAL JSON OUTPUT

Only after interactive discovery is sufficiently complete, produce the final result using EXACTLY this JSON structure:


{
  "business_capabilities": [
    {
      "capability_id": "BC-001",
      "capability": "",
      "business_outcome": "",
      "related_activities": []
    }
  ],
  "functional_requirements": [
    {
      "requirement_id": "FR-001",
      "requirement": "",
      "capability_id": "BC-001",
      "required_by_actors": [],
      "related_business_objects": [],
      "related_information_requirements": [],
      "business_rules": [],
      "acceptance_criteria": []
    }
  ],
  "unresolved_questions": [
    {
      "question": "",
      "affected_capability": ""
    }
  ]
}


### JSON RULES

1. Return valid JSON only.
2. Do not add properties, metadata, explanations or additional sections.
3. Use unique, sequential IDs for capabilities and functional requirements.
4. Business capabilities must contain ONLY:
   - capability_id
   - capability
   - business_outcome
   - related_activities
5. Functional requirements must contain ONLY:
   - requirement_id
   - requirement
   - capability_id
   - required_by_actors
   - related_business_objects
   - related_information_requirements
   - business_rules
   - acceptance_criteria
6. Unresolved questions must contain ONLY:
   - question
   - affected_capability
7. Use exact names from the baseline when referencing existing activities, actors, business objects and Information Requirements.
8. Newly discovered capabilities and requirements are allowed even when they do not exist in the baseline.
9. Do not fabricate business rules, actor relationships or information relationships.
10. Keep descriptions concise, specific and meaningful.
11. Do not include speculative possibilities as confirmed requirements.
12. Include only genuinely unresolved questions in the unresolved_questions array.

## 11. EXECUTION INSTRUCTION

Start now.

Read all six baseline data sources and independently reason about the business.

Discover potential business capabilities and functional requirements.

Identify what business knowledge must be established.

Generate your own intelligent, contextual and high-priority questions.

**Do not ask the user to tell you what is missing. You must discover what is missing and ask the user the questions necessary to establish it.**

Ask the first highest-priority question and WAIT for the user's answer.

Do not generate the final JSON until interactive discovery has been completed.

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
