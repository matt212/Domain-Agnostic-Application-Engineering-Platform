'use strict';

/**
 * 8.0.13 - AI-assisted generation of all five functional diagrams.
 *
 * Deterministic diagrams are written first.
 * Qwen is then attempted once per diagram.
 * A failed AI call never removes a deterministic result or stops
 * the remaining diagrams.
 *
 * Selective rerun:
 * node app/utils/appflowgeneratorAI/commands/8.0.13.GPTgenerateAiDiagrams.js --rerun --diagram "use case"
 * node app/utils/appflowgeneratorAI/commands/8.0.13.GPTgenerateAiDiagrams.js --rerun --diagram "sequence"
 * node app/utils/appflowgeneratorAI/commands/8.0.13.GPTgenerateAiDiagrams.js --rerun --diagram "process"
 * node app/utils/appflowgeneratorAI/commands/8.0.13.GPTgenerateAiDiagrams.js --rerun --diagram "state"
 * node app/utils/appflowgeneratorAI/commands/8.0.13.GPTgenerateAiDiagrams.js --rerun --diagram "decision"
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./8.0.12.DiagramCommon.js');

const OUT_DIR = process.env.DIAGRAM_AI_OUTPUT_DIR || path.join(
    process.cwd(),
    'app/utils/appflowgeneratorAI/aiOutput/diagrams/ai_assisted'
);

const RAW_DIR = path.join(OUT_DIR, 'raw');
const SPECS_DIR = path.join(OUT_DIR, 'specs');

const MODEL = process.env.LLAMA_MODEL || 'unsloth/Qwen3.5-9B-GGUF';
const CLI = process.env.LLAMA_CLI || 'llama-cli';

const MAX_PROMPT_CHARS = Math.max(
    1800,
    Number(process.env.DIAGRAM_MAX_PROMPT_CHARS || 4200)
);

const MAX_TOKENS = Math.max(
    128,
    Number(process.env.DIAGRAM_MAX_TOKENS || 420)
);

const TIMEOUT_MS = Math.max(
    60000,
    Number(process.env.DIAGRAM_TIMEOUT_MS || 1800000)
);

const log = message =>
    console.log(`[8.0.13] ${new Date().toISOString()} ${message}`);

const safe = (value, max = 180) =>
    String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const json = value => JSON.stringify(value, null, 2);

/**
 * The only place where diagram base filenames are defined.
 *
 * Do not repeat these filenames in markdownFor(), makeArtifacts(),
 * or rerunAiDiagram().
 */
const DIAGRAM_FILE_BASES = Object.freeze({
    use_case: '01_use_case_diagram',
    process: '02_business_process_bpmn',
    sequence: '03_sequence_diagram',
    state: '04_state_machine_diagrams',
    decision: '05_decision_table_dmn'
});

/**
 * Creates a filename-safe UTC timestamp.
 *
 * Example:
 * 20261115T123456Z
 */
function getFileTimestamp(date = new Date()) {
    return date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Generates the filename for a diagram.
 *
 * Example:
 * gpt_01_use_case_diagram_20261115T123456Z.md
 */
function getDiagramFilename(kind, timestamp) {
    const base = DIAGRAM_FILE_BASES[kind];

    if (!base) {
        throw new Error(`Unsupported diagram filename kind: ${kind}`);
    }

    if (!timestamp) {
        throw new Error('A timestamp is required to generate a diagram filename.');
    }

    return `gpt_${base}_${timestamp}.md`;
}

function save(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });

    fs.writeFileSync(
        file,
        `${String(content).replace(/\s+$/, '')}\n`,
        'utf8'
    );

    return file;
}

// ============================================================
// 1. BUILD MARKDOWN FOR EACH DIAGRAM
// ============================================================

