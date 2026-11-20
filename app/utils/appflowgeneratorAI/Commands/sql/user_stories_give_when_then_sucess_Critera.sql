
/* ================================================================
   USER STORY SUCCESS CRITERIA + GIVEN-WHEN-THEN DIAGNOSTICS

   Purpose:
     1. Evaluate BR success_measures availability.
     2. Evaluate BR-FR relationship availability and validation.
     3. Evaluate FR-level acceptance_criteria.
     4. Evaluate behaviour-level acceptance_criteria.
     5. Evaluate extractable Given-When-Then scenarios.
     6. Identify why information is unavailable.

   READ ONLY: No INSERT, UPDATE, DELETE, or DDL.
   ================================================================ */

WITH
/* ------------------------------------------------
   1. Functional Requirements
------------------------------------------------ */
fr_base AS
(
    SELECT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name AS functional_requirement_name,
        fr.description,
        fr.raw_payload,
        fr.source_file_id
    FROM requirements.functional_requirements fr
),

/* ------------------------------------------------
   2. Normalize functional behaviours
------------------------------------------------ */
behaviour_source AS
(
    SELECT
        fr.*,

        CASE
            WHEN JSONB_TYPEOF(
                fr.raw_payload -> 'functional_behaviour'
            ) = 'array'
                THEN fr.raw_payload -> 'functional_behaviour'

            WHEN JSONB_TYPEOF(
                fr.raw_payload -> 'functional_behaviour'
            ) = 'object'
                THEN JSONB_BUILD_ARRAY(
                    fr.raw_payload -> 'functional_behaviour'
                )

            WHEN JSONB_TYPEOF(
                fr.raw_payload -> 'functional_behaviour'
            ) = 'string'
                THEN JSONB_BUILD_ARRAY(
                    fr.raw_payload -> 'functional_behaviour'
                )

            ELSE '[]'::JSONB
        END AS behaviours

    FROM fr_base fr
),

/* ------------------------------------------------
   3. One diagnostic record per behaviour
------------------------------------------------ */
story_behaviours AS
(
    SELECT
        'US-' || LPAD(
            ROW_NUMBER() OVER (
                ORDER BY
                    fr.functional_requirement_id,
                    b.ordinality
            )::TEXT,
            3,
            '0'
        ) AS diagnostic_story_id,

        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.functional_requirement_name,
        fr.source_file_id,
        fr.raw_payload AS fr_payload,

        b.ordinality AS behaviour_number,
        b.behaviour_json,

        NULLIF(
            BTRIM(
                CASE
                    WHEN JSONB_TYPEOF(b.behaviour_json) = 'string'
                        THEN b.behaviour_json #>> '{}'

                    WHEN JSONB_TYPEOF(b.behaviour_json) = 'object'
                        THEN COALESCE(
                            b.behaviour_json ->> 'behaviour',
                            b.behaviour_json ->> 'description',
                            b.behaviour_json ->> 'action',
                            b.behaviour_json ->> 'name',
                            b.behaviour_json ->> 'title'
                        )
                END
            ),
            ''
        ) AS behaviour_text

    FROM behaviour_source fr

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        fr.behaviours
    ) WITH ORDINALITY AS b(behaviour_json, ordinality)
),

/* ------------------------------------------------
   4. BR-FR relationship audit
------------------------------------------------ */
relationship_audit AS
(
    SELECT
        rr.business_requirement_pk,
        rr.functional_requirement_pk,
        rr.relationship_type,
        rr.relationship_status,
        rr.evidence,

        br.business_requirement_id,
        br.name AS business_requirement_name,
        br.success_measures,

        CASE
            WHEN NULLIF(BTRIM(rr.relationship_type), '') IS NULL
                THEN FALSE

            WHEN JSONB_TYPEOF(rr.evidence)
                 IS DISTINCT FROM 'object'
                THEN FALSE

            WHEN rr.evidence ? 'business_requirement_id'
             AND rr.evidence ->> 'business_requirement_id'
                 IS DISTINCT FROM br.business_requirement_id
                THEN FALSE

            WHEN rr.evidence ? 'linked_functional_requirement'
             AND rr.evidence ->> 'linked_functional_requirement'
                 IS DISTINCT FROM fr.functional_requirement_id
                THEN FALSE

            ELSE TRUE
        END AS is_structurally_valid,

        CASE
            WHEN LOWER(
                COALESCE(
                    rr.evidence ->> 'semantic_validation_status',
                    rr.relationship_status,
                    ''
                )
            ) IN ('validated', 'approved')
              OR rr.evidence -> 'is_semantically_valid'
                    = 'true'::JSONB
                THEN 'SOURCE_MARKED_VALIDATED'

            WHEN LOWER(
                COALESCE(
                    rr.evidence ->> 'semantic_validation_status',
                    rr.relationship_status,
                    ''
                )
            ) IN ('rejected', 'invalid')
              OR rr.evidence -> 'is_semantically_valid'
                    = 'false'::JSONB
                THEN 'SOURCE_MARKED_REJECTED'

            ELSE 'REQUIRES_SEMANTIC_REVIEW'
        END AS semantic_validation_status

    FROM requirements.requirement_relationships rr

    JOIN requirements.business_requirements br
        ON br.business_requirement_pk =
           rr.business_requirement_pk

    JOIN requirements.functional_requirements fr
        ON fr.functional_requirement_pk =
           rr.functional_requirement_pk
),

/* ------------------------------------------------
   5. Success measures available through BR-FR
------------------------------------------------ */
success_context AS
(
    SELECT
        ra.functional_requirement_pk,

        COUNT(DISTINCT ra.business_requirement_pk)
            AS linked_br_count,

        COUNT(DISTINCT ra.business_requirement_pk)
            FILTER (
                WHERE ra.is_structurally_valid
            ) AS structurally_valid_br_count,

        COUNT(DISTINCT ra.business_requirement_pk)
            FILTER (
                WHERE ra.is_structurally_valid
                  AND ra.semantic_validation_status =
                      'SOURCE_MARKED_VALIDATED'
            ) AS validated_br_count,

        COUNT(DISTINCT ra.business_requirement_pk)
            FILTER (
                WHERE ra.success_measures IS NOT NULL
                  AND ra.success_measures <> 'null'::JSONB
                  AND ra.success_measures <> '[]'::JSONB
                  AND ra.success_measures <> '""'::JSONB
            ) AS br_with_success_measures,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'business_requirement_id',
                        ra.business_requirement_id,
                    'business_requirement_name',
                        ra.business_requirement_name,
                    'success_measures',
                        ra.success_measures,
                    'relationship_type',
                        ra.relationship_type,
                    'relationship_status',
                        ra.relationship_status,
                    'structurally_valid',
                        ra.is_structurally_valid,
                    'semantic_validation_status',
                        ra.semantic_validation_status,
                    'relationship_evidence',
                        ra.evidence
                )
            ) FILTER (
                WHERE ra.success_measures IS NOT NULL
                  AND ra.success_measures <> 'null'::JSONB
                  AND ra.success_measures <> '[]'::JSONB
                  AND ra.success_measures <> '""'::JSONB
            ),
            '[]'::JSONB
        ) AS success_measure_sources,

        COALESCE(
            JSONB_AGG(
                DISTINCT x.measure
            ) FILTER (
                WHERE x.measure IS NOT NULL
                  AND x.measure <> 'null'::JSONB
                  AND x.measure <> '""'::JSONB
            ),
            '[]'::JSONB
        ) AS all_success_measures,

        COALESCE(
            JSONB_AGG(
                DISTINCT x.measure
            ) FILTER (
                WHERE ra.is_structurally_valid
                  AND ra.semantic_validation_status =
                      'SOURCE_MARKED_VALIDATED'
                  AND x.measure IS NOT NULL
                  AND x.measure <> 'null'::JSONB
                  AND x.measure <> '""'::JSONB
            ),
            '[]'::JSONB
        ) AS validated_success_measures

    FROM relationship_audit ra

    LEFT JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(
                TO_JSONB(ra.success_measures)
            ) = 'array'
                THEN TO_JSONB(ra.success_measures)

            WHEN ra.success_measures IS NULL
              OR TO_JSONB(ra.success_measures) = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                TO_JSONB(ra.success_measures)
            )
        END
    ) AS x(measure) ON TRUE

    GROUP BY ra.functional_requirement_pk
),

/* ------------------------------------------------
   6. Extract behaviour and parent FR acceptance
      criteria independently.
------------------------------------------------ */
acceptance_sources AS
(
    SELECT
        sb.diagnostic_story_id,
        sb.functional_requirement_pk,
        sb.functional_requirement_id,
        sb.behaviour_number,
        sb.behaviour_text,

        'BEHAVIOUR_LEVEL' AS source_scope,
        c.item AS criterion,

        CASE
            WHEN c.item ?| ARRAY[
                'functional_behaviour_number',
                'behaviour_number',
                'behavior_number',
                'functional_behaviour',
                'related_behaviour',
                'applies_to_behaviours'
            ]
                THEN TRUE
            ELSE FALSE
        END AS has_explicit_mapping

    FROM story_behaviours sb

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(
                sb.behaviour_json -> 'acceptance_criteria'
            ) = 'array'
                THEN sb.behaviour_json -> 'acceptance_criteria'

            WHEN sb.behaviour_json -> 'acceptance_criteria' IS NULL
              OR sb.behaviour_json -> 'acceptance_criteria'
                    = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sb.behaviour_json -> 'acceptance_criteria'
            )
        END
    ) AS c(item)

    UNION ALL

    SELECT
        sb.diagnostic_story_id,
        sb.functional_requirement_pk,
        sb.functional_requirement_id,
        sb.behaviour_number,
        sb.behaviour_text,

        'PARENT_FR_LEVEL' AS source_scope,
        c.item AS criterion,

        CASE
            WHEN c.item ?| ARRAY[
                'functional_behaviour_number',
                'behaviour_number',
                'behavior_number',
                'functional_behaviour',
                'related_behaviour',
                'applies_to_behaviours'
            ]
                THEN TRUE
            ELSE FALSE
        END AS has_explicit_mapping

    FROM story_behaviours sb

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(
                sb.fr_payload -> 'acceptance_criteria'
            ) = 'array'
                THEN sb.fr_payload -> 'acceptance_criteria'

            WHEN sb.fr_payload -> 'acceptance_criteria' IS NULL
              OR sb.fr_payload -> 'acceptance_criteria'
                    = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sb.fr_payload -> 'acceptance_criteria'
            )
        END
    ) AS c(item)
),

/* ------------------------------------------------
   7. Determine whether each criterion applies
      to the current behaviour.
------------------------------------------------ */
acceptance_evaluation AS
(
    SELECT
        a.*,

        CASE
            WHEN NOT a.has_explicit_mapping
                THEN TRUE

            WHEN COALESCE(
                a.criterion ->>
                    'functional_behaviour_number',
                a.criterion ->> 'behaviour_number',
                a.criterion ->> 'behavior_number'
            ) ~ '^[0-9]+$'

            AND COALESCE(
                a.criterion ->>
                    'functional_behaviour_number',
                a.criterion ->> 'behaviour_number',
                a.criterion ->> 'behavior_number'
            )::BIGINT = a.behaviour_number
                THEN TRUE

            WHEN LOWER(
                BTRIM(
                    COALESCE(
                        a.criterion ->> 'functional_behaviour',
                        a.criterion ->> 'related_behaviour',
                        ''
                    )
                )
            ) = LOWER(BTRIM(a.behaviour_text))
                THEN TRUE

            WHEN JSONB_TYPEOF(
                a.criterion -> 'applies_to_behaviours'
            ) = 'array'

            AND a.criterion -> 'applies_to_behaviours'
                @> JSONB_BUILD_ARRAY(a.behaviour_text)
                THEN TRUE

            ELSE FALSE
        END AS applies_to_behaviour

    FROM acceptance_sources a
),

