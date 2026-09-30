const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const TMP_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile');

const MODEL_PASS_CONFIG = {
  model: 'Qwen/Qwen2.5-Coder-14B-Instruct-GGUF:Q4_K_M',
  ngl: '99',
  tokens: '2048' // Bumped tokens slightly to support 100% full journey coverage texts
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
 * Extracts the Domain and Niche strings out of the custom header line
 */
function extractDomainAndNicheFromHeader(fileContent) {
  const targetHeader = "=== Final DATA MATRIX for domain :";
  if (!fileContent.includes(targetHeader)) {
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
 * Stage 4 Process: Dynamic End-to-End Actor Journeys Document Generator
 */
async function getEndToEndJourney(objectsMatrixContent, actorsMatrixContent, domainData, feedbackText = null, previousDraft = null) {
  let prompt = '';

  if (!feedbackText) {
    // Initial Baseline Generation Pass
    prompt = `You are a Principal Enterprise Systems Architect and Lead Product Workflow Designer.
Analyze the following system specifications for a business operating in the "${domainData.domain} (${domainData.niche})" sector.

=== SYSTEM DATA MATRIX ===
${objectsMatrixContent}

=== SYSTEM ACTORS & AUTHORIZATION MATRIX ===
${actorsMatrixContent}

YOUR OBJECTIVE:
Iterate over the components in the SYSTEM DATA MATRIX and map them chronologically against the entities inside the SYSTEM ACTORS & AUTHORIZATION MATRIX. You must construct a highly granular, logical, real-world end-to-end user transaction journey with 100% structural coverage.

CRITICAL WORKFLOW STRUCTURING SCHEMATICS:
1. **Actor Continuity**: For every single actor found in the authorization matrix , map out their exact operational touchpoints from start to finish.
2. **Real-World Logical Timeline**: Structure the journey step-by-step so it tracks exactly how a transaction flows chronologically across all actors .
3. **Data & Access Alignment**: Ensure every step explicitly mentions the business objects modified and honors the strict CRUD limits and scopes defined for that actor. Do not invent out-of-scope actions.
4. **Format Template**: Structure your output precisely as a clean, highly readable Markdown documentation block using this exact formatting standard for each actor's journey:

### [Actor Name - Complete Flow Timeline]
- **Operational Role Context:** [Brief validation of their profile within this domain]
- **Chronological Milestones & Data Inputs:**
  * **Step X (Data Object Layer):** [Detailed action narrative explaining what they do, the explicit data inputs/outputs processed, and how it directly unlocks the next sequential actor's trigger]

DO NOT include introductory meta-dialogue, conversational greetings, code wrappers, or summary sections. Start immediately with the structural markdown analysis text.`;
  } else {
    // Refinement Loop Pass (Working on previous text output generated)
    prompt = `You are a senior system workflow reviewer.
We are refining the end-to-end actor transaction journey documentation for a business operating in the "${domainData.domain} (${domainData.niche})" sector.

Here is the current draft of the journey layout:
${previousDraft}

The human user has given the following explicit feedback and adjustments:
"${feedbackText}"

Re-evaluate, trace the logic, and modify the actor journeys exactly as requested by the user. Maintain the clean markdown document structure without adding introductory commentary or wrapper code block syntax.`;
  }

  console.log("⚙️ Running actor journey timeline analysis via local AI model...");
  const rawOutput = await callLlamaCli(prompt, 'actor_journeys');
  
  const parts = rawOutput.split("Assistant:\n");
  const cleanedContent = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  
  return cleanedContent;
}

/**
 * Runtime Interactive Human-in-the-Loop Handler
 */
(async () => {
  try {
    console.log("🚀 INITIATING INTERACTIVE ACTOR TRANSACTION JOURNEY GENERATION PIPELINE...");

    // 1. Locate and load the source matrices documents
    const objectsFilePath = path.join(OUTPUT_DIR, 'final-Objects-for-Quick_Commerce-and-On-Demand_Grocery_Delivery.txt');
    const actorsFilePath = path.join(OUTPUT_DIR, 'final-Actors-for-Quick_Commerce-and-On-Demand_Grocery_Delivery.txt');

    if (!fs.existsSync(objectsFilePath)) {
      throw new Error(`Source business objects file missing at: ${objectsFilePath}. Please run the objects generation phase first.`);
    }
    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');

    let actorsMatrixContent = "";
    if (fs.existsSync(actorsFilePath)) {
      actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
    } else {
      // Fallback check if it is still a draft file name
      const reviewFilePath = path.join(OUTPUT_DIR, 'current-actors-review.txt');
      if (fs.existsSync(reviewFilePath)) {
        actorsMatrixContent = fs.readFileSync(reviewFilePath, 'utf8');
      } else {
        throw new Error(`Source actors file missing at: ${actorsFilePath}. Please run the actors generation phase first.`);
      }
    }

    // 2. Extract context dimensions dynamically
    const domainData = extractDomainAndNicheFromHeader(objectsMatrixContent);
    console.log(`🎯 Context Frame Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);
 
    let journeysText = "";
    let userFeedback = "";
    let isApproved = false;
    let iterationCount = 1;

    // 3. RUNTIME REFINEMENT LOOP
    while (!isApproved) {
      console.log(`\n👥 [Iteration #${iterationCount}] Compiling granular end-to-end journey layers...`);
      journeysText = await getEndToEndJourney(objectsMatrixContent, actorsMatrixContent, domainData, userFeedback, journeysText);
      
      // Instantly record current state to a staging review path file
      const finalJourneyPath = path.join(OUTPUT_DIR, 'final-End-to-End-Actor-Journeys.txt');
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(finalJourneyPath, `=== E2E ACTOR TRANSACTION JOURNEYS FOR ${domainData.domain.toUpperCase()} ===\n\n${journeysText}`, 'utf8');
      
      console.log(`\n--- CURRENT JOURNEYS TEXT DRAFT ---`);
      console.log(journeysText);
      console.log(`\n📂 Active draft written to disk for inspection: ${finalJourneyPath}`);

      const userChoice = await askQuestion("\nAre you satisfied with this comprehensive end-to-end journey layout? (Type 'YES' to approve and exit, or provide adjustment notes to regenerate): ");
      
      if (userChoice.trim().toUpperCase() === 'YES') {
        isApproved = true;
        console.log(`\n\x1b[32m✔ Success! Final actor journey flow map generated and saved to: ${finalJourneyPath}\x1b[0m`);
      } else {
        userFeedback = userChoice;
        iterationCount++;
      }
    }
  } catch (err) {
    console.error("\n\x1b[31m✕ Pipeline Execution Failure:\x1b[0m", err.message);
  } finally {
    rl.close();
  }
})();
