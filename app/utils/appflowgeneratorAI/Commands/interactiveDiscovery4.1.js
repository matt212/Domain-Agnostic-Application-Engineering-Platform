const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const TMP_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile');
const CACHE_FILE_PATH = path.join(OUTPUT_DIR, 'techno-functional-matrix-cache.json');

const MODEL_PASS_CONFIG = {
  model: 'unsloth/Qwen3.5-9B-GGUF',
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
  const domainPart = headerLine.split(targetHeader)[1] || "";
  const nicheSplit = domainPart.split(" and niche :");
  return { 
    domain: nicheSplit[0] ? nicheSplit[0].trim() : "Unknown Domain", 
    niche: nicheSplit[1] ? nicheSplit[1].replace("===", "").trim() : "Unknown Niche" 
  };
}

function cleanJsonString(rawStr) {
  if (typeof rawStr !== 'string') return '';
  let cleaned = rawStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const arrayStart = cleaned.indexOf('[');
  const objectStart = cleaned.indexOf('{');
  let startIdx = (arrayStart !== -1 && objectStart !== -1) ? Math.min(arrayStart, objectStart) : (arrayStart !== -1 ? arrayStart : objectStart);
  const arrayEnd = cleaned.lastIndexOf(']');
  const objectEnd = cleaned.lastIndexOf('}');
  let endIdx = Math.max(arrayEnd, objectEnd);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return cleaned.substring(startIdx, endIdx + 1).trim();
  }
  return cleaned;
}

/**
 * Worker Loop: Processes exactly one actor at a time to ensure token efficiency
 */
async function generateSingleActorMatrix(actorData, objectsData, actorsData, domainData) {
  const prompt = `You are a DOMAIN-AGNOSTIC SYSTEMS INTEGRATION ENGINE. Map exception layers for ONE specific actor.

=== CONTEXT VARIABLES ===
BUSINESS DOMAIN: ${domainData.domain}
BUSINESS NICHE: ${domainData.niche}

=== TARGET SPECIFIC ACTOR DATA ===
${JSON.stringify(actorData, null, 2)}

=== GROUNDING MATRICES ===
--- DATA SCHEMA REFERENCE ---
${objectsData.substring(0, 3000)}

--- RULE SET BOUNDARIES ---
${actorsData.substring(0, 3000)}

=== OUTPUT SCHEMATIC FORMAT ===
{
  "actor_name": "${actorData.actor_name || 'System Actor'}",
  "lifecycle_matrix": [
    {
      "activity": "Short Punchy Title",
      "happy_path": "Clear narrative summary of step execution",
      "exception_scenario": "[Actor/System] does [Action] because rule violation happened",
      "process_state_transition": "[Actor/System] executes state shift to route variance"
    }
  ]
}
Return ONLY a valid minified JSON object wrapper matching the structural block requested. No code fences. No dialogue.

Assistant:\n`;

  const rawOutput = await callLlamaCli(prompt, `actor_block_${Date.now()}`, 2048);
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return JSON.parse(cleanJsonString(cleaned));
}

async function getTargetedDeltaPatch(actorName, previousActorData, feedbackText, domainData) {
  const prompt = `You are an isolated patching utility for actor: [${actorName}].
MUTATION ORDER: "${feedbackText}"

CURRENT BLOCK STATE:
${JSON.stringify(previousActorData, null, 2)}

Output ONLY the updated JSON layout matching this exact scheme structure:
{
  "actor_name": "${actorName}",
  "lifecycle_matrix": [
    {
      "activity": "...",
      "happy_path": "...",
      "exception_scenario": "...",
      "process_state_transition": "..."
    }
  ]
}
Assistant:\n`;

  const rawOutput = await callLlamaCli(prompt, 'tech_func_patch', 1536);
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return JSON.parse(cleanJsonString(cleaned));
}

