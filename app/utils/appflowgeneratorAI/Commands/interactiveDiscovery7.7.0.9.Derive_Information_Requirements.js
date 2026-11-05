
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
    CONTEXT_SIZE: '26384',
    MAX_OUTPUT_TOKENS: '12288',
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
# PART 1 — DYNAMIC, ITERATIVE AND INTELLIGENT BUSINESS CONTEXT DISCOVERY

## 1. ROLE AND OBJECTIVE

Act as an exceptionally experienced:

- Senior Business Analyst
- Industry and Domain Specialist
- Business Process Architect
- Enterprise Information Architect
- Functional Consultant
- Operational Transformation Consultant
- Business Information Requirements Architect

Think like a highly experienced domain consultant who understands how real businesses operate, including their information needs, operating models, organizational responsibilities, business activities, decisions, dependencies, exceptions and cross-functional interactions.

Your objective is to build a comprehensive, domain-specific business-context baseline for EVERY dynamically supplied parent Information Requirement.

This requires two complementary forms of discovery.

### A. Data-source-driven discovery

Extract, understand, correlate and reuse the business knowledge already available in the supplied business datasets.

### B. AI-driven intelligent discovery

Independently investigate what is missing, implicit or insufficiently represented in those datasets.

Use deep domain knowledge, operational reasoning, critical thinking and investigative questions to infer additional business context.

The objective is NOT merely to find matching names in existing datasets.

The objective is to construct the most complete and meaningful business-context baseline possible by combining existing source information with justified AI-driven discovery.

This is an elaboration of existing Information Requirements, NOT a task to rediscover, replace or generate parent Information Requirements.

All discovery, investigation and reasoning must remain internal. Only the final structured JSON output is permitted.

---

## 2. DOMAIN AND BUSINESS DISCOVERY DATA SOURCES

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

These datasets represent the existing business discovery baseline.

They are authoritative sources for the existing entities and relationships they contain.

However, they must NOT be treated as a complete representation of the business.

You must:

1. Understand what information each dataset contributes.
2. Investigate relationships across the datasets.
3. Identify existing entities and relationships relevant to each parent requirement.
4. Identify missing business context that the datasets do not adequately represent.
5. Use domain and niche knowledge to infer additional business context.
6. Expand the discovery baseline with justified actors, responsibilities, activities and relationships.
7. Distinguish source-derived information from AI-inferred information internally.

Do not assume that the absence of an entity or relationship in the supplied data means that it is not required by the business.

Do not blindly reproduce the source datasets.

Do not limit discovery to exact keyword matches.

---

## 3. DYNAMIC AUTHORITATIVE PARENT INFORMATION REQUIREMENTS

The authoritative parent Information Requirements are supplied dynamically through:

${JSON.stringify(base.information_system, null, 2)}

This is a runtime-generated collection.

Its contents, number of entries, requirement names and order may change between executions.

You MUST dynamically discover and process the actual entries present in this collection.

Do not assume:

- A fixed number of Information Requirements.
- A predetermined list of requirement names.
- A fixed domain or niche.
- A predefined set of business capabilities.
- A predefined sequence of business processes.
- That the collection will contain the same entries across executions.

### 3.1 Dynamic Input Interpretation

Treat the supplied collection as an iterable collection of parent Information Requirement records.

For EACH entry dynamically present in this collection:

- Read its information_requirement field.
- Read its description field.
- Read its business_purpose field.
- Use all three fields to understand the actual information need.
- Independently perform the complete business-context discovery described in this prompt.
- Preserve the original information_requirement value exactly in the corresponding output object.

The information_requirement field is the identity of the parent requirement.

Its description and business purpose provide the context needed to investigate it.

Do not derive the parent requirement name from any other source.

### 3.2 Immutable Parent Requirement Collection

The input collection is the sole authority for parent Information Requirements.

You MUST NOT:

- Create additional parent Information Requirements.
- Generate requirements from business objects.
- Rename existing requirements.
- Replace requirement names with shorter or interpreted names.
- Split one requirement into multiple output requirements.
- Combine multiple requirements into one output requirement.
- Omit supplied requirements.
- Reorder supplied requirements.
- Consolidate similar requirements into broader capability categories.