/* ------------------------------------------------
   8. Aggregate applicable acceptance criteria
------------------------------------------------ */
acceptance_context AS
(
    SELECT
        diagnostic_story_id,

        COUNT(*) AS total_source_criteria,

        COUNT(*) FILTER (
            WHERE applies_to_behaviour
        ) AS applicable_criteria_count,

        COUNT(*) FILTER (
            WHERE applies_to_behaviour
              AND JSONB_TYPEOF(criterion) = 'object'
        ) AS applicable_object_criteria_count,

        COUNT(*) FILTER (
            WHERE applies_to_behaviour
              AND JSONB_TYPEOF(criterion) <> 'object'
        ) AS applicable_non_object_criteria_count,

        COUNT(*) FILTER (
            WHERE applies_to_behaviour
              AND (
                  criterion ? 'given'
                  OR criterion ? 'Given'
              )
              AND (
                  criterion ? 'when'
                  OR criterion ? 'When'
              )
              AND (
                  criterion ? 'then'
                  OR criterion ? 'Then'
              )
        ) AS extractable_gwt_count,

        COUNT(*) FILTER (
            WHERE applies_to_behaviour
              AND NOT (
                  (
                      criterion ? 'given'
                      OR criterion ? 'Given'
                  )
                  AND (
                      criterion ? 'when'
                      OR criterion ? 'When'
                  )
                  AND (
                      criterion ? 'then'
                      OR criterion ? 'Then'
                  )
              )
        ) AS criteria_without_complete_gwt,

        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'source_scope', source_scope,
                    'criterion', criterion,
                    'applies_to_behaviour', applies_to_behaviour
                )
            ) FILTER (
                WHERE applies_to_behaviour
            ),
            '[]'::JSONB
        ) AS applicable_acceptance_criteria,

        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'given',
                        COALESCE(
                            criterion -> 'given',
                            criterion -> 'Given'
                        ),
                    'when',
                        COALESCE(
                            criterion -> 'when',
                            criterion -> 'When'
                        ),
                    'then',
                        COALESCE(
                            criterion -> 'then',
                            criterion -> 'Then'
                        ),
                    'source_scope',
                        source_scope
                )
            ) FILTER (
                WHERE applies_to_behaviour
                  AND (
                      criterion ? 'given'
                      OR criterion ? 'Given'
                  )
                  AND (
                      criterion ? 'when'
                      OR criterion ? 'When'
                  )
                  AND (
                      criterion ? 'then'
                      OR criterion ? 'Then'
                  )
            ),
            '[]'::JSONB
        ) AS extracted_given_when_then,

        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'source_scope', source_scope,
                    'criterion', criterion
                )
            ) FILTER (
                WHERE NOT applies_to_behaviour
            ),
            '[]'::JSONB
        ) AS excluded_criteria

    FROM acceptance_evaluation
    GROUP BY diagnostic_story_id
)

/* ------------------------------------------------
   9. Final diagnostic output
------------------------------------------------ */
SELECT
    sb.diagnostic_story_id,

    sb.functional_requirement_id,
    sb.functional_requirement_name,

    sb.behaviour_number,
    sb.behaviour_text,

    /* Success criteria */
    COALESCE(sc.linked_br_count, 0)
        AS linked_br_count,

    COALESCE(sc.structurally_valid_br_count, 0)
        AS structurally_valid_br_count,

    COALESCE(sc.validated_br_count, 0)
        AS validated_br_count,

    COALESCE(sc.br_with_success_measures, 0)
        AS br_with_success_measures,

    COALESCE(sc.all_success_measures, '[]'::JSONB)
        AS all_available_success_measures,

    COALESCE(sc.validated_success_measures, '[]'::JSONB)
        AS validated_success_measures,

    COALESCE(sc.success_measure_sources, '[]'::JSONB)
        AS success_measure_sources,

    CASE
        WHEN JSONB_ARRAY_LENGTH(
            COALESCE(sc.validated_success_measures, '[]'::JSONB)
        ) > 0
            THEN 'AVAILABLE_VALIDATED'

        WHEN JSONB_ARRAY_LENGTH(
            COALESCE(sc.all_success_measures, '[]'::JSONB)
        ) > 0
            THEN 'AVAILABLE_BUT_RELATIONSHIP_NOT_VALIDATED'

        WHEN COALESCE(sc.linked_br_count, 0) = 0
            THEN 'NO_BR_FR_RELATIONSHIP'

        ELSE 'BR_SUCCESS_MEASURES_NOT_AVAILABLE'
    END AS success_criteria_diagnostic,

    /* Acceptance criteria */
    COALESCE(ac.total_source_criteria, 0)
        AS total_source_criteria,

    COALESCE(ac.applicable_criteria_count, 0)
        AS applicable_criteria_count,

    COALESCE(ac.applicable_object_criteria_count, 0)
        AS applicable_object_criteria_count,

    COALESCE(ac.applicable_non_object_criteria_count, 0)
        AS applicable_non_object_criteria_count,

    COALESCE(ac.criteria_without_complete_gwt, 0)
        AS criteria_without_complete_gwt,

    COALESCE(
        ac.applicable_acceptance_criteria,
        '[]'::JSONB
    ) AS applicable_acceptance_criteria,

    COALESCE(
        ac.excluded_criteria,
        '[]'::JSONB
    ) AS excluded_criteria,

    /* Given-When-Then */
    COALESCE(ac.extractable_gwt_count, 0)
        AS extractable_gwt_count,

    COALESCE(
        ac.extracted_given_when_then,
        '[]'::JSONB
    ) AS extracted_given_when_then,

    CASE
        WHEN COALESCE(ac.extractable_gwt_count, 0) > 0
            THEN 'GWT_AVAILABLE'

        WHEN COALESCE(ac.applicable_criteria_count, 0) > 0
            THEN 'AC_AVAILABLE_BUT_NO_COMPLETE_GWT'

        WHEN COALESCE(ac.total_source_criteria, 0) > 0
            THEN 'AC_EXISTS_BUT_NOT_MAPPED_TO_BEHAVIOUR'

        ELSE 'NO_ACCEPTANCE_CRITERIA_FOUND'
    END AS given_when_then_diagnostic

FROM story_behaviours sb

LEFT JOIN success_context sc
    ON sc.functional_requirement_pk =
       sb.functional_requirement_pk

LEFT JOIN acceptance_context ac
    ON ac.diagnostic_story_id =
       sb.diagnostic_story_id

ORDER BY
    sb.functional_requirement_id,
    sb.behaviour_number
limit 5







/* Extraction-------------------------------------------------------------*/

/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/

/* ================================================================
   USER STORY REQUIREMENTS EXTRACTION DIAGNOSTIC V2

   Evaluates:
     1. BR success measures and BR-FR relationship validation
     2. Behaviour-specific acceptance criteria
     3. Explicitly mapped inherited FR acceptance criteria
     4. Unmapped parent FR acceptance criteria
     5. Applicable structured Given-When-Then scenarios
     6. BR / FR / criterion source references
     7. Mapping assessment

   Database: demodb
   Schema: requirements

   READ ONLY
   ================================================================ */

WITH

/* ================================================================
   1. FUNCTIONAL REQUIREMENTS
   ================================================================ */

fr_base AS
(
    SELECT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,
        fr.raw_payload AS fr_payload,
        fr.source_file_id AS fr_source_file_id

    FROM requirements.functional_requirements fr
),

/* ================================================================
   2. NORMALIZE FUNCTIONAL BEHAVIOURS

   Supports:
     - Array
     - Object
     - Scalar string
     - Description fallback

   ================================================================ */

behaviour_source AS
(
    SELECT
        fr.*,

        CASE
            WHEN JSONB_TYPEOF(
                fr.fr_payload -> 'functional_behaviour'
            ) = 'array'
                THEN fr.fr_payload -> 'functional_behaviour'

            WHEN JSONB_TYPEOF(
                fr.fr_payload -> 'functional_behaviour'
            ) = 'object'
                THEN JSONB_BUILD_ARRAY(
                    fr.fr_payload -> 'functional_behaviour'
                )

            WHEN JSONB_TYPEOF(
                fr.fr_payload -> 'functional_behaviour'
            ) = 'string'
                THEN JSONB_BUILD_ARRAY(
                    fr.fr_payload -> 'functional_behaviour'
                )

            WHEN NULLIF(
                BTRIM(fr.functional_requirement_description),
                ''
            ) IS NOT NULL
                THEN JSONB_BUILD_ARRAY(
                    TO_JSONB(
                        fr.functional_requirement_description
                    )
                )

            ELSE '[]'::JSONB
        END AS behaviours

    FROM fr_base fr
),

behaviour_records AS
(
    SELECT
        'US-' ||
        LPAD(
            ROW_NUMBER() OVER
            (
                ORDER BY
                    fr.functional_requirement_id,
                    b.ordinality
            )::TEXT,
            3,
            '0'
        ) AS diagnostic_story_id,

        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.functional_requirement_name,
        fr.functional_requirement_description,
        fr.functional_requirement_status,
        fr.fr_payload,
        fr.fr_source_file_id,

        b.ordinality AS behaviour_number,
        b.behaviour_json,

        NULLIF(
            BTRIM(
                CASE
                    WHEN JSONB_TYPEOF(b.behaviour_json) = 'string'
                        THEN b.behaviour_json #>> '{}'

                    WHEN JSONB_TYPEOF(b.behaviour_json) = 'object'
                        THEN COALESCE(
                            b.behaviour_json ->> 'behaviour',
                            b.behaviour_json ->> 'description',
                            b.behaviour_json ->> 'action',
                            b.behaviour_json ->> 'name',
                            b.behaviour_json ->> 'title'
                        )
                END
            ),
            ''
        ) AS behaviour_text

    FROM behaviour_source fr

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        fr.behaviours
    ) WITH ORDINALITY AS b(behaviour_json, ordinality)
),

/* ================================================================
   3. BR-FR RELATIONSHIP VALIDATION

   Uses the same structural and semantic validation rules
   as the existing userstories.sql.

   ================================================================ */

relationship_base AS
(
    SELECT
        rr.business_requirement_pk,
        rr.functional_requirement_pk,
        rr.relationship_type,
        rr.relationship_status,
        rr.evidence AS relationship_evidence,

        br.business_requirement_id,
        br.name AS business_requirement_name,
        br.success_measures,
        br.source_file_id AS br_source_file_id,

        fr.functional_requirement_id

    FROM requirements.requirement_relationships rr

    JOIN requirements.business_requirements br
        ON br.business_requirement_pk =
           rr.business_requirement_pk

    JOIN requirements.functional_requirements fr
        ON fr.functional_requirement_pk =
           rr.functional_requirement_pk
),

relationship_audit AS
(
    SELECT
        rb.*,

        CASE
            WHEN NULLIF(
                BTRIM(rb.relationship_type),
                ''
            ) IS NULL
                THEN 'STRUCTURALLY_INVALID_MISSING_TYPE'

            WHEN JSONB_TYPEOF(rb.relationship_evidence)
                 IS DISTINCT FROM 'object'
                THEN 'STRUCTURALLY_INVALID_MISSING_OR_INVALID_EVIDENCE'

            WHEN rb.relationship_evidence ? 'business_requirement_id'
             AND rb.relationship_evidence ->>
                 'business_requirement_id'
                 IS DISTINCT FROM rb.business_requirement_id
                THEN 'STRUCTURALLY_INVALID_BR_ID_MISMATCH'

            WHEN rb.relationship_evidence ? 'linked_functional_requirement'
             AND rb.relationship_evidence ->>
                 'linked_functional_requirement'
                 IS DISTINCT FROM rb.functional_requirement_id
                THEN 'STRUCTURALLY_INVALID_FR_ID_MISMATCH'

            ELSE 'STRUCTURALLY_VALID'
        END AS structural_validation_status,

        (
            NULLIF(
                BTRIM(rb.relationship_type),
                ''
            ) IS NOT NULL

            AND JSONB_TYPEOF(rb.relationship_evidence) = 'object'

            AND
            (
                NOT (
                    rb.relationship_evidence
                    ? 'business_requirement_id'
                )
                OR rb.relationship_evidence ->>
                   'business_requirement_id'
                   = rb.business_requirement_id
            )

            AND
            (
                NOT (
                    rb.relationship_evidence
                    ? 'linked_functional_requirement'
                )
                OR rb.relationship_evidence ->>
                   'linked_functional_requirement'
                   = rb.functional_requirement_id
            )
        ) AS is_structurally_valid,

        CASE
            WHEN LOWER(
                COALESCE(
                    rb.relationship_evidence ->
                        'semantic_validation_status' #>> '{}',
                    rb.relationship_status,
                    ''
                )
            ) IN ('validated', 'approved')

            OR rb.relationship_evidence ->
                'is_semantically_valid' = 'true'::JSONB
                THEN 'SOURCE_MARKED_VALIDATED'

            WHEN LOWER(
                COALESCE(
                    rb.relationship_evidence ->
                        'semantic_validation_status' #>> '{}',
                    rb.relationship_status,
                    ''
                )
            ) IN ('rejected', 'invalid')

            OR rb.relationship_evidence ->
                'is_semantically_valid' = 'false'::JSONB
                THEN 'SOURCE_MARKED_REJECTED'

            ELSE 'REQUIRES_SEMANTIC_REVIEW'
        END AS semantic_validation_status

    FROM relationship_base rb
),

