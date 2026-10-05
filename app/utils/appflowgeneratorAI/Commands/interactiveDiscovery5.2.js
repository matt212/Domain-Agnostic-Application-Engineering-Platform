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
        // ============================================================================
    // THE DEFINITIVE TOP-DOWN CORE COMPILER PROMPT (ANTI-SPIDERWEB ENGINE)
    // ============================================================================

    // ============================================================================
    // REFINED GOLDEN MASTER COMPILER PROMPT (100% PRODUCTION ACCURACY)
    // ============================================================================

        // ============================================================================
    // THE 100% PERFECT ENTERPRISE MERMAID COMPILER PROMPT (PURE DOMAIN-AGNOSTIC)
    // ============================================================================
        // ============================================================================
    // THE 100% PERFECT ENTERPRISE MERMAID COMPILER PROMPT (ZERO HARDCODING)
    // ============================================================================
        // ============================================================================
    // THE 100% PERFECT ENTERPRISE MERMAID COMPILER PROMPT (ZERO HARDCODING)
    // ============================================================================
        // ============================================================================
    // THE 100% PERFECT ENTERPRISE MERMAID COMPILER PROMPT (ZERO COLOR / BLACK & WHITE)
    // ============================================================================
    const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your task is to ingest technical system payload schemas and synthesize a high-readability, executive-level visual workflow diagram formatted strictly as a Mermaid.js flowchart utilizing a clean, strict top-down layout (graph TD).

=== TOP-DOWN VISUAL LAYOUT CONSTRAINTS (MANDATORY) ===

1. STRUCTURAL GATEWAY ROUTING LAYER:
   - Nodes inside a subgraph container are STRICTLY FORBIDDEN from linking directly to internal nodes inside a different subgraph container.
   - You MUST enforce a strict Hub-and-Spoke structure for every single subgraph:
     * Entrance Node: Designate or create exactly ONE node at the absolute top boundary of the subgraph to act as the single entry point for all incoming external arrows.
     * Exit Node: Designate or create exactly ONE node at the absolute bottom boundary of the subgraph to act as the single exit point for all outgoing external arrows.
   - Inter-subgraph communication MUST occur exclusively by linking the Exit Node of a preceding subgraph directly to the Entrance Node of the next chronological subgraph.
   - CRITICAL COMPILING CONSTRAINT: You are STRICTLY FORBIDDEN from linking a node variable identifier directly to an outer subgraph container name string ID block. Edges must ONLY connect explicit Node-to-Node targets.

2. UNIQUE CONTAINER & VARIABLE BALANCING:
   - Every single subgraph block MUST possess a completely unique, lowercase, underscore-separated string identifier ID name. NEVER reuse a subgraph ID string anywhere in the entire output.
   - Every node variable identifier name within the entire diagram MUST be completely unique. Every variable identifier used anywhere in an arrow link (including all Entrance and Exit nodes) MUST be explicitly declared with its bracket shape and text label INSIDE its designated subgraph block definition before it is linked. No uninitialized variables floating outside container walls are permitted.
   - You are STRICTLY FORBIDDEN from declaring a subgraph identifier standalone on its own line under link sections without child components or functional connectivity.

3. STRICT PROCESS LOOP TERMINATION:
   - A gateway node or boundary exit component is STRICTLY FORBIDDEN from pointing directly back into itself.
   - Every operational loop, validation track, and final execution state must resolve forward and downward, terminating into a completely distinct, final tracking closure node at the bottom of the layout layer.

4. ABSOLUTE BIFT OF COLOR AND STYLING (NO COLOR POLICY):
   - You are STRICTLY FORBIDDEN from outputting any color configurations, color coding, styling templates, theme styles, or "classDef" / "class" declarations anywhere in the diagram code.
   - The entire diagram must be completely black-and-white, plain, and standard out-of-the-box Mermaid rendering default styling.
   - Shape assignment must be handled entirely in the initial structural declaration string using the correct geometric bracket tokens exclusively: Square shapes [Text], Decision crossroads {Text}, or Rounded rectangles (Text).

5. STRIP TECHNICAL JARGON & TRANSLATE TO BUSINESS CAPABILITIES:
   - Aggressively translate developer-centric concepts into clear business terms.
   - ABSOLUTELY FORBIDDEN TERMS: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", "Controller", "Postgres", or specific database tool names.
   - Convert all components into broad functional organizational capabilities dynamically based on the payload context.

6. SEQUENCE MARKERS & CLOSED-LOOP NOTIFICATIONS:
   - Segment the master timeline chronologically using structural phase comment blocks.
   - Wherever an actor or component initiates a request, validation, or transaction submission, you MUST explicitly map the immediate return notification, error alert, or confirmation vector back to the initiator as the very next chronological link.

7. CHRONOLOGICAL INTEGER PATHS WITH ALPHABETIC SUB-INDEXING:
   - Prefix all main sequence timeline arrows with incremental sequential integers (e.g., 1., 2., 3.).
   - To illustrate closely bound child sub-processes, inner business validations, or instant request-response feedback pairs without inflating the macro step numbers, you MUST utilize alphabetical sub-indexing notation enclosed securely inside the arrow text strings (e.g., matching the pattern: Identifier_A -->|StepNumber. Action Description| Identifier_B, followed by Identifier_B -->|StepNumber-AlphaCharacter. Response Description| Identifier_A).

