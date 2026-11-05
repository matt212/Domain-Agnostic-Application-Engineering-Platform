/**
 * ============================================================================
 * INFORMATION REQUIREMENTS DISCOVERY
 * Domain-agnostic, single-pass Qwen discovery of information requirement names.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '7.7.0.8.Derive_Information_Requirements'
  },

  MODEL: {
    EXEC_BINARY: 'llama-cli',
    //IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    NGL: '0',
    CONTEXT_SIZE: '26384',
    MAX_OUTPUT_TOKENS: '8192',
    BATCH_SIZE: '512',
    THREADS: '8',
    REASONING_MODE: 'off'
  },

  DISCOVERY: {
    // One model call only. No continuation loop or model-controlled stopping.
    SINGLE_GENERATION: true
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
    const promptPath = path.join(
      tempDirectory,
      `information_requirements_prompt_${stamp}.txt`
    );
    const responsePath = path.join(
      tempDirectory,
      `information_requirements_response_${stamp}.json`
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

    console.log(`\n⚡ Information Requirements generation ${generationNumber}`);
    console.log(`   Model: ${CONFIG.MODEL.IDENTIFIER}`);
    console.log('   Mode: single-pass information requirement discovery');

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
    throw new Error(`Generation ${generationNumber}: empty model response.`);
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
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') insideString = false;
      continue;
    }

    if (char === '"') insideString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;

      if (depth === 0) {
        try {
          const candidate = JSON.parse(text.slice(start, i + 1));

          if (
            candidate &&
            !Array.isArray(candidate) &&
            typeof candidate === 'object' &&
            Array.isArray(candidate.information_requirements)
          ) {
            candidates.push(candidate);
          }
        } catch (_) {
          // Ignore malformed JSON candidates; a complete valid object is required.
        }

        start = -1;
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      `Generation ${generationNumber}: no complete valid information_requirements JSON object found. The response may be truncated.`
    );
  }

  return candidates[candidates.length - 1];
}

const REQUIREMENT_FIELDS = [
  'information_requirement',
  'description',
  'business_purpose'
];

function validateRequirement(requirement, generationNumber, index) {
  if (
    !requirement ||
    typeof requirement !== 'object' ||
    Array.isArray(requirement)
  ) {
    throw new Error(
      `Generation ${generationNumber}, requirement ${index + 1}: invalid object.`
    );
  }

  for (const field of REQUIREMENT_FIELDS) {
    if (
      typeof requirement[field] !== 'string' ||
      !requirement[field].trim()
    ) {
      throw new Error(
        `Generation ${generationNumber}, requirement ${index + 1}: "${field}" must be a non-empty string.`
      );
    }
  }

  // Keep the final catalogue limited to the three agreed properties.
  const unexpectedFields = Object.keys(requirement).filter(
    field => !REQUIREMENT_FIELDS.includes(field)
  );

  if (unexpectedFields.length > 0) {
    console.warn(
      `   Requirement ${index + 1}: ignoring unexpected fields: ${unexpectedFields.join(', ')}`
    );
  }
}

/**
 * Normalize requirement names for deterministic duplicate removal.
 * Semantic duplicate avoidance is handled by the discovery prompt.
 */
function normalizeRequirementName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Build the single-pass prompt. Qwen discovers only the requirement name,
 * description and business purpose; enrichment is deliberately deferred.
 */
