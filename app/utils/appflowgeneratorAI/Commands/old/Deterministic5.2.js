// const fs = require('fs');
// const path = require('path');

// /**
//  * Deterministically parses system matrices and saves a clean, meaningful business flowchart.
//  * @param {string} objectsFile - Path to the Component Layout Objects JSON file
//  * @param {string} actorsFile - Path to the System Actors JSON file
//  * @param {string} journeysFile - Path to the Transaction Journeys JSON file
//  */



// function generateDeterministicBusinessFlowchart(objectsFile, actorsFile, journeysFile) {
//     try {
//         console.log("⚙️ [1/4] Ingesting source matrix configuration records...");
        
//         // 1. Verify existence and read all files synchronously
//         if (!fs.existsSync(objectsFile) || !fs.existsSync(actorsFile) || !fs.existsSync(journeysFile)) {
//             console.error("❌ [CRITICAL] Core execution failed: One or more input JSON matrix files are missing.");
//             return;
//         }
        
//         let interimObj = fs.readFileSync(objectsFile, 'utf8');
//         let interimObj1 = fs.readFileSync(actorsFile, 'utf8');
//         let interimObj2 = fs.readFileSync(journeysFile, 'utf8');
      
//         // Safely segment text components by the header markers to target raw data arrays
//         const objectsData = JSON.parse(interimObj.split("===")[2]);
//         const actorsData = JSON.parse(interimObj1.split("===")[2]);
//         const journeysData = JSON.parse(interimObj2.split("===")[2]);

//         // 2. Map objects by lowercase name to ensure clean lookups
//         const objectRegistry = {};
//         objectsData.forEach(obj => {
//             objectRegistry[obj.object_name.toLowerCase()] = obj;
//         });

//         // 3. Isolate the primary journey flow (Customer Lifecycle)
//         const primaryJourney = journeysData.find(j => j.actor_name === "End-User Customer");
//         if (!primaryJourney) {
//             console.error("❌ [CRITICAL] Failed to map execution paths: 'End-User Customer' timeline track not found.");
//             return;
//         }

//         console.log("📐 [2/4] Processing triple-matrix entity cross-references...");
        
//         let mermaidCode = "graph TD\n";
//         mermaidCode += "    %% ============================================================================\n";
//         mermaidCode += "    %% DETERMINISTIC SYSTEMS ARCHITECTURE LIFECYCLE FLOWCHART\n";
//         mermaidCode += "    %% ============================================================================\n\n";

//         const nodeDefinitions = [];
//         const linkStreams = [];

//         // 4. Map chronological milestones sequentially
//         const steps = primaryJourney.chronological_milestones_and_data_inputs;
//         steps.forEach((milestone, idx) => {
//             const stepNum = milestone.step;
//             const contextText = milestone.data_object_layer;

//             // Find matching structural object type from metadata context string
//             let targetObj = null;
//             for (const key of Object.keys(objectRegistry)) {
//                 if (contextText.toLowerCase().includes("'" + key + "'") || contextText.toLowerCase().includes(key)) {
//                     targetObj = objectRegistry[key];
//                     break;
//                 }
//             }

//             if (targetObj) {
//                 const currentVar = "step_p1_" + stepNum.replace(/\./g, '_');
//                 // FIXED: Direct concatenation drops the need for escaping entirely
//                 const displayTitle = "Step " + stepNum + ": " + targetObj.activity;
                
//                 nodeDefinitions.push("    " + currentVar + "[\"" + displayTitle + "\"]");

//                 // Extract data criteria payload from the data inputs cleanly
//                 const cleanedHandoffPayload = targetObj.input.split(' and ')[0];

//                 // Link chronologically forward from the previous step
//                 if (idx > 0) {
//                     const prevStep = steps[idx - 1];
                    
//                     let prevTargetObj = null;
//                     for (const key of Object.keys(objectRegistry)) {
//                         if (prevStep.data_object_layer.toLowerCase().includes("'" + key + "'") || prevStep.data_object_layer.toLowerCase().includes(key)) {
//                             prevTargetObj = objectRegistry[key];
//                             break;
//                         }
//                     }

//                     // Only connect step-to-step directly if the previous step did NOT produce a validation gate breakout
//                     const prevActivityLower = prevTargetObj ? prevTargetObj.activity.toLowerCase() : "";
//                     const prevIsGate = prevActivityLower.includes("verify") || prevActivityLower.includes("check") || prevActivityLower.includes("auth") || prevActivityLower.includes("validate");

//                     if (!prevIsGate) {
//                         const actualPrevVar = "step_p1_" + prevStep.step.replace(/\./g, '_');
//                         linkStreams.push("    " + actualPrevVar + " -- \"Passes: " + cleanedHandoffPayload + "\" --> " + currentVar);
//                     }
//                 }

//                 // 5. PARSE INTEGRITY CROSSROADS (Automated Happy / Unhappy Path Validation Gates)
//                 const activityLower = targetObj.activity.toLowerCase();
//                 if (activityLower.includes("verify") || activityLower.includes("check") || activityLower.includes("auth") || activityLower.includes("validate")) {
//                     const gateVar = currentVar + "_gate";
//                     const fallbackVar = currentVar + "_degraded_alert";

//                     // FIXED: Wrapped decision boxes cleanly using Mermaid diamond syntax {} without template leaks
//                     nodeDefinitions.push("    " + gateVar + "{\"Is " + targetObj.object_name + " State Valid?\"}");
//                     nodeDefinitions.push("    " + fallbackVar + "[\"⚠️ [Degraded/Soft Failure] Route System Alert & Remediation Loop\"]");

//                     linkStreams.push("    " + currentVar + " --> " + gateVar);
                    
//                     // Happy path jumps forward to the next index location target step
//                     if (steps[idx + 1]) {
//                         const nextVar = "step_p1_" + steps[idx + 1].step.replace(/\./g, '_');
//                         linkStreams.push("    " + gateVar + " -- \"Happy Path: Approved\" --> " + nextVar);
//                     }

//                     // Unhappy Path / Alternate track gracefully branches out and closes loops locally
//                     linkStreams.push("    " + gateVar + " -. \"Unhappy Path: Discrepancy\" .-> " + fallbackVar);
//                     linkStreams.push("    " + fallbackVar + " -. \"Initiate Self-Healing\" .-> " + currentVar);
//                 }
//             }
//         });

//         // Combine string streams cleanly
//         mermaidCode += "    %% --- SUBGRAPH STRUCTURAL COMPONENT OBJECT DEFINITIONS ---\n";
//         mermaidCode += nodeDefinitions.join("\n") + "\n\n";
//         mermaidCode += "    %% --- CHRONOLOGICAL LIFECYCLE LINK VECTOR TRACKS ---\n";
//         mermaidCode += [...new Set(linkStreams)].join("\n") + "\n";

//         console.log("💾 [3/4] Structuring dynamic timestamp profile...");
        
//         // 6. Generate exact timestamp formatting structure: DD-MM-YY_HH.MMam/pm
//         const now = new Date();
//         const day = String(now.getDate()).padStart(2, '0');
//         const month = String(now.getMonth() + 1).padStart(2, '0');
//         const year = String(now.getFullYear()).slice(-2);

