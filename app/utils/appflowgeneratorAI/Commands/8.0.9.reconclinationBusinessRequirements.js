
'use strict';

/**
 * DOMAIN-AGNOSTIC REQUIREMENT RECONCILIATION ENGINE
 *
 * Scope:
 *   - Reconciles requirement versions stored in PostgreSQL.
 *   - Uses database provenance to distinguish consolidated and
 *     individual source records.
 *   - Compares arbitrary JSON structures recursively.
 *   - Preserves original payloads and source provenance.
 *   - Produces human-review recommendations.
 *
 * Safety:
 *   - READ ONLY PostgreSQL transaction.
 *   - No AI calls.
 *   - No INSERT, UPDATE, DELETE or schema changes.
 *   - No automatic merging, approval or rejection.
 *
 * Comparison rules:
 *   - Object key ordering is ignored.
 *   - Matching database identity duplicated in root JSON is excluded.
 *   - Arrays are not sorted.
 *   - Same array elements in a different order are classified as
 *     ARRAY_ORDER.
 *   - Different array contents are reported as additions/removals.
 *   - Unmatched array objects are not speculatively paired.
 *   - Scalar value changes are classified as VALUE_CHANGED.
 *   - Different JSON types are classified as STRUCTURAL.
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG = {
    requirementType: String(
        process.env.RECONCILIATION_REQUIREMENT_TYPE || 'BR'
    ).trim().toUpperCase(),

    schema: 'requirements',

    outputDirectory: path.resolve(
        __dirname,
        '../aiOutput/businessRequirements/reconciliation'
    ),

    database: process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL
        }
        : {
            host: process.env.PGHOST || 'localhost',
            port: Number(process.env.PGPORT || 5432),
            database: process.env.PGDATABASE || 'demodb',
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD,
            ssl: process.env.PGSSL === 'true'
                ? { rejectUnauthorized: false }
                : undefined
        }
};

const pool = new Pool({
    ...CONFIG.database,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
});

function log(message) {
    console.log(`[RECONCILIATION] ${message}`);
}

function parseJson(value) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    return value;
}

function isObject(value) {
    return value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value);
}

/**
 * Stable serialization:
 * - Object key order does not affect fingerprints.
 * - Array order remains significant.
 */
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }

    if (isObject(value)) {
        const keys = Object.keys(value).sort();

        return `{${keys.map(key =>
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        ).join(',')}}`;
    }

    return JSON.stringify(value);
}

function fingerprint(value) {
    return crypto
        .createHash('sha256')
        .update(stableStringify(value))
        .digest('hex');
}

/**
 * Extract a common result envelope.
 *
 * The original payload is never overwritten.
 * This only determines which object is used for comparison.
 */
function extractComparablePayload(payload) {
    const parsed = parseJson(payload);

    if (
        isObject(parsed) &&
        Object.prototype.hasOwnProperty.call(parsed, 'result') &&
        isObject(parsed.result)
    ) {
        return parsed.result;
    }

    return parsed;
}

/**
 * Exclude a duplicated technical identity only when:
 * 1. It is a root-level identifier property.
 * 2. Its value exactly matches the database requirement identifier.
 *
 * No business attributes are excluded.
 */
function removeDatabaseIdentity(payload, databaseId) {
    if (!isObject(payload)) {
        return payload;
    }

    const result = { ...payload };

    for (const key of Object.keys(result)) {
        const isIdentifier =
            key === 'requirement_id' ||
            key.endsWith('_requirement_id');

        if (
            isIdentifier &&
            String(result[key]) === String(databaseId)
        ) {
            delete result[key];
        }
    }

    return result;
}

function pushDifference(differences, details) {
    differences.push({
        ...details
    });
}

/**
 * Compare arrays without assuming they are sets.
 *
 * If their elements are identical but ordered differently:
 *   ARRAY_ORDER
 *
 * If their contents differ:
 *   ARRAY_ITEM_ADDED / ARRAY_ITEM_REMOVED
 *
 * Multiset comparison preserves duplicate counts.
 */
