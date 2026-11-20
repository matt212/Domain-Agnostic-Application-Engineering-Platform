 /* =====================================================================
   DETERMINISTIC USER STORY ASSESSMENT
   PostgreSQL

   SOURCE:
       user_story_assessment_report

   ASSESSMENT:
       1. Acceptance criteria: populated / empty counts per story
       2. Acceptance criteria reuse: identical criteria across stories
       3. Given / When / Then: missing components and repeated scenarios
       4. Success criteria: missing / repeated / inherited criteria
       5. Business rules: linked rule counts and stories without rules
       6. Functional execution behaviour: populated / empty fields
       7. Dependencies: direct dependencies and existing constraint context
       8. Overall findings: counts, percentages, IDs and field-level results

   METHOD:
       Deterministic PostgreSQL checks only.
       No LLM assessment.
       No subjective quality assessment.
       No changes to the source table.

   OUTPUT:
       One JSON report.

   IMPORTANT:
       Execute in the same session where the source temporary table exists.
   ===================================================================== */

WITH

/* =====================================================================
   0. SOURCE
   ===================================================================== */

assessment_source AS (
    SELECT *
    FROM assessment_stories
),

/* =====================================================================
   1. ACCEPTANCE CRITERIA
   ===================================================================== */

acceptance_criteria_items AS (
    SELECT
        s.user_story_id,
        x.ordinality AS criterion_number,
        x.item AS criterion,

        CASE
            WHEN x.item IS NULL OR x.item = 'null'::jsonb
                THEN FALSE

            WHEN jsonb_typeof(x.item) = 'string'
                THEN NULLIF(BTRIM(x.item #>> '{}'), '') IS NOT NULL

            WHEN jsonb_typeof(x.item) = 'object'
                THEN x.item <> '{}'::jsonb

            WHEN jsonb_typeof(x.item) = 'array'
                THEN x.item <> '[]'::jsonb

            ELSE TRUE
        END AS is_populated

    FROM assessment_source s

    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(s.acceptance_criteria) = 'array'
                THEN s.acceptance_criteria

            WHEN s.acceptance_criteria IS NULL
              OR s.acceptance_criteria = 'null'::jsonb
                THEN '[]'::jsonb

            ELSE jsonb_build_array(s.acceptance_criteria)
        END
    ) WITH ORDINALITY AS x(item, ordinality)
),

acceptance_criteria_counts AS (
    SELECT
        s.user_story_id,

        COUNT(x.criterion_number) AS total_criteria,

        COUNT(x.criterion_number)
            FILTER (WHERE x.is_populated) AS populated_criteria,

        COUNT(x.criterion_number)
            FILTER (WHERE NOT x.is_populated) AS empty_criteria

    FROM assessment_source s

    LEFT JOIN acceptance_criteria_items x
        ON x.user_story_id = s.user_story_id

    GROUP BY s.user_story_id
),

acceptance_criteria_duplicates AS (
    SELECT
        criterion,
        COUNT(DISTINCT user_story_id) AS story_count,

        ARRAY_AGG(
            DISTINCT user_story_id
            ORDER BY user_story_id
        ) AS affected_story_ids

    FROM acceptance_criteria_items

    WHERE is_populated

    GROUP BY criterion

    HAVING COUNT(DISTINCT user_story_id) > 1
),

/* =====================================================================
   2. GIVEN / WHEN / THEN
   ===================================================================== */

gwt_items AS (
    SELECT
        s.user_story_id,
        x.ordinality AS scenario_number,
        x.item AS scenario,

        NULLIF(BTRIM(x.item ->> 'given'), '') IS NOT NULL
            AS given_populated,

        NULLIF(BTRIM(x.item ->> 'when'), '') IS NOT NULL
            AS when_populated,

        NULLIF(BTRIM(x.item ->> 'then'), '') IS NOT NULL
            AS then_populated

    FROM assessment_source s

    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(s.given_when_then) = 'array'
                THEN s.given_when_then

            WHEN s.given_when_then IS NULL
              OR s.given_when_then = 'null'::jsonb
                THEN '[]'::jsonb

            ELSE jsonb_build_array(s.given_when_then)
        END
    ) WITH ORDINALITY AS x(item, ordinality)
),

