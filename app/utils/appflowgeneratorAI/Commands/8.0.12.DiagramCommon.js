'use strict';

/**
 * 8.5.0 - DIAGRAM COMMON (shared by 8.5.1.DiagramsDeterministic.js and 8.5.2.DiagramsAI.js)
 *
 * Reads the three repositories in PostgreSQL:
 *   1. Knowledge base          (knowledge_* tables)
 *   2. Requirements repository (requirements schema)
 *   3. Business rule discovery (business_rule_discovery schema)
 * builds neutral "specs" for five diagrams, and renders each spec to Mermaid:
 *   Use Case (flowchart), Business Process / BPMN-style (flowchart with swimlanes),
 *   Sequence, State Machine, Decision Table + DRD (markdown table + flowchart).
 * Domain agnostic: nothing in here knows what the business is.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

// ============================================================
// 1. CONFIGURATION AND DATABASE ACCESS
// ============================================================

const ROOT = process.cwd();
const DB_CONFIG_PATH = path.join(ROOT, 'app/config/config.json');

function createPool() {
    if (!fs.existsSync(DB_CONFIG_PATH)) {
        throw new Error(`Database configuration not found: ${DB_CONFIG_PATH}`);
    }
    const config = JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8')).development;
    if (!config) {
        throw new Error('The development database configuration is missing.');
    }
    return new Pool({
        user: config.username,
        password: config.password,
        database: config.database,
        host: config.host,
        port: Number(config.port),
        max: 2
    });
}

const LIMITS = {
    maxUseCases: Number(process.env.MAX_USECASES || 30),
    maxProcessActivities: Number(process.env.MAX_PROCESS_ACTIVITIES || 16),
    maxDecisions: Number(process.env.MAX_DECISIONS || 12),
    maxSequenceActivities: Number(process.env.MAX_SEQUENCE_ACTIVITIES || 14),
    matchSim: Number(process.env.MATCH_SIM || 0.15),
    dedupeSim: Number(process.env.RULE_DEDUPE_SIM || 0.5),
    drdEdges: 40
};

const SYSTEM_ROLE = /\b(automated|system component|software|algorithm|engine|bot)\b/i;
const KB_CATEGORIES = [
    'ACTOR_DEFINITION', 'ACTOR_RESPONSIBILITY', 'ACTOR_BUSINESS_OBJECT_RELATIONSHIP', 'BUSINESS_OBJECT',
    'BUSINESS_ACTIVITY', 'INFORMATION_REQUIREMENT', 'BUSINESS_LIFECYCLE_STAGE'
];
const RULE_TYPES = ['Validation', 'Eligibility', 'Calculation', 'Authorization', 'Timing', 'State transition',
    'Limit', 'Compliance', 'Financial control', 'Exception handling', 'Audit and retention'];
const DECISION_TYPES = ['Validation', 'Eligibility', 'Authorization', 'Compliance', 'Limit', 'Timing', 'Financial control'];

// ============================================================
// 2. HELPERS
// ============================================================

const log = m => console.log(`[diagrams] ${new Date().toISOString()} ${m}`);
const arr = v => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
const uniq = l => [...new Set(l.filter(Boolean))];
const shortHash = t => crypto.createHash('sha1').update(String(t)).digest('hex').slice(0, 8);
const cut = (v, n) => {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim();
    return t.length <= n ? t : t.slice(0, n - 3) + '...';
};
const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function same(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    return (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y));
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'shall', 'system', 'their',
    'have', 'been', 'will', 'such', 'each', 'when', 'then', 'which', 'based', 'business', 'must', 'not', 'only',
    'may', 'are', 'any', 'all', 'its', 'has', 'can', 'who', 'what']);
function stem(w) {
    if (w.length > 5) w = w.replace(/(ations?|ates?|ated|ating|ions?|ings?|ments?)$/, '');
    if (w.length > 4) w = w.replace(/(ies|ied)$/, 'y').replace(/(ed|es|s)$/, '');
    if (w.length > 4) w = w.replace(/e$/, '');
    return w;
}
const stemTokens = s => norm(s).split(' ').filter(w => w.length >= 3 && !STOP.has(w)).map(stem);

function flatText(o) {
    if (o == null) return '';
    if (typeof o !== 'object') return String(o);
    return Object.values(o).map(flatText).join(' ');
}

// knowledge_records.content is a wrapper { id, content: {fields}, ... } or the fields themselves
function inner(row) {
    let c = row.content;
    if (typeof c === 'string') { try { c = JSON.parse(c); } catch { return { text: c }; } }
    c = c || {};
    let b = c.content !== undefined ? c.content : c;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return { text: b }; } }
    if (Array.isArray(b)) return { items: b };
    return b && typeof b === 'object' ? b : { text: String(b ?? '') };
}
// position of a record inside its source file: STAGE_5_ACTIVITIES_RECORD_00003 -> 3
function seqOf(row) {
    const id = row.content && typeof row.content === 'object' ? row.content.id : '';
    const m = /(\d+)\s*$/.exec(String(id || ''));
    return m ? Number(m[1]) : 0;
}

// jsonb arrives parsed; tolerate strings and nested objects
function toList(v) {
    if (v === undefined || v === null || v === '') return [];
    if (typeof v === 'string' && /^\s*\[/.test(v)) { try { return toList(JSON.parse(v)); } catch { /* keep */ } }
    return arr(v).map(x => (x && typeof x === 'object' ? flatText(x) : String(x))).map(x => x.trim()).filter(Boolean);
}
const jtext = v => (v === null || v === undefined ? '' : typeof v === 'string' ? v : flatText(v)).trim();

