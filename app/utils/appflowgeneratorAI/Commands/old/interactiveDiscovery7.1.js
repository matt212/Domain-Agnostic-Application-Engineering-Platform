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

  
  

  
  // ----------------------------------------------------------
  // 9. Match journey actions to Mermaid nodes
  // ----------------------------------------------------------

  // These are generic language indicators, not domain-specific
  // business activities or an expected-activity checklist.
  
  // ----------------------------------------------------------
  // 9. Match journey actions to Mermaid nodes
  // ----------------------------------------------------------

  const EXCEPTION_TERMS = [
    "fail",
    "failure",
    "exception",
    "error",
    "reject",
    "retry",
    "rollback",
    "recover",
    "compensat",
    "remediat",
    "discrepancy",
    "fault",
    "reverse",
    "reversal"
  ];

  const isExceptionActivity = value => {
    const normalized = normalize(value);
    return EXCEPTION_TERMS.some(term =>
      normalized.includes(term)
    );
  };

  const tokenSet = value =>
    new Set(
      normalize(value)
        .split(" ")
        .filter(token => token.length > 2)
    );

  // Similarity combines coverage of the shorter description
  // with Jaccard similarity. It is a ranking signal, not proof.
  const similarity = (left, right) => {
    const a = tokenSet(left);
    const b = tokenSet(right);

    if (!a.size || !b.size) return 0;

    const intersection = [...a].filter(
      token => b.has(token)
    ).length;

    const union = new Set([...a, ...b]).size;
    const jaccard = intersection / union;
    const overlap = intersection / Math.min(a.size, b.size);

    return (0.6 * overlap) + (0.4 * jaccard);
  };

  // Explicit object overlap is supporting evidence only.
  // It must never independently establish an activity match.
  const getExplicitObjectOverlap = (
    clause,
    nodeLabel,
    journeyObjects = []
  ) => {
    const clauseText = ` ${normalize(clause)} `;
    const nodeText = ` ${normalize(nodeLabel)} `;

    const candidateObjects = new Set([
      ...objectNames,
      ...(Array.isArray(journeyObjects)
        ? journeyObjects.map(normalize)
        : [])
    ]);

    for (const objectName of candidateObjects) {
      if (!objectName || objectName.length < 3) continue;

      const normalizedObject = ` ${normalize(objectName)} `;

      if (
        clauseText.includes(normalizedObject) &&
        nodeText.includes(normalizedObject)
      ) {
        return normalize(objectName);
      }
    }

    return null;
  };

  // These are conservative starting thresholds, not universal
  // rules for every business domain.
  const MIN_TEXT_SCORE = 0.55;
  const MIN_TEXT_SCORE_WITH_OBJECT_OVERLAP = 0.40;
  const MIN_DIAGNOSTIC_SCORE = 0.20;
  const AMBIGUITY_GAP = 0.08;

  // Preserve clause-level evidence while retaining the original
  // milestone context in every finding.
  const splitJourneyClauses = action =>
    String(action ?? "")
      .split(/[;\n]+/)
      .map(clause => clause.trim())
      .filter(Boolean);

  for (const journey of journeyActions) {
    const clauses = splitJourneyClauses(journey.action);

    for (const clause of clauses) {
      const journeyIsException = isExceptionActivity(clause);
      const candidates = [];

      for (const node of mermaidNodes.values()) {
        const nodeIsException = isExceptionActivity(node.label);

        // Do not match ordinary activities to exception/recovery
        // nodes based on incidental word overlap.
        if (nodeIsException && !journeyIsException) {
          continue;
        }

        const textScore = similarity(clause, node.label);

        const objectOverlap = getExplicitObjectOverlap(
          clause,
          node.label,
          journey.objects
        );

        // IMPORTANT:
        // journey.actor describes the parent journey, not
        // necessarily the actor responsible for this clause.
        // Therefore, do not use it to award a lane-match bonus.

        const acceptedByText =
          textScore >= MIN_TEXT_SCORE;

        const acceptedByObjectAndText =
          Boolean(objectOverlap) &&
          textScore >= MIN_TEXT_SCORE_WITH_OBJECT_OVERLAP;

        candidates.push({
          node,
          textScore,
          objectOverlap,
          eligible:
            acceptedByText || acceptedByObjectAndText
        });
      }

      // Rank primarily by textual evidence. Object overlap is
      // only a tie-breaker and supporting evidence.
      candidates.sort(
        (a, b) =>
          b.textScore - a.textScore ||
          Number(Boolean(b.objectOverlap)) -
            Number(Boolean(a.objectOverlap))
      );

      const eligibleCandidates = candidates.filter(
        candidate => candidate.eligible
      );

      const bestCandidate = eligibleCandidates[0] ?? null;
      const secondCandidate = eligibleCandidates[1] ?? null;

      // A diagnostic candidate is exposed only when it has at
      // least some textual relevance or explicit object overlap.
      // It is never treated as a confirmed correspondence.
      const bestDiagnostic =
        candidates.find(
          candidate =>
            candidate.textScore >= MIN_DIAGNOSTIC_SCORE ||
            Boolean(candidate.objectOverlap)
        ) ?? null;

      const sharedFindingDetails = {
        action: journey.action,
        clause,
        actor: journey.actor || null,
        step: journey.step,
        milestoneContext: journey.action,
        sourcePath: journey.sourcePath,
        businessObjects: journey.objects || [],
        siblingClauses: clauses.filter(
          sibling => sibling !== clause
        )
      };

      // No candidate meets the evidence threshold.
      // This means correspondence is unresolved, not that the
      // business activity is missing from the process.
      if (!bestCandidate) {
        addFinding(
          "UNRESOLVED_JOURNEY_CLAUSE_CORRESPONDENCE",
          "REVIEW",
          `No Mermaid node could be linked confidently to journey clause '${clause}'. This is an unresolved correspondence, not proof that a business activity is missing.`,
          [journey.sourcePath],
          {
            ...sharedFindingDetails,
            candidateStatus: "UNRESOLVED",

            closestCandidate: bestDiagnostic
              ? {
                  nodeId: bestDiagnostic.node.id,
                  nodeLabel: bestDiagnostic.node.label,
                  textSimilarity: Number(
                    bestDiagnostic.textScore.toFixed(3)
                  ),
                  explicitObjectOverlap:
                    bestDiagnostic.objectOverlap,
                  diagnosticOnly: true
                }
              : null,

            interpretation:
              "The available evidence did not establish a sufficiently strong correspondence. Human review is required.",

            possibleGap: false,
            missingActivityConfirmed: false
          }
        );

        continue;
      }

      // If the top two candidates have similar text scores,
      // preserve the ambiguity instead of choosing arbitrarily.
      const isAmbiguous =
        Boolean(secondCandidate) &&
        Math.abs(
          bestCandidate.textScore -
            secondCandidate.textScore
        ) < AMBIGUITY_GAP;

      if (isAmbiguous) {
        addFinding(
          "AMBIGUOUS_JOURNEY_TO_MERMAID_MATCH",
          "REVIEW",
          `Journey clause '${clause}' has multiple similarly scored Mermaid candidates. Confirm which node, if any, represents this activity.`,
          [journey.sourcePath],
          {
            ...sharedFindingDetails,
            candidateStatus: "AMBIGUOUS",

            candidates: eligibleCandidates
              .slice(0, 3)
              .map(candidate => ({
                nodeId: candidate.node.id,
                nodeLabel: candidate.node.label,
                textSimilarity: Number(
                  candidate.textScore.toFixed(3)
                ),
                explicitObjectOverlap:
                  candidate.objectOverlap
              })),

            interpretation:
              "More than one Mermaid node meets the matching threshold, and the available textual evidence does not distinguish them confidently.",

            possibleGap: false,
            missingActivityConfirmed: false
          }
        );

        continue;
      }

      // Record a candidate relationship only after it passes
      // the evidence checks. This is not proof of equivalence.
      addEdge(
        journey.id,
        `mermaid:${bestCandidate.node.id}`,
        "CANDIDATE_CORRESPONDS_TO",
        "journeyToMermaidMatching",
        journey.sourcePath
      );

      // Preserve the matching rationale for downstream review.
      const journeyGraphNode = graph.nodes[journey.id];

      if (journeyGraphNode) {
        if (
          !Array.isArray(
            journeyGraphNode.attributes.matchCandidates
          )
        ) {
          journeyGraphNode.attributes.matchCandidates = [];
        }

        journeyGraphNode.attributes.matchCandidates.push({
          clause,
          mermaidNodeId: bestCandidate.node.id,
          mermaidNodeLabel: bestCandidate.node.label,

          textSimilarity: Number(
            bestCandidate.textScore.toFixed(3)
          ),

          explicitObjectOverlap:
            bestCandidate.objectOverlap,

          matchingBasis: bestCandidate.objectOverlap
            ? "TEXT_AND_EXPLICIT_OBJECT_OVERLAP"
            : "TEXT_SIMILARITY",

          relationshipStatus: "CANDIDATE",
          equivalenceConfirmed: false
        });
      }
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

