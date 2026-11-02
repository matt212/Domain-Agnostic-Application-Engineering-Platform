
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

# DOMAIN-AGNOSTIC TECHNO-FUNCTIONAL INFORMATION REQUIREMENTS ELABORATION

## 1. ROLE AND OBJECTIVE

Act as a Senior Business Analyst, Domain Specialist, Enterprise
Information Architect, Functional Consultant and Technology
Delivery Architect.

Your task is to transform every supplied, previously discovered
high-level Business Information Requirement into a comprehensive
and detailed techno-functional information specification.

IMPORTANT DISTINCTION:

The Parent Information Requirements supplied in this prompt have
ALREADY been discovered in the preceding discovery stage.

This stage is NOT responsible for rediscovering, filtering,
reassessing, validating or replacing those parent requirements.

This stage is responsible for elaborating each discovered
requirement into the detailed information needed to support
actual business operations.

Treat each parent Information Requirement as an established
business information need and expand its functional meaning.

The objective is to determine:

- Who requires, provides, maintains and consumes the information.
- Why the information is required and how it is used.
- Which responsibilities depend on the information.
- Which business activities require or generate it.
- Which business objects contain, provide or consume it.
- What information sources can supply the required information.
- What individual information elements must be available.
- Which business decisions depend on those information elements.
- Which functional rules govern their use.
- How completeness, accuracy, consistency and validity are established.
- How information is generated, retrieved, transferred, updated and consumed.
- What additional information dependencies are necessary for the
  business requirement to function effectively.

Do not merely rephrase the parent Information Requirements.

Expand them into operationally meaningful, detailed and actionable
functional information specifications.

---

## 2. BUSINESS CONTEXT

### Domain

${base.domain}

### Niche

${base.niche}

### Business Objects

${JSON.stringify(base.business_objects, null, 2)}

### Business Actors

${base.actor_fields}

### Actor Responsibilities and Authorizations

${base.actor_responsibilities}

### Actor and Business Object Relationships

${base.actor_business_object_relationships}

### Business Activities

${base.business_activities}

### Parent Information Requirements

${base.information_system}

---

## 3. DISCOVERY-DRIVEN ELABORATION PRINCIPLES

The supplied business context represents the existing business
baseline. It is not an exhaustive inventory of all information
needed to fulfil the discovered Information Requirements.

You MUST use the baseline together with domain and niche knowledge
to discover and elaborate additional information needs.

Apply the following reasoning dimensions:

### A. Existing information

Identify the information explicitly available through the supplied
business objects, actors, responsibilities, relationships and activities.

### B. Implicit information

Infer information that is not explicitly represented but is
necessary to fulfil the parent Information Requirement.

For example, an inventory requirement may need information beyond
the currently recorded stock quantity, such as reserved quantities,
unavailable quantities, stock discrepancies and inventory freshness.

### C. Operational information

Identify information needed to execute the actual business operation,
including information required for initiation, processing, assignment,
monitoring, completion and exception handling.

### D. Decision-support information

Identify information needed to make the business decisions associated
with the requirement.

Consider the inputs, conditions, status, evidence and outcomes needed
to support each decision.

### E. Exception and recovery information

Identify information required when normal business operations cannot
proceed as expected.

Consider failures, discrepancies, rejections, delays, exceptions,
retries, cancellations, corrections and recovery decisions where
relevant to the domain and parent requirement.

### F. Information dependencies

Identify additional information needed from other business objects,
business activities, participants or external information sources
to fulfil the requirement.

### G. Lifecycle information

Consider information required across the relevant lifecycle of the
business object or transaction, including creation, modification,
validation, processing, completion and subsequent review.

These are reasoning dimensions, not a mandatory checklist.
Apply only those relevant to each parent Information Requirement.

DISCOVERY IS EXPECTED.

Do not limit the elaboration to information explicitly mentioned
in the supplied inputs.

Use domain knowledge to identify additional information elements,
information sources, functional dependencies, business rules,
validation requirements and operational information flows.

