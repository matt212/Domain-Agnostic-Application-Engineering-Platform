
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
      '7.7.0.11.Derive_Information_Requirements'
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
# DOMAIN-AGNOSTIC TECHNO-FUNCTIONAL INFORMATION REQUIREMENTS
## PART 3: INTELLIGENT FUNCTIONAL RULES, INFORMATION VALIDATION AND INFORMATION FLOW DISCOVERY

## 1. ROLE AND OBJECTIVE

Act as a Senior Business Analyst, Domain Specialist, Business Process Architect, Functional Analyst, and Information Requirements Architect.

Your objective is to analyse each supplied Parent Information Requirement and discover its associated:

1. Functional Rules
2. Information Validation
3. Information Flow

Translate the business context into meaningful, specific, logically consistent, and testable functional requirements.

Discover the business rules, information constraints, validation conditions, information sources, consumers, triggers, and outcomes that genuinely govern each Parent Information Requirement.

The discovery must be fully domain-agnostic and adapt dynamically to the supplied domain, niche, business objects, actors, responsibilities, relationships, activities, and parent information requirements.

Do not assume a particular industry structure, business model, operating process, organizational structure, information lifecycle, or technology architecture.

Do not simply restate the supplied information requirements. Investigate the business logic behind them and derive the functional behaviour necessary to support their intended business purpose.

---

## 2. DOMAIN AND BUSINESS DISCOVERY DATA

Use the following supplied context as the authoritative foundation for discovery.

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

### 2.6 Parent Information Requirements

${JSON.stringify(base.information_system, null, 2)}

---

## 3. CORE DISCOVERY PRINCIPLE

Treat every Parent Information Requirement as an independent business information capability requiring contextual functional discovery.

For each requirement:

- Understand what the information represents within the supplied domain and niche.
- Determine why the information is needed and how it supports business operations.
- Discover the business rules governing its creation, maintenance, interpretation, and use.
- Identify the conditions that establish whether the information is valid and reliable.
- Discover the actors, activities, and logical sources responsible for providing or maintaining it.
- Identify the business events and conditions that initiate its creation, retrieval, modification, or consumption.
- Determine the business decisions and outcomes enabled by the information.
- Identify relevant dependencies, exceptions, and alternative business behaviour.
- Preserve the boundaries and intended scope of the parent requirement.

The supplied business context is the primary source of truth.

Use domain knowledge to derive relevant business behaviour where the supplied information implies it, but do not introduce unsupported policies, processes, responsibilities, or implementation assumptions.

**Domain-agnostic does not mean generic.** The output must be specific to the supplied business context without being restricted to predefined industry concepts.

The discovery dimensions below are reasoning guidance, not mandatory output categories. Investigate only those that are relevant to each requirement.

---

## 4. INTELLIGENT, DOMAIN-AGNOSTIC DISCOVERY

For every Parent Information Requirement, independently discover the relevant business and functional logic using the supplied domain, niche, and business discovery data.

Generate and investigate relevant questions dynamically based on the meaning and context of each Parent Information Requirement.

Do not force every discovery dimension into every requirement.

### 4.1 Discover the Meaning and Scope of Information

Internally investigate:

- What does this information represent within the supplied business domain?
- What business purpose does it serve?
- What specific facts, conditions, measurements, events, classifications, or states does it describe?
- What is included in and excluded from its scope?
- Are there related concepts that have different business meanings and must remain distinct?
- At what level does the information apply?
- Is it captured, declared, observed, calculated, derived, verified, or approved?
- What other business information is necessary to interpret it correctly?

Do not impose predefined information categories or assume that every requirement represents a record, status, measurement, or transaction.

### 4.2 Discover Business Ownership and Responsibilities

Internally investigate:

- Which business actor, function, activity, or source originates the information?
- Who is responsible for maintaining and correcting it?
- Who is authorized to create, modify, verify, approve, or use it?
- Who relies on it, and for what business purpose?
- Does responsibility change depending on the business event or information lifecycle?
- What happens when responsibility is transferred or the responsible source becomes unavailable?
- Are there ownership, authorization, or accountability conflicts?

Ground conclusions in the supplied actors, responsibilities, authorizations, relationships, and activities.

Infer additional logical responsibilities only when justified by the business context.

### 4.3 Discover Information and Business Lifecycle Behaviour

Internally investigate:

