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
    
   CONTEXT_SIZE: '22288',
  MAX_OUTPUT_TOKENS: '24096',
  BATCH_SIZE: '12048',

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
# Business Discovery: Actor Responsibilities, Data Requirements and Activities

## 1. Role and Objective

Act as a senior business analyst, domain specialist, and business-process architect.

Analyze the supplied domain, niche, business objects, and actors to derive four outputs:

1. Actor responsibilities.
2. Actor–business-object relationships.
3. Actor information requirements.
4. Business activities and process participation.

Determine who is responsible for what, which business objects they work with, what information they require, and which activities they perform.

Use a domain-agnostic methodology. Derive business-specific results from the supplied context. Do not invent actors, business objects, business rules, or unsupported workflows.

## 2. Input Context

Domain: ${base.domain}

Niche: ${base.niche}

Business Objects: ${JSON.stringify(base.business_obj)}

Actors: ${JSON.stringify(base.actor_fields)}

Treat the supplied information as the primary source of truth. Preserve supplied actor identities and business-object definitions. Derive additional details only when reasonably supported by the context.

Distinguish explicitly supplied information from derived or inferred information.

## 3. Actor Responsibilities

For every supplied actor, identify its business purpose, responsibilities, and contribution to business outcomes.

Determine, where supported:

- Primary responsibilities and supporting activities.
- Business outcomes the actor owns, influences, or contributes to.
- Activities the actor initiates, performs, monitors, reviews, or supports.
- Relevant business objects.
- Collaboration with other supplied actors.
- Decisions the actor makes as part of its responsibilities.
- Boundaries between the actor's responsibilities and those of other actors.

Distinguish responsibility, accountability, participation, and ownership.

Do not infer decision authority merely from an actor's name or job title. Do not assign responsibilities that have no reasonable basis in the supplied context.

## 4. Actor–Business Object Relationships

Identify meaningful relationships between supplied actors and supplied business objects.

Determine whether an actor, where supported by the context:

- Owns or is accountable for an object.
- Creates or initiates an object.
- Views, searches, monitors, or reports on an object.
- Updates or maintains object information.
- Reviews, validates, approves, rejects, or processes an object.
- Receives or manages an object through assignment or handover.
- Produces information or evidence associated with an object.

For each relationship, explain its business purpose and identify the relationship as SUPPLIED, DERIVED, or INFERRED.

Include only justified relationships. Do not create every possible actor–object combination, and do not assume that a relationship implies unrestricted access or modification authority.

Use the exact supplied actor and business-object names wherever possible.

## 5. Actor Information Requirements

Identify the information each actor needs to perform their responsibilities.

Consider relevant information such as:

- Actor identity and profile details.
- Organizational affiliation and role assignments.
- Operational responsibilities and assignments.
- Information needed to perform business activities.
- Relevant relationships with business objects.
- Information needed to review decisions or monitor outcomes.
- Activity history and supporting evidence, where justified.

For each information requirement, specify the attribute, its business purpose, and its source or derivation.

Keep actor information requirements separate from business-object attributes. Do not automatically copy business-object fields into an actor record.

Do not invent unnecessary personal information, credentials, or sensitive attributes. Do not assume that information an actor needs to view must be stored directly in the actor's database record.

Use SUPPLIED, DERIVED, INFERRED, or REQUIRES_CONFIRMATION to describe the information requirement's evidence status.

## 6. Business Activities

Identify business activities reasonably supported by the supplied actors, responsibilities, and business objects.

For each activity, determine as much as the evidence supports:

- Activity name and business purpose.
- Trigger or initiating event.
- Initiating actor.
- Participating actors.
- Accountable actor, when established.
- Relevant business objects.
- Required inputs.
- Preconditions and validations.
- Business actions and decisions.
- Outputs and expected outcomes.
- Resulting business-object state changes, where established.
- Dependencies on other activities.
- Alternative outcomes and exceptions.
- Recovery actions, where supported.

Connect activities only when a business dependency or outcome justifies the connection.

Do not create arbitrary sequences from actor names or object lists. Do not invent lifecycle states, transitions, approval rules, cancellation behavior, retries, or recovery procedures.

Use SUPPLIED, DERIVED, INFERRED, or REQUIRES_CONFIRMATION to distinguish the evidence supporting each activity.

## 7. Mandatory JSON Output Structure

Return exactly one valid JSON object using the following four top-level keys and no others:

{
  "actor_responsibilities": [
    {
      "actor": "",
      "purpose": "",
      "responsibilities": [
        {
          "responsibility": "",
          "business_outcome": "",
          "responsibility_type": "PERFORMS",
          "related_business_objects": [],
          "collaborating_actors": [],
          "evidence_status": "INFERRED"
        }
      ]
    }
  ],
  "actor_business_object_relationships": [
    {
      "actor": "",
      "object": "",
      "relationship_type": "OPERATES",
      "business_purpose": "",
      "permitted_interactions": [],
      "evidence_status": "INFERRED"
    }
  ],
  "actor_information_requirements": [
    {
      "actor": "",
      "attributes": [
        {
          "attribute": "",
          "purpose": "",
          "source": "",
          "evidence_status": "REQUIRES_CONFIRMATION"
        }
      ]
    }
  ],
  "business_activities": [
    {
      "activity_id": "ACT001",
      "activity_name": "",
      "business_purpose": "",
      "trigger": "",
      "initiating_actor": "",
      "participating_actors": [],
      "accountable_actor": null,
      "business_objects": [],
      "inputs": [],
      "preconditions": [],
      "actions": [],
      "decisions": [],
      "outputs": [],
      "expected_outcome": "",
      "state_changes": [],
      "dependencies": [],
      "alternative_outcomes": [],
      "exceptions": [],
      "recovery_actions": [],
      "evidence_status": "INFERRED"
    }
  ]
}

## 8. JSON Contract and Output Rules

- Return exactly one JSON object with the four specified top-level keys.
- Do not add any other top-level keys or sections.
- Do not output Markdown fences, explanations, comments, or prose outside the JSON object.
- Use the exact field names and value types shown in the schema.
- Use arrays for collections. Use empty arrays when no supported items exist.
- Use null only for nullable fields, such as accountable_actor when accountability is not established.
- Use empty strings only when a required string field cannot be established; never fabricate a value to fill it.
- Use consistent evidence_status values: SUPPLIED, DERIVED, INFERRED, REQUIRES_CONFIRMATION.
- Use concise, meaningful business descriptions rather than generic filler.
- Preserve supplied actor and business-object names consistently across all four sections.
- Reference only supplied actors unless the input explicitly establishes additional actors.
- Reference supplied business objects accurately. Do not invent objects to complete a workflow.
- Keep activity IDs unique and ensure dependency references point to existing activity IDs.
- Do not duplicate records unnecessarily across arrays.
- Include only meaningful, context-supported records. Do not generate placeholder records simply to populate the schema.
- An empty array is preferable to invented business knowledge.
- Do not treat inferred relationships or activities as confirmed business rules.
- Ensure valid JSON syntax, correct escaping, properly closed arrays and objects, and no trailing commas.
- Prioritize completing a syntactically valid JSON object within the generation limit. Reduce unnecessary detail rather than truncating the output.

## 9. Final Objective

Produce a concise, internally consistent business knowledge model containing only:

1. Actor responsibilities.
2. Actor–business-object relationships.
3. Actor information requirements.
4. Business activities.

These four outputs must provide reliable business context for subsequent application-flow generation without inventing unsupported business behavior.

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