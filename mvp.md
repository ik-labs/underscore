# MVP v2: Underscore — The Filmmaker's Retrieval-Grounded Scoring Studio

**Hackathon:** ElevenHacks #4 (turbopuffer × ElevenLabs)
**Deadline:** Thursday, April 16, 17:00
**Build window:** ~48 hours

---

## The sharper pitch

A scoring tool for solo filmmakers that turns their project's own materials — scripts, director's notes, reference film subtitles, reference audio clips, **and their own voice describing what they want** — into the grounded prompt for ElevenLabs Music and SFX. The score doesn't come from a text box; it emerges from the filmmaker's creative universe.

## What changed from v1

1. **Stack is now fully Next.js + Vercel AI SDK + TypeScript.** No Python. Deploys to Vercel.
2. **Gemini Embedding replaces OpenAI** for text. Matryoshka-style variable dims mean we can tune cost vs quality.
3. **CLAP embeddings for audio** — both audio files and live browser recordings are first-class inputs.
4. **turbopuffer is used deeply**, not as a toy KV store: multi-namespace architecture, hybrid BM25+vector search, attribute filters, aggregations, cache warming.
5. **Voice-as-direction**: the filmmaker can hum, vocalize, or verbally describe the mood they want, and that audio becomes a retrieval query.

## The insight that drives the design

CLAP embeds text and audio into the **same vector space**. That means:

- A filmmaker's humming → CLAP embedding
- The phrase *"rain on a tin roof at 3am"* → CLAP embedding
- An uploaded audio reference clip → CLAP embedding

All live in one searchable space. The filmmaker can *describe in their voice* what a scene should feel like, and that query retrieves matching audio references from their corpus — even if those references were added as text descriptions, not audio. This is the capability that pushes the project from "retrieval + generation" into "multi-modal creative search."

Meanwhile, Gemini handles the prose side — script text, director's notes, interview transcripts — where dense semantic similarity matters more than audio-describability.

## ElevenLabs-specific generation strategy

Underscore should not treat ElevenLabs Music as a plain text box. For the MVP:

- Freeform prompts are for fast prototyping
- Composition plans are for final score generation
- Streaming is part of the UX, so the user hears progress quickly instead of waiting on a full blocking response

The grounded retrieval stack produces a structured cue brief:

- target feeling
- scene arc
- instrumentation hints
- pacing / BPM hints
- negative constraints ("no vocals", "avoid bright pop energy")

Claude converts that cue brief into one of two output modes:

1. **Fast mode:** plain text music prompt for quick iteration
2. **Score mode:** ElevenLabs composition plan JSON for the real demo flow

This makes the app feel more like a scoring tool and less like a generic prompt wrapper.

## Optional local build accelerators

If we want ElevenLabs-specific helpers available during implementation, add these skills locally:

```bash
npx skills add elevenlabs/skills --skill music
npx skills add elevenlabs/skills --skill sound-effects
```

Use `music` for the core score-generation path and `sound-effects` only for the stretch ambient / Foley layer.

## Two embedding spaces, cleanly separated

| Namespace | Embedding | Stores | Used for |
|---|---|---|---|
| `proj_{id}_prose` | Gemini Embedding (1536-dim) | Script chunks, director's notes, interview transcripts, moodboard prose | Semantic similarity on narrative/emotional content |
| `proj_{id}_sonic` | CLAP (512-dim) | Audio file chunks, browser recordings, short audio-describing text ("dry snare, room reverb") | Cross-modal audio-style search |

Two separate namespaces because the embeddings have different dimensionalities and different semantic purposes. When the user triggers "score this scene," the system fires a **multi-query** to both namespaces and fuses results.

## The user journey

1. **Maya** opens Underscore, creates a new project (*The River*).
2. She drags in her script PDF, 4 SRT subtitle files from reference films, a markdown file of director's notes, and 3 short audio clips — a field recording of a river, a piano phrase she likes, and a voice memo of her humming a melodic idea.
3. Progress UI shows parsing, chunking, embedding, upserting. The **corpus dashboard** appears — turbopuffer aggregations showing "2,847 prose chunks across 6 sources; 47 sonic chunks across 3 audio files." Emotional tag cloud. Source-type distribution.
4. She selects scene 7 from the script — the grief/river scene.
5. Before hitting "generate," she **clicks the mic button** and says into it: *"I want it to feel like the last thing she hears before going under is a memory of her brother laughing, and then silence."*
6. Underscore records her voice, embeds it with CLAP (her actual voice → sonic query), embeds the transcript with Gemini (her words → prose query), and fires a multi-query to turbopuffer:
   - Vector search in prose namespace on scene + voice transcript
   - Vector search in sonic namespace on voice audio embedding
   - BM25 search in prose namespace on proper nouns from the scene ("brother," "river")
   - Filtered lookup for director's notes near scene 7
