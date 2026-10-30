/**
 * ============================================================================
 * SECTION 1: CORE DEPENDENCIES, IMPORTS & SYSTEM CONFIGURATION
 * ============================================================================
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { domain } = require('process');

let CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
    
    NGL: '0',
   CONTEXT_SIZE: '12288',
  MAX_OUTPUT_TOKENS: '4096',
  BATCH_SIZE: '1024',
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "7.6 Business Objects.24-10-26_06:41pm.md",
    //STAGE_2_ACTORS: "7.7.1 .database Fields.md",
    STAGE_2_ACTORS: "7.7.1 Actors_list.29-10-26_05:14pm.md",
    
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

//<<<<<<============
//<<<<<<<<<working below  prompt for one hours=========================================================



const pass1Prompt = `
# Business Context & Actor Responsibility Discovery

## 1. Role

Act as a senior business analyst, domain specialist and business operating model architect with expertise in identifying organisational roles, business responsibilities and operational accountability.

Analyse the supplied domain, niche, business objects and actors to discover the business operating model, with particular emphasis on identifying the responsibilities of every business actor.

## 2. Input

Domain: ${base.domain}

Niche: ${base.niche}

Business Objects: ${JSON.stringify(base.business_obj)}

Actors: ${JSON.stringify(base.actors)}

## 3. Primary Objective

Discover a coherent business operating model with two interconnected dimensions:

1. **Business Context:** Establish what business is being modelled, what it does, how it operates and what business outcomes it delivers.
2. **Actor Responsibilities — Primary Focus:** Identify what every supplied actor is responsible for, why those responsibilities exist, what business functions they support, what they actually do and what business outcomes they deliver.

Business context provides the foundation for actor discovery. Actor responsibility discovery must receive the greatest analytical attention and detail.

## 4. Business Context Discovery

Analyse the domain, niche and business objects to establish:

1. What specific business is represented?
2. What is its primary business purpose?
3. What products or services does it provide?
4. Who are its customers and principal business participants?
5. What business model does it operate?
6. What are its major business functions?
7. What business outcomes does it deliver?

Build a concise business description that establishes the context for identifying actor responsibilities.

## 5. Actor Responsibility Discovery — Highest Priority

Analyse **every supplied actor individually and in relation to the complete business context**.

Do not limit the analysis to the actor's name or literal description. Determine its actual business role using the domain, niche, business functions and supplied business objects.

For each actor, perform the following discovery:

### A. Actor Identification

- What does the actor represent within the business?
- Is it a human role, organisational entity, external organisation, internal system or automated process?
- What is its business purpose?
- Why is its participation necessary for the business to operate?

### B. Responsibility Identification

Identify the actor's distinct business responsibilities.

Ask:

- What business functions is this actor responsible for?
- What business responsibilities does it own or perform?
- What business activities does it initiate or execute as part of those responsibilities?
- What operational, administrative, commercial or service responsibilities does it perform?
- What information, resources or business objects does it manage as part of its responsibilities?
- What business decisions or operational judgements does it make?
- What business results is it expected to produce?
- What ongoing responsibilities does it have throughout the business operation?

Discover responsibilities that are genuinely relevant to the actor. Do not restrict the actor to a single responsibility simply because its input description is brief.

### C. Responsibility Boundaries

For each responsibility, establish:

- What is the actor directly responsible for?
- Does it own the responsibility, execute it, coordinate it, maintain it, monitor it or support another actor?
- Which other actors contribute to the same business function?
- Where does its responsibility begin and end?
- What responsibilities belong to other actors instead?
- Are multiple actors performing different parts of the same responsibility?

Clearly distinguish business ownership, execution and supporting participation.

### D. Business Purpose and Outcomes

For every identified responsibility:

- Why does the responsibility exist?
- Which business function does it support?
- What business outcome does it produce or contribute to?
- How does it contribute to the overall business purpose?
- What would be affected if this responsibility were not performed?

Each responsibility must have a meaningful business justification and outcome.

### E. Actor Coverage and Completeness

After analysing all actors:

- Ensure every supplied actor has been evaluated.
- Identify the meaningful responsibilities associated with each actor.
- Ensure major business functions are represented through the responsibilities of relevant actors.
- Identify responsibility overlaps and distinguish the contributions of each actor.
- Avoid leaving an actor with generic or superficial responsibilities when its business role implies more specific duties.
- Do not invent additional actors to fill responsibility gaps.
- Do not force responsibilities onto an actor when they do not logically belong to it.

## 6. Reasoning Requirements

- Use domain and niche knowledge to understand how the business actually operates.
- Use supplied business objects as evidence of the business's operational scope and as clues for identifying actor responsibilities.
- Consider the complete input collectively rather than analysing each actor in isolation.
- Derive responsibilities from business purpose, business functions, actor identity and operational context.
- Preserve every supplied actor name exactly.
- Distinguish organisations from the human roles and systems operating within them.
- Distinguish responsibility ownership from task execution and support.
- Avoid generic responsibilities that could apply to any organisation.
- Avoid duplicating responsibilities across actors without explaining their distinct roles.
- Do not confuse responsibilities with individual process steps, system features, job titles or business outcomes.
- Make reasonable business deductions rather than simply repeating the input.
- Do not invent arbitrary operational arrangements or unsupported business rules.
- Prioritise accurate actor responsibility coverage over unnecessary business-context detail.

## 7. Required JSON Output

Return exactly this structure:

{
  "business_context": {
    "domain": "",
    "niche": "",
    "business_description": "",
    "business_purpose": "",
    "products_and_services": [],
    "customer_and_business_participants": [],
    "business_model": "",
    "business_functions": [],
    "business_outcomes": []
  },
  "actor_responsibilities": [
    {
      "actor": "",
      "actor_type": "",
      "business_purpose": "",
      "responsibilities": [
        {
          "responsibility": "",
          "responsibility_description": "",
          "business_function": "",
          "role_in_responsibility": "",
          "business_purpose": "",
          "business_outcome": ""
        }
      ]
    }
  ]
}

## 8. Output Validation

- Return one valid JSON object only.
- Include exactly two top-level sections: business_context and actor_responsibilities.
- Preserve all supplied actor names.
- Include all specified fields.
- Use arrays for collections.
- Provide distinct, meaningful and sufficiently detailed responsibilities for each actor.
- Ensure every responsibility has a clear business purpose and outcome.
- Ensure actor responsibilities collectively make sense within the discovered business context.
- Avoid generic, duplicate or contradictory responsibilities.
- Do not create additional actors.
- Do not include evidence classifications, confidence labels, unresolved questions or assumptions.
- Do not discover object relationships, information requirements, workflows, process sequences, permissions or authorisation models.
- Do not include commentary or Markdown fences outside the JSON.

## 9. Final Objective

Produce a business operating model that clearly establishes the business context and, most importantly, provides a comprehensive and meaningful discovery of who is responsible for what within that business.

The actor responsibility output must explain each actor's business purpose, distinct responsibilities, contribution to business functions, responsibility boundaries and expected business outcomes.

Actor responsibility coverage, accuracy and business relevance take priority over descriptive detail in the business context.
`;

    fs.mkdirSync(path.dirname(promptTmpPath1), { recursive: true });
    fs.writeFileSync(promptTmpPath1, pass1Prompt, 'utf8');

    // const execArgsPass1 = [
    //   '-hf', CONFIG.MODEL.IDENTIFIER,
    //   '-ngl', CONFIG.MODEL.NGL,
    //   '--single-turn',
    //   '-c', CONFIG.MODEL.MAX_TOKENS, 
    //   '-b', CONFIG.MODEL.BATCH_SIZE, 
    //   '-t', CONFIG.MODEL.THREADS,     
    //   '--reasoning', CONFIG.MODEL.REASONING_MODE,
    //   '--log-disable', 
    //   '-n', CONFIG.MODEL.MAX_TOKENS,
    //   '-f', promptTmpPath1,
    //    '-o', finalTargetFilePath 
    // ];
    const execArgsPass1 = [
  '-hf', CONFIG.MODEL.IDENTIFIER,
  '-ngl', CONFIG.MODEL.NGL,
  '--single-turn',
  '-c', CONFIG.MODEL.CONTEXT_SIZE,
  '-b', CONFIG.MODEL.BATCH_SIZE,
  '-t', CONFIG.MODEL.THREADS,
  '--reasoning', CONFIG.MODEL.REASONING_MODE,
  '--log-disable',
  '-n', CONFIG.MODEL.MAX_OUTPUT_TOKENS,
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

const objectsActorsContent = fs.readFileSync(actorsFilePath, 'utf8');

let cleanJsonArray1=extractDomain_Niche_Main_Content(objectsMatrixContent)



let base ={
  domain:cleanJsonArray1.primarydataset.domain,
  niche:cleanJsonArray1.primarydataset.niche,
  business_obj:cleanJsonArray1.mainContent,
  actor_fields:objectsActorsContent
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



function extractcontent(objectsMatrixContent) {
    const mermaidContent = objectsMatrixContent

    function extractNodesWithoutRegex(text) {
        const lines = text.split('\n');
        const results = [];
        // The specific node suffixes we want to look for
        const targets = ['_alternate_path', '_degraded_alert', '_reject_scenario'];
        for (let line of lines) {
            line = line.trim();
            // Find if the current line contains one of our target node types
            const matchedSuffix = targets.find(suffix => line.includes(suffix));
            // Skip lines that don't match or lines that are path definitions (containing arrows)
            if (!matchedSuffix || line.includes('-->') || line.includes('.-.')) {
                continue;
            }
            // Split by the opening character of the label block
            let openChar = '';
            if (line.includes('["')) openChar = '["';
            else if (line.includes('("')) openChar = '("';
            else if (line.includes('{"')) openChar = '{"';
            if (!openChar) continue;
            const parts = line.split(openChar);
            if (parts.length < 2) continue;
            // Clean up the Node ID
            const nodeId = parts[0].trim();
            // Clean up the text content by removing the closing bracket/parenthesis/quotes
            let content = parts[1].trim();
            content = content.replace(/["'\])}]+\$/, ''); // Simple end-of-string character cleanup
            while (content.endsWith('"') || content.endsWith(']') || content.endsWith(')') || content.endsWith('}')) {
                content = content.slice(0, -1);
            }
            results.push({
                node_id: nodeId,
                existing_content: content
            });
        }
        return results;
    }
    // Execute Extraction
    const extractedNodes = extractNodesWithoutRegex(mermaidContent);
    // Print Output
    console.log(JSON.stringify({
        existing_content: extractedNodes
    }, null, 2));
    return JSON.stringify({
        existing_content: extractedNodes
    }, null, 2)
}



function extractDomain_Niche_Main_Content(objectsData)
{
    
        
        let interim = JSON.parse(objectsData)
       
        let domain=interim.domain
        let niche=interim.niche
        let base1=
        {
            primarydataset:{
            domain:domain,
            niche:niche
            }
        }
        delete interim.domain;
        delete interim.niche;
        base1.mainContent=interim
        //JSON.stringify(base1,null,4)
        
        return base1
}