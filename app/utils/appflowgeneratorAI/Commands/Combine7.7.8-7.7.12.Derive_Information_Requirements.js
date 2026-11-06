
const fs = require("fs");
const path = require("path");

// ============================================================
// 1. CONFIGURATION
// ============================================================

const CONFIG = {
    // Directory containing the five generated JSON files.
    INPUT_DIR: path.resolve(__dirname, "../aiOutput/baseline"),

    // Directory where the merged JSON will be saved.
    OUTPUT_DIR: path.resolve(__dirname, "../aiOutput"),

    // Five JSON input files.
    INPUT_FILES: {
        FILE_1_MASTER: "7.7.0.8.Derive_Information_Requirements.05-11-26_03:40pm.md",
        FILE_2_ACTORS: "7.7.0.9.Derive_Information_Requirements.05-11-26_10:14pm.md",
        FILE_3_USAGE: "7.7.0.10.Derive_Information_Requirements.06-11-26_12:44pm.md",
        FILE_4_RULES: "7.7.0.11.Derive_Information_Requirements.06-11-26_03:57pm.md",
        FILE_5_FLOW: "7.7.0.12.Derive_Information_Requirements.06-11-26_04:58pm.md"
    }
};

// ============================================================
// 2. READ JSON FILE
// ============================================================

function readJsonFile(filePath, fileNumber) {
    const resolvedPath = path.resolve(filePath);

    if (!fs.existsSync(resolvedPath)) {
        throw new Error(
            `File ${fileNumber} not found: ${resolvedPath}`
        );
    }

    try {
        const content = fs.readFileSync(resolvedPath, "utf8");

        return JSON.parse(content.replace(/^\uFEFF/, ""));
    } catch (error) {
        throw new Error(
            `File ${fileNumber}: Unable to read valid JSON. ${error.message}`
        );
    }
}

// ============================================================
// 3. EXTRACT AND VALIDATE RECORDS
// ============================================================

function extractRecords(data, fileNumber) {
    let records;

    if (fileNumber === 1) {
        // File 1 contains the master wrapper.
        records = data?.information_requirements;
    } else {
        // Other files can contain an array or a single object.
        records = Array.isArray(data) ? data : [data];
    }

    if (!Array.isArray(records) || records.length === 0) {
        throw new Error(
            `File ${fileNumber}: Expected a non-empty array of records.`
        );
    }

    records.forEach((record, index) => {
        if (
            !record ||
            typeof record !== "object" ||
            Array.isArray(record)
        ) {
            throw new Error(
                `File ${fileNumber}, record ${index + 1}: Invalid object.`
            );
        }

        if (
            typeof record.information_requirement !== "string" ||
            !record.information_requirement.trim()
        ) {
            throw new Error(
                `File ${fileNumber}, record ${index + 1}: ` +
                "Missing or invalid information_requirement."
            );
        }
    });

    return records;
}

// ============================================================
// 4. CREATE INDEX BY information_requirement
// ============================================================

function createIndex(records, fileNumber) {
    const index = new Map();

    for (const record of records) {
        const key = record.information_requirement;

        if (index.has(key)) {
            throw new Error(
                `File ${fileNumber}: Duplicate information_requirement: "${key}"`
            );
        }

        index.set(key, record);
    }

    return index;
}

// ============================================================
// 5. VALIDATE ALL REQUIREMENT SETS
// ============================================================

function compareRequirementSets(masterRecords, sourceIndexes) {
    const masterKeys = new Set(
        masterRecords.map(record => record.information_requirement)
    );

    const errors = [];

    sourceIndexes.forEach(({ fileNumber, index }) => {
        const missing = [...masterKeys].filter(
            key => !index.has(key)
        );

        const additional = [...index.keys()].filter(
            key => !masterKeys.has(key)
        );

        if (missing.length || additional.length) {
            errors.push({
                fileNumber,
                missing,
                additional
            });
        }
    });

    if (errors.length) {
        console.error("\nRequirement alignment failed.\n");

        for (const error of errors) {
            console.error(`File ${error.fileNumber}:`);

            if (error.missing.length) {
                console.error("Missing requirements:");

                error.missing.forEach(key =>
                    console.error(`  - ${key}`)
                );
            }

            if (error.additional.length) {
                console.error("Additional requirements:");

                error.additional.forEach(key =>
                    console.error(`  - ${key}`)
                );
            }
        }

        throw new Error(
            "Merge stopped. All five files must contain identical " +
            "unique information_requirement values."
        );
    }
}

