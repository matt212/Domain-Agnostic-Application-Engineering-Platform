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
    const tmpPromptFile = path.join(TMP_DIR, `tmp_\${taskName}_prompt.txt`);
    
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
      '-o', finalTargetFilePath 
    ];

    console.log("⚙️ Spawning model... Processing tokens directly through system hardware layers. Please stand by...");
    
    execFile(CONFIG.MODEL.EXEC_BINARY, args, (error) => {
      if (fs.existsSync(tmpPromptFile)) fs.unlinkSync(tmpPromptFile);
      if (error) {
        return reject(new Error(`Binary Execution Crash: \${error.message}`));
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

    console.log(`\n📖 Reading Input 1: \${path.basename(objectsFilePath)}`);
    console.log(`\n📖 Reading Input 2: \${path.basename(actorsFilePath)}`);
    console.log(`\n📖 Reading Input 3: \${path.basename(journeysFilePath)}`);
    
    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
    const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
    const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');

    // ============================================================================
    // DOMAIN-AGNOSTIC, LAYMAN-CENTRIC BUSINESS PROMPT
    // ============================================================================
   

const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE who specializes in translating complex technical payload schemas into clean, executive-level, and business-user-friendly workflow diagrams. 

Your goal is to output a single visual system flow diagram formatted strictly as a Mermaid.js flowchart (graph TD) that any non-technical business stakeholder can immediately understand.

=== STRATEGIC INSTRUCTION MATRIX (LAYMAN CONVERSION & SCANNABILITY) ===

1. STRIP TECHNICAL JARGON & IMPLEMENTATION DETAILS:
   - Aggressively translate developer-centric concepts into clear business terms. 
   - DO NOT output terms like: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", or specific database names.
   - Replace them with broad functional business terms (e.g., instead of "User_Auth_JWT_Service" use "Identity & Access Validation"; instead of "Inventory_DAL_Postgres" use "Stock Repository").

2. DYNAMIC BUSINESS-DOMAIN SUBGRAPHS:
   - Group nodes into logical macro "subgraph" containers representing high-level business divisions, operational departments, or user experience domains found within the data.
   - Keep subgraphs focused on clear functional areas (e.g., Client Interaction, Core Orchestration, Fulfillment/Processing, Audit/Governance, Ledger/Settlement) depending on what the inputs describe.

3. STRICT GLOBAL MONOTONIC STEP NUMBERING:
   - Trace the main operational timeline from start to finish across ALL segments, sections, and actors found in the "CHRONOLOGICAL JOURNEY TRACKS".
   - You MUST prefix connection arrow labels with a globally unique, strictly ascending integer sequence (e.g., -->|1. Action|, -->|2. Action|, ..., -->|14. Action|, -->|15. Action|).
   - CRITICAL SAFETY VALVE: NEVER repeat a step number anywhere in the entire chart. Do NOT reset or restart the sequence at 1 when moving into a different subgraph, a different phase comment header, or an actor execution loop. The sequence number must count UP continuously from the first arrow to the last.

4. CLOSED-LOOP REQUEST & RESPONSE PAIRS (HIGH READABILITY):
   - To prevent the reader from scrolling all over the diagram, do not allow operational requests to disappear into a black box. 
   - Wherever an actor or component initiates an inquiry, validation request, or submission, you MUST explicitly map the immediate return data path or confirmation back to the initiator as the very next sequential step (e.g., Component A requests details -> Component B processes -> Component B displays/confirms availability back to Component A).
   - Ensure these bidirectional feedback loops are completely represented for all primary human interactions and crucial inter-service operations.

5. INLINE CONDITIONAL CHECKPOINTS (DIAMOND SHAPES):
   - Do not isolate standard transactional error paths exclusively at the bottom of the code. 
   - For major business validations, transaction approvals, or rule verifications, insert an inline Mermaid decision diamond directly inside the timeline flow (e.g., Check_Node{Is Validation Successful?}).
   - Branch the "Happy Path" out of this diamond as the next sequential step number, and branch the standard failure exception out using a dotted line (-.->) pointing to the corresponding resolution or rollback component.

6. OUTPUT COMPLIANCE:
   - Output ONLY the raw Mermaid diagram string beginning directly with "graph TD".
   - No code block wrappers, no markdown backticks (\`\`\`), and zero introductory or concluding conversational commentary text.

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}

--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 10000)}

Assistant:\n`;


   /* 
   const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE who specializes in translating complex technical payload schemas into clean, executive-level, and business-user-friendly workflow diagrams. 

Your goal is to output a single visual system flow diagram formatted strictly as a Mermaid.js flowchart (graph TD) that any non-technical business stakeholder can immediately understand.

=== STRATEGIC INSTRUCTION MATRIX (DOMAIN-AGNOSTIC & LAYMAN CONVERSION) ===

1. STRIP TECHNICAL JARGON & IMPLEMENTATION DETAILS:
   - Aggressively translate developer-centric concepts into clear business terms. 
   - DO NOT output terms like: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", or specific database names.
   - Replace them with broad functional business terms (e.g., instead of "User_Auth_JWT_Service" use "Identity & Access Validation"; instead of "Inventory_DAL_Postgres" use "Stock Repository").

2. DYNAMIC BUSINESS-DOMAIN SUBGRAPHS:
   - Group nodes into logical macro "subgraph" containers representing high-level business divisions, operational departments, or user experience domains found within the data.
   - Keep subgraphs focused on clear functional areas (e.g., Client Interaction, Core Orchestration, Fulfillment/Processing, Audit/Governance, Ledger/Settlement) depending on what the inputs describe.

3. STRICT GLOBAL MONOTONIC STEP NUMBERING:
   - Trace the single main operational timeline from start to finish across ALL segments, sections, and actors found in the "CHRONOLOGICAL JOURNEY TRACKS".
   - You MUST prefix connection arrow labels with a globally unique, strictly ascending integer sequence (e.g., -->|1. Action|, -->|2. Action|, ..., -->|14. Action|, -->|15. Action|).
   - CRITICAL SAFETY VALVE: NEVER repeat a step number anywhere in the entire chart. Do NOT reset or restart the sequence at 1 when moving into a different subgraph, a different phase comment header, or an actor execution loop. The sequence number must count UP continuously from the first arrow to the last.

4. SIMPLIFIED EXCEPTION FLOWS:
   - Keep conditional error or exception paths lightweight.
   - Use dotted lines (-.->) with plain English business descriptions detailing what happens when a rule validation or primary transaction leg fails (e.g., "Validation Error Exception"). Do not assign sequence numbers to standard error fallbacks unless they represent a core, multi-step alternate timeline track.

5. OUTPUT COMPLIANCE:
   - Output ONLY the raw Mermaid diagram string beginning directly with "graph TD".
   - No code block wrappers, no markdown backticks (\`\`\`), and zero introductory or concluding conversational commentary text.

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}

--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 10000)}

Assistant:\n`;

*/
/*   
    const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE who specializes in translating complex technical payload schemas into clean, executive-level, and business-user-friendly workflow diagrams. 

Your goal is to output a single visual system flow diagram formatted strictly as a Mermaid.js flowchart (graph TD) that any non-technical business stakeholder can immediately understand.

=== STRATEGIC INSTRUCTION MATRIX (DOMAIN-AGNOSTIC & LAYMAN CONVERSION) ===

1. STRIP TECHNICAL JARGON & IMPLEMENTATION DETAILS:
   - Aggressively translate developer-centric concepts into clear business terms. 
   - DO NOT output terms like: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", or specific database names.
   - Replace them with broad functional business terms (e.g., instead of "User_Auth_JWT_Service" use "Identity & Access Validation"; instead of "Inventory_DAL_Postgres" use "Stock Repository").

2. DYNAMIC BUSINESS-DOMAIN SUBGRAPHS:
   - Group nodes into logical macro "subgraph" containers representing high-level business divisions, operational departments, or user experience domains found within the data.
   - Keep subgraphs focused on clear functional areas (e.g., Client Interaction, Core Orchestration, Fullfillment/Processing, Audit/Governance, Ledger/Settlement) depending on what the inputs describe.

3. SEQUENTIAL STEP NUMBERING FOR THE LIFECYCLE:
   - Identify the main operational timeline path from start to finish using the provided "CHRONOLOGICAL JOURNEY TRACKS".
   - You MUST prefix connection arrow labels with sequential integers (e.g. -->|1. Action Name| or -->|2. Next State|) so the business user can read the diagram in a clear chronological narrative order.

4. SIMPLIFIED EXCEPTION FLOWS:
   - Keep conditional error or exception paths lightweight.
   - Use dotted lines (-.->) with plain English business descriptions detailing what happens when a rule validation or primary transaction leg fails (e.g., "Validation Error Exception").

5. OUTPUT COMPLIANCE:
   - Output ONLY the raw Mermaid diagram string beginning directly with "graph TD".
   - No code block wrappers, no markdown backticks (\`\`\`), and zero introductory or concluding conversational commentary text.

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}

--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 10000)}

Assistant:\n`;
*/

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
