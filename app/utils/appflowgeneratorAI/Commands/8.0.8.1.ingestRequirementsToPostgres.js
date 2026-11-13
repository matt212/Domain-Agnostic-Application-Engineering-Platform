
'use strict';

/**
 * 8.0.8.1.ingestRequirementsToPostgres.js
 *
 * FR / BR PostgreSQL ingestion.
 *
 * Imports:
 * 1. Consolidated FR JSON
 * 2. Consolidated BR JSON
 * 3. FR work files
 * 4. BR work files
 * 5. FR-to-BR relationships
 * 6. BR validation run and semantic findings
 * 7. BR portfolio overlap pairs
 * 8. BR consolidation comparison findings
 * 9. BR structural findings
 * 10. Requirement versions
 *
 * Original JSON is preserved.
 * No LLM calls.
 * No truncation.
 * One atomic transaction.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const ROOT = process.cwd();

const CONFIG = {
    database: {
        connectionString: process.env.DATABASE_URL,
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'demodb',
        user: process.env.PGUSER || process.env.USER,
        password: process.env.PGPASSWORD
    },

    files: {
        consolidatedFR:
            'app/utils/appflowgeneratorAI/aiOutput/functionalRequirements/consolidated-Functional-Requirements-12-11-26_01:11.json',

        consolidatedBR:
            //'app/utils/appflowgeneratorAI/aiOutput/businessRequirements/business_requirements-13-11-26_11:43.json',
'app/utils/appflowgeneratorAI/aiOutput/businessRequirements/business_requirements-14-11-26_00:20.json',

        frWork:
            'app/utils/appflowgeneratorAI/aiOutput/functionalRequirements/work',

        brWork:
            'app/utils/appflowgeneratorAI/aiOutput/businessRequirements/work'
    }
};

const pool = new Pool(
    CONFIG.database.connectionString
        ? { connectionString: CONFIG.database.connectionString }
        : CONFIG.database
);

function log(message, data) {
    console.log(
        `[REQUIREMENTS-INGEST] ${message}`,
        data === undefined ? '' : JSON.stringify(data, null, 2)
    );
}

function fail(message) {
    throw new Error(message);
}

function isObject(value) {
    return value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value);
}

function array(value) {
    return Array.isArray(value) ? value : [];
}

function parseJSON(value, label) {
    if (typeof value !== 'string') return value;

    try {
        return JSON.parse(value);
    } catch (error) {
        fail(`Invalid JSON in ${label}: ${error.message}`);
    }
}

function readJSON(relativePath) {
    const absolutePath = path.resolve(ROOT, relativePath);

    if (!fs.existsSync(absolutePath)) {
        fail(`File not found: ${absolutePath}`);
    }

    const buffer = fs.readFileSync(absolutePath);

    return {
        filePath: absolutePath,
        fileName: path.basename(absolutePath),
        content: parseJSON(buffer.toString('utf8'), absolutePath),
        checksum: crypto
            .createHash('sha256')
            .update(buffer)
            .digest('hex')
    };
}

function readWorkDirectory(relativePath) {
    const directory = path.resolve(ROOT, relativePath);

    if (!fs.existsSync(directory)) {
        fail(`Directory not found: ${directory}`);
    }

    return fs.readdirSync(directory)
        .filter(name => name.toLowerCase().endsWith('.json'))
        .sort()
        .map(name => readJSON(path.join(relativePath, name)));
}

function text(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return value.map(text).filter(Boolean).join(', ');
    }
    return JSON.stringify(value);
}

function first(object, keys) {
    if (!isObject(object)) return undefined;

    for (const key of keys) {
        if (
            Object.prototype.hasOwnProperty.call(object, key) &&
            object[key] !== undefined
        ) {
            return object[key];
        }
    }

    return undefined;
}

function idFromFilename(filename, type) {
    const match = String(filename || '').match(
        new RegExp(`${type}-\\d+`, 'i')
    );

    return match ? match[0].toUpperCase() : null;
}

function findID(value, type, visited = new Set()) {
    if (!value || typeof value !== 'object') return null;
    if (visited.has(value)) return null;

    visited.add(value);

    if (Array.isArray(value)) {
        for (const item of value) {
            const result = findID(item, type, visited);
            if (result) return result;
        }

        return null;
    }

    const pattern = new RegExp(`^${type}-\\d+$`, 'i');

    for (const [key, child] of Object.entries(value)) {
        if (
            typeof child === 'string' &&
            pattern.test(child.trim()) &&
            (
                /id/i.test(key) ||
                key.toLowerCase() === 'source_file'
            )
        ) {
            return child.trim().toUpperCase();
        }
    }

    for (const child of Object.values(value)) {
        const result = findID(child, type, visited);
        if (result) return result;
    }

    return null;
}

function uniqueByID(records, type) {
    const map = new Map();

    for (const record of records) {
        if (!record.id) {
            fail(`A ${type} record has no identifier.`);
        }

        if (map.has(record.id)) {
            fail(`Duplicate ${type} identifier in consolidated input: ${record.id}`);
        }

        map.set(record.id, record);
    }

    return [...map.values()];
}

/**
 * CONSOLIDATED FR
 *
 * Actual source structure:
 *
 * document.sources[]
 *   source.source_file
 *   source.original_content.result
 *
 * The source_file field identifies the FR.
 */
