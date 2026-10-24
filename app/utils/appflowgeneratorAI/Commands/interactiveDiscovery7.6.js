/**
 * ============================================================================
 * SECTION 1: CORE DEPENDENCIES, IMPORTS & SYSTEM CONFIGURATION
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

let CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '7.6 Business Objects'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
    
    NGL: '0',
    MAX_TOKENS: '12288',         
    BATCH_SIZE: '12288', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "1-Final-Objects-",
    STAGE_2_ACTORS: "2.Final-Actors-",
    STAGE_3_JOURNEYS: "3.Final-End-to-End-Actor-Journeys-",
   // STAGE_4_TOPOLOGY: "6.swimlane_systems_architecture_map_14-10-26_04_09", 
    STAGE_4_TOPOLOGY:"8.6.3.Final.mermaid-diagram-20-10-26_11_54.md",
    FILE_EXTENSION: ".txt"
  }
};
/**
 * ============================================================================
 * SECTION 2: INGESTION ENGINE & BUSINESS RAG PROCESSOR
 * ============================================================================
 */

  /**
   * ============================================================================
   * SECTION 3: TWO-PASS PROGRAMMATIC ENTERPRISE SERIALIZER (NATIVE NODE.JS)
   * ============================================================================
   */
  function generateSemanticBlueprintAI(base, finalTargetFilePath, callback) {
    const promptTmpPath1 = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR, `pass1_discovery_${Date.now()}.txt`);
    const promptTmpPath2 = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.TMP_RELATIVE_DIR, `pass2_serialization_${Date.now()}.txt`);

    // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
        // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
        // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
        // 1. Build the full, rich unedited data payload for Pass 1 Ingestion
    let pass1Payload = "{\n";
    


