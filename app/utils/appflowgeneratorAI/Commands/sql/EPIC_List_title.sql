WITH business_requirement_groups AS (
    SELECT
        NULLIF(TRIM(br.business_objective), '') AS business_objective,
        COUNT(*) AS requirement_count,
        ARRAY_AGG(
            br.business_requirement_id
            ORDER BY br.business_requirement_id
        ) AS business_requirement_ids
    FROM requirements.business_requirements br
    WHERE NULLIF(TRIM(br.business_objective), '') IS NOT NULL
    GROUP BY NULLIF(TRIM(br.business_objective), '')
),
numbered_epics AS (
    SELECT
        ROW_NUMBER() OVER (
            ORDER BY business_objective
        ) AS epic_number,
        business_objective,
        requirement_count,
        business_requirement_ids
    FROM business_requirement_groups
)
SELECT
    'EPIC-' || LPAD(epic_number::TEXT, 3, '0') AS epic_id,
    business_objective AS epic_title
FROM numbered_epics
ORDER BY epic_number;