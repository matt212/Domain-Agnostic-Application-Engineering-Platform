
"use strict";

const fs = require("fs");
const path = require("path");

// ============================================================
// 1. CONFIGURATION
// ============================================================

const CONFIG = {
    PATHS: {
        PROJECT_ROOT: path.resolve(__dirname, "../../../../"),

        OUTPUT_RELATIVE_DIR:
            "app/utils/appflowgeneratorAI/aiOutput/baseline/",

        TMP_RELATIVE_DIR:
            "app/utils/appflowgeneratorAI/promptFile",

        EXPORT_PREFIX:
            "8.0.1.Derive_Information_Requirements",

        MERGED_INFORMATION_REQUIREMENTS_FILE:
            "merged_information_requirements_06_11_26_07_50_PM.json",

        VALIDATION_OUTPUT_FILE:
            `information_requirements_structural_validation-${getFormattedDateTime()}.json`
    },

    SCANNING_PATTERNS: {
        STAGE_1_OBJECTS:
            "7.6 Business Objects.",

        STAGE_2_ACTORS:
            "7.7.1 Actors_list.",

        STAGE_3_RESPONSIBILITIES:
            "7.7.0.4.Derive_Actors_Roles_Resonsibility_Authorization.",

        STAGE_4_RELATIONSHIPS:
            "7.7.0.5.Derive_ACTOR_BUSINESS_OBJECT_RELATIONSHIP.",

        STAGE_5_ACTIVITIES:
            "7.7.0.6.Derive_ACTOR_BUSINESS_Activities.",

        STAGE_6_INFORMATION_REQUIREMENTS:
            "7.7.0.8.Derive_Information_Requirements.05-11-26_03:40pm.md"
    },

    // These fields must exist in every merged requirement.
    // Their value types are deliberately NOT hard-coded.
    REQUIRED_FIELDS: [
        "information_requirement",
        "description",
        "business_purpose",
        "required_by_actors",
        "related_responsibilities",
        "related_activities",
        "related_business_objects",
        "information_usage",
        "information_source",
        "business_decisions_supported",
        "required_information_details",
        "functional_rules",
        "information_validation",
        "information_flow"
    ],

    // Fields whose values are checked against discovery artefacts.
    REFERENCE_FIELDS: {
        required_by_actors: "ACTORS",
        related_responsibilities: "RESPONSIBILITIES",
        related_activities: "BUSINESS_ACTIVITIES",
        related_business_objects: "BUSINESS_OBJECTS"
    },

    // Empty values are reported rather than silently accepted.
    EMPTY_VALUE_SEVERITY: "HIGH",

    // Reference matches are textual evidence, not semantic proof.
    REFERENCE_FINDING_SEVERITY: "MEDIUM"
};


// ============================================================
// 2. DIRECTORY RESOLUTION
// ============================================================

const OUTPUT_DIR = path.join(
    CONFIG.PATHS.PROJECT_ROOT,
    CONFIG.PATHS.OUTPUT_RELATIVE_DIR
);

const TEMP_DIR = path.join(
    CONFIG.PATHS.PROJECT_ROOT,
    CONFIG.PATHS.TMP_RELATIVE_DIR
);

const MERGED_INPUT_PATH = path.join(
    OUTPUT_DIR,
    CONFIG.PATHS.MERGED_INFORMATION_REQUIREMENTS_FILE
);

const VALIDATION_OUTPUT_PATH = path.join(
    OUTPUT_DIR.replace("baseline", ""),
    CONFIG.PATHS.VALIDATION_OUTPUT_FILE
);


// ============================================================
// 3. FILE UTILITIES
// ============================================================

function readTextFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist: ${filePath}`);
    }

    return fs.readFileSync(filePath, "utf8");
}


function readJsonFile(filePath) {
    const content = readTextFile(filePath);

    try {
        return JSON.parse(content);
    } catch (error) {
        throw new Error(
            `Invalid JSON in ${filePath}: ${error.message}`
        );
    }
}


// ============================================================
// 4. DISCOVERY FILE RESOLUTION
// ============================================================

function resolveLatestStageFile(pattern) {
    if (!fs.existsSync(OUTPUT_DIR)) {
        throw new Error(
            `Discovery output directory does not exist: ${OUTPUT_DIR}`
        );
    }

    const matches = fs.readdirSync(OUTPUT_DIR)
        .filter(file =>
            file.startsWith(pattern) &&
            file.toLowerCase().endsWith(".md")
        )
        .map(file => {
            const fullPath = path.join(OUTPUT_DIR, file);

            return {
                name: file,
                path: fullPath,
                modified: fs.statSync(fullPath).mtimeMs
            };
        })
        .sort((a, b) => b.modified - a.modified);

    if (matches.length === 0) {
        throw new Error(
            `No Markdown file found for pattern: ${pattern}`
        );
    }

    return matches[0];
}


function resolveExactStageFile(fileName) {
    const filePath = path.join(OUTPUT_DIR, fileName);

    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Information Requirements source not found: ${filePath}`
        );
    }

    return {
        name: fileName,
        path: filePath,
        modified: fs.statSync(filePath).mtimeMs
    };
}


// ============================================================
// 5. LOAD DISCOVERY ARTEFACTS
// ============================================================

function loadDiscoverySources() {
    const definitions = {
        BUSINESS_OBJECTS:
            CONFIG.SCANNING_PATTERNS.STAGE_1_OBJECTS,

        ACTORS:
            CONFIG.SCANNING_PATTERNS.STAGE_2_ACTORS,

        RESPONSIBILITIES:
            CONFIG.SCANNING_PATTERNS.STAGE_3_RESPONSIBILITIES,

        ACTOR_OBJECT_RELATIONSHIPS:
            CONFIG.SCANNING_PATTERNS.STAGE_4_RELATIONSHIPS,

        BUSINESS_ACTIVITIES:
            CONFIG.SCANNING_PATTERNS.STAGE_5_ACTIVITIES
    };

    const sources = {};

    console.log("\nLoading authoritative discovery artefacts...\n");

    for (const [key, pattern] of Object.entries(definitions)) {
        const file = resolveLatestStageFile(pattern);

        sources[key] = {
            file_name: file.name,
            file_path: file.path,
            content: readTextFile(file.path)
        };

        console.log(`Loaded ${key}: ${file.name}`);
    }

    // Explicitly configured Information Requirements source.
    const informationRequirementsFile = resolveExactStageFile(
        CONFIG.SCANNING_PATTERNS.STAGE_6_INFORMATION_REQUIREMENTS
    );

    sources.INFORMATION_REQUIREMENTS_SOURCE = {
        file_name: informationRequirementsFile.name,
        file_path: informationRequirementsFile.path,
        content: readTextFile(informationRequirementsFile.path)
    };

    console.log(
        "Loaded INFORMATION_REQUIREMENTS_SOURCE: " +
        informationRequirementsFile.name
    );

    return sources;
}


// ============================================================
// 6. LOAD MERGED INFORMATION REQUIREMENTS
// ============================================================

function extractInformationRequirements(data) {
    if (Array.isArray(data)) {
        return data;
    }

    if (
        data &&
        typeof data === "object" &&
        Array.isArray(data.information_requirements)
    ) {
        return data.information_requirements;
    }

    throw new Error(
        "Invalid merged JSON. Expected an array or an object " +
        "containing an information_requirements array."
    );
}


// ============================================================
// 7. GENERAL UTILITIES
// ============================================================

function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}


function isEmptyValue(value) {
    if (value === null || value === undefined) {
        return true;
    }

    if (typeof value === "string") {
        return value.trim().length === 0;
    }

    if (Array.isArray(value)) {
        return value.length === 0;
    }

    if (isPlainObject(value)) {
        return Object.keys(value).length === 0;
    }

    return false;
}


function normalizeText(value) {
    return String(value)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}


function createFinding({
    requirement = null,
    category,
    findingType,
    severity,
    field = null,
    problem,
    expected = null,
    actual = null,
    sourceFile = null
}) {
    return {
        information_requirement: requirement,
        validation_category: category,
        finding_type: findingType,
        severity,
        field,
        problem,
        expected,
        actual,
        source_file: sourceFile
    };
}


// ============================================================
// 8. SCHEMA-ADAPTIVE VALUE INSPECTION
// ============================================================

