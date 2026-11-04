const { time } = require('console');

function analyzeBusinessProcess(
  businessObjects,
  actorAuthorizations,
  actorJourneys,
  mermaidMarkdown
) {
  const findings = [];

  // ----------------------------------------------------------
  // 1. Normalize inputs
  // ----------------------------------------------------------

  const parseIfJsonString = (value, name) => {
    if (typeof value !== "string") return value;

    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error(
        `${name} contains invalid JSON: ${error.message}`
      );
    }
  };

  businessObjects = parseIfJsonString(
    businessObjects,
    "businessObjects"
  );

  actorAuthorizations = parseIfJsonString(
    actorAuthorizations,
    "actorAuthorizations"
  );

  actorJourneys = parseIfJsonString(
    actorJourneys,
    "actorJourneys"
  );

  if (typeof mermaidMarkdown !== "string") {
    throw new Error("mermaidMarkdown must be a string.");
  }

  // ----------------------------------------------------------
  // 2. Shared helpers
  // ----------------------------------------------------------

  const normalize = value =>
    String(value ?? "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

  const getString = (record, aliases) => {
    if (!record || typeof record !== "object") return "";

    for (const key of aliases) {
      const value = record[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }

      if (
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        return String(value);
      }
    }

    return "";
  };

  const getStrings = (record, aliases) => {
    if (!record || typeof record !== "object") return [];

    const values = [];

    for (const key of aliases) {
      const value = record[key];

      if (typeof value === "string" && value.trim()) {
        values.push(value.trim());
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" && item.trim()) {
            values.push(item.trim());
          } else if (item && typeof item === "object") {
            const text =
              item.name ??
              item.label ??
              item.description ??
              item.value;

            if (typeof text === "string" && text.trim()) {
              values.push(text.trim());
            }
          }
        }
      }
    }

    return [...new Set(values)];
  };

  const walk = (value, callback, sourcePath = "$") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        walk(item, callback, `${sourcePath}[${index}]`)
      );
      return;
    }

    if (!value || typeof value !== "object") return;

    callback(value, sourcePath);

    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === "object") {
        walk(child, callback, `${sourcePath}.${key}`);
      }
    }
  };

  const addFinding = (
    code,
    severity,
    message,
    evidence = [],
    details = {}
  ) => {
    findings.push({
      code,
      severity,
      message,
      evidence,
      details
    });
  };

  // ----------------------------------------------------------
  // 3. Evidence graph
  // ----------------------------------------------------------

  const graph = {
    nodes: {},
    edges: []
  };

  const edgeIndex = new Map();

  const addNode = (
    id,
    type,
    label,
    source,
    evidence,
    attributes = {}
  ) => {
    if (!label) return null;

    if (!graph.nodes[id]) {
      graph.nodes[id] = {
        id,
        type,
        label,
        sources: [],
        evidence: [],
        attributes: {}
      };
    }

    const node = graph.nodes[id];

    if (source && !node.sources.includes(source)) {
      node.sources.push(source);
    }

    if (evidence && !node.evidence.includes(evidence)) {
      node.evidence.push(evidence);
    }

    Object.assign(node.attributes, attributes);

    return id;
  };

  const addEdge = (
    from,
    to,
    type,
    source,
    evidence
  ) => {
    if (!from || !to) return;

    const key = `${from}|${type}|${to}`;

    let edge = edgeIndex.get(key);

    if (!edge) {
      edge = {
        key,
        from,
        to,
        type,
        sources: [],
        evidence: []
      };

      edgeIndex.set(key, edge);
      graph.edges.push(edge);
    }

    if (source && !edge.sources.includes(source)) {
      edge.sources.push(source);
    }

    if (evidence && !edge.evidence.includes(evidence)) {
      edge.evidence.push(evidence);
    }
  };

  // ----------------------------------------------------------
  // 4. Business objects
  // ----------------------------------------------------------

  const objectNames = new Set();

  walk(businessObjects, (record, sourcePath) => {
    const name = getString(record, [
      "business_object",
      "businessObject",
      "businessObjectName",
      "business_object_name",
      "object_name",
      "objectName",
      "name"
    ]);

    if (!name) return;

    const normalizedName = normalize(name);
    const id = `object:${normalizedName}`;

    objectNames.add(normalizedName);

    addNode(
      id,
      "businessObject",
      name,
      "businessObjects",
      sourcePath
    );
  });

  // ----------------------------------------------------------
  // 5. Actors and authorization evidence
  // ----------------------------------------------------------

  const actorNames = new Set();

  walk(actorAuthorizations, (record, sourcePath) => {
    const actor = getString(record, [
      "actor",
      "actor_name",
      "actorName",
      "actor_role",
      "actorRole",
      "role",
      "role_name",
      "roleName",
      "participant"
    ]);

    if (!actor) return;

    const normalizedActor = normalize(actor);
    const actorId = `actor:${normalizedActor}`;

    actorNames.add(normalizedActor);

    addNode(
      actorId,
      "actor",
      actor,
      "actorAuthorizations",
      sourcePath
    );

    const responsibilities = getStrings(record, [
      "responsibility",
      "responsibilities",
      "actor_responsibility",
      "actorResponsibility"
    ]);

    for (const responsibility of responsibilities) {
      const responsibilityId = addNode(
        `responsibility:${normalizedActor}:${normalize(
          responsibility
        )}`,
        "responsibility",
        responsibility,
        "actorAuthorizations",
        sourcePath
      );

      addEdge(
        actorId,
        responsibilityId,
        "RESPONSIBLE_FOR",
        "actorAuthorizations",
        sourcePath
      );
    }

    const permissions = getStrings(record, [
      "permission",
      "permissions",
      "authorizedActions",
      "authorized_actions",
      "allowedActions",
      "allowed_actions",
      "authorization",
      "authorizations"
    ]);

    for (const permission of permissions) {
      const permissionId = addNode(
        `permission:${normalizedActor}:${normalize(
          permission
        )}`,
        "permission",
        permission,
        "actorAuthorizations",
        sourcePath
      );

      addEdge(
        actorId,
        permissionId,
        "HAS_PERMISSION",
        "actorAuthorizations",
        sourcePath
      );
    }
  });

  // ----------------------------------------------------------
  // 6. Actor journeys
  // ----------------------------------------------------------

  // ----------------------------------------------------------
  // 6. Actor journeys
  // ----------------------------------------------------------

  const journeyActions = [];

  actorJourneys.forEach((journey, journeyIndex) => {
    const actor = String(journey.actor_name ?? "").trim();

    const milestones = Array.isArray(
      journey.chronological_milestones_and_data_inputs
    )
      ? journey.chronological_milestones_and_data_inputs
      : [];

    milestones.forEach((milestone, milestoneIndex) => {
      const narrative = String(
        milestone.data_object_layer ?? ""
      ).trim();

      if (!narrative) return;

      const sourcePath =
        `$[${journeyIndex}].chronological_milestones_and_data_inputs[${milestoneIndex}]`;

      const step = String(milestone.step ?? "");

      const actionId =
        `journey-action:${normalize(actor)}:step:${normalize(step)}`;

      // Find declared business objects explicitly mentioned
      // in this milestone narrative.
      const mentionedObjects = Object.values(graph.nodes).filter(
        node =>
          node.type === "businessObject" &&
          normalize(narrative).includes(normalize(node.label))
      );

      const objectNamesForMilestone = [
        ...new Set(mentionedObjects.map(node => node.label))
      ];

      addNode(
        actionId,
        "journeyAction",
        narrative,
        "actorJourneys",
        sourcePath,
        {
          actor,
          step,
          narrative,
          businessObjects: objectNamesForMilestone
        }
      );

      journeyActions.push({
        id: actionId,
        action: narrative,
        actor,
        step,
        objects: objectNamesForMilestone,
        sourcePath
      });

      // Link journey action to its declared actor.
      if (actor) {
        const actorId = `actor:${normalize(actor)}`;

        if (actorNames.has(normalize(actor))) {
          addEdge(
            actorId,
            actionId,
            "PERFORMS",
            "actorJourneys",
            sourcePath
          );
        } else {
          addFinding(
            "UNDECLARED_JOURNEY_ACTOR",
            "REVIEW",
            `Journey actor '${actor}' is not declared in actor authorization data.`,
            [sourcePath],
            { actor, step }
          );
        }
      }

      // Link the journey action to each explicitly mentioned
      // business object.
      for (const objectNode of mentionedObjects) {
        addEdge(
          actionId,
          objectNode.id,
          "USES_OR_AFFECTS",
          "actorJourneys",
          sourcePath
        );
      }
    });
  });

  console.log("JOURNEY EXTRACTION CHECK:", {
    journeyCount: actorJourneys.length,
    journeyActions: journeyActions.length,
    firstJourneyAction: journeyActions[0] ?? null
  });

  // const journeyActions = [];

  // walk(actorJourneys, (record, sourcePath) => {
  //   const action = getString(record, [
  //     "actor_action",
  //     "actorAction",
  //     "system_activity",
  //     "systemActivity",
  //     "activity",
  //     "activity_name",
  //     "activityName",
  //     "milestone_description",
  //     "milestoneDescription",
  //     "action_description",
  //     "actionDescription",
  //     "description",
  //     "task"
  //   ]);

  //   if (!action) return;
  //   if (/^\d+(?:\.\d+)*$/.test(action.trim())) return;

  //   const actor = getString(record, [
  //     "actor",
  //     "actor_name",
  //     "actorName",
  //     "supporting_actor",
  //     "supportingActor",
  //     "role",
  //     "role_name",
  //     "roleName",
  //     "participant"
  //   ]);

  //   const object = getString(record, [
  //     "business_object",
  //     "businessObject",
  //     "business_object_name",
  //     "businessObjectName",
  //     "object_name",
  //     "objectName"
  //   ]);

  //   const outcome = getString(record, [
  //     "outcome",
  //     "expected_outcome",
  //     "expectedOutcome",
  //     "result"
  //   ]);

  //   const decision = getString(record, [
  //     "business_rule",
  //     "businessRule",
  //     "decision",
  //     "condition",
  //     "rule"
  //   ]);

  //   const actionId =
  //     `journey-action:${normalize(action)}:${sourcePath}`;

  //   addNode(
  //     actionId,
  //     "journeyAction",
  //     action,
  //     "actorJourneys",
  //     sourcePath,
  //     {
  //       actor,
  //       businessObject: object,
  //       outcome,
  //       decision
  //     }
  //   );

  //   journeyActions.push({
  //     id: actionId,
  //     action,
  //     actor,
  //     object,
  //     outcome,
  //     decision,
  //     sourcePath
  //   });

  //   if (actor) {
  //     const actorId = `actor:${normalize(actor)}`;

  //     addNode(
  //       actorId,
  //       "actor",
  //       actor,
  //       "actorJourneys",
  //       sourcePath
  //     );

  //     addEdge(
  //       actorId,
  //       actionId,
  //       "PERFORMS",
  //       "actorJourneys",
  //       sourcePath
  //     );

  //     if (!actorNames.has(normalize(actor))) {
  //       addFinding(
  //         "UNDECLARED_JOURNEY_ACTOR",
  //         "REVIEW",
  //         `Journey references actor '${actor}', which was not found in actor authorization data.`,
  //         [sourcePath],
  //         { actor }
  //       );
  //     }
  //   }

  //   if (object) {
  //     const normalizedObject = normalize(object);
  //     const objectId = `object:${normalizedObject}`;

  //     addNode(
  //       objectId,
  //       "businessObject",
  //       object,
  //       "actorJourneys",
  //       sourcePath
  //     );

  //     addEdge(
  //       actionId,
  //       objectId,
  //       "USES_OR_AFFECTS",
  //       "actorJourneys",
  //       sourcePath
  //     );

  //     if (!objectNames.has(normalizedObject)) {
  //       addFinding(
  //         "UNDECLARED_BUSINESS_OBJECT",
  //         "REVIEW",
  //         `Journey references business object '${object}', but it was not found in the declared business-object input.`,
  //         [sourcePath],
  //         { businessObject: object }
  //       );
  //     }
  //   }

  //   if (!outcome) {
  //     addFinding(
  //       "JOURNEY_ACTION_WITHOUT_OUTCOME",
  //       "REVIEW",
  //       `Journey action '${action}' has no explicitly recognized outcome.`,
  //       [sourcePath],
  //       { action, actor, object }
  //     );
  //   }
  // });

  // ----------------------------------------------------------
  // 7. Parse Mermaid nodes, lanes and transitions
  // ----------------------------------------------------------

  const mermaidLines = mermaidMarkdown
    .split(/\r?\n/)
    .map(line => line.replace(/%%.*$/, "").trim())
    .filter(Boolean);

  const mermaidNodes = new Map();
  const mermaidEdges = [];
  const lanes = [];

  let currentLane = null;

  const simpleEdgeRegex =
    /([A-Za-z_][\w-]*)\s*(-->|==>|-\.->|---)\s*([A-Za-z_][\w-]*)/g;

  const labeledEdgeRegex =
    /([A-Za-z_][\w-]*)\s*(--|-\.)\s*(?:"([^"]*)"|'([^']*)'|\|([^|]*)\|)\s*(-->|\.->|==>)\s*([A-Za-z_][\w-]*)/g;

  const addParsedEdge = (
    from,
    to,
    label,
    operator,
    line
  ) => {
    const normalizedLabel = (label || "").trim();

    const duplicate = mermaidEdges.some(
      edge =>
        edge.from === from &&
        edge.to === to &&
        edge.label === normalizedLabel &&
        edge.operator === operator &&
        edge.line === line
    );

    if (duplicate) return;

    mermaidEdges.push({
      from,
      to,
      label: normalizedLabel,
      operator,
      line
    });
  };

  for (const line of mermaidLines) {
    const subgraph = line.match(
      /^subgraph\s+([A-Za-z_][\w-]*)(?:\s*\[(.+?)\])?\s*$/
    );

    if (subgraph) {
      currentLane = (
        subgraph[2] || subgraph[1]
      )
        .replace(/^["']|["']$/g, "")
        .trim();

      lanes.push(currentLane);
      continue;
    }

    if (/^end\s*$/.test(line)) {
      currentLane = null;
      continue;
    }

    let match;

    // Parse labeled edges first.
    labeledEdgeRegex.lastIndex = 0;

    while (
      (match = labeledEdgeRegex.exec(line)) !== null
    ) {
      addParsedEdge(
        match[1],
        match[7],
        match[3] ?? match[4] ?? match[5] ?? "",
        `${match[2]} ${match[6]}`,
        line
      );
    }

    // Parse plain edges.
    simpleEdgeRegex.lastIndex = 0;

    while (
      (match = simpleEdgeRegex.exec(line)) !== null
    ) {
      addParsedEdge(
        match[1],
        match[3],
        "",
        match[2],
        line
      );
    }

    // Parse quoted node declarations.
    // Supports labels containing square brackets.
    const quotedNodeRegex =
      /([A-Za-z_][\w-]*)\s*(\[\[|\[\(|\(\(|\{|\[|\()(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')(\]\]|\]\)|\)\)|\}|\]|\))/g;

    quotedNodeRegex.lastIndex = 0;

    while (
      (match = quotedNodeRegex.exec(line)) !== null
    ) {
      const id = match[1];
      const openingShape = match[2];
      const closingShape = match[5];

      const expectedClosers = {
        "[[": "]]",
        "[(": "])",
        "((": "))",
        "{": "}",
        "[": "]",
        "(": ")"
      };

      if (expectedClosers[openingShape] !== closingShape) {
        continue;
      }

      const label = (
        match[3] ?? match[4] ?? id
      )
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .trim();

      mermaidNodes.set(id, {
        id,
        label,
        lane: currentLane,
        line
      });
    }
  }

  // Add parsed Mermaid nodes to the evidence graph.
  const declaredNodeIds = new Set(mermaidNodes.keys());

  for (const node of mermaidNodes.values()) {
    const nodeId = `mermaid:${node.id}`;

    addNode(
      nodeId,
      "mermaidNode",
      node.label,
      "mermaid",
      node.line,
      {
        mermaidId: node.id,
        lane: node.lane
      }
    );

    if (node.lane) {
      const laneId = `lane:${normalize(node.lane)}`;

      addNode(
        laneId,
        "swimlane",
        node.lane,
        "mermaid",
        node.line
      );

      addEdge(
        laneId,
        nodeId,
        "CONTAINS",
        "mermaid",
        node.line
      );
    }
  }

  // Validate transition endpoints.
  for (const edge of mermaidEdges) {
    for (const id of [edge.from, edge.to]) {
      if (!declaredNodeIds.has(id)) {
        addFinding(
          "UNDECLARED_MERMAID_TARGET",
          "ERROR",
          `Mermaid transition references '${id}', but no node declaration was parsed for it.`,
          [edge.line],
          { nodeId: id }
        );
      }
    }

    addEdge(
      `mermaid:${edge.from}`,
      `mermaid:${edge.to}`,
      "TRANSITIONS_TO",
      "mermaid",
      edge.line
    );
  }

  // ----------------------------------------------------------
  // 8. Structural flow checks
  // ----------------------------------------------------------

  const incoming = new Set(
    mermaidEdges.map(edge => edge.to)
  );

  const outgoing = new Set(
    mermaidEdges.map(edge => edge.from)
  );

  for (const node of mermaidNodes.values()) {
    if (
      !incoming.has(node.id) &&
      !outgoing.has(node.id)
    ) {
      addFinding(
        "ISOLATED_MERMAID_NODE",
        "REVIEW",
        `Mermaid node '${node.label}' has no parsed incoming or outgoing transition.`,
        [node.line],
        { nodeId: node.id }
      );
    }
  }

  // Count connected components using actual parsed transitions.
  const adjacency = new Map();

  for (const id of declaredNodeIds) {
    adjacency.set(id, new Set());
  }

  for (const edge of mermaidEdges) {
    if (
      !adjacency.has(edge.from) ||
      !adjacency.has(edge.to)
    ) {
      continue;
    }

    adjacency.get(edge.from).add(edge.to);
    adjacency.get(edge.to).add(edge.from);
  }

  const visited = new Set();
  let componentCount = 0;

  for (const id of declaredNodeIds) {
    if (visited.has(id)) continue;

    componentCount++;

    const stack = [id];

    while (stack.length) {
      const current = stack.pop();

      if (visited.has(current)) continue;

      visited.add(current);

      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          stack.push(neighbor);
        }
      }
    }
  }

  if (componentCount > 1) {
    addFinding(
      "DISCONNECTED_FLOW_COMPONENTS",
      "REVIEW",
      `Mermaid has ${componentCount} disconnected components. Confirm whether these are intentional separate flows.`,
      [],
      { componentCount }
    );
  }

  // ----------------------------------------------------------
  // 9. Match journey actions to Mermaid nodes
  // ----------------------------------------------------------

  const tokenSet = value =>
    new Set(
      normalize(value)
        .split(" ")
        .filter(token => token.length > 2)
    );

  const similarity = (left, right) => {
    const a = tokenSet(left);
    const b = tokenSet(right);

    if (!a.size || !b.size) return 0;

    const intersection = [...a].filter(
      token => b.has(token)
    ).length;

    const union = new Set([...a, ...b]).size;

    return intersection / union;
  };

  for (const journey of journeyActions) {
    let bestMatch = null;
    let bestScore = 0;

    for (const node of mermaidNodes.values()) {
      const score = similarity(
        journey.action,
        node.label
      );

      if (score > bestScore) {
        bestScore = score;
        bestMatch = node;
      }
    }

    if (!bestMatch || bestScore < 0.45) {
      addFinding(
        "JOURNEY_ACTION_NOT_MATCHED_TO_SWIMLANE",
        "REVIEW",
        `Journey action '${journey.action}' has no sufficiently similar Mermaid node.`,
        [journey.sourcePath],
        {
          action: journey.action,
          closestNode: bestMatch?.label ?? null,
          similarity: Number(bestScore.toFixed(2))
        }
      );
    }else {
  addEdge(
    journey.id,
    `mermaid:${bestMatch.id}`,
    "CORRESPONDS_TO",
    "crossSourceMatch",
    `${journey.sourcePath} -> ${bestMatch.line}`
  );
}
  }

  // ----------------------------------------------------------
  // 10. Review unclassified swimlanes
  // ----------------------------------------------------------

  const uniqueLanes = [...new Set(lanes)];

  const systemOrControlLane =
    /\b(system|control|operations|operation|platform|automation|service|engine|hub)\b/i;

  for (const lane of uniqueLanes) {
    if (actorNames.has(normalize(lane))) continue;
    if (systemOrControlLane.test(lane)) continue;

    addFinding(
      "UNCLASSIFIED_SWIMLANE",
      "REVIEW",
      `Swimlane '${lane}' does not exactly match a declared actor. Confirm whether it represents a human actor, system, control, or organizational lane.`,
      [`subgraph:${lane}`],
      { lane }
    );
  }

  // ----------------------------------------------------------
  // 11. Return results
  // ----------------------------------------------------------

  const errorCount = findings.filter(
    item => item.severity === "ERROR"
  ).length;

  const reviewCount = findings.filter(
    item => item.severity === "REVIEW"
  ).length;

  return {
    status: errorCount
      ? "ERRORS_FOUND"
      : findings.length
        ? "REVIEW_REQUIRED"
        : "NO_FINDINGS",

    summary: {
      businessObjectDeclarations: objectNames.size,
      declaredActors: actorNames.size,
      journeyActions: journeyActions.length,
      mermaidNodes: mermaidNodes.size,
      mermaidTransitions: mermaidEdges.length,
      graphNodes: Object.keys(graph.nodes).length,
      graphEdges: graph.edges.length,
      totalFindings: findings.length,
      errors: errorCount,
      reviews: reviewCount
    },

    evidenceGraph: graph,
    findings
  };
}
loadclean()
function loadclean()
{
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
function resolveLatestStageFile(directory, prefixPattern) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  const matchedFiles = files.filter(f => f.startsWith(prefixPattern));
  if (matchedFiles.length === 0) return null;

  matchedFiles.sort((a, b) => fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs);
  return path.join(directory, matchedFiles[0]);
}

let CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX: '8.6.3.Final-System-Architecture-Blueprint-Graph-'
  },
  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: "1-Final-Objects-",
    STAGE_2_ACTORS: "2.Final-Actors-",
    STAGE_3_JOURNEYS: "3.Final-End-to-End-Actor-Journeys-",
   // STAGE_4_TOPOLOGY: "6.swimlane_systems_architecture_map_14-10-26_04_09", 
    STAGE_4_TOPOLOGY:"8.6.3.Final.mermaid-diagram-20-10-26_11_54.md",
    FILE_EXTENSION: ".txt"
  }
}

const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
const objectsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS);
const actorsFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS);
const journeysFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS);
const topologyFilePath = resolveLatestStageFile(OUTPUT_DIR, CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY);

// Replace these paths and variable names with your actual files.
const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
const actorsMatrixContent = fs.readFileSync(actorsFilePath, 'utf8');
const journeysMatrixContent = fs.readFileSync(journeysFilePath, 'utf8');
const topologyGraphContent = fs.readFileSync(topologyFilePath, 'utf8');


const cleanJsonArray1 = JSON.parse(objectsMatrixContent.slice(objectsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray2 = JSON.parse(actorsMatrixContent.slice(actorsMatrixContent.lastIndexOf('===') + 3).trim());
const cleanJsonArray3 = JSON.parse(JSON.stringify(journeysMatrixContent.slice(journeysMatrixContent.lastIndexOf('===') + 3).trim()), null, 2) ;


const businessObjects = cleanJsonArray1

const actorAuthorizations = cleanJsonArray2

const actorJourneys = cleanJsonArray3

const mermaidMarkdown = topologyGraphContent


const parsedActorJourneys =
  typeof actorJourneys === "string"
    ? JSON.parse(actorJourneys)
    : actorJourneys;

console.log("INPUT SHAPE CHECK:", {
  businessObjectsIsArray: Array.isArray(businessObjects),
  actorAuthorizationsIsArray: Array.isArray(actorAuthorizations),
  actorJourneysIsArray: Array.isArray(parsedActorJourneys),
  journeyCount: Array.isArray(parsedActorJourneys)
    ? parsedActorJourneys.length
    : null,
  firstJourneyKeys: Object.keys(parsedActorJourneys?.[0] ?? {}),
  firstMilestone:
    parsedActorJourneys?.[0]
      ?.chronological_milestones_and_data_inputs?.[0]
});


// console.log("VALIDATOR FUNCTION ENTRY:", {
//   businessObjectsIsArray: Array.isArray(businessObjects),
//   actorAuthorizationsIsArray: Array.isArray(actorAuthorizations),
//   actorJourneysIsArray: Array.isArray(parsedActorJourneys),
//   mermaidMarkdownType: typeof mermaidMarkdown
// });
const result = analyzeBusinessProcess(
  businessObjects,
  actorAuthorizations,
  parsedActorJourneys,
  mermaidMarkdown
);

// console.log("Business process analysis:", result.status);
// console.table(result.summary);

// console.log("\nFindings:");
// console.dir(result.findings, { depth: null });

fs.writeFileSync(
  path.join(OUTPUT_DIR.replace("/baseline",""), "business-process-evidence-graph"+getdates()+".json"),
  JSON.stringify(result.evidenceGraph, null, 2),
  "utf8"
);

fs.writeFileSync(
  path.join(OUTPUT_DIR.replace("/baseline",""), "business-process-findings"+getdates()+".json"),
  JSON.stringify(
    {
      status: result.status,
      summary: result.summary,
      findings: result.findings
    },
    null,
    2
  ),
  "utf8"
);
//console.log(JSON.stringify(result, null, 2));



}

function getdates()
{
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
return timestamp
}

