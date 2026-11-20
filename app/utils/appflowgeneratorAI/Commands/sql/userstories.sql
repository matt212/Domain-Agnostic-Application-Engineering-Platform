WITH epic_groups AS
(
    SELECT
        NULLIF(BTRIM(br.business_objective), '') AS epic_title,
        ARRAY_AGG(
            br.business_requirement_pk
            ORDER BY br.business_requirement_id
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
            ROW_NUMBER() OVER (ORDER BY epic_title)::TEXT,
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
                NOT (rb.relationship_evidence ? 'business_requirement_id')
                OR rb.relationship_evidence ->> 'business_requirement_id'
                   = rb.business_requirement_id
            )

            AND
            (
                NOT (rb.relationship_evidence ? 'linked_functional_requirement')
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
            OR rb.relationship_evidence -> 'is_semantically_valid' = 'true'::JSONB
                THEN 'SOURCE_MARKED_VALIDATED'

            WHEN LOWER(
                COALESCE(
                    rb.relationship_evidence ->> 'semantic_validation_status',
                    rb.relationship_status,
                    ''
                )
            ) IN ('rejected', 'invalid')
            OR rb.relationship_evidence -> 'is_semantically_valid' = 'false'::JSONB
                THEN 'SOURCE_MARKED_REJECTED'

            ELSE 'REQUIRES_SEMANTIC_REVIEW'
        END AS semantic_validation_status

    FROM relationship_base rb
),

/*
 * Collect every Epic association for each Functional Requirement.
 *
 * Epic discovery is deliberately not restricted to structurally valid
 * relationship rows. This keeps Epic association discovery aligned with
 * the BR-to-Epic relationship derivation.
 *
 * Structurally valid relationships are still required for validated
 * Business Requirement context and story-level BR mapping.
 */
fr_relationship_context AS
(
    SELECT
        ra.functional_requirement_pk,

        COUNT(DISTINCT ra.epic_id)
            FILTER (WHERE ra.epic_id IS NOT NULL)
            AS epic_association_count,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'epic_id', ra.epic_id,
                    'epic_title', ra.epic_title
                )
            ) FILTER (WHERE ra.epic_id IS NOT NULL),
            '[]'::JSONB
        ) AS epic_associations,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'business_requirement_id', ra.business_requirement_id,
                    'business_requirement_name', ra.business_requirement_name,
                    'business_requirement', ra.business_requirement,
                    'business_objective', ra.business_objective,
                    'business_value', ra.business_value,
                    'success_measures', ra.success_measures,
                    'priority', ra.priority,
                    'assumptions', ra.assumptions,
                    'risks_and_dependencies', ra.risks_and_dependencies,
                    'policies_and_constraints', ra.policies_and_constraints,
                    'source_file_id', ra.br_source_file_id
                )
            ) FILTER (WHERE ra.is_structurally_valid),
            '[]'::JSONB
        ) AS related_business_requirements,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'business_requirement_id', ra.business_requirement_id,
                    'functional_requirement_id', ra.functional_requirement_id,
                    'relationship_type', ra.relationship_type,
                    'relationship_status', ra.relationship_status,
                    'relationship_evidence', ra.relationship_evidence,
                    'structural_validation_status', ra.structural_validation_status,
                    'semantic_validation_status', ra.semantic_validation_status
                )
            ),
            '[]'::JSONB
        ) AS relationship_validation

    FROM relationship_audit ra
    GROUP BY ra.functional_requirement_pk
),

/*
 * Expand a Functional Requirement into one Feature candidate per Epic.
 *
 * A Functional Requirement associated with:
 *   - One Epic: produces one Epic-specific Feature.
 *   - Multiple Epics: produces one Feature for each Epic.
 *   - No Epic: remains one Feature with NULL Epic fields.
 *
 * Business Requirement IDs are scoped to the current Epic.
 */
