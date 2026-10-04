const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process'); // Continuous streaming mechanics channel
const readline = require('readline');

// ============================================================================
// 📋 PASTE ANY CUSTOM AI PROMPTS DIRECTLY HERE (ISOLATION LAYER)
// ============================================================================
const PROMPTS = {
  /**
   * 1. BASELINE PROMPT BLOCK (Generates Mermaid code enclosed inside a valid JSON schema wrapper)
   */
  BASELINE_GENERATION: (actorData, objectsData, actorsData, domainData) => {
    return `You are a WORLD-CLASS SYSTEMS ARCHITECT ENGINE. Your goal is to map out a partial visual system flowchart segment for ONE specific actor, formatted strictly using Mermaid.js syntax (graph TD).

=== CONTEXT VARIABLES ===
- DOMAIN: ${domainData.domain}
- NICHE: ${domainData.niche}

=== TARGET SPECIFIC ACTOR TRANSACTIONS TO MAP ===
${JSON.stringify(actorData, null, 2)}

=== GROUNDING MATRICES REFERENCE ===
--- DATA SCHEMA RELATIONSHIPS ---
${objectsData.substring(0, 3000)}

--- BUSINESS RULE SETS ---
${actorsData.substring(0, 3000)}

=== DIAGRAM ARCHITECTURE INSTRUCTIONS ===
1. Map out dynamic subgraphs tracking this specific actor's operations and operational boundaries.
2. Link nodes sequentially using standard arrows (-->).
3. Weave conditional exception error paths directly into the map layout matching rule failures.

=== OUTPUT SPECIFICATION SCHEMA FORMAT ===
You must return your output enclosed inside this valid minified JSON object structure. Do not escape newlines inside the mermaid string manually.
{
  "actor_name": "${actorData.actor_name || 'System Actor'}",
  "mermaid_blueprint": "graph TD\\n    subgraph Operations\\n        A[Node] --> B[Node]\\n    end"
}
Return ONLY a valid minified JSON object wrapper matching the structural block requested. No markdown fences. No preamble.

Assistant:\n`;
  },

  /**
   * 2. INTERACTIVE REVISION/DELTA PATCH PROMPT BLOCK
   */
  INTERACTIVE_PATCH: (actorName, previousActorData, feedbackText, domainData) => {
    return `You are an isolated patching utility for actor diagram layout: [${actorName}].
MUTATION ORDER: "${feedbackText}"

CURRENT BLOCK STATE:
${JSON.stringify(previousActorData, null, 2)}

=== OBJECTIVE ===
Modify the Mermaid connectors and node blocks inside the "mermaid_blueprint" property string matching the user feedback. 

OUTPUT SPECIFICATION SCHEMA FORMAT:
{
  "actor_name": "${actorName}",
  "mermaid_blueprint": "..."
}
Output ONLY the clean updated JSON object structure. No conversation.

Assistant:\n`;
  }
};

// ============================================================================
// SYSTEM HARDWARE & FILE PATH PIPELINE CONFIGURATION MATRIX
// ============================================================================
const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    CACHE_FILENAME: 'techno-functional-matrix-cache.json',
    EXPORT_PREFIX: '6.Final-System-Architecture-Blueprint-Graph-'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    NGL: '0',
    MAX_TOKENS: '4048',
    PATCH_TOKENS: '2048',
    BATCH_SIZE: '2048', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  SCRUBBERS: {
    JSON_FENCE: /```json\s*/gi,
    GENERIC_FENCE: /```\s*/g
  }
};

const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
const TMP_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR);
const CACHE_FILE_PATH = path.join(OUTPUT_DIR, CONFIG.PATHS.CACHE_FILENAME);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