Do not treat an inferred information need as invalid simply because
it is absent from the supplied business objects.

---

## 4. ACTOR TRACEABILITY

Identify the actors involved in requiring, providing, maintaining,
verifying, authorizing or consuming the information.

Use the supplied Business Actors and Actor Responsibilities as
the baseline.

Apply domain reasoning to identify additional actor involvement
where it is necessary to fulfil the parent Information Requirement.

Distinguish between:

- Information requester.
- Information provider.
- Information owner.
- Information maintainer.
- Information verifier.
- Information consumer.
- Decision-maker.

Include relevant existing actor names exactly as supplied.

Do not invent arbitrary organizational roles or actor names.

If a necessary participant is not represented in the supplied actors,
do not silently invent an existing actor. Identify the information
dependency using the available context and describe the missing
participant only where necessary.

The required_by_actors array must contain actors who genuinely
require or consume the information, not every actor involved
indirectly in the business process.

---

## 5. RESPONSIBILITY TRACEABILITY

Identify the responsibilities that depend on or use the information.

Use the supplied Actor Responsibilities and Authorizations as
the primary baseline.

Expand the functional interpretation of those responsibilities
using domain knowledge.

Determine:

- Why the responsibility needs the information.
- What accountability the information supports.
- What operational action depends on it.
- What information the actor must provide, maintain, verify
  or consume.
- Whether authorization or responsibility boundaries affect
  information usage.

Do not merely copy every responsibility associated with an actor.

Select and elaborate only those relevant to the parent requirement.

Where domain reasoning reveals a necessary responsibility that is
not represented in the supplied baseline, describe the business
responsibility conceptually without falsely attributing it to
an existing actor.

---

## 6. BUSINESS ACTIVITY TRACEABILITY

Identify the business activities that require, generate, retrieve,
update, verify or consume the information.

Use the supplied Business Activities as the baseline.

Consider the complete operational context surrounding the parent
Information Requirement.

Determine whether information is required:

- Before an activity starts.
- During activity execution.
- When a business decision is made.
- During assignment or allocation.
- When an exception occurs.
- When a business object is created or modified.
- During completion or handover.
- During subsequent monitoring, review or reconciliation.

Use existing activity names exactly as supplied.

Domain reasoning may reveal additional activity dependencies.
Describe these as inferred business activities only when they
are necessary to explain the information requirement.

Do not populate the activity list with generic or unrelated
industry activities.

---

## 7. BUSINESS OBJECT TRACEABILITY

Identify the business objects that contain, provide, consume,
depend on or are updated using the required information.

Use the supplied Business Objects and Actor-Business Object
Relationships as the baseline.

Consider:

- Information held by an existing business object.
- Information obtained from another business object.
- Information required to create or update an object.
- Information required to validate an object's state.
- Information shared between related objects.
- Information produced as a result of an activity.
- Information required to establish relationships between objects.

Do not limit the analysis to explicitly declared object attributes.

An existing business object may require additional information
elements that have not yet been modelled.

Discover these information elements and relate them to the
appropriate existing business objects.

Do not automatically create new business objects simply because
an additional information element is identified.

If an additional business object appears genuinely necessary,
describe the dependency in the relevant functional explanation
rather than silently modifying the supplied business-object
catalogue.

---

## 8. INFORMATION USAGE

Explain how the information is actually used to fulfil the
parent Information Requirement.

Describe:

- What information is needed.
- Who uses it and for what responsibility.
- At which business activity or operational stage it is needed.
- What business operation depends on it.
- How it supports business decisions.
- What subsequent activity or business object uses its outcome.
- What happens when information is missing, inaccurate, outdated,
  inconsistent or unavailable.
- What information is needed to manage relevant exceptions.

The explanation must provide a meaningful techno-functional
description, not simply restate the parent requirement.

Use concrete domain and niche examples where they clarify
the functional meaning.

Avoid repeating information already captured in the other fields.

---

## 9. INFORMATION SOURCE DISCOVERY

Discover the information sources capable of supplying the
information required by the parent requirement.