8. INLINE VALIDATION CROSSROADS:
   - Insert inline Mermaid decision diamond shapes directly within the local timeline flow inside the subgraphs where validations occur using correct curly braces syntax containing the question text (e.g., NodeName{"Is Action Valid?"}).
   - Branch the primary success path link directly out of the diamond using the next sequential identifier code, and branch the standard failure exception path out using a dashed line connection script (-.->) pointed to the relevant local rollback or alert component.

9. OUTPUT COMPLIANCE:
   - Output ONLY the raw Mermaid diagram code string starting directly with "graph TD".
   - You are STRICTLY FORBIDDEN from wrapping the output in markdown backticks, text code block fences, or appending introductory conversational pleasantries or closing remarks. Start instantly with the code string.

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}

--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 10000)}

Assistant:\n`;



    /* 96% accuracy prompt
    const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your task is to ingest technical system payload schemas and synthesize a high-readability, executive-level visual workflow diagram formatted strictly as a Mermaid.js flowchart utilizing a clean, strict top-down layout (graph TD).

=== TOP-DOWN VISUAL ANTI-SPIDERWEB ALGORITHMS (MANDATORY) ===

1. STRUCTURAL GATEWAY ROUTING (ANTI-SPIDERWEB RULE):
   - To completely eliminate crossing lines and messy "spiderweb" clutter, nodes buried deep inside a subgraph are STRICTLY FORBIDDEN from linking directly to nodes buried deep inside a different subgraph.
   - You MUST enforce a strict Hub-and-Spoke Gateway structure for every single subgraph:
     * Entrance Gate: Designate or create exactly ONE node at the top of the subgraph to act as the single entry point for all incoming external arrows (e.g., "Input_Registration").
     * Exit Gate: Designate or create exactly ONE node at the bottom of the subgraph to act as the single exit point for all outgoing external arrows (e.g., "Output_Context").
   - Inter-subgraph communication MUST only occur by linking the Exit Gate of a preceding subgraph directly to the Entrance Gate of the next chronological subgraph. Internal components must only link locally within their own boundary walls.

2. ABSOLUTE UNIQUE NAMESPACING & NO EMPTY CONTAINERS:
   - Every single subgraph block MUST possess a completely unique, lowercase, underscore-separated string identifier ID. NEVER reuse a subgraph ID string anywhere in the entire output, as this instantly crashes the renderer.
   - Every node variable identifier name within the entire diagram MUST be completely unique. Never use a variable name unless it has been explicitly defined with a text label inside its designated subgraph lane. No "ghost nodes" floating outside container walls are permitted.
   - CRITICAL PARSING CONSTRAINT: You are STRICTLY FORBIDDEN from declaring a subgraph identifier standalone on its own line under link sections without child components or functional connectivity (e.g., writing "Phase2_Cart_Stock" independently). This causes phantom spacing bloat in the visual grid layout.

3. STRICT PROCESS LOOP TERMINATION (NO GATEWAY SELF-LOOPS):
   - A gateway node or boundary exit component is STRICTLY FORBIDDEN from pointing directly back into itself (e.g., Node_A -->|Label| Node_A). 
   - Every operational loop, workflow timeline track, and final execution state must resolve forward and downward, terminating into a completely distinct, final tracking closure node at the bottom of the layout (e.g., End_Node["🏁 End Transaction Registry Close"]).

4. SEPARATION OF NODE SHAPE DEFINITIONS AND CLASS STYLING:
   - You are STRICTLY FORBIDDEN from trying to define geometric shapes inside a CSS styling rule (e.g., NEVER write "classDef node_name shape:diamond;"). This violates Mermaid property standards and causes compiler failure.
   - Shape assignment must be handled entirely in the initial structural declaration string using the correct geometric bracket tokens: Square shapes [Text], Decision crossroads {Text?}, or Rounded rectangles (Text). The "classDef" engine must exclusively modify layout fills, hex colors, borders, and dash arrays.

5. STRIP TECHNICAL JARGON & TRANSLATE TO BUSINESS CAPABILITIES:
   - Aggressively translate developer-centric concepts into clear business terms.
   - ABSOLUTELY FORBIDDEN TERMS: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", "Controller", "Postgres", or specific database names.
   - Convert all components into broad organizational capabilities.

6. PHASE-LEVEL MARKERS & CLOSED-LOOP NOTIFICATIONS:
   - Segment the master timeline chronologically using structural phase comment blocks (e.g., %% PHASE 1: [Name]).
   - Do not allow user actions or service inquiries to disappear into a vacuum. Wherever an actor or gate initiates a request, validation, or transaction submission, you MUST explicitly map the immediate return notification, error alert, or confirmation vector back to the initiator as the very next chronological link.

7. CHRONOLOGICAL INTEGER PATHS WITH ALPHABETIC SUB-INDEXING:
   - Prefix all main sequence timeline arrows with incremental sequential integers (e.g., 1., 2., 3.).
   - To illustrate closely bound child sub-processes, inner business validations, or instant request-response feedback pairs without inflating the macro step numbers, you MUST utilize alphabetical sub-indexing notation enclosed securely inside the arrow text strings (e.g., -->|1. Submit Request|, -->|1a. Success: Approved|, -.->|1b. Failure Exception|).

8. INLINE VALIDATION CROSSROADS:
   - Insert inline Mermaid decision diamond shapes ({Diamond Text?}) directly within the local timeline flow inside the subgraphs where validations occur.
   - Branch the primary "Happy Path" link directly out of the diamond using the next sequential identifier code, and branch the standard failure exception path out using a dashed line connection script (-.->) pointed to the relevant local rollback or alert component.

9. OUTPUT COMPLIANCE:
   - Output ONLY the raw Mermaid diagram code string starting directly with "graph TD".
   - You are STRICTLY FORBIDDEN from wrapping the output in markdown backticks (\`\`\`), text code block fences, or appending introductory conversational pleasantries or closing remarks. Start instantly with the code string.

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}

--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 10000)}

Assistant:\n`;

