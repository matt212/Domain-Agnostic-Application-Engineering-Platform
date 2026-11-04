const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const TMP_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile');
// Cache path to store and programmatically update states instantly
const CACHE_FILE_PATH = path.join(OUTPUT_DIR, 'techno-functional-matrix-cache.json');

const MODEL_PASS_CONFIG = {
  model: 'unsloth/Qwen3.5-9B-GGUF',
  ngl: '0',
  tokens: '4048' 
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
  if (!fileContent.includes(targetHeader)) {
    const altHeader = "=== E2E ACTOR TRANSACTION JOURNEYS for domain :";
    if (fileContent.includes(altHeader)) {
      const lineEnd = fileContent.indexOf('\n');
      const headerLine = lineEnd !== -1 ? fileContent.substring(0, lineEnd) : fileContent;
      const domainPart = headerLine.split(altHeader)[1] || "";
      const nicheSplit = domainPart.split(" and niche :(");
      return { 
        domain: nicheSplit[0] ? nicheSplit[0].trim() : "Unknown Domain", 
        niche: nicheSplit[1] ? nicheSplit[1].replace("===", "").replace(")", "").trim() : "Unknown Niche" 
      };
    }
    return { domain: "Unknown Domain", niche: "Unknown Niche" };
  }
  const firstLineEnd = fileContent.indexOf('\n');
  const headerLine = firstLineEnd !== -1 ? fileContent.substring(0, firstLineEnd) : fileContent;
  const domainPart = headerLine.split("=== Final DATA MATRIX for domain :")[1] || "";
  const nicheSplit = domainPart.split(" and niche :");
  return { 
    domain: nicheSplit[0] ? nicheSplit[0].trim() : "Unknown Domain", 
    niche: nicheSplit[1] ? nicheSplit[1].replace("===", "").trim() : "Unknown Niche" 
  };
}

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
 * Baseline Pass: Synthesizes Stage 1, 2, and 3 inputs to create the fully grounded matrix layout
 */
async function generateBaselineMatrix(objectsData, actorsData, journeysData, domainData) {
  const prompt = `You are a DOMAIN-AGNOSTIC SYSTEMS INTEGRATION & EXCEPTION ENGINE. Your task is to compute a 100% operationally complete "Techno-Functional Activity and Exception Matrix" formatted strictly as a single JSON Array.

You must mathematically map every logical interaction lifecycle step across multiple actors by synthesizing four distinct structural matrices provided in the input context.

=== CONTEXT VARIABLES ===
BUSINESS DOMAIN: ${domainData.domain}
BUSINESS NICHE: ${domainData.niche}

=== CRITICAL GROUNDING ANCHOR RULES ===
- Every 'activity' and 'happy_path' node MUST be a direct semantic translation of a chronological step found in the SYSTEM JOURNEYS MATRIX context down below.
- Every 'exception_scenario' MUST be constructed by violating a specific limitation, rule, or boundary explicitly stated under the "Business_Rules_And_Guardrails" or "access_authorization_and_scope" matrices within the SYSTEM ACTORS & AUTHORIZATION MATRIX context down below.
- Every input and output object mutated during a transition MUST match the semantic definitions inside the SYSTEM DATA MATRIX context down below.
- ZERO FABRICATION: Do not introduce domain concepts, objects, architecture layers, or actors absent from the provided source matrices. Derive all semantic decisions directly from the text boundaries.
- EXCEPTION OWNERSHIP RULE: Inside every single "exception_scenario" and "process_state_transition" field, you MUST explicitly state WHO DOES WHAT. You must name the specific actor responsible (e.g., "Customer", "Store Associate", "Courier Driver") or state "System" if it is an automated software guardrail, block, or trigger.

=== FIELD MAP MATRIX SPECIFICATIONS ===
- actor_name: The precise name of the primary actor executing the transaction block.
- activity: A short, punchy functional name identifying the core operational intent of this step.
- happy_path: The narrative detailing the successful execution of the business step when no constraints are violated.
- exception_scenario: A real-world operational bottleneck, rule violation, user mutation error, or constraint failure supported by the context. You must explicitly state WHO triggers or blocks the flow.
- process_state_transition: The resulting operational business state change, tracking exactly WHO resolves the variance or WHERE the system routes the actor.

=== TARGET OUTPUT JSON FORMAT SCHEMA ===
[
  {
    "actor_name": "...",
    "lifecycle_matrix": [
      {
        "activity": "...",
        "happy_path": "...",
        "exception_scenario": "[Actor/System] does [Action] because...",
        "process_state_transition": "[Actor/System] executes [State Change/Routing] to..."
      }
    ]
  }
]
Return ONLY raw minified/formatted JSON. No code fences, no markdown text wrappers outside the JSON array.

=== SOURCE INPUT PAYLOAD DATA ===

--- SYSTEM DATA MATRIX ---
${objectsData}

--- SYSTEM ACTORS & AUTHORIZATION MATRIX ---
${actorsData}

--- SYSTEM JOURNEYS MATRIX ---
${journeysData}

Assistant:\n`;

  console.log("⚙️ Compiling baseline grounded techno-functional exception layers (Initial Setup)...");
  const rawOutput = await callLlamaCli(prompt, 'tech_func_base');
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return cleanJsonString(cleaned);
}

