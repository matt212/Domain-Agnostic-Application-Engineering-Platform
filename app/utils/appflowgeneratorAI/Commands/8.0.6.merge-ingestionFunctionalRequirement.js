
"use strict";

/**
 * CONSOLIDATE JSON + POSTGRESQL KNOWLEDGE BASE INGESTION
 *
 * PostgreSQL: 17
 * Database: demodb
 *
 * INSERT ONLY:
 * - No DELETE
 * - No TRUNCATE
 * - No UPDATE
 * - No table recreation
 * - ON CONFLICT DO NOTHING
 *
 * Existing six-table schema is required.
 */

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");

// ============================================================
// CONFIGURATION
// ============================================================
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(
    ROOT,
    'app/utils/appflowgeneratorAI/aiOutput/functionalRequirements'
);
const WORK_DIR = path.join(OUTPUT_DIR, 'work');

const CONFIG = {
    inputDirectory: WORK_DIR,

    consolidatedFile: path.resolve(
        `${OUTPUT_DIR}/consolidated-Functional-Requirements-${getFormattedDateTime()}.json`
    ),


    databaseUrl: process.env.DATABASE_URL,

    sourceStage: process.env.KB_SOURCE_STAGE || "JSON_IMPORT",

    batchName: "consolidated-Functional-base",

    bundleVersion: "1.0"
};

// ============================================================
// UTILITIES
// ============================================================
function getFormattedDateTime() {
    const now = new Date();

    const pad = (value) => String(value).padStart(2, '0');

    return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${String(now.getFullYear()).slice(-2)}_${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
function hash(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function stableJSON(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableJSON).join(",")}]`;
    }

    if (value !== null && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map(key =>
                `${JSON.stringify(key)}:${stableJSON(value[key])}`
            )
            .join(",")}}`;
    }

    return JSON.stringify(value);
}

function jsonType(value) {
    if (value === null) return "NULL";
    if (Array.isArray(value)) return "ARRAY";
    if (typeof value === "object") return "OBJECT";
    if (typeof value === "string") return "STRING";
    if (typeof value === "number") return "NUMBER";
    if (typeof value === "boolean") return "BOOLEAN";

    return "UNKNOWN";
}

