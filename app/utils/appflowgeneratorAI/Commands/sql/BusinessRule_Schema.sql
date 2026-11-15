
-- ============================================================
-- BUSINESS RULE DISCOVERY REPOSITORY
-- Database: demodb
-- Schema: business_rule_discovery
--
-- Design:
--   1. Five tables
--   2. No foreign key constraints
--   3. No REFERENCES clauses
--   4. Logical relationships through identifiers
--   5. Each ingestion attempt has its own identifiable records
--   6. Original JSON artifacts and raw payloads are preserved
-- ============================================================


-- ============================================================
-- 1. CREATE SCHEMA
-- ============================================================

CREATE SCHEMA IF NOT EXISTS business_rule_discovery;


-- ============================================================
-- 2. GENERATION RUNS
--
-- One record for each AI generation execution.
-- One generation can have multiple ingestion attempts.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_rule_discovery.generation_runs
(
    generation_run_id BIGINT GENERATED ALWAYS AS IDENTITY
        PRIMARY KEY,

    run_reference VARCHAR(150) NOT NULL UNIQUE,

    generator_name VARCHAR(150),

    generator_version VARCHAR(100),

    model_name VARCHAR(150),

    generation_status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',

    started_at TIMESTAMPTZ,

    completed_at TIMESTAMPTZ,

    statistics JSONB NOT NULL DEFAULT '{}'::JSONB,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_generation_status
        CHECK (
            generation_status IN
            ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')
        )
);


-- ============================================================
-- 3. INGESTION RUNS
--
-- One record for every ingestion attempt.
--
-- Example:
--   Generation 1
--       Ingestion 1 -> FAILED
--       Ingestion 2 -> SUCCESS
--       Ingestion 3 -> SUCCESS
--
-- Ingestion attempts are independently identifiable.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_rule_discovery.ingestion_runs
(
    ingestion_run_id BIGINT GENERATED ALWAYS AS IDENTITY
        PRIMARY KEY,

    generation_run_id BIGINT NOT NULL,

    ingestion_number INTEGER NOT NULL,

    ingestion_status VARCHAR(30) NOT NULL DEFAULT 'RUNNING',

    ingestion_mode VARCHAR(30) NOT NULL DEFAULT 'FULL',

    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    completed_at TIMESTAMPTZ,

    records_read INTEGER NOT NULL DEFAULT 0,

    records_inserted INTEGER NOT NULL DEFAULT 0,

    records_updated INTEGER NOT NULL DEFAULT 0,

    records_skipped INTEGER NOT NULL DEFAULT 0,

    records_failed INTEGER NOT NULL DEFAULT 0,

    error_details JSONB NOT NULL DEFAULT '[]'::JSONB,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_ingestion_number
        UNIQUE (generation_run_id, ingestion_number),

    CONSTRAINT chk_ingestion_status
        CHECK (
            ingestion_status IN
            (
                'RUNNING',
                'SUCCESS',
                'PARTIAL',
                'FAILED',
                'SUPERSEDED',
                'ROLLED_BACK'
            )
        ),

    CONSTRAINT chk_ingestion_mode
        CHECK (
            ingestion_mode IN
            ('FULL', 'INCREMENTAL', 'REPROCESS')
        ),

    CONSTRAINT chk_ingestion_counts
        CHECK (
            records_read >= 0
            AND records_inserted >= 0
            AND records_updated >= 0
            AND records_skipped >= 0
            AND records_failed >= 0
        )
);


-- ============================================================
-- 4. SOURCE ARTIFACTS
--
-- Stores the original generated JSON files.
--
-- Artifact types:
--   CONTEXT
--   PLAN
--   BATCH
--   UNIT
--
-- Each ingestion attempt gets its own artifact records.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_rule_discovery.source_artifacts
(
    artifact_id BIGINT GENERATED ALWAYS AS IDENTITY
        PRIMARY KEY,

    generation_run_id BIGINT NOT NULL,

    ingestion_run_id BIGINT NOT NULL,

    artifact_type VARCHAR(30) NOT NULL,

    file_name VARCHAR(500) NOT NULL,

    file_path TEXT,

    file_checksum VARCHAR(128),

    raw_content JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_artifact_type
        CHECK (
            artifact_type IN
            ('CONTEXT', 'PLAN', 'BATCH', 'UNIT')
        ),

    CONSTRAINT uq_ingestion_artifact
        UNIQUE (ingestion_run_id, artifact_type, file_name)
);


-- ============================================================
-- 5. GENERATION UNITS
--
-- Stores unit-level planning information.
--
-- Current output:
--   28 BUSINESS_REQUIREMENT units
--   14 BUSINESS_OBJECT units
--
-- Unit IDs:
--   BR-001 ... BR-028
--   OBJ-001 ... OBJ-014
--
-- Statements are retained as JSONB arrays.
-- Array ordering and repeated assignments are preserved.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_rule_discovery.generation_units
(
    unit_pk BIGINT GENERATED ALWAYS AS IDENTITY
        PRIMARY KEY,

    generation_run_id BIGINT NOT NULL,

    ingestion_run_id BIGINT NOT NULL,

    unit_id VARCHAR(100) NOT NULL,

    unit_kind VARCHAR(50) NOT NULL,

    title TEXT,

    brief TEXT,

    batch_number INTEGER,

    statements JSONB NOT NULL DEFAULT '[]'::JSONB,

    functional_requirement_ids JSONB NOT NULL DEFAULT '[]'::JSONB,

    business_requirement_id VARCHAR(100),

    actor_ids JSONB NOT NULL DEFAULT '[]'::JSONB,

    object_ids JSONB NOT NULL DEFAULT '[]'::JSONB,

    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_unit_kind
        CHECK (
            unit_kind IN
            ('BUSINESS_REQUIREMENT', 'BUSINESS_OBJECT')
        ),

    CONSTRAINT uq_ingestion_unit
        UNIQUE (ingestion_run_id, unit_id)
);


