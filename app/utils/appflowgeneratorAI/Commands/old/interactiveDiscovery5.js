const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); // Continuous streaming mechanics channel
const readline = require('readline');

// ============================================================================
// 📋 PASTE ANY CUSTOM AI PROMPTS DIRECTLY HERE (ISOLATION LAYER)
// ============================================================================
const PROMPTS = {
  /**
   * 1. BASELINE MACRO FLOWCHART PROMPT BLOCK
   * Domain-agnostic track configuration extracts boundaries dynamically from data inputs
   */
  BASELINE_GENERATION: (objectsData, actorsData, journeysData, domainData) => {
    return `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your goal is to map out a complete visual system flow diagram from start to finish, formatted strictly as a Mermaid.js flowchart (graph TD).

=== CONTEXT VARIABLES ===
- DOMAIN: ${domainData.domain}
- NICHE: ${domainData.niche}

=== DIAGRAM ARCHITECTURE STRUCTURAL INSTRUCTIONS ===
You must organize the entire system architecture layout across explicit, clean structural containers. Do not map this by isolated actors. Instead, follow these macro layout instructions:

1. DYNAMIC CONTAINER DISCOVERY: Analyze your input payload below. Discover and generate distinct "subgraph" blocks representing the horizontal functional layers, back-office modules, or operational domains of the system. 
2. DOMAIN REPLICATION: Use the system architecture structure layout found in the source payloads to map out your nodes. For example, group frontend/client interfaces together, fulfillment operations together, database/ledger services together, and transaction security modules together.
3. TRACK THE LIFECYCLE: Connect nodes sequentially using standard arrows (-->). Links must weave directly across your subgraphs to trace cross-domain data dependencies chronologically.
4. EDGE EXCEPTIONS: Wherever a business validation check or transaction rule can fail, branch out a dedicated conditional error path mapping the fallback loop.
5. ZERO DISCUSSION OR MARKDOWN CODE FENCES: Output ONLY the raw Mermaid diagram code string beginning directly with "graph TD".

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsData.substring(0, 8000)}

--- ROLE SET VALIDATIONS ---
${actorsData.substring(0, 8000)}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysData.substring(0, 10000)}

Assistant:\n`;
  },

  /**
   * 2. INTERACTIVE REVISION/DELTA PATCH PROMPT BLOCK
   */
  INTERACTIVE_PATCH: (currentMatrixData, feedbackText, domainData) => {
    return `You are an isolated layout adjustment utility patching our system architecture graph flowchart.
MUTATION ORDER CRITERIA: "${feedbackText}"

BUSINESS DOMAIN: ${domainData.domain}
BUSINESS NICHE: ${domainData.niche}

CURRENT MAP CONFIGURATION STATE:
${currentMatrixData}

OBJECTIVE:
Modify the diagram connectors, labels, node names, and subgraph assignments matching the user feedback. 

OUTPUT SPECIFICATION RULES:
Output ONLY the clean updated raw Mermaid diagram string beginning directly with "graph TD". No descriptions outside the chart text structure.

Assistant:\n`;
  }
};

// ============================================================================
// SYSTEM HARDWARE & FILE PATH PIPELINE CONFIGURATION MATRIX
// ============================================================================
const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    CACHE_FILENAME: 'techno-functional-matrix-cache.json',
    EXPORT_PREFIX: '6.Final-System-Architecture-Blueprint-Graph-'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    NGL: '0',
    MAX_TOKENS: '8048',         
    PATCH_TOKENS: '4048',
    BATCH_SIZE: '2048', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "1-Final-Objects-",
    STAGE_2_ACTORS: "2.Final-Actors-",
    STAGE_3_JOURNEYS: "3.Final-End-to-End-Actor-Journeys-",
    FILE_EXTENSION: ".txt"
  },
  HEADERS: {
    PRIMARY_TARGET: "=== Final DATA MATRIX for domain :",
    ALTERNATE_TARGET: "=== E2E ACTOR TRANSACTION JOURNEYS for domain :",
    SPLIT_ANCHOR_PRIMARY: " and niche :",
    SPLIT_ANCHOR_ALTERNATE: " and niche :"
  },
  SCRUBBERS: {
    MERMAID_FENCE: /```mermaid\s*/gi,
    GENERIC_FENCE: /```\s*/g
  }
};

const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
const TMP_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR);
const CACHE_FILE_PATH = path.join(OUTPUT_DIR, CONFIG.PATHS.CACHE_FILENAME);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

