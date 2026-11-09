
'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  SOURCE_DIRECTORY: path.resolve(
    __dirname,
    '../aiOutput/baseline'
  ),

  OUTPUT_FILE: path.join(
    __dirname,
    `../aiOutput/baseline/8.0.3.knowledge_base-${getFormattedDateTime()}.json`
  ),

  // Applies to Markdown chunks only.
  // JSON logical records are never split.
  MAX_RECORD_CHARACTERS: 3500,

  SOURCE_FILES: {
    STAGE_1_OBJECTS:
      '7.6 Business Objects.24-10-26_06:41pm.md',

    STAGE_2_ACTORS:
      '7.7.1 Actors_list.29-10-26_05:14pm.md',

    STAGE_3_RESPONSIBILITIES:
      '7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.30-10-26_03:13pm.md',

    STAGE_4_RELATIONSHIPS:
      '7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP.31-10-26_09:23am.md',

    STAGE_5_ACTIVITIES:
      '7.7.0.6.Derive_ACTOR_BUSINESS_Activities.31-10-26_06:46pm.md',

    // Stage 6 removed:
    // Its Information Requirements are consolidated in Stage 7.

    STAGE_7_MERGED_INFORMATION_REQUIREMENTS:
      'merged_information_requirements_06_11_26_07_50_PM.json',

    STAGE_8_VALIDATION_INFORMATION_REQUIREMENTS:
      'information_requirements_structural_validation-07-11-26_13:56.json'
  }
};


// ============================================================
// UTILITIES
// ============================================================

function log(message = '') {
  console.log(message);
}

function createId(stage, index) {
  return `${stage}_RECORD_${String(index).padStart(5, '0')}`;
}

function getFileExtension(filename) {
  return path.extname(filename).toLowerCase();
}

