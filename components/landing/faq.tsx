const ITEMS = [
  ["Whose Claude usage does a build use?", "Yours. The build runs in a chat in your own claude.ai account, on your plan. This site never calls Claude. Your dashboard shows an estimate of each build's usage; claude.ai shows the exact figures."],
  ["Why does claude.ai ask before using the connector?", "claude.ai asks before each connector tool by default. Open the connector in claude.ai's connector settings and set its tools to Always allow, or choose Always allow the first time a build asks."],
  ["Does it change my repository?", "No. The GitHub App only has read access to contents and metadata. Nothing is committed, pushed or opened on GitHub, and the copy fetched for a build is deleted after 14 days without use."],
  ["Can Claude see my secrets?", "Files that look like secrets (.env, keys, credentials) are removed from the copy before Claude can read anything. Access tokens for Azure DevOps, GitLab and Bitbucket stay encrypted on this server and are never sent to Claude."],
  ["Are the numbers in the demo real?", "Every figure must trace to the repository. Anything that can't be verified is left out or clearly labelled as sample data."],
  ["What does verification check?", "Every slide and step is rendered in headless Chromium with the network switched off: script errors, clipped or overflowing text, network requests, dark mode and a phone-width view. Claude gets the screenshots to fix what differs from the code, and the results go into a verification report."],
  ["Which Claude model should I use?", "Pick Opus or Sonnet in the chat before pressing send. Rebuilding real screens from code is demanding work, and the stronger models copy the interface far more faithfully."],
  ["How long does a build take?", "It depends on the size of the app and the level of detail: a brief demo is quick, a detailed one takes longer. Your dashboard shows each stage while Claude works."],
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
