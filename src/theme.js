export const themeStorageKey = 'publish-workflow-explorer:theme';

export const themeColors = Object.freeze({
    light: '#f4f5f7',
    dark: '#1b1b1e'
});

export function resolveTheme(preference, prefersDark = false) {
    if (preference === 'light' || preference === 'dark') return preference;
    return prefersDark ? 'dark' : 'light';
}

export function readThemePreference(storage) {
    try {
        const preference = (storage ?? globalThis.localStorage)?.getItem(themeStorageKey);
        return preference === 'light' || preference === 'dark' ? preference : null;
    } catch {
        return null;
    }
}

export function applyTheme(theme, pageDocument = globalThis.document) {
    const resolved = resolveTheme(theme);
    pageDocument.documentElement.dataset.theme = resolved;
    pageDocument.documentElement.style.colorScheme = resolved;
    pageDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColors[resolved]);
    return resolved;
}

export function initializeTheme() {
    const prefersDark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    return applyTheme(resolveTheme(readThemePreference(), prefersDark));
}