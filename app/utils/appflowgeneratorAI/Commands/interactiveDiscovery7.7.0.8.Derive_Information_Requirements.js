/**
 * ============================================================================
 * INFORMATION REQUIREMENTS DISCOVERY
 * Domain-agnostic, bounded Qwen generation with validated JSON continuation.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto');

const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '7.7.0.7.Derive_Derive_Information_Requirements'
  },

  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
    NGL: '0',
    CONTEXT_SIZE: '16384',
    MAX_OUTPUT_TOKENS: '8192',
    BATCH_SIZE: '512',
    THREADS: '8',
    REASONING_MODE: 'off'
  },

  DISCOVERY: {
    // Maximum number of NEW requirements requested from Qwen per response.
    REQUIREMENTS_PER_GENERATION: 5,

    // Stop with an error rather than loop forever if Qwen repeatedly
    // reports more work but produces no new requirements.
    MAX_CONSECUTIVE_EMPTY_GENERATIONS: 2
  },

  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: '7.6 Business Objects.24-10-26_06:41pm.md',
    STAGE_2_ACTORS: '7.7.1 Actors_list.29-10-26_05:14pm.md',
    STAGE_3_JOURNEYS: '7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.30-10-26_03:13pm.md',
    STAGE_4_TOPOLOGY: '7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP.31-10-26_09:23am.md',
    STAGE_5_TOPOLOGY: '7.7.0.6.Derive_ACTOR_BUSINESS_Activities.31-10-26_06:46pm.md',
    FILE_EXTENSION: '.txt'
  }
};

/**
 * Execute one Qwen generation and read the generated output file.
 * A process exit without valid JSON is not considered success.
 */
function runLlamaGeneration(prompt, generationNumber, tempDirectory) {
  return new Promise((resolve, reject) => {
    const stamp = `${Date.now()}_${generationNumber}`;
    const promptPath = path.join(tempDirectory, `information_requirements_prompt_${stamp}.txt`);
    const responsePath = path.join(tempDirectory, `information_requirements_response_${stamp}.json`);

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

    console.log(`\n⚡ Information Requirements generation ${generationNumber}`);
    console.log(`   Model: ${CONFIG.MODEL.IDENTIFIER}`);
    console.log(`   Maximum new requirements: ${CONFIG.DISCOVERY.REQUIREMENTS_PER_GENERATION}`);

    execFile(
      CONFIG.MODEL.EXEC_BINARY,
      args,
      { maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        let rawResponse = '';

        try {
          if (fs.existsSync(responsePath)) {
            rawResponse = fs.readFileSync(responsePath, 'utf8');
          }

          // Fallback only if llama-cli did not write its output file.
          if (!rawResponse.trim() && stdout) {
            rawResponse = stdout;
          }
        } catch (readError) {
          cleanup();
          return reject(readError);
        }

        cleanup();

        if (error) {
          return reject(new Error(
            `llama-cli failed during generation ${generationNumber}: ${error.message}\n${stderr || ''}`
          ));
        }

        if (!rawResponse.trim()) {
          return reject(new Error(
            `Generation ${generationNumber} produced no response.`
          ));
        }

        resolve(rawResponse);
      }
    );

    function cleanup() {
      for (const filePath of [promptPath, responsePath]) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (_) {
          // Temporary-file cleanup must not hide the generation result.
        }
      }
    }
  });
}

/**
 * Extract and parse the JSON object from Qwen's response.
 * Truncated or malformed JSON is rejected; it is never accepted as a batch.
 */
function parseJsonResponse(rawResponse, generationNumber) {
  const text = String(rawResponse || '').trim();

  if (!text) {
    throw new Error(
      `Generation ${generationNumber}: empty model response.`
    );
  }

  const candidates = [];

  let start = -1;
  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (start === -1) {
      if (char === '{') {
        start = i;
        depth = 1;
        insideString = false;
        escaped = false;
      }

      continue;
    }

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        insideString = false;
      }

      continue;
    }

    if (char === '"') {
      insideString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;

      if (depth === 0) {
        const candidateText = text.slice(start, i + 1);

        try {
          const candidate = JSON.parse(candidateText);

          if (
            candidate &&
            !Array.isArray(candidate) &&
            typeof candidate === 'object' &&
            Array.isArray(candidate.information_requirements) &&
            typeof candidate.more_to_discover === 'boolean'
          ) {
            candidates.push(candidate);
          }
        } catch (_) {
          // Ignore invalid JSON candidates.
        }

        start = -1;
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `Generation ${generationNumber}: no complete valid information_requirements JSON object found.`
    );
  }

  return candidates[candidates.length - 1];
}

