
'use strict';

/**
 * DOMAIN-AGNOSTIC REQUIREMENT RECONCILIATION ENGINE
 *
 * File:
 *   8.0.9.reconclinationBusinessRequirements.js
 *
 * Behaviour:
 *   1. Reads consolidated and individual requirement versions.
 *   2. Identifies source roles using canonical source provenance.
 *   3. Compares matched requirement payloads recursively.
 *   4. Ignores array ordering while preserving duplicate elements.
 *   5. Recognizes additional consolidated relationships as enrichment.
 *   6. Does not automatically review enrichment-only differences.
 *   7. Reviews substantive content differences and unexplained removals.
 *   8. Preserves original payloads and source provenance.
 *   9. Does not modify database records.
 *
 * Outputs:
 *   requirements_reconciliation_<timestamp>.json
 *   requirements_review_required_<timestamp>.json
 *
 * Environment:
 *   RECONCILIATION_REQUIREMENT_TYPE=BR or FR
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *
 * No hardcoded requirement IDs, domain names, counts or business rules.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const CONFIG = {
  requirementType: String(
    process.env.RECONCILIATION_REQUIREMENT_TYPE || 'BR'
  ).trim().toUpperCase(),

  schema: 'requirements',

  outputDirectory: path.resolve(
    __dirname,
    '../aiOutput/businessRequirements/reconciliation'
  ),

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'demodb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    application_name: 'requirement-reconciliation'
  }
};

const VALID_REQUIREMENT_TYPES = new Set(['BR', 'FR']);

if (!VALID_REQUIREMENT_TYPES.has(CONFIG.requirementType)) {
  throw new Error(
    `Invalid requirement type: ${CONFIG.requirementType}. Use BR or FR.`
  );
}

const pool = new Pool(CONFIG.database);

/* ============================================================
   GENERAL UTILITIES
============================================================ */

function timestamp() {
  return new Date().toISOString().replace(/:/g, '-');
}

function deepClone(value) {
  return value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value);
}

function isRelationshipField(fieldName) {
  /**
   * Generic relationship-field recognition.
   *
   * Examples:
   *   linked_functional_requirements
   *   related_business_objects
   *   business_relationships
   *   requirement_references
   *   traceability_associations
   *
   * Ordinary arrays such as assumptions, stakeholders,
   * policies and success_measures are not enrichment fields.
   */

  return /^(linked_|related_)|(_relationships?$)|(_references?$)|(_associations?$)|(^relationships?$)|(^references?$)|(^associations?$)|(^traceability$)/i
    .test(String(fieldName));
}

function isRelationshipPath(jsonPath) {
  const parts = String(jsonPath)
    .replace(/^\$\.?/, '')
    .split('.')
    .filter(Boolean);

  return parts.some(part => {
    const field = part.replace(/\[\d+\]/g, '');
    return isRelationshipField(field);
  });
}

/* ============================================================
   JSON NORMALIZATION
============================================================ */

function normalizePayload(payload) {
  if (!isObject(payload)) {
    return payload;
  }

  /**
   * Individual work files can wrap their actual requirement
   * inside payload.result.
   */

  if (
    isObject(payload.result) &&
    !Array.isArray(payload.result)
  ) {
    return payload.result;
  }

  return payload;
}

function removeDatabaseIdentity(payload, requirementId) {
  const result = deepClone(payload);

  if (!isObject(result)) {
    return result;
  }

  for (const key of Object.keys(result)) {
    if (
      key === 'requirement_id' ||
      key.endsWith('_requirement_id')
    ) {
      if (String(result[key]) === String(requirementId)) {
        delete result[key];
      }
    }
  }

  return result;
}