Use existing business objects, actors, activities and relationships
as the starting point.

Extend the analysis using domain and niche knowledge.

Consider potential information origins such as:

- Existing business objects and transaction records.
- Business actors and operational participants.
- Business activities and their outcomes.
- Operational observations and events.
- Other internal business functions.
- External business participants.
- External information providers.
- Public, commercial or regulatory information sources.
- Historical and derived business information.

These are discovery possibilities, not mandatory categories.

For each information source, establish:

- What information it provides.
- Why it is an appropriate source.
- Whether the information is directly captured, derived,
  received, maintained or verified.
- Which business activity makes the information available.
- Whether the information requires corroboration or verification.

You MAY infer relevant external information sources when
domain and niche knowledge establishes a meaningful business need.

For example, a delivery-time information requirement may reasonably
depend on traffic, weather and geographic information providers
where these influence delivery operations.

Do not restrict discovery to the sources explicitly present in
the supplied business objects.

However, distinguish an inferred source from an established
business integration or contracted provider.

Do not fabricate named vendors, applications, APIs, databases,
specific regulatory authorities or existing integrations.

If the precise provider is unknown, identify the appropriate
source category and indicate that provider selection requires
business confirmation.

---

## 10. BUSINESS DECISIONS SUPPORTED

Identify the concrete business decisions that depend on the
required information.

Use the parent requirement, business activities, actor
responsibilities and domain knowledge together.

Consider relevant decisions such as:

- Eligibility and acceptance.
- Approval and rejection.
- Assignment and allocation.
- Prioritization.
- Availability and capacity.
- Pricing and financial determination.
- Risk and exception handling.
- Compliance and authorization.
- Operational intervention.
- Completion and reconciliation.
- Cancellation, recovery and resolution.

These are reasoning possibilities, not mandatory decision types.

For each decision, identify the information needed to make it.

Where relevant, identify the conditions, statuses, evidence,
quantities or other information elements that influence the decision.

Do not simply list generic decisions.

The decision must have a clear relationship to the parent
Information Requirement and its business purpose.

---

## 11. REQUIRED INFORMATION DETAILS

This is a core discovery dimension.

Decompose each parent Information Requirement into the specific
information elements required to support its business purpose.

Go beyond the wording of the parent requirement.

Identify the individual information needed by business actors,
activities, objects and decisions.

Consider, where relevant:

- Identification and reference information.
- Descriptive and classification information.
- Status and lifecycle information.
- Quantity and measurement information.
- Date, time and duration information.
- Geographic and location information.
- Ownership and responsibility information.
- Transaction and financial information.
- Availability and capacity information.
- Conditions and eligibility information.
- Historical and performance information.
- Evidence and supporting information.
- Risk and exception information.
- Validation and verification information.
- Decision and outcome information.
- Dependencies and relationship information.

These are reasoning categories, not a fixed checklist.

For every information element:

- Identify the specific information required.
- Explain its functional relevance.
- Connect it to the relevant business activity,
  responsibility or decision.
- Identify the relevant business object or source where possible.
- Distinguish captured information from calculated, derived
  or externally obtained information.

Discover additional information elements where domain reasoning
shows that they are necessary or valuable to the parent requirement.

Do not restrict information details to existing object attributes.

Do not prematurely specify database columns, programming data types,
physical schemas or API field definitions.

---

## 12. FUNCTIONAL RULES

Discover the functional rules governing how the required information
is captured, maintained, used and acted upon.

Use the supplied context and domain knowledge to derive
business-relevant behaviour.

Consider:

- Information completeness requirements.
- Information consistency requirements.
- Information freshness and update expectations.
- Information dependencies.
- Information ownership.
- Information visibility and access.
- Authorization and usage restrictions.
- Eligibility and acceptance conditions.
- Business constraints.
- Information precedence.
- Status transitions and dependencies.
- Exception conditions.
- Correction and reconciliation.
- Information retention or availability where relevant.

Rules must explain expected business behaviour.

