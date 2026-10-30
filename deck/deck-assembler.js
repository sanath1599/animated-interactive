/* Builds a self-contained deck HTML file from the plan and the generated slides. Pure functions, loaded by
   lib/studio/chat-build.ts and by the Node tests (exposed as globalThis.DeckAssembler). */
(function (root) {
  "use strict";

  var ID_RE = /^[a-z][a-z0-9-]{0,39}$/;

  function stripComments(css) { return String(css || "").replace(/\/\*[\s\S]*?\*\//g, ""); }

  /** Splits CSS into top-level blocks: [{prelude, body}] where body is the text between the braces. */
  function blocks(css) {
    var out = [], i = 0, n = css.length;
    while (i < n) {
      var open = css.indexOf("{", i);
      if (open < 0) break;
      var prelude = css.slice(i, open).trim(), depth = 1, j = open + 1;
      while (j < n && depth) { var c = css[j]; if (c === "{") depth++; else if (c === "}") depth--; j++; }
      out.push({ prelude: prelude, body: css.slice(open + 1, j - 1) });
      i = j;
    }
    return out;
  }

  function scopeSelector(sel, scope) {
    return sel.split(",").map(function (s) {
      s = s.trim();
      if (!s) return s;
      if (/^(:root|html|body)$/i.test(s)) return scope;
      s = s.replace(/^(:root|html|body)(?=[\s.#\[:>~+])/i, scope);
      if (s.indexOf(scope) === 0) return s;
      // State hooks ([data-step="1"] .x, [data-theme=dark] .x, [data-mode=play] .x) attach to the frame itself, which carries them.
      var m = /^((?:\[data-(?:theme|mode|step)[^\]]*\]|\.dark)+)\s*(.*)$/.exec(s);
      if (m) return scope + m[1] + (m[2] ? " " + m[2] : "");
      return scope + " " + s;
    }).join(", ");
  }

  /** Prefixes every selector with `scope` so generated CSS cannot leak into the deck chrome or other slides. */
  function scopeCss(css, scope) {
    return blocks(stripComments(css)).map(function (b) {
      var p = b.prelude;
      if (/^@(media|supports|container|layer)\b/i.test(p)) return p + "{" + scopeCss(b.body, scope) + "}";
      if (/^@(keyframes|-webkit-keyframes|font-face|property|counter-style)\b/i.test(p)) return p + "{" + b.body + "}";
      if (/^@/.test(p)) return "";
      return scopeSelector(p, scope) + "{" + b.body + "}";
    }).join("\n");
  }

  /** Keeps generated markup inside its template: no scripts, external loads, or document-level tags. */
  function cleanHtml(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<\/?(template|html|head|body|base|meta|link|iframe|object|embed)\b[^>]*>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(src|href)\s*=\s*("|')\s*(?:https?:)?\/\/[^"']*\2/gi, '$1=$2#$2');
  }

  function escText(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function jsonForScript(o) { return JSON.stringify(o).replace(/</g, "\\u003c").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029"); }
  function scriptBody(s) { return String(s || "").replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--"); }

  function contrastInk(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return "#fff";
    var v = parseInt(m[1], 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111" : "#fff";
  }

  /**
   * opts: { runtimeCss, runtimeJs, title, plan, foundation: {css}, slides: {id: {html, css, script, steps}},
   *         byline, theme: "light"|"dark" (the only mode the deck shows) }
   * plan.slides: ordered [{id, kind: welcome|overview|area|play|close, eyebrow, title, caption, navLabel, steps, figures, points, hint}]
   */
  function assembleDeck(opts) {
    var plan = opts.plan, gen = opts.slides || {};
    var brand = plan.brand || {};
    var screens = plan.slides.filter(function (s) { return s.kind === "overview" || s.kind === "area"; });
    screens.forEach(function (s) { if (!ID_RE.test(s.id)) throw new Error("Invalid slide id: " + s.id); });

    var data = {
      title: opts.title,
      accent: brand.accent || "#2f62d8",
      accentInk: contrastInk(brand.accent),
      logo: brand.logoSvg ? cleanHtml(brand.logoSvg) : "",
      dataNote: plan.dataNote || "",
      byline: String(opts.byline || "").slice(0, 200),
      theme: opts.theme === "dark" ? "dark" : "light",
      playScreens: screens.filter(function (s) { return gen[s.id]; }).map(function (s) { return { id: s.id, label: s.navLabel || s.title }; }),
      slides: plan.slides.filter(function (s) { return (s.kind !== "overview" && s.kind !== "area") || gen[s.id]; }).map(function (s) {
        var g = gen[s.id] || {};
        var steps = (g.steps && g.steps.length ? g.steps : s.steps || []).map(function (st) {
          return { title: String(st.title || ""), caption: String(st.caption || ""), spotlight: st.spotlight ? String(st.spotlight) : null };
        });
        return {
          id: s.id, kind: s.kind, eyebrow: s.eyebrow || "", title: s.title || "", caption: s.caption || "",
          steps: s.kind === "overview" || s.kind === "area" ? steps : [],
          figures: s.kind === "close" ? (s.figures || plan.figures || []).filter(function (f) { return f && f.verified !== false; }) : undefined,
          points: s.kind === "close" ? s.points || [] : undefined,
          hint: s.kind === "play" ? s.hint || "" : undefined
        };
      })
    };

    var css = [opts.runtimeCss];
    if (opts.foundation && opts.foundation.css) css.push(scopeCss(opts.foundation.css, ".pf"));
    screens.forEach(function (s) { if (gen[s.id] && gen[s.id].css) css.push(scopeCss(gen[s.id].css, ".pf.sl-" + s.id)); });

    var templates = screens.filter(function (s) { return gen[s.id]; }).map(function (s) {
      return '<template id="tpl-' + s.id + '">' + cleanHtml(gen[s.id].html) + "</template>";
    }).join("\n");

    var scripts = screens.filter(function (s) { return gen[s.id] && gen[s.id].script; }).map(function (s) {
      return "window.__dkScripts[" + JSON.stringify(s.id) + "]=function(root,api){\"use strict\";\n" + scriptBody(gen[s.id].script) + "\n};";
    }).join("\n");

    return "<!doctype html>\n<html lang=\"en\"" + (data.theme === "dark" ? ' data-theme="dark"' : "") + "><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>" + escText(opts.title) + "</title>\n<style>\n" + css.join("\n") + "\n</style></head>\n<body>\n" +
      '<div id="dk-viewport"><div id="dk-stage" role="application" aria-roledescription="presentation">' +
      '<div class="dk-bar" id="dk-bar"><button class="dk-btn" id="dk-back" type="button">← Back</button>' +
      '<div class="dk-progress" aria-hidden="true"><i></i></div><span class="dk-count" id="dk-count"></span>' +
      '<button class="dk-btn" id="dk-fs" type="button" title="Full screen (F)">Full screen</button>' +
      '<button class="dk-btn primary" id="dk-next" type="button">Next →</button></div></div></div>' +
      '<div class="dk-rotate">Rotate your device for a larger view.</div>\n' + templates +
      '\n<script type="application/json" id="dk-data">' + jsonForScript(data) + "</script>\n" +
      "<script>window.__dkScripts={};\n" + scripts + "\n</script>\n<script>\n" + scriptBody(opts.runtimeJs) + "\n</script>\n</body></html>";
  }

  /** Views for headless verification: every slide and step at 1280×720 in the deck's one colour mode, plus phone-width samples. */
  function verificationViews(plan, gen, theme) {
    var mode = theme === "dark" ? "dark" : "light";
    var views = [], idx = 0;
    plan.slides.filter(function (s) { return (s.kind !== "overview" && s.kind !== "area") || gen[s.id]; }).forEach(function (s) {
      idx++;
      var g = gen[s.id] || {}, steps = (s.kind === "overview" || s.kind === "area") ? Math.max(1, (g.steps || s.steps || []).length) : 1;
      for (var n = 1; n <= steps; n++) views.push({ id: ("s" + idx + "-" + n + "-" + s.id).slice(0, 48), slideId: s.id, hash: idx + "." + n + "&v=" + s.id, width: 1280, height: 720, theme: mode });
    });
    var extra = [];
    var firstArea = views.filter(function (v) { return /-1-/.test(v.id) && plan.slides.some(function (s) { return s.id === v.slideId && s.kind === "area"; }); })[0];
    [views[0], firstArea, views.filter(function (v) { return plan.slides.some(function (s) { return s.id === v.slideId && s.kind === "play"; }); })[0]].forEach(function (v) {
      if (v) extra.push({ id: ("m-" + v.id).slice(0, 48), slideId: v.slideId, hash: v.hash, width: 390, height: 844, theme: mode });
    });
    return views.concat(extra);
  }

  var api = { scopeCss: scopeCss, cleanHtml: cleanHtml, assembleDeck: assembleDeck, verificationViews: verificationViews, contrastInk: contrastInk };
  root.DeckAssembler = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
