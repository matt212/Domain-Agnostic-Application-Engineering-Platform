
'use strict';

/**
 * knowledgeBaseIngestion.js
 *
 * Purpose:
 *   1. Read the consolidated 8.0.3 knowledge-base JSON.
 *   2. Preserve each original JSON record unchanged.
 *   3. Retain the original record_type (JSON_ARRAY_ITEM / JSON_METADATA).
 *   4. Derive semantic_category from source_stage + section.
 *   5. Store records and searchable representations in PostgreSQL.
 *   6. Maintain source, relationship, catalogue and ingestion-run tables.
 *
 * Run from project root:
 *   node app/utils/appflowgeneratorAI/commands/knowledgeBaseIngestion.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

// -----------------------------------------------------------------------------
// 1. PATHS AND CONFIGURATION
// -----------------------------------------------------------------------------

const CONFIG_PATH = path.resolve(
    __dirname,
    '../../../config/config.json'
);

const BASELINE_PATH = path.resolve(
    __dirname,
    '../aiOutput/baseline/8.0.3.knowledge_base-09-11-26_22:50.json'
);

const ENVIRONMENT = process.env.NODE_ENV || 'development';

const BATCH_SIZE = 100;

function log(message) {
    console.log(`[KB INGESTION] ${new Date().toISOString()} ${message}`);
}

function sha256(value) {
    return crypto
        .createHash('sha256')
        .update(value)
        .digest('hex');
}

function stableJson(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableJson).join(',')}]`;
    }

    const keys = Object.keys(value).sort();

    return `{${keys.map(key =>
        `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(',')}}`;
}

// -----------------------------------------------------------------------------
// 2. LOAD CONFIGURATION
// -----------------------------------------------------------------------------

function loadDatabaseConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error(`Database config not found: ${CONFIG_PATH}`);
    }

    const config = JSON.parse(
        fs.readFileSync(CONFIG_PATH, 'utf8')
    );

    const db = config[ENVIRONMENT];

    if (!db) {
        throw new Error(
            `Environment "${ENVIRONMENT}" not found in config.json`
        );
    }

    return {
        host: db.host,
        port: Number(db.port || 5432),
        user: db.username,
        password: db.password,
        database: db.database,
        ssl: false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    };
}

// -----------------------------------------------------------------------------
// 3. LOAD AND IDENTIFY ORIGINAL KNOWLEDGE RECORDS
// -----------------------------------------------------------------------------

function isKnowledgeRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    return (
        typeof value.id === 'string' &&
        typeof value.source_stage === 'string' &&
        typeof value.source_file === 'string' &&
        typeof value.section === 'string' &&
        typeof value.record_type === 'string' &&
        Object.prototype.hasOwnProperty.call(value, 'content')
    );
}

function extractKnowledgeRecords(root) {
    const records = [];

    function visit(value) {
        if (value === null || typeof value !== 'object') {
            return;
        }

        if (isKnowledgeRecord(value)) {
            // Keep the original object. Do not modify its fields.
            records.push(value);
            return;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                visit(item);
            }

            return;
        }

        for (const child of Object.values(value)) {
            visit(child);
        }
    }

    visit(root);

    return records;
}

function loadBaseline() {
    if (!fs.existsSync(BASELINE_PATH)) {
        throw new Error(`Baseline file not found: ${BASELINE_PATH}`);
    }

    log(`Reading baseline: ${BASELINE_PATH}`);

    const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    const records = extractKnowledgeRecords(parsed);

    if (!records.length) {
        throw new Error(
            'No knowledge records found. ' +
            'Expected records containing id, source_stage, source_file, ' +
            'section, record_type and content.'
        );
    }

    const unique = new Map();

    for (const record of records) {
        const key = `${record.source_file}::${record.id}`;

        if (unique.has(key)) {
            throw new Error(`Duplicate source record detected: ${key}`);
        }

        unique.set(key, record);
    }

    log(`Baseline size: ${(Buffer.byteLength(raw) / 1024 / 1024).toFixed(2)} MB`);
    log(`Records discovered: ${records.length}`);

    return {
        raw,
        parsed,
        records
    };
}

// -----------------------------------------------------------------------------
// 4. SEMANTIC CLASSIFICATION
// -----------------------------------------------------------------------------

/**
 * This classification is based on the actual source-stage and section
 * structure observed in the knowledge base.
 *
 * It does not overwrite the original record_type.
 *
 * Unknown structures remain UNCLASSIFIED instead of being guessed.
 */