// ============================================================
// 6. MERGE FIVE JSON DATASETS
// ============================================================

function mergeInformationRequirements(datasets) {
    const masterRecords = datasets[0];

    const sourceIndexes = datasets.slice(1).map(
        (records, index) => ({
            fileNumber: index + 2,
            index: createIndex(records, index + 2)
        })
    );

    // Validate duplicates in master catalogue.
    createIndex(masterRecords, 1);

    // Validate exact requirement alignment.
    compareRequirementSets(masterRecords, sourceIndexes);

    // Preserve File 1 ordering.
    return masterRecords.map(master => {
        const key = master.information_requirement;

        const file2 = sourceIndexes[0].index.get(key);
        const file3 = sourceIndexes[1].index.get(key);
        const file4 = sourceIndexes[2].index.get(key);
        const file5 = sourceIndexes[3].index.get(key);

        return {
            // File 1
            ...master,

            // File 2
            required_by_actors: file2.required_by_actors,
            related_responsibilities: file2.related_responsibilities,
            related_activities: file2.related_activities,
            related_business_objects: file2.related_business_objects,

            // File 3
            information_usage: file3.information_usage,
            information_source: file3.information_source,
            business_decisions_supported: file3.business_decisions_supported,
            required_information_details: file3.required_information_details,

            // File 4
            functional_rules: file4.functional_rules,
            information_validation: file4.information_validation,

            // File 5
            information_flow: file5.information_flow
        };
    });
}

// ============================================================
// 7. GENERATE TIMESTAMP
// DD_MM_YY_HH_MM_AMPM
// ============================================================

function generateTimestamp() {
    const now = new Date();

    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);

    let hour = now.getHours();

    const ampm = hour >= 12 ? "PM" : "AM";

    hour = hour % 12 || 12;

    const hours = String(hour).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    return `${day}_${month}_${year}_${hours}_${minutes}_${ampm}`;
}

// ============================================================
// 8. SAVE MERGED JSON
// ============================================================

function saveMergedJson(mergedRecords) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, {
        recursive: true
    });

    const output = {
        information_requirements: mergedRecords
    };

    const timestamp = generateTimestamp();

    let outputFileName =
        `merged_information_requirements_${timestamp}.json`;

    let outputPath = path.join(
        CONFIG.OUTPUT_DIR,
        outputFileName
    );

    // Avoid overwriting a previous run.
    if (fs.existsSync(outputPath)) {
        const seconds = String(new Date().getSeconds()).padStart(2, "0");

        outputFileName =
            `merged_information_requirements_${timestamp}_${seconds}.json`;

        outputPath = path.join(
            CONFIG.OUTPUT_DIR,
            outputFileName
        );
    }

    fs.writeFileSync(
        outputPath,
        JSON.stringify(output, null, 2) + "\n",
        {
            encoding: "utf8",
            flag: "wx"
        }
    );

    console.log("\n========== OUTPUT SAVED ==========");
    console.log(`Requirements merged: ${mergedRecords.length}`);
    console.log(`Filename: ${outputFileName}`);
    console.log(`Full path: ${outputPath}`);

    return outputPath;
}

// ============================================================
// 9. END-TO-END EXECUTION
// ============================================================

function main() {
    console.log("\nStarting JSON Information Requirement merger...\n");

    // Resolve the five JSON input paths.
    const inputPaths = Object.values(CONFIG.INPUT_FILES).map(
        fileName => path.join(CONFIG.INPUT_DIR, fileName)
    );

    // Read all five JSON files.
    console.log("Reading five JSON input files...");

    const datasets = inputPaths.map((filePath, index) => {
        console.log(`File ${index + 1}: ${path.basename(filePath)}`);

        return extractRecords(
            readJsonFile(filePath, index + 1),
            index + 1
        );
    });

    // Merge and validate.
    console.log("\nValidating requirement alignment...");

    const mergedRecords = mergeInformationRequirements(datasets);

    // Save final output.
    saveMergedJson(mergedRecords);

    console.log("\nJSON merging completed successfully.");
}

// ============================================================
// 10. RUN
// ============================================================

try {
    main();
} catch (error) {
    console.error(`\nMERGE FAILED: ${error.message}`);
    process.exitCode = 1;
}
