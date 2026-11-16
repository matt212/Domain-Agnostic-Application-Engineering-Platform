
'use strict';

/**
 * 8.0.13 - DOMAIN-AGNOSTIC AI DIAGRAM GENERATOR
 *
 * Inputs:
 *   8.0.12.DiagramCommon.js
 *   PostgreSQL knowledge, requirements and business-rule repositories
 *
 * Principles:
 *   - No industry-specific scenario catalogue.
 *   - Diagram subjects and generation units are derived from repository data.
 *   - The repository baseline is contextual evidence, not a restriction.
 *   - AI may infer missing elements, but must mark them as inferred.
 *   - Every AI result is validated before rendering.
 *   - Failed AI generation falls back to the deterministic baseline.
 *   - Unit results are resumable.
 *   - One llama-server process is reused for the complete run.
 *   - Prompt caching is enabled for repeated shared prompt prefixes.
 *
 * Usage:
 *   node 8.0.13.ClaudeDiagramsAI.js
 *   node 8.0.13.ClaudeDiagramsAI.js --status
 *   node 8.0.13.ClaudeDiagramsAI.js --render
 *   node 8.0.13.ClaudeDiagramsAI.js --diagram "use case"
 *   node 8.0.13.ClaudeDiagramsAI.js --rerun --diagram all
 *   node 8.0.13.ClaudeDiagramsAI.js --rerun --failed
 *   node 8.0.13.ClaudeDiagramsAI.js --rerun --unit STATE-001
 *   node 8.0.13.ClaudeDiagramsAI.js --limit 2
 *
 * Environment:
 *   MODEL_NAME
 *   LLAMA_BACKEND=server|cli|auto
 *   LLAMA_SERVER_PATH
 *   LLAMA_CLI_PATH
 *   LLAMA_PORT
 *   LLAMA_CONTEXT
 *   THREADS
 *   BATCH_THREADS
 *   LLAMA_BATCH
 *   DIAGRAM_OUTPUT_DIR_AI
 *   DIAGRAM_TIMEOUT_MS
 *   DIAGRAM_TOKENS
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const C = require('./8.0.12.DiagramCommon.js');

const ROOT = process.cwd();

const MODEL =
    process.env.MODEL_NAME ||
    'unsloth/Qwen3.5-9B-GGUF';

const LLAMA_SERVER =
    process.env.LLAMA_SERVER_PATH ||
    'llama-server';

const LLAMA_CLI =
    process.env.LLAMA_CLI_PATH ||
    'llama-cli';

const OUTPUT_DIR =
    process.env.DIAGRAM_OUTPUT_DIR_AI ||
    path.join(
        ROOT,
        'app/utils/appflowgeneratorAI/aiOutput/diagrams/ai'
    );

const UNIT_DIR = path.join(OUTPUT_DIR, 'units');

const PROMPT_VERSION = '2';

const SETTINGS = {
    backend: String(
        process.env.LLAMA_BACKEND || 'server'
    ).toLowerCase(),

    context: Number(
        process.env.LLAMA_CONTEXT || 6144
    ),

    threads: Number(
        process.env.THREADS || 8
    ),

    batchThreads: Number(
        process.env.BATCH_THREADS || process.env.THREADS || 8
    ),

    llamaBatch: Number(
        process.env.LLAMA_BATCH || 256
    ),

    temperature: Number(
        process.env.LLAMA_TEMPERATURE || 0.2
    ),

    tokens: Number(
        process.env.DIAGRAM_TOKENS || 1800
    ),

    timeoutMs: Number(
        process.env.DIAGRAM_TIMEOUT_MS || 30 * 60 * 1000
    ),

    serverStartMs: Number(
        process.env.LLAMA_SERVER_START_MS || 10 * 60 * 1000
    ),

    heartbeatMs: Number(
        process.env.LLAMA_HEARTBEAT_MS || 30000
    ),

    retries: Number(
        process.env.DIAGRAM_RETRIES || 1
    ),

    contextChars: Number(
        process.env.DIAGRAM_CONTEXT_CHARS || 6500
    ),

    baselineChars: Number(
        process.env.DIAGRAM_BASELINE_CHARS || 6000
    ),

    maxUseCases: Number(
        process.env.DIAGRAM_MAX_USECASES || 30
    ),

    maxProcessNodes: Number(
        process.env.DIAGRAM_MAX_PROCESS_NODES || 30
    ),

    maxSequenceParticipants: Number(
        process.env.DIAGRAM_MAX_SEQUENCE_PARTICIPANTS || 16
    ),

    maxSequenceSteps: Number(
        process.env.DIAGRAM_MAX_SEQUENCE_STEPS || 60
    ),

    maxStates: Number(
        process.env.DIAGRAM_MAX_STATES || 16
    ),

    maxTransitions: Number(
        process.env.DIAGRAM_MAX_TRANSITIONS || 32
    ),

    maxDecisionInputs: Number(
        process.env.DIAGRAM_MAX_DECISION_INPUTS || 6
    ),

    maxDecisionOutputs: Number(
        process.env.DIAGRAM_MAX_DECISION_OUTPUTS || 5
    ),

    maxDecisionRows: Number(
        process.env.DIAGRAM_MAX_DECISION_ROWS || 30
    )
};

const {
    log,
    arr,
    uniq,
    cut,
    norm,
    same
} = C;

const NO_THINK = '<think>\n\n</think>\n\n';

const pad = n => String(n).padStart(3, '0');

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

/* ============================================================
   1. GENERAL HELPERS
============================================================ */

function createRunTimestamp(date = new Date()) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');

    return `${dd}_${mm}_${yy}_${hh}_${min}`;
}

function timestampedFilename(filename, timestamp) {
    const extension = path.extname(filename);
    const basename = path.basename(filename, extension);

    return `${basename}_${timestamp}${extension}`;
}

function clean(value, max = 120) {
    return cut(
        String(value ?? '').replace(/\s+/g, ' ').trim(),
        max
    );
}

function bool(value) {
    return value === true || /^true$/i.test(String(value));
}

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function ensureDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true });
}

