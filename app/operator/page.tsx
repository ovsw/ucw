const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

const foundationChecks = [
  "App Router root and operator routes are mounted.",
  "Operator shell stays separate from the Parent-shaped answer canvas.",
  "GuideSite MVP execution code is not imported into client components.",
];

export default function OperatorPage() {
  return (
    <main className="operator-shell" aria-labelledby="operator-title">
      <section className="hero-panel">
        <p className="eyebrow">Operator Demo Surface</p>
        <h1 id="operator-title">GuideSite operator shell</h1>
        <p className="hero-copy">
          Foundation route for the operator-led Ultimate Camp Website demo. This slice only proves the
          Next.js App Router shell and keeps the guided answer loop out of the frontend until the
          application service boundary lands.
        </p>
      </section>

      <section className="surface-grid" aria-label="Demo surface foundation">
        <article className="answer-card" aria-labelledby="answer-preview-title">
          <div className="card-label">Parent-shaped answer canvas</div>
          <h2 id="answer-preview-title">Ready for the canonical journey</h2>
          <p>
            The first demo path will begin from the canonical prompt once the service layer connects the
            existing GuideSite run pipeline to this route.
          </p>
          <blockquote>{canonicalPrompt}</blockquote>
        </article>

        <aside className="operator-card" aria-labelledby="operator-inspection-title">
          <div className="card-label">Operator inspection</div>
          <h2 id="operator-inspection-title">Foundation checks</h2>
          <ul>
            {foundationChecks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        </aside>
      </section>
    </main>
  );
}