/* ================================================================
   4. MAP BR RELATIONSHIPS TO EACH BEHAVIOUR

   Explicit behaviour mapping:
     - Behaviour number
     - Behaviour text
     - Related behaviour
     - Behaviour alias
     - applies_to_behaviours

   Unscoped BR-FR relationship:
     - Retained as inherited FR-level context.

   Explicitly mapped to another behaviour:
     - Not assigned to this story.

   ================================================================ */

story_br_relationships AS
(
    SELECT
        sb.diagnostic_story_id,
        sb.functional_requirement_pk,
        sb.functional_requirement_id,
        sb.behaviour_number,

        ra.business_requirement_pk,
        ra.business_requirement_id,
        ra.business_requirement_name,
        ra.success_measures,
        ra.br_source_file_id,

        ra.relationship_type,
        ra.relationship_status,
        ra.relationship_evidence,

        ra.structural_validation_status,
        ra.is_structurally_valid,
        ra.semantic_validation_status,

        CASE
            WHEN
                COALESCE(
                    ra.relationship_evidence ->>
                        'functional_behaviour_number',
                    ra.relationship_evidence ->>
                        'behaviour_number',
                    ra.relationship_evidence ->>
                        'behavior_number'
                ) ~ '^[0-9]+$'

                AND COALESCE(
                    ra.relationship_evidence ->>
                        'functional_behaviour_number',
                    ra.relationship_evidence ->>
                        'behaviour_number',
                    ra.relationship_evidence ->>
                        'behavior_number'
                )::BIGINT = sb.behaviour_number
                THEN 'BEHAVIOUR_SPECIFIC'

            WHEN LOWER(
                BTRIM(
                    COALESCE(
                        ra.relationship_evidence ->>
                            'functional_behaviour',
                        ra.relationship_evidence ->>
                            'related_behaviour',
                        ra.relationship_evidence ->>
                            'behaviour',
                        ra.relationship_evidence ->>
                            'behavior',
                        ''
                    )
                )
            ) = LOWER(BTRIM(sb.behaviour_text))
                THEN 'BEHAVIOUR_SPECIFIC'

            WHEN JSONB_TYPEOF(
                ra.relationship_evidence ->
                    'applies_to_behaviours'
            ) = 'array'

            AND ra.relationship_evidence ->
                'applies_to_behaviours'
                @> JSONB_BUILD_ARRAY(sb.behaviour_text)
                THEN 'BEHAVIOUR_SPECIFIC'

            WHEN
                NOT (
                    ra.relationship_evidence ?|
                    ARRAY[
                        'functional_behaviour_number',
                        'behaviour_number',
                        'behavior_number',
                        'functional_behaviour',
                        'related_behaviour',
                        'behaviour',
                        'behavior',
                        'applies_to_behaviours'
                    ]
                )
                THEN 'INHERITED_FR_CONTEXT'

            ELSE 'MAPPED_TO_OTHER_OR_UNRESOLVED_BEHAVIOUR'
        END AS relationship_mapping_scope

    FROM behaviour_records sb

    JOIN relationship_audit ra
        ON ra.functional_requirement_pk =
           sb.functional_requirement_pk
),

/* ================================================================
   5. SUCCESS CRITERIA

   Include:
     - Structurally valid BR-FR relationships
     - Behaviour-specific relationships
     - Inherited FR-level relationships

   Preserve semantic validation status.

   Exclude:
     - Structurally invalid relationships
     - Relationships explicitly mapped elsewhere

   ================================================================ */

success_measure_expansion AS
(
    SELECT
        sbr.*,
        x.measure

    FROM story_br_relationships sbr

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(
                TO_JSONB(sbr.success_measures)
            ) = 'array'
                THEN TO_JSONB(sbr.success_measures)

            WHEN sbr.success_measures IS NULL
              OR TO_JSONB(sbr.success_measures) = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                TO_JSONB(sbr.success_measures)
            )
        END
    ) AS x(measure)

    WHERE sbr.is_structurally_valid = TRUE

      AND sbr.relationship_mapping_scope IN
      (
          'BEHAVIOUR_SPECIFIC',
          'INHERITED_FR_CONTEXT'
      )

      AND x.measure IS NOT NULL
      AND x.measure <> 'null'::JSONB
      AND x.measure <> '""'::JSONB
),

success_context AS
(
    SELECT
        diagnostic_story_id,

        JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
                'business_requirement_id',
                    business_requirement_id,

                'business_requirement_name',
                    business_requirement_name,

                'success_measure',
                    measure,

                'mapping_scope',
                    relationship_mapping_scope,

                'relationship_type',
                    relationship_type,

                'relationship_status',
                    relationship_status,

                'structural_validation_status',
                    structural_validation_status,

                'semantic_validation_status',
                    semantic_validation_status,

                'business_requirement_source_file_id',
                    br_source_file_id,

                'relationship_evidence',
                    relationship_evidence
            )
        ) AS success_criteria,

        COUNT(DISTINCT business_requirement_pk)
            AS mapped_br_count,

        COUNT(*) AS success_measure_count,

        COUNT(*) FILTER (
            WHERE semantic_validation_status =
                'SOURCE_MARKED_VALIDATED'
        ) AS validated_measure_count,

        COUNT(*) FILTER (
            WHERE semantic_validation_status =
                'REQUIRES_SEMANTIC_REVIEW'
        ) AS unvalidated_measure_count,

        COUNT(*) FILTER (
            WHERE relationship_mapping_scope =
                'INHERITED_FR_CONTEXT'
        ) AS inherited_measure_count,

        COUNT(*) FILTER (
            WHERE relationship_mapping_scope =
                'BEHAVIOUR_SPECIFIC'
        ) AS behaviour_specific_measure_count

    FROM success_measure_expansion

    GROUP BY diagnostic_story_id
),

/* ================================================================
   6. ACCEPTANCE CRITERIA SOURCE EXPANSION

   Two source levels:

     A. Behaviour-level acceptance criteria
     B. Parent FR-level acceptance criteria

   ================================================================ */

acceptance_source AS
(
    SELECT
        sb.diagnostic_story_id,
        sb.functional_requirement_id,
        sb.functional_requirement_pk,
        sb.behaviour_number,
        sb.behaviour_text,
        sb.fr_source_file_id,

        'BEHAVIOUR_LEVEL'::TEXT AS source_scope,

        c.ordinality AS criterion_number,
        c.item AS criterion

    FROM behaviour_records sb

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(
                sb.behaviour_json -> 'acceptance_criteria'
            ) = 'array'
                THEN sb.behaviour_json -> 'acceptance_criteria'

            WHEN sb.behaviour_json ->
                'acceptance_criteria' IS NULL
              OR sb.behaviour_json ->
                'acceptance_criteria' = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sb.behaviour_json -> 'acceptance_criteria'
            )
        END
    ) WITH ORDINALITY AS c(item, ordinality)

    UNION ALL

    SELECT
        sb.diagnostic_story_id,
        sb.functional_requirement_id,
        sb.functional_requirement_pk,
        sb.behaviour_number,
        sb.behaviour_text,
        sb.fr_source_file_id,

        'PARENT_FR_LEVEL'::TEXT AS source_scope,

        c.ordinality AS criterion_number,
        c.item AS criterion

    FROM behaviour_records sb

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(
                sb.fr_payload -> 'acceptance_criteria'
            ) = 'array'
                THEN sb.fr_payload -> 'acceptance_criteria'

            WHEN sb.fr_payload ->
                'acceptance_criteria' IS NULL
              OR sb.fr_payload ->
                'acceptance_criteria' = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sb.fr_payload -> 'acceptance_criteria'
            )
        END
    ) WITH ORDINALITY AS c(item, ordinality)
),

/* ================================================================
   7. ACCEPTANCE CRITERIA MAPPING ASSESSMENT

   Explicitly mapped parent criteria:
     - Include only if mapping matches this behaviour.

   Unscoped parent criteria:
     - Preserve as UNMAPPED_PARENT_FR_CONTEXT.
     - Do not assign automatically to every behaviour.

   Behaviour-level criteria:
     - Include as behaviour-specific.

   ================================================================ */

acceptance_evaluation AS
(
    SELECT
        a.*,

        CASE
            WHEN a.source_scope = 'BEHAVIOUR_LEVEL'
                THEN 'BEHAVIOUR_SPECIFIC'

            WHEN
                COALESCE(
                    a.criterion ->>
                        'functional_behaviour_number',
                    a.criterion ->>
                        'behaviour_number',
                    a.criterion ->>
                        'behavior_number'
                ) ~ '^[0-9]+$'

                AND COALESCE(
                    a.criterion ->>
                        'functional_behaviour_number',
                    a.criterion ->>
                        'behaviour_number',
                    a.criterion ->>
                        'behavior_number'
                )::BIGINT = a.behaviour_number
                THEN 'INHERITED_FR_EXPLICITLY_MAPPED'

            WHEN LOWER(
                BTRIM(
                    COALESCE(
                        a.criterion ->>
                            'functional_behaviour',
                        a.criterion ->>
                            'related_behaviour',
                        a.criterion ->>
                            'behaviour',
                        a.criterion ->>
                            'behavior',
                        ''
                    )
                )
            ) = LOWER(BTRIM(a.behaviour_text))
                THEN 'INHERITED_FR_EXPLICITLY_MAPPED'

            WHEN JSONB_TYPEOF(
                a.criterion -> 'applies_to_behaviours'
            ) = 'array'

            AND a.criterion -> 'applies_to_behaviours'
                @> JSONB_BUILD_ARRAY(a.behaviour_text)
                THEN 'INHERITED_FR_EXPLICITLY_MAPPED'

            WHEN NOT (
                a.criterion ?|
                ARRAY[
                    'functional_behaviour_number',
                    'behaviour_number',
                    'behavior_number',
                    'functional_behaviour',
                    'related_behaviour',
                    'behaviour',
                    'behavior',
                    'applies_to_behaviours'
                ]
            )
                THEN 'UNMAPPED_PARENT_FR_CONTEXT'

            ELSE 'MAPPED_TO_OTHER_OR_UNRESOLVED_BEHAVIOUR'
        END AS mapping_status

    FROM acceptance_source a
),

/* ================================================================
   8. AGGREGATE ACCEPTANCE CRITERIA AND GWT
   ================================================================ */