function flatten(row) {
    const out = {};
    const walk = (o, d) => {
        for (const [k, v0] of Object.entries(o || {})) {
            let v = v0;
            if (typeof v === 'string' && /^\s*[[{]/.test(v)) { try { v = JSON.parse(v); } catch { /* keep */ } }
            if (v && typeof v === 'object' && !Array.isArray(v) && d < 2) walk(v, d + 1);
            if (!(k in out)) out[k] = v;
        }
    };
    walk(row, 0);
    return out;
}
function pick(flat, patterns) {
    for (const p of patterns) {
        for (const k of Object.keys(flat)) {
            const v = flat[k];
            if (p.test(k) && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) return v;
        }
    }
    return undefined;
}

// ---- TF-IDF similarity: IDF comes from the texts themselves, so it adapts to any domain ----
function tfidf(texts) {
    const docs = texts.map(stemTokens), df = new Map();
    docs.forEach(d => new Set(d).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
    const N = docs.length;
    return docs.map(d => {
        const v = new Map();
        d.forEach(w => v.set(w, (v.get(w) || 0) + Math.log((N + 1) / (df.get(w) + 1)) + 1));
        const n2 = Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0)) || 1;
        v.forEach((x, k) => v.set(k, x / n2));
        return v;
    });
}
function cosine(a, b) {
    let s = 0;
    for (const [k, x] of a) { const y = b.get(k); if (y) s += x * y; }
    return s;
}
function crossSimilarity(textsA, textsB) {
    if (!textsA.length || !textsB.length) return textsA.map(() => textsB.map(() => 0));
    const V = tfidf([...textsA, ...textsB]);
    const A = V.slice(0, textsA.length), B = V.slice(textsA.length);
    return A.map(a => B.map(b => cosine(a, b)));
}
function groupSimilar(texts, minSim) {
    const n = texts.length;
    if (!n) return [];
    const V = tfidf(texts);
    const S = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : cosine(V[i], V[j]))));
    const link = (a, b) => { let t = 0; for (const i of a) for (const j of b) t += S[i][j]; return t / (a.length * b.length); };
    const cl = V.map((_, i) => [i]);
    while (cl.length > 1) {
        let best = -1, bi = 0, bj = 0;
        for (let i = 0; i < cl.length; i++) for (let j = i + 1; j < cl.length; j++) {
            const l = link(cl[i], cl[j]);
            if (l > best) { best = l; bi = i; bj = j; }
        }
        if (best < minSim) break;
        cl[bi] = cl[bi].concat(cl[bj]);
        cl.splice(bj, 1);
    }
    return cl;
}

// generic English outcome classes for "what happens when a rule is broken"
function outcomeClass(text) {
    const t = String(text || '').toLowerCase();
    if (/escalat|supervisor|manager|review/.test(t)) return 'Escalate for review';
    if (/reject|block|deny|decline|prevent|refuse|cancel/.test(t)) return 'Reject or block';
    if (/refund|compensat|credit|reimburs|reverse/.test(t)) return 'Compensate or reverse';
    if (/suspend|terminate|disable|revoke|deactivat/.test(t)) return 'Suspend or revoke';
    if (/notify|alert|inform|warn/.test(t)) return 'Notify';
    if (/log|record|audit|flag/.test(t)) return 'Record and flag';
    return 'Handle manually';
}

// ============================================================
// 3. LOAD THE THREE REPOSITORIES INTO ONE MODEL
// ============================================================

async function safeQuery(pool, label, sql, params = []) {
    try { return (await pool.query(sql, params)).rows; }
    catch (e) { log(`WARNING: ${label} could not be read: ${e.message}`); return []; }
}