const REQUIREMENT_FIELDS = [
  'information_requirement',
  'description',
  'business_purpose',
  'required_by_actors',
  'related_responsibilities',
  'related_activities',
  'related_business_objects',
  'information_usage',
  'information_source',
  'business_decisions_supported',
  'required_information_details'
];

function validateRequirement(requirement, generationNumber, index) {
  if (!requirement || typeof requirement !== 'object' || Array.isArray(requirement)) {
    throw new Error(
      `Generation ${generationNumber}, requirement ${index + 1}: invalid object.`
    );
  }

  for (const field of REQUIREMENT_FIELDS) {
    if (!(field in requirement)) {
      throw new Error(
        `Generation ${generationNumber}, requirement ${index + 1}: missing "${field}".`
      );
    }

    if (Array.isArray(requirement[field])) {
      if (!requirement[field].every(value => typeof value === 'string')) {
        throw new Error(
          `Generation ${generationNumber}, requirement ${index + 1}: "${field}" must contain strings only.`
        );
      }
    } else if (typeof requirement[field] !== 'string') {
      throw new Error(
        `Generation ${generationNumber}, requirement ${index + 1}: "${field}" must be a string.`
      );
    }
  }
}

/**
 * Local exact-name deduplication is a final safeguard.
 * Semantic deduplication is also instructed in every Qwen continuation prompt.
 */
function normalizeRequirementName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Send a compact index of prior model-generated requirements.
 * This data is derived only from previously validated Qwen responses.
 * It is not a hardcoded scope, category, actor list or discovery checklist.
 */
function buildPreviouslyDiscoveredIndex(requirements) {
  return requirements.map(item => ({
    information_requirement: item.information_requirement,
    business_purpose: item.business_purpose,
    required_information_details: item.required_information_details
  }));
}

/**
 * The same complete business model is supplied on every generation.
 * Only the previously discovered requirement index changes.
 */
