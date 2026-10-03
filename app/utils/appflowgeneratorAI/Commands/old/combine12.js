const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// ==========================================
// 1. Core Path & Workspace Configurations
// ==========================================


// 1. Capture dynamic command-line parameters
const BUSINESS_IDEA = process.argv[2] || "E Commerce";

// FIXED PATH ROOTING: Steps up 4 levels from /app/utils/appflowgeneratorAI/commands/ to reach project root
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');

const CACHE_FILE = path.join(PROJECT_ROOT, 'all-layers.jsonld');

// Phase 1 Paths mapped relative to Project Root
const P1_PROMPT_FILE = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile/Business-discovery-prompt10businessObjects.txt');
const P1_OUTPUT_FILE = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b25.txt');

// Phase 2 Paths mapped relative to Project Root
const P2_PROMPT_TEMPLATE = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile/business-relations-prompt.txt');
const TMP_COMPILE_P2 = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile/tmp_p2_compiled.txt');
const FINAL_ARCHITECTURE_OUTPUT = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput/business-architecture-final.txt');

// Helper function to handle llama-cli execution wrapped as a Promise
function runLlamaCli(args) {
  return new Promise((resolve, reject) => {
    execFile('llama-cli', args, (error) => {
      if (error) return reject(error);
      resolve();
    });
  });
}

