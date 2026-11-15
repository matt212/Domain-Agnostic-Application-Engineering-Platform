'use strict';

/**
 * 8.0.13 - AI-ENHANCED BUSINESS DIAGRAM GENERATION
 *
 * Local model: Qwen through llama-cli.
 *
 * Improvements:
 * 1. Diagram-specific token budgets.
 * 2. Smaller retry prompt after invalid or truncated JSON.
 * 3. No blind removal of baseline array elements during prompt compaction.
 * 4. Relevant, bounded business context per unit.
 * 5. Explicit omitted-context metadata in prompts.
 * 6. Per-unit persistence and resumability.
 * 7. Failed reruns do not overwrite a previous successful result.
 * 8. Existing deterministic baseline remains the fallback.
 * 9. Existing DiagramCommon rendering and PostgreSQL loading contracts retained.
 *
 * Usage:
 *   node app/utils/appflowgeneratorAI/commands/8.0.13.ClaudeDiagramsAI.js
 *   node app/utils/appflowgeneratorAI/commands/8.0.13.ClaudeDiagramsAI.js --status
 *   node app/utils/appflowgeneratorAI/commands/8.0.13.ClaudeDiagramsAI.js --render
 *   node app/utils/appflowgeneratorAI/commands/8.0.13.ClaudeDiagramsAI.js --limit 1
 *   node app/utils/appflowgeneratorAI/commands/8.0.13.ClaudeDiagramsAI.js --diagram process
 *   node app/utils/appflowgeneratorAI/commands/8.0.13.ClaudeDiagramsAI.js --rerun --unit PROCESS-2
 *   node app/utils/appflowgeneratorAI/commands/8.0.13.ClaudeDiagramsAI.js --rerun --failed
 *
 * Environment:
 *   MODEL_NAME
 *   LLAMA_CLI_PATH
 *   THREADS
 *   DIAGRAM_OUTPUT_DIR_AI
 *   DIAGRAM_CONTEXT_TOKENS
 *   DIAGRAM_OUTPUT_TOKENS
 *   DIAGRAM_TIMEOUT_MS
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const C = require('./8.0.12.DiagramCommon.js');

const ROOT = process.cwd();

const MODEL = process.env.MODEL_NAME || 'unsloth/Qwen3.5-9B-GGUF';
const LLAMA_CLI = process.env.LLAMA_CLI_PATH || 'llama-cli';

const OUTPUT_DIR =
    process.env.DIAGRAM_OUTPUT_DIR_AI ||
    path.join(
        ROOT,
        'app/utils/appflowgeneratorAI/aiOutput/diagrams/ai'
    );

const UNIT_DIR = path.join(OUTPUT_DIR, 'units');

const PROMPT_VERSION = '2';

const SETTINGS = {
    threads: Math.max(1, Number(process.env.THREADS || 8)),
    llamaBatch: 256,
    temperature: 0.2,

    timeoutMs: Number(
        process.env.DIAGRAM_TIMEOUT_MS || 30 * 60 * 1000
    ),

    heartbeatMs: 30000,

    // One normal attempt and one materially smaller retry.
    retries: 1,

    context: Number(
        process.env.DIAGRAM_CONTEXT_TOKENS || 6144
    ),

    // Maximum generation budget for each diagram type.
    outputTokens: {
        usecase: 1200,
        process: 1200,
        sequence: 1400,
        state: 850,
        decision: 1100
    },

    // Retry budgets are deliberately bounded.
    retryTokens: {
        usecase: 1500,
        process: 1500,
        sequence: 1600,
        state: 1100,
        decision: 1300
    },

    // Business context limits.
    maxActors: 18,
    maxActivities: 14,
    maxRules: 12,
    maxInformationRequirements: 8,
    maxBusinessRequirements: 18,

    maxBaselineChars: 4200,
    maxContextChars: 4200,

    decisionGroups: Number(
        process.env.DECISION_GROUPS || 5
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

const pad = n => String(n).padStart(3, '0');

const NO_THINK = '<think>\n\n</think>\n\n';

// ============================================================
// 1. DIAGRAM CATALOGUE
// ============================================================

const DIAGRAMS = {
    usecase: {
        name: 'use case',
        file: '01_use_case_diagram.md',
        title: 'Use Case Diagram'
    },

    process: {
        name: 'process',
        file: '02_business_process_bpmn.md',
        title: 'BPMN-style Business Process Diagram'
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
        title: 'Decision Table / DMN'
    }
};

function diagramKey(name) {
    const value = String(name || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');

    if (value === 'all') return 'all';
    if (/^usecase/.test(value)) return 'usecase';

    if (
        /^(process|bpmn|businessprocess)/.test(value)
    ) {
        return 'process';
    }

    if (/^sequence/.test(value)) return 'sequence';
    if (/^state/.test(value)) return 'state';

    if (/^(decision|dmn)/.test(value)) {
        return 'decision';
    }

    throw new Error(
        `Unknown diagram "${name}". ` +
        'Use use case, process, sequence, state, decision or all.'
    );
}

// ============================================================
// 2. CLI
// ============================================================

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
        const arg = argv[i];

        const value = () => {
            const next = argv[++i];

            if (
                next === undefined ||
                next.startsWith('--')
            ) {
                throw new Error(`${arg} needs a value`);
            }

            return next;
        };

        if (arg === '--rerun') {
            options.rerun = true;
        } else if (arg === '--failed') {
            options.failed = true;
        } else if (arg === '--status') {
            options.status = true;
        } else if (arg === '--render') {
            options.render = true;
        } else if (
            arg === '--help' ||
            arg === '-h'
        ) {
            options.help = true;
        } else if (arg === '--diagram') {
            options.diagram = diagramKey(value());
        } else if (arg === '--unit') {
            options.unit = value().toUpperCase();
        } else if (arg === '--limit') {
            options.limit = Number(value());

            if (
                !Number.isInteger(options.limit) ||
                options.limit < 1
            ) {
                throw new Error('--limit must be a positive integer');
            }
        } else {
            throw new Error(`Unknown option ${arg}`);
        }
    }

    if (
        options.rerun &&
        !options.diagram &&
        !options.unit &&
        !options.failed
    ) {
        throw new Error(
            '--rerun needs --diagram, --unit or --failed'
        );
    }

    return options;
}

const USAGE = `
Usage:
  node 8.0.13.ClaudeDiagramsAI.js

Options:
  --diagram <name>    usecase | process | sequence | state | decision | all
  --unit <id>         regenerate/select one unit
  --rerun             force regeneration
  --failed            select failed units
  --limit <n>         run only the first n selected units
  --status            show unit status
  --render            render saved results without AI
  --help              show help

Examples:
  --status
  --render
  --limit 1
  --diagram process
  --rerun --unit PROCESS-2
  --rerun --diagram state
  --rerun --failed
`;

// ============================================================
// 3. LOCAL MODEL RUNNER
// ============================================================

function runLocal(label, prompt, maxTokens) {
    return new Promise((resolve, reject) => {
        const started = Date.now();

        let output = '';
        let stderr = '';
        let settled = false;

        const args = [
            '-hf', MODEL,
            '-c', String(SETTINGS.context),
            '-n', String(maxTokens),
            '-t', String(SETTINGS.threads),
            '-b', String(SETTINGS.llamaBatch),
            '-ngl', '0',
            '--temp', String(SETTINGS.temperature),
            '--reasoning', 'off',
            '--no-display-prompt',
            '--simple-io',
            '--log-disable',
            '-st',
            '-p', prompt
        ];

        const child = spawn(
            LLAMA_CLI,
            args,
            {
                cwd: ROOT,
                stdio: ['ignore', 'pipe', 'pipe']
            }
        );

        const heartbeat = setInterval(() => {
            log(
                `${label} running ` +
                `${((Date.now() - started) / 1000).toFixed(0)}s, ` +
                `${output.length} output bytes`
            );
        }, SETTINGS.heartbeatMs);

        const timeout = setTimeout(() => {
            if (settled) return;

            settled = true;

            child.kill('SIGKILL');

            cleanup();

            reject(
                new Error(
                    `timeout after ${SETTINGS.timeoutMs}ms`
                )
            );
        }, SETTINGS.timeoutMs);

        function cleanup() {
            clearInterval(heartbeat);
            clearTimeout(timeout);
        }

        child.stdout.on('data', data => {
            output += data.toString();
        });

        child.stderr.on('data', data => {
            stderr += data.toString();

            // Avoid retaining unbounded diagnostic output.
            if (stderr.length > 12000) {
                stderr = stderr.slice(-12000);
            }
        });

        child.on('error', error => {
            if (settled) return;

            settled = true;
            cleanup();
            reject(error);
        });

        child.on('close', (code, signal) => {
            if (settled) return;

            settled = true;
            cleanup();

            if (!output.trim() && code !== 0) {
                reject(
                    new Error(
                        `llama-cli exited with code ${code}, ` +
                        `signal ${signal || 'none'}: ` +
                        cut(stderr, 1200)
                    )
                );

                return;
            }

            resolve({
                output,
                stderr,
                code,
                signal,
                seconds: Math.round(
                    (Date.now() - started) / 1000
                )
            });
        });
    });
}

let runner = runLocal;

const setRunner = fn => {
    runner = fn;
};

// ============================================================
// 4. JSON EXTRACTION
// ============================================================

function extractJson(raw) {
    const text = String(raw)
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim();

    const start = text.indexOf('{');

    if (start < 0) {
        throw new Error('no JSON object in model output');
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];

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
                return JSON.parse(
                    text.slice(start, i + 1)
                );
            }
        }
    }

    throw new Error(
        'unterminated JSON: model output ended before the JSON object was complete'
    );
}

// ============================================================
// 5. MODEL REQUEST AND RETRY
// ============================================================

function tokenBudget(unit, retry) {
    const budgets = retry
        ? SETTINGS.retryTokens
        : SETTINGS.outputTokens;

    return budgets[unit.diagram];
}

function retryInstruction(error) {
    return [
        'Your previous response was invalid.',
        `Reason: ${error}`,
        'Return a shorter JSON object.',
        'Do not explain anything.',
        'Do not repeat the baseline.',
        'Prioritise the essential business elements.',
        'Return valid, complete JSON within the output limit.'
    ].join('\n');
}

async function ask(unit, promptFactory, parser) {
    let lastError = '';

    for (
        let attempt = 0;
        attempt <= SETTINGS.retries;
        attempt++
    ) {
        const isRetry = attempt > 0;

        const prompt = promptFactory({
            retry: isRetry,
            retryHint: isRetry
                ? retryInstruction(lastError)
                : ''
        });

        try {
            const result = await runner(
                `${unit.id} try ${attempt + 1}`,
                prompt,
                tokenBudget(unit, isRetry)
            );

            const raw = result.output || result;

            const json = extractJson(raw);

            const value = parser(json);

            return {
                ok: true,
                value,
                attempts: attempt + 1
            };
        } catch (error) {
            lastError = error.message;

            log(
                `${unit.id} try ${attempt + 1} rejected: ` +
                lastError
            );
        }
    }

    return {
        ok: false,
        error: lastError
    };
}

// ============================================================
// 6. VALIDATION HELPERS
// ============================================================

const clean = (value, max = 80) =>
    cut(
        String(value ?? '')
            .replace(/\s+/g, ' ')
            .trim(),
        max
    );

const bool = value =>
    value === true ||
    /^true$/i.test(String(value));

function withIds(list, prefix, max) {
    const seen = new Set();

    return arr(list)
        .slice(0, max)
        .map((item, index) => {
            let id =
                item &&
                item.id !== undefined &&
                String(item.id).trim()
                    ? String(item.id).trim()
                    : `${prefix}${index + 1}`;

            while (seen.has(id)) {
                id = `${id}_${index + 1}`;
            }

            seen.add(id);

            return {
                ...item,
                id
            };
        });
}

const resolver = items => reference => {
    const value = String(reference ?? '').trim();

    const byId = items.find(
        item => item.id === value
    );

    if (byId) return byId.id;

    const byName = items.find(
        item =>
            item.name &&
            same(item.name, value)
    ) || items.find(
        item =>
            item.label &&
            same(item.label, value)
    );

    return byName ? byName.id : null;
};

// ============================================================
// 7. USE CASE VALIDATION
// ============================================================

function validateUseCase(raw, fallbackSystem) {
    const actors = withIds(
        raw.actors,
        'a',
        24
    ).map(actor => ({
        id: actor.id,
        name: clean(actor.name, 60),

        kind:
            /system|automat/i.test(actor.kind)
                ? 'system'
                : /external|third|organi[sz]ation/i.test(actor.kind)
                    ? 'external'
                    : 'internal',

        inferred: bool(actor.inferred)
    })).filter(actor => actor.name);

    const useCases = withIds(
        raw.use_cases,
        'u',
        30
    ).map(useCase => ({
        id: useCase.id,
        name: clean(useCase.name, 70),
        inferred: bool(useCase.inferred)
    })).filter(useCase => useCase.name);

    const resolveActor = resolver(actors);
    const resolveUseCase = resolver(useCases);

    const links = [];

    arr(raw.links).forEach(link => {
        const actor = resolveActor(link.actor);

        const useCase = resolveUseCase(
            link.use_case || link.usecase
        );

        if (
            !actor ||
            !useCase ||
            links.some(
                item =>
                    item.actor === actor &&
                    item.use_case === useCase
            )
        ) {
            return;
        }

        links.push({
            actor,
            use_case: useCase,
            kind: /support/i.test(link.kind)
                ? 'supporting'
                : 'primary'
        });
    });

    const includes = [];

    arr(raw.includes).forEach(item => {
        const from = resolveUseCase(item.from);
        const to = resolveUseCase(item.to);

        if (!from || !to || from === to) return;

        includes.push({
            from,
            to,
            kind: /extend/i.test(item.kind)
                ? 'extend'
                : 'include'
        });
    });

    if (!actors.length) {
        throw new Error('no usable actors');
    }

    if (useCases.length < 2) {
        throw new Error('need at least two use cases');
    }

    if (!links.length) {
        throw new Error('no valid actor-to-use-case links');
    }

    return {
        title: clean(raw.title, 80),
        system_name:
            clean(raw.system_name, 80) ||
            fallbackSystem,
        actors,
        use_cases: useCases,
        links,
        includes
    };
}

// ============================================================
// 8. PROCESS VALIDATION
// ============================================================

function validateProcess(raw) {
    let nodes = withIds(
        raw.nodes,
        'n',
        24
    ).map(node => ({
        id: node.id,
        label: clean(node.label, 70),
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

        lane: clean(node.lane, 50)
    })).filter(
        node =>
            node.label ||
            node.type === 'start' ||
            node.type === 'end'
    );

    nodes.forEach(node => {
        if (!node.label) {
            node.label =
                node.type === 'start'
                    ? 'Start'
                    : 'End';
        }

        if (
            node.type !== 'start' &&
            node.type !== 'end' &&
            !node.lane
        ) {
            node.lane = 'Unassigned';
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

    const resolveNode = resolver(nodes);

    const flows = [];

    arr(raw.flows).forEach(flow => {
        const from = resolveNode(flow.from);
        const to = resolveNode(flow.to);

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
            label: clean(flow.label, 40),

            kind:
                /exception|fail/i.test(flow.kind) ||
                destination?.type === 'exception'
                    ? 'exception'
                    : 'normal'
        });
    });

    // Remove isolated nodes only. Connected business paths are retained.
    nodes = nodes.filter(
        node =>
            flows.some(
                flow =>
                    flow.from === node.id ||
                    flow.to === node.id
            )
    );

    flows.splice(
        0,
        flows.length,
        ...flows.filter(
            flow =>
                nodes.some(node => node.id === flow.from) &&
                nodes.some(node => node.id === flow.to)
        )
    );

    if (
        nodes.filter(node => node.type === 'task').length < 3
    ) {
        throw new Error(
            'need at least three connected business task nodes'
        );
    }

    if (!nodes.some(node => node.type === 'start')) {
        const first =
            nodes.find(
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
        const last =
            [...nodes].reverse().find(
                node =>
                    node.type === 'task' &&
                    !flows.some(flow => flow.from === node.id)
            ) ||
            [...nodes].reverse().find(
                node => node.type === 'task'
            );

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

    return {
        title: clean(raw.title, 80),
        nodes,
        flows
    };
}

// ============================================================
// 9. SEQUENCE VALIDATION
// ============================================================

function validateSequence(raw) {
    const participants = withIds(
        raw.participants,
        'p',
        10
    ).map(participant => ({
        id: participant.id,
        name: clean(participant.name, 40),

        kind:
            /participant|system/i.test(participant.kind)
                ? 'participant'
                : 'actor'
    })).filter(
        participant => participant.name
    );

    if (participants.length < 2) {
        throw new Error('need at least two participants');
    }

    const resolveParticipant = resolver(participants);

    const steps = [];

    let depth = 0;

    arr(raw.steps)
        .slice(0, 36)
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
                const from = resolveParticipant(step.from);
                const to = resolveParticipant(step.to);

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
                    text: clean(step.text, 80),

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
                        .map(resolveParticipant)
                        .filter(Boolean)
                );

                if (!over.length || !clean(step.text)) {
                    return;
                }

                steps.push({
                    type,
                    over,
                    text: clean(step.text, 90),
                    inferred
                });

            } else if (type === 'alt') {
                depth++;

                steps.push({
                    type,
                    text: clean(step.text, 60) || 'Condition',
                    inferred
                });

            } else if (type === 'else') {
                if (depth) {
                    steps.push({
                        type,
                        text: clean(step.text, 60) || 'Otherwise',
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
        steps.filter(step => step.type === 'message').length < 4
    ) {
        throw new Error(
            'need at least four valid participant messages'
        );
    }

    return {
        title: clean(raw.title, 80),
        participants,
        steps
    };
}

// ============================================================
// 10. STATE MACHINE VALIDATION
// ============================================================

function validateState(raw, objectName) {
    const states = withIds(
        raw.states,
        's',
        10
    ).map(state => ({
        id: state.id,
        name: clean(state.name, 45),
        inferred: bool(state.inferred)
    })).filter(state => state.name);

    if (states.length < 2) {
        throw new Error('need at least two states');
    }

    const resolveState = resolver(states);

    const transitions = [];

    arr(raw.transitions)
        .slice(0, 18)
        .forEach(transition => {
            const from = resolveState(transition.from);
            const to = resolveState(transition.to);

            if (!from || !to) return;

            transitions.push({
                from,
                to,
                event: clean(transition.event, 45) || 'moves',
                guard: clean(transition.guard, 45),
                inferred: bool(transition.inferred)
            });
        });

    if (!transitions.length) {
        throw new Error('no valid state transitions');
    }

    const initial =
        resolveState(raw.initial) ||
        states[0].id;

    let finals = uniq(
        arr(raw.finals)
            .map(resolveState)
            .filter(Boolean)
    );

    if (!finals.length) {
        finals = states.filter(
            state =>
                !transitions.some(
                    transition => transition.from === state.id
                ) &&
                state.id !== initial
        ).map(state => state.id).slice(0, 3);
    }

    if (!finals.length) {
        finals = [states[states.length - 1].id];
    }

    const notes = arr(raw.notes)
        .map(note => ({
            state: resolveState(note.state),
            text: clean(note.text, 90)
        }))
        .filter(note => note.state && note.text)
        .slice(0, 3);

    return {
        object: clean(raw.object, 60) || objectName,
        states,
        transitions,
        notes,
        initial,
        finals
    };
}

// ============================================================
// 11. DECISION TABLE VALIDATION
// ============================================================

const HIT = {
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
        .map(item =>
            clean(
                typeof item === 'object'
                    ? item.name
                    : item,
                40
            )
        )
        .filter(Boolean)
        .slice(0, 4);

    const outputs = arr(raw.outputs)
        .map(item =>
            clean(
                typeof item === 'object'
                    ? item.name
                    : item,
                40
            )
        )
        .filter(Boolean)
        .slice(0, 3);

    if (!inputs.length || !outputs.length) {
        throw new Error(
            'need at least one input and one output column'
        );
    }

    const ruleReferences = new Map(
        model.rules.map(rule => [
            rule.ref,
            rule
        ])
    );

    const fit = (list, count) =>
        Array.from(
            { length: count },
            (_, index) =>
                clean(arr(list)[index], 140) || '-'
        );

    const rows = arr(raw.rows)
        .slice(0, 14)
        .map(row => {
            const base = ruleReferences.get(
                String(row.rule || '').trim()
            );

            return {
                when: fit(row.when, inputs.length),
                then: fit(row.then, outputs.length),

                rule: base ? base.ref : '',
                type: base ? base.type : '',
                severity: base ? base.severity : '',
                enforcement: base ? base.enforcement : '',

                basis:
                    bool(row.inferred)
                        ? 'inferred'
                        : base
                            ? base.basis
                            : '',

                inferred: bool(row.inferred)
            };
        })
        .filter(
            row =>
                row.when.some(value => value !== '-') ||
                row.then.some(value => value !== '-')
        );

    if (rows.length < 2) {
        throw new Error('need at least two decision rows');
    }

    const key = String(
        raw.hit_policy || 'C'
    ).trim().toUpperCase()[0];

    return {
        name: clean(raw.name, 70),
        hit_policy: HIT[key] || HIT.C,
        inputs,
        outputs,
        rows
    };
}

// ============================================================
// 12. INFERRED ELEMENT COUNT
// ============================================================

function countInferred(spec) {
    return [
        'actors',
        'use_cases',
        'nodes',
        'flows',
        'steps',
        'states',
        'transitions',
        'rows'
    ].reduce(
        (total, key) =>
            total +
            arr(spec[key]).filter(
                item => item && item.inferred
            ).length,
        0
    );
}

// ============================================================
// 13. BUILD DIAGRAM UNITS
// ============================================================

function buildUnits(model) {
    const units = [];

    const useCases = C.buildUseCaseSpecs(model);

    units.push({
        id: 'USECASE-1',
        diagram: 'usecase',
        title: 'Use cases from business activities',
        baseline: useCases[0],

        focus:
            'Identify the business goals actors achieve through the system. ' +
            'Include relevant internal, external and system actors. ' +
            'Represent primary and supporting actor relationships and ' +
            'meaningful include and extend relationships.'
    });

    if (useCases[1]) {
        units.push({
            id: 'USECASE-2',
            diagram: 'usecase',
            title: 'Functional capabilities',
            baseline: useCases[1],

            focus:
                'Group business requirements into meaningful functional ' +
                'capabilities. Connect each capability to the actors who ' +
                'need or support it. Avoid creating one use case per ' +
                'individual requirement.'
        });
    }

    const process = C.buildProcessSpec(model);

    units.push({
        id: 'PROCESS-1',
        diagram: 'process',
        title: 'Main end-to-end business process',
        baseline: process,

        focus:
            'Represent the main end-to-end business process from trigger ' +
            'to completion. Show responsible actors as lanes, business ' +
            'activities, decision points, business rule outcomes and ' +
            'important alternative paths.'
    });

    units.push({
        id: 'PROCESS-2',
        diagram: 'process',
        title: 'Exceptions and disputes',
        baseline: process,

        focus:
            'Represent exception handling, failures, rejections, timeouts, ' +
            'disputes and cancellations. Show detection, responsible actor, ' +
            'corrective action, escalation, recovery or terminal outcome. ' +
            'Do not merely list exceptions without showing their process path.'
    });

    const sequence = C.buildSequenceSpec(model);

    [
        [
            'SEQ-1',
            'Core transaction',
            'the main end-to-end transaction from request to completion'
        ],
        [
            'SEQ-2',
            'Money and value movement',
            'money or value movement, authorisation, confirmation, ' +
            'settlement and reconciliation'
        ],
        [
            'SEQ-3',
            'Failure and dispute handling',
            'failure detection, timeout handling, dispute initiation, ' +
            'resolution and communication'
        ]
    ].forEach(([id, title, focus]) => {
        units.push({
            id,
            diagram: 'sequence',
            title,
            baseline: sequence,
            focus:
                `Show the interactions over time for ${focus}.`
        });
    });

    const states = C.buildStateSpecs(model);

    model.objects.forEach((object, index) => {
        const baseline =
            states.find(
                state => same(state.object, object.name)
            ) || {
                object: object.name,
                states: [],
                transitions: []
            };

        units.push({
            id: `STATE-${pad(index + 1)}`,
            diagram: 'state',
            title: object.name,
            subject: object.name,
            baseline,

            focus:
                `Show the business lifecycle of "${object.name}". ` +
                'Identify meaningful business states, events, transition ' +
                'conditions, business rule guards, abnormal states and ' +
                'terminal outcomes.'
        });
    });

    const decisions = C.buildDecisionSpecs(model);

    decisions.tables
        .slice(0, SETTINGS.decisionGroups)
        .forEach((table, index) => {
            units.push({
                id: `DEC-${pad(index + 1)}`,
                diagram: 'decision',
                title: table.name,
                subject: table.subject,
                baseline: table,

                focus:
                    `Build a decision table for "${table.subject}". ` +
                    'Identify the actual decision inputs, conditions, ' +
                    'business outcomes and relevant combinations. ' +
                    'Associate rows with existing business rule references ' +
                    'where applicable.'
            });
        });

    return units;
}

// ============================================================
// 14. UNIT STORAGE AND RESUMABILITY
// ============================================================

const inputHash = unit =>
    C.shortHash(
        JSON.stringify([
            PROMPT_VERSION,
            unit.id,
            unit.focus,
            unit.baseline
        ])
    );

const unitPath = unit =>
    path.join(
        UNIT_DIR,
        `${unit.id}.json`
    );

function readUnit(unit) {
    try {
        return JSON.parse(
            fs.readFileSync(unitPath(unit), 'utf8')
        );
    } catch {
        return null;
    }
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

function saveUnit(unit, payload) {
    fs.mkdirSync(UNIT_DIR, {
        recursive: true
    });

    const destination = unitPath(unit);

    const temporary = `${destination}.tmp`;

    fs.writeFileSync(
        temporary,
        JSON.stringify(payload, null, 2),
        'utf8'
    );

    fs.renameSync(
        temporary,
        destination
    );
}

// ============================================================
// 15. BUSINESS CONTEXT BUILDING
// ============================================================

function actorContext(model) {
    const actors = model.actors.slice(
        0,
        SETTINGS.maxActors
    );

    return {
        lines: actors.map(actor =>
            `- ${actor.name} (${actor.kind}): ${cut(actor.role, 65)}`
        ),

        omitted:
            Math.max(0, model.actors.length - actors.length)
    };
}

function activityContext(model, max = SETTINGS.maxActivities) {
    const activities = model.activities.slice(0, max);

    return {
        lines: activities.map((activity, index) => {
            const supporting = arr(activity.supporting);

            return (
                `${index + 1}. ${activity.name} ` +
                `[${activity.stage || '-'}] ` +
                `by ${activity.primary || 'Unassigned'}; ` +
                `support: ${supporting.join(', ') || '-'}; ` +
                `inputs: ${arr(activity.inputs).join(', ') || '-'}; ` +
                `outputs: ${arr(activity.outputs).join(', ') || '-'}`
            );
        }),

        omitted:
            Math.max(0, model.activities.length - activities.length)
    };
}

function ruleContext(list, max = SETTINGS.maxRules) {
    const rules = list.slice(0, max);

    return {
        lines: rules.map(rule =>
            `- ${rule.ref} [${rule.type}] ` +
            `${cut(rule.statement, 105)}; ` +
            `violation: ${cut(rule.ifViolated, 45)}`
        ),

        omitted:
            Math.max(0, list.length - rules.length)
    };
}

function informationContext(model) {
    const records = model.irs.slice(
        0,
        SETTINGS.maxInformationRequirements
    );

    return {
        lines: records.map(record =>
            `- ${record.label}: ` +
            `${cut(record.source, 65)} -> ` +
            `${arr(record.consumers).slice(0, 3).join(', ')}`
        ),

        omitted:
            Math.max(0, model.irs.length - records.length)
    };
}

function businessRequirementContext(model) {
    const requirements = model.brs.slice(
        0,
        SETTINGS.maxBusinessRequirements
    );

    return {
        lines: requirements.map(requirement =>
            `- ${requirement.id}: ${requirement.name}`
        ),

        omitted:
            Math.max(0, model.brs.length - requirements.length)
    };
}

function objectContext(object) {
    return [
        `OBJECT: ${object.name}`,
        `Purpose: ${object.purpose || '-'}`,
        `Lifecycle: ${object.lifecycle || '-'}`,
        `Dependencies: ${arr(object.deps).join(', ') || '-'}`
    ];
}

function contextFor(unit, model) {
    const lines = [
        `SYSTEM: ${model.systemName}`
    ];

    const omitted = {};

    function add(label, result) {
        lines.push(`${label}:`);

        lines.push(
            ...(result.lines.length
                ? result.lines
                : ['- None supplied'])
        );

        if (result.omitted > 0) {
            omitted[label] = result.omitted;
        }
    }

    if (
        unit.diagram === 'usecase' ||
        unit.diagram === 'sequence'
    ) {
        add(
            'ACTORS',
            actorContext(model)
        );
    }

    if (
        unit.diagram === 'usecase' &&
        unit.id === 'USECASE-2'
    ) {
        add(
            'BUSINESS REQUIREMENTS',
            businessRequirementContext(model)
        );

    } else if (
        unit.diagram === 'usecase' ||
        unit.diagram === 'process' ||
        unit.diagram === 'sequence'
    ) {
        add(
            'BUSINESS ACTIVITIES',
            activityContext(
                model,
                unit.diagram === 'sequence'
                    ? 10
                    : SETTINGS.maxActivities
            )
        );
    }

    if (
        unit.diagram === 'process' ||
        unit.diagram === 'state' ||
        unit.diagram === 'decision'
    ) {
        let selectedRules = model.rules;

        if (unit.diagram === 'process') {
            selectedRules = model.rules.filter(
                rule =>
                    C.DECISION_TYPES.includes(rule.type) ||
                    rule.type === 'Exception handling'
            );
        }

        if (unit.diagram === 'state') {
            selectedRules = model.rules.filter(
                rule =>
                    arr(rule.objects).some(
                        name => same(name, unit.subject)
                    )
            );
        }

        if (unit.diagram === 'decision') {
            selectedRules = model.rules.filter(
                rule =>
                    arr(rule.objects).length
                        ? arr(rule.objects).some(
                            name => same(name, unit.subject)
                        )
                        : unit.subject === 'Cross-cutting'
            );
        }

        add(
            'RELEVANT BUSINESS RULES',
            ruleContext(selectedRules)
        );
    }

    if (unit.diagram === 'sequence') {
        add(
            'INFORMATION REQUIREMENTS',
            informationContext(model)
        );
    }

    if (unit.diagram === 'state') {
        const object = model.objects.find(
            item => same(item.name, unit.subject)
        );

        if (object) {
            lines.push(
                ...objectContext(object)
            );
        }

        const touchingActivities = model.activities.filter(
            activity =>
                [
                    ...arr(activity.inputs),
                    ...arr(activity.outputs)
                ].some(
                    name => same(name, unit.subject)
                )
        );

        lines.push('ACTIVITIES AFFECTING THIS OBJECT:');

        touchingActivities
            .slice(0, 10)
            .forEach(activity => {
                lines.push(
                    `- ${activity.name}: ` +
                    `${cut(activity.outcome || activity.desc, 90)}`
                );
            });

        if (touchingActivities.length > 10) {
            omitted.objectActivities =
                touchingActivities.length - 10;
        }
    }

    if (Object.keys(omitted).length) {
        lines.push(
            '',
            'CONTEXT LIMIT NOTICE:',
            'The following source collections were bounded for this request:',
            ...Object.entries(omitted).map(
                ([name, count]) =>
                    `- ${name}: ${count} additional records not included`
            ),
            'Do not interpret omitted records as nonexistent.'
        );
    }

    let result = lines.join('\n');

    if (result.length > SETTINGS.maxContextChars) {
        result = result.slice(
            0,
            SETTINGS.maxContextChars
        );

        result +=
            '\n\nNOTICE: Context text was bounded. ' +
            'Do not assume absent information does not exist.';
    }

    return result;
}

// ============================================================
// 16. BASELINE COMPACTION
// ============================================================

/**
 * This function does not silently pop array elements.
 *
 * It first tries the full baseline. If it is too large, it shortens
 * long string values while retaining array membership and IDs.
 *
 * The final fallback is a compact structural representation that
 * retains array counts and item identifiers.
 */

