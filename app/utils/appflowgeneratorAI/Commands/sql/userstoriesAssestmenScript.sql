/* ========================================================================
   USER STORY ASSESSMENT — 12 DIMENSIONS
   READ-ONLY EVIDENCE RETRIEVAL

   INPUT:
       Existing assessment_stories CTE (328 assessed stories)

   REPOSITORIES:
       requirements
       business_rule_discovery
       public (Knowledge Base)

   RETRIEVAL ORDER:
       1. Direct story -> Functional Requirement links
       2. Direct and FR-linked Business Requirements
       3. Business Rules linked by FR, actor or business object
       4. Knowledge Base records linked by Business Rules
       5. One-hop Knowledge Base relationship expansion
       6. Indexed full-text fallback where linked KB evidence is absent

   OUTPUT:
       One row per story, containing all 12 dimension evidence packages.

   IMPORTANT:
       Append this after the existing assessment_stories CTE.
       Do not replace or rerun the existing assessment query.
   ======================================================================== */

WITH assessment_source AS MATERIALIZED
(
    SELECT *
    FROM requirements.user_stories 
    where user_story_id ='US-001'
),

/* ========================================================================
   1. NORMALISE STORY REFERENCES
   The existing story query can expose JSON arrays as JSONB or as
   JSON-encoded text. This handles both representations.
   ======================================================================== */

story_normalized AS MATERIALIZED
(
    SELECT
        s.*,

        CASE
            WHEN jsonb_typeof(to_jsonb(s) -> 'functional_requirement_ids') = 'array'
                THEN to_jsonb(s) -> 'functional_requirement_ids'
            WHEN jsonb_typeof(to_jsonb(s) -> 'functional_requirement_ids') = 'string'
                THEN COALESCE(
                    NULLIF(to_jsonb(s) ->> 'functional_requirement_ids', '')::jsonb,
                    '[]'::jsonb
                )
            ELSE '[]'::jsonb
        END AS fr_ids_json,

        CASE
            WHEN jsonb_typeof(to_jsonb(s) -> 'business_requirement_ids') = 'array'
                THEN to_jsonb(s) -> 'business_requirement_ids'
            WHEN jsonb_typeof(to_jsonb(s) -> 'business_requirement_ids') = 'string'
                THEN COALESCE(
                    NULLIF(to_jsonb(s) ->> 'business_requirement_ids', '')::jsonb,
                    '[]'::jsonb
                )
            ELSE '[]'::jsonb
        END AS br_ids_json,

        CASE
            WHEN jsonb_typeof(to_jsonb(s) -> 'business_objects') = 'array'
                THEN to_jsonb(s) -> 'business_objects'
            WHEN jsonb_typeof(to_jsonb(s) -> 'business_objects') = 'string'
                THEN COALESCE(
                    NULLIF(to_jsonb(s) ->> 'business_objects', '')::jsonb,
                    '[]'::jsonb
                )
            ELSE '[]'::jsonb
        END AS objects_json,

        CASE
            WHEN jsonb_typeof(to_jsonb(s) -> 'actor') = 'array'
                THEN to_jsonb(s) -> 'actor'
            WHEN jsonb_typeof(to_jsonb(s) -> 'actor') = 'string'
                THEN COALESCE(
                    NULLIF(to_jsonb(s) ->> 'actor', '')::jsonb,
                    '[]'::jsonb
                )
            ELSE '[]'::jsonb
        END AS actors_json

    FROM assessment_source s
),

story_keys AS MATERIALIZED
(
    SELECT
        sn.*,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(sn.fr_ids_json) AS x(value)
            WHERE NULLIF(BTRIM(x.value), '') IS NOT NULL
        ) AS fr_ids,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(sn.br_ids_json) AS x(value)
            WHERE NULLIF(BTRIM(x.value), '') IS NOT NULL
        ) AS br_ids,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(sn.objects_json) AS x(value)
            WHERE NULLIF(BTRIM(x.value), '') IS NOT NULL
        ) AS object_names,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(sn.actors_json) AS x(value)
            WHERE NULLIF(BTRIM(x.value), '') IS NOT NULL
        ) AS actor_names

    FROM story_normalized sn
),

