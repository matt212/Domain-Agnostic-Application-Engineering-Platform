--retrieve the underlying Business Requirements for each candidate, including their IDs, descriptions, business values, success measures, actors, constraints, assumptions, risks and dependencies.
-- That will let us validate the Epic boundaries against actual evidence rather than title similarity.
--- THIS IS IMPORTANT EPIC GENERATION SQL SCRIPT

WITH business_requirement_groups AS (
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
        br.stakeholders,
        br.success_measures,
        br.priority,
        br.policies_and_constraints,
        br.assumptions,
        br.risks_and_dependencies,
        br.linked_functional_requirements,
        br.validation_status,
        br.approval_status,
        br.raw_payload,
        sf.file_name AS source_file,
        sf.source_version
    FROM numbered_epics ne
    CROSS JOIN LATERAL UNNEST(ne.business_requirement_pks) AS selected_br(business_requirement_pk)
    JOIN requirements.business_requirements br
        ON br.business_requirement_pk = selected_br.business_requirement_pk
    LEFT JOIN requirements.source_files sf
        ON sf.source_file_id = br.source_file_id
)

SELECT
    epic_id,
    epic_title,

    business_requirement_pk,
    business_requirement_id,
    business_requirement_name,
    business_requirement,

    business_objective,
    business_value,
    success_measures,

    stakeholders,
    priority,

    policies_and_constraints,
    assumptions,
    risks_and_dependencies,

    linked_functional_requirements,

    validation_status,
    approval_status,

    source_file,
    source_version,

    raw_payload

FROM epic_business_requirements
ORDER BY
    epic_id,
    business_requirement_id;