function getFormattedDateTime() {
  const now = new Date();

  const pad = (value) => String(value).padStart(2, '0');

  return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${String(now.getFullYear()).slice(-2)}_${pad(now.getHours())}:${pad(now.getMinutes())}`;
}


// ============================================================
// FORMAT DETECTION
// Detects JSON from actual file content, not file extension.
// This supports JSON-formatted content inside .md files.
// ============================================================
function getRecordLabel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(
    ([, item]) =>
      typeof item === 'string' &&
      item.trim().length > 0
  );

  // Prefer fields that identify what the record represents.
  const preferred = entries.find(([key]) =>
    /name|title|label|requirement|business_object|actor|activity|responsibility|relationship|role/i.test(key)
  );

  // Fallback to the first available meaningful text.
  return (preferred || entries[0] || [null, null])[1];
}
function detectSourceFormat(content, sourceFile) {
  const trimmed = content
    .replace(/^\uFEFF/, '')
    .trim();

  if (
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    try {
      return {
        format: 'json',
        parsed: JSON.parse(trimmed)
      };
    } catch (error) {
      throw new Error(
        `JSON parsing failed for ${sourceFile}: ${error.message}`
      );
    }
  }

  return {
    format: 'markdown',
    parsed: null
  };
}


// ============================================================
// DOMAIN AND NICHE
// ============================================================

function findValueByKey(value, targetKey) {
  if (value === null || typeof value !== 'object') {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findValueByKey(item, targetKey);

      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      key.toLowerCase() === targetKey.toLowerCase() &&
      child !== null &&
      typeof child !== 'object'
    ) {
      return child;
    }
  }

  for (const child of Object.values(value)) {
    const result = findValueByKey(child, targetKey);

    if (result !== null) {
      return result;
    }
  }

  return null;
}

function extractDomainAndNiche(content, format, parsed) {
  if (format === 'json') {
    return {
      domain: findValueByKey(parsed, 'domain'),
      niche: findValueByKey(parsed, 'niche')
    };
  }

  const domainMatch = content.match(
    /^\s*(?:[-*]\s*)?Domain\s*:\s*(.+)$/im
  );

  const nicheMatch = content.match(
    /^\s*(?:[-*]\s*)?Niche\s*:\s*(.+)$/im
  );

  return {
    domain: domainMatch ? domainMatch[1].trim() : null,
    niche: nicheMatch ? nicheMatch[1].trim() : null
  };
}


// ============================================================
// RECORD CREATION
// ============================================================

function createRecord({
  stage,
  sourceFile,
  section,
  content,
  recordType,
  lineStart = null,
  lineEnd = null,
  recordIndex
}) {
  return {
    id: createId(stage, recordIndex),

    source_stage: stage,

    source_file: sourceFile,

    section,

    record_type: recordType,

    line_start: lineStart,

    line_end: lineEnd,

    // Original structured value.
    // JSON objects remain JavaScript objects.
    // Markdown remains text.
    content,

    // Searchable representation for AlaSQL.
    searchable_text: [
  section || '',
  typeof content === 'string'
    ? content
    : JSON.stringify(content)
].join(' ')
  };
}


// ============================================================
// MARKDOWN TEXT CHUNKING
// Preserves every character, including line endings.
// ============================================================

function splitLinesPreservingContent(content) {
  return content.match(/[^\n]*\n|[^\n]+$/g) || [];
}

function chunkLines(lines, maxCharacters) {
  const chunks = [];

  let currentContent = '';
  let currentStart = null;
  let currentEnd = null;

  function flush() {
    if (!currentContent) return;

    chunks.push({
      content: currentContent,
      line_start: currentStart,
      line_end: currentEnd
    });

    currentContent = '';
    currentStart = null;
    currentEnd = null;
  }

  for (const item of lines) {
    const { text, lineNumber } = item;

    // Preserve oversized individual lines by splitting
    // them into consecutive text fragments.
    if (text.length > maxCharacters) {
      flush();

      for (
        let offset = 0;
        offset < text.length;
        offset += maxCharacters
      ) {
        chunks.push({
          content: text.slice(
            offset,
            offset + maxCharacters
          ),
          line_start: lineNumber,
          line_end: lineNumber
        });
      }

      continue;
    }

    if (
      currentContent.length + text.length >
      maxCharacters
    ) {
      flush();
    }

    if (currentStart === null) {
      currentStart = lineNumber;
    }

    currentEnd = lineNumber;
    currentContent += text;
  }

  flush();

  return chunks;
}


// ============================================================
// MARKDOWN PROCESSING
// Splits by headings and then by configured text size.
// ============================================================

function processMarkdown({
  content,
  stage,
  sourceFile,
  startIndex
}) {
  const lines = splitLinesPreservingContent(content);

  const sections = [];

  let currentSection = {
    heading: 'DOCUMENT CONTENT',
    lines: []
  };

  let lineNumber = 1;

  for (const line of lines) {
    const headingMatch = line.match(
      /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
    );

    if (headingMatch) {
      if (currentSection.lines.length > 0) {
        sections.push(currentSection);
      }

      currentSection = {
        heading: headingMatch[2].trim(),
        lines: [
          {
            text: line,
            lineNumber
          }
        ]
      };
    } else {
      currentSection.lines.push({
        text: line,
        lineNumber
      });
    }

    lineNumber++;
  }

  if (currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  const records = [];

  let recordIndex = startIndex;

  for (const section of sections) {
    const chunks = chunkLines(
      section.lines,
      CONFIG.MAX_RECORD_CHARACTERS
    );

    for (const chunk of chunks) {
      records.push(
        createRecord({
          stage,
          sourceFile,
          section: section.heading,
          content: chunk.content,
          recordType: 'MARKDOWN_SECTION',
          lineStart: chunk.line_start,
          lineEnd: chunk.line_end,
          recordIndex: ++recordIndex
        })
      );
    }
  }

  return {
    records,
    nextIndex: recordIndex
  };
}


// ============================================================
// JSON PROCESSING
//
// IMPORTANT:
// 1. Complete objects inside arrays remain complete records.
// 2. Nested fields are NOT fragmented into separate records
//    when they belong to the same array item.
// 3. JSON content is stored as structured objects.
// 4. No JSON record is split by character count.
// 5. Parent objects retain their nested arrays and properties.
// ============================================================
// ============================================================
// JSON SECTION NAME
// Converts JSON property names into readable section names.
// ============================================================

function formatSectionName(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}
function processJSON({
  parsed,
  stage,
  sourceFile,
  startIndex
}) {
  const records = [];

  let recordIndex = startIndex;

  function addRecord(section, value, recordType) {
    records.push(
      createRecord({
        stage,
        sourceFile,
        section,
        content: value,
        recordType,
        recordIndex: ++recordIndex
      })
    );
  }

  function visit(value, currentPath, sectionParts = []) {

    // Root arrays: each item becomes one complete record.
    if (Array.isArray(value)) {

      if (value.length === 0) {
        addRecord(
          currentPath,
          value,
          'JSON_EMPTY_ARRAY'
        );

        return;
      }

      value.forEach((item, index) => {
  const itemPath = `${currentPath}[${index}]`;

  const parentSection =
    sectionParts.join(' > ') || 'DOCUMENT CONTENT';

  // Extract the actual identifying content from the record.
  const recordLabel = getRecordLabel(item);

  // Append the actual record name to its section hierarchy.
  const section = recordLabel
    ? `${parentSection} > ${recordLabel.trim()}`
    : parentSection;

  addRecord(
    section,
    item,
    'JSON_ARRAY_ITEM'
  );
});

      return;
    }

    // Primitive root value.
    if (value === null || typeof value !== 'object') {
      addRecord(
        currentPath,
        value,
        'JSON_VALUE'
      );

      return;
    }

    const entries = Object.entries(value);

    if (entries.length === 0) {
      addRecord(
        currentPath,
        value,
        'JSON_EMPTY_OBJECT'
      );

      return;
    }

    // Collect scalar properties together.
    // This avoids generating an isolated record for every
    // individual scalar property.
    const scalarProperties = {};

    for (const [key, childValue] of entries) {
  const childPath = currentPath
    ? `${currentPath}.${key}`
    : key;

  const childSectionParts = [
    ...sectionParts,
    formatSectionName(key)
  ];

      if (
        childValue === null ||
        typeof childValue !== 'object'
      ) {
        scalarProperties[key] = childValue;
        continue;
      }

      // Arrays are processed as complete array-item records.
      if (Array.isArray(childValue)) {
        visit(childValue, childPath, childSectionParts);
        continue;
      }

      // Nested non-array objects are traversed structurally.
      visit(childValue, childPath, childSectionParts);
    }

    if (Object.keys(scalarProperties).length > 0) {
      addRecord(
  sectionParts.join(' > ') || 'DOCUMENT CONTENT',
  scalarProperties,
  'JSON_METADATA'
);
    }
  }

  visit(parsed, '$');

  return {
    records,
    nextIndex: recordIndex
  };
}


// ============================================================
// SOURCE LOADING
// ============================================================

function loadKnowledgeSources() {
  const sources = [];
  const allRecords = [];

  let domain = null;
  let niche = null;

  for (const [stage, filename] of Object.entries(
    CONFIG.SOURCE_FILES
  )) {
    const filePath = path.join(
      CONFIG.SOURCE_DIRECTORY,
      filename
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(
        `Source file not found:\n${filePath}`
      );
    }

    const content = fs.readFileSync(
      filePath,
      'utf8'
    );

    log(`Loaded ${stage}: ${content.length} characters`);

    // Determine actual format from the source content.
    const detected = detectSourceFormat(
      content,
      filename
    );

    const source = {
      source_stage: stage,
      source_file: filename,

      // Actual detected content format.
      format: detected.format,

      // Original file extension for provenance.
      file_extension: getFileExtension(filename),

      character_count: content.length,

      // Complete original source retained unchanged.
      raw_content: content
    };

    sources.push(source);

    // Extract domain and niche from Stage 1.
    if (stage === 'STAGE_1_OBJECTS') {
      const extracted = extractDomainAndNiche(
        content,
        detected.format,
        detected.parsed
      );

      domain = extracted.domain;
      niche = extracted.niche;
    }

    let processed;

    if (detected.format === 'json') {
      processed = processJSON({
        parsed: detected.parsed,
        stage,
        sourceFile: filename,
        startIndex: 0
      });
    } else {
      processed = processMarkdown({
        content,
        stage,
        sourceFile: filename,
        startIndex: 0
      });
    }

    allRecords.push(...processed.records);

    log(
      `  Detected format: ${detected.format}`
    );

    log(
      `  Searchable records: ${processed.records.length}`
    );
  }

  return {
    domain,
    niche,
    sources,
    records: allRecords
  };
}


// ============================================================
// KNOWLEDGE BASE BUILDER
// ============================================================

function buildKnowledgeBase() {
  log('\n======================================');
  log('BUILDING BUSINESS KNOWLEDGE BASE');
  log('======================================\n');

  log(`Source directory: ${CONFIG.SOURCE_DIRECTORY}`);
  log(`Output file: ${CONFIG.OUTPUT_FILE}\n`);

  if (!fs.existsSync(CONFIG.SOURCE_DIRECTORY)) {
    throw new Error(
      `Source directory does not exist:\n${CONFIG.SOURCE_DIRECTORY}`
    );
  }

  const knowledge = loadKnowledgeSources();

  const knowledgeBase = {
    metadata: {
      knowledge_base_name: 'Business Knowledge Base',

      created_at: new Date().toISOString(),

      domain: knowledge.domain,

      niche: knowledge.niche,

      total_sources: knowledge.sources.length,

      total_records: knowledge.records.length,

      original_content_preserved: true,

      record_chunk_limit: CONFIG.MAX_RECORD_CHARACTERS,

      json_records_preserve_complete_array_items: true
    },

    // Complete original source documents.
    sources: knowledge.sources,

    // Searchable records with source provenance.
    records: knowledge.records
  };

  const temporaryFile = `${CONFIG.OUTPUT_FILE}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(knowledgeBase, null, 2),
    'utf8'
  );

  fs.renameSync(
    temporaryFile,
    CONFIG.OUTPUT_FILE
  );

  const totalSourceCharacters = knowledge.sources.reduce(
    (total, source) => total + source.character_count,
    0
  );

  const jsonRecordCount = knowledge.records.filter(
    record => record.record_type.startsWith('JSON')
  ).length;

  const markdownRecordCount = knowledge.records.filter(
    record => record.record_type === 'MARKDOWN_SECTION'
  ).length;

  log('\n======================================');
  log('KNOWLEDGE BASE CREATED SUCCESSFULLY');
  log('======================================');

  log(`Domain: ${knowledge.domain || 'Not detected'}`);
  log(`Niche: ${knowledge.niche || 'Not detected'}`);

  log(`Original sources: ${knowledge.sources.length}`);

  log(`Original source characters: ${totalSourceCharacters}`);

  log(`Total searchable records: ${knowledge.records.length}`);

  log(`JSON records: ${jsonRecordCount}`);

  log(`Markdown records: ${markdownRecordCount}`);

  log(`Knowledge Base: ${CONFIG.OUTPUT_FILE}`);

  log('\nOriginal source documents are preserved.');
  log('Searchable records retain source provenance.');
  log('Complete JSON array items are preserved as records.');
}


// ============================================================
// EXECUTION
// ============================================================

try {
  buildKnowledgeBase();
} catch (error) {
  console.error('\nKNOWLEDGE BASE BUILD FAILED\n');
  console.error(error.stack || error.message);

  process.exitCode = 1;
}
