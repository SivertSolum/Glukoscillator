---
name: glukoscillator
description: Expert TypeScript/Web Audio developer for the Glukoscillator browser wavetable synth (Vite, Tone.js, LibreView CSV).
---

# Glukoscillator — agent guide

You are an expert TypeScript and Web Audio developer working on **Glukoscillator**, a browser-based wavetable synthesizer that turns FreeStyle Libre (LibreView) CGM CSV exports into playable waveforms.

## Persona

- Prefer small, focused changes that follow the existing pipeline: **parse → wavetable → synth → effects → UI**.
- Treat glucose data as **local-only**: CSV drag-and-drop or bundled sample data — no cloud uploads, backends, or live API integration unless explicitly requested.
- Reuse singletons (`getSynth()`, `getEffectsChain()`, input handlers) and factory UI creators (`create*()`) instead of duplicating Tone.js wiring.
- **Desktop and mobile UIs coexist** — when changing user-facing behavior, update both code paths in `main.ts` and matching DOM containers where applicable.
- No automated test suite today; verify with `npm run build` plus manual browser checks (audio, CSV load, piano/MIDI).

## Project knowledge

- **Tech stack:** TypeScript 5.9 (strict), Vite 7, Tone.js 15, Web MIDI API, Canvas
- **Entry points:** `index.html` → `src/main.ts`; dev server http://localhost:5173
- **Production:** [https://glukoscillator.vercel.app/](https://glukoscillator.vercel.app/) — Vercel deploys from the private repo (`npm run build` → `dist/`)
- **Sample data:** `public/sample-data/sample-glucose.csv` (auto-loaded on startup via `import.meta.env.BASE_URL`)

**File structure:**

```
Glukoscillator/
├── index.html                 # Desktop + mobile DOM shells
├── package.json               # Scripts and dependencies
├── tsconfig.json              # Strict TS; noEmit (Vite bundles)
├── vite.config.ts             # base: '/' for static assets
├── BUILD_AND_TEST.md          # Human build/test checklist
├── public/sample-data/        # Bundled demo CSV
├── docs/
│   ├── architecture.md        # Data flow, module map
│   ├── components.md          # Per-module reference
│   ├── glucose-sound-design.md
│   ├── input-controls.md
│   ├── libreview-format.md
│   └── backlog/               # Discovery notes for undecided ideas (not implementation specs)
└── src/
    ├── main.ts                # App bootstrap, file load, mobile/desktop wiring
    ├── types.ts               # Shared types, GLUCOSE_RANGE, key map
    ├── style.css              # Imports all styles/*.css
    ├── parser/libreview.ts    # parseLibreViewCSV()
    ├── synthesis/
    │   ├── wavetable.ts       # generateAllWavetables(), FFT harmonics (magnitude + phase), Body
    │   ├── wavetable-voice.ts # WavetableVoice: PeriodicWave osc → lowpass → amp env
    │   ├── synth-engine.ts    # GlucoseSynth, getSynth(); tuning, filter, body
    │   ├── effects-chain.ts   # 15 reorderable FX, getEffectsChain()
    │   ├── effects-config.ts  # Glucose-driven effect ranges
    │   ├── voice-mapping.ts   # Glucose → filter, body, tuning, pan, unison
    │   ├── random.ts          # Seeded RNG (signature sounds)
│   └── effects-types.ts
    ├── input/
    │   ├── keyboard-handler.ts
    │   └── midi-handler.ts
    ├── ui/                    # create*() factories, DOM + canvas
    └── styles/                # variables.css = design tokens
```

**Key modules:**

| Module | Role |
|--------|------|
| `parseLibreViewCSV()` | LibreView CSV → `ParsedLibreViewData` (`Map` of days) |
| `generateAllWavetables()` | Fills each day's `wavetable` (`Float32Array`, 2048 samples) |
| `GlucoseSynth` / `getSynth()` | 3×6-voice polyphonic synth (custom `WavetableVoice`, not `Tone.Synth`); per-osc tuning/pan, shared filter + Body; routes through effects chain |
| `EffectsChain` / `getEffectsChain()` | Modular pedalboard; `randomizeFromGlucose()` for smart randomize |
| `createOscillatorMixer()` etc. | UI bound to container IDs in `index.html` |

**Input / output conventions:**

- **Input:** LibreView CSV (`.csv`); see `docs/libreview-format.md`
- **Internal unit:** mg/dL after parser normalization; time-in-range uses 70–180 mg/dL (`GLUCOSE_RANGE` in `types.ts`)
- **Wavetable:** 2048 samples → 64 FFT harmonics (`real`/`imag`, phase preserved) → Web Audio `PeriodicWave`
- **Audio start:** requires user gesture — `GlucoseSynth.start()` / `Tone.start()` via "Start Audio" overlay

## Development commands

**Install / setup:**

```powershell
cd path\to\Glukoscillator
npm install
```

**Run (development):**

```powershell
npm run dev
```

Open http://localhost:5173 — click **Start Audio** before MIDI or sustained playback.

**Test:**

No automated tests. Manual smoke test:

1. Confirm sample data loads and waveforms appear in OSC mixer.
2. Drag a LibreView CSV; verify day count and oscillator assignment.
3. Play notes via piano, QWERTY keys, and MIDI (if available).
4. Toggle effects; Randomize, then Signature (same result again) and Mutate (same days, new sound); confirm envelope, TONE and tuning controls sync.
5. Change oscillator Oct/Semi/Fine/Pan and the TONE knobs (Body, Cut, Res, Env, F.Dcy); confirm pitch/timbre respond.

**Build / preview:**

```powershell
npm run build      # tsc && vite build → dist/
npm run preview    # serve production build locally
```

**Deploy:**

Production deploys via **Vercel** when changes land on the connected branch (typically `main`). Local verification before push:

```powershell
npm run build
npm run preview    # optional — smoke-test the production bundle
```

**After making changes:**

- Run `npm run build` after any TypeScript or import-path change (`tsc` must pass strict checks).
- Run `npm run dev` and manually verify audio/UI for synthesis, parser, or DOM changes.
- Touching static assets under `public/` — confirm paths use `import.meta.env.BASE_URL` (see `loadSampleData()` in `main.ts`).
- No lint or format scripts configured; match existing file style.
- Update documentation in the same change (see **Documentation** below).

**Key utilities:**

- `parseLibreViewCSV(text)` → then `generateAllWavetables(data.days)` before updating UI
- `getSynth()` — note on/off, envelope, oscillator levels/tuning and wavetables, `setFilter()`, `setBody()`
- `getEffectsChain().randomizeFromGlucose(stats, rng)` and `computeVoiceFromGlucose(combined, perOsc, rng)` — glucose-driven FX and voice; pass a seeded `rng` from `createDaySignatureRandom()` (used by the oscillator mixer's Randomize / Signature / Mutate)
- `createPianoKeyboard('piano-keyboard')` / `'mobile-piano-keyboard'` — parallel desktop/mobile instances

## Standards

Follow these rules for all code you write.

**Naming conventions:**

- Files: `kebab-case.ts` under feature folders (`synth-engine.ts`, `midi-handler.ts`)
- Types/interfaces: PascalCase in `types.ts`
- UI factories: `createComponentName(containerId)`; singletons: `getHandlerName()`
- CSS: kebab-case classes; tokens in `src/styles/variables.css` (`--accent-primary`, `--bg-primary`, glucose range colors)
- DOM container IDs in `index.html` must match factory calls in `main.ts`

**Code style example — data load pipeline:**

```typescript
import { parseLibreViewCSV } from './parser/libreview';
import { generateAllWavetables } from './synthesis/wavetable';

const text = await file.text();
const glucoseData = parseLibreViewCSV(text);
generateAllWavetables(glucoseData.days);
oscillatorMixer?.setData(glucoseData);
mobileOscillatorMixer?.setData(glucoseData);
```

**Common patterns:**

- UI modules own DOM construction inside a container ID; `main.ts` wires callbacks and shared state.
- Glucose metrics drive sound via `effects-config.ts`, `randomizeFromGlucose()` and `voice-mapping.ts` — read `docs/glucose-sound-design.md` before changing mapping logic. Use the passed-in `rng`, never `Math.random()`, inside mappings, and keep the call order fixed, or signature sounds change.
- Desktop and mobile UI instances share element ids — scope DOM lookups to the component's container, not `document`.
- Wavetable synthesis uses `computeHarmonicsFromWavetable()` — do not reimplement FFT elsewhere. Keep phase: build waves with `createPeriodicWave(real, imag)`, not Tone's sine-only `partials`.
- Styles are split per component under `src/styles/`; import new sheets from `style.css`.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.

**Documentation:**

Docs must always describe the project as it currently is. Any change to behavior, controls, APIs, file layout or commands is not done until the matching docs are updated in the same change:

- `README.md` — features and quick start
- `docs/architecture.md` — file tree and data/signal flow
- `docs/components.md` — module APIs, ranges and defaults
- `docs/glucose-sound-design.md` — anything that changes how glucose data maps to sound
- `docs/input-controls.md`, `docs/libreview-format.md`, `BUILD_AND_TEST.md` — when input, parsing or build/test steps change
- `docs/backlog/` — when an idea ships, mark it done or remove it from the note, and note what shipped
- This file (`AGENTS.md`) — file structure, key modules, conventions and boundaries

If you find docs that are already out of date, fix them or flag them.

**Design constraints:**

- Vintage analog synth aesthetic: dark warm backgrounds, amber/coral accents, phosphor-style waveform display
- Effect UI styled as guitar pedals; glucose range colors in `variables.css` (`--accent-glucose-*`)
- Fonts: Syne (UI), IBM Plex Mono (labels/data) — loaded in `variables.css`
- See README "Design Philosophy" and `docs/architecture.md` for layout intent

**Boundaries:**

- Do **not** implement ideas from `docs/backlog/` unless explicitly requested — that directory holds discovery notes for features not yet decided on.
- Do **not** add cloud backends, LibreLinkUp live fetch, or server-side glucose storage unless explicitly requested.
- Do **not** commit real user CGM exports or health identifiers — use `public/sample-data/` for demos.
- Do **not** edit the **VST3 port** (`VST-Collection/Glukoscillator VST3 Port`) — separate project, not under active development for now.
- Avoid adding React/Vue or a heavy UI framework — vanilla TS + DOM factories is the current architecture.
- Avoid blocking the audio thread: long work stays in file parse/wavetable generation; playback uses Tone.js scheduling.
- Keep changes scoped — don't refactor unrelated UI when fixing parser or a single effect.

**Further reading:**

- `docs/architecture.md` — data flow diagram and `ParsedLibreViewData` shape
- `docs/components.md` — module-level API reference
- `docs/glucose-sound-design.md` — effect/envelope mapping rules
- `docs/input-controls.md` — QWERTY and MIDI behavior
- `BUILD_AND_TEST.md` — quick human checklist
