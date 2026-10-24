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


const pass1Prompt = `
# OBJECTIVE

Generate a domain-agnostic, business-specific Actor Responsibility and Authorization Model using the supplied domain :${base.domain}, niche ${base.niche}, and complete business discovery output:${JSON.stringify(base.business_obj)}.

The output must identify the actors needed to operate the discovered business, explain their responsibilities, and derive their access permissions, business operations, and authorization boundaries from the supplied evidence.

# INPUTS

1. Domain: the supplied domain configuration.
2. Niche: the supplied niche configuration.
3. Business discovery output: the complete first-stage JSON, including the business operating model, participants, derived lifecycle, business objects, dependencies, alternative operating models, assumptions, unresolved dependencies, and evidence gaps.

Treat the supplied discovery output as the primary source of business context. Do not silently replace it with a generic industry template.

# REASONING INSTRUCTIONS

## 1. Understand the operating model

Determine how the business creates value, who participates, what outcomes it produces, and how its lifecycle operates.

Use the supplied business objects, dependencies, lifecycle stages, and alternative models to establish the context in which actors perform their responsibilities.

Identify missing or uncertain business context that materially affects actor discovery or authorization.

## 2. Discover actors from business necessity

Identify the people, organizations, teams, external parties, governing authorities, or automated participants required by the discovered operating model.

For each candidate actor, determine:

- Why the actor is needed.
- What business outcome the actor supports.
- Whether the actor initiates, performs, approves, governs, monitors, funds, receives, or audits business activities.
- Which lifecycle stages and activities involve the actor.
- Whether the actor is source-supported, reasonably inferred, conditional on an alternative model, or uncertain.

Do not assume every domain requires a customer, merchant, finance team, administrator, or any other predefined role.

Merge duplicate roles where their responsibilities and authority are materially equivalent. Preserve distinct roles where accountability or authorization boundaries differ.

## 3. Derive responsibilities and accountability

For every actor, establish its operational role and meaningful core responsibilities.

Identify the actor's expected inputs, outputs, decisions, handoffs, dependencies, and accountability.

Distinguish responsibility for an outcome from permission to perform an action. Identify responsibilities without a suitable owner, duplicated accountability, and potential conflicts between execution, approval, and audit.

## 4. Map actors to business objects

Use the discovered business-object catalogue as the primary basis for object-level permissions.

For each actor-object relationship, determine whether the actor:

- Owns or establishes the object.
- Uses or reads the object.
- Creates or modifies the object.
- Approves, executes, or concludes an operation involving the object.
- Transfers responsibility for the object.
- Monitors or audits the object.

Explain the business reason for each material permission.

Do not invent new business objects merely to fill permission categories. If an additional object appears necessary, identify it as a proposed discovery gap rather than silently treating it as established.

## 5. Derive access scope

Determine which business objects and information each actor must see to perform its responsibilities.

Consider relevant business boundaries such as ownership, assignment, organization, geography, case, transaction, relationship, or delegated responsibility.

Determine whether access should cover the complete object or only selected attributes.

Identify restrictions relating to confidentiality, sensitive information, information minimization, and authorized disclosure where relevant.

Do not assert specific legal, regulatory, technical, or security requirements as confirmed facts unless the supplied evidence establishes them. Mark recommendations and unresolved policy decisions accordingly.

## 6. Derive create, change, and removal permissions

Determine what each actor may create, change, remove, cancel, revoke, deactivate, or otherwise conclude.

For each material permission, establish:

- The business purpose.
- The object or information affected.
- The permitted attributes or state transitions.
- Relevant prerequisites and restrictions.
- Whether approval, delegation, or another actor's participation is required.

Distinguish deletion from cancellation, revocation, deactivation, and removal of a relationship.

Do not assume every actor needs every CRUD operation or that every business object is directly deletable.

## 7. Derive executable business operations

Identify the meaningful business operations each actor is authorized to initiate or execute.

For each operation, consider its trigger, prerequisites, required objects, expected outcome, resulting state changes, and applicable approval requirements.

Operations must reflect actual business activities and responsibilities. Do not merely rename CRUD operations as business commands.

## 8. Establish authorization boundaries and guardrails

Determine the limits of each actor's authority using the supplied responsibilities, business objects, lifecycle states, and established policies.

Consider:

- Ownership and assignment boundaries.
- State-dependent restrictions.
- Approval and delegation requirements.
- Separation of duties for consequential actions.
- Conflicts between initiating, approving, executing, and auditing an action.
- Exceptional or elevated access where justified.
- Restrictions on changing finalized, committed, or closed business records.

Distinguish established business rules, established security policies, recommended controls, and unresolved policy decisions.

Do not invent blanket restrictions merely because they are common in other industries.

## 9. Reason across the complete lifecycle

Evaluate the actor model across normal execution and relevant alternative paths.

Consider initiation, validation, approval, execution, handoffs, failure, rejection, cancellation, recovery, dispute resolution, reversal, completion, and post-completion obligations where applicable to the discovered business.

Determine who detects, handles, approves, and resolves exceptions; which objects are affected; and whether responsibilities or permissions change as the lifecycle progresses.

Do not force irrelevant exception types into the business model. Record materially important but undiscovered paths as gaps.

## 10. Adapt to alternative operating models

Use the alternative operating models identified in the discovery output to determine which actors, responsibilities, permissions, and guardrails change.

Identify roles that are essential, conditional, replaced, or unnecessary under each supported alternative.

Preserve permissions that remain valid across alternatives and identify those dependent on an unresolved operating-model decision.

Do not select an alternative model without supporting evidence.

## 11. Validate evidence and completeness

Before producing the output, check that:

- Each actor has a meaningful business justification.
- Each responsibility relates to the discovered operating model or is explicitly identified as an inference.
- Each material permission is justified by an actor responsibility, business operation, or established policy.
- Referenced business objects match the supplied object names or are explicitly marked as proposed.
- Operations and permissions are consistent with lifecycle states and dependencies.
- Approval and execution boundaries are coherent.
- Relevant exceptions and post-completion responsibilities have been considered.
- No unsupported assumption is presented as a confirmed business fact.
- Missing actors, unowned responsibilities, unjustified permissions, and unresolved authorization decisions are identified.

Do not claim complete coverage where evidence is insufficient.

# EVIDENCE CLASSIFICATION

Distinguish:

- Source-supported: directly supported by supplied business discovery evidence.
- Inferred: a reasoned conclusion derived from the supplied business context but not directly established.
- Conditional: applicable only under a specified operating model or business condition.
- Unknown: insufficient evidence to determine the correct actor, permission, or policy.

Do not assign false precision to confidence scores or treat model confidence as proof.

# OUTPUT REQUIREMENTS

Return the requested actor JSON array using the agreed schema:

- actor_name
- operational_role
- core_responsibilities
- access_authorization_and_scope
  - What_They_Can_See
  - What_They_Can_Create
  - What_They_Can_Change
  - What_They_Can_Remove
  - Operations_They_Can_Run
  - Business_Rules_And_Guardrails
- evidence_and_assumptions

Retain the agreed key names and value types. Do not add unrelated top-level sections or change the schema without authorization.

Within Business_Rules_And_Guardrails, distinguish data privacy, state and transition constraints, and authorization boundaries where applicable. Clearly label proposed controls and unresolved policies rather than presenting them as established rules.

Within evidence_and_assumptions, distinguish source-supported information, inferences, conditional findings, and unknowns.

All actors, responsibilities, permissions, operations, and rules must be specific to the supplied domain, niche, and discovered operating model. The reasoning method must remain domain-agnostic.

Return valid JSON only. Do not include Markdown fences, explanatory prose, or comments outside the JSON. Use empty arrays when a category has no supported entries rather than inventing permissions.

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