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
 * Extracts the Domain and Niche strings out of a custom matrix header line
 */
/**
 * Extracts the Domain and Niche strings out of a custom matrix header line.
 * Throws a descriptive error if the header structure is corrupted or missing.
 */
function extractDomainAndNicheFromHeader(fileContent) {
  const targetHeader = "=== Final DATA MATRIX for domain :";
  const lineIndex = fileContent.indexOf(targetHeader);
  
  if (lineIndex === -1) {
    throw new Error(`Data format violation: Header identifier "${targetHeader}" could not be located in the source file.`);
  }

  const subset = fileContent.substring(lineIndex);
  const firstLineEnd = subset.indexOf('\n');
  const headerLine = firstLineEnd !== -1 ? subset.substring(0, firstLineEnd) : subset;

  const domainPart = headerLine.split(targetHeader)[1] || "";
  const nicheSplit = domainPart.split(" and niche :");
  
  if (!nicheSplit[0] || !nicheSplit[1]) {
    throw new Error(`Structural parsing violation: Header string matches prefix but failed context isolation split logic (" and niche :").`);
  }

  const domainValue = nicheSplit[0].trim();
  const nicheValue = nicheSplit[1].replace("===", "").trim();

  return { domain: domainValue, niche: nicheValue };
}


/**
 * Stage 4 Process: Operational Ownership / Flow + Decisions & Controls Engine
 */
async function getOperationalFlowsAndControls(actorsMatrixContent, objectsMatrixContent, domainData, feedbackText = null, previousDraft = null) {
  let prompt = '';

  if (!feedbackText) {
    // Initial Baseline Generation Pass
    prompt = `You are a Principal Enterprise Systems Architect and Workflow Automation Engineer.
Analyze the provided System Actors Authorization Matrix alongside the corresponding Sequential Data Matrix for the "${domainData.domain} (${domainData.niche})" system.

=== FINAL SYSTEM ACTORS & AUTHORIZATION MATRIX ===
${actorsMatrixContent}

=== FINAL DATA MATRIX ===
${objectsMatrixContent}
==================================================

Your objective is to model the exact sequential runtime flow mapping how "Who is responsible for running the business activities?" executes across operational barriers.
For every Business Object and its activities, map out the interactive lifecycle coordination plane combining Objects, Activities, Participants, and Responsibilities.

For every architectural step in the transaction flow, you must compile these 4 parameters:
1. **Operational Ownership & Flow Sequence:** Specify the sequential step number, the target Business Object, the active activity, and the Primary Participant executing it.
2. **Coordination & Flow Mechanics:** Define exactly how participants execute and coordinate the activities, explaining the data inputs transforming into system outputs.
3. **Decisions, Approvals, & Logic Gates:** Detail where human decisions or automated application logic choices occur (e.g., auto-routing criteria, capacity constraints, payment pass/fail checks).
4. **Systemic Controls & Validation Guardrails:** Detail hard system constraints, safety guardrails, SLA time-bounds (e.g., 15-30 minute compression metrics), or security verification checks required to advance to the next step.

Format your output exactly as a clean, highly structured markdown document using this template structure:

### [Step X: Business Object Name - Activity Name]
- **Operational Ownership / Flow:** Participant [Actor Name] executes [Activity Name] on the [Business Object Name] object.
- **Coordination Mechanics:** [Describe inputs, transformations, and outputs passing between participants]
- **Decisions & Approvals:** [Detail precise logic gates, business rules, human choices, or auto-routing triggers]
- **Systemic Controls:** [Detail automated guardrails, strict validations, validation errors, and SLA time-bound assertions]

DO NOT include introductory text, conversational filler, summaries, markdown block tick wrappers, or closing remarks. Output the structural markdown list immediately.`;
  } else {
    // Refinement Loop Pass (Working on previous output generated)
    prompt = `You are a senior workflow systems reviewer.
We are refining the Operational Ownership, Flow, Decisions, and Controls Matrix for the "${domainData.domain} (${domainData.niche})" sector.

Here is the current draft of the operational flow matrix:
${previousDraft}

The human user has given the following explicit feedback and adjustments:
"${feedbackText}"

Re-evaluate, modify, add, or refine the operational flow rules, logic gates, and systemic controls exactly as requested by the user. Maintain the structural template:
### [Step X: Business Object Name - Activity Name]
- **Operational Ownership / Flow:** Participant [Actor Name] executes [Activity Name] on the [Business Object Name] object.
- **Coordination Mechanics:** [Description]
- **Decisions & Approvals:** [Description]
- **Systemic Controls:** [Description]`;
  }

  console.log("⚙️ Running operational flow layout matrix iteration via local AI model...");
  const rawOutput = await callLlamaCli(prompt, 'operational_flows');
  
  const parts = rawOutput.split("Assistant:\n");
  const cleanedContent = parts.length > 1 ? parts[1].trim() : rawOutput.trim();
  
  return cleanedContent;
}