// Do not assume a field must be a string or array.
// Inspect its actual value and report only empty or unsupported
// JSON values (undefined cannot occur in parsed JSON).

function validateValueContent(
    value,
    requirement,
    field,
    findings,
    location = field
) {
    if (value === null) {
        findings.push(createFinding({
            requirement,
            category: "VALUE_VALIDATION",
            findingType: "NULL_VALUE",
            severity: CONFIG.EMPTY_VALUE_SEVERITY,
            field: location,
            problem: `Field '${location}' contains null.`,
            expected: "Meaningful non-null value",
            actual: null
        }));

        return;
    }

    if (typeof value === "string") {
        if (value.trim().length === 0) {
            findings.push(createFinding({
                requirement,
                category: "VALUE_VALIDATION",
                findingType: "EMPTY_STRING",
                severity: CONFIG.EMPTY_VALUE_SEVERITY,
                field: location,
                problem: `Field '${location}' contains an empty string.`,
                expected: "Non-empty string",
                actual: value
            }));
        }

        return;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) {
            findings.push(createFinding({
                requirement,
                category: "VALUE_VALIDATION",
                findingType: "EMPTY_ARRAY",
                severity: CONFIG.EMPTY_VALUE_SEVERITY,
                field: location,
                problem: `Field '${location}' contains an empty array.`,
                expected: "Non-empty array",
                actual: []
            }));

            return;
        }

        value.forEach((item, index) => {
            validateValueContent(
                item,
                requirement,
                field,
                findings,
                `${location}[${index}]`
            );
        });

        return;
    }

    if (isPlainObject(value)) {
        const keys = Object.keys(value);

        if (keys.length === 0) {
            findings.push(createFinding({
                requirement,
                category: "VALUE_VALIDATION",
                findingType: "EMPTY_OBJECT",
                severity: CONFIG.EMPTY_VALUE_SEVERITY,
                field: location,
                problem: `Field '${location}' contains an empty object.`,
                expected: "Non-empty object",
                actual: {}
            }));

            return;
        }

        for (const [key, childValue] of Object.entries(value)) {
            validateValueContent(
                childValue,
                requirement,
                field,
                findings,
                `${location}.${key}`
            );
        }

        return;
    }

    if (
        typeof value === "number" &&
        !Number.isFinite(value)
    ) {
        findings.push(createFinding({
            requirement,
            category: "VALUE_VALIDATION",
            findingType: "INVALID_NUMBER",
            severity: "HIGH",
            field: location,
            problem: `Field '${location}' contains an invalid number.`,
            expected: "Finite number",
            actual: String(value)
        }));
    }
}


// ============================================================
// 9. REQUIRED FIELD VALIDATION
// ============================================================

function validateRequiredFields(record, requirement, findings) {
    for (const field of CONFIG.REQUIRED_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(record, field)) {
            findings.push(createFinding({
                requirement,
                category: "FIELD_VALIDATION",
                findingType: "MISSING_REQUIRED_FIELD",
                severity: "HIGH",
                field,
                problem: `Required field '${field}' is missing.`,
                expected: "Field must exist",
                actual: null
            }));

            continue;
        }

        validateValueContent(
            record[field],
            requirement,
            field,
            findings
        );
    }
}


// ============================================================
// 10. REQUIREMENT RECORD VALIDATION
// ============================================================

function validateRequirementRecord(record, index, findings) {
    if (!isPlainObject(record)) {
        findings.push(createFinding({
            category: "RECORD_VALIDATION",
            findingType: "INVALID_REQUIREMENT_RECORD",
            severity: "CRITICAL",
            field: `information_requirements[${index}]`,
            problem: "Requirement record must be a JSON object.",
            expected: "Object",
            actual: Array.isArray(record) ? "array" : typeof record
        }));

        return;
    }

    const requirement = record.information_requirement;

    if (
        typeof requirement !== "string" ||
        requirement.trim().length === 0
    ) {
        findings.push(createFinding({
            requirement: null,
            category: "IDENTITY_VALIDATION",
            findingType: "INVALID_REQUIREMENT_IDENTITY",
            severity: "CRITICAL",
            field: "information_requirement",
            problem:
                "Requirement identity must be a non-empty string.",
            expected: "Non-empty string",
            actual: requirement ?? null
        }));
    }

    validateRequiredFields(record, requirement, findings);
}