----END HERE 
--
/*
===============================================================================
QUERY: EPIC EVIDENCE ENRICHMENT AND COMPLETION ASSESSMENT
===============================================================================

PURPOSE:
    Groups Business Requirements into Epics and enriches each Epic with
    supporting evidence from the Requirements Repository.

FUNCTIONAL SCOPE:
    1. Generate Epic IDs and titles from grouped Business Objectives.
    2. Retrieve the underlying Business Requirement details.
    3. Resolve linked Functional Requirement IDs into complete FR records.
    4. Retrieve explicit BR-FR relationship evidence.
    5. Retrieve Business Requirement validation findings and run details.
    6. Retrieve consolidation findings, decisions and overlap assessments.
    7. Retrieve associated alternative requirement records.
    8. Assemble supporting source references and traceability information.
    9. Construct evidence-based content for all nine Epic sections.
   10. Assess section completion using repository evidence.

EPIC SECTIONS:
    1. Epic ID and title
    2. Business problem or opportunity
    3. Business outcome
    4. Scope and boundaries
    5. Actors and stakeholders
    6. Capabilities covered
    7. Business value and success measures
    8. Constraints, risks and dependencies
    9. Supporting references

COMPLETION ASSESSMENT:
    Evaluates evidence availability and traceability for each Epic section.
    Functional coverage is established through linked FR records and
    BR-FR relationships. Formal business capability classification is
    not implied unless supported by repository data.

DATA INTEGRITY:
    - Read-only query; no repository records are modified.
    - Original BR validation and approval statuses are preserved.
    - Missing evidence is not fabricated.
    - Source files, versions and requirement references are retained.
    - Evidence completeness does not imply business approval or validation.

OUTPUT:
    One enriched record per Epic, including its nine-section completion
    summary, supporting evidence and functional requirement coverage counts.

SOURCE:
    PostgreSQL database: demodb
    Schema: requirements

===============================================================================
*/
WITH epic_results AS (

   

WITH business_requirement_groups AS (
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
        br.stakeholders,
        br.success_measures,
        br.priority,
        br.policies_and_constraints,
        br.assumptions,
        br.risks_and_dependencies,
        br.linked_functional_requirements,
        br.validation_status,
        br.approval_status,
        br.raw_payload AS br_raw_payload,

        sf.source_file_id AS br_source_file_id,
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

/* ---------------------------------------------------------
   1. Expand linked FR identifiers from the BR JSONB array
   --------------------------------------------------------- */

linked_fr_ids AS (
    SELECT DISTINCT
        e.epic_id,
        e.business_requirement_pk,
        e.business_requirement_id,

        CASE
            WHEN jsonb_typeof(fr_item.value) = 'string'
                THEN fr_item.value #>> '{}'

            WHEN jsonb_typeof(fr_item.value) = 'object'
                THEN COALESCE(
                    fr_item.value ->> 'functional_requirement_id',
                    fr_item.value ->> 'requirement_id',
                    fr_item.value ->> 'id'
                )

            ELSE NULL
        END AS functional_requirement_id

    FROM epic_business_requirements e

    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(e.linked_functional_requirements) = 'array'
                THEN e.linked_functional_requirements
            ELSE '[]'::JSONB
        END
    ) AS fr_item(value)
),

/* ---------------------------------------------------------
   2. Retrieve complete linked FR records and their sources
   --------------------------------------------------------- */

functional_requirement_evidence AS (
    SELECT
        l.epic_id,
        l.business_requirement_pk,
        l.business_requirement_id,
        l.functional_requirement_id,

        fr.functional_requirement_pk,
        fr.name AS functional_requirement_name,
        fr.description AS functional_requirement_description,
        fr.status AS functional_requirement_status,
        fr.raw_payload AS fr_raw_payload,

        fr_sf.source_file_id AS fr_source_file_id,
        fr_sf.file_name AS fr_source_file,
        fr_sf.source_version AS fr_source_version

    FROM linked_fr_ids l

    LEFT JOIN requirements.functional_requirements fr
        ON fr.functional_requirement_id =
           l.functional_requirement_id

    LEFT JOIN requirements.source_files fr_sf
        ON fr_sf.source_file_id = fr.source_file_id

    WHERE l.functional_requirement_id IS NOT NULL
),

/* ---------------------------------------------------------
   3. Retrieve explicit BR-FR relationship evidence
   --------------------------------------------------------- */

relationship_evidence AS (
    SELECT
        e.epic_id,
        rr.relationship_id,
        rr.relationship_type,
        rr.relationship_status,
        rr.evidence,

        fr.functional_requirement_id

    FROM epic_business_requirements e

    JOIN requirements.requirement_relationships rr
        ON rr.business_requirement_pk =
           e.business_requirement_pk

    JOIN requirements.functional_requirements fr
        ON fr.functional_requirement_pk =
           rr.functional_requirement_pk
),

/* ---------------------------------------------------------
   4. Validation findings and their associated runs
   --------------------------------------------------------- */

validation_evidence AS (
    SELECT
        e.epic_id,

        vf.validation_finding_id,
        vf.validation_run_id,
        vf.requirement_id,
        vf.dimension,
        vf.severity,
        vf.finding,
        vf.evidence,
        vf.recommendation,
        vf.raw_finding,

        vr.validation_version,
        vr.validator,
        vr.validation_method,
        vr.validation_status AS validation_run_status,
        vr.total_requirements,
        vr.pass_count,
        vr.review_count,
        vr.fail_count,
        vr.validation_summary,
        vr.validated_at

    FROM epic_business_requirements e

    JOIN requirements.br_validation_findings vf
        ON (
            vf.business_requirement_pk =
                e.business_requirement_pk

            OR vf.requirement_id =
                e.business_requirement_id
        )

    LEFT JOIN requirements.br_validation_runs vr
        ON vr.validation_run_id = vf.validation_run_id
),

/* ---------------------------------------------------------
   5. Consolidation findings
   --------------------------------------------------------- */

consolidation_finding_evidence AS (
    SELECT
        e.epic_id,

        cf.consolidation_finding_id,
        cf.consolidation_run_id,
        cf.requirement_id,
        cf.finding_type,
        cf.severity,
        cf.field_name,
        cf.consolidated_value,
        cf.work_file_value,
        cf.finding_description,
        cf.recommendation,
        cf.raw_finding,

        cr.consolidation_method,
        cr.consolidation_status,
        cr.consolidation_summary

    FROM epic_business_requirements e

    JOIN requirements.br_consolidation_findings cf
        ON cf.requirement_id =
           e.business_requirement_id

    LEFT JOIN requirements.br_consolidation_runs cr
        ON cr.consolidation_run_id =
           cf.consolidation_run_id
),

/* ---------------------------------------------------------
   6. Consolidation decisions
   --------------------------------------------------------- */

consolidation_decision_evidence AS (
    SELECT
        e.epic_id,

        cd.decision_id,
        cd.business_requirement_id,
        cd.decision,
        cd.decision_reason,
        cd.related_business_requirement_ids,
        cd.decided_by,
        cd.decided_at,
        cd.decision_metadata

    FROM epic_business_requirements e

    JOIN requirements.br_consolidation_decisions cd
        ON cd.business_requirement_id =
           e.business_requirement_id
),

/* ---------------------------------------------------------
   7. Overlap assessments involving the BR
   --------------------------------------------------------- */

overlap_evidence AS (
    SELECT
        e.epic_id,

        op.overlap_pair_id,
        op.consolidation_run_id,
        op.business_requirement_1,
        op.business_requirement_2,
        op.overlap_type,
        op.overlap_status,
        op.reason,
        op.overlapping_scope,
        op.recommendation,
        op.raw_assessment

    FROM epic_business_requirements e

    JOIN requirements.br_overlap_pairs op
        ON (
            op.business_requirement_1 =
                e.business_requirement_id

            OR op.business_requirement_2 =
                e.business_requirement_id
        )
),

/* ---------------------------------------------------------
   8. Alternatives associated with the BR
   --------------------------------------------------------- */

alternative_evidence AS (
    SELECT
        e.epic_id,

        ba.alternative_id,
        ba.business_requirement_id,
        ba.alternative_type,
        ba.alternative_name,
        ba.alternative_description,
        ba.rationale,
        ba.source_finding_ids,
        ba.alternative_status,
        ba.raw_payload

    FROM epic_business_requirements e

    JOIN requirements.br_alternatives ba
        ON ba.business_requirement_id =
           e.business_requirement_id
),

/* ---------------------------------------------------------
   9. Aggregate FR evidence per Epic
   --------------------------------------------------------- */

fr_summary AS (
    SELECT
        e.epic_id,

        COUNT(DISTINCT l.functional_requirement_id)
            AS linked_fr_count,

        COUNT(DISTINCT f.functional_requirement_id)
            FILTER (
                WHERE f.functional_requirement_pk IS NOT NULL
            ) AS resolved_fr_count,

        COUNT(DISTINCT f.functional_requirement_id)
            FILTER (
                WHERE f.functional_requirement_pk IS NOT NULL
                  AND NULLIF(TRIM(f.functional_requirement_name), '') IS NOT NULL
                  AND NULLIF(TRIM(f.functional_requirement_description), '') IS NOT NULL
            ) AS complete_fr_detail_count,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'functional_requirement_id',
                        f.functional_requirement_id,
                    'functional_requirement_pk',
                        f.functional_requirement_pk,
                    'name',
                        f.functional_requirement_name,
                    'description',
                        f.functional_requirement_description,
                    'status',
                        f.functional_requirement_status,
                    'source_file_id',
                        f.fr_source_file_id,
                    'source_file',
                        f.fr_source_file,
                    'source_version',
                        f.fr_source_version,
                    'raw_payload',
                        f.fr_raw_payload
                )
            ) FILTER (
                WHERE f.functional_requirement_pk IS NOT NULL
            ),
            '[]'::JSONB
        ) AS linked_functional_requirement_details,

        COALESCE(
            JSONB_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'functional_requirement_id',
                        l.functional_requirement_id,
                    'resolution_status',
                        CASE
                            WHEN f.functional_requirement_pk IS NOT NULL
                                THEN 'RESOLVED'
                            ELSE 'UNRESOLVED'
                        END
                )
            ) FILTER (
                WHERE l.functional_requirement_id IS NOT NULL
            ),
            '[]'::JSONB
        ) AS linked_fr_resolution

    FROM epic_business_requirements e

    LEFT JOIN linked_fr_ids l
        ON l.business_requirement_pk =
           e.business_requirement_pk

    LEFT JOIN functional_requirement_evidence f
        ON f.business_requirement_pk =
           e.business_requirement_pk
       AND f.functional_requirement_id =
           l.functional_requirement_id

    GROUP BY e.epic_id
),

