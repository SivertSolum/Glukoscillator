# 🏗️ Architecture

This document covers the project structure and data flow of Glukoscillator.

## Project Structure

```
glukoscillator/
├── index.html              # Main HTML entry point
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── public/
│   └── sample-data/
│       └── sample-glucose.csv  # Demo glucose data
└── src/
    ├── main.ts             # Application entry point
    ├── types.ts            # TypeScript type definitions
    ├── style.css           # Root stylesheet (imports all modules)
    │
    ├── parser/
    │   └── libreview.ts    # CSV parser for LibreView exports
    │
    ├── synthesis/
    │   ├── synth-engine.ts # Main Tone.js synth (3-osc polyphonic, tuning, filter, body)
    │   ├── wavetable-voice.ts # One voice: PeriodicWave osc → lowpass → amp env
    │   ├── wavetable.ts    # Glucose → waveform conversion + FFT harmonics
    │   ├── effects-chain.ts    # Modular effects routing + glucose-driven randomization
    │   ├── effects-config.ts   # Effect ranges, glucose metrics & normalization
    │   ├── voice-mapping.ts    # Glucose → filter, body, tuning, pan, unison
    │   ├── random.ts           # Seeded RNG for reproducible "signature" sounds
│   └── effects-types.ts    # Effect parameter type definitions
    │
    ├── input/
    │   ├── keyboard-handler.ts # QWERTY keyboard → notes
    │   └── midi-handler.ts     # Web MIDI API integration
    │
    ├── ui/
    │   ├── controls.ts         # ADSR, tone/filter & master knobs
    │   ├── day-selector.ts     # Dropdown for choosing days
    │   ├── effects-panel.ts    # Drag-and-drop effects rack
    │   ├── effects-icons.ts    # SVG icons for effects
    │   ├── oscillator-mixer.ts # 3-channel oscillator UI (level, tuning, pan)
    │   ├── piano-keyboard.ts   # Virtual piano with dynamic sizing
    │   └── waveform-display.ts # Canvas oscilloscope visualization
    │
    └── styles/
        ├── variables.css       # CSS custom properties
        ├── base.css            # Reset and typography
        ├── layout.css          # Main grid structure
        ├── drop-zone.css       # File upload styling
        ├── day-selector.css    # Day picker dropdown
        ├── waveform.css        # Oscilloscope canvas
        ├── oscillator-mixer.css # OSC 1/2/3 slots
        ├── knobs.css           # Rotary control styling
        ├── effects-rack.css    # Pedalboard effects
        ├── piano.css           # Keyboard keys
        ├── overlays.css        # Modal & start screen
        └── responsive.css      # Mobile breakpoints
```

## Module Responsibilities

| Directory | Purpose |
|-----------|---------|
| `parser/` | CSV parsing and data extraction from LibreView exports |
| `synthesis/` | Audio generation, wavetable conversion, and effects processing |
| `input/` | User input handling (keyboard, MIDI) |
| `ui/` | Visual components and user interface |
| `styles/` | Modular CSS organization |

---

## Data Flow

The following diagram shows how glucose data flows through the application:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐      ┌─────────────────┐      ┌────────────────────┐
  │  LibreView   │      │   CSV Parser    │      │   Wavetable Gen    │
  │  CSV Export  │ ───▶ │  (libreview.ts) │ ───▶ │  (wavetable.ts)    │
  │              │      │                 │      │                    │
  │  • Timestamps│      │  • Parse rows   │      │  • Normalize       │
  │  • Glucose   │      │  • Group by day │      │  • Resample to     │
  │    readings  │      │  • Calc stats   │      │    2048 samples    │
  │              │      │                 │      │  • FFT → harmonics │
  └──────────────┘      └─────────────────┘      └────────────────────┘
                                                          │
                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION STATE                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ParsedLibreViewData                                                 │   │
