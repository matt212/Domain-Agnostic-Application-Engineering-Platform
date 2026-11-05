
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
      '7.7.0.9.Derive_Information_Requirements'
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
# PART 1 — ITERATIVE INTELLIGENT BUSINESS CONTEXT DISCOVERY

## 1. ROLE AND EXPERTISE

Act as an exceptionally experienced:

- Senior Business Analyst
- Industry and Domain Specialist
- Business Process Architect
- Enterprise Information Architect
- Functional Consultant
- Operational Transformation Consultant
- Business Information Requirements Architect

Think like a senior domain consultant who understands how
businesses actually operate, including their information needs,
operational dependencies, responsibilities, business activities,
decisions, exceptions and cross-functional interactions.

Your task is to elaborate an existing collection of parent
Information Requirements by discovering the complete business
context associated with EACH requirement.

This is an intelligent, domain-driven business discovery exercise.

It is NOT a task to rediscover Information Requirements,
extract business objects as requirements, or generate a new
collection of parent requirements.

---

## 2. DOMAIN AND BUSINESS DISCOVERY DATA

Domain:
${base.domain}

Niche:
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

IMPORTANT:

These datasets are the business discovery baseline.

They provide information about the existing business ecosystem,
but they are NOT the source of parent Information Requirements.

Use these datasets to understand the business and discover
the actors, responsibilities, activities and business-object
relationships associated with each parent requirement.

You must also use domain and niche knowledge to discover
business context missing from these datasets.

---

## 3. AUTHORITATIVE PARENT INFORMATION REQUIREMENTS
## STRICT SOURCE CONTROL

The ONLY source of parent Information Requirements is:

${JSON.stringify(base.information_requirements, null, 2)}

This is the authoritative collection of previously discovered
Information Requirements.

Each entry provides:

- information_requirement
- description
- business_purpose

These entries have already been discovered and established.

Your task is to elaborate these requirements, NOT discover
or generate a replacement list.

### 3.1 Strict Parent Requirement Rules

For every supplied entry:

1. Read its information_requirement.
2. Read its description.
3. Read its business_purpose.
4. Understand the actual information need represented by it.
5. Perform the Part 1 business-context discovery for that requirement.
6. Use its original information_requirement value in the output.

The output information_requirement MUST be copied directly
from the corresponding input entry.

It must NEVER be derived from:

- Business object names.
- Actor names.
- Responsibility names.
- Activity names.
- Relationships.
- Domain or niche terminology.
- AI-generated interpretations.

### 3.2 Critical Conceptual Distinction

An Information Requirement describes WHAT business information
the organization needs.

A Business Object describes an entity that stores, represents,
manages, provides or consumes business information.

These are not interchangeable concepts.

For example:

Parent Information Requirement:
"Real-Time Inventory Availability and Stock Levels"

Supporting Business Object:
"Real-Time Inventory Snapshot"

The business object may be relevant to the Information Requirement,
but it MUST NOT replace the parent requirement in the output.

Similarly:

- "Delivery Zone Map" is not automatically an Information Requirement.
- "Store Partner Agreement" is not automatically an Information Requirement.
- "Product Catalog" is not automatically an Information Requirement.

Even if a business object appears highly relevant, it must remain
a supporting business object and must never become a parent
Information Requirement.

### 3.3 No Parent Requirement Invention

You are strictly prohibited from:

- Creating new Information Requirements.
- Generating Information Requirements from business objects.
- Using business object names as parent requirement names.
- Renaming supplied Information Requirements.
- Replacing supplied Information Requirements with shorter names.
- Splitting a parent requirement into multiple output requirements.
- Combining multiple parent requirements.
- Omitting an existing parent requirement.
- Reordering the parent requirements.

The parent Information Requirement collection is immutable.

Only its associated business-context relationships are being
discovered and elaborated.

---

## 4. ITERATIVE PROCESSING — EVERY REQUIREMENT

Process the authoritative Information Requirements collection
one entry at a time.

For EACH parent Information Requirement, independently:

1. Read its original name, description and business purpose.
2. Understand the information need in the context of the domain
   and niche.
