/*
===============================================================================
FEATURE GENERATION — DATABASE-DRIVEN FEATURE EXTRACTION
===============================================================================

PURPOSE
-------
Generate Feature records directly from existing Epic, BR and FR data.

FEATURE DEFINITION
------------------
One Feature per unique Epic + Functional Requirement combination.

FEATURE NAME:
    Functional Requirement name

FEATURE DESCRIPTION:
    Functional Requirement description

BUSINESS CAPABILITY:
    Functional Requirement name

FEATURE ID:
    Generated dynamically by SQL.

SOURCE TABLES
-------------
requirements.business_requirements
requirements.functional_requirements
requirements.requirement_relationships
requirements.source_files

OUTPUT
------
One result set.
One row per Epic + Functional Requirement.

No AI.
No manual assignments.
No hardcoded capability lists.
No data modification.
===============================================================================
*/

WITH

-- ============================================================================
-- 1. DERIVE EPIC GROUPS
-- ============================================================================

business_requirement_groups AS (

    SELECT
        NULLIF(TRIM(br.business_objective), '') AS business_objective,

        ARRAY_AGG(
            br.business_requirement_pk
            ORDER BY br.business_requirement_id
        ) AS business_requirement_pks

    FROM requirements.business_requirements br

    WHERE NULLIF(TRIM(br.business_objective), '') IS NOT NULL

    GROUP BY
        NULLIF(TRIM(br.business_objective), '')
),

numbered_epics AS (

    SELECT
        ROW_NUMBER() OVER (
            ORDER BY business_objective
        ) AS epic_number,

        business_objective AS epic_title,

        business_requirement_pks

    FROM business_requirement_groups
),

-- ============================================================================
-- 2. RETRIEVE BUSINESS REQUIREMENTS UNDER EACH EPIC
-- ============================================================================

epic_business_requirements AS (

    SELECT

        'EPIC-' || LPAD(
            ne.epic_number::TEXT,
            3,
            '0'
        ) AS epic_id,

        ne.epic_title,

        br.business_requirement_pk,
        br.business_requirement_id,
        br.name AS business_requirement_name,
        br.business_requirement,
        br.business_objective,

        br.business_value,
        br.success_measures,
        br.stakeholders,
        br.priority,

        br.policies_and_constraints AS constraints,
        br.assumptions,
        br.risks_and_dependencies,

        br.validation_status,
        br.approval_status,

        br.raw_payload AS br_raw_payload,

        br_sf.file_name AS br_source_file,
        br_sf.source_version AS br_source_version

    FROM numbered_epics ne

    CROSS JOIN LATERAL UNNEST(
        ne.business_requirement_pks
    ) AS selected_br(business_requirement_pk)

    JOIN requirements.business_requirements br
        ON br.business_requirement_pk =
           selected_br.business_requirement_pk

    LEFT JOIN requirements.source_files br_sf
        ON br_sf.source_file_id = br.source_file_id
),

-- ============================================================================
-- 3. RETRIEVE BR-FR RELATIONSHIPS
-- ============================================================================

relationship_evidence AS (

    SELECT

        rr.relationship_id,

        rr.business_requirement_pk,
        rr.functional_requirement_pk,

        rr.relationship_type,
        rr.relationship_status,
        rr.evidence AS relationship_evidence,

        rr_sf.file_name AS relationship_source_file,
        rr_sf.source_version AS relationship_source_version

    FROM requirements.requirement_relationships rr

    LEFT JOIN requirements.source_files rr_sf
        ON rr_sf.source_file_id = rr.source_file_id
),

-- ============================================================================
-- 4. RETRIEVE FUNCTIONAL REQUIREMENTS AND THEIR ORIGINAL EVIDENCE
-- ============================================================================

functional_requirement_evidence AS (

    SELECT

        fr.functional_requirement_pk,
        fr.functional_requirement_id,

        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,

        fr.raw_payload -> 'requirement'
            AS requirement,

        fr.raw_payload -> 'business_need'
            AS business_need,

        fr.raw_payload -> 'functional_behaviour'
            AS functional_behaviour,

        fr.raw_payload -> 'business_rules'
            AS business_rules,

        fr.raw_payload -> 'acceptance_criteria'
            AS acceptance_criteria,

        fr.raw_payload -> 'required_by_actors'
            AS actors,

        fr.raw_payload -> 'related_business_objects'
            AS business_objects,

        fr.raw_payload -> 'related_information_requirements'
            AS information_requirements,

        fr.raw_payload AS fr_raw_payload,

        fr_sf.file_name AS fr_source_file,
        fr_sf.source_version AS fr_source_version

    FROM requirements.functional_requirements fr

    LEFT JOIN requirements.source_files fr_sf
        ON fr_sf.source_file_id = fr.source_file_id
),

-- ============================================================================
-- 5. JOIN EPIC, BR, RELATIONSHIP AND FR
-- ============================================================================

