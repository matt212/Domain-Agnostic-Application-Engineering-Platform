
-- ============================================================
-- KNOWLEDGE BASE SCHEMA
-- PostgreSQL 17
-- Database: demodb
-- ============================================================

-- 1. KNOWLEDGE SOURCES
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

-- 2. KNOWLEDGE RECORDS
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

-- 3. KNOWLEDGE SEARCH
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

-- 4. KNOWLEDGE RELATIONSHIPS
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

-- 5. KNOWLEDGE CATALOGUE
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

-- 6. KNOWLEDGE INGESTION RUNS
CREATE TABLE IF NOT EXISTS knowledge_ingestion_runs (
    ingestion_id BIGSERIAL PRIMARY KEY,
    source_file TEXT,
    source_hash TEXT,
    ingestion_status TEXT NOT NULL
        CHECK (
            ingestion_status IN ('RUNNING', 'COMPLETED', 'FAILED')
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

-- ============================================================
-- INDEXES
-- ============================================================

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