3. Investigate the business capabilities that depend on it.
4. Discover all relevant business actors.
5. Discover the responsibilities associated with those actors.
6. Discover the business activities associated with the requirement.
7. Identify all relevant existing business objects.
8. Investigate upstream and downstream dependencies.
9. Discover implicit relationships using domain knowledge.
10. Investigate relevant operational exceptions and alternative paths.
11. Cross-check all four discovery dimensions.
12. Produce exactly one output object for that parent requirement.

After completing one requirement, move to the next input requirement.

Repeat until EVERY supplied Information Requirement has been processed.

### Iteration Rules

- Each requirement is an independent discovery exercise.
- Do not blindly reuse the previous requirement's results.
- Shared actors may appear in multiple requirements when relevant.
- Shared responsibilities may appear in multiple requirements when relevant.
- Shared activities may appear in multiple requirements when relevant.
- Shared business objects may appear in multiple requirements when relevant.
- Evaluate relevance independently for each requirement.
- Do not stop after the first requirement.
- Do not return a representative sample.
- Do not generate additional parent requirements.

---

## 5. INTELLIGENT DOMAIN AND BUSINESS REASONING

For EACH parent Information Requirement, conduct the following
investigations independently.

Do not immediately select matching names from the supplied data.

First understand what the information requirement actually means
operationally in the specified domain and niche.

### 5.1 Business Purpose Investigation

Ask yourself:

- What actual business problem does this information requirement solve?
- What business capability depends on this information?
- What operational outcome is the business trying to achieve?
- What would become impossible, unreliable or inefficient if this
  information were unavailable?
- Is the information required by one business function or several?
- Which upstream business activities create the need for it?
- Which downstream business activities depend on it?
- Does it support execution, authorization, monitoring, control
  or business decision-making?
- Is the information needed continuously or at specific business events?
- What other business information must be available to fulfil this need?
- Are there dependencies that are not represented in the baseline?

Understand the complete business purpose before selecting
the associated entities.

### 5.2 Actor Discovery Investigation

Examine the complete business ecosystem.

Ask:

- Who experiences the business problem addressed by this requirement?
- Who needs the information to perform their responsibilities?
- Who originates or first captures the information?
- Who supplies the information to another participant?
- Who is accountable for maintaining its accuracy?
- Who verifies or confirms its correctness?
- Who uses it to approve, reject, allocate or execute?
- Who monitors it and intervenes when something goes wrong?
- Who consumes it without directly creating it?
- Who is affected when it is missing or incorrect?
- Are there upstream or downstream participants whose responsibilities
  depend on this information?
- Does the domain require marketplace participants, service providers,
  regulators, operational controllers, customers or external
  information providers?
- Does the existing actor catalogue omit a functionally necessary role?
- Are there distinct business roles hidden under a generic actor?
- Does the requirement involve both human and system actors?

Investigate participants across:

- Information origination.
- Information provision.
- Information ownership.
- Information maintenance.
- Information verification.
- Information consumption.
- Operational execution.
- Authorization and decision-making.
- Monitoring and control.
- Exception handling and recovery.
- Governance and compliance.

Do not include every participant simply because they exist
in the business ecosystem.

Include actors with a genuine functional relationship to
the parent Information Requirement.

You MAY discover and introduce additional actors or functional
roles that are absent from the supplied actor baseline.

### 5.3 Responsibility Discovery Investigation

For every relevant actor, ask:

- What is this actor actually accountable for?
- Which responsibility creates the need for this information?
- What task cannot be performed correctly without it?
- Does the actor capture, maintain, verify, approve, consume
  or act upon the information?
- Does the responsibility involve operational execution or control?
- Does the actor need this information to exercise an authorization?
- Does the actor correct discrepancies?
- Does the actor monitor an operational condition represented
  by this information?
- Is there a separation between the participant providing information
  and the participant accountable for its accuracy?
- Does the domain imply responsibilities absent from the baseline?
- Are multiple responsibilities required at different lifecycle stages?
- Does the actor have exception-resolution or escalation responsibilities?

Discover specific, meaningful business responsibilities.

You MAY infer additional responsibilities using domain and niche
knowledge even when they are absent from the supplied catalogue.

### 5.4 Business Activity Discovery Investigation

Investigate the complete operational lifecycle.

Ask:

