const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const TMP_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/promptFile');

// Configuration
const MODEL_PASS_CONFIG = {
  model: 'Qwen/Qwen2.5-Coder-14B-Instruct-GGUF:Q4_K_M',
  ngl: '99',
  tokens: '1024'
};

/**
 * Executes a single llama-cli task safely with isolated prompt files
 */
function callLlamaCli(promptText, taskName) {
  return new Promise((resolve, reject) => {
    const tmpPromptFile = path.join(TMP_DIR, `tmp_\${taskName}_prompt.txt`);
    const tmpOutputFile = path.join(TMP_DIR, `tmp_\${taskName}_out.txt`);
    
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
      // Cleanup prompt file instantly
      if (fs.existsSync(tmpPromptFile)) fs.unlinkSync(tmpPromptFile);

      if (error) {
        if (fs.existsSync(tmpOutputFile)) fs.unlinkSync(tmpOutputFile);
        return reject(new Error(`[\({taskName}] Execution crash:\){error.message}`));
      }

      if (!fs.existsSync(tmpOutputFile)) {
        return reject(new Error(`[\${taskName}] Output file not generated.`));
      }

      const rawResult = fs.readFileSync(tmpOutputFile, 'utf8').trim();
      if (fs.existsSync(tmpOutputFile)) fs.unlinkSync(tmpOutputFile);
      resolve(rawResult);
    });
  });
}

/**
 * Step 1: Extract Modern Business Domain
 */
async function getBusinessDomain(businessIdea) {
  console.log("🔍 [Phase 1/5] Classifying macro business domain...");
  const prompt = `You are an industry taxonomy system. Analyze this business idea: "${businessIdea}"
Identify its modern technology vertical.
Output exactly two lines formatted strictly like this:
Domain: [Name of Vertical]
Niche: [Target Market Niche]`;

  const output = await callLlamaCli(prompt, 'domain');
  
  // Basic validation / parsing
  const domainMatch = output.match(/Domain:\s*(.*)/i);
  const nicheMatch = output.match(/Niche:\s*(.*)/i);
  
  return {
    domain: domainMatch ? domainMatch[1].trim() : 'Digital Transformation',
    niche: nicheMatch ? nicheMatch[1].trim() : 'On-Demand Operations'
  };
}

/**
 * Step 2: Map Business Objects / Core Entities
 */
async function getBusinessObjects(businessIdea, domainData) {
  console.log(`📦 [Phase 2/5] Designing structural Business Objects for \${domainData.domain}...`);
  const prompt = `You are a database and enterprise systems analyst. 
Given the business idea: "${businessIdea}" operating in the "domainData.domain (${domainData.niche})" sector.
1. List the 15-30 most critical  Business Objects  required to execute this model.
2. APPLICATION FLOW & TRANSACTION DETAILS MANDATE: To identify the true essential objects, you must trace the step-by-step operational lifecycle and user transaction journey of the application. Extract only the active entities that process, record, or fulfill these workflows. For every primary master transaction or collection entity identified, you MUST mechanically extract and include its corresponding multi-item detail records as separate, individual strings (e.g., if a transaction entity holds multiple entry lines, list both the master transaction name and its specific constituent item or line entity name independently in the array).
3. STRICT BUSINESS REALITY FILTER: You must ONLY include active objects that represent real-world commercial transactions or core operational assets. 
   - ABSOLUTELY FORBID and EXCLUDE technical infrastructure boilerplate (such as storage, loggers, media assets, automation steps, or template systems).
   - ABSOLUTELY FORBID and EXCLUDE non-operational static lookup choices, properties, design details, system utilities, configurations, or data-type descriptors (such as abstract pricing units, feature traits, or value metrics). Every object must represent a standalone commercial operational step or tangible asset entity.
4. ABSOLUTE DEDUPLICATION (OPERATIONAL ORDER): Every element inside the BusinessObjects array must be 100% unique. To guarantee zero duplicates or repeated entries, you MUST sort the entire array in strict chronological operational order, following the natural step-by-step application transaction flow from start to finish. Do not repeat any business object.
5. NO FILLER TEXT: Do not include introductory phrases, markdown formatting blocks, explanations, notes, or conversational signature text.

For each object, detail its Input data, primary business activity, and output state.

Format your output exactly as a clean markdown list:
### [Object Name]
- **Input:** data received
- **Activity:** system validation or process executed
- **Output:** downstream state produced`;

  return await callLlamaCli(prompt, 'objects');
}

/**
 * Step 3: Define Lifecycle Stages and Transition Rules
 */