function compareArrays(left, right, currentPath, differences) {
    const leftFingerprints = left.map(fingerprint);
    const rightFingerprints = right.map(fingerprint);

    const leftCounts = new Map();
    const rightCounts = new Map();

    for (const item of leftFingerprints) {
        leftCounts.set(item, (leftCounts.get(item) || 0) + 1);
    }

    for (const item of rightFingerprints) {
        rightCounts.set(item, (rightCounts.get(item) || 0) + 1);
    }

    const sameElements =
        leftCounts.size === rightCounts.size &&
        [...leftCounts.entries()].every(
            ([key, count]) => rightCounts.get(key) === count
        );

    if (sameElements) {
        if (stableStringify(left) !== stableStringify(right)) {
            pushDifference(differences, {
                path: currentPath,
                classification: 'ARRAY_ORDER',
                description: 'Array contains the same elements in a different order.',
                left_value: left,
                right_value: right
            });
        }

        return;
    }

    const remainingRight = new Map(rightCounts);

    for (let index = 0; index < left.length; index++) {
        const item = left[index];
        const key = leftFingerprints[index];
        const available = remainingRight.get(key) || 0;

        if (available > 0) {
            remainingRight.set(key, available - 1);
        } else {
            pushDifference(differences, {
                path: currentPath,
                classification: 'ARRAY_ITEM_REMOVED',
                description: 'An array element exists in the left version but not the right version.',
                left_value: item,
                right_value: null,
                left_index: index
            });
        }
    }

    const remainingLeft = new Map(leftCounts);

    for (const [key, count] of rightCounts.entries()) {
        const leftCount = remainingLeft.get(key) || 0;

        if (count > leftCount) {
            const numberAdded = count - leftCount;

            for (let occurrence = 0; occurrence < numberAdded; occurrence++) {
                const index = rightFingerprints.findIndex(
                    (value, position) =>
                        value === key &&
                        position >= 0
                );

                pushDifference(differences, {
                    path: currentPath,
                    classification: 'ARRAY_ITEM_ADDED',
                    description: 'An array element exists in the right version but not the left version.',
                    left_value: null,
                    right_value: right[index],
                    right_index: index
                });
            }
        }
    }
}

/**
 * Recursive comparison of arbitrary JSON.
 */
function compareJson(left, right, currentPath = '$', differences = []) {
    if (stableStringify(left) === stableStringify(right)) {
        return differences;
    }

    if (isObject(left) && isObject(right)) {
        const keys = new Set([
            ...Object.keys(left),
            ...Object.keys(right)
        ]);

        for (const key of [...keys].sort()) {
            const leftHas = Object.prototype.hasOwnProperty.call(left, key);
            const rightHas = Object.prototype.hasOwnProperty.call(right, key);

            const nextPath = `${currentPath}.${key}`;

            if (!leftHas) {
                pushDifference(differences, {
                    path: nextPath,
                    classification: 'FIELD_ADDED',
                    description: 'Field exists only in the right version.',
                    left_value: null,
                    right_value: right[key]
                });

                continue;
            }

            if (!rightHas) {
                pushDifference(differences, {
                    path: nextPath,
                    classification: 'FIELD_REMOVED',
                    description: 'Field exists only in the left version.',
                    left_value: left[key],
                    right_value: null
                });

                continue;
            }

            compareJson(
                left[key],
                right[key],
                nextPath,
                differences
            );
        }

        return differences;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
        compareArrays(left, right, currentPath, differences);
        return differences;
    }

    if (
        (isObject(left) && !isObject(right)) ||
        (!isObject(left) && isObject(right)) ||
        (Array.isArray(left) && !Array.isArray(right)) ||
        (!Array.isArray(left) && Array.isArray(right)) ||
        (left === null && right !== null) ||
        (left !== null && right === null)
    ) {
        pushDifference(differences, {
            path: currentPath,
            classification: 'STRUCTURAL',
            description: 'JSON value types or structures differ.',
            left_value: left,
            right_value: right
        });

        return differences;
    }

    pushDifference(differences, {
        path: currentPath,
        classification: 'VALUE_CHANGED',
        description: 'The value differs between versions.',
        left_value: left,
        right_value: right
    });

    return differences;
}