function markdownFor(model, kind, spec, timestamp) {
    const stamp =
        `Generated ${new Date().toISOString()}. ${C.sourceLine(model)}`;

    const blocks = [];
    let title = '';
    let mermaid = '';

    const file = getDiagramFilename(kind, timestamp);

    if (kind === 'use_case') {
        title = 'Use Case Diagram';

        spec.forEach(s => {
            const code = C.renderUseCase(s);

            blocks.push(
                `## ${s.title}`,
                '',
                C.fence(code),
                ''
            );

            mermaid += `${code}\n\n`;
        });

        if (model.brs.length) {
            blocks.push(
                '## Business requirement traceability',
                '',
                '| Business requirement | Functional requirements |',
                '|---|---|',
                ...model.brs.map(b =>
                    `| ${safe(b.id)} ${safe(b.name)} | ${safe((b.frs || []).join(', '), 300)} |`
                ),
                ''
            );
        }

    } else if (kind === 'process') {
        title = 'BPMN-style Business Process Diagram';

        mermaid = C.renderProcess(spec);
        blocks.push(C.fence(mermaid), '');

    } else if (kind === 'sequence') {
        title = 'Sequence Diagram';

        mermaid = C.renderSequence(spec);
        blocks.push(C.fence(mermaid), '');

    } else if (kind === 'state') {
        title = 'State Machine Diagrams';

        if (!spec.length) {
            blocks.push(
                '_No business object currently has two or more lifecycle states in the source data._',
                ''
            );
        }

        spec.forEach(s => {
            const code = C.renderState(s);

            blocks.push(
                `## ${safe(s.object)}`,
                '',
                s.purpose ? `Purpose: ${safe(s.purpose)}` : '',
                '',
                C.fence(code),
                ''
            );

            mermaid += `${code}\n\n`;
        });

    } else if (kind === 'decision') {
        title = 'Decision Table / DMN';

        if (!spec.tables.length) {
            blocks.push(
                '_No business rules were found in the selected ingestion run._',
                ''
            );
        } else {
            mermaid = C.renderDrd(spec.drd);

            blocks.push(
                '## Decision requirements diagram',
                '',
                C.fence(mermaid),
                '',
                '## Decision tables',
                ''
            );

            spec.tables.forEach(t =>
                blocks.push(C.renderDecisionTable(t), '')
            );
        }

    } else {
        throw new Error(`Unsupported diagram kind: ${kind}`);
    }

    const intro = kind === 'use_case'
        ? 'Actors and functional capabilities within the system boundary.'
        : kind === 'process'
            ? 'Lifecycle-ordered business activities, responsible actors, rule checks and exception paths.'
            : kind === 'sequence'
                ? 'Actor/system interactions and information flows in lifecycle order.'
                : kind === 'state'
                    ? `${spec.length} object lifecycle state machine(s) derived from activities and business objects.`
                    : `${spec.tables.length} decision table(s), based on the loaded business rules.`;

    const content = [
        `# ${title}`,
        '',
        intro,
        '',
        stamp,
        '',
        ...blocks
    ].join('\n');

    return {
        kind,
        title,
        file,
        content,
        mermaid
    };
}

// ============================================================
// 2. BUILD ALL FIVE DETERMINISTIC SPECIFICATIONS
// ============================================================

function makeArtifacts(model, timestamp) {
    const builders = [
        ['use_case', () => C.buildUseCaseSpecs(model)],
        ['process', () => C.buildProcessSpec(model)],
        ['sequence', () => C.buildSequenceSpec(model)],
        ['state', () => C.buildStateSpecs(model)],
        ['decision', () => C.buildDecisionSpecs(model)]
    ];

    const artifacts = [];

    for (const [kind, build] of builders) {
        try {
            const spec = build();

            save(
                path.join(SPECS_DIR, `${kind}.json`),
                json(spec)
            );

            artifacts.push(
                markdownFor(model, kind, spec, timestamp)
            );

            log(`Deterministic ${kind} diagram built.`);

        } catch (error) {
            const content = [
                `# ${kind}`,
                '',
                'DETERMINISTIC_GENERATION_FAILED:',
                safe(error.stack || error.message, 2000)
            ].join('\n');

            artifacts.push({
                kind,
                title: kind,
                file: getDiagramFilename(kind, timestamp),
                content,
                mermaid: '',
                buildError: error.message
            });

            log(`ERROR building deterministic ${kind}: ${error.message}`);
        }
    }

    return artifacts;
}

