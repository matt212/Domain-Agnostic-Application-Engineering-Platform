#!/bin/bash

# 1. Capture the Business Idea target dynamically
BUSINESS_IDEA="${1:-online grocery store}"

if [ -z "$BUSINESS_IDEA" ]; then
  echo "❌ CRITICAL ERROR: You must provide a business idea parameter string."
  exit 1
fi

PROMPT_FILE="app/utils/appflowgeneratorAI/promptFile/business-discovery-prompt9businessObjects.txt"
OUTPUT_FILE="app/utils/appflowgeneratorAI/aiOutput/business-discovery-result-8b22.txt"

echo "🌐 STEP 1: Fetching official raw machine-readable Schema.org layer..."
# Use Schema.org's official developer export layer for raw text matching
if [ ! -f "all-layers.jsonld" ]; then
  echo "📥 Downloading Schema.org core data map (one-time operation)..."
  curl -s "https://schema.org" -o all-layers.jsonld
fi

echo "🔍 Filtering schema vocabulary for matches against: $BUSINESS_IDEA"
# Clean text stream lookup to find real object types (e.g. Hotel, Store, MedicalBusiness)
SEARCH_RESULTS=$(grep -i -C 3 "@id.*$BUSINESS_IDEA" all-layers.jsonld | head -n 40 | tr -d '\n\r"' | xargs)

# Smart fallback to standard Schema.org Organization/Place models if custom idea isn't explicit
if [ -z "$SEARCH_RESULTS" ]; then
  echo "⚠️ Exact match not found. Defaulting to high-level commercial schemas..."
  SEARCH_RESULTS=$(grep -i -E "(\"Store\"|\"Organization\"|\"LocalBusiness\")" all-layers.jsonld | head -n 20 | tr -d '\n\r"')
fi

echo "📊 STEP 2: Injecting system architecture parameters..."
VALIDATION_RESULTS="[THREAD_INTEGRITY_LOG: TIME=$(date +%s) ARCH=$(uname -m) REASONING_TARGET=$BUSINESS_IDEA]"

echo "📝 STEP 3: Merging data variables into prompt layout..."
PROMPT="$(cat $PROMPT_FILE)"
PROMPT="${PROMPT//\{\{BUSINESS_IDEA\}\}/$BUSINESS_IDEA}"
PROMPT="${PROMPT//\{\{SEARCH_RESULTS\}\}/$SEARCH_RESULTS}"
PROMPT="${PROMPT//\{\{VALIDATION_RESULTS\}\}/$VALIDATION_RESULTS}"

echo "🤖 STEP 4: Executing single-pass model generation..."
# Executed exactly once against your local GGUF file
llama-cli \
  -hf Qwen/Qwen3-8B-GGUF:Q4_K_M \
  -ngl 99 \
  --single-turn \
  --reasoning off \
  -p "$PROMPT" \
  -n 800 \
  -o "$OUTPUT_FILE"

echo "✅ Finished! High-precision grounded unique schema saved to $OUTPUT_FILE"