function buildInformationRequirementsPrompt(base) {
  return `
# DOMAIN-AGNOSTIC BUSINESS INFORMATION REQUIREMENTS DISCOVERY

## ROLE AND OBJECTIVE

Act as a highly experienced Business Analyst, Enterprise Business Architect, Domain Specialist and Business Information Architect.

Your task is to discover the complete set of meaningful business Information Requirements for the supplied business domain and niche.

Do not simply extract, summarise or reorganise information already present in the supplied business model.

Think critically about how the business operates, what it needs to know, what information enables its activities and decisions, what information must be exchanged between participants, and what important information may be missing from the documented business model.

The objective is to discover both explicit and implicit business information needs, including those revealed through domain knowledge and business reasoning.

---

## 1. SUPPLIED BUSINESS CONTEXT

**Domain:**
${base.domain}

**Niche:**
${base.niche}

**Business Objects:**
${JSON.stringify(base.business_objects)}

**Actors:**
${JSON.stringify(base.actor_fields)}

**Actor Responsibilities:**
${JSON.stringify(base.actor_responsibilities)}

**Actor–Business Object Relationships:**
${JSON.stringify(base.actor_business_object_relationships)}

**Business Activities:**
${JSON.stringify(base.business_activities)}

Treat these inputs as the available business-model evidence. Analyse them collectively rather than treating each dataset as an independent source.



## 2. BASELINE INFORMATION DISCOVERY AND PRESERVATION

### A. Establish the Existing Information Baseline

Analyse all supplied business inputs, particularly the Business Activities and the data sources, datasets, records and information references described within them.

Answer the following questions:

1. What distinct data sources and datasets are explicitly identified in the supplied business activities?
2. What business information does each source or dataset actually represent?
3. What business facts, records, attributes, conditions, statuses and outcomes are contained in or represented by these sources?
4. What information is already available, maintained, created, consumed, exchanged or updated by the business?
5. What information do the documented actors need from these sources to fulfil their responsibilities?
6. What information is required to initiate, execute, validate or complete the documented business activities?
7. Which information needs are represented across multiple sources?
8. Which sources represent the same underlying information need, and which represent genuinely distinct information needs?
9. What meaningful business Information Requirements can be derived directly from the information represented in the supplied baseline?

Do not treat data sources merely as contextual evidence for discovering other requirements. Understand and identify the actual business information they represent.

### B. Preserve Baseline Information Requirements

For every information need identified in the baseline, answer the following questions:

1. Has this information need been represented by a meaningful business-level Information Requirement?
2. Does the proposed requirement preserve the original business meaning and scope of the information?
3. Has information been omitted because it appeared obvious, implicit, familiar or derivable from domain knowledge?
4. Has an existing information need been absorbed into an overly broad requirement that loses its distinct business meaning?
5. Are multiple sources describing the same underlying information need that should be consolidated?
6. Are different information needs incorrectly being merged merely because they originate from the same source or business object?
7. Does the requirement describe the information the business needs rather than simply repeating a source name, dataset name or document description?

If a materially distinct baseline information need is not represented, include it in the catalogue.

### C. Discover Additional Information Beyond the Baseline

After identifying the baseline, independently answer the following questions:

1. What additional information does the business need that is not represented in the supplied sources?
2. What information is necessary to fulfil documented responsibilities but is not currently identified?
3. What information is required to make business decisions that cannot be made using the identified baseline alone?
4. What information must be obtained from external participants, organisations or systems?
5. What information must be created, calculated, validated, confirmed, communicated or maintained to complete business activities?
6. What information is required to manage exceptions, unexpected conditions, failures and alternative outcomes?
7. What information dependencies are necessary for business operations but remain inadequately covered by the baseline?
8. Which additional information needs are genuinely necessary for this particular domain and niche rather than merely optional capabilities or industry conventions?

Do not restrict discovery to the supplied baseline. Equally, do not invent additional requirements without a logical business justification.

### D. Consolidate Baseline and Additional Requirements

Before finalising the catalogue, answer the following questions:

1. Have all materially distinct baseline information needs been preserved?
2. Have all additional, logically justified information needs been incorporated?
3. Are any additional requirements already covered by baseline requirements?
4. Have overlapping requirements been consolidated without losing meaningful business distinctions?
5. Does each requirement describe a distinct and meaningful business information need?
6. Does the combined catalogue represent both existing information needs and additional information required for the business to operate?

Produce one consolidated catalogue, not separate baseline and additional catalogues.
---

## 3. DOMAIN KNOWLEDGE, BUSINESS INFERENCE AND ASSUMPTION-BASED DISCOVERY

Use your knowledge of the supplied business domain and niche as an active reasoning resource. Do not restrict discovery to information explicitly documented in the supplied business model.

Understand how businesses in this domain typically operate, including their operational realities, commercial considerations, decision-making requirements, dependencies, constraints, exceptions and expected outcomes.

Use this domain understanding to challenge and interrogate the supplied business model.

Identify:

1. Information explicitly represented in the supplied business model.
2. Information implicitly required to execute its documented responsibilities, activities and business-object interactions.
3. Information that may be missing because the business model does not yet describe an important operational, commercial or decision-making dependency.
4. Additional information needs revealed by understanding how this particular type of business operates.

### Distinguish necessary business inference from speculative assumptions

For every potential requirement, evaluate:

- Is it essential or materially useful for the business operations described?
- Does domain knowledge reveal a genuine business dependency?
- Does it enable an actor to perform a responsibility, an activity to proceed, a decision to be made or an outcome to be verified?
- Is it a fundamental business information need, or simply a possible feature, technology, optimisation or enhancement?
- Is the requirement relevant to this particular domain and niche, rather than merely common in other businesses?

Do not reject a requirement simply because it is absent from the supplied inputs. The purpose of discovery is also to uncover missing business information.

However, do not automatically treat industry conventions, popular capabilities or assumed operating practices as established facts about this business.

When a requirement is inferred using domain knowledge, ensure that the business need is logically justified and relevant to the supplied domain and niche.

Do not impose a predefined list of domain-specific capabilities, business objects, actors, activities or information categories.

Discover the information requirements that emerge from reasoning about the actual business context, including important needs that the supplied model may have overlooked.

## 4. INFORMATION NECESSITY, BUSINESS SCOPE AND CAPABILITY DISTINCTION

Domain knowledge may reveal many possible business capabilities. However, not every capability creates a necessary Information Requirement.

For every potential information need, distinguish between:

**1. Business-critical information**

Information required for the business to perform its fundamental operations, fulfil responsibilities, make necessary decisions and achieve expected outcomes.

**2. Business-supporting information**

Information that supports operational efficiency, coordination, quality, financial control, compliance or business management where relevant to the supplied business context.

**3. Potential business capabilities**

Information that could support additional services, advanced analytics, optimisation, personalisation, marketing, predictive modelling or specialised risk management, but is not established as necessary for the business described.

Do not automatically promote potential business capabilities into Information Requirements.

Challenge whether the business actually needs the information or whether it merely represents an optional enhancement.

### REQUIREMENT BOUNDARY TEST

Before including a candidate requirement, ask:

- What specific business need does this information fulfil?
- What would the business be unable to perform, decide, coordinate, control or verify without it?
- Is this information necessary for the described business model, or only useful for a possible future capability?
- Is the proposed information already covered by another requirement?
- Does the requirement combine multiple independent information needs that should be separated?
- Does it introduce an operating policy, commercial strategy, technology or optimisation mechanism that the business model has not established?

Only include requirements that represent meaningful business information needs.

Where domain knowledge identifies a potentially important but unconfirmed capability, do not silently assume it is part of the business model. Include it only when its underlying business necessity can be logically justified by the domain, niche and supplied business context.
---

## 5. INTELLIGENT BUSINESS INFORMATION DISCOVERY

Interrogate the business context through the following analytical questions.

These questions are reasoning lenses, not mandatory categories or a predefined checklist. Explore the relevant implications and discover requirements that emerge from their combined analysis.

### A. What must the business know that its current model does not explicitly tell us?

- What facts, circumstances, conditions or knowledge must exist for the business to perform its operations successfully?
- What would an actor need to know before accepting responsibility or taking action?
- What information is assumed to be available but has not actually been identified?
- What critical knowledge would be missing if the documented business model were implemented exactly as supplied?

### B. What information is necessary to make the business work end-to-end?

- What information must be available before a business activity can begin?
- What information must be known or established while it is being performed?
- What information determines whether an activity can continue, change direction or complete?
- What information must be produced so subsequent business activities can proceed?
- Where does one activity depend on information that another activity must establish?

### C. What does the business need to understand before making a decision?

- What facts must be known before the business can approve, reject, select, allocate, prioritise or commit?
- What circumstances could change the decision?
- What information distinguishes one possible outcome from another?
- What must be known when information is incomplete, conflicting, outdated or uncertain?
- What information would prevent the business from making an uninformed or incorrect decision?

### D. What information must exist between different actors and business responsibilities?

- What does one actor know that another actor must know to fulfil their responsibility?
- What information must be communicated, handed over, acknowledged or confirmed?
- What knowledge is lost or unavailable when responsibility moves between actors?
- What information must be shared to prevent conflicting actions or inconsistent business outcomes?
- What information dependencies are implicit in the relationships between actors and business objects?

### E. What information is missing from the business objects themselves?

- What knowledge is needed to interpret, evaluate or act upon a business object?
- What information comes from outside the business or must be derived from multiple sources?
- What information exists temporarily or contextually without necessarily being a separate business object?
- What information is required to understand changes, history, validity or circumstances surrounding a business object?
- What important information cannot be adequately represented by simply listing the existing business objects?

### F. What happens when the expected business situation does not occur?

- What information would reveal that an activity cannot proceed as expected?
- What must the business know to understand why an operation failed or deviated from its intended outcome?
- What information is required to choose an alternative course of action?
- What must be known to recover, correct, reverse, resume or resolve an interrupted operation?
- What information is necessary to distinguish a recoverable situation from one requiring intervention?

### G. How does the business know whether it has achieved the intended outcome?

- What evidence establishes that an operation has actually succeeded?
- What information is required to confirm completion, correctness, accountability or compliance?
- What information is necessary to identify discrepancies between expected and actual outcomes?
- What knowledge must remain available for future activities, reconciliation or review?
- What information would the business need to understand why expected outcomes were not achieved?

### H. Challenge the completeness of the entire business model

- If this business operated using only the information explicitly identified so far, what would its actors be unable to know or do?
- Which responsibilities cannot realistically be fulfilled without additional information?
- Which activities contain hidden information dependencies?
- Which business-object interactions imply information that has not been identified?
- What assumptions have been made about information availability without explaining what that information actually is?
- What essential business knowledge is missing even though the documented activities appear complete?

---

## 6. CROSS-DIMENSION REASONING

Do not discover requirements by examining actors, activities or business objects in isolation.

Reason across their relationships.

Investigate:

- Information required by multiple actors for different responsibilities.
- Information needed by one actor but generated or established by another.
- Information dependencies between business activities.
- Information needed to initiate, validate, authorise, execute or complete business operations.
- Information that enables business objects to be created, modified, evaluated, exchanged or reconciled.
- Information needed to coordinate operational and commercial responsibilities.
- Information needed to manage exceptions, uncertainty and unexpected business conditions.
- Information required to establish accountability and verify business outcomes.
- Information that exists outside the boundaries of the currently documented business objects.
- Missing information dependencies that could prevent the business model from functioning as intended.

Identify the underlying information need rather than generating separate requirements for every actor, activity or business object that uses it.

Where the same information serves genuinely different business purposes, determine whether those purposes require separate requirements or can be represented by one coherent information requirement.

---

## 7. DISCOVERY SYNTHESIS AND QUALITY EVALUATION

After completing the analysis, consolidate all discovered information needs into a coherent Information Requirements catalogue.

For each candidate requirement, internally evaluate:

**Business necessity**
- What does the business need to know?
- Why does it need to know it?
- What business activity, responsibility, decision or outcome depends on it?

**Domain relevance**
- Is this information need relevant to the supplied domain and niche?
- Is the reasoning based on meaningful domain understanding rather than generic industry assumptions?

**Business completeness**
- Does the requirement address an explicit or implicit information dependency?
- Does it expose a meaningful gap in the supplied business model?
- Would omitting it leave an important business need unaddressed?

**Distinctiveness**
- Does this represent a genuinely distinct information need?
- Is it already covered by another requirement?
- Is it simply a renamed business object, activity, responsibility or data attribute?

**Appropriate abstraction**
- Does it describe what information the business needs?
- Is it expressed at a business-information level rather than a technical implementation level?
- Does it avoid prescribing specific technologies, platforms, databases, APIs, screens or application features?

### Consolidation rules

1. Identify every materially distinct information need justified through the combined business and domain analysis.
2. Consolidate requirements that represent the same underlying information need.
3. Keep separate requirements where the information serves materially different business purposes.
4. Do not create one requirement for every individual data field.
5. Do not create one requirement for every actor or business activity.
6. Do not merely rename existing business objects or activities as Information Requirements.
7. Do not create requirements solely to populate a predefined category.
8. Do not omit important implicit requirements simply because they are absent from the supplied inputs.
9. Do not invent requirements merely to increase the catalogue size.
10. Prioritise business relevance, completeness and meaningful distinction over the number of requirements.


## 8. NON-NEGOTIABLE BUSINESS INFORMATION COMPLETENESS

The discovery process must establish whether the identified Information Requirements collectively provide the information necessary for the supplied business to function according to its actual business model.

Do not confuse requirement relevance with business completeness.

A catalogue may contain individually valid and meaningful requirements while still omitting information essential to the business.

### A. Discover fundamental business information dependencies

Independently examine the supplied domain, niche, business objects, actors, responsibilities, relationships and activities.

Determine:

- What must the business know to perform its fundamental activities?
- What information must exist before actors can fulfil their responsibilities?
- What information enables necessary business decisions and commitments?
- What information is required to execute the business's intended operations?
- What information is necessary to fulfil its obligations to relevant parties?
- What information establishes whether intended outcomes have actually been achieved?
- What information is required to manage deviations, failures and unresolved obligations?
- What information must be retained to establish accountability and business continuity?

Discover these requirements from the actual business context. Do not assume that all businesses have the same activities, obligations, operating stages or information needs.

### B. Apply the non-negotiable information test

For every fundamental business activity, responsibility, obligation and intended outcome identified in the supplied context, evaluate whether the necessary information is represented in the catalogue.

Ask:

1. Can the business perform this activity without the identified information?
2. Can the responsible actor make the decisions necessary to fulfil their responsibility?
3. Can the business establish whether the required conditions for proceeding have been satisfied?
4. Can the business achieve and verify the intended outcome?
5. Can the business fulfil its applicable obligations?
6. Can the business establish accountability when an activity fails or produces an unexpected outcome?

If the absence of particular information makes a fundamental business activity impossible, invalid, non-compliant or materially unaccountable, that information requirement is non-negotiable and must be included.

### C. Distinguish universal necessity from domain-specific necessity

Do not interpret non-negotiable requirements as a universal list of information categories.

The same underlying business principle may produce entirely different Information Requirements across different domains and niches.

Discover the actual information required by this particular business.

A requirement must not be included merely because it is common in another industry or appeared in a previous discovery exercise.

Equally, an essential requirement must not be omitted simply because it is not explicitly documented in the supplied business model.

### D. Prevent false consolidation and omission

Evaluate requirements according to their underlying business purpose and information dependency.

Do not consider two requirements interchangeable merely because they involve the same business object, actor, activity or information source.

Preserve distinct requirements when they support independently necessary business decisions, obligations or outcomes.

Do not merge different information needs into an overly broad requirement that obscures an essential business dependency.

### E. Final completeness validation

After consolidating the discovered requirements, independently re-examine the supplied business context.

Identify any fundamental business activity, responsibility, decision, obligation or outcome for which the required information is still missing.

Compare those information dependencies against the final catalogue.

Add any missing non-negotiable requirements before producing the output.

Do not impose predefined industry categories, mandatory requirement names, fixed lifecycle stages, minimum requirement counts or domain-specific checklists.

**FINAL RULE:**

The catalogue must be complete relative to the actual business model and its justified domain-specific requirements, not relative to a predetermined universal list.

Business-operability completeness takes precedence over minimising the number of requirements. Avoid speculative capabilities, but never omit fundamental information dependencies merely because they are implicit or undocumented.


---
## 9. FINAL BASELINE COVERAGE AND PRESERVATION VALIDATION

Before producing the final JSON, independently revisit the supplied business inputs and answer the following questions.

### A. Baseline Coverage Validation

1. Have all supplied data sources and datasets been examined for their actual business information content?
2. Has every materially distinct information need represented in those sources been captured in the catalogue?
3. Does each corresponding Information Requirement preserve the business meaning of the original information?
4. Has any existing information need been omitted because it was considered implicit, obvious or already understood?
5. Has consolidation accidentally removed or obscured a distinct baseline information need?
6. Have overlapping information needs from different sources been consolidated appropriately without losing their meaning?
7. Can every materially distinct baseline information need be accounted for by at least one requirement in the final catalogue?

If any baseline information need is missing, add or correct the relevant requirement before proceeding.

### B. Additional Discovery Validation

1. What fundamental business information dependencies remain uncovered after comparing the catalogue against the complete business model?
2. Can every documented business activity be performed using the information represented in the catalogue?
3. Can every responsible actor fulfil their documented responsibilities and make the necessary decisions?
4. Can the business establish whether the conditions for proceeding have been satisfied?
5. Can the business verify the intended outcomes of its activities?
6. Can the business manage relevant exceptions, failures and unresolved obligations?
7. Are there additional information needs that are necessary but not adequately represented in the baseline?
8. Have optional, speculative or unjustified capabilities been excluded?

Add any missing, logically justified information requirements before producing the final output.

### C. Final Acceptance Questions

1. Does the final catalogue preserve all materially distinct information needs represented in the supplied baseline?
2. Does it include additional information needs justified by business and domain reasoning?
3. Has any baseline requirement been lost through consolidation or abstraction?
4. Has any additional requirement been introduced without a genuine business necessity?
5. Does the catalogue collectively represent the information this particular business needs to operate, make decisions, coordinate activities and achieve its intended outcomes?

**Final acceptance condition:** Both baseline preservation and additional business information discovery must be satisfied. Neither can substitute for the other.

## 10. OUTPUT SCOPE

For this discovery stage, generate ONLY the following three properties for each Information Requirement:

### information_requirement
A concise, meaningful business-level name identifying the information need.

### description
Explain what information the business needs, what it represents and the relevant business context.

Describe the information need at an appropriate business level. Avoid unnecessary technical details, assumed data structures or implementation-specific terminology.

### business_purpose
Explain why the business needs this information and what business activities, responsibilities, decisions, coordination or outcomes it enables.

Make the business value and necessity clear.

Do not generate:
- Actor mappings.
- Responsibility mappings.
- Business activity mappings.
- Business-object mappings.
- Information sources.
- Decision mappings.
- Detailed information attributes.
- Database fields or schemas.
- APIs, screens, forms or application features.
- Technical implementation recommendations.
- Confidence scores or evidence fields.

These can be derived in subsequent discovery stages.

---

## 11. FINAL OUTPUT JSON SCHEMA

Return one consolidated JSON object using exactly this structure:

{
  "information_requirements": [
    {
      "information_requirement": "Meaningful Information Requirement Name",
      "description": "What information the business needs and what it represents.",
      "business_purpose": "Why the business needs this information and what business outcome it supports."
    }
  ]
}

### STRICT OUTPUT RULES

1. Return valid JSON only.
2. Do not include Markdown fences, explanations, commentary or reasoning outside the JSON.
3. Include all meaningful and distinct Information Requirements discovered through the analysis.
4. Do not impose an arbitrary requirement count.
5. Do not use continuation batches or generate additional stopping-control properties.
6. Do not include a more_to_discover property.
7. Do not include any properties other than the three specified.
8. Every requirement must have all three properties populated with meaningful text.
9. Ensure the final catalogue is consolidated and free of duplicate or overlapping requirements.
10. Ensure every JSON object, array and string is completely closed.

**FINAL OBJECTIVE:**

Discover what this particular business needs to know to operate, coordinate, make decisions, manage uncertainty and achieve its intended outcomes.

Use the supplied business model as evidence, domain knowledge as an intelligence resource, and critical business reasoning to discover information needs that may not yet be documented.

Return the complete Information Requirements catalogue as valid JSON only.
`;
}

