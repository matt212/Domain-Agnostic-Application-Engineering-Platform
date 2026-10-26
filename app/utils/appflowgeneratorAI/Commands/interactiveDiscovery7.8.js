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
  const pass1Prompt = `
Analyze the supplied business context as a senior business analyst,
domain specialist, process architect, and business authorization designer.

save this  
Domain: ${base.domain}
Niche: ${base.niche}

Business discovery data:
${JSON.stringify(base.business_obj, null, 2)}

and 
just show Supplied actor discovery data:
${base.actors}.


Return valid JSON only.
`;

  return pass1Prompt;
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
function buildRevisionPrompt(originalPrompt, latestDraft, feedback) {
  return `${originalPrompt}

# INTERACTIVE REVISION REQUEST

Revise the latest draft according to the user's instructions below.

Rules:
- Treat the original primary prompt as the governing specification.
- Treat the latest draft as the starting point.
- Apply the user's requested changes.
- Preserve valid existing content unless a change is necessary.
- Return the COMPLETE revised artifact, not a diff.
- Follow the original output contract exactly.
- Do not add commentary outside the required output format.

# LATEST DRAFT

${latestDraft}

# USER REVISION INSTRUCTIONS

${feedback}

Return only the complete revised artifact in the format required by
the original primary prompt.
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
async function runPromptReviewLoop({
  originalPrompt,
  taskName = 'actors_authorization'
}) {
  let draft = await callLlamaCli(
    originalPrompt,
    `${taskName}_initial`
  );

  let round = 1;
  let revisions = 0;

  while (true) {
    const reviewPath = saveReviewDraft(draft, round);

    console.log('\n' + '='.repeat(80));
    console.log(`DRAFT FOR REVIEW — ROUND ${round}`);
    console.log('='.repeat(80));

    console.log(draft);

    console.log('\n' + '-'.repeat(80));
    console.log(`Review copy saved to:\n${reviewPath}`);
    console.log('-'.repeat(80));

    const response = await askQuestion(
      "\nType 'approved' to save the final file, " +
      "enter revision instructions, or type 'cancel' to exit:\n> "
    );

    const instruction = response.trim();

    if (instruction.toLowerCase() === 'approved') {
      const finalPath = saveApprovedOutput(draft);

      console.log('\n✅ Output approved and saved.');
      console.log(`Final file: ${finalPath}`);
      console.log(`Revision rounds: ${revisions}`);

      return {
        status: 'approved',
        filePath: finalPath,
        draft,
        revisions
      };
    }

    if (
      instruction.toLowerCase() === 'cancel' ||
      instruction.toLowerCase() === 'exit'
    ) {
      console.log('\nReview cancelled. No approved output was saved.');

      return {
        status: 'cancelled',
        filePath: null,
        draft,
        revisions
      };
    }

    if (!instruction) {
      console.log(
        '\nNo instruction entered. Please approve, cancel, or enter feedback.'
      );
      continue;
    }

    revisions += 1;

    console.log(`\n🔄 Applying revision ${revisions}...`);

    const revisionPrompt = buildRevisionPrompt(
      originalPrompt,
      draft,
      instruction
    );

    draft = await callLlamaCli(
      revisionPrompt,
      `${taskName}_revision_${revisions}`
    );

    round += 1;
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
    const originalPrompt = buildPrimaryPrompt(base);

    console.log('\n📌 Primary prompt prepared.');
    console.log('📂 Source files loaded.');
    console.log('🤖 Model:', CONFIG.MODEL.IDENTIFIER);

    const result = await runPromptReviewLoop({
      originalPrompt,
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