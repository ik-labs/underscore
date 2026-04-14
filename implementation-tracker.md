# Underscore Implementation Tracker

Derived from [mvp.md](/Users/himeshp/apps/hackthons/Underscore/mvp.md).

## Project Snapshot

- Project: Underscore
- Goal: Build a retrieval-grounded scoring studio for filmmakers using project prose, audio references, and voice direction
- Stack: Next.js 15, TypeScript, Vercel AI SDK, turbopuffer, Gemini Embeddings, CLAP, Claude, ElevenLabs
- Deadline: Thursday, April 16, 17:00
- Time budget: ~48 hours

## Tracking Rules

- Mark each task when complete: `[x]`
- Leave in progress items as: `[-]`
- Leave not started items as: `[ ]`
- Add blockers directly under the phase where they occur
- Do not expand scope beyond the MVP unless all phase exit criteria are satisfied

## Success Criteria

- A user can create a project and upload script, notes, subtitles, and audio
- The system ingests, enriches, embeds, and stores corpus data in turbopuffer
- A user can input scene text and optional voice memo
- Retrieval fuses prose and sonic signals with attribution
- The app generates 3 score variations through ElevenLabs using composition plans or a validated fallback
- The demo clearly shows why a generated result came back

## Phase 0: Setup And Technical Validation

**Goal:** Prove the stack and external services work before feature work starts.

**Deliverables**

- Running Next.js app with App Router and TypeScript
- Linked Vercel project
- All required API keys available in local and deployed environments
- First successful Gemini embedding and turbopuffer upsert

**Tasks**

- [x] Scaffold Next.js 15 app with TypeScript and Tailwind
- [x] Install core dependencies
- [ ] Optionally install ElevenLabs local helper skills:
  `npx skills add elevenlabs/skills --skill music`
  `npx skills add elevenlabs/skills --skill sound-effects`
- [ ] Configure environment variables for Gemini, Anthropic, turbopuffer, ElevenLabs, HuggingFace, Vercel Blob, and Vercel KV
- [ ] Link project to Vercel
- [x] Add a minimal landing page
- [ ] Run smoke test for Gemini embedding
- [ ] Run smoke test for turbopuffer namespace creation and upsert
- [ ] Confirm local dev and deployed preview both boot successfully

**Exit Criteria**

- Preview deployment works
- External API connectivity is verified
- No unresolved setup blockers remain

**Blockers / Notes**

- `npm run lint` and `npm run build` pass locally.
- Local dev server boots and serves the landing page.
- `npm run smoke:phase0` is implemented, but cannot complete until `GOOGLE_GENERATIVE_AI_API_KEY`, `TURBOPUFFER_API_KEY`, and `ELEVENLABS_API_KEY` are set in `.env.local` or the shell.
- `npx vercel` is available, but `npx vercel whoami` fails because the current Vercel token is invalid. Linking and preview deployment are blocked on a valid login.

## Phase 1: Project Model And Ingestion Foundation

**Goal:** Create the project lifecycle and ingest prose inputs end to end.

**Deliverables**

- Project creation flow
- `POST /api/project`
- `POST /api/ingest` with prose parsing and chunking
- Upserts into `proj_{id}_prose`

**Tasks**

- [x] Define project metadata shape in Vercel KV
- [x] Implement `POST /api/project`
- [x] Create workspace route: `/project/[id]`
- [x] Build upload entry UI for PDF, TXT, MD, and SRT
- [x] Parse PDF using `pdf-parse`
- [x] Parse SRT using `subtitles-parser`
- [x] Handle TXT and MD as raw text sources
- [x] Build chunking utility for ~400 token chunks with overlap
- [x] Define prose chunk schema for turbopuffer
- [x] Add enrichment pass for `emotional_tags` and `sonic_signature`
- [x] Embed prose chunks with Gemini
- [x] Upsert prose chunks into `proj_{id}_prose`
- [x] Return ingestion counts and progress states to UI

**Exit Criteria**

- A synthetic script, notes file, and subtitle file can be uploaded and indexed
- Corpus counts return correctly after ingestion
- Stored prose records include retrieval metadata and filterable attributes

**Blockers / Notes**

