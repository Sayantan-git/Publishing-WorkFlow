export const retryDelays = Object.freeze([2, 4, 5]);

export function evaluateSchedule({ requestedAt, now, processed = false, cancelled = false, publishingEnabled = true }) {
    const requested = new Date(requestedAt).getTime();
    const current = new Date(now).getTime();
    if (!Number.isFinite(requested) || !Number.isFinite(current)) {
        throw new RangeError('A valid UTC date is required.');
    }
    if (processed) return { eligible: false, reason: 'Already handed into publishing' };
    if (cancelled) return { eligible: false, reason: 'Schedule cancelled' };
    if (!publishingEnabled) return { eligible: false, reason: 'Publishing is disabled for this restaurant' };
    if (requested < current - 7 * 24 * 60 * 60 * 1000) return { eligible: false, reason: 'More than seven days late' };
    if (requested > current + 60 * 1000) return { eligible: false, reason: 'Scheduled time has not reached the selection window' };
    return { eligible: true, reason: 'The schedule meets the selection rules' };
}

export function firstEligibleTimerTick(requestedAt) {
    const requested = new Date(requestedAt).getTime();
    if (!Number.isFinite(requested)) throw new RangeError('A valid UTC date is required.');
    const quarterHour = 15 * 60 * 1000;
    return new Date(Math.ceil((requested - 60 * 1000) / quarterHour) * quarterHour).toISOString();
}

export function createLedger() {
    return {
        sql: 'No publish record yet',
        payload: 'No prepared menu yet',
        history: [],
        broker: 'No publishing message yet',
        diagnostics: [],
        restaurant: 'Existing menu remains active'
    };
}

export function changeLedger(previous, change = {}) {
    return {
        ...previous,
        ...change,
        history: [...previous.history, ...(change.history ?? [])],
        diagnostics: [...previous.diagnostics, ...(change.diagnostics ?? [])]
    };
}

export function formatUtc(iso) {
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC';
}

export function clampStep(value, total) {
    return Math.min(Math.max(Number.isFinite(value) ? Math.round(value) : 0, 0), Math.max(total - 1, 0));
}