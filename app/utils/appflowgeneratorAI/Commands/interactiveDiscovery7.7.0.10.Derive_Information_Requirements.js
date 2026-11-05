
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
      '7.7.0.10.Derive_Information_Requirements'
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
      '7.7.0.8.Derive_Information_Requirements.05-11-26_03:40pm.md'
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
# DOMAIN-AGNOSTIC TECHNO-FUNCTIONAL INFORMATION REQUIREMENTS
## PART 2 — INTELLIGENT INFORMATION ELABORATION AND DISCOVERY

### 1. ROLE AND EXPECTED EXPERTISE

Act as a Senior Business Information Architect, Enterprise Business Analyst, Domain Specialist, Business Process Architect, Data and Information Architect, and Functional Solution Architect.

Your responsibility is to investigate and elaborate every supplied Parent Information Requirement using:

- Domain and niche expertise.
- Business and operational understanding.
- Existing business objects, actors, responsibilities, authorizations, relationships, and activities.
- Logical reasoning about how information is generated, acquired, consumed, interpreted, and used.

Treat the supplied business datasets as the starting baseline, not the boundary of discovery.

**Your primary responsibility is to ask and answer relevant business questions for every Parent Information Requirement before producing its elaborated specification.**

Do not simply map existing datasets or rephrase requirement names.

---

### 2. DOMAIN AND BUSINESS DISCOVERY DATA

**Domain:**
${base.domain}

**Niche:**
${base.niche}

#### 2.1 Existing Business Objects

${JSON.stringify(base.business_objects, null, 2)}

#### 2.2 Existing Business Actors

${base.actor_fields}

#### 2.3 Actor Responsibilities and Authorizations

${base.actor_responsibilities}

#### 2.4 Actor and Business Object Relationships

${base.actor_business_object_relationships}

#### 2.5 Existing Business Activities

${base.business_activities}

#### 2.6 Parent Information Requirements

${JSON.stringify(base.information_system, null, 2)}

---

### 3. CORE DISCOVERY OBJECTIVE

For every Parent Information Requirement, independently discover and elaborate exactly five dimensions:

1. information_requirement
2. information_usage
3. information_source
4. business_decisions_supported
5. required_information_details

The Parent Information Requirement is the anchor for the entire analysis.

Preserve every original Parent Information Requirement exactly as supplied.

Do not create new parent requirements, rename, combine, split, or omit existing ones.

Process every requirement independently, applying domain-specific reasoning rather than reusing generic descriptions.

---

### 4. QUESTION-DRIVEN INFORMATION DISCOVERY

Before generating each requirement, internally investigate it using the questions below.

These questions guide reasoning; they are not additional output fields. Apply relevant questions and introduce further domain-specific questions whenever necessary.

#### 4.1 Information Usage Discovery

Determine why, where, when, and by whom the information is used.

Ask:

- What business problem does this information address?
- Why is the information necessary?
- Which business activities or processes depend on it?
- At what stage or decision point is it consumed?
- Which actors or business functions use it, and for what responsibility?
- Is it needed before, during, or after an activity?
- Is it required continuously, periodically, on demand, or following a business event?
- What operational or business outcome does it enable?
- What happens if the information is missing, inaccurate, incomplete, or outdated?
- Which upstream and downstream activities depend on its availability?
- What important operational exceptions or business scenarios require it?

Use these answers to produce a concise explanation of the actual business usage.

**Output requirement:** One focused paragraph explaining the information's purpose, relevant consumers, operational context, and key business outcome. Avoid lengthy scenarios, repeated explanations, generic benefits, and unnecessary background.

#### 4.2 Information Source Discovery

Determine where the information originates and how it is obtained.

Ask:

- Who or what generates the information?
- Which actor or business function creates, maintains, verifies, or updates it?
- Which business object or activity produces or represents it?
- Is it internally generated, externally provided, calculated, derived, observed, or collected?
- Does it originate from a transaction, operational event, business record, external provider, regulatory source, or physical activity?
- Which logical system or source category would normally provide it in this domain?
- How is it acquired: direct entry, transaction capture, integration, event notification, synchronization, measurement, or calculation?
- Does it require verification, reconciliation, enrichment, or transformation?
- What triggers updates, and how is freshness or reliability established?
- What happens if the source is delayed, unavailable, inconsistent, or unreliable?
- Is an alternative source necessary?

