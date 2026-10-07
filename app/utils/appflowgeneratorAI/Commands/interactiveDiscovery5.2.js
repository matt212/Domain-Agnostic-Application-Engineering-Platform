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


    const prompt= `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your task is to ingest abstract technical system payload schemas and synthesize a high-readability, executive-level visual workflow diagram formatted strictly as a Mermaid.js flowchart utilizing a clean, strict top-down layout (graph TD).

=== CRITICAL COMPILER & SYNTAX SAFEGUARDS (ZERO PARSING ERRORS) ===

1. STRICT VARIABLE AND GEOMETRIC BRACKET SEPARATION:
   - Every node variable identifier name MUST be short, plain lowercase alphanumeric strings without any symbols, punctuation, colons, or brackets embedded inside them.
   - Text contents must be nested cleanly within structural geometric tokens exactly matching these layout patterns:
     * Correct Standard Box: node_variable_name["Functional Component Step Label String Text"]
     * Correct Decision Diamond: decision_variable_name{"Conditional Evaluation Diamond Question Text"}
   - YOU ARE STRICTLY FORBIDDEN from wrapping bracket structural notation within other bracket notation text labels (e.g., Never write: node_name["node_name{Text}"]).

2. NO RECURSIVE SELF-LOOPS AND CONNECTIONS:
   - YOU ARE ABSOLUTELY FORBIDDEN from linking a node identifier back into its exact identical variable identity code string (e.g., Never write: exit_node_4 --> exit_node_4). Every arrow link MUST point forward, downward, or via a controlled, single-step vertical step-back to a completely different, unique variable identity target step. Horizontal or diagonal loopbacks are strictly forbidden.
   - Ensure the diagram connections are written out cleanly exactly once. Do not repeat long, duplicated code iterations.

3. INLINE VALIDATION CROSSROADS & VALID MERMAID LINK SYNTAX:
   - Insert inline Mermaid decision diamond shapes directly within the local timeline flow inside the subgraphs where evaluations occur using correct curly braces syntax containing plain text questions only.
   - CRITICAL SYNTAX SAFEGUARD: You are STRICTLY FORBIDDEN from outputting HTML break tags (<br/>), forward slashes (/), backslashes (\), or trailing whitespace blocks INSIDE the curly braces string {...} of a decision node identifier. 
   - When writing conditional paths out of a decision node, use a standard arrow label pattern with solid lines exclusively. Never combine a double hyphen link text and an arrow link text on the same line.
   - CRITICAL CONNECTOR MANDATE: You are REQUIRED to use standard solid structural arrows (-->) for all directional paths, evaluation pathways, structural loops, and exception routing across the entire diagram layout to ensure uniform compiler compatibility.
   - STRING ENCAPSULATION MANDATE: All connection label text strings MUST be enclosed in double quotes (e.g., nodeA -- "Yes (Validated)" --> nodeB) to isolate special characters and prevent compilation parser errors.

=== TOP-DOWN VISUAL LAYOUT CONSTRAINTS (MANDATORY) ===

4.ANTI-LEAK SUBGRAPH CONTAINER ISOLATION (HUB-AND-SPOKE ENFORCEMENT):
   - Nodes inside a subgraph container are STRICTLY FORBIDDEN from linking directly to internal nodes inside a different subgraph container.
   - CRITICAL ANTI-SPIDERWEB BAN: You are STRICTLY FORBIDDEN from linking nodes horizontally, sideways, diagonally, or wrapping them in a circular web layout. The entire structure must cascade downward in a clear, sequential vertical hierarchy.
   - You MUST enforce a strict Hub-and-Spoke topology for inter-subgraph travel:
     * Entrance Node: Designate or create exactly ONE node at the absolute top boundary of the subgraph to act as the single entry point for all incoming external arrows.
     * Exit Node: Designate or create exactly ONE node at the absolute bottom boundary of the subgraph to act as the single exit point for all outgoing external arrows.
   - Inter-subgraph communication MUST occur exclusively by linking the Exit Node of a preceding subgraph directly to the Entrance Node of the next chronological subgraph.
   - EXCEPTION INTERCEPT ROUTING: Mid-flight failure/exception nodes are STRICTLY FORBIDDEN from linking directly to a nested global closure node inside another subgraph. Instead, all validation failure/alert nodes must exit their home subgraph by routing exclusively through that home subgraph's dedicated "Exit Node" or to a root-declared global entrance proxy node. 
   - CRITICAL COMPILING CONSTRAINT: You are STRICTLY FORBIDDEN from linking a node variable identifier directly to an outer subgraph container name string ID block. Edges must ONLY connect explicit Node-to-Node targets.


5. CLEAN STACKED LOOPBACKS (NO SPIDERWEB INTERSECTIONS):
   - To prevent overlapping cross-lines and spiderweb layouts while preserving vital state-remediation tracks, follow a strict vertical stack rule:
     * Runtime validation failures (e.g., resource unavailable, validation mismatch) must route straight up into the immediate preceding interface staging step *within the same vertical stack*.
     * The loopback arrow MUST be drawn directly from the decision diamond up to the retry node without crossing any other horizontal or diagonal lines.
   - Every single subgraph block MUST possess a completely unique, lowercase, underscore-separated string identifier ID name. NEVER reuse a subgraph ID string anywhere in the entire output.
   - Every node variable identifier name within the entire diagram MUST be completely unique. Every variable identifier used anywhere in a layout link (including all entry points, exit points, and operational alert nodes) MUST be explicitly declared with its bracket shape and text label INSIDE its designated subgraph container before it is referenced in the connection streams. No uninitialized variables are permitted.

6. STATE CLEARANCE & RECOVERY LAYER STATE:
   - Before any runtime system state mutation, target resource allocation, or execution validation occurs, you MUST explicitly establish a logical Discovery & Curation layer immediately following the root initialization step.
   - Split exception paths cleanly based on the operational context:
     * CRITICAL SYSTEM FAULTS: Malicious anomalies or core authorization infrastructure failures must route directly into a "Global Infrastructure Audit Ledger".
     * FUNCTIONAL EXCEPTIONS: Standard, routine state validation anomalies (e.g., transaction rejected, boundary invalid, resource window full) must NEVER terminate in a dead-end log. They must step back directly to the local Interactive Interface staging layer to prompt immediate actor remediation actions.
   - If an operational milestone breakdown occurs during data ingestion or processing, the processing thread must branch out of the validation point using standard solid structural connections back to the preceding operational stage to handle state substitution or corrections before proceeding.


=== UNIVERSAL STATE INVARIANTS (NO LOOSE ENDS) ===

7. INLINE COMPONENT SCOPING SYSTEM INVARIANT:
   - Every single validation decision diamond, functional exception check, and alternate recovery track node MUST be declared explicitly INSIDE the same subgraph block container where its primary operational activity executes. 
   - You are strictly forbidden from placing validation crossroads or failure vectors outside of their home subgraph boundaries to prevent intersecting lines across containers.

8. STATE CLEARANCE & MUTATION COMMIT SYNCHRONIZATION:
   - You must enforce a strict chronological state dependency regarding core clearance approvals and structural record generation. 
   - A structural baseline state or system execution artifact cannot be officially designated as "Created," "Committed," or "Finalized" until AFTER a successful authorization/settlement status is achieved in the gating confirmation node.
   - The flow must strictly map: Clearance Gating Verification -> Authorized State Status -> Post-Clearance Document/Record Creation -> Downstream Fulfillment/Resource Assignment Execution.

9. TRANSACTIONAL EXCEPTION RESILIENCY:
   - If a standard business logic validation variance occurs, the execution thread must never terminate into a permanent global system closure state.
   - The thread must route directly and vertically backward to the immediate preceding interactive interface staging layer within its own local stack to permit immediate data correction.


=== DATA MATRIX RECONCILIATION & SYNTHESIS (HYPER-INTELLIGENCE) ===

10. FULL DYNAMIC INGESTION MANDATE:
    - The output structural phases, nodes, logic trees, text labels, descriptions, and loop flows MUST be dynamically extracted, synthesized, and populated directly and exclusively from the raw data values passed into the input payload matrices below.
    - Concurrently analyze all three provided data matrices to build a seamless workflow with zero disconnected blocks:
      * The Structural Map: Use the 'COMPONENT LAYOUT OBJECTS' matrix to identify your core system entities, inputs, activities, and outputs.
      * The Security Permissions: Use the 'ROLE SET VALIDATIONS' matrix to determine which operational actions, creations, mutations, and status modifications are authorized for specific actors.
      * The Chronological Timeline: Use the 'CHRONOLOGICAL JOURNEY TRACKS' matrix as the master timeline blueprint to establish the exact sequential ordering of execution steps.
    - RECONCILIATION RULE: For every step derived from the Chronological Journey Tracks, cross-reference the Component Layout Objects to extract its specific processing activity, inputs, and outputs. Then, cross-reference the Role Set Validations to ensure the node descriptions reflect the authorized capabilities and business guardrails of the acting role. Do not let any data element from one matrix contradict or become isolated from the others.

11. DETERMINISTIC ENTRANCE STATE INITIALIZATION:
    - To establish a flawless starting point with no loose ends, search the 'CHRONOLOGICAL JOURNEY TRACKS' matrix for 'Step 1' of the primary initiator role. 
    - This exact milestone MUST serve as the absolute root initialization step for the entire diagram.
    - Synthesize this step with its corresponding entity in the 'COMPONENT LAYOUT OBJECTS' matrix to form the single Entrance Node of Subgraph 1. 
    - Every subsequent path, authorization check, and system state must cascade sequentially downward from this single, deterministic starting point.

=== STYLING, PARSING, AND INTERFACE LANGUAGE TRANSLATION ===

12. ABSOLUTE BIFT OF COLOR AND STYLING (NO COLOR POLICY):
   - You are STRICTLY FORBIDDEN from outputting any color configurations, color coding, styling templates, theme styles, or "classDef" / "class" declarations anywhere in the diagram code.
   - The entire diagram must be completely black-and-white, plain, and standard out-of-the-box Mermaid rendering default styling.
13. REVERSE PROCESSING STATE AUDIT LEDGER:
   - In the event of a downstream handover verification failure or execution rejection, you MUST route the system entities through an explicit "Verification Quarantine & Inspection Staging" phase.
   - Do NOT allow returned or failed assets to trigger an instantaneous "Resource Release" update until an active evaluation lifecycle marks the entities as viable for re-allocation.


14. SEQUENCE MARKERS & CLOSED-LOOP NOTIFICATIONS:
   - Segment the master timeline chronologically using structural phase comment blocks.
   - Wherever an actor or component initiates a request, validation, or transaction submission, you MUST explicitly map the immediate return notification, error alert, or confirmation vector back to the initiator as the very next chronological link.

15. CHRONOLOGICAL PATHS WITH UNIFORM ARROW LINK FORMATTING:
   - Use standard solid arrow label brackets to label chronological state changes explicitly using descriptive business text strings based directly on the ingested matrix data.
   - For alternate paths or loop rollbacks, clearly describe the processing action using a distinct contextual indicator string enclosed inside the solid arrow label brackets.

16. CRITICAL OUTPUT FORMAT COMPLIANCE:
• Output the Mermaid diagram code cleanly nested inside standard markdown code block fences (\`\`\`mermaid) to ensure the rendering interface presents it as a copy-pasteable object block. Do not prepend conversational filler words or post-processing commentary; deliver the fenced code block instantly.
=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}
--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}
--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 10000)}
Assistant:


 `

    /*
    const prompt=`
    You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your task is to ingest technical system payload schemas and synthesize a high-readability, executive-level visual workflow diagram formatted strictly as a Mermaid.js flowchart utilizing a clean, strict top-down layout (graph TD).

=== TOP-DOWN VISUAL LAYOUT CONSTRAINTS (MANDATORY) ===

1. STRUCTURAL GATEWAY ROUTING LAYER (HUB-AND-SPOKE SANITIZATION):
   - Nodes inside a subgraph container are STRICTLY FORBIDDEN from linking directly to internal nodes inside a different subgraph container.
   - You MUST enforce a strict Hub-and-Spoke topology for every single subgraph block:
     * Entrance Node: Designate or create exactly ONE node at the absolute top boundary of the subgraph to act as the single entry point for all incoming external arrows.
     * Exit Node: Designate or create exactly ONE node at the absolute bottom boundary of the subgraph to act as the single exit point for all outgoing external arrows.
   - Inter-subgraph communication MUST occur exclusively by linking the Exit Node of a preceding subgraph directly to the Entrance Node of the next chronological subgraph.
   - CRITICAL COMPILING CONSTRAINT: You are STRICTLY FORBIDDEN from linking a node variable identifier directly to an outer subgraph container name string ID block. Edges must ONLY connect explicit Node-to-Node targets.

2. UNIQUE CONTAINER & VARIABLE BALANCING:
   - Every single subgraph block MUST possess a completely unique, lowercase, underscore-separated string identifier ID name. NEVER reuse a subgraph ID string anywhere in the entire output.
   - Every node variable identifier name within the entire diagram MUST be completely unique. Every variable identifier used anywhere in an arrow link (including all Entrance and Exit nodes) MUST be explicitly declared with its bracket shape and text label INSIDE its designated subgraph block definition before it is linked. No uninitialized variables floating outside container walls are permitted.
   - You are STRICTLY FORBIDDEN from declaring a subgraph identifier standalone on its own line under link sections without child components or functional connectivity.

3. STRICT PROCESS LOOP TERMINATION & FORWARD MOTION:
   - A gateway node or boundary exit component is STRICTLY FORBIDDEN from pointing directly back into itself.
   - Every operational loop, validation track, and final execution state must resolve forward and downward, terminating into a completely distinct, final tracking closure node at the bottom of the layout layer.

=== UNIVERSAL TRANSACTIONAL STATE INVARIANTS (NO LOOSE ENDS) ===

4. THE INITIAL DISCOVERY & CURATION LAYER STATE:
   - Before any transactional commit, resource allocation, or logistical verification occurs, you MUST explicitly establish a logical Discovery & Curation layer immediately following the root initialization/access step.
   - The workflow must natively map the interactive sequence where an actor navigates classifications, queries datasets, evaluates item metrics, and aggregates choices into a temporary staging state (e.g., shopping cart, queue, staging list) before triggering target actions.

5. POST-SETTLEMENT TRANSACTION COMMIT SYNCHRONIZATION:
   - You must enforce a strict chronological state dependency regarding financial settlement and structural record creation. 
   - A core Transactional Record or Final Order Document cannot be officially designated as "Created," "Committed," or "Finalized" until AFTER a successful authorization/settlement status is achieved in the payment/billing validation node.
   - The flow must strictly map: Financial Settlement Verification -> Authorized Status -> Post-Settlement Document Creation -> Downstream Fulfillment/Resource Assignment Execution.

6. MID-FLIGHT EXCEPTION HANDLING & TRANSACTIONAL ROLLBACKS:
   - You must ensure there are ZERO dead ends or unhandled operational loops for failures occurring mid-process.
   - If a failure, exception, or cancellation trigger occurs AFTER a successful transaction settlement status but BEFORE final delivery/handover, the exception path must immediately branch via a dashed line connection script (-.->) out of the validation diamond.
   - This failure track must bypass normal forward progression, route directly through a reversing ledger/compensation action, and terminate cleanly into a distinct, final system disruption closure node at the bottom of the architecture.

=== DATA MATRIX RECONCILIATION & SYNTHESIS (HYPER-INTELLIGENCE) ===

7. TRIPLE-MATRIX CROSS-REFERENCE ENFORCEMENT:
    - You MUST concurrently analyze all three provided data matrices to build a seamless workflow with zero disconnected blocks:
      * The Structural Map: Use the 'COMPONENT LAYOUT OBJECTS' matrix to identify your core system entities, inputs, activities, and outputs.
      * The Security Permissions: Use the 'ROLE SET VALIDATIONS' matrix to determine which operational actions, creations, mutations, and status modifications are authorized for specific actors.
      * The Chronological Timeline: Use the 'CHRONOLOGICAL JOURNEY TRACKS' matrix as the master timeline blueprint to establish the exact sequential ordering of execution steps.
    - RECONCILIATION RULE: For every step derived from the Chronological Journey Tracks, cross-reference the Component Layout Objects to extract its specific processing activity, inputs, and outputs. Then, cross-reference the Role Set Validations to ensure the node descriptions reflect the authorized capabilities and business guardrails of the acting role. Do not let any data element from one matrix contradict or become isolated from the others.

8. DETERMINISTIC ENTRANCE STATE INITIALIZATION:
    - To establish a flawless starting point with no loose ends, search the 'CHRONOLOGICAL JOURNEY TRACKS' matrix for 'Step 1' of the primary initiator role. 
    - This exact milestone MUST serve as the absolute root initialization step for the entire diagram.
    - Synthesize this step with its corresponding entity in the 'COMPONENT LAYOUT OBJECTS' matrix to form the single Entrance Node of Subgraph 1. 
    - Every subsequent path, authorization check, and system state must cascade sequentially downward from this single, deterministic starting point.

=== STYLING, PARSING, AND INTERFACE LANGUAGE TRANSLATION ===

9. ABSOLUTE SHAPE DEFINITION & SYNTAX VALIDATION RULES:
   - Every node variable identifier name MUST be short, plain lowercase alphanumeric strings without any symbols or brackets embedded inside them.
   - Text contents must be nested cleanly within structural geometric tokens exactly matching these layout patterns:
     * Correct: node_variable_name["Business Process Box Label String Text"]
     * Correct: decision_variable_name{"Business Evaluation Diamond Question Text"}
   - YOU ARE STRICTLY FORBIDDEN from wrapping bracket structural notation within other bracket notation (e.g., Never write: node_name["node_name{Text}"]).
   - Nodes are strictly forbidden from pointing directly back into themselves as an isolated arrow link loop.


10. TECHNICAL JARGON REPLACEMENT GLOSSARY (DOMAIN AGNOSTIC):
   - Aggressively translate developer-centric engineering syntax into clear business capability terms.
   - Use the following token translation map to intercept and convert forbidden architectural vocabulary:

     | Forbidden Technical/Engineering Jargon | Mandatory Business Translation Equivalent |
     |---------------------------------------|--------------------------------------------|
     | API / Endpoint / Microservice         | Service Interface / Functional Capability  |
     | DB / DAL / Postgres / Database / SQL  | Information Registry / Ledger / Data Base |
     | IAM / JWT / Token / Auth Cookie       | Access Credentials / Verified Identity Sec |
     | Webhook / Event Trigger / Kafka       | State Change Update / Notification Vector  |
     | UI / Frontend / Screen / View / Page  | Visual Interface / Interactive Presentation|

11. SEQUENCE MARKERS & CLOSED-LOOP NOTIFICATIONS:
   - Segment the master timeline chronologically using structural phase comment blocks.
   - Wherever an actor or component initiates a request, validation, or transaction submission, you MUST explicitly map the immediate return notification, error alert, or confirmation vector back to the initiator as the very next chronological link.

12. CHRONOLOGICAL PATHS WITH HYPHENATED ALPHABETIC SUB-INDEXING:
    - Prefix macro timeline arrows with incremental sequential integers (e.g., 1., 2., 3.).
    - To illustrate closely bound child sub-processes, inner business validations, or instant request-response feedback loops, you MUST utilize a strict hyphenated alphabetic modifier for exception/failure tracks, following this exact template pattern:
      * Primary Success Path: |3.2. Action Validation Success|
      * Secondary Failure/Exception Path: |3.2-A. Action Validation Failure Rollback|

13. INLINE VALIDATION CROSSROADS:
    - Insert inline Mermaid decision diamond shapes directly within the local timeline flow inside the subgraphs where validations occur using correct curly braces syntax containing the question text (e.g., NodeName{"Is Action Valid?"}).
    - Branch the primary success path link directly out of the diamond using the next sequential identifier code, and branch the standard failure exception path out using a dashed line connection script (-.->) pointed to the relevant local rollback or alert component.

14. CRITICAL OUTPUT FORMAT COMPLIANCE:
    - Output ONLY the raw Mermaid diagram code string starting directly with the text block: graph TD
    - You are STRICTLY FORBIDDEN from wrapping the output in markdown backticks, , or appending introductory conversational pleasantries or closing remarks. Start instantly with the raw text string code.

=== SOURCE INPUT PAYLOAD DATA ===
--- COMPONENT LAYOUT OBJECTS ---
${objectsMatrixContent.substring(0, 8000)}}

--- ROLE SET VALIDATIONS ---
${actorsMatrixContent.substring(0, 8000)}}

--- CHRONOLOGICAL JOURNEY TRACKS ---
${journeysMatrixContent.substring(0, 8000)}}

Assistant:

    
    `;
    */
   //100% accuracy prompt
   /* 
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

*/

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
