const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// 1. Core Workspace Paths
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const SOURCE_TXT_FILE = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput/business-architecture-final.txt');
const DIAGRAM_OUTPUT_FILE = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput/business-architecture-diagrams.md');
const TMP_PROMPT_FILE = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile/tmp_mermaid_prompt.txt');

(async () => {
  try {
    console.log("🗂️ PHASE 3: Initiating Semantic Text Extraction & Mermaid Compilation...");

    if (!fs.existsSync(SOURCE_TXT_FILE)) {
      throw new Error(`CRITICAL EXCEPTION: Architecture file missing at \${SOURCE_TXT_FILE}`);
    }

    // Read the text file containing the output prompts and json payload
    const rawTxtContent = fs.readFileSync(SOURCE_TXT_FILE, 'utf8');

    // NATIVE ISOLATION MATRIX: Grabs everything appearing after the "Assistant:" marker
    const markerToken = "Assistant:";
    const markerIndex = rawTxtContent.indexOf(markerToken);
    if (markerIndex === -1) {
      throw new Error("❌ CRITICAL ERROR: Could not locate the baseline 'Assistant:' marker within the source file.");
    }

    const rawJsonPayload = rawTxtContent.substring(markerIndex + markerToken.length).trim();

    // Verify it is clean parsable JSON before stressing the model context
    try {
      JSON.parse(rawJsonPayload);
      console.log("✅ JSON validation passed. Constructing dynamic Mermaid generation prompt...");
    } catch (e) {
      throw new Error("❌ CRITICAL ERROR: Isolated text block is not valid JSON. Cannot build diagram loops.");
    }

    // =========================================================================
    // 2. CHANGED SECTION: CONSTRUCT GENERATIVE MERMAID PROMPT TEMPLATE WITH HEADERS
    // =========================================================================
        // 2. CONSTRUCT GENERATIVE MERMAID PROMPT TEMPLATE FOR JOURNEY DOCUMENTATION
        // 2. CONSTRUCT GENERATIVE MERMAID PROMPT TEMPLATE FOR CLEAN FLOWCHART RENDERING
        // 2. CONSTRUCT GENERATIVE MERMAID PROMPT TEMPLATE FOR CLEAN LINEAR FLOWCHARTS
       // 2. CONSTRUCT MERMAID PROMPT TEMPLATE WITH MANDATORY INDENTATIONS AND LAYOUT RULES
       // 2. CONSTRUCT MERMAID PROMPT TEMPLATE WITH DYNAMIC NON-REPETITION CONSTRAINTS
        // 2. CONSTRUCT MERMAID PROMPT TEMPLATE WITH MANDATORY CODE BLOCK ENCLOSURES
    const mermaidPrompt = `You are an expert Systems Architect specializing in visual workflow layout notation. Your sole objective is to read the architectural JSON payload below and translate it into a perfectly formatted, clean, linear 'flowchart TD' Mermaid diagram.

STRICT VISUAL & REPETITION MANDATES:
1. CODE BLOCK INITIALIZATION: You MUST start the output with the literal markdown code block wrapper "\`\`\`mermaid" on its own line.
2. FLOWCHART NOTATION: Directly below the wrapper line, write the literal keyword "flowchart TD" on its own line.
3. FORCE 4-SPACE INDENTATION: Every single line of code inside the diagram following "flowchart TD" MUST begin with exactly four leading spaces.
4. GRAPH COMPILATION CONSTRAINTS:
    - Include 'classDef actor fill:#f7f7f7,stroke:#555,stroke-width:2px;' as the first block configuration line.
    - Render the primary operational actor node at the top using uppercase 'A' variable name and bind the actor class directly to it using the clean inline suffix format: A["ACTOR: [ActorName]"]:::actor
    - MANDATORY ACTOR CONNECTION: You MUST explicitly connect the root actor node 'A' directly to the first core operational object identifier node using a labeled arrow link matching this exact format: A -->|"Initiates Workflow"| NODE_ID
    - Declare each unique object node exactly ONCE using a clean multiline layout format containing the entity name and its parent module name (e.g., NODE_ID["Object Name<br/>Module: Context Module"]).
    - Map out the directional paths based strictly on the unique object identifiers using labeled arrows: nodeA -->|"Action Label"| nodeB.
    - CRITICAL TEXT REPLACEMENT RULE: You are strictly FORBIDDEN from including the colon character ":" inside any arrow label text. If a relationship has a string layout like "Owns (1:M)", you MUST strip the colon or replace it with a space or dash (e.g., change it to "Owns 1 to M" or "Owns 1-M") to prevent the Mermaid parser from crashing.
    - ANTI-LOOP FILTER: You are strictly FORBIDDEN from mapping an edge relation path back onto the exact same node (e.g., do not output nodeA --> nodeA), and you are strictly FORBIDDEN from repeating an identical directional relationship connection that has already been declared.
5. CODE BLOCK TERMINATION: You MUST close the diagram block by outputting the literal markdown code block enclosure "\`\`\`" on its own line at the very end of the file.
6. NO EXTRA CHATTER: Do not write explanations, introductions, or conversational footnotes. Output the markdown diagram syntax text directly.

[SOURCE ARCHITECTURE PAYLOAD]:
${rawJsonPayload}


`;
    // =========================================================================

    // Write the prompt to an intermediate file to maximize llama-cli performance
    fs.mkdirSync(path.dirname(TMP_PROMPT_FILE), { recursive: true });
    fs.writeFileSync(TMP_PROMPT_FILE, mermaidPrompt, 'utf8');

    console.log("🤖 STEP 2: Streaming payload to llama-cli for Markdown rendering...");
    fs.mkdirSync(path.dirname(DIAGRAM_OUTPUT_FILE), { recursive: true });

    const args = [
      '-hf', 'Qwen/Qwen3-8B-GGUF:Q4_K_M',
      '-ngl', '99',
      '--single-turn',
      '--reasoning', 'off',
      '-f', TMP_PROMPT_FILE,
      '-n', '2048',
      '-o', DIAGRAM_OUTPUT_FILE
    ];

    // Fire the single-turn AI model pass to render the clean diagrams document
    execFile('llama-cli', args, (error) => {
      // Cleanup scratchpad files instantly post-execution
      if (fs.existsSync(TMP_PROMPT_FILE)) fs.unlinkSync(TMP_PROMPT_FILE);

      if (error) {
        console.error(`❌ Diagram generation crash: ${error.message}`);
        process.exit(1);
      }

      console.log(`\n✅ PIPELINE SUCCESS: Interactive Mermaid markdown diagrams generated successfully!\n🔗 Saved to: ${DIAGRAM_OUTPUT_FILE}`);
    });

  } catch (err) {
    console.error(`\n❌ CRITICAL SYSTEM INTERRUPT: ${err.message}`);
    if (fs.existsSync(TMP_PROMPT_FILE)) fs.unlinkSync(TMP_PROMPT_FILE);
    process.exit(1);
  }
})();
