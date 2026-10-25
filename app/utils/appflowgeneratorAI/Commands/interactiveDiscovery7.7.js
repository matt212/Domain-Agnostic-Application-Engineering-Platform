/**
 * ============================================================================
 * SECTION 1: CORE DEPENDENCIES, IMPORTS & SYSTEM CONFIGURATION
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { domain } = require('process');

let CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '7.7 Actors_Roles_Resonsibility_Authorization'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
    
    NGL: '0',
    MAX_TOKENS: '12288',         
    BATCH_SIZE: '12288', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "7.6 Business Objects.24-10-26_06:41pm.md",
    STAGE_2_ACTORS: "2.Final-Actors-",
    STAGE_3_JOURNEYS: "3.Final-End-to-End-Actor-Journeys-",
   // STAGE_4_TOPOLOGY: "6.swimlane_systems_architecture_map_14-10-26_04_09", 
    STAGE_4_TOPOLOGY:"8.6.3.Final.mermaid-diagram-20-10-26_11_54.md",
    FILE_EXTENSION: ".txt"
  }
};
/**
 * ============================================================================
 * SECTION 2: INGESTION ENGINE & BUSINESS RAG PROCESSOR
 * ============================================================================
 */

  /**
   * ============================================================================
   * SECTION 3: TWO-PASS PROGRAMMATIC ENTERPRISE SERIALIZER (NATIVE NODE.JS)
   * ============================================================================
   */
  function generateSemanticBlueprintAI(base, finalTargetFilePath, callback) {
    const promptTmpPath1 = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR, `pass1_discovery_${Date.now()}.txt`);
    const promptTmpPath2 = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR, `pass2_serialization_${Date.now()}.txt`);

    // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
        // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
        // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
        // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
    let pass1Payload = "{\n";
    


