# Deploy Publish Workflow to GitHub Pages

This project is a static website. GitHub Pages can host it without Azure, a database, API keys, or a backend server. GitHub Actions builds the page and publishes the result.

There are three different parts to this process:

- **The repository** stores the project files and their change history. Uploading files to a repository does not, by itself, publish a website.
- **GitHub Actions** runs the installation, build, tests, and deployment commands on a GitHub-hosted computer. A workflow is the file that describes those commands.
- **GitHub Pages** serves the finished website at a URL. It does not run the React source files or the Node.js build command for visitors.

The main route in this guide is: upload the source to `main`, let Actions build and test it, then let Pages serve the generated HTML. The Git upload method later in this guide is an alternative to uploading through the GitHub website, not a second deployment setup.

## 1. Check Permission and Visibility

**Why this comes first:** publishing the app also publishes the explanations embedded in it. A technically successful deployment can still expose information to the wrong audience.

This guide describes internal MM2 behavior, including implementation limitations. Confirm that you are allowed to publish that information before uploading it to GitHub.

- A public repository makes its source files available to others.
- A private repository does **not** automatically make its GitHub Pages website private. Pages sites are normally public; restricted site access requires supported organization/enterprise settings.
- GitHub Free generally supports Pages from public repositories. Private-repository hosting depends on your plan and organization policies.
- Do not change a repository to public just to bypass an unavailable Pages option. Use an approved hosting arrangement instead.
- Only upload the standalone **Publish Workflow** project. Never upload the MM2 application repository, temporary document backups, secrets, tokens, or production data.

For example, putting the source in a private repository is not enough if the requirement is "only employees can read the guide." The website needs its own approved access restrictions. If your plan cannot provide those restrictions, stop here and choose an approved internal host instead.

**Before continuing:** confirm the approved repository owner, repository visibility, website audience, and whether the MM2 explanations may be shared with that audience. Removing source files from the website artifact does not remove information embedded in its HTML.

No repository, commit, push, or live deployment has been created for you. The steps below are actions for you to perform after the visibility check.

## 2. Create a New Repository

**Why a separate repository:** this keeps the standalone learning app separate from the real MM2 application. Its source, dependency configuration, and publishing automation can then be reviewed without uploading unrelated application code.

1. Sign in to GitHub and choose **New repository**.
2. Choose the approved account or organization.
3. Enter a repository name, for example `publish-workflow`.
4. Choose the approved visibility.
5. Leave the automatic README, license, and gitignore options off. This project already includes its README and gitignore.
6. Select **Create repository**. The workflow expects the branch name `main`.

The owner and repository name normally become part of the website address. For example, a repository named `publish-workflow` under the account `YOUR-ACCOUNT` normally publishes at `https://YOUR-ACCOUNT.github.io/publish-workflow/`.

An empty repository does not have project files or a deployment yet. Its first commit creates the initial project snapshot. Use `main` as the default branch: the included workflow runs automatically on pushes to `main`, and GitHub shows its manual **Run workflow** control when the workflow is present on the default branch.

**Expected result:** an empty repository under the approved owner, with the intended visibility. Keep its page open for the upload. If GitHub provides a different default branch name, use its branch-renaming settings after the first upload so the project branch is `main` before following the deployment steps.

Use a new repository for this project, not a folder within the proprietary MM2 repository.

## 3. Upload the Project at the Repository Root

**Why the folder layout matters:** Actions starts its commands at the repository root, meaning the top-level folder visible when you open the repository. It expects to find the package file and build script there. An extra outer folder prevents those commands from finding the project.

The local project is in:

```text
C:\Users\bhattacharjee_s\Downloads\Publish Workflow
```

On GitHub, select **uploading an existing file** or **Add file > Upload files**. Upload these files and folders from inside that project folder:

```text
.github/
  workflows/
    pages.yml
.gitignore
build.mjs
package.json
package-lock.json
README.md
DEPLOYMENT.md
index.html
src/
tests/
```

The main files have different responsibilities:

| File or folder | Why it is uploaded |
| --- | --- |
| `.github/workflows/pages.yml` | Defines when Actions runs and how it builds, tests, and deploys the site. |
| `package.json` and `package-lock.json` | Describe the commands and dependencies, and lock dependency versions for a repeatable installation. Both must be included. |
| `build.mjs` and `src/` | Contain the build process and the app source used to generate the website. |
| `tests/` | Checks workflow behavior, theme handling, and the generated site before deployment. |
| `index.html` | Provides a ready-built local copy. The Actions deployment rebuilds its own copy from source instead of relying on this file. |
| `.gitignore` | Keeps generated output and installed dependencies out of normal Git staging. It is not a security scanner. |

Do **not** upload `node_modules` or `dist`. The workflow installs dependencies and generates the deployment folder itself. Git's ignore rules do not filter files dragged into the GitHub website, so select the files deliberately.

Do not upload the parent **Publish Workflow** folder as an extra level. On GitHub, `package.json`, `build.mjs`, and `.github` must be directly at the repository root.

Commit the upload to `main`. Verify that `.github/workflows/pages.yml` is visible in the repository. Dot-prefixed folders can be missed by some upload tools; use GitHub Desktop or the Git method below if your upload omits it.

A **commit** is a saved snapshot of the selected files, with a short description such as "Add publishing guide." On the GitHub upload page, committing the upload saves that snapshot directly to the repository. With the command-line Git method, a separate `git push` uploads local commits.

**Expected result:** the repository's top-level file list contains `package.json`, `package-lock.json`, `build.mjs`, `src`, and `tests`. Opening `.github`, then `workflows`, shows `pages.yml`. The branch selector shows `main`. You should not see an outer `Publish Workflow` folder or an uploaded `node_modules` folder.

## 4. Enable GitHub Pages

**Why this setting is needed:** the workflow file supplies the deployment instructions, but the repository must also allow Pages to receive the built website. Choosing **GitHub Actions** tells Pages to use that workflow's artifact rather than publish files directly from a branch.

1. Open the repository's **Settings**.
2. Select **Pages** in the left menu.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. You do not need to select a Jekyll template. This project already includes its deployment workflow.

An **artifact** is the package of generated files passed from the build job to the deployment job. Here, it contains the finished HTML page and a small static-hosting marker. Selecting an example workflow offered by GitHub is unnecessary because this project already defines those steps.

**Expected result:** the Pages settings show **GitHub Actions** as the source. A live website link may not appear until a deployment succeeds. For this method, do not switch the source to **Deploy from a branch** or select a `/docs` folder.

If Pages is unavailable, check the repository plan, your administrative access, and organization policies.

## 5. Run the Deployment

**Why there are two jobs:** the `build` job prepares and tests the website. The `deploy` job publishes that tested output. The deployment depends on a successful build, so a failed test prevents the new version from being published.

1. Open the **Actions** tab.
2. Select **Deploy Publish Workflow**.
3. Select **Run workflow**, choose `main`, and run it.
4. Open the new run and wait for both **build** and **deploy** to finish successfully. Each job can be opened to see its individual steps and logs.
5. Open the website link in the deployment summary or in **Settings > Pages**.

The manual run is useful for the first deployment or after correcting repository settings. Later uploads or pushes to `main` start a new run automatically. If an automatic run is already deploying the intended commit successfully, a second manual run is unnecessary.

The initial upload may start a workflow before Pages is enabled. If that run fails at configuration, complete step 4 and run it again.

If a job fails, open the first failed step and read its error. A failure during installation, testing, Pages configuration, and deployment has a different cause; rerunning without correcting that cause usually repeats the failure. If the deployment is waiting for an environment approval, an authorized reviewer must approve it under your organization's rules.

The normal project-site address is:

```text
https://YOUR-ACCOUNT.github.io/publish-workflow/
```

Replace the account and repository name with your own. A custom domain or enterprise setup may use another address. The workflow's reported URL is the authoritative one.

**Expected result:** both jobs have a green success status, and the deployment reports a website URL. A successful `build` job alone is not confirmation that the site is live.

## 6. Verify the Published App

**Why this is separate from deployment:** a successful job confirms that GitHub accepted the artifact. Opening the published URL checks the actual visitor experience, the correct repository path, and the intended audience's access.