function extractConsolidatedFR(document) {
    const records = [];

    for (const source of array(document.sources)) {
        const sourceFile = source.source_file;

        const id =
            idFromFilename(sourceFile, 'FR') ||
            findID(source, 'FR');

        if (!id) {
            fail(
                `Cannot identify FR from source_file: ${JSON.stringify(sourceFile)}`
            );
        }

        const payload = parseJSON(
            source.original_content?.result ??
            source.result ??
            source.original_content ??
            source,
            `consolidated FR ${id}`
        );

        records.push({ id, payload });
    }

    if (!records.length) {
        fail(
            'No consolidated FR records found in document.sources[]. ' +
            'Expected source_file and original_content.result.'
        );
    }

    return uniqueByID(records, 'FR');
}

/**
 * CONSOLIDATED BR
 *
 * Actual source collection:
 * document.business_requirements[]
 */
function extractConsolidatedBR(document) {
    const records = [];

    for (const payload of array(document.business_requirements)) {
        const id = findID(payload, 'BR');

        if (!id) {
            fail('A consolidated BR record has no identifiable BR ID.');
        }

        records.push({ id, payload });
    }

    if (!records.length) {
        fail('No consolidated BR records found in business_requirements[].');
    }

    return uniqueByID(records, 'BR');
}

function extractWorkRecord(file, type) {
    const id =
        findID(file.content, type) ||
        idFromFilename(file.fileName, type);

    if (!id) {
        fail(`Cannot identify ${type} in work file ${file.fileName}`);
    }

    return {
        id,
        payload: file.content,
        file
    };
}

function getValidation(document) {
    return document.validation || {};
}

function getIndividualResults(validation) {
    return array(validation.individual_validation?.results);
}

function getOverlapPairs(validation) {
    return array(
        validation.portfolio_validation?.overlapping_pairs
    );
}

function getComparisonFindings(validation) {
    return array(
        validation.consolidated_validation
            ?.work_file_comparison_findings
    );
}

function getStructuralFindings(validation) {
    return array(
        validation.consolidated_validation
            ?.structure?.findings
    );
}

/**
 * Extract semantic findings from the individual BR work files.
 *
 * Looks for semantic.findings collections, wherever nested.
 * Preserves the original finding object.
 */
function collectSemanticFindings(root) {
    const output = [];

    function walk(value, pathParts = []) {
        if (!value || typeof value !== 'object') return;

        if (Array.isArray(value)) {
            for (const item of value) {
                walk(item, pathParts);
            }
            return;
        }

        for (const [key, child] of Object.entries(value)) {
            const next = [...pathParts, key.toLowerCase()];

            if (
                key.toLowerCase() === 'findings' &&
                next.includes('semantic') &&
                Array.isArray(child)
            ) {
                for (const finding of child) {
                    output.push(finding);
                }
                continue;
            }

            walk(child, next);
        }
    }

    walk(root);
    return output;
}