function streamLlamaCli(promptText, taskName, maxTokens = CONFIG.MODEL.MAX_TOKENS) {
  return new Promise((resolve, reject) => {
    const tmpPromptFile = path.join(TMP_DIR, `tmp_${taskName}_prompt.txt`);
    
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(tmpPromptFile, promptText, 'utf8');

    const args = [
      '-hf', CONFIG.MODEL.IDENTIFIER,
      '-ngl', CONFIG.MODEL.NGL,
      '--single-turn',
      '-b', CONFIG.MODEL.BATCH_SIZE, 
      '-t', CONFIG.MODEL.THREADS,     
      '--reasoning', CONFIG.MODEL.REASONING_MODE,
      '--log-disable', 
      '-f', tmpPromptFile,
      '-n', maxTokens.toString()
    ];

    const child = spawn(CONFIG.MODEL.EXEC_BINARY, args);
    let capturedBuffer = '';

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      capturedBuffer += chunk;
      process.stdout.write(chunk); 
    });

    child.stderr.on('data', (data) => {
      const errChunk = data.toString();
      if (errChunk.toLowerCase().includes('error')) {
        console.error(`\n[Model Log Warning]: ${errChunk}`);
      }
    });

    child.on('close', (code) => {
      if (fs.existsSync(tmpPromptFile)) fs.unlinkSync(tmpPromptFile);
      if (code !== 0 && code !== null) {
        return reject(new Error(`[${taskName}] Process stream closed with error signature code: ${code}`));
      }
      resolve(capturedBuffer.trim());
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
  let cleaned = rawStr.replace(CONFIG.SCRUBBERS.JSON_FENCE, '').replace(CONFIG.SCRUBBERS.GENERIC_FENCE, '').trim();
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

async function generateSingleActorMatrix(actorData, objectsData, actorsData, domainData) {
  const prompt = PROMPTS.BASELINE_GENERATION(actorData, objectsData, actorsData, domainData);
  const rawOutput = await streamLlamaCli(prompt, `actor_block_${Date.now()}`, CONFIG.MODEL.MAX_TOKENS);
  const parts = rawOutput.split("Assistant:\n");
  let cleaned = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  return JSON.parse(cleanJsonString(cleaned));
}

async function getTargetedDeltaPatch(actorName, previousActorData, feedbackText, domainData) {
  const prompt = PROMPTS.INTERACTIVE_PATCH(actorName, previousActorData, feedbackText, domainData);
  const rawOutput = await streamLlamaCli(prompt, 'tech_func_patch', CONFIG.MODEL.PATCH_TOKENS);
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

    console.log(`\n📖 Loading source actors from: ${path.basename(actorsFilePath)}`);
    console.log(`📖 Loading source transaction journeys from: ${path.basename(journeysFilePath)}`);
    
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
          console.log(`\n⏳ Structuring target segment workflow for: [${entry.actor_name}]...`);
          try {
            const singleBlock = await generateSingleActorMatrix(entry, objectsMatrixContent, actorsMatrixContent, domainData);
            if (singleBlock) currentMatrixData.push(singleBlock);
          } catch (e) {
            console.log(`⚠️ Segment parsing failure skipped for [${entry.actor_name}]: ${e.message}`);
          }
        }
        fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(currentMatrixData, null, 2), 'utf8');
      } else {
        console.log("🔄 Loading structural state instantly from disk cache...");
        currentMatrixData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf8'));
      }
    } else {
      console.log("⚙️ Executing baseline async sequential builder loop...");
      for (let entry of baselineJourneysInput) {
        console.log(`\n⏳ Structuring target segment workflow for: [${entry.actor_name}]...`);
        try {
          const singleBlock = await generateSingleActorMatrix(entry, objectsMatrixContent, actorsMatrixContent, domainData);
          if (singleBlock) currentMatrixData.push(singleBlock);
        } catch (e) {
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
    
    // ============================================================================
    // ⚡ CONVERSION VALVE: ASSEMBLES AND MERGES CLEAN MERMAID SCRIPT CHUNKS
    // ============================================================================
    let integratedMermaidDiagram = `graph TD\n`;
    
    currentMatrixData.forEach(block => {
      if (block.mermaid_blueprint) {
        // Strip away child "graph TD" string indicators if the model added them inside row nodes
        let cleanedSegment = block.mermaid_blueprint
          .replace(/graph TD/gi, '')
          .replace(/graph LR/gi, '')
          .trim();
          
        integratedMermaidDiagram += `\n    %% Subgraph Matrix Flow for Actor: ${block.actor_name}\n    ${cleanedSegment}\n`;
      }
    });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const finalOutputPath = path.join(OUTPUT_DIR, `${CONFIG.PATHS.EXPORT_PREFIX}${timestamp}.txt`);
    
    fs.writeFileSync(
      finalOutputPath,
      `=== Final Service Blueprint Structural Architecture Graph for domain :${domainData.domain} and niche :(${domainData.niche}) ===\n\n${integratedMermaidDiagram}`,
      'utf8'
    );
    console.log(`\n\x1b[32m✔ Success! Complete merged Mermaid diagram compiled and exported to: ${finalOutputPath}\x1b[0m`);
    
  } catch (err) {
    console.error(`\n\x1b[31m✕ Pipeline Run Error:\x1b[0m`, err.message);
  } finally {
    rl.close();
  }
})();
