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
    EXPORT_PREFIX: '7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
    
    NGL: '0',
   CONTEXT_SIZE: '10384',
  MAX_OUTPUT_TOKENS: '5192',
  BATCH_SIZE: '1024',
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "7.6 Business Objects.24-10-26_06:41pm.md",
    //STAGE_2_ACTORS: "7.7.1 .database Fields.md",
    STAGE_2_ACTORS: "7.7.1 Actors_list.29-10-26_05:14pm.md",
    
    STAGE_3_JOURNEYS: "7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.30-10-26_03:13pm.md",
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
# ROLE

Act as a Senior Business Analyst, Business Domain Expert and Enterprise Business Architect.

# INPUT BASELINE

Domain:
${base.domain}

Niche:
${base.niche}

Existing Business Context and Actor Responsibilities:
${JSON.stringify(base.actor_resp)}

Existing Business Objects:**
${JSON.stringify(base.business_obj)}

Existing Actors:**
${JSON.stringify(base.actor_fields)}

# OBJECTIVE

Independently discover all meaningful actor–business object relationships required to explain how the business operates.

The supplied actors, responsibilities and business objects are an initial knowledge baseline, NOT an exhaustive restriction on discovery.

Do not regenerate actor definitions, business object definitions or actor responsibilities. Your only primary output is actor_business_object_relationships.

# ACTOR–BUSINESS OBJECT RELATIONSHIP DISCOVERY

Discover how business participants interact with business objects to perform their responsibilities and operate the business.

Investigate:

- Which business objects does each actor create, receive, access, use, modify, maintain, validate, process or review?
- Why does the actor interact with each object?
- What business responsibility does the interaction support?
- Which objects are exchanged or shared between actors?
- Which objects are created or transformed through interactions?
- Which business objects are required but missing from the supplied baseline?
- Are there objects that exist independently of the currently identified actors?
- Are additional internal or external actors necessary to explain the business interactions?

For every relationship, identify the actor, business object, interaction, purpose and associated responsibility.

Do not restrict object discovery to the supplied business object list. Discover additional objects when justified by the business model and its operations.

Distinguish actual business objects from system features, technical components and generic data fields.

# DISCOVERY RULES

1. Analyse every supplied actor and its responsibilities to identify relevant business object interactions.
2. Consider the complete business operation, including internal participants, customers, external organisations, service providers and automated business capabilities where applicable.
3. Identify objects that actors create, consume, exchange, maintain or transform.
4. Discover relationships between actors and objects even when those relationships are not explicitly stated in the supplied data.
5. Identify missing business objects when necessary to explain a legitimate business interaction.
6. Identify additional actors only when a required business interaction cannot be explained by the existing actors.
7. Do not assume every actor interacts with every object.
8. Do not create artificial relationships simply to increase coverage.
9. Do not confuse an actor's responsibility with the actual interaction.
10. Do not invent unsupported commercial arrangements, regulatory obligations or operating practices.
11. Use consistent actor and business object names.
12. Preserve existing terminology wherever it accurately represents the business concept.
13. Keep every relationship meaningful, specific and supported by business reasoning.

# INTERNAL VALIDATION

Before producing the result, verify:

- Every relationship represents an actual or necessary business interaction.
- Every interaction has a clear business purpose.
- Every relationship supports a relevant business responsibility.
- Relevant object exchanges between participants are identified.
- Important missing interactions and business objects have been considered.
- No duplicate or artificial relationships exist.

# OUTPUT REQUIREMENTS

Return valid JSON only.

Generate ONLY the following top-level property:

{
  "actor_business_object_relationships": [
    {
      "actor": "",
      "business_object": "",
      "interaction_type": "",
      "interaction_description": "",
      "business_purpose": "",
      "related_responsibility": "",
      "related_activities": []
    }
  ]
}

# OUTPUT RULES

- Do not return actors, business objects or responsibilities as separate arrays.
- Use the supplied actor and business object names directly.
- If an additional actor or business object is discovered, use its meaningful business name in the relationship.
- interaction_type must describe the actual interaction, such as Creates, Receives, Accesses, Modifies, Maintains, Validates, Processes, Reviews or Exchanges.
- interaction_description must explain what the actor does with the object.
- business_purpos must explain why the interaction is necessary.
- related_responsibility must identify the responsibility supported by the interaction.
- Keep related_activities empty ([]) because business activities are discovered in a separate stage.
- Avoid repeating the same relationship under different descriptions.
- Keep descriptions concise but sufficiently detailed to preserve business meaning.
- Return all discovered relationships. Do not intentionally limit the number of relationships.
- Do not return Markdown, explanations, comments or additional top-level properties.
- Return complete, syntactically valid JSON. Never intentionally stop at a partial result.

# FINAL OBJECTIVE

Discover a comprehensive and logically consistent set of actor–business object relationships explaining WHO interacts with WHAT, HOW the interaction occurs, WHY it occurs and WHICH BUSINESS RESPONSIBILITY it supports.

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
const BusinessActivitiesFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS);
const topologyFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY);

if (!objectsFilePath || !actorsFilePath || !BusinessActivitiesFilePath || !topologyFilePath) {
  throw new Error("Could not automatically locate all four required input source files inside your output directory.");
}

console.log(`\n📂 Reading Input 1: ${path.basename(objectsFilePath)}`);
console.log(`\n📂 Reading Input 2: ${path.basename(actorsFilePath)}`);
console.log(`\n📂 Reading Input 3: ${path.basename(BusinessActivitiesFilePath)}`);
console.log(`\n📂 Reading Input 4: ${path.basename(topologyFilePath)}`);

const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');

const objectsActorsContent = fs.readFileSync(actorsFilePath, 'utf8');

const objectsActorsRespContent = fs.readFileSync(BusinessActivitiesFilePath, 'utf8');

let cleanJsonArray1=extractDomain_Niche_Main_Content(objectsMatrixContent)



let base ={
  domain:cleanJsonArray1.primarydataset.domain,
  niche:cleanJsonArray1.primarydataset.niche,
  business_obj:cleanJsonArray1.mainContent,
  actor_fields:objectsActorsContent,
  actor_resp:objectsActorsRespContent
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