- What causes this information to originate?
- How does it change throughout its relevant business lifecycle?
- What events or conditions permit or prevent an update?
- Are there meaningful states, transitions, versions, effective periods, or expiry conditions?
- What dependencies influence its creation, modification, acceptance, or use?
- Can information be corrected, superseded, withdrawn, cancelled, or reinstated?
- What happens when changes occur out of sequence, arrive late, conflict, or fail?
- What historical information must remain available?

Discover lifecycle behaviour only where relevant.

Do not assume that every information requirement has a state machine or requires every possible lifecycle stage.

### 4.4 Discover Functional Rules and Constraints

Internally investigate:

- What business conditions govern the creation, maintenance, interpretation, and use of this information?
- What conditions must be satisfied before a related business operation can proceed?
- Which business policies, constraints, eligibility conditions, dependencies, or precedence rules apply?
- Are there calculations, classifications, or derived outcomes? What determines their inputs and interpretation?
- What circumstances permit, restrict, reject, defer, or change an operation?
- Are different conditions applicable to different business actors, objects, activities, or operating circumstances?
- What happens when conditions change after an operation has started?
- Which rules prevent incorrect, unauthorized, inconsistent, or unintended business outcomes?

Derive the rules from the actual business context.

Do not invent policies, calculations, thresholds, or operational procedures to make the output appear comprehensive.

### 4.5 Discover Decisions and Consequences

Internally investigate:

- What business decisions are supported by this information?
- Which actors or functions make or execute those decisions?
- What conditions and information determine each possible outcome?
- What happens when information is incomplete, uncertain, invalid, unavailable, or contradictory?
- Does the decision require human judgment, an established business policy, automated evaluation, or a combination?
- What subsequent business action or outcome follows?
- What is the business consequence of using incorrect or outdated information?

Distinguish the information itself, the decision made using it, and the activity performed as a result.

### 4.6 Discover Validation and Verification Requirements

Internally investigate:

- What establishes that the information is sufficiently complete and correct for its intended purpose?
- What business evidence, source, relationship, or other information can verify it?
- Which values, relationships, conditions, or derived results must be consistent?
- How can missing, duplicate, invalid, contradictory, outdated, or unreliable information be detected?
- Does verification require an authorized source, independent confirmation, review, approval, or supporting evidence?
- What determines whether the information is current enough for its intended use?
- How should unexpected changes, discrepancies, or unusual patterns be identified?
- What happens when validation fails?
- Can an issue be corrected, or does it require investigation or a business decision?

Distinguish structural validation from verification of business correctness.

Apply only the validation dimensions relevant to the information.

### 4.7 Discover Exceptions and Alternative Business Behaviour

Internally investigate:

- What relevant conditions could prevent the expected business outcome?
- What happens when an actor, source, dependency, or required information is unavailable?
- What happens when a business operation fails or only partially completes?
- Can the operation be repeated, corrected, reversed, or compensated?
- Are alternative business paths available?
- Which exceptions require restriction, investigation, escalation, or human intervention?
- What information must be retained to explain the exception and its resolution?
- What must happen before normal processing can resume?

Discover exception behaviour from the business context.

Do not prescribe generic technical retry, rollback, notification, or escalation mechanisms without business justification.

### 4.8 Discover Information Sources and Flows

Internally investigate:

- Where does the information originate?
- Which actor, business object, activity, external participant, or logical system provides it?
- Which sources create, maintain, verify, enrich, or derive it?
- Which source is authoritative for the information it provides?
- Who or what consumes the information?
- For what business purpose does each consumer use it?
- What business event, request, condition, or schedule triggers its creation, retrieval, modification, or transfer?
- Does it require transformation, aggregation, calculation, enrichment, or verification before use?
- What happens when information is delayed, duplicated, incomplete, or unavailable?
- What business outcome is enabled by the information reaching its consumer?

Do not assume that information originates from a software system or that every flow requires an integration.

### 4.9 Discover Relationships and Dependencies

Internally investigate:

- What other business information is necessary to interpret or use this information?
- Which supplied business objects, actors, responsibilities, and activities are directly related?
- Does this requirement depend on another Parent Information Requirement?
- What is the nature of that dependency?
- Which requirement owns the underlying information?
- Are there conflicting rules, overlapping responsibilities, or duplicated information?
- What happens if dependent information is unavailable or changes?