// ============================================================
// 11. DUPLICATE REQUIREMENT VALIDATION
// ============================================================

function validateDuplicateRequirements(records, findings) {
    const seen = new Map();

    records.forEach((record, index) => {
        if (!isPlainObject(record)) {
            return;
        }

        const requirement = record.information_requirement;

        if (
            typeof requirement !== "string" ||
            requirement.trim().length === 0
        ) {
            return;
        }

        // Exact, case-sensitive identity comparison.
        if (seen.has(requirement)) {
            findings.push(createFinding({
                requirement,
                category: "IDENTITY_VALIDATION",
                findingType: "DUPLICATE_INFORMATION_REQUIREMENT",
                severity: "CRITICAL",
                field: "information_requirement",
                problem:
                    `Duplicate requirement found at records ` +
                    `${seen.get(requirement)} and ${index}.`,
                expected: "Unique exact requirement identity",
                actual: requirement
            }));
        } else {
            seen.set(requirement, index);
        }
    });
}


// ============================================================
// 12. DUPLICATE STRING ENTRY VALIDATION
// ============================================================

function validateDuplicateStrings(
    value,
    requirement,
    field,
    findings,
    location = field
) {
    if (Array.isArray(value)) {
        const seen = new Map();

        value.forEach((item, index) => {
            if (typeof item === "string" && item.trim()) {
                const normalized = normalizeText(item);

                if (seen.has(normalized)) {
                    findings.push(createFinding({
                        requirement,
                        category: "DUPLICATE_VALIDATION",
                        findingType: "DUPLICATE_ARRAY_ENTRY",
                        severity: "LOW",
                        field: `${location}[${index}]`,
                        problem:
                            `Duplicate string entry '${item}' detected.`,
                        expected: "Unique entries",
                        actual: item
                    }));
                } else {
                    seen.set(normalized, index);
                }
            }

            validateDuplicateStrings(
                item,
                requirement,
                field,
                findings,
                `${location}[${index}]`
            );
        });

        return;
    }

    if (isPlainObject(value)) {
        for (const [key, child] of Object.entries(value)) {
            validateDuplicateStrings(
                child,
                requirement,
                field,
                findings,
                `${location}.${key}`
            );
        }
    }
}


// ============================================================
// 13. INFORMATION FLOW SHAPE CHECK
// ============================================================

// Supports either an object or an array of objects.
// Does not force the field to be an array.
//
// If an object uses any of the known flow keys, check that
// the other flow keys are present as well.

function validateInformationFlow(record, findings) {
    const requirement = record.information_requirement;
    const flow = record.information_flow;

    if (flow === null || flow === undefined) {
        return;
    }

    const flowKeys = [
        "source",
        "consumer",
        "trigger",
        "outcome"
    ];

    function inspectFlowObject(item, location) {
        if (!isPlainObject(item)) {
            return;
        }

        const hasFlowKey = flowKeys.some(key =>
            Object.prototype.hasOwnProperty.call(item, key)
        );

        if (!hasFlowKey) {
            return;
        }

        for (const key of flowKeys) {
            if (!Object.prototype.hasOwnProperty.call(item, key)) {
                findings.push(createFinding({
                    requirement,
                    category: "INFORMATION_FLOW_VALIDATION",
                    findingType: "INCOMPLETE_FLOW_OBJECT",
                    severity: "MEDIUM",
                    field: `${location}.${key}`,
                    problem:
                        `Flow object uses flow attributes but is missing '${key}'.`,
                    expected: "source, consumer, trigger and outcome",
                    actual: null
                }));
            } else if (isEmptyValue(item[key])) {
                findings.push(createFinding({
                    requirement,
                    category: "INFORMATION_FLOW_VALIDATION",
                    findingType: "EMPTY_FLOW_ATTRIBUTE",
                    severity: "MEDIUM",
                    field: `${location}.${key}`,
                    problem: `Flow attribute '${key}' is empty.`,
                    expected: "Meaningful value",
                    actual: item[key] ?? null
                }));
            }
        }
    }

    if (Array.isArray(flow)) {
        flow.forEach((item, index) => {
            inspectFlowObject(item, `information_flow[${index}]`);
        });
    } else {
        inspectFlowObject(flow, "information_flow");
    }
}


