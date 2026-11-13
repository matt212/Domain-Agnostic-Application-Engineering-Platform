
-- ============================================================
-- REQUIREMENTS REPOSITORY
-- Database: demodb
-- Schema: requirements
-- Purpose: FR, BR, source files, validation, consolidation,
--          relationships, decisions and alternatives.
--
-- Safe to re-run: uses IF NOT EXISTS.
-- Does not modify existing knowledge_* tables.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS requirements;

-- ============================================================
-- 1. INGESTION RUNS
-- Track every import of FR, BR and supporting JSON artifacts.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.ingestion_runs (
    ingestion_run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_type VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'STARTED',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    source_description TEXT,
    statistics JSONB NOT NULL DEFAULT '{}'::JSONB,
    errors JSONB NOT NULL DEFAULT '[]'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ingestion_status
        CHECK (status IN ('STARTED', 'COMPLETED', 'PARTIAL', 'FAILED'))
);

-- ============================================================
-- 2. SOURCE FILES
-- Preserve the original consolidated and individual JSON files.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.source_files (
    source_file_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ingestion_run_id BIGINT REFERENCES requirements.ingestion_runs(ingestion_run_id),

    artifact_type VARCHAR(50) NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT,
    file_checksum TEXT,

    source_version VARCHAR(100),
    source_timestamp TIMESTAMPTZ,

    raw_content JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_source_artifact_type
        CHECK (artifact_type IN (
            'CONSOLIDATED_FR',
            'CONSOLIDATED_BR',
            'FR_WORK_FILE',
            'BR_WORK_FILE',
            'FR_VALIDATION',
            'BR_VALIDATION',
            'BR_CONSOLIDATION',
            'OTHER'
        ))
);

CREATE INDEX IF NOT EXISTS idx_source_files_artifact_type
    ON requirements.source_files(artifact_type);

CREATE INDEX IF NOT EXISTS idx_source_files_checksum
    ON requirements.source_files(file_checksum);