function deriveSemanticCategory(sourceStage, section, originalRecordType) {
    const stage = String(sourceStage || '').trim().toUpperCase();
    const sectionPath = String(section || '').trim();

    const normalized = sectionPath.toLowerCase();

    // STAGE 1: Business objects and operating model.
    if (stage === 'STAGE_1_OBJECTS') {

        if (normalized.startsWith('business objects')) {
            return 'BUSINESS_OBJECT';
        }

        if (normalized.includes('business operating model > participants')) {
            return 'BUSINESS_PARTICIPANT';
        }

        if (normalized.includes('monetization streams')) {
            return 'MONETIZATION_STREAM';
        }

        if (normalized.includes('value creation monetization')) {
            return 'BUSINESS_MONETIZATION_MODEL';
        }

        if (normalized === 'business operating model') {
            return 'BUSINESS_OPERATING_MODEL';
        }

        if (normalized.startsWith('derived lifecycle')) {
            return 'BUSINESS_LIFECYCLE_STAGE';
        }

        if (normalized.includes('alternative operating models')) {
            return 'ALTERNATIVE_OPERATING_MODEL';
        }

        if (normalized.includes('evidence gaps')) {
            return 'EVIDENCE_GAP';
        }

        if (normalized.includes('key assumptions')) {
            return 'BUSINESS_ASSUMPTION';
        }

        if (normalized.includes('unresolved dependencies')) {
            return 'UNRESOLVED_DEPENDENCY';
        }

        if (normalized === 'document content') {
            return 'SOURCE_DOCUMENT_CONTENT';
        }

        return 'UNCLASSIFIED';
    }

    // STAGE 2: Actor definitions.
    if (stage === 'STAGE_2_ACTORS') {
        return normalized.startsWith('document content')
            ? 'ACTOR_DEFINITION'
            : 'UNCLASSIFIED';
    }

    // STAGE 3: Actor responsibilities and business context.
    if (stage === 'STAGE_3_RESPONSIBILITIES') {

        if (normalized.startsWith('actor responsibilities')) {
            return 'ACTOR_RESPONSIBILITY';
        }

        if (normalized.includes('business functions')) {
            return 'BUSINESS_FUNCTION';
        }

        if (normalized.includes('business outcomes')) {
            return 'BUSINESS_OUTCOME';
        }

        if (normalized.includes('customer and business participants')) {
            return 'BUSINESS_PARTICIPANT';
        }

        if (normalized.includes('products and services')) {
            return 'BUSINESS_PRODUCT_SERVICE';
        }

        if (normalized === 'business context') {
            return 'BUSINESS_CONTEXT';
        }

        return 'UNCLASSIFIED';
    }

    // STAGE 4: Actor-to-business-object relationships.
    if (stage === 'STAGE_4_RELATIONSHIPS') {
        return normalized.startsWith('actor business object relationships')
            ? 'ACTOR_BUSINESS_OBJECT_RELATIONSHIP'
            : 'UNCLASSIFIED';
    }

    // STAGE 5: Business activities.
    if (stage === 'STAGE_5_ACTIVITIES') {
        return normalized.startsWith('business activities')
            ? 'BUSINESS_ACTIVITY'
            : 'UNCLASSIFIED';
    }

    // STAGE 7: Information requirements.
    if (stage === 'STAGE_7_MERGED_INFORMATION_REQUIREMENTS') {
        return normalized.startsWith('information requirements')
            ? 'INFORMATION_REQUIREMENT'
            : 'UNCLASSIFIED';
    }

    // STAGE 8: Validation evidence and metadata.
    if (stage === 'STAGE_8_VALIDATION_INFORMATION_REQUIREMENTS') {

        if (normalized.startsWith('reference findings')) {
            return 'REFERENCE_FINDING';
        }

        if (normalized.startsWith('structural findings')) {
            return 'STRUCTURAL_FINDING';
        }

        if (normalized.startsWith('validation findings')) {
            return 'VALIDATION_FINDING';
        }

        if (normalized.startsWith('source inventory')) {
            return 'SOURCE_INVENTORY';
        }

        if (normalized.startsWith('validation summary')) {
            return 'VALIDATION_SUMMARY';
        }

        if (normalized === 'validation metadata') {
            return 'VALIDATION_METADATA';
        }

        return 'UNCLASSIFIED';
    }

    // Do not infer a semantic category from JSON_ARRAY_ITEM or JSON_METADATA.
    return 'UNCLASSIFIED';
}

