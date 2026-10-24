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
const pass1Prompt = `
# OBJECTIVE

Generate a business-specific Actor Responsibility and Authorization Model using the supplied domain:${base.domain}, niche:${base.niche}, and complete business discovery output:${JSON.stringify(base.business_obj)}

Discover the participants relevant to the business, their operational roles and responsibilities, their relationships with business objects, their permitted actions, and the conditions governing their authority.

The reasoning method must remain domain-agnostic. Derive the business content from the supplied evidence rather than imposing a predefined industry structure.

# INPUTS

1. Domain: the supplied business domain.
2. Niche: the specific business context within that domain.
3. First-stage business discovery output: the complete discovered business operating model, participants, lifecycle, business objects, dependencies, alternative operating models, assumptions, unresolved dependencies, and evidence gaps, supplied as a JSON-formatted string.

The supplied first-stage business discovery output is JSON. Parse and interpret its actual structure, including nested objects, arrays, properties, values, and relationships. Use its contents as the primary evidence throughout all 11 reasoning steps. Preserve the distinction between source-supported facts, inferences, conditional conclusions, and unknowns. Do not assume a predefined input structure beyond the supplied JSON or treat missing information as established fact.

Treat these inputs as the primary evidence for understanding the business. Do not silently replace, reinterpret, or supplement them with unsupported assumptions.

# 1. DISCOVER BUSINESS PARTICIPANTS

Analyze how the supplied business operates and identify the participants relevant to establishing, enabling, executing, supporting, governing, or benefiting from its activities.

Determine:

- Which people, organizations, groups, external parties, or other participating entities are involved.
- What business purpose each participant serves.
- Which outcomes or activities depend on their participation.
- Which participants are explicitly identified, reasonably inferred, conditional on a particular operating model, or not yet established.
- Whether apparently different participants represent distinct responsibilities or equivalent roles that can be consolidated.

Discover participants from the supplied business context. Do not require predefined actor categories or assume that every business contains the same types of participants.

# 2. DERIVE OPERATIONAL ROLES AND RESPONSIBILITIES

For each discovered participant, determine its operational role and the responsibilities justified by the business context.

Establish:

- What the participant contributes to the business.
- Which outcomes it is responsible for achieving or supporting.
- Which activities, decisions, or interactions it performs.
- What inputs, outputs, dependencies, and handoffs are associated with its responsibilities.
- Whether responsibilities overlap, conflict, remain unassigned, or depend on an unresolved business decision.

Distinguish responsibility for an outcome from participation in an activity and authority to perform a particular action.

Do not generate generic job descriptions. Explain each actor's role in terms of the actual business being discovered.

# 3. DISCOVER ACTOR–BUSINESS-OBJECT RELATIONSHIPS

Use the supplied business-object catalogue and its relationships to determine how each participant interacts with the discovered business objects.

For each relevant relationship, determine:

- Why the participant needs to interact with the object.
- Whether the participant establishes, owns, maintains, uses, influences, approves, transfers, monitors, or concludes the object or its lifecycle.
- Which business activities require that interaction.
- Whether the relationship is essential, conditional, inferred, or uncertain.
- Whether a required actor–object relationship is missing or unsupported.

Do not equate interaction with ownership or assume that responsibility automatically grants unrestricted access.

Use the supplied object names consistently. If another object appears necessary, identify it as a proposed discovery gap rather than silently treating it as an established object.

# 4. DERIVE INFORMATION ACCESS AND SCOPE

Determine what information each participant needs to access to fulfil its established or inferred responsibilities.

For every proposed access permission, consider:

- The business purpose for accessing the information.
- The relevant object, information, or attributes.
- The scope justified by the participant's relationship to the business.
- Any supported restrictions arising from ownership, assignment, organizational relationships, confidentiality, or other relevant business conditions.
- Whether access to the entire object is necessary or a narrower scope would fulfil the same responsibility.
- Whether a proposed restriction is supported by evidence or requires confirmation.

Populate \`What_They_Can_See\` with meaningful, business-specific access descriptions.

Do not assume that every business requires the same access boundaries, information categories, or privacy controls. Identify applicable restrictions from the supplied context and distinguish unconfirmed policies from established requirements.

# 5. DERIVE CREATION, MODIFICATION, AND REMOVAL AUTHORITY

Determine which business objects or attributes each participant may create, change, remove, cancel, revoke, deactivate, or otherwise conclude.

For each relevant action, establish:

- The business purpose of the action.
- The participant's justification for performing it.
- The object or information affected.
- Any prerequisites or applicable conditions.
- The permitted scope of change.
- Any dependency on another participant, decision, or business state.
- Whether the action is supported, inferred, conditional, or unresolved.

Populate \`What_They_Can_Create\`, \`What_They_Can_Change\`, and \`What_They_Can_Remove\` with the actions justified by this analysis.

Interpret removal according to the business meaning of the object and action. Do not automatically equate removal with permanent deletion.

Do not assume every object supports every action or that every participant requires create, change, and removal permissions.

# 6. DERIVE EXECUTABLE BUSINESS OPERATIONS

Identify the meaningful business operations each participant may initiate or execute, using the discovered operating model, lifecycle, responsibilities, and object relationships.

For each operation, determine:

- What the operation accomplishes.
- Why the participant is authorized or reasonably inferred to perform it.
- What conditions or dependencies govern execution.
- What inputs and business objects are involved.
- What outcomes or changes may result.
- Whether another participant's involvement or a decision is required.
- Whether the operation is established, inferred, conditional, or unresolved.

Populate \`Operations_They_Can_Run\` with business operations rather than merely renaming object-level create, change, or removal actions.

Do not assume that every business uses the same operations or that a participant's responsibility automatically authorizes every action associated with that responsibility.

# 7. DERIVE AUTHORIZATION BOUNDARIES AND GUARDRAILS

Determine which conditions limit or govern each participant's authority, based on the supplied business context and the evidence available.

Investigate whichever constraints are relevant to the particular business, including potential limits associated with responsibilities, relationships, object states, delegated authority, decision rights, or conflicting actions.

For each proposed guardrail, determine:

- What action or circumstance it governs.
- Why the restriction or condition is relevant.
- Which participant, object, activity, or business outcome it affects.
- Whether it is explicitly established, reasonably inferred, conditional, or unknown.
- What evidence or policy decision would be needed to confirm it.

Where relevant, distinguish restrictions governing business behaviour from restrictions governing access to information or execution authority.

Populate \`Business_Rules_And_Guardrails\` with meaningful, business-specific rules and restrictions. Use the agreed categories where applicable, without assuming that every category must contain a rule.

Do not invent universal approval requirements, separation-of-duty rules, legal obligations, regulatory controls, or technical security policies merely because they are common elsewhere.

# 8. ANALYZE LIFECYCLE CHANGES AND EXCEPTIONS

Evaluate participant responsibilities and permissions in the context of the lifecycle and transitions discovered in the first-stage output.

Determine how the relevant responsibilities, object relationships, and authorized actions may differ as the business progresses through its lifecycle.

Investigate exceptions and alternative paths that are meaningful to the discovered business, including any supported interruption, rejection, failure, recovery, cancellation, reversal, dispute, or post-completion activity.

For each relevant path, determine:

- Which participant detects, initiates, handles, or resolves it.
- Which objects, activities, or relationships are affected.
- What actions or authority changes are required.
- Whether responsibility transfers between participants.
- Whether a missing path creates a material uncertainty in the actor model.

Do not force predefined exception types or lifecycle stages into the model. Derive relevant scenarios from the supplied business evidence and identify important undiscovered paths as gaps.

# 9. EVALUATE ALTERNATIVE OPERATING MODELS

Use the alternative operating models and unresolved business decisions in the first-stage output to determine how actor discovery and authorization may change.

Identify:

- Which participants or responsibilities differ between alternatives.
- Which actor–object relationships or permissions are affected.
- Which responsibilities may transfer, disappear, or become necessary.
- Which constraints remain applicable across the alternatives.
- Which permissions depend on a business-model choice that has not yet been confirmed.

Where an alternative has not been established as the selected model, represent its implications as conditional rather than applying them unconditionally to the primary actor model.

Do not invent alternative operating models simply to increase output coverage. Introduce additional alternatives only when supported by the supplied context or clearly identified as proposals requiring validation.

# 10. VALIDATE BUSINESS COHERENCE AND COVERAGE

Validate the proposed actor model against the supplied domain, niche, operating model, lifecycle, business objects, dependencies, and identified uncertainties.

Check whether:

- Every actor has a meaningful business justification.
- Every responsibility relates to the discovered business or is explicitly identified as an inference.
- Every material permission has a justified relationship to a responsibility, object interaction, operation, or established policy.
- Referenced business objects match the supplied object names or are explicitly identified as proposed additions.
- Permissions and operations are consistent with relevant lifecycle conditions and dependencies.
- Responsibilities are adequately assigned, with meaningful gaps and overlaps identified.
- Relevant exceptions and post-completion responsibilities have been considered.
- Conditional operating models have not been confused with the selected or established model.
- Unsupported assumptions have not been presented as confirmed facts.
- Unresolved questions affecting authorization remain visible.

Distinguish a missing item that materially undermines the actor model from an optional refinement that can be addressed later.

Do not claim exhaustive coverage or correctness when the supplied evidence is insufficient.

# 11. CLASSIFY EVIDENCE, INFERENCES, CONDITIONS, AND UNKNOWNS

For each material actor, responsibility, permission, operation, or guardrail, distinguish the strength and nature of its supporting evidence.

Use the following evidence classifications consistently:

**Source-supported**

The supplied domain context or discovery output explicitly establishes the relevant fact, participant, responsibility, relationship, action, or policy.

**Inferred**

The conclusion is a reasoned deduction from the supplied business context, but is not explicitly established by the source. Record the reasoning or basis for the inference where useful.

**Conditional**

The conclusion applies only if a particular business condition, operating model, relationship, or unresolved decision is true. Identify the condition.

**Unknown**

The supplied evidence is insufficient to determine the correct conclusion. State what information or business decision is needed, where material.

Apply these classifications to the substance of the finding, not merely to the actor as a whole. One actor may have source-supported responsibilities, inferred permissions, conditional capabilities, and unresolved guardrails.

Do not interpret model confidence as proof. Do not invent supporting evidence, and do not upgrade an inference to a confirmed fact merely because it appears reasonable.

Keep evidence annotations concise and traceable to the supplied inputs. Distinguish facts stated in the input from conclusions derived by the model.

# OUTPUT CONTRACT

Return the agreed actor JSON array using the existing schema:

- \`actor_name\`
- \`operational_role\`
- \`core_responsibilities\`
- \`access_authorization_and_scope\`
  - \`What_They_Can_See\`
  - \`What_They_Can_Create\`
  - \`What_They_Can_Change\`
  - \`What_They_Can_Remove\`
  - \`Operations_They_Can_Run\`
  - \`Business_Rules_And_Guardrails\`
- \`evidence_and_assumptions\`

Within \`evidence_and_assumptions\`, preserve the evidence classifications \`source_supported\`, \`inferred\`, \`conditional\`, and \`unknown\`.

Keep the agreed field names and value types stable. Do not create industry-specific schema fields or add new top-level sections without authorization.

Use the established JSON structure to represent the discovered business, not to dictate what the business must contain. Empty arrays are acceptable where no entries are justified. Do not fabricate permissions or guardrails to populate empty categories.

Return valid JSON only, without Markdown fences, comments, or explanatory prose outside the JSON.

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