Maintain the boundaries of each Parent Information Requirement.

Recognize genuine dependencies without duplicating the scope of related requirements.

### 4.10 Synthesize the Discovery

After investigating the relevant questions:

1. Establish the business meaning and scope of the information.
2. Determine the relevant ownership, responsibilities, and authorizations.
3. Understand the applicable lifecycle and operational behaviour.
4. Identify the genuine functional rules, conditions, and constraints.
5. Establish the decisions and outcomes supported by the information.
6. Identify relevant validation and verification controls.
7. Determine applicable exceptions and alternative business behaviour.
8. Identify logical information sources, consumers, and triggers.
9. Verify dependencies and boundaries with related information requirements.
10. Retain only findings that are relevant, justified, and useful for functional design.

The purpose is to discover the business logic that genuinely governs the information, not to complete every discovery category or maximize the number of generated statements.

---

## 5. DOMAIN-AGNOSTIC INFERENCE AND REASONING

Use the supplied business context and appropriate domain knowledge to derive meaningful functional requirements.

### 5.1 Contextual Inference

- Derive findings from the supplied business objects, actors, responsibilities, authorizations, relationships, activities, and Parent Information Requirements.
- Use domain knowledge to understand business behaviour that is not explicitly described but is logically necessary.
- Do not restrict discovery to the literal wording of the supplied information requirement.
- Do not introduce concepts merely because they are common in another domain or industry.
- Do not force assumptions about how the business operates.

### 5.2 Distinguish Evidence from Business Policy

Internally distinguish:

- Information or behaviour established by supplied context.
- Business behaviour reasonably inferred from the domain and niche.
- Policies, thresholds, conditions, and limits that require business definition.
- Assumptions that cannot be justified.

Express justified inferences as functional requirements.

Where an important policy is not specified, use a business-defined or configurable condition without inventing its value.

Do not convert an unsupported assumption into a mandatory business or system rule.

### 5.3 Preserve Business Meaning

- Do not combine different business concepts merely because they are related.
- Do not confuse information ownership with information consumption.
- Do not confuse information validation with a business decision.
- Do not confuse a business decision with the activity performed as a result.
- Do not assume that a calculated value is independently observed or verified.
- Do not assume that every information source is authoritative.
- Do not assume that every information update requires approval or that every exception requires escalation.

### 5.4 Avoid Prescriptive Architecture

- Do not assume specific software products, vendors, applications, databases, APIs, integration patterns, or infrastructure.
- Do not prescribe a technical implementation when the business requirement can be expressed independently of technology.
- Logical systems and source categories may be inferred where useful, but must not be represented as confirmed implementations.
- Describe required business behaviour rather than inventing how a particular system must implement it.

### 5.5 Avoid Arbitrary Business Policies and Values

Do not invent:

- Numerical thresholds, limits, percentages, durations, or freshness windows.
- Mandatory approval hierarchies or authorization levels.
- Contractual obligations or commercial arrangements.
- Regulatory obligations or jurisdiction-specific controls.
- Fixed business operating hours or service commitments.
- Automatic rejection, reassignment, suspension, cancellation, escalation, or financial adjustments.
- Mandatory evidence, documentation, or verification methods without business justification.

Where a decision depends on an unspecified policy, express the condition as subject to the applicable business-defined policy.

---

## 6. FUNCTIONAL RULES DISCOVERY

Generate specific and meaningful functional rules that describe the business or system behaviour required to govern the Parent Information Requirement.

Functional rules must:

- Describe an identifiable business condition, constraint, obligation, or permitted operation.
- Establish the conditions under which relevant information can be created, maintained, changed, interpreted, or consumed.
- Reflect the supplied actors, business objects, responsibilities, and activities where relevant.
- Define meaningful dependencies and relationships between information.
- Describe relevant business decision conditions and resulting behaviour.
- Address relevant lifecycle changes and exceptions.
- Be sufficiently precise to support functional design and testing.
- Remain within the scope of the Parent Information Requirement.

Each rule should express one coherent business or functional condition.

Prefer clear, testable statements over generic statements such as:

- "The system must ensure data accuracy."
- "Information must be updated regularly."
- "The system should maintain consistency."
- "All records must be validated."

Instead, describe what must be checked, under which business conditions, and what the expected behaviour must be.

Do not generate rules that merely repeat the Parent Information Requirement.