Use domain expertise to identify appropriate logical source categories and acquisition mechanisms.

**Output requirement:** One concise paragraph identifying the information origin, relevant provider or source category, and acquisition or update mechanism.

Do not claim that a specific vendor, application, API, or integration exists unless explicitly confirmed in the supplied data. Distinguish logical source requirements from confirmed implementations.

#### 4.3 Business Decision Discovery

Determine which actual business decisions depend on the information.

Ask:

- What business decision becomes possible through this information?
- Who or what makes the decision?
- At which activity or decision point is it made?
- What information is evaluated?
- What conditions, alternatives, or circumstances influence the decision?
- What possible outcomes can result?
- Does the decision involve approval, rejection, eligibility, selection, allocation, prioritization, assignment, pricing, authorization, risk, compliance, reconciliation, escalation, or recovery?
- What happens when the information is missing, conflicting, invalid, or changes?
- Does the decision require human intervention or automated evaluation?
- Which downstream activities depend on the outcome?

Identify genuine business decisions, not merely activities, processes, or system capabilities.

Each decision must express an actual business choice or determination and its purpose.

Consider domain-specific decisions beyond the examples above. Do not force irrelevant decision categories into a requirement.

**Output requirement:** A simple array of concise, specific business decisions. Each entry must explain the decision and its purpose.

#### 4.4 Required Information Details Discovery

Identify the specific information elements needed to satisfy the Parent Information Requirement.

Ask:

- What exact information must the business know?
- Which identifiers, attributes, quantities, values, measurements, classifications, and statuses are necessary?
- What distinguishes one relevant entity, transaction, event, location, or resource from another?
- What dates, timestamps, durations, or effective periods are needed?
- What lifecycle, operational, financial, or compliance information is relevant?
- What ownership, responsibility, or authorization context is necessary?
- What information establishes freshness, reliability, or source provenance?
- Are historical changes, previous values, supporting evidence, or audit information required?
- What calculated or derived information is needed?
- What additional information supports exceptions, reconciliation, investigation, or recovery?
- What information is needed to support the identified business decisions?
- What would remain unknown if the business attempted to execute the relevant activity using only the currently identified information?

Consider relevant information dimensions such as:

- Business identifiers and references.
- Quantities, amounts, measurements, and calculated values.
- Classifications and categories.
- Operational statuses and lifecycle states.
- Dates, timestamps, durations, and effective periods.
- Geographic and location context.
- Ownership, responsibility, and authorization.
- Transactional and financial information.
- Source, freshness, and reliability.
- Historical changes and supporting evidence.
- Exceptions, rejection reasons, and reconciliation details.

These are discovery considerations, not mandatory fields. Include only information that is genuinely relevant to the specific requirement.

**Output requirement:** A simple array of strings. Each string must combine the information element, its business meaning, and its necessity in one concise description.

Use this format:

Information Element: Its business meaning and why it is required.

Do not create nested objects or separate properties for detail, meaning, necessity, or context.

Do not output generic database field names without explaining their business relevance.

---

### 5. DOMAIN-DRIVEN DISCOVERY AND INFERENCE

Apply domain and niche expertise actively. The supplied datasets may not contain every information dependency necessary for the business.

For every Parent Information Requirement, investigate:

- What additional information would a competent domain specialist expect?
- What upstream information dependencies are missing?
- What downstream information is generated or consumed?
- What external information dependencies exist?
- What information is needed for normal, alternate, and exceptional business scenarios?
- What information supports operational accountability, traceability, and business control?
- What implicit business attributes, statuses, measurements, or derived values are necessary but absent from the supplied baseline?

Infer missing information where logically justified.

You may discover additional logical source categories, business events, information dependencies, attributes, and derived information even when they are not explicitly supplied.

Maintain the distinction between valid inference and unsupported fabrication.

**Valid inference:**
- Discovering necessary business information not explicitly listed.
- Identifying logical source categories and providers.
- Identifying missing operational information dependencies.
- Discovering information needed for exceptions and alternate scenarios.
- Identifying relevant business decisions and their required information.

