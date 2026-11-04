# Wavetable frames & waveform modes

**Status:** Planned — judged worth implementing; not started. Per `AGENTS.md`, don't implement until explicitly requested.
**Origin:** Items 3 and 4 from the sound-variety analysis ([sound-variety.md](./sound-variety.md), A3 + A4).
**Builds on:** phase-preserving harmonics (`computeHarmonicsFromWavetable()`), `WavetableVoice`, Body, seeded voice mapping (`voice-mapping.ts`).

Two features that change *what waveform* each oscillator plays. Recommended order: **modes first** (small, self-contained), then **frames** (bigger, benefits from modes existing).

---

## 1. Waveform modes (per oscillator)

Today every day becomes one cycle: the glucose curve normalized to the day's own min/max. Add a per-oscillator **Mode** selector that derives the cycle differently from the same readings.

| Mode | Derivation | Expected sound |
|------|------------|----------------|
| **Curve** (current default) | Day's values, normalized to its own min/max | As today |
| **Absolute** | `normalizeToPhysiologicalRange()` (already in `wavetable.ts`, unused) — fixed 40–400 mg/dL scale | Calm days get small, quiet-ish, mellow waves; big swings stay big. Keeps differences between days instead of stretching every day to full scale |
| **Rate** | First difference of readings (rate of change), then normalized | Brighter and spikier; meals and corrections dominate, slow drifts vanish |
| **Mirror** | Day followed by the day reversed (symmetric cycle) | No seam jump; hollow, more odd-harmonic, square-ish tone |

### Implementation sketch
- `wavetable.ts`: `generateWavetable(dayData, mode)`; the existing pipeline (resample → smooth → harmonics) stays shared. Add `WaveformMode` type in `types.ts`.
- Wavetables are per day today (`DailyGlucoseData.wavetable`). Either cache per `(day, mode)` lazily in the synth, or compute on assignment. Assignment-time computation is cheap (2048-point FFT), so start there.
- `GlucoseSynth.setOscillatorMode(index, mode)` → recompute that layer's harmonics → `updateOscillatorWave()`.
- **Absolute mode loudness:** Web Audio peak-normalizes each `PeriodicWave`, which would cancel the "small day = quiet" effect. Either create the wave with `disableNormalization: true` and scale it, or map the day's absolute span onto the layer volume. Decide while building.
- UI: a compact 4-way selector per oscillator slot (cycle button or tiny segmented control). Mobile slot space is tight — test the Osc tab.
- Mini waveform previews and the hover preview should show the mode's waveform, not always the raw curve.

### Glucose mapping (optional, part 2)
Let Signature/Mutate pick modes per oscillator in `voice-mapping.ts` (e.g. high rate-of-change days → Rate more likely; good-TIR days → Mirror). Use the passed `rng` and append these calls **after** the existing ones, so current signatures stay stable for the parts already mapped.

---

## 2. Multi-frame wavetables + Position (the bigger one)

Slice each day into **N frames** instead of one cycle, and add a **Position** control that sweeps through the day (00:00 → 24:00). Modulating Position makes held notes evolve: the timbre literally follows the day.

### Frames
- Default N = 24 (hourly). CGM data is ~5–15 min readings → 4–12 points per hour, too few for one frame on its own. Use **overlapping windows** (e.g. 3-hour window, 1-hour hop), resampled to 2048 and smoothed like today.
- Each frame needs its own normalization: per-frame min/max (maximum timbral variety) vs. day min/max (keeps "flat hours sound flat"). Probably expose this through the modes above.
- Precompute harmonics per frame on assignment: 24 × 2048-pt FFT is trivial.

### Playback — two options
1. **Crossfade (start here):** each voice runs two oscillator groups (frame k and k+1) with an equal-power crossfade by the fractional position. Position changes swap the `PeriodicWave` on the group that is silent. Works with the existing `WavetableVoice`; doubles oscillator count, and unison multiplies it further (cap total voices or limit unison when frames are on).
2. **AudioWorklet (later):** a custom processor doing band-limited table lookup (mip-mapped tables per octave) with per-sample interpolation between frames. Smooth, cheapest at high polyphony, but a real chunk of DSP work and a new build concern (worklet module loading under Vite and Vercel).

### Modulation of Position
- Knob per oscillator (or global) for static position.
- **Position envelope:** sweep from the knob value by ±amount over attack/decay (shares the pattern of the filter envelope).
- Later: the glucose-shaped LFO idea ([sound-variety.md](./sound-variety.md), C) as a Position source.

### Glucose mapping
Signature could set the start position to the day's most "eventful" hour (largest rate of change) and the sweep amount from volatility. Again: append the `rng` calls after the existing ones.

### UI
- Position knob + sweep amount: probably in the TONE section if global, or in the slot if per-oscillator (slot space is tight — leaning global first).
- Waveform display / hover preview: highlight the current frame window on the day curve.

---

## Docs to update when either ships
- `docs/glucose-sound-design.md` — "From Glucose Curve to Oscillator", Voice Mapping
- `docs/components.md` — wavetable generator, synth engine, mixer
- `docs/architecture.md`, `README.md`, `AGENTS.md`, `BUILD_AND_TEST.md`
- Mark this note shipped (or remove the shipped section) and update [sound-variety.md](./sound-variety.md)

## Open questions
- Per-oscillator vs. global Position?
- Should Absolute mode affect loudness, or only shape?
- Frame count and window size: fixed, or user-selectable?
- How do Mirror mode and frames combine (mirror each frame, or the whole day)?