- Which activity first creates the need for this information?
- Which activity captures or generates it?
- Which activity retrieves or consumes it?
- Which activity verifies or validates it?
- Which activity uses it to make a business decision?
- Which activity updates the underlying information?
- Which activity depends on it before proceeding?
- Which activity uses it to complete a transaction?
- Which activities depend on it after the initial transaction?
- Which activities monitor changes in the information?
- Which activities handle missing, inaccurate or conflicting information?
- Which activities support correction, reconciliation or recovery?
- Does the requirement support several stages of the business lifecycle?
- Are activities in the supplied catalogue missing information dependencies?
- Does domain knowledge indicate additional operational dependencies?
- Are there alternative activities that consume the same information?

Investigate activities associated with:

- Information generation.
- Information capture.
- Information ingestion.
- Information synchronization.
- Information enrichment.
- Information verification.
- Information reconciliation.
- Information retrieval.
- Information consumption.
- Operational execution.
- Exception management.
- Recovery and correction.
- Continuous monitoring.

These are reasoning perspectives, not mandatory activities.

You MAY discover additional domain-relevant business activities
that are absent from the supplied activity catalogue.

Do not include activities simply because they sound relevant.
Establish their functional connection to the parent requirement.

### 5.5 Business Object Discovery Investigation

Investigate the information requirement's relationship with
the existing business object ecosystem.

Ask:

- Which business object represents the required information?
- Which object initially captures the information?
- Which object provides information to another object?
- Which object consumes or depends on the information?
- Which object must be updated when the information changes?
- Which object contains evidence, status or outcomes associated
  with the information?
- Which objects depend on it for creation, validation or processing?
- Does the information need to be shared across multiple objects?
- Are there parent-child or transactional dependencies?
- Does the information change during an object's lifecycle?
- Does an existing business object have an implicit information
  dependency not represented in its current definition?
- Is an object genuinely functionally related or merely associated?
- Which supporting objects are necessary for the information
  to be created, verified, maintained or consumed?

Do not restrict analysis to explicitly declared object attributes.

Use domain knowledge to discover relationships beyond the
supplied actor-object relationship catalogue.

### STRICT BUSINESS OBJECT RULE

For this Part 1 generation, related_business_objects must contain
only business objects from the supplied business_objects baseline.

Do not invent new business objects.

Do not use actors, responsibilities or activities as business objects.

Do not use a business object as a replacement parent
Information Requirement.

### 5.6 Cross-Functional Dependency Investigation

Think beyond individual actors, responsibilities, activities and objects.

Ask:

- Which business functions must cooperate to fulfil this requirement?
- Does one actor provide information another actor relies upon?
- Does one activity produce information consumed by another activity?
- Does one business object depend on another object's information?
- Is information shared between operational and control functions?
- Are there dependencies between customer-facing and back-office
  operations?
- Are there financial, compliance, logistics, service or operational
  dependencies relevant to the niche?
- What upstream information must exist before this requirement
  can be fulfilled?
- Which downstream business functions consume its outcome?
- What happens when two participants have conflicting information?
- Does the requirement involve internal and external participants?
- Are there dependencies across organizational or operational boundaries?

Discover meaningful relationships even when they are not explicitly
represented in the supplied baseline.

### 5.7 Exception and Alternative Scenario Investigation

Do not analyse only the ideal business scenario.

Ask:

- What happens if the information is missing?
- What happens if it is inaccurate or outdated?
- What happens if two information sources disagree?
- What happens if the responsible actor cannot provide it?
- What happens if an activity fails halfway through?
- Does another participant need to intervene?
- Does the business require verification, correction or reassignment?
- Which actors and activities become involved during recovery?
- Which existing business objects record the exception or outcome?
- Are alternative operational paths dependent on this information?
- Does the domain require escalation, reconciliation or compensating action?

Include relevant actors, responsibilities and activities involved
in exception handling where they genuinely relate to the requirement.

---

## 6. BASELINE-PLUS-DOMAIN DISCOVERY

The supplied business datasets are the baseline, not the limit
of business discovery.

Use two complementary sources of reasoning.

### A. Existing Business Data

Use the supplied datasets to identify and preserve:

- Existing business actors.
- Existing responsibilities.
- Existing activities.
- Existing business objects.
- Existing relationships.

Preserve original names exactly when using existing entities.

### B. Domain and Niche Knowledge

Actively use industry knowledge, operating models, transaction
lifecycles and operational dependencies to discover:

- Missing business actors.
- Missing functional roles.
- Missing responsibilities.
- Missing business activities.
- Missing cross-functional relationships.
- Missing upstream and downstream dependencies.
- Missing operational participants.
- Missing exception-handling participants.

You are explicitly expected to infer and introduce additional
business context when domain knowledge indicates it is necessary.

### Inference Rules

- Additional actors are permitted.
- Additional responsibilities are permitted.
- Additional activities are permitted.
- Additional relationships are permitted.
- New business objects are NOT permitted in this stage.
- New parent Information Requirements are NOT permitted.
- Do not invent unrelated organizational roles.
- Do not invent named companies, vendors or deployed systems.
- Do not fabricate company-specific policies or integrations.
- Do not add generic industry participants without functional justification.
- Do not suppress valid domain inference merely because the baseline
  does not explicitly contain it.

Distinguish existing baseline entities from domain-inferred entities
through your internal reasoning.

The output schema remains unchanged and does not require
additional provenance properties.

---

## 7. EXHAUSTIVE TRACEABILITY DISCOVERY

For EACH parent Information Requirement, independently construct
the following four dimensions.

### 7.1 required_by_actors

Include all relevant actors who:

- Need the information.
- Originate the information.
- Provide the information.
- Maintain the information.
- Verify the information.
- Authorize or approve using the information.
- Consume the information.
- Act upon the information.
- Monitor the information.
- Resolve exceptions involving the information.

Include newly inferred actors when domain reasoning establishes
their functional necessity.

### 7.2 related_responsibilities

Include all relevant responsibilities that:

- Create the need for the information.
- Explain why an actor requires or handles it.
- Govern its origination or provision.
- Govern its maintenance or accuracy.
- Require its verification.
- Use it to make business decisions.
- Depend on it for operational execution.
- Require its monitoring or control.
- Involve exception handling or recovery.

Include meaningful domain-inferred responsibilities.

### 7.3 related_activities

Include all relevant business activities that:

- Generate the information.
- Capture the information.
- Supply or synchronize the information.
- Retrieve or consume the information.
- Verify or validate the information.
- Update or maintain the information.
- Depend on the information.
- Use it for business execution.
- Monitor it.
- Handle exceptions, corrections or recovery.

Discover activities across the complete business lifecycle.

Do not return only the primary activity.

Include meaningful domain-inferred activities.

### 7.4 related_business_objects

Include all relevant existing business objects that:

- Represent the information.
- Originate the information.
- Store or contain the information.
- Supply the information.
- Consume the information.
- Depend on the information.
- Are updated using the information.
- Represent decisions or operational outcomes.
- Record associated exceptions or reconciliation outcomes.

Use only the supplied business_objects dataset.

Do not invent additional objects.

---

## 8. CROSS-DIMENSIONAL COMPLETENESS REVIEW

After discovering the four dimensions, cross-check their relationships.

Do not investigate each dimension independently and stop.

Examine whether:

- Every identified actor has a meaningful information-related role.
- Every responsibility explains why an actor requires or handles
  the information.
- Every activity has a genuine connection to the requirement.
- Every business object has a genuine functional relationship
  to the information.
- Missing actors reveal overlooked responsibilities or activities.
- Missing activities reveal overlooked object dependencies.
- Upstream and downstream relationships have been considered.
- Relevant exception and recovery participants have been considered.
- Domain-specific business practices have informed the discovery.

### Mandatory Completeness Questions

Before producing each requirement's result, ask:

1. Have I understood the actual business purpose?
2. Have I identified all meaningful information stakeholders?
3. Have I considered information providers and consumers?
4. Have I considered operational, control and governance participants?
5. Have I identified the responsibilities behind their involvement?
6. Have I investigated the complete information-related activity lifecycle?
7. Have I considered upstream and downstream dependencies?
8. Have I investigated relationships across business objects?
9. Have I considered relevant operational exceptions and recovery?
10. Have I used domain and niche knowledge to discover missing elements?
11. Have I gone beyond keyword matching against the baseline?
12. Have I included all meaningful relationships without adding
    unrelated entities?
