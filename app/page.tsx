const setupMilestones = [
  "Next.js app scaffolded",
  "Env contract defined",
  "Gemini + turbopuffer smoke tests",
  "ElevenLabs Music access validation",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#2f6d62,_#081714_52%,_#050807_100%)] px-6 py-10 text-stone-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between">
        <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.3em] text-stone-200/80">
              Phase 0 bootstrap
            </div>
            <div className="space-y-5">
              <p className="max-w-2xl text-sm uppercase tracking-[0.4em] text-emerald-200/70">
                Underscore
              </p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.92] tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
                Retrieval-grounded scoring for filmmakers.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-stone-200/78 sm:text-xl">
                Phase 0 establishes the app shell and validates the external
                stack before ingestion, retrieval, and score generation are
                wired in.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                className="rounded-full bg-stone-100 px-6 py-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-100"
              >
                Start a project
              </button>
              <span className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-stone-100/85">
                Tracker ready in repo
              </span>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/20 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-200/65">
              Phase 0 goals
            </p>
            <ul className="mt-6 space-y-4">
              {setupMilestones.map((milestone) => (
                <li
                  key={milestone}
                  className="flex items-start gap-3 border-t border-white/8 pt-4 first:border-t-0 first:pt-0"
                >
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="text-sm leading-6 text-stone-200/85">
                    {milestone}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}