/* ========================================================================
   2. DIRECT FUNCTIONAL REQUIREMENTS
   Indexed lookup using functional_requirement_id.
   ======================================================================== */

story_functional_requirements AS MATERIALIZED
(
    SELECT
        sk.user_story_id,
        fr.functional_requirement_pk,
        fr.functional_requirement_id,
        fr.name,
        fr.description,
        fr.status,
        fr.source_file_id,
        fr.raw_payload

    FROM story_keys sk

    JOIN requirements.functional_requirements fr
      ON fr.functional_requirement_id = ANY(sk.fr_ids)
),

/* ========================================================================
   3. BUSINESS REQUIREMENTS
   Retrieve both:
       - Explicit story BR references
       - BRs structurally linked to the story's FRs
   ======================================================================== */

story_business_requirements AS MATERIALIZED
(
    SELECT DISTINCT
        sk.user_story_id,
        br.business_requirement_pk,
        br.business_requirement_id,
        br.name,
        br.business_requirement,
        br.business_objective,
        br.business_value,
        br.success_measures,
        br.priority,
        br.stakeholders,
        br.policies_and_constraints,
        br.assumptions,
        br.risks_and_dependencies,
        br.validation_status,
        br.approval_status,
        br.raw_payload

    FROM story_keys sk

    JOIN requirements.business_requirements br
      ON br.business_requirement_id = ANY(sk.br_ids)

    UNION

    SELECT DISTINCT
        sfr.user_story_id,
        br.business_requirement_pk,
        br.business_requirement_id,
        br.name,
        br.business_requirement,
        br.business_objective,
        br.business_value,
        br.success_measures,
        br.priority,
        br.stakeholders,
        br.policies_and_constraints,
        br.assumptions,
        br.risks_and_dependencies,
        br.validation_status,
        br.approval_status,
        br.raw_payload

    FROM story_functional_requirements sfr

    JOIN requirements.requirement_relationships rr
      ON rr.functional_requirement_pk = sfr.functional_requirement_pk

    JOIN requirements.business_requirements br
      ON br.business_requirement_pk = rr.business_requirement_pk
),

/* ========================================================================
   4. BUSINESS RULES
   Retrieve rules using:
       - Related functional requirement IDs
       - Actor references
       - Business-object references

   Include generation-unit context so the evaluator can see the rule's
   originating unit and its associated FR/BR/actor/object references.
   ======================================================================== */

story_business_rules AS MATERIALIZED
(
    SELECT DISTINCT
        sk.user_story_id,

        r.business_rule_pk,
        r.generation_run_id,
        r.unit_id,

        r.name,
        r.statement,
        r.type,
        r.condition,
        r.exceptions,
        r.actors,
        r.objects,
        r.enforcement,
        r.severity,
        r.if_violated,
        r.rationale,
        r.parameters,
        r.related_functional_requirements,
        r.knowledge_record_ids,
        r.basis,
        r.review_status,
        r.raw_payload AS original_rule_payload,

        u.unit_kind,
        u.title AS unit_title,
        u.brief AS unit_brief,
        u.statements AS unit_statement_assignments,
        u.functional_requirement_ids AS unit_functional_requirements,
        u.business_requirement_id AS unit_business_requirement_id,
        u.actor_ids AS unit_actor_ids,
        u.object_ids AS unit_object_ids,
        u.raw_payload AS original_unit_payload

    FROM story_keys sk

    JOIN business_rule_discovery.business_rules r
      ON
         EXISTS
         (
             SELECT 1
             FROM jsonb_array_elements_text(
                 CASE
                     WHEN jsonb_typeof(r.related_functional_requirements) = 'array'
                         THEN r.related_functional_requirements
                     ELSE '[]'::jsonb
                 END
             ) AS fr(value)
             WHERE fr.value = ANY(sk.fr_ids)
         )

         OR COALESCE(r.actors, '[]'::jsonb) ?| sk.actor_names

         OR COALESCE(r.objects, '[]'::jsonb) ?| sk.object_names

    LEFT JOIN business_rule_discovery.generation_units u
      ON u.generation_run_id = r.generation_run_id
     AND u.unit_id = r.unit_id
),

