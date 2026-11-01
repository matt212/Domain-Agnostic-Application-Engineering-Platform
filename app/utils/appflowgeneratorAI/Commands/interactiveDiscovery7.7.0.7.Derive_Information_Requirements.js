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
    EXPORT_PREFIX: '7.7.0.7.Derive_Derive_Information_Requirements'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    IDENTIFIER: 'unsloth/Qwen3.5-4B-GGUF',
   // IDENTIFIER: 'unsloth/Qwen3.5-9B-MTP-GGUF',
    
    NGL: '0',
   CONTEXT_SIZE: '16384',
  MAX_OUTPUT_TOKENS: '8192',
  BATCH_SIZE: '512',
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
    STAGE_5_TOPOLOGY:"7.7.0.6.Derive_ACTOR_BUSINESS_Activities.31-10-26_06:46pm.md",
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
# INFORMATION REQUIREMENTS DISCOVERY

Act as a senior business analyst, business domain specialist, enterprise business architect and information architect.

Your task is to discover the **Information Requirements** of the supplied business by independently reasoning about what information the business needs to perform its responsibilities, execute its activities, support decisions, coordinate operations and achieve its business outcomes.

You are discovering a distinct business-model dimension. The supplied business dimensions establish the business context for this discovery; they are not outputs to be regenerated.

# 1. INPUT — EXISTING BUSINESS MODEL

**Business Context, Actors and Responsibilities:**
${JSON.stringify(base.actor_responsibilities)}

**Business Objects:**
${JSON.stringify(base.business_objects)}

**Actor–Business Object Relationships:**
${JSON.stringify(base.actor_business_object_relationships)}

**Business Activities:**
${JSON.stringify(base.business_activities)}

Use all five dimensions as the foundation for understanding the business and discovering its information requirements.

Do not reproduce, redefine or regenerate these existing dimensions.

# 2. DISCOVERY OBJECTIVE

Determine what information the business needs to operate effectively and achieve its intended business outcomes.

Reason independently about the information required across the business, using the supplied business context, actors, responsibilities, business objects, relationships and activities.

Discover information that must be available, obtained, generated, communicated, consumed, evaluated, maintained or updated to support business operations.

The supplied model is the starting point for discovery, not an exhaustive specification of information needs.

Do not simply extract business-object names, reproduce object attributes or convert activity inputs and outputs into information requirements.

# 3. INTELLIGENT DISCOVERY QUESTIONS

Examine the supplied business model and reason through the following questions. These questions guide discovery; they are not separate output sections or mandatory information categories.

## A. Information Needed to Fulfil Business Responsibilities

- What information does the business need to fulfil the responsibilities already identified?
- What must each relevant actor know to perform their responsibilities effectively?
- What information must actors obtain before taking action?
- What information do they need to understand the current business situation?
- What information must they receive from other actors, business objects, external parties or systems?
- What information must they communicate, create, maintain or update?
- What information enables actors to monitor and evaluate the fulfilment of their responsibilities?
- Are there essential information needs implied by a responsibility but not explicitly represented in the existing model?

## B. Information Needed to Execute Business Activities

- What information is required to initiate each business activity?
- What information is necessary to execute its operations?
- What information must be available at different stages of execution?
- What information must be verified, evaluated or updated?
- What information is required to determine the appropriate next action?
- What information is generated as an activity progresses?
- What information is required to establish whether an activity has achieved its intended outcome?
- What information must be available to subsequent activities?
- Are the existing activity inputs and outputs sufficient to explain the information needed for actual execution?

## C. Information Exchanged Between Actors

- What information must actors obtain from one another to perform their responsibilities?
- What information must be communicated when work is transferred between actors?
- What information is required to coordinate activities involving multiple actors?
- What information must one actor provide before another actor can proceed?
- What information is required to confirm, acknowledge or complete an interaction?
- What information must remain consistent when different actors work with the same business matter?
- Are there information exchanges implied by existing actor–business-object relationships that have not been explicitly identified?

## D. Information Required for Business Decisions

- What decisions must actors or automated business operations make?
- What information is necessary to make each decision?
- What facts, conditions or circumstances must be evaluated?
- What information determines whether an operation can proceed?
- What information is needed to evaluate alternatives or select an appropriate course of action?
- What information supports approval, rejection, prioritisation, allocation or escalation where relevant?
- What information is required when a decision cannot be made because information is missing, outdated or inconsistent?

