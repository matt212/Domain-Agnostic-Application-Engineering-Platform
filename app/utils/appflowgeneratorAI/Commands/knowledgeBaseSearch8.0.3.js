'use strict';

const fs = require('fs');
const path = require('path');
const alasql = require('alasql');

const DEFAULT_KNOWLEDGE_BASE = path.resolve(
  __dirname,
  '../aiOutput/baseline/8.0.3.knowledge_base-09-11-26_22:50.json'
);

function countSQLPlaceholders(sql) {
  let count = 0;
  let quote = null;
  let escaped = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '?') {
      count++;
    }
  }

  return count;
}

function validateIndexedSQL(sql, params = []) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('SEARCH requires a non-empty SQL statement.');
  }

  if (!Array.isArray(params)) {
    throw new Error('SEARCH params must be an array.');
  }

  const normalized = sql.trim();

  if (!/^SELECT\b/i.test(normalized)) {
    throw new Error('Only SELECT statements are permitted.');
  }

  if (normalized.includes(';')) {
    throw new Error('Multiple SQL statements are not permitted.');
  }

  if (!/\bFROM\s+records\b/i.test(normalized)) {
    throw new Error('SQL must query the records table.');
  }

  if (
    /\b(JOIN|UNION|INTERSECT|EXCEPT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|ATTACH|DETACH|EXEC|EXECUTE)\b/i.test(
      normalized
    )
  ) {
    throw new Error('Unsupported SQL operation.');
  }

  const fromMatches = normalized.match(/\bFROM\b/gi) || [];

  if (fromMatches.length !== 1) {
    throw new Error('SQL must contain exactly one FROM clause.');
  }

  const placeholderCount = countSQLPlaceholders(normalized);

  if (placeholderCount !== params.length) {
    throw new Error(
      `SQL has ${placeholderCount} placeholders but ${params.length} parameters were supplied.`
    );
  }

  return normalized;
}

function tokenizeQuery(query) {
  return [
    ...new Set(
      query.toLowerCase().match(/[a-z0-9_-]{2,}/g) || []
    )
  ];
}

function validatePagination(limit, offset) {
  if (
    limit !== null &&
    limit !== undefined &&
    (!Number.isSafeInteger(limit) || limit < 1)
  ) {
    throw new Error('limit must be a positive integer or null.');
  }

  if (
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new Error('offset must be a non-negative integer.');
  }
}

function searchRawSources(sources, options = {}) {
  const {
    query,
    source_stage = null,
    limit = null,
    offset = 0,
    match = 'any',
    chunk_size = 1800,
    overlap = 300
  } = options;

  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('RAW_SOURCES requires a non-empty query.');
  }

  if (!['any', 'all'].includes(match)) {
    throw new Error('match must be "any" or "all".');
  }

  validatePagination(limit, offset);

  if (
    !Number.isSafeInteger(chunk_size) ||
    chunk_size < 100
  ) {
    throw new Error('chunk_size must be an integer of at least 100.');
  }

  if (
    !Number.isSafeInteger(overlap) ||
    overlap < 0 ||
    overlap >= chunk_size
  ) {
    throw new Error(
      'overlap must be between 0 and chunk_size - 1.'
    );
  }

  const terms = tokenizeQuery(query);

  if (!terms.length) {
    throw new Error('Query contains no searchable terms.');
  }

  const candidates = [];

  for (const source of sources) {
    if (
      source_stage &&
      source.source_stage !== source_stage
    ) {
      continue;
    }

    const content = source.raw_content;

    if (typeof content !== 'string' || !content.length) {
      continue;
    }

    const lowerContent = content.toLowerCase();
    const step = chunk_size - overlap;

    for (
      let start = 0;
      start < content.length;
      start += step
    ) {
      const end = Math.min(start + chunk_size, content.length);
      const chunk = lowerContent.slice(start, end);

      const matchedTerms = [];
      let occurrenceCount = 0;

      for (const term of terms) {
        let position = 0;
        let termOccurrences = 0;

        while (true) {
          const found = chunk.indexOf(term, position);

          if (found === -1) {
            break;
          }

          termOccurrences++;
          position = found + term.length;
        }

        if (termOccurrences > 0) {
          matchedTerms.push(term);
          occurrenceCount += termOccurrences;
        }
      }

      const qualifies =
        match === 'all'
          ? matchedTerms.length === terms.length
          : matchedTerms.length > 0;

      if (qualifies) {
        const exactPhraseMatch = chunk.includes(
          query.trim().toLowerCase()
        );

        candidates.push({
          source_stage: source.source_stage,
          source_file: source.source_file,
          format: source.format,
          file_extension: source.file_extension,
          source_character_count:
            source.character_count || content.length,
          matched_terms: matchedTerms,
          matched_term_count: matchedTerms.length,
          occurrence_count: occurrenceCount,
          exact_phrase_match: exactPhraseMatch,
          relevance_score:
            matchedTerms.length * 100 +
            occurrenceCount +
            (exactPhraseMatch ? 1000 : 0),
          original_start: start,
          original_end: end,
          excerpt: content.slice(start, end)
        });
      }

      if (end === content.length) {
        break;
      }
    }
  }

  candidates.sort((a, b) =>
    b.relevance_score - a.relevance_score ||
    a.source_stage.localeCompare(b.source_stage) ||
    a.original_start - b.original_start
  );

  const totalMatches = candidates.length;

  const results =
    limit === null || limit === undefined
      ? candidates.slice(offset)
      : candidates.slice(offset, offset + limit);

  return {
    search_source: 'RAW_SOURCES',
    query,
    source_stage,
    match,
    terms_searched: terms,
    total_matching_excerpts: totalMatches,
    offset,
    limit: limit ?? null,
    returned_count: results.length,
    next_offset:
      offset + results.length < totalMatches
        ? offset + results.length
        : null,
    results
  };
}

