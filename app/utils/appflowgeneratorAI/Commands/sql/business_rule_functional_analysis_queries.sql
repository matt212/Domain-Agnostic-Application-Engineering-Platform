/*
===============================================================================
BUSINESS RULE DISCOVERY — DOMAIN-AGNOSTIC FUNCTIONAL ANALYSIS QUERIES
===============================================================================

Purpose
-------
This file contains read-only SQL queries for analysing the business-rule data
after it has been populated in the proposed business_rule_discovery schema.

The queries are domain-agnostic:
  - No business-domain terms are hardcoded.
  - No rule IDs, requirement IDs, actor names, object names, or unit IDs
    need to be supplied.
  - Queries discover the available data automatically.

Important distinction
---------------------
PostgreSQL can retrieve, compare, group, and structurally inspect the stored
business-rule data. It cannot reliably infer the meaning of arbitrary natural-
language rules. Semantic tasks such as deciding whether two rules contradict,
whether an exception overrides another rule, or whether a policy is logically
complete require a reasoning/evaluation layer (for example, an AI evaluator).

The SQL below therefore separates:
  1. Data-driven discovery and candidate identification (SQL).
  2. Semantic business interpretation and evaluation (AI/rule engine).

Assumed existing tables and columns
-----------------------------------
business_rule_discovery.business_rules
business_rule_discovery.generation_units
requirements.functional_requirements

This file assumes the proposed business_rule_discovery schema described in
the design discussion. It does not create or alter tables and does not add
foreign keys. It is intended to be run after the schema and data exist.

JSONB assumptions
-----------------
The queries treat actors, objects, and related_functional_requirements as
JSONB arrays. Defensive CASE expressions return an empty array when a value
is NULL or is not a JSON array.

The condition, exceptions, and parameters fields are returned as stored;
their internal shapes are not assumed to be uniform or executable.

No ingestion operations are included.
===============================================================================
*/


/* ============================================================================
   01. COMPLETE BUSINESS RULE INVENTORY
   ----------------------------------------------------------------------------
   Business question:
     What business policies/rules are currently stored?

   What it does:
     Returns every stored rule, across all available generation runs, with
     its conditions, exceptions, scope, enforcement, consequences, rationale,
     traceability, and review information.

   Why it matters:
     This is the complete rule population supplied to subsequent analysis.
     No generation ID or other filter is required.
   ============================================================================ */

SELECT
    r.business_rule_pk,
    r.generation_run_id,
    r.ingestion_run_id,
    r.unit_id,
    r.rule_position,
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
    r.review_comments,
    r.reviewed_by,
    r.reviewed_at
FROM business_rule_discovery.business_rules AS r
ORDER BY
    r.generation_run_id,
    r.unit_id,
    r.rule_position;


/* ============================================================================
   02. BUSINESS RULE LANDSCAPE
   ----------------------------------------------------------------------------
   Business question:
     What kinds of rules have been defined, and what is their overall
     distribution?

   What it does:
     Summarises rules by generation, rule type, severity, basis, and review
     status. Values are discovered from the data; no category list is imposed.

   Why it matters:
     Helps understand the policy landscape and identify concentrations or
     imbalances that may warrant further business review.
   ============================================================================ */

SELECT
    r.generation_run_id,
    COALESCE(r.type, '[NOT SPECIFIED]') AS rule_type,
    COALESCE(r.severity, '[NOT SPECIFIED]') AS severity,
    COALESCE(r.basis, '[NOT SPECIFIED]') AS rule_basis,
    COALESCE(r.review_status, '[NOT SPECIFIED]') AS review_status,
    COUNT(*) AS rule_count
FROM business_rule_discovery.business_rules AS r
GROUP BY
    r.generation_run_id,
    COALESCE(r.type, '[NOT SPECIFIED]'),
    COALESCE(r.severity, '[NOT SPECIFIED]'),
    COALESCE(r.basis, '[NOT SPECIFIED]'),
    COALESCE(r.review_status, '[NOT SPECIFIED]')
ORDER BY
    r.generation_run_id,
    rule_count DESC;


/* ============================================================================
   03. AUTOMATIC DISCOVERY OF RULE RELATIONSHIPS
   ----------------------------------------------------------------------------
   Business question:
     Which rules appear to govern overlapping business scope?

   What it does:
     Automatically compares every pair of rules within the same generation.
     It identifies shared actor identifiers, object identifiers, and
     functional-requirement identifiers from their JSONB arrays.

   Why it matters:
     Rules with overlapping scope are candidates for deeper analysis:
       - dependencies,
       - duplicated or overlapping policy,
       - precedence or override relationships,
       - possible contradictions.

   Important limitation:
     Shared scope does NOT prove that two rules are related or contradictory.
     This query identifies candidates for semantic evaluation.

   Technical note:
     JSONB does not support the SQL array overlap operator (&&). This query
     safely expands JSONB arrays and compares their elements.
   ============================================================================ */

