const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// 1. Core Path Configurations
const BUSINESS_IDEA = process.argv[2] || "E Commerce";
const CACHE_FILE = path.join(__dirname, 'all-layers.jsonld');
const PROMPT_FILE = path.join(__dirname, 'app/utils/appflowgeneratorAI/promptFile/Business-discovery-prompt10businessObjects.txt');
const OUTPUT_FILE = path.join(__dirname, 'app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b25.txt');

(async () => {
  try {
    console.log(`🚀 Initiating Node.js Architecture Engine for: [${BUSINESS_IDEA}]`);

    // 2. STEP 1: Fetching official raw machine-readable Schema.org layer
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
      const slice = lines.slice(start, end).join(' ');
      searchResults = slice.replace(/[\n\r"]/g, '').replace(/\s+/g, ' ').trim().substring(0, 2000);
    }

    // Dynamic fallback to standard Schema.org Organization/Place models if custom idea isn't explicit
    if (!searchResults) {
      console.log("⚠️ Exact match not found. Defaulting to high-level commercial schemas...");
      const fallbackRegex = /("Store"|"Organization"|"LocalBusiness")/i;
      const fallbackMatches = lines.filter(line => fallbackRegex.test(line)).slice(0, 20);
      searchResults = fallbackMatches.join(' ').replace(/[\n\r"]/g, '').trim();
    }

    // 3. STEP 2: Injecting system architecture parameters
    const epochTime = Math.floor(Date.now() / 1000);
    const machineArch = os.arch();
    const validationResults = `[THREAD_INTEGRITY_LOG: TIME=${epochTime} ARCH=${machineArch} REASONING_TARGET=${BUSINESS_IDEA}]`;

    // 4. STEP 3: Merging data variables into prompt layout
    if (!fs.existsSync(PROMPT_FILE)) {
      throw new Error(`CRITICAL EXCEPTION: Prompt template file missing at ${PROMPT_FILE}`);
    }
    
    let promptTemplate = fs.readFileSync(PROMPT_FILE, 'utf8');
    let mergedPrompt = promptTemplate
      .replace(/\{\{BUSINESS_IDEA\}\}/g, BUSINESS_IDEA)
      .replace(/\{\{SEARCH_RESULTS\}\}/g, searchResults)
      .replace(/\{\{VALIDATION_RESULTS\}\}/g, validationResults);

    console.log("🤖 STEP 4: Executing single-pass model generation via llama-cli...");
    
    // Ensure parent output directories exist natively
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

    // 5. Binary argument parameters
    const args = [
      '-hf', 'Qwen/Qwen3-8B-GGUF:Q4_K_M',
      '-ngl', '99',
      '--single-turn',
      '--reasoning', 'off',
      '-p', mergedPrompt,
      '-n', '1200',
      '-o', OUTPUT_FILE
    ];

    // Spawns exactly ONE fast execution loop directly on the terminal binary
    execFile('llama-cli', args, (error) => {
      if (error) {
        console.error(`❌ Binary execution error: ${error.message}`);
        process.exit(1);
      }
      console.log(`✅ Finished! High-precision grounded unique schema saved to: ${OUTPUT_FILE}`);
    });

  } catch (err) {
    console.error(`❌ CRITICAL ENGINE FAILURE: ${err.message}`);
    process.exit(1);
  }
})();