function writeJson(file, value) {
    ensureDirectory(path.dirname(file));

    fs.writeFileSync(
        file,
        JSON.stringify(value, null, 2),
        'utf8'
    );
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function createId(prefix, index) {
    return `${prefix}-${pad(index + 1)}`;
}

function withIds(items, prefix, maximum) {
    const used = new Set();

    return safeArray(items)
        .slice(0, maximum)
        .map((item, index) => {
            const value = item && typeof item === 'object'
                ? item
                : {};

            let id = clean(value.id, 80) ||
                `${prefix}${index + 1}`;

            while (used.has(id)) {
                id = `${id}_${index + 1}`;
            }

            used.add(id);

            return {
                ...value,
                id
            };
        });
}

function resolver(items) {
    return reference => {
        const value = String(reference ?? '').trim();

        if (!value) return null;

        const byId = items.find(
            item => item.id === value
        );

        if (byId) return byId.id;

        const byName = items.find(
            item =>
                (item.name && same(item.name, value)) ||
                (item.label && same(item.label, value))
        );

        return byName ? byName.id : null;
    };
}

function compact(value, maximum) {
    const serialized = JSON.stringify(value);

    if (serialized.length <= maximum) {
        return serialized;
    }

    if (!value || typeof value !== 'object') {
        return serialized.slice(0, maximum);
    }

    const copy = JSON.parse(serialized);

    const arrays = Object.keys(copy)
        .filter(key => Array.isArray(copy[key]));

    while (JSON.stringify(copy).length > maximum) {
        const key = arrays
            .sort((a, b) =>
                copy[b].length - copy[a].length
            )[0];

        if (!key || copy[key].length <= 1) {
            break;
        }

        copy[key].pop();
    }

    return JSON.stringify(copy);
}

/* ============================================================
   2. DIAGRAM CATALOGUE
============================================================ */

/*
 * These are supported output formats, not business-domain
 * scenarios. Whether a diagram is generated is determined
 * by the available repository information.
 */

const DIAGRAMS = {
    usecase: {
        name: 'use case',
        file: '01_use_case_diagram.md',
        title: 'Use Case Diagram'
    },

    process: {
        name: 'process',
        file: '02_business_process_bpmn.md',
        title: 'Business Process Diagram'
    },

    sequence: {
        name: 'sequence',
        file: '03_sequence_diagram.md',
        title: 'Sequence Diagram'
    },

    state: {
        name: 'state',
        file: '04_state_machine_diagrams.md',
        title: 'State Machine Diagrams'
    },

    decision: {
        name: 'decision',
        file: '05_decision_table_dmn.md',
        title: 'Decision Table and Decision Requirements'
    }
};

function diagramKey(name) {
    const value = String(name || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');

    if (value === 'all') return 'all';

    if (value.startsWith('usecase')) return 'usecase';

    if (
        value.startsWith('process') ||
        value.startsWith('bpmn') ||
        value.startsWith('businessprocess')
    ) {
        return 'process';
    }

    if (value.startsWith('sequence')) return 'sequence';

    if (value.startsWith('state')) return 'state';

    if (
        value.startsWith('decision') ||
        value.startsWith('dmn')
    ) {
        return 'decision';
    }

    throw new Error(`Unknown diagram: ${name}`);
}

function parseArgs(argv) {
    const options = {
        rerun: false,
        failed: false,
        status: false,
        render: false,
        help: false,
        diagram: null,
        unit: null,
        limit: null
    };

    for (let i = 0; i < argv.length; i++) {
        const argument = argv[i];

        const nextValue = () => {
            const value = argv[++i];

            if (
                value === undefined ||
                value.startsWith('--')
            ) {
                throw new Error(
                    `${argument} requires a value`
                );
            }

            return value;
        };

        if (argument === '--rerun') {
            options.rerun = true;
        } else if (argument === '--failed') {
            options.failed = true;
        } else if (argument === '--status') {
            options.status = true;
        } else if (argument === '--render') {
            options.render = true;
        } else if (
            argument === '--help' ||
            argument === '-h'
        ) {
            options.help = true;
        } else if (argument === '--diagram') {
            options.diagram = diagramKey(nextValue());
        } else if (argument === '--unit') {
            options.unit = nextValue().toUpperCase();
        } else if (argument === '--limit') {
            options.limit = Number(nextValue());

            if (
                !Number.isInteger(options.limit) ||
                options.limit < 1
            ) {
                throw new Error('--limit must be a positive integer');
            }
        } else {
            throw new Error(
                `Unknown option: ${argument}`
            );
        }
    }

    if (
        options.rerun &&
        !options.diagram &&
        !options.unit &&
        !options.failed
    ) {
        throw new Error(
            '--rerun requires --diagram, --unit or --failed'
        );
    }

    return options;
}

const USAGE = `
Usage:
  node 8.0.13.ClaudeDiagramsAI.js [options]

Options:
  --diagram <name>    Select a supported diagram or all
  --rerun             Regenerate selected units
  --failed            Select failed units
  --unit <id>         Regenerate one unit
  --limit <n>         Generate only the first n selected units
  --status            Display unit status
  --render            Render saved results without AI
  --help              Display help

Environment:
  LLAMA_BACKEND=server|cli|auto
  MODEL_NAME
  LLAMA_SERVER_PATH
  LLAMA_CLI_PATH
  LLAMA_PORT
`;

/* ============================================================
   3. LLAMA SERVER AND CLI
============================================================ */

let server = null;
let runner = null;

function freePort() {
    return new Promise((resolve, reject) => {
        const listener = net.createServer();

        listener.once('error', reject);

        listener.listen(0, '127.0.0.1', () => {
            const address = listener.address();
            const port = address.port;

            listener.close(error => {
                if (error) reject(error);
                else resolve(port);
            });
        });
    });
}

function modelArgs() {
    const modelPath = process.env.MODEL_PATH;

    if (modelPath) {
        return ['-m', modelPath];
    }

    return ['-hf', MODEL];
}

async function startServer() {
    if (server) {
        return server.ready;
    }

    server = {
        child: null,
        url: null,
        ready: null
    };

    server.ready = (async () => {
        const port = Number(process.env.LLAMA_PORT) ||
            await freePort();

        const args = [
            ...modelArgs(),

            '-c',
            String(SETTINGS.context),

            '-t',
            String(SETTINGS.threads),

            '-tb',
            String(SETTINGS.batchThreads),

            '-b',
            String(SETTINGS.llamaBatch),

            '-ngl',
            '0',

            '-np',
            '1',

            '--host',
            '127.0.0.1',

            '--port',
            String(port)
        ];

        log(
            `Starting llama-server once for this run: ` +
            `${MODEL}; threads=${SETTINGS.threads}; port=${port}`
        );

        const child = spawn(
            LLAMA_SERVER,
            args,
            {
                cwd: ROOT,
                stdio: ['ignore', 'ignore', 'pipe']
            }
        );

        server.child = child;
        server.url = `http://127.0.0.1:${port}`;

        let stderrTail = '';
        let exitError = null;

        child.stderr.on('data', data => {
            stderrTail = (
                stderrTail + data.toString()
            ).slice(-4000);
        });

        child.on('error', error => {
            exitError = error;
        });

        child.on('exit', code => {
            if (!exitError) {
                exitError = new Error(
                    `llama-server exited (${code}): ` +
                    cut(stderrTail, 1000)
                );
            }
        });

        const started = Date.now();
        let lastHeartbeat = started;

        while (
            Date.now() - started <
            SETTINGS.serverStartMs
        ) {
            if (exitError) {
                throw exitError;
            }

            try {
                const response = await fetch(
                    `${server.url}/health`
                );

                if (response.ok) {
                    log(
                        `llama-server ready in ` +
                        `${Math.round((Date.now() - started) / 1000)}s`
                    );

                    return true;
                }
            } catch {
                // The server is not listening yet.
            }

            if (
                Date.now() - lastHeartbeat >
                SETTINGS.heartbeatMs
            ) {
                lastHeartbeat = Date.now();

                log(
                    `Waiting for llama-server: ` +
                    `${Math.round((Date.now() - started) / 1000)}s`
                );
            }

            await sleep(1000);
        }

        throw new Error(
            'llama-server startup timed out'
        );
    })();

    try {
        await server.ready;
    } catch (error) {
        stopServer();
        throw error;
    }
}

function stopServer() {
    if (
        server &&
        server.child &&
        server.child.exitCode === null
    ) {
        try {
            server.child.kill('SIGTERM');
        } catch {
            // Process may already have exited.
        }

        log('llama-server stopped');
    }

    server = null;
}

async function runServer(label, prompt, maxTokens) {
    await startServer();

    const started = Date.now();
    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        SETTINGS.timeoutMs
    );

    const heartbeat = setInterval(() => {
        log(
            `${label} running ` +
            `${Math.round((Date.now() - started) / 1000)}s`
        );
    }, SETTINGS.heartbeatMs);

    try {
        const response = await fetch(
            `${server.url}/completion`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                signal: controller.signal,

                body: JSON.stringify({
                    prompt,

                    n_predict: maxTokens,

                    temperature: SETTINGS.temperature,

                    cache_prompt: true,

                    stop: [
                        '<|im_end|>',
                        '<|endoftext|>'
                    ]
                })
            }
        );

        if (!response.ok) {
            throw new Error(
                `llama-server HTTP ${response.status}: ` +
                cut(await response.text(), 500)
            );
        }

        const result = await response.json();

        return String(
            result.content ??
            result.choices?.[0]?.text ??
            ''
        );
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Model request timed out');
        }

        throw error;
    } finally {
        clearTimeout(timeout);
        clearInterval(heartbeat);
    }
}