async function loadModel(pool) {
    // ---------- 1. knowledge base ----------
    const kbRows = await pool.query(
        `SELECT record_id, semantic_category, content FROM knowledge_records
          WHERE semantic_category = ANY($1) ORDER BY record_id`, [KB_CATEGORIES]);
    const kb = kbRows.rows.map(r => ({ cat: r.semantic_category, d: inner(r), seq: seqOf(r) }));
    const of = c => kb.filter(x => x.cat === c).sort((a, b) => a.seq - b.seq);

    let domain = '', niche = '';
    const meta = await safeQuery(pool, 'domain and niche',
        `SELECT content FROM knowledge_records WHERE content::text ILIKE '%"niche"%' LIMIT 20`);
    for (const r of meta) {
        const f = flatten(inner(r));
        domain = domain || cut(pick(f, [/^domain$/]), 80);
        niche = niche || cut(pick(f, [/^niche$/]), 80);
    }
    const systemName = [domain, niche].filter(Boolean).join(' / ') || 'System';

    const responsibilities = of('ACTOR_RESPONSIBILITY').map(x => ({
        actor: x.d.actor, type: x.d.actor_type || '',
        items: arr(x.d.responsibilities).map(r => ({ name: r.responsibility, fn: r.business_function, desc: cut(r.responsibility_description, 160) }))
    })).filter(r => r.actor);

    const actors = [];
    const addActor = (name, role = '') => {
        if (!name) return name;
        const hit = actors.find(a => same(a.name, name));
        if (hit) { if (!hit.role && role) hit.role = role; return hit.name; }
        const type = (responsibilities.find(r => same(r.actor, name)) || {}).type || '';
        actors.push({ name, role: cut(role, 160), kind: SYSTEM_ROLE.test(role) ? 'system' : /external/i.test(type) ? 'external' : 'internal' });
        return name;
    };
    of('ACTOR_DEFINITION').forEach(x => addActor(x.d.actor_name, x.d.operational_role));
    responsibilities.forEach(r => addActor(r.actor));

    const stages = of('BUSINESS_LIFECYCLE_STAGE').map(x => ({ name: x.d.stage, desc: cut(x.d.description, 160), trigger: cut(x.d.trigger, 160) }))
        .filter(s => s.name);

    const objects = of('BUSINESS_OBJECT').map(x => ({
        name: x.d.object_name, purpose: cut(x.d.purpose, 160), lifecycle: cut(x.d.lifecycle_role, 160),
        firstStage: x.d.first_stage || '', deps: toList(x.d.dependencies)
    })).filter(o => o.name);

    const stageOfResp = name => {
        for (const r of responsibilities) {
            const it = r.items.find(i => same(i.name, name));
            if (it) return it.fn || '';
        }
        return '';
    };
    const activities = of('BUSINESS_ACTIVITY').map(x => {
        const d = x.d;
        const fn = stageOfResp(d.related_responsibility);
        const stageIdx = stages.findIndex(s => same(s.name, fn));
        return {
            name: d.activity_name, desc: cut(d.activity_description, 200),
            primary: addActor(d.primary_actor), supporting: toList(d.supporting_actors).map(a => addActor(a)),
            inputs: toList(d.input_business_objects), outputs: toList(d.output_business_objects),
            precondition: cut(d.trigger_or_precondition, 200), outcome: cut(d.business_outcome, 200),
            stage: stageIdx >= 0 ? stages[stageIdx].name : fn, stageIdx: stageIdx >= 0 ? stageIdx : 999, seq: x.seq
        };
    }).filter(a => a.name).sort((a, b) => a.stageIdx - b.stageIdx || a.seq - b.seq);

    const interactions = of('ACTOR_BUSINESS_OBJECT_RELATIONSHIP').filter(x => x.d.actor && x.d.business_object)
        .map(x => ({ actor: addActor(x.d.actor), object: x.d.business_object, type: x.d.interaction_type || '', desc: cut(x.d.interaction_description, 140) }));

    const irs = of('INFORMATION_REQUIREMENT').filter(x => x.d.description).map(x => {
        const flow = x.d.information_flow || {};
        return {
            label: cut(x.d.information_requirement || x.d.requirement_name || x.d.description, 80),
            description: cut(x.d.description, 160), source: jtext(flow.source), trigger: jtext(flow.trigger),
            consumers: toList(flow.consumer), activities: toList(x.d.related_activities)
        };
    });

    // ---------- 2. requirements repository ----------
    const frRows = await safeQuery(pool, 'requirements.functional_requirements',
        `SELECT functional_requirement_id, name, description, raw_payload
           FROM requirements.functional_requirements ORDER BY functional_requirement_id`);
    const frs = frRows.map(r => {
        const f = flatten(r.raw_payload || {});
        return {
            id: r.functional_requirement_id,
            text: cut(r.name || r.description || pick(f, [/^(requirement|requirement_text|statement)$/]) || '', 220),
            need: cut(pick(f, [/^business_need$/]), 200)
        };
    });
    const brRows = await safeQuery(pool, 'requirements.business_requirements',
        `SELECT business_requirement_id, name, business_requirement, business_objective, stakeholders, priority,
                policies_and_constraints, linked_functional_requirements
           FROM requirements.business_requirements ORDER BY business_requirement_id`);
    const brs = brRows.map(r => ({
        id: r.business_requirement_id, name: cut(r.name || r.business_requirement, 90),
        requirement: cut(r.business_requirement, 300), objective: cut(r.business_objective, 200),
        stakeholders: toList(r.stakeholders).map(a => addActor(a)), priority: r.priority || '',
        policies: toList(r.policies_and_constraints), frs: toList(r.linked_functional_requirements)
    }));
    const traceRows = await safeQuery(pool, 'requirements.v_fr_br_traceability',
        `SELECT functional_requirement_id, business_requirement_id FROM requirements.v_fr_br_traceability`);
    const links = new Map(brs.map(b => [b.id, new Set(b.frs)]));
    traceRows.forEach(t => { if (links.has(t.business_requirement_id)) links.get(t.business_requirement_id).add(t.functional_requirement_id); });
    brs.forEach(b => { b.frs = [...links.get(b.id)]; });

    // ---------- 3. business rule discovery ----------
    let run = process.env.RULE_INGESTION_RUN_ID ? { ingestion_run_id: Number(process.env.RULE_INGESTION_RUN_ID) } : null;
    if (!run) {
        for (const status of ['SUCCESS', 'PARTIAL']) {
            const r = await safeQuery(pool, 'business_rule_discovery.ingestion_runs',
                `SELECT ingestion_run_id FROM business_rule_discovery.ingestion_runs
                  WHERE ingestion_status = $1 ORDER BY ingestion_run_id DESC LIMIT 1`, [status]);
            if (r.length) { run = r[0]; break; }
        }
    }
    let rawRules = [], units = [];
    if (run) {
        rawRules = await safeQuery(pool, 'business_rule_discovery.business_rules',
            `SELECT unit_id, rule_position, name, statement, type, condition, exceptions, actors, objects, enforcement,
                    severity, if_violated, rationale, related_functional_requirements, basis, review_status
               FROM business_rule_discovery.business_rules
              WHERE ingestion_run_id = $1 AND review_status <> 'REJECTED' ORDER BY unit_id, rule_position`, [run.ingestion_run_id]);
        units = await safeQuery(pool, 'business_rule_discovery.generation_units',
            `SELECT unit_id, unit_kind, title, business_requirement_id FROM business_rule_discovery.generation_units
              WHERE ingestion_run_id = $1 ORDER BY unit_id`, [run.ingestion_run_id]);
    } else log('WARNING: no ingestion run found in business_rule_discovery; diagrams are built without business rules.');
    const rules = dedupeRules(rawRules.map(r => ({
        unit: r.unit_id, name: cut(r.name, 100), statement: cut(r.statement, 320),
        type: RULE_TYPES.find(t => t.toLowerCase() === String(r.type || '').toLowerCase()) || 'Validation',
        condition: cut(jtext(r.condition), 220), exceptions: toList(r.exceptions),
        actors: toList(r.actors).map(a => addActor(a)), objects: toList(r.objects),
        enforcement: r.enforcement || '', severity: r.severity || '', ifViolated: cut(r.if_violated, 200),
        rationale: cut(r.rationale, 200), frs: toList(r.related_functional_requirements), basis: r.basis || ''
    })));

    const model = { domain, niche, systemName, stages, actors, objects, activities, interactions, irs, frs, brs, rules, units };
    model.stats = {
        actors: actors.length, objects: objects.length, activities: activities.length, stages: stages.length,
        information_requirements: irs.length, functional_requirements: frs.length, business_requirements: brs.length,
        business_rules_raw: rawRules.length, business_rules: rules.length,
        rule_ingestion_run: run ? run.ingestion_run_id : null
    };
    return model;
}