// -----------------------------------------------------------------------------
// 5. SEARCHABLE TEXT
// -----------------------------------------------------------------------------

function flattenText(value, output = []) {
    if (value === null || value === undefined) {
        return output;
    }

    if (typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean') {
        output.push(String(value));
        return output;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            flattenText(item, output);
        }

        return output;
    }

    if (typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
            // Exclude duplicated searchable text from nested traversal.
            if (key === 'searchable_text') {
                continue;
            }

            flattenText(child, output);
        }
    }

    return output;
}

function buildSearchableText(record, semanticCategory) {
    const originalSearchText =
        typeof record.searchable_text === 'string'
            ? record.searchable_text.trim()
            : '';

    const contentText = flattenText(record.content).join(' ');

    return [
        record.id,
        record.source_stage,
        record.source_file,
        record.section,
        semanticCategory,
        originalSearchText,
        contentText
    ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// -----------------------------------------------------------------------------
// 6. RECORD IDENTIFIERS AND METADATA
// -----------------------------------------------------------------------------

function createRecordId(record) {
    const naturalKey = `${record.source_file}::${record.id}`;

    return `rec_${sha256(naturalKey)}`;
}

function getRecordMetadata(record, semanticCategory) {
    return {
        original_id: record.id,
        original_record_type: record.record_type,
        semantic_category: semanticCategory,
        source_stage: record.source_stage,
        source_file: record.source_file,
        section: record.section,
        line_start: record.line_start ?? null,
        line_end: record.line_end ?? null
    };
}

function prepareRecord(record) {
    const semanticCategory = deriveSemanticCategory(
        record.source_stage,
        record.section,
        record.record_type
    );

    const recordId = createRecordId(record);

    return {
        recordId,
        originalId: record.id,
        sourceStage: record.source_stage,
        sourceFile: record.source_file,
        section: record.section,
        recordType: record.record_type,
        semanticCategory,
        searchableText: buildSearchableText(record, semanticCategory),

        // Original JSON is retained without adding derived fields to it.
        content: record,

        contentHash: sha256(stableJson(record)),
        recordMetadata: getRecordMetadata(record, semanticCategory)
    };
}

// -----------------------------------------------------------------------------
// 7. DATABASE SCHEMA
// -----------------------------------------------------------------------------

async function createSchema(client) {
    log('Creating/verifying database schema.');

    await client.query(`
        CREATE TABLE IF NOT EXISTS knowledge_sources (
            source_id BIGSERIAL PRIMARY KEY,
            source_file TEXT NOT NULL UNIQUE,
            source_stage TEXT,
            source_format TEXT,
            file_extension TEXT,
            raw_content JSONB,
            character_count BIGINT DEFAULT 0,
            content_hash TEXT,
            source_metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS knowledge_records (
            record_id TEXT PRIMARY KEY,
            record_type TEXT NOT NULL,
            source_id BIGINT REFERENCES knowledge_sources(source_id),
            source_stage TEXT,
            source_file TEXT,
            section TEXT,
            content JSONB NOT NULL,
            searchable_text TEXT,
            content_hash TEXT,
            record_metadata JSONB DEFAULT '{}'::jsonb,
            semantic_category TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE knowledge_records
            ADD COLUMN IF NOT EXISTS semantic_category TEXT
            NOT NULL DEFAULT 'UNCLASSIFIED';

        CREATE TABLE IF NOT EXISTS knowledge_search (
            record_id TEXT PRIMARY KEY
                REFERENCES knowledge_records(record_id) ON DELETE CASCADE,
            searchable_text TEXT NOT NULL,
            search_vector TSVECTOR GENERATED ALWAYS AS (
                to_tsvector('english', COALESCE(searchable_text, ''))
            ) STORED,
            indexed_fields JSONB DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS knowledge_relationships (
            relationship_id BIGSERIAL PRIMARY KEY,
            from_record_id TEXT NOT NULL
                REFERENCES knowledge_records(record_id) ON DELETE CASCADE,
            relationship_type TEXT NOT NULL,
            target_value TEXT NOT NULL,
            target_record_id TEXT
                REFERENCES knowledge_records(record_id) ON DELETE SET NULL,
            source_field TEXT NOT NULL,
            relationship_metadata JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (
                from_record_id,
                relationship_type,
                target_value,
                source_field
            )
        );

        CREATE TABLE IF NOT EXISTS knowledge_catalogue (
            catalogue_id BIGSERIAL PRIMARY KEY,
            record_type TEXT NOT NULL,
            field_path TEXT NOT NULL,
            observed_data_type TEXT,
            occurrence_count INTEGER DEFAULT 0,
            sample_record_id TEXT
                REFERENCES knowledge_records(record_id) ON DELETE SET NULL,
            field_metadata JSONB DEFAULT '{}'::jsonb,
            discovered_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (record_type, field_path)
        );

        CREATE TABLE IF NOT EXISTS knowledge_ingestion_runs (
            ingestion_id BIGSERIAL PRIMARY KEY,
            source_file TEXT,
            source_hash TEXT,
            ingestion_status TEXT NOT NULL
                CHECK (
                    ingestion_status IN (
                        'RUNNING',
                        'COMPLETED',
                        'FAILED'
                    )
                ),
            records_expected INTEGER DEFAULT 0,
            records_imported INTEGER DEFAULT 0,
            relationships_created INTEGER DEFAULT 0,
            catalogue_fields_created INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            error_details JSONB DEFAULT '[]'::jsonb,
            started_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_kb_records_source_stage
            ON knowledge_records(source_stage);

        CREATE INDEX IF NOT EXISTS idx_kb_records_section
            ON knowledge_records(section);

        CREATE INDEX IF NOT EXISTS idx_kb_records_semantic_category
            ON knowledge_records(semantic_category);

        CREATE INDEX IF NOT EXISTS idx_kb_records_source_file
            ON knowledge_records(source_file);

        CREATE INDEX IF NOT EXISTS idx_kb_search_vector
            ON knowledge_search USING GIN(search_vector);

        CREATE INDEX IF NOT EXISTS idx_kb_relationship_target
            ON knowledge_relationships(target_record_id);

        CREATE INDEX IF NOT EXISTS idx_kb_relationship_source
            ON knowledge_relationships(from_record_id);
    `);

    log('Database schema ready.');
}

// -----------------------------------------------------------------------------
// 8. SOURCE REGISTRATION
// -----------------------------------------------------------------------------

async function registerSources(client, records, baselineHash) {
    const groups = new Map();

    for (const record of records) {
        const key = record.source_file;

        if (!groups.has(key)) {
            groups.set(key, {
                sourceFile: record.source_file,
                sourceStage: record.source_stage,
                records: []
            });
        }

        groups.get(key).records.push(record);
    }

    const sourceIds = new Map();

    for (const group of groups.values()) {
        const sourceMetadata = {
            baseline_file: path.basename(BASELINE_PATH),
            source_stage: group.sourceStage,
            records_in_baseline: group.records.length
        };

        const result = await client.query(
            `
            INSERT INTO knowledge_sources (
                source_file,
                source_stage,
                source_format,
                file_extension,
                raw_content,
                character_count,
                content_hash,
                source_metadata,
                updated_at
            )
            VALUES (
                $1, $2, 'json', '.json', $3::jsonb,
                $4, $5, $6::jsonb, NOW()
            )
            ON CONFLICT (source_file)
            DO UPDATE SET
                source_stage = EXCLUDED.source_stage,
                source_format = EXCLUDED.source_format,
                file_extension = EXCLUDED.file_extension,
                raw_content = EXCLUDED.raw_content,
                character_count = EXCLUDED.character_count,
                content_hash = EXCLUDED.content_hash,
                source_metadata = EXCLUDED.source_metadata,
                updated_at = NOW()
            RETURNING source_id
            `,
            [
                group.sourceFile,
                group.sourceStage,
                JSON.stringify({
                    baseline_file: path.basename(BASELINE_PATH)
                }),
                group.records.reduce(
                    (sum, item) =>
                        sum + JSON.stringify(item).length,
                    0
                ),
                baselineHash,
                JSON.stringify(sourceMetadata)
            ]
        );

        sourceIds.set(group.sourceFile, result.rows[0].source_id);
    }

    return sourceIds;
}

// -----------------------------------------------------------------------------
// 9. RECORD INSERTION
// -----------------------------------------------------------------------------

async function insertRecords(client, preparedRecords, sourceIds) {
    let imported = 0;

    for (
        let offset = 0;
        offset < preparedRecords.length;
        offset += BATCH_SIZE
    ) {
        const batch = preparedRecords.slice(
            offset,
            offset + BATCH_SIZE
        );

        for (const record of batch) {
            const sourceId = sourceIds.get(record.sourceFile);

            await client.query(
                `
                INSERT INTO knowledge_records (
                    record_id,
                    record_type,
                    source_id,
                    source_stage,
                    source_file,
                    section,
                    content,
                    searchable_text,
                    content_hash,
                    record_metadata,
                    semantic_category,
                    updated_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7::jsonb, $8, $9, $10::jsonb, $11, NOW()
                )
                ON CONFLICT (record_id)
                DO UPDATE SET
                    record_type = EXCLUDED.record_type,
                    source_id = EXCLUDED.source_id,
                    source_stage = EXCLUDED.source_stage,
                    source_file = EXCLUDED.source_file,
                    section = EXCLUDED.section,
                    content = EXCLUDED.content,
                    searchable_text = EXCLUDED.searchable_text,
                    content_hash = EXCLUDED.content_hash,
                    record_metadata = EXCLUDED.record_metadata,
                    semantic_category = EXCLUDED.semantic_category,
                    updated_at = NOW()
                `,
                [
                    record.recordId,
                    record.recordType,
                    sourceId,
                    record.sourceStage,
                    record.sourceFile,
                    record.section,
                    JSON.stringify(record.content),
                    record.searchableText,
                    record.contentHash,
                    JSON.stringify(record.recordMetadata),
                    record.semanticCategory
                ]
            );

            await client.query(
                `
                INSERT INTO knowledge_search (
                    record_id,
                    searchable_text,
                    indexed_fields,
                    updated_at
                )
                VALUES ($1, $2, $3::jsonb, NOW())
                ON CONFLICT (record_id)
                DO UPDATE SET
                    searchable_text = EXCLUDED.searchable_text,
                    indexed_fields = EXCLUDED.indexed_fields,
                    updated_at = NOW()
                `,
                [
                    record.recordId,
                    record.searchableText,
                    JSON.stringify({
                        source_stage: record.sourceStage,
                        source_file: record.sourceFile,
                        section: record.section,
                        record_type: record.recordType,
                        semantic_category: record.semanticCategory
                    })
                ]
            );

            imported++;
        }

        log(`Records imported: ${imported}/${preparedRecords.length}`);
    }

    return imported;
}

// -----------------------------------------------------------------------------
// 10. RELATIONSHIP CANDIDATES
// -----------------------------------------------------------------------------

const RELATIONSHIP_FIELD_PATTERN =
    /(actor|object|activity|requirement|process|stage|module|parent|child|related|reference|dependency|source|target|entity|id)/i;

function extractRelationshipCandidates(record) {
    const candidates = [];

    function visit(value, fieldPath = '') {
        if (!value || typeof value !== 'object') {
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                visit(item, `${fieldPath}[${index}]`);
            });

            return;
        }

        for (const [key, child] of Object.entries(value)) {
            const nextPath = fieldPath
                ? `${fieldPath}.${key}`
                : key;

            if (
                RELATIONSHIP_FIELD_PATTERN.test(key) &&
                typeof child === 'string' &&
                child.trim()
            ) {
                candidates.push({
                    relationshipType: key,
                    targetValue: child.trim(),
                    sourceField: nextPath
                });
            }

            visit(child, nextPath);
        }
    }

    // Avoid extracting references from parser/provenance fields.
    visit(record.content);

    return candidates;
}