function runCli(label, prompt, maxTokens) {
    return new Promise((resolve, reject) => {
        const started = Date.now();

        let output = '';
        let stderr = '';
        let settled = false;

        const args = [
            ...modelArgs(),

            '-c',
            String(SETTINGS.context),

            '-n',
            String(maxTokens),

            '-t',
            String(SETTINGS.threads),

            '-b',
            String(SETTINGS.llamaBatch),

            '-ngl',
            '0',

            '--temp',
            String(SETTINGS.temperature),

            '--reasoning',
            'off',

            '--no-display-prompt',
            '--simple-io',
            '--log-disable',
            '-st',
            '-p',
            prompt
        ];

        const child = spawn(
            LLAMA_CLI,
            args,
            {
                cwd: ROOT,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        const finish = (error, value) => {
            if (settled) return;

            settled = true;

            clearTimeout(timeout);
            clearInterval(heartbeat);

            if (error) reject(error);
            else resolve(value);
        };

        const heartbeat = setInterval(() => {
            log(
                `${label} CLI running ` +
                `${Math.round((Date.now() - started) / 1000)}s; ` +
                `${output.length} output characters`
            );
        }, SETTINGS.heartbeatMs);

        const timeout = setTimeout(() => {
            try {
                child.kill('SIGKILL');
            } catch {
                // Already terminated.
            }

            finish(new Error('CLI model request timed out'));
        }, SETTINGS.timeoutMs);

        child.stdout.on('data', data => {
            output += data.toString();
        });

        child.stderr.on('data', data => {
            stderr = (
                stderr + data.toString()
            ).slice(-3000);
        });

        child.on('error', error => {
            finish(error);
        });

        child.on('close', code => {
            if (code !== 0) {
                finish(
                    new Error(
                        `llama-cli exited with code ${code}: ` +
                        cut(stderr, 1000)
                    )
                );

                return;
            }

            finish(null, output);
        });
    });
}

async function runModel(label, prompt, maxTokens) {
    const backend = SETTINGS.backend;

    if (backend === 'cli') {
        return runCli(label, prompt, maxTokens);
    }

    if (backend === 'server') {
        return runServer(label, prompt, maxTokens);
    }

    if (backend === 'auto') {
        try {
            return await runServer(
                label,
                prompt,
                maxTokens
            );
        } catch (error) {
            log(
                `Server unavailable; falling back to llama-cli: ` +
                error.message
            );

            stopServer();

            return runCli(
                label,
                prompt,
                maxTokens
            );
        }
    }

    throw new Error(
        `Unsupported LLAMA_BACKEND: ${backend}`
    );
}

runner = runModel;

function setRunner(fn) {
    runner = fn;
}

/* ============================================================
   4. JSON EXTRACTION
============================================================ */

function extractJson(raw) {
    const text = String(raw)
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();

    const start = text.indexOf('{');

    if (start < 0) {
        throw new Error('No JSON object in model output');
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const character = text[i];

        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === '"') {
                inString = false;
            }

            continue;
        }

        if (character === '"') {
            inString = true;
        } else if (character === '{') {
            depth++;
        } else if (character === '}') {
            depth--;

            if (depth === 0) {
                return JSON.parse(
                    text.slice(start, i + 1)
                );
            }
        }
    }

    throw new Error(
        'Incomplete JSON output; increase DIAGRAM_TOKENS or reduce context'
    );
}

async function ask(label, promptFactory, parser) {
    let hint = '';
    let lastError = '';

    for (
        let attempt = 0;
        attempt <= SETTINGS.retries;
        attempt++
    ) {
        try {
            const raw = await runner(
                `${label} attempt ${attempt + 1}`,
                promptFactory(hint),
                SETTINGS.tokens
            );

            const parsed = extractJson(raw);

            return {
                ok: true,
                value: parser(parsed)
            };
        } catch (error) {
            lastError = error.message;
            hint = error.message;

            log(
                `${label} attempt ${attempt + 1} rejected: ` +
                error.message
            );
        }
    }

    return {
        ok: false,
        error: lastError
    };
}

/* ============================================================
   5. VALIDATORS
============================================================ */

function validateUseCase(raw, fallbackSystem) {
    const actors = withIds(
        raw.actors,
        'a',
        SETTINGS.maxUseCases
    ).map(actor => ({
        id: actor.id,
        name: clean(actor.name, 80),

        kind:
            /system|automat/i.test(actor.kind)
                ? 'system'
                : /external|third|organisation|organization/i.test(actor.kind)
                    ? 'external'
                    : 'internal',

        inferred: bool(actor.inferred)
    })).filter(actor => actor.name);

    const useCases = withIds(
        raw.use_cases,
        'u',
        SETTINGS.maxUseCases
    ).map(item => ({
        id: item.id,
        name: clean(item.name, 100),
        inferred: bool(item.inferred)
    })).filter(item => item.name);

    const resolveActor = resolver(actors);
    const resolveUseCase = resolver(useCases);

    const links = [];

    safeArray(raw.links).forEach(link => {
        const actor = resolveActor(link.actor);
        const useCase = resolveUseCase(
            link.use_case || link.usecase
        );

        if (
            actor &&
            useCase &&
            !links.some(
                item =>
                    item.actor === actor &&
                    item.use_case === useCase
            )
        ) {
            links.push({
                actor,
                use_case: useCase,
                kind: /support/i.test(link.kind)
                    ? 'supporting'
                    : 'primary'
            });
        }
    });

    const includes = [];

    safeArray(raw.includes).forEach(item => {
        const from = resolveUseCase(item.from);
        const to = resolveUseCase(item.to);

        if (from && to && from !== to) {
            includes.push({
                from,
                to,
                kind: /extend/i.test(item.kind)
                    ? 'extend'
                    : 'include'
            });
        }
    });

    if (!actors.length) {
        throw new Error('No usable actors');
    }

    if (useCases.length < 2) {
        throw new Error('At least two use cases are required');
    }

    if (!links.length) {
        throw new Error('No valid actor/use-case associations');
    }

    return {
        title: clean(raw.title, 100),
        system_name: clean(raw.system_name, 100) || fallbackSystem,
        actors,
        use_cases: useCases,
        links,
        includes
    };
}

