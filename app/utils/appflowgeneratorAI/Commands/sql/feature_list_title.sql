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
/* part2 */
/*
===============================================================================
FEATURE GENERATION — EPIC / BUSINESS REQUIREMENT / FUNCTIONAL REQUIREMENT
EVIDENCE EXTRACTION
===============================================================================

PURPOSE
-------
Extract the complete, traceable business and functional evidence required
for AI-driven Feature identification and generation under dynamically
derived Epics.

SOURCE TABLES
-------------
1. requirements.business_requirements
2. requirements.functional_requirements
3. requirements.requirement_relationships
4. requirements.source_files

EXTRACTION LOGIC
----------------
1. Derive Epic groups dynamically using business_requirements.business_objective.
2. Associate Business Requirements with their derived Epic.
3. Resolve actual BR-to-FR associations through requirement_relationships.
4. Retrieve the associated Functional Requirement records.
5. Extract the original FR payload evidence:
   - Requirement
   - Business need
   - Functional behaviour
   - Business rules
   - Acceptance criteria
   - Required actors
   - Related business objects
   - Related information requirements
6. Retrieve associated BR context:
   - Business value
   - Success measures
   - Stakeholders
   - Priority
   - Policies and constraints
   - Assumptions
   - Risks and dependencies
7. Preserve relationship evidence and source-file traceability.

OUTPUT
------
One result set containing one row per BR-to-FR relationship.

The output includes:
- Derived Epic ID and title
- Business Requirement identifiers and evidence
- Functional Requirement identifiers and evidence
- BR-to-FR relationship details
- Actors and business objects
- Business rules and acceptance criteria
- Business context and supporting evidence
- Source references and original payloads

IMPORTANT DESIGN BOUNDARIES
---------------------------
- No predefined Feature categories or capability lists.
- No hardcoded Feature group assignments.
- No manual FR-to-Feature mappings.
- No domain-specific grouping rules.
- No Feature names or descriptions invented by SQL.
- No final Feature IDs generated at this stage.
- Original source payloads and relationship evidence are preserved.

SQL RESPONSIBILITY
------------------
Evidence retrieval, relationship resolution, source traceability and
structured data preparation.

AI RESPONSIBILITY
-----------------
Semantic capability identification, cohesive FR grouping, Feature definition,
Feature-level evidence aggregation and final Feature generation.

This output is an evidence dataset for Feature generation.
It is NOT the final Feature repository or a list of finalized Features.

===============================================================================
*/

-- ============================================================
-- FEATURE GENERATION
-- COMPLETE EPIC / BR / FR EVIDENCE EXTRACTION
--
-- Input:
--   requirements.business_requirements
--   requirements.functional_requirements
--   requirements.requirement_relationships
--   requirements.source_files
--
-- Output:
--   One result set
--   One row per BR-FR relationship
--   No hardcoded domain, Epic or Feature assignments
--   No data modification
-- ============================================================

WITH

-- ------------------------------------------------------------
-- 1. DERIVE EPICS USING EXISTING EPIC LOGIC
-- ------------------------------------------------------------

business_requirement_groups AS (

    SELECT
        NULLIF(TRIM(br.business_objective), '') AS business_objective,

        ARRAY_AGG(
            br.business_requirement_pk
            ORDER BY br.business_requirement_id
        ) AS business_requirement_pks

    FROM requirements.business_requirements br

    WHERE NULLIF(TRIM(br.business_objective), '') IS NOT NULL

    GROUP BY NULLIF(TRIM(br.business_objective), '')
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
        br.linked_functional_requirements,
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

-- ------------------------------------------------------------
-- 2. RETRIEVE ACTUAL BR-FR RELATIONSHIPS
-- ------------------------------------------------------------

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

-- ------------------------------------------------------------
-- 3. RETRIEVE FUNCTIONAL REQUIREMENT EVIDENCE
-- ------------------------------------------------------------

functional_requirement_evidence AS (

    SELECT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,

        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,

        fr.status AS functional_requirement_status,

        fr.raw_payload AS fr_raw_payload,

        fr.raw_payload -> 'requirement'
            AS requirement,

        fr.raw_payload -> 'business_need'
            AS business_need,

        fr.raw_payload -> 'functional_behaviour'
            AS functional_behaviour,

        fr.raw_payload -> 'business_rules'
            AS functional_business_rules,

        fr.raw_payload -> 'acceptance_criteria'
            AS acceptance_criteria,

        fr.raw_payload -> 'required_by_actors'
            AS actors,

        fr.raw_payload -> 'related_business_objects'
            AS business_objects,

        fr.raw_payload -> 'related_information_requirements'
            AS information_requirements,

        fr_sf.file_name AS fr_source_file,
        fr_sf.source_version AS fr_source_version

    FROM requirements.functional_requirements fr

    LEFT JOIN requirements.source_files fr_sf
        ON fr_sf.source_file_id = fr.source_file_id
),

-- ------------------------------------------------------------
-- 4. JOIN EPIC, BR, RELATIONSHIP AND FR EVIDENCE
-- ------------------------------------------------------------

feature_evidence AS (

    SELECT

        -- EPIC EVIDENCE

        ebr.epic_id,
        ebr.epic_title,

        -- BUSINESS REQUIREMENT EVIDENCE

        ebr.business_requirement_pk,
        ebr.business_requirement_id,
        ebr.business_requirement_name,
        ebr.business_requirement,
        ebr.business_objective,
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

        -- RELATIONSHIP EVIDENCE

        re.relationship_id,
        re.relationship_type,
        re.relationship_status,
        re.relationship_evidence,
        re.relationship_source_file,
        re.relationship_source_version,

        -- FUNCTIONAL REQUIREMENT EVIDENCE

        fre.functional_requirement_pk,
        fre.functional_requirement_id,
        fre.functional_requirement_name,
        fre.functional_requirement_description,
        fre.functional_requirement_status,

        fre.requirement,
        fre.business_need,
        fre.functional_behaviour,
        fre.functional_business_rules,
        fre.acceptance_criteria,

        -- FEATURE CLASSIFICATION EVIDENCE

        fre.actors,
        fre.business_objects,
        fre.information_requirements,

        -- SOURCE TRACEABILITY

        fre.fr_source_file,
        fre.fr_source_version,

        -- ORIGINAL SOURCE PAYLOADS

        ebr.br_raw_payload,
        fre.fr_raw_payload

    FROM relationship_evidence re

    JOIN epic_business_requirements ebr
        ON ebr.business_requirement_pk =
           re.business_requirement_pk

    JOIN functional_requirement_evidence fre
        ON fre.functional_requirement_pk =
           re.functional_requirement_pk
)

-- ------------------------------------------------------------
-- 5. FINAL SINGLE RESULT SET
-- ------------------------------------------------------------

SELECT
    ROW_NUMBER() OVER (
        ORDER BY
            epic_id,
            business_requirement_id,
            functional_requirement_id,
            relationship_id
    ) AS evidence_row_number,

    *

FROM feature_evidence

ORDER BY
    epic_id,
    business_requirement_id,
    functional_requirement_id,
    relationship_id;