feature_candidates AS
(
    SELECT
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,
        fr.raw_payload AS fr_payload,
        fr.source_file_id AS fr_source_file_id,

        COALESCE(frc.epic_association_count, 0)
            AS epic_association_count,

        epic_item.item ->> 'epic_id' AS epic_id,
        epic_item.item ->> 'epic_title' AS epic_title,

        COALESCE(
            frc.epic_associations,
            '[]'::JSONB
        ) AS epic_associations,

        COALESCE(
            frc.related_business_requirements,
            '[]'::JSONB
        ) AS related_business_requirements,

        COALESCE(
            frc.relationship_validation,
            '[]'::JSONB
        ) AS relationship_validation,

        COALESCE(
            (
                SELECT JSONB_AGG(
                    DISTINCT TO_JSONB(ra.business_requirement_id)
                )
                FROM relationship_audit ra
                WHERE ra.functional_requirement_pk =
                      fr.functional_requirement_pk
                  AND ra.is_structurally_valid
                  AND ra.epic_id IS NOT DISTINCT FROM
                      (epic_item.item ->> 'epic_id')
            ),
            '[]'::JSONB
        ) AS structurally_linked_business_requirement_ids

    FROM requirements.functional_requirements fr

    LEFT JOIN fr_relationship_context frc
        ON frc.functional_requirement_pk =
           fr.functional_requirement_pk

    LEFT JOIN LATERAL
    (
        SELECT x.item
        FROM JSONB_ARRAY_ELEMENTS(
            COALESCE(frc.epic_associations, '[]'::JSONB)
        ) AS x(item)

        UNION ALL

        SELECT NULL::JSONB
        WHERE COALESCE(
            JSONB_ARRAY_LENGTH(frc.epic_associations),
            0
        ) = 0
    ) epic_item ON TRUE
),