function groupBy(items, getKey) {
    const result = new Map();

    for (const item of items) {
        const key = getKey(item);

        if (!result.has(key)) {
            result.set(key, []);
        }

        result.get(key).push(item);
    }

    return result;
}

function countClassifications(differences) {
    const result = {};

    for (const difference of differences) {
        const key = difference.classification;
        result[key] = (result[key] || 0) + 1;
    }

    return result;
}

function getRecommendation(classifications, comparisonStatus) {
    if (comparisonStatus === 'MATCHED_CONTENT') {
        return {
            action: 'NO_CONTENT_CHANGE_DETECTED',
            review_required: false,
            explanation: 'The compared payloads are equivalent.'
        };
    }

    const keys = Object.keys(classifications);

    if (keys.length === 1 && keys[0] === 'ARRAY_ORDER') {
        return {
            action: 'REVIEW_ORDERING',
            review_required: true,
            explanation: 'The array elements are identical but appear in a different order. Confirm whether order is meaningful.'
        };
    }

    if (keys.every(key =>
        key === 'ARRAY_ORDER'
    )) {
        return {
            action: 'REVIEW_ORDERING',
            review_required: true,
            explanation: 'Only array ordering differences were detected.'
        };
    }

    return {
        action: 'HUMAN_CONTENT_REVIEW',
        review_required: true,
        explanation: 'One or more structural, added, removed or changed values require review. Do not automatically merge either version.'
    };
}

function summarizeVersion(record) {
    return {
        requirement_version_id: record.requirement_version_id,
        requirement_type: record.requirement_type,
        requirement_id: record.requirement_id,
        version_number: record.version_number,
        version_reason: record.version_reason,
        source_file_id: record.source_file_id,
        source_file: {
            file_name: record.file_name,
            file_path: record.file_path,
            artifact_type: record.artifact_type,
            metadata: parseJson(record.source_metadata),
            checksum: record.file_checksum,
            source_version: record.source_version,
            source_timestamp: record.source_timestamp
        },
        created_at: record.version_created_at,
        original_payload: parseJson(record.payload)
    };
}

function compareRequirement(id, consolidatedRecords, individualRecords) {
    const comparisons = [];

    for (const consolidated of consolidatedRecords) {
        for (const individual of individualRecords) {
            const leftOriginal = parseJson(consolidated.payload);
            const rightOriginal = parseJson(individual.payload);

            const leftComparable = removeDatabaseIdentity(
                extractComparablePayload(leftOriginal),
                id
            );

            const rightComparable = removeDatabaseIdentity(
                extractComparablePayload(rightOriginal),
                id
            );

            const differences = compareJson(
                leftComparable,
                rightComparable
            );

            const classifications = countClassifications(differences);

            const status = differences.length === 0
                ? 'MATCHED_CONTENT'
                : 'CONTENT_DIFFERENCES';

            comparisons.push({
                classification: status,
                difference_count: differences.length,
                difference_classifications: classifications,
                recommendation: getRecommendation(
                    classifications,
                    status
                ),

                consolidated_source: summarizeVersion(consolidated),
                individual_source: summarizeVersion(individual),

                comparison: {
                    consolidated_payload: leftComparable,
                    individual_payload: rightComparable,
                    differences
                }
            });
        }
    }

    const allEquivalent =
        comparisons.length > 0 &&
        comparisons.every(
            item => item.classification === 'MATCHED_CONTENT'
        );

    return {
        requirement_id: id,
        consolidated_record_count: consolidatedRecords.length,
        individual_record_count: individualRecords.length,
        comparison_count: comparisons.length,
        classification: allEquivalent
            ? 'MATCHED_CONTENT'
            : 'CONTENT_REVIEW_REQUIRED',
        comparisons
    };
}

