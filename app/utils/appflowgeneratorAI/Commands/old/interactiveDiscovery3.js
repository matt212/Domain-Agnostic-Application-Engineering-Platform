const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const TMP_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile');
const CACHE_FILE_PATH = path.join(OUTPUT_DIR, 'structured-business-flow-cache.json');

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
  const targetHeader = "=== E2E ACTOR TRANSACTION JOURNEYS for domain :";
  if (!fileContent.includes(targetHeader)) return { domain: "Unknown Domain", niche: "Unknown Niche" };
  const firstLineEnd = fileContent.indexOf('\n');
  const headerLine = firstLineEnd !== -1 ? fileContent.substring(0, firstLineEnd) : fileContent;
  const domainPart = headerLine.split("=== E2E ACTOR TRANSACTION JOURNEYS for domain :")[1] || "";
  const nicheSplit = domainPart.split(" and niche :(");
  return { 
    domain: nicheSplit[0] ? nicheSplit[0].trim() : "Unknown Domain", 
    niche: nicheSplit[1] ? nicheSplit[1].replace("===", "").replace(")", "").trim() : "Unknown Niche" 
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

async function generateBaselineStructuredFlow(inputJourneys, domainData) {
  const prompt = `You are a DOMAIN-AGNOSTIC BUSINESS FLOW STRUCTURING ENGINE.

BUSINESS DOMAIN: ${domainData.domain}
BUSINESS NICHE: ${domainData.niche}

Transform each actor's chronological milestone narrative into one structured business-flow step.

INPUT:
${JSON.stringify(inputJourneys, null, 2)}

OBJECTIVE:
For every chronological milestone, semantically interpret "data_object_layer" and transform it into one structured business-flow step. Preserve the source meaning without simply copying the narrative.

Identify, where supported:
- primary actor's business action
- primary business object
- system or operational activity
- supporting actor
- required business input
- applicable business rule
- business outcome
- business-state transition

Use DOMAIN and NICHE only as semantic context. The supplied actor journey and milestone narratives are the primary source of truth. Use DOMAIN/NICHE to resolve ambiguity, but never introduce concepts merely because they are common within the domain or niche.

FIELD RULES:
step: Preserve the original step identifier.
actor_action: Identify what the primary actor is actually doing. Describe the actor's business intent or responsibility. Do not invent actions.
business_object: Identify the primary business object involved based on its semantic role. Do not invent objects.
system_activity: Identify the system or operational activity supporting, validating, processing, coordinating, or completing the action. Describe it at the business/functional level.
supporting_actor: Identify another actor explicitly involved in supporting, validating, approving, controlling, fulfilling, or participating in the activity. Do not infer actors merely from industry convention. Do not repeat the primary actor. If unsupported, return null.
input: Identify meaningful business information required for the action. Do not convert technical implementation details into business inputs.
business_rule: Identify a rule explicitly stated or strongly supported by the source. Do not invent rules. If unsupported, return null.
outcome: Identify the meaningful business result produced by the activity. Do not substitute low-level technical responses for business outcomes.
transition: Identify the resulting business-state transition as "Current State → Next State". States must represent meaningful business-process states derived from the source. Do not simply use the next JSON step or invent a state. If unsupported, return null.

CONSTRAINTS:
- Remain completely domain-agnostic.
- Do not assume predefined actors, roles, objects, actions, modules, workflows, lifecycle states, rules, CRUD operations, or architecture.
- Derive all semantic decisions from the supplied input.
- Do not introduce domain knowledge merely because it is common in the supplied domain/niche.
- Do not fill missing information with assumptions.
- Interpret the complete narrative; do not mechanically extract phrases.
- Preserve meaningful business terminology, including technical terms when they represent business concepts.
- Do not introduce technical concepts absent from the source.
- Preserve the supplied chronological order.

NO FABRICATION:
Never fabricate actors, objects, actions, activities, inputs, rules, outcomes, transitions, lifecycle states, or relationships. When information cannot be reliably determined, return null.

OUTPUT:
Return ONLY valid JSON Array containing objects matching this structural schematic:
[
  {
    "actor_name": "...",
    "operational_role_context": "...",
    "structured_business_flow": [
      {
        "step": "...",
        "actor_action": "...",
        "business_object": "...",
        "system_activity": "...",
        "supporting_actor": null,
        "input": "...",
        "business_rule": null,
        "outcome": "...",
        "transition": null
      }
    ]
  }
]
Do not include explanations, Markdown, code fences, or fields not specified above.`;

  console.log("⚙️ Structuring baseline business flow layers...");
  const rawOutput = await callLlamaCli(prompt, 'business_flow_base');
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return cleanJsonString(cleaned);
}

async function getTargetedDeltaPatch(actorName, previousActorData, feedbackText, domainData) {
  const prompt = `You are a DOMAIN-AGNOSTIC BUSINESS FLOW STRUCTURING ENGINE isolated patch utility.
Modify the structured business flow for the single specified actor based on the mutation request.

BUSINESS DOMAIN: ${domainData.domain}
BUSINESS NICHE: ${domainData.niche}

CURRENT OBJECT STATE FOR THIS ACTOR:
${JSON.stringify(previousActorData, null, 2)}

USER REQUESTED MUTATION:
"${feedbackText}"

FIELD RULES & CONSTRAINTS:
Follow all strict domain-agnostic field mapping guidelines, rules against fabrication, and semantic parsing requirements. Update only the fields affected by the mutation context.

OUTPUT:
Output ONLY the updated JSON block for this actor. Do not include markdown code block syntax or explanations outside the object structure. Follow this schematic precisely:
{
  "actor_name": "${actorName}",
  "operational_role_context": "...",
  "structured_business_flow": [
    {
      "step": "...",
      "actor_action": "...",
      "business_object": "...",
      "system_activity": "...",
      "supporting_actor": null,
      "input": "...",
      "business_rule": null,
      "outcome": "...",
      "transition": null
    }
  ]
}`;

  console.log(`⚡ Processing high-speed targeted patch for actor flow: [${actorName}]...`);
  const rawOutput = await callLlamaCli(prompt, 'business_flow_patch', 1024);
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return JSON.parse(cleanJsonString(cleaned));
}

(async () => {
  try {
    console.log("🚀 INITIATING MULTI-SECOND BUSINESS FLOW STRUCTURING PIPELINE...");

    // Find latest E2E actor journey manifest in output directory
    const files = fs.readdirSync(OUTPUT_DIR);
   // const journeyFiles = files.filter(f => f.startsWith('3.Final-End-to-End-Actor-Journeys-') && f.endsWith('.txt'));
    
    const latestJourneyPath = path.join(OUTPUT_DIR, '3.Final-End-to-End-Actor-Journeys-2026-10-03T20-54-21-571Z.txt');
    
    
    console.log(`📖 Loading source transaction journeys from: ${latestJourneyPath}`);
    const rawJourneyContent = fs.readFileSync(latestJourneyPath, 'utf8');
    const domainData = extractDomainAndNicheFromHeader(rawJourneyContent);
    console.log(`🎯 Context Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);

    const jsonStartIdx = rawJourneyContent.indexOf('[');
    if (jsonStartIdx === -1) throw new Error("Could not parse JSON payload from journey manifest.");
    const inputJourneys = JSON.parse(cleanJsonString(rawJourneyContent.substring(jsonStartIdx)));

    let currentFlows = [];

    if (fs.existsSync(CACHE_FILE_PATH)) {
      console.log(`💾 Local cache found at: ${CACHE_FILE_PATH}`);
      const cacheAction = await askQuestion("Type 'clear' to clear cache and generate fresh baseline, or press Enter to load cache directly: ");
      
      if (cacheAction.trim().toLowerCase() === 'clear') {
        console.log("🗑️ Clearing local storage cache file...");
        fs.unlinkSync(CACHE_FILE_PATH);
        
        const rawBase = await generateBaselineStructuredFlow(inputJourneys, domainData);
        currentFlows = JSON.parse(cleanJsonString(rawBase));
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentFlows, null, 2), 'utf8');
        console.log("✨ Fresh structured flow compiled and cached successfully!");
      } else {
        console.log("🔄 Loading structural state instantly from disk cache...");
        currentFlows = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      }
    } else {
      const rawBase = await generateBaselineStructuredFlow(inputJourneys, domainData);
      currentFlows = JSON.parse(cleanJsonString(rawBase));
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentFlows, null, 2), 'utf8');
    }

    let isApproved = false;
    while (!isApproved) {
      console.log(`\n--- CURRENT AVAILABLE ACTORS IN BUSINESS FLOW ---`);
      currentFlows.forEach((j, i) => console.log(`[${i + 1}] ${j.actor_name}`));

      const actorSelection = await askQuestion("\nWhich actor number do you want to modify? (Or type 'YES' to approve and export everything): ");
      
      if (actorSelection.trim().toUpperCase() === 'YES') {
        isApproved = true;
        break;
      }

      const index = parseInt(actorSelection.trim(), 10) - 1;
      if (isNaN(index) || !currentFlows[index]) {
        console.log("❌ Invalid choice. Select an actor number from the list.");
        continue;
      }

      const targetActor = currentFlows[index];
      const feedback = await askQuestion(`Provide transition or schema adjustments for [${targetActor.actor_name}]: `);

      const updatedActorBlock = await getTargetedDeltaPatch(targetActor.actor_name, targetActor, feedback, domainData);

      if (updatedActorBlock) {
        if (Array.isArray(updatedActorBlock)) {
          currentFlows[index] = {
            ...targetActor,
            structured_business_flow: updatedActorBlock
          };
        } else if (typeof updatedActorBlock === 'object') {
          currentFlows[index] = {
            ...targetActor,
            ...updatedActorBlock,
            actor_name: targetActor.actor_name
          };
        }

        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentFlows, null, 2), 'utf8');
        console.log(`\n✅ Local array mutated successfully in seconds!`);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalFlowPath = path.join(OUTPUT_DIR, `4.Final-Structured-Business-Flows-${timestamp}.txt`);

    fs.writeFileSync(
      finalFlowPath,
      `=== STRUCTURED BUSINESS FLOW for domain :${domainData.domain} and niche :(${domainData.niche}) ===\n\n${JSON.stringify(currentFlows, null, 2)}`,
      'utf8'
    );
    console.log(`\n\x1b[32m✔ Success! Full business flow mapping saved to: ${finalFlowPath}\x1b[0m`);

  } catch (err) {
    console.error("\n\x1b[31m✕ Pipeline Run Error:\x1b[0m", err.message);
  } finally {
    rl.close();
  }
})();
