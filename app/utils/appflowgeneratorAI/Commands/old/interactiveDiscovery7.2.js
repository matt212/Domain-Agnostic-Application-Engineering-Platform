/**
 * ============================================================================
 * SECTION 1: CORE DEPENDENCIES, IMPORTS & SYSTEM CONFIGURATION
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

let CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '7.2. RAW Gaps Finding-'
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
    STAGE_1_OBJECTS: "1-Final-Objects-",
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
const knownIssues = [
  "each step alternate hit is always apply cache profile defaults",
  "on multiple hard fail reverse system allocation state",
  "on soft fail state discrepancy trigger auto-remediation loop"
];



// Pre-extract target nodes using your native Node.js script








const pass1Prompt = `
You are an expert, autonomous, domain-agnostic Business Process Gap Auditor.

Your task is to discover all distinct, materially actionable gaps in the supplied end-to-end business process. Base your conclusions on the complete input evidence, graph structure, and defensible business reasoning.

Do not assume that a larger or more complex process necessarily contains a defect. Do not assume that an empty findings array is correct until the available process has been systematically examined.

==================== CONTEXT ====================

Domain: ${CONFIG.DOMAIN_CONTEXT.NAME}
Niche: ${CONFIG.DOMAIN_CONTEXT.NICHE}

Business Objects:
${JSON.stringify(base.business_obj)}

Actor / Role / Responsibility / Authorisation Matrix:
${JSON.stringify(base.actors_resp)}

Actor Journeys:
${JSON.stringify(base.actorsjourney)}

Mermaid Process Graph:
${base.topologyGraphContent}

==================== OBJECTIVE ====================

Identify all distinct, materially actionable gaps in the supplied process.

For every accepted finding:
1. Locate the gap in the actual graph or identify a genuinely missing requirement or transition.
2. Establish the current behaviour using the supplied evidence.
3. Explain why the behaviour is defective or why a material business decision remains unresolved.
4. Check whether existing activities, branches, or reachable paths already satisfy the requirement.
5. Propose the smallest complete correction.
6. Show a connected path from the affected activity or decision to the relevant downstream activity or outcome.

Use actual activity labels, supported roles, and dynamically derived conditions. Never invent existing graph elements, policies, actors, permissions, or destinations.

==================== 1. UNDERSTAND THE INPUTS ====================

Analyse the business objects, actor responsibilities and authorisations, actor journeys, and Mermaid process graph together.

Derive the process understanding from the current inputs. Do not assume that any particular domain, actor, business object, lifecycle, or workflow applies universally.

Identify the business purpose, activities, dependencies, prerequisites, decisions, conditions, handoffs, object states, state changes, transitions, and outcomes that are actually supported by the evidence.

Parse and inspect the supplied graph as a directed process structure:
- Identify its actual nodes and exact node IDs and labels.
- Identify its actual directed edges, source and destination nodes, edge labels, and conditions.
- Examine incoming and outgoing connections, reachable paths, decision branches, alternative routes, retries, exception paths, and terminal outcomes where present.
- Distinguish control flow from data relationships.
- Distinguish activity initiation from successful completion.
- Distinguish object creation from subsequent state changes.
- Distinguish a handoff from confirmed acceptance or completion.
- Distinguish document generation from execution or physical verification.

Cross-check relevant graph behaviour against the supplied business objects, actor matrix, and actor journeys.

A missing direct edge or separately named activity is not automatically a defect. An existing reachable path may already satisfy the business requirement.

==================== 2. TRACE AND VALIDATE PROCESS GAPS ====================

Evaluate the complete supplied process systematically. Do not stop after the first few candidates or focus exclusively on conspicuous nodes.

For each candidate gap, establish:

LOCATION:
Identify the exact existing source step, affected edge or genuinely missing transition, and relevant downstream step or outcome.

CURRENT BEHAVIOUR:
Determine what the supplied graph actually does, including its conditions, destinations, alternative branches, and existing recovery handling.

EXPECTED BEHAVIOUR:
Derive the required behaviour from supplied evidence and defensible reasoning about the stated business context. Separate established requirements from assumptions.

DEFECT OR UNCERTAINTY:
Identify the specific missing, incorrect, contradictory, misordered, uncontrolled, or unresolved behaviour.

BUSINESS CONSEQUENCE:
Explain the plausible material consequence, or state the precise business decision that remains unresolved.

CORRECTION:
Propose the smallest complete correction that addresses the finding and preserves valid downstream processing.

Verify every existing node ID, label, step number, edge direction, edge condition, destination, actor, and path against the supplied inputs. Never fabricate a source reference.

Before reporting a missing activity, transition, responsibility, or control, check whether it is already fulfilled elsewhere in the connected process.

Internally distinguish:
- CONFIRMED: Evidence establishes an actual process defect.
- POTENTIAL: A plausible material gap exists, but necessary evidence is missing.
- AMBIGUOUS: Multiple materially different interpretations remain possible and a business decision is needed.

Report confirmed defects directly. Describe potential gaps cautiously. For material ambiguities, state the unresolved decision rather than inventing a policy.

Do not report unsupported speculation, duplicated findings, optional enhancements as mandatory controls, or requirements already satisfied by existing paths.

Continue evaluating other process areas when a candidate is rejected.

==================== 3. EVIDENCE AND DOMAIN VALIDATION ====================

Evaluate findings using three distinct sources of reasoning:

A. SUPPLIED EVIDENCE
Use the actual business-object definitions, actor responsibilities and authorisations, journeys, and process topology provided in this request.

B. AVAILABLE EXTERNAL REFERENCES
Use an industry standard, regulation, or external reference only if its relevant requirements are actually available to the auditing process. Verify applicability and scope before using it to establish a defect.

C. DOMAIN AND NICHE REASONING
Use defensible reasoning about necessary business behaviour for the specified context, such as prerequisites, operational handoffs, decision conditions, lifecycle consistency, failure handling, and completion outcomes where applicable.

Keep these sources distinct. Never invent citations, external research, standards, regulations, or organisational policies. Do not claim that a particular standard mandates a control unless its applicable requirement is available in the evidence.

A plausible domain concern is not automatically a proven policy violation. The absence of a requirement from the supplied inputs does not, by itself, prove a defect.

Distinguish necessary business behaviour from optional practices and organisation-specific policy. If a material rule, responsibility, condition, or outcome cannot be established, identify the precise decision requiring business review.

All actors, objects, activities, conditions, policies, and outcomes must be derived from the current inputs or explicitly marked as proposed.

==================== 4. CHECK REDUNDANCY AND CONTROL PURPOSE ====================

Do not recommend removing, skipping, merging, or bypassing an activity merely because a similar activity occurs elsewhere.

Before asserting that two activities or checks are redundant, determine whether they have equivalent:
- Business purpose and validation requirement.
- Object and scope, including relevant items, quantities, and state.
- Timing and validity requirements.
- Completion guarantee and evidence produced.
- Preconditions and downstream decision requirements.

Consider whether intervening activities, amendments, failures, external events, expiry, or state changes can invalidate an earlier result.

Distinguish activities by what they actually establish, not just by similar names.

Reuse an earlier result only when the supplied evidence establishes that it satisfies the later requirement and remains valid.

If equivalence cannot be established, do not claim redundancy. Identify the missing evidence or unresolved business decision.

Do not invent state fields, persistence guarantees, expiry rules, events, or validation outcomes to justify a conclusion.

==================== 5. CONNECTED REMEDIATION ====================

Every proposed flow must fix the specific identified gap and show how processing continues through the relevant connected path.

Prefer correcting an existing condition, edge, ordering, responsibility, or decision when sufficient. Add an activity only when necessary. Reuse verified existing nodes and destinations. Avoid duplicating functionality or redesigning unrelated process areas.

For a missing transition, identify the actual source, the missing connection or condition, and the intended destination where supported.

For incorrect routing, identify the actual source, applicable branch condition, incorrect destination, and supported corrected destination or explicitly proposed outcome.

For a missing activity or control, place the necessary activity at the appropriate point and connect it to the relevant downstream step.

For a lifecycle gap, show the affected activity or state, required transition or decision, and subsequent supported path.

Every newly proposed activity or outcome must be marked "PROPOSED:".

Never invent an existing node ID, step number, actor, permission, edge, condition, policy, or destination. Distinguish human-performed activities from system-performed actions.

Use existing actor names and responsibilities only when supported. If ownership or authorisation is unknown, use ROLE_UNMAPPED or explicitly mark the responsibility as proposed for business review.

Avoid vague remedies such as "validate", "handle exception", "fix the process", or "resolve discrepancy". State the necessary business action, condition, responsibility, and next step as far as the evidence permits.

A proposed flow must be logically connected, not a list of unrelated activities.

==================== 6. CONDITIONAL ROUTING ====================

Determine dynamically whether a correction requires conditional routing.

Use IF/ELSE when materially different business conditions require different actions or outcomes. Do not force branching where no meaningful alternative exists.

For each necessary branch:
- Derive the condition from supplied evidence and defensible domain reasoning.
- State the action or outcome for each relevant branch.
- Use supported actors or mark unresolved ownership explicitly.
- Reuse existing activities and destinations when their purpose is established.
- Mark new activities and outcomes "PROPOSED:".
- Preserve valid prerequisites, branch reachability, and downstream processing.

If a required condition depends on unknown business policy, identify the unresolved decision and preserve the possible alternatives without guessing which applies.

If a necessary destination is absent from the graph, mark the proposed outcome "PROPOSED:". Never describe it as an existing step.

Do not assume that success or failure necessarily leads to a refund, claim, reversal, cancellation, compensation, or any other particular outcome. Establish the applicable requirement from evidence or identify the business decision needed.

==================== 7. ACTOR AND AUTHORISATION VALIDATION ====================

Check relevant activities against the supplied actor, responsibility, and authorisation matrix.

Identify materially missing ownership, unsupported authority, conflicting responsibilities, or human/system handoff gaps only when supported by evidence.

Do not infer that an actor is authorised simply because the actor performs an activity in the graph. Do not invent permissions or introduce a new actor as though that actor already exists.

When ownership or authorisation remains unresolved, identify the precise decision required. Use ROLE_UNMAPPED or a clearly marked proposed responsibility in the proposed flow.

==================== 8. SYSTEMATIC COVERAGE ====================

Before finalising findings, examine the supplied evidence for all applicable categories:

1. Actor journeys and their corresponding graph paths.
2. Decision nodes and outgoing conditions or branches.
3. Directed connections between consecutive activities.
4. Business-object creation, state changes, handoffs, completion, and terminal outcomes.
5. Prerequisites and activity ordering.
6. Actor ownership, authorisation, and operational handoffs.
7. Failures, rejection, retries, recovery, and exception paths.
8. Contradictions between business objects, actor responsibilities, journeys, and graph topology.
9. Applicable reference requirements and defensible domain/niche requirements.
10. Existing activities or alternate paths that may already satisfy an apparent requirement.

These categories are generic audit dimensions, not assumptions that every process must contain every type of activity or branch.

For each applicable area, inspect the relevant supplied evidence, evaluate plausible gaps, and verify existing paths before accepting or rejecting a candidate.

Do not invent defects to satisfy the coverage list. Do not impose a fixed finding count.

Do not silently treat an unassessed requirement as satisfied. An uncertainty is reportable only when it constitutes a material, actionable process ambiguity.

If the input is truncated, incomplete, or unusable, do not claim that the full process was audited or that the absence of findings establishes completeness.

==================== 9. FINAL FINDING VERIFICATION ====================

Every accepted finding must be distinct, actionable, evidence-grounded, and internally consistent.

PROBLEM:
- Identify the precise affected activity, connection, missing transition, or material unresolved requirement.
- Use actual step numbers and activity labels when available.
- Identify both endpoints of a connection defect when supported.
- State the specific defect and material consequence or unresolved decision.
- Do not invent source references or make unsupported claims.
- Maximum 25 words.

PROPOSED FLOW:
- Start from the affected existing activity or decision where appropriate.
- Show the connected correction through to the relevant downstream activity or outcome.
- Use actual activity labels and supported roles.
- Include conditional branches only when materially justified.
- Mark new activities and outcomes "PROPOSED:".
- Use ROLE_UNMAPPED or proposed responsibility when ownership is unknown.
- State any necessary unresolved business decision.
- Do not claim redundancy without establishing equivalence.
- Maximum 60 words.

Before accepting a finding, verify:
1. Its location is grounded in the supplied graph or is genuinely missing.
2. Its defect follows from evidence and defensible business reasoning.
3. Existing reachable activities or branches do not already resolve it.
4. Any industry-standard claim is supported by an applicable available reference.
5. Its proposed flow resolves the actual gap and preserves valid downstream and exception processing.
6. Actors, conditions, destinations, and outcomes are supported or explicitly marked as proposed.
7. It is distinct from other accepted findings.

Report every distinct actionable finding that survives verification. Do not invent findings to increase the count, and do not impose an arbitrary finding-count limit.

==================== 10. STRICT OUTPUT CONTRACT ====================

Return valid JSON only. Do not return Markdown fences, comments, or explanatory text.

Use exactly this structure:

{
  "findings": [
    {
      "problem": "Maximum 25 words",
      "proposed_flow": "Maximum 60 words"
    }
  ]
}

Rules:
- The findings array may contain zero or more accepted findings.
- Each finding must contain only the string fields "problem" and "proposed_flow".
- Do not add evidence, classification, confidence, severity, citations, or other fields.
- Do not make unsupported claims that a particular industry standard has been violated.
- Escape JSON strings correctly.
- Do not include trailing commas.
- Return an empty findings array only if no actionable gap survives evaluation of the usable supplied evidence.

Audit the complete supplied process now.
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
const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');
const topologyGraphContent = fs.readFileSync(topologyFilePath, 'utf8');

// Isolated string chunk safely extracted from matrix file metadata headers to prevent crash
const interimSegments = objectsMatrixContent.split('===');
const targetMetadataStr = interimSegments[1] ;

//const match = targetMetadataStr.match(/domain\s*:\s*(?<domain>.*?)\s*and\s*niche\s*:\s*(?<niche>.*?)\s*\$/m);
const match = targetMetadataStr.match(/domain\s*:\s*(?<domain>.*?)\s*and\s*niche\s*:\s*(?<niche>.*?)\s*$/);

if (match) {
  CONFIG.DOMAIN_CONTEXT = {
    NAME: match.groups.domain.trim(),
    NICHE: match.groups.niche.trim()
  };
} 

const cleanJsonArray1 = JSON.parse(objectsMatrixContent.slice(objectsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray2 = JSON.parse(actorsMatrixContent.slice(actorsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray3 = JSON.parse(  JSON.stringify(journeysMatrixContent.slice(journeysMatrixContent.lastIndexOf('===') + 3).trim()), null, 2) ;


let base ={
  business_obj:cleanJsonArray1,
  actors_resp:cleanJsonArray2,
  actorsjourney:cleanJsonArray3,
  topologyGraphContent:topologyGraphContent,
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
  let base = {
    a: targetSavedPath,
}
  loadclean(base);
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

function loadclean(base) {
        let CONFIG1 = {
            PATHS: {
                PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
                OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
            }
        }
    
        function extractAfterLastAssistant(rawContent) {
            const marker = "Assistant:";
            const lastIndex = rawContent.lastIndexOf(marker);
            // If the marker isn't found at all, return an empty string or handle gracefully
            if (lastIndex === -1) {
                return "";
            }
            // Slice everything after the marker index + the length of "Assistant:"
            return rawContent.slice(lastIndex + marker.length).trim();
        }
        const extract = (filePath) => {
            const raw = fs.readFileSync(filePath, 'utf8');
            return raw.trim();
        };
        const objectsData = extract(base.a);
        let interim = JSON.parse(extractAfterLastAssistant(objectsData))
        //console.log(interim)
        
        
        console.log(interim);
        const now = new Date();
        // 1. Extract date components (DD-MM-YY)
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).slice(-2);
        // 2. Extract 12-hour time components (HH:MMam/pm)
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12; // Formats 0 to 12
        const formattedHours = String(hours).padStart(2, '0');
        // 3. Assemble with dashes and colons intact
        const timestamp = `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;
        // Result Example: "13-10-26_07:57pm"
        const outputFileName = `7.2_Final_Gaps_Finding_${timestamp}.md`;
        const OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
        const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
        // 7. Commit write configuration array output directly onto physical hardware disk
        fs.writeFileSync(outputFilePath, JSON.stringify(interim, null, 2), 'utf8');
    }

function getmermaidcontent() {
    let CONFIG1 = {
        PATHS: {
            PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
            OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
        }
    }
    let STAGE_4_TOPOLOGY = CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY;
    
    let OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
    let outputFilePath = path.join(OUTPUT_DIR + "/baseline/", STAGE_4_TOPOLOGY+".md");
    console.log(outputFilePath)
    let objectsMatrixContent = fs.readFileSync(outputFilePath, 'utf8');
    //console.log(objectsMatrixContent)
   return extractcontent(objectsMatrixContent)
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