WITH rule_scope AS (
    SELECT
        r.business_rule_pk,
        r.generation_run_id,
        r.name,
        r.statement,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(r.actors) = 'array'
                        THEN r.actors
                    ELSE '[]'::jsonb
                END
            ) AS x(value)
        ) AS actor_ids,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(r.objects) = 'array'
                        THEN r.objects
                    ELSE '[]'::jsonb
                END
            ) AS x(value)
        ) AS object_ids,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(r.related_functional_requirements) = 'array'
                        THEN r.related_functional_requirements
                    ELSE '[]'::jsonb
                END
            ) AS x(value)
        ) AS functional_requirement_ids

    FROM business_rule_discovery.business_rules AS r
),
rule_pairs AS (
    SELECT
        a.business_rule_pk AS rule_a_id,
        a.name AS rule_a_name,
        a.statement AS rule_a_statement,
        b.business_rule_pk AS rule_b_id,
        b.name AS rule_b_name,
        b.statement AS rule_b_statement,

        ARRAY(
            SELECT ax.value
            FROM unnest(a.actor_ids) AS ax(value)
            WHERE ax.value = ANY(b.actor_ids)
        ) AS shared_actors,

        ARRAY(
            SELECT ax.value
            FROM unnest(a.object_ids) AS ax(value)
            WHERE ax.value = ANY(b.object_ids)
        ) AS shared_objects,

        ARRAY(
            SELECT ax.value
            FROM unnest(a.functional_requirement_ids) AS ax(value)
            WHERE ax.value = ANY(b.functional_requirement_ids)
        ) AS shared_functional_requirements

    FROM rule_scope AS a
    JOIN rule_scope AS b
      ON b.generation_run_id = a.generation_run_id
     AND b.business_rule_pk > a.business_rule_pk
)
SELECT
    rule_a_id,
    rule_a_name,
    rule_b_id,
    rule_b_name,
    shared_actors,
    shared_objects,
    shared_functional_requirements,
    CASE
        WHEN cardinality(shared_actors) > 0
         AND cardinality(shared_objects) > 0
         AND cardinality(shared_functional_requirements) > 0
            THEN 'SHARED_ACTORS_OBJECTS_AND_REQUIREMENTS'
        WHEN cardinality(shared_actors) > 0
         AND cardinality(shared_objects) > 0
            THEN 'SHARED_ACTORS_AND_OBJECTS'
        WHEN cardinality(shared_objects) > 0
         AND cardinality(shared_functional_requirements) > 0
            THEN 'SHARED_OBJECTS_AND_REQUIREMENTS'
        WHEN cardinality(shared_actors) > 0
         AND cardinality(shared_functional_requirements) > 0
            THEN 'SHARED_ACTORS_AND_REQUIREMENTS'
        WHEN cardinality(shared_actors) > 0
            THEN 'SHARED_ACTORS'
        WHEN cardinality(shared_objects) > 0
            THEN 'SHARED_OBJECTS'
        ELSE 'SHARED_FUNCTIONAL_REQUIREMENTS'
    END AS relationship_candidate
FROM rule_pairs
WHERE
       cardinality(shared_actors) > 0
    OR cardinality(shared_objects) > 0
    OR cardinality(shared_functional_requirements) > 0
ORDER BY
    rule_a_id,
    rule_b_id;


/* ============================================================================
   04. RULE DEFINITION COMPLETENESS — REVIEW CANDIDATES
   ----------------------------------------------------------------------------
   Business question:
     Which rules may lack information needed for a person or system to
     understand, assess, or enforce them?

   What it does:
     Checks whether commonly important rule attributes are present:
       - applicability condition,
       - actor scope,
       - object scope,
       - enforcement description,
       - violation outcome,
       - rationale.

   Why it matters:
     A rule may be difficult to interpret or operationalise if key information
     is absent.

   Important limitation:
     This is a completeness screening, not a declaration that a rule is
     invalid. Some rules may legitimately have empty actor/object scope or
     may express conditions in the statement itself. Human/AI review is needed.
   ============================================================================ */