// ============================================================
// 3. BUILD COMPACT SOURCE EVIDENCE
// ============================================================

function compactEvidence(model, artifact) {
    const lines = [
        `Diagram type: ${artifact.title}`,
        `System: ${safe(model.systemName, 100)}`,
        `Evidence counts: ${json(model.stats)}`,
        'Activities (name | actor | stage | inputs | outputs):'
    ];

    (model.activities || []).slice(0, 12).forEach(a => {
        lines.push(
            `- ${safe(a.name, 75)} | ${safe(a.primary, 45)} | ${safe(a.stage, 40)} | ${safe((a.inputs || []).join(', '), 65)} | ${safe((a.outputs || []).join(', '), 65)}`
        );
    });

    lines.push('Business objects:');

    (model.objects || []).slice(0, 12).forEach(o => {
        lines.push(
            `- ${safe(o.name, 55)}: ${safe(o.purpose, 100)}; lifecycle=${safe(o.lifecycle, 70)}`
        );
    });

    lines.push('Actors:');

    (model.actors || []).slice(0, 16).forEach(a => {
        lines.push(
            `- ${safe(a.name, 60)} (${safe(a.kind, 15)}): ${safe(a.role, 75)}`
        );
    });

    lines.push('Functional requirements:');

    (model.frs || []).slice(0, 12).forEach(r => {
        lines.push(
            `- ${safe(r.id, 30)}: ${safe(r.text, 140)}`
        );
    });

    lines.push('Business rules (representative, not exhaustive):');

    (model.rules || []).slice(0, 14).forEach(r => {
        lines.push(
            `- ${safe(r.ref, 15)} [${safe(r.type, 35)}] ${safe(r.name, 75)}: ${safe(r.condition, 100)} => ${safe(r.statement, 140)}; violation=${safe(r.ifViolated, 100)}`
        );
    });

    lines.push('Information requirements:');

    (model.irs || []).slice(0, 8).forEach(r => {
        lines.push(
            `- ${safe(r.label, 70)}: ${safe(r.description, 100)}; source=${safe(r.source, 40)}; consumers=${safe((r.consumers || []).join(', '), 60)}`
        );
    });

    return lines;
}

// ============================================================
// 4. BUILD A PROMPT WITH A STRICT CHARACTER LIMIT
// ============================================================

function buildPrompt(model, artifact) {
    const instruction = [
        'You are reviewing one functional diagram for a domain-agnostic business application.',
        'Use only the evidence below.',
        'Do not invent actors, activities, states, conditions, integrations, or outcomes.',
        'Return exactly one Mermaid fenced code block for the requested diagram.',
        'Do not return JSON or explanatory prose.',
        'Preserve the requested diagram type.',
        'Keep every supported source fact.',
        'If evidence is insufficient, show only supported facts.',
        'Do not add generic placeholder nodes or explanatory notes.'
    ].join('\n');

    const evidenceLines = compactEvidence(model, artifact);

    const diagramHeader =
        '\nCURRENT DETERMINISTIC DIAGRAM (reference only):\n';

    const footer =
        '\nGenerate the corrected Mermaid diagram now.';

    const current = artifact.mermaid
        ? artifact.mermaid
            .split('\n')
            .slice(0, 55)
            .map(line => safe(line, 130))
        : ['No Mermaid diagram was produced by the deterministic builder.'];

    const base = `${instruction}\n\nEVIDENCE:\n`;

    const selected = [];

    let prompt =
        `${base}${diagramHeader}${footer}`;

    // Add complete evidence lines only. Never truncate serialized JSON.
    for (const line of evidenceLines) {
        const candidate = [
            base,
            selected.concat(line).join('\n'),
            diagramHeader,
            current.join('\n'),
            footer
        ].join('\n');

        if (candidate.length <= MAX_PROMPT_CHARS) {
            selected.push(line);
        }
    }

    prompt = [
        base,
        selected.join('\n'),
        diagramHeader,
        current.join('\n'),
        footer
    ].join('\n');

    // If the diagram itself makes the prompt too large,
    // reduce the number of reference lines.
    while (prompt.length > MAX_PROMPT_CHARS && current.length > 8) {
        current.pop();

        prompt = [
            base,
            selected.join('\n'),
            diagramHeader,
            current.join('\n'),
            footer
        ].join('\n');
    }

    // Remove complete evidence lines if still over budget.
    while (prompt.length > MAX_PROMPT_CHARS && selected.length) {
        selected.pop();

        prompt = [
            base,
            selected.join('\n'),
            diagramHeader,
            current.join('\n'),
            footer
        ].join('\n');
    }

    if (prompt.length > MAX_PROMPT_CHARS) {
        throw new Error(
            `Unable to fit prompt within ${MAX_PROMPT_CHARS} characters. Actual: ${prompt.length}`
        );
    }

    return prompt;
}

