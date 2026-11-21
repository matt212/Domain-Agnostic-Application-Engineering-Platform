WITH

/* ================================================================
   1. LOAD ORIGINAL USER STORY
   ================================================================ */

assessment_source AS MATERIALIZED
(
    SELECT
        us.*
    FROM requirements.user_stories us
    WHERE us.user_story_id = 'US-001'
),

/* ================================================================
   2. NORMALIZE JSON FIELDS
   ================================================================ */

normalized_source AS MATERIALIZED
(
    SELECT
        s.*,

        CASE
            WHEN jsonb_typeof(
                to_jsonb(s) -> 'functional_requirement_ids'
            ) = 'array'
                THEN to_jsonb(s) -> 'functional_requirement_ids'

            WHEN jsonb_typeof(
                to_jsonb(s) -> 'functional_requirement_ids'
            ) = 'string'
             AND BTRIM(
                to_jsonb(s) ->> 'functional_requirement_ids'
             ) LIKE '[%'
                THEN (
                    to_jsonb(s) ->> 'functional_requirement_ids'
                )::jsonb

            ELSE '[]'::jsonb
        END AS fr_ids_json,

        CASE
            WHEN jsonb_typeof(
                to_jsonb(s) -> 'business_requirement_ids'
            ) = 'array'
                THEN to_jsonb(s) -> 'business_requirement_ids'

            WHEN jsonb_typeof(
                to_jsonb(s) -> 'business_requirement_ids'
            ) = 'string'
             AND BTRIM(
                to_jsonb(s) ->> 'business_requirement_ids'
             ) LIKE '[%'
                THEN (
                    to_jsonb(s) ->> 'business_requirement_ids'
                )::jsonb

            ELSE '[]'::jsonb
        END AS br_ids_json

    FROM assessment_source s
),

/* ================================================================
   3. BUILD NORMALIZED STORY CONTEXT
   ================================================================ */

story_context AS MATERIALIZED
(
    SELECT
        s.*,

        ARRAY(
            SELECT DISTINCT BTRIM(value)
            FROM jsonb_array_elements_text(s.fr_ids_json)
            WHERE NULLIF(BTRIM(value), '') IS NOT NULL
        ) AS fr_ids,

        ARRAY(
            SELECT DISTINCT BTRIM(value)
            FROM jsonb_array_elements_text(s.br_ids_json)
            WHERE NULLIF(BTRIM(value), '') IS NOT NULL
        ) AS br_ids

    FROM normalized_source s
),

/* ================================================================
   4. RETRIEVE DIRECTLY ASSOCIATED FUNCTIONAL REQUIREMENTS
   ================================================================ */

functional_requirements AS MATERIALIZED
(
    SELECT DISTINCT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name,
        fr.description,
        fr.status,

        'DIRECT_STORY_ASSOCIATION'::text AS retrieval_source

    FROM story_context s

    JOIN requirements.functional_requirements fr
      ON fr.functional_requirement_id = ANY(s.fr_ids)
),

/* ================================================================
   5. RETRIEVE DIRECTLY ASSOCIATED BUSINESS REQUIREMENTS

   Only IDs explicitly supplied by the User Story are used.

   No inherited FR-to-BR retrieval.
   ================================================================ */

business_requirement_paths AS
(
    SELECT
        br.business_requirement_pk,
        br.business_requirement_id,
        br.name,
        br.business_requirement,
        br.business_objective,
        br.success_measures,
        br.policies_and_constraints,

        'DIRECT_STORY_ASSOCIATION'::text AS retrieval_source

    FROM story_context s

    JOIN requirements.business_requirements br
      ON br.business_requirement_id = ANY(s.br_ids)
),

