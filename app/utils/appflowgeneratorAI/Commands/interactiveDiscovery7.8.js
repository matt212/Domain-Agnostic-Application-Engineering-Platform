'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const readline = require('readline');

let CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR:
      'app/utils/appflowgeneratorAI/aiOutput/baseline/',
    TMP_RELATIVE_DIR:
      'app/utils/appflowgeneratorAI/promptFile',
    EXPORT_PREFIX:
      '7.8 Actors_Roles_Resonsibility_Authorization'
  },

  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',
    // IDENTIFIER: 'unsloth/Qwen3.5-MTP-GGUF',
    NGL: '0',
    MAX_TOKENS: '12288',
    BATCH_SIZE: '12288',
    THREADS: '8',
    REASONING_MODE: 'off'
  },

  SCANNING_PATTERNS: {
    STAGE_1_OBJECTS: '7.6 Business Objects.24-10-26_06:41pm.md',
    STAGE_2_ACTORS: '7.7 Actors_Roles_Resonsibility_Authorization.26-10-26_06:06pm.md',
    STAGE_3_JOURNEYS: '3.Final-End-to-End-Actor-Journeys-',
    STAGE_4_TOPOLOGY: '8.6.3.Final.mermaid-diagram-20-10-26_11_54.md',
    FILE_EXTENSION: '.txt'
  }
};

const OUTPUT_DIR = path.join(
  CONFIG.PATHS.PROJECT_ROOT,
  CONFIG.PATHS.OUTPUT_RELATIVE_DIR
);

const TMP_DIR = path.join(
  CONFIG.PATHS.PROJECT_ROOT,
  CONFIG.PATHS.TMP_RELATIVE_DIR
);

const FINAL_OUTPUT_DIR = OUTPUT_DIR.replace(
  /baseline[\/\\]?$/,
  ''
);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(FINAL_OUTPUT_DIR, { recursive: true });
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (question) =>
  new Promise((resolve) => rl.question(question, resolve));

function makeTimestamp(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';

  hours = hours % 12 || 12;

  return `${day}-${month}-${year}_${String(hours).padStart(2, '0')}:${minutes}${ampm}`;
}

function safeFilePart(value) {
  return String(value || 'output')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'output';
}

function resolveLatestStageFile(directory, pattern) {
  if (!fs.existsSync(directory)) {
    return null;
  }

  const matches = fs.readdirSync(directory)
    .filter((name) => {
      const fullPath = path.join(directory, name);

      return (
        fs.statSync(fullPath).isFile() &&
        name.includes(pattern)
      );
    })
    .sort((a, b) => {
      const aPath = path.join(directory, a);
      const bPath = path.join(directory, b);

      return (
        fs.statSync(bPath).mtimeMs -
        fs.statSync(aPath).mtimeMs
      );
    });

  return matches.length
    ? path.join(directory, matches[0])
    : null;
}

function readRequiredFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Missing required source file: ${label}`);
  }

  return fs.readFileSync(filePath, 'utf8');
}
const objectsFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS
);

const actorsFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS
);

const journeysFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_3_JOURNEYS
);

const topologyFilePath = resolveLatestStageFile(
  OUTPUT_DIR,
  CONFIG.SCANNING_PATTERNS.STAGE_4_TOPOLOGY
);

if (
  !objectsFilePath ||
  !actorsFilePath ||
  !journeysFilePath ||
  !topologyFilePath
) {
  throw new Error(
    'Could not locate all four required source files in: ' +
    OUTPUT_DIR
  );
}

console.log('\n📂 Reading Input 1:', path.basename(objectsFilePath));
console.log('📂 Reading Input 2:', path.basename(actorsFilePath));
console.log('📂 Reading Input 3:', path.basename(journeysFilePath));
console.log('📂 Reading Input 4:', path.basename(topologyFilePath));

const objectsMatrixContent = readRequiredFile(
  objectsFilePath,
  'Business Objects'
);

const actorsMatrixContent = readRequiredFile(
  actorsFilePath,
  'Actors'
);

const journeysMatrixContent = readRequiredFile(
  journeysFilePath,
  'Actor Journeys'
);

const topologyContent = readRequiredFile(
  topologyFilePath,
  'Mermaid Topology'
);

// This helper must match the actual structure of your Stage 1 file.
// If it is already defined in your existing project, reuse that definition.
const cleanJsonArray1 =
  extractDomain_Niche_Main_Content(objectsMatrixContent);

const base = {
  domain: cleanJsonArray1.primarydataset.domain,
  niche: cleanJsonArray1.primarydataset.niche,
  business_obj: cleanJsonArray1.mainContent,
  actors: actorsMatrixContent,
  // journeys: journeysMatrixContent,
  // topology: topologyContent
};

console.log('\nDomain:', base.domain);
console.log('Niche:', base.niche);

function buildPrimaryPrompt(base) {
  return `