epic_fr_relationships AS (

    SELECT

        -- EPIC

        ebr.epic_id,
        ebr.epic_title,

        -- BUSINESS REQUIREMENT

        ebr.business_requirement_pk,
        ebr.business_requirement_id,
        ebr.business_requirement_name,
        ebr.business_requirement,
        ebr.business_objective,

        ebr.business_value,
        ebr.success_measures,
        ebr.stakeholders,
        ebr.priority,

        ebr.constraints,
        ebr.assumptions,
        ebr.risks_and_dependencies,

        ebr.validation_status,
        ebr.approval_status,

        ebr.br_raw_payload,

        ebr.br_source_file,
        ebr.br_source_version,

        -- RELATIONSHIP

        re.relationship_id,
        re.relationship_type,
        re.relationship_status,
        re.relationship_evidence,

        re.relationship_source_file,
        re.relationship_source_version,

        -- FUNCTIONAL REQUIREMENT

        fre.functional_requirement_pk,
        fre.functional_requirement_id,

        fre.functional_requirement_name,
        fre.functional_requirement_description,
        fre.functional_requirement_status,

        fre.requirement,
        fre.business_need,
        fre.functional_behaviour,
        fre.business_rules,
        fre.acceptance_criteria,

        fre.actors,
        fre.business_objects,
        fre.information_requirements,

        fre.fr_raw_payload,

        fre.fr_source_file,
        fre.fr_source_version

    FROM epic_business_requirements ebr

    JOIN relationship_evidence re
        ON re.business_requirement_pk =
           ebr.business_requirement_pk

    JOIN functional_requirement_evidence fre
        ON fre.functional_requirement_pk =
           re.functional_requirement_pk
),

-- ============================================================================
-- 6. CREATE DATABASE-DRIVEN FEATURE RECORDS
--
-- One Feature per Epic + Functional Requirement.
-- Consolidate all associated BR evidence.
-- ============================================================================