function compactBaseline(spec, maxChars) {
    const full = JSON.stringify(spec);

    if (full.length <= maxChars) {
        return {
            json: full,
            mode: 'full'
        };
    }

    const copy = JSON.parse(full);

    function shorten(value, limit) {
        if (typeof value === 'string') {
            return cut(value, limit);
        }

        if (Array.isArray(value)) {
            return value.map(item =>
                shorten(item, limit)
            );
        }

        if (
            value &&
            typeof value === 'object'
        ) {
            const result = {};

            Object.entries(value).forEach(
                ([key, child]) => {
                    result[key] = shorten(child, limit);
                }
            );

            return result;
        }

        return value;
    }

    for (const limit of [120, 80, 50, 30]) {
        const candidate = shorten(copy, limit);
        const json = JSON.stringify(candidate);

        if (json.length <= maxChars) {
            return {
                json,
                mode: `shortened-string-values-${limit}`
            };
        }
    }

    // Last-resort structural representation.
    // Retain item IDs/names and report array counts.
    const structural = {};

    Object.entries(copy).forEach(
        ([key, value]) => {
            if (Array.isArray(value)) {
                structural[key] = {
                    total_items: value.length,
                    items: value.map(item => {
                        if (
                            !item ||
                            typeof item !== 'object'
                        ) {
                            return clean(item, 45);
                        }

                        const identity = {};

                        [
                            'id',
                            'name',
                            'label',
                            'object',
                            'from',
                            'to',
                            'actor',
                            'use_case',
                            'type'
                        ].forEach(field => {
                            if (item[field] !== undefined) {
                                identity[field] =
                                    clean(item[field], 45);
                            }
                        });

                        return identity;
                    })
                };
            } else if (
                value &&
                typeof value === 'object'
            ) {
                structural[key] = shorten(value, 40);
            } else {
                structural[key] = value;
            }
        }
    );

    return {
        json: JSON.stringify(structural),
        mode: 'structural-summary'
    };
}

