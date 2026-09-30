import { changeLedger, createLedger, firstEligibleTimerTick, formatUtc, retryDelays } from './engine.js';
import { workflows, scenarios } from './content.js';

export function createTimeline(mode = 'immediate', scenario = 'success', scheduledAt = '2026-09-22T14:07:00Z') {
    if (!workflows[mode]) throw new RangeError('Unknown workflow');
    if (!scenarios.some(item => item.id === scenario && (item.both || mode === 'scheduled'))) throw new RangeError('Unsupported scenario');
    let ledger = createLedger();
    const events = [];
    const add = (node, title, text, change = {}, tone = 'neutral', options = {}) => {
        ledger = changeLedger(ledger, change);
        events.push({ id: `${node}-${events.length}`, node, title, text, tone, ledger, ...options });
    };

    if (mode === 'scheduled') {
        add('chooseTime', 'A future request is submitted', 'The UI sends selected restaurants and a UTC time. The configured access checks, template checks, and safe cancellation rules still apply.');
        add('schedule', 'Future work is saved in SQL', 'Only the schedule exists at this point. There is no new publish record, preparation message, or prepared menu for this schedule.', { sql: `Unprocessed schedule for ${formatUtc(scheduledAt)}` });
        add('timer', 'The timer-triggered Function wakes', 'It checks every 15 minutes using its own service identity. It does not reuse the browser JWT or need the user to be online.', { diagnostics: ['Scheduled-work timer invoked'] });
        if (scenario === 'notDue') {
            add('notDue', '14:00: the schedule is not due', 'The example is scheduled for 14:07, beyond the one-minute early window. The timer leaves it saved and unprocessed.', {}, 'warning', { anchor: 'lookup', clock: '14:00 UTC' });
            add('timer', '14:15: the next normal check', 'The simulated clock advances. The same schedule can qualify now if it remains unprocessed, uncancelled, and publishing enabled.', { diagnostics: ['Later scheduled-work timer invoked'] }, 'neutral', { clock: '14:15 UTC' });
        }
        add('lookup', 'The read-only SQL lookup selects work', `The first normal eligible tick for this example is ${formatUtc(firstEligibleTimerTick(scheduledAt))}. The query checks the time window and the restaurant settings, not Cosmos DB.`, {}, 'neutral', { clock: formatUtc(firstEligibleTimerTick(scheduledAt)) });
        add('dispatch', 'A publish is created and linked', 'The backend uses current settings to create a publish. It marks the schedule processed before sending the preparation message.', { sql: 'Publishing. Schedule: processed and linked.', history: ['MM2: request received'] });
    } else {
        add('click', 'The user clicks Publish', 'Immediate publishing starts from the selected restaurants. It does not wait for a due-schedule lookup and does not bypass downstream readiness.');
        add('gateway', 'The configured gateway accepts the request', 'In this example the applicable token and source checks succeed. An accepted HTTP request is not an applied menu.', { diagnostics: ['User request accepted at the gateway'] });
        add('validate', 'Restaurant checks pass', 'The example restaurant has a complete menu, no conflicting in-progress publish, and successful safe cancellation wherever it was needed.');
        add('record', 'A new publish record is saved', 'Primary SQL stores the business record. Cosmos records request received. The publish identifier connects the later work; no menu package exists yet.', { sql: 'Publishing; preparation not started.', history: ['MM2: request received'] });
    }

    if (scenario === 'retry' || scenario === 'sendFailure') {
        const exhausted = scenario === 'sendFailure';
        add('queue', 'The initial queue send fails', 'A temporary Service Bus exception interrupts the send. Earlier business records remain; this failure does not create a fresh publish.', { broker: 'No accepted preparation message confirmed', diagnostics: ['Initial preparation send failed'] }, 'warning');
        const delays = exhausted ? retryDelays : retryDelays.slice(0, 2);
        delays.forEach((delay, index) => {
            const failed = exhausted || index === 0;
            add('retry', `Retry ${index + 1} after ${delay} seconds`, failed ? 'This attempt fails too. Only the protected send repeats. Retry timing is shown as an explanation, not a real network request.' : 'This retry succeeds in the illustration. The same publish can now continue into background preparation.', { diagnostics: [`Send retry ${index + 1} after ${delay}s: ${failed ? 'failed' : 'accepted'}`], ...(failed ? {} : { broker: 'Preparation message accepted' }) }, failed ? 'warning' : 'success', { anchor: 'queue', attempt: index + 2, wait: delay });
        });
        if (exhausted) {
            add('failure', 'All allowed send attempts fail', 'A request-failed event is saved here because status storage is available in this illustration. The SQL summary may still be behind the event.', { history: ['MM2: preparation request could not be queued'], broker: 'No accepted preparation message in this example', diagnostics: ['Preparation sender exhausted its retry policy'] }, 'danger', { anchor: 'queue', result: 'Failed handoff', action: mode === 'scheduled' ? 'The schedule is already processed. Another timer scan does not automatically dispatch it again.' : 'Fix the cause and choose an authorized recovery action. A SQL record is not a message waiting in a queue.' });
            return events;
        }
    }

    add('queue', 'Preparation work is queued', 'Service Bus accepts the message. The browser response can finish while a background worker receives and processes this request.', { broker: 'Preparation message awaiting a worker' }, 'success');
    if (scenario === 'hiddenFailure') {
        add('worker', 'The Function makes its HTTP call', 'The worker acquires application identity and calls Integrations. In this example the call fails before successful preparation is confirmed.', { broker: 'Preparation delivery being processed', diagnostics: ['Function attempted its service-to-service HTTP call'] });
        add('hidden', 'The inner failure is not propagated', 'The Function catches the exception or ignores the unsuccessful response. A normal outer return can acknowledge the message rather than trigger a failed-delivery retry.', { broker: 'Delivery can complete without successful preparation', diagnostics: ['Inner token / HTTP failure did not reach the trigger'] }, 'danger', { anchor: 'worker', result: 'Investigation needed', action: 'SQL may remain publishing, with no new Cosmos payload or error. Inspect Function, gateway, and backend evidence; redelivery is not guaranteed.' });
        return events;
    }

    add('worker', 'The message starts a Function', 'Integrations reloads the new record from primary SQL and marks preparation started. The worker uses its own application token for HTTP, not the browser token.', { sql: mode === 'scheduled' ? 'Publishing; preparation started. Schedule remains processed.' : 'Publishing; preparation started.', broker: 'Preparation delivery being processed', diagnostics: ['Worker called Integrations with application identity'] });
    if (scenario === 'buildFailure') {
        add('build', 'The build throws an exception', 'This example fails inside the protected retrieval/build block. Returning an empty result is different and does not trigger this exception-based policy.', { diagnostics: ['Initial menu build failed'] }, 'warning');
        retryDelays.forEach((delay, index) => add('retry', `Build retry ${index + 1}: wait ${delay} seconds`, 'The same retrieval/build operation runs again. In this scenario each attempt still fails to produce a valid menu.', { diagnostics: [`Build retry ${index + 1} failed after ${delay}s wait`] }, 'warning', { anchor: 'build', attempt: index + 2, wait: delay }));
        add('failure', 'Preparation ends in a business failure', 'This illustration assumes the failure-event write and summary update succeed. A caught business result is not a guaranteed broker retry.', { sql: 'Publish summary: Error', history: ['MM2: menu preparation failed'], payload: 'No valid menu package saved', broker: 'Preparation delivery may complete despite business failure' }, 'danger', { anchor: 'build', result: 'Preparation failed', action: 'Fix the menu or dependency before a new authorized attempt. If Cosmos was also unavailable, this failure event might not exist.' });
        return events;
    }

    add('build', 'The prepared menu is saved', 'The backend builds, validates, compresses, and stores the package. Only after saving it does SQL mark preparation complete.', { sql: 'Publishing; menu preparation complete.', payload: 'Compressed restaurant menu available', broker: 'Preparation handoff finished', diagnostics: ['Menu built and stored successfully'] }, 'success');
    add('notify', 'The topic announces the menu', 'Matching subscribers receive the availability notification. SQL records that notification was sent, not that POS acknowledged or applied it.', { sql: 'Publishing; preparation complete and notification sent.', broker: 'Publish notification sent to matching subscriptions' });
    if (scenario === 'partial') {
        add('stage', 'POS stages, another required system fails', 'The receiving systems have different outcomes. POS staging alone does not satisfy readiness for the full workflow.', { history: ['POS: staging completed', 'Another required system: staging failed'], diagnostics: ['Required consumer staging failed'] }, 'danger');
        add('status', 'The staging failure is recorded', 'Cosmos holds the events. Their processing updates the combined view and exposes the partial-staging problem.', { sql: 'Publish summary: Error', broker: 'Staging events queued and processed' });
        add('discard', 'Recallability must be checked', 'This illustration does not assume a live discard is allowed. The current code checks prior history and whether the restaurant already applied or moved past this publish.', { diagnostics: ['Safe-discard eligibility must be evaluated'] }, 'warning', { anchor: 'readiness', result: 'Readiness blocked', action: 'Only eligible pending work can be recalled. A successful discard HTTP response is not a POS-confirmed result, and reset is not a new publish.' });
        return events;
    }

    add('stage', 'Receiving systems stage their updates', 'Consumers fetch the saved package. In this scenario the required systems prepare their data while the existing restaurant menu remains active.', { restaurant: 'Existing menu active; new update staged' });
    if (scenario === 'deadletter') {
        add('status', 'The event is saved before processing', 'The status API saves a staging event in Cosmos, then queues it. The status worker throws before finishing the summary/readiness work.', { history: ['POS: staging completed'], broker: 'Status message delivered to its worker', diagnostics: ['Status-processing Function threw'] }, 'warning');
        add('redelivery', 'Service Bus can deliver it again', 'This exception reaches the trigger, unlike the swallowed preparation error. The broker applies its configured delivery rules.', { broker: 'Status message eligible for another delivery', diagnostics: ['Status processing failed again'] }, 'warning', { anchor: 'status' });
        add('deadletter', 'The illustrative delivery limit is reached', 'The actual deployed maximum is not established here. This example ends when its broker limit is reached, not at a claimed universal retry count.', { broker: 'Status message in the dead-letter queue', diagnostics: ['Illustrative broker delivery limit reached'] }, 'danger', { anchor: 'status', result: 'Message needs attention', action: 'Cosmos still has the source event. SQL can be stale. Investigate the reason and earlier effects before any authorized replay.' });
        return events;
    }

    add('status', 'History and summary advance', 'Status Functions read saved events, add the combined staging marker when conditions pass, publish the combined state, and update SQL.', { history: ['POS: staging completed', 'Other required systems: staging completed', 'Orchestrator: required staging checks passed'], sql: 'Publishing; required staging evidence available.', broker: 'Status-processing and menu-state notifications handled' });
    add('readiness', 'Apply Now is requested', 'In this example there is no blocking error, cancellation, completion, wait, or offline report, and the required staging checks pass.', { diagnostics: ['Apply Now enablement request sent'] });
    if (scenario === 'offline') {
        add('offline', 'The restaurant reports offline', 'The HTTP request can be accepted but return an offline POS result. The package exists, yet no successful application is confirmed.', { history: ['Orchestrator: POS offline at Apply Now'], sql: 'Publish summary: POS offline', restaurant: 'Existing menu remains active; application not confirmed' }, 'warning', { anchor: 'readiness', result: 'Waiting on the restaurant', action: 'Check external recovery and reports. The timer fallback has a known query limitation and does not guarantee retry for every offline store.' });
        return events;
    }
    add('apply', 'POS reports the new menu applied', 'In this successful illustration, POS and the other required completion conditions are satisfied. The same status path brings the SQL summary to ready for another publish.', { history: ['POS: menu application completed', 'Required completion conditions satisfied'], sql: 'Publish summary: Ready for another publish', broker: 'Completion event processed', restaurant: 'New menu application confirmed by POS' }, 'success', { result: 'Application confirmed', action: 'This reported restaurant outcome is stronger evidence than an earlier queue send, saved payload, or staging marker.' });
    return events;
}

export function graphFor(mode, timeline, cursor) {
    const base = [...workflows[mode].nodes];
    const supplemental = [...new Set(timeline.filter(event => event.anchor).map(event => event.node))].filter(node => !base.includes(node));
    const active = timeline[Math.min(Math.max(cursor, 0), timeline.length - 1)];
    const visited = new Set(timeline.slice(0, cursor + 1).map(event => event.node));
    const pathEdges = [];
    for (let index = 1; index < timeline.length; index++) {
        const source = timeline[index - 1].node;
        const target = timeline[index].node;
        if (source !== target && !pathEdges.some(edge => edge.source === source && edge.target === target)) pathEdges.push({ source, target });
    }
    return { base, supplemental, nodes: [...base, ...supplemental], active, visited, pathEdges };
}