Identify actual business decisions from the supplied context. Do not invent decisions or impose predefined decision categories.

## E. Information Represented by and Beyond Existing Business Objects

- What information needs are already represented by the supplied business objects?
- What additional information does the business need beyond what those objects currently represent?
- What information is obtained from external parties, services or systems?
- What information is derived by evaluating or combining existing information?
- What information is generated through business activities?
- What information is temporarily required to perform an operation or make a decision?
- What information must be maintained or communicated even when it does not correspond to a distinct business object?
- Are there important information needs that cannot be adequately explained by the existing business objects?

An information requirement describes the information the business needs. A business object represents a business entity that may contain or relate to that information. Do not confuse these concepts or automatically create a new business object for every information requirement.

## F. Information Dependencies Across Business Activities

- What information produced by one activity is required by another?
- What information must be available throughout related business activities?
- What information must be updated when business circumstances change?
- What information must be retained to support subsequent operations?
- What information is shared by multiple actors or activities?
- What information must be reconciled when different activities consume or update it?
- What information is necessary to maintain continuity across the business operations?

Identify information needs that connect activities and responsibilities rather than treating each activity as an isolated operation.

## G. Information Needed for Exceptions and Alternative Situations

- What information is needed when normal business operations cannot proceed?
- What information is required to identify and understand an exception?
- What information helps actors evaluate alternative actions?
- What information is needed to resolve discrepancies or conflicting information?
- What information must be communicated when an issue requires another actor's intervention?
- What information is necessary to resume, correct, reverse or complete an interrupted operation?
- What information is required to understand and evaluate the outcome of an exception?

Discover these requirements only where they are relevant to the supplied business.

## H. Information Needed to Achieve and Evaluate Business Outcomes

- What information is required to determine whether the business has achieved its intended outcomes?
- What information is needed to establish whether responsibilities and activities have been completed?
- What information supports operational monitoring and business evaluation?
- What information enables actors to identify delays, incomplete work or unsuccessful outcomes?
- What information is needed for reconciliation, review or accountability?
- What information must remain available to support subsequent business operations?

## I. Identify Uncovered Information Needs

Challenge the initial business understanding specifically from an information perspective.

- Are there responsibilities that cannot be fulfilled without information not yet identified?
- Are there activities whose execution requires information missing from the existing model?
- Are there business decisions without clearly identified information requirements?
- Are there actor interactions that depend on information not represented by existing relationships?
- Are there information dependencies that have not been captured?
- Are there business outcomes that cannot be evaluated using the identified information?
- What additional information does the business logically require that is not adequately represented by the existing model?

Identify additional information requirements when there is a meaningful business rationale.

Do not invent requirements merely to increase catalogue size.

# 4. SYNTHESIZE DISTINCT INFORMATION REQUIREMENTS

After reasoning through the discovery questions, consolidate the findings into a single collection of distinct business information requirements.

For each requirement, establish:

- What information is needed.
- What business purpose it fulfils.
- Which actors require it.
- Which responsibilities depend on it.
- Which activities use, generate or depend on it.
- Which existing business objects represent or contain it, where applicable.
- How it is used.
- Where it originates, where identifiable.
- Which decisions it supports.
- What substantive information details it must contain.

Apply these principles:

1. Group related information into one coherent requirement when it serves the same business purpose.
2. Create separate requirements when business purposes, usage or decision needs are materially different.
3. Do not create a separate requirement for every individual information detail.
4. Do not duplicate the same requirement merely because multiple actors or activities use it.
5. Preserve all relevant actor, responsibility, activity and business-object relationships.
6. Do not force every information requirement to relate to an existing business object.
7. Do not turn information requirements into database schemas, technical fields, APIs or application features.
8. Discover the requirements from the business context rather than relying on predefined information categories.

# 5. OUTPUT SCOPE

The sole output of this discovery stage is:

**Information Requirements**

Do not output or regenerate:

- Business context.
- Actors or actor responsibilities.
- Business objects.
- Actor–business object relationships.
- Business activities.
- Business process flows.
- Application capabilities or technical specifications.
- Separate analysis, observations, recommendations or explanations.

The supplied dimensions are inputs to information discovery, not additional output dimensions.

# 6. INFORMATION REQUIREMENT DEFINITION

An information requirement must describe a meaningful business information need, not an individual database column, technical field, API parameter, screen input or generic data attribute.

Use the following properties:

| Property | Meaning |
|---|---|
| information_requirement | Concise name of the information need |
| description | What the information represents |
| business_purpose | Why the business needs it |
| required_by_actors | Actors requiring or consuming it |
| related_responsibilities | Responsibilities supported |
| related_activities | Activities using, generating or depending on it |
| related_business_objects | Existing business objects representing or containing it |
| information_usage | How the information is used |
| information_source | Where the information originates |
| business_decisions_supported | Decisions depending on it |
| required_information_details | Essential substantive information items |

# 7. OUTPUT SCHEMA

Return only valid JSON using this exact structure:

{
  "information_requirements": [
    {
      "information_requirement": "",
      "description": "",
      "business_purpose": "",
      "required_by_actors": [],
      "related_responsibilities": [],
      "related_activities": [],
      "related_business_objects": [],
      "information_usage": "",
      "information_source": "",
      "business_decisions_supported": [],
      "required_information_details": []
    }
  ]
}

# 8. OUTPUT RULES — CONCISE JSON

1. Return only the JSON object. Do not include Markdown, explanations, commentary or additional top-level properties.
2. Discover all materially distinct information requirements. Do not impose an arbitrary limit on their number.
3. Keep every property concise, specific and business-oriented.
4. Use one short sentence for description, business_purpose and information_usage.
5. Use short names or phrases in array properties.
6. Keep required_information_details to essential information items, not lengthy explanations.
7. Avoid repeating the same information across different properties.
8. Do not include internal reasoning, background explanations, examples or narrative commentary.
9. Populate every schema property.
10. Use empty arrays when no relevant relationship can be established.
11. Use an empty string only when a scalar value genuinely cannot be determined.
12. Use the exact names of supplied actors, responsibilities, activities and business objects when establishing relationships.
13. Do not fabricate references to existing business-model elements.
14. Where an information need reveals a possible missing business element, describe the information requirement without pretending that the missing element has already been formally established.
15. Ensure all JSON objects, arrays, strings and properties are completely closed.
16. Never return Markdown code fences or unfinished JSON.

# 9. FINAL OBJECTIVE

Discover and produce the business's Information Requirements as a distinct business-model dimension.

The requirements must explain what information the business needs, why it needs it, who needs it, which responsibilities and activities depend on it, how it is used, where it originates and which business decisions it supports.

The quality of discovery must come from intelligent, independent business reasoning about information needs, using the five supplied business dimensions as context.

Return only the final Information Requirements JSON object.
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
const topologyFilePath1 = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_5_TOPOLOGY);

if (!objectsFilePath || !actorsFilePath || !BusinessActivitiesFilePath || !topologyFilePath || !topologyFilePath1) {
  throw new Error("Could not automatically locate all five required input source files inside your output directory.");
}

console.log(`\n📂 Reading Input 1: ${path.basename(objectsFilePath)}`);
console.log(`\n📂 Reading Input 2: ${path.basename(actorsFilePath)}`);
console.log(`\n📂 Reading Input 3: ${path.basename(BusinessActivitiesFilePath)}`);
console.log(`\n📂 Reading Input 4: ${path.basename(topologyFilePath)}`);
console.log(`\n📂 Reading Input 5: ${path.basename(topologyFilePath1)}`);
const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');

const objectsActorsContent = fs.readFileSync(actorsFilePath, 'utf8');

const objectsActorsRespContent = fs.readFileSync(BusinessActivitiesFilePath, 'utf8');

const objectsActorsRelationShip = fs.readFileSync(topologyFilePath, 'utf8');

const objectsbusiness_activities = fs.readFileSync(topologyFilePath1, 'utf8');

let cleanJsonArray1=extractDomain_Niche_Main_Content(objectsMatrixContent)


/***Business Context:**
${JSON.stringify(base.business_context)}

**Actors and Responsibilities:**
${JSON.stringify(base.actor_responsibilities)}

**Business Objects:**
${JSON.stringify(base.business_objects)}

**Actor–Business Object Relationships:**
${JSON.stringify(base.actor_business_object_relationships)}

**Business Activities:**
${JSON.stringify(base.business_activities)}*/


let base ={
  domain:cleanJsonArray1.primarydataset.domain,
  niche:cleanJsonArray1.primarydataset.niche,
  business_objects:cleanJsonArray1.mainContent,
  actor_fields:objectsActorsContent,
  actor_responsibilities:objectsActorsRespContent,
  actor_business_object_relationships:objectsActorsRelationShip,
  business_activities:objectsbusiness_activities
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