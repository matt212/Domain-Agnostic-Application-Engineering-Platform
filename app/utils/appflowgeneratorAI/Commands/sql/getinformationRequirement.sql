SELECT
    record_id,
    content -> 'content' ->> 'information_requirement'
        AS information_requirement,
    content -> 'content' ->> 'description'
        AS description,
    content -> 'content' ->> 'business_purpose'
        AS business_purpose,
    content -> 'content' -> 'required_by_actors'
        AS required_by_actors,
    content -> 'content' -> 'related_responsibilities'
        AS related_responsibilities,
    content -> 'content' -> 'related_activities'
        AS related_activities,
    content -> 'content' -> 'related_business_objects'
        AS related_business_objects,
    content -> 'content' ->> 'information_usage'
        AS information_usage,
    content -> 'content' ->> 'information_source'
        AS information_source,
    content -> 'content' -> 'business_decisions_supported'
        AS business_decisions_supported,
    content -> 'content' -> 'required_information_details'
        AS required_information_details,
    content -> 'content' -> 'functional_rules'
        AS functional_rules,
    content -> 'content' -> 'information_validation'
        AS information_validation,
    content -> 'content' -> 'information_flow' ->> 'source'
        AS information_flow_source,
    content -> 'content' -> 'information_flow' ->> 'outcome'
        AS information_flow_outcome,
    content -> 'content' -> 'information_flow' ->> 'trigger'
        AS information_flow_trigger,
    content -> 'content' -> 'information_flow' -> 'consumer'
        AS information_flow_consumer
FROM knowledge_records
WHERE
    semantic_category = 'INFORMATION_REQUIREMENT'
    AND record_type = 'JSON_ARRAY_ITEM'
ORDER BY record_id;