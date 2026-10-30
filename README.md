<div align="center">

<img src="public/logo.svg" width="72" alt="antm logo" />

# antm

**Turn a repository into an interactive, click-through demo, built by Claude or ChatGPT.**

Your assistant reads the real code and rebuilds the real UI. antm checks every slide in headless Chrome and saves the result as one self-contained HTML file. (Inside Claude and ChatGPT the connector is still named "Animated Technical Interactive".)

[**Live app**](https://app.antm.ai) · [**Samples**](https://app.antm.ai/samples) · [**Blog: antm.ai**](https://antm.ai) · [**LinkedIn**](https://www.linkedin.com/in/sanathswaroop/)

![Landing page](docs/landing.png)

</div>

---

## What it does

Point it at a repository and give the demo a title. Your assistant studies the application and builds a guided, click-through presentation that anyone can open in a browser. There are no screenshots pasted into slides.

- **Replicates the real UI.** Colors, fonts, spacing, copy, icons and states are transcribed from the source, not approximated. Every recreated screen is traced to its source files, and the repository's own images, screenshots and mockups are used where they exist.
- **Runs on your own plan.** Claude or ChatGPT writes the demo in your own chat, through a connector, so the model usage comes from your plan. antm fetches the code, renders the slides and stores the results.
- **Sized to the product.** There is no fixed slide count. A small app gets about six slides; a broad product gets as many as it needs, at a *brief*, *standard* or *detailed* level.
- **One colour mode.** You choose light or dark when you start. The deck is built, checked and shown only in that mode, with no theme switch.
- **Honest verification.** Every slide and step is rendered in Chromium at desktop size, plus phone-width samples. Each check is recorded as passed, failed or not run. Figures that can't be verified from the code are labelled illustrative.
- **Read-only.** A GitHub App with Contents and Metadata read access, or a read-only token for Azure DevOps, GitLab or Bitbucket, or an uploaded zip. Nothing is ever committed or pushed.
- **One file out.** A single self-contained `.html` (up to 3 MB) with no external requests. It is previewed in a sandbox, downloadable, and comes with a verification report and an evidence report.

![Samples](docs/samples.png)

See real outputs generated from real repositories on the [samples page](https://app.antm.ai/samples), including one of antm itself. The landing page shows them live.

## How it works

```
app.antm.ai/dashboard ── New demo form ──► fetches the repo into a scrubbed, read-only workspace
        │                                   and opens claude.ai/new?q=… or chatgpt.com/?q=…
        │
Claude or ChatGPT (your plan) ── MCP, OAuth 2.1 ──► app.antm.ai/api/mcp ("Animated Technical Interactive")
        start_demo → read_files / search_code / view_images
        → save_demo_plan → save_demo_styles → save_demo_screen (each screen rendered in Chromium,
          problems and screenshots sent back) → finish_demo (remaining views checked, reports written)
        │
        └──► dashboard: live progress, sandboxed preview, download, reports, usage
```

The server never calls a model in this mode. It does the work an assistant can't do in a chat: cloning the repository, scrubbing it (secret-like files and escaping symlinks removed, `.git` deleted), serving files on request, rendering slides in headless Chromium with the network off, assembling the deck and keeping the build history.

## Using it

### 1. Set up once (`/dashboard/setup`)

1. **Sign in with GitHub.** "Build a demo" on the landing page opens the dashboard. If the GitHub App can't read any repository yet, sign-in takes you to setup and asks you to **choose the repositories antm may read**. The page waits for GitHub and moves on once the installation appears.
2. **Connect Claude or ChatGPT** (either or both):
   - **Claude:** *Add to Claude* opens claude.ai's *Add custom connector* dialog with the name and URL filled in. Click Add, then Connect, then Allow on antm.
   - **ChatGPT:** turn on Developer mode (paid plans). In ChatGPT plugins, add a custom MCP server with the URL `https://<APP_URL>/api/mcp` and OAuth, then create and install the plugin and allow access. ChatGPT registers itself with dynamic client registration.

   The page updates by itself and shows which assistants are connected. It identifies each one from its OAuth client's redirect host.
3. **Let builds run without interruptions.** In claude.ai, set the connector's tools to *Always allow*. ChatGPT asks you to confirm each tool call that saves part of the deck.

Code on Azure DevOps, GitLab or Bitbucket? Save a read-only token under setup (Azure DevOps: Code Read; GitLab: read_repository; Bitbucket: repository read). Tokens are sealed on the server and never reach the assistant.

### 2. Build a demo (`/dashboard`)

The *New demo* form has four steps:

| Step | What you set |
|---|---|
| **Code** | A GitHub repository, a repository URL from another host (with branch and saved token), or a zip upload |
| **Presentation** | Title (required), level of detail and colour mode (light or dark) |
| **Details** (optional) | Audience, slide language, what to focus on, what to leave out, notes for the assistant, and the cover byline: presenter, organization and date (today by default) |
| **Review** | Everything at a glance, with a preview of the cover slide, and the assistant to hand the build to |

The presenter and organization are remembered in your browser for the next demo. Submitting starts the repository fetch, records the request and opens a chat with a one-line prompt. The assistant calls `start_demo` with the request id and follows the guide it returns.

**Images.** Generated markup refers to repository images as `repo:<path>` (or the app's root paths, such as `/logo.png` for `public/`). Saving a deck embeds them as data URIs within the 3 MB limit and reports any that are missing.

### 3. Results and history

*Your demos* lists every build with its live stage (reading the code, planning, copying styles, rebuilding screens, checking slides, writing reports). Each finished demo has a sandboxed preview, a download, and the **verification** and **evidence** reports. The reports open formatted in the dashboard and can be downloaded as Markdown. A build that hasn't reported for 20 minutes shows as *interrupted*.

**Usage** (`/dashboard/usage`) covers 7, 30 or 90 days: builds, success rate, assistant calls, estimated tokens per day and per stage, connector tool calls and build time. Token counts are estimates (about four characters per token, about 1,300 per screenshot), because the model runs on your plan and antm can't see billed amounts. Users in `ADMIN_LOGINS` can switch to *All users*. Connector tool calls are kept for 180 days.

### Connector tools

| Tool | Purpose |
|---|---|
| `start_demo`, `save_demo_plan`, `save_demo_styles`, `save_demo_screen`, `finish_demo` | The guided chat build started from the dashboard |
| `workspace_status`, `read_files`, `search_code`, `view_images` | Read the scrubbed, read-only copy of the code and look at the repository's images |
| `get_deck`, `record_generation` | Reload a deck for revisions, and report a build that failed |

Organization owners can add the connector once for everyone: in Claude under Organization settings → Connectors, in ChatGPT as a workspace plugin.

**Limits.** Very large frontends are read selectively, a batch of files at a time. The chat has to stay open while the assistant builds; the deck is saved after every screen.

## Server builds (`/app`)

The original pipeline is still available at `/app`. It runs the Claude Agent SDK on the server, in an isolated container per run, with the server's own Claude credentials:

```
Browser ──► Next.js (Node runtime, SQLite) ──► host clones the repo with a short-lived,
               │                                read-only GitHub App installation token
               │   SSE (event ids + Last-Event-ID replay)  │
               └◄──── events ◄── JSONL ◄── runner container (one per run): Claude Agent SDK,
                                            cwd = scrubbed repo copy, restricted tools,
                                            headless Chromium, no GitHub credentials
```

Pick a repository, set a title (audience, details and sample data such as CSV, JSON, text, Markdown, XLSX or images are optional), and watch progress stream live. Stages advance only on real signals (first read, first write to the output folder, first headless-browser command), never on timers. Writes and anything that executes code pause for your approval in the UI.

`CLAUDE_AUTH_MODE=session` reuses the server owner's Claude Code login and suits pre-production. For public use, set `CLAUDE_AUTH_MODE=api_key` with `ANTHROPIC_API_KEY`.

## Quick start (development)

Requirements: Node 22+ and git. Chromium or Chrome is needed for slide verification. Docker is only needed for the isolated runner, and [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude` then `/login`) only for `/app` server builds.

```bash
npm install
cp .env.example .env          # set SESSION_SECRET (32+ random characters)

# Dev shortcut: skips the GitHub App and uses your `gh auth login` identity.
# /app runs the agent directly on your machine, with no container isolation. Never use in production.
DEV_AUTH_BYPASS=1 RUNNER_MODE=local npm run dev     # http://127.0.0.1:3000
```

`RUNNER_MODE=local` is refused when `NODE_ENV=production`, and `DEV_AUTH_BYPASS` is ignored there. Assistants can only reach the connector over public HTTPS, so test chat builds against a deployed instance or a tunnel.

## GitHub App

Create one under *Settings → Developer settings → GitHub Apps*:

| Setting | Value |
|---|---|
| Homepage URL | your site, e.g. `https://app.antm.ai` |
| Callback URL | `<site>/api/auth/github/callback` |
| Setup URL (optional) | `<site>/dashboard/setup`, so people return to setup after installing |
| Expire user authorization tokens | on |
| Webhook | inactive (not used) |
| Repository permissions | **Contents: read-only**, **Metadata: read-only**. Nothing else. |
| Installable by | any account |

Put `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` and `GITHUB_APP_PRIVATE_KEY` in `.env`. Write the private key on one line with newlines as `\n`, wrapped in single quotes so systemd's `EnvironmentFile` keeps the backslashes.

## Deploy

```bash
cp .env.example .env              # APP_URL, SESSION_SECRET, GitHub App values
npm run runner:build              # builds demo-studio-runner:latest (Chromium + Agent SDK)
npm run build && npm start        # or: docker compose up -d --build
```

Put it behind a TLS-terminating reverse proxy (nginx or the bundled Caddy), and turn proxy buffering off for the `/api/runs/*/events` Server-Sent Events route. Data lives under `DATA_DIR`: the SQLite database, connector workspaces and decks, and `runs/<runId>/{input,output,screenshots,reports}` for `/app` builds. Finished runs and unused workspaces are pruned after `RETENTION_DAYS`; active runs never are.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://127.0.0.1:3000` | Public URL, used for OAuth, the connector URL and the same-origin check |
| `SESSION_SECRET` | | 32+ random characters; seals sessions and saved tokens |
| `DATA_DIR` | | Where the database, workspaces, decks and runs are stored |
| `ADMIN_LOGINS` | | Comma-separated GitHub logins that can see usage across all users |
| `GIT_EXTRA_HOSTS` | | Self-hosted git servers for the connector, e.g. `gitlab.corp.com=gitlab,tfs.corp.com=azure` |
| `RUNNER_MODE` | `docker` | `/app` builds: `docker` (isolated), `local` (dev only), `mock` (tests only) |
| `CLAUDE_AUTH_MODE` | `session` | `/app` builds: `session` (Claude Code login) or `api_key` (`ANTHROPIC_API_KEY`) |
| `MAX_CONCURRENT_RUNS` | `2` | `/app` builds in parallel |
| `MAX_RUNS_PER_USER_PER_DAY` | `10` | `/app` daily quota |
| `RUN_TIMEOUT_MINUTES` | `60` | `/app` hard limit per run |
| `RETENTION_DAYS` | `14` | Cleanup of finished runs and unused connector workspaces |

See [`.env.example`](.env.example) for the full list.

## Security model

- Repository contents and user text are **untrusted**. Prompts fence user text, and settings passed to the assistant are framed as preferences that cannot change the rules.
- **Connector.** antm is an OAuth 2.1 authorization server with dynamic client registration, PKCE (S256), hashed opaque tokens, one-hour access tokens and rotating refresh tokens with reuse detection. Consent requires a same-origin form post. Every workspace, deck and report is owner-scoped. PATs and GitHub tokens are never sent to Claude or ChatGPT.
- **Code access.** Git hosts are allow-listed (`GIT_EXTRA_HOSTS` adds self-hosted servers). Credentials are passed to git as a per-host header, never in argv or `.git/config`. Uploaded zips are extracted with path-traversal and size checks. Workspaces are scrubbed of secret-like files and escaping symlinks.
- **Rendering.** Generated decks are rendered for verification with the network off, and served back with `Content-Security-Policy: sandbox`. Previews use an iframe without `allow-same-origin`. Report Markdown is rendered as React elements, never raw HTML.
- **`/app` runner.** The agent's tools go through an allow/deny policy ([`docker/runner/policy.mjs`](docker/runner/policy.mjs)): reads only inside the run workspace, writes only to output folders, web tools disabled, and anything that writes, redirects or executes code pauses for **your approval** (auto-denied after 120 s). `--dangerously-skip-permissions` is never used, and the agent never loads the repo's own `.claude` settings, hooks or `CLAUDE.md`. Each run gets its own container: non-root, read-only root filesystem, all capabilities dropped, `no-new-privileges`, and CPU, memory and pid limits. The GitHub token is used by the host to clone and never enters the container.
- Tokens are redacted from logs and events. Mutating routes require same-origin requests, and other users get a 404 on anything they don't own.

**Limits.** Running an agent over arbitrary repositories is inherently risky; container isolation reduces but does not eliminate that risk. The app container needs the Docker socket, which is root-equivalent on its host, so use a dedicated machine and ideally a socket proxy.

## Tests

```bash
npm test          # Vitest: unit, integration and headless-browser tests
npm run typecheck
npm run lint
npm run build
```

Covered: validation, prompt construction and injection fencing, sample-data preservation, path-traversal and symlink protection, artifact isolation between runs and users, SSE replay, JSONL parsing, state transitions, cancellation and failures, Docker hardening flags, the tool policy, and session sealing. The `/app` manager tests use a **mock runner** (`tests/fixtures/mock-runner.mjs`, tests only), so they prove orchestration, not real Claude execution.

The connector tests cover the OAuth flow (registration, PKCE, single-use codes, refresh rotation and reuse detection), git URL parsing, zip extraction safety, owner scoping, repository images, and every MCP tool over the real route handler, including Chromium verification when Chrome is installed. `tests/deck-assembler.test.ts` covers deck assembly, including the colour mode.

## Project layout

```
app/                 Next.js routes: landing, /dashboard (demos, usage, setup), /app, /samples, /connect, and the API
app/api/mcp/         the MCP connector endpoint
app/api/oauth/       OAuth 2.1 endpoints for the connector
components/          UI: dashboard, landing sections, /app shell, repo picker, progress, preview
lib/studio/          connector tools, chat builds, workspaces, decks, images, usage, Chromium verification
lib/oauth/           OAuth 2.1 authorization server
lib/sources/         Azure DevOps / GitLab / Bitbucket cloning, saved tokens, zip extraction
lib/github/          GitHub App auth, repo listing, safe cloning
lib/runs/            /app run store (SQLite), state machine, uploads, job manager
lib/claude/          /app runner launcher, event translation, JSONL parser
lib/prompts/         /app generation prompt template and builder
lib/artifacts/       /app artifact registry and server-side checks
deck/                deck engine: assembler, runtime embedded in every deck, and the rules the chat guide gives the assistant
docker/runner/       Agent SDK entrypoint, tool policy, runner image (also provides Chromium for verification)
samples/             generated sample demos shown on /samples and the landing page
```

## Known limitations

- Chat builds depend on the assistant following the guide. ChatGPT asks for confirmation on each saving tool call, and both assistants have per-message limits that can slow very large decks.
- Verification needs Chromium on the server. Interaction checks that need a real window (fullscreen, touch) are reported as not run.
- Fidelity is transcribed from source, styles and the repository's images; a pixel-diff against the live product is not performed.
- Token counts on the usage page are estimates; claude.ai and ChatGPT show actual plan usage.

## License

Copyright (c) 2026 Sanath Swaroop.

Licensed under [**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**](LICENSE).

- **You may** use, copy, modify, and share this project and build on it.
- **You must** give appropriate credit to the original source, link to the license, and indicate if you made changes. For example:
  *"Based on antm (Animated Technical Interactive) by Sanath Swaroop, https://github.com/sanath1599/animated-interactive (CC BY-NC 4.0)."*
- **You may not** use it for commercial purposes.

This is a source-available license, not an OSI-approved open-source license, because it forbids commercial use. For commercial licensing, get in touch via [antm.ai](https://antm.ai).

The sample demos under `samples/` were generated from the author's own repositories and carry the same license.

## Author

Built by Sanath Swaroop ([GitHub](https://github.com/sanath1599), [LinkedIn](https://www.linkedin.com/in/sanathswaroop/)). I write about what's happening in tech at **[antm.ai](https://antm.ai)**, and the live app is at **[app.antm.ai](https://app.antm.ai)**.