// the same rule is often written by several units: merge near-duplicates inside each type
function dedupeRules(raw) {
    const out = [];
    for (const type of [...RULE_TYPES]) {
        const group = raw.filter(r => r.type === type);
        groupSimilar(group.map(r => `${r.name} ${r.name} ${r.statement} ${r.condition}`), LIMITS.dedupeSim).forEach(members => {
            const rs = members.map(i => group[i]);
            const p = rs.reduce((b, r) => (`${r.statement}${r.condition}`.length > `${b.statement}${b.condition}`.length ? r : b), rs[0]);
            out.push({
                ...p, actors: uniq(rs.flatMap(r => r.actors)), objects: uniq(rs.flatMap(r => r.objects)),
                frs: uniq(rs.flatMap(r => r.frs)), units: uniq(rs.map(r => r.unit)), merged: rs.length - 1
            });
        });
    }
    return out.map((r, i) => ({ ref: `R-${String(i + 1).padStart(3, '0')}`, ...r }));
}

// ============================================================
// 4. DETERMINISTIC SPEC BUILDERS (no AI)
// ============================================================

const canonActor = (model, name) => (model.actors.find(a => same(a.name, name)) || { name }).name;
const actorKind = (model, name) => (model.actors.find(a => same(a.name, name)) || { kind: 'internal' }).kind;

// activity -> best rules, by text similarity (deterministic)
function matchRules(model, types, perActivity = 1) {
    const out = new Map();
    const rules = model.rules.filter(r => types.includes(r.type) && r.ifViolated);
    if (!rules.length || !model.activities.length) return out;
    const sim = crossSimilarity(
        model.activities.map(a => `${a.name} ${a.desc} ${a.precondition} ${a.inputs.join(' ')} ${a.outputs.join(' ')}`),
        rules.map(r => `${r.name} ${r.statement} ${r.condition} ${r.objects.join(' ')}`));
    const used = new Set();
    // best pairs first so a rule is not claimed by a weaker activity
    const pairs = [];
    sim.forEach((row, i) => row.forEach((v, j) => { if (v >= LIMITS.matchSim) pairs.push({ i, j, v }); }));
    pairs.sort((a, b) => b.v - a.v).forEach(({ i, j }) => {
        const list = out.get(i) || [];
        if (used.has(j) || list.length >= perActivity) return;
        used.add(j); list.push(rules[j]); out.set(i, list);
    });
    return out;
}

