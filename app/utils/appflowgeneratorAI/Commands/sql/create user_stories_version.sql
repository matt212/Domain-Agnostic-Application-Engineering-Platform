CREATE TABLE requirements.user_story_versions
(
    -- Version identification
    version_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_story_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    version_type TEXT NOT NULL DEFAULT 'AI_CORRECTED',

    -- User story details
    user_story_title TEXT,
    user_story_description TEXT,
    user_story_type TEXT,
    actor JSONB,
    user_goal TEXT,
    business_value JSONB,

    -- Epic and feature details
    feature_id TEXT,
    feature_name TEXT,
    epic_id TEXT,
    epic_title TEXT,

    -- Requirement and business object references
    business_requirement_ids JSONB,
    functional_requirement_ids JSONB,
    business_objects JSONB,

    -- Story assessment dimensions
    preconditions JSONB,
    postconditions JSONB,
    trigger TEXT,
    main_flow JSONB,
    alternative_flows JSONB,
    exception_flows JSONB,
    business_rules JSONB,
    acceptance_criteria JSONB,
    given_when_then JSONB,
    success_criteria JSONB,
    dependencies JSONB,

    -- Additional story details
    non_functional_requirements JSONB,
    constraints JSONB,
    priority TEXT,
    estimation NUMERIC,
    source_references JSONB,
    status TEXT,

    -- Assessment output
    assessment_result TEXT,
    dimension_findings JSONB,
    correction_summary TEXT,
    evidence_references JSONB,

    -- Execution metadata
    model_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- One record per story version
    CONSTRAINT uq_user_story_version
        UNIQUE (user_story_id, version_number),

    CONSTRAINT chk_user_story_version_number
        CHECK (version_number >= 2),

    CONSTRAINT chk_user_story_version_type
        CHECK (version_type = 'AI_CORRECTED')
);