function validateProcess(raw) {
    let nodes = withIds(
        raw.nodes,
        'n',
        SETTINGS.maxProcessNodes
    ).map(node => ({
        id: node.id,
        label: clean(node.label, 100),
        inferred: bool(node.inferred),

        type:
            /start/i.test(node.type)
                ? 'start'
                : /end|finish/i.test(node.type)
                    ? 'end'
                    : /decision|gateway/i.test(node.type)
                        ? 'decision'
                        : /exception|error/i.test(node.type)
                            ? 'exception'
                            : 'task',

        lane: clean(node.lane, 80)
    })).filter(node =>
        node.label ||
        node.type === 'start' ||
        node.type === 'end'
    );

    nodes.forEach(node => {
        if (!node.label) {
            node.label =
                node.type === 'start' ? 'Start' : 'End';
        }

        if (
            node.type === 'start' ||
            node.type === 'end'
        ) {
            node.lane = '';
        }
    });

    const firstStart = nodes.find(
        node => node.type === 'start'
    );

    nodes = nodes.filter(
        node =>
            node.type !== 'start' ||
            node === firstStart
    );

    const resolve = resolver(nodes);
    const flows = [];

    safeArray(raw.flows).forEach(flow => {
        const from = resolve(flow.from);
        const to = resolve(flow.to);

        if (
            !from ||
            !to ||
            from === to ||
            flows.some(
                item =>
                    item.from === from &&
                    item.to === to
            )
        ) {
            return;
        }

        const destination = nodes.find(
            node => node.id === to
        );

        flows.push({
            from,
            to,
            label: clean(flow.label, 80),

            kind:
                /exception|fail/i.test(flow.kind) ||
                destination?.type === 'exception'
                    ? 'exception'
                    : 'normal'
        });
    });

    nodes = nodes.filter(
        node =>
            flows.some(
                flow =>
                    flow.from === node.id ||
                    flow.to === node.id
            )
    );

    if (
        nodes.filter(node => node.type === 'task').length < 2
    ) {
        throw new Error(
            'Insufficient connected process tasks'
        );
    }

    if (!nodes.some(node => node.type === 'start')) {
        const first = nodes.find(
            node =>
                !flows.some(flow => flow.to === node.id) &&
                node.type !== 'exception'
        ) || nodes[0];

        nodes.unshift({
            id: 'start',
            type: 'start',
            label: 'Start',
            lane: ''
        });

        flows.unshift({
            from: 'start',
            to: first.id,
            label: '',
            kind: 'normal'
        });
    }

    if (!nodes.some(node => node.type === 'end')) {
        const last = [...nodes].reverse().find(
            node =>
                node.type === 'task' &&
                !flows.some(flow => flow.from === node.id)
        ) || [...nodes].reverse().find(
            node => node.type === 'task'
        );

        if (last) {
            nodes.push({
                id: 'finish',
                type: 'end',
                label: 'End',
                lane: ''
            });

            flows.push({
                from: last.id,
                to: 'finish',
                label: '',
                kind: 'normal'
            });
        }
    }

    return {
        title: clean(raw.title, 100),
        nodes,
        flows
    };
}

function validateSequence(raw) {
    const participants = withIds(
        raw.participants,
        'p',
        SETTINGS.maxSequenceParticipants
    ).map(participant => ({
        id: participant.id,
        name: clean(participant.name, 80),

        kind:
            /participant|system/i.test(participant.kind)
                ? 'participant'
                : 'actor'
    })).filter(participant => participant.name);

    if (participants.length < 2) {
        throw new Error('At least two participants are required');
    }

    const resolve = resolver(participants);
    const steps = [];

    let depth = 0;

    safeArray(raw.steps)
        .slice(0, SETTINGS.maxSequenceSteps)
        .forEach(step => {
            const type =
                /note/i.test(step.type)
                    ? 'note'
                    : /^else/i.test(step.type)
                        ? 'else'
                        : /^alt/i.test(step.type)
                            ? 'alt'
                            : /^end/i.test(step.type)
                                ? 'end'
                                : 'message';

            const inferred = bool(step.inferred);

            if (type === 'message') {
                const from = resolve(step.from);
                const to = resolve(step.to);

                if (
                    !from ||
                    !to ||
                    !clean(step.text)
                ) {
                    return;
                }

                steps.push({
                    type,
                    from,
                    to,
                    text: clean(step.text, 120),

                    style:
                        from === to
                            ? 'self'
                            : /dash|return|async|reply/i.test(step.style)
                                ? 'dashed'
                                : 'sync',

                    inferred
                });

            } else if (type === 'note') {
                const over = uniq(
                    arr(step.over)
                        .concat(step.from ? [step.from] : [])
                        .map(resolve)
                );

                if (!over.length || !clean(step.text)) {
                    return;
                }

                steps.push({
                    type,
                    over,
                    text: clean(step.text, 120),
                    inferred
                });

            } else if (type === 'alt') {
                depth++;

                steps.push({
                    type,
                    text: clean(step.text, 100) || 'Condition',
                    inferred
                });

            } else if (type === 'else') {
                if (depth) {
                    steps.push({
                        type,
                        text: clean(step.text, 100) || 'Otherwise',
                        inferred
                    });
                }

            } else if (type === 'end') {
                if (depth) {
                    depth--;
                    steps.push({ type });
                }
            }
        });

    while (depth > 0) {
        steps.push({ type: 'end' });
        depth--;
    }

    if (
        steps.filter(step => step.type === 'message').length < 2
    ) {
        throw new Error('Insufficient valid sequence messages');
    }

    return {
        title: clean(raw.title, 100),
        participants,
        steps
    };
}

function validateState(raw, objectName) {
    const states = withIds(
        raw.states,
        's',
        SETTINGS.maxStates
    ).map(state => ({
        id: state.id,
        name: clean(state.name, 80),
        inferred: bool(state.inferred)
    })).filter(state => state.name);

    if (states.length < 2) {
        throw new Error('At least two states are required');
    }

    const resolve = resolver(states);
    const transitions = [];

    safeArray(raw.transitions)
        .slice(0, SETTINGS.maxTransitions)
        .forEach(transition => {
            const from = resolve(transition.from);
            const to = resolve(transition.to);

            if (from && to) {
                transitions.push({
                    from,
                    to,
                    event: clean(transition.event, 80),
                    guard: clean(transition.guard, 100),
                    inferred: bool(transition.inferred)
                });
            }
        });

    if (!transitions.length) {
        throw new Error('No valid state transitions');
    }

    const initial =
        resolve(raw.initial) ||
        states[0].id;

    let finals = uniq(
        arr(raw.finals).map(resolve)
    );

    if (!finals.length) {
        finals = states
            .filter(state =>
                !transitions.some(
                    transition =>
                        transition.from === state.id
                ) &&
                state.id !== initial
            )
            .map(state => state.id);
    }

    const notes = safeArray(raw.notes)
        .map(note => ({
            state: resolve(note.state),
            text: clean(note.text, 120)
        }))
        .filter(note => note.state && note.text);

    return {
        object: clean(raw.object, 100) || objectName,
        states,
        transitions,
        notes,
        initial,
        finals
    };
}

const HIT_POLICIES = {
    U: 'U (Unique)',
    A: 'A (Any)',
    P: 'P (Priority)',
    F: 'F (First)',
    R: 'R (Rule order)',
    O: 'O (Output order)',
    C: 'C (Collect)'
};