// ============================================================
// 17. MODEL INSTRUCTIONS AND OUTPUT SCHEMAS
// ============================================================

const COMMON = cap => `
You are a senior business analyst.

Create ONE business diagram as structured JSON.

BUSINESS ANALYSIS PRINCIPLES:
- The repository baseline is contextual evidence, not a completeness limit.
- Preserve correct baseline business information.
- Correct clearly incorrect relationships or lifecycle logic.
- Add important missing business elements where justified.
- Mark every newly inferred element with "inferred": true.
- Do not mark existing baseline elements as inferred.
- Do not invent arbitrary actors, rules or business events.
- Do not turn technical implementation details into business activities.
- Use business language.
- Represent meaningful alternative paths and exception outcomes.
- Keep the diagram readable.

OUTPUT LIMIT:
${cap}

OUTPUT RULES:
- Return one complete JSON object.
- Return no Markdown.
- Return no commentary.
- Do not return a partial JSON object.
- Use only IDs defined in your own response.
`;

const SCHEMAS = {
    usecase: `{
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

    process: `{
  "title": "",
  "nodes": [
    {
      "id": "n1",
      "type": "start or task or decision or exception or end",
      "lane": "responsible business actor",
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

    sequence: `{
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
      "type": "alt",
      "text": "condition"
    },
    {
      "type": "else",
      "text": "otherwise"
    },
    {
      "type": "end"
    },
    {
      "type": "note",
      "over": ["p1"],
      "text": ""
    }
  ]
}`,

    state: `{
  "object": "",
  "states": [
    {
      "id": "s1",
      "name": "",
      "inferred": false
    }
  ],
  "initial": "s1",
  "finals": ["s3"],
  "transitions": [
    {
      "from": "s1",
      "to": "s2",
      "event": "",
      "guard": "business rule or transition condition",
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

    decision: `{
  "name": "",
  "hit_policy": "U or A or P or F or C",
  "inputs": ["input column"],
  "outputs": ["output column"],
  "rows": [
    {
      "when": ["value for each input"],
      "then": ["value for each output"],
      "rule": "existing rule reference or empty",
      "inferred": false
    }
  ]
}`
};

const CAPS = {
    usecase:
        'At most 14 actors and 20 use cases. Include meaningful actor links.',

    process:
        'At most 18 nodes. Every node must be connected. Use concise business labels.',

    sequence:
        'At most 8 participants and 26 steps. Close every alt block with an end step.',

    state:
        'At most 8 states and 12 transitions. Use business states and meaningful guards.',

    decision:
        'At most 4 input columns, 3 output columns and 12 rows.'
};

// ============================================================
// 18. PROMPT CONSTRUCTION
// ============================================================

function promptFor(unit, model, options = {}) {
    const baseline = compactBaseline(
        unit.baseline,
        options.retry
            ? 2200
            : SETTINGS.maxBaselineChars
    );

    const context = contextFor(unit, model);

    const retryText = options.retryHint
        ? `\nRETRY INSTRUCTIONS:\n${options.retryHint}\n`
        : '';

    return `
<|im_start|>system
${COMMON(CAPS[unit.diagram])}

JSON SCHEMA:
${SCHEMAS[unit.diagram]}
<|im_end|>

<|im_start|>user

DIAGRAM UNIT:
${unit.id}

TITLE:
${unit.title}

BUSINESS ANALYSIS FOCUS:
${unit.focus}

BUSINESS CONTEXT:
${context}

EXISTING BASELINE:
${baseline.json}

BASELINE REPRESENTATION:
${baseline.mode}

IMPORTANT:
- The baseline is not proof of completeness.
- Do not discard meaningful baseline elements without reason.
- Add missing business logic only where justified.
- Prefer a small complete diagram over a large incomplete response.
- Ensure all references resolve to IDs defined in your output.
- Ensure all paths and transitions are logically connected.
- Return valid JSON only.

${retryText}

Return the JSON object now.

<|im_end|>
<|im_start|>assistant
${NO_THINK}
`;
}

// ============================================================
// 19. UNIT PARSERS
// ============================================================

function parserFor(unit, model) {
    return raw => {
        switch (unit.diagram) {
            case 'usecase':
                return validateUseCase(
                    raw,
                    model.systemName
                );

            case 'process':
                return validateProcess(raw);

            case 'sequence':
                return validateSequence(raw);

            case 'state':
                return validateState(
                    raw,
                    unit.subject
                );

            case 'decision':
                return validateDecision(
                    raw,
                    model
                );

            default:
                throw new Error(
                    `Unsupported diagram type: ${unit.diagram}`
                );
        }
    };
}

// ============================================================
// 20. RUN A UNIT
// ============================================================

async function runUnit(unit, model) {
    const started = Date.now();

    const result = await ask(
        unit,
        options =>
            promptFor(unit, model, options),
        parserFor(unit, model)
    );

    const previous = readUnit(unit);

    if (result.ok) {
        const inferred = countInferred(result.value);

        saveUnit(unit, {
            unit_id: unit.id,
            diagram: unit.diagram,
            title: unit.title,
            status: 'ok',

            input_hash: inputHash(unit),
            model: MODEL,

            generated_at: new Date().toISOString(),

            seconds: Math.round(
                (Date.now() - started) / 1000
            ),

            attempts: result.attempts,
            inferred_elements: inferred,

            spec: result.value
        });

        log(
            `${unit.id} OK in ` +
            `${Math.round((Date.now() - started) / 1000)}s; ` +
            `${inferred} inferred element(s); ` +
            `${result.attempts} attempt(s).`
        );

        return true;
    }

    // Preserve the previous successful result.
    if (
        previous &&
        previous.status === 'ok'
    ) {
        log(
            `${unit.id} FAILED: ${result.error}. ` +
            'Previous successful result retained.'
        );

        return false;
    }

    saveUnit(unit, {
        unit_id: unit.id,
        diagram: unit.diagram,
        title: unit.title,
        status: 'failed',

        input_hash: inputHash(unit),
        model: MODEL,

        generated_at: new Date().toISOString(),

        seconds: Math.round(
            (Date.now() - started) / 1000
        ),

        error: result.error
    });

    log(
        `${unit.id} FAILED: ${result.error}. ` +
        'The deterministic baseline will be used.'
    );

    return false;
}

// ============================================================
// 21. UNIT SELECTION
// ============================================================

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
                `No unit ${options.unit}. Run --status to list unit IDs.`
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

// ============================================================
// 22. STATUS
// ============================================================

function printStatus(units) {
    console.log(
        '\nUnit        Diagram    State       Title'
    );

    units.forEach(unit => {
        console.log(
            `${unit.id.padEnd(11)} ` +
            `${unit.diagram.padEnd(10)} ` +
            `${unitState(unit).padEnd(11)} ` +
            `${cut(unit.title, 60)}`
        );
    });

    const counts = units.reduce(
        (result, unit) => {
            const state = unitState(unit);

            result[state] = (result[state] || 0) + 1;

            return result;
        },
        {}
    );

    console.log(
        `\n${units.length} units: ` +
        Object.entries(counts)
            .map(([state, count]) => `${count} ${state}`)
            .join(', ')
    );
}

// ============================================================
// 23. RENDER HELPERS
// ============================================================

function resultFor(unit) {
    const result = readUnit(unit);

    if (
        result &&
        result.status === 'ok' &&
        result.input_hash === inputHash(unit)
    ) {
        return {
            spec: result.spec,
            source: 'AI',
            inferred: result.inferred_elements || 0
        };
    }

    const state = unitState(unit);

    return {
        spec: unit.baseline,

        source:
            state === 'failed'
                ? 'baseline (AI failed)'
                : state === 'stale'
                    ? 'baseline (AI result outdated)'
                    : 'baseline (not generated yet)',

        inferred: 0
    };
}

function statusTable(rows) {
    return [
        '| Unit | Source | Inferred elements |',
        '|---|---|---|',

        ...rows.map(row =>
            `| ${row.id} ${row.title} | ` +
            `${row.source} | ${row.inferred} |`
        ),

        ''
    ];
}

// ============================================================
// 24. RENDER ALL DIAGRAMS
// ============================================================

function renderAll(model, units, runTimestamp) {
    const stamp =
        `Generated ${new Date().toISOString()} ` +
        `by 8.0.13.ClaudeDiagramsAI.js using ${MODEL}. ` +
        `${C.sourceLine(model)}`;

    const legend =
        'Dashed outlines and elements marked * were added by the AI model (inferred); solid ones come from the repositories.';

    const written = [];

    const outputFile = filename =>
        timestampedFilename(filename, runTimestamp);

    const forDiagram = k =>
        units
            .filter(u => u.diagram === k)
            .map(u => ({
                u,
                ...resultFor(u)
            }));

    const section = (items, render) => {
        const blocks = [
            ...statusTable(
                items.map(x => ({
                    id: x.u.id,
                    title: x.u.title,
                    source: x.source,
                    inferred: x.inferred
                }))
            )
        ];

        items.forEach(x => {
            blocks.push(
                `## ${x.u.id}: ${x.spec.title || x.u.title}`,
                '',
                `Focus: ${x.u.focus}`,
                '',
                render(x),
                ''
            );
        });

        return blocks;
    };

    // 1. USE CASE
    written.push(
        C.writeDoc(
            OUTPUT_DIR,
            outputFile(DIAGRAMS.usecase.file),
            DIAGRAMS.usecase.title,
            [
                'Actors, system boundary and functional capabilities.',
                '',
                legend,
                '',
                stamp
            ],
            section(
                forDiagram('usecase'),
                x =>
                    C.fence(
                        C.renderUseCase({
                            ...x.spec,
                            system_name:
                                x.spec.system_name ||
                                model.systemName
                        })
                    )
            )
        )
    );

    // 2. PROCESS
    written.push(
        C.writeDoc(
            OUTPUT_DIR,
            outputFile(DIAGRAMS.process.file),
            DIAGRAMS.process.title,
            [
                'End-to-end business processes with swimlanes (one per responsible actor), decisions and exception paths.',
                '',
                legend,
                '',
                stamp
            ],
            section(
                forDiagram('process'),
                x => C.fence(C.renderProcess(x.spec))
            )
        )
    );

    // 3. SEQUENCE
    written.push(
        C.writeDoc(
            OUTPUT_DIR,
            outputFile(DIAGRAMS.sequence.file),
            DIAGRAMS.sequence.title,
            [
                'Interactions between actors and system participants over time.',
                '',
                legend,
                '',
                stamp
            ],
            section(
                forDiagram('sequence'),
                x => C.fence(C.renderSequence(x.spec))
            )
        )
    );

    // 4. STATE MACHINES
    const stateItems = forDiagram('state').filter(
        x => x.spec.states && x.spec.states.length >= 2
    );

    const skipped =
        forDiagram('state').length - stateItems.length;

    written.push(
        C.writeDoc(
            OUTPUT_DIR,
            outputFile(DIAGRAMS.state.file),
            DIAGRAMS.state.title,
            [
                'Lifecycle of each business object: states, transitions, guards and abnormal endings.',
                '',
                legend,
                skipped
                    ? `${skipped} object(s) have no state diagram yet (AI failed or not generated, and the repositories hold too little to draw one).`
                    : '',
                stamp
            ],
            section(
                stateItems,
                x => C.fence(C.renderState(x.spec))
            )
        )
    );

    // 5. DECISION TABLES
    const dec = C.buildDecisionSpecs(model);
    const decItems = forDiagram('decision');

    const done = new Set(
        decItems.map(x => x.u.subject)
    );

    const decBlocks = [
        ...statusTable(
            decItems.map(x => ({
                id: x.u.id,
                title: x.u.title,
                source: x.source,
                inferred: x.inferred
            }))
        )
    ];

    if (dec.tables.length) {
        decBlocks.push(
            '## Decision requirements diagram',
            '',
            C.fence(C.renderDrd(dec.drd)),
            '',
            '## Decision tables',
            ''
        );
    } else {
        decBlocks.push(
            '_No business rules were found, so there are no decisions to tabulate._',
            ''
        );
    }

    decItems.forEach(x => {
        decBlocks.push(
            C.renderDecisionTable(x.spec),
            ''
        );
    });

    dec.tables
        .filter(t => !done.has(t.subject))
        .forEach(t => {
            decBlocks.push(
                C.renderDecisionTable(t),
                '_Baseline table, not AI-enhanced._',
                ''
            );
        });

    written.push(
        C.writeDoc(
            OUTPUT_DIR,
            outputFile(DIAGRAMS.decision.file),
            DIAGRAMS.decision.title,
            [
                'Business rules, conditions and decision outcomes. Mermaid has no DMN type, so decisions are Markdown tables plus a decision requirements diagram.',
                '',
                legend,
                '',
                stamp
            ],
            decBlocks
        )
    );

    // 6. README
    // All links point to the timestamped Markdown files.
    written.push(
        C.writeDoc(
            OUTPUT_DIR,
            outputFile('README.md'),
            'Diagram set (AI-enhanced)',
            [
                stamp,
                '',
                `Run timestamp: ${runTimestamp}`,
                ''
            ],
            [
                '| Diagram | File | Units ok / total |',
                '|---|---|---|',

                ...Object.entries(DIAGRAMS).map(([k, d]) => {
                    const us = units.filter(
                        u => u.diagram === k
                    );

                    const filename = outputFile(d.file);

                    return (
                        `| ${d.title} | ` +
                        `[${filename}](${filename}) | ` +
                        `${us.filter(u => unitState(u) === 'ok').length} / ${us.length} |`
                    );
                }),

                '',
                'Rerun a diagram: `node 8.0.13.ClaudeDiagramsAI.js --rerun --diagram "use case"` (also process, sequence, state, decision), or `--rerun --failed`.'
            ]
        )
    );

    return written;
}