/**
 * Canonicalization:
 *   - Object keys are sorted.
 *   - Array elements are sorted.
 *   - Duplicate array elements are preserved.
 *
 * Consequently, array ordering is ignored at every depth.
 */

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((a, b) => {
        const left = JSON.stringify(a);
        const right = JSON.stringify(b);
        return left.localeCompare(right);
      });
  }

  if (isObject(value)) {
    const result = {};

    for (const key of Object.keys(value).sort()) {
      result[key] = canonicalize(value[key]);
    }

    return result;
  }

  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function fingerprint(value) {
  return crypto
    .createHash('sha256')
    .update(stableStringify(value))
    .digest('hex');
}

/* ============================================================
   ARRAY COMPARISON
============================================================ */

function countArrayElements(array) {
  const counts = new Map();

  for (const item of array) {
    const key = fingerprint(item);

    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        value: item,
        count: 1
      });
    }
  }

  return counts;
}

function compareArrays(left, right, jsonPath, differences) {
  const leftCounts = countArrayElements(left);
  const rightCounts = countArrayElements(right);

  const fingerprints = new Set([
    ...leftCounts.keys(),
    ...rightCounts.keys()
  ]);

  for (const key of fingerprints) {
    const leftEntry = leftCounts.get(key);
    const rightEntry = rightCounts.get(key);

    const leftCount = leftEntry ? leftEntry.count : 0;
    const rightCount = rightEntry ? rightEntry.count : 0;

    const delta = leftCount - rightCount;

    if (delta === 0) {
      continue;
    }

    const value = leftEntry
      ? leftEntry.value
      : rightEntry.value;

    for (let i = 0; i < Math.abs(delta); i++) {
      if (delta > 0) {
        /**
         * An element exists in consolidated but not
         * in individual.
         *
         * Relationship arrays are handled separately
         * as consolidation enrichment.
         */

        const enrichment = isRelationshipPath(jsonPath);

        differences.push({
          path: jsonPath,

          classification: enrichment
            ? 'CONSOLIDATION_ENRICHMENT'
            : 'ARRAY_ITEM_REMOVED',

          description: enrichment
            ? 'The consolidated requirement contains an additional relationship introduced during consolidation.'
            : 'An array element exists in the consolidated version but not in the individual version.',

          left_value: deepClone(value),
          right_value: null,

          difference_direction: 'CONSOLIDATED_ONLY',

          review_required: !enrichment
        });
      } else {
        /**
         * An element exists in individual but not
         * in consolidated.
         *
         * This is not automatically enrichment.
         * It requires review because the consolidated
         * version does not contain source information.
         */

        differences.push({
          path: jsonPath,
          classification: 'ARRAY_ITEM_ADDED',

          description:
            'An array element exists in the individual version but not in the consolidated version.',

          left_value: null,
          right_value: deepClone(value),

          difference_direction: 'INDIVIDUAL_ONLY',

          review_required: true
        });
      }
    }
  }
}

/* ============================================================
   RECURSIVE JSON COMPARISON
============================================================ */

