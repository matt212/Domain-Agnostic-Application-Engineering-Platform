#!/bin/bash

BUSINESS_IDEA="online groceries store"

PROMPT="$(cat app/utils/appflowgeneratorAI/promptFile/business-discovery-prompt5.txt)"

PROMPT="${PROMPT//\{\{BUSINESS_IDEA\}\}/$BUSINESS_IDEA}"
PROMPT="${PROMPT//\{\{SEARCH_RESULTS\}\}/$SEARCH_RESULTS}"

llama-cli \
  -hf Qwen/Qwen3-8B-GGUF:Q4_K_M \
  -p "$PROMPT" \
  -n 10000 \
  -o app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b8.txt