async function insertRelationships(client, preparedRecords) {
    const idLookup = new Map();

    for (const record of preparedRecords) {
        idLookup.set(record.originalId, record.recordId);
        idLookup.set(record.recordId, record.recordId);
    }

    let created = 0;

    for (const record of preparedRecords) {
        const candidates = extractRelationshipCandidates(record);

        for (const candidate of candidates) {
            const targetRecordId =
                idLookup.get(candidate.targetValue) || null;

            await client.query(
                `
                INSERT INTO knowledge_relationships (
                    from_record_id,
                    relationship_type,
                    target_value,
                    target_record_id,
                    source_field,
                    relationship_metadata
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (
                    from_record_id,
                    relationship_type,
                    target_value,
                    source_field
                )
                DO UPDATE SET
                    target_record_id = EXCLUDED.target_record_id,
                    relationship_metadata =
                        EXCLUDED.relationship_metadata
                `,
                [
                    record.recordId,
                    candidate.relationshipType,
                    candidate.targetValue,
                    targetRecordId,
                    candidate.sourceField,
                    JSON.stringify({
                        resolution_status: targetRecordId
                            ? 'RESOLVED'
                            : 'UNRESOLVED',
                        semantic_category: record.semanticCategory
                    })
                ]
            );

            created++;
        }
    }

    return created;
}