1. Open the URL reported by the deployment, not the repository's source-code page or its preview of `index.html`.
2. Confirm that the app loads with its navigation, text, and workflow diagram. A directory listing or a page of source code is not the running app.
3. Open both immediate and scheduled publishing journeys. Move forward and backward through the steps and check that the explanation and data snapshots change.
4. Open a service definition, try search, and switch between light and dark themes. Reload the page to check that an explicit theme choice is remembered when browser storage is allowed.
5. Check a narrow browser window or a phone. Confirm that navigation opens and the controls and explanations remain usable.
6. Verify access against the decision in step 1. An approved public site should open without a GitHub sign-in. An access-restricted site should allow the intended users and reject unauthorized users; repository privacy alone is not this check.

These checks only exercise the illustration. They must not require Azure credentials, contact a restaurant, or start a real menu publish. Loading the website over the network is separate from the app making calls to live services.

**Expected result:** the intended audience can open the correct URL and use the simulator. Share that URL only after the content and access checks are complete.

## What the Workflow Publishes

The workflow executes the following sequence. These names match the steps shown in its Actions logs:

| Step | What it does and what success means |
| --- | --- |
| Check out the standalone repository | Copies the selected commit onto the build computer. This is the source version being deployed. |
| Set up Node.js | Installs Node.js 22 for the build tools. Visitors do not need Node.js to open the website. |
| Install locked dependencies | Runs `npm ci` using `package-lock.json`. If the lockfile and package file disagree, installation fails rather than silently changing versions. |
| Build the offline and hosted pages | Runs `npm run build`. It bundles the app, styles, icons, and fonts into a root `index.html` and an identical `dist/index.html`. |
| Test workflows, theme, and site artifact | Runs `npm test` after the build. The site tests inspect the generated output, which is why reversing this order can fail. |
| Configure GitHub Pages | Checks the repository's Pages configuration for the deployment. It does not replace the permission and visibility review. |
| Upload only the static site | Packages `dist` for Pages. Uploading the artifact makes it available to the next job; it does not, by itself, finish deployment. |
| Deploy to GitHub Pages | Publishes the artifact from the successful build and reports the resulting URL. |

The artifact contains only:

```text
index.html
.nojekyll
```

The empty `.nojekyll` file is a static-hosting marker that tells branch-based Pages publishing not to process the files with Jekyll. The Actions method already builds this app itself; no Jekyll theme or configuration is required.

Source files and dependency folders are not included in the website artifact. A public repository still exposes its committed source separately.

All fonts, icons, styles, and application code are embedded in the page. It works under a repository path without a special base-URL setting. Opening the locally built HTML still works offline. Loading the hosted URL initially requires a network connection; this is not a service-worker installation.

The site never calls MM2 or Azure services. No custom repository secrets are needed. GitHub Actions uses its built-in permissions to deploy to the `github-pages` environment.

The `github-pages` environment is GitHub's deployment target and history for the site, not an Azure environment. GitHub supplies the workflow's deployment credentials automatically. Do not add personal tokens, Azure keys, or passwords to the project to make this static deployment work.

## Updating the Site

**Why source changes matter:** the hosted HTML is rebuilt on every deployment. Editing only the generated root `index.html` will not change the next Actions-built website, because the build uses `src` and `build.mjs`.

Edit the source locally, run the following from the project folder, then upload or push the changed source files to `main`:

```powershell
Set-Location -LiteralPath 'C:\Users\bhattacharjee_s\Downloads\Publish Workflow'
npm ci
npm run build
npm test
```

Use Node.js 22 locally to match the workflow. `npm ci` installs the locked dependency tree and needs network access unless the required packages are already cached. The installed `node_modules` folder stays local. `npm run build` regenerates the self-contained page; `npm test` then checks behavior and the built artifact.

If one command fails, resolve that error before running the next command or uploading the update. Open the rebuilt local `index.html` to review the change. For dependency changes, include both the updated `package.json` and matching `package-lock.json`; for app changes, include the relevant `src` files.

Every push to `main` runs the workflow again. The build regenerates the website, so edit the source rather than only the generated HTML when using this workflow.

**Expected result:** the Actions run for your new commit succeeds, then the published URL shows the change. A commit appearing in GitHub is not proof that deployment finished. If the new run fails, an earlier successfully deployed version may remain live.

Use the moon/sun button in the top bar to choose a theme. A first visit follows the device setting; an explicit choice is remembered. Browser preferences are stored per origin. Your local HTML preferences will not automatically transfer to the hosted URL.

## Optional: Upload with Git Instead