*/

    //90% accuracy prompt
/*    const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your task is to ingest technical system payload schemas and synthesize a high-readability, executive-level visual workflow diagram formatted strictly as a Mermaid.js flowchart utilizing a clean, strict top-down layout (graph TD).

=== TOP-DOWN VISUAL ANTI-SPIDERWEB ALGORITHMS (MANDATORY) ===

1. STRUCTURAL GATEWAY ROUTING (ANTI-SPIDERWEB RULE):
   - To completely eliminate crossing lines and messy "spiderweb" clutter, nodes buried deep inside a subgraph are STRICTLY FORBIDDEN from linking directly to nodes buried deep inside a different subgraph.
   - You MUST enforce a strict Hub-and-Spoke Gateway structure for every single subgraph:
     * Entrance Gate: Designate or create exactly ONE node at the top of the subgraph to act as the single entry point for all incoming external arrows (e.g., "Input_Registration").
     * Exit Gate: Designate or create exactly ONE node at the bottom of the subgraph to act as the single exit point for all outgoing external arrows (e.g., "Output_Context").
   - Inter-subgraph communication MUST only occur by linking the Exit Gate of a preceding subgraph directly to the Entrance Gate of the next chronological subgraph. Internal components must only link locally within their own boundary walls.

2. ABSOLUTE UNIQUE NAMESPACING FOR CONTAINERS & COMPONENTS:
   - Every single subgraph block MUST possess a completely unique, lowercase, underscore-separated string identifier ID . NEVER reuse a subgraph ID string anywhere in the entire output, as this instantly crashes the renderer.
   - Every node variable identifier name within the entire diagram MUST be completely unique. Never use a variable name unless it has been explicitly defined with a text label inside its designated subgraph lane. No "ghost nodes" floating outside container walls are permitted.

3. STRIP TECHNICAL JARGON & TRANSLATE TO BUSINESS CAPABILITIES:
   - Aggressively translate developer-centric concepts into clear business terms.
   - ABSOLUTELY FORBIDDEN TERMS: "API", "Endpoint", "DB", "DAL", "IAM", "JWT", "Token", "Microservice", "Adapter", "Ports", "Infrastructure", "Controller", "Postgres", or specific database names.
   - Convert all components into broad organizational capabilities .

4. PHASE-LEVEL MARKERS & CLOSED-LOOP NOTIFICATIONS:
   - Segment the master timeline chronologically using structural phase comment blocks (e.g., %% PHASE 1: [Name]).
   - Do not allow user actions or service inquiries to disappear into a vacuum. Wherever an actor or gate initiates a request, validation, or transaction submission, you MUST explicitly map the immediate return notification, error alert, or confirmation vector back to the initiator as the very next chronological link.

5. CHRONOLOGICAL INTEGER PATHS WITH ALPHABETIC SUB-INDEXING:
   - Prefix all main sequence timeline arrows with incremental sequential integers (e.g., 1., 2., 3.).
   - To illustrate closely bound child sub-processes, inner business validations, or instant request-response feedback pairs without inflating the macro step numbers, you MUST utilize alphabetical sub-indexing notation enclosed securely inside the arrow text strings (e.g., -->|1. Submit Request|, -->|1a. Success: Approved|, -.->|1b. Failure Exception|).

6. INLINE VALIDATION CROSSROADS:
   - Insert inline Mermaid decision diamond shapes ({Diamond Text?}) directly within the local timeline flow inside the subgraphs where validations occur.
   - Branch the primary "Happy Path" link directly out of the diamond using the next sequential identifier code, and branch the standard failure exception path out using a dashed line connection script (-.->) pointed to the relevant local rollback or alert component.

7. OUTPUT COMPLIANCE:
   - Output ONLY the raw Mermaid diagram code string starting directly with "graph TD".
   - You are STRICTLY FORBIDDEN from wrapping the output in markdown backticks (\`\`\`), text code block fences, or appending introductory conversational pleasantries or closing remarks. Start instantly with the code string.

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