function buildUseCaseSpecs(model) {
    const specs = [];
    // view 1: business activities as use cases
    {
        const acts = model.activities.slice(0, LIMITS.maxUseCases);
        const actorIds = new Map();
        const useActors = [];
        const aid = name => {
            const n = canonActor(model, name);
            if (!actorIds.has(n)) { actorIds.set(n, `a${actorIds.size + 1}`); useActors.push({ id: actorIds.get(n), name: n, kind: actorKind(model, n) }); }
            return actorIds.get(n);
        };
        const useCases = [], linksOut = [];
        acts.forEach((a, i) => {
            const id = `u${i + 1}`;
            useCases.push({ id, name: a.name });
            if (a.primary) linksOut.push({ actor: aid(a.primary), use_case: id, kind: 'primary' });
            a.supporting.forEach(s => linksOut.push({ actor: aid(s), use_case: id, kind: 'supporting' }));
        });
        specs.push({ title: 'View 1: business activities', system_name: model.systemName, actors: useActors, use_cases: useCases, links: linksOut, includes: [] });
    }
    // view 2: business requirements as functional capabilities
    if (model.brs.length) {
        const brs = model.brs.slice(0, LIMITS.maxUseCases);
        const actorIds = new Map(), useActors = [];
        const aid = name => {
            const n = canonActor(model, name);
            if (!actorIds.has(n)) { actorIds.set(n, `a${actorIds.size + 1}`); useActors.push({ id: actorIds.get(n), name: n, kind: actorKind(model, n) }); }
            return actorIds.get(n);
        };
        const useCases = [], linksOut = [];
        brs.forEach((b, i) => {
            const id = `u${i + 1}`;
            useCases.push({ id, name: b.name });
            b.stakeholders.filter(s => actorKind(model, s) !== 'system').forEach(s => linksOut.push({ actor: aid(s), use_case: id, kind: 'primary' }));
        });
        specs.push({ title: 'View 2: business requirements as capabilities', system_name: model.systemName, actors: useActors, use_cases: useCases, links: linksOut, includes: [] });
    }
    return specs;
}

function buildProcessSpec(model) {
    const acts = model.activities.slice(0, LIMITS.maxProcessActivities);
    const matches = matchRules(model, DECISION_TYPES);
    const nodes = [{ id: 'start', type: 'start', label: 'Start' }];
    const flows = [];
    let prev = 'start', prevLabel = acts[0] && acts[0].precondition ? cut(acts[0].precondition, 50) : '';
    let decisions = 0;
    acts.forEach((a, i) => {
        const id = `t${i + 1}`;
        nodes.push({ id, type: 'task', lane: canonActor(model, a.primary) || 'Unassigned', label: a.name });
        flows.push({ from: prev, to: id, label: prevLabel, kind: 'normal' });
        prev = id; prevLabel = '';
        const rule = (matches.get(i) || [])[0];
        if (rule && decisions < LIMITS.maxDecisions) {
            decisions++;
            const d = `d${decisions}`, x = `x${decisions}`;
            const lane = canonActor(model, a.primary) || 'Unassigned';
            nodes.push({ id: d, type: 'decision', lane, label: `${cut(rule.name, 45)}?` });
            nodes.push({ id: x, type: 'exception', lane, label: cut(rule.ifViolated, 55) });
            flows.push({ from: id, to: d, label: '', kind: 'normal' });
            flows.push({ from: d, to: x, label: 'No', kind: 'exception' });
            prev = d; prevLabel = 'Yes';
        }
        const next = acts[i + 1];
        if (next) {
            const shared = a.outputs.find(o => next.inputs.some(x => same(x, o)));
            if (shared) prevLabel = prevLabel ? `${prevLabel}: ${cut(shared, 25)}` : cut(shared, 30);
        }
    });
    nodes.push({ id: 'end', type: 'end', label: 'End' });
    flows.push({ from: prev, to: 'end', label: prevLabel, kind: 'normal' });
    return { title: 'End-to-end business process', nodes, flows };
}

function buildSequenceSpec(model) {
    const acts = model.activities.slice(0, LIMITS.maxSequenceActivities);
    const matches = matchRules(model, DECISION_TYPES);
    const parts = [];
    const pid = name => {
        const n = canonActor(model, name);
        let p = parts.find(x => x.name === n);
        if (!p) { p = { id: `p${parts.length + 1}`, name: n, kind: actorKind(model, n) === 'system' ? 'participant' : 'actor' }; parts.push(p); }
        return p.id;
    };
    const steps = [];
    let lastStage = null;
    acts.forEach((a, i) => {
        const from = pid(a.primary);
        if (a.stage && a.stage !== lastStage) { steps.push({ type: 'note', over: [from], text: a.stage }); lastStage = a.stage; }
        const out = a.outputs[0] ? `: ${cut(a.outputs[0], 40)}` : '';
        if (a.supporting.length) a.supporting.forEach(s => steps.push({ type: 'message', from, to: pid(s), text: `${a.name}${out}`, style: 'sync' }));
        else steps.push({ type: 'message', from, to: from, text: a.name, style: 'self' });

        // information flows that belong to this activity: who tells whom what
        const flows = model.irs.filter(r => r.activities.some(x => same(x, a.name))).slice(0, 2);
        flows.forEach(r => {
            const src = model.actors.find(x => norm(r.source).includes(norm(x.name)));
            const dst = r.consumers.map(c => model.actors.find(x => same(x.name, c))).filter(Boolean).filter(x => !src || x.name !== src.name)[0];
            if (src && dst) steps.push({ type: 'message', from: pid(src.name), to: pid(dst.name), text: cut(r.label, 50), style: 'dashed' });
        });

        const rule = (matches.get(i) || [])[0];
        if (rule) {
            steps.push({ type: 'alt', text: cut(rule.name, 60) });
            steps.push({ type: 'note', over: [from], text: 'Continue to the next step' });
            steps.push({ type: 'else', text: 'Rule violated' });
            steps.push({ type: 'note', over: [from], text: cut(rule.ifViolated, 70) });
            steps.push({ type: 'end' });
        }
    });
    return { title: 'End-to-end interaction', participants: parts, steps };
}