function buildSourceGroups(records, consolidatedSourceIds) {
    const grouped = groupBy(
        records,
        record => String(record.source_file_id)
    );

    return [...grouped.entries()].map(([sourceFileId, items]) => ({
        source_file_id: sourceFileId,
        source_role: consolidatedSourceIds.has(sourceFileId)
            ? 'CONSOLIDATED'
            : 'INDIVIDUAL',
        file_name: items[0].file_name,
        file_path: items[0].file_path,
        artifact_type: items[0].artifact_type,
        metadata: parseJson(items[0].source_metadata),
        record_count: items.length,
        requirement_ids: [
            ...new Set(items.map(item => String(item.requirement_id)))
        ]
    }));
}

function buildDuplicateGroups(map, role) {
    const result = [];

    for (const [id, records] of map.entries()) {
        if (records.length > 1) {
            result.push({
                requirement_id: id,
                source_role: role,
                record_count: records.length,
                records: records.map(summarizeVersion)
            });
        }
    }

    return result;
}

function countBy(items, property) {
    const counts = {};

    for (const item of items) {
        const key = String(item[property] ?? 'UNSPECIFIED');
        counts[key] = (counts[key] || 0) + 1;
    }

    return counts;
}

async function readDatabase(client) {
    log('Discovering consolidated source provenance...');

    const canonicalResult = await client.query(`
        SELECT DISTINCT source_file_id
        FROM requirements.business_requirements
        WHERE source_file_id IS NOT NULL
    `);

    const consolidatedSourceIds = new Set(
        canonicalResult.rows.map(row => String(row.source_file_id))
    );

    if (consolidatedSourceIds.size === 0) {
        throw new Error(
            'No consolidated source provenance found in requirements.business_requirements.'
        );
    }

    log('Reading requirement versions and source provenance...');

    const versionsResult = await client.query(
        `
        SELECT
            rv.requirement_version_id,
            rv.requirement_type,
            rv.requirement_id,
            rv.version_number,
            rv.source_file_id,
            rv.payload,
            rv.version_reason,
            rv.created_at AS version_created_at,

            sf.artifact_type,
            sf.file_name,
            sf.file_path,
            sf.file_checksum,
            sf.source_version,
            sf.source_timestamp,
            sf.metadata AS source_metadata

        FROM requirements.requirement_versions rv

        INNER JOIN requirements.source_files sf
            ON sf.source_file_id = rv.source_file_id

        WHERE UPPER(rv.requirement_type) = UPPER($1)

        ORDER BY
            rv.requirement_id,
            rv.version_number,
            rv.created_at,
            rv.requirement_version_id
        `,
        [CONFIG.requirementType]
    );

    log('Reading existing validation findings...');

    const findingsResult = await client.query(`
        SELECT *
        FROM requirements.br_consolidation_findings
        ORDER BY created_at, consolidation_finding_id
    `);

    log('Reading existing overlap assessments...');

    const overlapsResult = await client.query(`
        SELECT *
        FROM requirements.br_overlap_pairs
        ORDER BY created_at, overlap_pair_id
    `);

    return {
        records: versionsResult.rows,
        findings: findingsResult.rows,
        overlapPairs: overlapsResult.rows,
        consolidatedSourceIds
    };
}