-- ============================================================
-- 3. FUNCTIONAL REQUIREMENTS
-- Keep normalized searchable fields and original JSON payload.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.functional_requirements (
    functional_requirement_pk BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    functional_requirement_id VARCHAR(100) NOT NULL UNIQUE,
    name TEXT,
    description TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'IMPORTED',

    source_file_id BIGINT REFERENCES requirements.source_files(source_file_id),

    raw_payload JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fr_requirement_id
    ON requirements.functional_requirements(functional_requirement_id);

CREATE INDEX IF NOT EXISTS idx_fr_payload
    ON requirements.functional_requirements USING GIN(raw_payload);

-- ============================================================
-- 4. BUSINESS REQUIREMENTS
-- Preserve original BR fields and the complete JSON payload.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.business_requirements (
    business_requirement_pk BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_requirement_id VARCHAR(100) NOT NULL UNIQUE,

    name TEXT,
    business_requirement TEXT,
    business_objective TEXT,
    business_value TEXT,

    stakeholders JSONB NOT NULL DEFAULT '[]'::JSONB,
    success_measures JSONB NOT NULL DEFAULT '[]'::JSONB,

    priority VARCHAR(50),

    policies_and_constraints JSONB NOT NULL DEFAULT '[]'::JSONB,
    assumptions JSONB NOT NULL DEFAULT '[]'::JSONB,
    risks_and_dependencies JSONB NOT NULL DEFAULT '[]'::JSONB,

    linked_functional_requirements JSONB NOT NULL DEFAULT '[]'::JSONB,

    validation_status VARCHAR(30) DEFAULT 'NOT_ASSESSED',
    approval_status VARCHAR(30) DEFAULT 'NOT_APPROVED',

    source_file_id BIGINT REFERENCES requirements.source_files(source_file_id),

    raw_payload JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_br_validation_status
        CHECK (
            validation_status IN (
                'NOT_ASSESSED', 'PASS', 'REVIEW', 'FAIL'
            )
        ),

    CONSTRAINT chk_br_approval_status
        CHECK (
            approval_status IN (
                'NOT_APPROVED', 'PENDING', 'APPROVED', 'REJECTED'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_br_requirement_id
    ON requirements.business_requirements(business_requirement_id);

CREATE INDEX IF NOT EXISTS idx_br_validation_status
    ON requirements.business_requirements(validation_status);

CREATE INDEX IF NOT EXISTS idx_br_payload
    ON requirements.business_requirements USING GIN(raw_payload);

-- ============================================================
-- 5. REQUIREMENT VERSIONS
-- Preserve multiple imported versions without overwriting
-- previously ingested requirement content.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.requirement_versions (
    requirement_version_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    requirement_type VARCHAR(10) NOT NULL,
    requirement_id VARCHAR(100) NOT NULL,
    version_number INTEGER NOT NULL,

    source_file_id BIGINT REFERENCES requirements.source_files(source_file_id),

    payload JSONB NOT NULL,

    version_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_version_requirement_type
        CHECK (requirement_type IN ('FR', 'BR')),

    CONSTRAINT uq_requirement_version
        UNIQUE (requirement_type, requirement_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_requirement_versions_lookup
    ON requirements.requirement_versions(requirement_type, requirement_id);

-- ============================================================
-- 6. SOURCE RECORDS
-- Link individual work files and their raw records to FR/BR IDs.
-- Supports records that are missing from the consolidated file.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.source_records (
    source_record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    source_file_id BIGINT NOT NULL
        REFERENCES requirements.source_files(source_file_id),

    requirement_type VARCHAR(10) NOT NULL,
    requirement_id VARCHAR(100),

    record_status VARCHAR(30) DEFAULT 'IMPORTED',

    raw_record JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_source_record_type
        CHECK (requirement_type IN ('FR', 'BR', 'OTHER'))
);

CREATE INDEX IF NOT EXISTS idx_source_records_requirement
    ON requirements.source_records(requirement_type, requirement_id);

-- ============================================================
-- 7. FR <-> BR RELATIONSHIPS
-- Store traceability independently of JSON arrays.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.requirement_relationships (
    relationship_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    functional_requirement_pk BIGINT NOT NULL
        REFERENCES requirements.functional_requirements(functional_requirement_pk)
        ON DELETE CASCADE,

    business_requirement_pk BIGINT NOT NULL
        REFERENCES requirements.business_requirements(business_requirement_pk)
        ON DELETE CASCADE,

    relationship_type VARCHAR(50) NOT NULL DEFAULT 'SUPPORTS',

    relationship_status VARCHAR(30) NOT NULL DEFAULT 'IMPORTED',

    source_file_id BIGINT REFERENCES requirements.source_files(source_file_id),

    evidence JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_fr_br_relationship
        UNIQUE (
            functional_requirement_pk,
            business_requirement_pk,
            relationship_type
        )
);

CREATE INDEX IF NOT EXISTS idx_relationships_fr
    ON requirements.requirement_relationships(functional_requirement_pk);

CREATE INDEX IF NOT EXISTS idx_relationships_br
    ON requirements.requirement_relationships(business_requirement_pk);

-- ============================================================
-- 8. BR VALIDATION RUNS
-- Store each validation execution and its overall result.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.br_validation_runs (
    validation_run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    ingestion_run_id BIGINT
        REFERENCES requirements.ingestion_runs(ingestion_run_id),

    validation_version VARCHAR(100),
    validator VARCHAR(255),
    validation_method VARCHAR(100),

    validation_status VARCHAR(30) NOT NULL,

    total_requirements INTEGER DEFAULT 0,
    pass_count INTEGER DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,

    validation_summary JSONB NOT NULL DEFAULT '{}'::JSONB,

    source_file_id BIGINT REFERENCES requirements.source_files(source_file_id),

    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_br_validation_run_status
        CHECK (validation_status IN ('PASS', 'REVIEW', 'FAIL', 'PARTIAL'))
);

-- ============================================================
-- 9. BR VALIDATION FINDINGS
-- Store findings, evidence and recommendations individually.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.br_validation_findings (
    validation_finding_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    validation_run_id BIGINT NOT NULL
        REFERENCES requirements.br_validation_runs(validation_run_id)
        ON DELETE CASCADE,

    business_requirement_pk BIGINT
        REFERENCES requirements.business_requirements(business_requirement_pk),

    requirement_id VARCHAR(100),

    dimension VARCHAR(100),
    severity VARCHAR(30),

    finding TEXT,
    evidence TEXT,
    recommendation TEXT,

    raw_finding JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_br_findings_requirement
    ON requirements.br_validation_findings(requirement_id);

CREATE INDEX IF NOT EXISTS idx_br_findings_dimension
    ON requirements.br_validation_findings(dimension);

-- ============================================================
-- 10. BR CONSOLIDATION RUNS
-- Store portfolio-level BR-to-BR assessment.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.br_consolidation_runs (
    consolidation_run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    ingestion_run_id BIGINT
        REFERENCES requirements.ingestion_runs(ingestion_run_id),

    consolidation_method VARCHAR(100),
    consolidation_status VARCHAR(30),

    total_requirements INTEGER DEFAULT 0,
    overlap_pair_count INTEGER DEFAULT 0,
    confirmed_duplicate_count INTEGER DEFAULT 0,

    consolidation_summary JSONB NOT NULL DEFAULT '{}'::JSONB,

    source_file_id BIGINT REFERENCES requirements.source_files(source_file_id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 11. BR OVERLAP PAIRS
-- Preserve the four identified overlap pairs and future findings.
-- An overlap does NOT automatically mean duplicate.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.br_overlap_pairs (
    overlap_pair_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    consolidation_run_id BIGINT NOT NULL
        REFERENCES requirements.br_consolidation_runs(consolidation_run_id)
        ON DELETE CASCADE,

    business_requirement_1 VARCHAR(100) NOT NULL,
    business_requirement_2 VARCHAR(100) NOT NULL,

    overlap_type VARCHAR(50),
    overlap_status VARCHAR(30) DEFAULT 'UNRESOLVED',

    reason TEXT,
    overlapping_scope TEXT,
    recommendation TEXT,

    raw_assessment JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_br_overlap_pair
        UNIQUE (
            consolidation_run_id,
            business_requirement_1,
            business_requirement_2
        )
);

-- ============================================================
-- 12. CONSOLIDATION FINDINGS
-- Store source-vs-consolidated mismatches and other findings.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.br_consolidation_findings (
    consolidation_finding_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    consolidation_run_id BIGINT NOT NULL
        REFERENCES requirements.br_consolidation_runs(consolidation_run_id)
        ON DELETE CASCADE,

    requirement_id VARCHAR(100),

    finding_type VARCHAR(100),
    severity VARCHAR(30),

    field_name TEXT,
    consolidated_value JSONB,
    work_file_value JSONB,

    finding_description TEXT,
    recommendation TEXT,

    raw_finding JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_br_consolidation_findings_requirement
    ON requirements.br_consolidation_findings(requirement_id);

-- ============================================================
-- 13. CONSOLIDATION DECISIONS
-- Record accepted, revised, merged, alternative or unresolved.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.br_consolidation_decisions (
    decision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_requirement_id VARCHAR(100) NOT NULL,

    decision VARCHAR(30) NOT NULL,
    decision_reason TEXT,

    related_business_requirement_ids JSONB
        NOT NULL DEFAULT '[]'::JSONB,

    decided_by VARCHAR(255),
    decided_at TIMESTAMPTZ,

    decision_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_br_consolidation_decision
        CHECK (
            decision IN (
                'ACCEPTED',
                'REVISED',
                'MERGED',
                'ALTERNATIVE',
                'UNRESOLVED'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_br_decisions_requirement
    ON requirements.br_consolidation_decisions(business_requirement_id);

-- ============================================================
-- 14. BR ALTERNATIVES
-- Preserve alternatives alongside the original BR.
-- Do not replace the original BR record.
-- ============================================================

CREATE TABLE IF NOT EXISTS requirements.br_alternatives (
    alternative_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_requirement_id VARCHAR(100) NOT NULL,

    alternative_type VARCHAR(50) NOT NULL DEFAULT 'RECOMMENDED',
    alternative_name TEXT,
    alternative_description TEXT,

    rationale TEXT,
    source_finding_ids JSONB NOT NULL DEFAULT '[]'::JSONB,

    alternative_status VARCHAR(30) NOT NULL DEFAULT 'PROPOSED',

    raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_br_alternative_status
        CHECK (
            alternative_status IN (
                'PROPOSED',
                'UNDER_REVIEW',
                'ACCEPTED',
                'REJECTED',
                'SUPERSEDED'
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_br_alternatives_requirement
    ON requirements.br_alternatives(business_requirement_id);

-- ============================================================
-- 15. USEFUL VIEWS
-- ============================================================

CREATE OR REPLACE VIEW requirements.v_business_requirements AS
SELECT
    br.business_requirement_pk,
    br.business_requirement_id,
    br.name,
    br.business_requirement,
    br.business_objective,
    br.business_value,
    br.priority,
    br.validation_status,
    br.approval_status,
    br.created_at,
    br.updated_at,
    COUNT(DISTINCT f.validation_finding_id) AS finding_count,
    COUNT(DISTINCT a.alternative_id) AS alternative_count
FROM requirements.business_requirements br
LEFT JOIN requirements.br_validation_findings f
    ON f.business_requirement_pk = br.business_requirement_pk
LEFT JOIN requirements.br_alternatives a
    ON a.business_requirement_id = br.business_requirement_id
GROUP BY br.business_requirement_pk;

CREATE OR REPLACE VIEW requirements.v_fr_br_traceability AS
SELECT
    fr.functional_requirement_id,
    fr.name AS functional_requirement_name,
    br.business_requirement_id,
    br.name AS business_requirement_name,
    br.validation_status,
    br.approval_status,
    rr.relationship_type,
    rr.relationship_status
FROM requirements.requirement_relationships rr
JOIN requirements.functional_requirements fr
    ON fr.functional_requirement_pk = rr.functional_requirement_pk
JOIN requirements.business_requirements br
    ON br.business_requirement_pk = rr.business_requirement_pk;

-- ============================================================
-- 16. SCHEMA CREATION VERIFICATION
-- ============================================================

SELECT
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'requirements'
ORDER BY table_name;

-- ============================================================
-- END
-- ============================================================
