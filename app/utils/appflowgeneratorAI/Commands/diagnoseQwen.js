
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.cwd();

const MODEL = 'unsloth/Qwen3.5-9B-GGUF:Q4_K_M';

const LLAMA_CLI =
    process.env.LLAMA_CLI_PATH ||
    path.resolve(ROOT, '../llama-metal/build/bin/llama-completion');

const PROMPT_FILE = process.argv[2];

const CONTEXT_SIZE = 8192;
const MAX_OUTPUT_TOKENS = 1600;
const THREADS = 8;
const GPU_LAYERS = 20;
const BATCH_SIZE = 512;
const TIMEOUT_MS = 600000;

const DEFAULT_PROMPT = `
You are a senior Business Analyst.

Generate all 12 dimensions of a functional User Story:
user_goal, preconditions, postconditions, trigger, main_flow,
alternative_flows, exception_flows, acceptance_criteria,
given_when_then, business_rules, success_criteria, direct_dependencies.

Use only supplied evidence. Do not invent business rules,
actors, systems, numerical targets or requirements.

Return exactly one valid JSON object.
No Markdown or commentary.

User Story:
A customer selects products, confirms a delivery address,
places an order, completes payment and receives confirmation.

Return this JSON structure:
{
  "user_story_id": "US-DIAGNOSTIC",
  "generated_dimensions": {
    "user_goal": "string",
    "preconditions": [],
    "postconditions": [],
    "trigger": "string",
    "main_flow": [],
    "alternative_flows": [],
    "exception_flows": [],
    "acceptance_criteria": [],
    "given_when_then": [],
    "business_rules": [],
    "success_criteria": [],
    "direct_dependencies": []
  }
}
`.trim();

function elapsed(start) {
    return (
        Number(process.hrtime.bigint() - start) / 1e9
    ).toFixed(2);
}

async function main() {
    if (!fs.existsSync(LLAMA_CLI)) {
        throw new Error(`llama-completion not found: ${LLAMA_CLI}`);
    }

    let prompt = DEFAULT_PROMPT;

    if (PROMPT_FILE) {
        if (!fs.existsSync(PROMPT_FILE)) {
            throw new Error(`Prompt file not found: ${PROMPT_FILE}`);
        }

        prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
    }

    if (!prompt.trim()) {
        throw new Error('Prompt is empty.');
    }

    const promptPath = path.join(
        ROOT,
        'qwen_diagnostic_prompt.tmp'
    );

    fs.writeFileSync(promptPath, prompt, 'utf8');

    const args = [
        '-hf', MODEL,
        '-ngl', String(GPU_LAYERS),
        '-no-cnv',
        '-c', String(CONTEXT_SIZE),
        '-b', String(BATCH_SIZE),
        '-t', String(THREADS),
        '--reasoning', 'off',
        '--flash-attn', 'off',
        '-n', String(MAX_OUTPUT_TOKENS),
        '-f', promptPath
    ];

    console.log('\n========== QWEN 9B METAL DIAGNOSTIC ==========\n');
    console.log('Model:', MODEL);
    console.log('Executable:', LLAMA_CLI);
    console.log('GPU layers:', GPU_LAYERS);
    console.log('CPU threads:', THREADS);
    console.log('Batch size:', BATCH_SIZE);
    console.log('Context:', CONTEXT_SIZE);
    console.log('Maximum output tokens:', MAX_OUTPUT_TOKENS);
    console.log('Prompt characters:', prompt.length.toLocaleString());
    console.log('Prompt source:', PROMPT_FILE || 'built-in diagnostic prompt');

    console.log('\nStarting inference...\n');

    const started = process.hrtime.bigint();

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(LLAMA_CLI, args, {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    const timeout = setTimeout(() => {
        timedOut = true;
        console.error('\nTIMEOUT: terminating inference...');
        child.kill('SIGTERM');

        setTimeout(() => {
            if (!settled) child.kill('SIGKILL');
        }, 5000).unref();
    }, TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', chunk => {
        stdout += chunk;
    });

    child.stderr.on('data', chunk => {
        stderr += chunk;
    });

    child.on('error', error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.error('\nSPAWN ERROR:', error);
        process.exitCode = 1;
    });

    child.on('close', (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        console.log('\n========== INFERENCE RESULTS ==========\n');

        console.log('Total runtime:', elapsed(started), 'seconds');
        console.log('Exit code:', code);
        console.log('Signal:', signal || 'none');
        console.log('Timed out:', timedOut);
        console.log('Output characters:', stdout.length.toLocaleString());

        console.log('\n========== PERFORMANCE BREAKDOWN ==========\n');

        const lines = stderr.split(/\r?\n/);

        const performanceLines = lines.filter(line =>
            /load time|prompt eval time|eval time|total time|tokens per second|tok\/s|n_tokens|sampling time/i.test(line)
        );

        if (performanceLines.length) {
            console.log(performanceLines.join('\n'));
        } else {
            console.log('No performance summary detected in stderr.');
        }

        console.log('\n========== COMPLETE STDERR ==========\n');
        console.log(stderr || '(empty)');

        console.log('\n========== GENERATED OUTPUT (LAST 3000 CHARACTERS) ==========\n');
        console.log(stdout.slice(-3000) || '(empty)');

        console.log('\n========== DIAGNOSTIC COMPLETE ==========\n');

        try {
            fs.unlinkSync(promptPath);
        } catch (_) {}

        if (timedOut || code !== 0 || !stdout.trim()) {
            process.exitCode = 1;
        }
    });
}

main().catch(error => {
    console.error('\nDIAGNOSTIC FAILED:', error.stack || error);
    process.exitCode = 1;
});
