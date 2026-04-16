# Underscore

**Turn your creative corpus into a grounded film score.**

Upload your scripts, director's notes, subtitles, and moodboards. Underscore retrieves matching evidence from your own materials, synthesizes a cue brief with Claude, and generates score variations and SFX via ElevenLabs — music that actually knows your film.

🔗 **[underscore-film.vercel.app](https://underscore-film.vercel.app)**

---

## How it works

1. **Build your corpus** — Upload PDF, TXT, Markdown, or SRT files in the Corpus tab. Every document is chunked, embedded with Gemini (`gemini-embedding-001`, 768d), and indexed into Turbopuffer across two per-project namespaces (prose + sonic).

2. **Auto scene extraction** — After ingestion, Claude reads the top corpus chunks and identifies 3 distinct dramatic moments, pre-filling the Score tab so you can start immediately.

3. **Describe a scene** — Type or select a pre-generated scene. Underscore runs 4 parallel queries against Turbopuffer: cosine vector search, BM25 full-text, director-notes-filtered vector, and a sonic namespace query. Results are fused with Reciprocal Rank Fusion (RRF).

4. **Generate score & SFX** — Claude synthesizes a cue brief (mood, tempo, instrumentation, key themes) grounded in retrieved evidence, then generates 3 music prompts and 2 SFX descriptions. ElevenLabs Music produces 3 score variants in parallel; ElevenLabs Sound Effects converts the SFX descriptions into 8-second ambient clips.

5. **Title track** — A single "Generate Title Track" button queries the full corpus, asks Claude for a 120-second film-arc prompt, and composes a full-length title cue via ElevenLabs Music.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| LLM | Claude `claude-opus-4-6` (Anthropic) |
| Embeddings | Gemini `gemini-embedding-001` (768d) |
| Vector DB | [Turbopuffer](https://turbopuffer.com) |
| Music generation | ElevenLabs Music (`composeDetailed`) |
| SFX generation | ElevenLabs Sound Effects (`textToSoundEffects`) |
| File storage | Vercel Blob (private) |
| Metadata store | Vercel KV |
| Deployment | Vercel |

---

## Local setup

### Prerequisites

- Node.js 18+
- Accounts: Anthropic, Google AI, Turbopuffer, ElevenLabs, Vercel

### 1. Clone and install

```bash
git clone https://github.com/ik-labs/underscore.git
cd underscore
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
# Google Gemini (embeddings)
GOOGLE_GENERATIVE_AI_API_KEY=

# Anthropic Claude
ANTHROPIC_API_KEY=

# Turbopuffer (vector DB)
TURBOPUFFER_API_KEY=

# ElevenLabs (music + SFX)
ELEVENLABS_API_KEY=

# Vercel Blob (audio storage)
BLOB_READ_WRITE_TOKEN=

# Vercel KV (project metadata)
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), create a project, and start uploading.

---

## Sample corpus

The `docs/` folder contains a ready-made corpus for the short film *The River* — use it to test the full pipeline immediately:

| File | Type |
|---|---|
| `docs/script.txt` | Screenplay |
| `docs/director-notes.md` | Director's notes |
| `docs/moodboard.txt` | Moodboard / tone references |
| `docs/subtitles.srt` | Subtitle file |

Upload all four files in the Corpus tab, then switch to Score to see auto-generated scenes and start scoring.

---

## Demo video

A 40-second Remotion demo video is in `video/`. To preview or re-render:

```bash
cd video
npm install
npx remotion studio src/index.ts   # preview at localhost:3000
npm run render                      # export video/out/underscore-demo.mp4
```

---

## API routes

| Route | Description |
|---|---|
| `POST /api/project` | Create a new project |
| `POST /api/ingest` | Ingest prose files into corpus |
| `POST /api/scenes` | Extract 3 dramatic scenes from corpus |
| `POST /api/score` | Retrieve + synthesize + generate score & SFX |
| `POST /api/title-track` | Generate 120s film-arc title cue |
| `GET /api/audio` | Proxy for private Vercel Blob audio |

---

## Built for

ElevenLabs AI Hackathon — ElevenHacks
