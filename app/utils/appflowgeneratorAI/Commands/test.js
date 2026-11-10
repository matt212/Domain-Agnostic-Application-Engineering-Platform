const fs = require('fs');
const path = require('path');

function extractJsonObject(rawText) {
  const text = String(rawText || '').trim();

  // First try parsing the complete response.
  try {
    const parsed = JSON.parse(text);

    if (
      parsed &&
      !Array.isArray(parsed) &&
      (parsed.action === 'FINAL' || parsed.action === 'SEARCH')
    ) {
      return parsed;
    }
  } catch (_) {
    // The response may contain llama-cli output around the JSON.
  }

  // Extract balanced JSON objects.
  const candidates = [];

  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let end = start; end < text.length; end++) {
      const char = text[end];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;

        if (depth === 0) {
          try {
            const parsed = JSON.parse(text.slice(start, end + 1));

            if (
              parsed &&
              !Array.isArray(parsed) &&
              (parsed.action === 'FINAL' || parsed.action === 'SEARCH')
            ) {
              candidates.push(parsed);
            }
          } catch (_) {}

          break;
        }
      }
    }
  }

  // Select the last actual action response, not a nested result object
  // or an earlier JSON example echoed from the prompt.
  if (candidates.length > 0) {
    return candidates[candidates.length - 1];
  }

  throw new Error(
    'Could not find a valid outer FINAL or SEARCH JSON response.'
  );
}

function loadLatestQwenResponse(
  prefix = '8.0.4_response',
  directory = path.join(
    __dirname,
    '../promptFile'
  )
) {
  if (!fs.existsSync(directory)) {
    throw new Error(`Response directory not found: ${directory}`);
  }

  const files = fs.readdirSync(directory)
    .filter(file => file.startsWith(prefix))
    .map(file => {
      const fullPath = path.join(directory, file);

      return {
        file,
        fullPath,
        modified: fs.statSync(fullPath).mtimeMs
      };
    })
    .filter(item => fs.statSync(item.fullPath).isFile())
    .sort((a, b) => b.modified - a.modified);

  if (files.length === 0) {
    throw new Error(
      `No response file starting with "${prefix}" found in ${directory}`
    );
  }

  const latest = files[0];
  const rawText = fs.readFileSync(latest.fullPath, 'utf8');
  const response = extractJsonObject(rawText);

  console.log(`[8.0.4] Loaded response: ${latest.file}`);
  console.log(`[8.0.4] Qwen action: ${response.action}`);

  return {
    file: latest.fullPath,
    action: response.action,
    response,
    result: response.result || null
  };
}

const recovered = loadLatestQwenResponse('8.0.4_response');

if (recovered.action === 'FINAL') {
  const result = recovered.result;

  if (!result || !Array.isArray(result.functional_requirements)) {
    throw new Error('FINAL response does not contain functional_requirements.');
  }

  console.log(
    `[8.0.4] Recovered ${result.functional_requirements.length} functional requirements.`
  );

  console.log(JSON.stringify(result, null, 2));
}