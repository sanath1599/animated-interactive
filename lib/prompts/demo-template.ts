/** Version-controlled presentation-generation task template. Placeholders: {{NAME}}. */
export const TEMPLATE_VERSION = "1.1.0";

export const DEMO_TEMPLATE = `# Generate a Faithful Interactive HTML Application Demo

Build a single-file interactive HTML presentation titled {{TITLE}} for {{AUDIENCE}}.

The presentation must be a guided, slide-by-slide demonstration of the real application in the selected GitHub repository.

## Inputs

**Application:** Read the actual source code in {{REPOSITORY_WORKSPACE}}.

Inspect the frontend components, CSS tokens, layout, actual pages and routes, navigation, real charts, tables, cards, typography, color palette, and supported themes before designing the presentation.

## UI fidelity: replicate the product exactly as it is

The interactive demo is a pixel-faithful replica of the product's real interface, not an interpretation of it. You are a transcriber, not a designer. Do not redesign, modernise, simplify, rebalance or "improve" anything.

1. **Source of truth.** Build every screen from the repository's own code: component markup and structure, class names and utility classes (resolve them to the actual CSS values from the Tailwind/CSS config), design tokens, global styles, and theme definitions. Read the component, then reproduce what it renders.
2. **Exact values.** Use the real colors, font families and weights, font sizes, line heights, spacing, border widths and radii, shadows, gradients, z-order, breakpoints and layout (grid/flex structure, sidebar and header dimensions, column widths). Copy hex/HSL/OKLCH values from the source; never approximate a color by eye.
3. **Exact content structure.** Use the real labels, headings, button text, navigation items and their order, table columns, filter options, form fields, placeholders, empty states, tooltips and error messages as written in the source. Do not rename, reword or reorder them. Data values may be sample data (see below) but the surrounding UI copy must be the product's own.
4. **Real iconography and branding.** Reproduce the real logo and every icon as inline SVG, matching the icon set the source uses (same glyphs, sizes, stroke widths, colors). Reproduce the real favicon-style marks and wordmarks.
5. **Fonts.** Use the same font families the product declares as the first choice in the font stack, followed by the product's own fallbacks, and then a close system fallback. Never load fonts from the network. If the font files exist in the repository and are small, embed them as base64; otherwise declare the real font name first so a machine that has it renders it exactly.
6. **All the states that the product has.** Hover, focus, active, selected, disabled, loading and empty states; light and dark themes where the product supports them; responsive layouts at the product's own breakpoints; real transitions and animations (duration, easing) as defined in the source.
7. **Real behavior, offline.** Interactive elements must behave as the product's do: tabs switch, menus open, filters filter, sorting sorts, forms validate, dialogs open and close, toggles toggle. Backend calls cannot happen, so drive these interactions from the sample data in the page, and never present a simulated backend action as real.
8. **No invention.** Do not add components, pages, features, charts or columns the source does not have, and do not remove ones it does. If something cannot be reproduced exactly (for example a third-party widget), reproduce its visible appearance and say so in the evidence report.
9. **Prove it.** For every screen you recreate, record the source files it was transcribed from. In the verification report, include a "UI fidelity" table with one row per recreated screen and component: the source file(s), the tokens and values copied, and what you compared. Compare your rendered screenshots against what the source code says the screen looks like (layout, colors, spacing, copy), and fix every difference you find. If you can only verify part of a screen, mark the rest NOT RUN rather than PASSED.

**Curated data:** {{SAMPLE_DATA_SECTION}}

If the user provides a curated table or dataset, that dataset takes precedence over conflicting telemetry for the same values. Preserve its figures, labels, date ranges, and units exactly.

If no dataset is provided, investigate appropriate local fixtures and verified data sources. Do not invent factual business metrics.

**Additional instructions:** {{ADDITIONAL_DETAILS_SECTION}}

**Optional data sources:** Identify relevant integrations from the application code. Use only local, read-only information. Do not contact remote infrastructure merely because configuration files name an endpoint. Do not expose credentials.

**Branding:** Infer the real logo, colors, fonts, and design system from the repository. Default to light mode unless the user explicitly requests something else.

**Output:** Save the generated standalone HTML to {{OUTPUT_HTML_PATH}}.

## Audience and content

The audience is {{AUDIENCE}}. Use plain business language instead of implementation terminology (for example "AI calls", "automated runs", "chat exchanges").

Maintain a positive, confident presentation without concealing material facts. Reword labels when appropriate, but never misstate an operational status or imply success that has not been verified.

Never invent or inflate real-world metrics. Every factual figure must trace to the curated dataset, repository evidence, or a verified read-only source. If a value cannot be verified, leave it out or label it clearly as illustrative.

## Slide structure

There is no fixed slide limit. Size the deck to the product: a small single-purpose app may need about six slides; a broad product with many pages, roles or workflows should get as many slides as it takes to cover its major areas faithfully (commonly ten to twenty, and more if the product truly warrants it). Cover every major area, page group, workflow and role the product actually has, in the order a new user would meet them. Do not pad with filler and do not leave a significant area out to keep the deck short. Explain in the evidence report how you decided the slide count and what you left out and why.

Use a 1280 x 720 presentation stage, scaled responsively to fit the viewport. The deck must contain, in this order:

1. **Welcome** - presentation title, a one-line promise that accurately describes the demonstrated application, and a prominent Start button.
2. **Application overview** - reproduce the actual overview or home page with its real layout and any verified hero metric, headline cards and use-case cards that exist. Include a spotlight tour: each step dims the surrounding page, highlights one real element, and shows a short plain-English caption, with working next/back controls.
3. **One showcase slide per major area of the product** (as many as needed, see above). Each one recreates a real page or workflow with its real layout: header, explanatory callouts, KPIs, charts, breakdowns, tables, forms, detail views. Choose areas that are distinct from one another, and for each say in a short caption what a user does there. Never invent components or metrics the source lacks. Where a page has several important states or tabs, show them as steps within the slide.
4. **Your turn** - the full demonstrated application made interactive: every page and navigation item you recreated, relevant controls, cards, filters and sorting, and light/dark mode when the source supports it. Add a small instructional hint banner. Every visible control must work. Do not simulate a live backend operation that cannot be performed by the static demo.
5. **Close** - a short, confident summary of what the application is already delivering, based on verified evidence only. No unsupported claims of savings, adoption or impact.

## Interaction requirements

- Left/right arrow slide navigation; F toggles fullscreen; Escape exits fullscreen; on-screen Next and Back controls; visible progress indicator; touch-swipe navigation.
- Deep links in the form \`#slide.step&v=slug\` (or an equivalent stable, documented hash structure).
- Working Start and tour navigation buttons.
- Count-up animations for supported numeric metrics, with a timeout fallback so they finish even when timers are accelerated.
- \`prefers-reduced-motion\` support.
- Dark mode where appropriate, with a working toggle on the interactive slide.
- Inline SVG charts only (area, bar, share lists as the verified data warrants). Sort dates correctly. Axis labels, legends, values and table content must be legible and never clipped.
- No external fonts, scripts, charting libraries, images or runtime resources. Inline the logo and icons as SVG or base64.

## Technical constraints

- One self-contained .html file. Keep it as small as fidelity allows: aim for under about 150 KB for a small product, and under about 500 KB for a large one. Fidelity to the real UI takes priority over file size.
- No external network requests from the presentation. No build step required to open it.
- Do not commit or push anything. Do not change any infrastructure. Do not expose secrets, connection strings or credentials.

## Verification requirements

Verify the generated HTML before finishing. Use headless Chrome or Chromium (if available in this environment) at 1280x720 and about 390px wide, with --virtual-time-budget and --force-prefers-reduced-motion where supported. Save screenshots of every slide (however many there are) and each spotlight-tour step into {{SCREENSHOTS_DIR}}, plus the dark theme and the narrow viewport for each distinct screen.

Check: the file exists and is self-contained; browser-console errors; overflow or clipping; slide navigation and deep links; spotlight tour advancement; dark mode; the narrow mobile viewport; count-up and reduced-motion safety for screenshots; and that every displayed factual figure matches the provided data and verified sources.

Do not blindly run repository scripts; do not run destructive commands. If Chrome or another verification dependency is unavailable, say exactly what could not be verified. Never claim a check passed unless you actually ran it.

## Final deliverables

- The primary HTML file at {{OUTPUT_HTML_PATH}}.
- Screenshots in {{SCREENSHOTS_DIR}}.
- A short verification report at {{VERIFICATION_REPORT_PATH}} (Markdown) listing each check as PASSED, FAILED or NOT RUN.
- An evidence and caveats report at {{EVIDENCE_REPORT_PATH}} (Markdown) listing data sources, figures that could not be confirmed, and tests that could not run.

Finish with a concise result summary that distinguishes completed work from checks that were blocked or unavailable.
`;