/* ========================================================================
   5. KNOWLEDGE BASE — DIRECT RECORD LINKS
   Business Rule Discovery records retain knowledge_record_ids.
   Resolve those IDs directly against knowledge_records.record_id.
   ======================================================================== */

story_direct_kb_ids AS MATERIALIZED
(
    SELECT DISTINCT
        sbr.user_story_id,
        kb_id.value AS record_id

    FROM story_business_rules sbr

    CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
            WHEN jsonb_typeof(sbr.knowledge_record_ids) = 'array'
                THEN sbr.knowledge_record_ids
            ELSE '[]'::jsonb
        END
    ) AS kb_id(value)

    WHERE NULLIF(BTRIM(kb_id.value), '') IS NOT NULL
),

/* ========================================================================
   6. KNOWLEDGE BASE — ONE-HOP RELATIONSHIP EXPANSION

   Include:
       - Directly linked records
       - Records connected through from_record_id
       - Records connected through target_record_id

   Uses indexed relationship endpoints.
   ======================================================================== */

story_expanded_kb_ids AS MATERIALIZED
(
    SELECT
        user_story_id,
        record_id,
        'DIRECT_BUSINESS_RULE_LINK'::text AS retrieval_method

    FROM story_direct_kb_ids

    UNION

    SELECT
        d.user_story_id,
        kr.target_record_id AS record_id,
        'OUTBOUND_RELATIONSHIP'::text AS retrieval_method

    FROM story_direct_kb_ids d

    JOIN public.knowledge_relationships kr
      ON kr.from_record_id = d.record_id

    WHERE kr.target_record_id IS NOT NULL

    UNION

    SELECT
        d.user_story_id,
        kr.from_record_id AS record_id,
        'INBOUND_RELATIONSHIP'::text AS retrieval_method

    FROM story_direct_kb_ids d

    JOIN public.knowledge_relationships kr
      ON kr.target_record_id = d.record_id
),

story_linked_kb AS MATERIALIZED
(
    SELECT DISTINCT
        e.user_story_id,
        e.record_id,
        e.retrieval_method,

        kr.record_type,
        kr.source_stage,
        kr.source_file,
        kr.section,
        kr.semantic_category,
        kr.content,
        kr.searchable_text

    FROM story_expanded_kb_ids e

    JOIN public.knowledge_records kr
      ON kr.record_id = e.record_id
),

/* ========================================================================
   7. INDEXED SEMANTIC FALLBACK

   Only search stories that have no directly linked/expanded KB records.

   Uses:
       knowledge_search.search_vector
       idx_kb_search_vector (GIN)

   This avoids repeatedly scanning knowledge_records.searchable_text.
   ======================================================================== */

story_semantic_kb AS MATERIALIZED
(
    SELECT
        sk.user_story_id,
        hit.record_id,
        'INDEXED_FULL_TEXT_FALLBACK'::text AS retrieval_method,

        kr.record_type,
        kr.source_stage,
        kr.source_file,
        kr.section,
        kr.semantic_category,
        kr.content,
        kr.searchable_text,

        hit.rank

    FROM story_keys sk

    CROSS JOIN LATERAL
    (
        SELECT
            websearch_to_tsquery(
                'english',
                CONCAT_WS(
                    ' ',
                    sk.user_story_title,
                    sk.user_story_description,
                    sk.user_goal,
                    array_to_string(sk.object_names, ' ')
                )
            ) AS query
    ) q

    CROSS JOIN LATERAL
    (
        SELECT
            ks.record_id,
            ts_rank_cd(ks.search_vector, q.query) AS rank

        FROM public.knowledge_search ks

        WHERE q.query IS NOT NULL
          AND numnode(q.query) > 0
          AND ks.search_vector @@ q.query

        ORDER BY
            ts_rank_cd(ks.search_vector, q.query) DESC

        LIMIT 12
    ) hit

    JOIN public.knowledge_records kr
      ON kr.record_id = hit.record_id

    WHERE NOT EXISTS
    (
        SELECT 1
        FROM story_linked_kb lk
        WHERE lk.user_story_id = sk.user_story_id
    )
),