//         let hours = now.getHours();
//         const minutes = String(now.getMinutes()).padStart(2, '0');
//         const ampm = hours >= 12 ? 'pm' : 'am';
//         hours = hours % 12;
//         hours = hours ? hours : 12; // Standardised 12-hour format conversion
//         const formattedHours = String(hours).padStart(2, '0');

//         const timestampStr = day + "-" + month + "-(" + year + "_)" + formattedHours + "." + minutes + ampm;
//         const outputFileName = "business_generated_flowchart_" + timestampStr + ".md";

//         // 7. Write clean Markdown wrapper block out onto file structure
//         const finalFilePayload = "```mermaid\n" + mermaidCode + "```";
        
//         const baseDir = __dirname.replace("commands", "aiOutput");
//         if (!fs.existsSync(baseDir)){
//             fs.mkdirSync(baseDir, { recursive: true });
//         }
        
//         fs.writeFileSync(path.join(baseDir, outputFileName), finalFilePayload, 'utf8');

//         console.log("🎉 [4/4] COMPLETE! Workflow chart generated successfully.");
//         console.log("📁 File exported as: ./" + outputFileName);

//     } catch (error) {
//         console.error("💥 [CRITICAL FAILURE] Pipeline execution crashed:", error);
//     }
// }


// // ============================================================================
// // EXECUTION CALL INTERFACE:
// // ============================================================================
// let base = {
//     a: 'app/utils/appflowgeneratorAI/aiOutput/1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt',
//     b: 'app/utils/appflowgeneratorAI/aiOutput/2.Final-Actors-for-Quick Commerce (Q-Commerce)_and_Hyperlocal Grocery Delivery_2026-10-03T19-22-16-404Z.txt',
//     c: 'app/utils/appflowgeneratorAI/aiOutput/3.Final-End-to-End-Actor-Journeys-2026-10-03T20-54-21-571Z.txt'
// };

// generateDeterministicBusinessFlowchart(
//     base.a, 
//     base.b,
//     base.c
// );
// const fs = require('fs');
// const path = require('path');

// class SystemFlowchartEngine {
//     constructor(objectsFile, actorsFile, journeysFile) {
//         this.paths = { objectsFile, actorsFile, journeysFile };
//         this.registry = { objects: new Map(), actors: new Map() };
//         this.graph = { nodes: new Map(), edges: [] };
//     }

//     /**
//      * Helper to safely extract JSON payloads across matrix split markers
//      */
//     parseMatrixSegment(filePayload) {
//         if (!filePayload.includes("===")) {
//             return JSON.parse(filePayload);
//         }
//         const segments = filePayload.split("===");
//         return JSON.parse(segments[segments.length - 1].trim());
//     }

//     /**
//      * Ingests, cross-references, and sanitizes core raw input matrices
//      */
//     initializeMatrices() {
//         console.log("⚙️  [1/4] Running matrix structural ingestion pipeline...");
        
//         if (!fs.existsSync(this.paths.objectsFile) || !fs.existsSync(this.paths.actorsFile) || !fs.existsSync(this.paths.journeysFile)) {
//             throw new Error("Missing structural input matrix file pointers.");
//         }

//         const rawObj = fs.readFileSync(this.paths.objectsFile, 'utf8');
//         const rawAct = fs.readFileSync(this.paths.actorsFile, 'utf8');
//         const rawJrn = fs.readFileSync(this.paths.journeysFile, 'utf8');

//         const objectsData = this.parseMatrixSegment(rawObj);
//         const actorsData = this.parseMatrixSegment(rawAct);
//         this.journeysData = this.parseMatrixSegment(rawJrn);

//         // Map matrices into high-speed memory maps
//         objectsData.forEach(obj => {
//             if (obj.object_name && obj.activity) {
//                 this.registry.objects.set(obj.object_name.toLowerCase(), obj);
//             }
//         });

//         actorsData.forEach(act => {
//             if (act.actor_name) {
//                 this.registry.actors.set(act.actor_name.toLowerCase(), act);
//             }
//         });
//     }
//     /**
//      * Resolves matching structural component using semantic scoring rules
//      */
//     resolveTargetObject(contextText) {
//         const normalizedContext = contextText.toLowerCase();
//         let bestMatch = null;
//         let highestScore = 0;

//         for (const [key, obj] of this.registry.objects.entries()) {
//             if (normalizedContext.includes("'" + key + "'") || normalizedContext.includes(key)) {
//                 return obj; // Return immediately on perfect absolute matches
//             }
            
//             // Generate token-based weights for loose string formatting
//             const tokens = key.split(/[\s_\-]+/);
//             const matches = tokens.filter(token => token.length > 2 && normalizedContext.includes(token));
//             if (matches.length > highestScore) {
//                 highestScore = matches.length;
//                 bestMatch = obj;
//             }
//         }
//         return bestMatch;
//     }
//     /**
//      * Builds an in-memory Directed Acyclic Graph (DAG) state map from processing matrices
//      */
//     buildStateGraph() {
//         console.log("📐 [2/4] Executing entity cross-reference structural analysis...");
        
//         const primaryJourney = this.journeysData.find(j => j.actor_name === "End-User Customer");
//         if (!primaryJourney) {
//             throw new Error("Timeline execution track for 'End-User Customer' is missing.");
//         }

//         const steps = primaryJourney.chronological_milestones_and_data_inputs || [];
        
//         steps.forEach((milestone, idx) => {
//             const stepNum = milestone.step;
//             const targetObj = this.resolveTargetObject(milestone.data_object_layer);

//             if (!targetObj) return;

//             const baseId = "step_p1_" + stepNum.replace(/\./g, '_');
//             const displayTitle = "Step " + stepNum + ": " + targetObj.activity;
//             const subsystem = targetObj.subsystem_layer || "Core Services";

//             // Register Main Architecture Execution Node
//             this.graph.nodes.set(baseId, {
//                 id: baseId,
//                 label: displayTitle,
//                 shape: "square",
//                 subsystem: subsystem
//             });

//             // Extract Handoff Payload Metrics cleanly
//             let payloadLabel = "System Handoff";
//             if (targetObj.input) {
//                 const parts = targetObj.input.split(/ and |;/i);
//                 payloadLabel = parts[0].trim();
//             }

//             // Link linear pathways safely by looking back at structural gates
//             if (idx > 0) {
//                 const prevStep = steps[idx - 1];
//                 const prevTarget = this.resolveTargetObject(prevStep.data_object_layer);
                
//                 if (prevTarget) {
//                     const prevActivity = prevTarget.activity.toLowerCase();
//                     const prevIsGate = prevActivity.includes("verify") || prevActivity.includes("check") || prevActivity.includes("auth") || prevActivity.includes("validate");

//                     if (!prevIsGate) {
//                         const prevId = "step_p1_" + prevStep.step.replace(/\./g, '_');
//                         this.graph.edges.push({
//                             from: prevId,
//                             to: baseId,
//                             type: "directed",
//                             label: "Passes: " + payloadLabel
//                         });
//                     }
//                 }
//             }