function normalizeName(value) {
    return String(value)
        .replace(/([a-z])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .toUpperCase();
}

function log(message) {
    console.log(
        `[KB ${new Date().toISOString()}] ${message}`
    );
}

// ============================================================
// STEP 1: READ AND CONSOLIDATE ALL JSON FILES
// ============================================================

async function consolidateJSONFiles() {

    const entries = await fs.readdir(
        CONFIG.inputDirectory,
        { withFileTypes: true }
    );

    const files = [];

    async function collect(directory) {
        const items = await fs.readdir(directory, {
            withFileTypes: true
        });

        for (const item of items) {
            const fullPath = path.join(directory, item.name);

            if (item.isDirectory()) {
                await collect(fullPath);
            } else if (
                item.isFile() &&
                item.name.toLowerCase().endsWith(".json")
            ) {
                files.push(fullPath);
            }
        }
    }

    await collect(CONFIG.inputDirectory);

    files.sort();

    if (files.length === 0) {
        throw new Error("No JSON files found in input directory.");
    }

    const sources = [];

    for (const filePath of files) {

        const relativeFile = path.relative(
            CONFIG.inputDirectory,
            filePath
        ).split(path.sep).join("/");

        const rawContent = await fs.readFile(
            filePath,
            "utf8"
        );

        let parsed;

        try {
            parsed = JSON.parse(rawContent);
        } catch (error) {
            throw new Error(
                `Invalid JSON in ${relativeFile}: ${error.message}`
            );
        }

        const contentHash = hash(stableJSON(parsed));

        sources.push({
            source_file: relativeFile,
            source_stage: CONFIG.sourceStage,
            source_format: "JSON",
            file_extension: ".json",
            content_hash: contentHash,
            original_content: parsed,
            character_count: rawContent.length
        });

        log(`CONSOLIDATED: ${relativeFile}`);
    }

    const bundle = {
        bundle_metadata: {
            bundle_name: CONFIG.batchName,
            bundle_version: CONFIG.bundleVersion,
            total_sources: sources.length,
            created_at: new Date().toISOString()
        },
        sources
    };

    const output = JSON.stringify(bundle, null, 2);

    await fs.writeFile(
        CONFIG.consolidatedFile,
        output,
        "utf8"
    );

    return {
        bundle,
        bundleHash: hash(stableJSON(bundle)),
        outputCharacters: output.length
    };
}

// ============================================================
// STEP 2: EXTRACT LOGICAL RECORDS FROM EACH SOURCE
// ============================================================

function extractRecords(source) {

    const document = source.original_content;

    // A JSON array represents multiple logical records.
    if (Array.isArray(document)) {
        return document.map((item, index) => ({
            content: item,
            section: `items[${index}]`,
            recordIndex: index,
            metadata: {}
        }));
    }

    // Support common multi-record container formats.
    if (document && typeof document === "object") {

        for (const key of ["records", "results", "items"]) {

            if (Array.isArray(document[key])) {
                return document[key].map((item, index) => ({
                    content: item,
                    section: `${key}[${index}]`,
                    recordIndex: index,
                    metadata: {
                        container_key: key
                    }
                }));
            }
        }
    }

    // Your supplied JSON format:
    // { result: {...}, unmatched: {...}, evidence_count: 8 }
    // is one logical record, not three separate records.

    return [{
        content: document,
        section: "root",
        recordIndex: 0,
        metadata: {}
    }];
}

// ============================================================
// STEP 3: CLASSIFY RECORDS
// ============================================================

function classifyRecord(content) {

    if (
        content &&
        typeof content === "object" &&
        content.result &&
        typeof content.result === "object" &&
        Object.prototype.hasOwnProperty.call(
            content.result,
            "requirement"
        )
    ) {
        return {
            recordType: "INFORMATION_REQUIREMENT",
            semanticCategory: "INFORMATION_REQUIREMENT"
        };
    }

    return {
        recordType: "JSON_RECORD",
        semanticCategory: "UNCLASSIFIED"
    };
}

// ============================================================
// STEP 4: EXTRACT SEARCHABLE TEXT
// ============================================================

function extractSearchableText(value, prefix = "") {

    const output = [];

    function walk(item, key = "") {

        if (item === null || item === undefined) {
            return;
        }

        if (Array.isArray(item)) {

            for (const child of item) {
                walk(child, key);
            }

            return;
        }

        if (typeof item === "object") {

            for (const [childKey, childValue] of
                Object.entries(item)) {

                output.push(childKey);

                walk(childValue, childKey);
            }

            return;
        }

        output.push(String(item));
    }

    walk(value, prefix);

    return output.join(" ").replace(/\s+/g, " ").trim();
}

// ============================================================
// STEP 5: EXTRACT CATALOGUE FIELDS
// ============================================================

function extractCatalogue(content, recordType) {

    const fields = new Map();

    function walk(value, fieldPath) {

        const type = jsonType(value);

        const key = `${recordType}|${fieldPath}`;

        if (!fields.has(key)) {
            fields.set(key, {
                recordType,
                fieldPath,
                observedDataType: type,
                occurrenceCount: 0
            });
        }

        fields.get(key).occurrenceCount++;

        if (value && typeof value === "object") {

            if (Array.isArray(value)) {

                for (const item of value) {
                    walk(item, `${fieldPath}[]`);
                }

            } else {

                for (const [childKey, childValue] of
                    Object.entries(value)) {

                    const nextPath = fieldPath
                        ? `${fieldPath}.${childKey}`
                        : childKey;

                    walk(childValue, nextPath);
                }
            }
        }
    }

    walk(content, "");

    return [...fields.values()];
}

// ============================================================
// STEP 6: EXTRACT RELATIONSHIP CANDIDATES
// ============================================================

const RELATIONSHIP_MAP = {
    required_by_actors: "REQUIRES_ACTOR",
    related_business_objects: "RELATES_TO_OBJECT",
    related_information_requirements:
        "RELATED_INFORMATION_REQUIREMENT",
    functional_behaviour: "HAS_FUNCTIONAL_BEHAVIOUR",
    business_rules: "HAS_BUSINESS_RULE",
    acceptance_criteria: "HAS_ACCEPTANCE_CRITERION"
};

function extractRelationships(content) {

    const relationships = [];

    function walk(value, fieldPath = "") {

        if (!value || typeof value !== "object") {
            return;
        }

        if (Array.isArray(value)) {

            const lastKey = fieldPath.split(".").pop();

            const relationshipType =
                RELATIONSHIP_MAP[lastKey] ||
                `CONTAINS_${normalizeName(lastKey || "ITEM")}`;

            for (const item of value) {

                const targetValue =
                    typeof item === "string"
                        ? item
                        : stableJSON(item);

                relationships.push({
                    relationshipType,
                    targetValue,
                    sourceField: fieldPath,
                    metadata: {
                        extraction_method: "JSON_FIELD_REFERENCE",
                        verified_business_relationship: false
                    }
                });

                if (item && typeof item === "object") {
                    walk(item, fieldPath);
                }
            }

            return;
        }

        for (const [key, child] of Object.entries(value)) {

            const nextPath = fieldPath
                ? `${fieldPath}.${key}`
                : key;

            if (child && typeof child === "object") {
                walk(child, nextPath);
            }
        }
    }

    walk(content);

    return relationships;
}

// ============================================================
// STEP 7: CREATE DATABASE CONNECTION
// ============================================================

function createClient() {

    if (!CONFIG.databaseUrl) {
        throw new Error(
            "DATABASE_URL environment variable is missing."
        );
    }

    return new Client({
        connectionString: CONFIG.databaseUrl,
        application_name: "knowledge_base_json_ingestion"
    });
}

// ============================================================
// STEP 8: INSERT SOURCE
// ============================================================

async function insertSource(client, source) {

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
            source_metadata
        )
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb)
        ON CONFLICT (source_file) DO NOTHING
        RETURNING source_id
        `,
        [
            source.source_file,
            source.source_stage,
            source.source_format,
            source.file_extension,
            JSON.stringify(source.original_content),
            source.character_count,
            source.content_hash,
            JSON.stringify({
                ingestion_method: "CONSOLIDATED_JSON",
                original_filename: source.source_file
            })
        ]
    );

    if (result.rows.length > 0) {
        return {
            sourceId: result.rows[0].source_id,
            inserted: true
        };
    }

    // Existing source: retrieve without modifying it.
    const existing = await client.query(
        `
        SELECT source_id, content_hash
        FROM knowledge_sources
        WHERE source_file = $1
        `,
        [source.source_file]
    );

    if (existing.rows.length === 0) {
        throw new Error(
            `Could not resolve source: ${source.source_file}`
        );
    }

    if (
        existing.rows[0].content_hash !== source.content_hash
    ) {
        throw new Error(
            `SOURCE CONFLICT: ${source.source_file} already exists ` +
            `with different content. Existing data was not changed.`
        );
    }

    return {
        sourceId: existing.rows[0].source_id,
        inserted: false
    };
}

// ============================================================
// STEP 9: INSERT KNOWLEDGE RECORD
// ============================================================

async function insertRecord(
    client,
    source,
    sourceId,
    record
) {

    const classification = classifyRecord(record.content);

    const contentHash = hash(stableJSON(record.content));

    const recordId = "rec_" + hash(
        `${source.source_file}|${record.section}|${record.recordIndex}|${contentHash}`
    );

    const searchableText = extractSearchableText(
        record.content
    );

    const metadata = {
        ...record.metadata,
        original_filename: source.source_file,
        record_index: record.recordIndex,
        content_hash: contentHash
    };

    const result = await client.query(
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
            semantic_category
        )
        VALUES (
            $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11
        )
        ON CONFLICT (record_id) DO NOTHING
        RETURNING record_id
        `,
        [
            recordId,
            classification.recordType,
            sourceId,
            source.source_stage,
            source.source_file,
            record.section,
            JSON.stringify(record.content),
            searchableText,
            contentHash,
            JSON.stringify(metadata),
            classification.semanticCategory
        ]
    );

    // Insert search row even if record already existed.
    // This can fill a missing search row without updating anything.

    await client.query(
        `
        INSERT INTO knowledge_search (
            record_id,
            searchable_text,
            indexed_fields
        )
        VALUES ($1,$2,$3::jsonb)
        ON CONFLICT (record_id) DO NOTHING
        `,
        [
            recordId,
            searchableText,
            JSON.stringify({
                record_type: classification.recordType,
                semantic_category: classification.semanticCategory,
                source_file: source.source_file
            })
        ]
    );

    return {
        recordId,
        recordType: classification.recordType,
        inserted: result.rows.length > 0,
        searchableText
    };
}

