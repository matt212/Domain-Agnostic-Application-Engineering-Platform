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
   

    // ============================================================================
    // DOMAIN-AGNOSTIC PROMPT (UNIQUE CONTAINERS + STRUCTURAL ACTOR ALIGNMENT)
    // ============================================================================
  
      // ============================================================================
    // DYNAMIC HYPER-INTELLIGENT HYBRID MERMAID COMPILER ENGINE PROMPT
    // ============================================================================
    const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your task is to ingest technical system payload schemas and synthesize a high-readability, executive-level visual workflow diagram formatted strictly as a Mermaid.js flowchart (graph TD). 

The output must be optimized for non-technical business stakeholders to instantly track user experience journeys, cross-department responsibilities, and financial/governance lifecycles.

=== DYNAMIC SYSTEMIC STRUCTURAL ARCHITECTURE DIRECTIVES ===

1. STRIP IMPLEMENTATION JARGON & TRANSLATE TO BUSINESS CAPABILITIES:
   - Aggressively translate developer-centric concepts into clear business terms.
   - STRICTLY FORBIDDEN terms: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", "Controller", "Postgres", or specific technical tooling strings.
   - Dynamic Equivalence Mapping: Convert "User_Auth_JWT" into "Identity Validation & Trust Layer"; convert "Inventory_DAL_Postgres" into "Stock & Material Availability Repository". Focus purely on broad organizational capabilities.

2. LOGICAL BUSINESS-DOMAIN SUBGRAPHS (UNIQUE NAMESPACING):
   - Categorize nodes into macro "subgraph" containers representing distinct organizational divisions, user experience views, or operational departments discovered dynamically in the data.
   - CRITICAL COMPILE MANDATE: Every subgraph MUST possess a completely unique, lowercase, underscore-separated identifier name string (e.g., Client_Facing_Identity, Backend_Orchestration_Ledger). 
   - NEVER reuse a subgraph identifier ID string anywhere in the script, as this causes compiler rendering overlap errors.

3. ALIGN TRANSITIONS TO OPERATIONAL REALITY:
   - Trace interactions so that background automated processes or processing engines execute background operational tasks. 
   - Do NOT link a human end-user actor to initiate internal system database modifications or route background worker scripts unless they are actively clicking a front-end screen component interface to execute that explicit command.
   - Prohibit circular self-looping connectors (Node_A --> Node_A). Route informational outputs out to the actual system consumer node.

4. PHASE-LEVEL CRITERIA WITH BIDIRECTIONAL "CLOSED-LOOP" CONFIRMATIONS:
   - Organize the layout timeline chronologically using structural phase comment headers (e.g., %% PHASE 1: [Name]).
   - Do not let user actions or system inquiries drop into a visual vacuum. Wherever a node triggers a request, inquiry, or transaction validation submission, you MUST explicitly map the immediate return data path, error notification, or confirmation vector back to the initiating node as the very next chronological step.
   - This visual round-trip loop closure must be preserved for all primary human interactions and cross-service data handshakes to maintain total scannability.

5. PHASING NUMBER MATRIX WITH ALPHABETIC SUB-INDEXING:
   - Prefix all main sequence timeline paths with incremental sequential integers (e.g., 1., 2., 3.).
   - To illustrate closely bound child sub-processes, real-time validations, or instant request-response feedback pairs without inflating the macro step numbers, you MUST utilize alphabetical sub-indexing notation enclosed securely inside the arrow text boundary strings (e.g., Node_A -->|1. Submit Request| Node_B, Node_B -->|1a. Success: Grant Authorization| Node_A, Node_B -.->|1b. Failure Exception| Node_C).

6. INLINE CONDITIONAL DIAMOND CROSSROADS:
   - Do not isolate error exceptions or alternate routes at the extreme end of the file text.
   - For major processing rule gates, risk verifications, or payment/credential checking nodes, inject an inline Mermaid decision diamond shape directly into the primary path (e.g., Auth_Gate{Is Transaction Valid?}).
   - Route the primary "Happy Path" link directly out of this diamond using the next sequential integer code, and route the standard failure exception path out using a dashed line connection script (-.->) pointed to the relevant rollback component.

7. RETENTION FLYWHEEL LIFECYCLE CLOSURE:
   - Ensure the diagram traces the lifecycle completely to post-execution events, balance adjustments, auditing trails, and loyalty tracking syncs. 
   - The final phase must link system status metrics back to the primary user or initiator profile node, visually demonstrating a cyclical customer retention flywheel loop.

8. ABSOLUTE COMPLIANCE SANITIZATION OUTPUT RULE:
   - Output ONLY the raw Mermaid diagram code string starting directly with "graph TD".
   - You are STRICTLY FORBIDDEN from wrapping the output in markdown backticks (\`\`\`), text code block fences, or appending introductory conversational pleasantries or closing remarks. Start instantly with the code.

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

=== STRATEGIC INSTRUCTION MATRIX (LAYMAN CONVERSION & SCANNABILITY) ===

1. STRIP TECHNICAL JARGON & IMPLEMENTATION DETAILS:
   - Aggressively translate developer-centric concepts into clear business terms. 
   - DO NOT output terms like: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", or specific database names.
   - Replace them with broad functional business terms (e.g., instead of "User_Auth_JWT_Service" use "Identity & Access Validation"; instead of "Inventory_DAL_Postgres" use "Stock Repository").

2. STRICT UNIQUE CONTAINER NAMESPACING (CRITICAL SYNTAX MANDATE):
   - Group nodes into logical macro "subgraph" containers representing high-level business divisions, operational departments, or user experience domains found within the data.
   - CRITICAL COMPLIANCE: Every single subgraph block MUST have a completely unique string identifier namespace (e.g., Client_Facing_Profile, Client_Facing_Logistics, Sub_Security, Sub_Audit). 
   - NEVER declare two subgraphs with the exact same identifier ID block, even if they have similar display text names. Reusing an ID crashes the diagram compiler.

3. ACCURATE ACTOR & PROCESS ALIGNMENT:
   - Carefully trace node links to match physical operational reality. 
   - Backend automated systems or background engines must initiate background work. Do NOT link a Customer Actor to trigger an internal database operation or dispatch an external driver unless they are actively clicking a screen to perform that specific transactional command.
   - Avoid self-looping components (e.g., Node_A --> Node_A) whenever possible; route tracking data outputs out to the actual tracking consumer (e.g., update the Customer profile).

4. PHASE-LEVEL STEP NUMBERING WITH ALPHABETIC SUB-INDEXING:
   - Trace the main operational timeline chronologically using phase markers.
   - You MUST prefix main timeline steps with integers (e.g., 1., 2., 3.).
   - DESIGN PREFERENCE: For request-and-response feedback loops, inner sub-processes, or child validations tied directly to a main step, you are ENCOURAGED to use alphabetical sub-indexing notation (e.g., -->|1. Request|, -->|1a. Validation Check|, -->|1b. Approval Return Response|). 

5. INLINE CONDITIONAL CHECKPOINTS (DIAMOND SHAPES):
   - For major business validations, transaction approvals, or rule verifications, insert an inline Mermaid decision diamond directly inside the timeline flow (e.g., Check_Node{Is Validation Successful?}).
   - Branch the "Happy Path" out of this diamond as the next chronological step number, and branch the standard failure exception out using a dotted line (-.->) pointing to the corresponding resolution or rollback component.

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
*/
/*
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