7. turbopuffer returns ~15 fused results. The UI shows them in an **attribution panel**: "from Manchester by the Sea 00:42:11; from your piano_idea.wav at 00:04; from director's notes p.2; from The Tree of Life 01:14:22…"
8. A final Claude pass synthesizes these into a copyright-safe cue brief and structured ElevenLabs composition plans with three variations.
9. Three score options appear. Each has a "why this one" panel showing which retrieved chunks shaped it most.
10. Maya picks one, downloads it, ships her film.

## Why turbopuffer is carrying real weight here

This isn't "save embeddings, retrieve by similarity." Underscore uses turbopuffer as a proper search engine. Specifically:

**1. Multi-namespace for project isolation.** Each project gets two namespaces. No tenant-filter overhead, clean separation, unlimited projects without architectural cost. This is the native pattern turbopuffer recommends over filter-based tenancy.

**2. Hybrid search via multi-query API.** The "score this scene" button fires up to 6 parallel queries in a single request:
- Vector ANN on prose namespace (semantic narrative match)
- Vector ANN on sonic namespace (CLAP audio-style match)
- BM25 on prose namespace for extracted proper nouns (character names, place names)
- Filtered exact-match on `source_type=director_notes` near scene position
- Aggregation: group by `emotional_tags` to compute the corpus's mood centroid for this query
- Filtered lookup on most recent uploads (recency bias for tweaks)

Results fused client-side using reciprocal rank fusion. Six strategies in one round trip, under 50ms.

**3. Attribute indexing for sharp filtering.** Every chunk has:
- `source_file` (string, filterable)
- `source_type` (enum, filterable) — script, director_notes, subtitle, moodboard, audio_reference, voice_memo
- `emotional_tags` (array of strings, filterable with `AnyEq`)
- `sonic_signature` (string, BM25-indexed)
- `location_hint` (string)
- `page_num` / `timestamp_ms` (int, rank_by-able)
- `upload_ts` (int, filterable)

The user can drill down: "show me only retrievals from reference films, excluding my own voice memos" → filter `source_type IN [subtitle]`. This becomes a real control surface, not just a lookup.

**4. Aggregations for the corpus dashboard.** On project load:
- `COUNT grouped by source_type` → renders the sidebar stats
- `COUNT grouped by emotional_tags` with `ForEachUnique` → renders the emotion tag cloud
- These are single turbopuffer requests, not iterated client-side work.

**5. Cache warming on project open.** The moment a user opens a project, we call the warm-cache endpoint for both namespaces. By the time they click "score," retrieval is already hot. This visibly improves perceived performance.

**6. Regex filtering for advanced use.** Power-user feature: "find all lines in my subtitles matching `/she (whispered|sighed)/i`" → regex filter on the `text` attribute. Not core to MVP but shippable as a stretch goal for judges who inspect the tech.

## Core pipeline

### Ingestion

```
User uploads → Next.js API route
  → Parse by type:
      PDF → pdf-parse (text-only extraction)
      SRT → subtitles-parser (strip timing cruft, keep dialogue + timestamp map)
      TXT/MD → raw
      Audio → store to Vercel Blob, skip to CLAP step
  → Chunk text (~400 tokens, 40-token overlap)
  → Enrichment pass (Claude Sonnet via AI SDK):
      - emotional_tags: 2-5 short tags
      - sonic_signature: 1 sentence audio description
      (batched 20 chunks per call)
  → Embed:
      Prose chunks → Gemini Embedding (1536-dim)
      Audio chunks → CLAP via HF Inference API (512-dim)
      sonic_signature strings → ALSO CLAP-embedded and stored in sonic namespace
        (this cross-populates the sonic space with text-described audio)
  → Upsert to turbopuffer
      Prose → proj_{id}_prose
      Sonic → proj_{id}_sonic
  → Return counts for UI
```

