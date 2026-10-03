#!/bin/bash

# Define the variable targets dynamically
# BUSINESS_IDEA="CRM"
# BUSINESS_IDEA="online groceries store"
BUSINESS_IDEA="ERP"

# Load the single-variable standalone system prompt text file
PROMPT="$(cat app/utils/appflowgeneratorAI/promptFile/Business-discovery-prompt9businessObjects.txt)"

# Substitute the placeholder dynamically
PROMPT="${PROMPT//\{\{BUSINESS_IDEA\}\}/$BUSINESS_IDEA}"

# Execute llama-cli with single-turn reasoning disabled for fast raw JSON generation
llama-cli \
  -hf Qwen/Qwen3-8B-GGUF:Q4_K_M \
  -ngl 99 \
  --single-turn \
  --reasoning off \
  -p "$PROMPT" \
  -n 2000 \
  -o app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b21.txt