//             // Parse Validation Crossroad Gates & Recovery Cycles
//             const activityLower = targetObj.activity.toLowerCase();
//             const isGate = activityLower.includes("verify") || activityLower.includes("check") || activityLower.includes("auth") || activityLower.includes("validate");

//             if (isGate) {
//                 const gateId = baseId + "_gate";
//                 const alertId = baseId + "_degraded_alert";

//                 this.graph.nodes.set(gateId, {
//                     id: gateId,
//                     label: "Is " + targetObj.object_name + " State Valid?",
//                     shape: "diamond",
//                     subsystem: subsystem
//                 });

//                 this.graph.nodes.set(alertId, {
//                     id: alertId,
//                     label: "⚠️ [Fault Isolation] Trigger Auto-Remediation Workflow Loop",
//                     shape: "round",
//                     subsystem: "Operations Control"
//                 });

//                 this.graph.edges.push({ from: baseId, to: gateId, type: "directed" });

//                 if (steps[idx + 1]) {
//                     const nextStep = steps[idx + 1];
//                     const nextId = "step_p1_" + nextStep.step.replace(/\./g, '_');
//                     this.graph.edges.push({
//                         from: gateId,
//                         to: nextId,
//                         type: "directed",
//                         label: "Happy Path: Verified"
//                     });
//                 }

//                 this.graph.edges.push({ from: gateId, to: alertId, type: "dotted", label: "Fail: Exception Detected" });
//                 this.graph.edges.push({ from: alertId, to: baseId, type: "dotted", label: "Retry Event Loop" });
//             }
//         });
//     }
//     /**
//      * Transforms internal DAG elements out into semantic structured Mermaid representations
//      */
//     compileToMermaid() {
//         let code = "graph TD\n";
//         code += "    %% ============================================================================\n";
//         code += "    %% ENTERPRISE SYSTEMS ARCHITECTURE INTEGRATION MAP\n";
//         code += "    %% ============================================================================\n\n";

//         // Separate and structure dynamic backend subgraphs 
//         const layers = {};
//         for (const [id, node] of this.graph.nodes.entries()) {
//             if (!layers[node.subsystem]) layers[node.subsystem] = [];
//             layers[node.subsystem].push(node);
//         }

//         let layerIdx = 0;
//         for (const [subsystem, nodes] of Object.entries(layers)) {
//             code += "    subgraph Layer_" + layerIdx + " [\"" + subsystem.toUpperCase() + "\"]\n";
//             nodes.forEach(node => {
//                 if (node.shape === "diamond") {
//                     code += "        " + node.id + "{\"" + node.label + "\"}\n";
//                 } else if (node.shape === "round") {
//                     code += "        " + node.id + "(\"" + node.label + "\")\n";
//                 } else {
//                     code += "        " + node.id + "[\"" + node.label + "\"]\n";
//                 }
//             });
//             code += "    end\n\n";
//             layerIdx++;
//         }

//         // Generate deduplicated vector streams
//         code += "    %% --- LINEAGE ROUTING CHANNELS ---\n";
//         const uniqueEdges = [...new Set(this.graph.edges.map(e => JSON.stringify(e)))].map(s => JSON.parse(s));
        
//         uniqueEdges.forEach(edge => {
//             if (edge.label) {
//                 const connector = edge.type === "dotted" ? " -. \"" : " -- \"";
//                 const tail = edge.type === "dotted" ? "\" .-> " : "\" --> ";
//                 code += "    " + edge.from + connector + edge.label + tail + edge.to + "\n";
//             } else {
//                 const line = edge.type === "dotted" ? " -.-> " : " --> ";
//                 code += "    " + edge.from + line + edge.to + "\n";
//             }
//         });

//         return code;
//     }
//     /**
//      * Executes orchestration and writes standard architecture bundle artifacts out to workspace
//      */
//     execute() {
//         try {
//             this.initializeMatrices();
//             this.buildStateGraph();
//             const compiledMermaid = this.compileToMermaid();

//             console.log("💾 [3/4] Exporting generated architecture assets...");
//             const now = new Date();
//             const stamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + "_" + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
            
//             const targetFilename = "system_architecture_map_" + stamp + ".md";
//             const targetDirectory = __dirname.replace("commands", "aiOutput");

//             if (!fs.existsSync(targetDirectory)) {
//                 fs.mkdirSync(targetDirectory, { recursive: true });
//             }

//             fs.writeFileSync(path.join(targetDirectory, targetFilename), "```mermaid\n" + compiledMermaid + "```", "utf8");
            
//             console.log("🎉 [4/4] COMPLETE! Architecture payload successfully written out to storage topology.");
//             console.log("📁 Asset Saved: ./" + targetFilename);
//         } catch (err) {
//             console.error("💥 [CRITICAL ENGINE ERROR] Orchestration pipeline processing failed:", err.message);
//         }
//     }
// }

// // Execution Interface Core Instantiation Hook:
// let base = {
//     a: 'app/utils/appflowgeneratorAI/aiOutput/1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt',
//     b: 'app/utils/appflowgeneratorAI/aiOutput/2.Final-Actors-for-Quick Commerce (Q-Commerce)_and_Hyperlocal Grocery Delivery_2026-10-03T19-22-16-404Z.txt',
//     c: 'app/utils/appflowgeneratorAI/aiOutput/3.Final-End-to-End-Actor-Journeys-2026-10-03T20-54-21-571Z.txt'
// };

// const engine = new SystemFlowchartEngine(base.a, base.b, base.c);
// engine.execute();
// const fs = require('fs');
// const path = require('path');

// /**
//  * Programmatically synthesizes a multi-actor cross-functional swimlane map from raw system matrices.
//  * @param {string} objectsFile - Path to the Component Layout Objects file
//  * @param {string} actorsFile - Path to the System Actors file
//  * @param {string} journeysFile - Path to the Transaction Journeys file
//  */
// function generateDeterministicBusinessFlowchart(objectsFile, actorsFile, journeysFile) {
//     try {
//         console.log("⚙️  [1/4] Running multi-matrix ingestion pipeline...");
        
//         if (!fs.existsSync(objectsFile) || !fs.existsSync(actorsFile) || !fs.existsSync(journeysFile)) {
//             console.error("❌ [CRITICAL] Core execution failed: Matrix files are missing.");
//             return;
//         }

//         const extract = (filePath) => {
//             const raw = fs.readFileSync(filePath, 'utf8');
//             return JSON.parse(raw.includes("===") ? raw.split("===").pop().trim() : raw.trim());
//         };

//         const objectsData = extract(objectsFile);
//         const actorsData = extract(actorsFile);
//         const journeysData = extract(journeysFile);

//         const sanitize = (text) => {
//             if (!text) return "";
//             return String(text).replace(/["'\\]/g, "").trim();
//         };
//         console.log("📐 [2/4] Compiling cross-functional node registries dynamically...");

//         const objectRegistry = {};
//         objectsData.forEach(obj => { if (obj.object_name) objectRegistry[obj.object_name.toLowerCase()] = obj; });

//         const actorRegistry = {};
//         actorsData.forEach(act => { if (act.actor_name) actorRegistry[act.actor_name.toLowerCase()] = act; });

//         const nodes = new Map(), edges = [];
//         const layerTrackingMap = {};