function validateDecision(raw, model) {
    const inputs = arr(raw.inputs)
        .map(value =>
            clean(
                typeof value === 'object'
                    ? value.name
                    : value,
                80
            )
        )
        .filter(Boolean)
        .slice(0, SETTINGS.maxDecisionInputs);

    const outputs = arr(raw.outputs)
        .map(value =>
            clean(
                typeof value === 'object'
                    ? value.name
                    : value,
                80
            )
        )
        .filter(Boolean)
        .slice(0, SETTINGS.maxDecisionOutputs);

    if (!inputs.length || !outputs.length) {
        throw new Error(
            'Decision table requires input and output columns'
        );
    }

    const ruleReferences = new Map(
        model.rules.map(rule => [rule.ref, rule])
    );

    const fit = (values, length) =>
        Array.from(
            { length },
            (_, index) =>
                clean(arr(values)[index], 160) || '-'
        );

    const rows = arr(raw.rows)
        .slice(0, SETTINGS.maxDecisionRows)
        .map(row => {
            const rule = ruleReferences.get(
                String(row.rule || '').trim()
            );

            return {
                when: fit(row.when, inputs.length),
                then: fit(row.then, outputs.length),

                rule: rule ? rule.ref : '',
                type: rule ? rule.type : '',
                severity: rule ? rule.severity : '',
                enforcement: rule ? rule.enforcement : '',

                basis:
                    bool(row.inferred)
                        ? 'inferred'
                        : rule
                            ? rule.basis
                            : '',

                inferred: bool(row.inferred)
            };
        })
        .filter(row =>
            row.when.some(value => value !== '-') ||
            row.then.some(value => value !== '-')
        );

    if (rows.length < 1) {
        throw new Error('No usable decision rows');
    }

    const key = String(
        raw.hit_policy || 'C'
    ).trim().toUpperCase()[0];

    return {
        name: clean(raw.name, 100),
        hit_policy: HIT_POLICIES[key] || HIT_POLICIES.C,
        inputs,
        outputs,
        rows
    };
}

function countInferred(spec) {
    const collections = [
        'actors',
        'use_cases',
        'nodes',
        'flows',
        'steps',
        'states',
        'transitions',
        'rows'
    ];

    return collections.reduce(
        (total, key) =>
            total +
            arr(spec[key]).filter(
                item => item && item.inferred
            ).length,
        0
    );
}

/* ============================================================
   6. DATA-DRIVEN UNIT DISCOVERY
============================================================ */

function buildUnits(model) {
    const units = [];

    const hasActors = arr(model.actors).length > 0;
    const hasObjects = arr(model.objects).length > 0;
    const hasActivities = arr(model.activities).length > 0;
    const hasInformation = arr(model.irs).length > 0;
    const hasRequirements =
        arr(model.brs).length > 0 ||
        arr(model.frs).length > 0;

    const hasRules = arr(model.rules).length > 0;

    /*
     * Use case units are based on whatever deterministic
     * use-case views the repository can actually produce.
     */
    if (
        hasActors &&
        (hasActivities || hasRequirements)
    ) {
        const specs = C.buildUseCaseSpecs(model);

        specs.forEach((baseline, index) => {
            if (
                !baseline ||
                !arr(baseline.actors).length ||
                !arr(baseline.use_cases).length
            ) {
                return;
            }

            units.push({
                id: `USECASE-${index + 1}`,
                diagram: 'usecase',
                title: baseline.title || `Use case view ${index + 1}`,
                subject: null,
                baseline,

                focus:
                    'Derive the system capabilities and actor interactions ' +
                    'from all relevant repository evidence. Identify missing ' +
                    'actors, goals, relationships and supporting use cases ' +
                    'where justified by the evidence.'
            });
        });
    }

    /*
     * A process unit is created only when activities exist.
     * No fixed process scenario is imposed.
     */
    if (hasActivities) {
        units.push({
            id: 'PROCESS-001',
            diagram: 'process',
            title: 'Repository-derived process',
            subject: null,
            baseline: C.buildProcessSpec(model),

            focus:
                'Derive the relevant process flow from the available ' +
                'activities, stages, actors, objects, information, ' +
                'requirements and rules. Identify triggers, outcomes, ' +
                'decisions, alternate paths and exceptions only where ' +
                'supported or reasonably inferred from the evidence.'
        });
    }

    /*
     * Sequence generation is based on the available interaction
     * evidence. No transaction, payment, dispute or other scenario
     * is assumed in advance.
     */
    if (
        hasActivities ||
        hasInformation ||
        hasActors
    ) {
        const baseline = C.buildSequenceSpec(model);

        if (
            arr(baseline.participants).length >= 2 &&
            arr(baseline.steps).length > 0
        ) {
            units.push({
                id: 'SEQUENCE-001',
                diagram: 'sequence',
                title: 'Repository-derived interactions',
                subject: null,
                baseline,

                focus:
                    'Derive meaningful interactions between the actors ' +
                    'and participants from the available evidence. Select ' +
                    'the interactions that best explain the system behaviour. ' +
                    'Do not assume any particular transaction or industry ' +
                    'scenario. Include alternate paths where justified.'
            });
        }
    }

    /*
     * State units are created per repository business object.
     */
    if (hasObjects) {
        const stateSpecs = C.buildStateSpecs(model);

        arr(model.objects).forEach((object, index) => {
            const baseline =
                stateSpecs.find(
                    item => same(item.object, object.name)
                ) || {
                    object: object.name,
                    states: [],
                    transitions: []
                };

            units.push({
                id: `STATE-${pad(index)}`,
                diagram: 'state',
                title: object.name,
                subject: object.name,
                baseline,

                focus:
                    `Derive the lifecycle of "${object.name}" from ` +
                    'the repository evidence. Identify meaningful states, ' +
                    'events, transitions, guards, terminal conditions and ' +
                    'abnormal states where applicable. Do not invent a ' +
                    'lifecycle where the evidence does not support one.'
            });
        });
    }

    /*
     * Decision units are derived from the actual decision specs
     * produced from repository rules.
     */
    if (hasRules) {
        const decisionSpecs = C.buildDecisionSpecs(model);

        arr(decisionSpecs.tables).forEach((table, index) => {
            units.push({
                id: `DECISION-${pad(index)}`,
                diagram: 'decision',
                title: table.name || table.subject,
                subject: table.subject,
                baseline: table,

                focus:
                    `Derive the decision model for "${table.subject}". ` +
                    'Use the actual rules and related requirements to ' +
                    'identify inputs, conditions, outputs and outcomes. ' +
                    'Do not introduce conditions or outcomes unsupported ' +
                    'by the evidence unless explicitly marked as inferred.'
            });
        });
    }

    return units;
}

/* ============================================================
   7. UNIT STORAGE AND RESUMABILITY
============================================================ */

function unitPath(unit) {
    return path.join(
        UNIT_DIR,
        `${unit.id}.json`
    );
}

function readUnit(unit) {
    return readJson(unitPath(unit));
}

function inputHash(unit) {
    return C.shortHash(
        JSON.stringify([
            PROMPT_VERSION,
            unit.id,
            unit.diagram,
            unit.subject,
            unit.focus,
            unit.baseline
        ])
    );
}

function unitState(unit) {
    const result = readUnit(unit);

    if (!result) return 'pending';

    if (result.status === 'ok') {
        return result.input_hash === inputHash(unit)
            ? 'ok'
            : 'stale';
    }

    return 'failed';
}

/* ============================================================
   8. MODEL CONTEXT
============================================================ */

