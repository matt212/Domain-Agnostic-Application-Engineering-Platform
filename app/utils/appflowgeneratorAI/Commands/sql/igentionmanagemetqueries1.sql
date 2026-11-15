Useful ingestion management queries
A. Find all attempts for a generation
SELECT
    ingestion_run_id,
    generation_run_id,
    ingestion_number,
    ingestion_status,
    records_read,
    records_inserted,
    records_updated,
    records_failed,
    started_at,
    completed_at
FROM business_rule_discovery.ingestion_runs
WHERE generation_run_id = 1
ORDER BY ingestion_number;


B. Get the record counts for one ingestion attempt


SELECT 'SOURCE_ARTIFACTS' AS record_type, COUNT(*) AS total
FROM business_rule_discovery.source_artifacts
WHERE ingestion_run_id = 1

UNION ALL

SELECT 'GENERATION_UNITS', COUNT(*)
FROM business_rule_discovery.generation_units
WHERE ingestion_run_id = 1

UNION ALL

SELECT 'BUSINESS_RULES', COUNT(*)
FROM business_rule_discovery.business_rules
WHERE ingestion_run_id = 1;


C. Identify all rules in a particular ingestion attempt

SELECT
    business_rule_pk,
    unit_id,
    name,
    type,
    severity,
    review_status
FROM business_rule_discovery.business_rules
WHERE ingestion_run_id = 1
ORDER BY unit_id, rule_position;


D. Delete only the records belonging to one ingestion attempt

Use this when you want to remove an entire ingestion set and reprocess it.
-- Replace 1 with the target ingestion_run_id.

--DELETE FROM business_rule_discovery.business_rules
--WHERE ingestion_run_id = 1;

--DELETE FROM business_rule_discovery.generation_units
--WHERE ingestion_run_id = 1;

--DELETE FROM business_rule_discovery.source_artifacts
--WHERE ingestion_run_id = 1;

-- Preserve the ingestion history.
--UPDATE business_rule_discovery.ingestion_runs
--SET
  --  ingestion_status = 'ROLLED_BACK',
    --completed_at = CURRENT_TIMESTAMP
--WHERE ingestion_run_id = 1;


This does not delete the generation record or the ingestion-attempt record.