//         // Process every single actor track inside the journeys matrix concurrently
//         journeysData.forEach((actorTrack) => {
//             const actorName = actorTrack.actor_name;
//             const milestones = actorTrack.chronological_milestones_and_data_inputs || [];
            
//             // Build a dynamic swimlane identifier mapping name
//             const matchingActorMeta = actorRegistry[actorName.toLowerCase()];
//             const functionalRole = matchingActorMeta ? matchingActorMeta.operational_role : "Processing Subsystem";
//             const swimlaneTitle = actorName + " & " + functionalRole;

//             milestones.forEach((milestone) => {
//                 const stepNum = milestone.step;
//                 const contextText = milestone.data_object_layer || "";
//                 const targetKey = contextText.toLowerCase();

//                 // Contextual matching engine lookup pass
//                 let targetObj = objectRegistry[targetKey] || Object.values(objectRegistry).find(obj => targetKey.includes(obj.object_name.toLowerCase()));
//                 if (!targetObj) return;

//                 // Create a completely unique node variable ID bound to the specific phase and step sequence
//                 const uniqueNodeId = "step_" + actorName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + "_" + stepNum.replace(/\./g, '_');
                
//                 const processLabel = "Step " + stepNum + ": " + sanitize(targetObj.activity);
                
//                 nodes.set(uniqueNodeId, {
//                     id: uniqueNodeId,
//                     label: processLabel,
//                     shape: "square",
//                     layer: swimlaneTitle.toUpperCase()
//                 });

//                 // Track active mapping positions to link cross-boundary channels later
//                 const mappingKey = actorName.toLowerCase() + "_" + stepNum;
//                 layerTrackingMap[mappingKey] = uniqueNodeId;

//                 // Evaluate validation gates dynamically based on schema attributes
//                 const hasExceptions = Array.isArray(targetObj.exception_paths);
//                 const requiresVerification = targetObj.validation_required === true || 
//                     (targetObj.output_state && targetObj.output_state.toLowerCase().includes("pending"));

//                 if (hasExceptions || requiresVerification) {
//                     const gateId = uniqueNodeId + "_gate";
//                     const entityContext = sanitize(targetObj.object_name);

//                     nodes.set(gateId, {
//                         id: gateId,
//                         label: "Is " + entityContext + " State Valid?",
//                         shape: "diamond",
//                         layer: swimlaneTitle.toUpperCase()
//                     });

//                     edges.push({ from: uniqueNodeId, to: gateId, type: "directed" });
//                     layerTrackingMap[mappingKey + "_gate"] = gateId;
//                 }
//             });
//         });
//         console.log("🔗 [3/4] Synthesizing cross-boundary inter-swimlane channels...");

//         // Connect sequence lines dynamically by looking up step trackers inside the mapping index
//         journeysData.forEach((actorTrack) => {
//             const actorName = actorTrack.actor_name;
//             const milestones = actorTrack.chronological_milestones_and_data_inputs || [];

//             milestones.forEach((milestone, idx) => {
//                 const currentKey = actorName.toLowerCase() + "_" + milestone.step;
//                 const currentNodeId = layerTrackingMap[currentKey];

//                 if (!currentNodeId) return;

//                 // 1. Map internal linear paths within the same column track
//                 if (idx > 0) {
//                     const prevMilestone = milestones[idx - 1];
//                     const prevKey = actorName.toLowerCase() + "_" + prevMilestone.step;
                    
//                     // Link steps directly if the preceding component didn't create a validation block
//                     const prevGateId = layerTrackingMap[prevKey + "_gate"];
//                     if (!prevGateId) {
//                         const prevNodeId = layerTrackingMap[prevKey];
//                         if (prevNodeId) {
//                             edges.push({ from: prevNodeId, to: currentNodeId, type: "directed" });
//                         }
//                     }
//                 }

//                 // 2. Map dynamic cross-boundary handoffs between separate columns
//                 const contextLower = (milestone.data_object_layer || "").toLowerCase();
                
//                 for (const [lookupKey, nodeVarId] of Object.entries(layerTrackingMap)) {
//                     if (lookupKey.includes("_gate")) continue;

//                     // If a step's payload text context references an external actor's object, create a link
//                     const parts = lookupKey.split("_");
//                     const externalActor = parts[0];
                    
//                     if (externalActor !== actorName.toLowerCase() && contextLower.includes(externalActor)) {
//                         const sourceGateId = layerTrackingMap[lookupKey + "_gate"];
//                         const finalOriginId = sourceGateId ? sourceGateId : nodeVarId;

//                         edges.push({
//                             from: finalOriginId,
//                             to: currentNodeId,
//                             type: sourceGateId ? "happy" : "directed",
//                             label: milestone.step + ". Connected Handoff Execution Vector"
//                         });
//                     }
//                 }
//             });
//         });
//         // 5. Compile Mermaid Source Strings
//         let code = "graph TD\n    %% ============================================================================\n    %% ENTERPRISE CROSS-FUNCTIONAL SWIMLANE AUTHORIZATION ARCHITECTURE MAP\n    %% ============================================================================\n\n";

//         const swimlanes = {};
//         for (const [id, node] of nodes.entries()) {
//             if (!swimlanes[node.layer]) swimlanes[node.layer] = [];
//             swimlanes[node.layer].push(node);
//         }

//         let subgraphIdx = 0;
//         const compiledSubgraphIds = [];
//         for (const [layerName, layerNodes] of Object.entries(swimlanes)) {
//             const subName = "lane_" + subgraphIdx;
//             compiledSubgraphIds.push(subName);
            
//             code += "    subgraph " + subName + " [\"" + layerName + "\"]\n";
//             layerNodes.forEach(n => {
//                 if (n.shape === "diamond") code += "        " + n.id + "{\"" + n.label + "\"}\n";
//                 else if (n.shape === "round") code += "        " + n.id + "(\"" + n.label + "\")\n";
//                 else code += "        " + n.id + "[\"" + n.label + "\"]\n";
//             });
//             code += "    end\n\n";
//             subgraphIdx++;
//         }

//         // CRITICAL SPATIAL BINDING: Force structural role columns to drop parallel side-by-side
//         if (compiledSubgraphIds.length > 1) {
//             code += "    %% --- FORCE INVISIBLE HORIZONTAL ALIGNMENT CONSTRAINTS (SIDE-BY-SIDE) ---\n";
//             for (let i = 0; i < compiledSubgraphIds.length - 1; i++) {
//                 code += "    " + compiledSubgraphIds[i] + " ~~~ " + compiledSubgraphIds[i+1] + "\n";
//             }
//             code += "\n";
//         }

//         // Rule 12 Compliant Vector Link Printer
//         code += "    %% --- ENTERPRISE INTER-SWIMLANE CROSS-BOUNDARY PIPELINE CHANNELS ---\n";
//         [...new Set(edges.map(e => JSON.stringify(e)))].map(s => JSON.parse(s)).forEach(e => {
//             if (e.label) {
//                 code += e.type === "exception" ? "    " + e.from + " -. \"" + e.label + "\" .-> " + e.to + "\n" : "    " + e.from + " -- \" " + e.label + " \" --> " + e.to + "\n";
//             } else {
//                 code += "    " + e.from + " --> " + e.to + "\n";
//             }
//         });