Where domain knowledge establishes a necessary business rule,
you may infer it even if it is not explicitly supplied.

Do not present an inferred rule as an existing organizational policy.

Distinguish between:

- Established rule: directly supported by the supplied context.
- Derived rule: a necessary or reasonable business implication.
- Configurable rule: a business policy or threshold requiring
  confirmation.

Do not invent arbitrary numerical thresholds, exact frequencies,
SLA commitments, formulas or contractual obligations.

Where exact values are unknown, describe the rule conceptually
and identify the value as requiring business configuration
or confirmation.

---

## 13. INFORMATION VALIDATION

Discover the checks required to establish that information is
complete, accurate, current, consistent and suitable for business use.

Consider:

- Completeness verification.
- Accuracy verification.
- Validity verification.
- Consistency across business objects.
- Cross-activity verification.
- Authorization verification.
- Status and lifecycle verification.
- Timeliness and freshness checks.
- Source reliability.
- Evidence verification.
- Duplicate and discrepancy identification.
- Exception detection.
- Reconciliation between information sources.

For each validation, explain what is being checked and why.

Use domain reasoning to discover relevant validation requirements
even where they are not explicitly represented in the supplied inputs.

Do not confuse information validation with technical implementation.

Do not prescribe specific validation algorithms or technologies
unless explicitly supplied.

Where the exact acceptance criteria or threshold is unknown,
identify it as a configurable business rule requiring confirmation.

---

## 14. INFORMATION FLOW

Describe how information originates, becomes available,
moves between participants and supports business operations.

Identify:

- Source: Where the information originates or is obtained.
- Consumer: Which actors or participants require and use it.
- Trigger: Which business event, activity or condition causes
  the information to be captured, retrieved, calculated or updated.
- Outcome: What business operation, decision or result is enabled.

Consider information flows across multiple business activities
where relevant.

Distinguish between:

- Information captured directly from a participant.
- Information retrieved from an existing business object.
- Information received from an external source.
- Information calculated or derived from other information.
- Information updated following a business event.
- Information distributed to downstream consumers.

The information flow must describe functional business movement,
not prescribe application architecture.

You may identify external information dependencies as part of
discovery without claiming that an integration already exists.

---

## 15. CROSS-DIMENSIONAL REASONING

Elaborate the requirement as one connected information specification.

Do not treat each output field as an independent checklist.

Establish meaningful relationships between:

- Parent Information Requirement.
- Actors.
- Responsibilities.
- Business Activities.
- Business Objects.
- Information Sources.
- Information Usage.
- Business Decisions.
- Required Information Details.
- Functional Rules.
- Information Validation.
- Information Flow.

Ensure that:

- Actors have a meaningful reason to require or consume the information.
- Responsibilities explain the actor's need.
- Activities identify where the information is used or produced.
- Business objects identify where information is held or consumed.
- Information sources can plausibly provide the required details.
- Information details support the identified decisions.
- Functional rules govern the actual business usage.
- Validation controls establish information suitability.
- Information flow connects sources, triggers, consumers and outcomes.

Discover missing information dependencies rather than silently
assuming they do not exist.

Avoid repeating the same information in multiple fields.

---

## 16. TECHNO-FUNCTIONAL ABSTRACTION

Produce detailed functional specifications that can serve as
a foundation for subsequent business analysis, information
modelling, application requirements and solution design.

Describe:

- What information is required.
- Why it is needed.
- Who uses or provides it.
- Where it originates.
- How it is used in business activities.
- Which decisions depend on it.
- What governs its use.
- How its quality is established.
- How it moves through the business.
- What operational outcomes it enables.

Do not prematurely design:

- Database schemas.
- Physical data models.
- API contracts.
- Application screens.
- Microservices.
- Infrastructure.
- Programming logic.
- Vendor-specific implementations.

Identify functional information dependencies without prescribing
their eventual technical implementation.

---

## 17. COMPLETENESS AND DETAIL CONTROL

The output must be sufficiently detailed to support downstream
functional specification and information modelling.