// ============================================================
// 5. EXECUTE LOCAL QWEN THROUGH LLAMA-CLI
// ============================================================

function runLlama(prompt, label) {
    return new Promise(resolve => {
        const args = [
            '-hf', MODEL,
            '-c', String(process.env.LLAMA_CONTEXT || 8192),
            '-n', String(MAX_TOKENS),
            '-t', String(process.env.LLAMA_THREADS || 8),
            '-ngl', '0',
            '--reasoning', 'off',
            '--temp', '0.2',
            '--no-display-prompt',
            '--simple-io',
            '--single-turn',
            '--log-disable',
            '-p', prompt
        ];

        const started = Date.now();

        let stdout = '';
        let stderr = '';
        let settled = false;
        let child;
        let timer = null;
        let killTimer = null;

        const finish = result => {
            if (settled) return;

            settled = true;

            if (timer) clearTimeout(timer);
            if (killTimer) clearTimeout(killTimer);

            resolve({
                ...result,
                elapsedMs: Date.now() - started,
                stdout,
                stderr
            });
        };

        try {
            child = spawn(CLI, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: process.env
            });

        } catch (error) {
            finish({
                status: 'SPAWN_ERROR',
                error: error.message
            });

            return;
        }

        timer = setTimeout(() => {
            log(`TIMEOUT: ${label}; terminating Qwen process.`);

            try {
                child.kill('SIGTERM');
            } catch (_) {}

            killTimer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch (_) {}
            }, 5000);

            finish({
                status: 'TIMEOUT',
                error: `Inference exceeded ${TIMEOUT_MS} ms`
            });

        }, TIMEOUT_MS);

        child.stdout.on('data', chunk => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });

        child.on('error', error => {
            finish({
                status: 'SPAWN_ERROR',
                error: error.message
            });
        });

        child.on('close', (code, signal) => {
            finish({
                status: code === 0 ? 'COMPLETED' : 'PROCESS_ERROR',
                exitCode: code,
                signal,
                error: code === 0
                    ? null
                    : `llama-cli exited with code ${code}${signal ? ` (${signal})` : ''}`
            });
        });

        log(
            `Qwen started: ${label}; prompt=${prompt.length} chars; timeout=${Math.round(TIMEOUT_MS / 60000)} minutes.`
        );
    });
}

// ============================================================
// 6. EXTRACT AND VALIDATE MERMAID RESPONSE
// ============================================================

function extractMermaid(text) {
    const fenced = /```(?:mermaid)?\s*\n([\s\S]*?)```/i.exec(text || '');

    if (fenced) {
        return fenced[1].trim();
    }

    const lines = String(text || '')
        .split(/\r?\n/)
        .map(line => line.trim());

    const start = lines.findIndex(line =>
        /^(flowchart|graph|sequenceDiagram|stateDiagram-v2|classDiagram|erDiagram)\b/i.test(line)
    );

    return start >= 0
        ? lines.slice(start).join('\n').trim()
        : '';
}

function expectedHeader(kind) {
    const headers = {
        use_case: /^(flowchart|graph)\s/i,
        process: /^(flowchart|graph)\s/i,
        sequence: /^sequenceDiagram\b/i,
        state: /^stateDiagram-v2\b/i,
        decision: /^(flowchart|graph)\s/i
    };

    return headers[kind];
}