//         console.log("💾 [4/4] Exporting generated architecture assets...");
//         const now = new Date();
//         const dateStamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
//         const outputName = "swimlane_parallel_architecture_map_" + dateStamp + ".md";

//         let targetDir = path.dirname(objectsFile);
//         fs.writeFileSync(path.join(targetDir, outputName), "```mermaid\n" + code + "```", "utf8");
        
//         console.log("🎉 COMPLETE! Architecture map successfully written to disk.\n📁 Target Path: " + path.join(targetDir, outputName));

//     } catch (error) {
//         console.error("💥 [CRITICAL FAILURE] Pipeline execution crashed:", error.message);
//     }
// }

// // ============================================================================
// // EXECUTION CALL INTERFACE (100% PURE SEPARATION):
// // ============================================================================
// let base = {
//     a: 'app/utils/appflowgeneratorAI/aiOutput/1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt',
//     b: 'app/utils/appflowgeneratorAI/aiOutput/2.Final-Actors-for-Quick Commerce (Q-Commerce)_and_Hyperlocal Grocery Delivery_2026-10-03T19-22-16-404Z.txt',
//     c: 'app/utils/appflowgeneratorAI/aiOutput/3.Final-End-to-End-Actor-Journeys-2026-10-03T20-54-21-571Z.txt'
// };

// generateDeterministicBusinessFlowchart(base.a, base.b, base.c);

//===================================iteration=================
// const fs = require('fs');
// const path = require('path');

// /**
//  * Deterministically parses system matrices and saves an industry-standard swimlane blueprint.
//  * @param {string} objectsFile - Path to the Component Layout Objects JSON file
//  * @param {string} actorsFile - Path to the System Actors JSON file
//  * @param {string} journeysFile - Path to the Transaction Journeys JSON file
//  */
// function generateDeterministicBusinessFlowchart(objectsFile, actorsFile, journeysFile) {
//     try {
//         console.log("⚙️  [1/4] Running matrix structural ingestion pipeline...");
        
//         // 1. Verify existence of parameters passed via function invocation
//         if (!fs.existsSync(objectsFile) || !fs.existsSync(actorsFile) || !fs.existsSync(journeysFile)) {
//             console.error("❌ [CRITICAL] Core execution failed: One or more input JSON matrix files are missing.");
//             return;
//         }

//         const extract = (filePath) => {
//             const raw = fs.readFileSync(filePath, 'utf8');
//             return JSON.parse(raw.includes("===") ? raw.split("===").pop().trim() : raw.trim());
//         };

//         const objectsData = extract(objectsFile);
//         const actorsData = extract(actorsFile);
//         const journeysData = extract(journeysFile);

//         const sanitize = (text) => {
//             if (!text) return "";
//             return String(text).replace(/["'\\]/g, "").trim();
//         };
//         console.log("📐 [2/4] Initializing dynamic multi-matrix cross-reference indices...");

//         // Map objects by exact name to eliminate duplicate substring hits
//         const objectRegistry = {};
//         objectsData.forEach(obj => { 
//             if (obj.object_name) objectRegistry[obj.object_name.toLowerCase().trim()] = obj; 
//         });

//         const activeActors = [];
//         actorsData.forEach(act => { 
//             if (act.actor_name) activeActors.push(act.actor_name.trim()); 
//         });

//         // Discover the primary timeline dataset track array dynamically
//         const primaryJourney = journeysData.find(j => Array.isArray(j.chronological_milestones_and_data_inputs));
//         if (!primaryJourney) {
//             console.error("❌ Schema Error: Journey matrix missing timeline tracking layout.");
//             return;
//         }

//         const timelineSteps = primaryJourney.chronological_milestones_and_data_inputs;
//         const dynamicFallbackOwner = primaryJourney.actor_name || "Core Processing Layer";
        
//         const nodes = new Map(), edges = [];
//         const laneAssignmentMap = {};
        
//         // Global phase state map counter tracker cache
//         const macroPhaseCounterMap = {};
//         console.log("📐 [3/4] Parsing unified master timeline into multi-path sub-phases...");
//         const stepsCount = timelineSteps.length;

//         timelineSteps.forEach((milestone, idx) => {
//             const contextText = milestone.data_object_layer || "";
//             const targetKey = contextText.toLowerCase();

//             // 1. Core Object Exact Match Resolution
//             let targetObj = null;
//             for (const [key, obj] of Object.entries(objectRegistry)) {
//                 if (targetKey.includes("'" + key + "'") || targetKey.includes(" " + key + " ") || targetKey.startsWith(key)) {
//                     targetObj = obj;
//                     break;
//                 }
//             }
//             if (!targetObj) return;

//             // 2. Compute Primary Process Sub-Phase Number Group
//             const macroPhase = String(milestone.step).trim();
//             if (!macroPhaseCounterMap[macroPhase]) {
//                 macroPhaseCounterMap[macroPhase] = 1;
//             }
            
//             let subIndex = macroPhaseCounterMap[macroPhase];
//             let stepIndexStr = macroPhase + "." + subIndex;
//             macroPhaseCounterMap[macroPhase] += 1;

//             let nodeId = "node_step_p" + macroPhase.replace(/\W/g, '_') + "_" + subIndex;
//             laneAssignmentMap[idx] = nodeId;

//             // Dynamic Actor Lane Matching Pass
//             let laneOwner = dynamicFallbackOwner;
//             for (const actor of activeActors) {
//                 if (contextText.includes(actor) && actor !== dynamicFallbackOwner) {
//                     laneOwner = actor;
//                     break;
//                 }
//             }

//             // Register Primary Milestone Node
//             nodes.set(nodeId, {
//                 id: nodeId,
//                 label: "Step " + stepIndexStr + ": " + sanitize(targetObj.activity),
//                 shape: "square",
//                 layer: laneOwner
//             });

//             // Connect workflows linearly backwards
//             if (idx > 0) {
//                 const previousNodeId = laneAssignmentMap[idx - 1];
//                 const prevGateId = previousNodeId + "_gate";
//                 const finalOriginId = nodes.has(prevGateId) ? prevGateId : previousNodeId;
                
//                 if (finalOriginId) {
//                     const dataPayloadLabel = targetObj.input ? sanitize(targetObj.input.split(/ and |;/i)[0]) : "Context Handoff";
//                     edges.push({
//                         from: finalOriginId,
//                         to: nodeId,
//                         type: "linear",
//                         label: stepIndexStr + ". Passes: " + dataPayloadLabel
//                     });
//                 }
//             }

//             // 3. DYNAMIC CHILD EXTRACTION: Cascade sub-steps (e.g., 5.2, 5.3) based on structural schema connections
//             for (const [childKey, childObj] of Object.entries(objectRegistry)) {
//                 if (childKey === targetObj.object_name.toLowerCase()) continue;
                
//                 if (childObj.input && childObj.input.toLowerCase().includes(targetObj.object_name.toLowerCase())) {
//                     let childSubIndex = macroPhaseCounterMap[macroPhase];
//                     let childStepStr = macroPhase + "." + childSubIndex;
//                     macroPhaseCounterMap[macroPhase] += 1;

