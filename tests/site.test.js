import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('Pages publishes only the generated HTML and static hosting marker', async () => {
    const files = await readdir(new URL('dist/', root));
    assert.deepEqual(files.sort(), ['.nojekyll', 'index.html']);
    assert.equal(await readFile(new URL('dist/.nojekyll', root), 'utf8'), '');
});

test('hosted and offline copies contain the same complete app', async () => {
    const offline = await readFile(new URL('index.html', root), 'utf8');
    const hosted = await readFile(new URL('dist/index.html', root), 'utf8');
    assert.equal(hosted, offline);
    assert.ok(hosted.length > 100000);
    assert.ok(hosted.includes('Scheduled publish'));
    assert.ok(hosted.includes('Emergency publish'));
    assert.ok(hosted.includes('Switch to dark mode'));
    assert.ok(hosted.includes('Switch to light mode'));
});

test('the persisted theme is applied before CSS and the app mount', async () => {
    const html = await readFile(new URL('dist/index.html', root), 'utf8');
    const scriptPosition = html.indexOf('<script>');
    const stylePosition = html.indexOf('<style>');
    const rootPosition = html.indexOf('<div id="root">');
    assert.ok(scriptPosition > 0 && scriptPosition < stylePosition && stylePosition < rootPosition);
    assert.ok(html.slice(scriptPosition, stylePosition).includes('publish-workflow-explorer:theme'));
    assert.ok(html.slice(scriptPosition, stylePosition).includes('prefers-color-scheme: dark'));
});

test('the site stays self-contained and blocks live service calls', async () => {
    const html = await readFile(new URL('dist/index.html', root), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes("connect-src 'none'"));
    assert.ok(head.includes("font-src data:"));
    assert.ok(head.includes("object-src 'none'"));
    assert.equal(html.includes('<script src='), false);
    assert.equal(html.includes('<link rel="stylesheet"'), false);
    assert.equal(html.includes('<base '), false);
});