import { CreateProjectForm } from "@/components/create-project-form";

const features = [
  "Upload scripts, director's notes, subtitles, and audio references",
  "All materials are embedded into a searchable prose and sonic corpus",
  "Describe any scene to retrieve grounded evidence from your own materials",
  "Claude synthesizes a cue brief and 3 score variations via ElevenLabs",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#2f6d62,_#081714_52%,_#050807_100%)] px-6 py-10 text-stone-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between">
        <section className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-8">
            <div className="space-y-5">
              <p className="max-w-2xl text-sm uppercase tracking-[0.4em] text-emerald-200/70">
                Underscore
              </p>
              <h1 className="max-w-4xl text-5xl font-semibold leading-[0.92] tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
                Turn your creative corpus into a grounded film score.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-stone-200/78 sm:text-xl">
                Upload your scripts, notes, references, and voice direction.
                Underscore retrieves matching evidence from your materials and
                generates three score variations — grounded in what you already
                know this film needs.
              </p>
            </div>

            <CreateProjectForm />
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-black/20 p-6 shadow-2xl shadow-black/20 backdrop-blur">
            <p className="text-sm uppercase tracking-[0.3em] text-emerald-200/65">
              How it works
            </p>
            <ul className="mt-6 space-y-4">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 border-t border-white/8 pt-4 first:border-t-0 first:pt-0"
                >
                  <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-300" />
                  <span className="text-sm leading-6 text-stone-200/85">
                    {feature}
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