/**
 * Runtime Interactive Human-in-the-Loop Handler
 */
(async () => {
  try {
    console.log("🚀 INITIATING INTERACTIVE OPERATIONAL OWNERSHIP, FLOWS, DECISIONS & CONTROLS PIPELINE...");

    // 1. Locate and load the source matrices documents
    // Note: Reusing the files output by previous pipeline steps inside your designated environment.
    const actorsFilePath = path.join(OUTPUT_DIR, 'final-Actors-for-Quick_Commerce-and-On-Demand_Grocery_Delivery.txt');
    const objectsFilePath = path.join(OUTPUT_DIR, 'final-Objects-for-Quick_Commerce-and-On-Demand_Grocery_Delivery.txt');
    
    if (!fs.existsSync(actorsFilePath) || !fs.existsSync(objectsFilePath)) {
      throw new Error(`Required blueprint matrices files are missing inside ${OUTPUT_DIR}. Make sure previous structural stages completed successfully.`);
    }

    const actorsContent = fs.readFileSync(actorsFilePath, 'utf8');
    const objectsContent = fs.readFileSync(objectsFilePath, 'utf8');

    // 2. Extract context dimensions dynamically
    const domainData = extractDomainAndNicheFromHeader(objectsContent);
    console.log(`🎯 Context Frame Isolated -> Domain: "${domainData.domain}" | Niche: "${domainData.niche}"`);
 
    let flowsText = "";
    let userFeedback = "";
    let isApproved = false;
    let iterationCount = 1;
    let assistantOutput = "";

    // 3. RUNTIME REFINEMENT LOOP
    while (!isApproved) {
      console.log(`\n⚙️ [Iteration #${iterationCount}] Compiling operational ownership and control matrix layers...`);
      assistantOutput = await getOperationalFlowsAndControls(actorsContent, objectsContent, domainData, userFeedback, assistantOutput);
      
      // Instantly record current state to a staging review path file
      const reviewFilePath = path.join(OUTPUT_DIR, 'current-flows-review.txt');
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(reviewFilePath, `=== CURRENT OPERATIONAL FLOW MATRIX DRAFT ===\n\n${assistantOutput}`, 'utf8');
      
      console.log(`\n--- CURRENT CORE DRAFT LINKED ---`);
      console.log(assistantOutput);
      console.log(`\n📂 Current draft written to disk for manual inspection: ${reviewFilePath}`);
      
      console.log("\n================================================================================");
      console.log("Review the drafted logic matrix above.");
      console.log("Options:");
      console.log("1. Type your adjustments, missing logic choices, or step reorder instructions directly to iterate.");
      console.log("2. Type 'approve' to lock in this specification blueprint file.");
      console.log("================================================================================");
      
      const response = await askQuestion('\n👉 Enter feedback or "approve": ');
      
      if (response.trim().toLowerCase() === 'approve') {
        isApproved = true;
        
        const finalizedOutputFilename = `final-FlowsAndControls-for-${domainData.domain.replace(/\s+/g, '_')}-and-${domainData.niche.replace(/\s+/g, '_')}.txt`;
        const finalFilePath = path.join(OUTPUT_DIR, finalizedOutputFilename);
        
const finalFileHeader = `=== Final OPERATIONAL OWNERSHIP & CONTROL MATRIX for domain :${domainData.domain} and niche :${domainData.niche} ===\n\n`;
fs.writeFileSync(finalFilePath, finalFileHeader + assistantOutput, 'utf8');
// Clean up temporary active review file
if (fs.existsSync(reviewFilePath)) fs.unlinkSync(reviewFilePath);
console.log(`\n\n🎉 SUCCESS! Operational Flow Blueprint fully verified and locked down.`);
console.log(`💾 Final Matrix written permanently to: ${finalFilePath}\n`);
} else {
userFeedback = response.trim();
iterationCount++;
}
}
rl.close();
} catch (error) {
console.error(`\n❌ Pipeline terminated due to critical processing exception:\n${error.message}`);
rl.close();
process.exit(1);
}
})();