acceptance_context AS
(
    SELECT
        diagnostic_story_id,

        /* Applicable acceptance criteria */
        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'criterion', criterion,
                    'source_scope', source_scope,
                    'mapping_status', mapping_status,
                    'criterion_number', criterion_number
                )
            ) FILTER (
                WHERE mapping_status IN
                (
                    'BEHAVIOUR_SPECIFIC',
                    'INHERITED_FR_EXPLICITLY_MAPPED'
                )
            ),
            '[]'::JSONB
        ) AS acceptance_criteria,

        /* Parent criteria not yet mapped to a behaviour */
        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'criterion', criterion,
                    'source_scope', source_scope,
                    'mapping_status', mapping_status,
                    'criterion_number', criterion_number
                )
            ) FILTER (
                WHERE mapping_status =
                    'UNMAPPED_PARENT_FR_CONTEXT'
            ),
            '[]'::JSONB
        ) AS unmapped_parent_acceptance_criteria,

        /* Explicitly mapped elsewhere */
        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'criterion', criterion,
                    'source_scope', source_scope,
                    'mapping_status', mapping_status,
                    'criterion_number', criterion_number
                )
            ) FILTER (
                WHERE mapping_status =
                    'MAPPED_TO_OTHER_OR_UNRESOLVED_BEHAVIOUR'
            ),
            '[]'::JSONB
        ) AS excluded_acceptance_criteria,

        COUNT(*) FILTER (
            WHERE mapping_status = 'BEHAVIOUR_SPECIFIC'
        ) AS behaviour_specific_criteria_count,

        COUNT(*) FILTER (
            WHERE mapping_status =
                'INHERITED_FR_EXPLICITLY_MAPPED'
        ) AS inherited_mapped_criteria_count,

        COUNT(*) FILTER (
            WHERE mapping_status =
                'UNMAPPED_PARENT_FR_CONTEXT'
        ) AS unmapped_parent_criteria_count,

        COUNT(*) FILTER (
            WHERE mapping_status =
                'MAPPED_TO_OTHER_OR_UNRESOLVED_BEHAVIOUR'
        ) AS excluded_criteria_count,

        /* Complete GWT from applicable criteria only */
        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'given',
                        COALESCE(
                            criterion -> 'given',
                            criterion -> 'Given'
                        ),

                    'when',
                        COALESCE(
                            criterion -> 'when',
                            criterion -> 'When'
                        ),

                    'then',
                        COALESCE(
                            criterion -> 'then',
                            criterion -> 'Then'
                        ),

                    'source_scope',
                        source_scope,

                    'mapping_status',
                        mapping_status,

                    'criterion_number',
                        criterion_number
                )
            ) FILTER (
                WHERE mapping_status IN
                (
                    'BEHAVIOUR_SPECIFIC',
                    'INHERITED_FR_EXPLICITLY_MAPPED'
                )

                AND JSONB_TYPEOF(criterion) = 'object'

                AND (
                    criterion ? 'given'
                    OR criterion ? 'Given'
                )

                AND (
                    criterion ? 'when'
                    OR criterion ? 'When'
                )

                AND (
                    criterion ? 'then'
                    OR criterion ? 'Then'
                )
            ),
            '[]'::JSONB
        ) AS given_when_then,

        /* Unmapped parent GWT scenarios */
        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'given',
                        COALESCE(
                            criterion -> 'given',
                            criterion -> 'Given'
                        ),

                    'when',
                        COALESCE(
                            criterion -> 'when',
                            criterion -> 'When'
                        ),

                    'then',
                        COALESCE(
                            criterion -> 'then',
                            criterion -> 'Then'
                        ),

                    'criterion',
                        criterion,

                    'source_scope',
                        source_scope,

                    'mapping_status',
                        mapping_status,

                    'criterion_number',
                        criterion_number
                )
            ) FILTER (
                WHERE mapping_status =
                    'UNMAPPED_PARENT_FR_CONTEXT'

                AND JSONB_TYPEOF(criterion) = 'object'

                AND (
                    criterion ? 'given'
                    OR criterion ? 'Given'
                )

                AND (
                    criterion ? 'when'
                    OR criterion ? 'When'
                )

                AND (
                    criterion ? 'then'
                    OR criterion ? 'Then'
                )
            ),
            '[]'::JSONB
        ) AS unmapped_parent_given_when_then,

        COUNT(*) FILTER (
            WHERE mapping_status IN
            (
                'BEHAVIOUR_SPECIFIC',
                'INHERITED_FR_EXPLICITLY_MAPPED'
            )

            AND JSONB_TYPEOF(criterion) = 'object'

            AND (
                criterion ? 'given'
                OR criterion ? 'Given'
            )

            AND (
                criterion ? 'when'
                OR criterion ? 'When'
            )

            AND (
                criterion ? 'then'
                OR criterion ? 'Then'
            )
        ) AS applicable_gwt_count,

        COUNT(*) FILTER (
            WHERE mapping_status =
                'UNMAPPED_PARENT_FR_CONTEXT'

            AND JSONB_TYPEOF(criterion) = 'object'

            AND (
                criterion ? 'given'
                OR criterion ? 'Given'
            )

            AND (
                criterion ? 'when'
                OR criterion ? 'When'
            )

            AND (
                criterion ? 'then'
                OR criterion ? 'Then'
            )
        ) AS unmapped_parent_gwt_count,

        COUNT(*) FILTER (
            WHERE mapping_status IN
            (
                'BEHAVIOUR_SPECIFIC',
                'INHERITED_FR_EXPLICITLY_MAPPED'
            )

            AND NOT
            (
                JSONB_TYPEOF(criterion) = 'object'

                AND (
                    criterion ? 'given'
                    OR criterion ? 'Given'
                )

                AND (
                    criterion ? 'when'
                    OR criterion ? 'When'
                )

                AND (
                    criterion ? 'then'
                    OR criterion ? 'Then'
                )
            )
        ) AS applicable_criteria_without_complete_gwt,

        /* Criterion-level source references */
        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'functional_requirement_id',
                        functional_requirement_id,

                    'functional_requirement_pk',
                        functional_requirement_pk,

                    'source_file_id',
                        fr_source_file_id,

                    'source_scope',
                        source_scope,

                    'criterion_number',
                        criterion_number,

                    'mapping_status',
                        mapping_status
                )
            ),
            '[]'::JSONB
        ) AS criterion_source_references

    FROM acceptance_evaluation

    GROUP BY diagnostic_story_id
),

/* ================================================================
   9. BR RELATIONSHIP DIAGNOSTICS

   Include all relationships for traceability, even those not
   eligible to populate success_criteria.

   ================================================================ */

br_mapping_context AS
(
    SELECT
        diagnostic_story_id,

        COUNT(DISTINCT business_requirement_pk)
            AS total_linked_br_count,

        COUNT(DISTINCT business_requirement_pk)
            FILTER (
                WHERE is_structurally_valid
            ) AS structurally_valid_br_count,

        COUNT(DISTINCT business_requirement_pk)
            FILTER (
                WHERE semantic_validation_status =
                    'SOURCE_MARKED_VALIDATED'
                  AND is_structurally_valid
            ) AS validated_br_count,

        COUNT(DISTINCT business_requirement_pk)
            FILTER (
                WHERE semantic_validation_status =
                    'REQUIRES_SEMANTIC_REVIEW'
                  AND is_structurally_valid
            ) AS unvalidated_br_count,

        COUNT(DISTINCT business_requirement_pk)
            FILTER (
                WHERE NOT is_structurally_valid
            ) AS structurally_invalid_br_count,

        COUNT(DISTINCT business_requirement_pk)
            FILTER (
                WHERE relationship_mapping_scope =
                    'INHERITED_FR_CONTEXT'
                  AND is_structurally_valid
            ) AS inherited_br_count,

        COUNT(DISTINCT business_requirement_pk)
            FILTER (
                WHERE relationship_mapping_scope =
                    'BEHAVIOUR_SPECIFIC'
                  AND is_structurally_valid
            ) AS behaviour_specific_br_count,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'business_requirement_id',
                        business_requirement_id,

                    'business_requirement_name',
                        business_requirement_name,

                    'relationship_type',
                        relationship_type,

                    'relationship_status',
                        relationship_status,

                    'structural_validation_status',
                        structural_validation_status,

                    'semantic_validation_status',
                        semantic_validation_status,

                    'mapping_scope',
                        relationship_mapping_scope,

                    'success_measures',
                        success_measures,

                    'business_requirement_source_file_id',
                        br_source_file_id,

                    'relationship_evidence',
                        relationship_evidence
                )
            ),
            '[]'::JSONB
        ) AS br_source_references

    FROM story_br_relationships

    GROUP BY diagnostic_story_id
)

/* ================================================================
   10. FINAL DIAGNOSTIC OUTPUT
   ================================================================ */

SELECT
    sb.diagnostic_story_id,

    sb.functional_requirement_id,
    sb.functional_requirement_pk,
    sb.functional_requirement_name,
    sb.functional_requirement_status,

    sb.behaviour_number,
    sb.behaviour_text,

    /* ------------------------------------------------------------
       SUCCESS CRITERIA
       ------------------------------------------------------------ */

    COALESCE(
        sc.success_criteria,
        '[]'::JSONB
    ) AS success_criteria,

    COALESCE(
        sc.success_measure_count,
        0
    ) AS success_measure_count,

    COALESCE(
        sc.validated_measure_count,
        0
    ) AS validated_measure_count,

    COALESCE(
        sc.unvalidated_measure_count,
        0
    ) AS unvalidated_measure_count,

    COALESCE(
        sc.inherited_measure_count,
        0
    ) AS inherited_measure_count,

    COALESCE(
        sc.behaviour_specific_measure_count,
        0
    ) AS behaviour_specific_measure_count,

    CASE
        WHEN COALESCE(sc.success_measure_count, 0) = 0
            THEN 'NO_SUCCESS_MEASURES_AVAILABLE'

        WHEN COALESCE(sc.unvalidated_measure_count, 0) > 0
         AND COALESCE(sc.validated_measure_count, 0) > 0
            THEN 'MIXED_VALIDATED_AND_UNVALIDATED'

        WHEN COALESCE(sc.unvalidated_measure_count, 0) > 0
            THEN 'AVAILABLE_BUT_REQUIRES_SEMANTIC_REVIEW'

        ELSE 'AVAILABLE_VALIDATED'
    END AS success_criteria_mapping_status,

    /* ------------------------------------------------------------
       ACCEPTANCE CRITERIA
       ------------------------------------------------------------ */

    COALESCE(
        ac.acceptance_criteria,
        '[]'::JSONB
    ) AS acceptance_criteria,

    COALESCE(
        ac.unmapped_parent_acceptance_criteria,
        '[]'::JSONB
    ) AS unmapped_parent_acceptance_criteria,

    COALESCE(
        ac.excluded_acceptance_criteria,
        '[]'::JSONB
    ) AS excluded_acceptance_criteria,

    COALESCE(
        ac.behaviour_specific_criteria_count,
        0
    ) AS behaviour_specific_criteria_count,

    COALESCE(
        ac.inherited_mapped_criteria_count,
        0
    ) AS inherited_mapped_criteria_count,

    COALESCE(
        ac.unmapped_parent_criteria_count,
        0
    ) AS unmapped_parent_criteria_count,

    COALESCE(
        ac.excluded_criteria_count,
        0
    ) AS excluded_criteria_count,

    CASE
        WHEN COALESCE(
            ac.behaviour_specific_criteria_count, 0
        ) > 0
         AND COALESCE(
            ac.inherited_mapped_criteria_count, 0
        ) > 0
            THEN 'BEHAVIOUR_SPECIFIC_AND_INHERITED'

        WHEN COALESCE(
            ac.behaviour_specific_criteria_count, 0
        ) > 0
            THEN 'BEHAVIOUR_SPECIFIC_AVAILABLE'

        WHEN COALESCE(
            ac.inherited_mapped_criteria_count, 0
        ) > 0
            THEN 'INHERITED_FR_MAPPING_AVAILABLE'

        WHEN COALESCE(
            ac.unmapped_parent_criteria_count, 0
        ) > 0
            THEN 'PARENT_FR_CRITERIA_UNMAPPED'

        ELSE 'NO_APPLICABLE_ACCEPTANCE_CRITERIA'
    END AS acceptance_criteria_mapping_status,

    /* ------------------------------------------------------------
       GIVEN-WHEN-THEN
       ------------------------------------------------------------ */

    COALESCE(
        ac.given_when_then,
        '[]'::JSONB
    ) AS given_when_then,

    COALESCE(
        ac.unmapped_parent_given_when_then,
        '[]'::JSONB
    ) AS unmapped_parent_given_when_then,

    COALESCE(
        ac.applicable_gwt_count,
        0
    ) AS applicable_gwt_count,

    COALESCE(
        ac.unmapped_parent_gwt_count,
        0
    ) AS unmapped_parent_gwt_count,

    COALESCE(
        ac.applicable_criteria_without_complete_gwt,
        0
    ) AS applicable_criteria_without_complete_gwt,

    CASE
        WHEN COALESCE(ac.applicable_gwt_count, 0) > 0
            THEN 'GWT_AVAILABLE_AND_MAPPED'

        WHEN COALESCE(ac.unmapped_parent_gwt_count, 0) > 0
            THEN 'GWT_EXISTS_BUT_PARENT_MAPPING_UNRESOLVED'

        WHEN COALESCE(
            ac.applicable_criteria_without_complete_gwt, 0
        ) > 0
            THEN 'AC_AVAILABLE_BUT_GWT_INCOMPLETE'

        ELSE 'NO_APPLICABLE_GWT'
    END AS given_when_then_mapping_status,

    /* ------------------------------------------------------------
       SOURCE REFERENCES
       ------------------------------------------------------------ */

    JSONB_BUILD_OBJECT(
        'functional_requirement',
            JSONB_BUILD_OBJECT(
                'functional_requirement_id',
                    sb.functional_requirement_id,

                'functional_requirement_pk',
                    sb.functional_requirement_pk,

                'source_file_id',
                    sb.fr_source_file_id
            ),

        'business_requirements',
            COALESCE(
                bm.br_source_references,
                '[]'::JSONB
            ),

        'acceptance_criteria',
            COALESCE(
                ac.criterion_source_references,
                '[]'::JSONB
            )
    ) AS source_references,

    /* ------------------------------------------------------------
       MAPPING ASSESSMENT
       ------------------------------------------------------------ */

    JSONB_BUILD_OBJECT(
        'success_criteria_mapping_status',
            CASE
                WHEN COALESCE(sc.success_measure_count, 0) = 0
                    THEN 'NOT_AVAILABLE'

                WHEN COALESCE(sc.unvalidated_measure_count, 0) > 0
                    THEN 'AVAILABLE_WITH_UNVALIDATED_RELATIONSHIPS'

                ELSE 'VALIDATED'
            END,

        'acceptance_criteria_mapping_status',
            CASE
                WHEN COALESCE(
                    ac.behaviour_specific_criteria_count, 0
                ) > 0
                    THEN 'BEHAVIOUR_SPECIFIC'

                WHEN COALESCE(
                    ac.inherited_mapped_criteria_count, 0
                ) > 0
                    THEN 'INHERITED_PARENT_FR_EXPLICITLY_MAPPED'

                WHEN COALESCE(
                    ac.unmapped_parent_criteria_count, 0
                ) > 0
                    THEN 'UNMAPPED_PARENT_FR_CONTEXT'

                ELSE 'NOT_AVAILABLE'
            END,

        'given_when_then_mapping_status',
            CASE
                WHEN COALESCE(ac.applicable_gwt_count, 0) > 0
                    THEN 'EXPLICITLY_MAPPED_GWT_AVAILABLE'

                WHEN COALESCE(
                    ac.unmapped_parent_gwt_count, 0
                ) > 0
                    THEN 'GWT_AVAILABLE_BUT_UNMAPPED'

                ELSE 'NOT_AVAILABLE'
            END,

        'br_relationship_assessment',
            JSONB_BUILD_OBJECT(
                'total_linked',
                    COALESCE(bm.total_linked_br_count, 0),

                'structurally_valid',
                    COALESCE(bm.structurally_valid_br_count, 0),

                'validated',
                    COALESCE(bm.validated_br_count, 0),

                'unvalidated',
                    COALESCE(bm.unvalidated_br_count, 0),

                'structurally_invalid',
                    COALESCE(bm.structurally_invalid_br_count, 0),

                'inherited',
                    COALESCE(bm.inherited_br_count, 0),

                'behaviour_specific',
                    COALESCE(bm.behaviour_specific_br_count, 0)
            ),

        'inheritance_policy',
            'Only explicitly behaviour-mapped parent FR criteria are assigned to a behaviour. Unmapped parent criteria remain separately visible.',

        'no_inference',
            TRUE
    ) AS mapping_assessment