function getPairIDs(pair) {
    const brA = pair.br_a;
    const brB = pair.br_b;

    const idA =
        typeof brA === 'string'
            ? idFromFilename(brA, 'BR')
            : findID(brA, 'BR');

    const idB =
        typeof brB === 'string'
            ? idFromFilename(brB, 'BR')
            : findID(brB, 'BR');

    if (!idA || !idB) {
        fail(
            'Invalid portfolio overlap pair. Expected br_a and br_b. ' +
            JSON.stringify(pair)
        );
    }

    return [idA, idB];
}

function getStatus(value, allowed, fallback) {
    const status = String(value || '').toUpperCase();
    return allowed.includes(status) ? status : fallback;
}

function json(value) {
    return JSON.stringify(value === undefined ? null : value);
}

function findingText(finding, keys) {
    return text(first(finding, keys));
}

/* ---------------------------------------------------------
   DATABASE HELPERS
--------------------------------------------------------- */

async function insertSourceFile(client, file, artifactType, runId) {
    const result = await client.query(
        `
        INSERT INTO requirements.source_files (
            ingestion_run_id,
            artifact_type,
            file_name,
            file_path,
            file_checksum,
            raw_content,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
        RETURNING source_file_id
        `,
        [
            runId,
            artifactType,
            file.fileName,
            path.relative(ROOT, file.filePath),
            file.checksum,
            json(file.content),
            json({
                ingestion_script: '8.0.8.1',
                original_file_path: file.filePath
            })
        ]
    );

    return result.rows[0].source_file_id;
}

async function insertSourceRecord(
    client,
    sourceFileId,
    type,
    id,
    payload
) {
    await client.query(
        `
        INSERT INTO requirements.source_records (
            source_file_id,
            requirement_type,
            requirement_id,
            record_status,
            raw_record
        )
        VALUES ($1, $2, $3, 'IMPORTED', $4::jsonb)
        `,
        [sourceFileId, type, id, json(payload)]
    );
}

async function insertVersion(
    client,
    type,
    id,
    version,
    sourceFileId,
    payload,
    reason
) {
    await client.query(
        `
        INSERT INTO requirements.requirement_versions (
            requirement_type,
            requirement_id,
            version_number,
            source_file_id,
            payload,
            version_reason
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        `,
        [
            type,
            id,
            version,
            sourceFileId,
            json(payload),
            reason
        ]
    );
}

async function insertFRs(client, records, sourceFileId) {
    for (const record of records) {
        const payload = record.payload;

        await client.query(
            `
            INSERT INTO requirements.functional_requirements (
                functional_requirement_id,
                name,
                description,
                status,
                source_file_id,
                raw_payload
            )
            VALUES ($1, $2, $3, 'IMPORTED', $4, $5::jsonb)
            `,
            [
                record.id,
                text(first(payload, [
                    'requirement_name',
                    'name',
                    'title',
                    'requirement'
                ])),
                text(first(payload, [
                    'description',
                    'functional_behaviour',
                    'functional_behavior',
                    'requirement_description'
                ])),
                sourceFileId,
                json(payload)
            ]
        );

        await insertVersion(
            client,
            'FR',
            record.id,
            1,
            sourceFileId,
            payload,
            'Consolidated FR'
        );
    }
}

async function insertBRs(
    client,
    records,
    sourceFileId,
    individualResults,
    approvalStatus
) {
    const assessments = new Map();

    for (const result of individualResults) {
        const id = findID(result, 'BR');
        if (id) assessments.set(id, result);
    }

    for (const record of records) {
        const payload = record.payload;
        const assessment = assessments.get(record.id) || {};

        const status = getStatus(
            assessment.status || assessment.validation_status,
            ['PASS', 'REVIEW', 'FAIL', 'NOT_ASSESSED'],
            'NOT_ASSESSED'
        );

        await client.query(
            `
            INSERT INTO requirements.business_requirements (
                business_requirement_id,
                name,
                business_requirement,
                business_objective,
                business_value,
                stakeholders,
                success_measures,
                priority,
                policies_and_constraints,
                assumptions,
                risks_and_dependencies,
                linked_functional_requirements,
                validation_status,
                approval_status,
                source_file_id,
                raw_payload
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6::jsonb, $7::jsonb, $8,
                $9::jsonb, $10::jsonb, $11::jsonb,
                $12::jsonb, $13, $14, $15, $16::jsonb
            )
            `,
            [
                record.id,
                text(first(payload, ['name', 'title'])),
                text(first(payload, [
                    'business_requirement',
                    'requirement'
                ])),
                text(payload.business_objective),
                text(payload.business_value),
                json(payload.stakeholders ?? []),
                json(payload.success_measures ?? []),
                text(payload.priority),
                json(payload.policies_and_constraints ?? []),
                json(payload.assumptions ?? []),
                json(payload.risks_and_dependencies ?? []),
                json(payload.linked_functional_requirements ?? []),
                status,
                approvalStatus,
                sourceFileId,
                json(payload)
            ]
        );

        await insertVersion(
            client,
            'BR',
            record.id,
            1,
            sourceFileId,
            payload,
            'Consolidated BR'
        );
    }
}