// ============================================================
// 7. SAVE AI RESPONSE WITHOUT DESTROYING DETERMINISTIC OUTPUT
// ============================================================

function appendAiResult(artifact, result, rawFile) {
    const raw = result.stdout || '';

    save(
        rawFile,
        [
            raw,
            result.stderr
                ? `\n\n--- STDERR ---\n${result.stderr}`
                : '',
            result.error
                ? `\n\n--- ERROR ---\n${result.error}`
                : ''
        ].join('')
    );

    const candidate = extractMermaid(raw);

    let status = result.status;

    let section =
        `\n## AI generation result\n\nStatus: **${status}**.\n`;

    if (
        result.status === 'COMPLETED' &&
        candidate &&
        expectedHeader(artifact.kind).test(candidate)
    ) {
        status = 'AI_DIAGRAM_GENERATED';

        section = [
            '',
            '## AI-generated diagram candidate',
            '',
            C.fence(candidate),
            '',
            'AI output is retained as a separate candidate; the deterministic source diagram above is preserved for comparison.',
            ''
        ].join('\n');

    } else if (raw.trim()) {
        status = result.status === 'COMPLETED'
            ? 'AI_RESPONSE_NOT_VALID_MERMAID'
            : result.status;

        section += [
            '',
            'The deterministic diagram is retained.',
            'Raw model output is saved under the `raw/` directory.',
            ''
        ].join('\n');

    } else {
        section += [
            '',
            'No usable model output was returned.',
            'The deterministic diagram is retained.',
            ''
        ].join('\n');
    }

    artifact.content += section;

    artifact.aiStatus = status;
    artifact.aiElapsedMs = result.elapsedMs;
    artifact.aiError = result.error || null;
}

// ============================================================
// 8. MAIN GENERATION WORKFLOW
// ============================================================

