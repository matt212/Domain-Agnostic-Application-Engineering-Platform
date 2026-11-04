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
    EXPORT_PREFIX: '7.4. RAW Gaps Finding-'
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



// const pass1Prompt = `
// You are a domain-agnostic Business Process Sequence and Gap Analyst.

// DOMAIN:
// ${CONFIG.DOMAIN_CONTEXT.NAME}

// NICHE:
// ${CONFIG.DOMAIN_CONTEXT.NICHE}

// SUPPLIED BUSINESS OBJECTS:
// ${JSON.stringify(base.business_obj)}

// Perform the following two tasks IN ORDER.

// ==================== TASK 1: ORDER EXISTING OBJECTS ====================

// Determine the most plausible chronological business-process order for
// the supplied objects, based on the domain, niche, object inputs,
// activities, outputs, and their business dependencies.

// IMPORTANT:
// - First reorder the supplied objects. Do not rewrite their content.
// - Preserve each existing object's exact object_name, input, activity,
//   and output text.
// - Do not improve, correct, summarize, or replace the supplied wording.
// - Do not invent objects or activities in this task.
// - Do not assume the original array order is correct.
// - Consider the complete business lifecycle, not just the happy path.
// - Place an object where its activity is most logically needed.
// - If an activity can happen in parallel with another activity,
//   identify the parallel relationship instead of forcing a false order.
// - If an activity is conditional, optional, recurring, or an exception,
//   identify that relationship rather than placing it in the mandatory
//   main flow.
// - A cancellation, claim, refund, or other exception may branch from
//   an applicable lifecycle stage; do not automatically place it at
//   the end of the normal flow.
// - If ordering depends on an unknown business policy or operating model,
//   make the uncertainty explicit.
// - Do not confuse a business object with a sequential process step.
// - Infer plausible dependencies; do not present assumptions as proven
//   organisation-specific rules.

// ==================== TASK 2: IDENTIFY GAPS AND REMEDIATIONS ====================

// After ordering the existing objects, examine the domain and niche to
// identify material business capabilities or process steps that may be
// missing from the supplied objects.

// Use relevant industry knowledge and standards where their applicability
// and requirements can be established. Do not invent citations, regulations,
// or claims of mandatory compliance.

// For each candidate gap:
// - Explain what business capability appears to be missing and why.
// - Check whether an existing object or activity may already cover it.
// - Do not propose a new object merely because a capability has a different
//   name or could be modelled separately.
// - If a new business object is justified, propose its object_name,
//   input, activity, and output using the same format as the supplied data.
// - Use domain-appropriate business terminology.
// - Do not invent organisation-specific policies, actors, permissions,
//   or business rules.
// - Distinguish a plausible inferred gap from a confirmed requirement.
// - Where the operating model or policy is unknown, flag the proposal
//   for business confirmation.
// - Do not impose a fixed number of gaps or remediation objects.

// ==================== OUTPUT FORMAT ====================

// Return valid JSON only, using this structure:

// {
//   "ordered_objects": [
//     {
//       "object_name": "Original object name",
//       "input": "Original input text",
//       "activity": "Original activity text",
//       "output": "Original output text",
//       "flow_relationship": "MAIN_FLOW, PARALLEL_TO, CONDITIONAL, OPTIONAL, or EXCEPTION",
//       "related_to": ["Related existing object name"],
//       "ordering_note": "Brief explanation, or empty string if unnecessary"
//     }
//   ],
//   "gaps": [
//     {
//       "gap": "Description of the candidate missing capability",
//       "reason": "Why it may be needed in this domain and niche",
//       "status": "INFERRED or NEEDS_CONFIRMATION",
//       "remediation_object": {
//         "object_name": "Proposed business object name",
//         "input": "Information required",
//         "activity": "Business activity performed",
//         "output": "Result produced"
//       }
//     }
//   ]
// }

// OUTPUT RULES:
// - Include every supplied object exactly once in ordered_objects.
// - Preserve the four original fields of every existing object verbatim.
// - Additional metadata must not be inserted into those four fields.
// - Use exact supplied object names in related_to.
// - Use PARALLEL_TO only when activities can reasonably occur concurrently.
// - Use CONDITIONAL for activities dependent on a business condition.
// - Use OPTIONAL for capabilities that are not required in every instance.
// - Use EXCEPTION for recovery, cancellation, claims, refunds, and other
//   non-happy-path activities when applicable.
// - Use MAIN_FLOW for activities in the principal lifecycle.
// - These relationship labels describe process relationships; they do not
//   establish a mandatory execution order by themselves.
// - A remediation object must be a proposed capability, not an assertion
//   that the object already exists.
// - If no defensible gaps are identified, return an empty gaps array.
// - Do not add fields beyond those in the specified schema.
// - Escape JSON strings correctly. Do not include Markdown or comments.

// Complete Task 1 before Task 2. Return the JSON now.
// `;


