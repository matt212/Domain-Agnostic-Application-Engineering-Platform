
-- ============================================================
-- CONSOLIDATED FR / BR POSTGRESQL INGESTION VERIFICATION
-- ONE QUERY - ONE RESULT SET
-- Read-only
-- ============================================================

WITH checks AS (

    -- 1. INGESTION

    SELECT
        '01. INGESTION' AS category,
        'Total ingestion runs' AS check_name,
        COUNT(*)::BIGINT AS actual,
        1::BIGINT AS expected
    FROM requirements.ingestion_runs

    UNION ALL

    SELECT
        '01. INGESTION',
        'Completed ingestion runs',
        COUNT(*)::BIGINT,
        1::BIGINT
    FROM requirements.ingestion_runs
    WHERE status = 'COMPLETED'

    UNION ALL

    -- 2. SOURCE FILES

    SELECT
        '02. SOURCE FILES',
        'Total source files',
        COUNT(*)::BIGINT,
        91::BIGINT
    FROM requirements.source_files

    UNION ALL

    SELECT
        '02. SOURCE FILES',
        'Files with original content',
        COUNT(*)::BIGINT,
        91::BIGINT
    FROM requirements.source_files
    WHERE raw_content IS NOT NULL

    UNION ALL

    SELECT
        '02. SOURCE FILES',
        'Files missing checksum',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.source_files
    WHERE file_checksum IS NULL

    UNION ALL

    -- 3. SOURCE RECORDS

    SELECT
        '03. SOURCE RECORDS',
        'Total source records',
        COUNT(*)::BIGINT,
        89::BIGINT
    FROM requirements.source_records

    UNION ALL

    SELECT
        '03. SOURCE RECORDS',
        'Orphaned source records',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.source_records sr
    LEFT JOIN requirements.source_files sf
        ON sf.source_file_id = sr.source_file_id
    WHERE sf.source_file_id IS NULL

    UNION ALL

    -- 4. FUNCTIONAL REQUIREMENTS

    SELECT
        '04. FUNCTIONAL REQUIREMENTS',
        'Total FRs',
        COUNT(*)::BIGINT,
        62::BIGINT
    FROM requirements.functional_requirements

    UNION ALL

    SELECT
        '04. FUNCTIONAL REQUIREMENTS',
        'Unique FR IDs',
        COUNT(DISTINCT functional_requirement_id)::BIGINT,
        62::BIGINT
    FROM requirements.functional_requirements

    UNION ALL

    SELECT
        '04. FUNCTIONAL REQUIREMENTS',
        'FRs missing original payload',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.functional_requirements
    WHERE raw_payload IS NULL

    UNION ALL

    -- 5. BUSINESS REQUIREMENTS

    SELECT
        '05. BUSINESS REQUIREMENTS',
        'Total BRs',
        COUNT(*)::BIGINT,
        27::BIGINT
    FROM requirements.business_requirements

    UNION ALL

    SELECT
        '05. BUSINESS REQUIREMENTS',
        'Unique BR IDs',
        COUNT(DISTINCT business_requirement_id)::BIGINT,
        27::BIGINT
    FROM requirements.business_requirements

    UNION ALL

    SELECT
        '05. BUSINESS REQUIREMENTS',
        'BRs missing original payload',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.business_requirements
    WHERE raw_payload IS NULL

    UNION ALL

    -- 6. REQUIREMENT VERSIONS

    SELECT
        '06. VERSION HISTORY',
        'Total requirement versions',
        COUNT(*)::BIGINT,
        178::BIGINT
    FROM requirements.requirement_versions

    UNION ALL

    SELECT
        '06. VERSION HISTORY',
        'FR version records',
        COUNT(*)::BIGINT,
        124::BIGINT
    FROM requirements.requirement_versions
    WHERE requirement_type = 'FR'

    UNION ALL

    SELECT
        '06. VERSION HISTORY',
        'BR version records',
        COUNT(*)::BIGINT,
        54::BIGINT
    FROM requirements.requirement_versions
    WHERE requirement_type = 'BR'

    UNION ALL

    SELECT
        '06. VERSION HISTORY',
        'Requirements without exactly two versions',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM (
        SELECT requirement_type, requirement_id
        FROM requirements.requirement_versions
        GROUP BY requirement_type, requirement_id
        HAVING COUNT(*) <> 2
            OR MIN(version_number) <> 1
            OR MAX(version_number) <> 2
    ) version_issues

    UNION ALL

    -- 7. FR-BR RELATIONSHIPS

    SELECT
        '07. FR-BR TRACEABILITY',
        'Total relationships',
        COUNT(*)::BIGINT,
        107::BIGINT
    FROM requirements.requirement_relationships

    UNION ALL

    SELECT
        '07. FR-BR TRACEABILITY',
        'Orphaned relationships',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.requirement_relationships rr
    LEFT JOIN requirements.functional_requirements fr
        ON fr.functional_requirement_pk = rr.functional_requirement_pk
    LEFT JOIN requirements.business_requirements br
        ON br.business_requirement_pk = rr.business_requirement_pk
    WHERE fr.functional_requirement_pk IS NULL
       OR br.business_requirement_pk IS NULL

    UNION ALL

    -- 8. BR VALIDATION

    SELECT
        '08. BR VALIDATION',
        'Validation runs',
        COUNT(*)::BIGINT,
        1::BIGINT
    FROM requirements.br_validation_runs

    UNION ALL

    SELECT
        '08. BR VALIDATION',
        'Validation findings',
        COUNT(*)::BIGINT,
        39::BIGINT
    FROM requirements.br_validation_findings

    UNION ALL

    SELECT
        '08. BR VALIDATION',
        'Findings with invalid BR references',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.br_validation_findings vf
    LEFT JOIN requirements.business_requirements br
        ON br.business_requirement_pk = vf.business_requirement_pk
    WHERE vf.business_requirement_pk IS NOT NULL
      AND br.business_requirement_pk IS NULL

    UNION ALL

    -- 9. BR CONSOLIDATION

    SELECT
        '09. BR CONSOLIDATION',
        'Consolidation runs',
        COUNT(*)::BIGINT,
        1::BIGINT
    FROM requirements.br_consolidation_runs

    UNION ALL

    SELECT
        '09. BR CONSOLIDATION',
        'Overlap pairs',
        COUNT(*)::BIGINT,
        4::BIGINT
    FROM requirements.br_overlap_pairs

    UNION ALL

    SELECT
        '09. BR CONSOLIDATION',
        'Consolidation findings',
        COUNT(*)::BIGINT,
        30::BIGINT
    FROM requirements.br_consolidation_findings

    UNION ALL

    -- 10. RECONCILIATION TABLES

    SELECT
        '10. RECONCILIATION',
        'Consolidation decisions',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.br_consolidation_decisions

    UNION ALL

    SELECT
        '10. RECONCILIATION',
        'BR alternatives',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM requirements.br_alternatives

    UNION ALL

    -- 11. DUPLICATE ID CHECKS

    SELECT
        '11. DUPLICATE CHECKS',
        'Duplicate FR IDs',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM (
        SELECT functional_requirement_id
        FROM requirements.functional_requirements
        GROUP BY functional_requirement_id
        HAVING COUNT(*) > 1
    ) duplicates

    UNION ALL

    SELECT
        '11. DUPLICATE CHECKS',
        'Duplicate BR IDs',
        COUNT(*)::BIGINT,
        0::BIGINT
    FROM (
        SELECT business_requirement_id
        FROM requirements.business_requirements
        GROUP BY business_requirement_id
        HAVING COUNT(*) > 1
    ) duplicates

    UNION ALL

    -- 12. CONSOLIDATED / WORK FILE ID DISCREPANCY

    SELECT
        '12. ID DISCREPANCY',
        'BR-026 / BR-028 version records',
        COUNT(*)::BIGINT,
        2::BIGINT
    FROM requirements.requirement_versions
    WHERE requirement_type = 'BR'
      AND requirement_id IN ('BR-026', 'BR-028')
)

SELECT
    category,
    check_name,
    actual,
    expected,
    CASE
        WHEN actual = expected THEN 'PASS'
        ELSE 'CHECK'
    END AS result
FROM checks

UNION ALL

SELECT
    '99. OVERALL',
    'Total checks',
    COUNT(*)::BIGINT,
    COUNT(*)::BIGINT,
    'INFO'
FROM checks

UNION ALL

SELECT
    '99. OVERALL',
    'Passed checks',
    COUNT(*) FILTER (WHERE actual = expected)::BIGINT,
    COUNT(*)::BIGINT,
    CASE
        WHEN COUNT(*) FILTER (WHERE actual <> expected) = 0
            THEN 'PASS'
        ELSE 'CHECK'
    END
FROM checks

ORDER BY category, check_name;