function streamLlamaCli(promptText, taskName, maxTokens = CONFIG.MODEL.MAX_TOKENS) {
  return new Promise((resolve, reject) => {
    const tmpPromptFile = path.join(TMP_DIR, `tmp_${taskName}_prompt.txt`);
    
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(tmpPromptFile, promptText, 'utf8');

    const args = [
      '-hf', CONFIG.MODEL.IDENTIFIER,
      '-ngl', CONFIG.MODEL.NGL,
      '--single-turn',
      '-c', '32768',            
      '-b', CONFIG.MODEL.BATCH_SIZE, 
      '-t', CONFIG.MODEL.THREADS,     
      '--reasoning', CONFIG.MODEL.REASONING_MODE,
      '--log-disable', 
      '-f', tmpPromptFile,
      '-n', maxTokens.toString()
    ];

    const child = spawn(CONFIG.MODEL.EXEC_BINARY, args);
    let capturedBuffer = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      capturedBuffer += chunk;
      process.stdout.write(chunk); 
    });

    child.stderr.on('data', (data) => {
      const errChunk = data.toString();
      if (errChunk.toLowerCase().includes('error')) {
        console.error(`\n[Model Log Warning]: ${errChunk}`);
      }
    });

    child.on('close', (code) => {
      if (fs.existsSync(tmpPromptFile)) fs.unlinkSync(tmpPromptFile);
      if (code !== 0 && code !== null) {
        return reject(new Error(`[${taskName}] Process stream closed with error signature code: ${code}`));
      }
      resolve(capturedBuffer.trim());
    });
  });
}

function extractDomainAndNicheFromHeader(fileContent) {
  const targetHeader = CONFIG.HEADERS.PRIMARY_TARGET;
  if (!fileContent.includes(targetHeader)) {
    const altHeader = CONFIG.HEADERS.ALTERNATE_TARGET;
    if (fileContent.includes(altHeader)) {
      const lineEnd = fileContent.indexOf('\n');
      const headerLine = lineEnd !== -1 ? fileContent.substring(0, lineEnd) : fileContent;
      const domainPart = headerLine.split(altHeader) || "";
      const nicheSplit = domainPart.split(CONFIG.HEADERS.SPLIT_ANCHOR_ALTERNATE);
      return { 
        domain: nicheSplit ? nicheSplit.trim() : "Unknown Domain", 
        niche: nicheSplit ? nicheSplit.replace("===", "").replace(")", "").trim() : "Unknown Niche" 
      };
    }
    return { domain: "Unknown Domain", niche: "Unknown Niche" };
  }
  const firstLineEnd = fileContent.indexOf('\n');
  const headerLine = firstLineEnd !== -1 ? fileContent.substring(0, firstLineEnd) : fileContent;
  const domainPart = headerLine.split(targetHeader) || "";
  const nicheSplit = domainPart.split(CONFIG.HEADERS.SPLIT_ANCHOR_PRIMARY);
  return { 
    domain: nicheSplit ? nicheSplit.trim() : "Unknown Domain", 
    niche: nicheSplit ? nicheSplit.replace("===", "").trim() : "Unknown Niche" 
  };
}

function cleanMermaidOutputString(rawStr) {
  if (typeof rawStr !== 'string') return '';
  let scrubbed = rawStr.replace(CONFIG.SCRUBBERS.MERMAID_FENCE, '').replace(CONFIG.SCRUBBERS.GENERIC_FENCE, '').trim();
  const graphTDStart = scrubbed.indexOf('graph TD');
  const graphLRStart = scrubbed.indexOf('graph LR');
  let validStartIdx = (graphTDStart !== -1 && graphLRStart !== -1) ? Math.min(graphTDStart, graphLRStart) : (graphTDStart !== -1 ? graphTDStart : graphLRStart);
  if (validStartIdx !== -1) {
    return scrubbed.substring(validStartIdx).trim();
  }
  return scrubbed;
}

/**
 * FIXED FOREVER: Explicitly pulls index 0 string element from the array to prevent path type errors
 */
function resolveLatestStageFile(directory, prefixPattern) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  
  const matchedFiles = files.filter(f => f.startsWith(prefixPattern) && f.endsWith(CONFIG.SCANNING_PATTERNS.FILE_EXTENSION));
  if (matchedFiles.length === 0) return null;

  matchedFiles.sort((a, b) => {
    return fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs;
  });

  // ✔️ FIXED LAYER: References index 0 string explicitly to fix path array coercion crash
  return path.join(directory, matchedFiles[0]);
}