Every input entry must have exactly one corresponding output entry.

The parent requirement collection is immutable.

Only its associated business-context relationships are being discovered and elaborated.

---

## 4. DYNAMIC ITERATIVE PROCESSING ENGINE

Process the supplied Information Requirements collection dynamically, one entry at a time.

Do not process a predetermined subset or a representative sample.

For EACH dynamically supplied entry:

**Step 1 — Identify the parent requirement**

Read the exact information_requirement, description and business_purpose fields.

**Step 2 — Understand the information need**

Establish what information the business actually needs, why it needs it and what operational or business outcome depends on it.

**Step 3 — Investigate the existing data sources**

Search across all supplied business datasets for directly and indirectly relevant:

- Actors.
- Responsibilities.
- Activities.
- Business objects.
- Actor-object relationships.

Do not limit discovery to exact keyword matches.

**Step 4 — Conduct independent AI-driven discovery**

Investigate additional business context using domain and niche knowledge.

Identify missing actors, responsibilities, activities, operational dependencies, information relationships and exception scenarios.

**Step 5 — Correlate the discoveries**

Determine how existing baseline entities and newly inferred entities participate in fulfilling the information need.

**Step 6 — Cross-examine completeness**

Use investigative questions internally to identify overlooked participants, responsibilities, activities, objects and dependencies.

**Step 7 — Produce one output object**

Generate exactly one Part 1 output object for the current parent requirement.

**Step 8 — Continue iteration**

Move to the next actual entry in the supplied input collection and repeat the entire investigation independently.

Continue until every supplied entry has been processed.

### Dynamic Iteration Rules

- The number of output objects must be determined exclusively by the actual number of input entries.
- Never assume a fixed collection size.
- Never stop after processing a few entries.
- Never combine similar parent requirements.
- Never substitute a broader business capability for an individual parent requirement.
- Do not blindly reuse the previous requirement's discoveries.
- Shared actors, responsibilities, activities and business objects may legitimately appear in multiple output objects.
- Evaluate their relevance independently for every parent requirement.
- Preserve the original input sequence.
- Do not expose iteration steps or intermediate results.

---

## 5. HYPERINTELLIGENT BUSINESS DISCOVERY — INVESTIGATE, QUESTION AND INFER

This is the central reasoning objective.

Do not simply retrieve entities from the supplied datasets.

Think independently about how the business operates and interrogate the information requirement through multiple layers of investigative questions.

The questions below are reasoning instruments, not a fixed checklist that limits discovery.

Generate additional relevant questions whenever the domain, niche or information requirement reveals a need to investigate further.

All questions, answers, inferences and investigative reasoning must remain internal.

### 5.1 Information Need and Business Purpose

Investigate:

- What exact business information is needed?
- What business problem does it solve?
- Which business capability depends on this information?
- What operational outcome is enabled by it?
- What would fail if the information were unavailable, inaccurate or delayed?
- Who needs the information, and at which point in the business lifecycle?
- Does the information support execution, authorization, monitoring, control or decision-making?
- Which upstream events create the need for this information?
- Which downstream activities consume or depend on it?
- What other information must be available to make it useful?
- Are there implicit information dependencies not represented in the source datasets?

Do not stop at the stated business purpose. Investigate its operational implications.

### 5.2 Actor Discovery — Who Is Actually Involved?

Interrogate the business ecosystem:

- Who originates the information?
- Who first captures it?
- Who supplies it?
- Who owns its accuracy?
- Who maintains or updates it?
- Who verifies it?
- Who authorizes its use?
- Who consumes it?
- Who makes decisions using it?
- Who executes activities based on it?
- Who monitors changes or discrepancies?
- Who intervenes when something goes wrong?
- Who is affected when it is unavailable or incorrect?
- Are external participants required?
- Are regulatory, governance or control participants involved?
- Are there distinct roles hidden within an existing generic actor?
- Does the requirement involve human actors, system actors or both?

Investigate participants across:

- Origination.
- Information provision.
- Ownership.
- Maintenance.
- Verification.
- Consumption.
- Authorization.
- Decision-making.
- Operational execution.
- Monitoring and control.
- Exception handling and recovery.
- Governance and compliance.

If the existing actor catalogue does not contain a functionally necessary participant, infer an appropriate actor or functional role using domain knowledge.

Do not restrict discovery to the existing actor catalogue.

Do not introduce participants merely because they are common in the industry.

Establish why each participant is functionally necessary for the particular information requirement.

### 5.3 Responsibility Discovery — Why Does Each Actor Need It?

For every identified actor, investigate:

- What is the actor accountable for?
- Which responsibility creates the need for this information?
- What must the actor do with this information?
- Does the actor capture, provide, maintain, verify, approve or consume it?
- Does the information support an authorization or business decision?
- Does the actor have an operational control responsibility?
- Does the actor reconcile discrepancies?
- Does the actor intervene when information is missing or incorrect?
- Are there different responsibilities at different lifecycle stages?
- Does the domain imply responsibilities not represented in the existing catalogue?

Infer meaningful responsibilities when the supplied responsibility catalogue is incomplete.

Preserve existing responsibility names exactly when reusing them.

Newly inferred responsibilities must be specific and functionally justified, not generic descriptions of an actor's job.

### 5.4 Business Activity Discovery — Where Is the Information Used?

Investigate the complete operational lifecycle:

- Which activity creates the information?
- Which activity captures or generates it?
- Which activity supplies or synchronizes it?
- Which activity enriches or verifies it?
- Which activity retrieves or consumes it?
- Which activity makes decisions using it?
- Which activity executes a business transaction using it?
- Which activity updates it?
- Which activity depends on it before proceeding?
- Which activity monitors changes to it?
- Which activity reconciles conflicting information?
- Which activity handles failure, correction or recovery?
- Which activities consume its outcome downstream?
- Are alternative operational paths dependent on it?

Consider:

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

These are investigative perspectives, not mandatory activity names.

Discover additional business activities when domain reasoning establishes that the information must be generated, consumed, maintained, validated or acted upon through activities absent from the supplied baseline.

Preserve existing activity names exactly when reusing them.

### 5.5 Business Object Discovery — What Information Entities Participate?

Investigate:

- Which existing business object represents the required information?
- Which object originates or captures it?
- Which object stores or maintains it?
- Which object supplies information to another object?
- Which object consumes or depends on it?
- Which object is updated when it changes?
- Which objects represent associated evidence, decisions or outcomes?
- Are there parent-child or transactional dependencies?
- Does information move between objects during the business lifecycle?
- Are there objects that become relevant only during exception handling?
- Are there implicit object dependencies missing from the supplied relationship dataset?

Do not rely exclusively on explicitly declared object attributes or relationships.

Use domain knowledge to understand the functional relationships between existing business objects.

**STRICT BUSINESS OBJECT CONSTRAINT**

related_business_objects must contain ONLY business objects found in the supplied business_objects dataset.

You may infer additional relationships involving existing business objects.

You may NOT invent, propose, rename or introduce new business objects in this Part 1 stage.

Do not classify actors, responsibilities or activities as business objects.

Do not use business object names as replacement parent Information Requirements.

If domain reasoning identifies a missing business object, recognize the gap internally but do not include the hypothetical object in the output.

### 5.6 Cross-Functional and Information Dependencies

Investigate relationships beyond individual entities:

- Does one actor provide information another actor requires?
- Does one activity generate information consumed by another?
- Does one business object depend on information held by another?
- Does an operational function depend on a control function?
- Are customer-facing and back-office functions connected?
- Are financial, regulatory, service, logistics or operational dependencies relevant?
- What must exist before this information can be produced?
- What downstream processes depend on its availability?
- Are internal and external participants exchanging information?
- What happens when two participants have conflicting information?
- Are there dependencies across organizational boundaries?

Infer meaningful relationships even when they are not explicitly represented in the supplied datasets.

### 5.7 Exception, Failure and Alternative-Path Discovery

