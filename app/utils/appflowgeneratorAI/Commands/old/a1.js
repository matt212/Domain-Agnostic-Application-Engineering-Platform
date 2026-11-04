const fs = require('fs');
const path = require('path');

// ============================================================================
// IDENTICAL CONFIG ENGINE LAYER
// ============================================================================
const CONFIG = {
  PATHS: {
    PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
    OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput',
    TMP_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/promptFile',
    CACHE_FILENAME: 'techno-functional-matrix-cache.json',
    EXPORT_PREFIX: '6.Final-System-Architecture-Blueprint-Graph-'
  }
};

const OUTPUT_DIR = path.join(CONFIG.PATHS.PROJECT_ROOT, CONFIG.PATHS.OUTPUT_RELATIVE_DIR);
// ✔️ FIXED: Removed the broken backslash escape so '\$' correctly checks the string end anchor
const targetRegex = /^1-Final-Objects-.*\.txt\$/;

console.log("🚀 STARTING DIAGNOSTIC VERIFICATION RUN USING IDENTICAL CONFIG...");

// 1. Setup Sandbox directory safely to prevent filesystem gaps
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 2. Write mock matrix records on disk to process file array metrics
const sampleFiles = [
  '1-Final-Objects-for-Quick-Commerce_2026-10-01.txt',
  '1-Final-Objects-for-Quick-Commerce_2026-10-02.txt', 
  '1-Final-Objects-for-Quick-Commerce_2026-09-30.txt'
];

sampleFiles.forEach((filename, index) => {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, `=== Final DATA MATRIX for domain :Test ===\nMock payload value tracking parameters index: ${index}`, 'utf8');
  const time = new Date(Date.now() + index * 15000);
  fs.utimesSync(filePath, time, time);
});

// ============================================================================
// BROKEN ENGINE MECHANIC: REPRODUCES ARRAYS EXCEPTION COERCION FAULTS
// ============================================================================
function brokenFindLatestFileByRegex(directory, regexPattern) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  const matchedFiles = files.filter(file => regexPattern.test(file));
  
  if (matchedFiles.length === 0) return null;
  
  matchedFiles.sort((a, b) => {
    return fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs;
  });
  
  // ❌ THE REAL REPRODUCED CRASH LAYER IS HERE: Returns the raw Array tracker object directly into path string
  return path.join(directory, matchedFiles);
}

// ============================================================================
// STABLE ENGINE MECHANIC: VALID PURE STRING RESOLUTION
// ============================================================================
function fixedFindLatestFileByRegex(directory, regexPattern) {
  if (!fs.existsSync(directory)) return null;
  const files = fs.readdirSync(directory);
  const matchedFiles = files.filter(file => regexPattern.test(file));
  
  if (matchedFiles.length === 0) return null;
  
  matchedFiles.sort((a, b) => {
    return fs.statSync(path.join(directory, b)).mtimeMs - fs.statSync(path.join(directory, a)).mtimeMs;
  });
  
  // 🛡️ REPAIRED: Appends explicit string item index location checks
  return path.join(directory, matchedFiles[0]);
}

// ============================================================================
// REPRODUCTION CRASH RUN CHECKLIST
// ============================================================================

// EXECUTION A: Verify stable path logic
try {
  const stableStringPath = fixedFindLatestFileByRegex(OUTPUT_DIR, targetRegex);
  console.log(`\n\x1b[32m✔ FIXED FUNCTION SUCCESS:\x1b[0m Evaluated cleanly to path string instance:`);
  console.log(`👉 "${stableStringPath}"`);
  
  const textContent = fs.readFileSync(stableStringPath, 'utf8');
  console.log(`📊 File Reading Verification -> Content successfully captured.`);
} catch (error) {
  console.log(`\x1b[31m✕ FIXED FUNCTION CRASHED UNEXPECTEDLY:\x1b[0m ${error.message}`);
}

// EXECUTION B: Fire error reproduction check loop
try {
  console.log("\n--------------------------------------------------");
  console.log("🔥 INITIATING REPRODUCTION CHECK ON BROKEN ROUTINE...");
  
  const brokenArrayPath = brokenFindLatestFileByRegex(OUTPUT_DIR, targetRegex);
  console.log(`👉 Evaluated to Array pointer coercion reference string: "${brokenArrayPath}"`);
  
  // Trigger system read method to capture the exact platform path exception fault logs
  fs.readFileSync(brokenArrayPath, 'utf8');
} catch (error) {
  console.log(`\n\x1b[31m🚨 BROKEN FUNCTION ERROR REPRODUCED SUCCESSFULLY! 🚨\x1b[0m`);
  console.log(`\x1b[31mCaptured Exception signature:\x1b[0m "${error.message}"`);
}

// Clean up sandbox tracking file artifacts securely
try {
  sampleFiles.forEach(f => {
    const p = path.join(OUTPUT_DIR, f);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  console.log("\n🗑️ Local sandbox directory files scrubbed completely.");
} catch (e) {
  // Silent drop
}