// -----------------------------------------------------------------------------
// 11. FIELD CATALOGUE
// -----------------------------------------------------------------------------

function getValueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
}

function extractFieldCatalogue(record) {
    const fields = [];

    function visit(value, fieldPath = '') {
        if (Array.isArray(value)) {
            fields.push({
                fieldPath,
                dataType: 'array'
            });

            value.forEach((item, index) => {
                visit(item, `${fieldPath}[${index}]`);
            });

            return;
        }

        if (value && typeof value === 'object') {
            if (fieldPath) {
                fields.push({
                    fieldPath,
                    dataType: 'object'
                });
            }

            for (const [key, child] of Object.entries(value)) {
                const nextPath = fieldPath
                    ? `${fieldPath}.${key}`
                    : key;

                visit(child, nextPath);
            }

            return;
        }

        if (fieldPath) {
            fields.push({
                fieldPath,
                dataType: getValueType(value),
                sampleValue: value
            });
        }
    }

    visit(record.content);

    return fields;
}

async function populateCatalogue(client, preparedRecords) {
    const catalogue = new Map();

    for (const record of preparedRecords) {
        const fields = extractFieldCatalogue(record);

        for (const field of fields) {
            const key = `${record.recordType}::${field.fieldPath}`;

            if (!catalogue.has(key)) {
                catalogue.set(key, {
                    recordType: record.recordType,
                    fieldPath: field.fieldPath,
                    dataType: field.dataType,
                    count: 0,
                    sampleRecordId: record.recordId,
                    sampleValue: field.sampleValue
                });
            }

            catalogue.get(key).count++;
        }
    }

    for (const item of catalogue.values()) {
        await client.query(
            `
            INSERT INTO knowledge_catalogue (
                record_type,
                field_path,
                observed_data_type,
                occurrence_count,
                sample_record_id,
                field_metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            ON CONFLICT (record_type, field_path)
            DO UPDATE SET
                observed_data_type = EXCLUDED.observed_data_type,
                occurrence_count = EXCLUDED.occurrence_count,
                sample_record_id = EXCLUDED.sample_record_id,
                field_metadata = EXCLUDED.field_metadata,
                discovered_at = NOW()
            `,
            [
                item.recordType,
                item.fieldPath,
                item.dataType,
                item.count,
                item.sampleRecordId,
                JSON.stringify({
                    sample_value: item.sampleValue
                })
            ]
        );
    }

    return catalogue.size;
}