function buildInformationRequirementsPrompt(base, completedRequirements) {
  const previousIndex = buildPreviouslyDiscoveredIndex(completedRequirements);

  return `
# DOMAIN-AGNOSTIC INFORMATION REQUIREMENTS DISCOVERY

Act as a senior business analyst, business domain specialist, enterprise business architect and information architect.

Discover business Information Requirements by independently reasoning about what information the supplied business needs to perform its responsibilities, execute its activities, support decisions, coordinate operations and achieve its business outcomes.

You are discovering Information Requirements as a distinct business-model dimension. Do not reproduce, redefine or regenerate the supplied business dimensions.

# 1. EXISTING BUSINESS MODEL

**Domain:**
${base.domain || 'Not supplied'}

**Niche:**
${base.niche || 'Not supplied'}

**Actors:**
${formatPromptInput(base.actor_fields)}

**Actors and Responsibilities:**
${formatPromptInput(base.actor_responsibilities)}

**Business Objects:**
${formatPromptInput(base.business_objects)}

**Actor–Business Object Relationships:**
${formatPromptInput(base.actor_business_object_relationships)}

**Business Activities:**
${formatPromptInput(base.business_activities)}

Use the complete supplied business model as the foundation for discovery. It is a starting point, not an exhaustive specification.

Do not simply extract business-object names, reproduce object attributes or convert activity inputs and outputs into information requirements.

# 2. PREVIOUSLY DISCOVERED INFORMATION REQUIREMENTS

${previousIndex.length
  ? JSON.stringify(previousIndex, null, 2)
  : 'No information requirements have been generated yet. This is the initial discovery generation.'}

These are actual requirements generated and validated in previous responses.

Do not repeat, rename, rephrase or split any previously discovered requirement. A requirement is a duplicate when it represents substantially the same business information need, even if its wording differs.

# 3. INTELLIGENT DISCOVERY QUESTIONS

Reason through the following questions against the supplied business model. They guide discovery; they are not mandatory categories or separate output sections.

## A. Information Needed to Fulfil Business Responsibilities

- What information must actors know or obtain to fulfil their responsibilities?
- What information is needed before they can take action?
- What information must they receive, communicate, create, maintain or update?
- What information enables them to monitor and evaluate their responsibilities?
- What information needs are implied by responsibilities but not represented in the current model?

## B. Information Needed to Execute Business Activities

- What information is required to initiate, execute and complete activities?
- What must be verified, evaluated or updated during execution?
- What information determines the appropriate next action?
- What information is generated and required by subsequent activities?
- What information is needed to establish whether an activity achieved its intended outcome?

## C. Information Exchanged Between Actors

- What information must actors obtain from or communicate to one another?
- What information is required for coordination, handover, acknowledgement or completion?
- What information must be available before another actor can proceed?
- What information exchanges are implied by actor–business-object relationships?

## D. Information Required for Business Decisions

- What decisions must actors or automated business operations make?
- What facts, conditions or circumstances must be evaluated?
- What information determines whether an operation can proceed?
- What information supports alternatives, approvals, rejection, prioritisation, allocation or escalation where relevant?
- What information is needed when facts are missing, outdated or inconsistent?

Identify actual decisions implied by the supplied business model. Do not invent decisions or impose predefined decision categories.

## E. Information Beyond Existing Business Objects

- What information is represented by existing business objects?
- What additional information is required beyond those objects?
- What information is obtained externally, derived, generated or temporarily needed?
- What information must be communicated or maintained without necessarily representing a separate business object?
- What information needs cannot be adequately explained by existing business objects?

An information requirement describes information the business needs. A business object represents a business entity that may contain or relate to that information. Do not confuse these concepts.

## F. Information Dependencies Across Activities

- What information produced by one activity is required by another?
- What information is shared across actors or activities?
- What must be updated when circumstances change?
- What information must be available to maintain continuity?
- What information must be reconciled when different activities consume or update it?

## G. Exceptions and Alternative Situations

- What information is needed to identify, understand and resolve exceptions?
- What information supports alternative actions or intervention by another actor?
- What information is required to correct, reverse, resume or complete interrupted operations?
- What information is needed to evaluate the outcome of an exception?

Discover these requirements only where relevant to the supplied business.

## H. Business Outcomes and Operational Evaluation

- What information establishes whether intended business outcomes have been achieved?
- What information supports completion checks, monitoring, reconciliation, review or accountability?
- What information helps identify delays, incomplete work or unsuccessful outcomes?
- What information must remain available for subsequent operations?

## I. Uncovered Information Needs

Challenge the supplied model specifically from an information perspective.

- What information is logically necessary but not yet identified?
- Which responsibilities, activities, decisions or actor interactions imply additional information needs?
- What information dependencies or outcome-verification needs are missing?
- What additional information is justified by the supplied business context?

Do not invent requirements merely to increase the catalogue size.

# 4. SYNTHESIZE DISTINCT REQUIREMENTS

Generate up to ${CONFIG.DISCOVERY.REQUIREMENTS_PER_GENERATION} NEW, materially distinct information requirements in this response.

This is a per-response generation limit, not a limit on the overall discovery.

- Prioritise meaningful information needs over verbose descriptions.
- Group related information when it serves the same business purpose.
- Keep materially different business purposes as separate requirements.
- Do not create a separate requirement for every individual information detail.
- Preserve relevant relationships to supplied actors, responsibilities, activities and business objects.
- Do not force every requirement to relate to an existing business object.
- Do not turn information requirements into database schemas, technical fields, APIs or application features.
- Do not use predefined domain categories or hardcoded expected requirement lists.
- Do not include previously discovered requirements in the new output.

# 5. OUTPUT SCHEMA

Return only valid JSON using this exact structure:

{
  "information_requirements": [
    {
      "information_requirement": "",
      "description": "",
      "business_purpose": "",
      "required_by_actors": [],
      "related_responsibilities": [],
      "related_activities": [],
      "related_business_objects": [],
      "information_usage": "",
      "information_source": "",
      "business_decisions_supported": [],
      "required_information_details": []
    }
  ],
  "more_to_discover": true
}

# 6. OUTPUT RULES

1. Return only the JSON object. No Markdown fences, explanations or commentary.
2. Return no more than ${CONFIG.DISCOVERY.REQUIREMENTS_PER_GENERATION} new requirements.
3. Do not return previously discovered requirements.
4. Keep description, business_purpose and information_usage to one concise sentence each.
5. Use short, meaningful phrases in arrays.
6. Include only essential information details.
7. Populate every schema property.
8. Use empty arrays when no relevant relationship can be established.
9. Use an empty string only when a scalar value genuinely cannot be determined.
10. Use exact names from the supplied model when referencing actors, responsibilities, activities and business objects.
11. Do not fabricate references to existing business-model elements.
12. Ensure every JSON object, array and string is completely closed.

Set more_to_discover to true if meaningful, distinct information requirements remain undiscovered anywhere in the supplied business model.

Set more_to_discover to false only when the complete business model has been adequately examined and no meaningful additional information requirements remain.

Do not set more_to_discover to false merely because this response has reached its per-response limit.

If no new requirements are found and no meaningful requirements remain, return an empty information_requirements array and set more_to_discover to false.

If no new requirements are found but meaningful requirements remain, return an empty array and set more_to_discover to true. Do not repeat previous requirements.

Return the complete JSON object only.
`;
}