function formatPromptInput(value) {
  if (value === undefined || value === null) {
    return "Not supplied";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

//domain :${base.domain}, niche ${base.niche}, and complete business discovery output:${JSON.stringify(base.business_obj)}
// const pass1Prompt = `
// # OBJECTIVE

// Generate a business-specific Actor Responsibility and Authorization Model using the supplied domain:${base.domain}, niche:${base.niche}, and complete business discovery output:${JSON.stringify(base.business_obj)}

// Discover the participants relevant to the business, their operational roles and responsibilities, their relationships with business objects, their permitted actions, and the conditions governing their authority.

// The reasoning method must remain domain-agnostic. Derive the business content from the supplied evidence rather than imposing a predefined industry structure.

// # INPUTS

// 1. Domain: the supplied business domain.
// 2. Niche: the specific business context within that domain.
// 3. First-stage business discovery output: the complete discovered business operating model, participants, lifecycle, business objects, dependencies, alternative operating models, assumptions, unresolved dependencies, and evidence gaps, supplied as a JSON-formatted string.

// The supplied first-stage business discovery output is JSON. Parse and interpret its actual structure, including nested objects, arrays, properties, values, and relationships. Use its contents as the primary evidence throughout all 11 reasoning steps. Preserve the distinction between source-supported facts, inferences, conditional conclusions, and unknowns. Do not assume a predefined input structure beyond the supplied JSON or treat missing information as established fact.

// Treat these inputs as the primary evidence for understanding the business. Do not silently replace, reinterpret, or supplement them with unsupported assumptions.

// # 1. DISCOVER BUSINESS PARTICIPANTS

// Analyze how the supplied business operates and identify the participants relevant to establishing, enabling, executing, supporting, governing, or benefiting from its activities.

// Determine:

// - Which people, organizations, groups, external parties, or other participating entities are involved.
// - What business purpose each participant serves.
// - Which outcomes or activities depend on their participation.
// - Which participants are explicitly identified, reasonably inferred, conditional on a particular operating model, or not yet established.
// - Whether apparently different participants represent distinct responsibilities or equivalent roles that can be consolidated.

// Discover participants from the supplied business context. Do not require predefined actor categories or assume that every business contains the same types of participants.

// # 2. DERIVE OPERATIONAL ROLES AND RESPONSIBILITIES

// For each discovered participant, determine its operational role and the responsibilities justified by the business context.

// Establish:

// - What the participant contributes to the business.
// - Which outcomes it is responsible for achieving or supporting.
// - Which activities, decisions, or interactions it performs.
// - What inputs, outputs, dependencies, and handoffs are associated with its responsibilities.
// - Whether responsibilities overlap, conflict, remain unassigned, or depend on an unresolved business decision.

// Distinguish responsibility for an outcome from participation in an activity and authority to perform a particular action.

// Do not generate generic job descriptions. Explain each actor's role in terms of the actual business being discovered.

// # 3. DISCOVER ACTOR–BUSINESS-OBJECT RELATIONSHIPS

// Use the supplied business-object catalogue and its relationships to determine how each participant interacts with the discovered business objects.

// For each relevant relationship, determine:

// - Why the participant needs to interact with the object.
// - Whether the participant establishes, owns, maintains, uses, influences, approves, transfers, monitors, or concludes the object or its lifecycle.
// - Which business activities require that interaction.
// - Whether the relationship is essential, conditional, inferred, or uncertain.
// - Whether a required actor–object relationship is missing or unsupported.

// Do not equate interaction with ownership or assume that responsibility automatically grants unrestricted access.

// Use the supplied object names consistently. If another object appears necessary, identify it as a proposed discovery gap rather than silently treating it as an established object.

// # 4. DERIVE INFORMATION ACCESS AND SCOPE

// Determine what information each participant needs to access to fulfil its established or inferred responsibilities.

// For every proposed access permission, consider:

// - The business purpose for accessing the information.
// - The relevant object, information, or attributes.
// - The scope justified by the participant's relationship to the business.
// - Any supported restrictions arising from ownership, assignment, organizational relationships, confidentiality, or other relevant business conditions.
// - Whether access to the entire object is necessary or a narrower scope would fulfil the same responsibility.
// - Whether a proposed restriction is supported by evidence or requires confirmation.

// Populate \`What_They_Can_See\` with meaningful, business-specific access descriptions.

// Do not assume that every business requires the same access boundaries, information categories, or privacy controls. Identify applicable restrictions from the supplied context and distinguish unconfirmed policies from established requirements.

// # 5. DERIVE CREATION, MODIFICATION, AND REMOVAL AUTHORITY

// Determine which business objects or attributes each participant may create, change, remove, cancel, revoke, deactivate, or otherwise conclude.

// For each relevant action, establish:

// - The business purpose of the action.
// - The participant's justification for performing it.
// - The object or information affected.
// - Any prerequisites or applicable conditions.
// - The permitted scope of change.
// - Any dependency on another participant, decision, or business state.
// - Whether the action is supported, inferred, conditional, or unresolved.

// Populate \`What_They_Can_Create\`, \`What_They_Can_Change\`, and \`What_They_Can_Remove\` with the actions justified by this analysis.

// Interpret removal according to the business meaning of the object and action. Do not automatically equate removal with permanent deletion.

// Do not assume every object supports every action or that every participant requires create, change, and removal permissions.

// # 6. DERIVE EXECUTABLE BUSINESS OPERATIONS

// Identify the meaningful business operations each participant may initiate or execute, using the discovered operating model, lifecycle, responsibilities, and object relationships.

// For each operation, determine:

// - What the operation accomplishes.
// - Why the participant is authorized or reasonably inferred to perform it.
// - What conditions or dependencies govern execution.
// - What inputs and business objects are involved.
// - What outcomes or changes may result.
// - Whether another participant's involvement or a decision is required.
// - Whether the operation is established, inferred, conditional, or unresolved.

// Populate \`Operations_They_Can_Run\` with business operations rather than merely renaming object-level create, change, or removal actions.

// Do not assume that every business uses the same operations or that a participant's responsibility automatically authorizes every action associated with that responsibility.

// # 7. DERIVE AUTHORIZATION BOUNDARIES AND GUARDRAILS

// Determine which conditions limit or govern each participant's authority, based on the supplied business context and the evidence available.

// Investigate whichever constraints are relevant to the particular business, including potential limits associated with responsibilities, relationships, object states, delegated authority, decision rights, or conflicting actions.

// For each proposed guardrail, determine:

// - What action or circumstance it governs.
// - Why the restriction or condition is relevant.
// - Which participant, object, activity, or business outcome it affects.
// - Whether it is explicitly established, reasonably inferred, conditional, or unknown.
// - What evidence or policy decision would be needed to confirm it.

// Where relevant, distinguish restrictions governing business behaviour from restrictions governing access to information or execution authority.

// Populate \`Business_Rules_And_Guardrails\` with meaningful, business-specific rules and restrictions. Use the agreed categories where applicable, without assuming that every category must contain a rule.

// Do not invent universal approval requirements, separation-of-duty rules, legal obligations, regulatory controls, or technical security policies merely because they are common elsewhere.

// # 8. ANALYZE LIFECYCLE CHANGES AND EXCEPTIONS

// Evaluate participant responsibilities and permissions in the context of the lifecycle and transitions discovered in the first-stage output.

// Determine how the relevant responsibilities, object relationships, and authorized actions may differ as the business progresses through its lifecycle.

// Investigate exceptions and alternative paths that are meaningful to the discovered business, including any supported interruption, rejection, failure, recovery, cancellation, reversal, dispute, or post-completion activity.

// For each relevant path, determine:

// - Which participant detects, initiates, handles, or resolves it.
// - Which objects, activities, or relationships are affected.
// - What actions or authority changes are required.
// - Whether responsibility transfers between participants.
// - Whether a missing path creates a material uncertainty in the actor model.

// Do not force predefined exception types or lifecycle stages into the model. Derive relevant scenarios from the supplied business evidence and identify important undiscovered paths as gaps.

// # 9. EVALUATE ALTERNATIVE OPERATING MODELS

// Use the alternative operating models and unresolved business decisions in the first-stage output to determine how actor discovery and authorization may change.

// Identify:

// - Which participants or responsibilities differ between alternatives.
// - Which actor–object relationships or permissions are affected.
// - Which responsibilities may transfer, disappear, or become necessary.
// - Which constraints remain applicable across the alternatives.
// - Which permissions depend on a business-model choice that has not yet been confirmed.

// Where an alternative has not been established as the selected model, represent its implications as conditional rather than applying them unconditionally to the primary actor model.

// Do not invent alternative operating models simply to increase output coverage. Introduce additional alternatives only when supported by the supplied context or clearly identified as proposals requiring validation.

// # 10. VALIDATE BUSINESS COHERENCE AND COVERAGE

// Validate the proposed actor model against the supplied domain, niche, operating model, lifecycle, business objects, dependencies, and identified uncertainties.

// Check whether:

// - Every actor has a meaningful business justification.
// - Every responsibility relates to the discovered business or is explicitly identified as an inference.
// - Every material permission has a justified relationship to a responsibility, object interaction, operation, or established policy.
// - Referenced business objects match the supplied object names or are explicitly identified as proposed additions.
// - Permissions and operations are consistent with relevant lifecycle conditions and dependencies.
// - Responsibilities are adequately assigned, with meaningful gaps and overlaps identified.
// - Relevant exceptions and post-completion responsibilities have been considered.
// - Conditional operating models have not been confused with the selected or established model.
// - Unsupported assumptions have not been presented as confirmed facts.
// - Unresolved questions affecting authorization remain visible.

// Distinguish a missing item that materially undermines the actor model from an optional refinement that can be addressed later.

// Do not claim exhaustive coverage or correctness when the supplied evidence is insufficient.

// # 10A. VALIDATE ACTOR-SPECIFIC AUTHORITY AND OPERATIONAL BOUNDARIES

// For every discovered actor, validate and refine its responsibilities, object access, create/change/remove permissions, executable operations, and business rules.

// The purpose of this step is not merely to reject permissions that are absent from the supplied evidence. Derive reasonable, business-specific permissions from the actor's role, responsibilities, business-object relationships, operating model, lifecycle, dependencies, and relevant business context, even when individual permissions are not explicitly specified.

// For every material permission, distinguish:

// - What is explicitly established by the supplied evidence.
// - What is a reasonable business inference derived from that evidence.
// - What applies only under a particular operating condition or alternative business model.
// - What is reasonable to propose but requires business confirmation because its consequences, scope, or authority boundary cannot be established.
// - What remains genuinely unknown because the available context is insufficient to derive a reasonable permission or determine the relevant boundary.

// Do not treat the absence of explicit evidence as automatic grounds to reject a reasonable inference. Equally, do not present an inference as an explicitly established business fact. When a proposed permission requires confirmation, preserve it as a proposal rather than silently converting it into an established business rule. Apply the following checks to improve the completeness, coherence, and traceability of the generated authorization model.
// ### A. Validate participant responsibilities and permissions

// - Does the supplied evidence establish that the actor performs the stated responsibility, or does it establish only that the actor participates in the business?
// - Does the actor's relationship with a business object justify the specific action being assigned to it?
// - Are responsibility, participation, ownership, decision authority, and execution permission being treated as distinct concepts?
// - If an actor's precise authority is not established, what specific permission or business decision remains unresolved?

// ### B. Validate customer-facing authority

// - Which customer actions are explicitly established, and which are merely plausible interactions?
// - Is the customer's authority to view, create, change, cancel, remove, or confirm an object established for the relevant lifecycle stage?
// - Are proposed modification or cancellation windows, eligibility conditions, and post-completion actions supported by the supplied business context?
// - Are customer access scopes limited to information justified by the customer's relationship to the relevant business objects?
// - Where the permitted action or its timing is not established, identify the unresolved rule instead of assuming a particular restriction.

// ### C. Validate operational-participant authority

// For actors that fulfil, prepare, supply, maintain, transport, service, or otherwise execute business activities:

// - Distinguish performing an activity from creating the task, instruction, assignment, or business record that initiates it.
// - Determine whether the actor may update an underlying business object, report a condition, reject work, cancel an activity, or request another participant to intervene.
// - Establish whether an exception-handling action is authorized, merely possible, or unresolved.
// - Distinguish confirmation of a handoff or outcome from authority to create or control the corresponding business record.
// - Do not infer exclusive control over pricing, inventory, configuration, or other shared business objects merely from operational responsibility.

// ### D. Validate platform, orchestration, and administrative authority

// For actors that coordinate processes, operate shared services, administer configurations, or allocate resources:

// - Determine which responsibilities require access to which specific business objects and operations.
// - Do not infer unrestricted access to all objects, all records, all organizational units, or all operating areas from a general coordination or administration role.
// - Distinguish initiating, coordinating, validating, executing, and recording a business operation.
// - Determine whether authority to change an object, override a decision, cancel work, reassign responsibility, suspend a participant, or alter a business rule is established, conditional, inferred, or unknown.
// - Where multiple actors participate in the same process, identify unresolved ownership or authority boundaries instead of assigning exclusive control without evidence.

// ### E. Validate specialist and cross-functional roles

// For actors whose responsibilities concern a particular business function, information category, resource, or organizational capability:

// - Determine which activities and objects fall within the role's justified business scope.
// - Do not automatically extend that scope to related functions, commercial decisions, configuration changes, contracting, approvals, or administrative operations.
// - Distinguish proposing or maintaining information from approving, publishing, changing, or withdrawing it.
// - Where the role's authority overlaps with another actor, identify the overlap and determine whether the supplied evidence resolves who may perform each action.
// - If responsibilities suggest a possible additional role but do not establish one, record the role boundary as an unresolved discovery question rather than automatically creating another actor.

// ### F. Validate financial and transaction-related authority

// For actors involved in payments, financial records, settlements, adjustments, or other value exchanges:

// - Distinguish initiating a transaction, authorizing it, processing it, recording it, capturing value, settling funds, reversing an outcome, and issuing an adjustment or refund.
// - Determine which actor is established as responsible for each operation and which business objects or states are affected.
// - Do not assume that participation in a financial process establishes authority over every stage of that process.
// - Do not infer a particular payment sequence, prerequisite, holding arrangement, settlement trigger, refund policy, or financial limit unless the supplied business context establishes it.
// - Distinguish changing a transaction's status or financial outcome from deleting or removing its record.
// - Where responsibilities between actors overlap or the sequence is unresolved, identify the specific decision requiring confirmation.

// ### G. Validate external oversight and conditional authority

// For actors whose involvement depends on external governance, jurisdiction, contractual arrangements, or other conditions:

// - Determine whether the actor's involvement and the applicable condition are established by the supplied business context.
// - Distinguish general oversight responsibilities from specific powers to inspect information, issue decisions, change records, suspend activities, revoke permissions, or impose consequences.
// - Do not infer a specific enforcement power, access entitlement, or mandatory control solely from the actor's general purpose.
// - Identify which business decision, external requirement, or operating condition must be established before a conditional permission can be applied.
// - Keep unresolved authority conditional or unknown rather than converting it into an unconditional permission.

// ### H. Validate data scope and object-operation semantics

// For all actors and permissions:

// - Identify the particular object, record, attribute, assignment, or business outcome affected by the action.
// - Determine whether the actor needs access to the entire object or only a narrower, responsibility-related scope.
// - Distinguish viewing information from changing it, and changing it from approving or executing an associated business operation.
// - Distinguish cancellation, rejection, revocation, deactivation, reversal, refund, archival, and deletion according to their business meanings.
// - Do not place an action under object removal merely because it ends an activity or changes the object's status.
// - Where the data scope, operation, or consequence is unclear, identify the precise unresolved permission instead of inventing a default.

// ### I. Validate business rules and lifecycle restrictions

// For each proposed business rule or guardrail:

// - Identify the specific action, object, participant, lifecycle condition, or business outcome it governs.
// - Determine whether the rule follows from the supplied lifecycle and dependencies or requires an additional business decision.
// - Check whether proposed prerequisites, timing limits, eligibility rules, failure responses, or automatic actions have actually been established.
// - Do not invent restrictions or enforcement behavior to make the model appear complete.
// - Where a rule is needed to determine an actor's authority but is unresolved, record what must be decided and keep the affected permission appropriately unresolved.

// ### J. Record unresolved actor-specific decisions

// After applying the relevant checks, preserve material unresolved questions in the existing output schema.

// Each unresolved item should identify:
// - The actor concerned.
// - The relevant responsibility, business object, operation, or guardrail.
// - The specific authority or boundary that remains undecided.
// - The business condition or decision needed to resolve it.

// Use the existing evidence classifications and output fields. Do not create new top-level schema sections, assume every check applies to every actor, or invent permissions to eliminate unresolved items.

// The purpose of these checks is to ensure that each actor's responsibilities, access, authority, and operational boundaries are coherent with the supplied business context while leaving unsupported decisions unresolved.

// Before classifying a permission as unknown, determine whether the supplied business context supports a reasonable, useful inference. If it does, retain the proposed permission as inferred and explain its basis using the existing schema. Reserve unknown for cases where the available information is insufficient to select a reasonable permission, scope, condition, or authority boundary. Do not create unresolved questions for every detail that the model can reasonably derive from the business context.

// # 11. CLASSIFY EVIDENCE, INFERENCES, CONDITIONS, AND UNKNOWNS

// For each material actor, responsibility, permission, operation, or guardrail, distinguish the strength and nature of its supporting evidence.

// Use the following evidence classifications consistently:

// **Source-supported**

// The supplied domain context or discovery output explicitly establishes the relevant fact, participant, responsibility, relationship, action, or policy.

// **Inferred**

// The conclusion is a reasoned deduction from the supplied business context, but is not explicitly established by the source. Record the reasoning or basis for the inference where useful.

// **Conditional**

// The conclusion applies only if a particular business condition, operating model, relationship, or unresolved decision is true. Identify the condition.

// **Unknown**

// The supplied evidence is insufficient to determine the correct conclusion. State what information or business decision is needed, where material.

// Apply these classifications to the substance of the finding, not merely to the actor as a whole. One actor may have source-supported responsibilities, inferred permissions, conditional capabilities, and unresolved guardrails.

// Do not interpret model confidence as proof. Do not invent supporting evidence, and do not upgrade an inference to a confirmed fact merely because it appears reasonable.

// Keep evidence annotations concise and traceable to the supplied inputs. Distinguish facts stated in the input from conclusions derived by the model.


// The purpose of evidence classification is to communicate how each conclusion was derived, not to prevent business-model discovery. Inferred permissions are valid outputs when they are reasonably justified by the supplied business context. Do not downgrade a reasonable inference to unknown merely because the source does not explicitly enumerate the permission. Use unknown when a material decision cannot reasonably be resolved from the available context. Use conditional when a permission depends on a specific operating condition or unresolved business-model choice.
// # OUTPUT CONTRACT

// Return the agreed actor JSON array using the existing schema:

// - \`actor_name\`
// - \`operational_role\`
// - \`core_responsibilities\`
// - \`access_authorization_and_scope\`
//   - \`What_They_Can_See\`
//   - \`What_They_Can_Create\`
//   - \`What_They_Can_Change\`
//   - \`What_They_Can_Remove\`
//   - \`Operations_They_Can_Run\`
//   - \`Business_Rules_And_Guardrails\`
// - \`evidence_and_assumptions\`

// Within \`evidence_and_assumptions\`, preserve the evidence classifications \`source_supported\`, \`inferred\`, \`conditional\`, and \`unknown\`.

// Keep the agreed field names and value types stable. Do not create industry-specific schema fields or add new top-level sections without authorization.

// Use the established JSON structure to represent the discovered business, not to dictate what the business must contain. Empty arrays are acceptable where no entries are justified. Do not fabricate permissions or guardrails to populate empty categories.

// Return valid JSON only, without Markdown fences, comments, or explanatory prose outside the JSON.

// `;
// const pass1Prompt = `
// # OBJECTIVE

// Generate a business-specific Actor Responsibility and Authorization Model using:

// - Domain: ${base.domain}
// - Niche: ${base.niche}
// - Complete business discovery output: ${JSON.stringify(base.business_obj)}

// Discover relevant actors, operational roles, responsibilities, actor–business-object relationships, information access, create/change/remove permissions, executable business operations, authorization boundaries, guardrails, and relevant lifecycle conditions.

// The reasoning method must remain domain-agnostic. Derive business-specific content from the supplied context rather than imposing predefined industry structures.

// # INPUT AND EVIDENCE RULES

// The business discovery input is JSON. Interpret its actual structure, including nested objects, arrays, properties, values, relationships, lifecycle information, dependencies, alternative operating models, assumptions, and unresolved decisions.

// Use the supplied discovery output as the primary evidence. Do not assume a predefined input structure beyond the actual JSON.

// Distinguish:
// - Source-supported: explicitly established by the supplied context.
// - Inferred: reasonably derived from the business context but not explicitly established.
// - Conditional: applicable only when a specified condition or operating model applies.
// - Unknown: insufficient information to derive a reasonable conclusion or resolve a material decision.

// Missing explicit detail does not automatically mean a permission is unknown. Infer reasonable business-specific permissions when justified by the actor's role, responsibilities, object relationships, lifecycle, dependencies, and operating model.

// Do not present inferences as source-supported facts. Do not invent evidence, universal policies, or mandatory controls.

// # 1. DISCOVER ACTORS, ROLES, AND RESPONSIBILITIES

// Identify the people, organizations, groups, external parties, and other participants relevant to establishing, enabling, executing, supporting, governing, or benefiting from the discovered business.

// For each actor, derive:
// - A meaningful, business-specific operational role.
// - Core responsibilities and expected business outcomes.
// - Relevant activities, decisions, inputs, outputs, dependencies, and handoffs.
// - Whether the actor is established, reasonably inferred, conditional, or uncertain.
// - Any material responsibility gaps, overlaps, conflicts, or potential role consolidation.

// Do not impose predefined actor categories, generate generic job descriptions, or create additional actors without a business justification.

// Distinguish participation in an activity, responsibility for an outcome, ownership of an object, decision authority, and permission to execute an action.

// # 2. DERIVE ACTOR–OBJECT RELATIONSHIPS AND INFORMATION ACCESS

// Use the supplied business-object catalogue and relationships to determine which objects each actor needs to interact with and why.

// Determine whether the actor establishes, owns, maintains, uses, influences, approves, transfers, monitors, or concludes an object or its lifecycle, as appropriate to the business.

// For each relevant access relationship, derive:
// - The business purpose and information needed.
// - The relevant object, record, or attributes.
// - The justified access scope and applicable business conditions.
// - Whether the relationship or restriction is source-supported, inferred, conditional, or unknown.

// Prefer a scope proportionate to the actor's business responsibility. Do not infer unrestricted access or equate interaction with ownership.

// Use supplied object names consistently. Identify necessary but undiscovered objects as proposed gaps rather than established objects.

// Populate What_They_Can_See with concise, meaningful business-specific access descriptions.

// # 3. DERIVE CREATE, CHANGE, AND REMOVE PERMISSIONS

// Derive which business objects, records, attributes, or outcomes each actor may create, change, remove, cancel, revoke, deactivate, or otherwise conclude.

// For each material permission, consider:
// - Its business purpose and justification.
// - The affected object or attribute.
// - The actor's responsibility and relationship to the object.
// - Relevant lifecycle conditions, prerequisites, dependencies, and scope.
// - Whether another actor, approval, or decision is involved.
// - The evidence classification and any material uncertainty.

// Populate:
// - What_They_Can_Create
// - What_They_Can_Change
// - What_They_Can_Remove

// Do not assume that every actor or object requires all three categories. Distinguish cancellation, rejection, revocation, deactivation, reversal, archival, and deletion according to their business meaning. Do not treat ending an activity or changing a status as automatic permission to delete its record.

// # 4. DERIVE EXECUTABLE OPERATIONS AND GUARDRAILS

// Derive meaningful business operations that actors may initiate or execute. Operations must represent business activities, not simply repeat object-level create/change/remove permissions.

// For relevant operations, identify:
// - Purpose, responsible actor, and affected objects.
// - Inputs, outcomes, dependencies, and lifecycle conditions.
// - Whether the actor initiates, coordinates, validates, executes, approves, or records the operation.
// - Whether the authority is supported, inferred, conditional, or unresolved.

// Derive business-specific guardrails from the supplied context and reasonable business reasoning. Consider relevant ownership boundaries, delegation, object states, decision rights, conflicting actions, scope limitations, and dependencies.

// Do not impose universal approval requirements, separation-of-duty rules, legal obligations, regulatory controls, technical security policies, financial limits, or other restrictions merely because they are common in other businesses.

// Populate:
// - Operations_They_Can_Run
// - Business_Rules_And_Guardrails

// # 5. ANALYZE LIFECYCLE, EXCEPTIONS, AND ALTERNATIVE MODELS

// Use the supplied lifecycle, transitions, dependencies, and operating-model alternatives to determine how actor responsibilities and permissions vary across relevant business situations.

// Consider applicable interruptions, rejection, failure, recovery, cancellation, reversal, disputes, handoffs, and post-completion activities where justified by the business context.

// Identify who detects, initiates, handles, or resolves relevant scenarios; which objects and permissions are affected; and whether responsibilities transfer between actors.

// Apply alternative operating models conditionally unless the input establishes which model is selected.

// Do not force predefined lifecycle stages or exception types into the model. Do not invent alternatives, mandatory paths, prerequisites, or automatic actions merely to achieve completeness. Identify material missing paths or decisions as gaps.

// # 6. VALIDATE AUTHORIZATION BOUNDARIES AND CONSISTENCY

// For every material actor-object permission, distinguish:

// 1. Business responsibility: What the actor is responsible for accomplishing.
// 2. Application permission: What the actor may directly access or do within an application.
// 3. External authority: What the actor is authorized to decide, require, or enforce outside the application.
// 4. System automation: What a system or integration performs automatically, whether independently or on behalf of an actor.

// Do not treat these concepts as interchangeable. Derive their relationships from the supplied business context, and classify reasonable inferences appropriately.

// Validate that:

// - Each permission is justified by the actor's responsibilities, relationship to the affected business object, decision authority, and operating context.
// - Access scope is proportionate to the demonstrated business need. Derive the applicable scope model from the context rather than assuming a particular ownership, assignment, organizational, or record-access model.
// - Participation in an activity, triggering an event, reporting an outcome, or updating a related object does not automatically authorize other actions or changes to associated objects.
// - Distinct responsibilities, decisions, approvals, execution activities, and recording actions remain distinguishable wherever the business context makes those boundaries relevant.
// - State-changing and consequential permissions are justified individually. Do not infer broader authority merely because an actor can perform a related operation.
// - External authority does not automatically imply direct application access or permission to modify application records.
// - System automation does not automatically imply that the initiating actor has the same permissions as the system or integration.
// - Actions affecting an object are represented according to their actual business meaning. Distinguish changes to state, cancellation, reversal, removal, transfer, closure, or other outcomes when the context establishes meaningful differences.
// - Permissions and guardrails reflect relevant lifecycle conditions, dependencies, decisions, operating-model alternatives, and other constraints established or reasonably inferred from the supplied context.
// - Responsibilities, permissions, operations, guardrails, and evidence classifications are mutually consistent. Resolve contradictions only when the evidence supports resolution; otherwise retain the specific uncertainty.

// Do not impose universal authorization models, approval requirements, separation-of-duty rules, access-control mechanisms, lifecycle constraints, or business policies merely because they are common in particular industries.

// Preserve the required output schema exactly. Do not add actors, objects, permissions, or business rules solely to make the result appear comprehensive.

// # 7. VALIDATE AUTHORITY, SCOPE, AND BUSINESS COHERENCE

// Perform one consolidated validation of the generated model. Do not repeat the entire discovery process or independently regenerate every permission.

// Apply the following checks only where relevant.

// A. Responsibility and authority
// - Does each material permission have a reasonable relationship to the actor's role, responsibilities, object relationships, or business context?
// - Is responsibility distinguished from participation, ownership, decision authority, and execution permission?
// - Does an operational activity justify updating the underlying object, or only reporting a condition, confirming an outcome, or requesting an action?
// - Are proposing, initiating, approving, executing, and recording appropriately distinguished where the business requires those boundaries?

// B. Customer and operational permissions
// - Are customer actions and access scopes consistent with the customer's relationship to the relevant objects?
// - Are operational actors' permissions proportionate to their responsibilities?
// - Are creation of tasks or records distinguished from performing the activities those records represent?
// - Are shared objects such as inventory, pricing, configuration, or assignments protected from unjustified assumptions of exclusive control?

// C. Platform, administration, and specialist authority
// - Does a coordination or administration role have only the access and operations reasonably justified by its responsibilities?
// - Are configuration changes, overrides, cancellations, approvals, contracting, and administrative operations independently justified where material?
// - Are overlapping responsibilities resolved where possible, with genuinely unresolved authority boundaries retained as questions?

// D. Financial and transaction authority
// - Where relevant, distinguish initiating, authorizing, processing, recording, capturing, settling, reversing, refunding, and adjusting transactions.
// - Do not assume that participation in a financial process grants authority over every stage.
// - Do not invent transaction sequences, holding arrangements, settlement triggers, financial limits, or refund policies.

// E. External and conditional authority
// - Distinguish oversight, inspection, recommendations, requests, decisions, and direct application-record changes.
// - Do not infer direct application access or specific enforcement powers merely from an external actor's general purpose.
// - Keep permissions dependent on an unselected operating model or unresolved business condition conditional.

// F. Object scope and action semantics
// - Identify the affected object, record, attribute, assignment, or business outcome.
// - Distinguish viewing, changing, approving, and executing.
// - Keep cancellation, rejection, revocation, deactivation, reversal, refund, archival, and deletion distinct where their business meanings differ.
// - Do not infer unrestricted object or organizational access from a narrow responsibility.

// G. Business rules and lifecycle consistency
// - Check that material permissions and guardrails are coherent with the supplied lifecycle, dependencies, and alternative models.
// - Identify unsupported prerequisites, timing limits, eligibility rules, failure responses, or automatic actions.
// - Do not invent restrictions to make the model appear complete.

// # 8. RESOLVE EVIDENCE AND UNCERTAINTY

// Classify each material actor, responsibility, relationship, permission, operation, or guardrail using the existing evidence classifications.

// Source-supported:
// The supplied context explicitly establishes the conclusion.

// Inferred:
// The conclusion is a reasonable business-specific deduction from the supplied context, even if the individual permission is not explicitly stated.

// Conditional:
// The conclusion applies only if a specified condition, relationship, or operating model applies. State that condition.

// Unknown:
// The context is insufficient to derive a reasonable conclusion or resolve a material authority boundary.

// Apply classifications to individual conclusions, not merely to the actor as a whole. One actor may have source-supported responsibilities, inferred permissions, conditional operations, and unknown guardrails.

// Do not treat model confidence as evidence.

// A reasonable inferred permission is a valid output; do not automatically classify it as unknown merely because it is not explicitly enumerated in the source.

// When a permission is plausible but its consequences, scope, or authority boundary materially requires business confirmation, preserve the proposed permission and identify the specific confirmation needed using the existing schema. Do not silently convert the proposal into an established business rule.

// Reserve unknown for genuine uncertainty. Do not create questions for every detail that can reasonably be derived.

// Where evidence contradicts a proposed permission, identify the conflict rather than presenting the permission as established.

// # 9. FINAL QUALITY CHECK

// Before returning the model, verify that:
// - Every actor has a meaningful business justification.
// - Responsibilities and object relationships are coherent.
// - Material permissions are reasonably derived rather than copied mechanically from responsibilities.
// - Reasonable inferences are retained and correctly classified.
// - Broad access, exclusive control, and sensitive state-changing authority are not assumed without justification.
// - Relevant lifecycle dependencies, exceptions, and operating-model alternatives are reflected.
// - Material gaps, conflicts, and unresolved decisions remain visible.
// - Duplicate findings are consolidated where they describe the same underlying issue.
// - Existing object names, field names, value types, and output structure are preserved.
// - No industry-specific schema or unsupported universal policy has been introduced.

// Prioritize material correctness and business coverage over repetitive explanation. Do not claim exhaustive correctness where the context is insufficient.

// # OUTPUT CONTRACT

// Return the actor JSON array using the existing schema:

// - actor_name
// - operational_role
// - core_responsibilities
// - access_authorization_and_scope
//   - What_They_Can_See
//   - What_They_Can_Create
//   - What_They_Can_Change
//   - What_They_Can_Remove
//   - Operations_They_Can_Run
//   - Business_Rules_And_Guardrails
// - evidence_and_assumptions

// Within evidence_and_assumptions, preserve the existing classifications:
// - source_supported
// - inferred
// - conditional
// - unknown

// Keep all agreed field names and value types stable. Do not create new top-level sections or industry-specific fields.

// Use concise, business-specific descriptions. Keep evidence annotations traceable and brief. Include unresolved questions only when they materially affect a responsibility, permission, scope, condition, or business rule.

// Empty arrays are acceptable where no entries are justified. Do not fabricate permissions or guardrails to fill empty categories.

// Return valid JSON only, without Markdown fences, comments, or explanatory prose outside the JSON.
// `;

// const pass1Prompt = `
// Identify business actors and their responsibilities using:

// Domain: ${base.domain}
// Niche: ${base.niche}
// Business discovery data: ${JSON.stringify(base.business_obj)}

// Identify relevant people, organizations, groups, external parties, and automated participants only when justified by the supplied context.

// For each actor, derive:
// - actor_name: A distinct, business-specific actor name.
// - operational_role: The actor's business role.
// - core_responsibilities: Concise responsibilities and expected business outcomes.
// - evidence_classification: source_supported, inferred, conditional, or unknown.

// Derive responsibilities from the discovered business activities, objects, relationships, dependencies, decisions, and handoffs.

// Distinguish participation, responsibility for an outcome, object ownership, decision authority, and execution. Do not assume these are interchangeable.

// Do not impose predefined actor categories, generate generic job descriptions, duplicate actors, or invent actors without business justification.

// Use source-supported information where available. Retain reasonable business-specific inferences and classify them correctly. Use conditional only when a stated condition applies. Use unknown only when a material conclusion cannot reasonably be derived.

// Do not generate object-level permissions, CRUD operations, access scopes, authorization rules, guardrails, or a detailed lifecycle analysis.

// Do not add evidence_classification fields or equivalent classification
// fields to actors, responsibilities, permissions, or operations.

// Return valid JSON only:
// [
//   {
//     "actor_name": "Business-specific actor name",
//     "operational_role": "Concise role description",
//     "core_responsibilities": [
//       "Responsibility or expected outcome"
//     ],
   
//   }
// ]
// `;
//---------------------------------------------------------------------------
// const pass1Prompt = `
// Identify business actors, their responsibilities, and their information
// access requirements using:

// Domain: ${base.domain}
// Niche: ${base.niche}
// Business discovery data: ${JSON.stringify(base.business_obj)}

// # OBJECTIVE

// Discover relevant actors and determine what business information each actor
// reasonably needs to access to perform their responsibilities.

// Keep the reasoning domain-agnostic. Derive actors, responsibilities, business
// objects, and access requirements from the supplied discovery data rather than
// imposing predefined industry structures or authorization models.

// # 1. DISCOVER ACTORS AND RESPONSIBILITIES

// Identify relevant people, organizations, groups, external parties, and
// automated participants only when justified by the supplied context.

// For each actor, derive:
// - actor_name: A distinct, business-specific actor name.
// - operational_role: The actor's business role.
// - core_responsibilities: Concise responsibilities and expected business
//   outcomes.

// Derive responsibilities from the discovered business activities, objects,
// relationships, dependencies, decisions, and handoffs.

// Distinguish:
// - Participation in an activity.
// - Responsibility for a business outcome.
// - Ownership or stewardship of a business object.
// - Decision-making or approval authority.
// - Execution of an activity.
// - Automated execution by a system or integration.

// Do not assume these are interchangeable.

// Do not impose predefined actor categories, generate generic job descriptions,
// duplicate actors, or invent actors without business justification.

// Keep actors separate when their responsibilities or authority are materially
// different. Consolidate roles only when the supplied context supports doing so.

// # 2. DERIVE WHAT EACH ACTOR CAN SEE

// For every discovered actor, derive:

// access_authorization_and_scope:
//   What_They_Can_See: []

// Use the business discovery data and the actor's responsibilities to determine
// which information and business objects the actor reasonably needs to access.

// Before adding each access entry, internally ask and answer the relevant
// questions below.

// A. BUSINESS PURPOSE
// - What responsibility or business outcome requires this actor to access
//   the information?
// - What decision, activity, validation, handoff, or action does the information
//   support?
// - Would the actor reasonably need this information to perform the role,
//   or is access merely possible?

// B. OBJECT AND INFORMATION NEED
// - Which business objects explicitly identified in the discovery data are
//   relevant to this actor?
// - Which specific records, attributes, statuses, or details does the actor
//   need to see?
// - Does the actor need the complete object or only selected information?
// - Is the information needed to initiate, execute, coordinate, approve,
//   monitor, verify, reconcile, or conclude an activity?

// C. ACTOR–OBJECT RELATIONSHIP
// - What is the actor's relationship to the object?
// - Does the actor create, own, maintain, use, fulfil, approve, transfer,
//   monitor, or conclude the object or its lifecycle?
// - Is the actor responsible for the object itself, an activity involving it,
//   or merely an outcome associated with it?
// - Does this relationship justify direct access, limited visibility, or
//   no access?

// D. ACCESS SCOPE
// - Which records does the actor need to see to perform the responsibility?
// - Is access reasonably limited to records associated with the actor's
//   customer relationship, assigned work, relevant location, organization,
//   transaction, or another relationship established by the context?
// - Does the discovery data establish a broader access scope?
// - If the scope cannot be established, what is the narrowest reasonable
//   business-specific description without inventing a mandatory access policy?

// E. INFORMATION BOUNDARIES
// - Does the actor need sensitive or commercially restricted information
//   to fulfil the identified responsibility?
// - Could the responsibility be fulfilled using a subset of the information?
// - Does the source establish a restriction, or would the restriction be
//   an unsupported assumption?
// - Is the actor an external party or automated participant whose information
//   access should be limited to its established business interaction?

// F. OPERATING MODEL AND DEPENDENCIES
// - Does access depend on an assignment, relationship, decision, lifecycle
//   state, agreement, configuration, or operating-model choice?
// - Is that condition established by the supplied context?
// - If multiple reasonable operating models exist, can the access requirement
//   be described without arbitrarily selecting one?

// These are internal analytical questions. Do not output the questions or
// their answers separately.

// # 3. PREVENT UNSUPPORTED ACTOR AND ACCESS ASSUMPTIONS

// Apply these rules to every actor and proposed access entry:

// - Do not assume that a role title establishes ownership of an object.
// - Do not assume that an actor responsible for an activity needs access to
//   every object involved in that activity.
// - Do not assume that an actor who creates or changes information can also
//   see every attribute of the object.
// - Do not assume that an actor needs direct access when a system or another
//   actor may provide the required outcome.
// - Do not assume that a system administrator automatically has unrestricted
//   business-data access.
// - Do not assume that a platform operator controls every business function.
// - Do not assume that an external organization has direct access to internal
//   application records.
// - Do not invent specialized actors, regulatory responsibilities, data
//   restrictions, approval policies, or access-control rules merely because
//   they are common in an industry.
// - Do not infer that a regulator, auditor, payment provider, supplier, or other
//   external participant exists unless justified by the supplied context or
//   a clearly necessary business inference.
// - Do not combine distinct actors merely to reduce the actor count.
// - Do not invent business objects as established facts. If a missing object
//   is essential to describe an access need, identify it as a proposed gap
//   within the relevant access description.
// - Do not list every discovered object for every actor.
// - Do not add entries merely to make the output appear comprehensive.

// # 4. DOMAIN-AGNOSTIC REASONING

// Do not assume a universal actor taxonomy, organizational hierarchy, business
// operating model, object ownership model, or information-access pattern.

// Derive the appropriate model from the actual discovery data.


// # 4. DOMAIN-AGNOSTIC REASONING

// Do not assume a universal actor taxonomy, organizational hierarchy, business\
// operating model, object ownership model, or information-access pattern.

// Derive the appropriate model from the actual discovery data. Apply the same\
// reasoning principles regardless of industry, niche, business type, operating\
// model, or technology.

// Do not assume industry-standard participants, workflows, commercial\
// arrangements, regulatory obligations, technologies, or operational practices\
// merely because they are common in a particular domain.

// Use business-specific terminology and concrete information needs when\
// supported by the input. Infer missing details only when a clear relationship\
// to the supplied context justifies the inference. Do not present plausible\
// industry conventions as established business requirements.

// For every proposed actor, responsibility, and access entry, establish a\
// reasonable connection to the supplied business activities, objects,\
// relationships, decisions, dependencies, or handoffs.

// For every item in What_They_Can_See, identify the information required for\
// the actor's responsibilities and limit visibility to the relevant business\
// scope. Do not assume unrestricted access to all records, customers,\
// locations, organizations, or transactions.

// Distinguish information exchanged with an external participant from\
// unrestricted access to internal business records.

// Avoid vague entries such as:

// - \"Access relevant business data\"
// - \"View all operational records\"
// - \"Manage system information\"
// - \"Access information required for the role\"

// Identify the actual object or information, relevant scope, and business\
// purpose when supported by the context.

// Where the context supports only a broad conclusion, keep the description\
// appropriately broad rather than inventing details. Omit unsupported actors\
// and access entries instead of adding them to make the output appear complete.

// Do not introduce domain-specific rules, predefined actor categories, or\
// fixed business-object assumptions.


// Use business-specific terminology and concrete information needs. Avoid
// vague entries such as:
// - "Access relevant business data"
// - "View all operational records"
// - "Manage system information"
// - "Access information required for the role"

// Instead, identify the actual object or information, the relevant scope,
// and the business purpose when supported by the context.

// Where the context supports only a broad conclusion, keep the description
// appropriately broad rather than inventing details.

// # 5. FINAL INTERNAL VALIDATION

// Before returning the output, check each actor:

// - Is the actor justified by the supplied business context?
// - Are the responsibilities concrete and consistent with the discovered
//   activities and relationships?
// - Does each proposed access entry support a specific responsibility?
// - Are the relevant object and information needs identified clearly?
// - Is the proposed scope proportionate to the actor's business need?
// - Have role ownership, decision authority, execution, and system automation
//   been distinguished?
// - Have unsupported industry conventions and access restrictions been avoided?
// - Have materially different roles been kept distinct?
// - Are duplicate or redundant access entries removed?

// Correct unsupported conclusions before returning the result. Do not repeat
// the entire discovery process during validation.

// # OUTPUT CONTRACT

// Return valid JSON only, using this structure:

// [
//   {
//     "actor_name": "Business-specific actor name",
//     "operational_role": "Concise role description",
//     "core_responsibilities": [
//       "Specific responsibility or expected business outcome"
//     ],
//     "access_authorization_and_scope": {
//       "What_They_Can_See": [
//         "Business object or information, relevant scope, and purpose"
//       ]
//     }
//   }
// ]

// Return one object per justified actor.

// Use actual business-object names from the supplied discovery data.
// Keep responsibility and access descriptions concise and business-specific.

// Use an empty array for What_They_Can_See when no access requirement can
// reasonably be derived.

// Do not include create, change, remove, or executable-operation permissions
// in this pass.

// Do not add evidence_classification fields or equivalent classification
// fields.

// Return valid JSON only, without Markdown fences, comments, or explanatory
// prose outside the JSON.
// `;
//--------------------------------------------------------
// const pass1Prompt = `
// Identify business actors, their responsibilities, and their information
// access requirements using:

// Domain: ${base.domain}
// Niche: ${base.niche}
// Business discovery data: ${JSON.stringify(base.business_obj)}

// # OBJECTIVE

// Discover relevant actors and determine what business information each actor
// reasonably needs to access to perform their responsibilities.

// Keep the reasoning domain-agnostic. Derive actors, responsibilities, business
// objects, and access requirements from the supplied discovery data rather than
// imposing predefined industry structures or authorization models.

// # 1. DISCOVER ACTORS AND RESPONSIBILITIES

// Identify relevant people, organizations, groups, external parties, and
// automated participants only when justified by the supplied context.

// For each actor, derive:
// - actor_name: A distinct, business-specific actor name.
// - operational_role: The actor's business role.
// - core_responsibilities: Concise responsibilities and expected business
//   outcomes.

// Derive responsibilities from the discovered business activities, objects,
// relationships, dependencies, decisions, and handoffs.

// Distinguish:
// - Participation in an activity.
// - Responsibility for a business outcome.
// - Ownership or stewardship of a business object.
// - Decision-making or approval authority.
// - Execution of an activity.
// - Automated execution by a system or integration.

// Do not assume these are interchangeable.

// Do not impose predefined actor categories, generate generic job descriptions,
// duplicate actors, or invent actors without business justification.

// Keep actors separate when their responsibilities or authority are materially
// different. Consolidate roles only when the supplied context supports doing so.

// # 2. DERIVE WHAT EACH ACTOR CAN SEE

// For every discovered actor, derive:

// access_authorization_and_scope:
//   What_They_Can_See: []

// Use the business discovery data and the actor's responsibilities to determine
// which information and business objects the actor reasonably needs to access.

// Before adding each access entry, internally ask and answer the relevant
// questions below.

// A. BUSINESS PURPOSE
// - What responsibility or business outcome requires this actor to access
//   the information?
// - What decision, activity, validation, handoff, or action does the information
//   support?
// - Would the actor reasonably need this information to perform the role,
//   or is access merely possible?

// B. OBJECT AND INFORMATION NEED
// - Which business objects explicitly identified in the discovery data are
//   relevant to this actor?
// - Which specific records, attributes, statuses, or details does the actor
//   need to see?
// - Does the actor need the complete object or only selected information?
// - Is the information needed to initiate, execute, coordinate, approve,
//   monitor, verify, reconcile, or conclude an activity?

// C. ACTOR-OBJECT RELATIONSHIP
// - What is the actor's relationship to the object?
// - Does the actor create, own, maintain, use, fulfil, approve, transfer,
//   monitor, or conclude the object or its lifecycle?
// - Is the actor responsible for the object itself, an activity involving it,
//   or merely an outcome associated with it?
// - Does this relationship justify direct access, limited visibility, or
//   no access?

// D. ACCESS SCOPE
// - Which records does the actor need to see to perform the responsibility?
// - Is access reasonably limited to records associated with the actor's
//   customer relationship, assigned work, relevant location, organization,
//   transaction, or another relationship established by the context?
// - Does the discovery data establish a broader access scope?
// - If the scope cannot be established, what is the narrowest reasonable
//   business-specific description without inventing a mandatory access policy?

// E. INFORMATION BOUNDARIES
// - Does the actor need sensitive or commercially restricted information
//   to fulfil the identified responsibility?
// - Could the responsibility be fulfilled using a subset of the information?
// - Does the source establish a restriction, or would the restriction be
//   an unsupported assumption?
// - Is the actor an external party or automated participant whose information
//   access should be limited to its established business interaction?

// F. OPERATING MODEL AND DEPENDENCIES
// - Does access depend on an assignment, relationship, decision, lifecycle
//   state, agreement, configuration, or operating-model choice?
// - Is that condition established by the supplied context?
// - If multiple reasonable operating models exist, can the access requirement
//   be described without arbitrarily selecting one?

// These are internal analytical questions. Do not output the questions or
// their answers separately.

// # 3. PREVENT UNSUPPORTED ACTOR AND ACCESS ASSUMPTIONS

// Apply these rules to every actor and proposed access entry:

// - Do not assume that a role title establishes ownership of an object.
// - Do not assume that an actor responsible for an activity needs access to
//   every object involved in that activity.
// - Do not assume that an actor who creates or changes information can also
//   see every attribute of the object.
// - Do not assume that an actor needs direct access when a system or another
//   actor may provide the required outcome.
// - Do not assume that a system administrator automatically has unrestricted
//   business-data access.
// - Do not assume that a platform operator controls every business function.
// - Do not assume that an external organization has direct access to internal
//   application records.
// - Do not invent specialized actors, regulatory responsibilities, data
//   restrictions, approval policies, or access-control rules merely because
//   they are common in an industry.
// - Do not infer that a regulator, auditor, payment provider, supplier, or other
//   external participant exists unless justified by the supplied context or
//   a clearly necessary business inference.
// - Do not combine distinct actors merely to reduce the actor count.
// - Do not invent business objects as established facts. If a missing object
//   is essential to describe an access need, identify it as a proposed gap
//   within the relevant access description.
// - Do not list every discovered object for every actor.
// - Do not add entries merely to make the output appear comprehensive.

// # 4. DOMAIN-AGNOSTIC REASONING

// Do not assume a universal actor taxonomy, organizational hierarchy, business
// operating model, object ownership model, or information-access pattern.

// Derive the appropriate model from the actual discovery data. Apply the same
// reasoning principles regardless of industry, niche, business type, operating
// model, or technology.

// Do not assume industry-standard participants, workflows, commercial
// arrangements, regulatory obligations, technologies, or operational practices
// merely because they are common in a particular domain.

// Use business-specific terminology and concrete information needs when
// supported by the input. Infer missing details only when a clear relationship
// to the supplied context justifies the inference. Do not present plausible
// industry conventions as established business requirements.

// For every proposed actor, responsibility, and access entry, establish a
// reasonable connection to the supplied business activities, objects,
// relationships, decisions, dependencies, or handoffs.

// For every item in What_They_Can_See, identify the information required for
// the actor's responsibilities and limit visibility to the relevant business
// scope. Do not assume unrestricted access to all records, customers,
// locations, organizations, or transactions.

// Distinguish information exchanged with an external participant from
// unrestricted access to internal business records.

// Avoid vague entries such as:
// - "Access relevant business data"
// - "View all operational records"
// - "Manage system information"
// - "Access information required for the role"

// Identify the actual object or information, relevant scope, and business
// purpose when supported by the context.

// Where the context supports only a broad conclusion, keep the description
// appropriately broad rather than inventing details. Omit unsupported actors
// and access entries instead of adding them to make the output appear complete.

// Do not introduce domain-specific rules, predefined actor categories, or
// fixed business-object assumptions.

// # 5. FINAL INTERNAL VALIDATION

// Before returning the output, check each actor:

// - Is the actor justified by the supplied business context?
// - Are the responsibilities concrete and consistent with the discovered
//   activities and relationships?
// - Does each proposed access entry support a specific responsibility?
// - Are the relevant object and information needs identified clearly?
// - Is the proposed scope proportionate to the actor's business need?
// - Have role ownership, decision authority, execution, and system automation
//   been distinguished?
// - Have unsupported industry conventions and access restrictions been avoided?
// - Have materially different roles been kept distinct?
// - Are duplicate or redundant access entries removed?

// Correct unsupported conclusions before returning the result. Do not repeat
// the entire discovery process during validation.

// # OUTPUT CONTRACT

// Return valid JSON only, using this structure:

// [
//   {
//     "actor_name": "Business-specific actor name",
//     "operational_role": "Concise role description",
//     "core_responsibilities": [
//       "Specific responsibility or expected business outcome"
//     ],
//     "access_authorization_and_scope": {
//       "What_They_Can_See": [
//         "Business object or information, relevant scope, and purpose"
//       ]
//     }
//   }
// ]

// Return one object per justified actor.

// Use actual business-object names from the supplied discovery data.
// Keep responsibility and access descriptions concise and business-specific.

// Use an empty array for What_They_Can_See when no access requirement can
// reasonably be derived.

// Do not include create, change, remove, or executable-operation permissions
// in this pass.

// Do not add evidence_classification fields or equivalent classification
// fields.

// Return valid JSON only, without Markdown fences, comments, or explanatory
// prose outside the JSON.
// `;

///------------------------------------------

// const pass1Prompt = `
// Identify business actors, their responsibilities, and their information
// access and creation requirements using:

// Domain: ${base.domain}
// Niche: ${base.niche}
// Business discovery data: ${JSON.stringify(base.business_obj)}

// # OBJECTIVE

// Discover relevant actors, their responsibilities, the business information
// they reasonably need to see, and the business records they reasonably need
// to create.

// Keep the reasoning domain-agnostic. Derive actors, responsibilities, business
// objects, visibility, and creation requirements from the supplied discovery
// data rather than imposing predefined industry structures or authorization
// models.

// # 1. DISCOVER ACTORS AND RESPONSIBILITIES

// Identify relevant people, organizations, groups, external parties, and
// automated participants only when justified by the supplied context.

// For each actor, derive:
// - actor_name: A distinct, business-specific actor name.
// - operational_role: The actor's business role.
// - core_responsibilities: Concise responsibilities and expected business
//   outcomes.

// Derive responsibilities from the discovered business activities, objects,
// relationships, dependencies, decisions, and handoffs.

// Distinguish:
// - Participation in an activity.
// - Responsibility for a business outcome.
// - Ownership or stewardship of a business object.
// - Decision-making or approval authority.
// - Execution of an activity.
// - Automated execution by a system or integration.

// Do not assume these are interchangeable.

// Do not impose predefined actor categories, generate generic job descriptions,
// duplicate actors, or invent actors without business justification.

// Keep actors separate when their responsibilities or authority are materially
// different. Consolidate roles only when the supplied context supports doing so.

// # 2. DERIVE WHAT EACH ACTOR CAN SEE AND CREATE

// For every discovered actor, derive:

// access_authorization_and_scope:
//   What_They_Can_See: []
//   What_They_Can_Create: []

// Determine visibility and creation requirements independently for each actor.
// An actor may be able to see information without being allowed to create it,
// create a record without seeing every attribute of it, or require neither
// capability for a particular business object.

// ## A. WHAT EACH ACTOR CAN SEE

// Use the business discovery data and the actor's responsibilities to determine
// which information and business objects the actor reasonably needs to access.

// Before adding each visibility entry, internally consider the following:

// BUSINESS PURPOSE
// - What responsibility or business outcome requires access to this information?
// - What decision, activity, validation, handoff, or action does the information
//   support?
// - Does the actor need this information, or is access merely possible?

// OBJECT AND INFORMATION NEED
// - Which business objects identified in the discovery data are relevant?
// - Which records, attributes, statuses, or details does the actor need to see?
// - Does the actor need the complete object or only selected information?
// - Is the information needed to initiate, execute, coordinate, approve,
//   monitor, verify, reconcile, or conclude an activity?

// ACTOR-OBJECT RELATIONSHIP
// - What is the actor's relationship to the object?
// - Does the actor create, own, maintain, use, fulfil, approve, transfer,
//   monitor, or conclude the object or its lifecycle?
// - Is the actor responsible for the object, an activity involving it,
//   or merely an outcome associated with it?
// - Does this relationship justify direct access, limited visibility, or
//   no access?

// ACCESS SCOPE
// - Which records does the actor need to see?
// - Is access reasonably limited to records associated with the actor's
//   customer relationship, assigned work, relevant location, organization,
//   transaction, or another relationship established by the context?
// - Does the discovery data establish a broader access scope?
// - If the scope cannot be established, describe the narrowest reasonable
//   business-specific scope without inventing a mandatory access policy.

// INFORMATION BOUNDARIES
// - Does the actor need sensitive or commercially restricted information?
// - Could the responsibility be fulfilled using a subset of the information?
// - Does the source establish a restriction, or would it be an unsupported
//   assumption?
// - Is the actor an external party or automated participant whose access should
//   be limited to its established business interaction?

// OPERATING MODEL AND DEPENDENCIES
// - Does access depend on an assignment, relationship, decision, lifecycle
//   state, agreement, configuration, or operating-model choice?
// - Is that condition established by the supplied context?
// - If multiple operating models are possible, can the access requirement be
//   described without arbitrarily selecting one?

// ## B. WHAT EACH ACTOR CAN CREATE

// Determine which business records or objects each actor is reasonably
// responsible for initiating or creating as part of the discovered business
// process.

// Before adding each creation entry, internally consider the following:

// BUSINESS PURPOSE
// - What responsibility or business activity requires the actor to create
//   this record or object?
// - What business event, request, decision, interaction, or handoff triggers
//   its creation?
// - Is record creation an established part of the process, or merely a possible
//   capability of the application?

// OBJECT AND CREATION NEED
// - Which business objects identified in the discovery data must the actor
//   create or initiate?
// - What specific record or business object results from the actor's activity?
// - Is the actor creating a new business record, initiating a request, or
//   submitting information that another actor or system converts into a record?
// - Does the supplied context establish the actor as the creator, or does it
//   only establish the actor's participation in the activity?

// ACTOR-OBJECT RELATIONSHIP
// - Is the actor responsible for originating the record, submitting its
//   information, or initiating the process that creates it?
// - Is creation performed by a human, an organization, an external participant,
//   or an automated system?
// - Does the actor create the business object directly, or does another actor
//   or system create it following the actor's action?
// - Do the supplied activities and relationships justify assigning creation
//   responsibility to this actor?

// CREATION SCOPE
// - Which types of records is the actor reasonably expected to create?
// - Is creation limited by an established customer relationship, assignment,
//   location, organization, transaction, or other business context?
// - Does the discovery data establish any such limitation?
// - If the scope is unclear, describe the creation responsibility without
//   inventing specific access-control policies or restrictions.

// CREATION BOUNDARIES
// - Does the actor originate the record, or merely provide input to another
//   actor or system?
// - Is the actor creating a new business object or adding a distinct record
//   associated with an existing object?
// - Does the source establish that the actor can initiate the record's creation?
// - Are required approvals, prerequisites, or lifecycle conditions established
//   by the supplied context?
// - Do not invent approvals, prerequisites, validation rules, or creation
//   policies merely because they are common in an industry.

// AUTOMATION AND DEPENDENCIES
// - Is record creation performed automatically after an event, decision,
//   integration, or other activity?
// - Is the automated participant explicitly established or reasonably supported
//   by the discovery data?
// - Do not assign automatic record creation to a human actor when the process
//   indicates that a system or another actor performs it.
// - If the precise creator cannot be established, do not arbitrarily assign
//   creation responsibility to an actor.

// These are internal analytical questions. Do not output the questions or
// their answers separately.

// # 3. PREVENT UNSUPPORTED ACTOR AND AUTHORIZATION ASSUMPTIONS

// Apply these rules to every actor and proposed visibility or creation entry:

// - Do not assume that a role title establishes ownership of a business object.
// - Do not assume that an actor responsible for an activity needs access to
//   every object involved in that activity.
// - Do not assume that an actor who creates a record can see every attribute
//   of that record.
// - Do not assume that an actor who can see a record can create it.
// - Do not assume that participating in an activity automatically grants
//   creation responsibility.
// - Do not assume that submitting information means the actor creates the
//   resulting business object.
// - Do not assume that an actor needs direct access when a system or another
//   actor may provide the required outcome.
// - Do not assume that a system administrator automatically has unrestricted
//   business-data access or creation authority.
// - Do not assume that a platform operator controls every business function.
// - Do not assume that an external organization has direct access to internal
//   application records or can create internal records.
// - Do not invent specialized actors, regulatory responsibilities, data
//   restrictions, approval policies, or access-control rules merely because
//   they are common in an industry.
// - Do not infer that a regulator, auditor, payment provider, supplier, or other
//   external participant exists unless justified by the supplied context or
//   a clearly necessary business inference.
// - Do not combine distinct actors merely to reduce the actor count.
// - Do not invent business objects as established facts. If a missing object
//   is essential to describe a visibility or creation requirement, identify it
//   as a proposed gap within the relevant description.
// - Do not list every discovered object for every actor.
// - Do not add visibility or creation entries merely to make the output
//   appear comprehensive.

// # 4. DOMAIN-AGNOSTIC REASONING

// Do not assume a universal actor taxonomy, organizational hierarchy, business
// operating model, object ownership model, or information-access pattern.

// Derive the appropriate model from the actual discovery data. Apply the same
// reasoning principles regardless of industry, niche, business type, operating
// model, or technology.

// Do not assume industry-standard participants, workflows, commercial
// arrangements, regulatory obligations, technologies, or operational practices
// merely because they are common in a particular domain.

// Use business-specific terminology and concrete information needs when
// supported by the input. Infer missing details only when a clear relationship
// to the supplied context justifies the inference. Do not present plausible
// industry conventions as established business requirements.

// For every proposed actor, responsibility, visibility entry, and creation
// entry, establish a reasonable connection to the supplied business activities,
// objects, relationships, decisions, dependencies, or handoffs.

// For every What_They_Can_See entry, identify the information required for the
// actor's responsibilities and limit visibility to the relevant business scope.

// For every What_They_Can_Create entry, identify the business object or record
// the actor is responsible for originating and the activity or event that
// justifies its creation.

// Do not assume unrestricted visibility or creation authority across all
// records, customers, locations, organizations, or transactions.

// Distinguish information exchanged with an external participant from
// unrestricted access to internal business records. Distinguish a human actor's
// responsibility from a system's automated capabilities.

// Avoid vague entries such as:
// - "Access relevant business data"
// - "View all operational records"
// - "Manage system information"
// - "Create required business records"
// - "Create relevant objects"
// - "Create records as needed"

// Identify the actual object or record, relevant scope, and business purpose
// when supported by the context.

// Where the context supports only a broad conclusion, keep the description
// appropriately broad rather than inventing details. Omit unsupported actors,
// visibility entries, and creation entries instead of adding them to make the
// output appear complete.

// Do not introduce domain-specific rules, predefined actor categories, fixed
// business-object assumptions, or universal creation patterns.

// # 5. FINAL INTERNAL VALIDATION

// Before returning the output, check each actor:

// - Is the actor justified by the supplied business context?
// - Are the responsibilities concrete and consistent with the discovered
//   activities and relationships?
// - Does each visibility entry support a specific responsibility?
// - Does each creation entry correspond to a justified record-creation
//   responsibility or activity?
// - Have visibility and creation been evaluated independently?
// - Has record creation been distinguished from information submission,
//   process initiation, record modification, and automated creation?
// - Are the relevant objects, information needs, and creation responsibilities
//   identified clearly?
// - Is the proposed visibility or creation scope proportionate to the actor's
//   business responsibilities?
// - Have role ownership, decision authority, execution, and system automation
//   been distinguished?
// - Have unsupported industry conventions, creation assumptions, and access
//   restrictions been avoided?
// - Have materially different roles been kept distinct?
// - Are duplicate or redundant actors and entries removed?

// Correct unsupported conclusions before returning the result. Do not repeat
// the entire discovery process during validation.

// # OUTPUT CONTRACT

// Return valid JSON only, using this structure:

// [
//   {
//     "actor_name": "Business-specific actor name",
//     "operational_role": "Concise role description",
//     "core_responsibilities": [
//       "Specific responsibility or expected business outcome"
//     ],
//     "access_authorization_and_scope": {
//       "What_They_Can_See": [
//         "Business object or information, relevant scope, and purpose"
//       ],
//       "What_They_Can_Create": [
//         "Business object or record the actor is responsible for creating,
//          with the relevant business purpose or triggering activity"
//       ]
//     }
//   }
// ]

// Return one object per justified actor.

// Use actual business-object names from the supplied discovery data.
// Keep responsibility, visibility, and creation descriptions concise and
// business-specific.

// Use an empty array for What_They_Can_See when no visibility requirement can
// reasonably be derived.

// Use an empty array for What_They_Can_Create when no creation responsibility
// can reasonably be derived.

// Do not include change, remove, update, delete, or other executable-operation
// permissions in this pass. Do not infer them from visibility or creation.

// Do not add evidence_classification fields or equivalent classification
// fields.

// Return valid JSON only, without Markdown fences, comments, or explanatory
// prose outside the JSON.
// `;


// const pass1Prompt = `
// Identify business actors, their responsibilities, information access,
// and business-object creation requirements using:

// Domain: ${base.domain}
// Niche: ${base.niche}
// Business discovery data: ${JSON.stringify(base.business_obj)}

// # OBJECTIVE

// Discover actors and derive their responsibilities, information visibility,
// and business-object creation authority from the supplied discovery data.

// Remain domain-agnostic. Do not impose predefined industry structures,
// actors, workflows, object ownership, or authorization models.

// # 1. DISCOVER ACTORS AND RESPONSIBILITIES

// Identify relevant people, organizations, groups, external parties, and
// automated participants only when justified by the supplied context.

// For each actor, derive:
// - actor_name: A distinct, business-specific actor name.
// - operational_role: The actor's business role.
// - core_responsibilities: Concise responsibilities and expected outcomes.

// Derive responsibilities from discovered activities, objects, relationships,
// dependencies, decisions, and handoffs.

// Distinguish participation, business responsibility, object ownership,
// decision authority, activity execution, and automated execution.
// Do not assume these are interchangeable.

// Keep materially different actors separate. Do not invent or duplicate actors,
// generic job descriptions, responsibilities, or industry practices.

// # 2. DERIVE WHAT EACH ACTOR CAN SEE

// For every actor, derive:
// access_authorization_and_scope:
//   What_They_Can_See: []

// Determine which business information and objects the actor reasonably needs
// for their supported responsibilities.

// For each entry, internally evaluate:

// - BUSINESS PURPOSE: Which responsibility, decision, activity, validation,
//   handoff, or outcome requires the information?
// - OBJECT NEED: Which discovered object, record, attribute, status, or detail
//   is needed? Does the actor need the complete object or only selected data?
// - ACTOR RELATIONSHIP: Does the actor create, own, maintain, use, fulfil,
//   approve, transfer, monitor, or conclude the object or its lifecycle?
// - ACCESS SCOPE: Is visibility limited to the actor's own records, assigned
//   work, relevant location, organization, transaction, or another relationship
//   established by the input?
// - INFORMATION BOUNDARIES: Is sensitive or commercially restricted information
//   necessary for the responsibility? Do not invent restrictions unsupported
//   by the context.
// - DEPENDENCIES: Does access depend on an assignment, agreement, decision,
//   lifecycle state, configuration, or operating-model choice established by
//   the supplied data?

// Do not assume that responsibility for an activity grants access to every
// object involved in it. Do not assume that creating or changing information
// grants visibility to every attribute.

// Do not assume unrestricted access for system administrators, platform
// operators, external participants, or automated systems.

// # 3. DERIVE WHAT EACH ACTOR CAN CREATE

// For every actor, derive:
// access_authorization_and_scope:
//   What_They_Can_Create: []

// Identify business objects or records that the actor is reasonably responsible
// for originating, based on the supplied discovery data.

// For each proposed creation entry, internally evaluate:

// - CREATION PURPOSE: What business outcome or activity requires the new object
//   or record?
// - OBJECT: Which discovered business object is being created?
// - RESPONSIBILITY: Does the actor originate the object, or merely participate
//   in a process involving it?
// - CREATION MECHANISM: Does the actor create the record directly, submit
//   information for another participant to record, or trigger a process that
//   automatically creates it?
// - OWNERSHIP: Is the actor responsible for originating the business record,
//   or does another actor or system own that responsibility?
// - SOURCE SUPPORT: What activity, relationship, decision, dependency, handoff,
//   or lifecycle requirement supports this creation responsibility?


// Distinguish these cases:

// 1. CREATE: Originating a new business object or record.
// 2. SUBMIT: Providing information that another actor or system records.
// 3. TRIGGER: Initiating a process that may cause automated record creation.
// 4. UPDATE: Changing an existing object's attributes, quantities, status,
//    or lifecycle state.

// Do not treat submission, triggering, or updating as direct creation unless
// the supplied context supports that interpretation.

// If an actor triggers automation, do not automatically assign ownership of
// the resulting record to that actor. Attribute creation to the automated
// participant only when the context supports that responsibility.

// Do not infer creation authority from visibility, participation, role title,
// or the ability to initiate a process.

// Do not invent missing business objects as established facts. If the source
// does not support a creation responsibility, use an empty array rather than
// guessing.

// This section identifies business-object creation responsibilities only.
// Do not derive update, delete, approval, or other executable-operation
// permissions in this pass.

// Do not assume that performing an activity, providing information,
// confirming an outcome, or initiating a process means the actor creates
// the associated business object or record.

// Distinguish the actor who initiates an activity from the participant
// or system responsible for originating the resulting business object
// or record.

// Do not assign creation responsibility to an actor solely because
// the actor participates in a related activity, process, or workflow.
// Determine creation responsibility from the supplied business objects,
// activities, relationships, dependencies, decisions, and handoffs.

// Distinguish human, organizational, external, and automated participants
// when supported by the supplied context. Do not attribute record creation
// to a participant or system without sufficient contextual justification.

// # 4. PREVENT UNSUPPORTED ASSUMPTIONS

// Apply these rules to actors, responsibilities, visibility, and creation:

// - Do not assume a role title establishes ownership of an object.
// - Do not assume an actor responsible for an activity needs every related
//   object or can create every object involved.
// - Do not assume an external organization has direct access to internal
//   application records.
// - Do not assume a platform operator controls every business function.
// - Do not assume a system capability is a human responsibility.
// - Do not invent regulatory, audit, payment, approval, or administrative
//   participants solely because they are common in an industry.
// - Do not invent access rules, commercial arrangements, or operational practices.
// - Do not list every discovered object for every actor.
// - Do not add entries merely to make the output appear comprehensive.
// - Do not combine distinct actors merely to reduce the actor count.
// - When multiple operating models are plausible, do not arbitrarily select one
//   without support from the supplied context.

// Derive the appropriate actors, responsibilities, object relationships,
// visibility, and creation authority from the actual discovery data.

// Use concrete business-specific terminology. For visibility, identify the
// object or information, relevant scope, and purpose when supported.
// For creation, identify the object or record and its business purpose.

// Avoid vague descriptions such as:
// - "Access relevant business data"
// - "View all operational records"
// - "Create required records"
// - "Manage system information"

// Omit unsupported entries rather than presenting plausible industry
// conventions as established business requirements.

// # 5. FINAL INTERNAL VALIDATION

// Before returning the output, verify:

// - Each actor is justified by the supplied business context.
// - Responsibilities are concrete and consistent with discovered activities.
// - Every visibility entry supports a specific responsibility and has a
//   reasonable scope.
// - Every creation entry describes a supported business-object creation
//   responsibility.
// - Creation is distinguished from submission, triggering, and updating.
// - Human, organizational, external-service, and automated responsibilities
//   are distinguished when the input supports that distinction.
// - Duplicate, redundant, or unsupported entries are removed.
// - Both required arrays exist for every actor, including when empty.

// Correct unsupported conclusions without repeating the discovery process.

// # OUTPUT CONTRACT

// Return valid JSON only, using this structure:

// [
//   {
//     "actor_name": "Business-specific actor name",
//     "operational_role": "Concise role description",
//     "core_responsibilities": [
//       "Specific responsibility or expected business outcome"
//     ],
//     "access_authorization_and_scope": {
//       "What_They_Can_See": [
//         "Business object or information, relevant scope, and purpose"
//       ],
//       "What_They_Can_Create": [
//         "Business object or record the actor is responsible for originating"
//       ]
//     }
//   }
// ]

// Return one object per justified actor.

// Use actual business-object names from the supplied discovery data.
// Use an empty array for either field when no requirement can reasonably
// be derived.

// Do not add evidence_classification fields or equivalent fields.
// Do not include update, delete, approval, or other executable-operation
// permissions in this pass.

// Return valid JSON only, without Markdown fences, comments, or explanatory
// prose outside the JSON.
// `;
//-------

const pass1Prompt = `
Identify business actors, their responsibilities, information access,
and business-object creation requirements using:

Domain: ${base.domain}
Niche: ${base.niche}
Business discovery data: ${JSON.stringify(base.business_obj)}

# OBJECTIVE

Discover actors and derive their responsibilities, information visibility,
and business-object creation authority from the supplied discovery data.

Remain domain-agnostic. Do not impose predefined industry structures,
actors, workflows, object ownership, or authorization models.

# 1. DISCOVER ACTORS AND RESPONSIBILITIES

Identify relevant people, organizations, groups, external parties, and
automated participants only when justified by the supplied context.

For each actor, derive:
- actor_name: A distinct, business-specific actor name.
- operational_role: The actor's business role.
- core_responsibilities: Concise responsibilities and expected outcomes.

Derive responsibilities from discovered activities, objects, relationships,
dependencies, decisions, and handoffs.

Distinguish participation, business responsibility, object ownership,
decision authority, activity execution, and automated execution.
Do not assume these are interchangeable.

Keep materially different actors separate. Do not invent or duplicate actors,
generic job descriptions, responsibilities, or industry practices.

# 2. DERIVE WHAT EACH ACTOR CAN SEE

For every actor, derive:
access_authorization_and_scope:
  What_They_Can_See: []

Determine which business information and objects the actor reasonably needs
for their supported responsibilities.

For each proposed visibility entry, internally evaluate:

- BUSINESS PURPOSE: Which responsibility, decision, activity, validation,
  handoff, or outcome requires the information?
- OBJECT NEED: Which discovered object, record, attribute, status, or detail
  is needed? Does the actor need the complete object or only selected data?
- ACTOR RELATIONSHIP: Does the actor create, own, maintain, use, fulfil,
  approve, transfer, monitor, or conclude the object or its lifecycle?
- ACCESS SCOPE: Is visibility limited to the actor's own records, assigned
  work, relevant location, organization, transaction, or another relationship
  established by the input?
- INFORMATION BOUNDARIES: Is sensitive or commercially restricted information
  necessary for the responsibility? Do not invent restrictions unsupported
  by the context.
- DEPENDENCIES: Does access depend on an assignment, agreement, decision,
  lifecycle state, configuration, or operating-model choice established by
  the supplied data?

Do not assume that responsibility for an activity grants access to every
object involved in it. Do not assume that creating or changing information
grants visibility to every attribute.

Do not assume unrestricted access for system administrators, platform
operators, external participants, or automated systems.

Do not invent access rules, commercial arrangements, or operational practices.
Include only visibility requirements reasonably supported by the context.

# 3. DERIVE WHAT EACH ACTOR CAN CREATE

For every actor, derive:
access_authorization_and_scope:
  What_They_Can_Create: []

Identify business objects or records that the actor is reasonably responsible
for originating, based on the supplied discovery data.

For each proposed creation entry, internally evaluate:

- CREATION PURPOSE: What business outcome or activity requires the new object
  or record?
- OBJECT: Which discovered business object is being created?
- RESPONSIBILITY: Does the actor originate the object, or merely participate
  in a process involving it?
- CREATION MECHANISM: Does the actor create the record directly, submit
  information for another participant to record, or trigger a process that
  automatically creates it?
- OWNERSHIP: Is the actor responsible for originating the business record,
  or does another actor or system own that responsibility?
- SOURCE SUPPORT: What activity, relationship, decision, dependency, handoff,
  or lifecycle requirement supports this creation responsibility?

Distinguish these cases:

1. CREATE: Originating a new business object or record.
2. SUBMIT: Providing information that another actor or system records.
3. TRIGGER: Initiating a process that may cause automated record creation.
4. UPDATE: Changing an existing object's attributes, quantities, status,
   or lifecycle state.

Do not treat submission, triggering, or updating as direct creation unless
the supplied context supports that interpretation.

If an actor triggers automation, do not automatically assign ownership of
the resulting record to that actor. Attribute creation to an automated
participant only when the context supports that responsibility.

Do not infer creation authority from visibility, participation, role title,
or the ability to initiate a process.

Do not invent missing business objects as established facts. Use discovered
business-object names when supported by the input. Do not invent a new object
solely to explain an unspecified process outcome.

Do not infer creation responsibility from participation, visibility, role
title, submission, confirmation, or process initiation alone.

Distinguish the participant who initiates an activity from the participant
or system responsible for originating the resulting business object or record.

Do not invent a system actor solely to explain an unspecified process outcome.
When creation responsibility is not sufficiently supported, leave
What_They_Can_Create empty rather than guessing.

This section identifies business-object creation responsibilities only.
Do not derive update, delete, approval, or other executable-operation
permissions in this pass.

# 4. PREVENT UNSUPPORTED ASSUMPTIONS

Apply these rules to actors, responsibilities, visibility, and creation:

- Do not assume a role title establishes ownership of an object.
- Do not assume an actor responsible for an activity needs every related
  object or can create every object involved.
- Do not assume an external organization has direct access to internal
  application records.
- Do not assume a platform operator controls every business function.
- Do not assume a system capability is a human responsibility.
- Do not invent regulatory, audit, payment, approval, or administrative
  participants solely because they are common in an industry.
- Do not invent access rules, commercial arrangements, or operational practices.
- Do not list every discovered object for every actor.
- Do not add entries merely to make the output appear comprehensive.
- Do not combine distinct actors merely to reduce the actor count.
- When multiple operating models are plausible, do not arbitrarily select one
  without support from the supplied context.

Derive the appropriate actors, responsibilities, object relationships,
visibility, and creation authority from the actual discovery data.

Use concrete business-specific terminology. For visibility, identify the
object or information, relevant scope, and purpose when supported.
For creation, identify the object or record and its business purpose.

Avoid vague descriptions such as:
- "Access relevant business data"
- "View all operational records"
- "Create required records"
- "Manage system information"

Omit unsupported entries rather than presenting plausible industry
conventions as established business requirements.

# 5. FINAL INTERNAL VALIDATION

Before returning the output, verify:

- Each actor is justified by the supplied business context.
- Responsibilities are concrete and consistent with discovered activities.
- Every visibility entry supports a specific responsibility and has a
  reasonable scope.
- Every creation entry describes a supported business-object creation
  responsibility.
- Creation is distinguished from submission, triggering, and updating.
- Human, organizational, external, and automated responsibilities are
  distinguished when the input supports that distinction.
- No automated participant or system actor has been invented merely to
  explain an unspecified process outcome.
- Duplicate, redundant, or unsupported entries are removed.
- Both required arrays exist for every actor, including when empty.

Correct unsupported conclusions without repeating the discovery process.

# OUTPUT CONTRACT

Return valid JSON only, using this structure:

[
  {
    "actor_name": "Business-specific actor name",
    "operational_role": "Concise role description",
    "core_responsibilities": [
      "Specific responsibility or expected business outcome"
    ],
    "access_authorization_and_scope": {
      "What_They_Can_See": [
        "Business object or information, relevant scope, and purpose"
      ],
      "What_They_Can_Create": [
        "Business object or record the actor is responsible for originating"
      ]
    }
  }
]

Return one object per justified actor.

Use actual business-object names from the supplied discovery data.

Include only visibility and creation responsibilities reasonably supported
by the supplied context. Do not treat missing information as evidence that
a responsibility exists or that it does not exist.

Use an empty array for either field when no entry can reasonably be supported
by the available data.

Do not add evidence_classification fields or equivalent fields.
Do not include update, delete, approval, or other executable-operation
permissions in this pass.

Return valid JSON only, without Markdown fences, comments, or explanatory
prose outside the JSON.
`;

    fs.mkdirSync(path.dirname(promptTmpPath1), { recursive: true });
    fs.writeFileSync(promptTmpPath1, pass1Prompt, 'utf8');

    const execArgsPass1 = [
      '-hf', CONFIG.MODEL.IDENTIFIER,
      '-ngl', CONFIG.MODEL.NGL,
      '--single-turn',
      '-c', CONFIG.MODEL.MAX_TOKENS, 
      '-b', CONFIG.MODEL.BATCH_SIZE, 
      '-t', CONFIG.MODEL.THREADS,     
      '--reasoning', CONFIG.MODEL.REASONING_MODE,
      '--log-disable', 
      '-n', CONFIG.MODEL.MAX_TOKENS,
      '-f', promptTmpPath1,
       '-o', finalTargetFilePath 
    ];

    console.log(`\n⚡ Running Pass 1: Pure data-driven state discovery...`);
    
    execFile(CONFIG.MODEL.EXEC_BINARY, execArgsPass1, { maxBuffer: 8024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (fs.existsSync(promptTmpPath1)) fs.unlinkSync(promptTmpPath1);
      if (error) return callback(error, null);

      let discoveredStatesMap = {};
      try {
       
        callback(null, finalTargetFilePath);
      } catch (parseErr) {
        console.warn("⚠️ JSON Extraction raw block mismatch, utilizing programmatic safety fallbacks."+parseErr);
        discoveredStatesMap = {};
      }

      
    });
  }

/**
 * ============================================================================
 * SECTION 4: FILE SYSTEM SCANNING & MAIN PIPELINE RUNTIME LOOP
 * ============================================================================
 */
const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
const objectsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS);
const actorsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS);
const journeysFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS);
const topologyFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY);

