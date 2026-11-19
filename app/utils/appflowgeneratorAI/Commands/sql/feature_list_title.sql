WITH business_requirement_groups AS (

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

epic_business_requirements AS (

    SELECT
        'EPIC-' || LPAD(ne.epic_number::TEXT, 3, '0') AS epic_id,

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
        br.policies_and_constraints,
        br.assumptions,
        br.risks_and_dependencies,

        br.validation_status,
        br.approval_status,

        sf.file_name AS br_source_file,
        sf.source_version AS br_source_version

    FROM numbered_epics ne

    CROSS JOIN LATERAL UNNEST(
        ne.business_requirement_pks
    ) AS selected_br(business_requirement_pk)

    JOIN requirements.business_requirements br
        ON br.business_requirement_pk =
           selected_br.business_requirement_pk

    LEFT JOIN requirements.source_files sf
        ON sf.source_file_id = br.source_file_id
),

epic_fr_relationships AS (

    SELECT DISTINCT

        ebr.epic_id,
        ebr.epic_title,

        ebr.business_requirement_pk,
        ebr.business_requirement_id,
        ebr.business_requirement_name,

        ebr.business_value,
        ebr.success_measures,
        ebr.stakeholders,
        ebr.priority,
        ebr.policies_and_constraints,
        ebr.assumptions,
        ebr.risks_and_dependencies,

        ebr.validation_status,
        ebr.approval_status,

        ebr.br_source_file,
        ebr.br_source_version,

        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,

        fr_sf.file_name AS fr_source_file,
        fr_sf.source_version AS fr_source_version

    FROM epic_business_requirements ebr

    JOIN requirements.requirement_relationships rr
        ON rr.business_requirement_pk =
           ebr.business_requirement_pk

    JOIN requirements.functional_requirements fr
        ON fr.functional_requirement_pk =
           rr.functional_requirement_pk

    LEFT JOIN requirements.source_files fr_sf
        ON fr_sf.source_file_id = fr.source_file_id
),

feature_candidates AS (

    SELECT

        epic_id,
        epic_title,

        functional_requirement_pk,
        functional_requirement_id,
        functional_requirement_name,
        functional_requirement_description,
        functional_requirement_status,

        ARRAY_AGG(
            DISTINCT business_requirement_id
            ORDER BY business_requirement_id
        ) AS business_requirement_ids,

        JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
                'business_requirement_id',
                business_requirement_id,

                'business_requirement_name',
                business_requirement_name
            )
        ) AS related_business_requirements,

        JSONB_AGG(
            DISTINCT TO_JSONB(business_value)
        ) FILTER (
            WHERE business_value IS NOT NULL
        ) AS business_value,

        JSONB_AGG(
            DISTINCT TO_JSONB(success_measures)
        ) FILTER (
            WHERE success_measures IS NOT NULL
        ) AS success_measures,

        JSONB_AGG(
            DISTINCT TO_JSONB(stakeholders)
        ) FILTER (
            WHERE stakeholders IS NOT NULL
        ) AS stakeholders,

        JSONB_AGG(
            DISTINCT TO_JSONB(priority)
        ) FILTER (
            WHERE priority IS NOT NULL
        ) AS priorities,

        JSONB_AGG(
            DISTINCT TO_JSONB(policies_and_constraints)
        ) FILTER (
            WHERE policies_and_constraints IS NOT NULL
        ) AS constraints,

        JSONB_AGG(
            DISTINCT TO_JSONB(assumptions)
        ) FILTER (
            WHERE assumptions IS NOT NULL
        ) AS assumptions,

        JSONB_AGG(
            DISTINCT TO_JSONB(risks_and_dependencies)
        ) FILTER (
            WHERE risks_and_dependencies IS NOT NULL
        ) AS risks_and_dependencies,

        JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
                'source_file', br_source_file,
                'source_version', br_source_version
            )
        ) FILTER (
            WHERE br_source_file IS NOT NULL
        ) AS br_source_references,

        JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
                'source_file', fr_source_file,
                'source_version', fr_source_version
            )
        ) FILTER (
            WHERE fr_source_file IS NOT NULL
        ) AS fr_source_references,

        ARRAY_AGG(
            DISTINCT validation_status
        ) FILTER (
            WHERE validation_status IS NOT NULL
        ) AS br_validation_statuses,

        ARRAY_AGG(
            DISTINCT approval_status
        ) FILTER (
            WHERE approval_status IS NOT NULL
        ) AS br_approval_statuses

    FROM epic_fr_relationships

    GROUP BY

        epic_id,
        epic_title,

        functional_requirement_pk,
        functional_requirement_id,
        functional_requirement_name,
        functional_requirement_description,
        functional_requirement_status
),

numbered_features AS (

    SELECT

        ROW_NUMBER() OVER (
            ORDER BY
                epic_id,
                functional_requirement_id
        ) AS feature_number,

        *

    FROM feature_candidates
)

SELECT

    /* =========================================
       EPIC INFORMATION
       ========================================= */

    epic_id,
    epic_title,

    /* =========================================
       FEATURE IDENTIFICATION
       ========================================= */

    'FEAT-' || LPAD(
        feature_number::TEXT,
        3,
        '0'
    ) AS feature_candidate_id,

    functional_requirement_name AS feature_name,

    functional_requirement_description AS feature_description,

    functional_requirement_name AS business_capability_candidate,

    /* =========================================
       FEATURE GROUPING STATUS
       ========================================= */

    'UNCLASSIFIED_ONE_FR_CANDIDATE'
        AS feature_grouping_status,

    /* =========================================
       FUNCTIONAL REQUIREMENT TRACEABILITY
       ========================================= */

    functional_requirement_id,

    functional_requirement_name,
    functional_requirement_description,
    functional_requirement_status,

    /* =========================================
       BUSINESS REQUIREMENT TRACEABILITY
       ========================================= */

    business_requirement_ids,

    related_business_requirements,

    /* =========================================
       INHERITED BUSINESS EVIDENCE
       ========================================= */

    business_value,
    success_measures,
    stakeholders,
    priorities,

    constraints,
    assumptions,
    risks_and_dependencies,

    /* =========================================
       SOURCE REFERENCES
       ========================================= */

    br_source_references,
    fr_source_references,

    /* =========================================
       SOURCE VALIDATION INFORMATION
       ========================================= */

    br_validation_statuses,
    br_approval_statuses

FROM numbered_features

ORDER BY
    epic_id,
    feature_candidate_id;