DOMAIN — REFERENCE ONLY:
${base.domain}

NICHE — REFERENCE ONLY:
${base.niche}

BUSINESS OBJECTS — REFERENCE ONLY:
${JSON.stringify(base.business_obj, null, 2)}

CURRENT ACTOR RESPONSIBILITIES TO REVISE:
${base.actors}

TASK:
Revise ONLY the Actor Responsibilities section according to the user's
subsequent revision instructions.

Do not modify Domain, Niche, or Business Objects.
Do not generate a new initial response.
`;
}
function normalizeModelOutput(raw) {
  let output = String(raw ?? '').trim();

  const assistantMarker = output.lastIndexOf('Assistant:\n');

  if (assistantMarker >= 0) {
    output = output
      .slice(assistantMarker + 'Assistant:\n'.length)
      .trim();
  }

  output = output
    .replace(/^```(?:json|markdown|md|text)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  return output;
}

function callLlamaCli(promptText, taskName) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(TMP_DIR, { recursive: true });

    const suffix = `${process.pid}-${Date.now()}`;
    const safeTask = safeFilePart(taskName);

    const promptFile = path.join(
      TMP_DIR,
      `tmp_${safeTask}_${suffix}_prompt.txt`
    );

    const outputFile = path.join(
      TMP_DIR,
      `tmp_${safeTask}_${suffix}_output.txt`
    );

    fs.writeFileSync(promptFile, promptText, 'utf8');

    const args = [
      '-hf', CONFIG.MODEL.IDENTIFIER,
      '-ngl', CONFIG.MODEL.NGL,
      '--single-turn',
      '--reasoning', CONFIG.MODEL.REASONING_MODE,
      '-t', CONFIG.MODEL.THREADS,
      '-b', CONFIG.MODEL.BATCH_SIZE,
      '-f', promptFile,
      '-n', CONFIG.MODEL.MAX_TOKENS,
      '-o', outputFile
    ];

    console.log(`\n🤖 Running Qwen: ${taskName}`);

    execFile(
      CONFIG.MODEL.EXEC_BINARY,
      args,
      { maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        try {
          if (error) {
            reject(new Error(
              `llama-cli failed for ${taskName}:\n` +
              `${error.message}\n${stderr || ''}`
            ));
            return;
          }

          if (!fs.existsSync(outputFile)) {
            throw new Error(
              `llama-cli did not create output for ${taskName}.`
            );
          }

          const output = normalizeModelOutput(
            fs.readFileSync(outputFile, 'utf8')
          );

          if (!output) {
            throw new Error(`Empty model output for ${taskName}.`);
          }

          resolve(output);
        } catch (err) {
          reject(err);
        } finally {
          for (const file of [promptFile, outputFile]) {
            try {
              if (fs.existsSync(file)) {
                fs.unlinkSync(file);
              }
            } catch (_) {
              // Temporary-file cleanup should not hide the main result.
            }
          }
        }
      }
    );
  });
}
//BUSINESS OBJECTS:
//${JSON.stringify(base.business_obj, null, 2)}

function buildReviewContent(base) {
  return `
DOMAIN:
${base.domain}

NICHE:
${base.niche}


ACTOR RESPONSIBILITIES:
${base.actors}
`;
}
//
// Business Objects:
// ${JSON.stringify(base.business_obj, null, 2)}

