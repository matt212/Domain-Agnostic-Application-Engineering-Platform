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
  tokens: '1536'
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
async function getActorsAndRoles(objectsMatrixContent, domainData, feedbackText = null, previousDraft = null) {
  let prompt = '';

  if (!feedbackText) {
    // Initial Baseline Generation Pass
    prompt = `You are a Principal Enterprise Systems Architect and IAM (Identity & Access Management) Security Engineer.
Analyze the following sequential Business Objects Matrix designed for a system operating in the "${domainData.domain} (${domainData.niche})" sector.

=== FOUNDATIONAL BUSINESS OBJECTS MATRIX ===
${objectsMatrixContent}
===========================================

Your objective is to identify and map every critical Human Actor, Systemic Interface Agent, and Third-Party Participant required to run, fulfill, and monitor this transactional model.

For every distinct Actor identified, you must meticulously compile three parameters:
1. **Core Operational Role:** Their functional profile, commercial objective, and operational context within the specific boundaries of the "${domainData.domain}" domain and the "${domainData.niche}" niche.
2. **Responsibilities Matrix:** A direct, action-oriented bulleted list mapping precisely which of the business objects above they interact with, manipulate, or depend on.
3. **Data Access Authorization & Security Scope:** Define their clear CRUD boundaries (Create, Read, Update, Delete) and strict operational data constraints to protect system integrity.

CRITICAL ARCHITECTURAL DIRECTIVE: Do not inventory generic user profiles. You must strictly tailor roles to the high-velocity operational realities of "${domainData.niche}" (e.g., highly compressed cycles, real-time tracking, edge coordination).

Format your output exactly as a clean, highly structured markdown document using this template structure:

### [Actor Name]
- **Operational Role:** [Deep system profile and context description]
- **Core Responsibilities:**
  * [Action item linked to object interaction]
  * [Action item linked to workflow execution]
- **Access Authorization & Scope:** [CRUD access bounds and data security constraints]

DO NOT include introductory text, conversational filler, summaries, markdown block tick wrappers, or closing remarks. Output the structural markdown list immediately.`;
  } else {
    // Refinement Loop Pass (Working on previous output generated)
    prompt = `You are a senior IAM architect reviewer.
We are refining the system actors and authorization matrix for a business context in the "${domainData.domain} (${domainData.niche})" sector.

Here is the current draft of the actors matrix:
${previousDraft}

The human user has given the following explicit feedback and adjustments:
"${feedbackText}"

Re-evaluate, add, remove, or modify the roles and permissions exactly as requested by the user. Maintain the structural output template:
### [Actor Name]
- **Operational Role:** [Deep system profile and context description]
- **Core Responsibilities:**
  * [Action item linked to object interaction]
- **Access Authorization & Scope:** [CRUD access bounds and data security constraints]`;
  }

  console.log("⚙️ Running actor layout matrix iteration via local AI model...");
  const rawOutput = await callLlamaCli(prompt, 'actors_roles');
  
  const parts = rawOutput.split("Assistant:\n");
  const cleanedContent = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  
  return cleanedContent;
}

/**
 * Runtime Interactive Human-in-the-Loop Handler
 */
(async () => {
  try {
    console.log("🚀 INITIATING INTERACTIVE SYSTEM ACTOR & AUTHORIZATION PIPELINE...");

    // 1. Locate and load the source business objects document
    const objectsFilePath = path.join(OUTPUT_DIR, 'final-Objects-for-Quick_Commerce-and-On-Demand_Grocery_Delivery.txt');
    if (!fs.existsSync(objectsFilePath)) {
      throw new Error(`Source business objects file missing at: ${objectsFilePath}. Please ensure your Objects step ran first.`);
    }
    const fullFileContent = fs.readFileSync(objectsFilePath, 'utf8');

    // 2. Extract context dimensions dynamically
    const domainData = extractDomainAndNicheFromHeader(fullFileContent);
    console.log(`🎯 Context Frame Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);

    let actorsText = "";
    let userFeedback = "";
    let isApproved = false;
    let iterationCount = 1;
    let assistantOutput = "";

    // 3. RUNTIME REFINEMENT LOOP
    while (!isApproved) {
      // Isolate any content split variants or reuse active running states
      const parts = actorsText.split("Assistant:\n");
      assistantOutput = parts.length > 1 ? parts[1].trim() : actorsText.trim();

      console.log(`\n👥 [Iteration #${iterationCount}] Compiling roles matrix layers...`);
      assistantOutput = await getActorsAndRoles(fullFileContent, domainData, userFeedback, assistantOutput);
      
      // Instantly record current state to a staging review path file
      const reviewFilePath = path.join(OUTPUT_DIR, 'current-actors-review.txt');
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(reviewFilePath, `=== CURRENT SYSTEM ACTORS MATRIX DRAFT ===\n\n${assistantOutput}`, 'utf8');
      
      console.log(`\n--- CURRENT CORE DRAFT LINKED ---`);
      console.log(assistantOutput);
      console.log(`\n📂 Current draft written to disk for manual inspection: ${reviewFilePath}`);
      
      // Capture live verification choice
      const userInput = await askQuestion(
        `\n👉 Review the output above. If it's perfect, type 'approved'. Otherwise, type your modifications (e.g., 'Add dark store manager actor', 'Change customer delete permission'): `
      );

      if (userInput.trim().toLowerCase() === 'approved') {
        isApproved = true;
        console.log("✅ Identity and Authorization systems locked down! Committing blueprints to persistent files...");
        
        // Construct final locked filepath layout matching your exact pattern parameters
        const finalFilePath = path.join(OUTPUT_DIR, `final-Actors-for-${domainData.domain}-and-(${domainData.niche}).txt`);
        
        const cleanSplitParts = assistantOutput.split(/assistant:\s*/i);
        const finalCleanedContent = cleanSplitParts.length > 1 ? cleanSplitParts[1].trim() : assistantOutput.trim();

        fs.writeFileSync(finalFilePath, `=== Final SYSTEM ACTORS & AUTHORIZATION MATRIX ===\n\n${finalCleanedContent}`, 'utf8');
        
        console.log(`\n--- FINAL COMPILAION LINKED ---`);
        console.log(finalCleanedContent);
        console.log(`\n🎉 Architecture step complete. Final blueprint document written to disk:\n📂 ${finalFilePath}`);
      } else {
        // Feed text directly back to refine the active output draft next round
        userFeedback = userInput.trim();
        actorsText = assistantOutput; 
        iterationCount++;
      }
    }

    rl.close();
  } catch (error) {
    console.error(`\n❌ SYSTEM PIPELINE INTERRUPT: ${error.message}`);
    rl.close();
    process.exit(1);
  }
})();