function contextFor(unit, model) {
    const lines = [];

    lines.push(
        `System: ${model.systemName || 'System'}`
    );

    if (model.domain) {
        lines.push(`Domain context: ${model.domain}`);
    }

    if (model.niche) {
        lines.push(`Business context: ${model.niche}`);
    }

    if (arr(model.actors).length) {
        lines.push(
            '',
            'ACTORS AND RESPONSIBILITIES:'
        );

        model.actors.forEach(actor => {
            lines.push(
                `- ${actor.name}; type=${actor.kind}; ` +
                `role=${clean(actor.role, 180)}`
            );
        });
    }

    if (arr(model.stages).length) {
        lines.push(
            '',
            'BUSINESS STAGES:'
        );

        model.stages.forEach(stage => {
            lines.push(
                `- ${stage.name}; ` +
                `description=${clean(stage.desc, 160)}; ` +
                `trigger=${clean(stage.trigger, 160)}`
            );
        });
    }

    if (arr(model.objects).length) {
        lines.push(
            '',
            'BUSINESS OBJECTS:'
        );

        model.objects.forEach(object => {
            lines.push(
                `- ${object.name}; ` +
                `purpose=${clean(object.purpose, 180)}; ` +
                `lifecycle=${clean(object.lifecycle, 180)}; ` +
                `dependencies=${arr(object.deps).join(', ')}`
            );
        });
    }

    if (arr(model.activities).length) {
        lines.push(
            '',
            'BUSINESS ACTIVITIES:'
        );

        model.activities.forEach((activity, index) => {
            lines.push(
                `${index + 1}. ${activity.name}; ` +
                `stage=${activity.stage || '-'}; ` +
                `primary=${activity.primary || '-'}; ` +
                `supporting=${arr(activity.supporting).join(', ')}; ` +
                `inputs=${arr(activity.inputs).join(', ')}; ` +
                `outputs=${arr(activity.outputs).join(', ')}; ` +
                `precondition=${clean(activity.precondition, 150)}; ` +
                `outcome=${clean(activity.outcome, 150)}`
            );
        });
    }

    if (arr(model.interactions).length) {
        lines.push(
            '',
            'ACTOR AND OBJECT INTERACTIONS:'
        );

        model.interactions.forEach(interaction => {
            lines.push(
                `- ${interaction.actor} -> ${interaction.object}; ` +
                `${interaction.type}; ${clean(interaction.desc, 150)}`
            );
        });
    }

    if (arr(model.irs).length) {
        lines.push(
            '',
            'INFORMATION REQUIREMENTS AND FLOWS:'
        );

        model.irs.forEach(requirement => {
            lines.push(
                `- ${requirement.label}; ` +
                `description=${clean(requirement.description, 150)}; ` +
                `source=${requirement.source || '-'}; ` +
                `trigger=${requirement.trigger || '-'}; ` +
                `consumers=${arr(requirement.consumers).join(', ')}; ` +
                `activities=${arr(requirement.activities).join(', ')}`
            );
        });
    }

    if (arr(model.frs).length) {
        lines.push(
            '',
            'FUNCTIONAL REQUIREMENTS:'
        );

        model.frs.forEach(requirement => {
            lines.push(
                `- ${requirement.id}: ${requirement.text}; ` +
                `need=${requirement.need || '-'}`
            );
        });
    }

    if (arr(model.brs).length) {
        lines.push(
            '',
            'BUSINESS REQUIREMENTS:'
        );

        model.brs.forEach(requirement => {
            lines.push(
                `- ${requirement.id}: ${requirement.name}; ` +
                `requirement=${clean(requirement.requirement, 200)}; ` +
                `objective=${clean(requirement.objective, 150)}; ` +
                `stakeholders=${arr(requirement.stakeholders).join(', ')}; ` +
                `linked FRs=${arr(requirement.frs).join(', ')}`
            );
        });
    }

    if (arr(model.rules).length) {
        lines.push(
            '',
            'BUSINESS RULES:'
        );

        model.rules.forEach(rule => {
            lines.push(
                `- ${rule.ref}; ${rule.name}; ` +
                `type=${rule.type}; ` +
                `statement=${clean(rule.statement, 220)}; ` +
                `condition=${clean(rule.condition, 160)}; ` +
                `exceptions=${arr(rule.exceptions).join(', ')}; ` +
                `actors=${arr(rule.actors).join(', ')}; ` +
                `objects=${arr(rule.objects).join(', ')}; ` +
                `outcome=${clean(rule.ifViolated, 160)}; ` +
                `basis=${rule.basis || '-'}`
            );
        });
    }

    lines.push(
        '',
        'UNIT SUBJECT:',
        unit.subject || 'Derived from the complete available evidence'
    );

    return cut(
        lines.join('\n'),
        SETTINGS.contextChars
    );
}

/* ============================================================
   9. PROMPTS AND OUTPUT CONTRACTS
============================================================ */

const COMMON_PROMPT = `
You are an experienced business analyst.

Your task is to produce one diagram specification from the supplied
business-analysis evidence.

The evidence may be incomplete, inconsistent, duplicated or ambiguous.

The repository baseline is contextual evidence. It is not a restriction,
and it is not automatically correct.

Analyse the available information independently.

Rules:

1. Do not assume an industry, business model, product, transaction type,
   workflow, actor, object, rule or lifecycle that is not supported by
   the supplied evidence.

2. Do not force the information into a predefined business scenario.

3. Derive the diagram from the actual actors, objects, activities,
   stages, information requirements, functional requirements,
   business requirements and business rules supplied.

4. Preserve valid baseline information.

5. Correct baseline information when the evidence demonstrates that
   it is incorrect.

6. Add missing elements only when they are logically justified by
   the supplied information or necessary to make the diagram coherent.

7. Mark every element that you infer with "inferred": true.

8. Do not mark repository-supported elements as inferred.

9. Do not invent facts, actors, business rules, outcomes or relationships.

10. Use business language. Do not introduce implementation technologies,
    databases, APIs, screens or infrastructure.

11. Use only IDs that you define in your JSON response.

12. Return one valid JSON object only. No Markdown and no commentary.
`;

const SCHEMAS = {
    usecase: `
{
  "title": "",
  "system_name": "",
  "actors": [
    {
      "id": "a1",
      "name": "",
      "kind": "human or external or system",
      "inferred": false
    }
  ],
  "use_cases": [
    {
      "id": "u1",
      "name": "",
      "inferred": false
    }
  ],
  "links": [
    {
      "actor": "a1",
      "use_case": "u1",
      "kind": "primary or supporting"
    }
  ],
  "includes": [
    {
      "from": "u1",
      "to": "u2",
      "kind": "include or extend"
    }
  ]
}`,

    process: `
{
  "title": "",
  "nodes": [
    {
      "id": "n1",
      "type": "start or task or decision or exception or end",
      "lane": "",
      "label": "",
      "inferred": false
    }
  ],
  "flows": [
    {
      "from": "n1",
      "to": "n2",
      "label": "",
      "kind": "normal or exception"
    }
  ]
}`,

    sequence: `
{
  "title": "",
  "participants": [
    {
      "id": "p1",
      "name": "",
      "kind": "actor or participant"
    }
  ],
  "steps": [
    {
      "type": "message",
      "from": "p1",
      "to": "p2",
      "text": "",
      "style": "sync or dashed",
      "inferred": false
    },
    {
      "type": "note",
      "over": ["p1"],
      "text": "",
      "inferred": false
    },
    {
      "type": "alt",
      "text": "",
      "inferred": false
    },
    {
      "type": "else",
      "text": ""
    },
    {
      "type": "end"
    }
  ]
}`,

    state: `
{
  "object": "",
  "states": [
    {
      "id": "s1",
      "name": "",
      "inferred": false
    }
  ],
  "initial": "s1",
  "finals": ["s2"],
  "transitions": [
    {
      "from": "s1",
      "to": "s2",
      "event": "",
      "guard": "",
      "inferred": false
    }
  ],
  "notes": [
    {
      "state": "s1",
      "text": ""
    }
  ]
}`,

    decision: `
{
  "name": "",
  "hit_policy": "U or A or P or F or C",
  "inputs": ["input column"],
  "outputs": ["output column"],
  "rows": [
    {
      "when": ["input condition"],
      "then": ["decision outcome"],
      "rule": "",
      "inferred": false
    }
  ]
}`
};