/* ---------------------------------------------------------
   10. Aggregate relationship evidence
   --------------------------------------------------------- */

relationship_summary AS (
    SELECT
        e.epic_id,

        COUNT(DISTINCT r.relationship_id)
            AS relationship_count,

        COALESCE(
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'relationship_id', r.relationship_id,
                    'functional_requirement_id', r.functional_requirement_id,
                    'relationship_type', r.relationship_type,
                    'relationship_status', r.relationship_status,
                    'evidence', r.evidence
                )
            ) FILTER (
                WHERE r.relationship_id IS NOT NULL
            ),
            '[]'::JSONB
        ) AS relationship_details

    FROM epic_business_requirements e

    LEFT JOIN relationship_evidence r
        ON r.epic_id = e.epic_id

    GROUP BY e.epic_id
)

/* =========================================================
   FINAL ENRICHED EPIC OUTPUT
   ========================================================= */

SELECT
    e.epic_id,
    e.epic_title,

    e.business_requirement_pk,
    e.business_requirement_id,
    e.business_requirement_name,

    /* =====================================================
       EPIC SECTION 1: ID AND TITLE
       ===================================================== */

    'COMPLETED' AS epic_id_title_status,

    /* =====================================================
       EPIC SECTION 2: BUSINESS PROBLEM / OPPORTUNITY
       ===================================================== */

    e.business_requirement AS business_problem_or_opportunity,

    CASE
        WHEN NULLIF(TRIM(e.business_requirement), '') IS NOT NULL
            THEN 'COMPLETED'
        ELSE 'INCOMPLETE'
    END AS business_problem_status,

    /* =====================================================
       EPIC SECTION 3: BUSINESS OUTCOME
       ===================================================== */

    e.business_objective AS business_outcome,

    CASE
        WHEN NULLIF(TRIM(e.business_objective), '') IS NOT NULL
            THEN 'COMPLETED'
        ELSE 'INCOMPLETE'
    END AS business_outcome_status,

    /* =====================================================
       EPIC SECTION 4: SCOPE AND BOUNDARIES
       ===================================================== */

    JSONB_BUILD_OBJECT(
        'business_requirement_scope',
            e.business_requirement,

        'business_requirement_name',
            e.business_requirement_name,

        'included_functional_requirements',
            fs.linked_functional_requirement_details,

        'policies_and_constraints',
            e.policies_and_constraints,

        'assumptions',
            e.assumptions,

        'risks_and_dependencies',
            e.risks_and_dependencies,

        'explicit_exclusions',
            CASE
                WHEN e.br_raw_payload ? 'scope_exclusions'
                    THEN e.br_raw_payload -> 'scope_exclusions'
                WHEN e.br_raw_payload ? 'exclusions'
                    THEN e.br_raw_payload -> 'exclusions'
                ELSE '[]'::JSONB
            END,

        'exclusion_documentation_status',
            CASE
                WHEN e.br_raw_payload ? 'scope_exclusions'
                  OR e.br_raw_payload ? 'exclusions'
                    THEN 'SOURCE_FIELD_AVAILABLE'
                ELSE 'NO_EXPLICIT_EXCLUSIONS_RECORDED'
            END
    ) AS epic_scope_and_boundaries,

    CASE
        WHEN NULLIF(TRIM(e.business_requirement), '') IS NOT NULL
         AND (
                fs.linked_fr_count > 0
                OR e.policies_and_constraints <> '[]'::JSONB
                OR e.assumptions <> '[]'::JSONB
                OR e.risks_and_dependencies <> '[]'::JSONB
             )
            THEN 'COMPLETED_WITH_DOCUMENTED_BOUNDARIES'
        ELSE 'INCOMPLETE'
    END AS scope_and_boundaries_status,

    /* =====================================================
       EPIC SECTION 5: ACTORS AND STAKEHOLDERS
       ===================================================== */

    e.stakeholders AS actors_and_stakeholders,

    CASE
        WHEN e.stakeholders <> '[]'::JSONB
            THEN 'COMPLETED'
        ELSE 'INCOMPLETE'
    END AS actors_and_stakeholders_status,

    /* =====================================================
       EPIC SECTION 6: CAPABILITIES COVERED
       ===================================================== */

    JSONB_BUILD_OBJECT(
        'coverage_basis',
            'LINKED_FUNCTIONAL_REQUIREMENTS',

        'functional_requirement_count',
            fs.linked_fr_count,

        'resolved_functional_requirement_count',
            fs.resolved_fr_count,

        'complete_functional_requirement_detail_count',
            fs.complete_fr_detail_count,

        'functional_requirements',
            fs.linked_functional_requirement_details,

        'relationship_count',
            rs.relationship_count,

        'relationships',
            rs.relationship_details,

        'capability_mapping_limitation',
            'Formal business capability mapping is not established by these repository tables. The returned FRs establish functional coverage, not necessarily formally classified business capabilities.'
    ) AS capabilities_covered,

    CASE
        WHEN fs.linked_fr_count > 0
         AND fs.linked_fr_count = fs.resolved_fr_count
         AND fs.linked_fr_count = fs.complete_fr_detail_count
            THEN 'COMPLETED_FUNCTIONAL_COVERAGE'

        ELSE 'INCOMPLETE_FUNCTIONAL_COVERAGE'
    END AS capabilities_covered_status,

    /* =====================================================
       EPIC SECTION 7: BUSINESS VALUE AND SUCCESS MEASURES
       ===================================================== */

    JSONB_BUILD_OBJECT(
        'business_value', e.business_value,
        'success_measures', e.success_measures,
        'priority', e.priority
    ) AS business_value_and_success_measures,

    CASE
        WHEN NULLIF(TRIM(e.business_value), '') IS NOT NULL
         AND e.success_measures <> '[]'::JSONB
            THEN 'COMPLETED'
        ELSE 'INCOMPLETE'
    END AS business_value_status,

    /* =====================================================
       EPIC SECTION 8: CONSTRAINTS, RISKS AND DEPENDENCIES
       ===================================================== */

    JSONB_BUILD_OBJECT(
        'policies_and_constraints', e.policies_and_constraints,
        'assumptions', e.assumptions,
        'risks_and_dependencies', e.risks_and_dependencies
    ) AS constraints_risks_and_dependencies,

    CASE
        WHEN e.policies_and_constraints <> '[]'::JSONB
          OR e.assumptions <> '[]'::JSONB
          OR e.risks_and_dependencies <> '[]'::JSONB
            THEN 'COMPLETED'
        ELSE 'INCOMPLETE'
    END AS constraints_status,

    /* =====================================================
       EPIC SECTION 9: SUPPORTING REFERENCES
       ===================================================== */

    JSONB_BUILD_OBJECT(

        'business_requirement_reference',
            JSONB_BUILD_OBJECT(
                'business_requirement_pk',
                    e.business_requirement_pk,
                'business_requirement_id',
                    e.business_requirement_id,
                'source_file_id',
                    e.br_source_file_id,
                'source_file',
                    e.br_source_file,
                'source_version',
                    e.br_source_version,
                'raw_payload',
                    e.br_raw_payload
            ),

        'functional_requirement_references',
            fs.linked_functional_requirement_details,

        'functional_requirement_resolution',
            fs.linked_fr_resolution,

        'relationship_references',
            rs.relationship_details,

        'validation_findings',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'validation_finding_id', v.validation_finding_id,
                            'validation_run_id', v.validation_run_id,
                            'dimension', v.dimension,
                            'severity', v.severity,
                            'finding', v.finding,
                            'evidence', v.evidence,
                            'recommendation', v.recommendation,
                            'run_status', v.validation_run_status,
                            'validation_version', v.validation_version,
                            'validation_summary', v.validation_summary
                        )
                    )
                    FROM validation_evidence v
                    WHERE v.epic_id = e.epic_id
                ),
                '[]'::JSONB
            ),

        'consolidation_findings',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'finding_id', c.consolidation_finding_id,
                            'finding_type', c.finding_type,
                            'severity', c.severity,
                            'field_name', c.field_name,
                            'finding_description', c.finding_description,
                            'recommendation', c.recommendation,
                            'consolidation_status', c.consolidation_status
                        )
                    )
                    FROM consolidation_finding_evidence c
                    WHERE c.epic_id = e.epic_id
                ),
                '[]'::JSONB
            ),

        'consolidation_decisions',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'decision_id', d.decision_id,
                            'decision', d.decision,
                            'decision_reason', d.decision_reason,
                            'related_business_requirement_ids',
                                d.related_business_requirement_ids,
                            'decided_by', d.decided_by,
                            'decided_at', d.decided_at
                        )
                    )
                    FROM consolidation_decision_evidence d
                    WHERE d.epic_id = e.epic_id
                ),
                '[]'::JSONB
            ),

        'overlap_assessments',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'overlap_pair_id', o.overlap_pair_id,
                            'business_requirement_1', o.business_requirement_1,
                            'business_requirement_2', o.business_requirement_2,
                            'overlap_type', o.overlap_type,
                            'overlap_status', o.overlap_status,
                            'reason', o.reason,
                            'overlapping_scope', o.overlapping_scope,
                            'recommendation', o.recommendation
                        )
                    )
                    FROM overlap_evidence o
                    WHERE o.epic_id = e.epic_id
                ),
                '[]'::JSONB
            ),

        'alternatives',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'alternative_id', a.alternative_id,
                            'alternative_type', a.alternative_type,
                            'alternative_name', a.alternative_name,
                            'alternative_description', a.alternative_description,
                            'rationale', a.rationale,
                            'alternative_status', a.alternative_status
                        )
                    )
                    FROM alternative_evidence a
                    WHERE a.epic_id = e.epic_id
                ),
                '[]'::JSONB
            )

    ) AS supporting_references,

    CASE
        WHEN e.br_source_file_id IS NOT NULL
         AND fs.linked_fr_count = fs.resolved_fr_count
            THEN 'COMPLETED_WITH_AVAILABLE_REPOSITORY_REFERENCES'
        ELSE 'INCOMPLETE_REFERENCE_TRACEABILITY'
    END AS supporting_references_status,

    /* =====================================================
       VALIDATION AND APPROVAL STATE
       ===================================================== */

    e.validation_status,
    e.approval_status,

    /* =====================================================
       COMPLETION SUMMARY
       ===================================================== */

    JSONB_BUILD_OBJECT(
        'section_1', 'COMPLETED',

        'section_2',
            CASE
                WHEN NULLIF(TRIM(e.business_requirement), '') IS NOT NULL
                    THEN 'COMPLETED'
                ELSE 'INCOMPLETE'
            END,

        'section_3',
            CASE
                WHEN NULLIF(TRIM(e.business_objective), '') IS NOT NULL
                    THEN 'COMPLETED'
                ELSE 'INCOMPLETE'
            END,

        'section_4',
            CASE
                WHEN NULLIF(TRIM(e.business_requirement), '') IS NOT NULL
                 AND (
                        fs.linked_fr_count > 0
                        OR e.policies_and_constraints <> '[]'::JSONB
                        OR e.assumptions <> '[]'::JSONB
                        OR e.risks_and_dependencies <> '[]'::JSONB
                     )
                    THEN 'COMPLETED_WITH_DOCUMENTED_BOUNDARIES'
                ELSE 'INCOMPLETE'
            END,

        'section_5',
            CASE
                WHEN e.stakeholders <> '[]'::JSONB
                    THEN 'COMPLETED'
                ELSE 'INCOMPLETE'
            END,

        'section_6',
            CASE
                WHEN fs.linked_fr_count > 0
                 AND fs.linked_fr_count = fs.resolved_fr_count
                 AND fs.linked_fr_count = fs.complete_fr_detail_count
                    THEN 'COMPLETED_FUNCTIONAL_COVERAGE'
                ELSE 'INCOMPLETE_FUNCTIONAL_COVERAGE'
            END,

        'section_7',
            CASE
                WHEN NULLIF(TRIM(e.business_value), '') IS NOT NULL
                 AND e.success_measures <> '[]'::JSONB
                    THEN 'COMPLETED'
                ELSE 'INCOMPLETE'
            END,

        'section_8',
            CASE
                WHEN e.policies_and_constraints <> '[]'::JSONB
                  OR e.assumptions <> '[]'::JSONB
                  OR e.risks_and_dependencies <> '[]'::JSONB
                    THEN 'COMPLETED'
                ELSE 'INCOMPLETE'
            END,

        'section_9',
            CASE
                WHEN e.br_source_file_id IS NOT NULL
                 AND fs.linked_fr_count = fs.resolved_fr_count
                    THEN 'COMPLETED_WITH_AVAILABLE_REPOSITORY_REFERENCES'
                ELSE 'INCOMPLETE_REFERENCE_TRACEABILITY'
            END
    ) AS epic_section_completion_summary,

    /* =====================================================
       SOURCE AND FR COUNTS
       ===================================================== */

    fs.linked_fr_count,
    fs.resolved_fr_count,
    fs.complete_fr_detail_count,
    rs.relationship_count,

    e.br_source_file,
    e.br_source_version

FROM epic_business_requirements e

LEFT JOIN fr_summary fs
    ON fs.epic_id = e.epic_id

LEFT JOIN relationship_summary rs
    ON rs.epic_id = e.epic_id

 )

SELECT
    epic_id,
    epic_title,
    epic_section_completion_summary ->> 'section_4'
        AS scope_and_boundaries,
    epic_section_completion_summary ->> 'section_6'
        AS capabilities_covered,
    epic_section_completion_summary ->> 'section_9'
        AS supporting_references,
    linked_fr_count,
    resolved_fr_count,
    complete_fr_detail_count,
    relationship_count
FROM epic_results
ORDER BY epic_id;   
    
    

