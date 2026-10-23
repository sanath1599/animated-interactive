const ITEMS = [
  ["Does it change my repository?", "No. The GitHub App only has read access to Contents and Metadata. Nothing is committed, pushed, or opened on GitHub, and the working copy is deleted when the run ends."],
  ["Can it see my private code and secrets?", "It reads the repositories you choose. Files that look like secrets (.env, keys, credentials) are removed from the copy before Claude sees it, and the run happens in a locked-down container with no GitHub credentials."],
  ["Are the numbers in the demo real?", "Every figure must trace to your data or to the repository. Anything that can't be verified is left out or labelled illustrative. If you upload a table, its values are kept exactly as written."],
  ["What does verification actually check?", "Claude renders the presentation in headless Chrome and records each check as passed, failed, or not run. The result page shows that honestly, and the server separately confirms the file exists and loads nothing from the internet."],
  ["What can I upload as sample data?", "CSV, JSON, text, Markdown, Excel, and PNG, JPG, WebP or GIF screenshots, up to 10 MB each. Images are inspected visually, not just read as text."],
  ["How long does a run take?", "Usually a few minutes to around twenty, depending on the size of the app. You can watch each stage live, leave the page, and come back; progress is saved."],
];

export function Faq() {
  return (
    <div className="faq">
      {ITEMS.map(([q, a]) => (
        <details key={q}>
          <summary>{q}<span className="faq-plus" aria-hidden /></summary>
          <p>{a}</p>
        </details>
      ))}
    </div>
  );
}
