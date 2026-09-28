const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// 1. Core Workspace File Configurations
const P1_OUTPUT = path.join(__dirname, 'app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b25.txt');
const P2_PROMPT_TEMPLATE = path.join(__dirname, 'app/utils/appflowgeneratorAI/promptFile/business-relations-prompt.txt');
const TMP_COMPILE_P2 = path.join(__dirname, 'app/utils/appflowgeneratorAI/promptFile/tmp_p2_compiled.txt');
const FINAL_ARCHITECTURE_OUTPUT = path.join(__dirname, 'app/utils/appflowgeneratorAI/aiOutput/business-architecture-final.txt');

(async () => {
  try {
    console.log("🔄 PHASE 2: Initiating Relational Extraction and Compilation Engine...");

    // Hard clean intermediate workspaces to protect against previous run caches
    if (fs.existsSync(TMP_COMPILE_P2)) fs.unlinkSync(TMP_COMPILE_P2);
    if (fs.existsSync(FINAL_ARCHITECTURE_OUTPUT)) fs.unlinkSync(FINAL_ARCHITECTURE_OUTPUT);

    if (!fs.existsSync(P1_OUTPUT)) {
      throw new Error(`CRITICAL EXCEPTION: Phase 1 source payload missing at ${P1_OUTPUT}`);
    }

    // Read Phase 1 file content
    const p1Content = fs.readFileSync(P1_OUTPUT, 'utf8');
    
    // NATIVE AWK FUNCTIONALITY: Grab everything strictly appearing after the "Assistant:" line
    const assistantMarker = "Assistant:";
    const markerIndex = p1Content.indexOf(assistantMarker);
    if (markerIndex === -1) {
      throw new Error("❌ CRITICAL ERROR: Could not locate the baseline 'Assistant:' marker block inside Pass 1 payload.");
    }
    
    const isolatedJsonBlock = p1Content.substring(markerIndex + assistantMarker.length).trim();

    console.log("🔍 STEP 2: Extracting variables from isolated JSON block...");

    // NATIVE GREP/SED: Extract CORE_DOMAIN value string dynamically using clean regex parsing
    const coreDomainMatch = isolatedJsonBlock.match(/"CORE_DOMAIN"\s*:\s*"([^"]+)"/);
    const BUSINESS_IDEA = coreDomainMatch ? coreDomainMatch[1] : null;

    // NATIVE SED ARRAY EXTRACTOR: Isolate the complete flat BusinessObjects array block natively
    const arrayStartPattern = /"BusinessObjects"\s*:\s*\[/;
    const startMatch = isolatedJsonBlock.match(arrayStartPattern);
    
    let PASSED_OBJECTS_ARRAY = null;
    if (startMatch) {
      const startIndex = startMatch.index + startMatch[0].indexOf('[');
      let bracketCount = 0;
      let endIndex = -1;

      // Scan characters sequentially to find matching closing bracket balanced state
      for (let i = startIndex; i < isolatedJsonBlock.length; i++) {
        if (isolatedJsonBlock[i] === '[') bracketCount++;
        if (isolatedJsonBlock[i] === ']') bracketCount--;
        if (bracketCount === 0) {
          endIndex = i;
          break;
        }
      }
      
      if (endIndex !== -1) {
        // Collapse whitespace arrays onto one single line mirroring tr -d '\n\r'
        PASSED_OBJECTS_ARRAY = isolatedJsonBlock.substring(startIndex, endIndex + 1).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
      }
    }

    // Quick validation checkpoint validation loop before firing binary parameters
    if (!BUSINESS_IDEA || !PASSED_OBJECTS_ARRAY) {
      throw new Error("❌ CRITICAL ERROR: Extraction anomaly. Valid schema fields could not be parsed from JSON payload data.");
    }

    console.log("📝 STEP 3: Injecting variables into Pass 2 layout file safely...");
    if (!fs.existsSync(P2_PROMPT_TEMPLATE)) {
      throw new Error(`CRITICAL EXCEPTION: Prompt relations template file missing at ${P2_PROMPT_TEMPLATE}`);
    }

    let p2TemplateContent = fs.readFileSync(P2_PROMPT_TEMPLATE, 'utf8');

    // NATIVE ENVSUBST DUPLICATION: Replaces standard bash/shell placeholder parameters dynamically
    let compiledP2Prompt = p2TemplateContent
      .replace(/\$BUSINESS_IDEA/g, BUSINESS_IDEA)
      .replace(/\${BUSINESS_IDEA}/g, BUSINESS_IDEA)
      .replace(/\$PASSED_OBJECTS_ARRAY/g, PASSED_OBJECTS_ARRAY)
      .replace(/\${PASSED_OBJECTS_ARRAY}/g, PASSED_OBJECTS_ARRAY);

    // Save configuration payload text to compile target file path
    fs.mkdirSync(path.dirname(TMP_COMPILE_P2), { recursive: true });
    fs.writeFileSync(TMP_COMPILE_P2, compiledP2Prompt, 'utf8');

    console.log("🤖 STEP 4: Executing Pass 2 Turn (Generating Relations & Lifecycles)...");
    fs.mkdirSync(path.dirname(FINAL_ARCHITECTURE_OUTPUT), { recursive: true });

    const args = [
      '-hf', 'Qwen/Qwen3-8B-GGUF:Q4_K_M',
      '-ngl', '99',
      '--single-turn',
      '--reasoning', 'off',
      '-f', TMP_COMPILE_P2,
      '-n', '2048',
      '-o', FINAL_ARCHITECTURE_OUTPUT
    ];

    // Spawns exactly ONE fast runtime process loop directly against your system llama-cli binary
    execFile('llama-cli', args, (error) => {
      // Clean intermediate tracking tracks immediately post-generation loop
      if (fs.existsSync(TMP_COMPILE_P2)) fs.unlinkSync(TMP_COMPILE_P2);

      if (error) {
        console.error(`❌ Binary execution error: ${error.message}`);
        process.exit(1);
      }
      
      console.log(`✅ Finished! Final architecture safely written to: ${FINAL_ARCHITECTURE_OUTPUT}`);
    });

  } catch (err) {
    console.error(`❌ CRITICAL ENGINE FAILURE: ${err.message}`);
    // Cleanup protection cascade if runtime crashes early
    if (fs.existsSync(TMP_COMPILE_P2)) fs.unlinkSync(TMP_COMPILE_P2);
    process.exit(1);
  }
})();
