const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const TMP_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile');
// Cache path to store and programmatically update states instantly
const CACHE_FILE_PATH = path.join(OUTPUT_DIR, 'journey-state-cache.json');

const MODEL_PASS_CONFIG = {
  //model: 'Qwen/Qwen2.5-Coder-3B-Instruct-GGUF',
  //12 minutes
  //model:'Qwen/Qwen3-8B-GGUF:Q4_K_M',
 // model:'/Users/apple/.cache/huggingface/hub/models--Qwen--Qwen3-8B-GGUF/snapshots/7c41481f57cb95916b40956ab2f0b139b296d974/Qwen3-8B-Q4_K_M.gguf',
  //22 minutes
 // model :'hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF',
 // model:'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M',
 //17 minutes
  model: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF',
  //3 minutes
  ngl: '0',
  tokens: '2048' 
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

function callLlamaCli(promptText, taskName, maxTokens = MODEL_PASS_CONFIG.tokens) {
  return new Promise((resolve, reject) => {
    const tmpPromptFile = path.join(TMP_DIR, `tmp_${taskName}_prompt.txt`);
    const tmpOutputFile = path.join(TMP_DIR, `tmp_${taskName}_out.txt`);
    
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(tmpPromptFile, promptText, 'utf8');

    const args = [
      '-hf', MODEL_PASS_CONFIG.model,
      //'--model', MODEL_PASS_CONFIG.model,
      '-ngl', MODEL_PASS_CONFIG.ngl,
      '--single-turn',
      '-b', '512', 
      '-t', '6',     
      '--reasoning', 'off',
      '--log-disable', 
      '-f', tmpPromptFile,
      '-n', maxTokens.toString(),
      '-o', tmpOutputFile
    ];

    execFile('llama-cli', args, (error) => {
      if (fs.existsSync(tmpPromptFile)) fs.unlinkSync(tmpPromptFile);
      if (error) {
        if (fs.existsSync(tmpOutputFile)) fs.unlinkSync(tmpOutputFile);
        return reject(new Error(`[${taskName}] Execution crash: ${error.message}`));
      }
      if (!fs.existsSync(tmpOutputFile)) return reject(new Error(`[${taskName}] Output missing.`));

      const rawResult = fs.readFileSync(tmpOutputFile, 'utf8').trim();
      if (fs.existsSync(tmpOutputFile)) fs.unlinkSync(tmpOutputFile);
      resolve(rawResult);
    });
  });
}

function extractDomainAndNicheFromHeader(fileContent) {
  const targetHeader = "=== Final DATA MATRIX for domain :";
  if (!fileContent.includes(targetHeader)) return { domain: "Unknown Domain", niche: "Unknown Niche" };
  const firstLineEnd = fileContent.indexOf('\n');
  const headerLine = firstLineEnd !== -1 ? fileContent.substring(0, firstLineEnd) : fileContent;
  const domainPart = headerLine.split("=== Final DATA MATRIX for domain :")[1] || "";
  const nicheSplit = domainPart.split(" and niche :");
  return { domain: nicheSplit[0] ? nicheSplit[0].trim() : "Unknown Domain", niche: nicheSplit[1] ? nicheSplit[1].replace("===", "").trim() : "Unknown Niche" };
}

/**
 * FIXED: Advanced positional substring extractor that filters out conversation blocks leaking around code
 */
function cleanJsonString(rawStr) {
  const startIdx = rawStr.indexOf('[');
  const startObjIdx = rawStr.indexOf('{');
  const endIdx = rawStr.lastIndexOf(']');
  const endObjIdx = rawStr.lastIndexOf('}');

  let finalStart = startIdx !== -1 ? startIdx : startObjIdx;
  let finalEnd = endIdx !== -1 ? endIdx : endObjIdx;

  if (finalStart === -1 || finalEnd === -1 || finalEnd < finalStart) {
    return rawStr
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```$/, '')
      .trim();
  }
  return rawStr.substring(finalStart, finalEnd + 1).trim();
}

/**
 * Baseline Pass: Generates the full initial structure
 */
async function generateBaseline(objectsMatrixContent, actorsMatrixContent, domainData) {
  const prompt = `You are a Principal Enterprise Systems Architect. Create a highly granular user transaction journey based on these specs:
=== SYSTEM DATA MATRIX ===
${objectsMatrixContent}

=== SYSTEM ACTORS & AUTHORIZATION MATRIX ===
${actorsMatrixContent}

Format your output strictly as a valid JSON Array containing objects matching this structural schematic:
[
  {
    "actor_name": "Actor Name",
    "operational_role_context": "Validation profile details",
    "chronological_milestones_and_data_inputs": [
      { "step": "1", "data_object_layer": "Narrative explaining modifications and data scopes..." }
    ]
  }
]
Return ONLY raw minified/formatted JSON. No code fences, no markdown text wrappers outside the JSON array.`;

  console.log("⚙️ Compiling baseline journey layers (Initial Setup)...");
  const rawOutput = await callLlamaCli(prompt, 'actor_journeys_base');
  
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return cleanJsonString(cleaned); // FIXED: Uses robust cleaning extractor here
}

/**
 * LIGHTNING FAST REFINEMENT LOOP (Takes seconds)
 * Asks LLM to ONLY generate the changes, then integrates them via Node.js
 */
async function getTargetedDeltaPatch(actorName, previousActorData, feedbackText) {
  const prompt = `You are an isolated data object patching utility.
We need to update a single actor's transaction milestones within a system journey layout.

CURRENT OBJECT STATE FOR THIS ACTOR:
${JSON.stringify(previousActorData, null, 2)}

USER REQUESTED MUTATION:
"${feedbackText}"

OBJECTIVE:
Modify the milestones based on the mutation request. Output ONLY the updated JSON block for this actor. Do not include markdown code block syntax or explanations outside the object structure. Follow this schematic precisely:
{
  "actor_name": "${actorName}",
  "operational_role_context": "[Context description]",
  "chronological_milestones_and_data_inputs": [
    { "step": "X", "data_object_layer": "[Updated narrative details]" }
  ]
}`;

  console.log(`⚡ Processing high-speed targeted patch for actor: [${actorName}]...`);
  const rawOutput = await callLlamaCli(prompt, 'actor_journey_patch', 512);
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return JSON.parse(cleanJsonString(cleaned)); // FIXED: Uses robust cleaning extractor here
}

/**
 * Main Interactive Loop
 */
(async () => {
  try {
    console.log("🚀 INITIATING MULTI-SECOND REFINEMENT JOURNEY GENERATION PIPELINE...");

    const objectsFilePath = path.join(OUTPUT_DIR, 'final-Objects-for-Quick Commerce_and_(Express Online Groceries Delivery_2026-10-01T17-50-23-016Z.txt');
    const actorsFilePath = path.join(OUTPUT_DIR, 'final-Actors-for-Quick Commerce_and_(Express Online Groceries Delivery_2026-10-01T19-20-03-389Z.txt');

    if (!fs.existsSync(objectsFilePath)) throw new Error(`Source objects file missing.`);
    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
    const actorsMatrixContent = fs.existsSync(actorsFilePath) ? fs.readFileSync(actorsFilePath, 'utf8') : fs.readFileSync(path.join(OUTPUT_DIR, 'current-actors-review.txt'), 'utf8');

    const domainData = extractDomainAndNicheFromHeader(objectsMatrixContent);
    console.log(`🎯 Context Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);
 
    let currentJourneys = [];

    // BOOTSTRAP CACHE CHECK
    if (fs.existsSync(CACHE_FILE_PATH)) {
      console.log(`💾 Local cache found at: ${CACHE_FILE_PATH}`);
      const cacheAction = await askQuestion("Type 'clear' to clear cache and generate fresh baseline, or press Enter to load cache directly: ");
      
      if (cacheAction.trim().toLowerCase() === 'clear') {
        console.log("🗑️ Clearing local storage cache file...");
        fs.unlinkSync(CACHE_FILE_PATH);
        
        // Regenerate and record baseline fresh
        const rawBase = await generateBaseline(objectsMatrixContent, actorsMatrixContent, domainData);
        currentJourneys = JSON.parse(cleanJsonString(rawBase)); // FIXED: Safely parses cleaned JSON structure
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentJourneys, null, 2), 'utf8');
        console.log("✨ Fresh baseline compiled and cached successfully!");
      } else {
        console.log("🔄 Loading structural state instantly from disk cache...");
        currentJourneys = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      }
    } else {
      const rawBase = await generateBaseline(objectsMatrixContent, actorsMatrixContent, domainData);
      currentJourneys = JSON.parse(cleanJsonString(rawBase)); // FIXED: Safely parses cleaned JSON structure
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentJourneys, null, 2), 'utf8');
    }

    let isApproved = false;
    while (!isApproved) {
      console.log(`\n--- CURRENT AVAILABLE ACTORS ---`);
      currentJourneys.forEach((j, i) => console.log(`[${i + 1}] ${j.actor_name}`));

      const actorSelection = await askQuestion("\nWhich actor number do you want to modify? (Or type 'YES' to approve and export everything): ");
      
      if (actorSelection.trim().toUpperCase() === 'YES') {
        isApproved = true;
        break;
      }

      const index = parseInt(actorSelection.trim(), 10) - 1;
      if (isNaN(index) || !currentJourneys[index]) {
        console.log("❌ Invalid choice. Select an actor number from the list.");
        continue;
      }

      const targetActor = currentJourneys[index];
      const feedback = await askQuestion(`Provide change instructions for [${targetActor.actor_name}]: `);

      // LLM processes a sub-response in a couple of seconds!
      const updatedActorBlock = await getTargetedDeltaPatch(targetActor.actor_name, targetActor, feedback);

      // Node.js instantly patches the master tracking structure
      currentJourneys[index] = updatedActorBlock;

      // Commit changes to disk cache instantly
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentJourneys, null, 2), 'utf8');
      console.log(`\n✅ Local array mutated successfully in seconds!`);
    }

    // Export Final Complete Structured Manifest
    // Export Final Complete Structured Manifest
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalJourneyPath = path.join(OUTPUT_DIR, `final-End-to-End-Actor-Journeys-${timestamp}.txt`);
    
    fs.writeFileSync(finalJourneyPath, `=== E2E ACTOR TRANSACTION JOURNEYS ===\n\n${JSON.stringify(currentJourneys, null, 2)}`, 'utf8');
    console.log(`\n\x1b[32m✔ Success! Full journey configuration saved to: ${finalJourneyPath}\x1b[0m`);

  } catch (err) {
    console.error("\n\x1b[31m✕ Pipeline Run Error:\x1b[0m", err.message);
  } finally {
    rl.close();
  }
})();