FROM behaviour_records sb

LEFT JOIN success_context sc
    ON sc.diagnostic_story_id =
       sb.diagnostic_story_id

LEFT JOIN acceptance_context ac
    ON ac.diagnostic_story_id =
       sb.diagnostic_story_id

LEFT JOIN br_mapping_context bm
    ON bm.diagnostic_story_id =
       sb.diagnostic_story_id

ORDER BY
    sb.functional_requirement_id,
    sb.behaviour_number
limit 2

/* Extraction-------------------------------------------------------------*/

/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/

/* Extraction-------------------------------------------------------------*/

/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
/* Extraction-------------------------------------------------------------*/
WITH
/* ============================================================
   1. EPIC DISCOVERY
   ============================================================ */

epic_groups AS
(
    SELECT
        NULLIF(BTRIM(br.business_objective), '') AS epic_title,
        ARRAY_AGG(
            DISTINCT br.business_requirement_pk
            ORDER BY br.business_requirement_pk
        ) AS business_requirement_pks
    FROM requirements.business_requirements br
    WHERE NULLIF(BTRIM(br.business_objective), '') IS NOT NULL
    GROUP BY NULLIF(BTRIM(br.business_objective), '')
),

numbered_epics AS
(
    SELECT
        'EPIC-' ||
        LPAD(
            ROW_NUMBER() OVER (
                ORDER BY epic_title
            )::TEXT,
            3,
            '0'
        ) AS epic_id,
        epic_title,
        business_requirement_pks
    FROM epic_groups
),

epic_business_requirements AS
(
    SELECT
        e.epic_id,
        e.epic_title,
        br.business_requirement_pk,
        br.business_requirement_id,
        br.name AS business_requirement_name,
        br.business_requirement,
        br.business_objective,
        br.business_value,
        br.success_measures,
        br.priority,
        br.assumptions,
        br.risks_and_dependencies,
        br.policies_and_constraints,
        br.source_file_id AS br_source_file_id
    FROM numbered_epics e
    CROSS JOIN LATERAL UNNEST(e.business_requirement_pks)
        AS bpk(business_requirement_pk)
    JOIN requirements.business_requirements br
        ON br.business_requirement_pk = bpk.business_requirement_pk
),

/* ============================================================
   2. BR / FR RELATIONSHIP DISCOVERY AND VALIDATION
   ============================================================ */

relationship_base AS
(
    SELECT
        rr.business_requirement_pk,
        rr.functional_requirement_pk,
        rr.relationship_type,
        rr.relationship_status,
        rr.evidence AS relationship_evidence,

        br.business_requirement_id,
        br.name AS business_requirement_name,
        br.business_requirement,
        br.business_objective,
        br.business_value,
        br.success_measures,
        br.priority,
        br.assumptions,
        br.risks_and_dependencies,
        br.policies_and_constraints,
        br.source_file_id AS br_source_file_id,

        fr.functional_requirement_id,

        ebr.epic_id,
        ebr.epic_title

    FROM requirements.requirement_relationships rr

    JOIN requirements.business_requirements br
        ON br.business_requirement_pk = rr.business_requirement_pk

    JOIN requirements.functional_requirements fr
        ON fr.functional_requirement_pk = rr.functional_requirement_pk

    LEFT JOIN epic_business_requirements ebr
        ON ebr.business_requirement_pk = br.business_requirement_pk
),

relationship_audit AS
(
    SELECT
        rb.*,

        CASE
            WHEN NULLIF(BTRIM(rb.relationship_type), '') IS NULL
                THEN 'STRUCTURALLY_INVALID_MISSING_TYPE'

            WHEN JSONB_TYPEOF(rb.relationship_evidence)
                 IS DISTINCT FROM 'object'
                THEN 'STRUCTURALLY_INVALID_MISSING_OR_INVALID_EVIDENCE'

            WHEN rb.relationship_evidence ? 'business_requirement_id'
             AND rb.relationship_evidence ->> 'business_requirement_id'
                 IS DISTINCT FROM rb.business_requirement_id
                THEN 'STRUCTURALLY_INVALID_BR_ID_MISMATCH'

            WHEN rb.relationship_evidence ? 'linked_functional_requirement'
             AND rb.relationship_evidence ->> 'linked_functional_requirement'
                 IS DISTINCT FROM rb.functional_requirement_id
                THEN 'STRUCTURALLY_INVALID_FR_ID_MISMATCH'

            ELSE 'STRUCTURALLY_VALID'
        END AS structural_validation_status,

        (
            NULLIF(BTRIM(rb.relationship_type), '') IS NOT NULL

            AND JSONB_TYPEOF(rb.relationship_evidence) = 'object'

            AND
            (
                NOT (
                    rb.relationship_evidence ? 'business_requirement_id'
                )
                OR rb.relationship_evidence ->> 'business_requirement_id'
                   = rb.business_requirement_id
            )

            AND
            (
                NOT (
                    rb.relationship_evidence ? 'linked_functional_requirement'
                )
                OR rb.relationship_evidence ->> 'linked_functional_requirement'
                   = rb.functional_requirement_id
            )
        ) AS is_structurally_valid,

        CASE
            WHEN LOWER(
                COALESCE(
                    rb.relationship_evidence ->> 'semantic_validation_status',
                    rb.relationship_status,
                    ''
                )
            ) IN ('validated', 'approved')
            OR rb.relationship_evidence -> 'is_semantically_valid'
                = 'true'::JSONB
                THEN 'SOURCE_MARKED_VALIDATED'

            WHEN LOWER(
                COALESCE(
                    rb.relationship_evidence ->> 'semantic_validation_status',
                    rb.relationship_status,
                    ''
                )
            ) IN ('rejected', 'invalid')
            OR rb.relationship_evidence -> 'is_semantically_valid'
                = 'false'::JSONB
                THEN 'SOURCE_MARKED_REJECTED'

            ELSE 'REQUIRES_SEMANTIC_REVIEW'
        END AS semantic_validation_status

    FROM relationship_base rb
),

/* ============================================================
   3. FUNCTIONAL REQUIREMENT / EPIC FEATURE EXPANSION
   ============================================================ */

feature_candidates AS
(
    SELECT DISTINCT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,
        fr.raw_payload AS fr_payload,
        fr.source_file_id AS fr_source_file_id,

        ra.epic_id,
        ra.epic_title

    FROM requirements.functional_requirements fr

    LEFT JOIN relationship_audit ra
        ON ra.functional_requirement_pk =
           fr.functional_requirement_pk
       AND ra.epic_id IS NOT NULL

    UNION ALL

    SELECT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,
        fr.raw_payload AS fr_payload,
        fr.source_file_id AS fr_source_file_id,

        NULL::TEXT AS epic_id,
        NULL::TEXT AS epic_title

    FROM requirements.functional_requirements fr

    WHERE NOT EXISTS
    (
        SELECT 1
        FROM relationship_audit ra
        WHERE ra.functional_requirement_pk =
              fr.functional_requirement_pk
          AND ra.epic_id IS NOT NULL
    )
),

numbered_features AS
(
    SELECT
        'FEAT-' ||
        LPAD(
            ROW_NUMBER() OVER (
                ORDER BY
                    epic_id NULLS LAST,
                    functional_requirement_id
            )::TEXT,
            3,
            '0'
        ) AS feature_id,

        fc.*

    FROM feature_candidates fc
),

/* ============================================================
   4. NORMALIZE FUNCTIONAL BEHAVIOURS
   ============================================================ */

behaviour_source AS
(
    SELECT
        nf.*,

        CASE
            WHEN JSONB_TYPEOF(
                nf.fr_payload -> 'functional_behaviour'
            ) = 'array'
                THEN nf.fr_payload -> 'functional_behaviour'

            WHEN JSONB_TYPEOF(
                nf.fr_payload -> 'functional_behaviour'
            ) = 'object'
                THEN JSONB_BUILD_ARRAY(
                    nf.fr_payload -> 'functional_behaviour'
                )

            WHEN JSONB_TYPEOF(
                nf.fr_payload -> 'functional_behaviour'
            ) = 'string'
                THEN JSONB_BUILD_ARRAY(
                    nf.fr_payload -> 'functional_behaviour'
                )

            WHEN NULLIF(
                BTRIM(nf.functional_requirement_description),
                ''
            ) IS NOT NULL
                THEN JSONB_BUILD_ARRAY(
                    TO_JSONB(nf.functional_requirement_description)
                )

            ELSE '[]'::JSONB
        END AS normalized_behaviours,

        CASE
            WHEN JSONB_TYPEOF(
                nf.fr_payload -> 'functional_behaviour'
            ) = 'array'
                THEN 'SOURCE_ARRAY'

            WHEN JSONB_TYPEOF(
                nf.fr_payload -> 'functional_behaviour'
            ) = 'object'
                THEN 'SOURCE_OBJECT'

            WHEN JSONB_TYPEOF(
                nf.fr_payload -> 'functional_behaviour'
            ) = 'string'
                THEN 'SOURCE_SCALAR'

            WHEN NULLIF(
                BTRIM(nf.functional_requirement_description),
                ''
            ) IS NOT NULL
                THEN 'DESCRIPTION_FALLBACK'

            ELSE 'NO_BEHAVIOUR_SOURCE'
        END AS behaviour_extraction_method

    FROM numbered_features nf
),