function buildStateSpecs(model) {
    const specs = [];
    const typed = (t, o) => model.rules.filter(r => r.type === t && r.objects.some(x => same(x, o.name)));
    for (const obj of model.objects) {
        const touching = model.activities.filter(a => [...a.inputs, ...a.outputs].some(x => same(x, obj.name)));
        const seq = [];
        if (obj.firstStage) seq.push({ label: obj.firstStage, via: null });
        touching.forEach(a => {
            const label = a.stage || a.name;
            if (!seq.length || seq[seq.length - 1].label !== label) seq.push({ label, via: a });
        });
        if (seq.length < 2) continue;

        const states = seq.map((s, i) => ({ id: `s${i + 1}`, name: s.label }));
        const transitions = [];
        const guardRules = [...typed('Validation', obj), ...typed('Eligibility', obj), ...typed('Authorization', obj),
            ...typed('State transition', obj), ...typed('Limit', obj), ...typed('Timing', obj)];
        const usedRules = new Set();
        for (let i = 0; i < seq.length - 1; i++) {
            const via = seq[i + 1].via;
            let guard = '';
            if (via && guardRules.length) {
                const sim = crossSimilarity([`${via.name} ${via.desc} ${via.precondition}`], guardRules.map(r => `${r.name} ${r.statement} ${r.condition}`))[0];
                const best = sim.map((v, j) => ({ v, j })).filter(x => x.v >= LIMITS.matchSim && !usedRules.has(x.j)).sort((a, b) => b.v - a.v)[0];
                if (best) { usedRules.add(best.j); guard = guardRules[best.j].name; }
            }
            transitions.push({ from: states[i].id, to: states[i + 1].id, event: via ? via.name : 'progresses', guard });
        }
        // exceptions: rules about this object that describe what happens when things go wrong
        const notes = [];
        const exc = typed('Exception handling', obj).slice(0, 2);
        exc.forEach((r, k) => {
            const sim = crossSimilarity([`${r.name} ${r.statement} ${r.condition}`], seq.map(s => `${s.label} ${s.via ? s.via.name + ' ' + s.via.desc : ''}`))[0];
            const at = sim.indexOf(Math.max(...sim));
            const id = `x${k + 1}`;
            states.push({ id, name: cut(r.name, 40) });
            transitions.push({ from: states[Math.max(0, at)].id, to: id, event: 'rule broken', guard: cut(r.ifViolated || r.condition, 40) });
        });
        guardRules.filter((_, j) => !usedRules.has(j)).slice(0, 2).forEach(r => notes.push({ state: states[0].id, text: cut(r.statement, 90) }));
        specs.push({
            object: obj.name, purpose: obj.purpose, states, transitions, notes,
            initial: states[0].id, finals: [states[seq.length - 1].id, ...exc.map((_, k) => `x${k + 1}`)]
        });
    }
    return specs;
}

function buildDecisionSpecs(model) {
    const groups = [];
    const byObject = new Map();
    model.rules.forEach(r => {
        const objs = r.objects.map(o => (model.objects.find(x => same(x.name, o)) || { name: o }).name);
        (objs.length ? objs : ['Cross-cutting']).forEach(o => {
            if (!byObject.has(o)) byObject.set(o, []);
            byObject.get(o).push(r);
        });
    });
    [...byObject].sort((a, b) => b[1].length - a[1].length).forEach(([name, rs]) => {
        groups.push({
            name: `${name} decisions`, subject: name, hit_policy: 'C (Collect): every row whose condition holds applies',
            inputs: ['When (condition)'], outputs: ['Then (rule)', 'Otherwise (outcome)'],
            rows: rs.map(r => ({
                when: [r.condition || 'Always'], then: [r.statement, `${outcomeClass(r.ifViolated)}: ${r.ifViolated || 'not stated'}`],
                rule: r.ref, type: r.type, severity: r.severity, enforcement: r.enforcement, basis: r.basis
            }))
        });
    });

    // DRD: business objects -> rule types (decisions) -> outcome classes
    const inEdges = new Map(), outEdges = new Map();
    const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
    model.rules.forEach(r => {
        const objs = r.objects.length ? r.objects : ['Cross-cutting'];
        objs.forEach(o => inc(inEdges, `${o}\u0000${r.type}`));
        inc(outEdges, `${r.type}\u0000${outcomeClass(r.ifViolated)}`);
    });
    const edges = [...inEdges, ...outEdges].map(([k, count]) => { const [from, to] = k.split('\u0000'); return { from, to, count }; });
    return { tables: groups, drd: { edges, ruleCount: model.rules.length } };
}

// ============================================================
// 5. MERMAID RENDERERS
// ============================================================