async function insertWorkFiles(
    client,
    files,
    type,
    consolidatedIDs,
    runId
) {
    let count = 0;

    for (const file of files) {
        const record = extractWorkRecord(file, type);

        const artifactType =
            type === 'FR' ? 'FR_WORK_FILE' : 'BR_WORK_FILE';

        const sourceFileId = await insertSourceFile(
            client,
            file,
            artifactType,
            runId
        );

        await insertSourceRecord(
            client,
            sourceFileId,
            type,
            record.id,
            record.payload
        );

        const version = consolidatedIDs.has(record.id) ? 2 : 1;

        await insertVersion(
            client,
            type,
            record.id,
            version,
            sourceFileId,
            record.payload,
            'Individual work-file snapshot'
        );

        count++;
    }

    return count;
}

/* ---------------------------------------------------------
   RELATIONSHIPS
--------------------------------------------------------- */

function extractLinkedFRs(brPayload) {
    const links = array(brPayload.linked_functional_requirements);
    const ids = [];

    for (const link of links) {
        if (typeof link === 'string') {
            const match = link.match(/FR-\d+/i);
            if (match) ids.push(match[0].toUpperCase());
        } else {
            const id = findID(link, 'FR');
            if (id) ids.push(id);
        }
    }

    return [...new Set(ids)];
}

async function insertRelationships(
    client,
    brRecords,
    frIDs,
    brIDs,
    sourceFileId
) {
    let processed = 0;
    let inserted = 0;
    let unresolved = 0;

    for (const br of brRecords) {
        for (const frID of extractLinkedFRs(br.payload)) {
            processed++;

            if (!frIDs.has(frID) || !brIDs.has(br.id)) {
                unresolved++;
                continue;
            }

            const result = await client.query(
                `
                INSERT INTO requirements.requirement_relationships (
                    functional_requirement_pk,
                    business_requirement_pk,
                    relationship_type,
                    relationship_status,
                    source_file_id,
                    evidence
                )
                SELECT
                    fr.functional_requirement_pk,
                    br.business_requirement_pk,
                    'SUPPORTS',
                    'IMPORTED',
                    $3,
                    $4::jsonb
                FROM requirements.functional_requirements fr
                CROSS JOIN requirements.business_requirements br
                WHERE fr.functional_requirement_id = $1
                  AND br.business_requirement_id = $2
                `,
                [
                    frID,
                    br.id,
                    sourceFileId,
                    json({
                        source: 'consolidated BR',
                        linked_functional_requirement: frID,
                        business_requirement_id: br.id
                    })
                ]
            );

            inserted += result.rowCount;
        }
    }

    return { processed, inserted, unresolved };
}

/* ---------------------------------------------------------
   BR VALIDATION
--------------------------------------------------------- */