function formatPromptInput(value) {
  if (value === undefined || value === null) {
    return "Not supplied";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}


const pass1Prompt = `

OBJECTIVE

Discover the business operating model and derive its business objects in chronological order, from business establishment through operational execution and conclusion.

The discovery process must be domain-agnostic. Derive the operating model, participants, lifecycle stages, business objects, and their relationships from the supplied ${CONFIG.DOMAIN_CONTEXT.NAME} and ${CONFIG.DOMAIN_CONTEXT.NICHE}. Do not assume a particular industry, transaction type, operating mechanism, or business process.

STEP 1 — UNDERSTAND THE BUSINESS

Determine:

- What the business exists to provide, achieve, solve, or enable.
- Who or what receives the value produced by the business.
- Who participates in establishing, operating, supporting, governing, or benefiting from the business.
- How value is created, exchanged, funded, or monetized, where applicable.
- What distinguishes this particular niche from the broader domain.

Do not assume that every business has an external customer, direct revenue, physical products, or a conventional buying and selling transaction.

STEP 2 — DISCOVER THE OPERATING MODEL

Determine how this particular business becomes operational and produces its intended outcomes.

Ask:

- What must exist or be established before the business can operate?
- What initiates its principal business processes?
- Which participants can initiate or influence those processes?
- What information, resources, relationships, rights, permissions, commitments, or conditions are needed?
- What major business stages occur, and what causes movement between them?
- What decisions, dependencies, and constraints determine what can happen next?
- How does the business produce and confirm its intended outcomes?
- What alternative operating models materially change the required business objects?

Derive the stages and their order from the business itself. Do not force the business into a predefined lifecycle template.

STEP 3 — DERIVE BUSINESS OBJECTS

Identify the business objects needed to establish, enable, execute, control, and conclude the discovered operating model.

For every candidate object, determine:

- What meaningful business concept does it represent?
- Why does the business need it?
- At what point does it first become necessary?
- What event, condition, decision, or dependency causes it to be created or used?
- What must already exist before it can be established?
- How does it participate in subsequent stages?
- What changes during its lifecycle?
- What constitutes its completion, closure, continuation, or other valid end state?
- Is it essential across the supported operating model, conditional on a particular model or circumstance, or not yet confirmed?

Identify business concepts, not merely the activities performed on them. Do not confuse business objects with screens, software modules, database tables, technical components, or implementation choices.

STEP 4 — COVER THE COMPLETE LIFECYCLE

Starting with the earliest business prerequisites, trace the operating model through its actual sequence of events and dependencies.

Consider, where relevant:

- Pre-existing business foundations and operational readiness.
- Initiating events, requests, needs, or commitments.
- Assessment, validation, authorization, and decisions.
- Preparation, coordination, and resource readiness.
- Core business execution and changes in business state.
- Exceptions, disputes, failures, recovery, and cancellation.
- Confirmation of outcomes and conclusion.
- Settlement, continuing obligations, retention, support, or follow-up after conclusion.

These are areas to investigate, not mandatory stages. Include only those supported by the discovered operating model.

STEP 5 — VALIDATE AND SEQUENCE

Before producing the result:

- Ensure the operating model is coherent and the object list supports it.
- Sequence objects by their earliest meaningful participation in the derived lifecycle.
- Preserve dependencies between objects and identify unresolved dependencies.
- Distinguish essential objects from conditional or uncertain ones.
- Check for missing prerequisites, unexplained transitions, incomplete outcomes, and relevant exception paths.
- Avoid duplicate objects and unsupported assumptions.
- Distinguish evidence-backed findings from inference.
- Record material uncertainties and evidence gaps rather than inventing facts.
- Do not claim universal necessity or complete coverage without sufficient justification.


FINAL OUTPUT

First discover and provide the business operating model, including its value proposition, participants, value creation and monetization where applicable, and the lifecycle derived from the supplied domain and niche.

Then provide the chronological business object list, including each object's purpose, necessity, first lifecycle stage, dependencies, lifecycle role, evidence status, and confidence.

Finally, provide alternative operating models or outcomes, assumptions, unresolved dependencies, and evidence gaps where relevant.

OUTPUT JSON STRUCTURE

Return exactly one JSON object with the following structure:

{
 domain:${CONFIG.DOMAIN_CONTEXT.NAME} ,
 niche:${CONFIG.DOMAIN_CONTEXT.NICHE}.
  "business_operating_model": {
    "value_proposition": "string",
    "participants": ["string"],
    "value_creation_monetization": {
      "creation_mechanism": "string",
      "monetization_streams": ["string"]
    },
    "distinctive_niche": "string"
  },
  "derived_lifecycle": [
    {
      "stage": "string",
      "description": "string",
      "trigger": "string"
    }
  ],
  "business_objects": [
    {
      "object_name": "string",
      "purpose": "string",
      "necessity": "Essential | Conditional | Uncertain",
      "first_stage": "string",
      "dependencies": ["string"],
      "lifecycle_role": "string",
      "evidence_status": "string",
      "confidence_score": 0.0
    }
  ],
  "alternative_models_assumptions_gaps": {
    "alternative_operating_models": [
      {
        "model_name": "string",
        "description": "string",
        "impact": "string"
      }
    ],
    "key_assumptions": ["string"],
    "unresolved_dependencies": ["string"],
    "evidence_gaps": ["string"]
  }
}

STRUCTURE RULES

- Keep the exact JSON keys and value types specified above.
- Discover all business content dynamically from the supplied domain and niche.
- Do not assume that any example business object, participant, lifecycle stage, or monetization stream must exist.
- Include only relevant participants and business concepts supported by the discovered operating model.
- Sequence lifecycle stages and business objects chronologically.
- Use empty arrays when no applicable items are identified.
- Represent unknown information honestly; do not invent facts or evidence.
- Set confidence_score to a numeric value between 0 and 1.
- Use Essential, Conditional, or Uncertain according to the evidence and operating-model dependencies.
- Do not add keys outside the specified structure.
- Ensure all braces, brackets, strings, and commas are valid JSON syntax.

OUTPUT FORMAT

Return raw JSON only. The first character must be { and the last character must be }. Do not include Markdown code fences such as \`\`\`json or \`\`\`, introductory text, explanations, or any text outside the JSON object.

`;

    fs.mkdirSync(path.dirname(promptTmpPath1), { recursive: true });
    fs.writeFileSync(promptTmpPath1, pass1Prompt, 'utf8');

    const execArgsPass1 = [
      '-hf', CONFIG.MODEL.IDENTIFIER,
      '-ngl', CONFIG.MODEL.NGL,
      '--single-turn',
      '-c', CONFIG.MODEL.MAX_TOKENS, 
      '-b', CONFIG.MODEL.BATCH_SIZE, 
      '-t', CONFIG.MODEL.THREADS,     
      '--reasoning', CONFIG.MODEL.REASONING_MODE,
      '--log-disable', 
      '-n', CONFIG.MODEL.MAX_TOKENS,
      '-f', promptTmpPath1,
       '-o', finalTargetFilePath 
    ];

    console.log(`\n⚡ Running Pass 1: Pure data-driven state discovery...`);
    
    execFile(CONFIG.MODEL.EXEC_BINARY, execArgsPass1, { maxBuffer: 8024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (fs.existsSync(promptTmpPath1)) fs.unlinkSync(promptTmpPath1);
      if (error) return callback(error, null);

      let discoveredStatesMap = {};
      try {
       
        callback(null, finalTargetFilePath);
      } catch (parseErr) {
        console.warn("⚠️ JSON Extraction raw block mismatch, utilizing programmatic safety fallbacks."+parseErr);
        discoveredStatesMap = {};
      }

      
    });
  }

/**
 * ============================================================================
 * SECTION 4: FILE SYSTEM SCANNING & MAIN PIPELINE RUNTIME LOOP
 * ============================================================================
 */
const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
const objectsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS);
const actorsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS);
const journeysFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS);
const topologyFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY);

if (!objectsFilePath || !actorsFilePath || !journeysFilePath || !topologyFilePath) {
  throw new Error("Could not automatically locate all four required input source files inside your output directory.");
}

