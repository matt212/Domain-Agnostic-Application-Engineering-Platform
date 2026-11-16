'use strict';

/**
 * 8.5.1 - DIAGRAMS, DETERMINISTIC (no AI model)
 *
 * Reads the three PostgreSQL repositories (knowledge base, requirements schema,
 * business_rule_discovery schema) and produces five Mermaid diagrams, one .md file each:
 *   01 Use Case Diagram            02 BPMN-style Business Process      03 Sequence Diagrams
 *   04 State Machine Diagrams      05 Decision Table / DMN (+ DRD)
 *
 *   node 8.5.1.DiagramsDeterministic.js
 *
 * Requires 8.5.0.DiagramCommon.js in the same folder. Same input always gives the same output.
 * Every generated file is prefixed with the run time: 20261115_163042_01_use_case_diagram.md
 * Scenario titles come from the data (lifecycle stages, exception rules); nothing is hardcoded.
 * Output: app/utils/appflowgeneratorAI/aiOutput/diagrams/deterministic/  (override: DIAGRAM_OUTPUT_DIR)
 */

const path = require('path');
const fs = require('fs');
const C = require('./8.5.0.DiagramCommon.js');

const OUTPUT_DIR = process.env.DIAGRAM_OUTPUT_DIR ||
    path.join(process.cwd(), 'app/utils/appflowgeneratorAI/aiOutput/diagrams/deterministic');

async function run(injectedPool = null) {
    const pool = injectedPool || C.createPool();
    try {
        const model = await C.loadModel(pool);
        C.log(`Loaded: ${JSON.stringify(model.stats)}`);
        if (!model.activities.length) throw new Error('No business activities were found in the knowledge base; nothing to draw.');
        return generate(model);
    } finally {
        if (!injectedPool) await pool.end();
    }
}