(async () => {
  try {
    console.log(`🚀 STARTING PIPELINE: Initiating Unified Architecture Engine for: [${BUSINESS_IDEA}]`);

    // Hard clean intermediate workspaces to protect against stale cross-run caches
    if (fs.existsSync(TMP_COMPILE_P2)) fs.unlinkSync(TMP_COMPILE_P2);
    if (fs.existsSync(FINAL_ARCHITECTURE_OUTPUT)) fs.unlinkSync(FINAL_ARCHITECTURE_OUTPUT);

    // ==========================================
    // 2. PHASE 1: Business Object Discovery
    // ==========================================
    console.log("\n====== PHASE 1: OBJECT DISCOVERY ======");

    // Fetch official raw machine-readable Schema.org layer if cache is missing
    if (!fs.existsSync(CACHE_FILE)) {
      console.log("📥 Cache file 'all-layers.jsonld' not found. Downloading Schema.org core data map...");
      const response = await fetch("https://schema.org");
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(CACHE_FILE, Buffer.from(buffer));
    }

    console.log(`🔍 Filtering schema vocabulary for matches against: ${BUSINESS_IDEA}`);
    const cacheContent = fs.readFileSync(CACHE_FILE, 'utf8');
    const lines = cacheContent.split(/\r?\n/);
    
    let searchResults = "";
    let matchIndex = -1;

    // Direct replication of grep -i "@id.*\$BUSINESS_IDEA"
    const lookupRegex = new RegExp(`@id.*${BUSINESS_IDEA}`, 'i');
    for (let i = 0; i < lines.length; i++) {
      if (lookupRegex.test(lines[i])) {
        matchIndex = i;
        break;
      }
    }

    // Capture context lines (-C 3) and limit stream length (head -n 40)
    if (matchIndex !== -1) {
      const start = Math.max(0, matchIndex - 3);
      const end = Math.min(lines.length, matchIndex + 4);
      searchResults = lines.slice(start, end).join(' ')
        .replace(/[\n\r"]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 2000);
    }

    // Dynamic fallback to standard Schema.org Organization/Place models if custom idea isn't explicit
    if (!searchResults) {
      console.log("⚠️ Exact match not found. Defaulting to high-level commercial schemas...");
      const fallbackRegex = /("Store"|"Organization"|"LocalBusiness")/i;
      const fallbackMatches = lines.filter(line => fallbackRegex.test(line)).slice(0, 20);
      searchResults = fallbackMatches.join(' ').replace(/[\n\r"]/g, '').trim();
    }

    // Inject system architecture parameters
    const epochTime = Math.floor(Date.now() / 1000);
    const machineArch = os.arch();
    const validationResults = `[THREAD_INTEGRITY_LOG: TIME=${epochTime} ARCH=${machineArch} REASONING_TARGET=${BUSINESS_IDEA}]`;

    // Merge data variables into Phase 1 prompt layout
    if (!fs.existsSync(P1_PROMPT_FILE)) {
      throw new Error(`CRITICAL EXCEPTION: Phase 1 prompt file missing at ${P1_PROMPT_FILE}`);
    }
    
    let p1TemplateContent = fs.readFileSync(P1_PROMPT_FILE, 'utf8');
    let mergedP1Prompt = p1TemplateContent
      .replace(/\{\{BUSINESS_IDEA\}\}/g, BUSINESS_IDEA)
      .replace(/\{\{SEARCH_RESULTS\}\}/g, searchResults)
      .replace(/\{\{VALIDATION_RESULTS\}\}/g, validationResults);

    console.log("🤖 Executing Phase 1 model turn via llama-cli...");
    fs.mkdirSync(path.dirname(P1_OUTPUT_FILE), { recursive: true });

    const p1Args = [
      '-hf', 'Qwen/Qwen3-8B-GGUF:Q4_K_M',
      '-ngl', '99',
      '--single-turn',
      '--reasoning', 'off',
      '-p', mergedP1Prompt,
      '-n', '1200',
      '-o', P1_OUTPUT_FILE
    ];

    await runLlamaCli(p1Args);
    console.log(`✅ Phase 1 Complete! Discovery payload written to: ${P1_OUTPUT_FILE}`);


    // ==========================================
    // 3. PHASE 2: Relations & Lifecycles
    // ==========================================
    console.log("\n====== PHASE 2: RELATIONAL EXTRACTION ======");

    if (!fs.existsSync(P1_OUTPUT_FILE)) {
      throw new Error(`CRITICAL EXCEPTION: Phase 1 output payload missing at ${P1_OUTPUT_FILE}`);
    }

    const p1Content = fs.readFileSync(P1_OUTPUT_FILE, 'utf8');
    
    // Native string tracking matching the awk processing logic
    const assistantMarker = "Assistant:";
    const markerIndex = p1Content.indexOf(assistantMarker);
    if (markerIndex === -1) {
      throw new Error("❌ CRITICAL ERROR: Could not locate 'Assistant:' block marker inside Pass 1 payload output.");
    }
    
    const isolatedJsonBlock = p1Content.substring(markerIndex + assistantMarker.length).trim();
    console.log("🔍 Extracting variable contexts out of Phase 1 JSON layout...");

    // Extract CORE_DOMAIN value string using clean regex pattern matching
    const coreDomainMatch = isolatedJsonBlock.match(/"CORE_DOMAIN"\s*:\s*"([^"]+)"/);
    const parsedBusinessIdea = coreDomainMatch ? coreDomainMatch[1] : BUSINESS_IDEA;

    // Isolate the complete flat BusinessObjects array block via structural character scanning
    const arrayStartPattern = /"BusinessObjects"\s*:\s*\[/;
    const startMatch = isolatedJsonBlock.match(arrayStartPattern);
    
    let passedObjectsArray = null;
    if (startMatch) {
      const startIndex = startMatch.index + startMatch[0].indexOf('[');
      let bracketCount = 0;
      let endIndex = -1;

      // Balanced bracket checking scan loop
      for (let i = startIndex; i < isolatedJsonBlock.length; i++) {
        if (isolatedJsonBlock[i] === '[') bracketCount++;
        if (isolatedJsonBlock[i] === ']') bracketCount--;
        if (bracketCount === 0) {
          endIndex = i;
          break;
        }
      }
      
      if (endIndex !== -1) {
        passedObjectsArray = isolatedJsonBlock.substring(startIndex, endIndex + 1)
          .replace(/[\r\n]+/g, ' ')
          .replace(/\s+/g, ' ');
      }
    }

    // Fail-safe validation check before moving down to Phase 2 token generation
    if (!passedObjectsArray) {
      throw new Error("❌ CRITICAL ERROR: Object extractor failure. BusinessObjects array structural mapping block could not be parsed.");
    }

    console.log("📝 Substituting variable dependencies into Phase 2 relation layouts safely...");
    if (!fs.existsSync(P2_PROMPT_TEMPLATE)) {
      throw new Error(`CRITICAL EXCEPTION: Phase 2 template file missing at ${P2_PROMPT_TEMPLATE}`);
    }

    let p2TemplateContent = fs.readFileSync(P2_PROMPT_TEMPLATE, 'utf8');

    // Replicates envsubst mapping logic for both syntax formats (\(VAR and\){VAR})
    let compiledP2Prompt = p2TemplateContent
      .replace(/\$BUSINESS_IDEA/g, parsedBusinessIdea)
      .replace(/\${BUSINESS_IDEA}/g, parsedBusinessIdea)
      .replace(/\$PASSED_OBJECTS_ARRAY/g, passedObjectsArray)
      .replace(/\${PASSED_OBJECTS_ARRAY}/g, passedObjectsArray);

    fs.mkdirSync(path.dirname(TMP_COMPILE_P2), { recursive: true });
    fs.writeFileSync(TMP_COMPILE_P2, compiledP2Prompt, 'utf8');

    console.log("🤖 Executing Phase 2 model turn (Generating Relations & Lifecycles)...");
    fs.mkdirSync(path.dirname(FINAL_ARCHITECTURE_OUTPUT), { recursive: true });

    const p2Args = [
      '-hf', 'Qwen/Qwen3-8B-GGUF:Q4_K_M',
      '-ngl', '99',
      '--single-turn',
      '--reasoning', 'off',
      '-f', TMP_COMPILE_P2,
      '-n', '2048',
      '-o', FINAL_ARCHITECTURE_OUTPUT
    ];

    await runLlamaCli(p2Args);

    // Clean intermediate prompt tracking scratchpad files post-execution loop
    if (fs.existsSync(TMP_COMPILE_P2)) fs.unlinkSync(TMP_COMPILE_P2);

    console.log(`\n✅ PIPELINE SUCCESS: Final business architecture safely compiled to:\n🔗 ${FINAL_ARCHITECTURE_OUTPUT}`);

  } catch (err) {
    console.error(`\n❌ CRITICAL PIPELINE INTERRUPT: ${err.message}`);
    if (fs.existsSync(TMP_COMPILE_P2)) fs.unlinkSync(TMP_COMPILE_P2);
    process.exit(1);
  }
})();
