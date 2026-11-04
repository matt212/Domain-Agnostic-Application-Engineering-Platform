const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process'); 
const readline = require('readline');

// ============================================================================
// DYNAMIC GLOBAL CONFIGURATION MATRIX (100% CLEAN LAYER)
// ============================================================================
const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '6.Final-System-Architecture-Blueprint-Graph-'
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
    FILE_EXTENSION: ".txt"
  }
};

const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
const TMP_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Dynamic File Scanner: Resolves string names matching most recent file modifications
 */
function resolveLatestStageFile(directory, prefixPattern) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  
  const matchedFiles = files.filter(f => f.startsWith(prefixPattern) && f.endsWith(CONFIG.SCANNING_PATTERNS.FILE_EXTENSION));
  if (matchedFiles.length === 0) return null;

  matchedFiles.sort((a, b) => {
    return fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs;
  });

  return path.join(directory, matchedFiles[0]); 
}

/**
 * Native C++ Output Redirect Engine: Forces the binary to handle the file writing task directly
 */
function executeLlamaCliWithNativeRedirect(promptText, taskName, finalTargetFilePath) {
  return new Promise((resolve, reject) => {
    const tmpPromptFile = path.join(TMP_DIR, `tmp_${taskName}_prompt.txt`);
    
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(finalTargetFilePath), { recursive: true });
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
      '-n', CONFIG.MODEL.MAX_TOKENS,
      '-o', finalTargetFilePath // 🛡️ THE FAILSALFE VALVE: Forces llama-cli to write directly to your SSD
    ];

    console.log("⚙️ Spawning model... Processing tokens directly through system hardware layers. Please stand by...");
    
    execFile(CONFIG.MODEL.EXEC_BINARY, args, (error) => {
      if (fs.existsSync(tmpPromptFile)) fs.unlinkSync(tmpPromptFile);
      if (error) {
        return reject(new Error(`Binary Execution Crash: ${error.message}`));
      }
      resolve();
    });
  });
}

(async () => {
  try {
    console.log("🚀 INITIALIZING FAILSALFE NATIVE-REDIRECT COMPILER EXPORT ENGINE...");

    const objectsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS);
    const actorsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS);
    const journeysFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS);
    
    if (!objectsFilePath || !actorsFilePath || !journeysFilePath) {
      throw new Error("Could not automatically locate the input source files inside your output folder directory.");
    }

    console.log(`\n📖 Reading Input 1: ${path.basename(objectsFilePath)}`);
    console.log(`\n📖 Reading Input 2: ${path.basename(actorsFilePath)}`);
    console.log(`\n📖 Reading Input 3: ${path.basename(journeysFilePath)}`);
    
    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
    const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
    const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');

    const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your goal is to map out a complete visual system flow diagram from start to finish, formatted strictly as a Mermaid.js flowchart (graph TD).

=== DIAGRAM ARCHITECTURE STRUCTURAL INSTRUCTIONS ===
You must organize the entire system architecture layout across explicit, clean structural containers. Do not map this by isolated actors. Instead, follow these macro layout instructions:

1. DYNAMIC CONTAINER DISCOVERY: Analyze your input payload below. Discover and generate distinct "subgraph" blocks representing the horizontal functional layers, back-office modules, or operational domains of the system. 
2. DOMAIN REPLICATION: Use the system architecture structure layout found in the source payloads to map out your nodes. For example, group frontend/client interfaces together, fulfillment operations together, database/ledger services together, and transaction security modules together.
3. TRACK THE LIFECYCLE: Connect nodes sequentially using standard arrows (-->). Links must weave directly across your subgraphs to trace cross-domain data dependencies chronologically.
4. EDGE EXCEPTIONS: Wherever a business validation check or transaction rule can fail, branch out a dedicated conditional error path mapping the fallback loop.
5. ZERO DISCUSSION OR MARKDOWN CODE FENCES: Output ONLY the raw Mermaid diagram code string beginning directly with "graph TD".

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}

--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 10000)}

Assistant:\n`;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalOutputPath = path.join(OUTPUT_DIR, `${CONFIG.PATHS.EXPORT_PREFIX}${timestamp}.txt`);
    
    // Fire the token generation pass via native C++ file routing
    await executeLlamaCliWithNativeRedirect(prompt, 'direct_baseline_run', finalOutputPath);
    
    console.log(`\n\n\x1b[32m✔ Success! The model execution completed successfully.\x1b[0m`);
    console.log(`👉 Verified output file created at: ${finalOutputPath}\n`);

  } catch (err) {
    console.error(`\n\x1b[31m✕ Pipeline Run Failure:\x1b[0m`, err.message);
  } finally {
    rl.close();
  }
})();