**Unsupported fabrication:**
- Claiming a specific vendor, product, or application is deployed without evidence.
- Inventing company-specific policies or procedures.
- Creating arbitrary numerical thresholds, SLAs, or regulatory obligations.
- Claiming an integration or data feed already exists without confirmation.

Do not restrict discovery to the supplied datasets. Equally, do not invent facts that cannot be justified by domain knowledge.

---

### 6. CROSS-DIMENSIONAL VALIDATION

Before finalizing each requirement, challenge the findings.

Ask:

- Does the information usage explain the actual business need?
- Are the identified sources capable of providing the required information?
- Are the acquisition mechanisms appropriate?
- Does each business decision genuinely depend on this information?
- Are the required information details sufficient to support the decisions?
- Do the details collectively satisfy the stated information usage?
- Have relevant actors, business objects, and activities been considered?
- Have upstream, downstream, and external dependencies been investigated?
- Have important exception scenarios been considered?
- Are any information details irrelevant to this requirement?
- Are any details duplicated or describing the same business concept?
- Are any statements generic, repetitive, overly detailed, or unsupported?

Remove irrelevant associations and consolidate overlapping information elements.

Keep distinct details separate only when they represent genuinely different business meanings.

Do not sacrifice meaningful domain-specific discovery for brevity. Conciseness must not reduce completeness or accuracy.

---

### 7. STRICT OUTPUT JSON STRUCTURE

Return one JSON array with exactly one entry for each Parent Information Requirement.

Use **only** this structure:

[
  {
    "information_requirement": "Original Parent Information Requirement",
    "information_usage": "Concise explanation of why, where, when, and by whom the information is used.",
    "information_source": "Concise explanation of the information origin, source category, provider, and acquisition mechanism.",
    "business_decisions_supported": [
      "Specific business decision and its purpose."
    ],
    "required_information_details": [
      "Information element: business meaning and why it is required.",
      "Information element: business meaning and why it is required."
    ]
  }
]

#### Strict field rules

**information_requirement**
- Copy the original parent requirement name exactly.
- Do not rename or paraphrase it.

**information_usage**
- One concise, focused paragraph.
- Explain purpose, relevant consumers, operational context, and business outcome.
- Avoid lengthy explanations and repetition.

**information_source**
- One concise, focused paragraph.
- Explain origin, source category or provider, and acquisition or update mechanism.
- Do not fabricate confirmed integrations.

**business_decisions_supported**
- Simple array of strings.
- Each string describes a genuine business decision and its purpose.
- Avoid activities disguised as decisions.

**required_information_details**
- Simple array of strings only.
- Each string combines the information element, business meaning, and necessity.
- No nested objects.
- No additional properties such as detail, meaning, necessity, or context.
- Avoid duplicate or overlapping information concepts.

---

### 8. FINAL QUALITY AND OUTPUT CONTROLS

Before returning the JSON, verify that:

1. Every input Parent Information Requirement has exactly one corresponding output entry.
2. Parent requirement names and ordering are preserved exactly.
3. All five required properties are present in every entry.
4. No additional properties or JSON structures have been introduced.
5. Information usage and sources are concise but sufficiently specific.
6. Business decisions represent actual decisions, not activities.
7. Required information details are meaningful, necessary, and sufficiently granular.
8. Domain-specific information has been discovered beyond the supplied baseline where justified.
9. No unsupported vendors, integrations, policies, thresholds, or facts have been fabricated.
10. Duplicate information details have been consolidated.
11. The complete output is syntactically valid JSON.

### 9. FINAL INSTRUCTION

Think like a senior business analyst conducting a domain-specific information discovery exercise.

For every Parent Information Requirement, ask the relevant questions, investigate the business context, identify missing information dependencies, apply domain expertise, determine the decisions supported, and validate the required information details.

Keep the reasoning comprehensive and the output concise.

**Do not confuse concise output with shallow discovery. The AI must perform deep business analysis internally but return only the five specified JSON properties in the exact structure provided.**

Return valid JSON only. Do not include Markdown fences, commentary, explanations, or any content outside the JSON array.
`;
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
