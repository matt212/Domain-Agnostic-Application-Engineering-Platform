const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const TMP_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile');

const MODEL_PASS_CONFIG = {
  // Directly targets the lightweight 3B model file already cached on your MacBook Pro
 // model: '/Users/apple/.cache/huggingface/hub/models--Qwen--Qwen2.5-Coder-3B-Instruct-GGUF/snapshots/f74adce6aa16316c625447af059dbebe4983757c/qwen2.5-coder-3b-instruct-q4_k_m.gguf',
 //model: 'Qwen/Qwen2.5-Coder-3B-Instruct-GGUF',
 //model:'Qwen/Qwen3-8B-GGUF:Q4_K_M' ,
 model: 'unsloth/Qwen3.5-9B-GGUF', 
 //28 minutes for first run
 ngl: '0',            // Pure, stable CPU execution for Intel Mac environments
  threads: '6',        // Explicitly matched to your 6 physical Intel cores
  tokens: '3072',      // High ceiling gives the model plenty of runway to close JSON brackets
};

// Interface to capture live human feedback from the terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

function callLlamaCli(promptText, taskName) {
  return new Promise((resolve, reject) => {
    const tmpPromptFile = path.join(TMP_DIR, `tmp_${taskName}_prompt.txt`);
    const tmpOutputFile = path.join(TMP_DIR, `tmp_${taskName}_out.txt`);
    
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(tmpPromptFile, promptText, 'utf8');

    const args = [
      '-hf', MODEL_PASS_CONFIG.model,
      '-ngl', MODEL_PASS_CONFIG.ngl,
      '--single-turn',
      '--reasoning', 'off',
      '-fa', '0',            // Disables flash attention overhead loops on Intel/AMD configs
      '--log-disable',       // Silence internal framework logs completely
      '--no-display-prompt', // Stop prompt echoing buffer delays
      '-t', MODEL_PASS_CONFIG.threads,
      '-f', tmpPromptFile,
      '-n', MODEL_PASS_CONFIG.tokens,
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

/**
 * Extracts the Domain and Niche strings out of the custom header line safely
 */
function extractDomainAndNicheFromHeader(fileContent) {
  const targetHeader = "=== Final DATA MATRIX for domain :";
  if (!fileContent.startsWith(targetHeader)) {
    return { domain: "Unknown Domain", niche: "Unknown Niche" };
  }

  const firstLineEnd = fileContent.indexOf('\n');
  const headerLine = firstLineEnd !== -1 ? fileContent.substring(0, firstLineEnd) : fileContent;

  const domainPart = headerLine.split("=== Final DATA MATRIX for domain :")[1] || "";
  const nicheSplit = domainPart.split(" and niche :");
  
  const domainValue = nicheSplit[0] ? nicheSplit[0].trim() : "Unknown Domain";
  const nicheValue = nicheSplit[1] ? nicheSplit[1].replace("===", "").trim() : "Unknown Niche";

  return { domain: domainValue, niche: nicheValue };
}

/**
 * Stage 3 Process: Interactive Actor & Roles Engine
 */
async function getActorsAndRoles(objectsMatrixContent, domainData, targetActorJson = null, feedbackText = null, globalDraft = null) {
  let prompt = '';

  if (!feedbackText) {
    // Initial Baseline Pass
    prompt = `You are a Principal Enterprise Systems Architect and IAM Security Engineer.
Analyze the following sequential Business Objects Matrix designed for a system operating in the "${domainData.domain} (${domainData.niche})" sector.

=== FOUNDATIONAL BUSINESS OBJECTS MATRIX ===
${objectsMatrixContent}
===========================================

Output a valid JSON array of Actor profiles based on this model context. Tailor roles tightly to "${domainData.niche}".

Each object in the array must follow this structure:
{
  "actor_name": "[Actor Name]",
  "operational_role": "[Profile context description]",
  "core_responsibilities": ["[Action item]"],
  "access_authorization_and_scope": {
    "What_They_Can_See": ["[Record view]"],
    "What_They_Can_Create": ["[Object init]"],
    "What_They_Can_Change": ["[Modifiable aspect]"],
    "What_They_Can_Remove": ["[Removable item]"],
    "Operations_They_Can_Run": ["[System flow]"],
    "Business_Rules_And_Guardrails": {
      "Data_Privacy": "[Boundaries]",
      "Order_Lock": "[Locks]"
    }
  }
}
Output raw JSON array structure only. No markdown text, no fences. Keep entries punchy, concise, and focused to maximize completion boundaries.`;
  } else if (globalDraft && !targetActorJson) {
    // 🔥 NEW: General-Purpose Feedback Mode (Analyzes everything to guarantee 100% structural domain coverage)
    prompt = `You are a Principal Enterprise Systems Architect reviewing an entire system authorization framework for the "${domainData.domain} (${domainData.niche})" sector.

=== FOUNDATIONAL BUSINESS OBJECTS MATRIX REFERENCE ===
${objectsMatrixContent}
======================================================

=== CURRENT ACTIVE MATRICES DRAFT ARRAY ===
${globalDraft}
===========================================

=== GLOBAL HUMAN CRITIQUE & CORE DIRECTIVE ===
"${feedbackText}"
==============================================

Re-evaluate the entire structural array draft based on the baseline objects matrix and the global human directive. You may add new actors, remove mismatched elements, or adjust fields across the layout. 
Output your final updated response immediately as a valid, single JSON array matching the original key structures exactly. Do not include markdown code fences, headers, comments, or introductory text.`;
  } else {
    // Pinpoint Isolated Actor Editing Mode (Instant processing)
    prompt = `You are a senior IAM architect reviewer updating an actor profile for a system operating in the "${domainData.domain} (${domainData.niche})" sector.

=== CURRENT ACTOR DRAFT TO ADJUST ===
${JSON.stringify(targetActorJson, null, 2)}
==============================

=== USER MODIFICATION REQUEST ===
"${feedbackText}"
=================================

Apply modifications directly. Output a valid, single JSON object matching the input structure keys exactly. Do not include markdown blocks, explanations, or conversational filler outside the raw JSON.`;
  }

  console.log("⚙️ Processing calculations via optimized 3B local engine model...");
  const rawOutput = await callLlamaCli(prompt, 'actors_roles');
  
  const parts = rawOutput.split("Assistant:\n");
  const cleanedContent = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  
  return cleanedContent;
}

function cleanJsonString(rawStr) {
  const startIdx = rawStr.indexOf('[');
  const startObjIdx = rawStr.indexOf('{');
  const endIdx = rawStr.lastIndexOf(']');
  const endObjIdx = rawStr.lastIndexOf('}');

  let finalStart = startIdx !== -1 ? startIdx : startObjIdx;
  let finalEnd = endIdx !== -1 ? endIdx : endObjIdx;

  if (finalStart === -1 || finalEnd === -1) {
    return rawStr
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/, '')
      .replace(/```$/, '')
      .trim();
  }
  return rawStr.substring(finalStart, finalEnd + 1).trim();
}

/**
 * Runtime Interactive Human-in-the-Loop Handler
 */
(async () => {
  try {
    console.log("🚀 INITIATING INTERACTIVE SYSTEM ACTOR & AUTHORIZATION PIPELINE...");

    const objectsFilePath = path.join(OUTPUT_DIR, '1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt');
    if (!fs.existsSync(objectsFilePath)) {
      throw new Error(`Source business objects file missing at: ${objectsFilePath}.`);
    }
    const fullFileContent = fs.readFileSync(objectsFilePath, 'utf8');
    const domainData = extractDomainAndNicheFromHeader(fullFileContent);
    
    console.log(`🎯 Context Frame Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);
 
    let currentActorsArray = [];
    let isApproved = false;
    let iterationCount = 1;

    console.log(`\n👥 [Iteration #${iterationCount}] Compiling baseline roles matrix layers (First run requires CPU calculation time)...`);
    const initialRaw = await getActorsAndRoles(fullFileContent, domainData, null, null, null);
    
    try {
      currentActorsArray = JSON.parse(cleanJsonString(initialRaw));
    } catch (e) {
      console.error("⚠️ Failed to parse initial LLM generation into JSON array. Storing fallback empty state.");
      currentActorsArray = [];
    }

    while (!isApproved) {
      const displayString = JSON.stringify(currentActorsArray, null, 2);
      const reviewFilePath = path.join(OUTPUT_DIR, 'current-actors-review.txt');
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(reviewFilePath, `=== CURRENT SYSTEM ACTORS MATRIX DRAFT ===\n\n${displayString}`, 'utf8');
      
      console.log(`\n--- CURRENT CORE DRAFT LINKED ---`);
      process.stdout.write(displayString + '\n');
      console.log(`\n📂 Current draft written to disk for manual inspection: ${reviewFilePath}`);
      
      const userInput = await askQuestion(
        `\n👉 Review the output above. If it's perfect, type 'approved'. Otherwise, type 'edit' to open the optimization matrix: `
      );

      if (userInput.trim().toLowerCase() === 'approved') {
        isApproved = true;
        console.log("✅ Identity and Authorization systems locked down!");
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const finalFilePath = path.join(OUTPUT_DIR, `2.Final-Actors-for-${domainData.domain}_and_${domainData.niche}_${timestamp}.txt`);
        fs.writeFileSync(finalFilePath, `=== Final SYSTEM ACTORS & AUTHORIZATION MATRIX ===\n\n${displayString}`, 'utf8');
        process.stdout.write(displayString + '\n');
        console.log(`\n🎉 Step complete. Blueprint document written to disk:\n📂 ${finalFilePath}`);
      } else if (userInput.trim().toLowerCase() === 'edit') {
        if (!Array.isArray(currentActorsArray)) {
          console.log("❌ Matrix state is empty or invalid JSON array.");
          continue;
        }
        console.log("\n--- Available Matrix Actions ---");
        // Option 1: Global General Purpose Prompt Instruction
        console.log(`[1] Global Feedback: Run general instruction on whole matrix array`);
        // Option 2: Add a new actor from scratch
        console.log(`[2] [+] Add a completely new actor profile`);
        // Option 3: Dynamic existing rows for targeted quick edits
        currentActorsArray.forEach((act, idx) => {
          console.log(`[${idx + 3}] Edit Actor: ${act.actor_name || "Unnamed Actor"}`);
        });
        const cancelOptionIndex = currentActorsArray.length + 3;
        console.log(`[${cancelOptionIndex}] [x] Cancel and go back`);
        
        const selectionInput = await askQuestion(`\nSelect an option number (1-${cancelOptionIndex}): `);
        const index = parseInt(selectionInput.trim(), 10) - 1;

        // CHECK 1: User selected Cancel
        if (index === currentActorsArray.length + 2) {
          console.log("↩️ Operation cancelled. Returning to main overview prompt loop menu...");
          continue;
        }
        
        // CHECK 2: Global General Purpose Feedback Execution
        if (index === 0) {
          const generalPromptInput = await askQuestion(`\nEnter your general instruction / global requirement criteria: \n> `);
          if (!generalPromptInput.trim()) {
            console.log("❌ Instruction parameter cannot be empty.");
            continue;
          }
          iterationCount++;
          console.log(`\n👥 [Iteration #${iterationCount}] Executing global data realignment pass across the full matrix array (This reads the big files once)...`);
          
          const globalMutatedRaw = await getActorsAndRoles(fullFileContent, domainData, null, generalPromptInput.trim(), displayString);
          try {
            currentActorsArray = JSON.parse(cleanJsonString(globalMutatedRaw));
            console.log("\n✨ Whole structural blueprint matrix realigned successfully.");
          } catch (jsonErr) {
            console.error("\n❌ Failed to parse global realignment into array. Changes discarded.");
          }
          
        // CHECK 3: Add a completely new actor profile
        } else if (index === 1) {
          const newActorName = await askQuestion(`\nEnter the name/title for the new actor: `);
          if (!newActorName.trim()) {
            console.log("❌ Actor name cannot be empty.");
            continue;
          }
          const feedbackInput = await askQuestion(`Describe this new actor's role, core responsibilities, and access boundaries: `);
          iterationCount++;
          console.log(`\n👥 [Iteration #${iterationCount}] Creating new actor profile for "${newActorName}"...`);
          
          const placeholderActorObj = {
            actor_name: newActorName.trim(),
            operational_role: "",
            core_responsibilities: [],
            access_authorization_and_scope: {
              What_They_Can_See: [],
              What_They_Can_Create: [],
              What_They_Can_Change: [],
              What_They_Can_Remove: [],
              Operations_They_Can_Run: [],
              Business_Rules_And_Guardrails: { Data_Privacy: "", Order_Lock: "" }
            }
          };
          const newActorRaw = await getActorsAndRoles(null, domainData, placeholderActorObj, `Initialize this profile completely based on these details: ${feedbackInput.trim()}`, null);
          try {
            const newActorObj = JSON.parse(cleanJsonString(newActorRaw));
            currentActorsArray.push(newActorObj);
            console.log(`\n✨ New actor "${newActorObj.actor_name || newActorName}" added successfully to the matrix array.`);
          } catch (jsonErr) {
            console.error("\n❌ Failed to parse new actor updates into layout object. Changes discarded.");
          }
          
        // CHECK 4: Edit an individual existing actor entry
        } else if (!isNaN(index) && index >= 2 && index < (currentActorsArray.length + 2)) {
          const arrayIndex = index - 2; 
          const chosenActor = currentActorsArray[arrayIndex];
          console.log(`\nSelected Actor: ${chosenActor.actor_name}`);
          const feedbackInput = await askQuestion(`Enter the specific modifications for "${chosenActor.actor_name}": `);
          iterationCount++;
          console.log(`\n👥 [Iteration #${iterationCount}] Regenerating target actor data structure strictly...`);
          
          const updatedActorRaw = await getActorsAndRoles(null, domainData, chosenActor, feedbackInput.trim(), null);
          try {
            const updatedActorObj = JSON.parse(cleanJsonString(updatedActorRaw));
            currentActorsArray[arrayIndex] = updatedActorObj;
            console.log("✨ Single actor component updated successfully inside the array.");
          } catch (jsonErr) {
            console.error("❌ Failed to parse single actor updates into structural object. Changes discarded.");
          }
        } else {
          console.log("❌ Invalid selection option index. Returning to loop menu.");
        }
      } else {
        console.log("Invalid option. Please type 'approved' or 'edit'.");
      }
    }

    rl.close();
  } catch (error) {
    console.error(`\n❌ SYSTEM PIPELINE INTERRUPT: ${error.message}`);
    rl.close();
    process.exit(1);
  }
})();