function buildReport(data) {
    const {
        records,
        findings,
        overlapPairs,
        consolidatedSourceIds
    } = data;

    if (records.length === 0) {
        throw new Error(
            `No requirement versions found for type ${CONFIG.requirementType}.`
        );
    }

    const sourceGroups = buildSourceGroups(
        records,
        consolidatedSourceIds
    );

    const consolidated = new Map();
    const individual = new Map();

    for (const record of records) {
        const id = String(record.requirement_id);

        const isConsolidated = consolidatedSourceIds.has(
            String(record.source_file_id)
        );

        const target = isConsolidated
            ? consolidated
            : individual;

        if (!target.has(id)) {
            target.set(id, []);
        }

        target.get(id).push(record);
    }

    const consolidatedIds = new Set(consolidated.keys());
    const individualIds = new Set(individual.keys());

    const matchedIds = [...consolidatedIds]
        .filter(id => individualIds.has(id))
        .sort();

    const consolidatedOnly = [...consolidatedIds]
        .filter(id => !individualIds.has(id))
        .sort();

    const individualOnly = [...individualIds]
        .filter(id => !consolidatedIds.has(id))
        .sort();

    log('Comparing matched requirement payloads...');

    const comparisons = matchedIds.map(id =>
        compareRequirement(
            id,
            consolidated.get(id),
            individual.get(id)
        )
    );

    const equivalent = comparisons.filter(
        item => item.classification === 'MATCHED_CONTENT'
    );

    const reviewRequired = comparisons.filter(
        item => item.classification === 'CONTENT_REVIEW_REQUIRED'
    );

    const duplicateGroups = [
        ...buildDuplicateGroups(consolidated, 'CONSOLIDATED'),
        ...buildDuplicateGroups(individual, 'INDIVIDUAL')
    ];

    const allDifferences = comparisons.flatMap(item =>
        item.comparisons.flatMap(comparison =>
            comparison.comparison.differences
        )
    );

    const verification = [
        {
            check: 'Requirement versions discovered',
            actual: records.length,
            status: records.length > 0 ? 'PASS' : 'FAIL'
        },
        {
            check: 'Consolidated source records',
            actual: [...consolidated.values()]
                .reduce((sum, list) => sum + list.length, 0),
            status: 'PASS'
        },
        {
            check: 'Individual source records',
            actual: [...individual.values()]
                .reduce((sum, list) => sum + list.length, 0),
            status: 'PASS'
        },
        {
            check: 'Matched identifiers',
            actual: matchedIds.length,
            status: 'PASS'
        },
        {
            check: 'Consolidated-only identifiers',
            actual: consolidatedOnly.length,
            status: 'PASS'
        },
        {
            check: 'Individual-only identifiers',
            actual: individualOnly.length,
            status: 'PASS'
        },
        {
            check: 'Duplicate identifier groups',
            actual: duplicateGroups.length,
            status: duplicateGroups.length === 0 ? 'PASS' : 'REVIEW'
        }
    ];

    const requiresReview =
        reviewRequired.length > 0 ||
        consolidatedOnly.length > 0 ||
        individualOnly.length > 0 ||
        duplicateGroups.length > 0;

    return {
        report_type: 'DOMAIN_AGNOSTIC_REQUIREMENT_RECONCILIATION',
        generated_at: new Date().toISOString(),
        requirement_type: CONFIG.requirementType,

        method: {
            source_identification:
                'SOURCE_FILE_PROVENANCE_REFERENCED_BY_CANONICAL_REQUIREMENT_RECORDS',
            matching:
                'DATABASE_REQUIREMENT_IDENTIFIER',
            comparison:
                'RECURSIVE_JSON',
            database_identity:
                'MATCHING_ROOT_LEVEL_IDENTIFIER_EXCLUDED_FROM_PAYLOAD_COMPARISON',
            object_key_order:
                'IGNORED',
            array_order:
                'PRESERVED_AND_DIFFERENCES_CLASSIFIED',
            array_content:
                'MULTISET_COMPARISON_WITH_DUPLICATE_PRESERVATION',
            ambiguous_array_element_pairing:
                'NOT_INFERRED',
            ai_processing: false,
            database_mutations: false,
            automatic_business_decisions: false
        },

        summary: {
            version_records: records.length,
            source_files: sourceGroups.length,
            source_file_roles: countBy(sourceGroups, 'source_role'),

            consolidated_requirement_ids: consolidatedIds.size,
            individual_requirement_ids: individualIds.size,
            matched_requirement_ids: matchedIds.length,

            equivalent_content: equivalent.length,
            content_review_required: reviewRequired.length,

            consolidated_only: consolidatedOnly.length,
            individual_only: individualOnly.length,

            duplicate_identifier_groups: duplicateGroups.length,

            total_differences: allDifferences.length,
            difference_classifications:
                countClassifications(allDifferences),

            existing_validation_findings: findings.length,
            existing_overlap_assessments: overlapPairs.length
        },

        source_provenance: {
            consolidated_source_file_ids: [...consolidatedSourceIds],
            sources: sourceGroups
        },

        identifier_reconciliation: {
            matched_ids: matchedIds,
            consolidated_only_ids: consolidatedOnly,
            individual_only_ids: individualOnly,
            duplicate_groups: duplicateGroups
        },

        content_reconciliation: {
            equivalent: equivalent,
            review_required: reviewRequired
        },

        existing_validation_findings: findings,
        existing_overlap_assessments: overlapPairs,

        verification: {
            status: verification.some(item => item.status === 'FAIL')
                ? 'FAIL'
                : requiresReview
                    ? 'REVIEW'
                    : 'PASS',
            checks: verification
        },

        decision_policy: {
            automatic_merge: false,
            automatic_approval: false,
            automatic_rejection: false,
            automatic_identifier_change: false,
            original_payloads_preserved: true,
            human_review_required_for_differences: true
        }
    };
}

