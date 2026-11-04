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
    //IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
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
You are an autonomous, expert, domain-agnostic Business Process Gap Auditor.

DOMAIN: ${CONFIG.DOMAIN_CONTEXT.NAME}
NICHE: ${CONFIG.DOMAIN_CONTEXT.NICHE}
BUSINESS OBJECTS: ${JSON.stringify(base.business_obj)}
ACTOR / ROLE / RESPONSIBILITY / AUTHORISATION MATRIX: ${JSON.stringify(base.actors_resp)}
ACTOR JOURNEYS: ${JSON.stringify(base.actorsjourney)}

TASK:
Independently discover meaningful business-process gaps and propose corrected flows using business reasoning, domain/niche knowledge, and all supplied inputs.

Your responsibility is to identify what the business process needs, what is missing or incorrect, where the gap exists, and how to remediate it. Do not merely verify whether the supplied data explicitly documents a missing activity.

METHOD:

1. Understand the business purpose, domain, niche, end-to-end lifecycle, and actual business meaning of activities, decisions, transitions, dependencies, and outcomes in the supplied process.

2. Independently reason about the activities, decisions, validations, business rules, controls, handoffs, preconditions, outcomes, exception paths, and recovery mechanisms reasonably necessary for a coherent end-to-end business process. Discover missing activities even when they are absent from ALL supplied inputs.

3. Treat business objects, actor journeys, and the actor-responsibility-authorisation matrix as contextual reference inputs that help explain the business. They are NOT an exhaustive specification and must NOT limit independent AI discovery.

4. Examine the complete Mermaid process semantically and structurally. Identify:
   - Missing activities or decisions BETWEEN existing activities.
   - Missing activities or dependencies affecting the wider process.
   - Missing, broken, contradictory, or incomplete transitions.
   - Missing decision branches, preconditions, validations, handoffs, or business outcomes.
   - Incomplete failure, cancellation, compensation, exception, and recovery paths where applicable.
   - Incorrect activity ordering, lifecycle inconsistencies, duplicated work, and ambiguous responsibilities.
   - Activities assigned to an inappropriate actor when the supplied responsibilities or business semantics indicate a mismatch.

5. DYNAMIC GAP LOCATION:
   For every finding, dynamically identify the relevant existing Mermaid node or nodes that locate the gap.
   - Extract actual step numbers, node IDs, and activity labels from the supplied Mermaid wherever available.
   - When a missing activity belongs between two existing activities, identify BOTH the actual source and destination step references and labels.
   - When a gap affects a wider process region, lifecycle dependency, branch, or disconnected path, identify the relevant existing node references and labels.
   - Never hardcode, assume, or fabricate step numbers, node IDs, activities, or source-destination relationships.
   - Sequence numbers and node IDs help locate findings; their numerical order alone is NOT evidence of a gap.
   - If reliable step references are unavailable, use the available actual node labels without inventing identifiers.

6. BUSINESS REASONING AND REMEDIATION:
   For every meaningful gap:
   - Explain the specific business problem caused by the missing or incorrect process behaviour.
   - Identify the activity, decision, control, transition, or dependency needed to address it.
   - Propose the smallest coherent corrected flow that resolves the problem.
   - Connect the proposed activity to the relevant existing source and destination activities wherever applicable.
   - Preserve valid existing activities and transitions.
   - Include normal, alternative, failure, and recovery branches when business reasoning establishes they are necessary.
   - Do not add generic best practices, redundant activities, or technical implementation details that do not address the identified business problem.

7. ACTOR AND RESPONSIBILITY MAPPING:
   - Use the supplied actor-responsibility-authorisation matrix to map existing human responsibilities and permissions.
   - Use supplied actor names where their responsibility is appropriate and supported.
   - Distinguish human actions from system-performed activities.
   - Do not silently invent an existing actor, organisational responsibility, or authorisation.
   - If an activity requires a responsibility not represented in the matrix, identify it as a proposed responsibility for business review or use ROLE_UNMAPPED.
   - Do not treat absence from the actor matrix as proof that a business activity is unnecessary.
   - Do not assign a human responsibility to a system or a system activity to a human without a defensible business reason.

8. DOMAIN-AGNOSTIC REASONING:
   - Discover requirements dynamically from the supplied domain, niche, process semantics, lifecycle, and relevant business dependencies.
   - Do not hardcode domain-specific activities, actors, business objects, policies, or validation rules.
   - Do not assume that every industry practice is mandatory for the current business.
   - Do not confuse distinct business concepts merely because they are related.
   - Do not prescribe a specific policy or operational procedure when multiple legitimate business solutions exist. Identify the necessary business decision and propose an appropriate conditional flow instead.
   - Use domain knowledge to discover and remediate gaps, not to manufacture unsupported requirements.

9. FINDING QUALITY:
   - Report actionable business-process gaps, including meaningful gaps discovered independently of the supplied data.
   - Do not suppress a plausible gap merely because no supplied source explicitly describes the missing activity.
   - Distinguish a demonstrated process defect from a potential business gap that requires confirmation.
   - Do not present assumptions about organisation-specific policies as established facts.
   - Merge duplicate findings that describe the same underlying problem.
   - Ensure each proposed flow directly addresses its problem and preserves coherent business logic.
   - Do not manufacture gaps solely to increase the number of findings.