console.log(`\n📂 Reading Input 1: ${path.basename(objectsFilePath)}`);
console.log(`\n📂 Reading Input 2: ${path.basename(actorsFilePath)}`);
console.log(`\n📂 Reading Input 3: ${path.basename(journeysFilePath)}`);
console.log(`\n📂 Reading Input 4: ${path.basename(topologyFilePath)}`);

const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');
const topologyGraphContent = fs.readFileSync(topologyFilePath, 'utf8');

// Isolated string chunk safely extracted from matrix file metadata headers to prevent crash
const interimSegments = objectsMatrixContent.split('===');
const targetMetadataStr = interimSegments[1] ;

//const match = targetMetadataStr.match(/domain\s*:\s*(?<domain>.*?)\s*and\s*niche\s*:\s*(?<niche>.*?)\s*\$/m);
const match = targetMetadataStr.match(/domain\s*:\s*(?<domain>.*?)\s*and\s*niche\s*:\s*(?<niche>.*?)\s*$/);

if (match) {
  CONFIG.DOMAIN_CONTEXT = {
    NAME: match.groups.domain.trim(),
    NICHE: match.groups.niche.trim()
  };
} 

const cleanJsonArray1 = JSON.parse(objectsMatrixContent.slice(objectsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray2 = JSON.parse(actorsMatrixContent.slice(actorsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray3 = JSON.parse(  JSON.stringify(journeysMatrixContent.slice(journeysMatrixContent.lastIndexOf('===') + 3).trim()), null, 2) ;


let base ={
  business_obj:cleanJsonArray1,
  actors_resp:cleanJsonArray2,
  actorsjourney:cleanJsonArray3,
  topologyGraphContent:topologyGraphContent,
  //topologyExistingPreciseContent:getmermaidcontent()
}

const now = new Date();
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0'); 
const year = String(now.getFullYear()).slice(-2);          
let hours = now.getHours();
const minutes = String(now.getMinutes()).padStart(2, '0');
const ampm = hours >= 12 ? 'pm' : 'am';
hours = hours % 12;
hours = hours ? hours : 12; 
const formattedHours = String(hours).padStart(2, '0');

const timestamp = `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;
const finalOutputPath = path.join(OUTPUT_DIR.replace("baseline/",""), `${CONFIG.PATHS.EXPORT_PREFIX}.${timestamp}.md`);

generateSemanticBlueprintAI(base, finalOutputPath, (err, targetSavedPath) => {
  if (err) {
    console.error("❌ CRITICAL_INFERENCE_ERROR: GGUF pipeline compilation failed:", err);
    process.exit(1);
  }
  let base = {
    a: targetSavedPath,
}
  //loadclean(base);
  console.log(`\n🎉 SUCCESS: Dynamic Business Lifecycle Specification compiled and saved via local 9B GGUF to: ${targetSavedPath}`);
});

function resolveLatestStageFile(directory, prefixPattern) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  const matchedFiles = files.filter(f => f.startsWith(prefixPattern));
  if (matchedFiles.length === 0) return null;

  matchedFiles.sort((a, b) => fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs);
  return path.join(directory, matchedFiles[0]);
}

// function loadclean(base) {
//         let CONFIG1 = {
//             PATHS: {
//                 PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
//                 OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
//             }
//         }
    
//         function extractAfterLastAssistant(rawContent) {
//             const marker = "Assistant:";
//             const lastIndex = rawContent.lastIndexOf(marker);
//             // If the marker isn't found at all, return an empty string or handle gracefully
//             if (lastIndex === -1) {
//                 return "";
//             }
//             // Slice everything after the marker index + the length of "Assistant:"
//             return rawContent.slice(lastIndex + marker.length).trim();
//         }
//         const extract = (filePath) => {
//             const raw = fs.readFileSync(filePath, 'utf8');
//             return raw.trim();
//         };
//         const objectsData = extract(base.a);
//         let interim = JSON.parse(extractAfterLastAssistant(objectsData))
//         //console.log(interim)
        
        
//         console.log(interim);
//         const now = new Date();
//         // 1. Extract date components (DD-MM-YY)
//         const day = String(now.getDate()).padStart(2, '0');
//         const month = String(now.getMonth() + 1).padStart(2, '0');
//         const year = String(now.getFullYear()).slice(-2);
//         // 2. Extract 12-hour time components (HH:MMam/pm)
//         let hours = now.getHours();
//         const minutes = String(now.getMinutes()).padStart(2, '0');
//         const ampm = hours >= 12 ? 'pm' : 'am';
//         hours = hours % 12;
//         hours = hours ? hours : 12; // Formats 0 to 12
//         const formattedHours = String(hours).padStart(2, '0');
//         // 3. Assemble with dashes and colons intact
//         const timestamp = `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;
//         // Result Example: "13-10-26_07:57pm"
//         const outputFileName = `7.4_Business_Object_chrono_GAPS_${timestamp}.md`;
//         const OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
//         const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
//         // 7. Commit write configuration array output directly onto physical hardware disk
//         fs.writeFileSync(outputFilePath, JSON.stringify(interim, null, 2), 'utf8');
//     }