(async () => {
  try {
    console.log("🚀 INITIATING UN-HARDCODED MACRO-CAPABILITY FLOWCHART COMPILER ENGINE...");

    const objectsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS);
    const actorsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS);
    const journeysFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS);
    
    if (!objectsFilePath) throw new Error(`Dynamic lookup failed for Stage 1 file pattern bounds inside: ${OUTPUT_DIR}`);
    if (!actorsFilePath) throw new Error(`Dynamic lookup failed for Stage 2 file pattern bounds inside: ${OUTPUT_DIR}`);
    if (!journeysFilePath) throw new Error(`Dynamic lookup failed for Stage 3 file pattern bounds inside: ${OUTPUT_DIR}`);

    console.log(`\n📖 Dynamically Scanned Stage 1 -> ${path.basename(objectsFilePath)}`);
    console.log(`📖 Dynamically Scanned Stage 2 -> ${path.basename(actorsFilePath)}`);
    console.log(`📖 Dynamically Scanned Stage 3 -> ${path.basename(journeysFilePath)}`);
    
    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
    const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
    const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');
    
    const domainData = extractDomainAndNicheFromHeader(objectsMatrixContent);
    console.log(`🎯 Context Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);
    
    let currentMatrixData = "";
    
    if (fs.existsSync(CACHE_FILE_PATH)) {
      console.log(`\n💾 Local cache discovery made at: ${CACHE_FILE_PATH}`);
      const cacheAction = await askQuestion("Type 'clear' to drop configuration cache and run fresh baseline pass, or Enter to load directly: ");
      
      if (cacheAction.trim().toLowerCase() === 'clear') {
        fs.unlinkSync(CACHE_FILE_PATH);
        console.log("⚙️ Compiling macro cross-domain layout matrix diagram from unified input parameters...");
        const rawBase = await streamLlamaCli(PROMPTS.BASELINE_GENERATION(objectsMatrixContent, actorsMatrixContent, journeysMatrixContent, domainData), 'tech_func_base', CONFIG.MODEL.MAX_TOKENS);
        currentMatrixData = cleanMermaidOutputString(rawBase);
        fs.writeFileSync(CACHE_FILE_PATH, currentMatrixData, 'utf8');
      } else {
        console.log("🔄 Loading structural blueprint text straight from system disk cache...");
        currentMatrixData = fs.readFileSync(CACHE_FILE_PATH, 'utf8').trim();
      }
    } else {
      console.log("⚙️ Compiling macro cross-domain layout matrix diagram from unified input parameters...");
      const rawBase = await streamLlamaCli(PROMPTS.BASELINE_GENERATION(objectsMatrixContent, actorsMatrixContent, journeysMatrixContent, domainData), 'tech_func_base', CONFIG.MODEL.MAX_TOKENS);
      currentMatrixData = cleanMermaidOutputString(rawBase);
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE_PATH, currentMatrixData, 'utf8');
    }
    
    let isApproved = false;
    while (!isApproved) {
      console.log(`\n--- CURRENT ACTIVE REVISION MONITOR ---`);
      console.log(`\x1b[32m📦 Graph State locked in buffer memory: ${currentMatrixData.length} characters.\x1b[0m`);
      console.log(`\n[Preview Head]:\n${currentMatrixData.substring(0, 450)}\n...`);
      
      const actorSelection = await askQuestion("\nApply fine-tuning configuration feedback? (Or type 'YES' to approve and export everything): ");
      if (actorSelection.trim().toUpperCase() === 'YES') {
        isApproved = true;
        break;
      }
      
      const feedback = await askQuestion("Provide layout tuning instructions for the flowchart structure: ");
      const rawPatch = await streamLlamaCli(PROMPTS.INTERACTIVE_PATCH(currentMatrixData, feedback, domainData), 'tech_func_patch', CONFIG.MODEL.PATCH_TOKENS);
      const updatedActorBlock = cleanMermaidOutputString(rawPatch);
      
      if (updatedActorBlock && updatedActorBlock.length > 20) {
        currentMatrixData = updatedActorBlock.trim();
        fs.writeFileSync(CACHE_FILE_PATH, currentMatrixData, 'utf8');
        console.log(`\n✅ Master flowchart schema updated successfully inside cache!`);
      }
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalOutputPath = path.join(OUTPUT_DIR, `${CONFIG.PATHS.EXPORT_PREFIX}${timestamp}.txt`);
    
    fs.writeFileSync(
      finalOutputPath,
      `=== Final Service Blueprint Structural Architecture Graph for domain :${domainData.domain} and niche :(${domainData.niche}) ===\n\n${currentMatrixData}`,
      'utf8'
    );
    console.log(`\n\x1b[32m✔ Success! Complete cross-domain architecture graph exported to: ${finalOutputPath}\x1b[0m`);
    
  } catch (err) {
    console.error(`\n\x1b[31m✕ Pipeline Run Error:\x1b[0m`, err.message);
  } finally {
    rl.close();
  }
})();
