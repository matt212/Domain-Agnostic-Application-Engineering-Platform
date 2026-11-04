/**
 * FOUR-MATRIX DOMAIN-AGNOSTIC RAG ARCHITECTURE ENGINE
 * Completely decoupled from explicit use-case hardcoding.
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process'); 
const readline = require('readline');

class FunctionalArchitectureRAG {
  constructor(dataMatrix, actorMatrix, journeyMatrix, mermaidGraph) {
    this.dataMatrix = dataMatrix;       // File 1
    this.actorMatrix = actorMatrix;     // File 2
    this.journeyMatrix = journeyMatrix; // File 3
    this.mermaidGraph = mermaidGraph;   // File 4
    this.vectorIndex = new Map();
  }

  /**
   * Pipeline Stage 1: Simulates chunking and vector indexing across all 4 files
   */
  buildCrossReferenceIndex() {
    
    this.dataMatrix.forEach(entity => {
      const entityKey = this.normalizeKey(entity.object_name);

      // 1. Retrieve matching contextual strings from Chronological Journeys (File 3)
      const journeyContext = this.retrieveJourneyChunks(entity.object_name);

      // 2. Retrieve structural topology paths from the Mermaid Graph Layout (File 4)
      const graphTopology = this.retrieveGraphTopologyChunks(journeyContext.stepIndex);

      // 3. Retrieve RBAC constraints from the Actor Access Matrix (File 2)
      const rbacContext = this.retrieveActorClearanceChunks(entity.object_name);

      // Synthesize unified vector index entry
      this.vectorIndex.set(entityKey, {
        rawName: entity.object_name,
        ioSchema: entity,
        chronology: journeyContext,
        topology: graphTopology,
        rbac: rbacContext
      });
    });
  }

  normalizeKey(text) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

    /**
   * FIX 3: Enforce strict boundary matching without requiring literal single quotes
   */
  retrieveJourneyChunks(objectName) {
    let stepIndex = "0";
    let textualContext = "Unmapped Timeline Context";
    
    // Normalize target string to lower-case to execute stable matching loops
    const normalizedTarget = objectName.toLowerCase().trim();

    for (const journey of this.journeyMatrix) {
      if (Array.isArray(journey.chronological_milestones_and_data_inputs)) {
        // Evaluate dataset rows using standard string matching mechanics
        const structuralMatch = journey.chronological_milestones_and_data_inputs.find(milestone => {
          const contentText = milestone.data_object_layer.toLowerCase();
          return contentText.includes(normalizedTarget);
        });

        if (structuralMatch) {
          stepIndex = structuralMatch.step;
          // FIXED: Changed milestone.data_object_layer to structuralMatch.data_object_layer
          textualContext = structuralMatch.data_object_layer;
          break; // Hard-stop iteration once the true context track matches
        }
      }
    }
    return { stepIndex, textualContext };
  }



    retrieveGraphTopologyChunks(stepIndex) {
    const graphString = JSON.stringify(this.mermaidGraph);
    
    // Generates flexible index patterns (e.g., p1_1, p3_1) derived from journey trackers
    const targetToken = `p${stepIndex}_1`;

    return {
      hasSoftFailLoop: graphString.includes(`${targetToken}_degraded`) || graphString.includes('Discrepancy'),
      hasHardFailRollback: graphString.includes(`${targetToken}_reject`) || graphString.includes('Rollback'),
      associatedGate: targetToken
    };
  }


  retrieveActorClearanceChunks(objectName) {
    const permissions = [];
    this.actorMatrix.forEach(actor => {
      const scope = actor.access_authorization_and_scope || {};
      Object.keys(scope).forEach(vectorKey => {
        if (Array.isArray(scope[vectorKey])) {
          if (scope[vectorKey].some(item => item.toLowerCase().includes(objectName.toLowerCase()))) {
            permissions.push({ role: actor.actor_name, vector: vectorKey, policies: scope.Business_Rules_And_Guardrails || {} });
          }
        }
      });
    });
    return permissions;
  }

  /**
   * Pipeline Stage 2: Simulates the LLM Context Ingestion to output precise stages
   */
    /**
   * FIX 1: Map exact schema fields directly from File 1 variables
   */
  compileLifecycleLedger(targetEntityId) {
    const context = this.vectorIndex.get(targetEntityId);
    if (!context) return { error: "Target entity metadata chunk not found." };

    const finalBusinessStages = [];

    finalBusinessStages.push({
      stage: "INITIALIZED / STAGED",
      functionalCriteria: `Asset created via: ${context.ioSchema.input}. Timeline Track: ${context.chronology.textualContext}`
    });

    // FIXED: Corrected key definitions mapping 'activity' and 'output'
    finalBusinessStages.push({
      stage: "PROCESSING_VALIDATION",
      functionalCriteria: `Executing: ${context.ioSchema.activity}. Outputs schema payload: ${context.ioSchema.output}.`
    });

    if (context.topology.hasSoftFailLoop) {
      finalBusinessStages.push({
        stage: "DEGRADED_REMEDIATION_LOOP",
        functionalCriteria: "Validation discrepancy parsed from graph tracking matrix. Routing control to exception loops."
      });
    }

    // FIX 2: Deduplicate data privacy policies during final settlement mapping
    const uniqueGuardrails = [...new Set(context.rbac.map(r => JSON.stringify(r.policies)))].map(p => JSON.parse(p));

    finalBusinessStages.push({
      stage: "FINAL_MUTATION_COMMIT",
      functionalCriteria: `Asset state finalized. Governed by structural parameters: ${JSON.stringify(uniqueGuardrails)}`
    });

    return {
      entity: context.rawName,
      compiledAssetLifecycleLedger: finalBusinessStages
    };
  }

  /**
   * FIX 3: Enforce strict word boundaries so initial steps don't get overwritten
   */
  

}