const CAPS = {
    usecase:
        `Maximum ${SETTINGS.maxUseCases} use cases and actors`,

    process:
        `Maximum ${SETTINGS.maxProcessNodes} nodes. ` +
        'All nodes must be connected.',

    sequence:
        `Maximum ${SETTINGS.maxSequenceParticipants} participants ` +
        `and ${SETTINGS.maxSequenceSteps} steps. ` +
        'Close every alternative block.',

    state:
        `Maximum ${SETTINGS.maxStates} states and ` +
        `${SETTINGS.maxTransitions} transitions.`,

    decision:
        `Maximum ${SETTINGS.maxDecisionInputs} input columns, ` +
        `${SETTINGS.maxDecisionOutputs} output columns and ` +
        `${SETTINGS.maxDecisionRows} rows.`
};

function promptFor(unit, model, hint) {
    return `<|im_start|>system
${COMMON_PROMPT}

DIAGRAM TYPE:
${unit.diagram}

OUTPUT STRUCTURE:
${SCHEMAS[unit.diagram]}

OUTPUT SIZE:
${CAPS[unit.diagram]}

<|im_end|>
<|im_start|>user
GENERATION OBJECTIVE:
${unit.focus}

REPOSITORY EVIDENCE:
${contextFor(unit, model)}

DETERMINISTIC BASELINE:
${compact(unit.baseline, SETTINGS.baselineChars)}

${hint ? `PREVIOUS VALIDATION ERROR:\n${hint}\nCorrect the response.\n` : ''}

Return only the JSON object.
<|im_end|>
<|im_start|>assistant
${NO_THINK}`;
}

function parserFor(unit, model) {
    switch (unit.diagram) {
        case 'usecase':
            return raw =>
                validateUseCase(raw, model.systemName);

        case 'process':
            return validateProcess;

        case 'sequence':
            return validateSequence;

        case 'state':
            return raw =>
                validateState(raw, unit.subject);

        case 'decision':
            return raw =>
                validateDecision(raw, model);

        default:
            throw new Error(
                `No parser for diagram ${unit.diagram}`
            );
    }
}

/* ============================================================
   10. GENERATE UNITS
============================================================ */

function selectUnits(units, options) {
    let selected = units;

    if (
        options.diagram &&
        options.diagram !== 'all'
    ) {
        selected = selected.filter(
            unit => unit.diagram === options.diagram
        );
    }

    if (options.unit) {
        selected = selected.filter(
            unit => unit.id === options.unit
        );

        if (!selected.length) {
            throw new Error(
                `Unit not found: ${options.unit}`
            );
        }
    }

    if (options.failed) {
        selected = selected.filter(
            unit => unitState(unit) === 'failed'
        );
    }

    return selected;
}

async function runUnit(unit, model) {
    const started = Date.now();

    const result = await ask(
        unit.id,
        hint => promptFor(unit, model, hint),
        parserFor(unit, model)
    );

    const previous = readUnit(unit);

    if (result.ok) {
        const value = {
            unit_id: unit.id,
            diagram: unit.diagram,
            title: unit.title,
            subject: unit.subject || null,

            status: 'ok',

            input_hash: inputHash(unit),

            model: MODEL,

            generated_at: new Date().toISOString(),

            seconds: Math.round(
                (Date.now() - started) / 1000
            ),

            inferred_elements: countInferred(result.value),

            spec: result.value
        };

        writeJson(unitPath(unit), value);

        log(
            `${unit.id} completed in ${value.seconds}s; ` +
            `${value.inferred_elements} inferred element(s)`
        );

        return true;
    }

    /*
     * A failed forced rerun must not overwrite a previous
     * successful result.
     */
    if (previous && previous.status === 'ok') {
        log(
            `${unit.id} failed; previous successful result retained. ` +
            result.error
        );

        return false;
    }

    writeJson(unitPath(unit), {
        unit_id: unit.id,
        diagram: unit.diagram,
        title: unit.title,
        subject: unit.subject || null,

        status: 'failed',

        input_hash: inputHash(unit),

        model: MODEL,

        generated_at: new Date().toISOString(),

        error: result.error
    });

    log(
        `${unit.id} failed: ${result.error}. ` +
        'The deterministic baseline will be used.'
    );

    return false;
}

function printStatus(units) {
    console.log('\nUnit              Diagram       State       Subject');

    units.forEach(unit => {
        console.log(
            `${unit.id.padEnd(18)} ` +
            `${unit.diagram.padEnd(13)} ` +
            `${unitState(unit).padEnd(11)} ` +
            `${clean(unit.subject || unit.title, 60)}`
        );
    });

    const counts = {};

    units.forEach(unit => {
        const state = unitState(unit);
        counts[state] = (counts[state] || 0) + 1;
    });

    console.log(
        `\n${units.length} units: ` +
        Object.entries(counts)
            .map(([key, value]) => `${value} ${key}`)
            .join(', ')
    );
}

/* ============================================================
   11. RESULT SELECTION
============================================================ */

function resultFor(unit) {
    const saved = readUnit(unit);

    if (
        saved &&
        saved.status === 'ok' &&
        saved.input_hash === inputHash(unit)
    ) {
        return {
            spec: saved.spec,
            source: 'AI',
            inferred: saved.inferred_elements || 0
        };
    }

    const state = unitState(unit);

    return {
        spec: unit.baseline,

        source:
            state === 'failed'
                ? 'baseline (AI failed)'
                : state === 'stale'
                    ? 'baseline (outdated result)'
                    : 'baseline (not generated)',

        inferred: 0
    };
}

/* ============================================================
   12. RENDERING
============================================================ */

function statusTable(rows) {
    return [
        '| Unit | Subject | Source | Inferred elements |',
        '|---|---|---|---|',

        ...rows.map(row =>
            `| ${row.id} | ${row.title} | ` +
            `${row.source} | ${row.inferred} |`
        ),

        ''
    ];
}