function compareJson(left, right, jsonPath, differences) {
  if (stableStringify(left) === stableStringify(right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    compareArrays(left, right, jsonPath, differences);
    return;
  }

  if (isObject(left) && isObject(right)) {
    const keys = new Set([
      ...Object.keys(left),
      ...Object.keys(right)
    ]);

    for (const key of [...keys].sort()) {
      const childPath = `${jsonPath}.${key}`;

      const existsLeft = Object.prototype.hasOwnProperty.call(
        left,
        key
      );

      const existsRight = Object.prototype.hasOwnProperty.call(
        right,
        key
      );

      if (!existsLeft) {
        differences.push({
          path: childPath,
          classification: 'FIELD_ADDED',
          description:
            'A field exists in the individual version but not in the consolidated version.',
          left_value: null,
          right_value: deepClone(right[key]),
          difference_direction: 'INDIVIDUAL_ONLY',
          review_required: true
        });

        continue;
      }

      if (!existsRight) {
        const enrichment =
          Array.isArray(left[key]) &&
          isRelationshipPath(childPath);

        differences.push({
          path: childPath,

          classification: enrichment
            ? 'CONSOLIDATION_ENRICHMENT'
            : 'FIELD_REMOVED',

          description: enrichment
            ? 'The consolidated version contains a relationship collection introduced during consolidation.'
            : 'A field exists in the consolidated version but not in the individual version.',

          left_value: deepClone(left[key]),
          right_value: null,

          difference_direction: 'CONSOLIDATED_ONLY',

          review_required: !enrichment
        });

        continue;
      }

      compareJson(
        left[key],
        right[key],
        childPath,
        differences
      );
    }

    return;
  }

  if (left === null || right === null ||
      typeof left !== typeof right ||
      Array.isArray(left) !== Array.isArray(right)) {
    differences.push({
      path: jsonPath,
      classification: 'STRUCTURAL',
      description:
        'The consolidated and individual values have different structures or types.',
      left_value: deepClone(left),
      right_value: deepClone(right),
      difference_direction: 'CONTENT_DIFFERENCE',
      review_required: true
    });

    return;
  }

  differences.push({
    path: jsonPath,
    classification: 'VALUE_CHANGED',
    description:
      'The consolidated and individual values contain different values.',
    left_value: deepClone(left),
    right_value: deepClone(right),
    difference_direction: 'CONTENT_DIFFERENCE',
    review_required: true
  });
}

/* ============================================================
   COMPARISON CLASSIFICATION
============================================================ */

function summarizeDifferences(differences) {
  const classifications = {};
  let reviewRequiredCount = 0;
  let enrichmentCount = 0;

  for (const difference of differences) {
    const classification = difference.classification;

    classifications[classification] =
      (classifications[classification] || 0) + 1;

    if (difference.classification === 'CONSOLIDATION_ENRICHMENT') {
      enrichmentCount += 1;
    }

    if (difference.review_required) {
      reviewRequiredCount += 1;
    }
  }

  return {
    total_differences: differences.length,
    review_required_differences: reviewRequiredCount,
    consolidation_enrichment_count: enrichmentCount,
    difference_classifications: classifications
  };
}

function classifyComparison(differences) {
  const summary = summarizeDifferences(differences);

  if (differences.length === 0) {
    return {
      classification: 'MATCHED_CONTENT',
      review_required: false,
      action: 'NO_CONTENT_CHANGE_DETECTED',
      explanation:
        'The consolidated and individual requirement payloads are equivalent. Array ordering is ignored.'
    };
  }

  if (summary.review_required_differences === 0) {
    return {
      classification: 'CONSOLIDATION_ENRICHMENT',
      review_required: false,
      action: 'ACCEPT_CONSOLIDATION_ENRICHMENT',
      explanation:
        'The consolidated requirement contains additional relationship information. No substantive content differences requiring review were detected.'
    };
  }

  return {
    classification: 'CONTENT_REVIEW_REQUIRED',
    review_required: true,
    action: 'HUMAN_CONTENT_REVIEW',
    explanation:
      'One or more substantive content or structural differences were detected. Review the differences before deciding whether to retain, revise or remove information.'
  };
}

/* ============================================================
   DATABASE QUERIES
============================================================ */

async function getCanonicalSourceIds(client) {
  const table = CONFIG.requirementType === 'BR'
    ? 'business_requirements'
    : 'functional_requirements';

  const idColumn = CONFIG.requirementType === 'BR'
    ? 'business_requirement_pk'
    : 'functional_requirement_pk';

  const result = await client.query(`
    SELECT DISTINCT source_file_id
    FROM ${CONFIG.schema}.${table}
    WHERE source_file_id IS NOT NULL
  `);

  return result.rows.map(row => String(row.source_file_id));
}

async function getRequirementVersions(client) {
  const result = await client.query(`
    SELECT
      rv.requirement_version_id,
      rv.requirement_type,
      rv.requirement_id,
      rv.version_number,
      rv.source_file_id,
      rv.payload,
      rv.version_reason,
      rv.created_at,

      sf.file_name,
      sf.file_path,
      sf.artifact_type,
      sf.metadata,
      sf.file_checksum,
      sf.source_version,
      sf.source_timestamp

    FROM ${CONFIG.schema}.requirement_versions rv

    LEFT JOIN ${CONFIG.schema}.source_files sf
      ON sf.source_file_id = rv.source_file_id

    WHERE rv.requirement_type = $1

    ORDER BY
      rv.requirement_id,
      rv.version_number,
      rv.requirement_version_id
  `, [CONFIG.requirementType]);

  return result.rows;
}

async function getExistingFindings(client) {
  if (CONFIG.requirementType !== 'BR') {
    return [];
  }

  const result = await client.query(`
    SELECT *
    FROM ${CONFIG.schema}.br_consolidation_findings
    ORDER BY consolidation_finding_id
  `);

  return result.rows;
}

async function getExistingOverlapAssessments(client) {
  if (CONFIG.requirementType !== 'BR') {
    return [];
  }

  const result = await client.query(`
    SELECT *
    FROM ${CONFIG.schema}.br_overlap_pairs
    ORDER BY overlap_pair_id
  `);

  return result.rows;
}

/* ============================================================
   SOURCE CLASSIFICATION
============================================================ */

function buildSourceGroups(versions, canonicalSourceIds) {
  const canonicalSet = new Set(canonicalSourceIds);

  const consolidated = [];
  const individual = [];

  for (const version of versions) {
    const sourceId = String(version.source_file_id);

    const record = {
      requirement_version_id: String(
        version.requirement_version_id
      ),

      requirement_type: version.requirement_type,
      requirement_id: version.requirement_id,

      version_number: Number(version.version_number),
      version_reason: version.version_reason,

      source_file_id: sourceId,

      source_file: {
        file_name: version.file_name,
        file_path: version.file_path,
        artifact_type: version.artifact_type,
        metadata: version.metadata,
        checksum: version.file_checksum,
        source_version: version.source_version,
        source_timestamp: version.source_timestamp
      },

      created_at: version.created_at,

      original_payload: deepClone(version.payload)
    };

    if (canonicalSet.has(sourceId)) {
      consolidated.push(record);
    } else {
      individual.push(record);
    }
  }

  return {
    consolidated,
    individual
  };
}

function groupByRequirementId(records) {
  const groups = new Map();

  for (const record of records) {
    const id = String(record.requirement_id);

    if (!groups.has(id)) {
      groups.set(id, []);
    }

    groups.get(id).push(record);
  }

  return groups;
}

/* ============================================================
   PAYLOAD COMPARISON
============================================================ */

function getComparablePayload(record) {
  const payload = normalizePayload(record.original_payload);

  return removeDatabaseIdentity(
    payload,
    record.requirement_id
  );
}

function compareRequirementVersions(consolidated, individual) {
  const consolidatedPayload = getComparablePayload(consolidated);
  const individualPayload = getComparablePayload(individual);

  const differences = [];

  compareJson(
    consolidatedPayload,
    individualPayload,
    '$',
    differences
  );

  const recommendation = classifyComparison(differences);

  return {
    classification: recommendation.classification,

    difference_count: differences.length,

    difference_classifications:
      summarizeDifferences(differences).difference_classifications,

    recommendation: {
      action: recommendation.action,
      review_required: recommendation.review_required,
      explanation: recommendation.explanation
    },

    consolidated_source: deepClone(consolidated),
    individual_source: deepClone(individual),

    comparison: {
      consolidated_payload: deepClone(consolidatedPayload),
      individual_payload: deepClone(individualPayload),
      differences: deepClone(differences)
    }
  };
}

/* ============================================================
   REQUIREMENT RECONCILIATION
============================================================ */

function reconcileRequirements(
  consolidatedRecords,
  individualRecords
) {
  const consolidatedGroups =
    groupByRequirementId(consolidatedRecords);

  const individualGroups =
    groupByRequirementId(individualRecords);

  const allIds = new Set([
    ...consolidatedGroups.keys(),
    ...individualGroups.keys()
  ]);

  const requirements = [];

  const matchedIds = [];
  const consolidatedOnlyIds = [];
  const individualOnlyIds = [];
  const duplicateGroups = [];

  for (const requirementId of [...allIds].sort()) {
    const consolidated =
      consolidatedGroups.get(requirementId) || [];

    const individual =
      individualGroups.get(requirementId) || [];

    if (consolidated.length > 1 || individual.length > 1) {
      duplicateGroups.push({
        requirement_id: requirementId,
        consolidated_record_count: consolidated.length,
        individual_record_count: individual.length
      });
    }

    if (consolidated.length === 0) {
      individualOnlyIds.push(requirementId);
      continue;
    }

    if (individual.length === 0) {
      consolidatedOnlyIds.push(requirementId);
      continue;
    }

    matchedIds.push(requirementId);

    const comparisons = [];

    /**
     * Compare every consolidated version against every
     * individual version for the same identifier.
     */

    for (const consolidatedRecord of consolidated) {
      for (const individualRecord of individual) {
        comparisons.push(
          compareRequirementVersions(
            consolidatedRecord,
            individualRecord
          )
        );
      }
    }

    const allDifferences = comparisons.flatMap(
      comparison => comparison.comparison.differences
    );

    const reviewRequired = comparisons.some(
      comparison => comparison.recommendation.review_required
    );

    const summary = summarizeDifferences(allDifferences);

    let classification;

    if (reviewRequired) {
      classification = 'CONTENT_REVIEW_REQUIRED';
    } else if (summary.consolidation_enrichment_count > 0) {
      classification = 'CONSOLIDATION_ENRICHMENT';
    } else {
      classification = 'MATCHED_CONTENT';
    }

    const recommendation = reviewRequired
      ? {
          action: 'HUMAN_CONTENT_REVIEW',
          review_required: true,
          explanation:
            'Substantive content or structural differences require review.'
        }
      : summary.consolidation_enrichment_count > 0
        ? {
            action: 'ACCEPT_CONSOLIDATION_ENRICHMENT',
            review_required: false,
            explanation:
              'Additional consolidated relationships are classified as enrichment and do not independently require content review.'
          }
        : {
            action: 'NO_CONTENT_CHANGE_DETECTED',
            review_required: false,
            explanation:
              'No substantive content differences were detected. Array ordering is ignored.'
          };

    requirements.push({
      requirement_id: requirementId,
      classification,

      consolidated_record_count: consolidated.length,
      individual_record_count: individual.length,

      comparison_count: comparisons.length,

      review_summary: {
        ...summary,
        recommendations: comparisons.map(
          comparison => comparison.recommendation
        )
      },

      recommendation,

      comparisons,

      differences: allDifferences
    });
  }

  return {
    requirements,
    matchedIds,
    consolidatedOnlyIds,
    individualOnlyIds,
    duplicateGroups
  };
}

/* ============================================================
   REPORT CONSTRUCTION
============================================================ */

function buildReport(
  reconciliation,
  versions,
  sourceGroups,
  findings,
  overlaps
) {
  const requirements = reconciliation.requirements;

  const reviewRequired = requirements.filter(
    item => item.recommendation.review_required
  );

  const enrichment = requirements.filter(
    item => item.classification === 'CONSOLIDATION_ENRICHMENT'
  );

  const equivalent = requirements.filter(
    item => item.classification === 'MATCHED_CONTENT'
  );

  const allDifferences = requirements.flatMap(
    item => item.differences
  );

  const differenceSummary =
    summarizeDifferences(allDifferences);

  const verificationChecks = [
    {
      check: 'Requirement versions discovered',
      count: versions.length,
      status: versions.length > 0 ? 'PASS' : 'FAIL'
    },
    {
      check: 'Consolidated source records',
      count: sourceGroups.consolidated.length,
      status: 'PASS'
    },
    {
      check: 'Individual source records',
      count: sourceGroups.individual.length,
      status: 'PASS'
    },
    {
      check: 'Matched identifiers',
      count: reconciliation.matchedIds.length,
      status: 'PASS'
    },
    {
      check: 'Consolidated-only identifiers',
      count: reconciliation.consolidatedOnlyIds.length,
      status: 'PASS'
    },
    {
      check: 'Individual-only identifiers',
      count: reconciliation.individualOnlyIds.length,
      status: 'PASS'
    },
    {
      check: 'Duplicate identifier groups',
      count: reconciliation.duplicateGroups.length,
      status: reconciliation.duplicateGroups.length === 0
        ? 'PASS'
        : 'REVIEW'
    }
  ];

  const overallStatus = verificationChecks.some(
    check => check.status === 'FAIL'
  )
    ? 'FAIL'
    : reviewRequired.length > 0
      ? 'REVIEW'
      : 'PASS';

  return {
    generated_at: new Date().toISOString(),

    requirement_type: CONFIG.requirementType,

    reconciliation_method: {
      comparison: 'RECURSIVE_JSON_COMPARISON',
      object_key_order: 'IGNORED',
      array_order: 'IGNORED',
      array_duplicates: 'PRESERVED',
      relationship_enrichment:
        'CONSOLIDATED_RELATIONSHIP_ADDITIONS_CLASSIFIED_AS_ENRICHMENT',
      automatic_merge: false,
      automatic_approval: false,
      automatic_rejection: false,
      database_changes: false,
      ai_processing: false
    },

    summary: {
      version_records: versions.length,
      source_files: new Set(
        versions.map(version => String(version.source_file_id))
      ).size,

      consolidated_ids: sourceGroups.consolidated.length,
      individual_ids: sourceGroups.individual.length,

      matched_ids: reconciliation.matchedIds.length,

      equivalent_content: equivalent.length,

      consolidation_enrichment: enrichment.length,

      review_required: reviewRequired.length,

      consolidated_only:
        reconciliation.consolidatedOnlyIds.length,

      individual_only:
        reconciliation.individualOnlyIds.length,

      duplicate_groups:
        reconciliation.duplicateGroups.length,

      total_differences:
        differenceSummary.total_differences,

      review_required_differences:
        differenceSummary.review_required_differences,

      difference_classifications:
        differenceSummary.difference_classifications
    },

    verification: {
      status: overallStatus,
      checks: verificationChecks
    },

    identifier_reconciliation: {
      matched: reconciliation.matchedIds,
      consolidated_only: reconciliation.consolidatedOnlyIds,
      individual_only: reconciliation.individualOnlyIds,
      duplicate_groups: reconciliation.duplicateGroups
    },

    existing_consolidation_findings: findings,
    existing_overlap_assessments: overlaps,

    requirements
  };
}

function buildReviewReport(report) {
  const reviewRequired = report.requirements.filter(
    item => item.recommendation.review_required
  );

  return {
    generated_at: report.generated_at,

    requirement_type: report.requirement_type,

    report_type: 'REVIEW_REQUIRED',

    summary: {
      requirements_exported: reviewRequired.length,

      differences_exported: reviewRequired.reduce(
        (total, item) => total + item.review_summary.review_required_differences,
        0
      ),

      review_classifications: {}
    },

    requirements: reviewRequired
  };
}

/* ============================================================
   OUTPUT
============================================================ */

function writeJson(filePath, data) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

function printSummary(report, reviewReport, outputFiles) {
  const summary = report.summary;

  console.log('');
  console.log('========================================');
  console.log('RECONCILIATION COMPLETED');
  console.log('========================================');

  console.log(`Requirement type: ${report.requirement_type}`);
  console.log(`Version records: ${summary.version_records}`);
  console.log(`Source files: ${summary.source_files}`);

  console.log(`Consolidated IDs: ${summary.consolidated_ids}`);
  console.log(`Individual IDs: ${summary.individual_ids}`);
  console.log(`Matched IDs: ${summary.matched_ids}`);

  console.log(`Equivalent content: ${summary.equivalent_content}`);

  console.log(
    `Consolidation enrichment: ${summary.consolidation_enrichment}`
  );

  console.log(`Review required: ${summary.review_required}`);

  console.log(`Consolidated only: ${summary.consolidated_only}`);
  console.log(`Individual only: ${summary.individual_only}`);

  console.log(`Duplicate groups: ${summary.duplicate_groups}`);

  console.log(`Total differences: ${summary.total_differences}`);

  console.log('');
  console.log('Difference classifications:');

  for (const [classification, count] of Object.entries(
    summary.difference_classifications
  )) {
    console.log(`${classification}: ${count}`);
  }

  console.log('');
  console.log('Verification:');

  for (const check of report.verification.checks) {
    console.log(
      `${check.status.padEnd(6)} ${check.check}: ${check.count}`
    );
  }

  console.log('');
  console.log(`Overall status: ${report.verification.status}`);

  console.log('');
  console.log('Output reports:');

  console.log(path.basename(outputFiles.reconciliation));
  console.log(path.basename(outputFiles.review));

  console.log('');
  console.log('Review report summary:');

  console.log(
    `Requirements exported: ${reviewReport.summary.requirements_exported}`
  );

  console.log(
    `Differences exported: ${reviewReport.summary.differences_exported}`
  );

  console.log('');
  console.log('DATABASE CHANGES: NONE');
  console.log('AI PROCESSING: NONE');
  console.log('ORIGINAL PAYLOADS: PRESERVED');
  console.log('AUTOMATIC MERGES: NONE');
  console.log('AUTOMATIC APPROVALS: NONE');
  console.log('AUTOMATIC REJECTIONS: NONE');
  console.log('========================================');
}

/* ============================================================
   MAIN
============================================================ */

async function main() {
  const client = await pool.connect();

  try {
    console.log(
      '[RECONCILIATION] Starting domain-agnostic requirement reconciliation.'
    );

    console.log(
      `[RECONCILIATION] Requirement type: ${CONFIG.requirementType}`
    );

    console.log(
      '[RECONCILIATION] Discovering consolidated source provenance...'
    );

    const canonicalSourceIds =
      await getCanonicalSourceIds(client);

    console.log(
      '[RECONCILIATION] Reading requirement versions and source provenance...'
    );

    const versions = await getRequirementVersions(client);

    console.log(
      '[RECONCILIATION] Reading existing validation findings...'
    );

    const findings = await getExistingFindings(client);

    console.log(
      '[RECONCILIATION] Reading existing overlap assessments...'
    );

    const overlaps = await getExistingOverlapAssessments(client);

    console.log(
      '[RECONCILIATION] Classifying consolidated and individual sources...'
    );

    const sourceGroups = buildSourceGroups(
      versions,
      canonicalSourceIds
    );

    console.log(
      '[RECONCILIATION] Comparing matched requirement payloads...'
    );

    const reconciliation = reconcileRequirements(
      sourceGroups.consolidated,
      sourceGroups.individual
    );

    const report = buildReport(
      reconciliation,
      versions,
      sourceGroups,
      findings,
      overlaps
    );

    const reviewReport = buildReviewReport(report);

    fs.mkdirSync(CONFIG.outputDirectory, {
      recursive: true
    });

    const fileTimestamp = timestamp();

    const outputFiles = {
      reconciliation: path.join(
        CONFIG.outputDirectory,
        `requirements_reconciliation_${fileTimestamp}.json`
      ),

      review: path.join(
        CONFIG.outputDirectory,
        `requirements_review_required_${fileTimestamp}.json`
      )
    };

    writeJson(outputFiles.reconciliation, report);
    writeJson(outputFiles.review, reviewReport);

    printSummary(report, reviewReport, outputFiles);

  } catch (error) {
    console.error('');
    console.error('[RECONCILIATION] FAILED');
    console.error(error.stack || error.message);

    process.exitCode = 1;

  } finally {
    client.release();
    await pool.end();
  }
}

main();