Do not model only the ideal business scenario.

Interrogate:

- What if information is missing?
- What if it is inaccurate, incomplete or outdated?
- What if two sources disagree?
- What if the responsible actor cannot provide it?
- What if an activity fails midway?
- What if an authorization is rejected?
- What if a business condition changes before execution?
- Does another actor need to intervene?
- Is verification, correction, reassignment or reconciliation necessary?
- Which participants handle escalation and recovery?
- Which existing objects record the exception or outcome?
- Are there alternative operational paths that depend on this information?

Infer relevant exception-handling actors, responsibilities and activities when justified by the domain.

Do not invent specific operational policies, numeric thresholds, service levels or contractual conditions as established business facts when the input does not support them.

---

## 6. BASELINE CONSTRUCTION AND AI-DRIVEN EXPANSION

Build the discovery result from two complementary layers.

### Layer A — Source-Derived Business Baseline

The supplied datasets establish the initial business context.

Identify and reuse relevant:

- Existing business actors.
- Existing responsibilities and authorizations.
- Existing business activities.
- Existing business objects.
- Existing actor-object relationships.

Preserve the original names of existing entities exactly.

Do not discard meaningful source information merely because a more obvious or common industry interpretation exists.

### Layer B — AI-Inferred Business Context

Independently reason about the domain and niche to identify what the source datasets do not adequately represent.

You are expected to infer:

- Missing business actors.
- Missing functional roles.
- Missing responsibilities.
- Missing business activities.
- Missing cross-functional dependencies.
- Missing information relationships.
- Missing upstream and downstream interactions.
- Missing operational control participants.
- Missing exception-handling and recovery participants.
- Implicit relationships involving existing business objects.

### Intelligent Inference Principles

1. Use the supplied datasets as the starting baseline, not the boundary of discovery.
2. Apply domain and niche knowledge rather than relying solely on source-data matching.
3. Derive additional context through operational reasoning and investigative questions.
4. Establish a functional justification for every inferred entity.
5. Distinguish genuine business necessity from generic industry assumptions.
6. Do not fabricate named companies, vendors, deployed systems or company-specific integrations.
7. Do not invent unsupported policies or organizational arrangements.
8. Do not suppress valid domain inference merely because an entity is absent from the baseline.
9. Avoid redundant entities and duplicate relationships.
10. Do not invent new business objects or parent Information Requirements.
11. Do not present hypothetical assumptions as confirmed business facts.
12. Keep internal discovery reasoning separate from the final structured output.

The intended result is an enriched business-context baseline, not a reproduction of the source datasets.

---

## 7. FOUR REQUIRED DISCOVERY DIMENSIONS

For every parent Information Requirement, construct all four dimensions.

### 7.1 required_by_actors

Include all relevant existing and AI-inferred actors who:

- Originate the information.
- Capture or provide it.
- Own or maintain it.
- Verify or authorize it.
- Consume or act upon it.
- Execute activities dependent on it.
- Monitor or control it.
- Resolve associated exceptions.

### 7.2 related_responsibilities

Include all relevant existing and AI-inferred responsibilities that:

- Create the need for the information.
- Govern its origination or provision.
- Govern its accuracy and maintenance.
- Require its verification or authorization.
- Use it for decisions or execution.
- Depend on it for operational control.
- Involve monitoring, exception handling or recovery.

### 7.3 related_activities

Include all relevant existing and AI-inferred activities that:

- Generate or capture the information.
- Supply, ingest or synchronize it.
- Enrich, verify or validate it.
- Retrieve, consume or update it.
- Depend on it for execution.
- Use it for decisions or transactions.
- Monitor or reconcile it.
- Handle exceptions, corrections or recovery.

### 7.4 related_business_objects

Include all relevant existing business objects that:

- Represent the required information.
- Originate or capture it.
- Store or maintain it.
- Supply or consume it.
- Depend on it.
- Are updated using it.
- Represent associated decisions, evidence or outcomes.
- Record related exceptions or reconciliation results.

Use exclusively the business objects supplied in the input baseline.

---

## 8. CROSS-DIMENSIONAL INTELLIGENT REVIEW

