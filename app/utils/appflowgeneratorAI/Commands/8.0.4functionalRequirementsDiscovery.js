'use strict';

/**
 * ============================================================================
 * 8.0.4 FUNCTIONAL REQUIREMENTS DISCOVERY
 *
 * Qwen owns business discovery and reasoning.
 * AlaSQL provides optional, fast retrieval from the Knowledge Base JSON.
 *
 * If an AlaSQL query returns zero rows:
 *   - Read the original sources[].raw_content directly.
 *   - Supply the original source content to Qwen in manageable pieces.
 *   - Accumulate Qwen's analysis before continuing discovery.
 *
 * No predefined business queries or keyword-search engine.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const alasql = require('alasql');

// ============================================================================
// 1. CONFIGURATION
// ============================================================================

const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),

    KNOWLEDGE_BASE_DIR:
      path.resolve(__dirname, '../aiOutput/baseline'),

    KNOWLEDGE_BASE_PREFIX:
      '8.0.3.knowledge_base-',

    OUTPUT_DIR:
      path.resolve(__dirname, '../aiOutput'),

    TEMP_DIR:
      path.resolve(__dirname, '../promptFile'),

    OUTPUT_PREFIX:
      '8.0.4.functional_requirements'
  },

  MODEL: {
    EXEC_BINARY: 'llama-cli',
    IDENTIFIER: 'unsloth/Qwen3.5-9B-GGUF',

    NGL: '0',
    CONTEXT_SIZE: '31723',
    BATCH_SIZE: '256',
    THREADS: '8',
    REASONING_MODE: 'off',

    MAX_OUTPUT_TOKENS: '4096'
  },

  DISCOVERY: {
    // Safety limit on investigation cycles, not on SQL result rows.
    MAX_INVESTIGATION_TURNS: 12,

    // Original source text is passed to Qwen in separate pieces
    // when direct JSON fallback is required.
    FALLBACK_CHUNK_CHARACTERS: 24000,

    // Reserve context for Qwen's response and prompt instructions.
    CONTEXT_RESERVE_TOKENS: 5000
  }
};

fs.mkdirSync(CONFIG.PATHS.OUTPUT_DIR, { recursive: true });
fs.mkdirSync(CONFIG.PATHS.TEMP_DIR, { recursive: true });

// ============================================================================
// 2. GENERAL HELPERS
// ============================================================================

function log(message) {
  console.log(`[8.0.4] ${message}`);
}

function timestamp() {
  const d = new Date();

  const pad = value =>
    String(value).padStart(2, '0');

  return [
    d.getFullYear(),
    pad(d.getMonth() + 1),
    pad(d.getDate())
  ].join('-') + '_' + [
    pad(d.getHours()),
    pad(d.getMinutes()),
    pad(d.getSeconds())
  ].join('-');
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function estimateTokens(text) {
  // Conservative approximation for context-size protection.
  return Math.ceil(String(text).length / 3);
}

function assertPromptFits(prompt, label) {
  const estimated = estimateTokens(prompt);

  const available =
    Number(CONFIG.MODEL.CONTEXT_SIZE) -
    Number(CONFIG.DISCOVERY.CONTEXT_RESERVE_TOKENS);

  if (estimated > available) {
    throw new Error(
      `${label} exceeds the available prompt budget. ` +
      `Estimated ${estimated} tokens; available ${available}.`
    );
  }
}

// ============================================================================
// 3. LOAD THE KNOWLEDGE BASE JSON
// ============================================================================

function findLatestKnowledgeBase() {
  const directory = CONFIG.PATHS.KNOWLEDGE_BASE_DIR;

  if (!fs.existsSync(directory)) {
    throw new Error(
      `Knowledge Base directory does not exist: ${directory}`
    );
  }

  const files = fs.readdirSync(directory)
    .filter(file =>
      file.startsWith(CONFIG.PATHS.KNOWLEDGE_BASE_PREFIX) &&
      file.endsWith('.json')
    )
    .map(file => {
      const fullPath = path.join(directory, file);

      return {
        file,
        fullPath,
        modifiedAt: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  if (!files.length) {
    throw new Error(
      `No ${CONFIG.PATHS.KNOWLEDGE_BASE_PREFIX}*.json file found.`
    );
  }

  return files[0].fullPath;
}

function loadKnowledgeBase() {
  const filePath =
    process.argv[2] || findLatestKnowledgeBase();

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Knowledge Base JSON not found: ${filePath}`
    );
  }

  log(`Loading Knowledge Base: ${filePath}`);

  const knowledgeBase = JSON.parse(
    fs.readFileSync(filePath, 'utf8')
  );

  if (
    !knowledgeBase.metadata ||
    !Array.isArray(knowledgeBase.sources) ||
    !Array.isArray(knowledgeBase.records)
  ) {
    throw new Error(
      'Invalid Knowledge Base structure. Expected metadata, sources[], records[].'
    );
  }

  for (const source of knowledgeBase.sources) {
    if (typeof source.raw_content !== 'string') {
      throw new Error(
        `Original raw_content missing for source: ${source.source_file}`
      );
    }
  }

  log(`Domain: ${knowledgeBase.metadata.domain}`);
  log(`Niche: ${knowledgeBase.metadata.niche}`);
  log(`Original sources: ${knowledgeBase.sources.length}`);
  log(`Indexed records: ${knowledgeBase.records.length}`);

  return {
    filePath,
    data: knowledgeBase
  };
}

// ============================================================================
// 4. REGISTER THE JSON COLLECTIONS WITH ALASQL
// ============================================================================

function initializeAlaSQL(knowledgeBase) {
  // These are the actual arrays loaded from the original JSON file.
  // No records are reconstructed or replaced.

  alasql('CREATE DATABASE IF NOT EXISTS businessKnowledgeBase');
  alasql('USE businessKnowledgeBase');

  alasql('CREATE TABLE records');
  alasql('CREATE TABLE sources');

  alasql.tables.records.data =
    knowledgeBase.records;

  alasql.tables.sources.data =
    knowledgeBase.sources;

  log('AlaSQL tables registered: records, sources');
}

// ============================================================================
// 5. VALIDATE AND EXECUTE QWEN-GENERATED SQL
// ============================================================================

function validateReadOnlySQL(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('Qwen did not provide SQL.');
  }

  const statement = sql.trim().replace(/;+\s*$/, '');

  // Only SELECT statements are allowed.
  if (!/^SELECT\b/i.test(statement)) {
    throw new Error('Only SELECT SQL statements are permitted.');
  }

  // Prevent multiple statements.
  if (statement.includes(';')) {
    throw new Error('Multiple SQL statements are not permitted.');
  }

  // Restrict SQL access to the two registered Knowledge Base tables.
  const tableReferences = [
    ...statement.matchAll(/\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi)
  ].map(match => match[1].toLowerCase());

  if (!tableReferences.length) {
    throw new Error('SQL must reference records or sources.');
  }

  const allowedTables = new Set([
    'records',
    'sources'
  ]);

  for (const table of tableReferences) {
    if (!allowedTables.has(table)) {
      throw new Error(
        `SQL references an unsupported table: ${table}`
      );
    }
  }

  return statement;
}

function executeKnowledgeBaseSQL(sql, params) {
  const safeSQL = validateReadOnlySQL(sql);

  if (!Array.isArray(params)) {
    throw new Error('SQL params must be an array.');
  }

  log(`Executing Qwen-generated SQL: ${safeSQL}`);

  // No controller-generated query.
  // No hardcoded search phrase.
  // No controller-imposed LIMIT.
  return alasql(safeSQL, params);
}

// ============================================================================
// 6. JSON RESPONSE EXTRACTION
// ============================================================================

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();

  // Try the complete response first.
  try {
    return JSON.parse(text);
  } catch (_) {
    // Continue to locate a JSON object in the response.
  }

  // Locate balanced JSON objects while respecting quoted strings.
  const candidates = [];

  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = start; end < text.length; end++) {
      const character = text[end];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }

        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === '{') {
        depth++;
      } else if (character === '}') {
        depth--;

        if (depth === 0) {
          const candidate = text.slice(start, end + 1);

          try {
            candidates.push(JSON.parse(candidate));
          } catch (_) {
            // Ignore invalid candidate.
          }

          break;
        }
      }
    }
  }

  const valid = candidates.filter(
    candidate =>
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate)
  );

  if (!valid.length) {
    throw new Error(
      'No valid JSON object found in the generated response.'
    );
  }

  return valid[valid.length - 1];
}

// ============================================================================
// 7. EXECUTE QWEN
// ============================================================================

function runQwen(prompt, label, maxTokens) {
  assertPromptFits(prompt, label);

  const runId = `${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const promptPath = path.join(
    CONFIG.PATHS.TEMP_DIR,
    `8.0.4_prompt_${runId}.txt`
  );

  const responsePath = path.join(
    CONFIG.PATHS.TEMP_DIR,
    `8.0.4_response_${runId}.json`
  );

  const stdoutPath = path.join(
    CONFIG.PATHS.TEMP_DIR,
    `8.0.4_stdout_${runId}.txt`
  );

  const stderrPath = path.join(
    CONFIG.PATHS.TEMP_DIR,
    `8.0.4_stderr_${runId}.txt`
  );

  fs.writeFileSync(promptPath, prompt, 'utf8');

  const args = [
    '-hf', CONFIG.MODEL.IDENTIFIER,
    '-ngl', CONFIG.MODEL.NGL,
    '--single-turn',
    '-c', CONFIG.MODEL.CONTEXT_SIZE,
    '-b', CONFIG.MODEL.BATCH_SIZE,
    '-t', CONFIG.MODEL.THREADS,
    '--reasoning', CONFIG.MODEL.REASONING_MODE,
    '--log-disable',
    '-n', String(maxTokens || CONFIG.MODEL.MAX_OUTPUT_TOKENS),
    '-f', promptPath,
    '-o', responsePath
  ];

  log(`Running Qwen: ${label}`);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    execFile(
      CONFIG.MODEL.EXEC_BINARY,
      args,
      {
        maxBuffer: 50 * 1024 * 1024,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        fs.writeFileSync(stdoutPath, stdout || '', 'utf8');
        fs.writeFileSync(stderrPath, stderr || '', 'utf8');

        if (error) {
          const diagnostic = [
            error.message,
            stdout || '',
            stderr || ''
          ].join('\n');

          const contextError =
            /exceeds the available context|context size|prompt is too long/i
              .test(diagnostic);

          reject(
            new Error(
              contextError
                ? `Qwen context overflow during "${label}". ` +
                  `The response was not accepted as successful.`
                : `Qwen execution failed during "${label}": ${error.message}`
            )
          );

          return;
        }

        if (!fs.existsSync(responsePath)) {
          reject(
            new Error(
              `Qwen did not create a response file during "${label}".`
            )
          );

          return;
        }

        const response = fs.readFileSync(
          responsePath,
          'utf8'
        ).trim();

        if (!response) {
          reject(
            new Error(
              `Qwen returned an empty response during "${label}".`
            )
          );

          return;
        }

        log(
          `${label} completed in ${
            ((Date.now() - startedAt) / 1000).toFixed(1)
          } seconds.`
        );

        resolve(response);
      }
    );
  });
}

// ============================================================================
// 8. QWEN DISCOVERY PROMPT
// ============================================================================

function buildDiscoveryPrompt(context) {
  const { knowledgeBase, investigationNotes, lastQuery } = context;

  return `
You are an expert Business Analyst, Enterprise Solution
Analyst and Functional Requirements Architect.

Your responsibility is to independently discover, investigate
and define meaningful, complete and implementable functional
requirements for the supplied business domain and niche.

============================================================
BUSINESS CONTEXT
============================================================

Domain:
${knowledgeBase.metadata.domain}

Niche:
${knowledgeBase.metadata.niche}

============================================================
KNOWLEDGE BASE BASELINE
============================================================

A Knowledge Base JSON file is available to you through two
AlaSQL tables:

TABLE: records

Fields:
- id
- source_stage
- source_file
- section
- record_type
- content
- searchable_text

TABLE: sources

Fields:
- source_stage
- source_file
- format
- file_extension
- character_count
- raw_content

The Knowledge Base contains baseline business artefacts.

IMPORTANT:

1. The baseline is reference material, not the source of truth.
2. Do not mechanically copy the baseline into requirements.
3. Do not assume the baseline contains every valid business
   capability, process, rule or requirement.
4. Independently reason about the domain and niche.
5. Identify what business information you need to investigate.
6. Decide whether retrieving baseline information would help.
7. When retrieval is needed, generate your own SQL query.
8. Do not generate generic searches or predefined business
   keyword combinations.
9. Do not assume that a missing SQL result means a business
   capability does not exist.
10. Continue independent business reasoning even when the
    baseline does not contain relevant information.

============================================================
PREVIOUS INVESTIGATION NOTES
============================================================

${investigationNotes || 'No previous investigation notes.'}

============================================================
LATEST ALA SQL RESULT
============================================================

${lastQuery
  ? safeJson(lastQuery)
  : 'No previous SQL result.'}

============================================================
YOUR TASK
============================================================

Independently investigate the business domain and niche.

Determine what functional capabilities, business behaviours,
decisions, validations, exceptions, controls and interactions
are required.

Use your own business analysis and domain reasoning.

The baseline may support your investigation, but it must not
restrict your discovery.

When additional baseline information is needed, generate a
specific SQL query that retrieves the information required
to answer your own investigation question.

You may query either records or sources.

Use the actual field names provided above.

You may use SQL parameters with ? placeholders and provide
their values in the params array.

Do not invent SQL results.

If the baseline evidence is sufficient, you may return FINAL
without generating another query.

============================================================
RESPONSE FORMAT
============================================================

Return exactly one valid JSON object.

OPTION A — RETRIEVE BASELINE INFORMATION

{
  "action": "SEARCH",
  "investigation_question": "The specific business question you need to investigate",
  "analysis_notes": "Concise findings and reasoning established so far",
  "sql": "SELECT ... FROM records ...",
  "params": []
}

OPTION B — COMPLETE DISCOVERY

{
  "action": "FINAL",
  "result": {
    "functional_requirements": [
      {
        "requirement_id": "FR-001",
        "requirement": "",
        "business_need": "",
        "functional_behaviour": [],
        "required_by_actors": [],
        "related_business_objects": [],
        "related_information_requirements": [],
        "business_rules": [],
        "acceptance_criteria": [
          {
            "given": "",
            "when": "",
            "then": ""
          }
        ]
      }
    ],
    "unresolved_questions": [
      {
        "question": "",
        "affected_requirement": "FR-001"
      }
    ]
  }
}

============================================================
FINAL REQUIREMENT RULES
============================================================

- Discover requirements independently.
- Do not merely reword baseline artefacts.
- Do not invent unsupported facts and present them as established
  business policy.
- Distinguish reasonable functional behaviour from unresolved
  business-specific decisions.
- Include meaningful actor responsibilities and interactions.
- Include business rules, validations and exception behaviour
  where applicable.
- Acceptance criteria must be testable and use Given/When/Then.
- Avoid duplicate or fragmented requirements.
- Use sequential requirement IDs.
- Every requirement must contain exactly the nine fields shown.
- Every acceptance criterion must contain exactly three fields:
  given, when and then.
- The result must contain exactly two top-level fields:
  functional_requirements and unresolved_questions.

Return JSON only. Do not use Markdown fences or commentary.
`.trim();
}

// ============================================================================
// 9. DIRECT ORIGINAL JSON FALLBACK
// ============================================================================

function splitSourceIntoChunks(source) {
  const content = source.raw_content;
  const chunkSize =
    CONFIG.DISCOVERY.FALLBACK_CHUNK_CHARACTERS;

  const chunks = [];

  for (let start = 0; start < content.length; start += chunkSize) {
    chunks.push(
      content.slice(start, start + chunkSize)
    );
  }

  return chunks;
}

function buildDirectSourcePrompt(context) {
  const {
    knowledgeBase,
    investigationQuestion,
    previousNotes,
    source,
    chunk,
    chunkIndex,
    totalChunks
  } = context;

  return `
You are continuing functional requirements discovery.

The AlaSQL query returned ZERO matching rows.

You must now directly inspect the ORIGINAL Knowledge Base
JSON source content supplied below.

This is the fallback to the original JSON file.
Do not run another search.
Do not assume the missing SQL result means the business
information or capability does not exist.

============================================================
BUSINESS CONTEXT
============================================================

Domain: ${knowledgeBase.metadata.domain}
Niche: ${knowledgeBase.metadata.niche}

Investigation question:
${investigationQuestion}

============================================================
PREVIOUS INVESTIGATION NOTES
============================================================

${previousNotes || 'No previous notes.'}

============================================================
ORIGINAL JSON SOURCE
============================================================

Source stage: ${source.source_stage}
Source file: ${source.source_file}
Original source character count: ${source.character_count}

Content segment: ${chunkIndex + 1} of ${totalChunks}

The following text is taken directly from sources[].raw_content.
It is original source content, not reconstructed search results.

${chunk}

============================================================
YOUR TASK
============================================================

Inspect this original source segment.

Identify information relevant to the investigation question.

Consider:
- Directly relevant business evidence.
- Related business behaviour or information.
- Actors, responsibilities and business objects.
- Business rules, decisions, validations and exceptions.
- Relevant implications not explicitly stated in the source.

The source is baseline evidence, not the source of truth.
Do not mechanically copy it.
Do not treat missing information as proof that a capability
does not exist.

Return concise notes that can be used in the continuing
investigation. Do not generate functional requirements yet.

Return exactly this JSON structure:

{
  "analysis_notes": "Relevant findings, evidence and reasoning"
}

Return JSON only.
`.trim();
}

async function inspectOriginalSources(
  knowledgeBase,
  investigationQuestion,
  previousNotes
) {
  log(
    'AlaSQL returned zero rows. Activating original JSON fallback.'
  );

  const notes = [];

  for (const source of knowledgeBase.sources) {
    const chunks = splitSourceIntoChunks(source);

    log(
      `Direct JSON fallback: ${source.source_file} ` +
      `(${chunks.length} segment(s))`
    );

    for (let index = 0; index < chunks.length; index++) {
      const prompt = buildDirectSourcePrompt({
        knowledgeBase,
        investigationQuestion,
        previousNotes: [
          previousNotes,
          ...notes
        ].filter(Boolean).join('\n\n'),
        source,
        chunk: chunks[index],
        chunkIndex: index,
        totalChunks: chunks.length
      });

      const rawResponse = await runQwen(
        prompt,
        `Original JSON fallback: ${source.source_file} (${index + 1}/${chunks.length})`,
        1800
      );

      const parsed = extractJsonObject(rawResponse);

      if (
        typeof parsed.analysis_notes !== 'string' ||
        !parsed.analysis_notes.trim()
      ) {
        throw new Error(
          `Invalid direct JSON fallback response for ${source.source_file}.`
        );
      }

      notes.push(
        `SOURCE: ${source.source_file}\n${parsed.analysis_notes.trim()}`
      );
    }
  }

  log(
    `Original JSON fallback completed. Analysed ${knowledgeBase.sources.length} original sources.`
  );

  return notes.join('\n\n');
}

// ============================================================================
// 10. FINAL RESULT VALIDATION
// ============================================================================

const REQUIREMENT_FIELDS = [
  'requirement_id',
  'requirement',
  'business_need',
  'functional_behaviour',
  'required_by_actors',
  'related_business_objects',
  'related_information_requirements',
  'business_rules',
  'acceptance_criteria'
];

const ACCEPTANCE_CRITERIA_FIELDS = [
  'given',
  'when',
  'then'
];

function hasExactFields(object, expectedFields) {
  if (
    !object ||
    typeof object !== 'object' ||
    Array.isArray(object)
  ) {
    return false;
  }

  const actual = Object.keys(object).sort();
  const expected = [...expectedFields].sort();

  return JSON.stringify(actual) === JSON.stringify(expected);
}

function validateFinalResult(result) {
  if (!hasExactFields(result, [
    'functional_requirements',
    'unresolved_questions'
  ])) {
    throw new Error(
      'FINAL result must contain exactly functional_requirements and unresolved_questions.'
    );
  }

  if (
    !Array.isArray(result.functional_requirements) ||
    !Array.isArray(result.unresolved_questions)
  ) {
    throw new Error(
      'FINAL result fields must both be arrays.'
    );
  }

  for (const requirement of result.functional_requirements) {
    if (!hasExactFields(requirement, REQUIREMENT_FIELDS)) {
      throw new Error(
        `Invalid requirement structure: ${requirement.requirement_id || 'unknown ID'}`
      );
    }

    if (!Array.isArray(requirement.acceptance_criteria)) {
      throw new Error(
        `Acceptance criteria must be an array: ${requirement.requirement_id}`
      );
    }

    for (const criterion of requirement.acceptance_criteria) {
      if (!hasExactFields(
        criterion,
        ACCEPTANCE_CRITERIA_FIELDS
      )) {
        throw new Error(
          `Invalid Given/When/Then structure: ${requirement.requirement_id}`
        );
      }
    }
  }

  for (const question of result.unresolved_questions) {
    if (!hasExactFields(question, [
      'question',
      'affected_requirement'
    ])) {
      throw new Error(
        'Invalid unresolved question structure.'
      );
    }
  }

  return result;
}

// ============================================================================
// 11. MAIN DISCOVERY LOOP
// ============================================================================

async function discoverFunctionalRequirements() {
  const { data: knowledgeBase, filePath } =
    loadKnowledgeBase();

  initializeAlaSQL(knowledgeBase);

  let investigationNotes = '';
  let lastQuery = null;

  for (
    let turn = 1;
    turn <= CONFIG.DISCOVERY.MAX_INVESTIGATION_TURNS;
    turn++
  ) {
    log('');
    log('================================================');
    log(`INVESTIGATION TURN ${turn}`);
    log('================================================');

    const prompt = buildDiscoveryPrompt({
      knowledgeBase,
      investigationNotes,
      lastQuery
    });

    const rawResponse = await runQwen(
      prompt,
      `Functional requirements investigation ${turn}`,
      CONFIG.MODEL.MAX_OUTPUT_TOKENS
    );

    const response = extractJsonObject(rawResponse);

    // --------------------------------------------------------
    // FINAL
    // --------------------------------------------------------

    if (response.action === 'FINAL') {
      const result = validateFinalResult(response.result);

      const outputFile = path.join(
        CONFIG.PATHS.OUTPUT_DIR,
        `${CONFIG.PATHS.OUTPUT_PREFIX}_${timestamp()}.json`
      );

      fs.writeFileSync(
        outputFile,
        safeJson(result),
        'utf8'
      );

      log('');
      log('FUNCTIONAL REQUIREMENTS DISCOVERY COMPLETED');
      log(`Requirements: ${result.functional_requirements.length}`);
      log(`Unresolved questions: ${result.unresolved_questions.length}`);
      log(`Knowledge Base: ${filePath}`);
      log(`Output: ${outputFile}`);

      return result;
    }

    // --------------------------------------------------------
    // SEARCH
    // --------------------------------------------------------

    if (response.action !== 'SEARCH') {
      throw new Error(
        `Unexpected Qwen action: ${response.action}`
      );
    }

    if (
      typeof response.investigation_question !== 'string' ||
      !response.investigation_question.trim()
    ) {
      throw new Error(
        'SEARCH action is missing investigation_question.'
      );
    }

    if (
      typeof response.sql !== 'string' ||
      !response.sql.trim()
    ) {
      throw new Error(
        'SEARCH action is missing SQL.'
      );
    }

    investigationNotes = [
      investigationNotes,
      response.analysis_notes || ''
    ].filter(Boolean).join('\n\n');

    const params = response.params || [];

    let queryResults;

    try {
      queryResults = executeKnowledgeBaseSQL(
        response.sql,
        params
      );
    } catch (error) {
      // A malformed or invalid query is not treated as a
      // zero-result query. Qwen must correct its SQL.
      lastQuery = {
        investigation_question: response.investigation_question,
        query_error: error.message,
        instruction:
          'Correct the SQL using the actual registered table and field names.'
      };

      log(`SQL error: ${error.message}`);
      continue;
    }

    log(`AlaSQL rows returned: ${queryResults.length}`);

    // --------------------------------------------------------
    // ZERO ROWS: DIRECT ORIGINAL JSON FALLBACK
    // --------------------------------------------------------

    if (queryResults.length === 0) {
      const fallbackNotes = await inspectOriginalSources(
        knowledgeBase,
        response.investigation_question,
        investigationNotes
      );

      investigationNotes = [
        investigationNotes,
        'DIRECT ORIGINAL JSON FALLBACK FINDINGS:',
        fallbackNotes
      ].filter(Boolean).join('\n\n');

      lastQuery = {
        investigation_question: response.investigation_question,
        query_result: 'ZERO_ROWS',
        fallback: 'ORIGINAL_JSON_SOURCES_INSPECTED',
        original_sources_inspected: knowledgeBase.sources.length
      };

      continue;
    }

    // --------------------------------------------------------
    // MATCHING ROWS: RETURN ACTUAL ALA SQL DATA TO QWEN
    // --------------------------------------------------------

    lastQuery = {
      investigation_question: response.investigation_question,
      sql: response.sql,
      rows_returned: queryResults.length,
      results: queryResults
    };

    // Do not silently truncate results. If Qwen retrieves more
    // data than fits in context, stop and report the issue.
    const nextPrompt = buildDiscoveryPrompt({
      knowledgeBase,
      investigationNotes,
      lastQuery
    });

    assertPromptFits(
      nextPrompt,
      'AlaSQL result supplied to Qwen'
    );
  }

  throw new Error(
    `Discovery did not produce FINAL within ` +
    `${CONFIG.DISCOVERY.MAX_INVESTIGATION_TURNS} investigation turns. ` +
    `No successful output was saved.`
  );
}

// ============================================================================
// 12. RUN
// ============================================================================

discoverFunctionalRequirements()
  .catch(error => {
    console.error('\nFUNCTIONAL REQUIREMENTS DISCOVERY FAILED');
    console.error(error.stack || error.message);

    process.exitCode = 1;
  });