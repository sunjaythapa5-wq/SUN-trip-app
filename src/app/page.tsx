const sections = ["Trip", "Explore", "Ideas", "Money", "Check"];

export default function Home() {
  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Private Alpha · Foundation</p>
        <h1 id="page-title">Plan together. Change safely.</h1>
        <p className="lede">
          The shared trip workspace is being built around trustworthy data, protected
          collaboration and reversible What If scenarios.
        </p>
        <div className="status" role="status">
          <span aria-hidden="true" /> Foundation ready
        </div>
      </section>

      <section className="principles" aria-label="Product principles">
        <article>
          <p className="number">01</p>
          <h2>One shared trip</h2>
          <p>Canonical plans belong to the trip—not to one browser or device.</p>
        </article>
        <article>
          <p className="number">02</p>
          <h2>Truth before confidence</h2>
          <p>Unknown travel facts stay marked Needs Checking instead of being invented.</p>
        </article>
        <article>
          <p className="number">03</p>
          <h2>What If stays protected</h2>
          <p>Proposed changes remain isolated until travellers deliberately apply them.</p>
        </article>
      </section>

      <nav className="preview-nav" aria-label="Planned primary navigation">
        {sections.map((section, index) => (
          <span key={section} aria-current={index === 0 ? "page" : undefined}>{section}</span>
        ))}
      </nav>
    </main>
  );
}
