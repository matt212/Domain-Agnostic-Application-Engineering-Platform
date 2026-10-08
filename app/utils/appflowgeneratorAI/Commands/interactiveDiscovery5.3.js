const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process'); 
const readline = require('readline');

// ============================================================================
// DYNAMIC GLOBAL CONFIGURATION MATRIX (REFUCTORED FOR INTERACTIVE MODIFICATION)
// ============================================================================
const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    INPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput',
    INPUT_FILENAME: '6.Final-System-Architecture-Blueprint-Graph-2026-10-08T08-01-21-361Z.txt',
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '7.Refined-System-Architecture-'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    NGL: '0',
    MAX_TOKENS: '8048',         
    BATCH_SIZE: '2048', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  }
};

const INPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.INPUT_RELATIVE_DIR);
const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
const TMP_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// A helper loop wrapper to capture arbitrary business text from stdin safely
const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

/**
 * Dynamic File Scanner: Resolves string names matching most recent file modifications
 */
function resolveLatestDiagramFile(directory) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  
  const matchedFiles = files.filter(f => f.endsWith('.md'));
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
      '-o', finalTargetFilePath 
    ];

    console.log("\n⚙️ Spawning model... Processing tokens directly through system hardware layers. Please stand by...");
    
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
    console.log("🚀 INITIALIZING FAILSAFE NATIVE-REDIRECT DIAGRAM REFINEMENT ENGINE...");

    
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    // 1. Locate the latest markdown architecture file
    //const latestDiagramPath = resolveLatestDiagramFile(INPUT_DIR);
    //const latestDiagramPath = path.resolve(CONFIG.PATHS.PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput/6.Final-System-Architecture-Blueprint-Graph-2026-10-08T08-01-21-361Z.txt');
    const latestDiagramPath = path.join(
      CONFIG.PATHS.PROJECT_ROOT, 
      CONFIG.PATHS.INPUT_RELATIVE_DIR, 
      CONFIG.PATHS.INPUT_FILENAME
    );
    if (!latestDiagramPath) {
      throw new Error(`Could not automatically locate any previous .md diagram files inside your source folder directory: ${INPUT_DIR}`);
    }

    console.log(`\n📖 Target Diagram Found: ${path.basename(latestDiagramPath)}`);
    const existingDiagramContent = fs.readFileSync(latestDiagramPath, 'utf8');

    // 2. Open an unconstrained interactive prompt text capture
    console.log("\n=============================================================");
    console.log("✍️ DYNAMIC FLOW ARCHITECT REFINEMENT PORTAL");
    console.log("Describe what you want to modify, correct, or expand in the diagram.");
    console.log("You can input generic requests (e.g., 'make it clean top-down') or");
    console.log("highly specific logical changes (e.g., adding automated supplier pathways).");
    console.log("=============================================================");
    
    const userFixInput = await askQuestion("\nEnter your modification instructions:\n> ");

    if (!userFixInput || userFixInput.trim() === "") {
      throw new Error("Refinement cancelled: Refinement instruction input cannot be empty.");
    }
    // ============================================================================
    // UNIVERSAL DYNAMIC SYSTEM ADAPTIVE RECONCILIATION ENGINE PROMPT
    // ============================================================================
    const prompt = `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your task is to ingest an existing Mermaid.js diagram and apply a targeted set of business-driven refinements, architectural fixes, and flow expansions requested by a business stakeholder.

=== THE TARGET BUSINESS USER REFINEMENT DIRECTION ===
The user wants you to apply the following specific updates to the diagram topology:
"${userFixInput}"

=== CRITICAL COMPILER & SYNTAX SAFEGUARDS (ZERO PARSING ERRORS) ===

1. STRICT VARIABLE AND GEOMETRIC BRACKET SEPARATION:
   - Every node variable identifier name MUST be short, plain lowercase alphanumeric strings without any symbols, punctuation, colons, or brackets embedded inside them.
   - Text contents must be nested cleanly within structural geometric tokens exactly matching these layout patterns:
     * Standard Action Box: node_variable_name["1.a Step Label Text"]
     * Decision Diamond: decision_variable_name{"1.b Evaluation Question Text?"}
   - YOU ARE STRICTLY FORBIDDEN from wrapping bracket structural notation within other bracket notation text labels (e.g., Never write node labels containing nested brackets or braces).

2. NO RECURSIVE DIRECT SELF-LOOPS AND SYNTAX INVARIANTS:
   - YOU ARE ABSOLUTELY FORBIDDEN from linking a node identifier directly back into its exact identical variable identity code string (e.g., Never write: step_a --> step_a). 
   - Every single structural arrow edge link MUST point forward, downward, or via a controlled vertical step-back to a completely separate, unique variable target step. Infinite reflexive loops are strictly prohibited.
   - CRITICAL MERMAID GRAPH INITIALIZATION CONSTRAINT: Initialize all structural nodes using plain, valid naked Mermaid shape notation exclusively (e.g., node_a["Text"] and decision_b{"Text"}). Do not prepend or slip backslashes (\\) or escape characters into variable definitions. 
   - Ensure the diagram connections are written out cleanly exactly once. Do not repeat long, duplicated code iterations.

3. INLINE VALIDATION CROSSROADS & MANDATORY CONDITION STRINGS:
   - Insert inline Mermaid decision diamond shapes directly within the local timeline flow inside the subgraphs where evaluations occur using correct curly braces syntax containing plain text questions only.
   - CRITICAL ARROW CONDITION MANDATE: Every single structural arrow branching out from an evaluation decision diamond MUST be explicitly labeled with its corresponding conditional text tracking string enclosed in double quotes (e.g., decision_node -- "On Success" --> success_node). Naked arrows without text label conditions coming out of a decision diamond are strictly prohibited.
   - CRITICAL SYNTAX SAFEGUARD: You are STRICTLY FORBIDDEN from outputting HTML break tags (<br/>), forward slashes (/), backslashes (\\), or trailing whitespace blocks INSIDE the curly braces string {...} of a decision node identifier.
   - When writing conditional paths out of a decision node, use a standard arrow label pattern with solid lines exclusively. Never combine a double hyphen link text and an arrow link text on the same line.
   - CRITICAL CONNECTOR MANDATE: You are REQUIRED to use standard solid structural arrows (-->) for all directional paths, evaluation pathways, structural loops, and exception routing across the entire diagram layout to ensure uniform compiler compatibility.

=== TOP-DOWN VISUAL LAYOUT CONSTRAINTS (MANDATORY) ===

4. ANTI-LEAK SUBGRAPH CONTAINER ISOLATION (HUB-AND-SPOKE ENFORCEMENT):
   - Nodes inside a subgraph container are STRICTLY FORBIDDEN from linking directly to internal nodes inside a different subgraph container.
   - CRITICAL ANTI-SPIDERWEB BAN: You are STRICTLY FORBIDDEN from linking nodes horizontally, sideways, diagonally, or wrapping them in a circular web layout. The entire structure must cascade downward in a clear, sequential vertical hierarchy.
   - You MUST enforce a strict Hub-and-Spoke topology for inter-subgraph travel:
     * Entrance Hub Node: Designate or create exactly ONE node at the absolute top boundary inside each subgraph to act as the single entry point for all incoming external arrows.
     * Exit Hub Node: Designate or create exactly ONE node at the absolute bottom boundary inside each subgraph to act as the single exit point for all outgoing external arrows.
   - Inter-subgraph communication MUST occur exclusively by linking the Exit Hub Node of a preceding subgraph directly to the Entrance Hub Node of the next chronological subgraph.
   - EXCEPTION INTERCEPT ROUTING: Critical or irremediable system failures that cannot be resolved locally must step cleanly forward to their local home subgraph's Exit Hub Node, which then routes downward sequentially into the master tracking ledger phase at the bottom of the diagram. Leaping diagonally or jumping across random borders is strictly prohibited.
   - CRITICAL COMPILING CONSTRAINT: You are STRICTLY FORBIDDEN from linking a node variable identifier directly to an outer subgraph container name string ID block. Edges must ONLY connect explicit Node-to-Node targets.

5. CLEAN STACKED LOOPBACKS (NO SPIDERWEB INTERSECTIONS, NO FAILING-FORWARD):
   - To prevent overlapping cross-lines and spiderweb layouts while preserving vital state-remediation tracks, follow a strict vertical stack rule:
     * Runtime validation failures must route back up to an interactive staging step, input layer, or remediation node within the same subgraph so the thread does not fail-forward.
     * Ensure that a failure state node NEVER links directly forward into a success node. The line must run backward to an operational correction point to simulate real-world retries.
     * The loopback arrow MUST be drawn directly from the decision diamond up to the retry node without crossing any other horizontal or diagonal lines.
   - Every single subgraph block MUST possess a completely unique, lowercase, underscore-separated string identifier ID name. NEVER reuse a subgraph ID string anywhere in the entire output.
   - Every node variable identifier name within the entire diagram MUST be completely unique. Every variable identifier used anywhere in a layout link MUST be explicitly declared with its bracket shape and text label INSIDE its designated subgraph container before it be referenced in the connection streams. No uninitialized variables are permitted.

6. STATE CLEARANCE & RECOVERY LAYER STATE:
   - Before any runtime system state mutation, target resource allocation, or execution validation occurs, you MUST explicitly establish a logical Discovery & Curation layer immediately following the root initialization step.
   - Split exception paths cleanly based on the operational context:
     * CRITICAL SYSTEM FAULTS / AUDITS: Irremediable core infrastructure failures or global audit logs must be grouped logically. To prevent rendering layout clutter, compile your global system audit ledger as the final terminal Phase at the absolute bottom of the top-down chain.
     * FUNCTIONAL EXCEPTIONS: Standard validation issues must use local loopback routes to step backward within their immediate local staging group to ask for correction.
   - If an operational milestone breakdown occurs during data ingestion or processing, the processing thread must branch out of the validation point using standard solid structural connections back to the preceding operational stage to handle state substitution or corrections before proceeding.

=== STYLING, PARSING, AND INTERFACE LANGUAGE TRANSLATION ===

12. ABSOLUTE BAN of COLOR AND STYLING (NO COLOR POLICY):
   - You are STRICTLY FORBIDDEN from outputting any color configurations, color coding, styling templates, theme styles, or "classDef" / "class" declarations anywhere in the diagram code.
   - The entire diagram must be completely black-and-white, plain, and standard out-of-the-box Mermaid rendering default styling.

13. REVERSE PROCESSING STATE AUDIT LEDGER:
   - In the event of a downstream handover verification failure or execution rejection, you MUST route the process through an explicit business validation correction phase.
   - Do NOT allow returned, rejected, or failed items to instantly reset or release resources until a functional evaluation confirms they are viable for reprocessing or re-allocation. Use narrative business descriptions rather than technical infrastructure initialization states.

14. MANDATORY HIERARCHICAL STEP MULTI-CONTAINER PARTITIONING:
   - Every single functional component step, background operational task, decision gate, and staging node label text string MUST be strictly prefixed with its explicit hierarchical chronological position identifier.
   - Use strict numeric markers for primary system subgraphs and phased tracks, and lower-case alphabetical dot-notation identifiers for internal sequential actions and nested steps.
   - Follow this structural pattern for node labels, formatting them as clean, narrative business process sentences instead of string combinations divided by symbols or forward slashes:
      * Subgraph Container Level Pattern: subgraph phase_id [Phase Title / Scope]
      * Primary Internal Step Node Pattern: node_variable["Index.Sub-index Active Business Process Sentence"]
      * Evaluation Crossroads Node Pattern: decision_variable{"Index.Sub-index Functional Evaluation Question?"}
   - You are strictly forbidden from outputting unnumbered, orphaned, or un-indexed functional text labels across the entire diagram canvas.

15. SEQUENCE MARKERS & CLOSED-LOOP NOTIFICATIONS:
   - Segment the master timeline chronologically using structural phase comment blocks matching the major serialized prefixes.
   - Wherever an actor initiates a request, validation, or transaction submission, you MUST explicitly map the immediate functional response, warning message, or milestone confirmation step directly back to that initiator as the very next chronological link, written as a clear narrative business acknowledgement.

16. CHRONOLOGICAL PATHS WITH UNIFORM ARROW LINK FORMATTING:
   - Use standard solid arrow label brackets to label chronological state changes explicitly using descriptive business text strings based directly on the ingested matrix data.
   - For alternate paths or loop rollbacks, clearly describe the processing action using a distinct contextual indicator string enclosed inside the solid arrow label brackets.

17. CRITICAL OUTPUT FORMAT COMPLIANCE:
   - Output the Mermaid diagram code cleanly nested inside standard markdown code block fences using three consecutive backticks followed by the word mermaid to start, and three consecutive backticks to close. This ensures the rendering interface presents it as a copy-pasteable object block.
   - Do not prepend conversational filler words, markdown descriptions, or post-processing commentary; deliver the fenced code block instantly.

=== EXISTING INPUT DIAGRAM SOURCE CODE ===
${existingDiagramContent}
Assistant:
`;const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalOutputPath = path.join(OUTPUT_DIR, `${CONFIG.PATHS.EXPORT_PREFIX}${timestamp}.md`);
    
    // Execute the adaptive refinement pass via native hardware token routing
    await executeLlamaCliWithNativeRedirect(prompt, 'interactive_diagram_refinement', finalOutputPath);
    
    console.log(`\n\n\x1b[32m✔ Success! The requested adjustments have been engineered smoothly.\x1b[0m`);
    console.log(`👉 Your updated corporate workflow diagram is saved at: ${finalOutputPath}\n`);

  } catch (err) {
    console.error(`\n\x1b[31m✕ Pipeline Execution Interrupted:\x1b[0m`, err.message);
  } finally {
    rl.close();
  }
})();