// ============================================================
// 14. SOURCE TEXT MATCHING
// ============================================================

function sourceContainsPhrase(sourceContent, phrase) {
    const source = normalizeText(sourceContent);
    const target = normalizeText(phrase);

    if (!target) {
        return false;
    }

    let position = source.indexOf(target);

    while (position !== -1) {
        const before = position > 0
            ? source[position - 1]
            : "";

        const afterPosition = position + target.length;

        const after = afterPosition < source.length
            ? source[afterPosition]
            : "";

        const isWordCharacter = char =>
            /[\p{L}\p{N}_]/u.test(char);

        const leftBoundary =
            !before || !isWordCharacter(before);

        const rightBoundary =
            !after || !isWordCharacter(after);

        if (leftBoundary && rightBoundary) {
            return true;
        }

        position = source.indexOf(target, position + 1);
    }

    return false;
}


// ============================================================
// 15. EXTRACT REFERENCE LABELS
// ============================================================

// Only extracts string values.
// It does not guess object property names or manufacture labels.

function extractReferenceLabels(value) {
    if (typeof value === "string") {
        return value.trim() ? [value.trim()] : [];
    }

    if (Array.isArray(value)) {
        return value.flatMap(extractReferenceLabels);
    }

    if (isPlainObject(value)) {
        return Object.values(value).flatMap(extractReferenceLabels);
    }

    return [];
}


// ============================================================
// 16. DISCOVERY REFERENCE VALIDATION
// ============================================================

function validateReferenceField({
    records,
    field,
    source,
    sourceName,
    findings
}) {
    records.forEach(record => {
        if (!isPlainObject(record)) {
            return;
        }

        const requirement = record.information_requirement;
        const labels = extractReferenceLabels(record[field]);

        labels.forEach(label => {
            if (!sourceContainsPhrase(source.content, label)) {
                findings.push(createFinding({
                    requirement,
                    category: "REFERENCE_VALIDATION",
                    findingType: "REFERENCE_NOT_FOUND_IN_SOURCE",
                    severity: CONFIG.REFERENCE_FINDING_SEVERITY,
                    field,
                    problem:
                        `The reference '${label}' was not found as an ` +
                        `exact phrase in the ${sourceName} Markdown artefact.`,
                    expected:
                        "Reference should be identifiable in the corresponding discovery artefact.",
                    actual: label,
                    sourceFile: source.file_name
                }));
            }
        });
    });
}


// ============================================================
// 17. ACTOR–BUSINESS OBJECT RELATIONSHIP CHECK
// ============================================================

// This check verifies that each actor and business object
// associated with a requirement is present in the relationship
// artefact's text.
//
// It does NOT claim that a specific actor-object pair is
// semantically or structurally declared by that artefact.
// That requires parsing its actual relationship schema.

function validateActorObjectRelationshipEvidence({
    records,
    sources,
    findings
}) {
    const relationshipSource =
        sources.ACTOR_OBJECT_RELATIONSHIPS;

    records.forEach(record => {
        if (!isPlainObject(record)) {
            return;
        }

        const requirement = record.information_requirement;

        const actors = extractReferenceLabels(
            record.required_by_actors
        );

        const objects = extractReferenceLabels(
            record.related_business_objects
        );

        for (const actor of actors) {
            if (!sourceContainsPhrase(
                relationshipSource.content,
                actor
            )) {
                findings.push(createFinding({
                    requirement,
                    category: "RELATIONSHIP_EVIDENCE_VALIDATION",
                    findingType: "ACTOR_NOT_FOUND_IN_RELATIONSHIP_SOURCE",
                    severity: "MEDIUM",
                    field: "required_by_actors",
                    problem:
                        `Actor '${actor}' was not found in the ` +
                        "Actor–Business Object Relationship artefact.",
                    expected: "Actor should appear in relationship source",
                    actual: actor,
                    sourceFile: relationshipSource.file_name
                }));
            }
        }

        for (const businessObject of objects) {
            if (!sourceContainsPhrase(
                relationshipSource.content,
                businessObject
            )) {
                findings.push(createFinding({
                    requirement,
                    category: "RELATIONSHIP_EVIDENCE_VALIDATION",
                    findingType: "BUSINESS_OBJECT_NOT_FOUND_IN_RELATIONSHIP_SOURCE",
                    severity: "MEDIUM",
                    field: "related_business_objects",
                    problem:
                        `Business object '${businessObject}' was not found ` +
                        "in the Actor–Business Object Relationship artefact.",
                    expected:
                        "Business object should appear in relationship source",
                    actual: businessObject,
                    sourceFile: relationshipSource.file_name
                }));
            }
        }
    });
}