feature_records AS (

    SELECT

        -- --------------------------------------------------------------------
        -- EPIC
        -- --------------------------------------------------------------------

        epic_id,
        epic_title,

        -- --------------------------------------------------------------------
        -- FEATURE NAME AND DESCRIPTION FROM EXISTING FR
        -- --------------------------------------------------------------------

        functional_requirement_name AS feature_name,

        functional_requirement_description AS feature_description,

        functional_requirement_name AS business_capability,

        -- --------------------------------------------------------------------
        -- BUSINESS REQUIREMENT TRACEABILITY
        -- --------------------------------------------------------------------

        ARRAY_AGG(
            DISTINCT business_requirement_id
            ORDER BY business_requirement_id
        ) AS business_requirement_ids,

        -- --------------------------------------------------------------------
        -- FUNCTIONAL REQUIREMENT TRACEABILITY
        -- --------------------------------------------------------------------

        ARRAY[
            functional_requirement_id
        ] AS functional_requirement_ids,

        -- --------------------------------------------------------------------
        -- ACTORS
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT actors
            ) FILTER (
                WHERE actors IS NOT NULL
            ),
            '[]'::JSONB
        ) AS actors,

        -- --------------------------------------------------------------------
        -- BUSINESS OBJECTS
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT business_objects
            ) FILTER (
                WHERE business_objects IS NOT NULL
            ),
            '[]'::JSONB
        ) AS business_objects,

        -- --------------------------------------------------------------------
        -- BUSINESS VALUE
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT TO_JSONB(business_value)
            ) FILTER (
                WHERE business_value IS NOT NULL
            ),
            '[]'::JSONB
        ) AS business_value,

        -- --------------------------------------------------------------------
        -- SUCCESS MEASURES
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT TO_JSONB(success_measures)
            ) FILTER (
                WHERE success_measures IS NOT NULL
            ),
            '[]'::JSONB
        ) AS success_measures,

        -- --------------------------------------------------------------------
        -- PRIORITY
        --
        -- Preserve all distinct priorities from linked BRs.
        -- Do not arbitrarily choose one when priorities differ.
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT TO_JSONB(priority)
            ) FILTER (
                WHERE priority IS NOT NULL
            ),
            '[]'::JSONB
        ) AS priority,

        -- --------------------------------------------------------------------
        -- CONSTRAINTS
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT TO_JSONB(constraints)
            ) FILTER (
                WHERE constraints IS NOT NULL
            ),
            '[]'::JSONB
        ) AS constraints,

        -- --------------------------------------------------------------------
        -- RISKS AND DEPENDENCIES
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT TO_JSONB(risks_and_dependencies)
            ) FILTER (
                WHERE risks_and_dependencies IS NOT NULL
            ),
            '[]'::JSONB
        ) AS risks_and_dependencies,

        -- --------------------------------------------------------------------
        -- SOURCE REFERENCES
        -- --------------------------------------------------------------------

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'source_type', 'BUSINESS_REQUIREMENT',
                    'source_file', br_source_file,
                    'source_version', br_source_version
                )
            ) FILTER (
                WHERE br_source_file IS NOT NULL
            ),
            '[]'::JSONB
        )

        ||

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'source_type', 'FUNCTIONAL_REQUIREMENT',
                    'source_file', fr_source_file,
                    'source_version', fr_source_version
                )
            ) FILTER (
                WHERE fr_source_file IS NOT NULL
            ),
            '[]'::JSONB
        )

        ||

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'source_type', 'BR_FR_RELATIONSHIP',
                    'source_file', relationship_source_file,
                    'source_version', relationship_source_version
                )
            ) FILTER (
                WHERE relationship_source_file IS NOT NULL
            ),
            '[]'::JSONB
        ) AS source_references,

        -- --------------------------------------------------------------------
        -- ADDITIONAL EXISTING DATABASE EVIDENCE
        -- --------------------------------------------------------------------

        JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
                'business_requirement_id',
                business_requirement_id,

                'business_requirement_name',
                business_requirement_name,

                'business_requirement',
                business_requirement
            )
        ) AS related_business_requirements,

        JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
                'relationship_id',
                relationship_id,

                'relationship_type',
                relationship_type,

                'relationship_status',
                relationship_status,

                'evidence',
                relationship_evidence
            )
        ) AS relationship_evidence,

        COALESCE(
            JSONB_AGG(
                DISTINCT business_rules
            ) FILTER (
                WHERE business_rules IS NOT NULL
            ),
            '[]'::JSONB
        ) AS business_rules,

        COALESCE(
            JSONB_AGG(
                DISTINCT acceptance_criteria
            ) FILTER (
                WHERE acceptance_criteria IS NOT NULL
            ),
            '[]'::JSONB
        ) AS acceptance_criteria,

        COALESCE(
            JSONB_AGG(
                DISTINCT business_need
            ) FILTER (
                WHERE business_need IS NOT NULL
            ),
            '[]'::JSONB
        ) AS business_needs,

        COALESCE(
            JSONB_AGG(
                DISTINCT functional_behaviour
            ) FILTER (
                WHERE functional_behaviour IS NOT NULL
            ),
            '[]'::JSONB
        ) AS functional_behaviours,

        COALESCE(
            JSONB_AGG(
                DISTINCT information_requirements
            ) FILTER (
                WHERE information_requirements IS NOT NULL
            ),
            '[]'::JSONB
        ) AS information_requirements,

        ARRAY_AGG(
            DISTINCT validation_status
        ) FILTER (
            WHERE validation_status IS NOT NULL
        ) AS br_validation_statuses,

        ARRAY_AGG(
            DISTINCT approval_status
        ) FILTER (
            WHERE approval_status IS NOT NULL
        ) AS br_approval_statuses,

        -- --------------------------------------------------------------------
        -- ORIGINAL SOURCE PAYLOADS
        -- --------------------------------------------------------------------

        JSONB_AGG(
            DISTINCT br_raw_payload
        ) FILTER (
            WHERE br_raw_payload IS NOT NULL
        ) AS br_raw_payloads,

        JSONB_AGG(
            DISTINCT fr_raw_payload
        ) FILTER (
            WHERE fr_raw_payload IS NOT NULL
        ) AS fr_raw_payloads

    FROM epic_fr_relationships

    GROUP BY

        epic_id,
        epic_title,

        functional_requirement_pk,
        functional_requirement_id,

        functional_requirement_name,
        functional_requirement_description
),

-- ============================================================================
-- 7. GENERATE FEATURE IDS FROM DATABASE RESULT
-- ============================================================================

numbered_features AS (

    SELECT

        ROW_NUMBER() OVER (
            ORDER BY
                epic_id,
                functional_requirement_ids[1]
        ) AS feature_number,

        *

    FROM feature_records
)

-- ============================================================================
-- 8. FINAL FEATURE RESULT
-- ============================================================================

SELECT

    -- FEATURE ID

    'FEAT-' || LPAD(
        feature_number::TEXT,
        3,
        '0'
    ) AS feature_id,

    -- FEATURE DEFINITION

    feature_name,
    feature_description,
    business_capability,

    -- EPIC

    epic_id,
    epic_title,

    -- REQUIREMENT TRACEABILITY

    business_requirement_ids,
    functional_requirement_ids,

    -- ACTORS AND BUSINESS OBJECTS

    actors,
    business_objects,

    -- BUSINESS CONTEXT

    business_value,
    success_measures,
    priority,
    constraints,
    risks_and_dependencies,

    -- SOURCE REFERENCES

    source_references,

    -- SUPPORTING DATABASE EVIDENCE

    related_business_requirements,
    relationship_evidence,

    business_rules,
    acceptance_criteria,
    business_needs,
    functional_behaviours,
    information_requirements,

    br_validation_statuses,
    br_approval_statuses,

    br_raw_payloads,
    fr_raw_payloads

FROM numbered_features

ORDER BY
    epic_id,
    feature_id;