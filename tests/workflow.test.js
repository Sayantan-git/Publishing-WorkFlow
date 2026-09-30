import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSchedule, firstEligibleTimerTick, retryDelays, createLedger, changeLedger, clampStep } from '../src/engine.js';
import { createTimeline, graphFor } from '../src/simulation.js';
import { workflows, scenarios, steps, services } from '../src/content.js';
import { applyTheme, readThemePreference, resolveTheme, themeColors, themeStorageKey } from '../src/theme.js';

test('a schedule for 14:07 is selected at 14:15, not 14:00', () => {
    const requestedAt = '2026-09-22T14:07:00Z';
    assert.equal(evaluateSchedule({ requestedAt, now: '2026-09-22T14:00:00Z' }).eligible, false);
    assert.equal(evaluateSchedule({ requestedAt, now: '2026-09-22T14:15:00Z' }).eligible, true);
    assert.equal(firstEligibleTimerTick(requestedAt), '2026-09-22T14:15:00.000Z');
});

test('one-minute early selection and seven-day catch-up are inclusive', () => {
    const now = '2026-09-22T14:00:00Z';
    assert.equal(evaluateSchedule({ requestedAt: '2026-09-22T14:01:00Z', now }).eligible, true);
    assert.equal(evaluateSchedule({ requestedAt: '2026-09-15T14:00:00Z', now }).eligible, true);
    assert.equal(evaluateSchedule({ requestedAt: '2026-09-15T13:59:59Z', now }).eligible, false);
    assert.equal(firstEligibleTimerTick('2026-09-22T14:01:00Z'), '2026-09-22T14:00:00.000Z');
});

test('processed, cancelled and disabled schedules cannot be selected', () => {
    const dates = { requestedAt: '2026-09-22T14:00:00Z', now: '2026-09-22T14:00:00Z' };
    for (const flags of [{ processed: true }, { cancelled: true }, { publishingEnabled: false }]) {
        assert.equal(evaluateSchedule({ ...dates, ...flags }).eligible, false);
    }
    assert.throws(() => evaluateSchedule({ requestedAt: 'invalid', now: dates.now }), RangeError);
});

test('operation retry delays are distinct from broker delivery counts', () => {
    assert.deepEqual(retryDelays, [2, 4, 5]);
    const before = createLedger();
    const after = changeLedger(before, { broker: 'Waiting for another delivery', diagnostics: ['Attempt failed'] });
    assert.equal(after.sql, before.sql);
    assert.deepEqual(after.history, []);
    assert.deepEqual(before.diagnostics, []);
    assert.deepEqual(after.diagnostics, ['Attempt failed']);
});

test('ledger snapshots preserve earlier events without mutating history', () => {
    const before = changeLedger(createLedger(), { history: ['Request received'] });
    const after = changeLedger(before, { history: ['Staging failed'], sql: 'Error' });
    assert.deepEqual(before.history, ['Request received']);
    assert.deepEqual(after.history, ['Request received', 'Staging failed']);
    assert.equal(before.sql, 'No publish record yet');
});

test('step navigation stays inside the available timeline', () => {
    assert.equal(clampStep(-1, 10), 0);
    assert.equal(clampStep(99, 10), 9);
    assert.equal(clampStep(Number.NaN, 10), 0);
    assert.equal(clampStep(0, 0), 0);
});

test('both successful journeys end only after a reported restaurant application', () => {
    for (const mode of Object.keys(workflows)) {
        const timeline = createTimeline(mode);
        assert.equal(timeline.at(-1).node, 'apply');
        assert.equal(timeline.at(-1).ledger.restaurant, 'New menu application confirmed by POS');
        assert.ok(timeline.findIndex(event => event.node === 'build') < timeline.findIndex(event => event.node === 'notify'));
        assert.ok(timeline.findIndex(event => event.node === 'status') < timeline.findIndex(event => event.node === 'readiness'));
    }
});

test('a saved schedule has no prepared menu or preparation message', () => {
    const timeline = createTimeline('scheduled');
    const saved = timeline.find(event => event.node === 'schedule');
    assert.deepEqual(saved.ledger.history, []);
    assert.equal(saved.ledger.payload, 'No prepared menu yet');
    assert.equal(saved.ledger.broker, 'No publishing message yet');
    assert.ok(timeline.findIndex(event => event.node === 'dispatch') < timeline.findIndex(event => event.node === 'queue'));
});

test('send attempts do not invent one business event per retry', () => {
    const timeline = createTimeline('immediate', 'retry');
    const retries = timeline.filter(event => event.node === 'retry');
    assert.deepEqual(retries.map(event => event.wait), [2, 4]);
    for (const event of retries) assert.deepEqual(event.ledger.history, ['MM2: request received']);
    assert.equal(timeline.at(-1).result, 'Application confirmed');
});