numbered_features AS
(
    SELECT
        'FEAT-' ||
        LPAD(
            ROW_NUMBER() OVER
            (
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
             AND JSONB_ARRAY_LENGTH(
                    COALESCE(
                        desc_split.description_behaviours,
                        '[]'::JSONB
                    )
                 ) > 1
                THEN desc_split.description_behaviours

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
                THEN COALESCE(
                    desc_split.description_behaviours,
                    JSONB_BUILD_ARRAY(
                        nf.functional_requirement_description
                    )
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
             AND JSONB_ARRAY_LENGTH(
                    COALESCE(
                        desc_split.description_behaviours,
                        '[]'::JSONB
                    )
                 ) > 1
                THEN 'DESCRIPTION_SENTENCE_EXTRACTION'

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

    LEFT JOIN LATERAL
    (
        SELECT
            JSONB_AGG(
                TO_JSONB(BTRIM(x.match[1]))
                ORDER BY x.ordinality
            ) FILTER
            (
                WHERE NULLIF(
                    BTRIM(
                        REGEXP_REPLACE(
                            x.match[1],
                            '^[[:space:],;]+|[[:space:],;]+$',
                            '',
                            'g'
                        )
                    ),
                    ''
                ) IS NOT NULL
            ) AS description_behaviours

        FROM REGEXP_MATCHES(
            COALESCE(
                nf.functional_requirement_description,
                ''
            ),
            '([^.!?]+[.!?]?)',
            'g'
        ) WITH ORDINALITY AS x(match, ordinality)

    ) desc_split ON TRUE
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

/*
 * Include feature_id in the deduplication key.
 *
 * This prevents behaviour candidates belonging to different
 * Epic-specific Features from being collapsed into one story.
 */
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
            ROW_NUMBER() OVER
            (
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

/*
 * Only bring validated BR relationships into the story context
 * when they belong to the same Epic as the current Feature.
 */
story_br_links AS
(
    SELECT
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
        ra.relationship_evidence

    FROM story_records sr

    JOIN relationship_audit ra
        ON ra.functional_requirement_pk =
           sr.functional_requirement_pk
       AND ra.epic_id IS NOT DISTINCT FROM sr.epic_id

    WHERE ra.is_structurally_valid = TRUE
      AND ra.semantic_validation_status =
          'SOURCE_MARKED_VALIDATED'

      AND
      (
          (
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
              )::BIGINT = sr.behaviour_ordinal
          )

          OR LOWER(
              BTRIM(
                  COALESCE(
                      ra.relationship_evidence ->>
                          'functional_behaviour',
                      ra.relationship_evidence ->>
                          'related_behaviour',
                      ra.relationship_evidence ->> 'behaviour',
                      ra.relationship_evidence ->> 'behavior',
                      ''
                  )
              )
          ) = LOWER(BTRIM(sr.behaviour_text))
      )
),

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
            JSONB_AGG(item_json)
                FILTER (WHERE category = 'business_rules'),
            '[]'::JSONB
        ) AS business_rules,

        COALESCE(
            JSONB_AGG(item_json)
                FILTER (WHERE category = 'acceptance_criteria'),
            '[]'::JSONB
        ) AS acceptance_criteria,

        COALESCE(
            JSONB_AGG(item_json)
                FILTER (WHERE category = 'non_functional_requirements'),
            '[]'::JSONB
        ) AS non_functional_requirements

    FROM story_fr_items
    GROUP BY user_story_id
),

story_br_context AS
(
    SELECT
        sbl.user_story_id,

        COALESCE(
            JSONB_AGG(
                DISTINCT TO_JSONB(sbl.business_requirement_id)
            ),
            '[]'::JSONB
        ) AS validated_business_requirement_ids,

        COALESCE(
            JSONB_AGG(
                DISTINCT TO_JSONB(sbl.business_value)
            ) FILTER (WHERE sbl.business_value IS NOT NULL),
            '[]'::JSONB
        ) AS business_values,

        COALESCE(
            (
                SELECT JSONB_AGG(DISTINCT x.value)
                FROM story_br_links q

                CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
                    CASE
                        WHEN JSONB_TYPEOF(
                            TO_JSONB(q.success_measures)
                        ) = 'array'
                            THEN TO_JSONB(q.success_measures)

                        WHEN q.success_measures IS NULL
                          OR TO_JSONB(q.success_measures) = 'null'::JSONB
                            THEN '[]'::JSONB

                        ELSE JSONB_BUILD_ARRAY(
                            TO_JSONB(q.success_measures)
                        )
                    END
                ) AS x(value)

                WHERE q.user_story_id = sbl.user_story_id
                  AND x.value <> 'null'::JSONB
            ),
            '[]'::JSONB
        ) AS success_measures,

        COALESCE(
            (
                SELECT JSONB_AGG(DISTINCT x.value)
                FROM story_br_links q

                CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
                    CASE
                        WHEN JSONB_TYPEOF(
                            TO_JSONB(q.assumptions)
                        ) = 'array'
                            THEN TO_JSONB(q.assumptions)

                        WHEN q.assumptions IS NULL
                          OR TO_JSONB(q.assumptions) = 'null'::JSONB
                            THEN '[]'::JSONB

                        ELSE JSONB_BUILD_ARRAY(
                            TO_JSONB(q.assumptions)
                        )
                    END
                ) AS x(value)

                WHERE q.user_story_id = sbl.user_story_id
                  AND x.value <> 'null'::JSONB
            ),
            '[]'::JSONB
        ) AS assumptions,

        COALESCE(
            (
                SELECT JSONB_AGG(DISTINCT x.value)
                FROM story_br_links q

                CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
                    CASE
                        WHEN JSONB_TYPEOF(
                            TO_JSONB(q.risks_and_dependencies)
                        ) = 'array'
                            THEN TO_JSONB(q.risks_and_dependencies)

                        WHEN q.risks_and_dependencies IS NULL
                          OR TO_JSONB(q.risks_and_dependencies) = 'null'::JSONB
                            THEN '[]'::JSONB

                        ELSE JSONB_BUILD_ARRAY(
                            TO_JSONB(q.risks_and_dependencies)
                        )
                    END
                ) AS x(value)

                WHERE q.user_story_id = sbl.user_story_id
                  AND x.value <> 'null'::JSONB
            ),
            '[]'::JSONB
        ) AS risks_and_dependencies,

        COALESCE(
            (
                SELECT JSONB_AGG(DISTINCT x.value)
                FROM story_br_links q

                CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(
                    CASE
                        WHEN JSONB_TYPEOF(
                            TO_JSONB(q.policies_and_constraints)
                        ) = 'array'
                            THEN TO_JSONB(q.policies_and_constraints)

                        WHEN q.policies_and_constraints IS NULL
                          OR TO_JSONB(q.policies_and_constraints) = 'null'::JSONB
                            THEN '[]'::JSONB

                        ELSE JSONB_BUILD_ARRAY(
                            TO_JSONB(q.policies_and_constraints)
                        )
                    END
                ) AS x(value)

                WHERE q.user_story_id = sbl.user_story_id
                  AND x.value <> 'null'::JSONB
            ),
            '[]'::JSONB
        ) AS policies_and_constraints,

        CASE
            WHEN COUNT(DISTINCT sbl.priority)
                 FILTER (
                     WHERE NULLIF(BTRIM(sbl.priority), '') IS NOT NULL
                 ) = 1
                THEN MIN(sbl.priority)

            ELSE NULL
        END AS priority,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'business_requirement_id',
                        sbl.business_requirement_id,
                    'business_requirement_name',
                        sbl.business_requirement_name,
                    'business_value',
                        sbl.business_value,
                    'success_measures',
                        sbl.success_measures,
                    'priority',
                        sbl.priority,
                    'relationship_type',
                        sbl.relationship_type,
                    'relationship_status',
                        sbl.relationship_status,
                    'relationship_evidence',
                        sbl.relationship_evidence,
                    'source_file_id',
                        sbl.br_source_file_id
                )
            ),
            '[]'::JSONB
        ) AS validated_business_requirement_context

    FROM story_br_links sbl
    GROUP BY sbl.user_story_id
),

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
                COALESCE(sbc.success_measures, '[]'::JSONB)
        ) AS business_value,

        sr.feature_id,
        sr.functional_requirement_name AS feature_name,
        sr.epic_id,
        sr.epic_title,

        COALESCE(
            sr.structurally_linked_business_requirement_ids,
            '[]'::JSONB
        ) AS business_requirement_ids,

        JSONB_BUILD_ARRAY(
            sr.functional_requirement_id
        ) AS functional_requirement_ids,

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

        CASE
            WHEN JSONB_ARRAY_LENGTH(
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

        CASE
            WHEN JSONB_ARRAY_LENGTH(
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
        END AS acceptance_criteria,

        COALESCE(
            (
                SELECT JSONB_AGG(c.item)
                FROM JSONB_ARRAY_ELEMENTS(
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
                ) AS c(item)

                WHERE JSONB_TYPEOF(c.item) = 'object'
                  AND c.item ? 'given'
                  AND c.item ? 'when'
                  AND c.item ? 'then'
            ),
            '[]'::JSONB
        ) AS given_when_then,

        COALESCE(
            sbc.success_measures,
            '[]'::JSONB
        ) AS success_criteria,

        CASE
            WHEN JSONB_ARRAY_LENGTH(
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
            'epic_associations',
                sr.epic_associations,
            'epic_association_count',
                sr.epic_association_count,
            'all_related_business_requirements',
                sr.related_business_requirements,
            'structurally_linked_business_requirement_ids',
                sr.structurally_linked_business_requirement_ids,
            'relationship_validation',
                sr.relationship_validation,
            'validated_story_business_requirements',
                COALESCE(
                    sbc.validated_business_requirement_context,
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
                    sr.fr_payload,
                'source_payload_field_names',
                    COALESCE(
                        (
                            SELECT JSONB_AGG(
                                field_name
                                ORDER BY field_name
                            )
                            FROM JSONB_OBJECT_KEYS(
                                CASE
                                    WHEN JSONB_TYPEOF(sr.fr_payload) = 'object'
                                        THEN sr.fr_payload
                                    ELSE '{}'::JSONB
                                END
                            ) AS fields(field_name)
                        ),
                        '[]'::JSONB
                    ),
                'inheritance_note',
                    'Complete parent Functional Requirement payload copied into this child User Story. Original JSON structure and field names are preserved. The inherited information is parent-level context and is not automatically validated as behaviour-specific.'
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
                'actor_mapping_status',
                    CASE
                        WHEN sr.behaviour_json ? 'actors'
                          OR sr.behaviour_json ? 'actor'
                          OR sr.behaviour_json ? 'primary_actor'
                            THEN 'BEHAVIOUR_LEVEL_SOURCE_AVAILABLE'
                        ELSE 'PARENT_FR_CONTEXT_ONLY'
                    END,

                'acceptance_criteria_mapping_status',
                    CASE
                        WHEN JSONB_ARRAY_LENGTH(
                            COALESCE(sfe.acceptance_criteria, '[]'::JSONB)
                        ) > 0
                            THEN 'BEHAVIOUR_LEVEL_MAPPING_AVAILABLE'
                        ELSE 'PARENT_FR_CONTEXT_ONLY'
                    END,

                'business_rule_mapping_status',
                    CASE
                        WHEN JSONB_ARRAY_LENGTH(
                            COALESCE(sfe.business_rules, '[]'::JSONB)
                        ) > 0
                            THEN 'BEHAVIOUR_LEVEL_MAPPING_AVAILABLE'
                        ELSE 'PARENT_FR_CONTEXT_ONLY'
                    END,

                'nfr_mapping_status',
                    CASE
                        WHEN JSONB_ARRAY_LENGTH(
                            COALESCE(sfe.non_functional_requirements, '[]'::JSONB)
                        ) > 0
                            THEN 'BEHAVIOUR_LEVEL_MAPPING_AVAILABLE'
                        ELSE 'PARENT_FR_CONTEXT_ONLY'
                    END,

                'br_mapping_status',
                    CASE
                        WHEN JSONB_ARRAY_LENGTH(
                            COALESCE(
                                sbc.validated_business_requirement_context,
                                '[]'::JSONB
                            )
                        ) > 0
                            THEN 'VALIDATED_BEHAVIOUR_LEVEL_BR_MAPPING'

                        WHEN JSONB_ARRAY_LENGTH(
                            sr.structurally_linked_business_requirement_ids
                        ) > 0
                            THEN 'BR_LINKS_PRESENT_BUT_NOT_VALIDATED_FOR_BEHAVIOUR'

                        ELSE 'NO_STRUCTURALLY_VALID_BR_LINK'
                    END
            ),

            'source_scopes',
            JSONB_BUILD_OBJECT(
                'parent_functional_requirement',
                    'INHERITED_PARENT_CONTEXT',

                'actor',
                    CASE
                        WHEN sr.behaviour_json ? 'actors'
                          OR sr.behaviour_json ? 'actor'
                          OR sr.behaviour_json ? 'primary_actor'
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'required_by_actors'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'business_objects',
                    CASE
                        WHEN sr.behaviour_json ? 'business_objects'
                          OR sr.behaviour_json ? 'related_business_objects'
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'related_business_objects'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'preconditions',
                    CASE
                        WHEN sr.behaviour_json ? 'preconditions'
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'preconditions'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'postconditions',
                    CASE
                        WHEN sr.behaviour_json ? 'postconditions'
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'postconditions'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'trigger',
                    CASE
                        WHEN NULLIF(
                            BTRIM(sr.behaviour_json ->> 'trigger'),
                            ''
                        ) IS NOT NULL
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN NULLIF(
                            BTRIM(sr.fr_payload ->> 'trigger'),
                            ''
                        ) IS NOT NULL
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'alternative_flows',
                    CASE
                        WHEN sr.behaviour_json ? 'alternative_flows'
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'alternative_flows'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'exception_flows',
                    CASE
                        WHEN sr.behaviour_json ? 'exception_flows'
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'exception_flows'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'business_rules',
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
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'business_rules'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'acceptance_criteria',
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
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'acceptance_criteria'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'non_functional_requirements',
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
                            THEN 'BEHAVIOUR_LEVEL_SOURCE'

                        WHEN sr.fr_payload ? 'non_functional_requirements'
                            THEN 'INHERITED_PARENT_FR_CONTEXT'

                        ELSE 'NOT_AVAILABLE'
                    END,

                'functional_requirement_actors',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_business_need',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_business_objects',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_preconditions',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_postconditions',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_trigger',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_alternative_flows',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_exception_flows',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_business_rules',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_acceptance_criteria',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_non_functional_requirements',
                    'INHERITED_PARENT_FR_CONTEXT',
                'functional_requirement_related_information_requirements',
                    'INHERITED_PARENT_FR_CONTEXT',
                'behaviour_level_information',
                    'SOURCE_BEHAVIOUR_LEVEL_WHEN_AVAILABLE',

                'business_requirement_ids',
                    'STRUCTURALLY_VALID_BR_LINKS_WITHIN_THIS_EPIC_FEATURE',

                'business_value',
                    'VALIDATED_BEHAVIOUR_LEVEL_BR_RELATIONSHIP_ONLY',

                'success_measures',
                    'VALIDATED_BEHAVIOUR_LEVEL_BR_RELATIONSHIP_ONLY',

                'constraints',
                    'VALIDATED_BEHAVIOUR_LEVEL_BR_RELATIONSHIP_ONLY'
            ),

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

                'story_specific_acceptance_evidence',
                    CASE
                        WHEN JSONB_ARRAY_LENGTH(
                            COALESCE(sfe.acceptance_criteria, '[]'::JSONB)
                        ) > 0
                            THEN 'AVAILABLE'
                        ELSE 'NOT_EXPLICITLY_MAPPED'
                    END,

                'generation_note',
                    'Behaviour-derived User Story candidate; independent deliverability requires validation.'
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

ORDER BY
    feature_id,
    user_story_id;