10. CONNECTION-AWARE PROCESS REASONING AND DUPLICATE DETECTION:

   Analyse the Mermaid graph as a connected business process, not as a collection of isolated nodes.

   A. EXTRACT CONNECTION SEMANTICS
   - Inspect every edge connecting existing nodes, including its complete label, direction, and edge type.
   - Interpret connection labels as business information that may describe passed data, created objects, triggering events, decision outcomes, conditions, handoffs, retries, rollback, or termination.
   - Dynamically determine what each connection means in the context of its source activity, destination activity, and surrounding process.
   - Do not assume that every connection label has the same meaning. Distinguish data transfer from control flow and business outcomes.

   B. REASON ACROSS SOURCE, CONNECTION, AND DESTINATION
   - For each relevant connection, determine what the source activity produces or establishes, what the edge communicates or triggers, and what the destination activity requires or does.
   - Check whether required business information, decisions, validations, or lifecycle dependencies are missing between connected activities.
   - Check whether the destination's responsibilities are already satisfied by the source activity, connection payload, an existing decision branch, or another connected activity.
   - Identify missing dependencies even when no direct edge exists, where business reasoning indicates that a relationship is required.
   - Use the actual graph topology and business semantics; do not infer a gap from numbering alone.

   C. EXISTING ALTERNATE AND EXCEPTION PATHS
   - Inspect all reachable alternate, retry, degraded, rejection, rollback, recovery, and termination paths before proposing a new activity or branch.
   - Determine whether an existing path already handles the business scenario being investigated.
   - If the scenario is partially handled, identify the precise missing decision, transition, outcome, or responsibility instead of proposing the entire workflow again.
   - Distinguish a genuinely missing path from an existing path whose purpose, condition, connection, or final outcome is ambiguous or inconsistent.

   D. DUPLICATE FINDING PREVENTION
   - Before emitting a finding, compare it with all other findings and the existing graph.
   - Merge findings that describe the same underlying business gap, even if they occur on related nodes or use different wording.
   - Do not propose an activity that is already represented by an existing node, edge label, alternate path, or exception flow unless a specific deficiency remains.
   - Do not assume that two connections between the same nodes are duplicates: inspect their labels and determine whether they represent distinct data, conditions, or control-flow semantics.
   - When an existing activity and its connection collectively cover a requirement, do not report that requirement as missing.
   - Prefer the smallest correction that closes the actual gap without duplicating valid process behaviour.

   E. DYNAMIC GAP LOCATION AND REMEDIATION
   - Locate each finding using the actual source and destination step numbers and labels, when available.
   - Consider the connection itself as a potential location of the defect, including missing, ambiguous, contradictory, or incorrectly directed transition semantics.
   - Explain what is missing or incorrect in the context of the source activity, connection, and destination activity.
   - Propose a corrected flow that reuses valid existing nodes and connections and adds only the necessary proposed business behaviour.
   - Never hardcode step numbers, node IDs, actors, domain-specific activities, or business rules.

   F. INDEPENDENT AI DISCOVERY
   - Use connection labels and graph structure to strengthen independent business reasoning, not to limit discovery to explicitly represented information.
   - Discover missing business activities and dependencies even when absent from all supplied inputs.
   - Distinguish a plausible missing business requirement from a demonstrated graph defect, without suppressing a meaningful finding merely because the source data does not explicitly document it.
   - Do not invent organisation-specific policies or claim that an industry practice is mandatory without sufficient business justification.

OUTPUT:
Return valid JSON only, with no Markdown fences or explanations outside JSON.

{
  "findings": [
    {
      "problem": "Describe the business-process gap and dynamically identify its location using actual source and destination step references and activity labels when available.",
      "proposed_flow": "Existing source activity (Role) -> PROPOSED: Missing business activity (Role) -> Existing destination activity (Role)"
    }
  ]
}

OUTPUT RULES:
- Preserve the exact JSON structure: findings array containing only problem and proposed_flow.
- Include the gap location in the problem field. Use actual Mermaid step numbers and activity labels when available.
- For a gap between existing activities, identify both endpoints and explain what is missing between them.
- For a process-wide, lifecycle, or branch-level gap, identify the relevant existing node references and explain the affected process region.
- Use -> between activities and concise IF/THEN branches where needed.
- Embed the responsible actor in parentheses after each activity.
- Mark newly proposed activities as PROPOSED in the proposed flow. Do not fabricate step numbers or node IDs for them.
- Use supplied actor names where appropriate. Use ROLE_UNMAPPED or explicitly mark a responsibility as proposed when ownership is unsupported.
- Distinguish system automation from human actions.
- A proposed flow must show how the existing process is corrected, not merely restate the problem.
- Do not add a finding's classification, evidence, confidence, explanation, or any other field outside the required schema.
- Return {"findings": []} when no actionable gaps are identified.
- Be comprehensive in independent discovery, precise in gap location, concrete in remediation, and conservative about unsupported business policies.
- Keep each problem to 25 words maximum.
- State the gap location, missing behaviour, and business impact concisely.
- Use actual Mermaid step numbers and activity labels where available.
- Avoid background explanations, repeated context, and lengthy justifications.
- Keep proposed_flow concise while showing the necessary correction.
- Discover all meaningful, distinct gaps; do not impose a finding-count limit.
Analyse this process:
${base.topologyGraphContent}`;

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