│  │  ├─ days: Map<string, DailyGlucoseData>                             │   │
│  │  │       ├─ date: "2024-01-15"                                      │   │
│  │  │       ├─ readings: GlucoseReading[]                              │   │
│  │  │       ├─ wavetable: Float32Array (2048 samples)                  │   │
│  │  │       └─ stats: { min, max, avg, timeInRange }                   │   │
│  │  ├─ unit: "mg/dL" | "mmol/L"                                        │   │
│  │  └─ deviceName, serialNumber                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Glucose Stats  │     │   Day Selector  │     │ Waveform Display│
│                 │     │                 │     │                 │
│  • Volatility   │     │  List all days  │     │  Canvas layers: │
│  • Range        │     │  with previews  │     │  • Background   │
│  • CV           │     │                 │     │  • Waveform     │
│  • Rate of Chg  │     │  Click to       │     │  • Playhead     │
│  • Time in Rng  │     │  assign to OSC  │     │                 │
└────────┬────────┘     └─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│        RANDOMIZE / SIGNATURE / MUTATE  (seeded by days + variation)│
│  ┌─────────────────────────────┐  ┌─────────────────────────┐  │
│  │     Effects Selection       │  │   Envelope Shaping      │  │
│  │  • High chaos → Distortion  │  │  • Chaos → Attack/Decay │  │
│  │  • Stable → Reverb/Chorus   │  │  • Range → Sustain      │  │
│  │  • Poor TIR → AutoFilter    │  │  • TIR → Release        │  │
│  └─────────────────────────────┘  └─────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  Voice (voice-mapping.ts)                                │  │
│  │  • Chaos/avg → Cutoff   • TIR → Body, pan width          │  │
│  │  • Day avg → Octave     • Calm → Unison stack            │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                        │
         └───────────┬────────────┘
                     ▼
┌─────────────────┐     ┌─────────────────┐
│  Osc Mixer UI   │     │  Effects Panel  │
│                 │     │                 │
│  OSC 1 ─────┐   │     │  Shows enabled  │
│  OSC 2 ─────┼───│────▶│  effects with   │
│  OSC 3 ─────┘   │     │  glucose-tuned  │
│                 │     │  parameters     │
│  Level sliders  │     │                 │
└─────────────────┘     └─────────────────┘
         │                        │
         └───────────┬────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYNTHESIS ENGINE                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  GlucoseSynth (synth-engine.ts)                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ Oscillator 1 │  │ Oscillator 2 │  │ Oscillator 3 │               │   │
│  │  │ • 6 voices*  │  │ • 6 voices*  │  │ • 6 voices*  │               │   │
│  │  │ • Wavetable  │  │ • Wavetable  │  │ • Wavetable  │               │   │
│  │  │ • Tuning     │  │ • Tuning     │  │ • Tuning     │               │   │
│  │  │ • Level, Pan │  │ • Level, Pan │  │ • Level, Pan │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  │         └─────────────────┼─────────────────┘                        │   │
│  │                           ▼                                          │   │
│  │  * voice = PeriodicWave osc → lowpass (+ filter env) → amp env      │   │
│  │              ┌────────────────────────┐                              │   │
│  │              │     Master Volume      │                              │   │
│  │              │  (gain compensation)   │                              │   │
│  │              └────────────┬───────────┘                              │   │
│  │                           ▼                                          │   │
│  │              ┌────────────────────────┐                              │   │
│  │              │     Effects Chain      │                              │   │
│  │              │  (15 reorderable FX)   │                              │   │
│  │              └────────────┬───────────┘                              │   │
│  │                           ▼                                          │   │
│  │              ┌────────────────────────┐                              │   │
│  │              │   Audio Destination    │                              │   │
│  │              │      (speakers)        │                              │   │
│  │              └────────────────────────┘                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
 ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
 │ Computer KB     │     │  MIDI Handler   │     │  Piano UI       │
 │ (keyboard.ts)   │     │  (midi.ts)      │     │                 │
 │                 │     │                 │     │  Click/Touch    │
 │  Z-M = C3-B3    │     │  Note On/Off    │     │  on virtual     │
 │  Q-U = C4-B4    │     │  Velocity       │     │  keys           │
 │  I-P = C5-E5    │     │                 │     │                 │
 └─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Key Data Structures

### ParsedLibreViewData

The main data container after CSV parsing:

```typescript
interface ParsedLibreViewData {
  days: Map<string, DailyGlucoseData>;
  unit: 'mg/dL' | 'mmol/L';
  deviceName?: string;
  serialNumber?: string;
}
```

### DailyGlucoseData

Individual day's data with wavetable:

```typescript
interface DailyGlucoseData {
  date: string;
  readings: GlucoseReading[];
  wavetable: Float32Array;  // 2048 samples
  stats: {
    min: number;
    max: number;
    avg: number;
    timeInRange: number;    // % between 70-180 mg/dL
  };
}
```

---

← [Back to README](../README.md) | [Components →](components.md)