/**
 * Run bounded generations until Qwen reports that discovery is complete.
 * Each continuation receives the same complete business model and the
 * compact index derived from all previously validated Qwen outputs.
 */
async function generateSemanticBlueprintAI(base, finalTargetFilePath, callback) {
  try {
    const tempDirectory = path.join(
      CONFIG.PATHS.PROJECT_ROOT,
      CONFIG.PATHS.TMP_RELATIVE_DIR
    );

    const checkpointPath = path.join(
      path.dirname(finalTargetFilePath),
      `${CONFIG.PATHS.EXPORT_PREFIX}.progress.json`
    );

    const inputFingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(base))
      .digest('hex');

    let allRequirements = [];
    let generationNumber = 0;
    let moreToDiscover = true;
    let consecutiveEmptyGenerations = 0;

    // Resume only when the checkpoint belongs to the exact same input data.
    if (fs.existsSync(checkpointPath)) {
      try {
        const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

        if (
          checkpoint.inputFingerprint === inputFingerprint &&
          Array.isArray(checkpoint.information_requirements) &&
          typeof checkpoint.more_to_discover === 'boolean'
        ) {
          allRequirements = checkpoint.information_requirements;
          generationNumber = Number(checkpoint.completed_generations) || 0;
          moreToDiscover = checkpoint.more_to_discover;

          console.log(
            `\\n↻ Resuming from checkpoint: ${allRequirements.length} previously validated requirements across ${generationNumber} generations.`
          );
        }
      } catch (checkpointError) {
        console.warn('⚠️ Existing progress checkpoint is invalid; starting a fresh discovery.');
      }
    }

    const seenNames = new Set(
      allRequirements
        .map(item => normalizeRequirementName(item.information_requirement))
        .filter(Boolean)
    );

    while (moreToDiscover) {
      generationNumber++;

      const prompt = buildInformationRequirementsPrompt(base, allRequirements);

      const rawResponse = await runLlamaGeneration(
        prompt,
        generationNumber,
        tempDirectory
      );

      // A truncated response throws here and is never accepted.
      const batch = parseJsonResponse(rawResponse, generationNumber);

      batch.information_requirements.forEach((requirement, index) => {
        validateRequirement(requirement, generationNumber, index);
      });

      let newlyAccepted = 0;

      for (const requirement of batch.information_requirements) {
        const key = normalizeRequirementName(requirement.information_requirement);

        if (!key || seenNames.has(key)) {
          continue;
        }

        seenNames.add(key);
        allRequirements.push(requirement);
        newlyAccepted++;
      }

      console.log(
        `   Validated requirements in this generation: ${batch.information_requirements.length}`
      );
      console.log(`   New distinct requirements accepted: ${newlyAccepted}`);
      console.log(`   Total accumulated requirements: ${allRequirements.length}`);
      console.log(`   More to discover: ${batch.more_to_discover}`);

      if (newlyAccepted === 0 && batch.more_to_discover) {
        consecutiveEmptyGenerations++;

        if (
          consecutiveEmptyGenerations >=
          CONFIG.DISCOVERY.MAX_CONSECUTIVE_EMPTY_GENERATIONS
        ) {
          throw new Error(
            'Discovery stalled: Qwen repeatedly reported more requirements ' +
            'but returned no new distinct requirements. No final file was marked successful.'
          );
        }
      } else {
        consecutiveEmptyGenerations = 0;
      }

      moreToDiscover = batch.more_to_discover;

      // Persist every successfully validated generation immediately.
      // If a later Qwen response truncates, the next run resumes here.
      const checkpoint = {
        inputFingerprint,
        completed_generations: generationNumber,
        more_to_discover: moreToDiscover,
        information_requirements: allRequirements
      };

      const checkpointTempPath = `${checkpointPath}.tmp`;
      fs.writeFileSync(
        checkpointTempPath,
        JSON.stringify(checkpoint, null, 2),
        'utf8'
      );
      fs.renameSync(checkpointTempPath, checkpointPath);
    }

    // Consolidation is performed programmatically so the entire catalogue
    // does not have to be generated again by Qwen in one oversized response.
    const finalResult = {
      information_requirements: allRequirements
    };

    // Final schema validation before writing the final output.
    if (!Array.isArray(finalResult.information_requirements)) {
      throw new Error('Final information_requirements collection is invalid.');
    }

    const finalJson = JSON.stringify(finalResult, null, 2);
    JSON.parse(finalJson); // Final JSON integrity check.

    fs.mkdirSync(path.dirname(finalTargetFilePath), { recursive: true });
    fs.writeFileSync(finalTargetFilePath, finalJson, 'utf8');

    // Remove the checkpoint only after the complete final JSON is saved.
    if (fs.existsSync(checkpointPath)) {
      fs.unlinkSync(checkpointPath);
    }

    console.log(`\n✅ Completed generations: ${generationNumber}`);
    console.log(`✅ Total distinct information requirements: ${allRequirements.length}`);

    callback(null, finalTargetFilePath);
  } catch (error) {
    callback(error, null);
  }
}