//                     let childNodeId = "node_step_p" + macroPhase.replace(/\W/g, '_') + "_" + childSubIndex;
//                     let childLaneOwner = laneOwner;
                    
//                     for (const actor of activeActors) {
//                         if (childObj.input.includes(actor) || (childObj.output && childObj.output.includes(actor))) {
//                             childLaneOwner = actor;
//                             break;
//                         }
//                     }

//                     // Register Cascading Child Sub-Step Box
//                     nodes.set(childNodeId, {
//                         id: childNodeId,
//                         label: "Step " + childStepStr + ": " + sanitize(childObj.activity),
//                         shape: "square",
//                         layer: childLaneOwner
//                     });

//                     // Link parent process to child dependency track
//                     edges.push({
//                         from: nodeId,
//                         to: childNodeId,
//                         type: "linear",
//                         label: childStepStr + ". Spawns: " + sanitize(childObj.object_name)
//                     });
//                 }
//             }

//             // 4. Decision Crossroads Isolation
//             const hasExceptions = Array.isArray(targetObj.exception_paths) || targetObj.hasOwnProperty('exception_paths');
//             const requiresVerification = targetObj.validation_required === true || 
//                 (targetObj.output_state && targetObj.output_state.toLowerCase().includes("pending")) ||
//                 targetObj.object_name.toLowerCase().match(/(request|cart|order|receipt)/i);

//             if (hasExceptions || requiresVerification) {
//                 const gateId = nodeId + "_gate";
//                 const alertId = nodeId + "_degraded_alert";
//                 const alternativeId = nodeId + "_alternate_path";
//                 const rejectId = nodeId + "_reject_scenario";
//                 const entityName = sanitize(targetObj.object_name);

//                 nodes.set(gateId, { id: gateId, label: "Step " + stepIndexStr + " Gate: Is " + entityName + " State Valid?", shape: "diamond", layer: laneOwner });
//                 edges.push({ from: nodeId, to: gateId, type: "linear" });

//                 nodes.set(alternativeId, { id: alternativeId, label: "🔄 [" + stepIndexStr + " Alternate] Apply Cached Profile Defaults", shape: "square", layer: laneOwner });
//                 edges.push({ from: gateId, to: alternativeId, type: "linear", label: "On Alternate Hit" });

//                 nodes.set(alertId, { id: alertId, label: "⚠️ [" + stepIndexStr + " Fault Isolation] Trigger " + entityName + " Auto-Remediation Loop", shape: "round", layer: "OPERATIONS CONTROL" });
//                 edges.push({ from: gateId, to: alertId, type: "exception", label: "Soft Fail: State Discrepancy" });
//                 edges.push({ from: alertId, to: nodeId, type: "exception", label: "Retry Event Loop" });

//                 let financeLane = "OPERATIONS CONTROL";
//                 for (const actor of activeActors) {
//                     if (actor.toLowerCase().includes("finance") || actor.toLowerCase().includes("billing") || actor.toLowerCase().includes("agent")) {
//                         financeLane = actor;
//                         break;
//                     }
//                 }

//                 nodes.set(rejectId, { id: rejectId, label: "🛑 [" + stepIndexStr + " Rollback] Reverse System Allocation State", shape: "round", layer: financeLane });
//                 edges.push({ from: gateId, to: rejectId, type: "exception", label: "Hard Fail: Reject Scenario Triggered" });
//                 edges.push({ from: rejectId, to: "system_closure_hub", type: "exception", label: "Terminate Session" });

//                 if (idx < stepsCount - 1) {
//                     edges.push({ from: gateId, to: alternativeId, type: "linear", label: "Happy Path: Verified" });
//                 }
//             }
//         });

//         nodes.set("system_closure_hub", { id: "system_closure_hub", label: "🏁 [System Settlement] Close Transaction Lifecycle Session", shape: "round", layer: "OPERATIONS CONTROL" });
//         if (stepsCount > 0) {
//             const finalIndex = stepsCount - 1;
//             const finalProcessId = laneAssignmentMap[finalIndex];
//             const finalGateId = finalProcessId + "_gate";
//             const finalOriginId = nodes.has(finalGateId) ? finalGateId : finalProcessId;

//             edges.push({ from: finalOriginId, to: "system_closure_hub", type: "linear", label: "Final Lifecycle Sync" });
//         }
//         // 5. Compile Mermaid Source Strings
//         let code = "graph TD\n    %% ============================================================================\n    %% ENTERPRISE CROSS-FUNCTIONAL SWIMLANE AUTHORIZATION ARCHITECTURE MAP\n    %% ============================================================================\n\n";

//         const swimlanes = {};
//         for (const [id, node] of nodes.entries()) {
//             const targetLayer = String(node.layer).toUpperCase();
//             if (!swimlanes[targetLayer]) swimlanes[targetLayer] = [];
//             swimlanes[targetLayer].push(node);
//         }

//         let subgraphIdx = 0;
//         const compiledSubgraphIds = [];
//         for (const [layerName, layerNodes] of Object.entries(swimlanes)) {
//             const subName = "lane_" + subgraphIdx;
//             compiledSubgraphIds.push(subName);
            
//             code += "    subgraph " + subName + " [\"" + layerName + "\"]\n";
//             layerNodes.forEach(n => {
//                 if (n.shape === "diamond") code += "        " + n.id + "{\"" + n.label + "\"}\n";
//                 else if (n.shape === "round") code += "        " + n.id + "(\"" + n.label + "\")\n";
//                 else code += "        " + n.id + "[\"" + n.label + "\"]\n";
//             });
//             code += "    end\n\n";
//             subgraphIdx++;
//         }

//         // Force structural role columns to drop parallel side-by-side horizontally
//         if (compiledSubgraphIds.length > 1) {
//             code += "    %% --- FORCE INVISIBLE HORIZONTAL ALIGNMENT CONSTRAINTS (SIDE-BY-SIDE) ---\n";
//             for (let i = 0; i < compiledSubgraphIds.length - 1; i++) {
//                 code += "    " + compiledSubgraphIds[i] + " ~~~ " + compiledSubgraphIds[i+1] + "\n";
//             }
//             code += "\n";
//         }

//         code += "    %% --- ENTERPRISE INTER-SWIMLANE CROSS-BOUNDARY PIPELINE CHANNELS ---\n";
//         [...new Set(edges.map(e => JSON.stringify(e)))].map(s => JSON.parse(s)).forEach(e => {
//             if (e.label) {
//                 code += e.type === "exception" ? "    " + e.from + " -. \"" + e.label + "\" .-> " + e.to + "\n" : "    " + e.from + " -- \" " + e.label + " \" --> " + e.to + "\n";
//             } else {
//                 code += "    " + e.from + " --> " + e.to + "\n";
//             }
//         });
//         console.log("💾 [4/4] Exporting generated architecture assets...");
//         const now = new Date();
//         const dateStamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
//         const outputName = "pure_dynamic_swimlane_flowchart_" + dateStamp + ".md";