const pass1Prompt = `
Determine the correct chronological order and business-object structure
for the supplied business objects using the specified DOMAIN, NICHE,
and industry-standard business understanding.

============================================================
1. DOMAIN AND NICHE
============================================================

DOMAIN:
${CONFIG.DOMAIN_CONTEXT.NAME}

NICHE:
${CONFIG.DOMAIN_CONTEXT.NICHE}

============================================================
2. SUPPLIED BUSINESS OBJECTS
============================================================

${JSON.stringify(base.business_obj, null, 2)}

============================================================
3. CHRONOLOGICAL ORDERING
============================================================

Use the specified DOMAIN, NICHE, and each object's object_name, input,
activity, and output to infer how the business process normally operates.

Apply relevant industry knowledge to determine the most realistic
operational chronology and dependencies between objects.

Do not assume the supplied objects are already in chronological order.
Do not sort alphabetically or determine order from object names alone.
Do not hardcode domain-specific sequences or use a fixed workflow.

Consider the business purpose, prerequisites, outcomes, dependencies,
conditional activities, and lifecycle timing of each object.

Objects may represent different points in a business lifecycle, even
when their names appear closely related.

Return every supplied object exactly once, preserving its original
object_name.

============================================================
4. MANDATORY OR OPTIONAL CLASSIFICATION
============================================================

For each supplied object, classify its importance for the normal
business process in the specified DOMAIN and NICHE.

Use one of these classifications:

MANDATORY:
The capability is normally required for the relevant business process
to operate or achieve its intended outcome.

OPTIONAL:
The capability is not universally required and depends on business
choices, customer preferences, operating models, policies, or scenarios.

Make this determination using industry-standard business understanding
and the object's actual input, activity, and output.

Do not classify an object as mandatory merely because it is related
to the main process.

Do not classify an object as optional merely because it may occur
conditionally in some scenarios.

Evaluate each object in the context of the specified DOMAIN and NICHE,
not as a universal rule applicable to every business.

============================================================
5. ADDITIONAL BUSINESS OBJECT STRUCTURE
============================================================

For each supplied object, determine whether it is best represented as
a CORE object, CHILD object, RELATED object, or PROCESS capability.

Use these definitions:

CORE:
An independently meaningful, top-level business object.

CHILD:
A component or subordinate object belonging to another business object.

RELATED:
An independently meaningful business object associated with another
object's lifecycle, process, or transaction.

PROCESS:
A request, event, activity, or lifecycle capability that may be better
represented as part of another business object's lifecycle rather than
as a separate top-level business object.

Determine the appropriate object_type using the specified DOMAIN,
NICHE, industry-standard business terminology, and the supplied
object's actual input, activity, and output.

Do not assume that every supplied item must be a CORE object.

Do not automatically treat every request, event, transaction, or
process as a standalone top-level business object.

Equally, do not automatically merge these items into another object.
An item should remain independent when it has its own meaningful
identity, lifecycle, ownership, tracking, or business significance.

For each object, also determine:

parent_object:
The exact name of the supplied business object that is its parent,
when a parent-child relationship is justified. Otherwise, return null.

relationship:
A concise description of the object's relationship to its parent
or associated business object. Return null when no relationship
needs to be specified.

alternative_suggestion:
If the supplied item would conventionally be better represented under
another business object, recommend the alternative business-object
name or representation. Explain briefly what should be represented
differently. Otherwise, return null.

Apply these rules:

- Use domain and niche knowledge rather than hardcoded mappings.
- Do not invent parent-child relationships without justification.
- parent_object must reference another supplied object's exact name
  or be null.
- A related object may have a meaningful relationship without being
  a child of another object.
- Do not suggest a separate object merely to duplicate an existing
  capability.
- Do not suggest merging objects merely because they are related.
- An alternative_suggestion is a recommendation, not an instruction
  to rename, delete, merge, or omit the original object.
- Preserve the original object_name exactly.
- Structural classification must not change the object's chronological
  position or its MANDATORY/OPTIONAL classification.

============================================================
6. FINAL VALIDATION
============================================================

Before responding, verify internally that:

- Every supplied object appears exactly once.
- Every object_name matches the original object_name exactly.
- The sequence reflects the inferred business chronology.
- Mandatory/optional classifications reflect the specified DOMAIN
  and NICHE.
- Every object_type is one of CORE, CHILD, RELATED, or PROCESS.
- parent_object references an exact supplied object name or null.
- Parent-child relationships are defensible.
- Alternative suggestions are relevant and do not duplicate existing
  capabilities unnecessarily.
- Related objects are not automatically merged or treated as children.
- No objects have been added, deleted, renamed, or merged.

Correct any inconsistencies before returning the result.

============================================================
7. REQUIRED OUTPUT FORMAT
============================================================

Return ONLY valid JSON using exactly this structure:

{
  "ordered_objects": [
    {
      "object_name": "Exact Original Object Name",
      "classification": "MANDATORY",
      "object_type": "CORE",
      "parent_object": null,
      "relationship": null,
      "alternative_suggestion": null
    }
  ]
}

OUTPUT RULES:

- ordered_objects must contain all supplied objects exactly once.
- Preserve the inferred chronological order.
- object_name must exactly match the supplied object_name.
- classification must be MANDATORY or OPTIONAL.
- object_type must be CORE, CHILD, RELATED, or PROCESS.
- parent_object must be an exact supplied object name or null.
- relationship must be a concise string or null.
- alternative_suggestion must be a concise recommendation or null.
- Include all six fields for every object.
- Do not detect gaps or propose missing business objects.
- Do not include explanations outside the JSON.
- Do not include Markdown fences.
- Do not include additional fields.
- Return syntactically valid JSON only.
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
        const outputFileName = `7.4_Business_Object_chrono_GAPS_${timestamp}.md`;
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



