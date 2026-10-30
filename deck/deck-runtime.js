/* Deck runtime embedded in every generated presentation. Reads #dk-data, mounts each product screen from
   <template id="tpl-ID"> into a scaled 1280px canvas, and drives slides, steps, the spotlight tour, deep links
   (#slide.step&v=slug), keyboard/touch/fullscreen, count-ups and the verification hook window.__deck.
   The colour mode is fixed when the deck is built (D.theme); there is no theme switch. */
(function () {
  "use strict";
  var D = JSON.parse(document.getElementById("dk-data").textContent);
  var REG = window.__dkScripts || {};
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stage = document.getElementById("dk-stage");
  var slides = D.slides;
  var cur = { s: 0, n: 0 };
  var built = {};
  var playScreen = null;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function txt(tag, cls, t) { var e = el(tag, cls); e.textContent = t == null ? "" : String(t); return e; }
  function stepsOf(sl) { return sl.steps && sl.steps.length ? sl.steps.length : 1; }
  function slug(sl) { return sl.id; }
  if (D.accent) document.documentElement.style.setProperty("--dk-accent", D.accent);
  if (D.accentInk) document.documentElement.style.setProperty("--dk-accent-ink", D.accentInk);
  if (D.theme === "dark") document.documentElement.dataset.theme = "dark";

  /* ---------- product screen mounting ---------- */
  function mountScreen(frame, id, mode) {
    var tpl = document.getElementById("tpl-" + id);
    var canvas = el("div", "pf-canvas");
    var root = el("div", "pf sl-" + id);
    root.dataset.screen = id; root.dataset.mode = mode; root.dataset.step = "0";
    if (tpl) root.appendChild(tpl.content.cloneNode(true));
    canvas.appendChild(root); frame.appendChild(canvas);
    var listeners = [];
    var api = {
      mode: mode, root: root, step: 0,
      onStep: function (fn) { listeners.push(fn); try { fn(api.step); } catch (e) { console.error("[" + id + "] " + e.message); } },
      toast: toast,
      setStep: function (i) {
        api.step = i; root.dataset.step = String(i);
        for (var k = 0; k < listeners.length; k++) { try { listeners[k](i); } catch (e) { console.error("[" + id + "] " + e.message); } }
      }
    };
    function fit() {
      var w = frame.clientWidth, h = frame.clientHeight; if (!w || !h) return;
      var sc = w / 1280; canvas.style.transform = "scale(" + sc + ")"; canvas.style.height = (h / sc) + "px";
    }
    fit(); api.fit = fit;
    if (REG[id]) { try { REG[id](root, api); } catch (e) { console.error("[" + id + "] " + e.message); } }
    return { root: root, canvas: canvas, api: api, fit: fit };
  }

  /** Shrinks a clamped block's font until its text fits (down to `min` px). */
  function fitText(e, max, min) {
    e.style.fontSize = max + "px";
    for (var f = max; f > min && e.scrollHeight > e.clientHeight + 1; f -= 0.5) e.style.fontSize = (f - 0.5) + "px";
  }

  /* ---------- spotlight ---------- */
  function clearSpot(frame) { var o = frame.querySelectorAll(".dk-spot,.dk-bubble"); for (var i = 0; i < o.length; i++) o[i].remove(); }
  function spot(scr, frame, sel, step, idx, total, onNext, onBack) {
    clearSpot(frame);
    var t = null;
    if (sel) { try { t = scr.root.querySelector(sel); } catch { console.error("Invalid spotlight selector: " + sel); } }
    if (sel && !t) console.error("Spotlight target not found: " + sel);
    var x = 24, y = 24, w = 0, h = 0;
    if (t) {
      // "instant" overrides any scroll-behavior:smooth in the product CSS, so the target is measured where it ends up.
      try { t.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }); } catch { t.scrollIntoView(false); }
      var fr = frame.getBoundingClientRect(), r = t.getBoundingClientRect(), k = stage.getBoundingClientRect().width / 1280 || 1;
      x = (r.left - fr.left) / k; y = (r.top - fr.top) / k; w = r.width / k; h = r.height / k;
      var s = el("div", "dk-spot"), pad = 6;
      s.style.left = (x - pad) + "px"; s.style.top = (y - pad) + "px"; s.style.width = (w + pad * 2) + "px"; s.style.height = (h + pad * 2) + "px";
      frame.appendChild(s);
    }
    var b = el("div", "dk-bubble");
    b.appendChild(txt("h4", "", step.title)); b.appendChild(txt("p", "", step.caption));
    var row = el("div", "dk-row");
    row.appendChild(txt("span", "dk-count", (idx + 1) + " / " + total));
    var nav = el("span");
    var bk = txt("button", "dk-btn", "Back"); bk.disabled = idx === 0; bk.onclick = onBack;
    var nx = txt("button", "dk-btn primary", idx === total - 1 ? "Done" : "Next"); nx.onclick = onNext; nx.setAttribute("data-tour-next", "");
    nav.appendChild(bk); nav.appendChild(document.createTextNode(" ")); nav.appendChild(nx); row.appendChild(nav); b.appendChild(row);
    frame.appendChild(b);
    var fw = frame.clientWidth, fh = frame.clientHeight, bw = b.offsetWidth || 330, bh = b.offsetHeight || 150, g = 16, m = 12;
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(v, Math.max(lo, hi))); }
    function overlap(px, py) { var ox = Math.max(0, Math.min(px + bw, x + w + 6) - Math.max(px, x - 6)), oy = Math.max(0, Math.min(py + bh, y + h + 6) - Math.max(py, y - 6)); return ox * oy; }
    // Try right, left, below, above the target, then the frame's corners; take the first that leaves the target uncovered,
    // else the one covering least of it.
    var cands = !t ? [[m, m]] : [
      [x + w + g, clamp(y, m, fh - bh - m)], [x - bw - g, clamp(y, m, fh - bh - m)],
      [clamp(x, m, fw - bw - m), y + h + g], [clamp(x, m, fw - bw - m), y - bh - g],
      [fw - bw - m, m], [m, m], [fw - bw - m, fh - bh - m], [m, fh - bh - m]
    ];
    var best = null;
    for (var ci = 0; ci < cands.length; ci++) {
      var cx = cands[ci][0], cy = cands[ci][1];
      if (cx < m || cy < m || cx + bw > fw - m + 1 || cy + bh > fh - m + 1) continue;
      var ov = overlap(cx, cy);
      if (!best || ov < best.ov) best = { x: cx, y: cy, ov: ov };
      if (ov === 0) break;
    }
    if (!best) best = { x: m, y: m };
    var bx = best.x, by = best.y;
    b.style.left = bx + "px"; b.style.top = by + "px";
  }

  /* ---------- slide builders ---------- */
  function header(sl, node) {
    var h = el("div", "dk-head"), left = el("div");
    if (sl.eyebrow) left.appendChild(txt("p", "dk-eyebrow", sl.eyebrow));
    left.appendChild(txt("h2", "dk-title", sl.title));
    var cap = txt("p", "dk-caption", sl.caption || ""); cap.dataset.role = "caption"; left.appendChild(cap);
    h.appendChild(left);
    if (D.dataNote && sl.kind !== "welcome") h.appendChild(txt("div", "dk-note", D.dataNote));
    node.appendChild(h); return cap;
  }

  function buildWelcome(sl, node) {
    var c = el("div", "dk-cover");
    if (D.logo) { var lg = el("div", "dk-logo", D.logo); c.appendChild(lg); }
    if (sl.eyebrow) c.appendChild(txt("p", "dk-eyebrow", sl.eyebrow));
    c.appendChild(txt("h1", "", sl.title));
    c.appendChild(txt("p", "", sl.caption));
    if (D.byline) c.appendChild(txt("p", "dk-byline", D.byline));
    var go = txt("button", "dk-btn primary", "Start"); go.id = "dk-start"; go.onclick = function () { goTo(cur.s + 1, 0); };
    c.appendChild(go); node.appendChild(c); return {};
  }

  function buildClose(sl, node) {
    var c = el("div", "dk-cover"); c.style.gap = "16px";
    if (sl.eyebrow) c.appendChild(txt("p", "dk-eyebrow", sl.eyebrow));
    c.appendChild(txt("h1", "", sl.title));
    if (sl.caption) c.appendChild(txt("p", "", sl.caption));
    if (sl.figures && sl.figures.length) {
      var f = el("div", "dk-figs");
      sl.figures.forEach(function (x) {
        var t = el("div", "dk-fig"), b = txt("b", "", x.value);
        if (/^\d+(\.\d+)?$/.test(String(x.value))) { b.dataset.count = String(x.value); b.textContent = reduce ? String(x.value) : "0"; }
        t.appendChild(b); t.appendChild(txt("span", "", x.label)); if (x.source) t.appendChild(txt("small", "", x.source)); f.appendChild(t);
      });
      c.appendChild(f);
    }
    if (sl.points && sl.points.length) {
      var ul = el("ul", "dk-points");
      sl.points.forEach(function (p) { var li = txt("li", "", p.text); if (p.source) li.appendChild(txt("small", "", p.source)); ul.appendChild(li); });
      c.appendChild(ul);
    }
    node.appendChild(c); return {};
  }

  function buildScreen(sl, node) {
    var cap = header(sl, node);
    var body = el("div", "dk-body"); node.appendChild(body);
    var tour = sl.kind === "overview";
    var frame = el("div", "dk-frame " + (tour ? "full" : "with-steps")); body.appendChild(frame);
    var list = null;
    if (!tour) {
      list = el("div", "dk-steps"); list.appendChild(txt("h3", "", "Steps"));
      (sl.steps || []).forEach(function (st, i) {
        var b = el("button", "dk-step"); b.type = "button";
        b.appendChild(txt("b", "", i + 1)); b.appendChild(txt("span", "", st.title));
        b.onclick = function () { goTo(slides.indexOf(sl), i); };
        list.appendChild(b);
      });
      body.appendChild(list);
    }
    var scr = mountScreen(frame, sl.id, "present");
    return {
      fit: scr.fit,
      apply: function (n) {
        scr.fit(); scr.api.setStep(n);
        var st = (sl.steps || [])[n] || {};
        var bubble = tour || !!st.spotlight;
        // With a bubble the step text lives in the bubble; the header keeps the slide's own caption.
        cap.textContent = (bubble ? sl.caption : st.caption) || sl.caption || st.caption || "";
        fitText(cap, 14.5, 12);
        if (list) { var bs = list.querySelectorAll(".dk-step"); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", i === n); }
        var total = stepsOf(sl);
        if (bubble) spot(scr, frame, st.spotlight, st, n, total, function () { next(); }, function () { prev(); });
        else clearSpot(frame);
      }
    };
  }

  function buildPlay(sl, node) {
    header(sl, node);
    var body = el("div", "dk-body"); node.appendChild(body);
    var bar = el("div", "dk-play-bar"); body.appendChild(bar);
    var frame = el("div", "dk-frame full play"); body.appendChild(frame);
    var screens = D.playScreens || [];
    function show(id) {
      frame.innerHTML = ""; playScreen = mountScreen(frame, id, "play");
      var src = slides.filter(function (x) { return x.id === id; })[0];
      if (src && src.steps && src.steps.length) playScreen.api.setStep(src.steps.length - 1);
      var cs = bar.querySelectorAll(".dk-chip"); for (var i = 0; i < cs.length; i++) cs[i].classList.toggle("on", cs[i].dataset.id === id);
    }
    screens.forEach(function (s) { var c = txt("button", "dk-chip", s.label); c.type = "button"; c.dataset.id = s.id; c.onclick = function () { show(s.id); }; bar.appendChild(c); });
    var hint = txt("span", "dk-hint", sl.hint || "Everything here works offline with sample data."); hint.title = hint.textContent; bar.appendChild(hint);
    var first = false;
    return { fit: function () { if (playScreen) playScreen.fit(); }, apply: function () { if (!first && screens[0]) { first = true; show(screens[0].id); } else if (playScreen) playScreen.fit(); } };
  }

  function build(i) {
    if (built[i]) return built[i];
    var sl = slides[i], node = el("section", "dk-slide"); node.dataset.slide = String(i); node.setAttribute("aria-label", sl.title);
    stage.insertBefore(node, document.getElementById("dk-bar"));
    var b = sl.kind === "welcome" ? buildWelcome(sl, node) : sl.kind === "close" ? buildClose(sl, node) : sl.kind === "play" ? buildPlay(sl, node) : buildScreen(sl, node);
    b.node = node; built[i] = b; return b;
  }

  /* ---------- navigation ---------- */
  var total = slides.reduce(function (a, s) { return a + stepsOf(s); }, 0);
  function flatIndex(s, n) { var k = 0; for (var i = 0; i < s; i++) k += stepsOf(slides[i]); return k + n; }
  var bBack = document.getElementById("dk-back"), bNext = document.getElementById("dk-next"), prog = document.querySelector(".dk-progress i"), cnt = document.getElementById("dk-count");

  function countUp(node) {
    var els = node.querySelectorAll("[data-count]");
    for (var i = 0; i < els.length; i++) (function (e) {
      var to = parseFloat(e.dataset.count), dec = (e.dataset.count.split(".")[1] || "").length;
      if (reduce) { e.textContent = e.dataset.count; return; }
      var t0 = performance.now();
      function tick(t) { var p = Math.min(1, (t - t0) / 1200); e.textContent = (to * (1 - Math.pow(1 - p, 3))).toFixed(dec); if (p < 1) requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
      setTimeout(function () { e.textContent = e.dataset.count; }, 1600); // finishes even when timers are throttled
    })(els[i]);
  }

  function goTo(s, n, quiet) {
    s = Math.max(0, Math.min(slides.length - 1, s)); n = Math.max(0, Math.min(stepsOf(slides[s]) - 1, n || 0));
    var changed = s !== cur.s || !built[s];
    cur = { s: s, n: n };
    var b = build(s);
    for (var k in built) built[k].node.classList.toggle("on", +k === s);
    if (b.apply) b.apply(n);
    if (changed) countUp(b.node);
    var f = flatIndex(s, n);
    bBack.disabled = f === 0; bNext.disabled = f === total - 1;
    prog.style.width = ((f + 1) / total * 100) + "%";
    cnt.textContent = (s + 1) + " / " + slides.length + (stepsOf(slides[s]) > 1 ? " · " + (n + 1) + "/" + stepsOf(slides[s]) : "");
    if (!quiet) {
      var h = "#" + (s + 1) + "." + (n + 1) + "&v=" + slug(slides[s]);
      try { history.replaceState(null, "", h); } catch { /* sandboxed */ }
    }
  }
  function next() { var sl = slides[cur.s]; if (cur.n < stepsOf(sl) - 1) goTo(cur.s, cur.n + 1); else if (cur.s < slides.length - 1) goTo(cur.s + 1, 0); }
  function prev() { if (cur.n > 0) goTo(cur.s, cur.n - 1); else if (cur.s > 0) goTo(cur.s - 1, stepsOf(slides[cur.s - 1]) - 1); }
  bNext.onclick = next; bBack.onclick = prev;

  function toggleFs() {
    if (document.fullscreenElement) { if (document.exitFullscreen) document.exitFullscreen().catch(function () {}); }
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {});
  }
  document.getElementById("dk-fs").onclick = toggleFs;

  var tEl = null, tTimer = null;
  function toast(msg) { if (!tEl) { tEl = el("div", "dk-toast"); stage.appendChild(tEl); } tEl.textContent = msg; tEl.classList.add("on"); clearTimeout(tTimer); tTimer = setTimeout(function () { tEl.classList.remove("on"); }, 1800); }

  function typing(e) { var t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  addEventListener("keydown", function (e) {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    else if (e.key === "f" || e.key === "F") toggleFs();
    else if (e.key === "Escape" && document.fullscreenElement) document.exitFullscreen().catch(function () {});
  });
  var tx = null, ty = null;
  stage.addEventListener("touchstart", function (e) { if (e.target.closest && e.target.closest(".pf")) { tx = null; return; } tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (tx == null) return; var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty; tx = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) next(); else prev(); }
  }, { passive: true });

  function scale() {
    var vw = innerWidth, vh = innerHeight, k = Math.min(vw / 1280, vh / 720);
    stage.style.transform = "translate(-50%,-50%) scale(" + k + ")";
    for (var i in built) if (built[i].fit) built[i].fit();
  }
  addEventListener("resize", scale);

  function parseHash() {
    var h = location.hash.replace(/^#/, ""), m = /^(\d+)(?:\.(\d+))?/.exec(h);
    if (!m) return { s: 0, n: 0 };
    return { s: (+m[1] || 1) - 1, n: (+m[2] || 1) - 1 };
  }
  addEventListener("hashchange", function () { var p = parseHash(); goTo(p.s, p.n, true); });

  /* ---------- verification hook ---------- */
  function describe(e) {
    var p = []; var n = e;
    for (var i = 0; n && n !== stage && i < 4; i++, n = n.parentElement) p.unshift(n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\s+/).slice(0, 2).join(".") : ""));
    return p.join(" > ") + ' "' + (e.textContent || "").trim().slice(0, 40) + '"';
  }
  function check() {
    var node = built[cur.s] && built[cur.s].node, out = { clipped: [], outside: [] };
    if (!node) return out;
    var sr = stage.getBoundingClientRect(), k = sr.width / 1280;
    var chrome = node.querySelectorAll(".dk-title,.dk-caption,.dk-eyebrow,.dk-step,.dk-note,.dk-points li,.dk-fig,.dk-cover h1,.dk-cover p,.dk-bubble");
    for (var i = 0; i < chrome.length; i++) {
      var e = chrome[i], r = e.getBoundingClientRect();
      if (!r.width) continue;
      if (e.classList.contains("dk-caption")) { if (e.scrollHeight > e.clientHeight + 2) out.clipped.push(describe(e)); }
      else if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== "visible") out.clipped.push(describe(e));
      if (r.right > sr.right + 1 || r.bottom > sr.bottom + 1 || r.left < sr.left - 1 || r.top < sr.top - 1) out.outside.push(describe(e));
    }
    var pf = node.querySelector(".pf");
    if (pf) {
      var texts = pf.querySelectorAll("h1,h2,h3,h4,button,th,td,label,a,span,p,li");
      var pr = pf.getBoundingClientRect();
      for (var j = 0; j < texts.length && out.clipped.length < 25; j++) {
        var t = texts[j], cs = getComputedStyle(t);
        if (!t.offsetParent || !t.textContent.trim()) continue;
        if (t.scrollWidth > t.clientWidth + 2 && (cs.overflowX === "hidden" || cs.overflowX === "clip") && cs.textOverflow !== "ellipsis" && t.children.length === 0) out.clipped.push("product " + describe(t));
        var tr = t.getBoundingClientRect();
        if (tr.width && (tr.right > pr.right + 2 || tr.left < pr.left - 2) && t.children.length === 0) out.outside.push("product " + describe(t));
      }
    }
    if (k <= 0) out.outside.push("stage not laid out");
    return out;
  }

  window.__deck = {
    ready: false,
    slides: slides.map(function (s) { return { id: s.id, kind: s.kind, steps: stepsOf(s) }; }),
    position: function () { return [cur.s + 1, cur.n + 1]; },
    go: function (s, n) { goTo(s - 1, (n || 1) - 1); },
    check: check
  };

  scale();
  var p0 = parseHash();
  goTo(p0.s, p0.n, true);
  requestAnimationFrame(function () { scale(); goTo(cur.s, cur.n, true); window.__deck.ready = true; });
})();
