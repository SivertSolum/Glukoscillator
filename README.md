# 🎹 Glukoscillator

**Transform your glucose data into music.** Each day's blood glucose readings become a unique playable waveform in this wavetable synthesizer.

Glukoscillator is a browser-based synthesizer that converts continuous glucose monitoring (CGM) data from FreeStyle Libre devices (via LibreView exports) into custom wavetables. Your daily glucose curves become sonic textures you can play as musical instruments.

![Glukoscillator](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Tone.js](https://img.shields.io/badge/Tone.js-F734D7?style=for-the-badge)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

---

## ✨ Features

- **Wavetable Synthesis** — Each day's glucose data becomes a single-cycle waveform
- **3 Oscillator Layers** — Mix up to 3 different days simultaneously
- **15 Audio Effects** — Professional-quality effects chain (reverb, delay, chorus, distortion, etc.)
- **MIDI Support** — Connect your MIDI keyboard for expressive control
- **Virtual Piano** — Play with mouse/touch or QWERTY keyboard (2-6 octaves dynamically)
- **Oscilloscope Display** — Real-time waveform visualization with glucose statistics
- **Drag-and-Drop** — Simple CSV file loading
- **Randomize** — Instantly generate new sound combinations
- **ADSR Envelope** — Full attack, decay, sustain, release control
- **Responsive Design** — Works on desktop and tablets

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- A LibreView CSV export (or use the included sample data)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/glukoscillator.git
cd glukoscillator

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

### Usage

1. Click **"Start Audio"** to enable the Web Audio API
2. The sample glucose data loads automatically (or drag your own LibreView CSV)
3. Select different days from the dropdown to preview waveforms
4. Click oscillator slots (OSC 1/2/3) to assign days to each layer
5. Play notes using:
   - **Mouse/Touch** — Click the piano keyboard
   - **Computer Keyboard** — Use the QWERTY layout (see [Keyboard Mapping](#keyboard-mapping))
   - **MIDI Controller** — Connect any class-compliant MIDI device
6. Adjust the **ADSR envelope** and **master volume** with the rotary knobs
7. Add and configure **effects** from the modular pedalboard

---

## 🏗️ Architecture

### Project Structure

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
    │   ├── synth-engine.ts # Main Tone.js synth (3-osc polyphonic)
    │   ├── wavetable.ts    # Glucose → waveform conversion + FFT
    │   ├── effects-chain.ts    # Modular effects routing
    │   ├── effects-config.ts   # Effect defaults & randomization ranges
    │   └── effects-types.ts    # Effect parameter type definitions
    │
    ├── input/
    │   ├── keyboard-handler.ts # QWERTY keyboard → notes
    │   └── midi-handler.ts     # Web MIDI API integration
    │
    ├── ui/
    │   ├── controls.ts         # ADSR knobs & master volume
    │   ├── day-selector.ts     # Dropdown for choosing days
    │   ├── effects-panel.ts    # Drag-and-drop effects rack
    │   ├── effects-icons.ts    # SVG icons for effects
    │   ├── oscillator-mixer.ts # 3-channel oscillator UI
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

---

## 🔄 Data Flow

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
  │              │      │                 │      │  • FFT → partials  │
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
           ▼                        ▼                        ▼
  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
  │   Day Selector  │     │  Osc Mixer UI   │     │ Waveform Display│
  │                 │     │                 │     │                 │
  │  List all days  │     │  OSC 1 ─────┐   │     │  Canvas layers: │
  │  with previews  │     │  OSC 2 ─────┼───│────▶│  • Background   │
  │                 │     │  OSC 3 ─────┘   │     │  • Waveform     │
  │  Click to       │     │                 │     │  • Playhead     │
  │  assign to OSC  │     │  Level sliders  │     │                 │
  └─────────────────┘     └─────────────────┘     └─────────────────┘
           │                        │
           └───────────┬────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SYNTHESIS ENGINE                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  GlucoseSynth (synth-engine.ts)                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ Oscillator 1 │  │ Oscillator 2 │  │ Oscillator 3 │               │   │
│  │  │ • 6 voices   │  │ • 6 voices   │  │ • 6 voices   │               │   │
│  │  │ • Wavetable  │  │ • Wavetable  │  │ • Wavetable  │               │   │
│  │  │ • Level      │  │ • Level      │  │ • Level      │               │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │   │
│  │         └─────────────────┼─────────────────┘                        │   │
│  │                           ▼                                          │   │
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

## 🎛️ Components

### Parser (`src/parser/libreview.ts`)

Parses CSV exports from Abbott's LibreView platform (FreeStyle Libre 1/2/3 CGM devices).

- **Input**: Raw CSV text with headers like `Device Timestamp`, `Historic Glucose mg/dL`
- **Output**: `ParsedLibreViewData` with days grouped by date, each containing readings and statistics
- **Features**:
  - Handles multiple date formats (European DD-MM-YYYY, ISO, etc.)
  - Auto-detects glucose units (mg/dL or mmol/L) and normalizes to mg/dL
  - Calculates daily statistics: min, max, average, time-in-range (70-180 mg/dL)

### Wavetable Generator (`src/synthesis/wavetable.ts`)

Converts daily glucose data into playable wavetables.

- **Process**:
  1. Extract glucose values from the day's readings
  2. Normalize values to [-1, 1] range using the day's min/max
  3. Resample to 2048 samples (standard wavetable size)
  4. Apply smoothing to reduce aliasing
  5. Compute FFT partials (64 harmonics) for Tone.js oscillators
  
- **Result**: Each day becomes a unique single-cycle waveform with the "shape" of that day's glucose curve

### Synth Engine (`src/synthesis/synth-engine.ts`)

A polyphonic wavetable synthesizer built on [Tone.js](https://tonejs.github.io/).

| Feature | Details |
|---------|---------|
| **Oscillators** | 3 independent layers, each with its own wavetable |
| **Polyphony** | 6 voices per oscillator (18 total) |
| **Voice Allocation** | O(1) lookup using Set for available voices |
| **Envelope** | Configurable ADSR (Attack, Decay, Sustain, Release) |
| **Mixing** | Per-oscillator level control + automatic gain compensation |

### Effects Chain (`src/synthesis/effects-chain.ts`)

15 professional audio effects with full parameter control:

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

- **Drag-and-drop reordering** — change effect order in real-time
- **Bypass optimization** — disabled effects use zero CPU
- **Randomization** — one-click random effect combinations
- **Persistence** — effect order saved to localStorage

### Input Handlers

#### Keyboard Handler (`src/input/keyboard-handler.ts`)

Maps QWERTY keys to musical notes:

```
Lower row (Z-M):  C3  C#3  D3  D#3  E3  F3  F#3  G3  G#3  A3  A#3  B3
                  Z   S    X   D    C   V   G    B   H    N   J    M

Upper row (Q-U):  C4  C#4  D4  D#4  E4  F4  F#4  G4  G#4  A4  A#4  B4
                  Q   2    W   3    E   R   5    T   6    Y   7    U

Extended (I-P):   C5  C#5  D5  D#5  E5
                  I   9    O   0    P
```

#### MIDI Handler (`src/input/midi-handler.ts`)

Full Web MIDI API integration:
- Auto-detects connected MIDI devices
- Handles Note On/Off with velocity
- Shows connection status in UI

### UI Components

| Component | File | Description |
|-----------|------|-------------|
| **Day Selector** | `day-selector.ts` | Dropdown with mini waveform previews |
| **Oscillator Mixer** | `oscillator-mixer.ts` | 3-slot interface for layer assignment |
| **Waveform Display** | `waveform-display.ts` | Triple-layer canvas oscilloscope |
| **Piano Keyboard** | `piano-keyboard.ts` | Dynamic 3-6 octave virtual keyboard |
| **Synth Controls** | `controls.ts` | ADSR knobs with vintage styling |
| **Effects Panel** | `effects-panel.ts` | Stomp-box style effect modules |

---

## 🎹 Keyboard Mapping

<table>
<tr>
<td>

**Octave 3 (Z-M row)**
| Key | Note |
|-----|------|
| Z | C3 |
| S | C#3 |
| X | D3 |
| D | D#3 |
| C | E3 |
| V | F3 |
| G | F#3 |
| B | G3 |
| H | G#3 |
| N | A3 |
| J | A#3 |
| M | B3 |

</td>
<td>

**Octave 4 (Q-U row)**
| Key | Note |
|-----|------|
| Q | C4 |
| 2 | C#4 |
| W | D4 |
| 3 | D#4 |
| E | E4 |
| R | F4 |
| 5 | F#4 |
| T | G4 |
| 6 | G#4 |
| Y | A4 |
| 7 | A#4 |
| U | B4 |

</td>
<td>

**Octave 5 (I-P row)**
| Key | Note |
|-----|------|
| I | C5 |
| 9 | C#5 |
| O | D5 |
| 0 | D#5 |
| P | E5 |

</td>
</tr>
</table>

---

## 🔧 Tech Stack

- **[TypeScript](https://www.typescriptlang.org/)** — Type-safe JavaScript
- **[Vite](https://vitejs.dev/)** — Fast development server and build tool
- **[Tone.js](https://tonejs.github.io/)** — Web Audio framework for synthesis
- **Web MIDI API** — Browser-native MIDI device support
- **Canvas API** — Hardware-accelerated waveform rendering

---

## 📦 Scripts

```bash
npm run dev      # Start development server (hot reload)
npm run build    # Build for production (TypeScript + Vite)
npm run preview  # Preview production build locally
```

---

## 📝 LibreView Data Format

Export your data from [LibreView](https://www.libreview.com/):

1. Log in to LibreView
2. Go to **Reports** → **Export Data**
3. Download the CSV file
4. Drag the CSV onto Glukoscillator's drop zone

Expected CSV columns:
- `Device Timestamp` — Date/time of reading
- `Historic Glucose mg/dL` (or `mmol/L`) — Glucose value
- `Record Type` — 0 = automatic, 1 = manual scan

---

## 🎨 Design Philosophy

Glukoscillator's UI draws inspiration from:
- **Vintage analog synthesizers** — Warm color palette, rotary knobs, oscilloscope displays
- **Guitar effect pedals** — Modular "stomp box" effect units
- **Medical devices** — Clean data visualization with meaningful statistics

The visual aesthetic uses:
- Dark oscilloscope-style backgrounds with phosphor green accents
- Warm amber and coral tones indicating glucose ranges
- Tactile, physical-feeling controls

---

## 🤝 Contributing

Contributions are welcome! Areas of interest:

- Additional CGM data format parsers (Dexcom, Medtronic, etc.)
- New audio effects
- Mobile touch optimization
- Accessibility improvements
- Documentation translations

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [Tone.js](https://tonejs.github.io/) for the excellent Web Audio framework
- The diabetes community for inspiration
- Abbott for the LibreView platform

---

<p align="center">
  <strong>Turn your data into art. 🩸→🎵</strong>
</p>