business_requirements AS MATERIALIZED
(
    SELECT
        business_requirement_pk,
        business_requirement_id,
        name,
        business_requirement,
        business_objective,
        success_measures,
        policies_and_constraints,

        ARRAY_AGG(
            DISTINCT retrieval_source
            ORDER BY retrieval_source
        ) AS retrieval_sources

    FROM business_requirement_paths

    GROUP BY
        business_requirement_pk,
        business_requirement_id,
        name,
        business_requirement,
        business_objective,
        success_measures,
        policies_and_constraints
),

/* ================================================================
   6. BUILD FUNCTIONAL REQUIREMENT JSON ARRAY
   ================================================================ */

functional_requirement_evidence AS MATERIALIZED
(
    SELECT
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'functional_requirement_pk',
                        fr.functional_requirement_pk,

                    'functional_requirement_id',
                        fr.functional_requirement_id,

                    'name',
                        fr.name,

                    'description',
                        fr.description,

                    'status',
                        fr.status,

                    'retrieval_source',
                        fr.retrieval_source
                )
                ORDER BY fr.functional_requirement_id
            ),
            '[]'::jsonb
        ) AS functional_requirements

    FROM functional_requirements fr
),

/* ================================================================
   7. BUILD BUSINESS REQUIREMENT JSON ARRAY
   ================================================================ */

business_requirement_evidence AS MATERIALIZED
(
    SELECT
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'business_requirement_pk',
                        br.business_requirement_pk,

                    'business_requirement_id',
                        br.business_requirement_id,

                    'name',
                        br.name,

                    'business_requirement',
                        br.business_requirement,

                    'business_objective',
                        br.business_objective,

                    'success_measures',
                        br.success_measures,

                    'policies_and_constraints',
                        br.policies_and_constraints,

                    'retrieval_sources',
                        br.retrieval_sources
                )
                ORDER BY br.business_requirement_id
            ),
            '[]'::jsonb
        ) AS business_requirements

    FROM business_requirements br
),

/* ================================================================
   8. EVIDENCE SUMMARY
   ================================================================ */

evidence_summary AS MATERIALIZED
(
    SELECT
        jsonb_build_object(

            'functional_requirement_count',
                jsonb_array_length(
                    fr.functional_requirements
                ),

            'business_requirement_count',
                jsonb_array_length(
                    br.business_requirements
                ),

            'retrieval_status',
                CASE
                    WHEN
                        jsonb_array_length(
                            fr.functional_requirements
                        ) > 0

                        OR

                        jsonb_array_length(
                            br.business_requirements
                        ) > 0

                    THEN 'REPOSITORY_EVIDENCE_AVAILABLE'

                    ELSE 'NO_REPOSITORY_EVIDENCE_FOUND'
                END

        ) AS summary

    FROM functional_requirement_evidence fr

    CROSS JOIN business_requirement_evidence br
)

/* ================================================================
   9. FINAL RESULT

   Original User Story fields individually.
   Two separate repository evidence arrays.
   No consolidated_evidence wrapper.
   ================================================================ */

SELECT

    /* Original User Story */

    s.user_story_id,
    s.user_story_title,
    s.user_story_description,
    s.user_story_type,
    s.actor,
    s.user_goal,
    s.business_value,
    s.feature_id,
    s.feature_name,
    s.epic_id,
    s.epic_title,
    s.business_requirement_ids,
    s.functional_requirement_ids,
    s.business_objects,
    s.preconditions,
    s.postconditions,
    s.trigger,
    s.main_flow,
    s.alternative_flows,
    s.exception_flows,
    s.business_rules,
    s.acceptance_criteria,
    s.given_when_then,
    s.success_criteria,
    s.non_functional_requirements,
    s.dependencies,
    s.constraints,
    s.priority,
    s.estimation,
    s.status,

    /* Retrieved repository evidence */

    fr.functional_requirements,

    br.business_requirements,

    /* Retrieval diagnostics */

    summary.summary AS evidence_summary

FROM story_context s

CROSS JOIN functional_requirement_evidence fr

CROSS JOIN business_requirement_evidence br

CROSS JOIN evidence_summary summary;