// -----------------------------------------------------------------------------
// 12. INGESTION RUN TRACKING
// -----------------------------------------------------------------------------

async function createIngestionRun(client, sourceHash, recordCount) {
    const result = await client.query(
        `
        INSERT INTO knowledge_ingestion_runs (
            source_file,
            source_hash,
            ingestion_status,
            records_expected,
            started_at
        )
        VALUES ($1, $2, 'RUNNING', $3, NOW())
        RETURNING ingestion_id
        `,
        [
            path.basename(BASELINE_PATH),
            sourceHash,
            recordCount
        ]
    );

    return result.rows[0].ingestion_id;
}

async function completeIngestionRun(
    client,
    ingestionId,
    stats
) {
    await client.query(
        `
        UPDATE knowledge_ingestion_runs
        SET
            ingestion_status = 'COMPLETED',
            records_imported = $2,
            relationships_created = $3,
            catalogue_fields_created = $4,
            error_count = 0,
            error_details = '[]'::jsonb,
            completed_at = NOW()
        WHERE ingestion_id = $1
        `,
        [
            ingestionId,
            stats.recordsImported,
            stats.relationshipsCreated,
            stats.catalogueFieldsCreated
        ]
    );
}

async function failIngestionRun(client, ingestionId, error) {
    if (!ingestionId) return;

    await client.query(
        `
        UPDATE knowledge_ingestion_runs
        SET
            ingestion_status = 'FAILED',
            error_count = 1,
            error_details = $2::jsonb,
            completed_at = NOW()
        WHERE ingestion_id = $1
        `,
        [
            ingestionId,
            JSON.stringify([{
                message: error.message,
                stack: error.stack
            }])
        ]
    );
}