WITH rule_completeness AS (
    SELECT
        r.business_rule_pk,
        r.generation_run_id,
        r.unit_id,
        r.name,
        r.statement,

        ARRAY_REMOVE(ARRAY[
            CASE
                WHEN r.condition IS NULL
                  OR r.condition = 'null'::jsonb
                  OR r.condition = '{}'::jsonb
                THEN 'Applicability condition may be missing'
            END,

            CASE
                WHEN r.actors IS NULL
                  OR r.actors = '[]'::jsonb
                  OR r.actors = 'null'::jsonb
                THEN 'Actor scope may be missing'
            END,

            CASE
                WHEN r.objects IS NULL
                  OR r.objects = '[]'::jsonb
                  OR r.objects = 'null'::jsonb
                THEN 'Business-object scope may be missing'
            END,

            CASE
                WHEN r.enforcement IS NULL
                  OR BTRIM(r.enforcement) = ''
                THEN 'Enforcement description may be missing'
            END,

            CASE
                WHEN r.if_violated IS NULL
                  OR BTRIM(r.if_violated) = ''
                THEN 'Violation outcome may be missing'
            END,

            CASE
                WHEN r.rationale IS NULL
                  OR BTRIM(r.rationale) = ''
                THEN 'Business rationale may be missing'
            END
        ], NULL) AS review_findings

    FROM business_rule_discovery.business_rules AS r
)
SELECT
    business_rule_pk,
    generation_run_id,
    unit_id,
    name,
    statement,
    review_findings,
    cardinality(review_findings) AS finding_count
FROM rule_completeness
WHERE cardinality(review_findings) > 0
ORDER BY
    finding_count DESC,
    business_rule_pk;


/* ============================================================================
   05. EXACT DUPLICATE STATEMENT CANDIDATES
   ----------------------------------------------------------------------------
   Business question:
     Are identical rule statements stored more than once in the same
     generation?

   What it does:
     Normalises whitespace and letter case, then finds exact textual matches.

   Why it matters:
     Duplicate statements may indicate repeated generation, overlapping
     definitions, or intentional repetition.

   Important limitation:
     Different wording can express the same business policy. This query only
     finds exact matches after basic text normalisation; semantic duplicates
     require AI-assisted comparison. Do not automatically delete duplicates.
   ============================================================================ */

SELECT
    a.generation_run_id,
    a.business_rule_pk AS rule_a_id,
    a.unit_id AS rule_a_unit,
    a.name AS rule_a_name,
    a.statement AS rule_a_statement,
    b.business_rule_pk AS rule_b_id,
    b.unit_id AS rule_b_unit,
    b.name AS rule_b_name,
    b.statement AS rule_b_statement
FROM business_rule_discovery.business_rules AS a
JOIN business_rule_discovery.business_rules AS b
  ON b.generation_run_id = a.generation_run_id
 AND b.business_rule_pk > a.business_rule_pk
 AND LOWER(
        REGEXP_REPLACE(BTRIM(COALESCE(a.statement, '')), '\s+', ' ', 'g')
     )
     =
     LOWER(
        REGEXP_REPLACE(BTRIM(COALESCE(b.statement, '')), '\s+', ' ', 'g')
     )
WHERE
    BTRIM(COALESCE(a.statement, '')) <> ''
ORDER BY
    a.generation_run_id,
    a.business_rule_pk,
    b.business_rule_pk;


/* ============================================================================
   06. UNITS WITHOUT ANY STORED BUSINESS RULE
   ----------------------------------------------------------------------------
   Business question:
     Which generated units currently have no associated business-rule records?

   What it does:
     Compares all generation units with the rule records using generation_run_id
     and unit_id. No unit IDs are supplied.

   Why it matters:
     This can reveal units that were not given rule coverage.

   Important limitation:
     A unit without a rule is not automatically a defect. Some unit kinds may
     not be expected to produce business rules. Interpret the result in the
     context of unit_kind and the generation design.
   ============================================================================ */

SELECT
    u.generation_run_id,
    u.unit_id,
    u.unit_kind,
    u.title,
    u.brief,
    u.business_requirement_id,
    u.functional_requirement_ids,
    u.actor_ids,
    u.object_ids
FROM business_rule_discovery.generation_units AS u
WHERE NOT EXISTS (
    SELECT 1
    FROM business_rule_discovery.business_rules AS r
    WHERE r.generation_run_id = u.generation_run_id
      AND r.unit_id = u.unit_id
)
ORDER BY
    u.generation_run_id,
    u.unit_kind,
    u.unit_id;


