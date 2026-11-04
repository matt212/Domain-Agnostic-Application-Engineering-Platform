


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

            // Hierarchical sub-step assignment definitions (.1, .2, .3) based off parent stepIndexStr
            const altStepStr = stepIndexStr + ".1";
            const faultStepStr = stepIndexStr + ".2";
            const rollbackStepStr = stepIndexStr + ".3";

            nodes.set(gateId, { id: gateId, label: "Step " + stepIndexStr + " Gate: Is " + entityName + " State Valid?", shape: "diamond", layer: laneOwner });
            edges.push({ from: nodeId, to: gateId, type: "linear" });

            nodes.set(alternativeId, { id: alternativeId, label: "🔄 [Step " + altStepStr + " Alternate] Apply Cached Profile Defaults", shape: "square", layer: laneOwner });
            edges.push({ from: gateId, to: alternativeId, type: "linear", label: "On Alternate Hit" });

            nodes.set(alertId, { id: alertId, label: "⚠️ [Step " + faultStepStr + " Fault Isolation] Trigger " + entityName + " Auto-Remediation Loop", shape: "round", layer: "OPERATIONS CONTROL" });
            edges.push({ from: gateId, to: alertId, type: "exception", label: "Soft Fail: State Discrepancy" });
            edges.push({ from: alertId, to: nodeId, type: "exception", label: "Retry Event Loop" });

            let financeLane = "OPERATIONS CONTROL";
            for (const actor of activeActors) {
            if (actor.toLowerCase().includes("finance") || actor.toLowerCase().includes("billing") || actor.toLowerCase().includes("agent")) {
            financeLane = actor;
            break;
            }
            }

            nodes.set(rejectId, { id: rejectId, label: "🛑 [Step " + rollbackStepStr + " Rollback] Reverse System Allocation State", shape: "round", layer: financeLane });

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