/**
 * Targeted Delta Loop for lightning fast targeted revisions
 */
async function getTargetedDeltaPatch(actorName, previousActorData, feedbackText, domainData) {
  const prompt = `You are an isolated data object patching utility.
We need to update a single actor's techno-functional lifecycle matrix block based on a mutation instruction.

BUSINESS DOMAIN: ${domainData.domain}
BUSINESS NICHE: ${domainData.niche}

CURRENT OBJECT STATE FOR THIS ACTOR:
${JSON.stringify(previousActorData, null, 2)}

USER REQUESTED MUTATION:
"${feedbackText}"

OBJECTIVE:
Modify the activity mappings based on the mutation request. Output ONLY the updated JSON block for this actor. Follow all strict rules regarding exception ownership ("Who does what") and grounding boundaries. Follow this schematic precisely:
{
  "actor_name": "${actorName}",
  "lifecycle_matrix": [
    {
      "activity": "[Punchy Activity Title]",
      "happy_path": "[Narrative details]",
      "exception_scenario": "[Actor/System] does [Action] because...",
      "process_state_transition": "[Actor/System] executes [State Change/Routing] to..."
    }
  ]
}
Return ONLY valid JSON. No explanations or code wrappers outside the object structure.

Assistant:\n`;

  console.log(`⚡ Processing high-speed targeted matrix patch for actor: [${actorName}]...`);
  const rawOutput = await callLlamaCli(prompt, 'tech_func_patch', 1024);
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return JSON.parse(cleanJsonString(cleaned));
}

/**
 * Main Interactive Loop
 */