// -----------------------------------------------------------------------------
// 13. MAIN
// -----------------------------------------------------------------------------

async function main() {
    let pool;
    let client;
    let ingestionId;

    try {
        log('Starting knowledge-base ingestion.');

        const databaseConfig = loadDatabaseConfig();

        log(`Config: ${CONFIG_PATH}`);
        log(`Environment: ${ENVIRONMENT}`);
        log(`Database: ${databaseConfig.database}`);
        log(`Host: ${databaseConfig.host}:${databaseConfig.port}`);

        const baseline = loadBaseline();

        const preparedRecords = baseline.records.map(prepareRecord);

        const sourceHash = sha256(baseline.raw);

        const categoryCounts = {};

        for (const record of preparedRecords) {
            categoryCounts[record.semanticCategory] =
                (categoryCounts[record.semanticCategory] || 0) + 1;
        }

        log('Semantic classification completed.');
        log(JSON.stringify(categoryCounts, null, 2));

        pool = new Pool(databaseConfig);

        client = await pool.connect();

        await client.query('SELECT 1');

        log('PostgreSQL connection successful.');

        await createSchema(client);

        ingestionId = await createIngestionRun(
            client,
            sourceHash,
            preparedRecords.length
        );

        log(`Ingestion run ID: ${ingestionId}`);

        await client.query('BEGIN');

        try {
            // Register all source files represented in the baseline.
            const sourceIds = await registerSources(
                client,
                baseline.records,
                sourceHash
            );

            log(`Sources processed: ${sourceIds.size}`);

            // Remove records from the same source files before rebuilding
            // their contents. The transaction protects the existing data
            // if ingestion fails.
            const sourceFiles = [...sourceIds.keys()];

            await client.query(
                `
                DELETE FROM knowledge_records
                WHERE source_file = ANY($1::text[])
                `,
                [sourceFiles]
            );

            // Remove old catalogue entries; rebuild from current records.
            await client.query('DELETE FROM knowledge_catalogue');

            const recordsImported = await insertRecords(
                client,
                preparedRecords,
                sourceIds
            );

            const relationshipsCreated = await insertRelationships(
                client,
                preparedRecords
            );

            const catalogueFieldsCreated = await populateCatalogue(
                client,
                preparedRecords
            );

            await client.query('COMMIT');

            const stats = {
                recordsImported,
                relationshipsCreated,
                catalogueFieldsCreated
            };

            await completeIngestionRun(
                client,
                ingestionId,
                stats
            );

            log('INGESTION COMPLETED SUCCESSFULLY.');
            log(`Sources processed: ${sourceIds.size}`);
            log(`Records imported: ${recordsImported}`);
            log(`Relationship candidates: ${relationshipsCreated}`);
            log(`Catalogue fields: ${catalogueFieldsCreated}`);
            log(`Semantic categories: ${Object.keys(categoryCounts).length}`);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        log(`INGESTION FAILED: ${error.message}`);

        if (client && ingestionId) {
            try {
                await failIngestionRun(client, ingestionId, error);
            } catch (trackingError) {
                log(`Could not update ingestion run: ${trackingError.message}`);
            }
        }

        process.exitCode = 1;

    } finally {
        if (client) {
            client.release();
        }

        if (pool) {
            await pool.end();
        }

        log('Ingestion process finished.');
    }
}

main();
