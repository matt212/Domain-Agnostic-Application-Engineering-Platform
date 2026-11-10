
'use strict';

/**
 * ============================================================================
 * 8.0.4 FUNCTIONAL REQUIREMENTS DISCOVERY
 * ============================================================================
 *
 * INPUT:
 *   8.0.3 Knowledge Base JSON
 *   - metadata
 *   - sources[].raw_content
 *
 * PROCESS:
 *   1. Load the Knowledge Base.
 *   2. Read every original source document.
 *   3. Divide source content into context-safe chunks.
 *   4. Ask Qwen to independently investigate each chunk.
 *   5. Qwen generates its own investigation questions and answers them.
 *   6. Consolidate all investigation findings.
 *   7. Ask Qwen to derive the functional requirements.
 *   8. Validate the output structure.
 *   9. Save the final requirements.
 *
 * OUTPUT:
 * {
 *   "functional_requirements": [
 *     {
 *       "requirement_id": "FR-001",
 *       "requirement": "..."
 *     }
 *   ]
 * }
 *
 * No AlaSQL.
 * No SQL.
 * No indexed-record retrieval.
 * No hardcoded business capability checklist.
 * No predefined investigation questions.
 * No arbitrary requirement count.
 *
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');


// ============================================================================
// 1. CONFIGURATION
// ============================================================================

const CONFIG = {

  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),

    BASELINE_DIRECTORY:
      'app/utils/appflowgeneratorAI/aiOutput/baseline',

    OUTPUT_DIRECTORY:
      'app/utils/appflowgeneratorAI/aiOutput',

    TEMP_DIRECTORY:
      'app/utils/appflowgeneratorAI/promptFile',

    KNOWLEDGE_BASE_PREFIX:
      '8.0.3.knowledge_base-',

    OUTPUT_PREFIX:
      '8.0.4.functional_requirements'
  },

  MODEL: {
    EXEC_BINARY: 'llama-cli',

    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',

    NGL: '0',

    CONTEXT_SIZE: '31744',

    BATCH_SIZE: '256',

    THREADS: '8',

    REASONING_MODE: 'off',

    INVESTIGATION_OUTPUT_TOKENS: '1100',

    FINAL_OUTPUT_TOKENS: '4096'
  },

  DISCOVERY: {

    // Original source content is processed in separate model calls.
    MAX_SOURCE_CHUNK_CHARACTERS: 24000,

    // Every original source must be processed.
    PROCESS_ALL_SOURCES: true

  }

};


const PROJECT_ROOT = CONFIG.PATHS.PROJECT_ROOT;

const BASELINE_DIRECTORY = path.join(
  PROJECT_ROOT,
  CONFIG.PATHS.BASELINE_DIRECTORY
);

const OUTPUT_DIRECTORY = path.join(
  PROJECT_ROOT,
  CONFIG.PATHS.OUTPUT_DIRECTORY
);

const TEMP_DIRECTORY = path.join(
  PROJECT_ROOT,
  CONFIG.PATHS.TEMP_DIRECTORY
);


// ============================================================================
// 2. GENERAL HELPERS
// ============================================================================

function log(message) {
  console.log(`[8.0.4] ${message}`);
}


function ensureDirectory(directory) {
  fs.mkdirSync(directory, {
    recursive: true
  });
}


function getTimestamp() {
  const now = new Date();

  const day = String(now.getDate()).padStart(2, '0');

  const month = String(now.getMonth() + 1).padStart(2, '0');

  const year = String(now.getFullYear());

  const hours = String(now.getHours()).padStart(2, '0');

  const minutes = String(now.getMinutes()).padStart(2, '0');

  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}


// ============================================================================
// 3. LOAD LATEST KNOWLEDGE BASE
// ============================================================================

function loadKnowledgeBase() {

  if (!fs.existsSync(BASELINE_DIRECTORY)) {
    throw new Error(
      `Knowledge Base directory not found: ${BASELINE_DIRECTORY}`
    );
  }

  const files = fs.readdirSync(BASELINE_DIRECTORY)

    .filter(file =>
      file.startsWith(CONFIG.PATHS.KNOWLEDGE_BASE_PREFIX)
    )

    .filter(file =>
      file.toLowerCase().endsWith('.json')
    )

    .map(file => {

      const fullPath = path.join(
        BASELINE_DIRECTORY,
        file
      );

      return {
        file,
        fullPath,
        modified: fs.statSync(fullPath).mtimeMs
      };

    })

    .sort((a, b) => b.modified - a.modified);


  if (files.length === 0) {
    throw new Error(
      'No Knowledge Base JSON file found.'
    );
  }


  const selectedFile = files[0];

  log(`Loading Knowledge Base: ${selectedFile.fullPath}`);


  const knowledgeBase = JSON.parse(
    fs.readFileSync(
      selectedFile.fullPath,
      'utf8'
    )
  );


  if (
    !knowledgeBase.metadata ||
    !Array.isArray(knowledgeBase.sources)
  ) {
    throw new Error(
      'Invalid Knowledge Base structure. Expected metadata and sources[].'
    );
  }


  const domain = knowledgeBase.metadata.domain;

  const niche = knowledgeBase.metadata.niche;


  if (!domain || !niche) {
    throw new Error(
      'Domain or niche is missing from Knowledge Base metadata.'
    );
  }


  if (knowledgeBase.sources.length === 0) {
    throw new Error(
      'Knowledge Base contains no original source documents.'
    );
  }


  for (const source of knowledgeBase.sources) {

    if (
      typeof source.raw_content !== 'string' ||
      !source.raw_content.trim()
    ) {
      throw new Error(
        `Original source content is missing: ${source.source_file}`
      );
    }

  }


  log(`Domain: ${domain}`);

  log(`Niche: ${niche}`);

  log(`Original sources: ${knowledgeBase.sources.length}`);

  log(
    `Total source characters: ${
      knowledgeBase.sources.reduce(
        (total, source) =>
          total + source.raw_content.length,
        0
      )
    }`
  );


  return {
    file: selectedFile.fullPath,
    domain,
    niche,
    sources: knowledgeBase.sources
  };

}


// ============================================================================
// 4. SPLIT ORIGINAL SOURCE CONTENT
// ============================================================================

function splitSourceIntoChunks(source) {

  const content = source.raw_content;

  const maxCharacters =
    CONFIG.DISCOVERY.MAX_SOURCE_CHUNK_CHARACTERS;

  const chunks = [];

  let start = 0;

  while (start < content.length) {

    let end = Math.min(
      start + maxCharacters,
      content.length
    );


    if (end < content.length) {

      // Prefer splitting at a line boundary.
      const previousNewline = content.lastIndexOf(
        '\n',
        end
      );

      if (
        previousNewline > start + maxCharacters * 0.5
      ) {

        end = previousNewline + 1;

      } else {

        const nextNewline = content.indexOf(
          '\n',
          end
        );

        if (nextNewline !== -1) {
          end = nextNewline + 1;
        }

      }

    }


    const chunkContent = content.slice(
      start,
      end
    );


    if (chunkContent.trim()) {

      chunks.push({
        source_stage: source.source_stage,
        source_file: source.source_file,
        chunk_number: chunks.length + 1,
        start_character: start,
        end_character: end,
        total_source_characters: content.length,
        content: chunkContent
      });

    }


    start = end;

  }


  return chunks;

}


function prepareSourceChunks(sources) {

  const chunks = [];

  for (const source of sources) {

    const sourceChunks = splitSourceIntoChunks(source);

    log(
      `${source.source_file}: ${sourceChunks.length} chunk(s)`
    );

    chunks.push(...sourceChunks);

  }


  if (chunks.length === 0) {
    throw new Error(
      'No source content was available for investigation.'
    );
  }


  log(`Total source chunks: ${chunks.length}`);

  return chunks;

}


// ============================================================================
// 5. LOCAL QWEN MODEL EXECUTION
// ============================================================================

function runLocalModel(prompt, options = {}) {

  return new Promise((resolve, reject) => {

    ensureDirectory(TEMP_DIRECTORY);


    const stamp = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;


    const promptPath = path.join(
      TEMP_DIRECTORY,
      `8.0.4_prompt_${stamp}.txt`
    );


    const responsePath = path.join(
      TEMP_DIRECTORY,
      `8.0.4_response_${stamp}.txt`
    );


    fs.writeFileSync(
      promptPath,
      prompt,
      'utf8'
    );


    const args = [

      '-hf',
      CONFIG.MODEL.IDENTIFIER,

      '-ngl',
      CONFIG.MODEL.NGL,

      '--single-turn',

      '-c',
      CONFIG.MODEL.CONTEXT_SIZE,

      '-b',
      CONFIG.MODEL.BATCH_SIZE,

      '-t',
      CONFIG.MODEL.THREADS,

      '--reasoning',
      CONFIG.MODEL.REASONING_MODE,

      '--log-disable',

      '--simple-io',

      '-n',
      String(
        options.maxTokens ||
        CONFIG.MODEL.FINAL_OUTPUT_TOKENS
      ),

      '-f',
      promptPath,

      '-o',
      responsePath

    ];


    const startedAt = Date.now();


    log(`Running Qwen: ${options.label || 'Inference'}`);

    log(`Prompt characters: ${prompt.length}`);

    log(`Maximum output tokens: ${
      options.maxTokens ||
      CONFIG.MODEL.FINAL_OUTPUT_TOKENS
    }`);


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
              `llama-cli failed: ${error.message}\n${stderr || ''}`
            );

          }


          if (!fs.existsSync(responsePath)) {

            throw new Error(
              'llama-cli did not create the response file.'
            );

          }


          const response = fs.readFileSync(
            responsePath,
            'utf8'
          ).trim();


          if (!response) {

            throw new Error(
              'Qwen returned an empty response.'
            );

          }


          log(
            `${options.label || 'Inference'} completed in ${elapsedSeconds} seconds.`
          );

          log(
            `Response characters: ${response.length}`
          );


          resolve(response);

        } catch (executionError) {

          reject(executionError);

        } finally {

          // Keep the prompt and response files available when execution
          // fails, so the failure can be inspected.
          if (!error) {

            for (const filePath of [
              promptPath,
              responsePath
            ]) {

              try {

                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }

              } catch (_) {
                // Non-fatal temporary-file cleanup.
              }

            }

          }

        }

      }
    );

  });

}


// ============================================================================
// 6. EXTRACT JSON FROM MODEL RESPONSE
// ============================================================================

function extractJsonObject(rawResponse, expectedKey) {

  const text = String(rawResponse || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();


  try {

    const parsed = JSON.parse(text);

    if (
      parsed &&
      Object.prototype.hasOwnProperty.call(
        parsed,
        expectedKey
      )
    ) {
      return parsed;
    }

  } catch (_) {
    // Continue with balanced JSON extraction.
  }


  const candidates = [];

  let start = -1;

  let depth = 0;

  let inString = false;

  let escaped = false;


  for (let i = 0; i < text.length; i++) {

    const char = text[i];


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
      continue;
    }


    if (char === '{') {

      if (depth === 0) {
        start = i;
      }

      depth++;

    } else if (char === '}') {

      depth--;

      if (depth === 0 && start !== -1) {

        try {

          const candidate = JSON.parse(
            text.slice(start, i + 1)
          );

          if (
            candidate &&
            Object.prototype.hasOwnProperty.call(
              candidate,
              expectedKey
            )
          ) {
            candidates.push(candidate);
          }

        } catch (_) {
          // Ignore incomplete or invalid candidate objects.
        }

        start = -1;

      }

    }

  }


  if (candidates.length > 0) {
    return candidates[candidates.length - 1];
  }


  throw new Error(
    `Qwen response does not contain valid JSON with "${expectedKey}". ` +
    `Response begins: ${text.slice(0, 1000)}`
  );

}


// ============================================================================
// 7. INVESTIGATION PROMPT
// QWEN GENERATES ITS OWN QUESTIONS AND ANSWERS THEM
// ============================================================================

function buildInvestigationPrompt({
  domain,
  niche,
  chunk,
  totalChunks
}) {

  return `

You are an expert Business Analyst, Business Architect
and Functional Requirements Discovery Specialist.

Your responsibility is to independently understand a business
domain and discover the functional capabilities an application
would need to support that business.

============================================================
BUSINESS CONTEXT
============================================================

Domain:
${domain}

Niche:
${niche}

============================================================
SOURCE DOCUMENT
============================================================

Source stage:
${chunk.source_stage}

Source file:
${chunk.source_file}

Source chunk:
${chunk.chunk_number} of ${totalChunks}

Original source character range:
${chunk.start_character} to ${chunk.end_character}

The following is original business discovery evidence.

It is baseline knowledge, not an exhaustive list of business
capabilities or functional requirements.

<source_content>

${chunk.content}

</source_content>

============================================================
YOUR INVESTIGATION TASK
============================================================

Independently analyse the supplied source content.

Do not merely summarize the document.

Think as a Business Analyst investigating what an application
must do to support the actual business.

First determine what you need to understand further.

Generate your own specific business investigation questions.

These questions must arise from your analysis of the business
context and the supplied source evidence.

For each question:

1. Explain what you need to investigate.
2. Answer the question using the supplied evidence.
3. Where evidence is incomplete, use careful business reasoning.
4. Distinguish established facts from reasonable interpretations.
5. Identify important missing information or unresolved decisions.

You are asking questions to yourself and answering them.
Do not ask the user questions.

============================================================
INDEPENDENT BUSINESS DISCOVERY
============================================================

Do not limit your analysis to capabilities explicitly
mentioned in the source document.

Consider what the actual business needs to accomplish.

Identify relevant business capabilities, application
behaviours, business decisions, validations, data operations,
interactions, exceptions and alternative outcomes.

Use the domain and niche to guide your independent reasoning.

Do not use a generic industry checklist.

Do not force capabilities that are irrelevant to this business.

Do not invent specific numerical thresholds, time limits,
commercial policies or operational rules.

Do not treat an absence of information in this source chunk
as proof that a business capability does not exist.

Do not assume that every source chunk independently describes
the complete business.

Preserve relevant terminology and business meaning.

============================================================
OUTPUT
============================================================

Return valid JSON only.

Use this structure:

{
  "source_understanding": "Concise explanation of relevant business understanding.",

  "investigation_questions": [
    {
      "question": "What needs to be investigated?",
      "answer": "Answer based on evidence and careful business reasoning.",
      "evidence_status": "EXPLICIT | INFERRED | UNRESOLVED"
    }
  ],

  "business_capabilities_identified": [
    {
      "capability": "Business capability or behaviour",
      "explanation": "What the business needs to accomplish.",
      "evidence_status": "EXPLICIT | INFERRED",
      "supporting_context": "Relevant source context."
    }
  ],

  "unresolved_business_decisions": [
    "Business decision requiring clarification."
  ]
}

Do not generate final requirement IDs.

Do not generate a generic checklist.

Do not add explanations outside JSON.

`.trim();

}


// ============================================================================
// 8. RUN INVESTIGATION FOR EVERY SOURCE CHUNK
// ============================================================================

async function investigateSourceChunks(
  domain,
  niche,
  chunks
) {

  const findings = [];


  for (let index = 0; index < chunks.length; index++) {

    const chunk = chunks[index];

    const label =
      `Investigation ${index + 1} of ${chunks.length}`;


    log('');

    log('================================================');

    log(label.toUpperCase());

    log('================================================');


    const prompt = buildInvestigationPrompt({
      domain,
      niche,
      chunk,
      totalChunks: chunks.length
    });


    const rawResponse = await runLocalModel(
      prompt,
      {
        label,
        maxTokens:
          CONFIG.MODEL.INVESTIGATION_OUTPUT_TOKENS
      }
    );


    const parsed = extractJsonObject(
      rawResponse,
      'investigation_questions'
    );


    if (!Array.isArray(parsed.investigation_questions)) {

      throw new Error(
        `${label}: investigation_questions must be an array.`
      );

    }


    if (!Array.isArray(parsed.business_capabilities_identified)) {

      throw new Error(
        `${label}: business_capabilities_identified must be an array.`
      );

    }


    findings.push({

      source_stage: chunk.source_stage,

      source_file: chunk.source_file,

      chunk_number: chunk.chunk_number,

      source_understanding:
        parsed.source_understanding || '',

      investigation_questions:
        parsed.investigation_questions,

      business_capabilities_identified:
        parsed.business_capabilities_identified,

      unresolved_business_decisions:
        Array.isArray(parsed.unresolved_business_decisions)
          ? parsed.unresolved_business_decisions
          : []

    });


    log(
      `Questions generated: ${parsed.investigation_questions.length}`
    );

    log(
      `Capabilities identified: ${parsed.business_capabilities_identified.length}`
    );

  }


  return findings;

}


// ============================================================================
// 9. FINAL FUNCTIONAL REQUIREMENTS PROMPT
// ============================================================================

function buildFinalRequirementsPrompt({
  domain,
  niche,
  investigationFindings
}) {

  return `

You are an expert Business Analyst, Enterprise Solution
Analyst and Functional Requirements Architect.

Your responsibility is to independently derive meaningful,
complete and implementable functional requirements for the
supplied business domain and niche.

============================================================
BUSINESS CONTEXT
============================================================

Domain:
${domain}

Niche:
${niche}

============================================================
COMPLETED AI INVESTIGATION
============================================================

The following contains the results of the investigation
performed across ALL original Knowledge Base source documents.

It includes:

- Business understanding.
- Questions independently generated by Qwen.
- Answers to those questions.
- Identified business capabilities.
- Unresolved business decisions.

${JSON.stringify(investigationFindings, null, 2)}

============================================================
FINAL REQUIREMENTS DISCOVERY
============================================================

Use the complete investigation findings to derive the
functional requirements for the supplied business domain
and niche.

You must independently determine which functional
capabilities the application needs to support.

The Knowledge Base is baseline evidence.

It is not a fixed requirements catalogue.

It is not an exhaustive list of business capabilities.

Do not simply convert every source statement into a
functional requirement.

Do not limit requirements to the capabilities explicitly
mentioned in the source documents.

Use your business analysis expertise to identify relevant
capabilities that are necessary for the actual business.

============================================================
REQUIREMENT QUALITY
============================================================

Each functional requirement must:

1. Describe a meaningful application capability.
2. Express what the application must do.
3. Be understandable and implementable.
4. Represent a genuine business need.
5. Be sufficiently specific to distinguish its purpose.
6. Avoid combining unrelated capabilities.
7. Avoid unnecessary fragmentation.
8. Avoid duplication.
9. Preserve the actual business context.
10. Be independent of any particular technology unless
    the business requirement explicitly demands it.

Use clear requirement wording.

Prefer:

"The system shall allow customers to..."

"The system shall validate..."

"The system shall calculate..."

"The system shall maintain..."

"The system shall enable authorised users to..."

Do not write vague requirements such as:

"The system shall support order management."

Instead, describe the actual business behaviour.

============================================================
BUSINESS EVIDENCE AND REASONING
============================================================

Distinguish established business behaviour from assumptions.

Do not invent:

- Numerical thresholds.
- Delivery time limits.
- Retry limits.
- Refund time limits.
- Financial policies.
- Operational service levels.
- Approval thresholds.
- Regulatory obligations.

Unless established by the supplied evidence or clearly
necessary and justified by the business context.

Where a detailed policy is unknown, express the functional
capability without inventing its policy value.

Do not assume that a capability is unnecessary merely
because it is absent from the Knowledge Base.

Do not add generic requirements unrelated to the domain.

Do not produce non-functional requirements.

Do not produce database design, technical architecture,
infrastructure or implementation tasks.

============================================================
COMPLETENESS REVIEW
============================================================

Before returning the final result, independently review
the requirements you have derived.

Ask yourself:

- Have I understood the actual business?
- Have I considered the business capabilities identified
  across all source documents?
- Have I answered the investigation questions?
- Have I considered relevant business behaviour not
  explicitly documented in the sources?
- Have I covered important alternative outcomes and
  exceptions where relevant?
- Have I combined overlapping requirements appropriately?
- Have I avoided unsupported business policies?
- Have I omitted any relevant capability without reason?
- Are the requirements implementable and meaningful?

Add relevant missing requirements.

Remove duplicates.

Do not force an arbitrary number of requirements.

Do not stop at a small number merely because the first
few requirements appear valid.

============================================================
STRICT OUTPUT FORMAT
============================================================

Return exactly one valid JSON object.

The only permitted top-level field is:

"functional_requirements"

Every requirement must contain exactly two fields:

- requirement_id
- requirement

Use sequential identifiers:

FR-001
FR-002
FR-003

Example structure:

{
  "functional_requirements": [
    {
      "requirement_id": "FR-001",
      "requirement": "The system shall ..."
    },
    {
      "requirement_id": "FR-002",
      "requirement": "The system shall ..."
    }
  ]
}

Do not include:

- Business need.
- Functional behaviour.
- Actors.
- Business objects.
- Information requirements.
- Business rules.
- Acceptance criteria.
- Unresolved questions.
- Analysis notes.
- Explanations.
- Metadata.
- Any additional fields.

Return only the JSON object.

Do not use Markdown fences.

`.trim();

}


// ============================================================================
// 10. VALIDATE FINAL REQUIREMENTS STRUCTURE
// ============================================================================

function validateFinalRequirements(parsed) {

  const topLevelKeys = Object.keys(parsed);


  if (
    topLevelKeys.length !== 1 ||
    topLevelKeys[0] !== 'functional_requirements'
  ) {

    throw new Error(
      'Final output must contain only functional_requirements.'
    );

  }


  const requirements = parsed.functional_requirements;


  if (
    !Array.isArray(requirements) ||
    requirements.length === 0
  ) {

    throw new Error(
      'No functional requirements were generated.'
    );

  }


  const requirementIds = new Set();


  for (let index = 0; index < requirements.length; index++) {

    const item = requirements[index];


    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item)
    ) {

      throw new Error(
        `Requirement ${index + 1} is not a valid object.`
      );

    }


    const keys = Object.keys(item).sort();


    if (
      keys.length !== 2 ||
      keys[0] !== 'requirement' ||
      keys[1] !== 'requirement_id'
    ) {

      throw new Error(
        `Requirement ${index + 1} must contain exactly requirement_id and requirement.`
      );

    }


    const expectedId =
      `FR-${String(index + 1).padStart(3, '0')}`;


    if (item.requirement_id !== expectedId) {

      throw new Error(
        `Expected ${expectedId}, received ${item.requirement_id}.`
      );

    }


    if (
      typeof item.requirement !== 'string' ||
      !item.requirement.trim()
    ) {

      throw new Error(
        `${expectedId} has an empty requirement.`
      );

    }


    if (requirementIds.has(item.requirement_id)) {

      throw new Error(
        `Duplicate requirement ID: ${item.requirement_id}`
      );

    }


    requirementIds.add(item.requirement_id);

  }


  return requirements;

}


// ============================================================================
// 11. SAVE FINAL REQUIREMENTS
// ============================================================================

function saveFinalRequirements(requirements) {

  ensureDirectory(OUTPUT_DIRECTORY);


  const output = {
    functional_requirements: requirements
  };


  const outputPath = path.join(
    OUTPUT_DIRECTORY,
    `${CONFIG.PATHS.OUTPUT_PREFIX}_${getTimestamp()}.json`
  );


  fs.writeFileSync(
    outputPath,
    JSON.stringify(output, null, 2),
    'utf8'
  );


  log('');

  log('==============================================');

  log('FUNCTIONAL REQUIREMENTS DISCOVERY COMPLETED');

  log('==============================================');


  log(`Requirements: ${requirements.length}`);

  log(`Output: ${outputPath}`);


  return outputPath;

}


// ============================================================================
// 12. MAIN EXECUTION
// ============================================================================

async function generateFunctionalRequirements() {

  try {

    log('');

    log('==============================================');

    log('FUNCTIONAL REQUIREMENTS DISCOVERY');

    log('==============================================');


    // 1. Load the original Knowledge Base.
    const knowledgeBase = loadKnowledgeBase();


    // 2. Prepare all original source documents.
    const chunks = prepareSourceChunks(
      knowledgeBase.sources
    );


    // 3. Investigate every source chunk.
    const investigationFindings =
      await investigateSourceChunks(
        knowledgeBase.domain,
        knowledgeBase.niche,
        chunks
      );


    // 4. Build final requirements discovery prompt.
    const finalPrompt = buildFinalRequirementsPrompt({

      domain: knowledgeBase.domain,

      niche: knowledgeBase.niche,

      investigationFindings

    });


    // 5. Ask Qwen to consolidate and derive requirements.
    const finalRawResponse = await runLocalModel(
      finalPrompt,
      {
        label: 'Final functional requirements discovery',

        maxTokens:
          CONFIG.MODEL.FINAL_OUTPUT_TOKENS
      }
    );


    // 6. Extract final JSON.
    const parsed = extractJsonObject(
      finalRawResponse,
      'functional_requirements'
    );


    // 7. Validate exact output structure.
    const requirements = validateFinalRequirements(
      parsed
    );


    // 8. Save final requirements.
    const outputPath = saveFinalRequirements(
      requirements
    );


    log('');

    log('Discovery completed successfully.');

    log(`Original source documents: ${knowledgeBase.sources.length}`);

    log(`Source chunks investigated: ${chunks.length}`);

    log(`Investigation passes: ${investigationFindings.length}`);

    log(`Final requirements: ${requirements.length}`);

    log(`Output file: ${outputPath}`);


    return outputPath;

  } catch (error) {

    log('');

    log('==============================================');

    log('FUNCTIONAL REQUIREMENTS DISCOVERY FAILED');

    log('==============================================');


    console.error(
      error.stack || error.message
    );


    process.exitCode = 1;

    return null;

  }

}


// ============================================================================
// 13. EXECUTION
// ============================================================================

generateFunctionalRequirements();