// ============================================================
// STEP 10: INSERT RELATIONSHIPS
// ============================================================

async function insertRelationships(
    client,
    recordId,
    content
) {

    const relationships = extractRelationships(content);

    let inserted = 0;

    for (const relationship of relationships) {

        const result = await client.query(
            `
            INSERT INTO knowledge_relationships (
                from_record_id,
                relationship_type,
                target_value,
                target_record_id,
                source_field,
                relationship_metadata
            )
            VALUES ($1,$2,$3,NULL,$4,$5::jsonb)
            ON CONFLICT (
                from_record_id,
                relationship_type,
                target_value,
                source_field
            ) DO NOTHING
            RETURNING relationship_id
            `,
            [
                recordId,
                relationship.relationshipType,
                relationship.targetValue,
                relationship.sourceField,
                JSON.stringify(relationship.metadata)
            ]
        );

        inserted += result.rowCount;
    }

    return inserted;
}

// ============================================================
// STEP 11: INSERT CATALOGUE
// ============================================================

async function insertCatalogue(
    client,
    recordId,
    recordType,
    content
) {

    const fields = extractCatalogue(
        content,
        recordType
    );

    let inserted = 0;

    for (const field of fields) {

        const result = await client.query(
            `
            INSERT INTO knowledge_catalogue (
                record_type,
                field_path,
                observed_data_type,
                occurrence_count,
                sample_record_id,
                field_metadata
            )
            VALUES ($1,$2,$3,$4,$5,$6::jsonb)
            ON CONFLICT (record_type, field_path) DO NOTHING
            RETURNING catalogue_id
            `,
            [
                field.recordType,
                field.fieldPath,
                field.observedDataType,
                field.occurrenceCount,
                recordId,
                JSON.stringify({
                    discovered_by: "JSON_SCHEMA_DISCOVERY"
                })
            ]
        );

        inserted += result.rowCount;
    }

    return inserted;
}