async function run(injectedPool = null) {
    const pool = injectedPool || C.createPool();

    const report = {
        startedAt: new Date().toISOString(),
        outputDir: OUT_DIR,
        diagrams: [],
        modelStats: null
    };

    try {
        log('Starting AI-assisted generation of all five functional diagrams.');

        log('Loading Knowledge Base, Requirements and Business Rules.');

        const model = await C.loadModel(pool);

        report.modelStats = model.stats;

        log(`Business model loaded: ${json(model.stats)}`);

        // One timestamp for all five diagram outputs in this run.
        const runTimestamp = getFileTimestamp();

        // --------------------------------------------------------
        // STEP 1: Build all five deterministic diagrams.
        // --------------------------------------------------------

        const artifacts = makeArtifacts(model, runTimestamp);

        // Write every deterministic output before any Qwen inference.
        for (const artifact of artifacts) {
            save(
                path.join(OUT_DIR, artifact.file),
                artifact.content
            );

            report.diagrams.push({
                kind: artifact.kind,
                file: artifact.file,
                deterministic: artifact.buildError
                    ? 'FAILED'
                    : 'SUCCESS',
                ai: 'PENDING'
            });
        }

        save(
            path.join(OUT_DIR, '00_generation_report.json'),
            json(report)
        );

        log(
            'All five deterministic diagram outputs have been written.'
        );

        // --------------------------------------------------------
        // STEP 2: Attempt Qwen generation for all five diagrams.
        // --------------------------------------------------------

        for (const artifact of artifacts) {
            log(`Preparing ${artifact.title}.`);

            const row = report.diagrams.find(
                item => item.kind === artifact.kind
            );

            try {
                const prompt = buildPrompt(model, artifact);

                save(
                    path.join(
                        RAW_DIR,
                        'prompts',
                        `${artifact.kind}.txt`
                    ),
                    prompt
                );

                const result = await runLlama(
                    prompt,
                    artifact.title
                );

                appendAiResult(
                    artifact,
                    result,
                    path.join(RAW_DIR, `${artifact.kind}.txt`)
                );

            } catch (error) {
                // Failure for one diagram must not prevent the next.
                artifact.aiStatus = 'GENERATION_ERROR';
                artifact.aiElapsedMs = 0;
                artifact.aiError = error.stack || error.message;

                artifact.content += [
                    '',
                    '## AI generation result',
                    '',
                    '**GENERATION_ERROR**',
                    '',
                    safe(error.stack || error.message, 3000),
                    '',
                    'The deterministic diagram is retained.',
                    ''
                ].join('\n');

                save(
                    path.join(
                        RAW_DIR,
                        `${artifact.kind}_error.txt`
                    ),
                    error.stack || error.message
                );

                log(
                    `ERROR during AI generation for ${artifact.title}: ${error.message}`
                );
            }

            // Always rewrite the output, retaining deterministic content.
            save(
                path.join(OUT_DIR, artifact.file),
                artifact.content
            );

            row.ai = artifact.aiStatus;
            row.aiElapsedMs = artifact.aiElapsedMs;
            row.aiError = artifact.aiError;

            save(
                path.join(OUT_DIR, '00_generation_report.json'),
                json(report)
            );

            log(
                `${artifact.title}: deterministic=${row.deterministic}; ` +
                `AI=${row.ai}; elapsed=${Math.round((row.aiElapsedMs || 0) / 1000)}s.`
            );
        }

        // --------------------------------------------------------
        // STEP 3: Final report.
        // --------------------------------------------------------

        report.completedAt = new Date().toISOString();

        report.durationMs =
            Date.now() - new Date(report.startedAt).getTime();

        save(
            path.join(OUT_DIR, '00_generation_report.json'),
            json(report)
        );

        const readme = [
            '# AI-assisted functional diagrams',
            '',
            'All five diagram types are attempted on every run.',
            'Deterministic outputs are written before local model inference.',
            'AI-generated candidates are kept separately from deterministic diagrams.',
            '',
            '| Diagram | Deterministic output | AI status |',
            '|---|---|---|',
            ...report.diagrams.map(d =>
                `| ${d.kind} | [${d.file}](${d.file}) | ${d.ai} |`
            ),
            '',
            'Raw prompts and responses are saved in `raw/`.',
            'Deterministic specifications are saved in `specs/`.',
            '',
            `Started: ${report.startedAt}`,
            `Completed: ${report.completedAt}`,
            `Duration: ${Math.round(report.durationMs / 1000)} seconds`,
            ''
        ].join('\n');

        save(
            path.join(OUT_DIR, 'README.md'),
            readme
        );

        log(
            `Completed all five diagram attempts. Output: ${OUT_DIR}`
        );

        return report;

    } finally {
        if (!injectedPool) {
            await pool.end();
        }
    }
}

// ============================================================
// 8A. SELECTIVELY RERUN ONE AI DIAGRAM
// ============================================================