//         let targetDir = __dirname.endsWith("commands") ? __dirname.replace("commands", "aiOutput") : path.join(__dirname, "aiOutput");
//         if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        
//         fs.writeFileSync(path.join(targetDir, outputName), "```mermaid\n" + code + "```", "utf8");
//         console.log("🎉 COMPLETE! Multi-path architecture blueprint successfully written to disk.\n📁 Target Path: " + path.join(targetDir, outputName));

//     } catch (error) {
//         console.error("❌ [CRITICAL FAILURE] Pipeline execution crashed:", error.message);
//     }
// }

// // ============================================================================
// // EXECUTION CALL INTERFACE (100% PURE SEPARATION):
// // ============================================================================
// let base = {
//     a: 'app/utils/appflowgeneratorAI/aiOutput/1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt',
//     b: 'app/utils/appflowgeneratorAI/aiOutput/2.Final-Actors-for-Quick Commerce (Q-Commerce)_and_Hyperlocal Grocery Delivery_2026-10-03T19-22-16-404Z.txt',
//     c: 'app/utils/appflowgeneratorAI/aiOutput/3.Final-End-to-End-Actor-Journeys-2026-10-03T20-54-21-571Z.txt'
// };

// generateDeterministicBusinessFlowchart(base.a, base.b, base.c);


const fs = require('fs');
const path = require('path');