// ============================================================
// STEP 12: INSERT INGESTION RUN
// ============================================================

async function insertIngestionRun(
    client,
    bundleHash,
    expected,
    imported,
    relationships,
    catalogue,
    status,
    errors = []
) {

    await client.query(
        `
        INSERT INTO knowledge_ingestion_runs (
            source_file,
            source_hash,
            ingestion_status,
            records_expected,
            records_imported,
            relationships_created,
            catalogue_fields_created,
            error_count,
            error_details,
            completed_at
        )
        VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW()
        )
        `,
        [
            path.basename(CONFIG.consolidatedFile),
            bundleHash,
            status,
            expected,
            imported,
            relationships,
            catalogue,
            errors.length,
            JSON.stringify(errors)
        ]
    );
}

// ============================================================
// STEP 13: INGEST CONSOLIDATED BUNDLE
// ============================================================

async function ingestBundle(bundle, bundleHash) {

    const client = createClient();

    const stats = {
        sourcesExpected: bundle.sources.length,
        sourcesInserted: 0,
        recordsExpected: 0,
        recordsImported: 0,
        relationshipsCreated: 0,
        catalogueFieldsCreated: 0
    };

    const errors = [];

    await client.connect();

    try {

        await client.query("BEGIN");

        for (const source of bundle.sources) {

            log(`SOURCE: ${source.source_file}`);

            const sourceResult = await insertSource(
                client,
                source
            );

            if (sourceResult.inserted) {
                stats.sourcesInserted++;
            }

            const records = extractRecords(source);

            for (const record of records) {

                stats.recordsExpected++;

                const recordResult = await insertRecord(
                    client,
                    source,
                    sourceResult.sourceId,
                    record
                );

                if (recordResult.inserted) {
                    stats.recordsImported++;
                }

                const relationshipCount =
                    await insertRelationships(
                        client,
                        recordResult.recordId,
                        record.content
                    );

                stats.relationshipsCreated +=
                    relationshipCount;

                const catalogueCount =
                    await insertCatalogue(
                        client,
                        recordResult.recordId,
                        recordResult.recordType,
                        record.content
                    );

                stats.catalogueFieldsCreated +=
                    catalogueCount;

                log(
                    `RECORD ${recordResult.recordId}: ` +
                    `${recordResult.inserted ? "INSERTED" : "EXISTS"}`
                );
            }
        }

        // Run record is inserted in the same transaction.
        // If anything fails, all batch inserts are rolled back.

        await insertIngestionRun(
            client,
            bundleHash,
            stats.recordsExpected,
            stats.recordsImported,
            stats.relationshipsCreated,
            stats.catalogueFieldsCreated,
            "COMPLETED"
        );

        await client.query("COMMIT");

        return stats;

    } catch (error) {

        await client.query("ROLLBACK");

        errors.push({
            message: error.message,
            occurred_at: new Date().toISOString()
        });

        // Record failure in a separate transaction.
        // No existing data is modified.

        try {

            await insertIngestionRun(
                client,
                bundleHash,
                stats.recordsExpected,
                stats.recordsImported,
                stats.relationshipsCreated,
                stats.catalogueFieldsCreated,
                "FAILED",
                errors
            );

        } catch (runError) {
            log(`Could not record failed run: ${runError.message}`);
        }

        throw error;

    } finally {

        await client.end();
    }
}