/* ========================================================================
   8. COMBINED KNOWLEDGE BASE EVIDENCE
   Direct and relationship-linked evidence takes precedence.
   Semantic fallback is used only when linked KB evidence is absent.
   ======================================================================== */

story_kb_evidence AS MATERIALIZED
(
    SELECT
        user_story_id,
        record_id,
        retrieval_method,
        record_type,
        source_stage,
        source_file,
        section,
        semantic_category,
        content,
        searchable_text,
        NULL::real AS semantic_rank

    FROM story_linked_kb

    UNION ALL

    SELECT
        user_story_id,
        record_id,
        retrieval_method,
        record_type,
        source_stage,
        source_file,
        section,
        semantic_category,
        content,
        searchable_text,
        rank AS semantic_rank

    FROM story_semantic_kb
),

/* ========================================================================
   9. AGGREGATE EVIDENCE ONCE PER STORY
   This evidence is reused by the 12 dimensions.
   ======================================================================== */

story_fr_json AS
(
    SELECT
        user_story_id,

        jsonb_agg(
            jsonb_build_object(
                'functional_requirement_id', functional_requirement_id,
                'name', name,
                'description', description,
                'status', status,
                'source_file_id', source_file_id,
                'raw_payload', raw_payload
            )
            ORDER BY functional_requirement_id
        ) AS functional_requirements

    FROM story_functional_requirements
    GROUP BY user_story_id
),

story_br_json AS
(
    SELECT
        user_story_id,

        jsonb_agg(
            jsonb_build_object(
                'business_requirement_id', business_requirement_id,
                'name', name,
                'business_requirement', business_requirement,
                'business_objective', business_objective,
                'business_value', business_value,
                'success_measures', success_measures,
                'priority', priority,
                'stakeholders', stakeholders,
                'policies_and_constraints', policies_and_constraints,
                'assumptions', assumptions,
                'risks_and_dependencies', risks_and_dependencies,
                'validation_status', validation_status,
                'approval_status', approval_status,
                'raw_payload', raw_payload
            )
            ORDER BY business_requirement_id
        ) AS business_requirements

    FROM story_business_requirements
    GROUP BY user_story_id
),

story_rules_json AS
(
    SELECT
        user_story_id,

        jsonb_agg(
            jsonb_build_object(
                'business_rule_pk', business_rule_pk,
                'generation_run_id', generation_run_id,
                'unit_id', unit_id,
                'name', name,
                'statement', statement,
                'type', type,
                'condition', condition,
                'exceptions', exceptions,
                'actors', actors,
                'objects', objects,
                'enforcement', enforcement,
                'severity', severity,
                'if_violated', if_violated,
                'rationale', rationale,
                'parameters', parameters,
                'related_functional_requirements', related_functional_requirements,
                'knowledge_record_ids', knowledge_record_ids,
                'basis', basis,
                'review_status', review_status,
                'unit_context', jsonb_build_object(
                    'unit_kind', unit_kind,
                    'unit_title', unit_title,
                    'unit_brief', unit_brief,
                    'unit_statement_assignments', unit_statement_assignments,
                    'unit_functional_requirements', unit_functional_requirements,
                    'unit_business_requirement_id', unit_business_requirement_id,
                    'unit_actor_ids', unit_actor_ids,
                    'unit_object_ids', unit_object_ids
                ),
                'original_rule_payload', original_rule_payload,
                'original_unit_payload', original_unit_payload
            )
            ORDER BY business_rule_pk
        ) AS business_rules

    FROM story_business_rules
    GROUP BY user_story_id
),

story_kb_json AS
(
    SELECT
        user_story_id,

        jsonb_agg(
            jsonb_build_object(
                'record_id', record_id,
                'retrieval_method', retrieval_method,
                'record_type', record_type,
                'source_stage', source_stage,
                'source_file', source_file,
                'section', section,
                'semantic_category', semantic_category,
                'content', content,
                'searchable_text', searchable_text,
                'semantic_rank', semantic_rank
            )
            ORDER BY
                CASE retrieval_method
                    WHEN 'DIRECT_BUSINESS_RULE_LINK' THEN 1
                    WHEN 'OUTBOUND_RELATIONSHIP' THEN 2
                    WHEN 'INBOUND_RELATIONSHIP' THEN 3
                    ELSE 4
                END,
                record_id
        ) AS knowledge_base_records

    FROM story_kb_evidence
    GROUP BY user_story_id
),

