const ITEMS = [
  ["Does it work with ChatGPT?", "Yes. Add the connector as a custom MCP plugin in ChatGPT (Developer mode, on a paid plan), then choose ChatGPT when you start a demo. The setup page walks through it."],
  ["Whose AI usage does a build use?", "Yours. The build runs in a chat in your own Claude or ChatGPT account, on your plan. This site never calls an AI model. Your dashboard shows an estimate of each build's usage; Claude and ChatGPT show the exact figures."],
  ["Why does the assistant ask before using the connector?", "Both ask before connector actions by default. In claude.ai, set the connector's tools to Always allow. ChatGPT asks you to confirm each step that saves part of the demo; approve them as they come up."],
  ["Does it change my repository?", "No. The GitHub App only has read access to contents and metadata. Nothing is committed, pushed or opened on GitHub, and the copy fetched for a build is deleted after 14 days without use."],
  ["Can the assistant see my secrets?", "Files that look like secrets (.env, keys, credentials) are removed from the copy before the assistant can read anything. Access tokens for Azure DevOps, GitLab and Bitbucket stay encrypted on this server and are never sent to Claude or ChatGPT."],
  ["Are the numbers in the demo real?", "Every figure must trace to the repository. Anything that can't be verified is left out or clearly labelled as sample data."],
  ["What does verification check?", "Every slide and step is rendered in headless Chromium with the network switched off: script errors, clipped or overflowing text, network requests, dark mode and a phone-width view. The assistant gets the results (and screenshots where it can view them) to fix what differs from the code, and everything goes into a verification report."],
  ["Which model should I use?", "The most capable one you have: Opus or Sonnet in Claude, or ChatGPT's strongest reasoning model. Rebuilding real screens from code is demanding work, and stronger models copy the interface far more faithfully."],
  ["How long does a build take?", "It depends on the size of the app and the level of detail: a brief demo is quick, a detailed one takes longer. Your dashboard shows each stage while the assistant works."],
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