function generate(model) {
    const src = C.sourceLine(model);
    const stamp = `Generated ${new Date().toISOString()} by 8.5.1.DiagramsDeterministic.js (no AI). ${src}`;
    const written = [];
    fs.mkdirSync(path.join(OUTPUT_DIR, 'specs'), { recursive: true });
    const saveSpec = (name, spec) => fs.writeFileSync(path.join(OUTPUT_DIR, 'specs', `${C.RUN_STAMP}_${name}.json`), JSON.stringify(spec, null, 2));

    // ---- 1. use case ----
    const ucSpecs = C.buildUseCaseSpecs(model);
    saveSpec('use_case', ucSpecs);
    const ucBlocks = [];
    ucSpecs.forEach(spec => { ucBlocks.push(`## ${spec.title}`, '', C.fence(C.renderUseCase(spec)), ''); });
    if (model.brs.length) {
        ucBlocks.push('## Traceability: business requirement to functional requirements', '',
            '| Business requirement | Functional requirements |', '|---|---|',
            ...model.brs.map(b => `| ${b.id} ${b.name} | ${b.frs.join(', ') || '(none)'} |`), '');
    }
    written.push(C.writeDoc(OUTPUT_DIR, '01_use_case_diagram.md', 'Use Case Diagram', [
        'Actors, system boundary and functional capabilities.', '',
        'Solid line: primary actor. Dotted line: supporting actor. Actors sit outside the system boundary; use cases sit inside it.',
        'Mermaid has no native use case diagram, so this is a flowchart that follows UML use case conventions.', '', stamp], ucBlocks));

    // ---- 2. business process: the main flow and the exception paths ----
    const procMain = C.buildProcessSpec(model);
    const procExc = C.buildProcessSpec(model, { ruleTypes: ['Exception handling'], title: 'Exception paths' });
    saveSpec('business_process', [procMain, procExc]);
    const procBlocks = [];
    [procMain, procExc].forEach(p => {
        procBlocks.push(`## ${p.title}`, '', C.fence(C.renderProcess(p)), '',
            `Swimlanes: ${[...new Set(p.nodes.map(n => n.lane).filter(Boolean))].join(', ')}`, '');
    });
    written.push(C.writeDoc(OUTPUT_DIR, '02_business_process_bpmn.md', 'BPMN-style Business Process Diagram', [
        'End-to-end business process: activities in lifecycle order, one swimlane per responsible actor.', '',
        'Diamond: a business rule check. Red rounded box: the exception path taken when the rule is broken (from the business rules repository).',
        'Mermaid has no native BPMN type, so swimlanes are subgraphs.', '', stamp], procBlocks));

    // ---- 3. sequence: scenarios derived from lifecycle stages and exception rules ----
    const scenarios = C.sequenceScenarios(model);
    const seqSpecs = scenarios.map(s => C.buildSequenceSpec(model, s));
    saveSpec('sequence', seqSpecs);
    const seqBlocks = [];
    seqSpecs.forEach((spec, i) => { seqBlocks.push(`## Scenario ${i + 1}: ${spec.title}`, '', C.fence(C.renderSequence(spec)), ''); });
    written.push(C.writeDoc(OUTPUT_DIR, '03_sequence_diagram.md', 'Sequence Diagrams', [
        'Interactions between actors and system participants over time. Scenarios are derived from the data: groups of lifecycle stages, plus one for the exception rules.', '',
        'Solid arrow: an activity handed from the primary actor to a supporting actor. Dashed arrow: an information flow. alt blocks: a business rule and what happens when it is broken.', '', stamp], seqBlocks));

    // ---- 4. state machines ----
    const states = C.buildStateSpecs(model);
    saveSpec('state_machines', states);
    const stBlocks = states.length ? [] : ['_No business object had two or more lifecycle states in the data._', ''];
    states.forEach(s => { stBlocks.push(`## ${s.object}`, '', s.purpose ? `Purpose: ${s.purpose}` : '', '', C.fence(C.renderState(s)), ''); });
    written.push(C.writeDoc(OUTPUT_DIR, '04_state_machine_diagrams.md', 'State Machine Diagrams', [
        'Lifecycle of each business object: states are the lifecycle stages the object passes through, transitions are the activities that move it, guards are business rules that apply.', '',
        `${states.length} of ${model.objects.length} business objects have a lifecycle with two or more states.`, '', stamp], stBlocks));

    // ---- 5. decision table / DMN ----
    const dec = C.buildDecisionSpecs(model);
    saveSpec('decision_tables', dec);
    const decBlocks = [];
    if (!dec.tables.length) decBlocks.push('_No business rules were found, so there are no decisions to tabulate._', '');
    else {
        decBlocks.push('## Decision requirements diagram', '', C.fence(C.renderDrd(dec.drd)), '',
            'Edge numbers are rule counts. Left: business objects the rules are about. Middle: rule types (the decisions). Right: what happens when a rule is broken.', '',
            '## Decision tables', '');
        dec.tables.forEach(t => decBlocks.push(C.renderDecisionTable(t), ''));
    }
    written.push(C.writeDoc(OUTPUT_DIR, '05_decision_table_dmn.md', 'Decision Table / DMN', [
        'Business rules, conditions and decision outcomes. Mermaid has no DMN type, so decisions are Markdown decision tables plus a Mermaid decision requirements diagram (DRD).', '', stamp], decBlocks));

    // ---- index ----
    const link = f => `[${path.basename(f)}](${path.basename(f)})`;
    const names = ['Use Case', 'BPMN-style process', 'Sequence', 'State machines', 'Decision table / DMN'];
    written.push(C.writeDoc(OUTPUT_DIR, 'README.md', 'Diagram set (deterministic)', [stamp, ''], [
        '| Diagram | File |', '|---|---|', ...names.map((n, i) => `| ${n} | ${link(written[i])} |`), '',
        'View the Mermaid blocks in VS Code (Markdown Preview Mermaid Support), GitHub, or paste them into https://mermaid.live']));

    C.log(`Wrote ${written.length} files to ${OUTPUT_DIR}`);
    written.forEach(f => console.log(`  ${f}`));
    return { written, model };
}

if (require.main === module) run().catch(e => { console.error(e); process.exit(1); });

module.exports = { run, generate };
