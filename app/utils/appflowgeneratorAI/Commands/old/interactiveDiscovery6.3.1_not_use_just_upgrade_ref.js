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
    EXPORT_PREFIX: '8.6.3.Final-System-Architecture-Blueprint-Graph-'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    NGL: '0',
    MAX_TOKENS: '8048',         
    BATCH_SIZE: '2048', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "1-Final-Objects-",
    STAGE_2_ACTORS: "2.Final-Actors-",
    STAGE_3_JOURNEYS: "3.Final-End-to-End-Actor-Journeys-",
   // STAGE_4_TOPOLOGY: "6.swimlane_systems_architecture_map_14-10-26_04_09", 
    STAGE_4_TOPOLOGY:"6.swimlane_systems_architecture_map_18-10-26_07_17",
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


const pass1Prompt = `
You are a Business Process Terminology Specialist specializing in deep structural mapping for a domain-agnostic business process and swimlane generator.
Target Engine: unsloth/Qwen3.5-9B-GGUF (Optimized context-matrix scanning).

================================================================================
CRITICAL EXECUTION & FULL-COVERAGE BOUNDS
================================================================================
- You MUST evaluate every issue in the KNOWN ISSUES list independently.
- The topology data contain MULTIPLE repeating generic structural labels (duplicate placeholders) across different steps and execution phases. 
- You MUST scan the entire topology string to extract EVERY node affected by each issue. Do not stop after finding the first match.
- Your final "replacements" array MUST include an entry for every distinct affected node found. Truncating at 60% execution coverage is a structural failure.

================================================================================
STRICT TERMINOLOGY DECISION RULES
================================================================================
1. TREAT TOPOLOGY AS EVIDENCE: Use the structural layout, surrounding nodes, lanes, and process paths as primary evidence to interpret the localized meaning of a step.
2. NODE INDEPENDENCE: Analyze every matching node independently. The same generic issue label will require entirely different corrective wording depending on its location in the path. Never reuse a replacement phrase just because the original placeholder labels are identical.
3. NO PARAPHRASING: The placeholder text identifies a problem area; it does not define the resolution. Do not merely rename or paraphrase the original generic placeholder mechanism.
4. NO BLIND DEFAULTS/ROLLBACKS: Do not automatically recommend cached data, saved defaults, rollbacks, or retries unless explicitly supported by adjacent business objects or context lanes.
5. SOFT FAILURE RESOLUTION: For "State Discrepancy" or soft-fail loops, analyze the upstream data validation gate. Recommend a concrete business correction that resolves the inconsistency before the process loops back to the original step.
6. HARD FAILURE OUTCOMES: For hard failures or rollback nodes, recommend a localized, clear business termination outcome. Reverse or cancel system states only in a way that makes business sense for that precise process step.
7. BE CONCRETE: Avoid vague, unhelpful engineering terms like "resolve issue", "handle error", or "process exception". Use concrete, production-ready operational business phrases.
8. NO DATA FABRICATION: Do not invent actors, policies, permissions, data, stored state, capabilities, business outcomes, or process steps. Industry-standard terminology may be used to flesh out context, but never present it as an existing system feature if undocumented.

================================================================================
NODE MAPPING & EXTRACTOR RULES
================================================================================
- Target only actual node IDs and field labels present in the provided topology graph.
- You MUST accurately copy "existing_content" exactly as it appears in the topology before editing.
- BRACKET PREFIX CONSERVATION RULE: You must extract the exact prefix from the beginning of "existing_content" up to and including the closing square bracket \`]\` (e.g., "🛑 [Step 5.1.3 Rollback]"). This prefix must be prepended directly to your new business terminology text inside "replacement_content". Never alter emojis, step numbers, or bracketed structural classifications.

================================================================================
INPUT DATA CONTEXT
================================================================================
DOMAIN NAME:
${CONFIG.DOMAIN_CONTEXT.NAME}

BUSINESS NICHE:
${CONFIG.DOMAIN_CONTEXT.NICHE}

KNOWN ISSUES LABELS TO TRACE:
${JSON.stringify(base.topologyExistingPreciseContent)}

AVAILABLE BUSINESS OBJECT METADATA:
${JSON.stringify(base.business_obj)}

ACTOR RESPONSIBILITIES & AUTHORIZATIONS:
${JSON.stringify(base.actors_resp)}

ACTOR-BASED BUSINESS JOURNEYS:
${JSON.stringify(base.actorsjourney)}

GENERATED SWIMLANE / TOPOLOGY STRING:
${JSON.stringify(base.topologyGraphContent)}

================================================================================
OUTPUT SCHEMA REQUIREMENTS
================================================================================
- Return VALID, PURE RAW JSON ONLY.
- Do not add conversational intro/outro text, and do not wrap the response inside markdown blocks (No \`\`\`json wrappers).
- Fully generate every single structural mapping entry needed to replace all placeholder duplicates.

{
  "replacements": [
    {
      "existing_content": "EXACT_EXISTING_STRING extract from KNOWN ISSUES LABELS TO TRACE: section",
      "replacement_content": "EXTRACTED_PREFIX_INCLUDING_BRACKET Your Tailored Business Process Action Phrase"
    }
  ]
}
`;







    fs.mkdirSync(path.dirname(promptTmpPath1), { recursive: true });
    fs.writeFileSync(promptTmpPath1, pass1Prompt, 'utf8');

    const execArgsPass1 = [
      '-hf', CONFIG.MODEL.IDENTIFIER,
      '-ngl', CONFIG.MODEL.NGL,
      '--single-turn',
      '-c', '8048', 
      '-b', CONFIG.MODEL.BATCH_SIZE, 
      '-t', CONFIG.MODEL.THREADS,     
      '--reasoning', CONFIG.MODEL.REASONING_MODE,
      '--log-disable', 
      '-n', CONFIG.MODEL.MAX_TOKENS,
      '-f', promptTmpPath1,
       '-o', finalTargetFilePath 
    ];

    console.log(`\n⚡ Running Pass 1: Pure data-driven state discovery...`);
    
    execFile(CONFIG.MODEL.EXEC_BINARY, execArgsPass1, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (fs.existsSync(promptTmpPath1)) fs.unlinkSync(promptTmpPath1);
      if (error) return callback(error, null);

      let discoveredStatesMap = {};
      try {
       
        callback(null, finalTargetFilePath);
      } catch (parseErr) {
        console.warn("⚠️ JSON Extraction raw block mismatch, utilizing programmatic safety fallbacks.");
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
  topologyExistingPreciseContent:getmermaidcontent()
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
    let interim = JSON.parse(extractAfterLastAssistant(objectsData)).replacements
    //console.log(interim)
    const contentChanges = interim.map(item => {
        const match = item.existing_content.match(/\[Step\s([\d.]+)/);
        const step = match ? match[1] : null;
        return {
            step,
            from: item.existing_content,
            to: item.replacement_content,
            statement: `UPDATE NODE Step ${step} TO "${item.replacement_content}"`,
        };
    });
    const finalScript = contentChanges.map(item => item.statement).join('\n')
    console.log(finalScript);
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
    const outputFileName = `clean6.3.1_cleanup_${timestamp}.md`;
    const OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
    const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
    // 7. Commit write configuration array output directly onto physical hardware disk
    fs.writeFileSync(outputFilePath, finalScript, 'utf8');
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


