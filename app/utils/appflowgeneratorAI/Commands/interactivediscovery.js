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
  tokens: '1024'
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

function parseField(rawText) {
  // 1. Split the text to focus only on what comes after "Assistant:"
const assistantPart = rawText.split("Assistant:\n")[1] || "";

// 2. Use Regular Expressions to extract the values after "Domain:" and "Niche:"
const domainMatch = assistantPart.match(/Domain:\s*(.*)/);
const nicheMatch = assistantPart.match(/Niche:\s*(.*)/);

// 3. Store the extracted values into your domainData object
const domainData = {
    domain: domainMatch ? domainMatch[1].trim() : "",
    niche: nicheMatch ? nicheMatch[1].trim() : ""
};

// Verify the results
console.log("Extracted Object:", domainData);
console.log("Domain:", domainData.domain);
console.log("Niche:", domainData.niche);

  return domainData
}

async function getBusinessDomain(businessIdea) {
  const prompt = `You are an industry taxonomy system. Analyze this business idea: "${businessIdea}"
Identify its modern technology vertical .
Output exactly two lines formatted strictly like this:
Domain: [Name of Vertical]
Niche: [Target Market Niche]`;

  const output = await callLlamaCli(prompt, 'domain');
  return parseField(output);
}

// REGENERATION PASS: Consumes the previous draft and applies the human's explicit tuning instructions
async function getBusinessObjects(businessIdea, domainData, feedbackText = null, previousDraft = null) {
  let prompt = '';
  
  if (!feedbackText) {
    // Phase 2A: Initial Baseline Generation Pass
    prompt = `You are a database and enterprise systems analyst. 
Given the business idea: "${businessIdea}" operating in the "domainData.domain (${domainData.niche})" sector.
1. List the 10-15 most critical Functional Business Objects  required to execute this model.
2. APPLICATION FLOW & TRANSACTION DETAILS MANDATE: To identify the true essential objects, you must trace the step-by-step operational lifecycle and user transaction journey of the application. Extract only the active entities that process, record, or fulfill these workflows. For every primary master transaction or collection entity identified, you MUST mechanically extract and include its corresponding multi-item detail records as separate, individual strings (e.g., if a transaction entity holds multiple entry lines, list both the master transaction name and its specific constituent item or line entity name independently in the array).
3. STRICT BUSINESS REALITY FILTER: You must ONLY include active objects that represent real-world commercial transactions or core operational assets. 
   - ABSOLUTELY FORBID and EXCLUDE technical infrastructure boilerplate (such as storage, loggers, media assets, automation steps, or template systems).
   - ABSOLUTELY FORBID and EXCLUDE non-operational static lookup choices, properties, design details, system utilities, configurations, or data-type descriptors (such as abstract pricing units, feature traits, or value metrics). Every object must represent a standalone commercial operational step or tangible asset entity.
4. ABSOLUTE DEDUPLICATION (OPERATIONAL ORDER): Every element inside the BusinessObjects array must be 100% unique. To guarantee zero duplicates or repeated entries, you MUST sort the entire array in strict chronological operational order, following the natural step-by-step application transaction flow from start to finish. Do not repeat any business object.
5. NO FILLER TEXT: Do not include introductory phrases, markdown formatting blocks, explanations, notes, or conversational signature text.

For each object, detail its Input data, primary business activity, and output state.

You must output your response as a valid, minified or formatted JSON array containing the processed objects. Do not include markdown text, explanations, or code fences outside the JSON. 

Each object in the array must strictly follow this key structure:

[
  {
    "object_name": "Name of the object",
    "input": "Data received",
    "activity": "System validation or process executed",
    "output": "Downstream state produced"
  }
]


`;

/*for testing only not acutal prompt*/
/*prompt = `You are a database and enterprise systems analyst. 
Given the business idea: "${businessIdea}" operating in the "domainData.domain (${domainData.niche})" sector. just give 1-2 business objects only 
For each object, detail its Input data, primary business activity, and output state.

Format your output exactly as a clean markdown list:
### [Object Name]
- **Input:** data received
- **Activity:** system validation or process executed
- **Output:** downstream state produced`;
*/
  } else {
    // Phase 2B: Human Refinement loop injection block
    prompt = `You are a senior enterprise architecture reviewer. 
We are refining the foundational business objects for the business concept: "${businessIdea}" in the "${domainData.domain}" sector.

Here is the current draft of the structural objects:
${previousDraft}

The human user has given the following explicit feedback and adjustments:
"${feedbackText}"

Re-evaluate, re-order, add, remove, or modify the objects, exactly as requested by the user. Maintain the structural output format:
You must output your response as a valid, minified or formatted JSON array containing the processed objects. Do not include markdown text, explanations, or code fences outside the JSON. 

Each object in the array must strictly follow this key structure:

[
  {
    "object_name": "Name of the object",
    "input": "Data received",
    "activity": "System validation or process executed",
    "output": "Downstream state produced"
  }
]`;
  }

  return await callLlamaCli(prompt, 'objects');
}

// Deep Downstream Steps (Phases 3, 4, 5 omitted here for brevity, keeping structure identical to prior script)

/**
 * Master Loop Handler
 */
