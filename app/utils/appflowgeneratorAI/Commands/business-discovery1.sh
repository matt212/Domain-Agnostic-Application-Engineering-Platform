#!/bin/bash

BUSINESS_IDEA="CRM"

PROMPT="$(cat app/utils/appflowgeneratorAI/promptFile/business-discovery-prompt8.txt)"

PROMPT="${PROMPT//\{\{BUSINESS_IDEA\}\}/$BUSINESS_IDEA}"
PROMPT="${PROMPT//\{\{SEARCH_RESULTS\}\}/$SEARCH_RESULTS}"

llama-cli \
  -hf Qwen/Qwen3-8B-GGUF:Q4_K_M \
  -ngl 99 \
  --single-turn \
  --reasoning off \
  -p "$PROMPT" \
  -n 2000 \
  -o app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b19.txt