async function insertValidation(
    client,
    brDocument,
    brSourceFileId,
    brWorkFiles,
    runId,
    brCount
) {
    const validation = getValidation(brDocument);
    const individual = getIndividualResults(validation);

    const passCount = individual.filter(
        item => String(item.status).toUpperCase() === 'PASS'
    ).length;

    const reviewCount = individual.filter(
        item => String(item.status).toUpperCase() === 'REVIEW'
    ).length;

    const failCount = individual.filter(
        item => String(item.status).toUpperCase() === 'FAIL'
    ).length;

    const status = getStatus(
        validation.status,
        ['PASS', 'REVIEW', 'FAIL', 'PARTIAL'],
        'PARTIAL'
    );

    const validationResult = await client.query(
        `
        INSERT INTO requirements.br_validation_runs (
            ingestion_run_id,
            validation_version,
            validator,
            validation_method,
            validation_status,
            total_requirements,
            pass_count,
            review_count,
            fail_count,
            validation_summary,
            source_file_id,
            validated_at
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10::jsonb, $11, $12
        )
        RETURNING validation_run_id
        `,
        [
            runId,
            validation.validation_version || null,
            validation.validator || null,
            validation.method || validation.validation_method || null,
            status,
            individual.length || brCount,
            passCount,
            reviewCount,
            failCount,
            json(validation),
            brSourceFileId,
            validation.validated_at || null
        ]
    );

    const validationRunId =
        validationResult.rows[0].validation_run_id;

    let findingCount = 0;

    for (const file of brWorkFiles) {
        const brID = extractWorkRecord(file, 'BR').id;
        const findings = collectSemanticFindings(file.content);

        for (const finding of findings) {
            const findingID = findID(finding, 'BR') || brID;

            const brLookup = await client.query(
                `
                SELECT business_requirement_pk
                FROM requirements.business_requirements
                WHERE business_requirement_id = $1
                `,
                [findingID]
            );

            await client.query(
                `
                INSERT INTO requirements.br_validation_findings (
                    validation_run_id,
                    business_requirement_pk,
                    requirement_id,
                    dimension,
                    severity,
                    finding,
                    evidence,
                    recommendation,
                    raw_finding
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9::jsonb
                )
                `,
                [
                    validationRunId,
                    brLookup.rows[0]?.business_requirement_pk || null,
                    findingID,
                    findingText(finding, [
                        'dimension',
                        'category',
                        'type',
                        'validation_dimension'
                    ]),
                    findingText(finding, [
                        'severity',
                        'level',
                        'status'
                    ]),
                    findingText(finding, [
                        'finding',
                        'description',
                        'issue',
                        'message'
                    ]),
                    findingText(finding, [
                        'evidence',
                        'supporting_evidence'
                    ]),
                    findingText(finding, [
                        'recommendation',
                        'suggestion',
                        'resolution'
                    ]),
                    json(finding)
                ]
            );

            findingCount++;
        }
    }

    return {
        validationRunId,
        individualAssessments: individual.length,
        findings: findingCount,
        status
    };
}

/* ---------------------------------------------------------
   BR CONSOLIDATION
--------------------------------------------------------- */

async function insertConsolidationFinding(
    client,
    consolidationRunId,
    finding,
    findingType
) {
    const requirementID = findID(finding, 'BR');

    const consolidatedValue = first(finding, [
        'consolidated_value',
        'consolidated',
        'current_value',
        'target_value'
    ]);

    const workValue = first(finding, [
        'work_file_value',
        'work_file',
        'source_value',
        'original_value'
    ]);

    await client.query(
        `
        INSERT INTO requirements.br_consolidation_findings (
            consolidation_run_id,
            requirement_id,
            finding_type,
            severity,
            field_name,
            consolidated_value,
            work_file_value,
            finding_description,
            recommendation,
            raw_finding
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6::jsonb, $7::jsonb, $8, $9, $10::jsonb
        )
        `,
        [
            consolidationRunId,
            requirementID,
            findingType,
            findingText(finding, ['severity', 'level', 'status']),
            findingText(finding, [
                'field',
                'field_name',
                'attribute',
                'property',
                'changed_field'
            ]),
            consolidatedValue === undefined ? null : json(consolidatedValue),
            workValue === undefined ? null : json(workValue),
            findingText(finding, [
                'finding',
                'description',
                'difference',
                'issue',
                'message',
                'reason'
            ]) || JSON.stringify(finding),
            findingText(finding, [
                'recommendation',
                'suggestion',
                'resolution'
            ]),
            json(finding)
        ]
    );
}