async function rerunAiDiagram({ diagram } = {}) {
    let pool;

    try {
        const aliases = {
            'use case': 'use_case',
            use_case: 'use_case',
            'business process': 'process',
            bpmn: 'process',
            process: 'process',
            sequence: 'sequence',
            'sequence diagram': 'sequence',
            state: 'state',
            'state machine': 'state',
            'state machine diagrams': 'state',
            decision: 'decision',
            dmn: 'decision',
            'decision table': 'decision',
            'decision table / dmn': 'decision'
        };

        const kind = aliases[String(diagram || '').trim().toLowerCase()];

        if (!kind) {
            throw new Error(
                `Unknown diagram "${diagram}". Supported diagrams: use case, process, sequence, state, decision.`
            );
        }

        log(`Starting rerun for diagram: ${kind}`);

        // Load the business model.
        pool = C.createPool();

        const model = await C.loadModel(pool);

        // Use the existing diagram specification builders.
        const builders = {
            use_case: () => C.buildUseCaseSpecs(model),
            process: () => C.buildProcessSpec(model),
            sequence: () => C.buildSequenceSpec(model),
            state: () => C.buildStateSpecs(model),
            decision: () => C.buildDecisionSpecs(model)
        };

        // Build only the requested diagram specification.
        const spec = await builders[kind]();

        if (
            spec === null ||
            spec === undefined ||
            (Array.isArray(spec) && spec.length === 0)
        ) {
            throw new Error(
                `No specification generated for diagram "${kind}".`
            );
        }

        // One fresh timestamp for this selective rerun.
        const rerunTimestamp = getFileTimestamp();

        // Pass the complete specification to the existing renderer.
        // Use Case requires the complete array.
        const artifact = markdownFor(
            model,
            kind,
            spec,
            rerunTimestamp
        );

        if (!artifact || !artifact.file || !artifact.content) {
            throw new Error(
                `Failed to create Markdown artifact for "${kind}".`
            );
        }

        // Use the centralized filename generated by markdownFor().
        const outputPath = path.join(OUT_DIR, artifact.file);

        // Save deterministic output before AI generation.
        save(outputPath, artifact.content);

        log(`Deterministic diagram saved: ${outputPath}`);
        log(`Starting AI generation for: ${kind}`);

        const rawFile = path.join(
            RAW_DIR,
            `${path.parse(artifact.file).name}.raw.txt`
        );

        let result;

        try {
            const prompt = buildPrompt(model, artifact);

            result = await runLlama(prompt, kind);

        } catch (error) {
            result = {
                status: 'AI_GENERATION_ERROR',
                elapsedMs: 0,
                error: error.message,
                stdout: '',
                stderr: ''
            };
        }

        // Apply the AI result using the existing result handler.
        appendAiResult(artifact, result, rawFile);

        // Save the final result for this diagram only.
        save(outputPath, artifact.content);

        log(`Rerun completed: ${artifact.file}`);
        log(`AI status: ${artifact.aiStatus}`);

        return {
            kind,
            filename: artifact.file,
            deterministic: 'SUCCESS',
            aiStatus: artifact.aiStatus,
            aiElapsedMs: artifact.aiElapsedMs,
            aiError: artifact.aiError || null,
            outputPath
        };

    } catch (error) {
        log(`RERUN ERROR: ${error.stack || error.message}`);
        throw error;

    } finally {
        if (pool) {
            await pool.end();
        }
    }
}

// ============================================================
// 9. COMMAND-LINE ENTRY POINT
// ============================================================

if (require.main === module) {
    const args = process.argv.slice(2);

    const rerun = args.includes('--rerun');
    const diagramIndex = args.indexOf('--diagram');

    const diagram = diagramIndex >= 0
        ? args[diagramIndex + 1]
        : undefined;

    let execution;

    if (rerun) {
        if (!diagram || diagram.startsWith('--')) {
            console.error(
                '[8.0.13] CLI ERROR: --rerun requires --diagram.'
            );

            process.exitCode = 1;
        } else {
            execution = rerunAiDiagram({ diagram });
        }

    } else {
        if (diagramIndex >= 0) {
            console.error(
                '[8.0.13] CLI ERROR: --diagram is only supported with --rerun.'
            );

            process.exitCode = 1;
        } else {
            execution = run();
        }
    }

    if (execution) {
        execution
            .then(result => {
                if (rerun) {
                    log(`Rerun result: ${json(result)}`);

                    if (result.aiStatus !== 'AI_DIAGRAM_GENERATED') {
                        process.exitCode = 1;
                    }

                    return;
                }

                const failed = result.diagrams.filter(
                    d => d.deterministic === 'FAILED'
                );

                if (failed.length) {
                    log(
                        `${failed.length} deterministic diagram(s) failed. Check generation report.`
                    );

                    process.exitCode = 1;
                }
            })
            .catch(error => {
                console.error(
                    `[8.0.13] FATAL: ${error.stack || error.message}`
                );

                process.exitCode = 1;
            });
    }
}

// ============================================================
// 10. EXPORTS
// ============================================================

module.exports = {
    run,
    rerunAiDiagram,
    makeArtifacts,
    markdownFor,
    buildPrompt,
    extractMermaid,
    getFileTimestamp,
    getDiagramFilename
};