/**
 * ============================================================================
 * SECTION 2: FILE SYSTEM SCANNING & MAIN PIPELINE RUNTIME
 * ============================================================================
 */

const OUTPUT_DIR = path.join(
  CONFIG.PATHS.PROJECT_ROOT,
  CONFIG.PATHS.OUTPUT_RELATIVE_DIR
);

const objectsFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS
);
const actorsFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS
);
const businessResponsibilitiesFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS
);
const actorObjectRelationshipsFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY
);
const businessActivitiesFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_5_TOPOLOGY
);

if (
  !objectsFilePath ||
  !actorsFilePath ||
  !businessResponsibilitiesFilePath ||
  !actorObjectRelationshipsFilePath ||
  !businessActivitiesFilePath
) {
  throw new Error(
    'Could not automatically locate all five required input source files inside the output directory.'
  );
}

console.log(`\n📂 Reading business objects: ${path.basename(objectsFilePath)}`);
console.log(`📂 Reading actors: ${path.basename(actorsFilePath)}`);
console.log(`📂 Reading actor responsibilities: ${path.basename(businessResponsibilitiesFilePath)}`);
console.log(`📂 Reading actor–business-object relationships: ${path.basename(actorObjectRelationshipsFilePath)}`);
console.log(`📂 Reading business activities: ${path.basename(businessActivitiesFilePath)}`);

const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
const objectsActorsContent = fs.readFileSync(actorsFilePath, 'utf8');
const objectsActorsRespContent = fs.readFileSync(businessResponsibilitiesFilePath, 'utf8');
const objectsActorsRelationShip = fs.readFileSync(actorObjectRelationshipsFilePath, 'utf8');
const objectsbusiness_activities = fs.readFileSync(businessActivitiesFilePath, 'utf8');

const cleanJsonArray1 = extractDomain_Niche_Main_Content(objectsMatrixContent);

