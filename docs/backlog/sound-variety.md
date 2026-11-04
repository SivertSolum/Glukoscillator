# Sound variety — remaining ideas

**Status:** Draft — discovery notes, not an implementation spec.
**Context:** From an analysis of the audio engine (Nov 2026). Already shipped from that analysis: phase-preserving wavetables + Body (fundamental reinforcement), per-oscillator octave/semitone/fine/pan, per-voice lowpass filter with envelope. See [components.md](../components.md#synth-engine).

The ideas below are pinned for later. Rough payoff/effort order within each section.

---

## A. Waveform generation

### A3. Multi-frame wavetables + Position control (biggest remaining win)
Slice each day into N frames (e.g. 24 hourly windows, or a sliding window) instead of one cycle per day. A **Position** knob scans morning → night; modulate it from an envelope or LFO so notes evolve while held.
- Cheap version: precompute a `PeriodicWave` per frame, crossfade two voices' oscillators.
- Full version: AudioWorklet with band-limited (mip-mapped) table lookup and smooth interpolation.
- Open questions: frame count vs. CGM sample rate (5–15 min readings → 12–288 points/day); how the waveform display should show the current frame.

### A4. Alternative waveform derivations
Selectable per oscillator:
- **Derivative** (rate of change) — brighter, spikier, emphasizes meals/corrections.
- **Physiological normalization** — `normalizeToPhysiologicalRange()` already exists in `wavetable.ts` but is unused; keeps day-to-day amplitude/brightness differences instead of stretching every day to full scale.
- **Mirrored day** (day + reversed day) — symmetric cycle, odd-harmonic, hollow/square-ish tone.

### A5. Per-oscillator shape controls
- Smoothing passes (currently fixed at 2).
- Seam handling: crossfade/window the 24:00 → 00:00 wrap vs. keep the jump (buzz).
- Partial count (8 = dark … 256 = bright).
- Spectral tilt.

### A6. Glucose-curve waveshaper
Use the day's sorted values (its value distribution) as a `Tone.WaveShaper` transfer curve — distortion unique per day.

## B. Voice architecture

- **Unison** per oscillator with detune spread (builds on the existing tuning).
- **FM / ring modulation** between layers — one day modulating another; metallic/bell timbres.
- **Noise layer** with level driven by volatility.
- **Glide / portamento** (mono/legato mode).
- **Filter keyboard tracking**, filter types (HP/BP), 24 dB mode.

## C. The day as modulation

- **Glucose-shaped LFO** — `Tone.LFO` supports custom partials; route to cutoff, wavetable position, or pan; free or tempo-synced.
- **Arpeggiator / step sequencer** from readings quantized to a scale (larger feature).

## D. Smarter Randomize mapping

- Blend effect amounts continuously with metrics instead of hard on/off thresholds.
- Seed randomness from the date hash → each day has a stable signature sound; add a separate "Mutate" button.
- More metrics: spike count (≈ meals), overnight stability, skewness, time-above vs. time-below kept separate (lows → brittle/thin, highs → thick/saturated).
- Map metrics onto synth parameters too (filter, detune, Body, wavetable position), not only FX + ADSR.
- Update [glucose-sound-design.md](../glucose-sound-design.md) alongside any mapping change.