/* ============================================================================
   07. FUNCTIONAL-REQUIREMENT GOVERNANCE COVERAGE
   ----------------------------------------------------------------------------
   Business question:
     Which functional requirements are referenced by stored business rules,
     and how many rules reference each one?

   What it does:
     Expands the related_functional_requirements JSONB arrays and joins the
     discovered identifiers to the existing Requirements Repository.

   Why it matters:
     Shows the rule-governance footprint across functional requirements.

   Schema assumption:
     requirements.functional_requirements.functional_requirement_id is the
     natural identifier, as established in the repository discussion.

   Important limitation:
     A reference count does not establish adequate governance. AI/business
     analysis must assess whether the linked rules actually address the
     requirement's intent. Requirements with no rule reference are not shown
     by this query; see the next query for those.
   ============================================================================ */

WITH rule_requirement_links AS (
    SELECT
        r.generation_run_id,
        r.business_rule_pk,
        r.name AS business_rule_name,
        fr.requirement_id
    FROM business_rule_discovery.business_rules AS r
    CROSS JOIN LATERAL
        jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(r.related_functional_requirements) = 'array'
                    THEN r.related_functional_requirements
                ELSE '[]'::jsonb
            END
        ) AS fr(requirement_id)
)
SELECT
    f.functional_requirement_id,
    COUNT(DISTINCT l.business_rule_pk) AS referencing_rule_count,
    JSONB_AGG(
        DISTINCT JSONB_BUILD_OBJECT(
            'business_rule_pk', l.business_rule_pk,
            'business_rule_name', l.business_rule_name
        )
    ) AS referencing_rules
FROM requirements.functional_requirements AS f
LEFT JOIN rule_requirement_links AS l
  ON l.requirement_id = f.functional_requirement_id
GROUP BY
    f.functional_requirement_id
ORDER BY
    referencing_rule_count,
    f.functional_requirement_id;


/* ============================================================================
   08. FUNCTIONAL REQUIREMENTS WITH NO RULE REFERENCES
   ----------------------------------------------------------------------------
   Business question:
     Which stored functional requirements are not referenced by any business
     rule?

   What it does:
     Automatically compares the complete functional-requirement population
     with all rule traceability arrays.

   Why it matters:
     Produces candidates for governance-coverage review.

   Important limitation:
     No direct rule reference does not necessarily mean the requirement is
     ungoverned. A rule may cover it indirectly or the traceability may be
     incomplete. Semantic review is required before concluding there is a gap.
   ============================================================================ */

WITH referenced_requirements AS (
    SELECT DISTINCT
        fr.requirement_id
    FROM business_rule_discovery.business_rules AS r
    CROSS JOIN LATERAL
        jsonb_array_elements_text(
            CASE
                WHEN jsonb_typeof(r.related_functional_requirements) = 'array'
                    THEN r.related_functional_requirements
                ELSE '[]'::jsonb
            END
        ) AS fr(requirement_id)
)
SELECT
    f.functional_requirement_id
FROM requirements.functional_requirements AS f
LEFT JOIN referenced_requirements AS rr
  ON rr.requirement_id = f.functional_requirement_id
WHERE rr.requirement_id IS NULL
ORDER BY
    f.functional_requirement_id;


/* ============================================================================
   09. RULE CHANGE / IMPACT-DISCOVERY INPUT
   ----------------------------------------------------------------------------
   Business question:
     What other rules share scope with each rule and should be reconsidered
     if that rule changes?

   What it does:
     Uses the automatically discovered relationships from section 03 as a
     candidate impact network.

   Why it matters:
     A change to one policy may affect other policies governing the same actors,
     objects, or functional requirements.

   Important limitation:
     Shared scope is only a candidate impact signal. The semantic evaluator
     should inspect conditions, exceptions, enforcement, consequences, and
     rationale before declaring an actual impact.
   ============================================================================ */