async function insertConsolidation(
    client,
    brDocument,
    brSourceFileId,
    runId,
    brCount
) {
    const validation = getValidation(brDocument);

    const portfolio = validation.portfolio_validation || {};
    const consolidated = validation.consolidated_validation || {};

    const overlaps = getOverlapPairs(validation);
    const comparisons = getComparisonFindings(validation);
    const structural = getStructuralFindings(validation);

    const result = await client.query(
        `
        INSERT INTO requirements.br_consolidation_runs (
            ingestion_run_id,
            consolidation_method,
            consolidation_status,
            total_requirements,
            overlap_pair_count,
            confirmed_duplicate_count,
            consolidation_summary,
            source_file_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        RETURNING consolidation_run_id
        `,
        [
            runId,
            portfolio.method || consolidated.method || null,
            portfolio.status || consolidated.status || validation.status || 'REVIEW',
            brCount,
            overlaps.length,
            array(portfolio.confirmed_duplicates).length,
            json({
                portfolio_validation: portfolio,
                consolidated_validation: consolidated
            }),
            brSourceFileId
        ]
    );

    const consolidationRunId =
        result.rows[0].consolidation_run_id;

    // Import every overlap pair.
    for (const pair of overlaps) {
        const [brA, brB] = getPairIDs(pair);

        await client.query(
            `
            INSERT INTO requirements.br_overlap_pairs (
                consolidation_run_id,
                business_requirement_1,
                business_requirement_2,
                overlap_type,
                overlap_status,
                reason,
                overlapping_scope,
                recommendation,
                raw_assessment
            )
            VALUES (
                $1, $2, $3, $4, 'UNRESOLVED',
                $5, $6, $7, $8::jsonb
            )
            `,
            [
                consolidationRunId,
                brA,
                brB,
                text(first(pair, [
                    'classification',
                    'overlap_type',
                    'type'
                ])),
                text(first(pair, [
                    'reason',
                    'description',
                    'finding'
                ])),
                text(first(pair, [
                    'overlapping_scope',
                    'scope'
                ])),
                text(first(pair, [
                    'recommendation',
                    'suggestion'
                ])),
                json(pair)
            ]
        );
    }

    // Import all work-file comparison findings.
    for (const finding of comparisons) {
        await insertConsolidationFinding(
            client,
            consolidationRunId,
            finding,
            'WORK_FILE_COMPARISON'
        );
    }

    // Import structural findings separately.
    for (const finding of structural) {
        await insertConsolidationFinding(
            client,
            consolidationRunId,
            finding,
            'STRUCTURAL'
        );
    }

    return {
        consolidationRunId,
        overlapPairs: overlaps.length,
        comparisonFindings: comparisons.length,
        structuralFindings: structural.length
    };
}

/* ---------------------------------------------------------
   DATABASE SAFETY AND VERIFICATION
--------------------------------------------------------- */

async function verifyEmpty(client) {
    const result = await client.query(`
        SELECT
            (SELECT COUNT(*) FROM requirements.ingestion_runs) AS ingestion_runs,
            (SELECT COUNT(*) FROM requirements.source_files) AS source_files,
            (SELECT COUNT(*) FROM requirements.source_records) AS source_records,
            (SELECT COUNT(*) FROM requirements.functional_requirements) AS fr,
            (SELECT COUNT(*) FROM requirements.business_requirements) AS br,
            (SELECT COUNT(*) FROM requirements.requirement_versions) AS versions,
            (SELECT COUNT(*) FROM requirements.requirement_relationships) AS relationships,
            (SELECT COUNT(*) FROM requirements.br_validation_runs) AS validation_runs,
            (SELECT COUNT(*) FROM requirements.br_validation_findings) AS validation_findings,
            (SELECT COUNT(*) FROM requirements.br_consolidation_runs) AS consolidation_runs,
            (SELECT COUNT(*) FROM requirements.br_overlap_pairs) AS overlap_pairs,
            (SELECT COUNT(*) FROM requirements.br_consolidation_findings) AS consolidation_findings,
            (SELECT COUNT(*) FROM requirements.br_consolidation_decisions) AS decisions,
            (SELECT COUNT(*) FROM requirements.br_alternatives) AS alternatives
    `);

    const counts = result.rows[0];

    const populated = Object.entries(counts)
        .filter(([, count]) => Number(count) !== 0);

    if (populated.length) {
        fail(
            'Target tables are not empty. No data was inserted. ' +
            JSON.stringify(counts)
        );
    }
}