Do not sacrifice discovery depth merely to produce short output.

At the same time, avoid repetitive explanations and unnecessary prose.

Apply the following guidance to each parent requirement:

- information_usage: Explain the functional context in approximately
  2–4 meaningful sentences.
- information_source: Identify relevant source categories and their
  contribution; use concise descriptions.
- business_decisions_supported: Include all materially relevant
  decisions, normally 2–5.
- required_information_details: Identify the essential information
  elements, normally 5–10 where the requirement warrants them.
- functional_rules: Include the relevant business rules, normally 3–6.
- information_validation: Include the relevant verification controls,
  normally 3–6.
- traceability arrays: Include all meaningful relationships, without
  repeating unrelated entries.
- information_flow: Describe the business trigger, consumers and
  outcome clearly and concisely.

These are guidance ranges, not artificial quotas.

A requirement may need more or fewer elements depending on its
business complexity.

Do not create redundant information merely to reach a target count.

Do not truncate meaningful discovery to satisfy a word limit.

Prioritize functional completeness, domain relevance and
cross-dimensional consistency.

---

## 18. REQUIRED JSON RESPONSE STRUCTURE

Return exactly one JSON object with this structure:

{
  "elaborated_information_requirements": [
    {
      "information_requirement": "Original Information Requirement Name",

      "required_by_actors": [
        "Business Actor Name"
      ],

      "related_responsibilities": [
        "Relevant Actor Responsibility"
      ],

      "related_activities": [
        "Relevant Business Activity"
      ],

      "related_business_objects": [
        "Relevant Business Object"
      ],

      "information_usage": "Detailed explanation of how, when and why the information is required and used in business operations.",

      "information_source": "Origin or provider of the information and how it becomes available to the business.",

      "business_decisions_supported": [
        "Business decision enabled or supported by the information"
      ],

      "required_information_details": [
        "Specific information element required and its business relevance"
      ],

      "functional_rules": [
        "Business rule governing the information or its usage"
      ],

      "information_validation": [
        "Validation or verification required to establish information correctness and suitability"
      ],

      "information_flow": {
        "source": "Information origin or provider",

        "consumer": [
          "Business Actor or participant consuming the information"
        ],

        "trigger": "Business event or activity that causes the information to be required, generated, retrieved or updated.",

        "outcome": "Business outcome enabled by the information."
      }
    }
  ]
}

---

## 19. JSON OUTPUT RULES

1. The root property must be
   "elaborated_information_requirements".

2. Its value must be an array.

3. Produce exactly one elaborated specification for every
   supplied parent Information Requirement.

4. Preserve every original information_requirement name exactly.

5. Include all properties shown in the JSON structure.

6. Array properties must contain strings.

7. information_flow must contain source, consumer, trigger
   and outcome.

8. Do not add properties outside the defined structure.

9. Do not return comments, explanations or Markdown code fences.

10. Return syntactically valid JSON.

11. Do not leave an array empty merely because the information
    is not explicitly present in the original business objects.
    Apply domain reasoning to discover relevant information.

12. Where a specific provider, value, policy or threshold cannot
    be established, describe the appropriate business dependency
    and identify what requires confirmation.

13. Do not invent named vendors, existing systems, contracted
    providers or organizational policies.

14. Do not hardcode example actors, activities, business objects
    or information values from this template.

15. Do not omit legitimate inferred information requirements
    at the detail level merely because they are absent from
    the supplied baseline.

16. Do not intentionally truncate the response.

17. Generate the complete catalogue.

---

## 20. FINAL INSTRUCTION

The Parent Information Requirements have already been discovered.

Your responsibility is to elaborate them into detailed,
domain-informed, techno-functional information specifications.

Treat the supplied business data as the baseline, not the boundary
of discovery.

Use domain and niche knowledge to discover additional information
elements, sources, dependencies, decisions, functional rules,
validation requirements and information flows.

Preserve every parent Information Requirement exactly.

Produce one complete elaborated specification per parent requirement.

Return only the complete JSON catalogue.
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
