# Sound variety — remaining ideas

**Status:** Draft — discovery notes, not an implementation spec.
**Context:** From an analysis of the audio engine (Nov 2026). Already shipped from that analysis:
- Phase-preserving wavetables + Body (fundamental reinforcement)
- Per-oscillator octave/semitone/fine/pan, per-voice lowpass filter with envelope
- **B: Unison** per oscillator (1–4 voices, detune spread)
- **D: Seeded signature sounds** (Randomize / Signature / Mutate) and glucose mapping of filter, Body, tuning, pan and unison

See [components.md](../components.md#synth-engine) and [glucose-sound-design.md](../glucose-sound-design.md#voice-mapping).

The ideas below are pinned for later. Rough payoff/effort order within each section.

---

## A. Waveform generation

### A3 + A4. Multi-frame wavetables / alternative waveform modes
**Planned** — moved to [wavetable-frames-and-modes.md](./wavetable-frames-and-modes.md) with an implementation sketch.

### A5. Per-oscillator shape controls
- Smoothing passes (currently fixed at 2).
- Seam handling: crossfade/window the 24:00 → 00:00 wrap vs. keep the jump (buzz).
- Partial count (8 = dark … 256 = bright).
- Spectral tilt.

### A6. Glucose-curve waveshaper
Use the day's sorted values (its value distribution) as a `Tone.WaveShaper` transfer curve — distortion unique per day.

## B. Voice architecture

- **FM / ring modulation** between layers — one day modulating another; metallic/bell timbres.
- **Noise layer** with level driven by volatility.
- **Glide / portamento** (mono/legato mode).
- **Filter keyboard tracking**, filter types (HP/BP), 24 dB mode.

## C. The day as modulation

- **Glucose-shaped LFO** — `Tone.LFO` supports custom partials; route to cutoff, wavetable position, or pan; free or tempo-synced.
- **Arpeggiator / step sequencer** from readings quantized to a scale (larger feature).

## D. Smarter Randomize mapping

- Blend effect amounts continuously with metrics instead of hard on/off thresholds.
- More metrics: spike count (≈ meals), overnight stability, skewness, time-above vs. time-below kept separate (lows → brittle/thin, highs → thick/saturated).
- Map wavetable position / waveform mode once those exist (see [wavetable-frames-and-modes.md](./wavetable-frames-and-modes.md)).
- Update [glucose-sound-design.md](../glucose-sound-design.md) alongside any mapping change.