gwt_counts AS (
    SELECT
        s.user_story_id,

        COUNT(g.scenario_number) AS total_scenarios,

        COUNT(g.scenario_number)
            FILTER (WHERE g.given_populated) AS populated_given,

        COUNT(g.scenario_number)
            FILTER (WHERE g.when_populated) AS populated_when,

        COUNT(g.scenario_number)
            FILTER (WHERE g.then_populated) AS populated_then,

        COUNT(g.scenario_number)
            FILTER (WHERE NOT g.given_populated) AS missing_given,

        COUNT(g.scenario_number)
            FILTER (WHERE NOT g.when_populated) AS missing_when,

        COUNT(g.scenario_number)
            FILTER (WHERE NOT g.then_populated) AS missing_then,

        COUNT(g.scenario_number)
            FILTER (
                WHERE NOT (
                    g.given_populated
                    AND g.when_populated
                    AND g.then_populated
                )
            ) AS incomplete_scenarios

    FROM assessment_source s

    LEFT JOIN gwt_items g
        ON g.user_story_id = s.user_story_id

    GROUP BY s.user_story_id
),

gwt_duplicates AS (
    SELECT
        scenario -> 'given' AS given_component,
        scenario -> 'when' AS when_component,
        scenario -> 'then' AS then_component,

        COUNT(DISTINCT user_story_id) AS story_count,

        ARRAY_AGG(
            DISTINCT user_story_id
            ORDER BY user_story_id
        ) AS affected_story_ids

    FROM gwt_items

    WHERE given_populated
      AND when_populated
      AND then_populated

    GROUP BY
        scenario -> 'given',
        scenario -> 'when',
        scenario -> 'then'

    HAVING COUNT(DISTINCT user_story_id) > 1
),

/* =====================================================================
   3. SUCCESS CRITERIA
   ===================================================================== */

success_criteria_items AS (
    SELECT
        s.user_story_id,
        x.ordinality AS criterion_number,
        x.item AS criterion,

        COALESCE(
            x.item ->> 'context_scope',
            s.source_references
                -> 'mapping_assessment'
                ->> 'success_criteria_scope',
            'UNSPECIFIED'
        ) AS context_scope,

        CASE
            WHEN x.item IS NULL OR x.item = 'null'::jsonb
                THEN FALSE

            WHEN jsonb_typeof(x.item) = 'string'
                THEN NULLIF(BTRIM(x.item #>> '{}'), '') IS NOT NULL

            WHEN jsonb_typeof(x.item) = 'object'
                THEN x.item <> '{}'::jsonb

            WHEN jsonb_typeof(x.item) = 'array'
                THEN x.item <> '[]'::jsonb

            ELSE TRUE
        END AS is_populated

    FROM assessment_source s

    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(s.success_criteria) = 'array'
                THEN s.success_criteria

            WHEN s.success_criteria IS NULL
              OR s.success_criteria = 'null'::jsonb
                THEN '[]'::jsonb

            ELSE jsonb_build_array(s.success_criteria)
        END
    ) WITH ORDINALITY AS x(item, ordinality)
),

success_criteria_counts AS (
    SELECT
        s.user_story_id,

        COUNT(x.criterion_number) AS total_criteria,

        COUNT(x.criterion_number)
            FILTER (WHERE x.is_populated) AS populated_criteria,

        COUNT(x.criterion_number)
            FILTER (WHERE NOT x.is_populated) AS empty_criteria,

        COUNT(x.criterion_number)
            FILTER (
                WHERE x.is_populated
                  AND x.context_scope LIKE 'INHERITED%'
            ) AS inherited_criteria,

        COUNT(x.criterion_number)
            FILTER (
                WHERE x.is_populated
                  AND x.context_scope NOT LIKE 'INHERITED%'
            ) AS non_inherited_criteria

    FROM assessment_source s

    LEFT JOIN success_criteria_items x
        ON x.user_story_id = s.user_story_id

    GROUP BY s.user_story_id
),

success_criteria_duplicates AS (
    SELECT
        criterion
            - 'business_requirement_id'
            - 'business_requirement_name'
            - 'semantic_validation_status'
            - 'context_scope' AS normalized_criterion,

        COUNT(DISTINCT user_story_id) AS story_count,

        ARRAY_AGG(
            DISTINCT user_story_id
            ORDER BY user_story_id
        ) AS affected_story_ids,

        ARRAY_AGG(
            DISTINCT context_scope
            ORDER BY context_scope
        ) AS context_scopes

    FROM success_criteria_items

    WHERE is_populated

    GROUP BY
        criterion
            - 'business_requirement_id'
            - 'business_requirement_name'
            - 'semantic_validation_status'
            - 'context_scope'

    HAVING COUNT(DISTINCT user_story_id) > 1
),

/* =====================================================================
   4. BUSINESS RULES
   ===================================================================== */

business_rule_counts AS (
    SELECT
        s.user_story_id,

        COUNT(x.ordinality) AS linked_business_rule_count,

        COALESCE(
            jsonb_agg(x.item ORDER BY x.ordinality)
                FILTER (WHERE x.ordinality IS NOT NULL),
            '[]'::jsonb
        ) AS linked_business_rules

    FROM assessment_source s

    LEFT JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(s.business_rules) = 'array'
                THEN s.business_rules

            WHEN s.business_rules IS NULL
              OR s.business_rules = 'null'::jsonb
                THEN '[]'::jsonb

            ELSE jsonb_build_array(s.business_rules)
        END
    ) WITH ORDINALITY AS x(item, ordinality)
        ON TRUE

    GROUP BY s.user_story_id
),