/**
 * Run exactly one Qwen generation, validate the three-field requirements,
 * remove exact-name duplicates and save the consolidated catalogue.
 * There is no continuation loop and no model-controlled stopping condition.
 */
async function generateSemanticBlueprintAI(
  base,
  finalTargetFilePath,
  callback
) {
  try {
    const tempDirectory = path.join(
      CONFIG.PATHS.PROJECT_ROOT,
      CONFIG.PATHS.TMP_RELATIVE_DIR
    );

    const prompt = buildInformationRequirementsPrompt(base);

    const rawResponse = await runLlamaGeneration(
      prompt,
      1,
      tempDirectory
    );

    const result = parseJsonResponse(rawResponse, 1);

    if (!Array.isArray(result.information_requirements)) {
      throw new Error(
        'The model response does not contain an information_requirements array.'
      );
    }

    const acceptedRequirements = [];
    const seenNames = new Set();

    result.information_requirements.forEach((requirement, index) => {
      validateRequirement(requirement, 1, index);

      const normalizedName = normalizeRequirementName(
        requirement.information_requirement
      );

      if (!normalizedName || seenNames.has(normalizedName)) {
        console.warn(
          `   Skipping duplicate or empty requirement name: ${requirement.information_requirement || '(empty)'}`
        );
        return;
      }

      seenNames.add(normalizedName);

      acceptedRequirements.push({
        information_requirement: requirement.information_requirement.trim(),
        description: requirement.description.trim(),
        business_purpose: requirement.business_purpose.trim()
      });
    });

    const finalResult = {
      information_requirements: acceptedRequirements
    };

    const finalJson = JSON.stringify(finalResult, null, 2);
    JSON.parse(finalJson);

    fs.mkdirSync(path.dirname(finalTargetFilePath), {
      recursive: true
    });

    fs.writeFileSync(finalTargetFilePath, finalJson, 'utf8');

    console.log('\n✅ Single generation completed.');
    console.log(
      `✅ Requirements returned by Qwen: ${result.information_requirements.length}`
    );
    console.log(
      `✅ Distinct requirements saved: ${acceptedRequirements.length}`
    );
    console.log('✅ No continuation generations were executed.');

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

console.log(
  `\n📂 Reading business objects: ${path.basename(objectsFilePath)}`
);

console.log(
  `📂 Reading actors: ${path.basename(actorsFilePath)}`
);

console.log(
  `📂 Reading actor responsibilities: ${path.basename(businessResponsibilitiesFilePath)}`
);

console.log(
  `📂 Reading actor–business-object relationships: ${path.basename(actorObjectRelationshipsFilePath)}`
);

console.log(
  `📂 Reading business activities: ${path.basename(businessActivitiesFilePath)}`
);

const objectsMatrixContent = fs.readFileSync(
  objectsFilePath,
  'utf8'
);

const objectsActorsContent = fs.readFileSync(
  actorsFilePath,
  'utf8'
);

const objectsActorsRespContent = fs.readFileSync(
  businessResponsibilitiesFilePath,
  'utf8'
);

const objectsActorsRelationShip = fs.readFileSync(
  actorObjectRelationshipsFilePath,
  'utf8'
);

const objectsbusiness_activities = fs.readFileSync(
  businessActivitiesFilePath,
  'utf8'
);

const cleanJsonArray1 = extractDomain_Niche_Main_Content(
  objectsMatrixContent
);

const base = {
  domain: cleanJsonArray1.primarydataset.domain,
  niche: cleanJsonArray1.primarydataset.niche,
  business_objects: cleanJsonArray1.mainContent,
  actor_fields: objectsActorsContent,
  actor_responsibilities: objectsActorsRespContent,
  actor_business_object_relationships: objectsActorsRelationShip,
  business_activities: objectsbusiness_activities
};

/**
 * Generate timestamp for output filename.
 */
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

const finalOutputPath = path.join(
  OUTPUT_DIR.replace(
    `${path.sep}baseline${path.sep}`,
    path.sep
  ),
  `${CONFIG.PATHS.EXPORT_PREFIX}.${timestamp}.md`
);

/**
 * Execute Information Requirements Discovery.
 */
generateSemanticBlueprintAI(
  base,
  finalOutputPath,
  (error, targetSavedPath) => {
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
  }
);

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

/**
 * Resolve the latest matching input file.
 */
function resolveLatestStageFile(directory, prefixPattern) {
  if (!fs.existsSync(directory)) {
    return null;
  }

  const files = fs.readdirSync(directory);

  const matchedFiles = files.filter(
    file => file.startsWith(prefixPattern)
  );

  if (matchedFiles.length === 0) {
    return null;
  }

  matchedFiles.sort(
    (a, b) =>
      fs.statSync(path.join(directory, b)).mtimeMs -
      fs.statSync(path.join(directory, a)).mtimeMs
  );

  return path.join(directory, matchedFiles[0]);
}

/**
 * Retained original extraction helper.
 */
function extractcontent(objectsMatrixContent) {
  const mermaidContent = objectsMatrixContent;

  function extractNodesWithoutRegex(text) {
    const lines = text.split('\n');
    const results = [];

    const targets = [
      '_alternate_path',
      '_degraded_alert',
      '_reject_scenario'
    ];

    for (let line of lines) {
      line = line.trim();

      const matchedSuffix = targets.find(
        suffix => line.includes(suffix)
      );

      if (
        !matchedSuffix ||
        line.includes('-->') ||
        line.includes('.-.')
      ) {
        continue;
      }

      let openChar = '';

      if (line.includes('["')) {
        openChar = '["';
      } else if (line.includes('("')) {
        openChar = '("';
      } else if (line.includes('{"')) {
        openChar = '{"';
      }

      if (!openChar) {
        continue;
      }

      const parts = line.split(openChar);

      if (parts.length < 2) {
        continue;
      }

      const nodeId = parts[0].trim();

      let content = parts[1].trim();

      content = content.replace(
        /["'\])}]+\$/,
        ''
      );

      while (
        content.endsWith('"') ||
        content.endsWith(']') ||
        content.endsWith(')') ||
        content.endsWith('}')
      ) {
        content = content.slice(0, -1);
      }

      results.push({
        node_id: nodeId,
        existing_content: content
      });
    }

    return results;
  }

  const extractedNodes = extractNodesWithoutRegex(
    mermaidContent
  );

  console.log(
    JSON.stringify(
      {
        existing_content: extractedNodes
      },
      null,
      2
    )
  );

  return JSON.stringify(
    {
      existing_content: extractedNodes
    },
    null,
    2
  );
}

/**
 * Extract domain, niche and business-object content from source JSON.
 */
function extractDomain_Niche_Main_Content(objectsData) {
  const interim = JSON.parse(objectsData);

  const domain = interim.domain;
  const niche = interim.niche;

  const base1 = {
    primarydataset: {
      domain,
      niche
    }
  };

  delete interim.domain;
  delete interim.niche;

  base1.mainContent = interim;

  return base1;
}