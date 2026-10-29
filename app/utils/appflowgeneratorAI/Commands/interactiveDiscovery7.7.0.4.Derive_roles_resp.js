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
    EXPORT_PREFIX: '7.7.1.1.GAPS_Actors_Roles_Resonsibility_Authorization'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
    
    NGL: '0',
    MAX_TOKENS: '12288',         
    BATCH_SIZE: '12288', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "7.6 Business Objects.24-10-26_06:41pm.md",
    //STAGE_2_ACTORS: "7.7.1 .database Fields.md",
    STAGE_2_ACTORS: "7.7.1 Actors_list.29-10-26_05:14pm.md",
    
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

//<<<<<<============
//<<<<<<<<<working below  prompt for one hours=========================================================


const pass1Prompt = `
# Hyper-Intelligent Business Discovery, Actor Intelligence & Application Flow Preparation

## 1. Role and Objective

Act as a senior business analyst, domain specialist, enterprise application architect, business-process architect, and authorization designer.

Analyze the supplied domain, niche, business objects, and actor list to derive a coherent, evidence-based understanding of:

- Actor responsibilities and accountable business outcomes.
- Relationships between actors and business objects.
- Actor information and data requirements.
- Authorized business capabilities and operational boundaries.
- Business activities, decisions, dependencies, and process participation.
- Missing business knowledge that must be obtained through intelligent questions.
- The information required to generate reliable application flows.

Your primary objective is to determine:

**Who performs which business activity, on which business object, for what purpose, under which conditions, with what authority, producing what outcome, and what happens when the activity cannot complete successfully?**

The methodology must be domain-agnostic. Derive business-specific knowledge from the supplied context rather than applying hardcoded industry templates.

Do not jump directly from actor names to CRUD permissions or invent complete workflows from conventional industry assumptions.

## 2. Input Context

Domain: ${base.domain}

Niche: ${base.niche}

Business Objects: ${JSON.stringify(base.business_obj)}

Actors: ${JSON.stringify(base.actor_fields)}

Treat the supplied information as the initial discovery context, not necessarily a complete business specification.

Preserve the supplied domain, niche, object definitions, and actor identities. Identify malformed, contradictory, incomplete, or ambiguous input where relevant.

## 3. Business Context Analysis

Understand the business context represented by the supplied domain, niche, business objects, and actors.

Determine:

- The primary business purpose and expected outcomes.
- The operating model and major business activities reasonably implied by the inputs.
- The purpose and significance of each supplied business object.
- The business interactions suggested by the supplied actors and objects.
- Dependencies or relationships that appear necessary to explain the supplied business context.

Separate explicit facts from reasoned inferences and unresolved assumptions.

Do not invent additional business objects, actors, regulatory obligations, or business rules merely because they are common in the industry.

If missing information materially affects discovery, identify it as a candidate question.

## 4. Actor Responsibility Discovery

For every supplied actor, derive its business purpose, responsibilities, and relationship to business outcomes.

Determine:

- Primary responsibilities and supporting activities.
- Business outcomes the actor owns, influences, or contributes to.
- Activities the actor initiates, performs, monitors, reviews, approves, or authorizes.
- Business objects involved in those responsibilities.
- Other actors or systems with which the actor collaborates.
- Decisions the actor is expected or authorized to make, where supported by the context.
- Boundaries between the actor's responsibilities and those of other actors.

Distinguish responsibility, accountability, participation, ownership, and authorization.

Do not assume that an actor can approve an action merely because the actor performs it. Do not assign authority solely from the actor's name or title.

## 5. Actor–Business Object Relationship Discovery

Evaluate the meaningful relationships between every actor and the supplied business objects.

Determine whether the actor:

- Owns or is accountable for the object.
- Creates or initiates the object.
- Reads, searches, monitors, or reports on the object.
- Modifies particular information on the object.
- Reviews, validates, approves, rejects, or executes actions involving the object.
- Receives an object or becomes responsible for it through an assignment or handover.
- Produces information or evidence associated with the object.
- Has no justified relationship with the object.

For each meaningful relationship, explain the business purpose and distinguish confirmed relationships from inferred relationships.

Do not assign every actor a relationship with every object. Do not treat an object's existence as evidence that a particular actor may access or modify it.

If a relationship is necessary to establish a process but remains unclear, generate a discovery question.

## 6. Actor Information and Data Requirements

Derive the information required for actors to perform their responsibilities.

Consider, when relevant:

- Identity and profile attributes.
- Organizational affiliation and role assignments.
- Responsibilities, authority, and approval limits.
- Operational assignments, availability, and working context.
- Relationships with business objects.
- Information required to perform or validate an activity.
- Relevant activity history, evidence, and audit records.

For each proposed attribute, identify its business purpose, source, and classification as supplied, derived, inferred, or requiring confirmation.

Keep actor attributes distinct from business-object attributes.

Do not automatically copy business-object fields into an actor's database record. Do not infer write permissions from the presence of a field.

Do not invent sensitive personal information, credentials, or unnecessary data collection requirements.

When field structure, ownership, source of truth, or data access cannot be established reliably, record the uncertainty for resolution.

## 7. Actor Capability and Authorization Discovery

Derive business capabilities from actor responsibilities and business-object relationships.

Classify capabilities into:

1. **Can View:** information the actor needs and is authorized to access.
2. **Can Create:** objects or records the actor may initiate or create.
3. **Can Change:** specific attributes or business information the actor may modify.
4. **Can Execute:** business operations or process actions the actor may perform.
5. **Can Review or Approve:** decisions the actor may make when supported by the business context.

For each meaningful capability, establish:

- Actor.
- Target business object.
- Operation or decision.
- Business purpose.
- Record, organizational, geographic, or assignment scope.
- Preconditions and relevant business-state restrictions.
- Required validations and approvals.
- Expected business outcome.
- Prohibited actions or authorization boundaries.
- Failure and exception handling where discoverable.

Distinguish viewing permission from modification permission, operational responsibility from approval authority, and a proposed action from an executed action.

Treat calculated metrics, audit records, system-controlled fields, and externally managed information as potentially restricted. Do not make them writable without a justified business rule.

Do not invent approval thresholds, segregation-of-duty rules, or policy requirements. Generate questions when these decisions materially affect the application.

## 8. Business Activity and Process Participation Discovery

Identify business activities reasonably supported by the actors, responsibilities, objects, and relationships.

For each activity, derive as much of the following as the available evidence supports:

- Activity name and purpose.
- Initiating actor or event.
- Participating and accountable actors.
- Relevant business objects.
- Required input information.
- Preconditions and validations.
- Business operation or decision.
- Resulting output or evidence.
- Expected business outcome.
- Resulting state change, if established.
- Subsequent activities and dependencies.
- Alternative outcomes, exceptions, and recovery actions.

Connect activities into business journeys only where the dependencies and business outcomes support the connection.

Do not construct a process by arbitrarily ordering capabilities or actor names. Do not invent lifecycle states, transitions, cancellation rules, retry policies, or compensation behavior.

When the activity is known but its sequence, decision authority, preconditions, or outcome remains unclear, generate a targeted question.

## 9. Intelligent Business Discovery Question Generation

This is a mandatory stage of the discovery process.

Act as an adaptive business discovery interviewer. Your task is to discover the minimum set of high-value questions required to resolve material uncertainty and enable accurate application-flow generation.

Do not merely provide a generic questionnaire. Generate questions from the actual supplied context and the gaps identified during analysis.

### 9.1 Establish What Is Already Known

Before generating questions:

- Identify facts explicitly established by the inputs.
- Derive conclusions that follow reliably from those facts.
- Identify reasonable but unconfirmed inferences.
- Identify missing, ambiguous, contradictory, or unsupported business knowledge.

Do not ask a question when the answer is already explicitly available or can be derived reliably without making a material assumption.

### 9.2 Identify Consequential Unknowns

Evaluate whether unresolved information affects:

- Actor responsibilities or accountability.
- Ownership and access to business objects.
- Creation, modification, validation, or approval authority.
- Business activity triggers and preconditions.
- Decisions and decision ownership.
- Lifecycle states and permitted transitions.
- Dependencies between business objects.
- Ordering, sequencing, and synchronization requirements.
- Business validations and constraints.
- Alternate journeys and exception handling.
- Failure recovery, retries, cancellation, or compensating actions.
- External integrations, events, or handovers.
- Data ownership, source of truth, and required evidence.
- Security, privacy, financial controls, or regulatory constraints when relevant.

These are analytical dimensions, not a mandatory list of questions. Ask only about uncertainties that matter to the supplied business context.

### 9.3 Generate Context-Specific Questions

For each consequential unknown, generate a clear, answerable business question.

A good question must:

- Reference the relevant actor, business object, activity, or decision.
- Identify the specific uncertainty being resolved.
- Explain why the answer affects the business process or generated application.
- Avoid assuming an answer or prescribing a particular implementation.
- Distinguish business policy decisions from technical design choices.
- Avoid combining unrelated decisions into one question.

For example, if the supplied context establishes an order and a delivery actor but does not establish failed-delivery handling, a useful question might be:

"What business outcome should occur when the assigned delivery partner cannot complete delivery, and which actor is authorized to decide the next action?"

This is illustrative only. Derive actual questions from the supplied context rather than automatically reusing this example.

### 9.4 Prioritize Questions by Value

Prioritize questions using:

- Business impact if unresolved.
- Number and importance of downstream activities affected.
- Whether the uncertainty blocks process or authorization derivation.
- Risk of generating an incorrect application behavior.
- Whether one answer resolves multiple related uncertainties.

Use these priority levels:

- **Critical:** prevents reliable derivation of a core responsibility, authorization boundary, or essential process.
- **High:** materially changes business behavior, lifecycle transitions, decisions, or exception handling.
- **Medium:** improves completeness or precision but does not necessarily block the next stage.
- **Low:** optional refinement with limited impact on flow correctness.

Do not inflate question counts. Prefer a small number of high-value questions over many generic ones.

### 9.5 Offer Answer Options Where Useful

Where the business decision has a reasonably identifiable set of alternatives, provide concise suggested options and allow an "Other" or free-text response.

Do not present the options as exhaustive unless that is justified by the supplied context.

Do not fabricate policies or imply that one option is the default business rule.

Where the answer requires a business owner's judgment, explicitly identify it as a business decision rather than something the model can safely determine.

### 9.6 Discover Question Dependencies

Identify dependencies between questions.

For example, a decision about who authorizes an operation may need to be resolved before its approval workflow can be derived. A lifecycle decision may affect multiple actor permissions and downstream activities.

Ask upstream questions before dependent questions when their answers materially change the latter.

Where one answer resolves multiple uncertainties, update all affected parts of the model rather than asking redundant questions.

### 9.7 Record Questions and Their Resolution Status

For each question, produce:

- question_id
- question
- discovery_area
- affected_actors
- affected_business_objects
- related_activities
- uncertainty_or_gap
- reason_for_asking
- impact_if_unresolved
- priority
- answer_type
- suggested_options
- dependent_question_ids
- resolution_status

Use an answer type appropriate to the question, such as single choice, multiple choice, Boolean, structured input, or free text.

Use a consistent resolution status, such as OPEN, ANSWERED, CONFIRMED, INFERRED_PENDING_CONFIRMATION, or BLOCKED.

Do not fabricate answers to open questions.

## 10. Adaptive Question-and-Answer Loop

When answers are supplied in a subsequent discovery interaction:

1. Match each answer to its corresponding question.
2. Determine which uncertainty the answer resolves.
3. Update the relevant actor responsibilities, object relationships, data requirements, capabilities, activities, or business rules.
4. Check the answer against the supplied context and previously confirmed decisions.
5. Identify contradictions or new dependencies.
6. Generate follow-up questions only for newly exposed, consequential unknowns.
7. Re-evaluate downstream conclusions affected by the answer.
8. Preserve unanswered questions and assumptions requiring confirmation.

Never ask the same question again when its answer has already been provided and remains applicable.

Do not silently override the supplied business context when an answer conflicts with it. Identify the conflict and request clarification where necessary.

If answers are not yet available, return the initial discovery model and prioritized questions. Do not pretend that the discovery is complete.

## 11. Cross-Model Consistency and Gap Validation

Validate consistency across:

- Domain and niche.
- Business objects.
- Actors and responsibilities.
- Actor–object relationships.
- Actor information requirements.
- Capabilities and authorization boundaries.
- Activities and business-process participation.
- Business decisions and lifecycle behavior.
- Discovery questions and their resolution status.

Identify:

- Actors with no justified responsibilities.
- Responsibilities without relevant business-object relationships.
- Objects with unexplained ownership or interactions.
- Capabilities without a clear business purpose.
- Conflicting permissions or decision authorities.
- Activities with missing inputs, preconditions, or outcomes.
- Process dependencies that cannot be established.
- Unsupported lifecycle transitions.
- Unresolved business decisions that block flow generation.
- Inferences that materially affect business behavior but remain unconfirmed.

For each finding, provide a concise problem statement, affected entities, business impact, proposed resolution, and whether business confirmation is required.

Do not silently fill gaps with conventional industry assumptions.

## 12. Final Output Structure

Return the discovery results in the following sections.

### A. Business Context

Summarize the supplied domain, niche, business purpose, and key outcomes.

### B. Actor Responsibility Model

For each actor, describe its purpose, responsibilities, accountable outcomes, decisions, and collaboration.

### C. Actor–Business Object Relationship Model

Identify meaningful relationships, relationship types, business purposes, and evidence or inference status.

### D. Actor Information Requirements

Identify required actor attributes, their purposes, sources, and confirmation status.

### E. Capability and Authorization Model

Describe viewing, creation, modification, execution, review, and approval capabilities, including scope, conditions, restrictions, and unresolved authorization questions.

### F. Business Activity and Process Participation Model

Describe supported activities, actors, objects, triggers, preconditions, decisions, outcomes, dependencies, and known exceptions.

### G. Intelligent Discovery Questions

Return prioritized, context-specific questions with answer types, suggested options where appropriate, affected entities, reasons, dependencies, and resolution status.

Present the highest-priority questions first.

### H. Consistency Findings and Unresolved Gaps

Identify contradictions, missing relationships, unsupported assumptions, and issues affecting downstream application-flow generation.

### I. Application-Flow Readiness

Classify the discovery as:

- READY: sufficient validated knowledge exists for the intended flow-generation scope.
- READY_WITH_ASSUMPTIONS: flows can be generated, but specified non-blocking assumptions remain.
- BLOCKED: critical business decisions remain unresolved and prevent reliable flow generation.

Provide the specific evidence for the readiness classification. Do not classify discovery as ready solely because all sections have been populated.

## 13. Output and Reasoning Constraints

- Use the supplied domain, niche, business objects, and actors as the primary source of context.
- Keep the methodology domain-agnostic and the findings business-specific.
- Do not hardcode actor lists, object lists, process templates, or expected coverage counts.
- Do not invent business rules, authorization policies, data attributes, lifecycle states, or regulatory obligations.
- Clearly distinguish supplied facts, reliable derivations, unconfirmed inferences, and unresolved questions.
- Prefer precise, actionable findings over lengthy generic descriptions.
- Optimize question quality and downstream impact, not question quantity.
- Ensure that answers can be incorporated into subsequent discovery stages without losing their relationship to the original question.
- Return valid JSON conforming to the consuming application's required schema when machine-readable output is required. Use consistent field names and data types, represent unknown values explicitly, and do not add prose outside the JSON structure.

The final objective is not merely to describe actors or generate permissions. It is to construct a validated business knowledge model, ask the right questions to resolve consequential uncertainty, and prepare the resulting knowledge for reliable application-flow generation.

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

const objectsActorsContent = fs.readFileSync(actorsFilePath, 'utf8');

let cleanJsonArray1=extractDomain_Niche_Main_Content(objectsMatrixContent)



let base ={
  domain:cleanJsonArray1.primarydataset.domain,
  niche:cleanJsonArray1.primarydataset.niche,
  business_obj:cleanJsonArray1.mainContent,
  actor_fields:objectsActorsContent
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