async function getStagesAndRules(domainData, businessObjectsText) {
  console.log("⚙️ [Phase 3/5] Compiling state transition matrices and validations...");
  const prompt = `You are a state-machine engine designer. 
For a business running in the "\${domainData.domain}" space utilizing these structural entities:
\${businessObjectsText}

Define the 4 baseline linear stages a transaction passes through (e.g., Initiated -> Verified -> Dispatched -> Settled) along with the hard gating validation rules required to clear transitions.

Format exactly like this:
### Execution Stages
1. Stage 1 -> 2. Stage 2 -> 3. Stage 3 -> 4. Stage 4
### Transition Validation Gates
- **Rule 1:** Condition required to exit stage 1.
- **Rule 2:** Condition required to exit stage 2.`;

  return await callLlamaCli(prompt, 'stages_rules');
}

/**
 * Step 4: Map Actor Roles & Governance
 */
async function getActorsAndRoles(domainData) {
  console.log("👥 [Phase 4/5] Constructing Identity & Access Management matrix...");
  const prompt = `You are an IAM and Governance Security Architect. 
For a system operating in the "\${domainData.domain}" vertical, map out the 3 primary operational actors (Human roles or System automation agents). Provide their explicit system responsibilities and module authorization clearings.

Format exactly like this:
### Operational Actors
- **Actor Role:** System responsibilities and CRUD authorization level.`;

  return await callLlamaCli(prompt, 'actors');
}

/**
 * Step 5: Render Clean Mermaid Diagram Flow
 */
async function generateFlowchart(domainData, stagesText) {
  console.log("📊 [Phase 5/5] Compiling execution architecture sequence diagrams...");
  const prompt = `You are a strict systems architecture renderer. 
Given these transactional stages:
\${stagesText}

Generate a clean, modern, functional linear Mermaid.js flowchart mapping the operational lifecycle path of the business domain "\${domainData.domain}".
Output ONLY the structural code block beginning with \`\`\`mermaid and ending with \`\`\`. Do not write prefaces.

Example structure:
\`\`\`mermaid
flowchart LR
    A[Stage 1] -->|Trigger Action| B[Stage 2]
\`\`\``;

  return await callLlamaCli(prompt, 'diagram');
}

/**
 * Master Pipeline Coordinator
 */
(async () => {
  // Test input - this can be passed dynamically from your application controller
  const USER_BUSINESS_INPUT = "online groceries app like if i order i get those within 15 minutes or 30 minutes ";

  try {
    console.log("🚀 STARTING AGENTIC KNOWLEDGE BASE COMPILATION LINE...");
    const startTime = Date.now();

    // 1. Get Domain Classification
    const domainData = await getBusinessDomain(USER_BUSINESS_INPUT);
    
    // 2. Pass Domain to get Objects
   const objectsText = await getBusinessObjects(USER_BUSINESS_INPUT, domainData);
    
    // 3. Pass Objects to get Stages & Rules
   // const stagesText = await getStagesAndRules(domainData, objectsText);
    
    // 4. Get System Actors Matrix
    //const actorsText = await getActorsAndRoles(domainData);
    
    // 5. Build Flow Diagram based on steps
    //const diagramCode = await generateFlowchart(domainData, stagesText);

    // 6. Aggregate Outputs into the Final High-Accuracy Blueprint
    const finalReportMarkdown = `# Business Architecture Blueprint: ${domainData.domain}
**Niche Core:** ${domainData.niche}
**Concept Idea:** ${USER_BUSINESS_INPUT}

---

## 1. Domain Entities & Business Objects
${objectsText}

---

## 2. Operational Lifecycle & Validation Rules
{stagesText}

---

## 3. Governance, Actors & Authorization
{actorsText}

---

## 4. Architectural System Flowchart
{diagramCode}
`;

     fs.mkdirSync(OUTPUT_DIR, { recursive: true });
     const finalOutputPath = path.join(OUTPUT_DIR, 'business-architecture-final.md');
     fs.writeFileSync(finalOutputPath, finalReportMarkdown, 'utf8');

     const duration = ((Date.now() - startTime) / 1000).toFixed(2);
     console.log(`\n🎉 KNOWLEDGE BASE ASSEMBLED IN ${duration}s!`);
     console.log(`🔗 High-accuracy architecture file saved to: ${finalOutputPath}`);

  } catch (error) {
    console.error(`\n❌ AGENTIC PIPELINE CRASHED: ${error.message}`);
    process.exit(1);
  }
})();