Use this instead of the browser upload in step 3 when you want repeatable uploads and local version history. It requires Git on your computer and permission to push to the approved repository. It does not change the Pages configuration or the deployment workflow.

After creating a new empty repository, run these commands yourself in PowerShell. Replace the remote URL before running the remote and push commands.

```powershell
Set-Location -LiteralPath 'C:\Users\bhattacharjee_s\Downloads\Publish Workflow'
git init
git add .
git status
git diff --cached --stat
```

Stop and inspect the staged file list before committing. It should contain only this standalone project, without `node_modules`, `dist`, unrelated MM2 files, or sensitive data. Run `git diff --cached` as well when you need to inspect the staged contents; an ignore file does not detect secrets.

Once the selection is correct, continue:

```powershell
git commit -m "Add interactive publishing guide"
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/publish-workflow.git
git push -u origin main
```

| Command | Meaning |
| --- | --- |
| `git init` | Creates local Git tracking in this folder. It does not create a GitHub repository or upload anything. |
| `git add .` | Stages the non-ignored files for the next commit. Staging is still local. |
| `git status` and `git diff --cached --stat` | Show what will be committed, including a summary of staged changes. |
| `git commit` | Records a local snapshot. Git may first require your approved author name and email configuration. |
| `git branch -M main` | Names the current branch `main`, matching the workflow's automatic trigger. |
| `git remote add origin ...` | Connects the local repository to the approved GitHub repository URL. The conventional name for that destination is `origin`. |
| `git push -u origin main` | Uploads the commits and remembers the remote branch for later pushes. This can start the Actions workflow. |

Then enable **Settings > Pages > GitHub Actions** and follow the deployment steps above. Enter any authentication directly in Git's sign-in interface, never in the app or committed files. If the folder already belongs to a repository, inspect that repository and its remote instead of blindly re-running initialization commands.

If `origin` already exists or Git reports unrelated repository history, stop and inspect the setup. Do not force-push or replace a remote just to get past the error. After a successful push, confirm the uploaded files and the `main` branch on GitHub before enabling Pages.

## Alternative: Publish Only the Built Page

Choose this only when you want GitHub to host a page that has already been built, without running this project's Node.js build and tests in Actions. You become responsible for building and testing each new version before uploading it.

For a browser-only deployment without a Node build workflow, use a separate new repository containing only the contents of the already built `dist` folder: `index.html` and `.nojekyll`. Do not include the Actions workflow in that alternative repository.

In **Settings > Pages**, choose **Deploy from a branch**, branch `main`, folder `/(root)`, then save. Future updates require uploading the freshly rebuilt `dist/index.html`. Choose this alternative or the Actions method, not both at once.

Here, `/(root)` means the uploaded HTML is directly at the repository's top level, not inside a `dist` folder. GitHub may still show a managed Pages deployment run, but it will not run this project's `npm ci`, build, or test steps. Wait for publishing to succeed, then perform the same website and access checks in step 6. The permission requirements from step 1 still apply.

## Common Problems

| Problem | Check |
| --- | --- |
| No workflow is listed | Confirm `.github/workflows/pages.yml` exists at the root on `main`. |
| The workflow is listed but there is no Run workflow button | Confirm the file is on the default branch and includes `workflow_dispatch`. Check your repository permissions and whether Actions is enabled by the organization. |
| Build cannot find the package file | The project may be nested inside an extra folder. Move its contents to the repository root. |
| Configure or deploy fails | Enable Pages with Source **GitHub Actions**. Check organization policies and the `github-pages` environment's branch rules. |
| Build succeeded but deploy is waiting | Open the deployment job and check for an environment approval or protection rule. An authorized reviewer may need to approve it. |
| A test says `dist` is missing | Run the build before the tests. The included workflow already uses this order. |
| Dependency install fails | Commit the matching `package-lock.json`. Rebuild locally using Node.js 22 and inspect the error. |
| The website returns 404 | Use the deployment URL, including the repository path. Wait for the deployment job to finish. |
| An older page appears | Confirm the latest action succeeded, then reload the page with the browser cache bypassed. |
| The site is unexpectedly public | Stop sharing it and have the authorized owner unpublish it through Pages settings or restrict access using supported controls. Stopping the workflow or making the repository private does not by itself remove an already published site. |

Official references: [Create a Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site) and [Use a custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).