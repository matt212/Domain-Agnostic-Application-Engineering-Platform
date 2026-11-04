const fs = require('fs');
const path = require('path');



let base = {
    a: 'app/utils/appflowgeneratorAI/aiOutput/7.2.Gaps Finding-.22-10-26_02:36pm.md',
    
}
base.a='app/utils/appflowgeneratorAI/aiOutput/7.6 Business Objects.24-10-26_06:41pm.md'
//loadclean(base);
//loadcleanAlternative_options(base)
let poli=extractDomain_Niche_Main_Content(base)
console.log(poli)



//getmermaidcontent()

function extractDomain_Niche_Main_Content(base)
{
    
        let CONFIG1 = {
            PATHS: {
                PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
                OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
            }
        }
        const extract = (filePath) => {
            const raw = fs.readFileSync(filePath, 'utf8');
            return raw.trim();
        };
        const objectsData = extract(base.a);
        let interim = JSON.parse(objectsData)
        //console.log(interim)
        
        let base1=
        {
            primarydataset:{
            domain:interim.domain,
            niche:interim.niche
            }
        }
        delete interim.domain;
        delete interim.niche;
        base1.mainContent=interim
        return JSON.stringify(base1,null,4)
}


function loadclean(base) {
    let CONFIG1 = {
        PATHS: {
            PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
            OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
        }
    }

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
    const extract = (filePath) => {
        const raw = fs.readFileSync(filePath, 'utf8');
        return raw.trim();
    };
    const objectsData = extract(base.a);
    let interim = JSON.parse(extractAfterLastAssistant(objectsData)).replacements
    //console.log(interim)
    const contentChanges = interim.map(item => {
        const match = item.existing_content.match(/\[Step\s([\d.]+)/);
        const step = match ? match[1] : null;
        return {
            step,
            from: item.existing_content,
            to: item.replacement_content,
            statement: `UPDATE NODE Step ${step} TO  "${item.replacement_content}"`,
        };
    });
    const finalScript = contentChanges.map(item => item.statement).join('\n')
    console.log(finalScript);
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
    const outputFileName = `clean6.3.1_cleanup_${timestamp}.md`;
    const OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
    const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
    // 7. Commit write configuration array output directly onto physical hardware disk
   fs.writeFileSync(outputFilePath, finalScript, 'utf8');
}
 


function loadcleanAlternative_options(base) {
    let CONFIG1 = {
        PATHS: {
            PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
            OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
        }
    }

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
    const extract = (filePath) => {
        const raw = fs.readFileSync(filePath, 'utf8');
        return raw.trim();
    };
    // 2. Helper to strip the bracket prefix from generated items to avoid repeating the emoji and step number
    const cleanPhrase = (text) => {
        const idx = text.indexOf(']');
        return idx !== -1 ? text.substring(idx + 1).trim() : text.trim();
    };
    const objectsData = extract(base.a);
    let interim = JSON.parse(extractAfterLastAssistant(objectsData)).replacements
    //console.log(interim)
    let prefix = "";
    const contentChanges = interim.map(item => {
        const match = item.existing_content.match(/\[Step\s([\d.]+)/);
        const step = match ? match[1] : null;
        const bracketIndex = item.existing_content.indexOf(']');
        if (bracketIndex !== -1) {
            prefix = item.existing_content.substring(0, bracketIndex + 1).trim() + " ";
        }
        const allChoices = [];
        if (item.replacement_content) {
            allChoices.push(`1.${cleanPhrase(item.replacement_content)}`);
        }
        if (item.alternative_options && Array.isArray(item.alternative_options)) {
            item.alternative_options.forEach((opt, idx) => {
                allChoices.push(`${idx + 2}.${cleanPhrase(opt)}`);
            });
        }
        const compositeReplacementText = `${prefix}${allChoices.join('\\n')}`;
        return {
            step,
            from: item.existing_content,
            to: item.replacement_content,
            statement: `UPDATE NODE Step ${step} TO  "${compositeReplacementText}"`,
        };
    });
    const finalScript = contentChanges.map(item => item.statement).join('\n')
    console.log(finalScript);
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
    const outputFileName = `clean6.3.1_Alternate_${timestamp}.md`;
    const OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
    const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
    // 7. Commit write configuration array output directly onto physical hardware disk
    fs.writeFileSync(outputFilePath, finalScript, 'utf8');
}

function loadcleansample(base)
{
    loadclean(base)
    function loadclean(base) {
        let CONFIG1 = {
            PATHS: {
                PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
                OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
            }
        }
    
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
        const extract = (filePath) => {
            const raw = fs.readFileSync(filePath, 'utf8');
            return raw.trim();
        };
        const objectsData = extract(base.a);
        let interim = JSON.parse(extractAfterLastAssistant(objectsData))
        //console.log(interim)
        
        
        console.log(interim);
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
        const outputFileName = `clean7.2_cleanup_${timestamp}.md`;
        const OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
        const outputFilePath = path.join(OUTPUT_DIR, outputFileName);
        // 7. Commit write configuration array output directly onto physical hardware disk
        fs.writeFileSync(outputFilePath, JSON.stringify(interim, null, 2), 'utf8');
    }
}



function getmermaidcontent()
{
    let CONFIG1 = {
        PATHS: {
            PROJECT_ROOT: path.resolve(__dirname, '../../../../'),
            OUTPUT_RELATIVE_DIR: 'app/utils/appflowgeneratorAI/aiOutput/',
        }
    }
   let  STAGE_4_TOPOLOGY="6.swimlane_systems_architecture_map_18-10-26_07_17.md";
    let OUTPUT_DIR = path.join(CONFIG1.PATHS.PROJECT_ROOT, CONFIG1.PATHS.OUTPUT_RELATIVE_DIR);
    let outputFilePath = path.join(OUTPUT_DIR+"/baseline/", STAGE_4_TOPOLOGY);
    //console.log(outputFilePath)
    let  objectsMatrixContent = fs.readFileSync(outputFilePath, 'utf8');
     //console.log(objectsMatrixContent)
  //   extractcontent(objectsMatrixContent)
}

function extractcontent(objectsMatrixContent)
{
    const mermaidContent = objectsMatrixContent

    function extractNodesWithoutRegex(text) {
    const lines = text.split('\n');
    const results = [];
    
    // The specific node suffixes we want to look for
    const targets = ['_alternate_path', '_degraded_alert', '_reject_scenario'];

    for (let line of lines) {
        line = line.trim();
        
        // Find if the current line contains one of our target node types
        const matchedSuffix = targets.find(suffix => line.includes(suffix));
        
        // Skip lines that don't match or lines that are path definitions (containing arrows)
        if (!matchedSuffix || line.includes('-->') || line.includes('.-.')) {
            continue;
        }

        // Split by the opening character of the label block
        let openChar = '';
        if (line.includes('["')) openChar = '["';
        else if (line.includes('("')) openChar = '("';
        else if (line.includes('{"')) openChar = '{"';
        
        if (!openChar) continue;

        const parts = line.split(openChar);
        if (parts.length < 2) continue;

        // Clean up the Node ID
        const nodeId = parts[0].trim();

        // Clean up the text content by removing the closing bracket/parenthesis/quotes
        let content = parts[1].trim();
        content = content.replace(/["'\])}]+\$/, ''); // Simple end-of-string character cleanup

         while (content.endsWith('"') || content.endsWith(']') || content.endsWith(')') || content.endsWith('}')) {
            content = content.slice(0, -1);
        }

        results.push({
            node_id: nodeId,
            existing_content: content
        });
    }

    return results;
    }

// Execute Extraction
    const extractedNodes = extractNodesWithoutRegex(mermaidContent);

// Print Output
     console.log(JSON.stringify({ existing_content: extractedNodes }, null, 2));

}