### Retrieval

```
User action → scene text + optional voice memo
  → Embed scene text with Gemini (for prose namespace)
  → If voice memo: transcribe with Gemini + embed audio with CLAP
  → Claude extracts proper nouns from scene for BM25 terms
  → Multi-query to turbopuffer (up to 6 parallel sub-queries)
  → Reciprocal rank fusion → top 10-15 mixed results
  → Return with attribution metadata
```

### Generation

```
Fused chunks → Claude synthesis pass
  → Convert retrieved references into copyright-safe abstract descriptors
  → Build structured cue brief:
      - global style
      - negative style
      - section arc
      - duration targets
  → Three generation variants:
      - fast prompt-only prototype
      - composition-plan cinematic
      - composition-plan voice-memo-weighted
  → Parallel calls to ElevenLabs Music API
      - use streaming for user-facing progress
      - request detailed response metadata where available
  → Return three 45-second tracks
  → Attach attribution metadata to each (which chunks shaped which track)
  → Attach plan metadata to each ("why this one", section structure, style constraints)
```

## Web app structure

**Pages (Next.js App Router)**

- `/` — minimal landing with "Start a project"
- `/project/[id]` — main workspace (corpus + scoring in one view)
- `/project/[id]/score/[scoreId]` — detail view of one generated score with full attribution

**React components**

- `<CorpusUploader>` — drag-drop for PDF/TXT/MD/SRT/audio; shows upload progress
- `<AudioRecorder>` — browser MediaRecorder API, records 5-30 sec, previews, uploads
- `<CorpusDashboard>` — turbopuffer aggregations rendered as stats cards + tag cloud
- `<CorpusViewer>` — paginated list of chunks, filter by source_type, search by BM25
- `<SceneInput>` — paste scene text OR pick from extracted script scenes + optional voice memo button
- `<AttributionPanel>` — retrieved chunks with source badges, expandable to see full text
- `<ScoreResults>` — three audio players with waveform visualization, download buttons

**API routes**

- `POST /api/project` — create new project, return UUID
- `POST /api/ingest` — upload + parse + embed + upsert (streaming progress via AI SDK)
- `POST /api/score` — retrieve + synthesize cue brief + generate music (streaming status)
- `POST /api/embed-audio` — proxy to HF CLAP for browser-captured audio
- `GET /api/corpus/[id]/stats` — turbopuffer aggregations
- `GET /api/corpus/[id]/chunks` — paginated chunk listing with filter params

**State management**

- Server state: React Server Components + Next.js route cache (project metadata, corpus stats)
- Client state: React useState for UI (selected scene, retrieval results pre-generation)
- No database beyond turbopuffer. Project metadata stored in Vercel KV (project name, created_at, namespace IDs).

## Why this product is differentiated in the hackathon field

1. **Voice-as-query is unique.** No other submission will accept browser-recorded humming as a retrieval input. This is a direct consequence of CLAP's shared text-audio embedding space, and it turns the demo into something visceral — the filmmaker literally hums into the mic and gets a score back.

2. **Personal corpus framing.** Every other submission is indexing *someone else's* data (Freesound, Wikipedia, a public archive). Underscore indexes *the user's own creative materials*. That's a demonstrably new product category, not a remix of an old one.

3. **Heavy turbopuffer usage is visible.** Judges from turbopuffer will recognize multi-namespace architecture, multi-query API, aggregations, cache warming — and the dashboard UI *shows off* the aggregations in real-time. This signals "I read your docs and used your best features" in a way no flag-waving would.

4. **ElevenLabs Music gets structured conditioning, not just prompting.** Not "sad piano" but a retrieval-grounded cue brief converted into a composition plan with explicit section control. Judges from ElevenLabs will recognize this as a much more native use of their music stack.

## Build ordering (48 hours, revised)