function initializeKnowledgeBaseSearch(
  knowledgeBasePath = DEFAULT_KNOWLEDGE_BASE
) {
  if (!fs.existsSync(knowledgeBasePath)) {
    throw new Error(
      `Knowledge Base file not found: ${knowledgeBasePath}`
    );
  }

  const knowledgeBase = JSON.parse(
    fs.readFileSync(knowledgeBasePath, 'utf8')
  );

  const metadata = knowledgeBase.metadata || {};
  const records = knowledgeBase.records || [];
  const sources = knowledgeBase.sources || [];

  if (!Array.isArray(records)) {
    throw new Error('Knowledge Base records must be an array.');
  }

  if (!Array.isArray(sources)) {
    throw new Error('Knowledge Base sources must be an array.');
  }

  const search = (sql, params = []) => {
    const validatedSQL = validateIndexedSQL(sql, params);

    const executableSQL = validatedSQL.replace(
      /\bFROM\s+records\b/i,
      'FROM ? AS records'
    );

    return alasql(executableSQL, [records, ...params]);
  };

  return {
    metadata,
    records,
    sources,

    search,

    searchRawSources(options) {
      return searchRawSources(sources, options);
    },

    getStatistics() {
      return {
        total_records: records.length,
        total_sources: sources.length,
        original_content_preserved:
          metadata.original_content_preserved === true,

        source_character_count: sources.reduce(
          (total, source) =>
            total + (source.raw_content || '').length,
          0
        ),

        searchable_character_count: records.reduce(
          (total, record) =>
            total +
            String(record.searchable_text || '').length,
          0
        )
      };
    }
  };
}

module.exports = {
  initializeKnowledgeBaseSearch,
  searchRawSources,
  validateIndexedSQL,
  countSQLPlaceholders
};

if (require.main === module) {
  try {
    const engine = initializeKnowledgeBaseSearch();

    console.log('\nKNOWLEDGE BASE STATISTICS');
    console.log(engine.getStatistics());

    console.log('\nRAW SOURCE SEARCH TEST');

    const result = engine.searchRawSources({
      query: 'order',
      limit: null,
      offset: 0
    });

    console.log(
      'Total matching excerpts:',
      result.total_matching_excerpts
    );

    console.log(
      'Returned excerpts:',
      result.returned_count
    );
  } catch (error) {
    console.error('KNOWLEDGE BASE SEARCH FAILED');
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}