WITH rule_scope AS (
    SELECT
        r.business_rule_pk,
        r.generation_run_id,
        r.unit_id,
        r.name,
        r.statement,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(r.actors) = 'array'
                     THEN r.actors ELSE '[]'::jsonb END
            ) AS x(value)
        ) AS actor_ids,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(r.objects) = 'array'
                     THEN r.objects ELSE '[]'::jsonb END
            ) AS x(value)
        ) AS object_ids,

        ARRAY(
            SELECT DISTINCT x.value
            FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(r.related_functional_requirements) = 'array'
                     THEN r.related_functional_requirements ELSE '[]'::jsonb END
            ) AS x(value)
        ) AS requirement_ids

    FROM business_rule_discovery.business_rules AS r
)
SELECT
    a.business_rule_pk AS source_rule_id,
    a.name AS source_rule_name,
    b.business_rule_pk AS potentially_affected_rule_id,
    b.name AS potentially_affected_rule_name,

    ARRAY(
        SELECT ax.value FROM unnest(a.actor_ids) AS ax(value)
        WHERE ax.value = ANY(b.actor_ids)
    ) AS shared_actors,

    ARRAY(
        SELECT ax.value FROM unnest(a.object_ids) AS ax(value)
        WHERE ax.value = ANY(b.object_ids)
    ) AS shared_objects,

    ARRAY(
        SELECT ax.value FROM unnest(a.requirement_ids) AS ax(value)
        WHERE ax.value = ANY(b.requirement_ids)
    ) AS shared_functional_requirements

FROM rule_scope AS a
JOIN rule_scope AS b
  ON b.generation_run_id = a.generation_run_id
 AND b.business_rule_pk <> a.business_rule_pk
WHERE
       a.actor_ids && b.actor_ids
    OR a.object_ids && b.object_ids
    OR a.requirement_ids && b.requirement_ids
ORDER BY
    a.business_rule_pk,
    b.business_rule_pk;


/* ============================================================================
   10. SEMANTIC BUSINESS-RULE EVALUATION — DATASET FOR AI / RULE ENGINE
   ----------------------------------------------------------------------------
   Business question:
     What information should be supplied to the evaluator so it can interpret
     and assess every stored business rule?

   What it does:
     Returns the full semantic payload for all rules, including their context
     and provenance fields. No manual rule selection is needed.

   Why it matters:
     This is the hand-off dataset for AI-driven analysis such as:
       - interpret each policy in plain business language;
       - determine applicability and required business facts;
       - identify dependencies, overrides, and exceptions;
       - detect contradictions and policy gaps;
       - assess enforceability and operational consequences;
       - derive normal, boundary, exception, and violation scenarios;
       - explain findings with references to the original rule records.

   Important limitation:
     This query does not itself perform those semantic evaluations. The
     evaluator must return findings linked to business_rule_pk and must
     distinguish evidence-based conclusions from uncertain candidates.
   ============================================================================ */

SELECT
    r.business_rule_pk,
    r.generation_run_id,
    r.unit_id,
    u.unit_kind,
    u.title AS unit_title,
    u.brief AS unit_brief,

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
    r.raw_payload AS original_rule_payload,

    u.statements AS unit_statement_assignments,
    u.functional_requirement_ids AS unit_functional_requirements,
    u.business_requirement_id,
    u.actor_ids AS unit_actor_ids,
    u.object_ids AS unit_object_ids,
    u.raw_payload AS original_unit_payload

FROM business_rule_discovery.business_rules AS r
LEFT JOIN business_rule_discovery.generation_units AS u
  ON u.generation_run_id = r.generation_run_id
 AND u.unit_id = r.unit_id
ORDER BY
    r.generation_run_id,
    r.unit_id,
    r.rule_position;


/* ============================================================================
   11. RECOMMENDED SEMANTIC EVALUATION OUTPUT CONTRACT
   ----------------------------------------------------------------------------
   The SQL file deliberately does not invent an evaluation-results table.
   The AI/rule engine should produce structured findings with at least:

     evaluation_run_reference
     business_rule_pk
     evaluation_category
     finding_type
     finding_status
     related_business_rule_pks
     explanation
     evidence
     recommended_action
     confidence
     requires_human_review

   Suggested evaluation categories (not database-enforced values):
     interpretation
     applicability
     compliance
     conflict
     dependency
     exception_consistency
     completeness
     requirement_coverage
     object_coverage
     change_impact
     redundancy
     enforcement_readiness
     scenario_generation
     governance

   The evaluator should:
     1. Discover and read the full rule dataset automatically.
     2. Analyse rules within their generation context first.
     3. Compare generations only when cross-generation comparison is intended.
     4. Never infer a contradiction from shared scope alone.
     5. Cite the relevant business_rule_pk values and source evidence.
     6. Mark uncertain conclusions as candidates for review.
     7. Avoid silently deleting, merging, or rewriting rules.

   Executable enforcement note:
     If rules must eventually be evaluated deterministically by software,
     condition, exception, and enforcement payloads need a consistent,
     machine-readable structure (for example, nested logical operators,
     attribute/operator/value expressions, and explicit outcomes).
     Natural-language fields alone are not a safe deterministic rule format.
   ============================================================================ */


/* ============================================================================
   END OF FILE
   ============================================================================ */
