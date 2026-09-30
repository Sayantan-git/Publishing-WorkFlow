# Publish Workflow

A standalone interactive guide to MM2 immediate and scheduled menu publishing. It works as an offline HTML file or a static GitHub Pages site.

Open **index.html** in a current Edge, Chrome, or Firefox browser. No server, login, internet connection, or cloud credentials are needed. The built page includes its JavaScript, styles, icons, and fonts. Its content security policy blocks network connections.

## Included

- Separate immediate (emergency) and scheduled journeys.
- Clickable workflow diagrams, step list, playback, timeline scrubbing, zoom, and expanded view.
- Success, local retry, exhausted send, preparation failure, swallowed HTTP failure, partial staging, offline-store, and dead-letter scenarios.
- Storage snapshots distinguishing SQL business records, Cosmos payload/history, broker delivery metadata, and diagnostics.
- A schedule-selection calculator, service definitions, system-design concepts, search, and implementation caveats.
- Light and dark themes, with a saved choice and the device theme used on the first visit.

These are illustrative learning scenarios based on a September 2026 source trace. They never contact Azure or a restaurant. Deployment settings, exact delivery limits, backend permissions, and downstream behavior must be verified separately. Emergency means MM2 immediate/manual publishing, not a separately traced HQ Auto-Publish feature.

## Publish on GitHub Pages

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for step-by-step instructions. The included [Pages workflow](.github/workflows/pages.yml) builds and tests the app before deploying only the generated site folder.

**Get permission before publishing internal MM2 information.** A private repository does not automatically make its Pages website private. Upload only this standalone folder, never the surrounding MM2 repository, credentials, or production data.

## Maintain the Local Project

Use Node.js 22, which is also the version used by the GitHub Actions workflow.

```text
npm ci
npm run build
npm test
```

The build writes the self-contained `index.html` for offline viewing and an identical `dist/index.html` for hosting. The `dist` folder also contains `.nojekyll` and is the only folder published by the workflow. Do not upload `node_modules` or commit `dist`; both are ignored by Git.

No external runtime files or backend server are needed. Only the last selected workflow, playback speed, and explicit theme choice are stored in local browser storage. The local file and hosted website have separate browser storage. There is no automatic synchronization or account system.

No application or infrastructure changes were made to the MM2 repository as part of this guide.