<div align="center">

<img src="public/logo.svg" width="72" alt="Animated Technical Interactive logo" />

# Animated Technical Interactive

**Turn any GitHub repository into a faithful, interactive executive demo.**

Claude Code reads the real code, rebuilds the real UI, and ships one self-contained HTML file, checked in headless Chrome.

[**Live app**](https://app.antm.ai) · [**Samples**](https://app.antm.ai/samples) · [**Blog: antm.ai**](https://antm.ai)

![Landing page](docs/landing.png)

</div>

---

## What it does

Point it at a repository and a title. It studies the application, then produces a guided, click-through presentation your leadership can open in any browser, with no screenshots pasted into slides.

- **Replicates the real UI.** Colors, fonts, spacing, copy, icons and states are transcribed from the source, not approximated. Every recreated screen is traced to its source files.
- **Sized to the product.** No fixed slide count: a small app gets about six slides, a broad product gets as many as it needs.
- **Honest verification.** Each check is recorded as passed, failed or not run. Figures that can't be verified from the code are labelled illustrative.
- **Read-only.** A GitHub App with Contents and Metadata read access. Nothing is ever committed or pushed.
- **One file out.** A single self-contained `.html` with no external requests, previewed in a sandbox and downloadable.

![Samples](docs/samples.png)

See real outputs generated from real repositories on the [samples page](https://app.antm.ai/samples).

## How it works

```
Browser ──► Next.js (Node runtime, SQLite) ──► host clones the repo with a short-lived,
               │                                read-only GitHub App installation token
               │                                          │
               │   SSE (event ids + Last-Event-ID replay) ▼
               └◄──── events ◄── JSONL ◄── runner container (one per run): Claude Agent SDK,
                                            cwd = scrubbed repo copy, restricted tools,
                                            headless Chromium, no GitHub credentials
```

1. **Sign in** with GitHub (GitHub App user-to-server OAuth, sealed HttpOnly session cookie).
2. **Pick a repository** from those you installed the app on, public or private, user or organization.
3. **Configure:** a title is required; audience, details and sample data (CSV, JSON, text, Markdown, XLSX, images) are optional.
4. **Run:** the job is queued, the repo is cloned and scrubbed (secret files and escaping symlinks removed, `.git` deleted), and the agent runs in an isolated container while progress streams live.
5. **Result:** sandboxed preview, download, screenshots, a verification report and a data-sources and caveats report.

Progress stages advance only on real signals (first read, first write to the output folder, first headless-browser command), never on timers.

## Quick start (development)

Requirements: Node 22+, git, and [Claude Code](https://docs.claude.com/en/docs/claude-code) signed in (`claude` then `/login`). Docker is only needed for the isolated production runner.

```bash
npm install
cp .env.example .env          # set SESSION_SECRET (32+ random characters)

# Dev shortcut: skips the GitHub App and uses your `gh auth login` identity.
# Runs the agent directly on your machine, with no container isolation. Never use in production.
DEV_AUTH_BYPASS=1 RUNNER_MODE=local npm run dev     # http://127.0.0.1:3000
```

`RUNNER_MODE=local` is refused when `NODE_ENV=production`, and `DEV_AUTH_BYPASS` is ignored there.

## GitHub App

Create one under *Settings, Developer settings, GitHub Apps*:

| Setting | Value |
|---|---|
| Homepage URL | your site, e.g. `https://app.antm.ai` |
| Callback URL | `<site>/api/auth/github/callback` |
| Expire user authorization tokens | on |
| Webhook | inactive (not used) |
| Repository permissions | **Contents: read-only**, **Metadata: read-only**. Nothing else. |
| Installable by | any account |

Put `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` and `GITHUB_APP_PRIVATE_KEY` (newlines written as `\n`) in `.env`.

## Deploy

```bash
cp .env.example .env              # APP_URL, SESSION_SECRET, GitHub App values
npm run runner:build              # builds demo-studio-runner:latest (Chromium + Agent SDK)
npm run build && npm start        # or: docker compose up -d --build
```

Put it behind a TLS-terminating reverse proxy (nginx or the bundled Caddy), and turn proxy buffering off for the `/api/runs/*/events` Server-Sent Events route. Run data lives under `DATA_DIR`: `runs/<runId>/{input,output,screenshots,reports}` plus the SQLite database. Finished runs are pruned after `RETENTION_DAYS`; active runs never are.

**Claude credentials.** `CLAUDE_AUTH_MODE=session` reuses the server owner's Claude Code login and suits pre-production. For public use, set `CLAUDE_AUTH_MODE=api_key` with `ANTHROPIC_API_KEY`; no code changes are needed.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_URL` | `http://127.0.0.1:3000` | Public URL, used for OAuth and the same-origin check |
| `RUNNER_MODE` | `docker` | `docker` (isolated), `local` (dev only), `mock` (tests only) |
| `MAX_CONCURRENT_RUNS` | `2` | Parallel generations |
| `MAX_ACTIVE_RUNS_PER_USER` | `1` | Concurrent runs per user |
| `MAX_RUNS_PER_USER_PER_DAY` | `10` | Daily quota |
| `RUN_TIMEOUT_MINUTES` | `60` | Hard limit per run |
| `RETENTION_DAYS` | `14` | Cleanup of finished runs |

See [`.env.example`](.env.example) for the full list.

## Security model

- Repository contents and user text are **untrusted**. The prompt fences user text with a per-prompt nonce, and the agent never loads the repo's own `.claude` settings, hooks or `CLAUDE.md`.
- The agent's tools go through an allow/deny policy ([`docker/runner/policy.mjs`](docker/runner/policy.mjs)): reads only inside the run workspace, writes only to output folders, web tools disabled, safe read-only pipelines allowed, and anything that writes, redirects or executes code pauses for **your approval** in the UI (auto-denied after 120 s). `--dangerously-skip-permissions` is never used.
- Each run gets its own container: non-root, read-only root filesystem, all capabilities dropped, `no-new-privileges`, CPU, memory and pid limits. The GitHub token is used by the host to clone and never enters the container.
- Tokens are redacted from logs and events. Mutating routes require same-origin requests. Every run and artifact route is owner-scoped, so other users get a 404.
- Generated HTML is served with `Content-Security-Policy: sandbox` and no network access, and previewed in an iframe without `allow-same-origin`.

**Limits.** Running an agent over arbitrary repositories is inherently risky; container isolation reduces but does not eliminate that risk. The app container needs the Docker socket, which is root-equivalent on its host, so use a dedicated machine and ideally a socket proxy. Local-only binding does not make browser-based attacks impossible.

## Tests

```bash
npm test          # 48 unit and integration tests (Vitest)
npm run typecheck
npm run lint
npm run build
```

Covered: validation, prompt construction and injection fencing, sample-data preservation, path-traversal and symlink protection, artifact isolation between runs and users, SSE replay, JSONL parsing, state transitions, cancellation and failures, Docker hardening flags, the tool policy, and session sealing. The manager tests use a **mock runner** (`tests/fixtures/mock-runner.mjs`, tests only), so they prove orchestration, not real Claude execution.

## Project layout

```
app/                 Next.js routes: landing, /app, /samples, and the API
components/          UI (app shell, repo picker, progress, preview, landing sections)
lib/github/          GitHub App auth, repo listing, safe cloning
lib/runs/            run store (SQLite), state machine, uploads, job manager
lib/claude/          runner launcher, event translation, JSONL parser
lib/prompts/         the generation prompt template and builder
lib/artifacts/       artifact registry and server-side checks
docker/runner/       Agent SDK entrypoint, tool policy, runner image
samples/             generated sample demos shown on /samples
```

## Known limitations

- The Claude run needs a signed-in Claude Code session or an API key on the host.
- In-agent verification depends on Chromium; the server only confirms files exist and scans for external references. Interaction checks that need a real window (fullscreen, touch) are reported as not run.
- Fidelity is transcribed from source and screenshots; a pixel-diff against the live product is not performed.

## License

Copyright (c) 2026 Sanath Swaroop.

Licensed under [**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**](LICENSE).

- **You may** use, copy, modify, and share this project and build on it.
- **You must** give appropriate credit to the original source, link to the license, and indicate if you made changes. For example:
  *"Based on Animated Technical Interactive by Sanath Swaroop, https://github.com/sanath1599/animated-interactive (CC BY-NC 4.0)."*
- **You may not** use it for commercial purposes.

This is a source-available license, not an OSI-approved open-source license, because it forbids commercial use. For commercial licensing, get in touch via [antm.ai](https://antm.ai).

The sample demos under `samples/` were generated from the author's own repositories and carry the same license.

## Author

Built by [Sanath Swaroop](https://github.com/sanath1599). I write about what's happening in tech at **[antm.ai](https://antm.ai)**, and the live app is at **[app.antm.ai](https://app.antm.ai)**.