if (!objectsFilePath || !actorsFilePath || !journeysFilePath || !topologyFilePath) {
  throw new Error("Could not automatically locate all four required input source files inside your output directory.");
}

console.log(`\n📂 Reading Input 1: ${path.basename(objectsFilePath)}`);
console.log(`\n📂 Reading Input 2: ${path.basename(actorsFilePath)}`);
console.log(`\n📂 Reading Input 3: ${path.basename(journeysFilePath)}`);
console.log(`\n📂 Reading Input 4: ${path.basename(topologyFilePath)}`);

const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');



let cleanJsonArray1=extractDomain_Niche_Main_Content(objectsMatrixContent)



let base ={
  domain:cleanJsonArray1.primarydataset.domain,
  niche:cleanJsonArray1.primarydataset.niche,
  business_obj:cleanJsonArray1.mainContent,
  
  //topologyExistingPreciseContent:getmermaidcontent()
}

const now = new Date();
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0'); 
const year = String(now.getFullYear()).slice(-2);          
let hours = now.getHours();
const minutes = String(now.getMinutes()).padStart(2, '0');
const ampm = hours >= 12 ? 'pm' : 'am';
hours = hours % 12;
hours = hours ? hours : 12; 
const formattedHours = String(hours).padStart(2, '0');

const timestamp = `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;
const finalOutputPath = path.join(OUTPUT_DIR.replace("baseline/",""), `${CONFIG.PATHS.EXPORT_PREFIX}.${timestamp}.md`);

generateSemanticBlueprintAI(base, finalOutputPath, (err, targetSavedPath) => {
  if (err) {
    console.error("❌ CRITICAL_INFERENCE_ERROR: GGUF pipeline compilation failed:", err);
    process.exit(1);
  }
 
  //loadclean(base);
  console.log(`\n🎉 SUCCESS: Dynamic Business Lifecycle Specification compiled and saved via local 9B GGUF to: ${targetSavedPath}`);
});

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