const base = {
  domain: cleanJsonArray1.primarydataset.domain,
  niche: cleanJsonArray1.primarydataset.niche,
  business_objects: cleanJsonArray1.mainContent,
  actor_fields: objectsActorsContent,
  actor_responsibilities: objectsActorsRespContent,
  actor_business_object_relationships: objectsActorsRelationShip,
  business_activities: objectsbusiness_activities
};

const now = new Date();
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0');
const year = String(now.getFullYear()).slice(-2);
let hours = now.getHours();
const minutes = String(now.getMinutes()).padStart(2, '0');
const ampm = hours >= 12 ? 'pm' : 'am';
hours = hours % 12 || 12;
const formattedHours = String(hours).padStart(2, '0');

const timestamp = `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;
const finalOutputPath = path.join(
  OUTPUT_DIR.replace(`${path.sep}baseline${path.sep}`, path.sep),
  `${CONFIG.PATHS.EXPORT_PREFIX}.${timestamp}.md`
);

generateSemanticBlueprintAI(base, finalOutputPath, (error, targetSavedPath) => {
  if (error) {
    console.error(
      '\n❌ INFORMATION REQUIREMENTS DISCOVERY FAILED:',
      error.message
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n🎉 SUCCESS: Complete Information Requirements catalogue saved using ${CONFIG.MODEL.IDENTIFIER} to: ${targetSavedPath}`
  );
});

/**
 * ============================================================================
 * SUPPORTING FUNCTIONS RETAINED FROM THE ORIGINAL PIPELINE
 * ============================================================================
 */

function formatPromptInput(value) {
  if (value === undefined || value === null) {
    return 'Not supplied';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function resolveLatestStageFile(directory, prefixPattern) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  const matchedFiles = files.filter(f => f.startsWith(prefixPattern));
  if (matchedFiles.length === 0) return null;

  matchedFiles.sort((a, b) => fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs);
  return path.join(directory, matchedFiles[0]);
}



function extractcontent(objectsMatrixContent) {
    const mermaidContent = objectsMatrixContent

    function extractNodesWithoutRegex(text) {
        const lines = text.split('\n');
        const results = [];
        // The specific node suffixes we want to look for
        const targets = ['_alternate_path', '_degraded_alert', '_reject_scenario'];
        for (let line of lines) {
            line = line.trim();
            // Find if the current line contains one of our target node types
            const matchedSuffix = targets.find(suffix => line.includes(suffix));
            // Skip lines that don't match or lines that are path definitions (containing arrows)
            if (!matchedSuffix || line.includes('-->') || line.includes('.-.')) {
                continue;
            }
            // Split by the opening character of the label block
            let openChar = '';
            if (line.includes('["')) openChar = '["';
            else if (line.includes('("')) openChar = '("';
            else if (line.includes('{"')) openChar = '{"';
            if (!openChar) continue;
            const parts = line.split(openChar);
            if (parts.length < 2) continue;
            // Clean up the Node ID
            const nodeId = parts[0].trim();
            // Clean up the text content by removing the closing bracket/parenthesis/quotes
            let content = parts[1].trim();
            content = content.replace(/["'\])}]+\$/, ''); // Simple end-of-string character cleanup
            while (content.endsWith('"') || content.endsWith(']') || content.endsWith(')') || content.endsWith('}')) {
                content = content.slice(0, -1);
            }
            results.push({
                node_id: nodeId,
                existing_content: content
            });
        }
        return results;
    }
    // Execute Extraction
    const extractedNodes = extractNodesWithoutRegex(mermaidContent);
    // Print Output
    console.log(JSON.stringify({
        existing_content: extractedNodes
    }, null, 2));
    return JSON.stringify({
        existing_content: extractedNodes
    }, null, 2)
}



function extractDomain_Niche_Main_Content(objectsData)
{


        let interim = JSON.parse(objectsData)

        let domain=interim.domain
        let niche=interim.niche
        let base1=
        {
            primarydataset:{
            domain:domain,
            niche:niche
            }
        }
        delete interim.domain;
        delete interim.niche;
        base1.mainContent=interim
        //JSON.stringify(base1,null,4)

        return base1
}