// ============================================================
// STEP 14: MAIN EXECUTION
// ============================================================

async function main() {

    log("KNOWLEDGE BASE CONSOLIDATION STARTED");

    log("STEP 1: Consolidating JSON files.");

    const consolidated = await consolidateJSONFiles();

    log(`Total sources: ${consolidated.bundle.sources.length}`);

    log(
        `Consolidated file: ${CONFIG.consolidatedFile}`
    );

    log(
        `Consolidated characters: ${consolidated.outputCharacters}`
    );
console.log(consolidated.bundle)
    // log("STEP 2: Starting PostgreSQL ingestion.");

    // const stats = await ingestBundle(
    //     consolidated.bundle,
    //     consolidated.bundleHash
    // );

    // log("========================================");
    // log("KNOWLEDGE BASE INGESTION COMPLETED");
    // log("========================================");

    // console.log(
    //     JSON.stringify(
    //         {
    //             status: "COMPLETED",
    //             database: "demodb",
    //             consolidated_file: CONFIG.consolidatedFile,
    //             ...stats
    //         },
    //         null,
    //         2
    //     )
    // );
}

// ============================================================
// EXECUTION
// ============================================================

main().catch(error => {

    console.error("\nINGESTION FAILED");

    console.error(error.stack || error.message);

    process.exitCode = 1;
});