// labels live inside quotes: keep them free of characters that end or confuse a Mermaid statement
const mm = (t, n = 80) => cut(String(t ?? '')
    .replace(/["`]/g, "'").replace(/[<>]/g, ' ').replace(/[;#]/g, ',').replace(/\|/g, '/')
    .replace(/[{}[\]]/g, '(').replace(/&/g, ' and ').replace(/-->/g, '->').replace(/\s+/g, ' ').trim(), n);
const slug = s => String(s ?? '').replace(/[^A-Za-z0-9_]/g, '_');

const FENCE = '```';
const fence = code => `${FENCE}mermaid\n${code}\n${FENCE}`;

function renderUseCase(spec) {
    const L = ['flowchart LR'];
    const A = id => `a_${slug(id)}`, U = id => `u_${slug(id)}`;
    spec.actors.forEach(a => {
        const stereo = a.kind === 'system' ? '«system»' : a.kind === 'external' ? '«external»' : '«actor»';
        L.push(`  ${A(a.id)}["${mm(a.name, 40)}<br/>${stereo}"]:::${a.inferred ? 'actorInf' : 'actor'}`);
    });
    L.push(`  subgraph SYS["System boundary: ${mm(spec.system_name, 60)}"]`);
    spec.use_cases.forEach(u => L.push(`    ${U(u.id)}(["${mm(u.name, 60)}"]):::${u.inferred ? 'ucInf' : 'uc'}`));
    L.push('  end');
    spec.links.forEach(l => L.push(l.kind === 'supporting' ? `  ${A(l.actor)} -.- ${U(l.use_case)}` : `  ${A(l.actor)} --- ${U(l.use_case)}`));
    (spec.includes || []).forEach(i => L.push(`  ${U(i.from)} -. ${i.kind === 'extend' ? 'extend' : 'include'} .-> ${U(i.to)}`));
    L.push('  classDef actor fill:#fff7e6,stroke:#d48806,color:#000');
    L.push('  classDef actorInf fill:#fff7e6,stroke:#d48806,stroke-dasharray:5 5,color:#000');
    L.push('  classDef uc fill:#e6f4ff,stroke:#1677ff,color:#000');
    L.push('  classDef ucInf fill:#e6f4ff,stroke:#1677ff,stroke-dasharray:5 5,color:#000');
    return L.join('\n');
}

function renderProcess(spec) {
    const L = ['flowchart LR'];
    const N = id => `n_${slug(id)}`;
    const nodeLine = n => {
        const inf = n.inferred ? 'Inf' : '';
        switch (n.type) {
            case 'start': return `${N(n.id)}(("${mm(n.label, 20)}")):::start`;
            case 'end': return `${N(n.id)}(("${mm(n.label, 20)}")):::finish`;
            case 'decision': return `${N(n.id)}{"${mm(n.label, 55)}"}:::dec${inf}`;
            case 'exception': return `${N(n.id)}(["${mm(n.label, 60)}"]):::exc${inf}`;
            default: return `${N(n.id)}["${mm(n.label, 60)}"]:::task${inf}`;
        }
    };
    spec.nodes.filter(n => !n.lane).forEach(n => L.push(`  ${nodeLine(n)}`));
    uniq(spec.nodes.map(n => n.lane)).forEach((lane, i) => {
        L.push(`  subgraph L${i + 1}["${mm(lane, 50)}"]`);
        spec.nodes.filter(n => n.lane === lane).forEach(n => L.push(`    ${nodeLine(n)}`));
        L.push('  end');
    });
    spec.flows.forEach(f => {
        const arrow = f.kind === 'exception' ? '-.->' : '-->';
        L.push(f.label ? `  ${N(f.from)} ${arrow}|${mm(f.label, 40)}| ${N(f.to)}` : `  ${N(f.from)} ${arrow} ${N(f.to)}`);
    });
    L.push('  classDef start fill:#d9f7be,stroke:#389e0d,color:#000');
    L.push('  classDef finish fill:#ffd6e7,stroke:#c41d7f,color:#000');
    L.push('  classDef task fill:#e6f4ff,stroke:#1677ff,color:#000');
    L.push('  classDef taskInf fill:#e6f4ff,stroke:#1677ff,stroke-dasharray:5 5,color:#000');
    L.push('  classDef dec fill:#fffbe6,stroke:#d4b106,color:#000');
    L.push('  classDef decInf fill:#fffbe6,stroke:#d4b106,stroke-dasharray:5 5,color:#000');
    L.push('  classDef exc fill:#fff1f0,stroke:#cf1322,color:#000');
    L.push('  classDef excInf fill:#fff1f0,stroke:#cf1322,stroke-dasharray:5 5,color:#000');
    return L.join('\n');
}

function renderSequence(spec) {
    const L = ['sequenceDiagram', '  autonumber'];
    const P = id => `P_${slug(id)}`;
    spec.participants.forEach(p => L.push(`  ${p.kind === 'participant' ? 'participant' : 'actor'} ${P(p.id)} as ${mm(p.name, 40)}`));
    let depth = 0;
    spec.steps.forEach(s => {
        const mark = s.inferred ? ' *' : '';
        if (s.type === 'message') {
            const arrow = s.style === 'dashed' ? '-->>' : '->>';
            L.push(`  ${P(s.from)}${arrow}${P(s.to)}: ${mm(s.text, 70)}${mark}`);
        } else if (s.type === 'note') {
            L.push(`  Note over ${s.over.map(P).join(',')}: ${mm(s.text, 80)}${mark}`);
        } else if (s.type === 'alt') { depth++; L.push(`  alt ${mm(s.text, 60)}${mark}`); }
        else if (s.type === 'else') { if (depth) L.push(`  else ${mm(s.text, 60)}${mark}`); }
        else if (s.type === 'end') { if (depth) { depth--; L.push('  end'); } }
    });
    while (depth--) L.push('  end');
    return L.join('\n');
}

function renderState(spec) {
    const L = ['stateDiagram-v2'];
    const S = id => `S_${slug(id)}`;
    spec.states.forEach(s => L.push(`  state "${mm(s.name, 45)}${s.inferred ? ' *' : ''}" as ${S(s.id)}`));
    L.push(`  [*] --> ${S(spec.initial)}`);
    spec.transitions.forEach(t => {
        const label = [mm(t.event, 40), t.guard ? `[${mm(t.guard, 40)}]` : ''].filter(Boolean).join(' ');
        L.push(`  ${S(t.from)} --> ${S(t.to)}: ${label}${t.inferred ? ' *' : ''}`);
    });
    spec.finals.forEach(f => L.push(`  ${S(f)} --> [*]`));
    (spec.notes || []).forEach(n => L.push(`  note right of ${S(n.state)} : ${mm(n.text, 90)}`));
    return L.join('\n');
}

function renderDrd(drd) {
    const edges = [...drd.edges].sort((a, b) => b.count - a.count).slice(0, LIMITS.drdEdges);
    const kind = new Map();
    const outcomeNames = new Set(['Escalate for review', 'Reject or block', 'Compensate or reverse', 'Suspend or revoke', 'Notify', 'Record and flag', 'Handle manually']);
    const typeNames = new Set(RULE_TYPES);
    edges.forEach(e => {
        if (typeNames.has(e.from) && outcomeNames.has(e.to)) { kind.set(e.from, 'dec'); kind.set(e.to, 'out'); }
        else { kind.set(e.from, 'in'); kind.set(e.to, 'dec'); }
    });
    const ids = new Map();
    const id = k => { if (!ids.has(k)) ids.set(k, `n${ids.size + 1}`); return ids.get(k); };
    const L = ['flowchart LR'];
    [['in', 'Input data (business objects)'], ['dec', 'Decisions (rule types)'], ['out', 'Outcomes when a rule is broken']].forEach(([k, title], i) => {
        const names = [...kind].filter(([, v]) => v === k).map(([n]) => n);
        if (!names.length) return;
        L.push(`  subgraph G${i + 1}["${title}"]`);
        names.forEach(n => L.push(`    ${id(n)}["${mm(n, 40)}"]:::${k}`));
        L.push('  end');
    });
    edges.forEach(e => L.push(`  ${id(e.from)} -->|${e.count}| ${id(e.to)}`));
    L.push('  classDef in fill:#e6f4ff,stroke:#1677ff,color:#000');
    L.push('  classDef dec fill:#fffbe6,stroke:#d4b106,color:#000');
    L.push('  classDef out fill:#fff1f0,stroke:#cf1322,color:#000');
    return L.join('\n');
}

const cell = t => String(t ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
function renderDecisionTable(table) {
    const L = [`### ${table.name}`, '', `Hit policy: ${table.hit_policy}.`, '',
        `| # | ${table.inputs.map(cell).join(' | ')} | ${table.outputs.map(cell).join(' | ')} | Type | Severity | Enforced by | Basis | Rule |`,
        `|---|${[...table.inputs, ...table.outputs].map(() => '---|').join('')}---|---|---|---|---|`];
    table.rows.forEach((r, i) => L.push(`| ${i + 1} | ${r.when.map(cell).join(' | ')} | ${r.then.map(cell).join(' | ')} | ${cell(r.type)} | ${cell(r.severity)} | ${cell(r.enforcement)} | ${cell(r.basis)}${r.inferred ? ' (inferred)' : ''} | ${cell(r.rule)} |`));
    return L.join('\n');
}

// ============================================================
// 6. FILE WRITING
// ============================================================

function writeDoc(dir, file, title, intro, blocks) {
    fs.mkdirSync(dir, { recursive: true });
    const text = [`# ${title}`, '', ...intro.map(l => l), '', ...blocks].join('\n') + '\n';
    fs.writeFileSync(path.join(dir, file), text);
    return path.join(dir, file);
}

function sourceLine(model) {
    const s = model.stats;
    return `Sources: knowledge base (${s.actors} actors, ${s.objects} business objects, ${s.activities} activities, ${s.stages} lifecycle stages, ` +
        `${s.information_requirements} information requirements), requirements schema (${s.functional_requirements} functional, ${s.business_requirements} business requirements), ` +
        `business_rule_discovery (${s.business_rules} rules after merging ${s.business_rules_raw} raw rules` +
        `${s.rule_ingestion_run ? `, ingestion run ${s.rule_ingestion_run}` : ''}).`;
}

module.exports = {
    createPool, loadModel, LIMITS, RULE_TYPES, DECISION_TYPES, log, arr, uniq, cut, norm, same, shortHash, flatText, flatten, pick,
    crossSimilarity, outcomeClass, canonActor, actorKind, matchRules,
    buildUseCaseSpecs, buildProcessSpec, buildSequenceSpec, buildStateSpecs, buildDecisionSpecs,
    renderUseCase, renderProcess, renderSequence, renderState, renderDrd, renderDecisionTable,
    mm, slug, fence, writeDoc, sourceLine, dedupeRules
};