function generateDeterministicBusinessFlowchart(objectsFile, actorsFile, journeysFile) {
    try {
        console.log("⚙️  [1/4] Running matrix structural ingestion pipeline...");
        
        if (!fs.existsSync(objectsFile) || !fs.existsSync(actorsFile) || !fs.existsSync(journeysFile)) {
            console.error("❌ [CRITICAL] Core execution failed: Matrix JSON files are missing.");
            return;
        }

        const extract = (filePath) => {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw.includes("===") ? raw.split("===").pop().trim() : raw.trim());
        };

        const objectsData = extract(objectsFile);
        const actorsData = extract(actorsFile);
        const journeysData = extract(journeysFile);

        const sanitize = (text) => {
            if (!text) return "";
            return String(text).replace(/["'\\]/g, "").trim();
        };
        console.log("📐 [2/4] Initializing dynamic multi-matrix cross-reference indices...");

        const objectRegistry = {};
        objectsData.forEach(obj => { 
            if (obj.object_name) objectRegistry[obj.object_name.toLowerCase().trim()] = obj; 
        });

        const activeActors = [];
        actorsData.forEach(act => { 
            if (act.actor_name) activeActors.push(act.actor_name.trim()); 
        });

        const primaryJourney = journeysData.find(j => Array.isArray(j.chronological_milestones_and_data_inputs));
        if (!primaryJourney) {
            console.error("❌ Schema Error: Journey matrix missing timeline tracking layout.");
            return;
        }

        const timelineSteps = primaryJourney.chronological_milestones_and_data_inputs;
        const dynamicFallbackOwner = primaryJourney.actor_name || "Core Processing Layer";
        
        const nodes = new Map(), edges = [];
        const laneAssignmentMap = {};
        const macroPhaseCounterMap = {};
        console.log("📐 [3/4] Parsing master timeline into cascading sub-phases...");
        const stepsCount = timelineSteps.length;

        timelineSteps.forEach((milestone, idx) => {
            const contextText = milestone.data_object_layer || "";
            const targetKey = contextText.toLowerCase();

            let targetObj = null;
            for (const [key, obj] of Object.entries(objectRegistry)) {
                if (targetKey.includes("'" + key + "'") || targetKey.includes(" " + key + " ") || targetKey.startsWith(key)) {
                    targetObj = obj;
                    break;
                }
            }
            if (!targetObj) return;

            const macroPhase = String(milestone.step).trim();
            if (!macroPhaseCounterMap[macroPhase]) {
                macroPhaseCounterMap[macroPhase] = 1;
            }
            
            let subIndex = macroPhaseCounterMap[macroPhase];
            let stepIndexStr = macroPhase + "." + subIndex;
            macroPhaseCounterMap[macroPhase] += 1;

            let nodeId = "node_step_p" + macroPhase.replace(/\W/g, '_') + "_" + subIndex;
            laneAssignmentMap[idx] = nodeId;

            let laneOwner = dynamicFallbackOwner;
            for (const actor of activeActors) {
                if (contextText.includes(actor) && actor !== dynamicFallbackOwner) {
                    laneOwner = actor;
                    break;
                }
            }

            nodes.set(nodeId, {
                id: nodeId,
                label: "Step " + stepIndexStr + ": " + sanitize(targetObj.activity),
                shape: "square",
                layer: laneOwner
            });

            if (idx > 0) {
                const previousNodeId = laneAssignmentMap[idx - 1];
                const prevGateId = previousNodeId + "_gate";
                const finalOriginId = nodes.has(prevGateId) ? prevGateId : previousNodeId;
                
                if (finalOriginId) {
                    const dataPayloadLabel = targetObj.input ? sanitize(targetObj.input.split(/ and |;/i)[0]) : "Context Handoff";
                    edges.push({
                        from: finalOriginId,
                        to: nodeId,
                        type: "linear",
                        label: stepIndexStr + ". Passes: " + dataPayloadLabel
                    });
                }
            }

            // DYNAMIC CHILD DATA-SCHEMA REFLECTION PASS (Compiles x.2, x.3, x.4 Cascades)
            for (const [childKey, childObj] of Object.entries(objectRegistry)) {
                if (childKey === targetObj.object_name.toLowerCase()) continue;
                
                if (childObj.input && childObj.input.toLowerCase().includes(targetObj.object_name.toLowerCase())) {
                    let childSubIndex = macroPhaseCounterMap[macroPhase];
                    let childStepStr = macroPhase + "." + childSubIndex;
                    macroPhaseCounterMap[macroPhase] += 1;

                    let childNodeId = "node_step_p" + macroPhase.replace(/\W/g, '_') + "_" + childSubIndex;
                    let childLaneOwner = laneOwner;
                    
                    for (const actor of activeActors) {
                        if (childObj.input.includes(actor) || (childObj.output && childObj.output.includes(actor))) {
                            childLaneOwner = actor;
                            break;
                        }
                    }

                    nodes.set(childNodeId, {
                        id: childNodeId,
                        label: "Step " + childStepStr + ": " + sanitize(childObj.activity),
                        shape: "square",
                        layer: childLaneOwner
                    });

                    edges.push({
                        from: nodeId,
                        to: childNodeId,
                        type: "linear",
                        label: childStepStr + ". Spawns: " + sanitize(childObj.object_name)
                    });
                }
            }

            const hasExceptions = Array.isArray(targetObj.exception_paths) || targetObj.hasOwnProperty('exception_paths');
            const requiresVerification = targetObj.validation_required === true || 
                (targetObj.output_state && targetObj.output_state.toLowerCase().includes("pending")) ||
                targetObj.object_name.toLowerCase().match(/(request|cart|order|receipt)/i);

            if (hasExceptions || requiresVerification) {
                const gateId = nodeId + "_gate";
                const alertId = nodeId + "_degraded_alert";
                const alternativeId = nodeId + "_alternate_path";
                const rejectId = nodeId + "_reject_scenario";
                const entityName = sanitize(targetObj.object_name);

                nodes.set(gateId, { id: gateId, label: "Step " + stepIndexStr + " Gate: Is " + entityName + " State Valid?", shape: "diamond", layer: laneOwner });
                edges.push({ from: nodeId, to: gateId, type: "linear" });

                nodes.set(alternativeId, { id: alternativeId, label: "🔄 [" + stepIndexStr + " Alternate] Apply Cached Profile Defaults", shape: "square", layer: laneOwner });
                edges.push({ from: gateId, to: alternativeId, type: "linear", label: "On Alternate Hit" });

                nodes.set(alertId, { id: alertId, label: "⚠️ [" + stepIndexStr + " Fault Isolation] Trigger " + entityName + " Auto-Remediation Loop", shape: "round", layer: "OPERATIONS CONTROL" });
                edges.push({ from: gateId, to: alertId, type: "exception", label: "Soft Fail: State Discrepancy" });
                edges.push({ from: alertId, to: nodeId, type: "exception", label: "Retry Event Loop" });

                let financeLane = "OPERATIONS CONTROL";
                for (const actor of activeActors) {
                    if (actor.toLowerCase().includes("finance") || actor.toLowerCase().includes("billing") || actor.toLowerCase().includes("agent")) {
                        financeLane = actor;
                        break;
                    }
                }

                nodes.set(rejectId, { id: rejectId, label: "🛑 [" + stepIndexStr + " Rollback] Reverse System Allocation State", shape: "round", layer: financeLane });
                edges.push({ from: gateId, to: rejectId, type: "exception", label: "Hard Fail: Reject Scenario Triggered" });
                edges.push({ from: rejectId, to: "system_closure_hub", type: "exception", label: "Terminate Session" });

                // FIXED: Target lookahead path forward to the next contiguous process node ID, breaking the circular loop
                if (idx < stepsCount - 1) {
                    const nextMacroPhase = String(timelineSteps[idx + 1].step).trim();
                    const nextSubIndex = macroPhaseCounterMap[nextMacroPhase] || 1;
                    const nextNodeId = "node_step_p" + nextMacroPhase.replace(/\W/g, '_') + "_" + nextSubIndex;
                    
                    edges.push({ from: gateId, to: nextNodeId, type: "linear", label: "Happy Path: Verified" });
                }
            }
        });

        nodes.set("system_closure_hub", { id: "system_closure_hub", label: "🏁 [System Settlement] Close Transaction Lifecycle Session", shape: "round", layer: "OPERATIONS CONTROL" });
        if (stepsCount > 0) {
            const finalIndex = stepsCount - 1;
            const finalProcessId = laneAssignmentMap[finalIndex];
            const finalGateId = finalProcessId + "_gate";
            const finalOriginId = nodes.has(finalGateId) ? finalGateId : finalProcessId;

            edges.push({ from: finalOriginId, to: "system_closure_hub", type: "linear", label: "Final Lifecycle Sync" });
        }
        let code = "graph TD\n    %% ============================================================================\n    %% ENTERPRISE CROSS-FUNCTIONAL SWIMLANE AUTHORIZATION ARCHITECTURE MAP\n    %% ============================================================================\n\n";

        const swimlanes = {};
        for (const [id, node] of nodes.entries()) {
            const targetLayer = String(node.layer).toUpperCase();
            if (!swimlanes[targetLayer]) swimlanes[targetLayer] = [];
            swimlanes[targetLayer].push(node);
        }

        let subgraphIdx = 0;
        const compiledSubgraphIds = [];
        for (const [layerName, layerNodes] of Object.entries(swimlanes)) {
            const subName = "lane_" + subgraphIdx;
            compiledSubgraphIds.push(subName);
            
            code += "    subgraph " + subName + " [\"" + layerName + "\"]\n";
            layerNodes.forEach(n => {
                if (n.shape === "diamond") code += "        " + n.id + "{\"" + n.label + "\"}\n";
                else if (n.shape === "round") code += "        " + n.id + "(\"" + n.label + "\")\n";
                else code += "        " + n.id + "[\"" + n.label + "\"]\n";
            });
            code += "    end\n\n";
            subgraphIdx++;
        }

        if (compiledSubgraphIds.length > 1) {
            code += "    %% --- FORCE INVISIBLE HORIZONTAL ALIGNMENT CONSTRAINTS (SIDE-BY-SIDE) ---\n";
            for (let i = 0; i < compiledSubgraphIds.length - 1; i++) {
                code += "    " + compiledSubgraphIds[i] + " ~~~ " + compiledSubgraphIds[i+1] + "\n";
            }
            code += "\n";
        }

        code += "    %% --- ENTERPRISE INTER-SWIMLANE CROSS-BOUNDARY PIPELINE CHANNELS ---\n";
        [...new Set(edges.map(e => JSON.stringify(e)))].map(s => JSON.parse(s)).forEach(e => {
            if (e.label) {
                code += e.type === "exception" ? "    " + e.from + " -. \"" + e.label + "\" .-> " + e.to + "\n" : "    " + e.from + " -- \" " + e.label + " \" --> " + e.to + "\n";
            } else {
                code += "    " + e.from + " --> " + e.to + "\n";
            }
        });
        console.log("💾 [4/4] Exporting generated architecture assets...");
        //const now = new Date();
        //const dateStamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        const now = new Date();

const dd = String(now.getDate()).padStart(2, '0');
const mm = String(now.getMonth() + 1).padStart(2, '0');
const yy = String(now.getFullYear()).slice(-2);

let hours12 = now.getHours() % 12;
hours12 = hours12 ? hours12 : 12; // convert 0 to 12
const hrsStr = String(hours12).padStart(2, '0');

const min = String(now.getMinutes()).padStart(2, '0');

const formattedDate = `${dd}-${mm}-${yy}_${hrsStr}_${min}`;

        const outputName = "6.swimlane_systems_architecture_map_" + formattedDate + ".md";

        let targetDir = __dirname.endsWith("commands") ? __dirname.replace("commands", "aiOutput") : path.join(__dirname, "aiOutput");
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        
        fs.writeFileSync(path.join(targetDir, outputName), "```mermaid\n" + code + "```", "utf8");
        console.log("🎉 COMPLETE! Process architecture flowchart written out to disk.\n📁 Target Path: " + path.join(targetDir, outputName));

    } catch (error) {
        console.error("❌ [CRITICAL FAILURE] Pipeline execution crashed:", error.message);
    }
}

// ============================================================================
// EXECUTION CALL INTERFACE (100% PURE SEPARATION):
// ============================================================================
let base = {
    a: 'app/utils/appflowgeneratorAI/aiOutput/baseline/1-Final-Objects-for-Quick Commerce (Q-Commerce)_and_(Hyperlocal Grocery Delivery_2026-10-03T18-42-31-031Z.txt',
    b: 'app/utils/appflowgeneratorAI/aiOutput/baseline/2.Final-Actors-for-Quick Commerce (Q-Commerce)_and_Hyperlocal Grocery Delivery_2026-10-03T19-22-16-404Z.txt',
    c: 'app/utils/appflowgeneratorAI/aiOutput/baseline/3.Final-End-to-End-Actor-Journeys-2026-10-03T20-54-21-571Z.txt'
};

generateDeterministicBusinessFlowchart(base.a, base.b, base.c);