13. Have I preserved the exact original parent requirement name?
14. Have I avoided using business object names as parent requirements?

If meaningful elements are missing, revise the result before
moving to the next parent requirement.

### Completeness Constraints

- Do not return a representative sample.
- Do not arbitrarily limit array sizes.
- Do not stop after identifying the first few obvious matches.
- Do not optimize for a short response at the expense of discovery.
- Do not add irrelevant entities to increase coverage.
- Avoid duplicate entries within each array.

---

## 9. REQUIRED OUTPUT JSON STRUCTURE

Return ONE consolidated JSON array.

Generate exactly one object for EVERY entry in the authoritative
parent Information Requirements collection.

Each object must contain exactly these five properties:

{
  "information_requirement": "Original Parent Information Requirement",
  "required_by_actors": [],
  "related_responsibilities": [],
  "related_activities": [],
  "related_business_objects": []
}

### Output Example — Structure Only

[
  {
    "information_requirement": "Original Parent Information Requirement",
    "required_by_actors": [
      "Relevant Actor"
    ],
    "related_responsibilities": [
      "Relevant Responsibility"
    ],
    "related_activities": [
      "Relevant Activity"
    ],
    "related_business_objects": [
      "Existing Business Object"
    ]
  },
  {
    "information_requirement": "Original Parent Information Requirement",
    "required_by_actors": [
      "Relevant Actor"
    ],
    "related_responsibilities": [
      "Relevant Responsibility"
    ],
    "related_activities": [
      "Relevant Activity"
    ],
    "related_business_objects": [
      "Existing Business Object"
    ]
  }
]

This example illustrates the required structure only.

Populate all arrays with actual discoveries.

The example names above are illustrative parent requirement names.
In execution, use ONLY the names supplied in the authoritative
input collection.

---

## 10. MANDATORY INPUT-OUTPUT VALIDATION

Before returning the final JSON, validate the complete collection.

### 10.1 Parent Requirement Validation

Let:

INPUT_REQUIREMENTS =
the exact entries in the supplied information_requirements collection.

OUTPUT_REQUIREMENTS =
the information_requirement values in the generated JSON array.

Verify:

- Output object count equals input requirement count.
- Every input requirement appears exactly once.
- Every output name exactly matches an input name.
- Original input order is preserved.
- No input requirement is omitted.
- No requirement is duplicated.
- No new requirement is introduced.
- No business object name is used as a replacement parent requirement.

If any validation fails, correct the output before returning it.

### 10.2 Supporting Data Validation

Verify:

- Existing actors retain their supplied names.
- Existing responsibilities retain their supplied names.
- Existing activities retain their supplied names.
- Existing business objects retain their supplied names.
- Domain-inferred actors, responsibilities and activities are
  functionally justified.
- Related business objects come exclusively from the supplied
  business_objects dataset.
- No actor, responsibility or activity is incorrectly classified
  as a business object.

### 10.3 JSON Schema Validation

Every output object must contain exactly:

- information_requirement
- required_by_actors
- related_responsibilities
- related_activities
- related_business_objects

All four relationship properties must be arrays of strings.

Do not add descriptions, business purposes or any other properties.

---

## 11. FINAL EXECUTION INSTRUCTION

Process every entry in the authoritative
base.information_requirements collection.

For each entry, independently conduct a deep business-context
discovery using:

- Its original information_requirement.
- Its description.
- Its business_purpose.
- The supplied business discovery datasets.
- Domain and niche knowledge.

Use the supporting datasets as the discovery baseline.

Actively infer missing actors, responsibilities, activities
and relationships where domain knowledge justifies them.

Do not generate, rename, replace, derive or invent parent
Information Requirements.

Do not use business object names as parent requirements.

The parent Information Requirements must come exclusively
from the supplied authoritative collection.

Return exactly one consolidated JSON array containing one
complete Part 1 object for every supplied parent requirement.

PART 1 ONLY.

Do not generate:

- information_usage
- information_source
- business_decisions_supported
- required_information_details
- functional_rules
- information_validation
- information_flow

Return only valid JSON.
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