async function main() {
    let client;
    let transactionStarted = false;

    try {
        log('Starting domain-agnostic requirement reconciliation.');
        log(`Requirement type: ${CONFIG.requirementType}`);

        client = await pool.connect();

        await client.query(
            'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'
        );

        transactionStarted = true;

        const data = await readDatabase(client);
        const report = buildReport(data);

        await client.query('COMMIT');
        transactionStarted = false;

        fs.mkdirSync(CONFIG.outputDirectory, {
            recursive: true
        });

        const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-');

        const outputFile = path.join(
            CONFIG.outputDirectory,
            `requirements_reconciliation_${timestamp}.json`
        );

        fs.writeFileSync(
            outputFile,
            JSON.stringify(report, null, 2),
            'utf8'
        );

        console.log('\n========================================');
        console.log('RECONCILIATION COMPLETED');
        console.log('========================================');

        console.log(`Requirement type: ${CONFIG.requirementType}`);
        console.log(`Version records: ${report.summary.version_records}`);
        console.log(`Source files: ${report.summary.source_files}`);
        console.log(`Consolidated IDs: ${report.summary.consolidated_requirement_ids}`);
        console.log(`Individual IDs: ${report.summary.individual_requirement_ids}`);
        console.log(`Matched IDs: ${report.summary.matched_requirement_ids}`);
        console.log(`Equivalent content: ${report.summary.equivalent_content}`);
        console.log(`Review required: ${report.summary.content_review_required}`);
        console.log(`Consolidated only: ${report.summary.consolidated_only}`);
        console.log(`Individual only: ${report.summary.individual_only}`);
        console.log(`Duplicate groups: ${report.summary.duplicate_identifier_groups}`);
        console.log(`Total differences: ${report.summary.total_differences}`);

        console.log('\nDifference classifications:');

        for (const [classification, count] of Object.entries(
            report.summary.difference_classifications
        )) {
            console.log(`${classification}: ${count}`);
        }

        console.log('\nVerification:');

        for (const check of report.verification.checks) {
            console.log(
                `${check.status.padEnd(6)} ${check.check}: ${check.actual}`
            );
        }

        console.log(`\nOverall status: ${report.verification.status}`);
        console.log(`Report: ${outputFile}`);

        console.log('\nDATABASE CHANGES: NONE');
        console.log('AI PROCESSING: NONE');
        console.log('ORIGINAL PAYLOADS: PRESERVED');
        console.log('AUTOMATIC MERGES: NONE');
        console.log('AUTOMATIC APPROVALS: NONE');

    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error(
                    'Rollback failed:',
                    rollbackError.message
                );
            }
        }

        console.error('\nRECONCILIATION FAILED.');
        console.error(error.stack || error.message);

        process.exitCode = 1;

    } finally {
        if (client) {
            client.release();
        }

        await pool.end();
    }
}

main();
