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
        
 const mermaidPrompt   = `You are a strict business domain analyst. Your sole objective is to read the architectural JSON payload below and print a short, sweet, purely functional breakdown of what each business object does.

STRICT FUNCTIONAL EXTRACTION MANDATE:
1. Read the provided "CORE_DOMAIN" attribute string and extract the exact literal text values from the "BusinessObjects" array.
2. For each unique entity string present in that array, execute a functional input-output analysis based entirely on its real-world purpose within the scope of the domain.
3. Print your analysis using the actual text string value of the entity as the heading title. You must fill out the fields dynamically with short, sweet business facts using this exact structure:

### Business Object Name
- **Input:** State the functional data or human action this item receives to begin.
- **Activity:** State the short real-world business verification or task it executes.
- **Output:** State the concrete resulting state or item it delivers downstream.

STRICT CONSTRAINTS:
- You are strictly FORBIDDEN from printing placeholder brackets, template text variables, or literal instruction examples. You must substitute the real names from the array directly.
- You are strictly FORBIDDEN from generating a Mermaid block, flowchart code, diagrams, or JavaScript blocks.
- Do not write introductions, prefaces, setup notes, or conversational footnotes. Start the output text block directly with the very first business object name from the payload array.

[SOURCE ARCHITECTURE PAYLOAD]:
\${rawJsonPayload}`;





    // =========================================================================

    // Write the prompt to an intermediate file to maximize llama-cli performance
    fs.mkdirSync(path.dirname(TMP_PROMPT_FILE), { recursive: true });
    fs.writeFileSync(TMP_PROMPT_FILE, mermaidPrompt, 'utf8');

    console.log("🤖 STEP 2: Streaming payload to llama-cli for Markdown rendering...");
    fs.mkdirSync(path.dirname(DIAGRAM_OUTPUT_FILE), { recursive: true });

    const args = [
    //'-hf', 'Qwen/Qwen3-8B-GGUF:Q4_K_M',
     '-hf','Qwen/Qwen2.5-Coder-14B-Instruct-GGUF:Q4_K_M',
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
