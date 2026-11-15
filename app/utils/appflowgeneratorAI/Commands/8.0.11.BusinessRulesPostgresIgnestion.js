
'use strict';

/**
 * BUSINESS RULE DISCOVERY - POSTGRESQL INGESTION
 *
 * File:
 *   app/utils/appflowgeneratorAI/Commands/BusinessRule_Ingestion.js
 *
 * Source:
 *   app/utils/appflowgeneratorAI/aiOutput/businessRules/
 *     context.json
 *     plan.json
 *     batches/*.json
 *     units/*.json
 *
 * Target schema:
 *   business_rule_discovery
 *
 * Tables populated:
 *   generation_runs
 *   ingestion_runs
 *   source_artifacts
 *   generation_units
 *   business_rules
 *
 * IMPORTANT:
 *   - Does not create or alter database tables.
 *   - Every execution creates a new ingestion attempt.
 *   - Same source content resolves to the same generation run.
 *   - All source artifacts are retained.
 *   - Business rules are inserted from batch files only.
 *   - Unit files are retained and reconciled against batch rules.
 *   - No foreign keys or domain-specific hardcoding.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

// ------------------------------------------------------------
// 1. PATHS AND DATABASE CONFIGURATION
// ------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../../../');

const DB_CONFIG_PATH = path.join(
    ROOT,
    'app/config/config.json'
);

const SOURCE_ROOT = path.join(
    ROOT,
    'app/utils/appflowgeneratorAI/aiOutput/businessRules'
);

const BATCH_DIRECTORY = path.join(SOURCE_ROOT, 'batches');
const UNIT_DIRECTORY = path.join(SOURCE_ROOT, 'units');

const SCHEMA = 'business_rule_discovery';

function createPool() {
    if (!fs.existsSync(DB_CONFIG_PATH)) {
        throw new Error(
            `Database configuration not found: ${DB_CONFIG_PATH}`
        );
    }

    const config = JSON.parse(
        fs.readFileSync(DB_CONFIG_PATH, 'utf8')
    ).development;

    if (!config) {
        throw new Error(
            'The development database configuration is missing.'
        );
    }

    return new Pool({
        user: config.username,
        password: config.password,
        database: config.database,
        host: config.host,
        port: Number(config.port),
        max: 2
    });
}

// ------------------------------------------------------------
// 2. GENERAL HELPERS
// ------------------------------------------------------------

function sha256(value) {
    return crypto
        .createHash('sha256')
        .update(value)
        .digest('hex');
}

function jsonValue(value, fallback = null) {
    if (value === undefined || value === null) {
        return fallback === null ? null : JSON.stringify(fallback);
    }

    return JSON.stringify(value);
}

function textValue(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    if (Array.isArray(value)) {
        return value.map(item => {
            if (typeof item === 'string') return item;
            return JSON.stringify(item);
        }).join('\n');
    }

    return JSON.stringify(value);
}

function arrayValue(value) {
    if (value === undefined || value === null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

function nullableIdentifier(value) {
    if (
        value === undefined ||
        value === null ||
        value === ''
    ) {
        return null;
    }

    if (
        typeof value === 'string' ||
        typeof value === 'number'
    ) {
        return String(value);
    }

    return null;
}

function normalizeUnitKind(value) {
    const normalized = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_');

    if (
        normalized !== 'BUSINESS_REQUIREMENT' &&
        normalized !== 'BUSINESS_OBJECT'
    ) {
        throw new Error(
            `Unsupported generation unit kind: ${value}`
        );
    }

    return normalized;
}

function extractBatchNumber(value) {
    if (value === undefined || value === null) {
        return null;
    }

    if (typeof value === 'number' && Number.isInteger(value)) {
        return value;
    }

    const match = String(value).match(/(\d+)\s*$/);

    return match ? Number(match[1]) : null;
}

function canonicalJson(value) {
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const keys = Object.keys(value).sort();

        return `{${keys.map(key =>
            `${JSON.stringify(key)}:${canonicalJson(value[key])}`
        ).join(',')}}`;
    }

    return JSON.stringify(value);
}

function removeUnitId(rule) {
    const copy = { ...rule };

    // Batch-specific identifier already represented by the parent unit.
    delete copy.unit_id;

    // These are added by the ingestion script,
    // not part of the original generated business rule.
    delete copy.batch_number;
    delete copy.source_file;
    delete copy.source_position;

    return copy;
}

function multisetSignatures(rules) {
    return rules
        .map(rule => canonicalJson(removeUnitId(rule)))
        .sort();
}

function sameRuleMultiset(left, right) {
    const a = multisetSignatures(left);
    const b = multisetSignatures(right);

    return (
        a.length === b.length &&
        a.every((signature, index) => signature === b[index])
    );
}

function log(message) {
    console.log(
        `[${new Date().toISOString()}] ${message}`
    );
}

// ------------------------------------------------------------
// 3. DISCOVER SOURCE FILES
// ------------------------------------------------------------

function discoverSourceFiles() {
    if (!fs.existsSync(SOURCE_ROOT)) {
        throw new Error(
            `Business rules source directory not found: ${SOURCE_ROOT}`
        );
    }

    if (!fs.existsSync(BATCH_DIRECTORY)) {
        throw new Error(
            `Batch directory not found: ${BATCH_DIRECTORY}`
        );
    }

    if (!fs.existsSync(UNIT_DIRECTORY)) {
        throw new Error(
            `Unit directory not found: ${UNIT_DIRECTORY}`
        );
    }

    const requiredFiles = [
        path.join(SOURCE_ROOT, 'context.json'),
        path.join(SOURCE_ROOT, 'plan.json')
    ];

    for (const file of requiredFiles) {
        if (!fs.existsSync(file)) {
            throw new Error(`Required source file missing: ${file}`);
        }
    }

    const batchFiles = fs.readdirSync(BATCH_DIRECTORY)
        .filter(file => file.toLowerCase().endsWith('.json'))
        .sort()
        .map(file => path.join(BATCH_DIRECTORY, file));

    const unitFiles = fs.readdirSync(UNIT_DIRECTORY)
        .filter(file => file.toLowerCase().endsWith('.json'))
        .sort()
        .map(file => path.join(UNIT_DIRECTORY, file));

    const files = [
        ...requiredFiles,
        ...batchFiles,
        ...unitFiles
    ];

    if (batchFiles.length === 0) {
        throw new Error('No batch JSON files were found.');
    }

    if (unitFiles.length === 0) {
        throw new Error('No unit JSON files were found.');
    }

    return files.map(absolutePath => {
        const relativePath = path.relative(
            SOURCE_ROOT,
            absolutePath
        ).split(path.sep).join('/');

        const buffer = fs.readFileSync(absolutePath);
        const rawText = buffer.toString('utf8');

        return {
            absolutePath,
            relativePath,
            fileName: path.basename(absolutePath),
            rawText,
            checksum: sha256(buffer)
        };
    });
}

function identifyArtifactType(relativePath) {
    if (relativePath === 'context.json') return 'CONTEXT';
    if (relativePath === 'plan.json') return 'PLAN';

    if (relativePath.startsWith('batches/')) {
        return 'BATCH';
    }

    if (relativePath.startsWith('units/')) {
        return 'UNIT';
    }

    throw new Error(
        `Unknown source artifact path: ${relativePath}`
    );
}

function parseSourceFiles(files) {
    const parsed = new Map();

    for (const file of files) {
        try {
            parsed.set(
                file.relativePath,
                JSON.parse(file.rawText)
            );
        } catch (error) {
            throw new Error(
                `Invalid JSON in ${file.relativePath}: ${error.message}`
            );
        }
    }

    return parsed;
}

// ------------------------------------------------------------
// 4. GENERATION FINGERPRINT
// ------------------------------------------------------------

function calculateGenerationFingerprint(files) {
    const sourceManifest = files
        .map(file => ({
            path: file.relativePath,
            checksum: file.checksum
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

    return sha256(canonicalJson(sourceManifest));
}

function buildRunReference(fingerprint) {
    return `BRD-${fingerprint}`;
}

// ------------------------------------------------------------
// 5. GENERATION RUN
// ------------------------------------------------------------

async function getOrCreateGenerationRun(
    client,
    runReference,
    context
) {
    const metadata =
        context && typeof context === 'object'
            ? (context.metadata || {})
            : {};

    const generatorName =
        metadata.generator_name ||
        metadata.generator ||
        'Business Rule Discovery';

    const generatorVersion =
        metadata.generator_version ||
        metadata.version ||
        null;

    const modelName =
        metadata.model_name ||
        metadata.model ||
        null;

    await client.query(
        `
        INSERT INTO ${SCHEMA}.generation_runs
        (
            run_reference,
            generator_name,
            generator_version,
            model_name,
            generation_status,
            started_at,
            completed_at,
            statistics,
            metadata
        )
        VALUES
        (
            $1, $2, $3, $4,
            'COMPLETED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            '{}'::JSONB,
            $5::JSONB
        )
        ON CONFLICT (run_reference) DO NOTHING
        `,
        [
            runReference,
            generatorName,
            generatorVersion,
            modelName,
            jsonValue({
                source: 'businessRules',
                source_directory: 'aiOutput/businessRules'
            }, {})
        ]
    );

    const result = await client.query(
        `
        SELECT generation_run_id, run_reference
        FROM ${SCHEMA}.generation_runs
        WHERE run_reference = $1
        `,
        [runReference]
    );

    if (result.rowCount !== 1) {
        throw new Error(
            `Unable to resolve generation run: ${runReference}`
        );
    }

    return result.rows[0];
}

// ------------------------------------------------------------
// 6. CREATE A DISTINCT INGESTION ATTEMPT
// ------------------------------------------------------------

async function createIngestionRun(
    client,
    generationRunId,
    metadata
) {
    const result = await client.query(
        `
        INSERT INTO ${SCHEMA}.ingestion_runs
        (
            generation_run_id,
            ingestion_number,
            ingestion_status,
            ingestion_mode,
            started_at,
            records_read,
            records_inserted,
            records_updated,
            records_skipped,
            records_failed,
            error_details,
            metadata
        )
        SELECT
            $1,
            COALESCE(MAX(ingestion_number), 0) + 1,
            'RUNNING',
            'FULL',
            CURRENT_TIMESTAMP,
            0, 0, 0, 0, 0,
            '[]'::JSONB,
            $2::JSONB
        FROM ${SCHEMA}.ingestion_runs
        WHERE generation_run_id = $1
        RETURNING ingestion_run_id, ingestion_number
        `,
        [
            generationRunId,
            jsonValue(metadata, {})
        ]
    );

    return result.rows[0];
}

// ------------------------------------------------------------
// 7. LOAD AND VALIDATE PLAN UNITS
// ------------------------------------------------------------

function buildPlanUnits(plan) {
    // Actual generated plan.json is a root-level array.
    // Also support the alternative { units: [...] } structure.
    const units = Array.isArray(plan)
        ? plan
        : plan && Array.isArray(plan.units)
            ? plan.units
            : null;

    if (!units) {
        throw new Error(
            'plan.json must be a JSON array or an object containing a units array.'
        );
    }

    const unitMap = new Map();

    for (const unit of units) {
        if (!unit || !unit.unit_id) {
            throw new Error(
                'A plan unit is missing unit_id.'
            );
        }

        const unitId = String(unit.unit_id);

        if (unitMap.has(unitId)) {
            throw new Error(
                `Duplicate unit_id in plan.json: ${unitId}`
            );
        }

        const unitKind = normalizeUnitKind(unit.kind);

        unitMap.set(unitId, {
            ...unit,
            unit_id: unitId,
            normalized_kind: unitKind
        });
    }

    return unitMap;
}

// ------------------------------------------------------------
// 8. LOAD BATCH RULES
// ------------------------------------------------------------

function buildBatchData(files, parsed, unitMap) {
    const batchFiles = files.filter(
        file => identifyArtifactType(file.relativePath) === 'BATCH'
    );

    const allRules = [];
    const warnings = [];
    const batchUnitMembership = new Map();

    for (const file of batchFiles) {
        const batch = parsed.get(file.relativePath);

        if (!batch || !Array.isArray(batch.rules)) {
            throw new Error(
                `Batch file must contain a rules array: ${file.relativePath}`
            );
        }

        const batchNumber = extractBatchNumber(
            batch.batch || file.fileName
        );

        const declaredUnits = arrayValue(batch.units)
            .map(value => {
                if (typeof value === 'string') return value;
                if (value && value.unit_id) return String(value.unit_id);
                return null;
            })
            .filter(Boolean);

        for (const unitId of declaredUnits) {
            batchUnitMembership.set(unitId, file.relativePath);

            if (!unitMap.has(unitId)) {
                throw new Error(
                    `Batch ${file.fileName} declares unknown unit ${unitId}.`
                );
            }
        }

        for (let index = 0; index < batch.rules.length; index++) {
            const rule = batch.rules[index];

            if (!rule || !rule.unit_id) {
                throw new Error(
                    `Rule ${index + 1} in ${file.relativePath} has no unit_id.`
                );
            }

            const unitId = String(rule.unit_id);

            if (!unitMap.has(unitId)) {
                throw new Error(
                    `Rule in ${file.fileName} references unknown unit ${unitId}.`
                );
            }

            if (
                declaredUnits.length > 0 &&
                !declaredUnits.includes(unitId)
            ) {
                warnings.push({
                    type: 'BATCH_MEMBERSHIP_MISMATCH',
                    file: file.relativePath,
                    unit_id: unitId,
                    message: 'Rule unit_id is not listed in batch.units.'
                });
            }

            if (
                typeof rule.name !== 'string' ||
                !rule.name.trim()
            ) {
                throw new Error(
                    `Rule for unit ${unitId} in ${file.fileName} has no name.`
                );
            }

            if (
                typeof rule.statement !== 'string' ||
                !rule.statement.trim()
            ) {
                throw new Error(
                    `Rule "${rule.name}" in ${file.fileName} has no statement.`
                );
            }

            allRules.push({
                ...rule,
                unit_id: unitId,
                batch_number: batchNumber,
                source_file: file.relativePath,
                source_position: index + 1
            });
        }
    }

    return {
        batchFiles,
        allRules,
        warnings,
        batchUnitMembership
    };
}

// ------------------------------------------------------------
// 9. RECONCILE BATCH RULES AGAINST UNIT FILES
// ------------------------------------------------------------

function reconcileUnitFiles(
    files,
    parsed,
    batchRules,
    unitMap
) {
    const warnings = [];
    const unitFiles = files.filter(
        file => identifyArtifactType(file.relativePath) === 'UNIT'
    );

    const unitFileMap = new Map();

    for (const file of unitFiles) {
        const payload = parsed.get(file.relativePath);

        if (!payload || !payload.unit_id) {
            warnings.push({
                type: 'INVALID_UNIT_ARTIFACT',
                file: file.relativePath,
                message: 'Unit file does not contain unit_id.'
            });
            continue;
        }

        const unitId = String(payload.unit_id);

        if (unitFileMap.has(unitId)) {
            throw new Error(
                `Multiple unit files found for unit_id ${unitId}.`
            );
        }

        unitFileMap.set(unitId, {
            file,
            payload
        });

        if (!unitMap.has(unitId)) {
            warnings.push({
                type: 'UNKNOWN_UNIT_ARTIFACT',
                file: file.relativePath,
                unit_id: unitId,
                message: 'Unit file is not present in plan.json.'
            });
        }
    }

    const batchRulesByUnit = new Map();

    for (const rule of batchRules) {
        if (!batchRulesByUnit.has(rule.unit_id)) {
            batchRulesByUnit.set(rule.unit_id, []);
        }

        batchRulesByUnit.get(rule.unit_id).push(rule);
    }

    for (const [unitId, unit] of unitMap.entries()) {
        const unitArtifact = unitFileMap.get(unitId);
        const batchUnitRules = batchRulesByUnit.get(unitId) || [];

        if (!unitArtifact) {
            warnings.push({
                type: 'MISSING_UNIT_ARTIFACT',
                unit_id: unitId,
                message: 'No individual unit JSON file was found.'
            });
            continue;
        }

        const individualRules = Array.isArray(
            unitArtifact.payload.rules
        )
            ? unitArtifact.payload.rules
            : [];

        if (!Array.isArray(unitArtifact.payload.rules)) {
            warnings.push({
                type: 'INVALID_UNIT_RULES',
                unit_id: unitId,
                file: unitArtifact.file.relativePath,
                message: 'Unit artifact does not contain a rules array.'
            });
            continue;
        }

        if (
            !sameRuleMultiset(
                batchUnitRules,
                individualRules
            )
        ) {
            warnings.push({
                type: 'BATCH_UNIT_RULE_MISMATCH',
                unit_id: unitId,
                batch_rule_count: batchUnitRules.length,
                unit_rule_count: individualRules.length,
                file: unitArtifact.file.relativePath,
                message:
                    'Batch and unit rule content differs. Batch records remain the ingestion source.'
            });
        }
    }

    for (const unitId of unitFileMap.keys()) {
        if (!unitMap.has(unitId)) continue;

        if (!batchRulesByUnit.has(unitId)) {
            warnings.push({
                type: 'UNIT_WITHOUT_BATCH_RULES',
                unit_id: unitId,
                message: 'Unit artifact has no corresponding batch rules.'
            });
        }
    }

    return {
        unitFiles,
        warnings,
        unitFileMap
    };
}

// ------------------------------------------------------------
// 10. INSERT SOURCE ARTIFACTS
// ------------------------------------------------------------

async function insertSourceArtifacts(
    client,
    files,
    parsed,
    generationRunId,
    ingestionRunId
) {
    let inserted = 0;

    for (const file of files) {
        const artifactType = identifyArtifactType(
            file.relativePath
        );

        const rawContent = parsed.get(file.relativePath);

        await client.query(
            `
            INSERT INTO ${SCHEMA}.source_artifacts
            (
                generation_run_id,
                ingestion_run_id,
                artifact_type,
                file_name,
                file_path,
                file_checksum,
                raw_content
            )
            VALUES
            (
                $1, $2, $3, $4, $5, $6, $7::JSONB
            )
            `,
            [
                generationRunId,
                ingestionRunId,
                artifactType,
                file.fileName,
                file.relativePath,
                file.checksum,
                jsonValue(rawContent, {})
            ]
        );

        inserted++;
    }

    return inserted;
}

// ------------------------------------------------------------
// 11. INSERT GENERATION UNITS
// ------------------------------------------------------------

async function insertGenerationUnits(
    client,
    unitMap,
    generationRunId,
    ingestionRunId
) {
    let inserted = 0;

    for (const unit of unitMap.values()) {
        const statements = arrayValue(unit.statements);
        const frs = arrayValue(unit.frs);
        const actors = arrayValue(unit.actors);
        const objects = arrayValue(unit.objects);

        await client.query(
            `
            INSERT INTO ${SCHEMA}.generation_units
            (
                generation_run_id,
                ingestion_run_id,
                unit_id,
                unit_kind,
                title,
                brief,
                batch_number,
                statements,
                functional_requirement_ids,
                business_requirement_id,
                actor_ids,
                object_ids,
                raw_payload
            )
            VALUES
            (
                $1, $2, $3, $4, $5, $6, $7,
                $8::JSONB,
                $9::JSONB,
                $10,
                $11::JSONB,
                $12::JSONB,
                $13::JSONB
            )
            `,
            [
                generationRunId,
                ingestionRunId,
                unit.unit_id,
                unit.normalized_kind,
                textValue(unit.title),
                textValue(unit.brief),
                extractBatchNumber(unit.batch),
                jsonValue(statements, []),
                jsonValue(frs, []),
                nullableIdentifier(unit.br),
                jsonValue(actors, []),
                jsonValue(objects, []),
                jsonValue(unit, {})
            ]
        );

        inserted++;
    }

    return inserted;
}

// ------------------------------------------------------------
// 12. INSERT BUSINESS RULES
// ------------------------------------------------------------

async function insertBusinessRules(
    client,
    rules,
    generationRunId,
    ingestionRunId
) {
    const positions = new Map();
    let inserted = 0;

    for (const rule of rules) {
        const unitId = rule.unit_id;

        const nextPosition = (positions.get(unitId) || 0) + 1;
        positions.set(unitId, nextPosition);

        await client.query(
            `
            INSERT INTO ${SCHEMA}.business_rules
            (
                generation_run_id,
                ingestion_run_id,
                unit_id,
                rule_position,
                batch_number,
                name,
                statement,
                type,
                condition,
                exceptions,
                actors,
                objects,
                enforcement,
                severity,
                if_violated,
                rationale,
                parameters,
                related_functional_requirements,
                basis,
                knowledge_record_ids,
                review_status,
                raw_payload
            )
            VALUES
            (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9::JSONB,
                $10::JSONB,
                $11::JSONB,
                $12::JSONB,
                $13, $14, $15, $16,
                $17::JSONB,
                $18::JSONB,
                $19,
                '[]'::JSONB,
                'PENDING',
                $20::JSONB
            )
            `,
            [
                generationRunId,
                ingestionRunId,
                unitId,
                nextPosition,
                rule.batch_number,
                rule.name,
                rule.statement,
                textValue(rule.type),
                jsonValue(rule.condition),
                jsonValue(arrayValue(rule.exceptions), []),
                jsonValue(arrayValue(rule.actors), []),
                jsonValue(arrayValue(rule.objects), []),
                textValue(rule.enforcement),
                textValue(rule.severity),
                textValue(rule.if_violated),
                textValue(rule.rationale),
                jsonValue(rule.parameters || {}, {}),
                jsonValue(
                    arrayValue(rule.related_functional_requirements),
                    []
                ),
                textValue(rule.basis),
                jsonValue(rule, {})
            ]
        );

        inserted++;
    }

    return inserted;
}

// ------------------------------------------------------------
// 13. UPDATE GENERATION STATISTICS
// ------------------------------------------------------------

async function updateGenerationStatistics(
    client,
    generationRunId,
    statistics
) {
    await client.query(
        `
        UPDATE ${SCHEMA}.generation_runs
        SET
            statistics = $2::JSONB,
            completed_at = COALESCE(
                completed_at,
                CURRENT_TIMESTAMP
            )
        WHERE generation_run_id = $1
        `,
        [
            generationRunId,
            jsonValue(statistics, {})
        ]
    );
}

// ------------------------------------------------------------
// 14. UPDATE INGESTION STATUS
// ------------------------------------------------------------

async function markIngestionSuccess(
    client,
    ingestionRunId,
    counts,
    metadata
) {
    await client.query(
        `
        UPDATE ${SCHEMA}.ingestion_runs
        SET
            ingestion_status = 'SUCCESS',
            completed_at = CURRENT_TIMESTAMP,
            records_read = $2,
            records_inserted = $3,
            records_updated = 0,
            records_skipped = 0,
            records_failed = 0,
            error_details = '[]'::JSONB,
            metadata = metadata || $4::JSONB
        WHERE ingestion_run_id = $1
        `,
        [
            ingestionRunId,
            counts.recordsRead,
            counts.recordsInserted,
            jsonValue(metadata, {})
        ]
    );
}

async function markIngestionFailed(
    client,
    ingestionRunId,
    error
) {
    const errorDetails = [{
        message: error.message,
        stack: error.stack || null,
        failed_at: new Date().toISOString()
    }];

    await client.query(
        `
        UPDATE ${SCHEMA}.ingestion_runs
        SET
            ingestion_status = 'FAILED',
            completed_at = CURRENT_TIMESTAMP,
            records_inserted = 0,
            records_updated = 0,
            records_skipped = 0,
            records_failed = 1,
            error_details = $2::JSONB
        WHERE ingestion_run_id = $1
        `,
        [
            ingestionRunId,
            jsonValue(errorDetails, [])
        ]
    );
}

// ------------------------------------------------------------
// 15. MAIN INGESTION
// ------------------------------------------------------------

async function main() {
    const pool = createPool();
    const client = await pool.connect();

    let ingestionRunId = null;
    let advisoryLockAcquired = false;

    try {
        log('Starting Business Rule Discovery ingestion.');

        // Discover and checksum source files.
        const files = discoverSourceFiles();

        const fingerprint =
            calculateGenerationFingerprint(files);

        const runReference =
            buildRunReference(fingerprint);

        log(`Source files discovered: ${files.length}`);
        log(`Generation reference: ${runReference}`);

        // Acquire a session-level lock for this generation.
        // This prevents concurrent ingestion-number allocation races.
        await client.query(
            'SELECT pg_advisory_lock(hashtext($1))',
            [runReference]
        );

        advisoryLockAcquired = true;

        // Parse context first to obtain generator metadata.
        const contextFile = files.find(
            file => file.relativePath === 'context.json'
        );

        let context;

        try {
            context = JSON.parse(contextFile.rawText);
        } catch (error) {
            throw new Error(
                `Invalid context.json: ${error.message}`
            );
        }

        const generationRun = await getOrCreateGenerationRun(
            client,
            runReference,
            context
        );

        const generationRunId =
            generationRun.generation_run_id;

        log(`Generation run ID: ${generationRunId}`);

        // Create and commit the attempt record before data work.
        const ingestionRun = await createIngestionRun(
            client,
            generationRunId,
            {
                source_fingerprint: fingerprint,
                source_file_count: files.length,
                source_directory: 'aiOutput/businessRules',
                started_by: 'BusinessRule_Ingestion.js'
            }
        );

        ingestionRunId = ingestionRun.ingestion_run_id;

        log(
            `Ingestion attempt: ${ingestionRun.ingestion_number}`
        );
        log(`Ingestion run ID: ${ingestionRunId}`);

        // All source data insertion happens in one transaction.
        await client.query('BEGIN');

        try {
            const parsed = parseSourceFiles(files);

            const plan = parsed.get('plan.json');
            const unitMap = buildPlanUnits(plan);

            const batchData = buildBatchData(
                files,
                parsed,
                unitMap
            );

            const unitData = reconcileUnitFiles(
                files,
                parsed,
                batchData.allRules,
                unitMap
            );

            const warnings = [
                ...batchData.warnings,
                ...unitData.warnings
            ];

            log(`Plan units: ${unitMap.size}`);
            log(`Batch files: ${batchData.batchFiles.length}`);
            log(`Batch rules: ${batchData.allRules.length}`);
            log(`Unit files: ${unitData.unitFiles.length}`);
            log(`Reconciliation warnings: ${warnings.length}`);

            // 1. Preserve every source JSON artifact.
            const artifactCount = await insertSourceArtifacts(
                client,
                files,
                parsed,
                generationRunId,
                ingestionRunId
            );

            // 2. Insert units from plan.json.
            const unitCount = await insertGenerationUnits(
                client,
                unitMap,
                generationRunId,
                ingestionRunId
            );

            // 3. Insert rules from batch files only.
            const ruleCount = await insertBusinessRules(
                client,
                batchData.allRules,
                generationRunId,
                ingestionRunId
            );

            const recordsInserted =
                artifactCount + unitCount + ruleCount;

            const recordsRead = recordsInserted;

            const statistics = {
                source_fingerprint: fingerprint,
                source_artifacts: artifactCount,
                generation_units: unitCount,
                business_rules: ruleCount,
                batch_files: batchData.batchFiles.length,
                unit_files: unitData.unitFiles.length,
                reconciliation_warning_count: warnings.length,
                reconciliation_warnings: warnings,
                records_read: recordsRead,
                records_inserted: recordsInserted,
                records_updated: 0,
                records_skipped: 0,
                records_failed: 0
            };

            // Update generation statistics within this transaction.
            await updateGenerationStatistics(
                client,
                generationRunId,
                statistics
            );

            // Mark the attempt successful within this transaction.
            await markIngestionSuccess(
                client,
                ingestionRunId,
                {
                    recordsRead,
                    recordsInserted
                },
                {
                    reconciliation_warning_count: warnings.length,
                    reconciliation_warnings: warnings
                }
            );

            await client.query('COMMIT');

            log('Ingestion transaction committed successfully.');
            log('--------------------------------------------');
            log('BUSINESS RULE INGESTION SUMMARY');
            log('--------------------------------------------');
            log(`Generation run ID : ${generationRunId}`);
            log(`Generation ref    : ${runReference}`);
            log(`Ingestion run ID  : ${ingestionRunId}`);
            log(`Attempt number    : ${ingestionRun.ingestion_number}`);
            log(`Artifacts inserted: ${artifactCount}`);
            log(`Units inserted    : ${unitCount}`);
            log(`Rules inserted    : ${ruleCount}`);
            log(`Records inserted  : ${recordsInserted}`);
            log(`Warnings           : ${warnings.length}`);
            log('Status             : SUCCESS');
            log('--------------------------------------------');

            if (warnings.length > 0) {
                log('Reconciliation warnings:');

                for (const warning of warnings) {
                    console.log(
                        JSON.stringify(warning, null, 2)
                    );
                }
            }
        } catch (error) {
            await client.query('ROLLBACK');

            // The attempt row was committed before the transaction,
            // so its FAILED status can be retained after rollback.
            await markIngestionFailed(
                client,
                ingestionRunId,
                error
            );

            throw error;
        }
    } catch (error) {
        log('INGESTION FAILED');
        console.error(error.stack || error);

        process.exitCode = 1;
    } finally {
        if (advisoryLockAcquired) {
            try {
                await client.query(
                    'SELECT pg_advisory_unlock(hashtext($1))',
                    [
                        // The lock key is the generation reference.
                        // Recompute it from the current source files
                        // when available, otherwise the session closes.
                        (() => {
                            try {
                                return buildRunReference(
                                    calculateGenerationFingerprint(
                                        discoverSourceFiles()
                                    )
                                );
                            } catch (_) {
                                return '';
                            }
                        })()
                    ]
                );
            } catch (unlockError) {
                log(
                    `Advisory lock release warning: ${unlockError.message}`
                );
            }
        }

        client.release();
        await pool.end();
    }
}

// ------------------------------------------------------------
// 16. EXECUTE
// ------------------------------------------------------------

main().catch(error => {
    console.error('Unexpected ingestion error:', error);
    process.exitCode = 1;
});