// ============================================================
// 18. INFORMATION REQUIREMENTS PROVENANCE CHECK
// ============================================================

// The configured stage 7.7.0.8 Markdown is treated as a
// provenance reference, not as the master merged dataset.
//
// Missing exact text is reported for review only because
// later discovery iterations may have enriched the requirement.

function validateInformationRequirementProvenance(
    records,
    source,
    findings
) {
    records.forEach(record => {
        if (!isPlainObject(record)) {
            return;
        }

        const requirement = record.information_requirement;

        if (
            typeof requirement !== "string" ||
            !requirement.trim()
        ) {
            return;
        }

        if (!sourceContainsPhrase(source.content, requirement)) {
            findings.push(createFinding({
                requirement,
                category: "PROVENANCE_VALIDATION",
                findingType: "REQUIREMENT_NOT_FOUND_IN_CONFIGURED_SOURCE",
                severity: "LOW",
                field: "information_requirement",
                problem:
                    "Requirement name was not found in the configured " +
                    "Information Requirements discovery Markdown source.",
                expected:
                    "Requirement name should be traceable to the configured source, " +
                    "or its later derivation should be documented.",
                actual: requirement,
                sourceFile: source.file_name
            }));
        }
    });
}


// ============================================================
// 19. EXECUTE STRUCTURAL VALIDATION
// ============================================================

function runStructuralValidation(records) {
    const findings = [];

    validateDuplicateRequirements(records, findings);

    records.forEach((record, index) => {
        validateRequirementRecord(record, index, findings);

        if (!isPlainObject(record)) {
            return;
        }

        for (const field of CONFIG.REQUIRED_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(record, field)) {
                validateDuplicateStrings(
                    record[field],
                    record.information_requirement,
                    field,
                    findings
                );
            }
        }

        validateInformationFlow(record, findings);
    });

    return findings;
}


// ============================================================
// 20. EXECUTE CROSS-REFERENCE VALIDATION
// ============================================================

function runReferenceValidation(records, sources) {
    const findings = [];

    for (const [field, sourceKey] of Object.entries(
        CONFIG.REFERENCE_FIELDS
    )) {
        validateReferenceField({
            records,
            field,
            source: sources[sourceKey],
            sourceName: sourceKey,
            findings
        });
    }

    validateActorObjectRelationshipEvidence({
        records,
        sources,
        findings
    });

    validateInformationRequirementProvenance(
        records,
        sources.INFORMATION_REQUIREMENTS_SOURCE,
        findings
    );

    return findings;
}


// ============================================================
// 21. BUILD SUMMARY
// ============================================================

function buildSummary(
    records,
    structuralFindings,
    referenceFindings
) {
    const allFindings = [
        ...structuralFindings,
        ...referenceFindings
    ];

    const severityCounts = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0
    };

    const categoryCounts = {};

    for (const finding of allFindings) {
        severityCounts[finding.severity]++;

        categoryCounts[finding.validation_category] =
            (categoryCounts[finding.validation_category] || 0) + 1;
    }

    const hasStructuralErrors = structuralFindings.some(
        finding =>
            finding.severity === "CRITICAL" ||
            finding.severity === "HIGH"
    );

    let status = "PASSED";

    if (hasStructuralErrors) {
        status = "REQUIRES_CORRECTION";
    } else if (allFindings.length > 0) {
        status = "REQUIRES_REVIEW";
    }

    return {
        total_information_requirements: records.length,

        structural_findings: structuralFindings.length,

        reference_findings: referenceFindings.length,

        total_findings: allFindings.length,

        severity_counts: severityCounts,

        category_counts: categoryCounts,

        structural_validation_status: status
    };
}