- Phase 1 UI, routes, parsing pipeline, enrichment fallback, Gemini embedding, and turbopuffer upsert path are implemented.
- `npm run lint` and `npm run build` pass with the Phase 1 code.
- `POST /api/project` and `/project/[id]` currently return controlled missing-env responses locally until `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and `KV_REST_API_READ_ONLY_TOKEN` are configured.
- Full ingest runtime validation still depends on `GOOGLE_GENERATIVE_AI_API_KEY` and `TURBOPUFFER_API_KEY`. Anthropic enrichment remains optional.

## Phase 2: Sonic Pipeline And Audio Input

**Goal:** Make audio references and voice memos first-class inputs in the sonic namespace.

**Deliverables**

- Audio upload path
- Vercel Blob storage for source audio
- CLAP embedding route
- Upserts into `proj_{id}_sonic`

**Tasks**

- [ ] Build audio upload handling for WAV and MP3
- [ ] Store uploaded audio in Vercel Blob
- [ ] Implement `POST /api/embed-audio`
- [ ] Define sonic chunk schema for turbopuffer
- [ ] Generate CLAP embeddings for uploaded audio
- [ ] CLAP-embed `sonic_signature` text to cross-populate sonic search
- [ ] Upsert sonic records into `proj_{id}_sonic`
- [ ] Add browser voice recording via MediaRecorder
- [ ] Upload recorded voice memos through the same pipeline
- [ ] Add basic audio preview playback in UI

**Exit Criteria**

- At least one uploaded audio file is searchable in sonic space
- A browser-recorded voice memo can be embedded successfully
- Audio records preserve source attribution metadata

**Blockers / Notes**

- 

## Phase 3: Retrieval Engine And Fusion

**Goal:** Build the query path that turns scene context and optional voice input into grounded retrievals.

**Deliverables**

- `POST /api/score` retrieval stage
- Multi-query execution against prose and sonic namespaces
- Reciprocal rank fusion
- Attribution payload for UI

**Tasks**

- [ ] Accept scene text and optional voice memo in score request
- [ ] Embed scene text with Gemini
- [ ] Transcribe voice memo for prose-side query support
- [ ] Embed voice memo audio with CLAP
- [ ] Extract proper nouns or salient search terms for BM25
- [ ] Query prose namespace with semantic vector search
- [ ] Query sonic namespace with CLAP vector search
- [ ] Query prose namespace with BM25 terms
- [ ] Add filtered lookup for nearby director's notes
- [ ] Add recency-biased lookup for recent uploads if helpful
- [ ] Implement reciprocal rank fusion
- [ ] Normalize result shape across sources
- [ ] Return top 10-15 mixed retrievals with attribution metadata

**Exit Criteria**

- A scene query returns relevant prose and sonic evidence
- Retrieved results clearly identify source file, source type, and location hint
- The retrieval response is stable enough for prompt construction

**Blockers / Notes**

- 

## Phase 4: Prompt Synthesis And Music Generation

**Goal:** Turn fused retrievals into useful grounded cue briefs and generate 3 audio options.

**Deliverables**

- Claude cue-brief synthesis pass
- Copyright-safe style normalization
- Prompt / composition-plan variants
- ElevenLabs generation integration
- Result payload with explanation data

**Tasks**

- [ ] Define structured retrieval-to-cue input
- [ ] Implement Claude cue-brief synthesis pass
- [ ] Add copyright-safe reference normalizer before every ElevenLabs request
- [ ] Define composition-plan schema mapper
- [ ] Generate three variants: fast prompt-only, cinematic composition-plan, voice-memo-weighted composition-plan
- [ ] Integrate ElevenLabs Music API
- [ ] Validate detailed response metadata path
- [ ] Run 3 generations in parallel
- [ ] Add streaming generation path for the UI
- [ ] Store returned audio URLs and metadata
- [ ] Attach "why this one" attribution references to each result
- [ ] Attach plan summary / section metadata to each result
- [ ] Handle failures and partial generation gracefully
- [ ] Stream generation status back to the UI

**Exit Criteria**

- One score request returns 3 playable results
- Each result includes enough explanation data for demo narration
- Composition-plan generation works for the primary demo path, or the fallback path is explicitly chosen
- Timeout handling is acceptable for the hackathon demo

**Blockers / Notes**

- 

## Phase 5: Core Product UI

**Goal:** Make the MVP usable and demoable in one workspace flow.

**Deliverables**

- Landing page
- Project workspace
- Corpus dashboard
- Attribution and score results UI

**Tasks**

- [ ] Build `/` landing page with project creation CTA
- [ ] Build `/project/[id]` main workspace
- [ ] Build `<CorpusUploader>`
- [ ] Build `<CorpusDashboard>`
- [ ] Build `<CorpusViewer>`
- [ ] Build `<SceneInput>`
- [ ] Build `<AudioRecorder>`
- [ ] Build `<AttributionPanel>`
- [ ] Build `<ScoreResults>`
- [ ] Build `/project/[id]/score/[scoreId]`
- [ ] Add loading, empty, and error states
- [ ] Add source-type filtering in corpus view
- [ ] Add BM25 search in corpus view
- [ ] Show plan summary / why-this-one details in score results
- [ ] Show streaming generation progress in score flow

**Exit Criteria**

- A user can go from upload to retrieval to playback in one session
- UI makes turbopuffer-backed attribution visible
- Demo flow can be executed without manual backend intervention

**Blockers / Notes**

- 

## Phase 6: Demo Corpus And Storyline

**Goal:** Prepare the actual data and narrative that will be shown to judges.

**Deliverables**

- Curated *The River* demo corpus
- Validated retrieval quality on real inputs
- Final demo script outline

**Tasks**

- [ ] Write or refine the grief/river script scene
- [ ] Prepare director's notes
- [ ] Gather 4 subtitle reference files
- [ ] Gather or record 3 short audio references
- [ ] Record at least 1 strong voice memo example
- [ ] Ingest the full real corpus
- [ ] Review retrieval quality for scene 7 or equivalent demo scene
- [ ] Adjust cue-brief synthesis if retrieval grounding feels weak
- [ ] Decide whether voice memo remains the hero feature in the demo
- [ ] Confirm all ElevenLabs-bound descriptors are copyright-safe abstractions

**Exit Criteria**

- Real corpus retrievals are meaningful enough to show judges
- Demo scene, retrieval evidence, and generation outputs feel coherent
- Weak references are removed before recording

**Blockers / Notes**

- 

## Phase 7: Polish, Submission, And Buffer

**Goal:** Convert the MVP into a submission-ready product without destabilizing it.

**Deliverables**

- Final UI polish
- Demo video
- Submission writeup
- Social posts

**Tasks**

- [ ] Add corpus stats cards and emotion tag cloud
- [ ] Warm turbopuffer cache on project open
- [ ] Improve attribution rendering for subtitles, notes, and audio
- [ ] Add waveform or lightweight audio visualization if time permits
- [ ] If time permits, add optional ambient SFX layer on result page only
- [ ] Record demo video
- [ ] Prepare architecture diagram for submission
- [ ] Write submission copy
- [ ] Prepare social post drafts
- [ ] Run final smoke test on deployed app
- [ ] Submit before deadline

**Exit Criteria**

- Hosted app works for the demo path
- Demo video and writeup match the built product
- Submission is complete before the deadline buffer is exhausted

**Blockers / Notes**

- 

## Cut Line If Time Slips

Cut these before touching the core demo path:

- [ ] Regex corpus filtering
- [ ] Advanced corpus viewer polish
- [ ] Multi-project switcher
- [ ] Optional ambient / Foley SFX layer
- [ ] Iterative editing of generated music
- [ ] Mobile-specific polish

## Risk Register

| Risk | Impact | Mitigation | Status |
|---|---|---|---|
| Vercel route timeouts on ingestion or generation | High | Use `maxDuration`, parallelize generation, fall back to polling if needed | [ ] |
| ElevenLabs Music access or plan limitations | High | Validate access on day 1 and keep prompt-only fallback ready | [ ] |
| ElevenLabs rejects copyrighted prompt material | High | Normalize references into abstract descriptors before generation | [ ] |
| HuggingFace CLAP latency or rate limits | High | Warm endpoint before demo and keep Replicate fallback ready | [ ] |
| Gemini quota or key issues | Medium | Verify quota on day 1 and keep smoke tests small | [ ] |
| turbopuffer schema changes mid-build | High | Finalize schema early and avoid churn | [ ] |
| Voice memo retrieval feels weak | Medium | Test early and demote if it hurts the demo | [ ] |
| Demo corpus curation overruns time | High | Hard-cap curation time and use synthetic fill-ins where acceptable | [ ] |

## API Checklist

- [ ] `POST /api/project`
- [ ] `POST /api/ingest`
- [ ] `POST /api/score`
- [ ] `POST /api/embed-audio`
- [ ] `GET /api/corpus/[id]/stats`
- [ ] `GET /api/corpus/[id]/chunks`

## UI Checklist

- [ ] `/`
- [ ] `/project/[id]`
- [ ] `/project/[id]/score/[scoreId]`
- [ ] `CorpusUploader`
- [ ] `AudioRecorder`
- [ ] `CorpusDashboard`
- [ ] `CorpusViewer`
- [ ] `SceneInput`
- [ ] `AttributionPanel`
- [ ] `ScoreResults`

## External Services Checklist

- [ ] Gemini Embeddings
- [ ] Anthropic Claude
- [ ] HuggingFace CLAP
- [ ] turbopuffer
- [ ] ElevenLabs Music
- [ ] ElevenLabs streaming generation
- [ ] Vercel Blob
- [ ] Vercel KV
- [ ] Vercel deployment

## Optional Local Skills

- [ ] `music` via `npx skills add elevenlabs/skills --skill music`
- [ ] `sound-effects` via `npx skills add elevenlabs/skills --skill sound-effects`

## Daily Standup Log

### Day 1

- Planned:
- Completed:
- Blocked:
- Decisions:

### Day 2

- Planned:
- Completed:
- Blocked:
- Decisions:

## Final Demo Readiness

- [ ] New project creation works
- [ ] Mixed corpus upload works
- [ ] Corpus stats render
- [ ] Scene selection or input works
- [ ] Voice memo recording works
- [ ] Retrieval attribution is understandable on screen
- [ ] Three generated tracks play correctly
- [ ] Plan summary / why-this-one panel is understandable on screen
- [ ] Download action works
- [ ] Hosted deployment is stable
- [ ] Demo script matches current product behavior