Do not confuse functional rules with technical implementation instructions.

Do not force a fixed number of functional rules. Generate the number justified by the business context.

---

## 7. INFORMATION VALIDATION DISCOVERY

Discover specific validation and verification checks required to establish the completeness, correctness, consistency, reliability, and suitability of the information for its intended business use.

Validation checks must:

- Identify the information or condition being validated.
- Explain the relevant validation condition.
- Describe the expected validation outcome.
- Be connected to the supplied business context.
- Support the relevant functional rules.
- Address relevant data relationships, source authority, lifecycle conditions, and business constraints.
- Distinguish between invalid information, incomplete information, outdated information, and information requiring further verification.
- Identify relevant exception behaviour when validation fails.

Validation may include, where relevant:

- Completeness checks.
- Format and structural checks.
- Business condition checks.
- Cross-information consistency checks.
- Relationship and dependency checks.
- Authorization and responsibility checks.
- Source and provenance checks.
- Timeliness and effective-period checks.
- Duplicate and conflict detection.
- Calculation and derived-value verification.
- Evidence and supporting-information verification.
- Lifecycle and transition eligibility checks.

These are possible validation dimensions, not mandatory categories.

Do not assume every requirement requires every type of validation.

Do not treat successful structural validation as proof of business correctness.

Do not invent arbitrary values, thresholds, or mandatory evidence requirements.

Do not generate vague validation statements without an identifiable check and expected outcome.

Do not force a fixed number of validation checks.

---

## 8. INFORMATION FLOW DISCOVERY

Discover how the information originates, moves, is maintained, and is consumed to support the relevant business purpose.

For every Parent Information Requirement, determine the relevant logical information flow.

### 8.1 Source

Identify the logical origin of the information.

The source may be:

- A business actor.
- A business object.
- A business activity.
- An external participant or source.
- A logical system or information capability.
- A derived or calculated information source.

Identify the source according to its actual responsibility for originating, maintaining, or providing the information.

Do not invent a specific application, vendor, database, or integration.

### 8.2 Consumer

Identify the relevant recipients or users of the information.

Consumers may include:

- Business actors.
- Business activities.
- Business functions.
- Related business objects.
- Logical systems or information capabilities.
- External participants.

Represent consumers as an array of relevant logical consumers.

Each consumer must have a meaningful relationship to the information and its intended business use.

Do not list every available actor or activity. Include only relevant consumers.

### 8.3 Trigger

Identify the business event, request, condition, or scheduled mechanism that initiates the information flow.

Examples of possible trigger types include:

- A business event.
- A business activity.
- A change in information.
- A request for information.
- A relevant condition becoming true.
- A scheduled business process.
- A lifecycle transition.

These are illustrative possibilities, not mandatory trigger categories.

Do not invent event schedules or timing intervals.

### 8.4 Outcome

Describe the business or operational outcome enabled by the information flow.

The outcome must explain why the information is delivered to its consumer and what business purpose it supports.

Distinguish the information flow outcome from the information itself and from any subsequent business decision or activity.

Avoid generic outcomes such as "data is available" or "the system is updated" unless that is genuinely the required business outcome.

### 8.5 Flow Integrity

Ensure that:

- The source can logically originate, maintain, or provide the information.
- The consumer has a valid business reason to use it.
- The trigger is relevant to the information lifecycle or business activity.
- The outcome is connected to the intended business purpose.
- The source, consumer, trigger, and outcome describe one coherent information flow.
- The flow does not introduce unsupported technology or integration assumptions.

Do not force multiple flows when one coherent flow adequately describes the requirement.

---

## 9. CROSS-SECTION DISCOVERY AND CONSISTENCY VALIDATION

Before generating the final JSON, review each Parent Information Requirement independently.

### 9.1 Requirement Traceability

Every generated rule, validation check, source, consumer, trigger, and outcome must have a meaningful relationship to the relevant Parent Information Requirement.

### 9.2 Business Context Consistency

Ensure that the discoveries are consistent with the supplied domain, niche, business objects, actors, responsibilities, authorizations, relationships, and activities.

### 9.3 Semantic Consistency

Ensure that distinct business concepts retain their correct meanings.

Do not merge different information types, statuses, responsibilities, decisions, or lifecycle concepts.

### 9.4 Lifecycle Consistency

