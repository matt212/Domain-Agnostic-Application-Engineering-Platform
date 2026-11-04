const fs = require('fs');
const path = require('path');

/**
 * Reads a raw text file, isolates the clean Mermaid block following the 2nd "Assistant:" marker,
 * and saves it into a timestamped markdown file.
 * @param {string} inputFilePath - Path to the source raw txt file.
 */

function extractAfterLastAssistant(rawContent) {
  const marker = "Assistant:";
  const lastIndex = rawContent.lastIndexOf(marker);

  // If the marker isn't found at all, return an empty string or handle gracefully
  if (lastIndex === -1) {
    return ""; 
  }

  // Slice everything after the marker index + the length of "Assistant:"
  return rawContent.slice(lastIndex + marker.length).trim();
}

function cleanAndExtractMermaid(inputFilePath) {
    try {
        // 1. Verify file exists
        if (!fs.existsSync(inputFilePath)) {
            console.error(`❌ [ERROR] Source file not found at: \${inputFilePath}`);
            return;
        }

        // 2. Read the source text content
        const rawContent = fs.readFileSync(inputFilePath, 'utf8');

        // 3. Split the file using the "Assistant:" delimiter case-sensitively
        // const marker = "Assistant:";
        // const segments = rawContent.split(marker);

        // Crucial validation: Ensure there are at least two "Assistant:" markers present (creating 3 parts)
        // if (segments.length < 2) {
        //     console.error(`❌ [ERROR] Aborting code execution: Could not locate the second "\${marker}" token block in the file.`);
        //     return;
        // }

        // 4. Extract everything following the second "Assistant:" block
        // segments[0] = before 1st Assistant
        // segments[1] = between 1st and 2nd Assistant
        // segments[2...] = everything after the 2nd Assistant (rejoined in case the string appears in the code text)
       // let coreContent = segments.slice(1).join(marker).trim();
const coreContent = extractAfterLastAssistant(rawContent);

        // 5. Wrap inside clean markdown code fence backticks blocks
        const finalOutput = `\`\`\`mermaid\n${coreContent}\n\`\`\``;

        // 6. Generate precise execution timestamp filename string (Format: YYYYMMDD_HHMMSS)
        const now = new Date();
        

// 1. Extract date components (DD-MM-YY)
const day = String(now.getDate()).padStart(2, '0');
const month = String(now.getMonth() + 1).padStart(2, '0'); 
const year = String(now.getFullYear()).slice(-2);          

// 2. Extract 12-hour time components (HH:MMam/pm)
let hours = now.getHours();
const minutes = String(now.getMinutes()).padStart(2, '0');
const ampm = hours >= 12 ? 'pm' : 'am';

hours = hours % 12;
hours = hours ? hours : 12; // Formats 0 to 12
const formattedHours = String(hours).padStart(2, '0');

// 3. Assemble with dashes and colons intact
const timestamp = `${day}-${month}-${year}_${formattedHours}:${minutes}${ampm}`;
// Result Example: "13-10-26_07:57pm"


        const outputFileName = `mermaid_diagram_${timestamp}.md`;
        const outputFilePath = path.join(path.dirname(inputFilePath), outputFileName);

        // 7. Commit write configuration array output directly onto physical hardware disk
        fs.writeFileSync(outputFilePath, finalOutput, 'utf8');
        console.log(`🎉 [SUCCESS] File cleanly processed and exported!`);
        console.log(`📁 Saved to location: ${outputFilePath}`);

    } catch (error) {
        console.error("💥 [CRITICAL CRASH] Redirection exception caught within file pipeline processing loop:", error);
    }
}

// ============================================================================
// HOW TO EXECUTE SCRIPT:
// ============================================================================
// Pass your local relative path parameter index here to run the function execution trace loop:


//const TARGET_INPUT_FILE = 'app/utils/appflowgeneratorAI/aiOutput/6.Final-System-Architecture-Blueprint-Graph-2026-10-08.txt';
const TARGET_INPUT_FILE = 'app/utils/appflowgeneratorAI/aiOutput/7.Final-System-Architecture-Blueprint-Graph-2026-10-15T11-15-03-200Z.txt';

cleanAndExtractMermaid(TARGET_INPUT_FILE);