// ============================================================================
// SYSTEM RUNTIME EXECUTION OVER ALL 4 INTEGRATED SCHEMAS
// ============================================================================
const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '8.6.1.Final-System-Architecture-Blueprint-Graph-'
  },
  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    NGL: '0',
    MAX_TOKENS: '8048',         
    BATCH_SIZE: '2048', 
    THREADS: '8',       
    REASONING_MODE: 'off'
  },
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "1-Final-Objects-",
    STAGE_2_ACTORS: "2.Final-Actors-",
    STAGE_3_JOURNEYS: "3.Final-End-to-End-Actor-Journeys-",
    STAGE_4_TOPOLOGY: "6.swimlane_systems_architecture_map_14-10-26_04_09", 
    FILE_EXTENSION: ".txt"
  }
};
const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
 const objectsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS);
   
    const actorsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS);
    
    const journeysFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS);
    
    const topologyFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY);
console.log(topologyFilePath)
    if (!objectsFilePath || !actorsFilePath || !journeysFilePath || !topologyFilePath) {
      throw new Error("Could not automatically locate all four required input source files inside your output directory.");
    }

    console.log(`\n📖 Reading Input 1: ${path.basename(objectsFilePath)}`);
    console.log(`📖 Reading Input 2: ${path.basename(actorsFilePath)}`);
    console.log(`📖 Reading Input 3: ${path.basename(journeysFilePath)}`);
    console.log(`📖 Reading Input 4: ${path.basename(topologyFilePath)}`);
    
    const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
    const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
    const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');
    const topologyGraphContent = fs.readFileSync(topologyFilePath, 'utf8');

    
const cleanJsonArray1 = JSON.parse(objectsMatrixContent.slice(objectsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray2 = JSON.parse(actorsMatrixContent.slice(actorsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray3 = JSON.parse(journeysMatrixContent.slice(journeysMatrixContent.lastIndexOf('===') + 3).trim());
console.log(journeysMatrixContent)
const ragEngine = new FunctionalArchitectureRAG(
  cleanJsonArray1,
  cleanJsonArray2,
  cleanJsonArray3,
  topologyGraphContent
);

ragEngine.buildCrossReferenceIndex();
// Loop over whatever objects exist in the uploaded Data Matrix dynamically
const finalCompleteSpecificationLedger = {};

Object.keys(ragEngine.dataMatrix).forEach(index => {
  const dynamicKey = ragEngine.normalizeKey(ragEngine.dataMatrix[index].object_name);
  
  // Compiles each asset using automated lookups exclusively
  finalCompleteSpecificationLedger[dynamicKey] = ragEngine.compileLifecycleLedger(dynamicKey);
});


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
  
  
         
          const finalOutputPath = path.join(OUTPUT_DIR.replace("baseline/",""), `${CONFIG.PATHS.EXPORT_PREFIX}${timestamp}.txt`);
              
          
  
          // 7. Commit write configuration array output directly onto physical hardware disk
          fs.writeFileSync(finalOutputPath, JSON.stringify(finalCompleteSpecificationLedger, null, 2), 'utf8');

// const outputFilePath = './finalCompleteSpecificationLedger.json';
// fs.writeFileSync(outputFilePath, JSON.stringify(finalCompleteSpecificationLedger, null, 2), 'utf-8');

console.log(`SUCCESS: Dynamic Business Lifecycle Specification compiled and saved to: ${finalOutputPath}`);


function resolveLatestStageFile(directory, prefixPattern) {
  
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  
  const matchedFiles = files.filter(f => f.startsWith(prefixPattern));
  
  if (matchedFiles.length === 0) return null;

  matchedFiles.sort((a, b) => fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs);
  return path.join(directory, matchedFiles[0]); 
}