// ============================================================
// 22. MAIN EXECUTION
// ============================================================

function main() {
    console.log("\n================================================");
    console.log(" INFORMATION REQUIREMENTS VALIDATION");
    console.log("================================================");

    // Validate required directories and inputs.
    if (!fs.existsSync(TEMP_DIR)) {
        console.warn(
            `\nConfigured temporary directory does not exist: ${TEMP_DIR}`
        );
        console.warn(
            "No temporary files are required by this validator."
        );
    }

    // Load all six reference artefacts.
    const sources = loadDiscoverySources();

    // Read the merged Information Requirements JSON.
    console.log("\nReading merged Information Requirements:");
    console.log(MERGED_INPUT_PATH);

    const mergedData = readJsonFile(MERGED_INPUT_PATH);

    const records = extractInformationRequirements(mergedData);

    console.log(
        `\nInformation Requirements loaded: ${records.length}`
    );

    // Stage A: deterministic structural validation.
    console.log("\nRunning structural validation...");

    const structuralFindings =
        runStructuralValidation(records);

    // Stage B: deterministic textual reference checks.
    console.log("\nRunning discovery reference checks...");

    const referenceFindings =
        runReferenceValidation(records, sources);

    // Consolidate findings.
    const allFindings = [
        ...structuralFindings,
        ...referenceFindings
    ];

    const summary = buildSummary(
        records,
        structuralFindings,
        referenceFindings
    );

    // Source inventory.
    const sourceInventory = Object.entries(sources).map(
        ([key, source]) => ({
            source_key: key,
            file_name: source.file_name,
            file_path: source.file_path,
            loaded_successfully: true,
            content_characters: source.content.length
        })
    );

    // Final report.
    const report = {
        validation_metadata: {
            validation_name:
                "Information Requirements Structural and Reference Validation",

            validation_timestamp: new Date().toISOString(),

            validation_type:
                "DETERMINISTIC_STRUCTURAL_AND_REFERENCE_VALIDATION",

            merged_input_file:
                CONFIG.PATHS.MERGED_INFORMATION_REQUIREMENTS_FILE,

            original_input_modified: false,

            reference_validation_limitation:
                "Reference checks use exact textual phrase matching. " +
                "They do not prove semantic validity or exact actor-object pair relationships."
        },

        source_inventory: sourceInventory,

        validation_summary: summary,

        structural_findings: structuralFindings,

        reference_findings: referenceFindings,

        validation_findings: allFindings
    };

    // Save report.
    fs.mkdirSync(OUTPUT_DIR, {
        recursive: true
    });

    fs.writeFileSync(
        VALIDATION_OUTPUT_PATH,
        JSON.stringify(report, null, 2),
        "utf8"
    );

    // Console summary.
    console.log("\n================================================");
    console.log(" VALIDATION COMPLETED");
    console.log("================================================");

    console.log(
        `Requirements checked : ${summary.total_information_requirements}`
    );

    console.log(
        `Structural findings  : ${summary.structural_findings}`
    );

    console.log(
        `Reference findings   : ${summary.reference_findings}`
    );

    console.log(
        `Total findings       : ${summary.total_findings}`
    );

    console.log(
        `Critical             : ${summary.severity_counts.CRITICAL}`
    );

    console.log(
        `High                 : ${summary.severity_counts.HIGH}`
    );

    console.log(
        `Medium               : ${summary.severity_counts.MEDIUM}`
    );

    console.log(
        `Low                  : ${summary.severity_counts.LOW}`
    );

    console.log(
        `Status               : ${summary.structural_validation_status}`
    );

    console.log("\nGenerated report:");
    console.log(VALIDATION_OUTPUT_PATH);

    console.log("\n================================================\n");
}

function getFormattedDateTime() {
    const now = new Date();

    const pad = (value) => String(value).padStart(2, '0');

    return `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${String(now.getFullYear()).slice(-2)}_${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Example: 07-11-26_14:35
// ============================================================
// 23. ERROR HANDLING
// ============================================================

try {
    main();
} catch (error) {
    console.error("\nVALIDATION EXECUTION FAILED\n");
    console.error(error.stack || error.message);
    process.exitCode = 1;
}