test('exhausted send failure leaves a processed schedule without a payload', () => {
    const timeline = createTimeline('scheduled', 'sendFailure');
    assert.deepEqual(timeline.filter(event => event.node === 'retry').map(event => event.wait), [2, 4, 5]);
    assert.match(timeline.at(-1).ledger.sql, /Schedule: processed/);
    assert.equal(timeline.at(-1).ledger.payload, 'No prepared menu yet');
    assert.match(timeline.at(-1).action, /already processed/);
});

test('swallowed errors do not imply a Cosmos error or broker redelivery', () => {
    const last = createTimeline('immediate', 'hiddenFailure').at(-1);
    assert.deepEqual(last.ledger.history, ['MM2: request received']);
    assert.equal(last.ledger.payload, 'No prepared menu yet');
    assert.match(last.ledger.broker, /complete without successful/);
});

test('status dead-letter evidence stays in the broker', () => {
    const last = createTimeline('immediate', 'deadletter').at(-1);
    assert.equal(last.ledger.broker, 'Status message in the dead-letter queue');
    assert.equal(last.ledger.history.some(item => /dead-letter|retry/i.test(item)), false);
    assert.ok(last.ledger.history.includes('POS: staging completed'));
});

test('blocked staging and offline scenarios never claim POS completion', () => {
    for (const scenario of ['partial', 'offline', 'buildFailure']) {
        const timeline = createTimeline('immediate', scenario);
        assert.equal(timeline.some(event => event.node === 'apply'), false);
        assert.notEqual(timeline.at(-1).ledger.restaurant, 'New menu application confirmed by POS');
    }
});

test('every publishing and exception step includes readable supporting context', () => {
    for (const item of Object.values(steps)) {
        const paragraphs = item.explanation.split('\n\n');
        assert.ok(paragraphs.length > 1, `${item.id} needs context beyond its short explanation`);
        assert.ok(paragraphs.every(paragraph => paragraph.trim().length > 0), `${item.id} has an empty paragraph`);
        assert.equal(new Set(paragraphs).size, paragraphs.length, `${item.id} repeats a paragraph`);
        assert.ok(paragraphs.some(paragraph => paragraph.startsWith('For example,')), `${item.id} needs a practical example`);
    }
});

test('every scenario step has content and valid service references', () => {
    for (const mode of Object.keys(workflows)) {
        for (const scenario of scenarios.filter(item => item.both || mode === 'scheduled')) {
            const timeline = createTimeline(mode, scenario.id);
            for (const event of timeline) {
                assert.ok(steps[event.node], `${mode}/${scenario.id}/${event.node}`);
                assert.ok(event.text.length > 40);
                assert.ok(Array.isArray(event.ledger.history));
            }
            const graph = graphFor(mode, timeline, timeline.length - 1);
            assert.ok(graph.nodes.includes(graph.active.node));
            for (const id of graph.nodes) for (const service of steps[id].services) assert.ok(services[service]);
        }
    }
    assert.throws(() => createTimeline('invalid'), RangeError);
    assert.throws(() => createTimeline('immediate', 'notDue'), RangeError);
});

test('theme follows the device until the user explicitly chooses', () => {
    assert.equal(resolveTheme(null, true), 'dark');
    assert.equal(resolveTheme(null, false), 'light');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
    assert.equal(resolveTheme('invalid', true), 'dark');
});

test('theme storage handles missing, invalid, and blocked preferences', () => {
    assert.equal(readThemePreference({ getItem: key => key === themeStorageKey ? 'dark' : null }), 'dark');
    assert.equal(readThemePreference({ getItem: () => 'light' }), 'light');
    assert.equal(readThemePreference({ getItem: () => 'invalid' }), null);
    assert.equal(readThemePreference({ getItem: () => null }), null);
    assert.equal(readThemePreference({ getItem: () => { throw new Error('Storage is blocked'); } }), null);
});

test('applying a theme updates the document and browser colour together', () => {
    const metadata = {};
    const pageDocument = {
        documentElement: { dataset: {}, style: {} },
        querySelector: () => ({ setAttribute: (name, value) => { metadata[name] = value; } })
    };
    assert.equal(applyTheme('dark', pageDocument), 'dark');
    assert.equal(pageDocument.documentElement.dataset.theme, 'dark');
    assert.equal(pageDocument.documentElement.style.colorScheme, 'dark');
    assert.equal(metadata.content, themeColors.dark);
    applyTheme('light', pageDocument);
    assert.equal(metadata.content, themeColors.light);
    assert.equal(pageDocument.documentElement.dataset.theme, 'light');
});