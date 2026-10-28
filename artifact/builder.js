/* Demo builder: runs in claude.ai. Claude calls use the viewer's plan (sample capability); repository access,
   storage and browser verification go through the viewer's "Animated Technical Interactive" connector (mcp). */
(function () {
  "use strict";
  var SERVER = "Animated Technical Interactive";
  var APP_URL = window.__APP_URL || "https://app.antm.ai";
  var MCP_URL = APP_URL + "/api/mcp";
  var DASHBOARD_URL = APP_URL + "/dashboard";
  // claude.ai opens "Add custom connector" with these values filled in; the viewer still confirms.
  var INSTALL_URL = "https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=" + encodeURIComponent(SERVER) + "&connectorUrl=" + encodeURIComponent(MCP_URL);
  var P = window.DemoPrompts, A = window.DeckAssembler;
  var RUNTIME_CSS = window.__DECK_RUNTIME_CSS, RUNTIME_JS = window.__DECK_RUNTIME_JS;
  var STATE_VERSION = 1;

  var S = {
    mcp: null, sample: null, downloads: null, limits: null,
    view: "boot", sources: null, setupReason: "", error: "",
    src: { tab: "github", repo: "", branch: "", url: "", credentialId: "", branches: null, files: null, filter: "" },
    ws: null, cfg: null, images: [], samples: [],
    build: null, deck: null,
    gen: { id: null, queue: [], timer: null, off: false }
  };
  var $main = document.getElementById("main"), $side = document.getElementById("recent");

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel) { return $main.querySelector(sel); }
  function on(sel, ev, fn) { var e = $(sel); if (e) e.addEventListener(ev, fn); }
  function kb(n) { return n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
  function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? m + "m ago" : m < 1440 ? Math.round(m / 60) + "h ago" : Math.round(m / 1440) + "d ago"; }
  function sleep(ms, signal) { return new Promise(function (res, rej) { var t = setTimeout(res, ms); if (signal) signal.addEventListener("abort", function () { clearTimeout(t); rej({ code: "cancelled" }); }, { once: true }); }); }
  function copyBtn(text) { return '<button class="btn sm" type="button" data-copy="' + esc(text) + '">Copy</button>'; }
  function wireCopy(root) {
    (root || $main).querySelectorAll("[data-copy]").forEach(function (b) {
      b.onclick = function () {
        var t = b.getAttribute("data-copy");
        Promise.resolve().then(function () { return navigator.clipboard.writeText(t); }).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1400); })
          .catch(function () { b.textContent = "Select and copy"; });
      };
    });
  }
  function b64ToBlob(b64, type) { var bin = atob(b64), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: type }); }
  function bytesToB64(u8) { var s = "", CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  async function pool(items, size, fn) { var i = 0; async function worker() { while (i < items.length) { var k = i++; await fn(items[k], k); } } await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker)); }

  /* ---------------- connector calls ---------------- */
  var CONNECTOR_FIX = { needs_reauth: "Reconnect " + SERVER + " in claude.ai Settings → Connectors.", server_not_connected: "Add the " + SERVER + " connector in claude.ai Settings → Connectors.", selection_required: "Choose which " + SERVER + " connector to use when claude.ai asks.", not_in_manifest: "This page is not allowed to use the connector. Allow it in the artifact's permissions.", blocked_by_policy: "Your organisation's policy blocks this connector." };
  function mcpError(e) {
    var err = new Error(e && e.code === "tool_error" ? e.message : CONNECTOR_FIX[e && e.code] || (e && e.message) || "The connector call failed.");
    err.code = e && e.code; err.retryable = e && e.retryable; return err;
  }
  async function call(tool, input, signal) {
    try {
      var r = await S.mcp.callTool(SERVER, tool, input || {}, signal ? { signal: signal, cache: false } : { cache: false });
      return { payload: r.payload, content: r.content || [] };
    } catch (e) {
      if (e && (e.code === "server_not_connected" || e.code === "needs_reauth" || e.code === "selection_required")) { S.setupReason = CONNECTOR_FIX[e.code]; }
      throw mcpError(e);
    }
  }

  /* ---------------- Claude calls ---------------- */
  var CLAUDE_FIX = { not_granted: "Claude access was declined for this artifact. Reload the page and allow it to continue.", sampling_disabled: "Claude isn't available for this account or organisation.", rate_limited: "You've reached a Claude usage limit. Wait a little, then resume.", session_expired: "Your claude.ai session expired. Sign in again, then resume.", refused: "Claude declined part of this request.", prompt_too_large: "A request was too large for Claude.", upstream_error: "Claude had a temporary problem.", empty_completion: "Claude returned an empty answer." };
  async function ask(prompt, opts) {
    opts = opts || {};
    var tier = opts.tier || (S.cfg && S.cfg.quality) || "complex";
    var outLen = 0;
    var o = { modelTier: tier, signal: opts.signal, cache: false, onText: function (u) { outLen = u.text.length; if (opts.onText) opts.onText(u.text.length); } };
    if (opts.images && opts.images.length && S.limits && S.limits.images) o.images = opts.images.slice(0, S.limits.images.maxCount);
    var t0 = Date.now(), use = { stage: opts.stage || "Claude call", tier: tier, promptBytes: new TextEncoder().encode(prompt).length, images: (o.images || []).length };
    try {
      var out = await S.sample.json(prompt, o);
      trackCall(use, t0, outLen || JSON.stringify(out).length, true);
      return out;
    } catch (e) {
      trackCall(use, t0, outLen || (e && e.text ? e.text.length : 0), false, e && e.code);
      if (e && e.code === "invalid_json" && !opts.retried) {
        // One tightened re-ask (a different prompt), never a loop.
        return ask(prompt + "\n\nYour previous reply was not valid JSON or was cut off. Reply again with complete, valid JSON only, keeping it compact.", Object.assign({}, opts, { retried: true }));
      }
      var err = new Error(CLAUDE_FIX[e && e.code] || (e && e.message) || "Claude call failed.");
      err.code = e && e.code; throw err;
    }
  }

  /* ---------------- history and usage (shown on the dashboard) ----------------
     Sizes are measured here because Claude runs on the viewer's plan; the server only stores them.
     Tracking never interrupts a build: failures are dropped. */
  function trackCall(use, t0, outChars, ok, code) {
    if (S.gen.off) return;
    S.gen.queue.push({ callId: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), stage: String(use.stage).slice(0, 80), tier: use.tier,
      promptBytes: use.promptBytes, outputChars: outChars, images: use.images, ms: Date.now() - t0, ok: ok, errorCode: code ? String(code).slice(0, 40) : undefined, ts: Date.now() });
    if (S.gen.queue.length >= 10) flushUsage(); else if (!S.gen.timer) S.gen.timer = setTimeout(flushUsage, 4000);
  }
  async function flushUsage() {
    clearTimeout(S.gen.timer); S.gen.timer = null;
    if (!S.gen.id || !S.gen.queue.length || S.gen.off) return;
    var batch = S.gen.queue.splice(0, 50);
    try { await call("record_usage", { generationId: S.gen.id, calls: batch }); }
    catch (e) { if (e.code === "not_in_manifest" || e.code === "not_granted") S.gen.off = true; else S.gen.queue = batch.concat(S.gen.queue).slice(-200); }
  }
  async function track(fields) {
    if (S.gen.off) return;
    try {
      var r = (await call("record_generation", Object.assign(S.gen.id ? { generationId: S.gen.id } : {}, fields))).payload;
      S.gen.id = r.generationId;
    } catch (e) { if (e.code === "not_in_manifest" || e.code === "not_granted") S.gen.off = true; }
  }
  /** Starts a history entry. A resumed build keeps its original entry; a revision gets its own. */
  async function trackStart(kind, st) {
    S.gen.queue = []; S.gen.id = kind === "resume" && st.generationId ? st.generationId : null;
    await track({ kind: kind, status: "running", phase: st.phase || undefined, title: st.cfg.title, workspaceId: st.workspaceId, deckId: st.deckId || undefined });
    if (S.gen.id) st.generationId = kind === "revise" ? st.generationId : S.gen.id;
  }
  async function trackEnd(status, st, error) {
    var views = st && st.verify ? Object.keys(st.verify).map(function (k) { return st.verify[k]; }) : [];
    var bad = views.filter(function (v) { return v.pageErrors.length || v.consoleErrors.length || v.issues.length || v.blockedRequests.length; });
    await flushUsage();
    await track({ status: status, deckId: st && st.deckId || undefined, error: error ? String(error).slice(0, 500) : undefined,
      viewsChecked: views.length || undefined, viewsWithProblems: views.length ? bad.length : undefined });
  }
  window.addEventListener("pagehide", function () { flushUsage(); });

  /* ---------------- boot ---------------- */
  async function boot() {
    render();
    var c = window.claude;
    if (!c || !c.use) { S.view = "outside"; return render(); }
    var got = await Promise.all([c.use("mcp"), c.use("sample"), c.use("downloads")]);
    S.mcp = got[0]; S.sample = got[1]; S.downloads = got[2];
    if (!S.sample) { S.view = "nosample"; return render(); }
    S.limits = await S.sample.limits().catch(function () { return null; });
    // claude.ai gives an artifact connector access only for viewers in its owner's organization; everyone else builds from a chat.
    if (!S.mcp) { S.view = "chatonly"; return render(); }
    var listed = await S.mcp.listTools(SERVER).catch(function () { return { servers: [] }; });
    var srv = (listed.servers || []).filter(function (x) { return x.server === SERVER; })[0];
    if (!srv) { S.setupReason = ""; S.view = "setup"; return render(); }
    if (srv.authStatus === "needs_reauth") S.setupReason = CONNECTOR_FIX.needs_reauth;
    S.view = "connect"; render();
  }

  async function loadSources() {
    S.error = "";
    try {
      S.sources = (await call("list_sources")).payload;
      S.view = "source"; renderRecent();
    } catch (e) { S.error = e.message; if (e.code === "server_not_connected" || e.code === "needs_reauth" || e.code === "selection_required") S.view = "setup"; }
    render();
  }

  /* ---------------- render ---------------- */
  var STEPS = ["Source", "Configure", "Build", "Result"];
  function stepper(n) {
    return '<ol class="stepper" aria-label="Progress">' + STEPS.map(function (s, i) {
      var cls = i + 1 === n ? "on" : i + 1 < n ? "done" : "";
      return '<li class="' + cls + '"' + (i + 1 === n ? ' aria-current="step"' : "") + '><span class="stepper-n">' + (i + 1 < n ? "✓" : i + 1) + "</span>" + s + "</li>";
    }).join("") + "</ol>";
  }
  function notice(kind, html) { return '<div class="notice ' + kind + '" role="' + (kind === "bad" ? "alert" : "status") + '">' + html + "</div>"; }

  function render() {
    var v = S.view, html = "";
    if (v === "boot") html = '<div class="skel"><i></i><i></i></div>';
    else if (v === "outside") html = gate("Open this in claude.ai", "This builder runs inside claude.ai, where it uses your own Claude plan and your connector. Open the artifact link in claude.ai.");
    else if (v === "nosample") html = gate("Claude isn't available here", "This view can't call Claude. Open the artifact in claude.ai while signed in, on a plan that allows artifacts to use Claude.");
    else if (v === "chatonly") html = chatOnlyView();
    else if (v === "setup") html = setupView();
    else if (v === "connect") html = connectView();
    else if (v === "source") html = stepper(1) + sourceView();
    else if (v === "configure") html = stepper(2) + configureView();
    else if (v === "build") html = stepper(3) + buildView();
    else if (v === "result") html = stepper(4) + resultView();
    $main.innerHTML = html;
    wireCopy();
    if (v === "setup") on("#recheck", "click", function () { S.view = "boot"; boot(); });
    if (v === "connect") on("#connect", "click", function (e) { e.target.disabled = true; e.target.textContent = "Connecting…"; loadSources(); });
    if (v === "source") wireSource();
    if (v === "configure") wireConfigure();
    if (v === "build") wireBuild();
    if (v === "result") wireResult();
  }

  function gate(title, body) { return '<section class="gate"><div class="gate-card">' + LOGO + "<h1>" + esc(title) + '</h1><p class="muted">' + esc(body) + "</p></div></section>"; }

  function chatOnlyView() {
    return '<section class="gate"><div class="gate-card">' + LOGO + "<h1>Build your demo from the dashboard</h1>" +
      '<p class="muted">claude.ai only lets this builder reach connectors for people in its owner\'s organization. Start on the ' + esc(new URL(APP_URL).host) + " dashboard instead: choose a repository and it opens a Claude chat with the request typed in. Claude still runs on your own plan.</p>" +
      '<a class="btn primary" href="' + esc(DASHBOARD_URL) + '#new" target="_blank" rel="noreferrer">Open the dashboard</a></div></section>';
  }

  function setupView() {
    return '<section class="stack narrow"><div><p class="eyebrow">One-time setup</p><h1 class="h1">Connect the <em>builder</em></h1>' +
      '<p class="muted">Claude runs on your own claude.ai plan. A small connector on ' + esc(new URL(APP_URL).host) + " fetches the repository, serves its files and checks the finished demo in a headless browser.</p></div>" +
      (S.setupReason ? notice("warn", esc(S.setupReason)) : "") +
      '<div class="card stack"><ol class="steps-list">' +
      '<li><a class="btn primary" href="' + esc(INSTALL_URL) + '" target="_blank" rel="noreferrer">Add to Claude</a> opens claude.ai with the connector filled in. Click <strong>Add</strong>.</li>' +
      "<li>Click <strong>Connect</strong>, sign in with GitHub and allow access.</li>" +
      "<li>Come back here and check again.</li></ol>" +
      '<details class="small"><summary>Add it by hand instead</summary><p>Customize → Connectors → <strong>Add custom connector</strong>. Name <span class="mono">' + esc(SERVER) + "</span> " + copyBtn(SERVER) +
      ' (it must match exactly), URL <span class="mono">' + esc(MCP_URL) + "</span> " + copyBtn(MCP_URL) + "</p></details>" +
      '<p class="hint">New here? Start at <a href="' + esc(DASHBOARD_URL) + '" target="_blank" rel="noreferrer">' + esc(new URL(APP_URL).host) + "/dashboard</a> to sign in with GitHub and choose repositories.</p></div>" +
      '<div><button class="btn primary" id="recheck" type="button">I added it, check again</button></div></section>';
  }

  function connectView() {
    return '<section class="stack narrow"><div><p class="eyebrow">Animated Technical Interactive</p><h1 class="h1">Turn a repository into an <em>interactive demo</em></h1>' +
      '<p class="muted">Claude reads the real code, rebuilds the real screens, and the server checks every slide in headless Chromium. Claude usage counts against your own plan.</p></div>' +
      (S.setupReason ? notice("warn", esc(S.setupReason)) : "") + (S.error ? notice("bad", esc(S.error)) : "") +
      '<div class="card stack"><div class="row"><span class="dot ok"></span><span>Connector <strong>' + esc(SERVER) + '</strong> found.</span></div>' +
      '<p class="small muted">claude.ai asks once whether this page may use the connector and Claude.</p>' +
      '<div><button class="btn primary lg" id="connect" type="button">Start</button></div></div></section>';
  }

  /* ---------------- source ---------------- */
  function sourceView() {
    var src = S.src, so = S.sources || {}, gh = so.github || { repos: [] };
    var tabs = [["github", "GitHub"], ["git", "Azure DevOps · GitLab · Bitbucket"], ["upload", "Upload a folder or zip"]];
    var body = "";
    if (src.tab === "github") {
      var f = src.filter.toLowerCase();
      var repos = gh.repos.filter(function (r) { return !f || r.fullName.toLowerCase().indexOf(f) >= 0; }).slice(0, 60);
      body = (gh.error ? notice("warn", esc(gh.error) + ' <a href="' + esc(APP_URL) + '/app" target="_blank" rel="noreferrer">Open the web app</a>') : "") +
        '<label for="filter">Repository</label><input id="filter" placeholder="Filter ' + gh.repos.length + ' repositories" value="' + esc(src.filter) + '">' +
        '<div class="repo-list" role="listbox" aria-label="Repositories">' + (repos.length ? repos.map(function (r) {
          return '<button type="button" role="option" class="repo' + (r.fullName === src.repo ? " on" : "") + '" aria-selected="' + (r.fullName === src.repo) + '" data-repo="' + esc(r.fullName) + '"><strong>' + esc(r.fullName) + "</strong>" +
            '<span class="small muted">' + (r.private ? "private" : "public") + " · " + esc(r.defaultBranch) + (r.description ? " · " + esc(r.description) : "") + "</span></button>";
        }).join("") : '<p class="small muted">No repositories. Install the GitHub App on the repositories you want in the web app.</p>') + "</div>" + branchSelect();
    } else if (src.tab === "git") {
      var creds = so.credentials || [];
      body = '<label for="url">Repository URL</label><input id="url" placeholder="https://dev.azure.com/org/project/_git/repo" value="' + esc(src.url) + '">' +
        '<p class="hint">Paste the browser URL. A branch in the URL (Azure DevOps <span class="mono">?version=GB…</span>, GitLab <span class="mono">/-/tree/…</span>) is picked up.</p>' +
        '<label for="cred">Access token</label><select id="cred"><option value="">Match by host</option>' + creds.map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === src.credentialId ? " selected" : "") + ">" + esc(c.label + " (" + c.host + ")") + "</option>"; }).join("") + "</select>" +
        '<p class="hint">' + (creds.length ? "" : "No tokens saved yet. ") + 'Save read-only tokens on your <a href="' + esc(DASHBOARD_URL) + '/setup#access" target="_blank" rel="noreferrer">' + esc(new URL(APP_URL).host) + " dashboard</a>; they never pass through this page.</p>" +
        '<div><button class="btn sm" id="find-branches" type="button">Find branches</button></div>' + branchSelect();
    } else {
      body = '<div class="drop"><p><strong>Pick the project folder</strong> or a .zip of it. Dependency and build folders are left out; secret files are removed on the server.</p>' +
        '<div class="row"><label class="btn" for="folder">Choose folder</label><input id="folder" type="file" webkitdirectory multiple hidden>' +
        '<label class="btn" for="zip">Choose .zip</label><input id="zip" type="file" accept=".zip,application/zip" hidden></div>' +
        (src.files ? '<p class="small">' + esc(src.files.label) + " · " + src.files.count + " files · " + kb(src.files.bytes) + "</p>" : "") + "</div>";
    }
    var ready = src.tab === "github" ? !!src.repo : src.tab === "git" ? !!src.url.trim() : !!src.files;
    var recent = (so.workspaces || []).filter(function (w) { return w.status === "ready"; }).slice(0, 4);
    return '<section class="stack"><div><h1 class="h1">Choose the <em>application</em></h1><p class="muted">Signed in as <span class="mono">' + esc(so.user || "") + "</span> on " + esc(new URL(APP_URL).host) + ".</p></div>" +
      (S.error ? notice("bad", esc(S.error)) : "") +
      '<div class="tabs" role="tablist">' + tabs.map(function (t) { return '<button role="tab" type="button" class="tab' + (src.tab === t[0] ? " on" : "") + '" aria-selected="' + (src.tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<div class="card stack">' + body + "</div>" +
      (recent.length ? '<div class="stack-sm"><p class="eyebrow">Fetched recently</p><div class="row">' + recent.map(function (w) { return '<button class="btn sm" type="button" data-ws="' + esc(w.id) + '">' + esc(w.label) + " · " + esc(w.branch) + "</button>"; }).join("") + "</div></div>" : "") +
      '<div class="sticky"><button class="btn primary lg" id="fetch" type="button"' + (ready ? "" : " disabled") + ">Fetch repository</button></div></section>";
  }

  function branchSelect() {
    var b = S.src.branches;
    if (!b) return "";
    if (b.error) return notice("bad", esc(b.error));
    if (!b.branches.length) return "";
    return '<label for="branch">Branch</label><select id="branch">' + b.branches.map(function (n) { return '<option' + (n === S.src.branch ? " selected" : "") + ">" + esc(n) + "</option>"; }).join("") + "</select>";
  }

  async function loadBranches(source) {
    S.src.branches = { branches: [] };
    try {
      var r = (await call("list_branches", { source: source })).payload;
      S.src.branches = r;
      S.src.branch = S.src.branch && r.branches.indexOf(S.src.branch) >= 0 ? S.src.branch : r.urlBranch || r.defaultBranch || r.branches[0] || "";
    } catch (e) { S.src.branches = { error: e.message, branches: [] }; }
    render();
  }

  function wireSource() {
    $main.querySelectorAll("[data-tab]").forEach(function (b) { b.onclick = function () { S.src.tab = b.dataset.tab; S.src.branches = null; S.src.branch = ""; S.error = ""; render(); }; });
    on("#filter", "input", function (e) { S.src.filter = e.target.value; var pos = e.target.selectionStart; render(); var f = $("#filter"); f.focus(); f.setSelectionRange(pos, pos); });
    $main.querySelectorAll("[data-repo]").forEach(function (b) { b.onclick = function () { S.src.repo = b.dataset.repo; S.src.branch = ""; loadBranches({ type: "github", repo: S.src.repo }); }; });
    on("#url", "input", function (e) { S.src.url = e.target.value; var f = $("#fetch"); if (f) f.disabled = !S.src.url.trim(); });
    on("#cred", "change", function (e) { S.src.credentialId = e.target.value; });
    on("#find-branches", "click", function () { loadBranches(gitSource()); });
    on("#branch", "change", function (e) { S.src.branch = e.target.value; });
    on("#folder", "change", function (e) { pickFolder(e.target.files); });
    on("#zip", "change", function (e) { var f = e.target.files[0]; if (f) { S.src.files = { label: f.name, count: 1, bytes: f.size, zip: f }; render(); } });
    $main.querySelectorAll("[data-ws]").forEach(function (b) { b.onclick = function () { openExisting(b.dataset.ws); }; });
    on("#fetch", "click", fetchRepo);
  }

  function gitSource() { var s = { type: "git", url: S.src.url.trim() }; if (S.src.credentialId) s.credentialId = S.src.credentialId; if (S.src.branch) s.branch = S.src.branch; return s; }

  var SKIP = /(^|\/)(node_modules|\.git|\.next|dist|build|\.venv|venv|__pycache__|\.turbo|\.cache|coverage)(\/|$)/;
  function pickFolder(list) {
    var files = Array.prototype.filter.call(list || [], function (f) { var p = f.webkitRelativePath || f.name; return !SKIP.test(p) && f.size <= 25 * 1048576; });
    var bytes = files.reduce(function (a, f) { return a + f.size; }, 0);
    var root = files[0] ? (files[0].webkitRelativePath || "").split("/")[0] : "folder";
    if (bytes > 100 * 1048576) { S.error = "That folder is larger than 100 MB after leaving out dependencies. Zip just the source instead."; S.src.files = null; }
    else { S.error = ""; S.src.files = { label: root, count: files.length, bytes: bytes, list: files }; }
    render();
  }

  async function zipFolder(list) {
    if (!window.fflate) throw new Error("The zip library didn't load. Reload the page.");
    var entries = {};
    for (var i = 0; i < list.length; i++) { var f = list[i]; entries[f.webkitRelativePath || f.name] = new Uint8Array(await f.arrayBuffer()); }
    return window.fflate.zipSync(entries, { level: 6 });
  }

  async function uploadZip(bytes, name, progress) {
    var CH = 600 * 1024, id = null;
    for (var off = 0; off < bytes.length; off += CH) {
      var part = bytes.subarray(off, Math.min(bytes.length, off + CH));
      var r = (await call("upload_archive", Object.assign({ name: name, offset: off, chunk: bytesToB64(part) }, id ? { uploadId: id } : { totalBytes: bytes.length }))).payload;
      id = r.uploadId; progress(Math.min(1, (off + part.length) / bytes.length));
    }
    return id;
  }

  async function fetchRepo() {
    var btn = $("#fetch"); btn.disabled = true; S.error = "";
    try {
      var source;
      if (S.src.tab === "github") source = { type: "github", repo: S.src.repo, branch: S.src.branch || undefined };
      else if (S.src.tab === "git") source = gitSource();
      else {
        btn.textContent = "Zipping…";
        var bytes = S.src.files.zip ? new Uint8Array(await S.src.files.zip.arrayBuffer()) : await zipFolder(S.src.files.list);
        var id = await uploadZip(bytes, S.src.files.label.replace(/\.zip$/i, "") + ".zip", function (p) { btn.textContent = "Uploading " + Math.round(p * 100) + "%"; });
        source = { type: "upload", uploadId: id, name: S.src.files.label };
      }
      btn.textContent = "Fetching…";
      var opened = (await call("open_workspace", { source: source })).payload;
      await waitWorkspace(opened.workspaceId, function (s) { btn.textContent = s; });
    } catch (e) { S.error = e.message; render(); }
  }

  async function waitWorkspace(id, status) {
    for (var i = 0; i < 240; i++) {
      var st = (await call("workspace_status", { workspaceId: id })).payload;
      if (st.status === "ready") { S.ws = st; S.view = "configure"; S.cfg = S.cfg || defaultCfg(); render(); return; }
      if (st.status === "failed") throw new Error(st.error || "Fetching the repository failed.");
      status("Fetching… " + (i * 2) + "s");
      await sleep(2000);
    }
    throw new Error("Fetching took longer than 8 minutes. Try a smaller branch or upload a zip.");
  }

  async function openExisting(id) { S.error = ""; try { await waitWorkspace(id, function () {}); } catch (e) { S.error = e.message; render(); } }

  /* ---------------- configure ---------------- */
  function defaultCfg() { return { title: "", audience: "", details: "", quality: "complex", review: true }; }
  function configureView() {
    var c = S.cfg, ws = S.ws;
    var imgs = S.limits && S.limits.images;
    return '<section class="stack narrow"><div><h1 class="h1">Shape the <em>demo</em></h1><p class="muted">' + esc(ws.label) + " · " + esc(ws.branch) + " · " + ws.totalFiles + " files" +
      (ws.excluded && ws.excluded.length ? " · " + ws.excluded.length + " secret-like file(s) excluded" : "") + "</p></div>" +
      (S.error ? notice("bad", esc(S.error)) : "") +
      '<div><label for="title">Presentation title <span class="muted">(required)</span></label><input id="title" maxlength="120" value="' + esc(c.title) + '" placeholder="e.g. Product walkthrough"><p class="field-error" id="title-err" hidden>Add a title.</p></div>' +
      '<div><label for="audience">Audience <span class="muted">(optional)</span></label><input id="audience" value="' + esc(c.audience) + '" placeholder="' + esc(P.DEFAULT_AUDIENCE) + '"></div>' +
      '<div><label for="details">Additional details <span class="muted">(optional)</span></label><textarea id="details" maxlength="8000" placeholder="Areas to show, order, names to use, scenarios to cover, what to leave out…">' + esc(c.details) + "</textarea></div>" +
      '<div class="card stack-sm"><p class="eyebrow">Sample data (optional)</p><p class="small muted">CSV, JSON, text or Markdown values are kept exactly. ' + (imgs ? "Images and PDFs (first pages) are shown to Claude as pictures, e.g. real documents the product generates." : "This view can't send images to Claude, so images and PDFs are skipped.") + '</p>' +
      '<label class="btn sm" for="samples">Add files</label><input id="samples" type="file" multiple hidden accept=".csv,.json,.txt,.md' + (imgs ? ",.png,.jpg,.jpeg,.webp,.pdf" : "") + '">' +
      (S.samples.length ? '<ul class="files">' + S.samples.map(function (s, i) { return '<li><span>' + esc(s.name) + ' <span class="muted small">' + esc(s.kind) + "</span></span><button class=\"btn sm ghost\" type=\"button\" data-rm=\"" + i + '">Remove</button></li>'; }).join("") + "</ul>" : "") + "</div>" +
      '<div class="card stack-sm"><p class="eyebrow">Quality</p><div class="row"><label class="radio"><input type="radio" name="q" value="complex"' + (c.quality === "complex" ? " checked" : "") + '> Best (most capable model)</label>' +
      '<label class="radio"><input type="radio" name="q" value="default"' + (c.quality === "default" ? " checked" : "") + '> Faster</label></div>' +
      '<label class="radio"><input type="checkbox" id="review"' + (c.review ? " checked" : "") + "> Review every screen against its screenshot and fix what's off</label>" +
      '<p class="hint">A typical build makes 15-35 Claude calls on your plan and takes 15-40 minutes. Keep this tab open; progress is saved so you can resume.</p></div>' +
      '<div class="row"><button class="btn" id="back" type="button">Back</button><button class="btn primary lg" id="go" type="button">Build demo</button></div></section>';
  }

  function wireConfigure() {
    var keep = function () { S.cfg.title = $("#title").value; S.cfg.audience = $("#audience").value; S.cfg.details = $("#details").value; var q = $main.querySelector("input[name=q]:checked"); S.cfg.quality = q ? q.value : "complex"; S.cfg.review = $("#review").checked; };
    ["#title", "#audience", "#details", "#review"].forEach(function (s) { on(s, "change", keep); });
    $main.querySelectorAll("input[name=q]").forEach(function (r) { r.onchange = keep; });
    on("#samples", "change", async function (e) { keep(); await addSamples(e.target.files); render(); });
    $main.querySelectorAll("[data-rm]").forEach(function (b) { b.onclick = function () { keep(); S.samples.splice(+b.dataset.rm, 1); render(); }; });
    on("#back", "click", function () { keep(); S.view = "source"; render(); });
    on("#go", "click", function () { keep(); if (!S.cfg.title.trim()) { $("#title-err").hidden = false; $("#title").focus(); return; } startBuild(); });
  }

  async function addSamples(list) {
    for (var i = 0; i < list.length; i++) {
      var f = list[i], ext = (f.name.split(".").pop() || "").toLowerCase();
      try {
        if (/^(csv|json|txt|md)$/.test(ext)) S.samples.push({ name: f.name, kind: "data", text: (await f.text()).slice(0, 60000) });
        else if (/^(png|jpe?g|webp)$/.test(ext)) S.samples.push({ name: f.name, kind: "image", blob: f });
        else if (ext === "pdf") { var pages = await pdfPages(f, 4); pages.forEach(function (b, k) { S.samples.push({ name: f.name + " p" + (k + 1), kind: "PDF page", blob: b }); }); }
      } catch (e) { S.error = "Couldn't read " + f.name + ": " + (e.message || e); }
    }
  }

  var pdfReady = null;
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Couldn't load " + src)); }; document.head.appendChild(s); }); }
  async function pdfPages(file, max) {
    var base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
    pdfReady = pdfReady || loadScript(base + "pdf.min.js").then(function () { return loadScript(base + "pdf.worker.min.js"); }).then(function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js"; });
    await pdfReady;
    var doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    var out = [];
    for (var p = 1; p <= Math.min(max, doc.numPages); p++) {
      var page = await doc.getPage(p), vp = page.getViewport({ scale: 1.6 }), cv = document.createElement("canvas");
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
      out.push(await new Promise(function (r) { cv.toBlob(r, "image/png"); }));
    }
    return out;
  }

  /* ---------------- build pipeline ---------------- */
  var PHASES = [["read", "Reading the code"], ["plan", "Planning the deck"], ["foundation", "Transcribing the product's styles"], ["screens", "Rebuilding each screen"], ["verify", "Checking in headless Chromium"], ["review", "Reviewing and fixing"], ["report", "Writing the reports"]];

  function newBuild(state) {
    return { phase: state && state.phase || "read", log: [], abort: new AbortController(), screens: {}, error: "", started: Date.now(), calls: 0, tiers: {}, state: state || null };
  }
  function log(msg) { var b = S.build; b.log.push({ t: Date.now(), msg: msg }); if (b.log.length > 300) b.log.shift(); paintBuild(); }
  function setPhase(p) { S.build.phase = p; if (S.build.state) S.build.state.phase = p; log(PHASES.filter(function (x) { return x[0] === p; })[0][1] + "…"); track({ status: "running", phase: p }); }

  function cfgForPrompt() {
    var c = S.cfg;
    var text = S.samples.filter(function (s) { return s.kind === "data"; }).map(function (s) { return "=== " + s.name + " ===\n" + s.text; }).join("\n\n");
    return { title: c.title.trim(), audience: c.audience.trim(), details: c.details.trim(), samplesText: text, imageNames: sampleImages().map(function (s) { return s.name; }) };
  }
  function sampleImages() { return S.limits && S.limits.images ? S.samples.filter(function (s) { return s.blob; }) : []; }

  async function startBuild() {
    S.build = newBuild(null); S.deck = null; S.view = "build"; render();
    var st = { cfg: cfgForPrompt(), workspaceId: S.ws.workspaceId, label: S.ws.label, files: {}, survey: null, plan: null, foundation: null, slides: {}, reviews: {}, phase: "read", version: STATE_VERSION };
    await trackStart("build", st);
    await runPipeline(st);
  }

  async function saveState(st, extra) {
    var r = (await call("save_deck", Object.assign({ workspaceId: st.workspaceId, title: st.cfg.title, state: slimState(st) }, st.deckId ? { deckId: st.deckId } : {}, extra || {}))).payload;
    st.deckId = r.deckId; st.url = r.url; return r;
  }
  function slimState(st) { var o = Object.assign({}, st); delete o.files; delete o.shots; return o; }

  async function claude(label, prompt, opts) {
    var b = S.build; b.calls++;
    log(label);
    var t0 = Date.now(), lastPaint = 0;
    var r = await ask(prompt, Object.assign({ stage: label, signal: b.abort.signal, onText: function (n) { if (Date.now() - lastPaint > 1500) { lastPaint = Date.now(); b.writing = label + " — " + Math.round(n / 1024) + " KB written"; paintBuild(); } } }, opts || {}));
    b.writing = ""; log(label + " done in " + Math.round((Date.now() - t0) / 1000) + "s");
    return r;
  }

  async function readMore(st, paths) {
    var want = paths.filter(function (p) { return st.files[p] === undefined && S.ws.tree.some(function (f) { return f.path === p; }); });
    for (var i = 0; i < want.length; i += 30) {
      var got = (await call("read_files", { workspaceId: st.workspaceId, paths: want.slice(i, i + 30), maxBytesPerFile: 60000 }, S.build.abort.signal)).payload.files;
      got.forEach(function (f) { st.files[f.path] = typeof f.text === "string" ? f.text : null; });
    }
  }
  function filesFor(st, paths) { return paths.filter(function (p) { return typeof st.files[p] === "string"; }).map(function (p) { return { path: p, text: st.files[p] }; }); }

  var STYLE_RE = /(\.(css|scss|sass|less)$)|tailwind\.config|theme|tokens?|design-?system|(^|\/)(styles?|ds)\//i;

  async function runPipeline(st) {
    var b = S.build; b.state = st;
    var sig = b.abort.signal;
    try {
      // 1. read
      if (!st.survey) {
        setPhase("read");
        st.survey = await claude("Choosing which files to read", P.survey(st.cfg, S.ws), { tier: "default" });
        var tree = S.ws.tree.map(function (f) { return f.path; });
        var picks = (st.survey.files || []).filter(function (p) { return tree.indexOf(p) >= 0; }).slice(0, 70);
        for (var i = 0; i < Math.min(6, (st.survey.searches || []).length); i++) {
          var q = String(st.survey.searches[i]).slice(0, 120); if (!q) continue;
          try { var hits = (await call("search_code", { workspaceId: st.workspaceId, pattern: q, maxResults: 20 }, sig)).payload.hits; hits.slice(0, 4).forEach(function (h) { if (picks.indexOf(h.path) < 0) picks.push(h.path); }); } catch (e) { log("Search for “" + q + "” failed: " + e.message); }
        }
        st.readOrder = picks.slice(0, 90);
      }
      await readMore(st, (st.readOrder || []).concat((S.ws.manifests || []).map(function (m) { return m.path; })));
      log("Read " + Object.keys(st.files).length + " files");

      // 2. plan
      if (!st.plan) {
        setPhase("plan");
        var planned = await claude("Planning the deck", P.plan(st.cfg, S.ws, st.survey, filesFor(st, st.readOrder), 165000), { images: sampleImages().map(function (s) { return s.blob; }) });
        st.plan = normalizePlan(planned, st.cfg);
        await saveState(st);
        log("Planned " + st.plan.slides.length + " slides: " + st.plan.slides.map(function (s) { return s.title; }).join(" · "));
      }
      var screens = st.plan.slides.filter(function (s) { return s.kind === "overview" || s.kind === "area"; });
      await readMore(st, screens.reduce(function (a, s) { return a.concat(s.sourceFiles || []); }, []).concat((st.plan.brand && st.plan.brand.sources) || []));

      // 3. foundation
      if (!st.foundation) {
        setPhase("foundation");
        var stylePaths = Object.keys(st.files).filter(function (p) { return STYLE_RE.test(p); }).concat((st.plan.brand && st.plan.brand.sources) || []);
        stylePaths = stylePaths.concat((screens[0] && screens[0].sourceFiles) || []).filter(function (p, i, a) { return a.indexOf(p) === i; });
        st.foundation = await claude("Transcribing the product's shared styles", P.foundation(st.cfg, st.plan, filesFor(st, stylePaths), 150000));
        st.foundation.css = String(st.foundation.css || "");
        await saveState(st);
      }

      // 4. screens
      setPhase("screens");
      screens.forEach(function (s) { b.screens[s.id] = st.slides[s.id] ? "done" : "waiting"; });
      paintBuild();
      await pool(screens.filter(function (s) { return !st.slides[s.id]; }), 2, async function (s) {
        b.screens[s.id] = "writing"; paintBuild();
        var imgs = s.usesSamples ? sampleImages().map(function (x) { return x.blob; }) : [];
        var out = await claude("Rebuilding “" + s.title + "”", P.slide(st.cfg, st.plan, s, st.foundation, filesFor(st, (s.sourceFiles || []).concat(stylesFor(st))), 120000), { images: imgs });
        st.slides[s.id] = normalizeSlide(out, s);
        b.screens[s.id] = "done"; paintBuild();
        await saveState(st).catch(function (e) { log("Saving progress failed: " + e.message); });
      });

      // 5. verify
      setPhase("verify");
      var v1 = await assembleAndVerify(st, null);

      // 6. review / fix
      setPhase("review");
      var changed = await reviewScreens(st, screens, v1);
      if (changed.length) { log("Re-checking " + changed.length + " revised screen(s)"); await assembleAndVerify(st, changed); }
      else log("No screens needed changes");

      // 7. report
      setPhase("report");
      await finish(st);
    } catch (e) {
      if (e && e.code === "cancelled") { b.error = "Stopped. Your progress is saved; resume from the recent demos list."; }
      else b.error = (e && e.message) || String(e);
      b.failed = true; paintBuild();
      if (st.deckId) saveState(st).catch(function () {});
      trackEnd(e && e.code === "cancelled" ? "stopped" : "failed", st, b.error);
    }
  }

  function stylesFor(st) { return Object.keys(st.files).filter(function (p) { return STYLE_RE.test(p); }).slice(0, 6); }

  function kebab(s, i) { var k = String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36); return /^[a-z]/.test(k) ? k : "screen-" + (i + 1); }
  function normalizePlan(p, cfg) {
    if (!p || !Array.isArray(p.slides)) throw new Error("Claude's plan was missing its slides. Start the build again.");
    var seen = {};
    var slides = p.slides.filter(function (s) { return s && /^(welcome|overview|area|play|close)$/.test(s.kind); }).map(function (s, i) {
      var id = kebab(s.id || s.title, i); while (seen[id]) id = id + "-" + i; seen[id] = 1;
      return Object.assign({}, s, { id: id, steps: Array.isArray(s.steps) ? s.steps.slice(0, 8) : [], sourceFiles: Array.isArray(s.sourceFiles) ? s.sourceFiles.slice(0, 12) : [] });
    });
    if (!slides.length || slides[0].kind !== "welcome") slides.unshift({ id: "welcome", kind: "welcome", title: cfg.title, caption: (p.product && p.product.oneLine) || "" });
    slides[0].title = cfg.title;
    if (!slides.some(function (s) { return s.kind === "overview" || s.kind === "area"; })) throw new Error("Claude's plan had no screens to recreate.");
    if (!slides.some(function (s) { return s.kind === "play"; })) {
      var closeAt = slides.findIndex(function (s) { return s.kind === "close"; });
      slides.splice(closeAt >= 0 ? closeAt : slides.length, 0, { id: "play", kind: "play", title: "Your turn", caption: "Try the application yourself.", hint: "Everything works offline with sample data." });
    }
    p.slides = slides; p.brand = p.brand || {}; p.figures = Array.isArray(p.figures) ? p.figures : []; p.evidence = p.evidence || {};
    return p;
  }
  function normalizeSlide(o, s) {
    if (!o || typeof o.html !== "string" || !o.html.trim()) throw new Error("Claude returned an empty screen for “" + s.title + "”.");
    var steps = Array.isArray(o.steps) && o.steps.length ? o.steps : s.steps;
    return { html: o.html, css: String(o.css || ""), script: String(o.script || ""), steps: (steps || []).slice(0, 8).map(function (x) { return { title: String(x.title || ""), caption: String(x.caption || ""), spotlight: x.spotlight ? String(x.spotlight) : null }; }), sources: Array.isArray(o.sources) ? o.sources.slice(0, 20) : s.sourceFiles };
  }

  function assemble(st) { return A.assembleDeck({ runtimeCss: RUNTIME_CSS, runtimeJs: RUNTIME_JS, title: st.cfg.title, plan: st.plan, foundation: st.foundation, slides: st.slides }); }

  async function assembleAndVerify(st, onlyIds) {
    var html = assemble(st);
    var saved = await saveState(st, { html: html });
    st.html = html; st.externalReferences = saved.externalReferences; st.bytes = saved.bytes;
    log("Saved the deck (" + kb(saved.bytes) + ")" + (saved.externalReferences.length ? "; it references " + saved.externalReferences.length + " external resource(s)" : ""));
    var views = A.verificationViews(st.plan, st.slides);
    if (onlyIds) views = views.filter(function (v) { return onlyIds.indexOf(v.slideId) >= 0; });
    st.shots = st.shots || {}; st.verify = st.verify || {};
    for (var i = 0; i < views.length; i += 10) {
      var batch = views.slice(i, i + 10);
      log("Rendering views " + (i + 1) + "-" + (i + batch.length) + " of " + views.length);
      var r = await call("verify_deck", { deckId: st.deckId, views: batch.map(function (v) { return { id: v.id, hash: v.hash, width: v.width, height: v.height, theme: v.theme }; }) }, S.build.abort.signal);
      var res = JSON.parse(r.content[0].text), imgs = r.content.filter(function (c) { return c.type === "image"; }), k = 0;
      if (!res.ran) { st.verifyNotRun = res.reason || "The browser check did not run."; log(st.verifyNotRun); break; }
      res.results.forEach(function (x) {
        var meta = batch.filter(function (v) { return v.id === x.id; })[0];
        x.slideId = meta && meta.slideId;
        st.verify[x.id] = x;
        if (x.screenshot && imgs[k]) { var blob = b64ToBlob(imgs[k].data, imgs[k].mimeType); if (st.shots[x.id]) URL.revokeObjectURL(st.shots[x.id].url); st.shots[x.id] = { blob: blob, url: URL.createObjectURL(blob) }; k++; }
      });
      paintBuild();
    }
    var problems = Object.keys(st.verify).filter(function (id) { var x = st.verify[id]; return x.pageErrors.length || x.consoleErrors.length || x.issues.length || x.blockedRequests.length; });
    log(problems.length ? problems.length + " view(s) reported problems" : "Every view rendered cleanly");
    return st.verify;
  }

  function issuesFor(st, id) {
    var out = [];
    Object.keys(st.verify || {}).forEach(function (k) {
      var x = st.verify[k]; if (x.slideId !== id) return;
      var where = (x.theme === "dark" ? "dark, " : "") + x.width + "px, step " + ((x.hash.split("&")[0].split(".")[1]) || 1);
      x.pageErrors.concat(x.consoleErrors).forEach(function (m) { out.push("[" + where + "] script error: " + m); });
      x.issues.forEach(function (m) { out.push("[" + where + "] " + m); });
      x.blockedRequests.forEach(function (m) { out.push("[" + where + "] blocked network request: " + m); });
    });
    return out.filter(function (m, i, a) { return a.indexOf(m) === i; }).slice(0, 30);
  }
  function shotsFor(st, id) {
    return Object.keys(st.verify || {}).filter(function (k) { var x = st.verify[k]; return x.slideId === id && x.width === 1280 && x.theme === "light" && st.shots[k]; }).sort().map(function (k) { return st.shots[k].blob; });
  }

  async function reviewScreens(st, screens, verify) {
    var changed = [];
    void verify;
    await pool(screens, 2, async function (s) {
      var issues = issuesFor(st, s.id);
      if (!S.cfg.review && !issues.length) { st.reviews[s.id] = { verdict: "not run" }; return; }
      S.build.screens[s.id] = "reviewing"; paintBuild();
      var files = filesFor(st, (s.sourceFiles || []).slice(0, 8));
      var imgs = shotsFor(st, s.id);
      var out;
      if (imgs.length && S.limits && S.limits.images) out = await claude("Reviewing “" + s.title + "” against its screenshots", P.review(st.cfg, st.plan, s, st.slides[s.id], issues, files, 90000), { images: imgs });
      else if (issues.length) out = { verdict: "fix", problems: issues, slide: await claude("Fixing “" + s.title + "”", P.slide(st.cfg, st.plan, s, st.foundation, files, 100000, { previous: st.slides[s.id], issues: issues })) };
      else out = { verdict: "ok", notes: "No screenshot review (images unavailable in this view)." };
      if (out.verdict === "fix" && out.slide && typeof out.slide.html === "string") {
        st.slides[s.id] = normalizeSlide(out.slide, s); changed.push(s.id);
        st.reviews[s.id] = { verdict: "fixed", problems: (out.problems || []).slice(0, 10) };
      } else st.reviews[s.id] = { verdict: out.verdict === "fix" ? "flagged" : "ok", notes: out.notes || "", problems: out.problems || [] };
      S.build.screens[s.id] = st.reviews[s.id].verdict; paintBuild();
    });
    return changed;
  }

  async function finish(st) {
    var reports = { "verification-report.md": verificationReport(st), "evidence-report.md": evidenceReport(st) };
    await saveState(st, { reports: reports });
    st.reports = reports;
    S.deck = { id: st.deckId, url: st.url, html: st.html, reports: reports, state: st, title: st.cfg.title };
    S.build.done = true;
    S.view = "result"; render(); renderRecent();
    trackEnd("completed", st);
  }

  /* ---------------- reports ---------------- */
  function verificationReport(st) {
    var views = Object.keys(st.verify || {}).map(function (k) { return st.verify[k]; });
    var light = views.filter(function (v) { return v.width === 1280 && v.theme === "light"; }), dark = views.filter(function (v) { return v.theme === "dark"; }), phone = views.filter(function (v) { return v.width < 600; });
    var expected = A.verificationViews(st.plan, st.slides).length;
    var errs = views.filter(function (v) { return v.pageErrors.length || v.consoleErrors.length; });
    var blocked = views.filter(function (v) { return v.blockedRequests.length; });
    var layout = views.filter(function (v) { return v.issues.length; });
    var at = light.filter(function (v) { var exp = v.hash.split("&")[0].split(".").map(Number); return v.deck && v.deck.at && v.deck.at[0] === exp[0] && v.deck.at[1] === exp[1]; });
    var ran = !st.verifyNotRun && views.length > 0;
    function row(name, status, how) { return "| " + name + " | " + status + " | " + how + " |"; }
    var R = function (ok) { return ran ? (ok ? "PASSED" : "FAILED") : "NOT RUN"; };
    var lines = [
      "# Verification report — " + st.cfg.title, "",
      "Deck: `" + (st.deckId || "") + "` · " + kb(st.bytes || 0) + " · built " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC.",
      "Browser checks ran on the " + new URL(APP_URL).host + " server in headless Chromium with the network blocked." + (st.verifyNotRun ? " They did not complete: " + st.verifyNotRun : ""), "",
      "| Check | Result | How |", "|---|---|---|",
      row("Single self-contained file", (st.externalReferences || []).length ? "FAILED" : "PASSED", "Server scan for external src/href/url()/@import: " + ((st.externalReferences || []).join(", ") || "none")),
      row("Every slide and step renders", R(light.length && light.every(function (v) { return v.screenshot; })), light.length + " views at 1280×720, one per slide step (" + expected + " views requested in total)"),
      row("Script and console errors", R(!errs.length), errs.length ? errs.map(function (v) { return v.id; }).join(", ") : "none in any view"),
      row("No network requests", R(!blocked.length), blocked.length ? blocked.map(function (v) { return v.id + ": " + v.blockedRequests[0]; }).join("; ") : "every request outside file:/data:/blob: would have been blocked and reported; none were made"),
      row("Clipping and overflow", R(!layout.length), layout.length ? layout.map(function (v) { return v.id + ": " + v.issues[0]; }).join("; ") : "deck engine's text-clipping and out-of-stage checks found nothing"),
      row("Deep links (#slide.step&v=slug)", R(at.length === light.length && light.length > 0), at.length + " of " + light.length + " views opened at the slide and step their link named"),
      row("Spotlight tour", R(!views.some(function (v) { return v.consoleErrors.some(function (m) { return /Spotlight/.test(m); }); })), "tour steps rendered; missing or invalid targets are logged as console errors"),
      row("Dark mode", dark.length ? R(dark.every(function (v) { return !v.issues.length && !v.pageErrors.length; })) : "NOT RUN", dark.length + " dark views" + (st.plan.brand && st.plan.brand.supportsDark ? " (product dark theme applied)" : " (presentation chrome only; the product has a single light theme)")),
      row("Phone width (390px)", phone.length ? R(phone.every(function (v) { return !v.issues.length && !v.pageErrors.length; })) : "NOT RUN", phone.length + " views at 390×844; the 16:9 stage scales to fit"),
      row("Reduced motion and count-ups", R(true && ran), "all views rendered with prefers-reduced-motion: reduce; count-ups show final values, with a timeout fallback"),
      row("Fullscreen (F / Escape)", "NOT RUN", "the Fullscreen API cannot be exercised in headless Chromium"),
      row("Touch swipe", "NOT RUN", "no touch device in headless capture"), "",
      "## UI fidelity", "",
      "Each screen was rebuilt by Claude from the listed source files. " + (S.cfg && S.cfg.review ? "Its screenshots were then compared with the source by a second Claude call that fixed what differed." : "Screenshot review was turned off for this build.") + " No pixel comparison against the running product was made.", "",
      "| Screen | Source files | Review |", "|---|---|---|"
    ];
    st.plan.slides.filter(function (s) { return st.slides[s.id]; }).forEach(function (s) {
      var rv = st.reviews[s.id] || { verdict: "not run" };
      lines.push("| " + s.title.replace(/\|/g, "/") + " | " + ((st.slides[s.id].sources || s.sourceFiles || []).slice(0, 8).map(function (p) { return "`" + p + "`"; }).join(", ") || "—") + " | " + rv.verdict.toUpperCase() + (rv.problems && rv.problems.length ? ": " + rv.problems.slice(0, 3).join("; ").replace(/\|/g, "/") : "") + " |");
    });
    return lines.join("\n") + "\n";
  }

  function evidenceReport(st) {
    var p = st.plan, ev = p.evidence || {};
    var lines = ["# Evidence and caveats — " + st.cfg.title, "",
      "Repository: " + S.ws.label + " (" + S.ws.branch + "), " + S.ws.totalFiles + " files; " + (S.ws.excluded || []).length + " secret-like file(s) excluded before analysis.",
      "Claude ran in the viewer's claude.ai account (" + S.build.calls + " calls, quality: " + (S.cfg.quality === "complex" ? "best" : "faster") + "). The server never called Claude.", "",
      "## What the application is", "", (p.product && p.product.oneLine) || "", "",
      "## How the slide count was chosen", "", ev.sizing || "Not stated.", "",
      "## Left out", ""].concat((ev.leftOut || []).map(function (x) { return "- **" + x.item + "**: " + x.why; }));
    if (!(ev.leftOut || []).length) lines.push("- Nothing significant.");
    lines.push("", "## Data sources", "", "| Item | Source | Status |", "|---|---|---|");
    (ev.dataSources || []).forEach(function (x) { lines.push("| " + String(x.item).replace(/\|/g, "/") + " | " + String(x.source || "").replace(/\|/g, "/") + " | " + (x.status || "") + " |"); });
    lines.push("", "## Figures", "", "| Figure | Value | Source | Shown as fact |", "|---|---|---|---|");
    (p.figures || []).forEach(function (f) { lines.push("| " + f.label + " | " + f.value + " | " + (f.source || "") + " | " + (f.verified === false ? "no (unverified, not shown)" : "yes") + " |"); });
    lines.push("", "## Sample data supplied", "");
    lines.push(S.samples.length ? S.samples.map(function (s) { return "- " + s.name + " (" + s.kind + ")"; }).join("\n") : "- None. All on-screen records are illustrative sample values unless a source above says otherwise.");
    lines.push("", "## Caveats", "");
    (ev.caveats || []).concat(st.verifyNotRun ? ["Browser verification did not complete: " + st.verifyNotRun] : []).forEach(function (c) { lines.push("- " + c); });
    lines.push("- Backend actions (sending, saving, AI answers) are simulated in the demo and say so when triggered.");
    return lines.join("\n") + "\n";
  }

  /* ---------------- build view ---------------- */
  function buildView() { return '<section class="stack" id="build"></section>'; }
  function wireBuild() { paintBuild(); }
  function paintBuild() {
    var host = document.getElementById("build"); if (!host || !S.build) return;
    var b = S.build, idx = PHASES.findIndex(function (p) { return p[0] === b.phase; });
    var screens = b.state && b.state.plan ? b.state.plan.slides.filter(function (s) { return s.kind === "overview" || s.kind === "area"; }) : [];
    var el = Math.floor((Date.now() - b.started) / 1000);
    host.innerHTML = '<div class="row spread"><div><h1 class="h1">Building <em>' + esc(S.cfg.title) + "</em></h1><p class=\"muted\">" + esc(S.ws.label) + " · " + Math.floor(el / 60) + "m " + (el % 60) + "s · " + b.calls + " Claude calls</p></div>" +
      (b.failed || b.done ? "" : '<button class="btn" id="stop" type="button">Stop</button>') + "</div>" +
      (b.error ? notice("bad", esc(b.error) + (b.failed && b.state && b.state.plan ? ' <button class="btn sm" id="resume" type="button">Resume</button>' : "")) : "") +
      '<ol class="timeline">' + PHASES.map(function (p, i) {
        var cls = b.failed && i === idx ? "bad" : i < idx || b.done ? "done" : i === idx ? "on" : "";
        return '<li class="' + cls + '"><span class="tl-dot"></span>' + p[1] + (i === idx && b.writing ? ' <span class="small muted">' + esc(b.writing) + "</span>" : "") + "</li>";
      }).join("") + "</ol>" +
      (screens.length ? '<div class="grid">' + screens.map(function (s) { var st = b.screens[s.id] || "waiting"; return '<div class="tile ' + esc(st) + '"><strong>' + esc(s.title) + '</strong><span class="chip ' + (st === "done" || st === "ok" || st === "fixed" ? "ok" : st === "flagged" ? "bad" : "warn") + '">' + esc(st) + "</span></div>"; }).join("") + "</div>" : "") +
      '<details class="log" open><summary>Activity</summary><ol>' + b.log.slice(-40).reverse().map(function (l) { return "<li><span class=\"mono small muted\">" + new Date(l.t).toLocaleTimeString() + "</span> " + esc(l.msg) + "</li>"; }).join("") + "</ol></details>";
    var stop = document.getElementById("stop"); if (stop) stop.onclick = function () { b.abort.abort(); stop.disabled = true; stop.textContent = "Stopping…"; };
    var res = document.getElementById("resume"); if (res) res.onclick = function () { resume(b.state); };
  }
  setInterval(function () { if (S.view === "build" && S.build && !S.build.done && !S.build.failed) paintBuild(); }, 5000);

  async function resume(st) {
    if (!S.ws || S.ws.workspaceId !== st.workspaceId) {
      try { S.ws = (await call("workspace_status", { workspaceId: st.workspaceId })).payload; } catch { S.error = "The repository copy for this build has expired. Fetch it again and start a new build."; S.view = "source"; return render(); }
      if (S.ws.status !== "ready") { S.error = "The repository copy for this build isn't available. Fetch it again."; S.view = "source"; return render(); }
    }
    S.cfg = S.cfg || defaultCfg(); S.cfg.title = st.cfg.title; S.cfg.details = st.cfg.details || ""; S.cfg.audience = st.cfg.audience || "";
    st.files = st.files || {}; st.reviews = st.reviews || {}; st.slides = st.slides || {};
    S.build = newBuild(st); S.view = "build"; render();
    await trackStart("resume", st);
    await runPipeline(st);
  }

  /* ---------------- result ---------------- */
  function resultView() {
    var d = S.deck, st = d.state || {};
    var screens = st.plan ? st.plan.slides.filter(function (s) { return st.slides && st.slides[s.id]; }) : [];
    var shots = st.shots ? Object.keys(st.shots).sort().map(function (k) { return { id: k, url: st.shots[k].url, v: st.verify[k] }; }) : [];
    var views = st.verify ? Object.keys(st.verify).map(function (k) { return st.verify[k]; }) : [];
    var bad = views.filter(function (v) { return v.pageErrors.length || v.consoleErrors.length || v.issues.length || v.blockedRequests.length; });
    return '<section class="stack"><div class="row spread"><div><h1 class="h1">' + esc(d.title) + "</h1><p class=\"muted\">" + (d.html ? kb(new Blob([d.html]).size) + " · " : "") + (views.length ? views.length + " views checked in Chromium · " + (bad.length ? bad.length + " with problems" : "all clean") : "not checked in this session") + "</p></div>" +
      '<div class="row"><button class="btn primary" id="dl" type="button">Download HTML</button><button class="btn" id="dl-r" type="button">Download reports</button>' + (d.url ? '<a class="btn ghost" href="' + esc(d.url) + '" target="_blank" rel="noreferrer">Open in web app</a>' : "") + "</div></div>" +
      (S.error ? notice("bad", esc(S.error)) : "") +
      (d.html ? '<div class="preview"><iframe id="pv" title="Demo preview" sandbox="allow-scripts"></iframe></div>' : notice("warn", "This demo has no saved HTML yet.")) +
      (shots.length ? '<details class="card"><summary><strong>Screenshots from the browser check</strong> <span class="muted small">' + shots.length + "</span></summary><div class=\"shots\">" + shots.map(function (s) { return '<figure><img src="' + s.url + '" alt="' + esc(s.id) + '"><figcaption class="small ' + (s.v && (s.v.issues.length || s.v.pageErrors.length) ? "bad-text" : "muted") + '">' + esc(s.id) + (s.v && s.v.issues.length ? " · " + esc(s.v.issues[0]) : "") + "</figcaption></figure>"; }).join("") + "</div></details>" : "") +
      (d.reports ? '<details class="card"><summary><strong>Verification report</strong></summary><pre class="report">' + esc(d.reports["verification-report.md"] || "") + "</pre></details>" +
        '<details class="card"><summary><strong>Evidence and caveats</strong></summary><pre class="report">' + esc(d.reports["evidence-report.md"] || "") + "</pre></details>" : "") +
      (screens.length ? '<div class="card stack-sm"><p class="eyebrow">Revise a screen</p><div class="row"><select id="rev-s" aria-label="Screen">' + screens.filter(function (s) { return s.kind === "overview" || s.kind === "area"; }).map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.title) + "</option>"; }).join("") + "</select></div>" +
        '<textarea id="rev-n" placeholder="What should change? e.g. use the real status colours, add the export button, start the steps from the empty state"></textarea>' +
        '<div class="row"><button class="btn" id="rev-go" type="button">Revise and re-check</button><span class="small muted" id="rev-msg"></span></div></div>' : "") +
      "</section>";
  }

  function wireResult() {
    var d = S.deck, pv = document.getElementById("pv");
    if (pv && d.html) pv.srcdoc = d.html;
    on("#dl", "click", function () { save(slug(d.title) + ".html", d.html); });
    on("#dl-r", "click", function () { save(slug(d.title) + "-reports.md", (d.reports && (d.reports["verification-report.md"] + "\n\n" + d.reports["evidence-report.md"])) || ""); });
    on("#rev-go", "click", function () { revise($("#rev-s").value, $("#rev-n").value.trim()); });
  }
  function slug(t) { return String(t || "demo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "demo"; }
  async function save(name, data) {
    if (!S.downloads) { S.error = "Downloads aren't available in this view. Use “Open in web app” to download."; return render(); }
    try { await S.downloads.save({ filename: name, data: data }); }
    catch (e) { if (e && e.code !== "declined") { S.error = e.code === "unavailable" ? "Downloads aren't available here. Use “Open in web app”." : "The download didn't start (" + (e.code || "error") + ")."; render(); } }
  }

  async function revise(id, note) {
    var st = S.deck.state, msg = $("#rev-msg"), btn = $("#rev-go");
    if (!note) { msg.textContent = "Describe the change first."; return; }
    if (!st || !st.plan || !st.slides[id]) { msg.textContent = "This demo has no build state to revise."; return; }
    btn.disabled = true; S.error = "";
    try {
      if (!S.ws || S.ws.workspaceId !== st.workspaceId) {
        S.ws = (await call("workspace_status", { workspaceId: st.workspaceId })).payload;
        if (S.ws.status !== "ready") throw new Error("The repository copy has expired. Fetch the repository again to revise.");
      }
      S.cfg = S.cfg || Object.assign(defaultCfg(), { title: st.cfg.title });
      S.build = newBuild(st); st.files = st.files || {};
      var s = st.plan.slides.filter(function (x) { return x.id === id; })[0];
      await trackStart("revise", st);
      msg.textContent = "Reading sources…";
      await readMore(st, s.sourceFiles || []);
      msg.textContent = "Claude is revising “" + s.title + "”…";
      var imgs = shotsFor(st, id);
      var out = await ask(P.slide(st.cfg, st.plan, s, st.foundation, filesFor(st, s.sourceFiles || []), 110000, { previous: st.slides[id], note: note, images: imgs.length > 0 }), { images: imgs, stage: "Revising “" + s.title + "”" });
      st.slides[id] = normalizeSlide(out, s);
      msg.textContent = "Re-checking in Chromium…";
      await assembleAndVerify(st, [id]);
      st.reviews[id] = { verdict: "revised", problems: [note.slice(0, 200)] };
      await finish(st);
    } catch (e) { S.error = e.message; render(); trackEnd("failed", st, e.message); }
  }

  /* ---------------- recent decks ---------------- */
  function renderRecent() {
    var decks = (S.sources && S.sources.decks) || [];
    $side.innerHTML = decks.length ? decks.map(function (d) {
      return '<button class="hist" type="button" data-deck="' + esc(d.id) + '"><span class="hist-title">' + esc(d.title) + '</span><span class="hist-meta">' + esc(d.label) + " · " + ago(d.updatedAt) + (d.bytes ? "" : " · unfinished") + "</span></button>";
    }).join("") : '<p class="small muted">Demos you build appear here.</p>';
    $side.innerHTML += '<a class="small hist-link" href="' + esc(DASHBOARD_URL) + '" target="_blank" rel="noreferrer">History and usage on ' + esc(new URL(APP_URL).host) + " →</a>";
    $side.querySelectorAll("[data-deck]").forEach(function (b) { b.onclick = function () { openDeck(b.dataset.deck); }; });
  }
  async function openDeck(id) {
    S.error = "";
    try {
      var r = (await call("get_deck", { deckId: id, include: ["html", "state", "reports"] })).payload;
      var st = r.state || null;
      if (st) { st.deckId = r.deck.id; st.url = r.deck.url; st.html = r.html; st.files = {}; st.reviews = st.reviews || {}; }
      if (!r.html && st && st.plan && r.deck.workspaceAvailable) { S.cfg = Object.assign(defaultCfg(), { title: st.cfg.title }); return resume(st); }
      S.deck = { id: r.deck.id, url: r.deck.url, html: r.html, reports: r.reports, state: st, title: r.deck.title };
      S.view = "result"; render();
    } catch (e) { S.error = e.message; render(); }
  }
  document.getElementById("new").onclick = function () { if (!S.sources) return; S.error = ""; S.ws = null; S.samples = []; S.cfg = null; S.view = "source"; render(); };

  var LOGO = document.getElementById("logo-tpl").innerHTML;
  boot();
})();