**Day 1, morning (hours 1–5)**
- Scaffold Next.js 15 app with App Router, TypeScript, Tailwind
- Set up Vercel project, link GitHub repo for auto-deploys
- Install deps: `@ai-sdk/google`, `@anthropic-ai/sdk`, `@turbopuffer/turbopuffer`, `@elevenlabs/elevenlabs-js`, `pdf-parse`, `subtitles-parser`, `@vercel/blob`, `@vercel/kv`
- Optionally install local ElevenLabs helper skills: `music`, `sound-effects`
- Obtain keys: Gemini, Anthropic, turbopuffer (with $128 attendee credit), ElevenLabs Music access, HuggingFace Inference API
- Smoke test: hello-world embedding with Gemini, hello-world upsert to turbopuffer
- Smoke test: one minimal ElevenLabs music call and confirm detailed response path works

**Day 1, midday (hours 6–10)**
- Build ingestion pipeline end-to-end with **synthetic data**:
  - Claude generates fake script, fake director's notes, fake subtitle chunks
  - Full parse → chunk → enrich → embed (Gemini) → upsert (prose namespace)
  - Verify retrieval returns sensible results
- CLAP integration: embed one test audio clip via HF Inference API, upsert to sonic namespace

**Day 1, afternoon (hours 11–14)**
- Multi-query implementation: the 6-parallel-query fusion
- Claude cue-brief synthesis pass
- Copyright-safe style normalizer for all ElevenLabs-bound references
- ElevenLabs Music integration with 3 parallel generations
- Composition plan generation for final-score mode
- Streaming generation UX path
- First end-to-end: "scene text + voice memo → 3 audio files"

**Day 1, evening (hours 15–18)**
- Curate real demo corpus for *The River*:
  - Write the 2-page grief/river scene (or Claude writes, Maya refines)
  - Gather 4 real subtitle files from reference films (use OPUS sample path if needed, or download 4 specific SRT files from subscene/OpenSubtitles free tier)
  - Write 2-page director's notes
  - Find or record 3 short audio references (free CC field recordings work here — irony accepted since the hackathon's against Freesound crowding, but we're using audio not as corpus base but as user-uploaded refs)
- Re-run pipeline on real data; verify retrievals *feel* meaningful

**Day 2, morning (hours 19–24)**
- UI polish: corpus dashboard with turbopuffer aggregations
- Attribution panel with rich source rendering
- Audio recorder component with waveform preview
- Score result cards show plan summary / why-this-one explanation
- Style pass (Tailwind + shadcn/ui)

**Day 2, afternoon (hours 25–30)**
- Demo video recording (60–90 sec):
  - Cold open: blank project
  - Time-lapse upload
  - Dashboard showing corpus stats
  - Scene selection + voice memo ("I want it to feel like…")
  - Retrieval attribution panel reveal
  - Three score playback
  - Close with the picked score playing over the scene's script text visual
- Social posts across X, LinkedIn, Instagram, TikTok (+50 pts each per scoring rubric)
- Submission writeup with architectural diagram

**Day 2, evening (hours 31–36)**
- Buffer for bugs, polish, re-record if needed
- Submit before 17:00 Thursday

## Risks (updated for new stack)

**Risk: Vercel serverless timeouts on ingestion or generation.**
*Mitigation:* Use `export const maxDuration = 60` on ingestion routes (Pro tier). For music generation, stream progress back via AI SDK and run ElevenLabs calls via Promise.all so all three run in parallel under the timeout. If tight, move to Vercel Fluid Compute or use client-side polling.

**Risk: ElevenLabs Music access / plan limitations block the demo path.**
*Mitigation:* Validate Music API access in hour 1–5. Keep a fallback mode that generates only one track or uses prompt-only generation if composition-plan flow is unavailable.

**Risk: Copyrighted references trigger ElevenLabs prompt / composition-plan rejection.**
*Mitigation:* Add a normalization pass that converts direct film/song references into abstract musical descriptors before any ElevenLabs request. Never pass artist names, film titles, or copyrighted lyric fragments through to generation.

**Risk: HuggingFace Inference API is slow or rate-limited for CLAP.**
*Mitigation:* Fallback to Replicate API (has CLAP models too). Budget 3–5 sec per audio embed; not blocking since uploads happen pre-demo. For live voice memo, that's user-facing latency — cache warm the HF endpoint before the demo, and show a friendly "listening..." animation during the 3 sec.

**Risk: Gemini Embedding API quota/key constraints.**
*Mitigation:* User already has credits. Budget for 5,000 embeddings during demo prep + 1,000 for live demo = well within normal quota.