/* =====================================================================
   5. FUNCTIONAL EXECUTION BEHAVIOUR
   ===================================================================== */

functional_fields AS (
    SELECT
        s.user_story_id,
        f.field_name,
        f.field_value,

        CASE
            WHEN f.field_value IS NULL
              OR f.field_value = 'null'::jsonb
                THEN FALSE

            WHEN jsonb_typeof(f.field_value) = 'string'
                THEN NULLIF(BTRIM(f.field_value #>> '{}'), '') IS NOT NULL

            WHEN jsonb_typeof(f.field_value) = 'array'
                THEN f.field_value <> '[]'::jsonb

            WHEN jsonb_typeof(f.field_value) = 'object'
                THEN f.field_value <> '{}'::jsonb

            ELSE TRUE
        END AS is_populated

    FROM assessment_source s

    CROSS JOIN LATERAL (
        VALUES
            ('user_goal', TO_JSONB(s.user_goal)),
            ('preconditions', s.preconditions),
            ('postconditions', s.postconditions),
            ('trigger', TO_JSONB(s.trigger)),
            ('main_flow', s.main_flow),
            ('alternative_flows', s.alternative_flows),
            ('exception_flows', s.exception_flows)
    ) AS f(field_name, field_value)
),

functional_field_summary AS (
    SELECT
        user_story_id,

        COUNT(*) FILTER (
            WHERE is_populated
        ) AS populated_functional_fields,

        COUNT(*) FILTER (
            WHERE NOT is_populated
        ) AS empty_functional_fields,

        ARRAY_AGG(
            field_name ORDER BY field_name
        ) FILTER (
            WHERE NOT is_populated
        ) AS empty_field_names

    FROM functional_fields

    GROUP BY user_story_id
),

functional_field_totals AS (
    SELECT
        field_name,

        COUNT(*) AS total_stories,

        COUNT(*) FILTER (
            WHERE is_populated
        ) AS populated_stories,

        COUNT(*) FILTER (
            WHERE NOT is_populated
        ) AS empty_stories,

        ARRAY_AGG(
            user_story_id ORDER BY user_story_id
        ) FILTER (
            WHERE NOT is_populated
        ) AS affected_story_ids

    FROM functional_fields

    GROUP BY field_name
),

/* =====================================================================
   6. DEPENDENCIES AND EXISTING CONSTRAINT INFORMATION
   ===================================================================== */

dependency_counts AS (
    SELECT
        s.user_story_id,

        COUNT(d.ordinality) AS direct_dependency_count,

        COALESCE(
            jsonb_agg(d.item ORDER BY d.ordinality)
                FILTER (WHERE d.ordinality IS NOT NULL),
            '[]'::jsonb
        ) AS direct_dependencies,

        CASE
            WHEN jsonb_typeof(s.constraints -> 'assumptions') = 'array'
                THEN s.constraints -> 'assumptions'
            WHEN s.constraints -> 'assumptions' IS NULL
              OR s.constraints -> 'assumptions' = 'null'::jsonb
                THEN '[]'::jsonb
            ELSE jsonb_build_array(s.constraints -> 'assumptions')
        END AS assumptions,

        CASE
            WHEN jsonb_typeof(
                s.constraints -> 'risks_and_dependencies'
            ) = 'array'
                THEN s.constraints -> 'risks_and_dependencies'
            WHEN s.constraints -> 'risks_and_dependencies' IS NULL
              OR s.constraints -> 'risks_and_dependencies' = 'null'::jsonb
                THEN '[]'::jsonb
            ELSE jsonb_build_array(
                s.constraints -> 'risks_and_dependencies'
            )
        END AS risks_and_dependencies,

        CASE
            WHEN jsonb_typeof(
                s.constraints -> 'policies_and_constraints'
            ) = 'array'
                THEN s.constraints -> 'policies_and_constraints'
            WHEN s.constraints -> 'policies_and_constraints' IS NULL
              OR s.constraints -> 'policies_and_constraints' = 'null'::jsonb
                THEN '[]'::jsonb
            ELSE jsonb_build_array(
                s.constraints -> 'policies_and_constraints'
            )
        END AS policies_and_constraints

    FROM assessment_source s

    LEFT JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(s.dependencies) = 'array'
                THEN s.dependencies

            WHEN s.dependencies IS NULL
              OR s.dependencies = 'null'::jsonb
                THEN '[]'::jsonb

            ELSE jsonb_build_array(s.dependencies)
        END
    ) WITH ORDINALITY AS d(item, ordinality)
        ON TRUE

    GROUP BY
        s.user_story_id,
        s.constraints
),

/* =====================================================================
   7. PER-STORY RESULTS
   ===================================================================== */

per_story AS (
    SELECT
        s.user_story_id,

        /* Acceptance criteria */
        ac.total_criteria AS acceptance_criteria_total,
        ac.populated_criteria AS acceptance_criteria_populated,
        ac.empty_criteria AS acceptance_criteria_empty,

        /* GWT */
        g.total_scenarios AS gwt_scenario_count,
        g.populated_given AS given_populated,
        g.populated_when AS when_populated,
        g.populated_then AS then_populated,
        g.missing_given,
        g.missing_when,
        g.missing_then,
        g.incomplete_scenarios,

        /* Success criteria */
        sc.total_criteria AS success_criteria_total,
        sc.populated_criteria AS success_criteria_populated,
        sc.empty_criteria AS success_criteria_empty,
        sc.inherited_criteria,
        sc.non_inherited_criteria,

        /* Business rules */
        br.linked_business_rule_count,
        br.linked_business_rules,

        /* Functional fields */
        ff.populated_functional_fields,
        ff.empty_functional_fields,
        COALESCE(
            TO_JSONB(ff.empty_field_names),
            '[]'::jsonb
        ) AS empty_functional_field_names,

        /* Dependencies */
        dc.direct_dependency_count,
        dc.direct_dependencies,
        dc.assumptions,
        dc.risks_and_dependencies,
        dc.policies_and_constraints

    FROM assessment_source s

    JOIN acceptance_criteria_counts ac
        ON ac.user_story_id = s.user_story_id

    JOIN gwt_counts g
        ON g.user_story_id = s.user_story_id

    JOIN success_criteria_counts sc
        ON sc.user_story_id = s.user_story_id

    JOIN business_rule_counts br
        ON br.user_story_id = s.user_story_id

    JOIN functional_field_summary ff
        ON ff.user_story_id = s.user_story_id

    JOIN dependency_counts dc
        ON dc.user_story_id = s.user_story_id
),

/* =====================================================================
   8. OVERALL SUMMARY
   ===================================================================== */

overall_summary AS (
    SELECT
        COUNT(*) AS total_stories_analysed,

        COUNT(*) FILTER (
            WHERE acceptance_criteria_total = 0
        ) AS stories_without_acceptance_criteria,

        SUM(acceptance_criteria_populated)
            AS total_populated_acceptance_criteria,

        SUM(acceptance_criteria_empty)
            AS total_empty_acceptance_criteria,

        COUNT(*) FILTER (
            WHERE acceptance_criteria_empty > 0
        ) AS stories_with_empty_acceptance_criteria,

        COUNT(*) FILTER (
            WHERE gwt_scenario_count = 0
        ) AS stories_without_gwt,

        COUNT(*) FILTER (
            WHERE incomplete_scenarios > 0
        ) AS stories_with_incomplete_gwt,

        SUM(gwt_scenario_count) AS total_gwt_scenarios,

        SUM(missing_given) AS total_missing_given,
        SUM(missing_when) AS total_missing_when,
        SUM(missing_then) AS total_missing_then,

        COUNT(*) FILTER (
            WHERE success_criteria_total = 0
        ) AS stories_without_success_criteria,

        SUM(success_criteria_populated)
            AS total_populated_success_criteria,

        SUM(success_criteria_empty)
            AS total_empty_success_criteria,

        COUNT(*) FILTER (
            WHERE inherited_criteria > 0
        ) AS stories_with_inherited_success_criteria,

        SUM(inherited_criteria) AS total_inherited_success_criteria,

        SUM(non_inherited_criteria)
            AS total_non_inherited_success_criteria,

        COUNT(*) FILTER (
            WHERE linked_business_rule_count = 0
        ) AS stories_without_business_rules,

        SUM(linked_business_rule_count)
            AS total_linked_business_rules,

        COUNT(*) FILTER (
            WHERE empty_functional_fields > 0
        ) AS stories_with_empty_functional_fields,

        SUM(empty_functional_fields)
            AS total_empty_functional_fields,

        SUM(populated_functional_fields)
            AS total_populated_functional_fields,

        COUNT(*) FILTER (
            WHERE direct_dependency_count = 0
        ) AS stories_without_direct_dependencies,

        SUM(direct_dependency_count)
            AS total_direct_dependencies

    FROM per_story
),

/* =====================================================================
   9. REPORT
   ===================================================================== */

report AS (
    SELECT
        jsonb_build_object(

            /* ---------------------------------------------------------
               METADATA
               --------------------------------------------------------- */

            'report_metadata',
            jsonb_build_object(
                'report_name',
                    'Deterministic PostgreSQL User Story Assessment',
                'source_table',
                    'user_story_assessment_report',
                'assessment_method',
                    'PostgreSQL deterministic structural and exact-match checks',
                'llm_assessment_performed',
                    FALSE,
                'source_repository_modified',
                    FALSE,
                'generated_at',
                    CURRENT_TIMESTAMP
            ),

            /* ---------------------------------------------------------
               SUMMARY
               --------------------------------------------------------- */

            'summary',
            jsonb_build_object(

                'total_stories_analysed',
                    os.total_stories_analysed,

                'acceptance_criteria',
                    jsonb_build_object(
                        'stories_without_acceptance_criteria',
                            os.stories_without_acceptance_criteria,
                        'stories_with_empty_acceptance_criteria',
                            os.stories_with_empty_acceptance_criteria,
                        'total_populated_criteria',
                            os.total_populated_acceptance_criteria,
                        'total_empty_criteria',
                            os.total_empty_acceptance_criteria
                    ),

                'given_when_then',
                    jsonb_build_object(
                        'stories_without_gwt',
                            os.stories_without_gwt,
                        'stories_with_incomplete_gwt',
                            os.stories_with_incomplete_gwt,
                        'total_scenarios',
                            os.total_gwt_scenarios,
                        'missing_given_components',
                            os.total_missing_given,
                        'missing_when_components',
                            os.total_missing_when,
                        'missing_then_components',
                            os.total_missing_then
                    ),

                'success_criteria',
                    jsonb_build_object(
                        'stories_without_success_criteria',
                            os.stories_without_success_criteria,
                        'total_populated_criteria',
                            os.total_populated_success_criteria,
                        'total_empty_criteria',
                            os.total_empty_success_criteria,
                        'stories_with_inherited_success_criteria',
                            os.stories_with_inherited_success_criteria,
                        'total_inherited_criteria',
                            os.total_inherited_success_criteria,
                        'total_non_inherited_criteria',
                            os.total_non_inherited_success_criteria
                    ),

                'business_rules',
                    jsonb_build_object(
                        'stories_without_business_rules',
                            os.stories_without_business_rules,
                        'total_linked_business_rules',
                            os.total_linked_business_rules
                    ),

                'functional_execution_behaviour',
                    jsonb_build_object(
                        'stories_with_empty_functional_fields',
                            os.stories_with_empty_functional_fields,
                        'total_populated_fields',
                            os.total_populated_functional_fields,
                        'total_empty_fields',
                            os.total_empty_functional_fields
                    ),

                'dependencies',
                    jsonb_build_object(
                        'stories_without_direct_dependencies',
                            os.stories_without_direct_dependencies,
                        'total_direct_dependencies',
                            os.total_direct_dependencies
                    )
            ),

            /* ---------------------------------------------------------
               PERCENTAGES
               --------------------------------------------------------- */

            'percentages',
            jsonb_build_object(

                'stories_without_acceptance_criteria',
                    ROUND(
                        100.0 * os.stories_without_acceptance_criteria
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_with_empty_acceptance_criteria',
                    ROUND(
                        100.0 * os.stories_with_empty_acceptance_criteria
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_without_gwt',
                    ROUND(
                        100.0 * os.stories_without_gwt
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_with_incomplete_gwt',
                    ROUND(
                        100.0 * os.stories_with_incomplete_gwt
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_without_success_criteria',
                    ROUND(
                        100.0 * os.stories_without_success_criteria
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_with_inherited_success_criteria',
                    ROUND(
                        100.0 * os.stories_with_inherited_success_criteria
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_without_business_rules',
                    ROUND(
                        100.0 * os.stories_without_business_rules
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_with_empty_functional_fields',
                    ROUND(
                        100.0 * os.stories_with_empty_functional_fields
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    ),

                'stories_without_direct_dependencies',
                    ROUND(
                        100.0 * os.stories_without_direct_dependencies
                        / NULLIF(os.total_stories_analysed, 0),
                        2
                    )
            ),

            /* ---------------------------------------------------------
               ACCEPTANCE CRITERIA REUSE
               --------------------------------------------------------- */

            'acceptance_criteria_reuse',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'criterion', d.criterion,
                            'story_count', d.story_count,
                            'affected_story_ids', d.affected_story_ids
                        )
                        ORDER BY d.story_count DESC
                    )
                    FROM acceptance_criteria_duplicates d
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               REPEATED GWT SCENARIOS
               --------------------------------------------------------- */

            'repeated_gwt_scenarios',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'given', d.given_component,
                            'when', d.when_component,
                            'then', d.then_component,
                            'story_count', d.story_count,
                            'affected_story_ids', d.affected_story_ids
                        )
                        ORDER BY d.story_count DESC
                    )
                    FROM gwt_duplicates d
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               SUCCESS CRITERIA REUSE
               --------------------------------------------------------- */

            'success_criteria_reuse',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'criterion', d.normalized_criterion,
                            'story_count', d.story_count,
                            'affected_story_ids', d.affected_story_ids,
                            'context_scopes', d.context_scopes
                        )
                        ORDER BY d.story_count DESC
                    )
                    FROM success_criteria_duplicates d
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               FUNCTIONAL FIELD-LEVEL TOTALS
               --------------------------------------------------------- */

            'functional_field_results',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'field_name', f.field_name,
                            'total_stories', f.total_stories,
                            'populated_stories', f.populated_stories,
                            'empty_stories', f.empty_stories,
                            'populated_percentage',
                                ROUND(
                                    100.0 * f.populated_stories
                                    / NULLIF(f.total_stories, 0),
                                    2
                                ),
                            'empty_percentage',
                                ROUND(
                                    100.0 * f.empty_stories
                                    / NULLIF(f.total_stories, 0),
                                    2
                                ),
                            'affected_story_ids',
                                COALESCE(
                                    TO_JSONB(f.affected_story_ids),
                                    '[]'::jsonb
                                )
                        )
                        ORDER BY f.field_name
                    )
                    FROM functional_field_totals f
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               STORIES WITHOUT ACCEPTANCE CRITERIA
               --------------------------------------------------------- */

            'stories_without_acceptance_criteria',
            COALESCE(
                (
                    SELECT jsonb_agg(p.user_story_id ORDER BY p.user_story_id)
                    FROM per_story p
                    WHERE p.acceptance_criteria_total = 0
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               STORIES WITH EMPTY ACCEPTANCE CRITERIA
               --------------------------------------------------------- */

            'stories_with_empty_acceptance_criteria',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'user_story_id', p.user_story_id,
                            'total_criteria', p.acceptance_criteria_total,
                            'populated_criteria', p.acceptance_criteria_populated,
                            'empty_criteria', p.acceptance_criteria_empty
                        )
                        ORDER BY p.user_story_id
                    )
                    FROM per_story p
                    WHERE p.acceptance_criteria_empty > 0
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               STORIES WITH MISSING OR INCOMPLETE GWT
               --------------------------------------------------------- */

            'stories_with_missing_or_incomplete_gwt',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'user_story_id', p.user_story_id,
                            'scenario_count', p.gwt_scenario_count,
                            'missing_given', p.missing_given,
                            'missing_when', p.missing_when,
                            'missing_then', p.missing_then,
                            'incomplete_scenarios', p.incomplete_scenarios
                        )
                        ORDER BY p.user_story_id
                    )
                    FROM per_story p
                    WHERE p.gwt_scenario_count = 0
                       OR p.incomplete_scenarios > 0
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               STORIES WITH MISSING SUCCESS CRITERIA
               --------------------------------------------------------- */

            'stories_without_success_criteria',
            COALESCE(
                (
                    SELECT jsonb_agg(p.user_story_id ORDER BY p.user_story_id)
                    FROM per_story p
                    WHERE p.success_criteria_total = 0
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               INHERITED SUCCESS CRITERIA
               --------------------------------------------------------- */

            'stories_with_inherited_success_criteria',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'user_story_id', p.user_story_id,
                            'total_success_criteria', p.success_criteria_total,
                            'inherited_criteria', p.inherited_criteria,
                            'non_inherited_criteria', p.non_inherited_criteria
                        )
                        ORDER BY p.user_story_id
                    )
                    FROM per_story p
                    WHERE p.inherited_criteria > 0
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               STORIES WITHOUT BUSINESS RULES
               --------------------------------------------------------- */

            'stories_without_business_rules',
            COALESCE(
                (
                    SELECT jsonb_agg(p.user_story_id ORDER BY p.user_story_id)
                    FROM per_story p
                    WHERE p.linked_business_rule_count = 0
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               STORIES WITHOUT DIRECT DEPENDENCIES
               --------------------------------------------------------- */

            'stories_without_direct_dependencies',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'user_story_id', p.user_story_id,
                            'direct_dependency_count',
                                p.direct_dependency_count,
                            'direct_dependencies',
                                p.direct_dependencies,
                            'assumptions',
                                p.assumptions,
                            'risks_and_dependencies',
                                p.risks_and_dependencies,
                            'policies_and_constraints',
                                p.policies_and_constraints
                        )
                        ORDER BY p.user_story_id
                    )
                    FROM per_story p
                    WHERE p.direct_dependency_count = 0
                ),
                '[]'::jsonb
            ),

            /* ---------------------------------------------------------
               COMPLETE PER-STORY RESULTS
               --------------------------------------------------------- */

            'per_story',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'user_story_id',
                                p.user_story_id,

                            'acceptance_criteria',
                                jsonb_build_object(
                                    'total', p.acceptance_criteria_total,
                                    'populated', p.acceptance_criteria_populated,
                                    'empty', p.acceptance_criteria_empty
                                ),

                            'given_when_then',
                                jsonb_build_object(
                                    'scenario_count', p.gwt_scenario_count,
                                    'given_populated', p.given_populated,
                                    'when_populated', p.when_populated,
                                    'then_populated', p.then_populated,
                                    'missing_given', p.missing_given,
                                    'missing_when', p.missing_when,
                                    'missing_then', p.missing_then,
                                    'incomplete_scenarios',
                                        p.incomplete_scenarios
                                ),

                            'success_criteria',
                                jsonb_build_object(
                                    'total', p.success_criteria_total,
                                    'populated', p.success_criteria_populated,
                                    'empty', p.success_criteria_empty,
                                    'inherited', p.inherited_criteria,
                                    'non_inherited', p.non_inherited_criteria
                                ),

                            'business_rules',
                                jsonb_build_object(
                                    'linked_rule_count',
                                        p.linked_business_rule_count,
                                    'linked_rules',
                                        p.linked_business_rules
                                ),

                            'functional_execution_behaviour',
                                jsonb_build_object(
                                    'populated_fields',
                                        p.populated_functional_fields,
                                    'empty_fields',
                                        p.empty_functional_fields,
                                    'empty_field_names',
                                        p.empty_functional_field_names
                                ),

                            'dependencies',
                                jsonb_build_object(
                                    'direct_dependency_count',
                                        p.direct_dependency_count,
                                    'direct_dependencies',
                                        p.direct_dependencies,
                                    'assumptions',
                                        p.assumptions,
                                    'risks_and_dependencies',
                                        p.risks_and_dependencies,
                                    'policies_and_constraints',
                                        p.policies_and_constraints
                                )
                        )
                        ORDER BY p.user_story_id
                    )
                    FROM per_story p
                ),
                '[]'::jsonb
            )

        ) AS assessment_report

    FROM overall_summary os
)

/* =====================================================================
   FINAL OUTPUT
   ===================================================================== */

SELECT
    assessment_report
FROM report;