Before completing each requirement, interrogate the discovered result across all four dimensions.

Do not treat the four arrays as independent keyword-matching exercises.

Investigate whether:

- Each actor has a genuine role in the information lifecycle.
- Each responsibility explains the actor's involvement.
- Each activity has a meaningful relationship to the information need.
- Each business object has a functional information dependency.
- An identified actor reveals additional responsibilities or activities.
- An identified activity reveals additional actors or object dependencies.
- An object relationship reveals overlooked upstream or downstream activities.
- Exception scenarios reveal additional participants or responsibilities.
- Domain knowledge exposes missing elements in the source baseline.

Ask additional questions whenever a relationship appears incomplete or ambiguous.

All these questions and their answers are for internal reasoning only.

### Mandatory Final Questions for Every Requirement

1. Have I understood the actual information need rather than just its name?
2. Have I investigated the business purpose and operational consequences?
3. Have I examined all supplied business datasets?
4. Have I identified relevant existing source-derived entities?
5. Have I independently investigated what is missing from those sources?
6. Have I considered who originates, provides, owns, maintains and consumes the information?
7. Have I identified the responsibilities that explain those actors' involvement?
8. Have I investigated the complete information-related activity lifecycle?
9. Have I identified meaningful existing business objects and their dependencies?
10. Have I considered cross-functional and upstream/downstream relationships?
11. Have I considered exceptions, failures, reconciliation and recovery?
12. Have I used domain and niche knowledge to challenge the completeness of the baseline?
13. Have I included justified AI-inferred entities rather than limiting myself to source-data matches?
14. Have I avoided generic, speculative or unrelated additions?
15. Have I preserved the exact parent requirement name and its position in the input collection?

If this investigation reveals meaningful omissions, enrich the discovery result before completing the requirement.

Do not add entities merely to increase array size or create an appearance of completeness.

---

## 9. FINAL RESPONSE CONTROL — STRICT MACHINE-READABLE JSON OUTPUT

This section governs the final response.

All business investigation, source analysis, domain reasoning, investigative questioning, inference, cross-dimensional validation and completeness assessment must be performed internally.

These activities are reasoning instructions. They are NOT content to be displayed in the response.

The final response must be exclusively one valid JSON array.

### 9.1 Prohibited Final Response Content

Do NOT output:

- Introductory statements.
- Explanations of the discovery process.
- Markdown headings.
- Markdown formatting.
- Numbered sections.
- Bullet points.
- Requirement summaries.
- Business purpose descriptions.
- Investigative questions.
- Answers to investigative questions.
- Inference explanations.
- Data-source analysis narratives.
- AI-discovery narratives.
- Refined baselines.
- Key risks.
- Recommendations.
- Additional properties.
- Hypothetical business objects.
- Proposed business objects.
- Markdown code fences.
- Text before or after the JSON array.

Do not expose internal reasoning or intermediate discovery results.

### 9.2 EXACT JSON OUTPUT STRUCTURE

The following is the mandatory JSON structure.

Use this exact structure for every dynamically supplied parent Information Requirement.

[
  {
    "information_requirement": "EXACT_VALUE_FROM_INPUT_INFORMATION_REQUIREMENT",
    "required_by_actors": [
      "Actor Name 1",
      "Actor Name 2"
    ],
    "related_responsibilities": [
      "Responsibility Name 1",
      "Responsibility Name 2"
    ],
    "related_activities": [
      "Activity Name 1",
      "Activity Name 2"
    ],
    "related_business_objects": [
      "Existing Business Object Name 1",
      "Existing Business Object Name 2"
    ]
  },
  {
    "information_requirement": "EXACT_VALUE_FROM_NEXT_INPUT_INFORMATION_REQUIREMENT",
    "required_by_actors": [],
    "related_responsibilities": [],
    "related_activities": [],
    "related_business_objects": []
  }
]

### 9.3 JSON TEMPLATE INTERPRETATION RULES