(async () => {
  try {
    console.log("🚀 INITIATING RUNTIME ASYNC-STREAM EXCEPTION PIPELINE...");

    const objectsFilePath = path.join(OUTPUT_DIR, '1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt');
    const actorsFilePath = path.join(OUTPUT_DIR, '2.Final-Actors-for-Quick Commerce (Q-Commerce)_and_Hyperlocal Grocery Delivery_2026-10-03T19-22-16-404Z.txt');
    
    const files = fs.readdirSync(OUTPUT_DIR);
    const journeyFiles = files.filter(f => f.startsWith('3.Final-End-to-End-Actor-Journeys-') && f.endsWith('.txt'));
    
    if (!fs.existsSync(objectsFilePath)) throw new Error("Source objects file missing.");
    if (!fs.existsSync(actorsFilePath)) throw new Error("Source actors file missing.");
    if (journeyFiles.length === 0) throw new Error("Source journeys file missing.");
    
    journeyFiles.sort((a, b) => fs.statSync(path.join(OUTPUT_DIR, b)).mtimeMs - fs.statSync(path.join(OUTPUT_DIR, a)).mtimeMs);
    const journeysFilePath = path.join(OUTPUT_DIR, journeyFiles[0]);

    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
    const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
    const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');

    const domainData = extractDomainAndNicheFromHeader(objectsMatrixContent);
    console.log(`🎯 Context Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);

    const jsonStartIdx = journeysMatrixContent.indexOf('[');
    if (jsonStartIdx === -1) throw new Error("Could not segment array index data from Stage 3 manifest.");
    const baselineJourneysInput = JSON.parse(cleanJsonString(journeysMatrixContent.substring(jsonStartIdx)));

    let currentMatrixData = [];

    if (fs.existsSync(CACHE_FILE_PATH)) {
      console.log(`💾 Local cache discovery made at: ${CACHE_FILE_PATH}`);
      const cacheAction = await askQuestion("Type 'clear' to rebuild through clean segmented workers or press Enter to load cache: ");
      
      if (cacheAction.trim().toLowerCase() === 'clear') {
        fs.unlinkSync(CACHE_FILE_PATH);
        console.log("⚙️ Executing isolated sequential mapping across all discovered journeys...");
        
        for (let entry of baselineJourneysInput) {
          console.log(`⏳ Structuring target segment workflow for: [${entry.actor_name}]...`);
          try {
            const singleBlock = await generateSingleActorMatrix(entry, objectsMatrixContent, actorsMatrixContent, domainData);
            if(singleBlock) currentMatrixData.push(singleBlock);
          } catch(e) {
            console.log(`⚠️ Segment parsing failure skipped for [${entry.actor_name}]: ${e.message}`);
          }
        }
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentMatrixData, null, 2), 'utf8');
      } else {
        currentMatrixData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      }
    } else {
      console.log("⚙️ Executing baseline async sequential builder loop...");
      for (let entry of baselineJourneysInput) {
        console.log(`⏳ Structuring target segment workflow for: [${entry.actor_name}]...`);
        try {
          const singleBlock = await generateSingleActorMatrix(entry, objectsMatrixContent, actorsMatrixContent, domainData);
          if(singleBlock) currentMatrixData.push(singleBlock);
        } catch(e) {
          console.log(`⚠️ Segment parsing failure skipped for [${entry.actor_name}]: ${e.message}`);
        }
      }
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentMatrixData, null, 2), 'utf8');
    }

    let isApproved = false;
    while (!isApproved) {
      console.log(`\n--- CURRENT AVAILABLE GENERATED ACTORS ---`);
      currentMatrixData.forEach((m, i) => console.log(`[${i + 1}] ${m.actor_name || "Unknown Block"}`));

      const actorSelection = await askQuestion("\nWhich actor matrix do you want to modify? (Or type 'YES' to approve and export everything): ");
      if (actorSelection.trim().toUpperCase() === 'YES') {
        isApproved = true;
        break;
      }

      const index = parseInt(actorSelection.trim(), 10) - 1;
      if (isNaN(index) || !currentMatrixData[index]) {
        console.log("❌ Invalid index option.");
        continue;
      }

      const targetActorMatrix = currentMatrixData[index];
      const feedback = await askQuestion(`Provide patch details for [${targetActorMatrix.actor_name}]: `);
      const updatedActorBlock = await getTargetedDeltaPatch(targetActorMatrix.actor_name, targetActorMatrix, feedback, domainData);

      if (updatedActorBlock) {
        currentMatrixData[index] = { ...targetActorMatrix, ...updatedActorBlock, actor_name: targetActorMatrix.actor_name };
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentMatrixData, null, 2), 'utf8');
        console.log(`\n✅ Local structure element updated successfully!`);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalOutputPath = path.join(OUTPUT_DIR, `5.Final-Techno-Functional-Exception-Matrix-${timestamp}.txt`);
    
    fs.writeFileSync(
      finalOutputPath,
      `=== Final Techno-Functional Activity and Exception Matrix for domain :${domainData.domain} and niche :(${domainData.niche}) ===\n\n${JSON.stringify(currentMatrixData, null, 2)}`,
      'utf8'
    );
    console.log(`\n\x1b[32m✔ Success! Complete matrix built and exported to: ${finalOutputPath}\x1b[0m`);

  } catch (err) {
    console.error("\n\x1b[31m✕ Pipeline Run Error:\x1b[0m", err.message);
  } finally {
    rl.close();
  }
})();