function buildRevisionPrompt(base, latestDraft, feedback) {
  return `
You are a domain-agnostic document revision engine.

REFERENCE DATA — READ ONLY

Domain:
${base.domain}

Niche:
${base.niche}

CURRENT DOCUMENT:
${latestDraft}

USER REQUEST:
${feedback}

TASK:
Identify the smallest existing text segment that must change to
fulfil the user's request.

Return one minimal text-edit operation.

RULES:
1. Do not regenerate the document.
2. Do not assume any particular domain, schema, actor name, field name,
   document format, or business terminology.
3. Use the actual current document to identify the target.
4. target_text must be copied exactly from the current document.
5. replacement_text must contain the complete replacement for that
   target segment, preserving the surrounding format.
6. Keep unrelated content unchanged.
7. If the change requires multiple separate edits, return an edits array.
8. If the target is ambiguous or cannot be located, return clarification.
9. Do not invent surrounding content.

Return valid JSON only.

For one edit:
{
  "status": "patch",
  "edits": [
    {
      "target_text": "Exact existing text to replace",
      "replacement_text": "Updated text"
    }
  ]
}

For multiple edits:
{
  "status": "patch",
  "edits": [
    {
      "target_text": "Exact existing text for edit one",
      "replacement_text": "Updated text for edit one"
    },
    {
      "target_text": "Exact existing text for edit two",
      "replacement_text": "Updated text for edit two"
    }
  ]
}

If clarification is required:
{
  "status": "clarification",
  "question": "Specific clarification required"
}
`;
}

function saveReviewDraft(draft, iteration) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const filePath = path.join(
    OUTPUT_DIR,
    `${CONFIG.PATHS.EXPORT_PREFIX}_REVIEW_round-${String(iteration).padStart(2, '0')}.md`
  );

  fs.writeFileSync(filePath, `${draft.trim()}\n`, 'utf8');

  return filePath;
}

function saveApprovedOutput(draft) {
  fs.mkdirSync(FINAL_OUTPUT_DIR, { recursive: true });

  const filePath = path.join(
    FINAL_OUTPUT_DIR,
    `${CONFIG.PATHS.EXPORT_PREFIX}.${makeTimestamp()}.md`
  );

  fs.writeFileSync(filePath, `${draft.trim()}\n`, 'utf8');

  return filePath;
}
function parsePatchResponse(raw) {
  const text = String(raw ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('Model did not return a valid JSON edit instruction.');
  }

  const result = JSON.parse(text.slice(start, end + 1));

  if (result.status === 'clarification') {
    return result;
  }

  if (
    result.status !== 'patch' ||
    !Array.isArray(result.edits) ||
    result.edits.length === 0
  ) {
    throw new Error('Model returned an invalid patch structure.');
  }

  for (const edit of result.edits) {
    if (
      typeof edit.target_text !== 'string' ||
      !edit.target_text.length ||
      typeof edit.replacement_text !== 'string'
    ) {
      throw new Error('Each edit requires target_text and replacement_text.');
    }
  }

  return result;
}