1. The two entries above are illustrative examples of the structure only.
2. They do NOT establish a fixed output count.
3. Generate exactly one output object for every actual input entry.
4. Replace every illustrative value with actual discovered values.
5. Preserve the exact original information_requirement value and input order.
6. Populate all four relationship arrays with relevant discoveries.
7. Empty arrays are permitted only when no meaningful relationship can be established after investigation.
8. Do not output placeholder text.
9. Do not add additional properties.
10. Do not introduce nested objects or structures.
11. Do not add descriptions or explanations to array elements.
12. All property names and string values must use valid JSON double-quoted syntax.
13. Escape special characters correctly so the output remains valid JSON.

### 9.4 RELATIONSHIP POPULATION RULES

**required_by_actors**

Include relevant source-derived and functionally justified AI-inferred actors.

**related_responsibilities**

Include relevant source-derived and functionally justified AI-inferred responsibilities.

**related_activities**

Include relevant source-derived and functionally justified AI-inferred activities.

**related_business_objects**

Include only business objects found in the supplied business_objects dataset.

Do not include hypothetical or newly invented business objects.

Do not include descriptions, explanations, provenance information or nested objects in these arrays.

Avoid duplicate values within each array.

Do not arbitrarily limit the number of meaningful relationships.

Do not add unrelated values to increase coverage.

---

## 10. MANDATORY INPUT-OUTPUT VALIDATION

Before returning the JSON, validate the complete result against the actual runtime input.

Let INPUT_REQUIREMENTS represent the dynamically supplied information_system collection.

Let OUTPUT_REQUIREMENTS represent the information_requirement values in the generated JSON array.

### 10.1 Parent Requirement Integrity

Verify:

- Output object count equals the actual input entry count.
- Every input information_requirement value appears exactly once.
- Every output information_requirement exactly matches its corresponding input value.
- Original input order is preserved.
- No input entry is omitted.
- No entry is duplicated.
- No new parent requirement is introduced.
- No requirements have been merged, split or renamed.

### 10.2 Discovery Integrity

Verify:

- Existing actors, responsibilities and activities retain their original names.
- AI-inferred actors, responsibilities and activities have functional justification.
- Existing business objects are drawn exclusively from the supplied baseline.
- No new business objects are introduced.
- No hypothetical business objects are included.
- No unrelated entities are included.
- All four dimensions contain only their intended entity types.

### 10.3 Output Integrity

Verify:

- The response is valid JSON.
- The root element is an array.
- The response contains exactly one object per supplied parent requirement.
- Every object contains exactly the five permitted properties.
- Every relationship property is an array of strings.
- There are no additional properties.
- There is no text outside the JSON array.
- There are no Markdown headings, lists or code fences.
- There are no explanations or intermediate reasoning sections.

If any validation fails, correct the result before returning it.

---

## 11. FINAL EXECUTION DIRECTIVE

Dynamically iterate through the entire collection supplied by:

${JSON.stringify(base.information_system, null, 2)}

For EACH entry, use its exact:

- information_requirement
- description
- business_purpose

Conduct an independent, deep business-context investigation.

Build the discovery result using:

**Existing source data:** The supplied business objects, actors, responsibilities, actor-object relationships and business activities.

**AI-driven domain intelligence:** Additional investigative questions, domain reasoning, operational knowledge, implicit dependencies and justified inference.

Do not merely match keywords or reproduce the supplied datasets.

Do not assume the source datasets represent the complete business.

Do not assume a fixed number of parent requirements.

Do not invent, rename, replace, split, combine, omit or reorder parent Information Requirements.

Do not invent business objects in this stage.

Do not expose the investigation or intermediate reasoning.

The objective is to create a comprehensive, domain-agnostic discovery baseline for every supplied parent requirement by combining source-derived business knowledge with independently inferred, functionally justified business context.

Return exactly one consolidated JSON array containing one complete Part 1 object for every dynamically supplied parent requirement.

PART 1 ONLY.

Do not generate:

- information_usage
- information_source
- business_decisions_supported
- required_information_details
- functional_rules
- information_validation
- information_flow

The final response MUST contain ONLY valid JSON.

Nothing before the opening array character.

Nothing after the closing array character.
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