function renderAll(model, units, timestamp) {
    ensureDirectory(OUTPUT_DIR);

    const written = [];

    const outputFilename = filename =>
        timestampedFilename(filename, timestamp);

    const stamp =
        `Generated ${new Date().toISOString()} ` +
        `by 8.0.13.ClaudeDiagramsAI.js using ${MODEL}. ` +
        C.sourceLine(model);

    const legend =
        'Elements marked as inferred were added by the AI model. ' +
        'Repository-supported elements are retained as baseline evidence.';

    const forDiagram = key =>
        units
            .filter(unit => unit.diagram === key)
            .map(unit => ({
                unit,
                ...resultFor(unit)
            }));

    const section = (items, render) => {
        const blocks = statusTable(
            items.map(item => ({
                id: item.unit.id,
                title: item.unit.subject || item.unit.title,
                source: item.source,
                inferred: item.inferred
            }))
        );

        items.forEach(item => {
            blocks.push(
                `## ${item.unit.id}: ` +
                `${item.spec.title || item.unit.title}`,
                '',
                `Subject: ${item.unit.subject || item.unit.title}`,
                '',
                `Focus: ${item.unit.focus}`,
                '',
                render(item),
                ''
            );
        });

        return blocks;
    };

    const writeDiagram = (
        key,
        description,
        items,
        render
    ) => {
        if (!items.length) {
            log(`No applicable ${key} units; output not created.`);
            return;
        }

        const diagram = DIAGRAMS[key];

        const filename = outputFilename(diagram.file);

        written.push(
            C.writeDoc(
                OUTPUT_DIR,
                filename,
                diagram.title,
                [
                    description,
                    '',
                    legend,
                    '',
                    stamp
                ],
                section(items, render)
            )
        );
    };

    const useCases = forDiagram('usecase');

    writeDiagram(
        'usecase',
        'Actor interactions and system capabilities.',
        useCases,
        item =>
            C.fence(
                C.renderUseCase({
                    ...item.spec,
                    system_name:
                        item.spec.system_name ||
                        model.systemName
                })
            )
    );

    const processes = forDiagram('process');

    writeDiagram(
        'process',
        'Business process flows derived from repository evidence.',
        processes,
        item =>
            C.fence(C.renderProcess(item.spec))
    );

    const sequences = forDiagram('sequence');

    writeDiagram(
        'sequence',
        'Interactions between actors and participants over time.',
        sequences,
        item =>
            C.fence(C.renderSequence(item.spec))
    );

    const states = forDiagram('state')
        .filter(
            item =>
                item.spec &&
                arr(item.spec.states).length >= 2
        );

    writeDiagram(
        'state',
        'Object lifecycles, states and transitions.',
        states,
        item =>
            C.fence(C.renderState(item.spec))
    );

    const decisions = forDiagram('decision');

    if (decisions.length) {
        const decisionSpecs = C.buildDecisionSpecs(model);

        const completedSubjects = new Set(
            decisions.map(item => item.unit.subject)
        );

        const blocks = statusTable(
            decisions.map(item => ({
                id: item.unit.id,
                title: item.unit.subject || item.unit.title,
                source: item.source,
                inferred: item.inferred
            }))
        );

        if (decisionSpecs.drd) {
            blocks.push(
                '## Decision requirements diagram',
                '',
                C.fence(C.renderDrd(decisionSpecs.drd)),
                ''
            );
        }

        blocks.push('## Decision tables', '');

        decisions.forEach(item => {
            blocks.push(
                C.renderDecisionTable(item.spec),
                ''
            );
        });

        arr(decisionSpecs.tables)
            .filter(
                table =>
                    !completedSubjects.has(table.subject)
            )
            .forEach(table => {
                blocks.push(
                    C.renderDecisionTable(table),
                    '',
                    '_Deterministic repository baseline._',
                    ''
                );
            });

        const filename = outputFilename(
            DIAGRAMS.decision.file
        );

        written.push(
            C.writeDoc(
                OUTPUT_DIR,
                filename,
                DIAGRAMS.decision.title,
                [
                    'Decision conditions and outcomes derived from business rules.',
                    '',
                    legend,
                    '',
                    stamp
                ],
                blocks
            )
        );
    }

    const readmeFilename = outputFilename('README.md');

    const readmeRows = [
        '| Diagram | File | Successful units / total |',
        '|---|---|---|'
    ];

    Object.entries(DIAGRAMS).forEach(([key, diagram]) => {
        const diagramUnits = units.filter(
            unit => unit.diagram === key
        );

        if (!diagramUnits.length) return;

        const filename = outputFilename(diagram.file);

        const successful = diagramUnits.filter(
            unit => unitState(unit) === 'ok'
        ).length;

        readmeRows.push(
            `| ${diagram.title} | ` +
            `[${filename}](${filename}) | ` +
            `${successful} / ${diagramUnits.length} |`
        );
    });

    written.push(
        C.writeDoc(
            OUTPUT_DIR,
            readmeFilename,
            'AI-generated diagrams',
            [
                stamp,
                '',
                'Diagram outputs are derived from the available repositories.'
            ],
            [
                ...readmeRows,
                '',
                'Unit JSON files are stored in the units directory.',
                'Use --status to inspect generation status.',
                'Use --render to render saved results without model execution.'
            ]
        )
    );

    return written;
}

/* ============================================================
   13. MAIN
============================================================ */

async function main(
    argv = process.argv.slice(2),
    injectedPool = null
) {
    const options = parseArgs(argv);

    if (options.help) {
        console.log(USAGE);
        return null;
    }

    const pool = injectedPool || C.createPool();

    let model;

    try {
        model = await C.loadModel(pool);
    } finally {
        if (!injectedPool) {
            await pool.end();
        }
    }

    log(
        `Loaded repository model: ${JSON.stringify(model.stats)}`
    );

    const evidenceCount =
        arr(model.actors).length +
        arr(model.objects).length +
        arr(model.activities).length +
        arr(model.interactions).length +
        arr(model.irs).length +
        arr(model.frs).length +
        arr(model.brs).length +
        arr(model.rules).length;

    if (!evidenceCount) {
        throw new Error(
            'No usable business-analysis evidence was loaded. ' +
            'Check the repository data and DiagramCommon loader.'
        );
    }

    ensureDirectory(UNIT_DIR);

    const units = buildUnits(model);

    if (!units.length) {
        throw new Error(
            'No applicable diagram units could be derived from the ' +
            'available repository evidence.'
        );
    }

    log(
        `Discovered ${units.length} data-driven diagram units: ` +
        units.map(unit => unit.id).join(', ')
    );

    if (options.status) {
        printStatus(units);
        return { units };
    }

    if (!options.render) {
        let selected = selectUnits(units, options);

        if (!options.rerun) {
            selected = selected.filter(
                unit => unitState(unit) !== 'ok'
            );
        }

        if (options.limit) {
            selected = selected.slice(0, options.limit);
        }

        log(
            `${selected.length} unit(s) selected for generation`
        );

        for (const unit of selected) {
            await runUnit(unit, model);
        }
    }

    const timestamp = createRunTimestamp();

    log(`Output timestamp: ${timestamp}`);

    const written = renderAll(
        model,
        units,
        timestamp
    );

    const failed = units.filter(
        unit => unitState(unit) === 'failed'
    );

    log(
        `Wrote ${written.length} output files to ${OUTPUT_DIR}`
    );

    written.forEach(file => {
        console.log(`  ${file}`);
    });

    if (failed.length) {
        console.log(
            `\n${failed.length} unit(s) failed: ` +
            failed.map(unit => unit.id).join(', ')
        );

        console.log(
            'Use --rerun --failed to retry failed units.'
        );
    }

    return {
        units,
        written,
        failed,
        timestamp
    };
}

/* ============================================================
   14. PROCESS CLEANUP
============================================================ */

let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown) return;

    shuttingDown = true;

    log(`Received ${signal}; stopping model server.`);

    stopServer();

    process.exit(signal === 'SIGINT' ? 130 : 143);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('exit', () => {
    if (
        server &&
        server.child &&
        server.child.exitCode === null
    ) {
        try {
            server.child.kill('SIGKILL');
        } catch {
            // Ignore cleanup errors during process exit.
        }
    }
});

/* ============================================================
   15. EXECUTION AND EXPORTS
============================================================ */

if (require.main === module) {
    main()
        .catch(error => {
            console.error(
                `[8.0.13] ERROR: ${error.stack || error.message}`
            );

            process.exitCode = 1;
        })
        .finally(() => {
            stopServer();
        });
}

module.exports = {
    main,
    setRunner,

    parseArgs,
    diagramKey,
    buildUnits,
    unitState,

    validateUseCase,
    validateProcess,
    validateSequence,
    validateState,
    validateDecision,

    createRunTimestamp,
    timestampedFilename,

    startServer,
    stopServer,
    runServer,
    runCli
};
