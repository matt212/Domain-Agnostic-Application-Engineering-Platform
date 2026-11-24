-- SELECT
--     br.*,
--     fr.*
    
-- FROM requirements.business_requirements br

-- LEFT JOIN requirements.requirement_relationships rr
--     ON rr.business_requirement_pk = br.business_requirement_pk

-- LEFT JOIN requirements.functional_requirements fr
--     ON fr.functional_requirement_pk = rr.functional_requirement_pk

-- ORDER BY
--     br.business_requirement_id,
--     fr.functional_requirement_id;


--get list of business objects
SELECT
    record_id,
    content->>'id' AS original_record_id,
    content->'content'->>'object_name' AS business_object_name,
    content->'content'->>'purpose' AS purpose,
    content->'content'->>'necessity' AS necessity,
    content->'content'->>'first_stage' AS first_stage,
    content->'content'->'dependencies' AS dependencies,
    content->'content'->>'lifecycle_role' AS lifecycle_role,
    content->'content'->>'evidence_status' AS evidence_status,
    content->'content'->>'confidence_score' AS confidence_score
FROM knowledge_records
WHERE source_id = 1
  AND record_type = 'JSON_ARRAY_ITEM'
  AND section LIKE 'Business Objects >%'
ORDER BY content->>'id';


--lifecycle_stage
SELECT
    record_id,
    content->'content'->>'stage' AS lifecycle_stage,
    content->'content'->>'description' AS description,
    content->'content'->>'trigger' AS trigger
FROM knowledge_records
WHERE source_id = 1
  AND section LIKE 'Derived Lifecycle >%'
ORDER BY record_id;


--Alternative Operating Models

SELECT
    record_id,
    content->'content'->>'model_name' AS model_name,
    content->'content'->>'description' AS description,
    content->'content'->>'impact' AS impact
FROM knowledge_records
WHERE source_id = 1
  AND (
      section ILIKE '%alternative operating model%'
      OR section ILIKE '%marketplace aggregator%'
      OR section ILIKE '%dark store%'
      OR section ILIKE '%hybrid model%'
  )
ORDER BY record_id;

--Key Business Assumptions
SELECT
    record_id,
    content->'content' AS business_assumption
FROM knowledge_records
WHERE source_id = 1
  AND (
      section ILIKE '%key assumptions%'
      OR section ILIKE '%assumptions%'
  )
ORDER BY record_id;


--Unresolved Dependencies
SELECT
    record_id,
    content->'content' AS unresolved_dependency
FROM knowledge_records
WHERE source_id = 1
  AND (
      section ILIKE '%unresolved dependencies%'
      OR section ILIKE '%unresolved dependency%'
  )
ORDER BY record_id;


-- Evidence Gaps
SELECT
    record_id,
    content->'content' AS evidence_gap
FROM knowledge_records
WHERE source_id = 1
  AND (
      section ILIKE '%evidence gaps%'
      OR section ILIKE '%evidence gap%'
  )
ORDER BY record_id;


--Business Operating Model — remaining details
SELECT
    record_id,
    content->'content'->>'creation_mechanism' AS creation_mechanism,
    content->'content'->'monetization_streams' AS monetization_streams
FROM knowledge_records
WHERE source_id = 1
  AND section ILIKE '%business operating model%'
  AND section NOT ILIKE '%value proposition%'
  AND section NOT ILIKE '%participants%'
  AND section NOT ILIKE '%monetization%'
  AND section NOT ILIKE '%distinctive niche%'
ORDER BY record_id;