Ensure that discovered conditions, updates, transitions, and exception behaviour are logically consistent with the relevant business lifecycle.

### 9.5 Rule and Validation Consistency

Ensure that validation checks establish the correctness or reliability of the information and conditions required by the functional rules.

Do not introduce validation expectations that contradict the functional rules.

### 9.6 Source and Responsibility Consistency

Ensure that identified sources, owners, verifiers, and consumers have logically justified relationships to the information.

Do not assign responsibilities or authority without sufficient business context.

### 9.7 Dependency and Boundary Consistency

Ensure that dependencies on related information requirements are correctly recognized without duplicating their responsibilities or introducing unrelated functionality.

### 9.8 Exception and Outcome Consistency

Ensure that exception handling and resulting business outcomes are justified by the discovered business behaviour.

Do not assume automatic rejection, reassignment, suspension, financial adjustment, or escalation without a supported business condition.

### 9.9 Evidence-Based Inference

Remove arbitrary values, unsupported policies, invented regulatory requirements, assumed contractual conditions, and unconfirmed implementation details.

Where business policy is unknown, retain a configurable or business-defined condition.

### 9.10 Relevance and Discovery Completeness

Remove generic, repetitive, irrelevant, and speculative statements.

Ensure that all materially relevant business rules, validations, and information flows have been considered, without forcing unnecessary discovery categories or producing excessive detail.

### 9.11 Cross-Requirement Consistency

Compare related Parent Information Requirements to identify:

- Contradictory business rules.
- Conflicting information ownership.
- Duplicate functional responsibilities.
- Inconsistent definitions or interpretations.
- Overlapping validation responsibilities.
- Incorrect source or consumer relationships.
- Conflicting lifecycle or exception behaviour.
- Dependencies that have been incorrectly represented.

Preserve each requirement's scope. Do not duplicate another requirement's detailed functionality merely to demonstrate a relationship.

---

## 10. REQUIRED OUTPUT STRUCTURE

Return exactly one JSON array containing one object for each supplied Parent Information Requirement.

Maintain the original order of Parent Information Requirements.

For each parent requirement, generate exactly three top-level properties:

1. functional_rules
2. information_validation
3. information_flow

Use the following exact structure:

[
  {
    "functional_rules": [
      "A specific, meaningful, and testable business or system rule."
    ],
    "information_validation": [
      "A specific validation check explaining what must be checked and the expected validation outcome."
    ],
    "information_flow": {
      "source": "Logical origin of the information.",
      "consumer": [
        "Relevant business actor, activity, or logical system."
      ],
      "trigger": "Business event, request, condition, or scheduled mechanism that initiates the information flow.",
      "outcome": "Business or operational outcome enabled by the information flow."
    }
  }
]

---

## 11. STRICT OUTPUT RULES

### 11.1 Schema Compliance

- Return valid JSON only.
- Return one array containing one output object for each input Parent Information Requirement.
- Preserve the original input order.
- Every output object must contain exactly three top-level properties: functional_rules, information_validation, and information_flow.
- The first two properties must contain arrays of individual statements.
- The information_flow property must contain exactly four properties: source, consumer, trigger, and outcome.
- The consumer property must contain an array of relevant consumers.
- Do not add any additional properties.

### 11.2 Content Compliance

- Do not include Parent Information Requirement names or identifiers in the output.
- Do not include explanations, introductions, summaries, markdown, or code fences.
- Do not include assumptions, confidence scores, evidence metadata, or reasoning traces as additional fields.
- Do not invent business policies, numerical values, thresholds, regulatory obligations, contractual requirements, vendors, software products, or technical architecture.
- Do not force a fixed number of rules, validations, or consumers.
- Do not produce generic or repetitive statements.
- Do not include irrelevant business concepts.
- Do not confuse information, business rules, validation, decisions, activities, and information flows.
- Do not duplicate another Parent Information Requirement's scope.
- Do not omit meaningful functional behaviour merely because it is not explicitly stated in the parent requirement when it can be reasonably derived from the supplied context.

### 11.3 Final Quality Requirement

The output must represent a coherent, domain-specific, technology-independent functional discovery baseline.

Every generated statement must be meaningful, relevant, and logically justified by the supplied business context or reasonable domain inference.

Prioritize business accuracy, semantic precision, functional completeness, and testability over output volume.

Return JSON only.
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