function applyTextEdits(documentText, edits) {
  // Validate every target against the same original draft first.
  // This prevents partial updates if a later edit is invalid.
  let result = documentText;
  const validated = [];

  for (const edit of edits) {
    const firstIndex = documentText.indexOf(edit.target_text);

    if (firstIndex === -1) {
      throw new Error(
        'The requested target text was not found in the current document.'
      );
    }

    const secondIndex = documentText.indexOf(
      edit.target_text,
      firstIndex + edit.target_text.length
    );

    if (secondIndex !== -1) {
      throw new Error(
        'The target text occurs more than once. A unique target is required.'
      );
    }

    for (const previous of validated) {
      const previousStart = previous.index;
      const previousEnd =
        previousStart + previous.target_text.length;
      const currentEnd = firstIndex + edit.target_text.length;

      if (
        firstIndex < previousEnd &&
        previousStart < currentEnd
      ) {
        throw new Error('The proposed edit targets overlap.');
      }
    }

    validated.push({
      ...edit,
      index: firstIndex
    });
  }

  // Apply from right to left so earlier positions remain valid.
  validated.sort((a, b) => b.index - a.index);

  for (const edit of validated) {
    result =
      result.slice(0, edit.index) +
      edit.replacement_text +
      result.slice(edit.index + edit.target_text.length);
  }

  return result;
}
async function runPromptReviewLoop({
  base,
  taskName = 'actors_authorization'
}) {
  // Preserve the supplied actor document exactly at startup.
  let draft = String(base.actors ?? '');
  let round = 1;
  let revisions = 0;

  while (true) {
    const reviewPath = saveReviewDraft(draft, round);

    console.log('\n' + '='.repeat(80));
    console.log(`ACTOR RESPONSIBILITIES — ROUND ${round}`);
    console.log('='.repeat(80));
    console.log(draft);
    console.log(`\nReview copy saved to:\n${reviewPath}`);

    const instruction = (
      await askQuestion(
        "\nWhat specific content should change? " +
        "Type 'approved' to save, or 'cancel' to exit:\n> "
      )
    ).trim();

    if (/^(cancel|exit)$/i.test(instruction)) {
      console.log('\nReview cancelled. No approved output was saved.');

      return {
        status: 'cancelled',
        filePath: null,
        draft,
        revisions
      };
    }

    if (/^approved$/i.test(instruction)) {
      const finalPath = saveApprovedOutput(
        `# Domain\n${base.domain}\n\n` +
        `# Niche\n${base.niche}\n\n` +
        `# Business Objects\n${JSON.stringify(base.business_obj, null, 2)}\n\n` +
        `# Actor Responsibilities\n\n${draft}`
      );

      console.log(`\nApproved output saved: ${finalPath}`);

      return {
        status: 'approved',
        filePath: finalPath,
        draft,
        revisions
      };
    }

    if (!instruction) {
      console.log('Please enter a requested change, approved, or cancel.');
      continue;
    }

    const revisionPrompt = buildRevisionPrompt(
      base,
      draft,
      instruction
    );

    let patch;

    try {
      const rawPatch = await callLlamaCli(
        revisionPrompt,
        `${taskName}_patch_${revisions + 1}`
      );

      patch = parsePatchResponse(rawPatch);
    } catch (error) {
      console.error(`\nCould not create a valid edit: ${error.message}`);
      console.log('The current document remains unchanged.');
      continue;
    }

    if (patch.status === 'clarification') {
      console.log('\nClarification required:');
      console.log(patch.question);
      continue;
    }

    console.log('\n' + '-'.repeat(80));
    console.log('PROPOSED EDITS');
    console.log('-'.repeat(80));

    for (let i = 0; i < patch.edits.length; i++) {
      console.log(`\nEdit ${i + 1} — Existing content:\n`);
      console.log(patch.edits[i].target_text);
      console.log(`\nEdit ${i + 1} — Replacement content:\n`);
      console.log(patch.edits[i].replacement_text);
    }

    const decision = (
      await askQuestion(
        "\nType 'apply' to apply these edits, 'skip' to discard them, " +
        "or 'cancel' to exit:\n> "
      )
    ).trim().toLowerCase();

    if (/^(cancel|exit)$/i.test(decision)) {
      console.log('\nReview cancelled. No approved output was saved.');

      return {
        status: 'cancelled',
        filePath: null,
        draft,
        revisions
      };
    }

    if (decision === 'skip') {
      console.log('Proposed edits discarded. The document is unchanged.');
      continue;
    }

    if (decision !== 'apply') {
      console.log("Please enter 'apply', 'skip', or 'cancel'.");
      continue;
    }

    try {
      // Apply the patch to the current draft only.
      // Domain, niche, and business objects remain reference data.
      draft = applyTextEdits(draft, patch.edits);
      revisions++;
      round++;

      console.log('\nEdits applied to the working draft.');
      console.log('The complete updated document will appear for review.');
    } catch (error) {
      console.error(`\nCould not apply edits: ${error.message}`);
      console.log(
        'The current document remains unchanged. ' +
        'Try a more specific revision request.'
      );
    }
  }
}
async function main() {
  try {
    console.log('\n========================================');
    console.log('STAGE 7.7 — ACTORS & AUTHORIZATION');
    console.log('Interactive Prompt Review');
    console.log('========================================');

    // The actual primary prompt is built here.
    // No need to type the primary prompt every time.

    console.log('\n📌 Primary prompt prepared.');
    console.log('📂 Source files loaded.');
    console.log('🤖 Model:', CONFIG.MODEL.IDENTIFIER);

    const result = await runPromptReviewLoop({
  base,
  taskName: '7_7_actors_authorization'
});

    if (result.status === 'approved') {
      console.log('\nWorkflow completed successfully.');
    } else {
      console.log('\nWorkflow ended without approval.');
    }
  } catch (error) {
    console.error('\n❌ Workflow failed:');
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
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