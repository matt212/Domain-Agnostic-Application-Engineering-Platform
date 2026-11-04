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
    EXPORT_PREFIX: '7.2. RAW Gaps Finding-'
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
const knownIssues = [
  "each step alternate hit is always apply cache profile defaults",
  "on multiple hard fail reverse system allocation state",
  "on soft fail state discrepancy trigger auto-remediation loop"
];



// Pre-extract target nodes using your native Node.js script


const pass1Prompt = `
You are an expert, domain-agnostic Business Process and Business Object
Discovery Analyst.

Your task is to infer a plausible end-to-end business lifecycle from
the supplied domain, niche, and business-object definitions.

You must determine:
1. The logical order in which business activities are likely to occur.
2. Dependencies and relationships between business objects.
3. Activities that may occur in parallel or conditionally.
4. Candidate business capabilities or objects missing from the inputs.
5. Uncertainties requiring business confirmation.

Treat the result as an initial business-process hypothesis, not as a
verified description of a particular organisation's actual operations.

==================== INPUT ====================

Domain:
${CONFIG.DOMAIN_CONTEXT.NAME}

Niche:
${CONFIG.DOMAIN_CONTEXT.NICHE}

Supplied Business Objects:
${JSON.stringify(base.business_obj)}

==================== 1. UNDERSTAND THE BUSINESS ====================

Infer the business purpose and likely operating lifecycle from the
supplied domain and niche.

Determine the plausible business outcomes, major lifecycle stages,
core activities, relevant information, and dependencies required to
deliver the business's principal product or service.

Use the supplied object names, inputs, activities, and outputs as
evidence about the intended business process.

Do not assume that the supplied objects describe the complete process.

Do not assume that every business has the same workflow, operating
model, policies, or implementation.

==================== 2. ORDER THE SUPPLIED OBJECTS ====================

Determine a logical, business-oriented sequence for the supplied
objects and their associated activities.

Base ordering on actual dependencies, prerequisites, information
availability, state changes, and business outcomes.

For each object, consider:
- What must already exist before its activity can occur?
- What information or business state does the activity require?
- What does the activity produce or change?
- Which subsequent activities depend on that result?
- Can the activity occur in parallel with another activity?
- Is it conditional, optional, recurring, or part of an exception path?
- Can it occur at multiple lifecycle stages rather than at one fixed point?

Do not force all objects into a single linear sequence when the business
logic supports branches, parallel activities, or repeated activities.

Do not equate the order of the supplied JSON array with the correct
business-process order.

Do not treat every business object as a separate sequential step.
Distinguish the object being managed from the activity performed on it.

Preserve the original object names. Do not silently rename, merge,
or remove supplied objects.

If an object's correct position depends on an unknown policy or
operating model, identify that uncertainty rather than guessing.

==================== 3. IDENTIFY DEPENDENCIES ====================

Determine the relationships required to connect the activities into
a coherent business lifecycle.

Identify relevant:
- Prerequisite relationships.
- Information and data dependencies.
- Business-object creation and update dependencies.
- State-transition dependencies.
- Operational handoffs.
- Decision-dependent relationships.
- Conditional, optional, parallel, recurring, and exception paths.

Explain each important dependency in terms of the business reason
that supports it.

Distinguish a necessary dependency from a common but optional practice.

Do not invent specific actors, authorizations, system capabilities,
business rules, policies, statuses, or external integrations.

If a dependency is plausible but cannot be established from the inputs,
mark it as inferred and explain what needs confirmation.

==================== 4. IDENTIFY CANDIDATE MISSING CAPABILITIES ====================

Infer what additional business capabilities may be needed to complete
the lifecycle for the stated domain and niche.

Compare these inferred needs against the supplied objects.

For each candidate missing capability:

1. Explain the business need it addresses.
2. Identify which supplied objects or activities depend on it.
3. Explain what would be difficult, incomplete, or ambiguous without it.
4. Check whether the capability might already be represented by an
   existing object's attributes, activities, state, relationships,
   events, or an external system.
5. Recommend a new business object only when a distinct business
   identity or lifecycle appears necessary.
6. Otherwise, recommend considering an additional attribute, activity,
   relationship, event, or state within an existing object.
7. Identify the evidence or business decision required to confirm it.

Do not create new objects merely because a concept has not been named
as an object in the supplied list.

Do not assume that every inferred capability must be implemented
as a standalone business object.

Do not report a capability as definitely missing merely because it
is absent from the supplied definitions. The supplied list may be
intentionally incomplete or may abstract several capabilities together.

==================== 5. HANDLE UNCERTAINTY CORRECTLY ====================

Distinguish internally between:

SUPPORTED:
Directly supported by the supplied domain, niche, or object definitions.

INFERRED:
A reasonable business-process interpretation, but not explicitly
established by the supplied evidence.

NEEDS_CONFIRMATION:
The correct sequence, capability, policy, or responsibility depends
on information that has not been supplied.

Use domain reasoning to identify plausible business requirements,
but do not present assumptions as established organisational facts.

Do not invent industry-standard citations, regulations, external
reference data, or company-specific policies.

Do not assume a particular payment model, fulfilment model, customer
eligibility rule, exception policy, or operational responsibility
unless the inputs support it.

When several operating models are plausible, state the relevant
uncertainty and preserve the alternatives where material.

==================== 6. VALIDATE THE PROPOSED LIFECYCLE ====================

Before producing the result, check whether the proposed ordering and
dependencies form a coherent end-to-end business lifecycle.

Check for:
- Activities placed before their required inputs exist.
- Activities with no identifiable business purpose or output.
- Outputs that are not consumed by relevant downstream activities.
- Missing prerequisites or unresolved dependencies.
- Conflicting or circular dependencies.
- Conditional activities incorrectly treated as mandatory.
- Exception activities incorrectly placed in the normal happy path.
- Business capabilities that may be represented by existing objects.
- Unjustified assumptions about policies, actors, or state changes.

Do not invent gaps merely to produce more findings.

Do not claim that the lifecycle is complete if material uncertainties
or missing information prevent that conclusion.

==================== 7. OUTPUT REQUIREMENTS ====================

Return valid JSON only. Do not use Markdown fences or explanatory text
outside the JSON.

Use exactly this structure:

{
  "business_context": {
    "inferred_purpose": "Concise description of the likely business purpose",
    "assumptions_requiring_confirmation": [
      "Material assumption requiring confirmation"
    ]
  },
  "ordered_objects": [
    {
      "sequence": 1,
      "object_name": "Exact supplied object name",
      "activity": "Activity associated with the object",
      "process_stage": "Inferred business lifecycle stage",
      "ordering_rationale": "Why this activity belongs at this point",
      "depends_on": [
        "Exact supplied object name or identified prerequisite"
      ],
      "relationship_type": "PREREQUISITE, CONDITIONAL, PARALLEL, RECURRING, EXCEPTION, or NONE",
      "evidence_status": "SUPPORTED, INFERRED, or NEEDS_CONFIRMATION"
    }
  ],
  "candidate_missing_capabilities": [
    {
      "capability": "Name of candidate capability",
      "recommended_representation": "BUSINESS_OBJECT, ATTRIBUTE, ACTIVITY, RELATIONSHIP, EVENT, STATE, or EXTERNAL_CAPABILITY",
      "business_rationale": "Why this capability may be needed",
      "related_objects": [
        "Exact supplied object name"
      ],
      "evidence_status": "INFERRED or NEEDS_CONFIRMATION",
      "confirmation_needed": "Specific question or evidence needed to validate the candidate"
    }
  ],
  "process_observations": [
    {
      "observation": "Material dependency, ambiguity, or lifecycle concern",
      "related_objects": [
        "Exact supplied object name"
      ],
      "evidence_status": "SUPPORTED, INFERRED, or NEEDS_CONFIRMATION"
    }
  ]
}

OUTPUT RULES:

- Include every supplied business object in ordered_objects exactly once.
- Use the exact supplied object_name values.
- Sequence numbers describe the proposed presentation order, not a
  guarantee that all activities execute serially.
- Use an empty depends_on array when no dependency is established.
- Use an empty array when there are no defensible candidates.
- Never invent a supplied object name.
- For a genuinely missing capability, use a descriptive capability name
  and explicitly identify it as a candidate rather than an existing object.
- Keep evidence status consistent with the strength of the evidence.
- Do not label inferred capabilities as confirmed defects.
- Do not impose a fixed number of missing capabilities.
- Escape JSON strings correctly and do not include trailing commas.

Analyse the supplied domain, niche, and business objects now.
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
  loadclean(base);
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

function loadclean(base) {
        let CONFIG1 = {
            PATHS: {
                PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
                OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
            }
        }
    
        function extractAfterLastAssistant(rawContent) {
            const marker = "Assistant:";
            const lastIndex = rawContent.lastIndexOf(marker);
            // If the marker isn't found at all, return an empty string or handle gracefully
            if (lastIndex === -1) {
                return "";
            }
            // Slice everything after the marker index + the length of "Assistant:"
            return rawContent.slice(lastIndex + marker.length).trim();
        }
        const extract = (filePath) => {
            const raw = fs.readFileSync(filePath, 'utf8');
            return raw.trim();
        };
        const objectsData = extract(base.a);
        let interim = JSON.parse(extractAfterLastAssistant(objectsData))
        //console.log(interim)
        
        
        console.log(interim);
        const now = new Date();
        // 1. Extract date components (DD-MM-YY)
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).slice(-2);
        // 2. Extract 12-hour time components (HH:MMam/pm)
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12; // Formats 0 to 12
        const formattedHours = String(hours).padStart(2, '0');
        // 3. Assemble with dashes and colons intact
        const timestamp = `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;
        // Result Example: "13-10-26_07:57pm"
        const outputFileName = `7.2_Final_Gaps_Finding_${timestamp}.md`;
        const OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
        const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
        // 7. Commit write configuration array output directly onto physical hardware disk
        fs.writeFileSync(outputFilePath, JSON.stringify(interim, null, 2), 'utf8');
    }

function getmermaidcontent() {
    let CONFIG1 = {
        PATHS: {
            PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
            OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
        }
    }
    let STAGE_4_TOPOLOGY = CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY;
    
    let OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
    let outputFilePath = path.join(OUTPUT_DIR + "/baseline/", STAGE_4_TOPOLOGY+".md");
    console.log(outputFilePath)
    let objectsMatrixContent = fs.readFileSync(outputFilePath, 'utf8');
    //console.log(objectsMatrixContent)
   return extractcontent(objectsMatrixContent)
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



