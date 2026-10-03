function generateMermaidFromActorJourneys(actorJourneys) {
  if (!Array.isArray(actorJourneys)) {
    throw new TypeError("Expected actorJourneys to be an array.");
  }

  const lines = [
    "```mermaid",
    "flowchart TD"
  ];

  const sanitizeId = (value) =>
    String(value || "")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 80);

  const escapeMermaidText = (value) =>
    String(value || "")
      .replace(/"/g, "'")
      .replace(/\r?\n/g, " ")
      .replace(/\[/g, "(")
      .replace(/\]/g, ")")
      .trim();

  actorJourneys.forEach((actor, actorIndex) => {

    const actorName =
      actor.actor_name || `Actor ${actorIndex + 1}`;

    const actorId =
      `ACTOR_${actorIndex + 1}_${sanitizeId(actorName)}`;

    const milestones =
      Array.isArray(actor.chronological_milestones_and_data_inputs)
        ? actor.chronological_milestones_and_data_inputs
        : [];

    lines.push(
      `    subgraph ${actorId}["${escapeMermaidText(actorName)}"]`
    );

    // Force vertical direction INSIDE this actor
    lines.push("        direction TB");

    const stepIds = [];

    milestones.forEach((milestone, index) => {

      const stepNumber =
        milestone.step || String(index + 1);

      const stepId =
        `${actorId}_STEP_${index + 1}`;

      const description =
        milestone.data_object_layer ||
        `Step ${stepNumber}`;

      const label =
        `Step ${stepNumber}: ${escapeMermaidText(description)}`;

      lines.push(
        `        ${stepId}["${label}"]`
      );

      stepIds.push(stepId);
    });

    // Chronological sequence only
    for (let i = 0; i < stepIds.length - 1; i++) {
      lines.push(
        `        ${stepIds[i]} --> ${stepIds[i + 1]}`
      );
    }

    lines.push("    end");
  });

  lines.push("```");

  return lines.join("\n");
}
const fs = require('fs');
const path = require('path');
const PROJECT_ROOT = path.resolve(__dirname, '../../../../');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'app/utils/appflowgeneratorAI/aiOutput');
const objectsFilePath = path.join(OUTPUT_DIR, '3.Final-End-to-End-Actor-Journeys-2026-10-03T20-54-21-571Z.txt');
const objectsMatrixContent = fs.readFileSync(objectsFilePath, 'utf8');
console.log(objectsMatrixContent.split('=== E2E ACTOR TRANSACTION JOURNEYS ===')[1].trim());
let its=objectsMatrixContent.split('=== E2E ACTOR TRANSACTION JOURNEYS ===')[1].trim()

const mermaidMarkdown = generateMermaidFromActorJourneys(
  JSON.parse(its)
);

console.log(mermaidMarkdown);