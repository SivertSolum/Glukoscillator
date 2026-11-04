# 🎛️ Components

This document provides detailed documentation for each major component in Glukoscillator.

## Table of Contents

- [Parser](#parser)
- [Wavetable Generator](#wavetable-generator)
- [Synth Engine](#synth-engine)
- [Effects Chain](#effects-chain)
- [UI Components](#ui-components)

---

## Parser

**File:** `src/parser/libreview.ts`

Parses CSV exports from Abbott's LibreView platform (FreeStyle Libre 1/2/3 CGM devices).

### Input/Output

- **Input**: Raw CSV text with headers like `Device Timestamp`, `Historic Glucose mg/dL`
- **Output**: `ParsedLibreViewData` with days grouped by date, each containing readings and statistics

### Features

| Feature | Description |
|---------|-------------|
| Multi-format dates | Handles European DD-MM-YYYY, ISO, US formats |
| Unit detection | Auto-detects mg/dL or mmol/L and normalizes to mg/dL |
| Daily grouping | Groups readings by calendar date |
| Statistics | Calculates min, max, average, time-in-range (70-180 mg/dL) |

### Statistics Calculated

For each day, the parser computes:

- **Min/Max** — Lowest and highest glucose readings
- **Average** — Mean of all readings
- **Time in Range** — Percentage of readings between 70-180 mg/dL

---

## Wavetable Generator

**File:** `src/synthesis/wavetable.ts`

Converts daily glucose data into playable wavetables for synthesis.

### Conversion Process

1. **Extract** — Pull glucose values from the day's readings
2. **Normalize** — Scale values to [-1, 1] range using day's min/max
3. **Resample** — Interpolate to 2048 samples (standard wavetable size)
4. **Smooth** — Apply windowing to reduce aliasing artifacts
5. **FFT** — `computeHarmonicsFromWavetable()` returns 64 harmonics as Fourier coefficients (`real` = cosine, `imag` = sine), keeping both magnitude **and phase**
6. **Body** — `applyFundamentalBody()` optionally lifts a weak fundamental (see [Synth Engine](#synth-engine))
7. **PeriodicWave** — The synth builds a Web Audio `PeriodicWave` from those coefficients, so the oscillator plays the actual glucose-curve shape

### Technical Details

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Sample count | 2048 | Standard wavetable size for synthesis |
| Harmonic count | 64 | Band limit: harmonics kept from the FFT (magnitude + phase) |
| Loudness | Peak-normalized | Web Audio normalizes each `PeriodicWave`; no per-day scaling in code |
| Normalization | -1 to 1 | Audio signal range |

### Result

Each day becomes a unique single-cycle waveform where the "shape" directly reflects that day's glucose curve. Days with stable glucose produce smooth, sine-like waveforms; volatile days create complex, harmonically rich shapes.

---

## Synth Engine

**File:** `src/synthesis/synth-engine.ts`

A polyphonic wavetable synthesizer built on [Tone.js](https://tonejs.github.io/).

### Architecture

| Feature | Details |
|---------|---------|
| **Oscillators** | 3 independent layers, each with its own wavetable |
| **Voice** | `WavetableVoice` (`wavetable-voice.ts`): 1–4 unison PeriodicWave oscillators → 12 dB lowpass → amp envelope |
| **Polyphony** | 6 voices per oscillator (18 total) |
| **Voice Allocation** | O(1) lookup using Set for available voices |
| **Envelope** | Configurable ADSR (Attack, Decay, Sustain, Release) |
| **Filter** | Per-voice lowpass + filter envelope (shared settings) |
| **Tuning** | Per-oscillator octave (±2), semitone (±12), fine (±50 ct), pan, unison (1–4 voices, 0–50 ct spread) |
| **Body** | Fundamental reinforcement so weak-fundamental days stay in tune |
| **Mixing** | Per-oscillator level control + automatic gain compensation |

> Why a custom voice instead of `Tone.Synth`? Tone's `Oscillator` only accepts sine-partial amplitudes, which discards harmonic phase. `WavetableVoice` drives Tone's `ToneOscillatorNode` with a full `PeriodicWave` built from `real` + `imag` coefficients.

### Voice Management

The synth uses a pool of pre-allocated voices for each oscillator layer:

```
┌─────────────────────────────────────────────┐
│              GlucoseSynth                   │
├─────────────────────────────────────────────┤
│  OSC 1        OSC 2        OSC 3           │
│  ┌─────┐     ┌─────┐     ┌─────┐           │
│  │ V1  │     │ V1  │     │ V1  │           │
│  │ V2  │     │ V2  │     │ V2  │           │
│  │ V3  │     │ V3  │     │ V3  │           │
│  │ V4  │     │ V4  │     │ V4  │           │
│  │ V5  │     │ V5  │     │ V5  │           │
│  │ V6  │     │ V6  │     │ V6  │           │
│  └──┬──┘     └──┬──┘     └──┬──┘           │
│     │ Level→Pan │ Level→Pan │ Level→Pan    │
│     └───────────┼───────────┘              │
│                 ▼                           │
│         Master Gain → Effects → Output      │
└─────────────────────────────────────────────┘
```

### ADSR Envelope

Each note passes through an envelope shaper:

- **Attack** — Time to reach peak volume (0.001s - 2s)
- **Decay** — Time to fall to sustain level (0.001s - 2s)
- **Sustain** — Volume held while key is pressed (0 - 1)
- **Release** — Time to fade after key release (0.001s - 4s)

Each voice is `oscillator(s) → lowpass filter → amp envelope`.

### Tone: Filter & Body

`setFilter()` / `getFilter()` (`FilterSettings` in `types.ts`), shared by all 18 voices:

| Control | Range | Behavior |
|---------|-------|----------|
| **Cutoff** | 20 Hz – 18 kHz (log knob) | Resting cutoff of the 12 dB/oct lowpass |
| **Resonance** | Q 0.5 – 10 | Peak at the cutoff |
| **Env amount** | 0 – 6 octaves | How far the filter envelope opens above cutoff; scaled by note velocity |
| **Env decay** | 0.01 – 2 s | Time for the sweep to fall back to cutoff (filter env uses the amp attack/release, sustain 0) |

Defaults (open filter, no envelope) leave the raw wavetable unfiltered.

`setBody(0–1)` (default 0.5): ensures the fundamental is at least `body ×` the strongest harmonic, keeping its phase. Many days have a weak fundamental with a dominant upper harmonic, which otherwise makes notes sound an octave or fifth away from the key played. `0` = untouched spectrum.

### Oscillator Tuning

`setOscillatorTuning(index, { octave, semitone, fine, pan, unison, unisonDetune })` / `getOscillatorTuning(index)` (`OscillatorTuning` in `types.ts`). Pitch offsets are applied as oscillator detune in cents (also to sounding notes); pan uses a per-layer `Tone.Panner`.

**Unison:** each voice can stack up to `MAX_UNISON` (4) oscillators, detuned symmetrically across `unisonDetune` cents and spread ±0.6 across the stereo field, summed at `1/√n` gain before the filter. Start times are staggered by a random fraction of a cycle so the copies don't begin phase-aligned. A new unison size applies from the next note; spread changes apply immediately. Cost: up to 72 oscillators at full polyphony (3 × 6 × 4).

### Glucose-driven voice settings

**Files:** `src/synthesis/voice-mapping.ts`, `src/synthesis/random.ts`

- `computeVoiceFromGlucose(combined, perOscillator, rng)` → `{ filter, body, tunings[] }` — see [Glucose Sound Design](glucose-sound-design.md#voice-mapping).
- `createDaySignatureRandom(dates, variation)` → seeded `RandomSource` (Mulberry32 seeded with an FNV-1a hash of the dates in slot order plus the variation). Variation `0` = signature.
- `randomizeFromGlucose(stats, rng)` and `addRandomSpread(value, spread, rng)` take the same `rng`, so effects, envelope and voice are all reproducible together. Calls happen in a fixed order (effects → envelope → voice); keep it fixed or signatures change.

---

## Effects Chain

**File:** `src/synthesis/effects-chain.ts`

15 professional audio effects with full parameter control.

### Available Effects

| Category | Effects |
|----------|---------|
| **Dynamics** | Compressor |
| **EQ/Tone** | 3-Band EQ |
| **Distortion** | BitCrusher, Distortion |
| **Filters** | Auto-Wah, AutoFilter |
| **Modulation** | Phaser, Chorus, Tremolo, Vibrato |
| **Pitch** | Frequency Shifter, Pitch Shift |
| **Time** | Delay, Reverb |
| **Stereo** | Stereo Widener |

### Features

| Feature | Description |
|---------|-------------|
| Drag-and-drop reordering | Change effect order in real-time |
| Bypass optimization | Disabled effects use zero CPU |
| Data-driven randomization | Effects chosen and tuned based on glucose patterns (seeded: same days → same result) |
| Persistence | Effect order saved to localStorage |

### Signal Flow

```
Input → [Effect 1] → [Effect 2] → ... → [Effect N] → Output
              ↓            ↓                  ↓
         (bypass?)    (bypass?)          (bypass?)
```

Effects can be reordered by dragging them in the UI. The chain automatically reconnects in the new order.

---

## UI Components

### Overview

| Component | File | Description |
|-----------|------|-------------|
| **Day Selector** | `day-selector.ts` | Dropdown with mini waveform previews |
| **Oscillator Mixer** | `oscillator-mixer.ts` | 3-slot interface for layer assignment |
| **Waveform Display** | `waveform-display.ts` | Triple-layer canvas oscilloscope |
| **Piano Keyboard** | `piano-keyboard.ts` | Dynamic 3-6 octave virtual keyboard |
| **Synth Controls** | `controls.ts` | ADSR, tone/filter and master knobs with vintage styling |
| **Effects Panel** | `effects-panel.ts` | Stomp-box style effect modules |

---

### Day Selector

**File:** `src/ui/day-selector.ts`

Dropdown menu for selecting which day's glucose data to use.

**Features:**
- Shows all available days from the loaded CSV
- Mini waveform preview for each day
- Click to preview, click oscillator slot to assign

---

### Oscillator Mixer

**File:** `src/ui/oscillator-mixer.ts`

Three-channel mixer for layering different days' waveforms.

**Features:**
- Assign different days to each of 3 oscillator slots
- Individual level control per oscillator
- **Randomize** (random days + their signature), **Signature** (current days' signature), **Mutate** (new variation of the current days)
- Octave, semitone and unison steppers (double-click the value to reset)
- Fine-tune, pan and unison spread sliders (double-click to reset)
- `syncTuningFromSynth()` rebuilds the tuning controls from the synth; `main.ts` calls it on the other mixer instance after Randomize/Signature/Mutate
- DOM lookups are scoped to the mixer's own container (desktop and mobile share element ids)
- Visual feedback showing assigned waveform

---

### Waveform Display

**File:** `src/ui/waveform-display.ts`

Real-time oscilloscope visualization.

**Layers:**
1. Background grid
2. Waveform trace (phosphor green)
3. Playhead indicator during playback

**Features:**
- Shows combined output of all active oscillators
- Displays glucose statistics overlay
- Smooth animation with requestAnimationFrame

---

### Piano Keyboard

**File:** `src/ui/piano-keyboard.ts`

Virtual piano keyboard with responsive sizing.

**Features:**
- 3-6 octaves depending on screen width
- Mouse/touch interaction
- Visual feedback for pressed keys
- Highlights keys played via MIDI or computer keyboard

---

### Synth Controls

**File:** `src/ui/controls.ts`

ADSR envelope knobs, master volume, and the TONE section (Body, Cutoff, Resonance, filter Env amount, filter Decay).

**Features:**
- Rotary knob interface with drag interaction
- Cutoff knob is logarithmic (20 Hz – 18 kHz)
- Desktop and mobile instances each look up their own knobs (scoped to their container)
- Value display beneath each knob
- Vintage synthesizer styling

---

### Effects Panel

**File:** `src/ui/effects-panel.ts`

Modular effects rack with stomp-box styling.

**Features:**
- Toggle effects on/off
- Adjust parameters per effect
- Drag-and-drop reordering
- Custom SVG icons for each effect type

---

← [Architecture](architecture.md) | [Glucose Sound Design →](glucose-sound-design.md)