/* ========================================================================
   10. DIMENSION-SPECIFIC EVIDENCE PACKAGES

   Actor is deliberately not a separate dimension.
   Actor information remains available as story context and evidence.
   ======================================================================== */

story_evidence AS
(
    SELECT
        sk.*,

        COALESCE(frj.functional_requirements, '[]'::jsonb)
            AS functional_requirement_evidence,

        COALESCE(brj.business_requirements, '[]'::jsonb)
            AS business_requirement_evidence,

        COALESCE(rj.business_rules, '[]'::jsonb)
            AS business_rule_evidence,

        COALESCE(kbj.knowledge_base_records, '[]'::jsonb)
            AS knowledge_base_evidence

    FROM story_keys sk

    LEFT JOIN story_fr_json frj
      ON frj.user_story_id = sk.user_story_id

    LEFT JOIN story_br_json brj
      ON brj.user_story_id = sk.user_story_id

    LEFT JOIN story_rules_json rj
      ON rj.user_story_id = sk.user_story_id

    LEFT JOIN story_kb_json kbj
      ON kbj.user_story_id = sk.user_story_id
),

dimension_packages AS
(
    SELECT
        se.user_story_id,

        jsonb_build_object(

            /* ------------------------------------------------------------
               1. USER GOAL
               ------------------------------------------------------------ */
            'user_goal',
            jsonb_build_object(
                'existing_story_content',
                    jsonb_build_object(
                        'title', se.user_story_title,
                        'description', se.user_story_description,
                        'user_goal', se.user_goal,
                        'business_value', se.business_value
                    ),
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_requirements',
                    se.business_requirement_evidence,
                'actors',
                    to_jsonb(se.actor_names),
                'business_objects',
                    to_jsonb(se.object_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               2. PRECONDITIONS
               ------------------------------------------------------------ */
            'preconditions',
            jsonb_build_object(
                'existing_preconditions', se.preconditions,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence,
                'business_requirements',
                    se.business_requirement_evidence,
                'actors_and_permissions',
                    to_jsonb(se.actor_names),
                'business_objects',
                    to_jsonb(se.object_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               3. POSTCONDITIONS
               ------------------------------------------------------------ */
            'postconditions',
            jsonb_build_object(
                'existing_postconditions', se.postconditions,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence,
                'business_requirements',
                    se.business_requirement_evidence,
                'business_objects',
                    to_jsonb(se.object_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               4. TRIGGER
               ------------------------------------------------------------ */
            'trigger',
            jsonb_build_object(
                'existing_trigger', se.trigger,
                'story_description', se.user_story_description,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'actors',
                    to_jsonb(se.actor_names),
                'business_objects',
                    to_jsonb(se.object_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               5. MAIN FLOW
               ------------------------------------------------------------ */
            'main_flow',
            jsonb_build_object(
                'existing_main_flow', se.main_flow,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence,
                'actors',
                    to_jsonb(se.actor_names),
                'business_objects',
                    to_jsonb(se.object_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               6. ALTERNATIVE FLOWS
               ------------------------------------------------------------ */
            'alternative_flows',
            jsonb_build_object(
                'existing_alternative_flows', se.alternative_flows,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence,
                'business_objects',
                    to_jsonb(se.object_names),
                'actors_and_permissions',
                    to_jsonb(se.actor_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               7. EXCEPTION FLOWS
               ------------------------------------------------------------ */
            'exception_flows',
            jsonb_build_object(
                'existing_exception_flows', se.exception_flows,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence,
                'business_requirements',
                    se.business_requirement_evidence,
                'actors_and_permissions',
                    to_jsonb(se.actor_names),
                'business_objects',
                    to_jsonb(se.object_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               8. ACCEPTANCE CRITERIA
               ------------------------------------------------------------ */
            'acceptance_criteria',
            jsonb_build_object(
                'existing_acceptance_criteria', se.acceptance_criteria,
                'user_goal', se.user_goal,
                'preconditions', se.preconditions,
                'postconditions', se.postconditions,
                'main_flow', se.main_flow,
                'alternative_flows', se.alternative_flows,
                'exception_flows', se.exception_flows,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence
            ),

            /* ------------------------------------------------------------
               9. GIVEN-WHEN-THEN
               ------------------------------------------------------------ */
            'given_when_then',
            jsonb_build_object(
                'existing_given_when_then', se.given_when_then,
                'acceptance_criteria', se.acceptance_criteria,
                'preconditions', se.preconditions,
                'main_flow', se.main_flow,
                'alternative_flows', se.alternative_flows,
                'exception_flows', se.exception_flows,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence
            ),

            /* ------------------------------------------------------------
               10. BUSINESS RULES
               ------------------------------------------------------------ */
            'business_rules',
            jsonb_build_object(
                'existing_story_business_rules', se.business_rules,
                'discovered_repository_business_rules',
                    se.business_rule_evidence,
                'functional_requirement_rule_context',
                    se.functional_requirement_evidence,
                'business_requirement_context',
                    se.business_requirement_evidence,
                'business_objects',
                    to_jsonb(se.object_names),
                'actors',
                    to_jsonb(se.actor_names),
                'knowledge_evidence',
                    se.knowledge_base_evidence
            ),

            /* ------------------------------------------------------------
               11. SUCCESS CRITERIA
               ------------------------------------------------------------ */
            'success_criteria',
            jsonb_build_object(
                'existing_success_criteria', se.success_criteria,
                'business_value', se.business_value,
                'business_requirements',
                    se.business_requirement_evidence,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'acceptance_criteria', se.acceptance_criteria,
                'postconditions', se.postconditions
            ),

            /* ------------------------------------------------------------
               12. DIRECT DEPENDENCIES
               ------------------------------------------------------------ */
            'direct_dependencies',
            jsonb_build_object(
                'existing_dependencies', se.dependencies,
                'functional_requirements',
                    se.functional_requirement_evidence,
                'business_requirements',
                    se.business_requirement_evidence,
                'business_rules',
                    se.business_rule_evidence,
                'business_objects',
                    to_jsonb(se.object_names),
                'actors',
                    to_jsonb(se.actor_names),
                'knowledge_relationship_evidence',
                    se.knowledge_base_evidence
            )

        ) AS dimension_evidence

    FROM story_evidence se
)

/* ========================================================================
   FINAL RESULT
   One row per assessed story.
   Existing assessment fields are preserved.
   All 12 dimension evidence packages are supplied to the evaluator.
   ======================================================================== */

SELECT
    se.*,

    dp.dimension_evidence,

    jsonb_build_object(
        'functional_requirements',
            se.functional_requirement_evidence,

        'business_requirements',
            se.business_requirement_evidence,

        'business_rules',
            se.business_rule_evidence,

        'knowledge_base_records',
            se.knowledge_base_evidence
    ) AS consolidated_evidence,

    jsonb_build_object(
        'functional_requirement_count',
            jsonb_array_length(se.functional_requirement_evidence),

        'business_requirement_count',
            jsonb_array_length(se.business_requirement_evidence),

        'business_rule_count',
            jsonb_array_length(se.business_rule_evidence),

        'knowledge_record_count',
            jsonb_array_length(se.knowledge_base_evidence),

        'retrieval_status',
            CASE
                WHEN jsonb_array_length(se.functional_requirement_evidence) > 0
                  OR jsonb_array_length(se.business_requirement_evidence) > 0
                  OR jsonb_array_length(se.business_rule_evidence) > 0
                  OR jsonb_array_length(se.knowledge_base_evidence) > 0
                    THEN 'REPOSITORY_EVIDENCE_AVAILABLE'
                ELSE 'NO_REPOSITORY_EVIDENCE_FOUND'
            END
    ) AS evidence_summary

FROM story_evidence se

JOIN dimension_packages dp
  ON dp.user_story_id = se.user_story_id

ORDER BY
    se.feature_id,
    se.user_story_id;