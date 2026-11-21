
/*CREATE  TABLE assessment_stories AS*/
WITH epic_groups AS (
    SELECT
        NULLIF(BTRIM(br.business_objective), '') AS epic_title,
        ARRAY_AGG(DISTINCT br.business_requirement_pk ORDER BY br.business_requirement_pk) AS business_requirement_pks
    FROM requirements.business_requirements br
    WHERE NULLIF(BTRIM(br.business_objective), '') IS NOT NULL
    GROUP BY NULLIF(BTRIM(br.business_objective), '')
),
numbered_epics AS (
    SELECT
        'EPIC-' || LPAD(ROW_NUMBER() OVER (ORDER BY epic_title)::TEXT, 3, '0') AS epic_id,
        epic_title,
        business_requirement_pks
    FROM epic_groups
),
epic_business_requirements AS (
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
        COALESCE(
            NULLIF(BTRIM(TO_JSONB(br) ->> 'priority'), ''),
            NULLIF(BTRIM(br.raw_payload ->> 'priority'), '')
        ) AS priority,
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
relationship_base AS (
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
        COALESCE(
            NULLIF(BTRIM(TO_JSONB(br) ->> 'priority'), ''),
            NULLIF(BTRIM(br.raw_payload ->> 'priority'), '')
        ) AS priority,
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
relationship_audit AS (
    SELECT
        rb.*,
        CASE
            WHEN NULLIF(BTRIM(rb.relationship_type), '') IS NULL
                THEN 'STRUCTURALLY_INVALID_MISSING_TYPE'
            WHEN JSONB_TYPEOF(rb.relationship_evidence) IS DISTINCT FROM 'object'
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
            AND (
                NOT (rb.relationship_evidence ? 'business_requirement_id')
                OR rb.relationship_evidence ->> 'business_requirement_id'
                   = rb.business_requirement_id
            )
            AND (
                NOT (rb.relationship_evidence ? 'linked_functional_requirement')
                OR rb.relationship_evidence ->> 'linked_functional_requirement'
                   = rb.functional_requirement_id
            )
        ) AS is_structurally_valid,
        CASE
            WHEN LOWER(COALESCE(
                rb.relationship_evidence ->> 'semantic_validation_status',
                rb.relationship_status,
                ''
            )) IN ('validated', 'approved')
            OR rb.relationship_evidence -> 'is_semantically_valid' = 'true'::JSONB
                THEN 'SOURCE_MARKED_VALIDATED'
            WHEN LOWER(COALESCE(
                rb.relationship_evidence ->> 'semantic_validation_status',
                rb.relationship_status,
                ''
            )) IN ('rejected', 'invalid')
            OR rb.relationship_evidence -> 'is_semantically_valid' = 'false'::JSONB
                THEN 'SOURCE_MARKED_REJECTED'
            ELSE 'REQUIRES_SEMANTIC_REVIEW'
        END AS semantic_validation_status
    FROM relationship_base rb
),
fr_epic_context AS (
    SELECT
        ra.functional_requirement_pk,
        MIN(ra.epic_id) AS primary_epic_id,
        MIN(ra.epic_title) FILTER (
            WHERE ra.epic_id = (
                SELECT MIN(ra2.epic_id)
                FROM relationship_audit ra2
                WHERE ra2.functional_requirement_pk = ra.functional_requirement_pk
                  AND ra2.epic_id IS NOT NULL
            )
        ) AS primary_epic_title,
        JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT(
            'epic_id', ra.epic_id,
            'epic_title', ra.epic_title
        )) FILTER (WHERE ra.epic_id IS NOT NULL) AS epic_context
    FROM relationship_audit ra
    WHERE ra.epic_id IS NOT NULL
    GROUP BY ra.functional_requirement_pk
),
feature_candidates AS (
    SELECT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,
        fr.raw_payload AS fr_payload,
        fr.source_file_id AS fr_source_file_id,
        fec.primary_epic_id AS epic_id,
        fec.primary_epic_title AS epic_title,
        COALESCE(fec.epic_context, '[]'::JSONB) AS epic_context
    FROM requirements.functional_requirements fr
    LEFT JOIN fr_epic_context fec
        ON fec.functional_requirement_pk = fr.functional_requirement_pk
),
numbered_features AS (
    SELECT
        'FEAT-' || LPAD(
            ROW_NUMBER() OVER (
                ORDER BY functional_requirement_id, functional_requirement_pk
            )::TEXT,
            3,
            '0'
        ) AS feature_id,
        fc.*
    FROM feature_candidates fc
),
behaviour_source AS (
    SELECT
        nf.*,
        CASE
            WHEN JSONB_TYPEOF(nf.fr_payload -> 'functional_behaviour') = 'array'
                THEN nf.fr_payload -> 'functional_behaviour'
            WHEN JSONB_TYPEOF(nf.fr_payload -> 'functional_behaviour') IN ('object', 'string')
                THEN JSONB_BUILD_ARRAY(nf.fr_payload -> 'functional_behaviour')
            WHEN NULLIF(BTRIM(nf.functional_requirement_description), '') IS NOT NULL
                THEN JSONB_BUILD_ARRAY(TO_JSONB(nf.functional_requirement_description))
            ELSE '[]'::JSONB
        END AS normalized_behaviours,
        CASE
            WHEN JSONB_TYPEOF(nf.fr_payload -> 'functional_behaviour') = 'array'
                THEN 'SOURCE_ARRAY'
            WHEN JSONB_TYPEOF(nf.fr_payload -> 'functional_behaviour') = 'object'
                THEN 'SOURCE_OBJECT'
            WHEN JSONB_TYPEOF(nf.fr_payload -> 'functional_behaviour') = 'string'
                THEN 'SOURCE_SCALAR'
            WHEN NULLIF(BTRIM(nf.functional_requirement_description), '') IS NOT NULL
                THEN 'DESCRIPTION_FALLBACK'
            ELSE 'NO_BEHAVIOUR_SOURCE'
        END AS behaviour_extraction_method
    FROM numbered_features nf
),
behaviour_expansion AS (
    SELECT
        bs.*,
        b.ordinality AS behaviour_ordinal,
        b.behaviour_json,
        NULLIF(BTRIM(
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
        ), '') AS behaviour_text,
        NULLIF(BTRIM(COALESCE(
            b.behaviour_json ->> 'title',
            b.behaviour_json ->> 'name'
        )), '') AS explicit_behaviour_title
    FROM behaviour_source bs
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        bs.normalized_behaviours
    ) WITH ORDINALITY AS b(behaviour_json, ordinality)
),
valid_behaviours AS (
    SELECT DISTINCT ON (
        functional_requirement_pk,
        LOWER(REGEXP_REPLACE(BTRIM(behaviour_text), '[[:space:]]+', ' ', 'g'))
    ) *
    FROM behaviour_expansion
    WHERE behaviour_text IS NOT NULL
    ORDER BY
        functional_requirement_pk,
        LOWER(REGEXP_REPLACE(BTRIM(behaviour_text), '[[:space:]]+', ' ', 'g')),
        behaviour_ordinal
),
story_records AS (
    SELECT
        'US-' || LPAD(
            ROW_NUMBER() OVER (
                ORDER BY functional_requirement_id, behaviour_ordinal, behaviour_text
            )::TEXT,
            3,
            '0'
        ) AS user_story_id,
        vb.*
    FROM valid_behaviours vb
),
story_br_links AS (
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
        ON ra.functional_requirement_pk = sr.functional_requirement_pk
    WHERE ra.is_structurally_valid = TRUE
),
story_br_success_measure_items AS (
    SELECT
        sbl.user_story_id,
        sbl.business_requirement_id,
        sbl.business_requirement_name,
        sbl.semantic_validation_status,
        sm.measure_json
    FROM story_br_links sbl
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(TO_JSONB(sbl.success_measures)) = 'array'
                THEN TO_JSONB(sbl.success_measures)
            WHEN sbl.success_measures IS NULL
              OR TO_JSONB(sbl.success_measures) = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(TO_JSONB(sbl.success_measures))
        END
    ) AS sm(measure_json)
    WHERE sm.measure_json IS NOT NULL
      AND sm.measure_json <> 'null'::JSONB
),
story_br_success_measures AS (
    SELECT
        user_story_id,
        JSONB_AGG(
            CASE
                WHEN JSONB_TYPEOF(measure_json) = 'object'
                    THEN measure_json || JSONB_BUILD_OBJECT(
                        'business_requirement_id', business_requirement_id,
                        'business_requirement_name', business_requirement_name,
                        'semantic_validation_status', semantic_validation_status,
                        'context_scope', 'INHERITED_BR_CONTEXT_NOT_BEHAVIOUR_VALIDATED'
                    )
                ELSE JSONB_BUILD_OBJECT(
                    'measure', measure_json,
                    'business_requirement_id', business_requirement_id,
                    'business_requirement_name', business_requirement_name,
                    'semantic_validation_status', semantic_validation_status,
                    'context_scope', 'INHERITED_BR_CONTEXT_NOT_BEHAVIOUR_VALIDATED'
                )
            END
            ORDER BY business_requirement_id, measure_json::TEXT
        ) AS success_criteria
    FROM story_br_success_measure_items
    GROUP BY user_story_id
),
story_br_constraint_items AS (
    SELECT
        sbl.user_story_id,
        'assumptions'::TEXT AS constraint_type,
        x.item AS constraint_item
    FROM story_br_links sbl
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(TO_JSONB(sbl.assumptions)) = 'array'
                THEN TO_JSONB(sbl.assumptions)
            WHEN sbl.assumptions IS NULL
              OR TO_JSONB(sbl.assumptions) = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(TO_JSONB(sbl.assumptions))
        END
    ) AS x(item)

    UNION ALL

    SELECT
        sbl.user_story_id,
        'risks_and_dependencies',
        x.item
    FROM story_br_links sbl
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(TO_JSONB(sbl.risks_and_dependencies)) = 'array'
                THEN TO_JSONB(sbl.risks_and_dependencies)
            WHEN sbl.risks_and_dependencies IS NULL
              OR TO_JSONB(sbl.risks_and_dependencies) = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(TO_JSONB(sbl.risks_and_dependencies))
        END
    ) AS x(item)

    UNION ALL

    SELECT
        sbl.user_story_id,
        'policies_and_constraints',
        x.item
    FROM story_br_links sbl
    CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
        CASE
            WHEN JSONB_TYPEOF(TO_JSONB(sbl.policies_and_constraints)) = 'array'
                THEN TO_JSONB(sbl.policies_and_constraints)
            WHEN sbl.policies_and_constraints IS NULL
              OR TO_JSONB(sbl.policies_and_constraints) = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(TO_JSONB(sbl.policies_and_constraints))
        END
    ) AS x(item)
),
story_br_context AS (
    SELECT
        sbl.user_story_id,
        JSONB_AGG(DISTINCT TO_JSONB(sbl.business_requirement_id))
            AS business_requirement_ids,
        JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT(
            'business_requirement_id', sbl.business_requirement_id,
            'business_requirement_name', sbl.business_requirement_name,
            'business_requirement', sbl.business_requirement,
            'business_objective', sbl.business_objective,
            'business_value', sbl.business_value,
            'success_measures', TO_JSONB(sbl.success_measures),
            'priority', sbl.priority,
            'relationship_type', sbl.relationship_type,
            'relationship_status', sbl.relationship_status,
            'relationship_evidence', sbl.relationship_evidence,
            'structural_validation_status', sbl.structural_validation_status,
            'semantic_validation_status', sbl.semantic_validation_status,
            'source_file_id', sbl.br_source_file_id
        )) AS business_requirement_context,
        JSONB_AGG(DISTINCT TO_JSONB(sbl.business_value))
            FILTER (WHERE sbl.business_value IS NOT NULL) AS business_values,
        CASE
            WHEN COUNT(DISTINCT sbl.priority) FILTER (
                WHERE NULLIF(BTRIM(sbl.priority), '') IS NOT NULL
            ) = 1
                THEN MIN(sbl.priority)
            ELSE NULL
        END AS priority
    FROM story_br_links sbl
    GROUP BY sbl.user_story_id
),
story_br_constraints AS (
    SELECT
        user_story_id,
        COALESCE(
            JSONB_AGG(DISTINCT constraint_item)
                FILTER (WHERE constraint_type = 'assumptions'),
            '[]'::JSONB
        ) AS assumptions,
        COALESCE(
            JSONB_AGG(DISTINCT constraint_item)
                FILTER (WHERE constraint_type = 'risks_and_dependencies'),
            '[]'::JSONB
        ) AS risks_and_dependencies,
        COALESCE(
            JSONB_AGG(DISTINCT constraint_item)
                FILTER (WHERE constraint_type = 'policies_and_constraints'),
            '[]'::JSONB
        ) AS policies_and_constraints
    FROM story_br_constraint_items
    GROUP BY user_story_id
),
story_fr_items AS (
    SELECT
        sr.user_story_id,
        item_source.category,
        item_data.item_json,
        item_data.item_number
    FROM story_records sr
    CROSS JOIN LATERAL (
        VALUES
            ('business_rules', sr.fr_payload -> 'business_rules'),
            ('acceptance_criteria', sr.fr_payload -> 'acceptance_criteria'),
            ('non_functional_requirements', sr.fr_payload -> 'non_functional_requirements')
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
      AND (
          (
              COALESCE(
                  item_data.item_json ->> 'functional_behaviour_number',
                  item_data.item_json ->> 'behaviour_number',
                  item_data.item_json ->> 'behavior_number'
              ) ~ '^[0-9]+$'
              AND COALESCE(
                  item_data.item_json ->> 'functional_behaviour_number',
                  item_data.item_json ->> 'behaviour_number',
                  item_data.item_json ->> 'behavior_number'
              )::BIGINT = sr.behaviour_ordinal
          )
          OR LOWER(BTRIM(COALESCE(
              item_data.item_json ->> 'functional_behaviour',
              item_data.item_json ->> 'related_behaviour',
              item_data.item_json ->> 'behaviour',
              item_data.item_json ->> 'behavior',
              ''
          ))) = LOWER(BTRIM(sr.behaviour_text))
          OR (
              JSONB_TYPEOF(item_data.item_json -> 'applies_to_behaviours') = 'array'
              AND item_data.item_json -> 'applies_to_behaviours'
                  @> JSONB_BUILD_ARRAY(sr.behaviour_text)
          )
      )
),
story_fr_evidence AS (
    SELECT
        user_story_id,
        COALESCE(
            JSONB_AGG(item_json ORDER BY item_number)
                FILTER (WHERE category = 'business_rules'),
            '[]'::JSONB
        ) AS business_rules,
        COALESCE(
            JSONB_AGG(item_json ORDER BY item_number)
                FILTER (WHERE category = 'acceptance_criteria'),
            '[]'::JSONB
        ) AS acceptance_criteria,
        COALESCE(
            JSONB_AGG(item_json ORDER BY item_number)
                FILTER (WHERE category = 'non_functional_requirements'),
            '[]'::JSONB
        ) AS non_functional_requirements
    FROM story_fr_items
    GROUP BY user_story_id
),
parent_acceptance_criteria AS (
    SELECT
        sr.user_story_id,
        sr.functional_requirement_pk,
        CASE
            WHEN JSONB_TYPEOF(sr.fr_payload -> 'acceptance_criteria') = 'array'
                THEN sr.fr_payload -> 'acceptance_criteria'
            WHEN sr.fr_payload -> 'acceptance_criteria' IS NULL
              OR sr.fr_payload -> 'acceptance_criteria' = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(sr.fr_payload -> 'acceptance_criteria')
        END AS acceptance_criteria
    FROM story_records sr
),
parent_gwt_numbered AS (
    SELECT
        pac.user_story_id,
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
parent_gwt AS (
    SELECT
        user_story_id,
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'scenario_id', 'GWT-' || LPAD(sequence_number::TEXT, 3, '0'),
                'sequence_number', sequence_number,
                'scenario_type', 'ACCEPTANCE_CRITERION',
                'given', source_acceptance_criterion -> 'given',
                'when', source_acceptance_criterion -> 'when',
                'then', source_acceptance_criterion -> 'then',
                'expected_result', source_acceptance_criterion -> 'then',
                'and_conditions', '[]'::JSONB,
                'source_acceptance_criterion', source_acceptance_criterion,
                'context_scope', 'INHERITED_PARENT_FR_CONTEXT'
            )
            ORDER BY sequence_number
        ) AS given_when_then
    FROM parent_gwt_numbered
    GROUP BY user_story_id
),
behaviour_gwt_numbered AS (
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
behaviour_gwt AS (
    SELECT
        user_story_id,
        JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'scenario_id', 'GWT-' || LPAD(sequence_number::TEXT, 3, '0'),
                'sequence_number', sequence_number,
                'scenario_type', 'ACCEPTANCE_CRITERION',
                'given', source_acceptance_criterion -> 'given',
                'when', source_acceptance_criterion -> 'when',
                'then', source_acceptance_criterion -> 'then',
                'expected_result', source_acceptance_criterion -> 'then',
                'and_conditions', '[]'::JSONB,
                'source_acceptance_criterion', source_acceptance_criterion,
                'context_scope', 'BEHAVIOUR_LEVEL_SOURCE'
            )
            ORDER BY sequence_number
        ) AS given_when_then
    FROM behaviour_gwt_numbered
    GROUP BY user_story_id
),
final_user_stories AS (
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

        CASE
            WHEN JSONB_TYPEOF(COALESCE(
                NULLIF(sr.behaviour_json -> 'actors', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'actor', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'primary_actor', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'required_by_actors', 'null'::JSONB)
            )) = 'array'
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
            ELSE JSONB_BUILD_ARRAY(COALESCE(
                NULLIF(sr.behaviour_json -> 'actors', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'actor', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'primary_actor', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'required_by_actors', 'null'::JSONB)
            ))
        END AS actor,

        NULLIF(BTRIM(COALESCE(
            sr.behaviour_json ->> 'user_goal',
            sr.behaviour_json ->> 'goal'
        )), '') AS user_goal,

        JSONB_BUILD_OBJECT(
            'business_value',
            COALESCE(sbc.business_values, '[]'::JSONB)
        ) AS business_value,

        sr.feature_id,
        sr.functional_requirement_name AS feature_name,
        sr.epic_id,
        sr.epic_title,
        COALESCE(sbc.business_requirement_ids, '[]'::JSONB)
            AS business_requirement_ids,
        JSONB_BUILD_ARRAY(sr.functional_requirement_id)
            AS functional_requirement_ids,

        CASE
            WHEN JSONB_TYPEOF(COALESCE(
                NULLIF(sr.behaviour_json -> 'business_objects', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'related_business_objects', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'related_business_objects', 'null'::JSONB)
            )) = 'array'
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
            ELSE JSONB_BUILD_ARRAY(COALESCE(
                NULLIF(sr.behaviour_json -> 'business_objects', 'null'::JSONB),
                NULLIF(sr.behaviour_json -> 'related_business_objects', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'related_business_objects', 'null'::JSONB)
            ))
        END AS business_objects,

        CASE
            WHEN JSONB_TYPEOF(COALESCE(
                NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
            )) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
                )
            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(COALESCE(
                NULLIF(sr.behaviour_json -> 'preconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'preconditions', 'null'::JSONB)
            ))
        END AS preconditions,

        CASE
            WHEN JSONB_TYPEOF(COALESCE(
                NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
            )) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
                )
            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(COALESCE(
                NULLIF(sr.behaviour_json -> 'postconditions', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'postconditions', 'null'::JSONB)
            ))
        END AS postconditions,

        COALESCE(
            NULLIF(BTRIM(sr.behaviour_json ->> 'trigger'), ''),
            NULLIF(BTRIM(sr.fr_payload ->> 'trigger'), '')
        ) AS trigger,

        CASE
            WHEN JSONB_TYPEOF(COALESCE(
                sr.behaviour_json -> 'main_flow',
                sr.behaviour_json -> 'flow'
            )) = 'array'
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
            ELSE JSONB_BUILD_ARRAY(COALESCE(
                sr.behaviour_json -> 'main_flow',
                sr.behaviour_json -> 'flow'
            ))
        END AS main_flow,

        CASE
            WHEN JSONB_TYPEOF(COALESCE(
                NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
            )) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
                )
            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(COALESCE(
                NULLIF(sr.behaviour_json -> 'alternative_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'alternative_flows', 'null'::JSONB)
            ))
        END AS alternative_flows,

        CASE
            WHEN JSONB_TYPEOF(COALESCE(
                NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
            )) = 'array'
                THEN COALESCE(
                    NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                    NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
                )
            WHEN COALESCE(
                NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
            ) IS NULL
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(COALESCE(
                NULLIF(sr.behaviour_json -> 'exception_flows', 'null'::JSONB),
                NULLIF(sr.fr_payload -> 'exception_flows', 'null'::JSONB)
            ))
        END AS exception_flows,

        CASE
            WHEN JSONB_ARRAY_LENGTH(
                CASE
                    WHEN JSONB_TYPEOF(sr.behaviour_json -> 'business_rules') = 'array'
                        THEN sr.behaviour_json -> 'business_rules'
                    WHEN sr.behaviour_json -> 'business_rules' IS NULL
                      OR sr.behaviour_json -> 'business_rules' = 'null'::JSONB
                        THEN '[]'::JSONB
                    ELSE JSONB_BUILD_ARRAY(sr.behaviour_json -> 'business_rules')
                END || COALESCE(sfe.business_rules, '[]'::JSONB)
            ) > 0
                THEN (
                    CASE
                        WHEN JSONB_TYPEOF(sr.behaviour_json -> 'business_rules') = 'array'
                            THEN sr.behaviour_json -> 'business_rules'
                        WHEN sr.behaviour_json -> 'business_rules' IS NULL
                          OR sr.behaviour_json -> 'business_rules' = 'null'::JSONB
                            THEN '[]'::JSONB
                        ELSE JSONB_BUILD_ARRAY(sr.behaviour_json -> 'business_rules')
                    END || COALESCE(sfe.business_rules, '[]'::JSONB)
                )
            WHEN JSONB_TYPEOF(sr.fr_payload -> 'business_rules') = 'array'
                THEN sr.fr_payload -> 'business_rules'
            WHEN sr.fr_payload -> 'business_rules' IS NULL
              OR sr.fr_payload -> 'business_rules' = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(sr.fr_payload -> 'business_rules')
        END AS business_rules,

        CASE
            WHEN JSONB_ARRAY_LENGTH(
                CASE
                    WHEN JSONB_TYPEOF(sr.behaviour_json -> 'acceptance_criteria') = 'array'
                        THEN sr.behaviour_json -> 'acceptance_criteria'
                    WHEN sr.behaviour_json -> 'acceptance_criteria' IS NULL
                      OR sr.behaviour_json -> 'acceptance_criteria' = 'null'::JSONB
                        THEN '[]'::JSONB
                    ELSE JSONB_BUILD_ARRAY(sr.behaviour_json -> 'acceptance_criteria')
                END || COALESCE(sfe.acceptance_criteria, '[]'::JSONB)
            ) > 0
                THEN (
                    CASE
                        WHEN JSONB_TYPEOF(sr.behaviour_json -> 'acceptance_criteria') = 'array'
                            THEN sr.behaviour_json -> 'acceptance_criteria'
                        WHEN sr.behaviour_json -> 'acceptance_criteria' IS NULL
                          OR sr.behaviour_json -> 'acceptance_criteria' = 'null'::JSONB
                            THEN '[]'::JSONB
                        ELSE JSONB_BUILD_ARRAY(sr.behaviour_json -> 'acceptance_criteria')
                    END || COALESCE(sfe.acceptance_criteria, '[]'::JSONB)
                )
            ELSE COALESCE(pac.acceptance_criteria, '[]'::JSONB)
        END AS acceptance_criteria,

        CASE
            WHEN JSONB_ARRAY_LENGTH(COALESCE(bg.given_when_then, '[]'::JSONB)) > 0
                THEN bg.given_when_then
            ELSE COALESCE(pg.given_when_then, '[]'::JSONB)
        END AS given_when_then,

        COALESCE(sbsm.success_criteria, '[]'::JSONB) AS success_criteria,

        CASE
            WHEN JSONB_ARRAY_LENGTH(
                CASE
                    WHEN JSONB_TYPEOF(sr.behaviour_json -> 'non_functional_requirements') = 'array'
                        THEN sr.behaviour_json -> 'non_functional_requirements'
                    WHEN sr.behaviour_json -> 'non_functional_requirements' IS NULL
                      OR sr.behaviour_json -> 'non_functional_requirements' = 'null'::JSONB
                        THEN '[]'::JSONB
                    ELSE JSONB_BUILD_ARRAY(sr.behaviour_json -> 'non_functional_requirements')
                END || COALESCE(sfe.non_functional_requirements, '[]'::JSONB)
            ) > 0
                THEN (
                    CASE
                        WHEN JSONB_TYPEOF(sr.behaviour_json -> 'non_functional_requirements') = 'array'
                            THEN sr.behaviour_json -> 'non_functional_requirements'
                        WHEN sr.behaviour_json -> 'non_functional_requirements' IS NULL
                          OR sr.behaviour_json -> 'non_functional_requirements' = 'null'::JSONB
                            THEN '[]'::JSONB
                        ELSE JSONB_BUILD_ARRAY(sr.behaviour_json -> 'non_functional_requirements')
                    END || COALESCE(sfe.non_functional_requirements, '[]'::JSONB)
                )
            WHEN JSONB_TYPEOF(sr.fr_payload -> 'non_functional_requirements') = 'array'
                THEN sr.fr_payload -> 'non_functional_requirements'
            WHEN sr.fr_payload -> 'non_functional_requirements' IS NULL
              OR sr.fr_payload -> 'non_functional_requirements' = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(sr.fr_payload -> 'non_functional_requirements')
        END AS non_functional_requirements,

        CASE
            WHEN JSONB_TYPEOF(sr.behaviour_json -> 'dependencies') = 'array'
                THEN sr.behaviour_json -> 'dependencies'
            WHEN sr.behaviour_json -> 'dependencies' IS NULL
              OR sr.behaviour_json -> 'dependencies' = 'null'::JSONB
                THEN '[]'::JSONB
            ELSE JSONB_BUILD_ARRAY(sr.behaviour_json -> 'dependencies')
        END AS dependencies,

        JSONB_BUILD_OBJECT(
            'assumptions', COALESCE(sbcx.assumptions, '[]'::JSONB),
            'risks_and_dependencies', COALESCE(sbcx.risks_and_dependencies, '[]'::JSONB),
            'policies_and_constraints', COALESCE(sbcx.policies_and_constraints, '[]'::JSONB)
        ) AS constraints,

        sbc.priority,
        NULL::NUMERIC AS estimation,

        JSONB_BUILD_OBJECT(
            'functional_requirement_id', sr.functional_requirement_id,
            'functional_requirement_pk', sr.functional_requirement_pk,
            'functional_requirement_name', sr.functional_requirement_name,
            'functional_requirement_description', sr.functional_requirement_description,
            'functional_requirement_status', sr.functional_requirement_status,
            'functional_requirement_source_file_id', sr.fr_source_file_id,
            'functional_behaviour_number', sr.behaviour_ordinal,
            'functional_behaviour', sr.behaviour_json,
            'functional_behaviour_text', sr.behaviour_text,
            'behaviour_extraction_method', sr.behaviour_extraction_method,
            'epic_id', sr.epic_id,
            'epic_title', sr.epic_title,
            'all_epic_associations', sr.epic_context,
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
                                'business_requirement_id', ra.business_requirement_id,
                                'functional_requirement_id', ra.functional_requirement_id,
                                'epic_id', ra.epic_id,
                                'epic_title', ra.epic_title,
                                'relationship_type', ra.relationship_type,
                                'relationship_status', ra.relationship_status,
                                'relationship_evidence', ra.relationship_evidence,
                                'structural_validation_status', ra.structural_validation_status,
                                'semantic_validation_status', ra.semantic_validation_status
                            )
                            ORDER BY ra.business_requirement_id, ra.epic_id
                        )
                        FROM relationship_audit ra
                        WHERE ra.functional_requirement_pk = sr.functional_requirement_pk
                    ),
                    '[]'::JSONB
                ),

            'parent_functional_requirement_context',
                JSONB_BUILD_OBJECT(
                    'context_type', 'INHERITED_PARENT_CONTEXT',
                    'source_entity_type', 'FUNCTIONAL_REQUIREMENT',
                    'source_functional_requirement_id', sr.functional_requirement_id,
                    'source_functional_requirement_pk', sr.functional_requirement_pk,
                    'source_functional_requirement_name', sr.functional_requirement_name,
                    'source_file_id', sr.fr_source_file_id,
                    'inheritance_status', 'INHERITED_UNCHANGED',
                    'preserved_original_structure', TRUE,
                    'source_payload', sr.fr_payload
                ),

            'functional_requirement_context',
                JSONB_BUILD_OBJECT(
                    'context_type', 'INHERITED_PARENT_CONTEXT',
                    'inheritance_status', 'INHERITED_UNCHANGED',
                    'business_need', sr.fr_payload -> 'business_need',
                    'required_by_actors', sr.fr_payload -> 'required_by_actors',
                    'related_business_objects', sr.fr_payload -> 'related_business_objects',
                    'preconditions', sr.fr_payload -> 'preconditions',
                    'postconditions', sr.fr_payload -> 'postconditions',
                    'trigger', sr.fr_payload -> 'trigger',
                    'alternative_flows', sr.fr_payload -> 'alternative_flows',
                    'exception_flows', sr.fr_payload -> 'exception_flows',
                    'business_rules', sr.fr_payload -> 'business_rules',
                    'acceptance_criteria', sr.fr_payload -> 'acceptance_criteria',
                    'non_functional_requirements', sr.fr_payload -> 'non_functional_requirements',
                    'related_information_requirements', sr.fr_payload -> 'related_information_requirements'
                ),

            'mapping_assessment',
                JSONB_BUILD_OBJECT(
                    'acceptance_criteria_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(COALESCE(sfe.acceptance_criteria, '[]'::JSONB)) > 0
                                THEN 'BEHAVIOUR_LEVEL_MAPPING_AVAILABLE'
                            WHEN JSONB_ARRAY_LENGTH(COALESCE(pac.acceptance_criteria, '[]'::JSONB)) > 0
                                THEN 'INHERITED_PARENT_FR_CONTEXT'
                            ELSE 'NOT_AVAILABLE'
                        END,

                    'given_when_then_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(COALESCE(bg.given_when_then, '[]'::JSONB)) > 0
                                THEN 'BEHAVIOUR_LEVEL_GWT_AVAILABLE'
                            WHEN JSONB_ARRAY_LENGTH(COALESCE(pg.given_when_then, '[]'::JSONB)) > 0
                                THEN 'INHERITED_PARENT_FR_GWT'
                            ELSE 'NOT_AVAILABLE'
                        END,

                    'business_rule_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(COALESCE(sfe.business_rules, '[]'::JSONB)) > 0
                                THEN 'BEHAVIOUR_LEVEL_MAPPING_AVAILABLE'
                            ELSE 'PARENT_FR_CONTEXT_ONLY'
                        END,

                    'br_mapping_status',
                        CASE
                            WHEN JSONB_ARRAY_LENGTH(COALESCE(sbc.business_requirement_ids, '[]'::JSONB)) > 0
                                THEN 'STRUCTURALLY_VALID_BR_LINKS_PRESENT'
                            ELSE 'NO_STRUCTURALLY_VALID_BR_LINK'
                        END,

                    'br_semantic_validation_status',
                        CASE
                            WHEN EXISTS (
                                SELECT 1
                                FROM story_br_links sbl
                                WHERE sbl.user_story_id = sr.user_story_id
                                  AND sbl.semantic_validation_status = 'SOURCE_MARKED_VALIDATED'
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
                        'INHERITED_BR_CONTEXT_NOT_BEHAVIOUR_VALIDATED'
                ),

            'source_scopes',
                JSONB_BUILD_OBJECT(
                    'parent_functional_requirement', 'INHERITED_PARENT_CONTEXT',
                    'business_requirement_links', 'STRUCTURALLY_VALID_BR_LINKS',
                    'success_measures', 'INHERITED_BR_CONTEXT_NOT_BEHAVIOUR_VALIDATED',
                    'parent_acceptance_criteria', 'INHERITED_PARENT_FR_CONTEXT',
                    'parent_given_when_then', 'INHERITED_PARENT_FR_CONTEXT',
                    'behaviour_level_information', 'SOURCE_BEHAVIOUR_LEVEL_WHEN_AVAILABLE'
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
                    'candidate_basis', 'FUNCTIONAL_BEHAVIOUR',
                    'independent_delivery_status',
                        CASE
                            WHEN sr.behaviour_json -> 'independently_deliverable' = 'true'::JSONB
                                THEN 'SOURCE_MARKED_INDEPENDENT'
                            WHEN sr.behaviour_json -> 'independently_deliverable' = 'false'::JSONB
                                THEN 'SOURCE_MARKED_NOT_INDEPENDENT'
                            ELSE 'REQUIRES_REVIEW'
                        END,
                    'generation_note',
                        'Behaviour-derived User Story candidate. Parent FR acceptance criteria and BR success measures are inherited context unless independently mapped and validated at behaviour level.'
                ),

            'source_file_references',
                JSONB_BUILD_OBJECT(
                    'functional_requirement_source_file_id', sr.fr_source_file_id
                )
        ) AS source_references,

        'DRAFT'::TEXT AS status

    FROM story_records sr
    LEFT JOIN story_fr_evidence sfe
        ON sfe.user_story_id = sr.user_story_id
    LEFT JOIN story_br_context sbc
        ON sbc.user_story_id = sr.user_story_id
    LEFT JOIN story_br_constraints sbcx
        ON sbcx.user_story_id = sr.user_story_id
    LEFT JOIN story_br_success_measures sbsm
        ON sbsm.user_story_id = sr.user_story_id
    LEFT JOIN parent_acceptance_criteria pac
        ON pac.user_story_id = sr.user_story_id
    LEFT JOIN parent_gwt pg
        ON pg.user_story_id = sr.user_story_id
    LEFT JOIN behaviour_gwt bg
        ON bg.user_story_id = sr.user_story_id
)
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
ORDER BY feature_id, user_story_id;