async function getCounts(client) {
    const tables = [
        'ingestion_runs',
        'source_files',
        'source_records',
        'functional_requirements',
        'business_requirements',
        'requirement_versions',
        'requirement_relationships',
        'br_validation_runs',
        'br_validation_findings',
        'br_consolidation_runs',
        'br_overlap_pairs',
        'br_consolidation_findings',
        'br_consolidation_decisions',
        'br_alternatives'
    ];

    const output = {};

    for (const table of tables) {
        const result = await client.query(
            `SELECT COUNT(*)::int AS count FROM requirements.${table}`
        );

        output[table] = result.rows[0].count;
    }

    return output;
}

/* ---------------------------------------------------------
   MAIN
--------------------------------------------------------- */

async function main() {
    let client;
    let transaction = false;

    try {
        log('Starting FR/BR PostgreSQL ingestion.');
        log(`Database: ${CONFIG.database.database}`);

        // Read every input before touching PostgreSQL.
        const frFile = readJSON(CONFIG.files.consolidatedFR);
        const brFile = readJSON(CONFIG.files.consolidatedBR);

        const frWorkFiles = readWorkDirectory(CONFIG.files.frWork);
        const brWorkFiles = readWorkDirectory(CONFIG.files.brWork);

        // Extract consolidated records.
        const frRecords = extractConsolidatedFR(frFile.content);
        const brRecords = extractConsolidatedBR(brFile.content);

        // Validate work-file identifiers before the transaction.
        const frWorkRecords = frWorkFiles.map(
            file => extractWorkRecord(file, 'FR')
        );

        const brWorkRecords = brWorkFiles.map(
            file => extractWorkRecord(file, 'BR')
        );

        const validation = getValidation(brFile.content);

        const overlaps = getOverlapPairs(validation);
        const comparisons = getComparisonFindings(validation);
        const structural = getStructuralFindings(validation);
        const individual = getIndividualResults(validation);

        // Validate overlap pair extraction before database writes.
        for (const pair of overlaps) {
            getPairIDs(pair);
        }

        // Validate unique work-file IDs.
        const validateWorkIDs = (records, type) => {
            const seen = new Set();

            for (const record of records) {
                if (seen.has(record.id)) {
                    fail(`Duplicate ${type} work-file ID: ${record.id}`);
                }
                seen.add(record.id);
            }
        };

        validateWorkIDs(frWorkRecords, 'FR');
        validateWorkIDs(brWorkRecords, 'BR');

        // Extract semantic findings before database writes.
        const semanticFindingCount = brWorkFiles.reduce(
            (total, file) =>
                total + collectSemanticFindings(file.content).length,
            0
        );

        log('Input extraction completed:', {
            consolidatedFR: frRecords.length,
            consolidatedBR: brRecords.length,
            frWorkFiles: frWorkFiles.length,
            brWorkFiles: brWorkFiles.length,
            individualAssessments: individual.length,
            semanticFindings: semanticFindingCount,
            overlapPairs: overlaps.length,
            comparisonFindings: comparisons.length,
            structuralFindings: structural.length
        });

        client = await pool.connect();

        await client.query('BEGIN');
        transaction = true;

        await client.query(
            `SELECT pg_advisory_xact_lock(hashtext('requirements_clean_ingestion'))`
        );

        await verifyEmpty(client);

        // Create ingestion run.
        const runResult = await client.query(
            `
            INSERT INTO requirements.ingestion_runs (
                run_type,
                status,
                source_description,
                statistics
            )
            VALUES (
                'FR_BR_INITIAL_INGESTION',
                'STARTED',
                'Consolidated FR/BR and work-file ingestion',
                '{}'::jsonb
            )
            RETURNING ingestion_run_id
            `
        );

        const runId = runResult.rows[0].ingestion_run_id;

        // 1. Preserve consolidated source files.
        const frSourceId = await insertSourceFile(
            client,
            frFile,
            'CONSOLIDATED_FR',
            runId
        );

        const brSourceId = await insertSourceFile(
            client,
            brFile,
            'CONSOLIDATED_BR',
            runId
        );

        // 2. Import consolidated FR and BR records.
        await insertFRs(client, frRecords, frSourceId);

        const approvalStatus = getStatus(
            brFile.content.approval?.status ||
            validation.approval?.status,
            ['NOT_APPROVED', 'PENDING', 'APPROVED', 'REJECTED'],
            'NOT_APPROVED'
        );

        await insertBRs(
            client,
            brRecords,
            brSourceId,
            individual,
            approvalStatus
        );

        // 3. Import work files and preserve snapshots.
        const frWorkStored = await insertWorkFiles(
            client,
            frWorkFiles,
            'FR',
            new Set(frRecords.map(record => record.id)),
            runId
        );

        const brWorkStored = await insertWorkFiles(
            client,
            brWorkFiles,
            'BR',
            new Set(brRecords.map(record => record.id)),
            runId
        );

        // 4. Import structural FR-to-BR links.
        const relationshipResult = await insertRelationships(
            client,
            brRecords,
            new Set(frRecords.map(record => record.id)),
            new Set(brRecords.map(record => record.id)),
            brSourceId
        );

        // 5. Import BR validation.
        const validationResult = await insertValidation(
            client,
            brFile.content,
            brSourceId,
            brWorkFiles,
            runId,
            brRecords.length
        );

        // 6. Import portfolio overlaps and consolidation findings.
        const consolidationResult = await insertConsolidation(
            client,
            brFile.content,
            brSourceId,
            runId,
            brRecords.length
        );

        // 7. Update ingestion run.
        const statistics = {
            consolidated_fr_count: frRecords.length,
            consolidated_br_count: brRecords.length,
            fr_work_files_discovered: frWorkFiles.length,
            fr_work_files_stored: frWorkStored,
            br_work_files_discovered: brWorkFiles.length,
            br_work_files_stored: brWorkStored,
            relationship_records_processed: relationshipResult.processed,
            relationship_records_inserted: relationshipResult.inserted,
            unresolved_fr_references: relationshipResult.unresolved,
            validation_run_id: validationResult.validationRunId,
            individual_assessments: validationResult.individualAssessments,
            validation_findings: validationResult.findings,
            consolidation_run_id: consolidationResult.consolidationRunId,
            overlap_pairs: consolidationResult.overlapPairs,
            comparison_findings: consolidationResult.comparisonFindings,
            structural_findings: consolidationResult.structuralFindings
        };

        await client.query(
            `
            UPDATE requirements.ingestion_runs
            SET
                status = 'COMPLETED',
                completed_at = NOW(),
                statistics = $2::jsonb
            WHERE ingestion_run_id = $1
            `,
            [runId, json(statistics)]
        );

        // Verify source file and core record counts before commit.
        const counts = await getCounts(client);

        const expectedSourceFiles =
            2 + frWorkFiles.length + brWorkFiles.length;

        const expectedSourceRecords =
            frWorkFiles.length + brWorkFiles.length;

        if (counts.source_files !== expectedSourceFiles) {
            fail(
                `Source-file verification failed: expected ${expectedSourceFiles}, ` +
                `found ${counts.source_files}`
            );
        }

        if (counts.source_records !== expectedSourceRecords) {
            fail(
                `Source-record verification failed: expected ${expectedSourceRecords}, ` +
                `found ${counts.source_records}`
            );
        }

        if (counts.functional_requirements !== frRecords.length) {
            fail('Functional requirement count verification failed.');
        }

        if (counts.business_requirements !== brRecords.length) {
            fail('Business requirement count verification failed.');
        }

        if (counts.br_overlap_pairs !== overlaps.length) {
            fail('BR overlap pair verification failed.');
        }

        if (
            counts.br_consolidation_findings !==
            comparisons.length + structural.length
        ) {
            fail('BR consolidation finding verification failed.');
        }

        await client.query('COMMIT');
        transaction = false;

        log('INGESTION COMPLETED SUCCESSFULLY');
        log(`Ingestion run ID: ${runId}`);
        log('Ingestion statistics:', statistics);
        log('Final database counts:', counts);

        console.log('\nDATABASE COUNTS');
        console.table(
            Object.entries(counts).map(([table, count]) => ({
                table,
                count
            }))
        );

        console.log('\nConsolidation decisions: not created.');
        console.log('BR alternatives: not created.');
        console.log('Original JSON preserved.');
        console.log('No AI processing performed.');

    } catch (error) {
        if (client && transaction) {
            try {
                await client.query('ROLLBACK');
                log('Transaction rolled back.');
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError.message);
            }
        }

        console.error('\nINGESTION FAILED.');
        console.error(error.stack || error.message);
        process.exitCode = 1;

    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main();