behaviour_expansion AS
(
    SELECT
        bs.*,

        b.ordinality AS behaviour_ordinal,
        b.behaviour_json,

        NULLIF(
            BTRIM(
                CASE
                    WHEN JSONB_TYPEOF(b.behaviour_json) = 'string'
                        THEN b.behaviour_json #>> '{}'

                    WHEN JSONB_TYPEOF(b.behaviour_json) = 'object'
                        THEN COALESCE(
                            b.behaviour_json ->> 'behaviour',
                            b.behaviour_json ->> 'description',
                            b.behaviour_json ->> 'action',
                            b.behaviour_json ->> 'name',
                            b.behaviour_json ->> 'title'
                        )

                    ELSE NULL
                END
            ),
            ''
        ) AS behaviour_text,

        NULLIF(
            BTRIM(
                COALESCE(
                    b.behaviour_json ->> 'title',
                    b.behaviour_json ->> 'name'
                )
            ),
            ''
        ) AS explicit_behaviour_title

    FROM behaviour_source bs

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        bs.normalized_behaviours
    ) WITH ORDINALITY AS b(behaviour_json, ordinality)
),

valid_behaviours AS
(
    SELECT DISTINCT ON
    (
        feature_id,
        functional_requirement_pk,
        LOWER(
            REGEXP_REPLACE(
                BTRIM(behaviour_text),
                '[[:space:]]+',
                ' ',
                'g'
            )
        )
    )
        *
    FROM behaviour_expansion
    WHERE behaviour_text IS NOT NULL
    ORDER BY
        feature_id,
        functional_requirement_pk,
        LOWER(
            REGEXP_REPLACE(
                BTRIM(behaviour_text),
                '[[:space:]]+',
                ' ',
                'g'
            )
        ),
        behaviour_ordinal
),

story_records AS
(
    SELECT
        'US-' ||
        LPAD(
            ROW_NUMBER() OVER (
                ORDER BY
                    feature_id,
                    behaviour_ordinal,
                    behaviour_text
            )::TEXT,
            3,
            '0'
        ) AS user_story_id,

        vb.*

    FROM valid_behaviours vb
),

/* ============================================================
   5. STRUCTURALLY VALID BR LINKS FOR EACH STORY

   IMPORTANT:
   Structural validity is used to retain the BR relationship.
   Semantic validation status is preserved separately.
   A relationship is not discarded merely because semantic
   validation has not yet been completed.
   ============================================================ */

story_br_links AS
(
    SELECT DISTINCT
        sr.user_story_id,

        ra.business_requirement_pk,
        ra.business_requirement_id,
        ra.business_requirement_name,
        ra.business_requirement,
        ra.business_objective,
        ra.business_value,
        ra.success_measures,
        ra.priority,
        ra.assumptions,
        ra.risks_and_dependencies,
        ra.policies_and_constraints,
        ra.br_source_file_id,

        ra.relationship_type,
        ra.relationship_status,
        ra.relationship_evidence,

        ra.structural_validation_status,
        ra.semantic_validation_status

    FROM story_records sr

    JOIN relationship_audit ra
        ON ra.functional_requirement_pk =
           sr.functional_requirement_pk
       AND ra.epic_id IS NOT DISTINCT FROM sr.epic_id

    WHERE ra.is_structurally_valid = TRUE
),

/* ============================================================
   6. BR SUCCESS MEASURES

   Preserve each measure and its originating BR.
   Do not discard measures because the relationship has not
   received semantic validation.
   ============================================================ */

story_br_success_measure_items AS
(
    SELECT
        sbl.user_story_id,
        sbl.business_requirement_id,
        sbl.business_requirement_name,
        sbl.semantic_validation_status,
        sm.measure_json

    FROM story_br_links sbl

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(
                TO_JSONB(sbl.success_measures)
            ) = 'array'
                THEN TO_JSONB(sbl.success_measures)

            WHEN sbl.success_measures IS NULL
              OR TO_JSONB(sbl.success_measures) = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                TO_JSONB(sbl.success_measures)
            )
        END
    ) AS sm(measure_json)

    WHERE sm.measure_json IS NOT NULL
      AND sm.measure_json <> 'null'::JSONB
),

story_br_success_measures AS
(
    SELECT
        user_story_id,

        JSONB_AGG(
            CASE
                WHEN JSONB_TYPEOF(measure_json) = 'object'
                    THEN
                        measure_json
                        ||
                        JSONB_BUILD_OBJECT(
                            'business_requirement_id',
                                business_requirement_id,
                            'business_requirement_name',
                                business_requirement_name,
                            'semantic_validation_status',
                                semantic_validation_status,
                            'context_scope',
                                'INHERITED_FR_CONTEXT_NOT_BEHAVIOUR_VALIDATED'
                        )

                ELSE
                    JSONB_BUILD_OBJECT(
                        'measure',
                            measure_json,
                        'business_requirement_id',
                            business_requirement_id,
                        'business_requirement_name',
                            business_requirement_name,
                        'semantic_validation_status',
                            semantic_validation_status,
                        'context_scope',
                            'INHERITED_FR_CONTEXT_NOT_BEHAVIOUR_VALIDATED'
                    )
            END
            ORDER BY
                business_requirement_id,
                measure_json::TEXT
        ) AS success_criteria

    FROM story_br_success_measure_items

    GROUP BY user_story_id
),

/* ============================================================
   7. BR CONTEXT AGGREGATION
   ============================================================ */

story_br_context AS
(
    SELECT
        sbl.user_story_id,

        JSONB_AGG(
            DISTINCT TO_JSONB(sbl.business_requirement_id)
        ) AS business_requirement_ids,

        JSONB_AGG(
            DISTINCT JSONB_BUILD_OBJECT(
                'business_requirement_id',
                    sbl.business_requirement_id,
                'business_requirement_name',
                    sbl.business_requirement_name,
                'business_requirement',
                    sbl.business_requirement,
                'business_objective',
                    sbl.business_objective,
                'business_value',
                    sbl.business_value,
                'success_measures',
                    TO_JSONB(sbl.success_measures),
                'priority',
                    sbl.priority,
                'relationship_type',
                    sbl.relationship_type,
                'relationship_status',
                    sbl.relationship_status,
                'relationship_evidence',
                    sbl.relationship_evidence,
                'structural_validation_status',
                    sbl.structural_validation_status,
                'semantic_validation_status',
                    sbl.semantic_validation_status,
                'source_file_id',
                    sbl.br_source_file_id
            )
        ) AS business_requirement_context,

        JSONB_AGG(
            DISTINCT TO_JSONB(sbl.business_value)
        ) FILTER (
            WHERE sbl.business_value IS NOT NULL
        ) AS business_values,

        JSONB_AGG(
            DISTINCT TO_JSONB(sbl.assumptions)
        ) FILTER (
            WHERE sbl.assumptions IS NOT NULL
        ) AS assumptions,

        JSONB_AGG(
            DISTINCT TO_JSONB(sbl.risks_and_dependencies)
        ) FILTER (
            WHERE sbl.risks_and_dependencies IS NOT NULL
        ) AS risks_and_dependencies,

        JSONB_AGG(
            DISTINCT TO_JSONB(sbl.policies_and_constraints)
        ) FILTER (
            WHERE sbl.policies_and_constraints IS NOT NULL
        ) AS policies_and_constraints,

        CASE
            WHEN COUNT(DISTINCT sbl.priority)
                 FILTER (
                     WHERE NULLIF(BTRIM(sbl.priority), '') IS NOT NULL
                 ) = 1
                THEN MIN(sbl.priority)
            ELSE NULL
        END AS priority

    FROM story_br_links sbl

    GROUP BY sbl.user_story_id
),

/* ============================================================
   8. BEHAVIOUR-SPECIFIC FR EVIDENCE
   ============================================================ */

story_fr_items AS
(
    SELECT
        sr.user_story_id,
        item_source.category,
        item_data.item_json,
        item_data.item_number

    FROM story_records sr

    CROSS JOIN LATERAL
    (
        VALUES
            (
                'business_rules',
                sr.fr_payload -> 'business_rules'
            ),
            (
                'acceptance_criteria',
                sr.fr_payload -> 'acceptance_criteria'
            ),
            (
                'non_functional_requirements',
                sr.fr_payload -> 'non_functional_requirements'
            )
    ) AS item_source(category, item_collection)

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(item_source.item_collection) = 'array'
                THEN item_source.item_collection

            WHEN item_source.item_collection IS NULL
              OR item_source.item_collection = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(item_source.item_collection)
        END
    ) WITH ORDINALITY AS item_data(item_json, item_number)

    WHERE JSONB_TYPEOF(item_data.item_json) = 'object'

      AND
      (
          (
              COALESCE(
                  item_data.item_json ->>
                      'functional_behaviour_number',
                  item_data.item_json ->>
                      'behaviour_number',
                  item_data.item_json ->>
                      'behavior_number'
              ) ~ '^[0-9]+$'

              AND COALESCE(
                  item_data.item_json ->>
                      'functional_behaviour_number',
                  item_data.item_json ->>
                      'behaviour_number',
                  item_data.item_json ->>
                      'behavior_number'
              )::BIGINT = sr.behaviour_ordinal
          )

          OR LOWER(
              BTRIM(
                  COALESCE(
                      item_data.item_json ->>
                          'functional_behaviour',
                      item_data.item_json ->>
                          'related_behaviour',
                      item_data.item_json ->> 'behaviour',
                      item_data.item_json ->> 'behavior',
                      ''
                  )
              )
          ) = LOWER(BTRIM(sr.behaviour_text))

          OR
          (
              JSONB_TYPEOF(
                  item_data.item_json -> 'applies_to_behaviours'
              ) = 'array'

              AND item_data.item_json -> 'applies_to_behaviours'
                  @> JSONB_BUILD_ARRAY(sr.behaviour_text)
          )
      )
),

story_fr_evidence AS
(
    SELECT
        user_story_id,

        COALESCE(
            JSONB_AGG(item_json ORDER BY item_number)
                FILTER (
                    WHERE category = 'business_rules'
                ),
            '[]'::JSONB
        ) AS business_rules,

        COALESCE(
            JSONB_AGG(item_json ORDER BY item_number)
                FILTER (
                    WHERE category = 'acceptance_criteria'
                ),
            '[]'::JSONB
        ) AS acceptance_criteria,

        COALESCE(
            JSONB_AGG(item_json ORDER BY item_number)
                FILTER (
                    WHERE category = 'non_functional_requirements'
                ),
            '[]'::JSONB
        ) AS non_functional_requirements

    FROM story_fr_items

    GROUP BY user_story_id
),

/* ============================================================
   9. PARENT FR ACCEPTANCE CRITERIA

   Parent criteria are inherited when behaviour-specific
   acceptance criteria are unavailable.
   The original parent criteria are also preserved in
   source_references regardless of inheritance.
   ============================================================ */

parent_acceptance_criteria AS
(
    SELECT
        sr.user_story_id,
        sr.functional_requirement_pk,

        CASE
            WHEN JSONB_TYPEOF(
                sr.fr_payload -> 'acceptance_criteria'
            ) = 'array'
                THEN sr.fr_payload -> 'acceptance_criteria'

            WHEN sr.fr_payload -> 'acceptance_criteria' IS NULL
              OR sr.fr_payload -> 'acceptance_criteria' = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sr.fr_payload -> 'acceptance_criteria'
            )
        END AS acceptance_criteria

    FROM story_records sr
),