(async () => {
  const USER_BUSINESS_INPUT = "online groceries app like if i order i get those within 15 minutes or 30 minutes";
  
  try {
    console.log("🚀 INITIATING INTERACTIVE HUMAN-IN-THE-LOOP BLUEPRINT ENGINE...");
    
    // 1. Get Domain (Deterministic baseline)
    //const domainData = await getBusinessDomain(USER_BUSINESS_INPUT);

    const domainData = await getInteractiveBusinessDomain(
      USER_BUSINESS_INPUT, 
      askQuestion, 
      callLlamaCli, 
      parseField
    );
    console.log(`\nDomain Category Identified: ${domainData.domain} (${domainData.niche})`);

    let objectsText = "";
    let userFeedback = "";
    let isApproved = false;
    let iterationCount = 1;
    let assistantOutput="";
    let parts="";

    // 2. RUNTIME HUMAN REFINEMENT LOOP (Repeats execution loops dynamically until human types "approved")
    while (!isApproved) {
      // 1. Split the string by the target marker
 parts = objectsText.split("Assistant:\n");

// 2. Safely grab the text after the marker (if it exists) and trim whitespace
 assistantOutput = parts.length > 1 ? parts[1].trim() : "";

      console.log(`\n📦 [Iteration #${iterationCount}] Running object structural generation...`);
      assistantOutput = await getBusinessObjects(USER_BUSINESS_INPUT, domainData, userFeedback, assistantOutput);
      
      // Write current state immediately to a review text file for user inspection
      const reviewFilePath = path.join(OUTPUT_DIR, 'current-objects-review.txt');
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      fs.writeFileSync(reviewFilePath, `=== CURRENT DATA MATRIX DRAFT ===\n\n${assistantOutput}`, 'utf8');
      
      console.log(`\n--- CURRENT CORE DRAFT LINKED ---`);
      console.log(assistantOutput);
      console.log(`\n📂 Current draft written to disk for manual inspection: ${reviewFilePath}`);
      
      const userInput = await askQuestion(
        `\n👉 Review the output above. If it's perfect, type 'approved'. Otherwise, type your modifications (e.g., 'Change Object X to have input Y', 'Add CustomerAccount object', 'Reorder sequence'): `
      );

      if (userInput.trim().toLowerCase() === 'approved') {
        isApproved = true;
        console.log("✅ Architecture foundations locked down by designer! Advancing downstream processing...");
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reviewFilePath1 = path.join(OUTPUT_DIR, `final-Objects-for-${domainData.domain}_and_(${domainData.niche}_${timestamp}.txt`);
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const parts1 = assistantOutput.split(/assistant:\s*/i);

// 2. Safely grab the text after the marker and trim off any starting/trailing empty spaces
const assistantContent1 = parts1.length > 1 ? parts1[1].trim() : "";

// Output the extracted markdown list
console.log(assistantContent1);


      fs.writeFileSync(reviewFilePath1, `=== Final DATA MATRIX for domain :${domainData.domain} and niche :(${domainData.niche}  ===\n\n${assistantContent1}`, 'utf8');
      
      console.log(`\n--- Final CORE  LINKED ---`);
      console.log(assistantOutput);
      console.log(`\n📂 final draft written to disk for next processing: ${reviewFilePath1}`);
      } else {
        userFeedback = userInput.trim();
        iterationCount++;
      }
    }

    // 3. Move downstream safely with 100% clean object blueprints
    console.log("\n⚡ Foundations verified. Compiling deep state variables and workflows...");
    // Execute getStagesAndRules(), getActorsAndRoles(), generateFlowchart() matching prior step signatures...
    
    console.log("\n🎉 Full pipeline completed with high human precision mapping alignment.");
    rl.close();

  } catch (error) {
    console.error(`\n❌ SYSTEM PIPELINE INTERRUPT: ${error.message}`);
    rl.close();
    process.exit(1);
  }
})();

async function getInteractiveBusinessDomain(businessIdea, askQuestion, callLlamaCli, parseField) {
  let userFeedback = null;
  let previousDraft = "";
  let domainData = { domain: "", niche: "" };

  while (true) {
    const prompt = !userFeedback 
      ? `You are an industry taxonomy system. Analyze this business idea: "${businessIdea}"\nIdentify its modern technology vertical.\nOutput exactly two lines formatted strictly like this:\nDomain: [Name of Vertical]\nNiche: [Target Market Niche]`
      : `You are an industry taxonomy system. Refine this configuration for: "${businessIdea}"\n\nCurrent Draft:\n${previousDraft}\n\nUser Feedback: "${userFeedback}"\n\nOutput exactly two lines formatted strictly like this:\nDomain: [Name of Vertical]\nNiche: [Target Market Niche]`;

    const output = await callLlamaCli(prompt, 'domain');
    domainData = parseField(output);
    previousDraft = `Domain: ${domainData.domain}\nNiche: ${domainData.niche}`;

    console.log(`\n--- CURRENT TAXONOMY EVALUATION ---\n${previousDraft}`);

    const userInput = await askQuestion(`\n👉 Type 'approved' to lock it in, or type modifications to rerun: `);
    
    if (userInput.trim().toLowerCase() === 'approved') {
      console.log(`✅ Classification locked: ${domainData.domain} (${domainData.niche})`);
      return domainData;
    }

    userFeedback = userInput.trim();
  }
}




