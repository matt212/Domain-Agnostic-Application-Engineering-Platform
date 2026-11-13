TRUNCATE TABLE
    requirements.br_validation_findings,
    requirements.br_overlap_pairs,
    requirements.br_consolidation_findings,
    requirements.br_consolidation_decisions,
    requirements.br_alternatives,
    requirements.br_validation_runs,
    requirements.br_consolidation_runs,
    requirements.requirement_relationships,
    requirements.requirement_versions,
    requirements.source_records,
    requirements.functional_requirements,
    requirements.business_requirements,
    requirements.source_files,
    requirements.ingestion_runs
RESTART IDENTITY CASCADE;