/* ============================================================
   10. PARENT GWT NUMBERING

   Window numbering happens in this CTE.
   JSONB_AGG occurs only in the following CTE.
   ============================================================ */

parent_gwt_numbered AS
(
    SELECT
        pac.user_story_id,
        pac.functional_requirement_pk,

        ROW_NUMBER() OVER (
            PARTITION BY pac.user_story_id
            ORDER BY c.ordinality
        ) AS sequence_number,

        c.item AS source_acceptance_criterion

    FROM parent_acceptance_criteria pac

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        pac.acceptance_criteria
    ) WITH ORDINALITY AS c(item, ordinality)

    WHERE JSONB_TYPEOF(c.item) = 'object'
      AND c.item ? 'given'
      AND c.item ? 'when'
      AND c.item ? 'then'
),

parent_gwt AS
(
    SELECT
        user_story_id,

        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'scenario_id',
                    'GWT-' || LPAD(sequence_number::TEXT, 3, '0'),
                'sequence_number',
                    sequence_number,
                'scenario_type',
                    'ACCEPTANCE_CRITERION',
                'given',
                    source_acceptance_criterion -> 'given',
                'when',
                    source_acceptance_criterion -> 'when',
                'then',
                    source_acceptance_criterion -> 'then',
                'expected_result',
                    source_acceptance_criterion -> 'then',
                'and_conditions',
                    '[]'::JSONB,
                'source_acceptance_criterion',
                    source_acceptance_criterion,
                'context_scope',
                    'INHERITED_PARENT_FR_CONTEXT'
            )
            ORDER BY sequence_number
        ) AS given_when_then

    FROM parent_gwt_numbered

    GROUP BY user_story_id
),

/* ============================================================
   11. BEHAVIOUR-SPECIFIC GWT NUMBERING

   Same two-step pattern. No window function is nested inside
   JSONB_AGG.
   ============================================================ */

behaviour_gwt_numbered AS
(
    SELECT
        sfe.user_story_id,

        ROW_NUMBER() OVER (
            PARTITION BY sfe.user_story_id
            ORDER BY c.ordinality
        ) AS sequence_number,

        c.item AS source_acceptance_criterion

    FROM story_fr_evidence sfe

    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        sfe.acceptance_criteria
    ) WITH ORDINALITY AS c(item, ordinality)

    WHERE JSONB_TYPEOF(c.item) = 'object'
      AND c.item ? 'given'
      AND c.item ? 'when'
      AND c.item ? 'then'
),

behaviour_gwt AS
(
    SELECT
        user_story_id,

        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'scenario_id',
                    'GWT-' || LPAD(sequence_number::TEXT, 3, '0'),
                'sequence_number',
                    sequence_number,
                'scenario_type',
                    'ACCEPTANCE_CRITERION',
                'given',
                    source_acceptance_criterion -> 'given',
                'when',
                    source_acceptance_criterion -> 'when',
                'then',
                    source_acceptance_criterion -> 'then',
                'expected_result',
                    source_acceptance_criterion -> 'then',
                'and_conditions',
                    '[]'::JSONB,
                'source_acceptance_criterion',
                    source_acceptance_criterion,
                'context_scope',
                    'BEHAVIOUR_LEVEL_SOURCE'
            )
            ORDER BY sequence_number
        ) AS given_when_then

    FROM behaviour_gwt_numbered

    GROUP BY user_story_id
),

/* ============================================================
   12. FINAL USER STORY RECORDS
   ============================================================ */

