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
    EXPORT_PREFIX: '7.7.0.6.Derive_ACTOR_BUSINESS_Activities'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
    
    NGL: '0',
   CONTEXT_SIZE: '16384',
  MAX_OUTPUT_TOKENS: '6192',
  BATCH_SIZE: '2024',
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "7.6 Business Objects.24-10-26_06:41pm.md",
    //STAGE_2_ACTORS: "7.7.1 .database Fields.md",
    STAGE_2_ACTORS: "7.7.1 Actors_list.29-10-26_05:14pm.md",
    
    STAGE_3_JOURNEYS: "7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.30-10-26_03:13pm.md",
   // STAGE_4_TOPOLOGY: "6.swimlane_systems_architecture_map_14-10-26_04_09", 
    STAGE_4_TOPOLOGY:"7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP.31-10-26_09:23am.md",
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


/*
domain:cleanJsonArray1.primarydataset.domain,
  niche:cleanJsonArray1.primarydataset.niche,
  business_obj:cleanJsonArray1.mainContent,
  actor_fields:objectsActorsContent,
  actor_resp:objectsActorsRespContent,
  actors_relationShip:objectsActorsRelationShip
*/


const pass1Prompt = `
Act as a Senior Business Analyst, Business Domain Expert and Enterprise Business Architect.

OBJECTIVE

Discover the business activities required to fulfil the responsibilities and achieve the business outcomes of the supplied domain and niche.

Analyse the supplied business context, actor responsibilities, business objects, actors and actor–business-object relationships to independently identify the meaningful business activities performed across the business.

The objective is to discover what work the business actually performs, who performs it, which business objects are involved, what triggers the work and what outcomes it produces.

Do not simply convert every responsibility or actor–business-object relationship into an activity. Identify the actual business work represented by the combined business context.

DISCOVERY APPROACH

For each responsibility and its associated actor–business-object relationships, reason about:

- What business work must be performed to fulfil the responsibility?
- Which actor is accountable for or performs that work?
- Are other actors involved in supporting, coordinating, reviewing or completing it?
- Which business objects are required to perform the activity?
- Which business objects are created, updated, consumed or otherwise affected?
- What business event, condition, request or preceding activity causes the work to begin?
- What business outcome does completing the activity achieve?
- Are there additional activities necessary to fulfil the business context that are not explicitly represented in the supplied responsibilities or relationships?

Independently reason about the business domain and niche. The supplied information is a starting point, not an exhaustive inventory of activities.

ACTIVITY DISCOVERY RULES

1. Discover activities based on actual business work, not merely the names of supplied responsibilities, actors or business objects.
2. Treat an activity as a meaningful unit of business work that an actor or business capability performs to achieve a business outcome.
3. Preserve the supplied actor, responsibility and business-object terminology wherever applicable.
4. Do not assume that every actor performs activities involving every business object.
5. Distinguish between an activity and a responsibility. A responsibility describes an area of accountability; activities describe the work performed to fulfil it.
6. Distinguish between business activities and system features, technical operations, software functions, APIs, database operations or infrastructure tasks.
7. Do not combine distinct business activities merely because they involve the same actor or business object.
8. Do not split a coherent business activity into unnecessarily small technical or procedural steps.
9. Identify activities performed by automated business capabilities or external participants when justified by the business context. Do not assume that every activity must be performed by a human actor.
10. Where an activity involves multiple actors, distinguish the primary responsible actor from supporting actors.
11. Identify relevant inputs and outputs using the supplied business objects. Introduce additional business objects only when the business activity genuinely requires them.
12. Do not invent responsibilities, actors, business practices or activities merely to make the output appear comprehensive.
13. Do not impose a predefined activity taxonomy, business lifecycle, workflow sequence or set of activity categories. Discover the activities from the actual business model.
14. Do not assume that activities must form one linear sequence. Activities may be independent, conditional, recurring or triggered by different business events.
15. Avoid duplicate activities expressed using different names. Keep activities separate only when their business purpose or outcome is meaningfully different.

ACTIVITY QUALITY VALIDATION

Before producing the output, internally verify that:

- Each activity represents identifiable business work.
- Each activity contributes to a business responsibility or business outcome.
- The primary actor is appropriate for the activity.
- Supporting actors are included only when their involvement is justified.
- Related business objects accurately reflect the activity's inputs and outputs.
- Triggers and outcomes are meaningful and business-oriented.
- Activities are neither overly broad nor unnecessarily granular.
- Important activities have not been overlooked because they were absent from the supplied relationships.
- Duplicate, speculative and technically framed activities have been excluded.

INPUT BUSINESS CONTEXT

Domain:
${base.domain}

Niche:
${base.niche}

Existing Business Context and Actor Responsibilities:
${JSON.stringify(base.actor_resp)}

Existing Business Objects:
${JSON.stringify(base.business_obj)}

Existing Actors:
${JSON.stringify(base.actor_fields)}

Actor–Business Object Relationships (Pass 1):
${JSON.stringify(base.actors_relationShip)}

OUTPUT REQUIREMENTS

Return only valid JSON using the following structure:

{
  "business_activities": [
    {
      "activity_name": "",
      "activity_description": "",
      "primary_actor": "",
      "supporting_actors": [],
      "related_responsibility": "",
      "input_business_objects": [],
      "output_business_objects": [],
      "trigger_or_precondition": "",
      "business_outcome": ""
    }
  ]
}

OUTPUT RULES

- Return only the top-level property business_activities.
- Do not regenerate business context, actors, responsibilities, business objects or actor–business-object relationships.
- Use the supplied actor and business-object names wherever applicable.
- supporting_actors, input_business_objects and output_business_objects must always be arrays, including when empty.
- related_responsibility must reference the applicable supplied responsibility wherever possible.
- Do not invent a sequence or execution order between activities.
- Do not include explanations, recommendations, assumptions sections or Markdown.
- Ensure the response is valid, complete JSON.
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

const objectsActorsRelationShip = fs.readFileSync(topologyFilePath, 'utf8');

let cleanJsonArray1=extractDomain_Niche_Main_Content(objectsMatrixContent)



let base ={
  domain:cleanJsonArray1.primarydataset.domain,
  niche:cleanJsonArray1.primarydataset.niche,
  business_obj:cleanJsonArray1.mainContent,
  actor_fields:objectsActorsContent,
  actor_resp:objectsActorsRespContent,
  actors_relationShip:objectsActorsRelationShip
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