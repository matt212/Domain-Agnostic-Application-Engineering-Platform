#!/bin/bash

# Configuration paths for your workspace files
P1_OUTPUT="app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b25.txt"
P2_PROMPT_TEMPLATE="app/utils/appflowgeneratorAI/promptFile/business-relations-prompt.txt"
TMP_COMPILE_P2="app/utils/appflowgeneratorAI/promptFile/tmp_p2_compiled.txt"
FINAL_ARCHITECTURE_OUTPUT="app/utils/appflowgeneratorAI/aiOutput/business-architecture-final.txt"

# Hard clean intermediate workspaces to protect against yesterday's run caches
rm -f "$TMP_COMPILE_P2"
rm -f "$FINAL_ARCHITECTURE_OUTPUT"

echo "🔄 PHASE 2: Copying JSON output after Assistant block..."
# Grabs everything in the text file that appears strictly after the "Assistant:" line
awk '/Assistant:/{flag=1; next} flag' "$P1_OUTPUT" > "$TMP_COMPILE_P2"

echo "🔍 STEP 2: Extracting variables from isolated JSON block..."
# Extract the CORE_DOMAIN string value (cleans out quotes and commas)
export BUSINESS_IDEA=$(grep '"CORE_DOMAIN"' "$TMP_COMPILE_P2" | sed 's/.*: *"\([^"]*\)".*/\1/')

# Extract the complete BusinessObjects flat array string block (collapses onto one line)
export PASSED_OBJECTS_ARRAY=$(sed -n '/"BusinessObjects": *\[/,/\]/p' "$TMP_COMPILE_P2" | tr -d '\n\r' | sed 's/.*"BusinessObjects": *//')

# Quick validation checkpoint loops to handle broken upstream generations safely
if [ -z "$BUSINESS_IDEA" ] || [ -z "$PASSED_OBJECTS_ARRAY" ]; then
  echo "❌ CRITICAL ERROR: Could not extract target parameters out of Pass 1 payload data."
  exit 1
fi

echo "📝 STEP 3: Injecting variables into Pass 2 layout file safely..."
# FIXED: Using envsubst completely prevents Mac vs Linux delimiter collisions.
# To make this work seamlessly, open your "business-relations-prompt.txt" template 
# file and modify the placeholders to use shell variable names: $BUSINESS_IDEA and $PASSED_OBJECTS_ARRAY
envsubst < "$P2_PROMPT_TEMPLATE" > "$TMP_COMPILE_P2"

echo "🤖 STEP 4: Executing Pass 2 Turn (Generating Relations & Lifecycles)..."
# Stream the generated configuration file via -f file flag to maximize local Qwen execution speeds
llama-cli \
  -hf Qwen/Qwen3-8B-GGUF:Q4_K_M \
  -ngl 99 \
  --single-turn \
  --reasoning off \
  -f "$TMP_COMPILE_P2" \
  -n 2048 \
  -o "$FINAL_ARCHITECTURE_OUTPUT"

# Clean intermediate generation scratchpad tracking tracks
rm -f "$TMP_COMPILE_P2"

echo "✅ Finished! Final architecture safely written to: $FINAL_ARCHITECTURE_OUTPUT"