// ============================================================
// 25. MAIN
// ============================================================

async function main(
    argv = process.argv.slice(2),
    injectedPool = null
) {
    const options = parseArgs(argv);

    if (options.help) {
        console.log(USAGE);
        return null;
    }

    const pool =
        injectedPool ||
        C.createPool();

    let model;

    try {
        model = await C.loadModel(pool);
    } finally {
        if (!injectedPool) {
            await pool.end();
        }
    }

    log(
        `Loaded: ${JSON.stringify(model.stats)}`
    );

    if (!model.activities.length) {
        throw new Error(
            'No business activities were found in the repositories.'
        );
    }

    fs.mkdirSync(UNIT_DIR, {
        recursive: true
    });

    const units = buildUnits(model);

    log(
        `Prepared ${units.length} diagram unit(s): ` +
        units.map(unit => unit.id).join(', ')
    );

    if (options.status) {
        printStatus(units);

        return {
            units
        };
    }

    if (!options.render) {
        let selected = selectUnits(
            units,
            options
        );

        // Successful current units are not regenerated unless forced.
        if (!options.rerun) {
            selected = selected.filter(
                unit => unitState(unit) !== 'ok'
            );
        }

        if (options.limit) {
            selected = selected.slice(
                0,
                options.limit
            );
        }

        log(
            `${selected.length} unit(s) selected: ` +
            `${selected.map(unit => unit.id).join(', ') || 'none'}`
        );

        for (const unit of selected) {
            await runUnit(unit, model);
        }
    }

    const runTimestamp = createRunTimestamp();

log(`Output timestamp: ${runTimestamp}`);

const written = renderAll(
    model,
    units,
    runTimestamp
);

    const failed = units.filter(
        unit => unitState(unit) === 'failed'
    );

    const stale = units.filter(
        unit => unitState(unit) === 'stale'
    );

    log(
        `Wrote ${written.length} Markdown file(s) to ${OUTPUT_DIR}`
    );

    written.forEach(file => {
        console.log(`  ${file}`);
    });

    if (failed.length) {
        console.log(
            `\n${failed.length} failed unit(s): ` +
            failed.map(unit => unit.id).join(', ')
        );

        console.log(
            '\nRetry failed units with:'
        );

        console.log(
            'node app/utils/appflowgeneratorAI/commands/' +
            '8.0.13.ClaudeDiagramsAI.js --rerun --failed'
        );
    }

    if (stale.length) {
        console.log(
            `\n${stale.length} stale unit(s): ` +
            stale.map(unit => unit.id).join(', ')
        );
    }

    return {
        units,
        written,
        failed,
        stale
    };
}

// ============================================================
// 26. ENTRY POINT AND EXPORTS
// ============================================================

if (require.main === module) {
    main().catch(error => {
        console.error(
            `[8.0.13] FATAL: ${error.stack || error.message}`
        );

        process.exitCode = 1;
    });
}
function createRunTimestamp(date = new Date()) {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');

    return `${dd}_${mm}_${yy}_${hh}_${min}`;
}

function timestampedFilename(filename, timestamp) {
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);

    return `${basename}_${timestamp}${ext}`;
}
module.exports = {
    main,
    setRunner,
    parseArgs,
    buildUnits,
    unitState,
    validateUseCase,
    validateProcess,
    validateSequence,
    validateState,
    validateDecision,
    compactBaseline,
    contextFor,
    diagramKey
};