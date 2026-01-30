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
5. **FFT** — Compute 64 harmonic partials for Tone.js oscillators

### Technical Details

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Sample count | 2048 | Standard wavetable size for synthesis |
| Harmonic count | 64 | Number of partials from FFT analysis |
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
| **Polyphony** | 6 voices per oscillator (18 total) |
| **Voice Allocation** | O(1) lookup using Set for available voices |
| **Envelope** | Configurable ADSR (Attack, Decay, Sustain, Release) |
| **Mixing** | Per-oscillator level control + automatic gain compensation |

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
│     │ Level     │ Level     │ Level        │
│     └───────────┼───────────┘              │
│                 ▼                           │
│         Master Gain → Effects → Output      │
└─────────────────────────────────────────────┘
```

### ADSR Envelope

Each note passes through an envelope shaper:

- **Attack** — Time to reach peak volume (0.001s - 2s)
- **Decay** — Time to fall to sustain level (0.01s - 2s)
- **Sustain** — Volume held while key is pressed (0 - 1)
- **Release** — Time to fade after key release (0.01s - 5s)

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
| Data-driven randomization | Effects chosen and tuned based on glucose patterns |
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
| **Synth Controls** | `controls.ts` | ADSR knobs with vintage styling |
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

ADSR envelope knobs and master volume.

**Features:**
- Rotary knob interface with drag interaction
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