final_user_stories AS
(
    SELECT
        sr.user_story_id,

        COALESCE(
            sr.explicit_behaviour_title,

            NULLIF(
                BTRIM(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            sr.behaviour_text,
                            '^[[:space:]]*(the[[:space:]]+)?system[[:space:]]+(shall|must|should|will|can)[[:space:]]+',
                            '',
                            'i'
                        ),
                        '[[:space:]]*[.;]+[[:space:]]*$',
                        '',
                        'g'
                    )
                ),
                ''
            ),

            sr.behaviour_text
        ) AS user_story_title,

        sr.behaviour_text AS user_story_description,

        'FUNCTIONAL'::TEXT AS user_story_type,

        /* Actor */
        CASE
            WHEN JSONB_TYPEOF(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'actors', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'actor', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'primary_actor', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'required_by_actors', 'null'::JSONB)
                )
            ) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'actors', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'actor', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'primary_actor', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'required_by_actors', 'null'::JSONB)
                )

            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'actors', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'actor', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'primary_actor', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'required_by_actors', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'actors', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'actor', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'primary_actor', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'required_by_actors', 'null'::JSONB)
                )
            )
        END AS actor,

        NULLIF(
            BTRIM(
                COALESCE(
                    sr.behaviour_json ->> 'user_goal',
                    sr.behaviour_json ->> 'goal'
                )
            ),
            ''
        ) AS user_goal,

        JSONB_BUILD_OBJECT(
            'business_value',
                COALESCE(sbc.business_values, '[]'::JSONB),
            'success_measures',
                COALESCE(sbsm.success_criteria, '[]'::JSONB)
        ) AS business_value,

        sr.feature_id,
        sr.functional_requirement_name AS feature_name,
        sr.epic_id,
        sr.epic_title,

        /* Structurally valid BR links, including pending semantic review */
        COALESCE(
            sbc.business_requirement_ids,
            '[]'::JSONB
        ) AS business_requirement_ids,

        JSONB_BUILD_ARRAY(
            sr.functional_requirement_id
        ) AS functional_requirement_ids,

        /* Business objects */
        CASE
            WHEN JSONB_TYPEOF(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'business_objects', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'related_business_objects', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'related_business_objects', 'null'::JSONB)
                )
            ) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'business_objects', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'related_business_objects', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'related_business_objects', 'null'::JSONB)
                )

            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'business_objects', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'related_business_objects', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'related_business_objects', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'business_objects', 'null'::JSONB),
                    NULLIF(sr.behaviour_json -> 'related_business_objects', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'related_business_objects', 'null'::JSONB)
                )
            )
        END AS business_objects,

        /* Preconditions */
        CASE
            WHEN JSONB_TYPEOF(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
                )
            ) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
                )

            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
                )
            )
        END AS preconditions,

        /* Postconditions */
        CASE
            WHEN JSONB_TYPEOF(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
                )
            ) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
                )

            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
                )
            )
        END AS postconditions,

        COALESCE(
            NULLIF(BTRIM(sr.behaviour_json ->> 'trigger'), ''),
            NULLIF(BTRIM(sr.fr_payload ->> 'trigger'), '')
        ) AS trigger,

        /* Main flow */
        CASE
            WHEN JSONB_TYPEOF(
                COALESCE(
                    sr.behaviour_json -> 'main_flow',
                    sr.behaviour_json -> 'flow'
                )
            ) = 'array'
                THEN COALESCE(
                    sr.behaviour_json -> 'main_flow',
                    sr.behaviour_json -> 'flow'
                )

            WHEN COALESCE(
                sr.behaviour_json -> 'main_flow',
                sr.behaviour_json -> 'flow'
            ) IS NULL
              OR COALESCE(
                sr.behaviour_json -> 'main_flow',
                sr.behaviour_json -> 'flow'
            ) = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                COALESCE(
                    sr.behaviour_json -> 'main_flow',
                    sr.behaviour_json -> 'flow'
                )
            )
        END AS main_flow,

        /* Alternative flows */
        CASE
            WHEN JSONB_TYPEOF(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
                )
            ) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
                )

            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
                )
            )
        END AS alternative_flows,

        /* Exception flows */
        CASE
            WHEN JSONB_TYPEOF(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
                )
            ) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
                )

            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                COALESCE(
                    NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
                )
            )
        END AS exception_flows,

        /* Business rules */
        CASE
            WHEN JSONB_ARRAY_LENGTH(
                CASE
                    WHEN JSONB_TYPEOF(
                        sr.behaviour_json -> 'business_rules'
                    ) = 'array'
                        THEN sr.behaviour_json -> 'business_rules'

                    WHEN sr.behaviour_json -> 'business_rules' IS NULL
                      OR sr.behaviour_json -> 'business_rules' = 'null'::JSONB
                        THEN '[]'::JSONB

                    ELSE JSONB_BUILD_ARRAY(
                        sr.behaviour_json -> 'business_rules'
                    )
                END
                || COALESCE(sfe.business_rules, '[]'::JSONB)
            ) > 0
                THEN
                (
                    CASE
                        WHEN JSONB_TYPEOF(
                            sr.behaviour_json -> 'business_rules'
                        ) = 'array'
                            THEN sr.behaviour_json -> 'business_rules'

                        WHEN sr.behaviour_json -> 'business_rules' IS NULL
                          OR sr.behaviour_json -> 'business_rules' = 'null'::JSONB
                            THEN '[]'::JSONB

                        ELSE JSONB_BUILD_ARRAY(
                            sr.behaviour_json -> 'business_rules'
                        )
                    END
                    || COALESCE(sfe.business_rules, '[]'::JSONB)
                )

            WHEN JSONB_TYPEOF(
                sr.fr_payload -> 'business_rules'
            ) = 'array'
                THEN sr.fr_payload -> 'business_rules'

            WHEN sr.fr_payload -> 'business_rules' IS NULL
              OR sr.fr_payload -> 'business_rules' = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sr.fr_payload -> 'business_rules'
            )
        END AS business_rules,

        /* Acceptance criteria: behaviour-specific first, parent FR fallback */
        CASE
            WHEN JSONB_ARRAY_LENGTH(
                CASE
                    WHEN JSONB_TYPEOF(
                        sr.behaviour_json -> 'acceptance_criteria'
                    ) = 'array'
                        THEN sr.behaviour_json -> 'acceptance_criteria'

                    WHEN sr.behaviour_json -> 'acceptance_criteria' IS NULL
                      OR sr.behaviour_json -> 'acceptance_criteria' = 'null'::JSONB
                        THEN '[]'::JSONB

                    ELSE JSONB_BUILD_ARRAY(
                        sr.behaviour_json -> 'acceptance_criteria'
                    )
                END
                || COALESCE(sfe.acceptance_criteria, '[]'::JSONB)
            ) > 0
                THEN
                (
                    CASE
                        WHEN JSONB_TYPEOF(
                            sr.behaviour_json -> 'acceptance_criteria'
                        ) = 'array'
                            THEN sr.behaviour_json -> 'acceptance_criteria'

                        WHEN sr.behaviour_json -> 'acceptance_criteria' IS NULL
                          OR sr.behaviour_json -> 'acceptance_criteria' = 'null'::JSONB
                            THEN '[]'::JSONB

                        ELSE JSONB_BUILD_ARRAY(
                            sr.behaviour_json -> 'acceptance_criteria'
                        )
                    END
                    || COALESCE(sfe.acceptance_criteria, '[]'::JSONB)
                )

            ELSE COALESCE(
                pac.acceptance_criteria,
                '[]'::JSONB
            )
        END AS acceptance_criteria,

        /* GWT: behaviour-specific scenarios first, parent FR fallback */
        CASE
            WHEN JSONB_ARRAY_LENGTH(
                COALESCE(bg.given_when_then, '[]'::JSONB)
            ) > 0
                THEN bg.given_when_then

            ELSE COALESCE(
                pg.given_when_then,
                '[]'::JSONB
            )
        END AS given_when_then,

        /* BR success measures with originating BR and validation status */
        COALESCE(
            sbsm.success_criteria,
            '[]'::JSONB
        ) AS success_criteria,

        /* NFRs: behaviour-specific first, parent FR fallback */
        CASE
            WHEN JSONB_ARRAY_LENGTH(
                CASE
                    WHEN JSONB_TYPEOF(
                        sr.behaviour_json -> 'non_functional_requirements'
                    ) = 'array'
                        THEN sr.behaviour_json -> 'non_functional_requirements'

                    WHEN sr.behaviour_json -> 'non_functional_requirements' IS NULL
                      OR sr.behaviour_json -> 'non_functional_requirements' = 'null'::JSONB
                        THEN '[]'::JSONB

                    ELSE JSONB_BUILD_ARRAY(
                        sr.behaviour_json -> 'non_functional_requirements'
                    )
                END
                || COALESCE(sfe.non_functional_requirements, '[]'::JSONB)
            ) > 0
                THEN
                (
                    CASE
                        WHEN JSONB_TYPEOF(
                            sr.behaviour_json -> 'non_functional_requirements'
                        ) = 'array'
                            THEN sr.behaviour_json -> 'non_functional_requirements'

                        WHEN sr.behaviour_json -> 'non_functional_requirements' IS NULL
                          OR sr.behaviour_json -> 'non_functional_requirements' = 'null'::JSONB
                            THEN '[]'::JSONB

                        ELSE JSONB_BUILD_ARRAY(
                            sr.behaviour_json -> 'non_functional_requirements'
                        )
                    END
                    || COALESCE(sfe.non_functional_requirements, '[]'::JSONB)
                )

            WHEN JSONB_TYPEOF(
                sr.fr_payload -> 'non_functional_requirements'
            ) = 'array'
                THEN sr.fr_payload -> 'non_functional_requirements'

            WHEN sr.fr_payload -> 'non_functional_requirements' IS NULL
              OR sr.fr_payload -> 'non_functional_requirements' = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sr.fr_payload -> 'non_functional_requirements'
            )
        END AS non_functional_requirements,

        /* Dependencies */
        CASE
            WHEN JSONB_TYPEOF(
                sr.behaviour_json -> 'dependencies'
            ) = 'array'
                THEN sr.behaviour_json -> 'dependencies'

            WHEN sr.behaviour_json -> 'dependencies' IS NULL
              OR sr.behaviour_json -> 'dependencies' = 'null'::JSONB
                THEN '[]'::JSONB

            ELSE JSONB_BUILD_ARRAY(
                sr.behaviour_json -> 'dependencies'
            )
        END AS dependencies,

        JSONB_BUILD_OBJECT(
            'assumptions',
                COALESCE(sbc.assumptions, '[]'::JSONB),
            'risks_and_dependencies',
                COALESCE(sbc.risks_and_dependencies, '[]'::JSONB),
            'policies_and_constraints',
                COALESCE(sbc.policies_and_constraints, '[]'::JSONB)
        ) AS constraints,

        sbc.priority,

        NULL::NUMERIC AS estimation,

        /* ====================================================
           SOURCE REFERENCES AND MAPPING AUDIT
           ==================================================== */

        JSONB_BUILD_OBJECT(
            'functional_requirement_id',
                sr.functional_requirement_id,

            'functional_requirement_pk',
                sr.functional_requirement_pk,

            'functional_requirement_name',
                sr.functional_requirement_name,

            'functional_requirement_description',
                sr.functional_requirement_description,

            'functional_requirement_status',
                sr.functional_requirement_status,

            'functional_requirement_source_file_id',
                sr.fr_source_file_id,

            'functional_behaviour_number',
                sr.behaviour_ordinal,

            'functional_behaviour',
                sr.behaviour_json,

            'functional_behaviour_text',
                sr.behaviour_text,

            'behaviour_extraction_method',
                sr.behaviour_extraction_method,

            'epic_id',
                sr.epic_id,

            'epic_title',
                sr.epic_title,

            'structurally_linked_business_requirement_ids',
                COALESCE(sbc.business_requirement_ids, '[]'::JSONB),

            'business_requirement_context',
                COALESCE(sbc.business_requirement_context, '[]'::JSONB),

            'success_criteria_context',
                COALESCE(sbsm.success_criteria, '[]'::JSONB),

            'relationship_validation',
                COALESCE(
                    (
                        SELECT JSONB_AGG(
                            JSONB_BUILD_OBJECT(
                                'business_requirement_id',
                                    ra.business_requirement_id,
                                'functional_requirement_id',
                                    ra.functional_requirement_id,
                                'relationship_type',
                                    ra.relationship_type,
                                'relationship_status',
                                    ra.relationship_status,
                                'relationship_evidence',
                                    ra.relationship_evidence,
                                'structural_validation_status',
                                    ra.structural_validation_status,
                                'semantic_validation_status',
                                    ra.semantic_validation_status
                            )
                        )
                        FROM relationship_audit ra
                        WHERE ra.functional_requirement_pk =
                              sr.functional_requirement_pk
                          AND ra.epic_id IS NOT DISTINCT FROM sr.epic_id
                    ),
                    '[]'::JSONB
                ),

            'parent_functional_requirement_context',
                JSONB_BUILD_OBJECT(
                    'context_type',
                        'INHERITED_PARENT_CONTEXT',
                    'source_entity_type',
                        'FUNCTIONAL_REQUIREMENT',
                    'source_functional_requirement_id',
                        sr.functional_requirement_id,
                    'source_functional_requirement_pk',
                        sr.functional_requirement_pk,
                    'source_functional_requirement_name',
                        sr.functional_requirement_name,
                    'source_file_id',
                        sr.fr_source_file_id,
                    'inheritance_status',
                        'INHERITED_UNCHANGED',
                    'preserved_original_structure',
                        TRUE,
                    'source_payload',
                        sr.fr_payload
                ),

            'functional_requirement_context',
                JSONB_BUILD_OBJECT(
                    'context_type',
                        'INHERITED_PARENT_CONTEXT',
                    'inheritance_status',
                        'INHERITED_UNCHANGED',
                    'business_need',
                        sr.fr_payload -> 'business_need',
                    'required_by_actors',
                        sr.fr_payload -> 'required_by_actors',
                    'related_business_objects',
                        sr.fr_payload -> 'related_business_objects',
                    'preconditions',
                        sr.fr_payload -> 'preconditions',
                    'postconditions',
                        sr.fr_payload -> 'postconditions',
                    'trigger',
                        sr.fr_payload -> 'trigger',
                    'alternative_flows',
                        sr.fr_payload -> 'alternative_flows',
                    'exception_flows',
                        sr.fr_payload -> 'exception_flows',
                    'business_rules',
                        sr.fr_payload -> 'business_rules',
                    'acceptance_criteria',
                        sr.fr_payload -> 'acceptance_criteria',
                    'non_functional_requirements',
                        sr.fr_payload -> 'non_functional_requirements',
                    'related_information_requirements',
                        sr.fr_payload -> 'related_information_requirements'
                ),

            'mapping_assessment',
                JSONB_BUILD_OBJECT(
                    'acceptance_criteria_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(
                                COALESCE(sfe.acceptance_criteria, '[]'::JSONB)
                            ) > 0
                                THEN 'BEHAVIOUR_LEVEL_MAPPING_AVAILABLE'
                            WHEN JSONB_ARRAY_LENGTH(
                                COALESCE(pac.acceptance_criteria, '[]'::JSONB)
                            ) > 0
                                THEN 'INHERITED_PARENT_FR_CONTEXT'
                            ELSE 'NOT_AVAILABLE'
                        END,

                    'given_when_then_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(
                                COALESCE(bg.given_when_then, '[]'::JSONB)
                            ) > 0
                                THEN 'BEHAVIOUR_LEVEL_GWT_AVAILABLE'
                            WHEN JSONB_ARRAY_LENGTH(
                                COALESCE(pg.given_when_then, '[]'::JSONB)
                            ) > 0
                                THEN 'INHERITED_PARENT_FR_GWT'
                            ELSE 'NOT_AVAILABLE'
                        END,

                    'business_rule_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(
                                COALESCE(sfe.business_rules, '[]'::JSONB)
                            ) > 0
                                THEN 'BEHAVIOUR_LEVEL_MAPPING_AVAILABLE'
                            ELSE 'PARENT_FR_CONTEXT_ONLY'
                        END,

                    'br_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(
                                COALESCE(sbc.business_requirement_ids, '[]'::JSONB)
                            ) > 0
                                THEN 'STRUCTURALLY_VALID_BR_LINKS_PRESENT'
                            ELSE 'NO_STRUCTURALLY_VALID_BR_LINK'
                        END,

                    'br_semantic_validation_status',
                        CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM story_br_links sbl
                                WHERE sbl.user_story_id = sr.user_story_id
                                  AND sbl.semantic_validation_status =
                                      'SOURCE_MARKED_VALIDATED'
                            )
                                THEN 'SOME_BR_LINKS_SOURCE_MARKED_VALIDATED'

                            WHEN EXISTS (
                                SELECT 1
                                FROM story_br_links sbl
                                WHERE sbl.user_story_id = sr.user_story_id
                            )
                                THEN 'BR_LINKS_PRESENT_BUT_SEMANTICALLY_UNVALIDATED'

                            ELSE 'NO_STRUCTURALLY_VALID_BR_LINK'
                        END,

                    'success_criteria_scope',
                        'INHERITED_FR_CONTEXT_NOT_BEHAVIOUR_VALIDATED'
                ),

            'source_scopes',
                JSONB_BUILD_OBJECT(
                    'parent_functional_requirement',
                        'INHERITED_PARENT_CONTEXT',
                    'business_requirement_links',
                        'STRUCTURALLY_VALID_BR_LINKS',
                    'success_measures',
                        'INHERITED_BR_CONTEXT_NOT_BEHAVIOUR_VALIDATED',
                    'parent_acceptance_criteria',
                        'INHERITED_PARENT_FR_CONTEXT',
                    'parent_given_when_then',
                        'INHERITED_PARENT_FR_CONTEXT',
                    'behaviour_level_information',
                        'SOURCE_BEHAVIOUR_LEVEL_WHEN_AVAILABLE'
                ),

            'parent_acceptance_criteria_inherited_unmapped',
                COALESCE(pac.acceptance_criteria, '[]'::JSONB),

            'parent_given_when_then_inherited',
                COALESCE(pg.given_when_then, '[]'::JSONB),

            'behaviour_acceptance_criteria',
                COALESCE(sfe.acceptance_criteria, '[]'::JSONB),

            'behaviour_given_when_then',
                COALESCE(bg.given_when_then, '[]'::JSONB),

            'story_candidate_assessment',
                JSONB_BUILD_OBJECT(
                    'candidate_basis',
                        'FUNCTIONAL_BEHAVIOUR',
                    'independent_delivery_status',
                        CASE
                            WHEN sr.behaviour_json -> 'independently_deliverable'
                                 = 'true'::JSONB
                                THEN 'SOURCE_MARKED_INDEPENDENT'
                            WHEN sr.behaviour_json -> 'independently_deliverable'
                                 = 'false'::JSONB
                                THEN 'SOURCE_MARKED_NOT_INDEPENDENT'
                            ELSE 'REQUIRES_REVIEW'
                        END,
                    'generation_note',
                        'Behaviour-derived User Story candidate. Parent FR acceptance criteria and BR success measures are inherited context unless independently mapped and validated at behaviour level.'
                ),

            'source_file_references',
                JSONB_BUILD_OBJECT(
                    'functional_requirement_source_file_id',
                        sr.fr_source_file_id
                )
        ) AS source_references,

        'DRAFT'::TEXT AS status

    FROM story_records sr

    LEFT JOIN story_fr_evidence sfe
        ON sfe.user_story_id = sr.user_story_id

    LEFT JOIN story_br_context sbc
        ON sbc.user_story_id = sr.user_story_id

    LEFT JOIN story_br_success_measures sbsm
        ON sbsm.user_story_id = sr.user_story_id

    LEFT JOIN parent_acceptance_criteria pac
        ON pac.user_story_id = sr.user_story_id

    LEFT JOIN parent_gwt pg
        ON pg.user_story_id = sr.user_story_id

    LEFT JOIN behaviour_gwt bg
        ON bg.user_story_id = sr.user_story_id
)

/* ============================================================
   13. FINAL OUTPUT
   ============================================================ */

SELECT
    user_story_id,
    user_story_title,
    user_story_description,
    user_story_type,
    actor,
    user_goal,
    business_value,
    feature_id,
    feature_name,
    epic_id,
    epic_title,
    business_requirement_ids,
    functional_requirement_ids,
    business_objects,
    preconditions,
    postconditions,
    trigger,
    main_flow,
    alternative_flows,
    exception_flows,
    business_rules,
    acceptance_criteria,
    given_when_then,
    success_criteria,
    non_functional_requirements,
    dependencies,
    constraints,
    priority,
    estimation,
    source_references,
    status

FROM final_user_stories

ORDER BY
    feature_id,
    user_story_id;