**Risk: turbopuffer schema rigidity.**
*Mitigation:* Noted from turbopuffer usage blog posts: schemas are evolving but changes are painful. Design the two namespace schemas once on Day 1 and don't change them. Include more attribute slots than you need.

**Risk: Voice memo UX feels gimmicky if CLAP retrieval isn't actually good.**
*Mitigation:* Test voice memo → sonic namespace retrieval early (Day 1 evening). If quality is weak, demote voice memo from hero feature to supporting feature, and lead the demo with text + prose retrieval.

**Risk: Demo corpus curation eats more time than budgeted.**
*Mitigation:* Hard-cap it at hour 18. If references aren't ready, use Claude-generated ones for director's notes only (fake text looks okay for ~200 words of director's notes in a 60-second demo); keep the subtitle files real (because those get screen time in the attribution panel).

## Cost estimate

- Gemini Embedding: ~$0.50 (embedding ~5,000 chunks at tier pricing)
- Anthropic Claude (enrichment + synthesis): ~$5
- HuggingFace Inference API (CLAP): free tier covers demo volume
- ElevenLabs Music: covered by free Creator attendee month
- turbopuffer: free + $128 attendee credit
- Vercel: free tier sufficient for a hackathon demo
- Vercel Blob (audio file storage): ~$0.10
- Vercel KV (project metadata): free tier

Total out-of-pocket: under $10.

## Non-goals (explicit)

- No user accounts or authentication
- No multi-project switcher in the UI (one project at a time, localStorage-tracked)
- No video upload or video-synced scoring
- No SFX generation in the main scoring flow (stretch goal only)
- No editing/iterating generated music (stretch goal)
- No mobile UI polish
- No support for file types outside PDF/TXT/MD/SRT/WAV/MP3

## Stretch goal: Sound effects layer

ElevenLabs Sound Effects is useful, but it should stay out of the core MVP path.

Good stretch use cases:

- Generate a loopable river-bed ambience for the scene page
- Generate a one-shot transition hit between cue sections
- Generate optional Foley-style textures ("distant water drip", "soft room tone", "underwater hush")

This should only ship if the music generation flow is already stable.

## What to name it

Working name: **Underscore**. Film-industry term for a musical bed under a scene; clean, short, plausibly available as a domain. Check `.io` and `.app` in hour 35.

Fallbacks: **Motif**, **Ground**, **Scorelab**.

## Architectural diagram (for submission writeup)

```
┌────────────────────────────────────────────────────────────────┐
│                    Next.js 15 (Vercel)                         │
│  ┌─────────────────┐       ┌──────────────────────────────┐    │
│  │ React Server    │       │ Client Components            │    │
│  │ Components      │       │ - CorpusUploader             │    │
│  │ (corpus stats)  │       │ - AudioRecorder              │    │
│  └────────┬────────┘       │ - AttributionPanel           │    │
│           │                │ - ScoreResults               │    │
│           │                └──────────┬───────────────────┘    │
│           │                           │                        │
│  ┌────────▼───────────────────────────▼────────────┐           │
│  │          API Routes (Route Handlers)            │           │
│  │  /api/project  /api/ingest  /api/score          │           │
│  │  /api/embed-audio  /api/corpus/[id]/*           │           │
│  └───────┬─────────────┬──────────┬────────────────┘           │
└──────────┼─────────────┼──────────┼────────────────────────────┘
           │             │          │
     ┌─────▼─────┐  ┌───▼──────┐  ┌▼──────────────┐
     │ Gemini    │  │ HF CLAP  │  │  Claude       │
     │ Embedding │  │ Inference│  │  (enrich +    │
     │  (prose)  │  │ (audio)  │  │   synth)      │
     └─────┬─────┘  └────┬─────┘  └───────┬───────┘
           │             │                │
           └─────────────┼────────────────┘
                         │
               ┌─────────▼────────────────────┐
               │      turbopuffer             │
               │   proj_{id}_prose (Gemini)   │
               │   proj_{id}_sonic  (CLAP)    │
               │   hybrid BM25 + vector       │
               │   aggregations + filters     │
               └──────────┬───────────────────┘
                          │
                          ▼
                  ┌──────────────────┐
                  │ ElevenLabs Music │
                  │   (3 parallel)   │
                  └──────────────────┘
```
