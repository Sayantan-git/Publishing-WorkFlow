import { build } from 'esbuild';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { themeColors } from './src/theme.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const themeResult = await build({
    absWorkingDir: root,
    stdin: { contents: "import { initializeTheme } from './src/theme.js'; initializeTheme();", resolveDir: root },
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022']
});
const result = await build({
    absWorkingDir: root,
    entryPoints: ['src/app.jsx'],
    outfile: 'app.js',
    bundle: true,
    write: false,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
    legalComments: 'eof'
});
const javascript = result.outputFiles.find(file => file.path.endsWith('.js')).text;
const stylesheet = result.outputFiles.find(file => file.path.endsWith('.css')).text;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="${themeColors.light}">
<meta name="description" content="Explore immediate and scheduled menu publishing, Azure services, data ownership, failures, and retries.">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'">
<title>Publish Workflow | Interactive Guide</title>
<script>${themeResult.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>
<style>${stylesheet.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>
<div id="root"></div>
<noscript>This interactive guide requires JavaScript. It runs locally without contacting live services.</noscript>
<script>${javascript.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
await writeFile(path.join(root, 'index.html'), html, 'utf8');
const siteDirectory = path.join(root, 'dist');
await mkdir(siteDirectory, { recursive: true });
await writeFile(path.join(siteDirectory, 'index.html'), html, 'utf8');
await writeFile(path.join(siteDirectory, '.nojekyll'), '', 'utf8');
const output = await stat(path.join(root, 'index.html'));
console.log(`Built offline index.html and GitHub Pages dist/ (${(output.size / 1024).toFixed(0)} KB each). No runtime server or external requests required.`);