-- ============================================================
-- 6. BUSINESS RULES
--
-- Stores individual generated business rules.
--
-- One row per business rule.
--
-- Includes:
--   Rule definition
--   Classification
--   Conditions and exceptions
--   Actors and objects
--   Enforcement and severity
--   Functional requirement traceability
--   Optional Knowledge Base record identifiers
--   Review information
--   Original rule JSON payload
--
-- The knowledge_record_ids field is optional.
-- It can be populated when Knowledge Base records
-- are resolved to actual record IDs.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_rule_discovery.business_rules
(
    business_rule_pk BIGINT GENERATED ALWAYS AS IDENTITY
        PRIMARY KEY,

    generation_run_id BIGINT NOT NULL,

    ingestion_run_id BIGINT NOT NULL,

    unit_id VARCHAR(100) NOT NULL,

    rule_position INTEGER NOT NULL,

    batch_number INTEGER,

    name TEXT NOT NULL,

    statement TEXT NOT NULL,

    type VARCHAR(100),

    condition JSONB,

    exceptions JSONB NOT NULL DEFAULT '[]'::JSONB,

    actors JSONB NOT NULL DEFAULT '[]'::JSONB,

    objects JSONB NOT NULL DEFAULT '[]'::JSONB,

    enforcement TEXT,

    severity VARCHAR(50),

    if_violated TEXT,

    rationale TEXT,

    parameters JSONB NOT NULL DEFAULT '{}'::JSONB,

    related_functional_requirements JSONB
        NOT NULL DEFAULT '[]'::JSONB,

    basis VARCHAR(100),

    knowledge_record_ids JSONB
        NOT NULL DEFAULT '[]'::JSONB,

    review_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',

    review_comments TEXT,

    reviewed_by VARCHAR(150),

    reviewed_at TIMESTAMPTZ,

    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_ingestion_unit_rule
        UNIQUE (ingestion_run_id, unit_id, rule_position),

    CONSTRAINT chk_rule_position
        CHECK (rule_position > 0),

    CONSTRAINT chk_review_status
        CHECK (
            review_status IN
            (
                'PENDING',
                'APPROVED',
                'REJECTED',
                'NEEDS_REVISION'
            )
        )
);


-- ============================================================
-- 7. INDEXES
-- ============================================================


-- Generation runs

CREATE INDEX IF NOT EXISTS idx_generation_runs_status
    ON business_rule_discovery.generation_runs
    (generation_status);


CREATE INDEX IF NOT EXISTS idx_generation_runs_created
    ON business_rule_discovery.generation_runs
    (created_at DESC);


-- Ingestion runs

CREATE INDEX IF NOT EXISTS idx_ingestion_runs_generation
    ON business_rule_discovery.ingestion_runs
    (generation_run_id);


CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status
    ON business_rule_discovery.ingestion_runs
    (ingestion_status);


CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started
    ON business_rule_discovery.ingestion_runs
    (started_at DESC);


-- Source artifacts

CREATE INDEX IF NOT EXISTS idx_source_artifacts_generation
    ON business_rule_discovery.source_artifacts
    (generation_run_id);


CREATE INDEX IF NOT EXISTS idx_source_artifacts_ingestion
    ON business_rule_discovery.source_artifacts
    (ingestion_run_id);


CREATE INDEX IF NOT EXISTS idx_source_artifacts_type
    ON business_rule_discovery.source_artifacts
    (artifact_type);


-- Generation units

CREATE INDEX IF NOT EXISTS idx_generation_units_generation
    ON business_rule_discovery.generation_units
    (generation_run_id);


CREATE INDEX IF NOT EXISTS idx_generation_units_ingestion
    ON business_rule_discovery.generation_units
    (ingestion_run_id);


CREATE INDEX IF NOT EXISTS idx_generation_units_unit
    ON business_rule_discovery.generation_units
    (unit_id);


CREATE INDEX IF NOT EXISTS idx_generation_units_br
    ON business_rule_discovery.generation_units
    (business_requirement_id);


CREATE INDEX IF NOT EXISTS idx_generation_units_batch
    ON business_rule_discovery.generation_units
    (batch_number);


-- Business rules

CREATE INDEX IF NOT EXISTS idx_business_rules_generation
    ON business_rule_discovery.business_rules
    (generation_run_id);


CREATE INDEX IF NOT EXISTS idx_business_rules_ingestion
    ON business_rule_discovery.business_rules
    (ingestion_run_id);


CREATE INDEX IF NOT EXISTS idx_business_rules_unit
    ON business_rule_discovery.business_rules
    (unit_id);


CREATE INDEX IF NOT EXISTS idx_business_rules_batch
    ON business_rule_discovery.business_rules
    (batch_number);


CREATE INDEX IF NOT EXISTS idx_business_rules_type
    ON business_rule_discovery.business_rules
    (type);


CREATE INDEX IF NOT EXISTS idx_business_rules_severity
    ON business_rule_discovery.business_rules
    (severity);


CREATE INDEX IF NOT EXISTS idx_business_rules_basis
    ON business_rule_discovery.business_rules
    (basis);


CREATE INDEX IF NOT EXISTS idx_business_rules_review
    ON business_rule_discovery.business_rules
    (review_status);


CREATE INDEX IF NOT EXISTS idx_business_rules_name
    ON business_rule_discovery.business_rules
    (name);


-- ============================================================
-- END OF BUSINESS RULE DISCOVERY SCHEMA
-- ============================================================