(async () => {
  try {
    console.log("🚀 INITIATING MULTI-MATRIX EXCEPTION COVERAGE ENGINE PIPELINE...");

    const objectsFilePath = path.join(OUTPUT_DIR, '1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt');
    const actorsFilePath = path.join(OUTPUT_DIR, '2.Final-Actors-for-Quick Commerce (Q-Commerce)_and_Hyperlocal Grocery Delivery_2026-10-03T19-22-16-404Z.txt');
    
    // Dynamically look for the latest generated E2E actor journey text matching the timestamp structure
    const files = fs.readdirSync(OUTPUT_DIR);
    const journeyFiles = files.filter(f => f.startsWith('3.Final-End-to-End-Actor-Journeys-') && f.endsWith('.txt'));
    
    if (!fs.existsSync(objectsFilePath)) throw new Error(`Source objects file missing.`);
    if (!fs.existsSync(actorsFilePath)) throw new Error(`Source actors file missing.`);
    if (journeyFiles.length === 0) throw new Error("Source journeys file missing in output directory.");
    
    journeyFiles.sort((a, b) => fs.statSync(path.join(OUTPUT_DIR, b)).mtimeMs - fs.statSync(path.join(OUTPUT_DIR, a)).mtimeMs);
    const journeysFilePath = path.join(OUTPUT_DIR, journeyFiles[0]);

    console.log(`📖 Loading Stage 1 Matrix from: ${path.basename(objectsFilePath)}`);
    console.log(`📖 Loading Stage 2 Matrix from: ${path.basename(actorsFilePath)}`);
    console.log(`📖 Loading Stage 3 Matrix from: ${path.basename(journeysFilePath)}`);

    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
    const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
    const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');

    const domainData = extractDomainAndNicheFromHeader(objectsMatrixContent);
    console.log(`🎯 Context Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);

    let currentMatrixData = [];

    // BOOTSTRAP CACHE CHECK
    if (fs.existsSync(CACHE_FILE_PATH)) {
      console.log(`💾 Local execution cache file discovered at: ${CACHE_FILE_PATH}`);
      const cacheAction = await askQuestion("Type 'clear' to drop cache and re-run baseline orchestration, or press Enter to load cached layout: ");
      
      if (cacheAction.trim().toLowerCase() === 'clear') {
        console.log("🗑️ Clearing local storage cache file...");
        fs.unlinkSync(CACHE_FILE_PATH);
        
        const rawBase = await generateBaselineMatrix(objectsMatrixContent, actorsMatrixContent, journeysMatrixContent, domainData);
        currentMatrixData = JSON.parse(cleanJsonString(rawBase));
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentMatrixData, null, 2), 'utf8');
        console.log("✨ Fresh fully grounded matrix compiled and cached successfully!");
      } else {
        console.log("🔄 Loading structural matrix state instantly from disk cache...");
        currentMatrixData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      }
    } else {
      const rawBase = await generateBaselineMatrix(objectsMatrixContent, actorsMatrixContent, journeysMatrixContent, domainData);
      currentMatrixData = JSON.parse(cleanJsonString(rawBase));
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentMatrixData, null, 2), 'utf8');
    }

    let isApproved = false;
    while (!isApproved) {
      console.log(`\n--- CURRENT AVAILABLE GENERATED ACTORS ---`);
      currentMatrixData.forEach((m, i) => console.log(`[${i + 1}] ${m.actor_name}`));

      const actorSelection = await askQuestion("\nWhich actor matrix do you want to modify? (Or type 'YES' to approve and export everything): ");
      
      if (actorSelection.trim().toUpperCase() === 'YES') {
        isApproved = true;
        break;
      }

      const index = parseInt(actorSelection.trim(), 10) - 1;
      if (isNaN(index) || !currentMatrixData[index]) {
        console.log("❌ Invalid choice. Select an actor row from the list.");
        continue;
      }

      const targetActorMatrix = currentMatrixData[index];
      const feedback = await askQuestion(`Provide transition/exception patch instructions for [${targetActorMatrix.actor_name}]: `);

      const updatedActorBlock = await getTargetedDeltaPatch(targetActorMatrix.actor_name, targetActorMatrix, feedback, domainData);

      if (updatedActorBlock) {
        if (Array.isArray(updatedActorBlock)) {
          currentMatrixData[index] = {
            ...targetActorMatrix,
            lifecycle_matrix: updatedActorBlock
          };
        } else if (typeof updatedActorBlock === 'object') {
          currentMatrixData[index] = {
            ...targetActorMatrix,
            ...updatedActorBlock,
            actor_name: targetActorMatrix.actor_name
          };
        }

        // Commit change instantly to disk cache
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentMatrixData, null, 2), 'utf8');
        console.log(`\n✅ Local array mutated successfully in seconds!`);
      }
    }

    // Export Final Complete Structured Techno-Functional Manifest
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalOutputPath = path.join(OUTPUT_DIR, `5.Final-Techno-Functional-Exception-Matrix-${timestamp}.txt`);

    fs.writeFileSync(
      finalOutputPath,
      `=== Final Techno-Functional Activity and Exception Matrix for domain :${domainData.domain} and niche :(${domainData.niche}) ===\n\n${JSON.stringify(currentMatrixData, null, 2)}`,
      'utf8'
    );
    console.log(`\n\x1b[32m✔ Success! Full techno-functional exception matrix saved to: ${finalOutputPath}\x1b[0m`);

  } catch (err) {
    console.error("\n\x1b[31m✕ Pipeline Run Error:\x1b[0m", err.message);
  } finally {
    rl.close();
  }
})();
