# 🎹 Glukoscillator

**Transform your glucose data into music.** Each day's blood glucose readings become a unique playable waveform in this wavetable synthesizer.

Glukoscillator is a browser-based synthesizer that converts continuous glucose monitoring (CGM) data from FreeStyle Libre devices (via LibreView exports) into custom wavetables. Your daily glucose curves become sonic textures you can play as musical instruments.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Tone.js](https://img.shields.io/badge/Tone.js-F734D7?style=for-the-badge)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

---

## ✨ Features

- **Wavetable Synthesis** — Each day's glucose data becomes a single-cycle waveform
- **3 Oscillator Layers** — Mix up to 3 different days simultaneously
- **15 Audio Effects** — Professional-quality effects chain (reverb, delay, chorus, distortion, etc.)
- **Data-Driven Sound Design** — Effects and envelope automatically shaped by your glucose patterns
- **MIDI Support** — Connect your MIDI keyboard for expressive control
- **Virtual Piano** — Play with mouse/touch or QWERTY keyboard (2-6 octaves dynamically)
- **Oscilloscope Display** — Real-time waveform visualization with glucose statistics
- **Drag-and-Drop** — Simple CSV file loading
- **Smart Randomize** — Generate sound combinations based on your glucose characteristics
- **ADSR Envelope** — Full attack, decay, sustain, release control (auto-adjusts to glucose data)
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
   - **Computer Keyboard** — Use the QWERTY layout (see [Keyboard Mapping](docs/input-controls.md#computer-keyboard))
   - **MIDI Controller** — Connect any class-compliant MIDI device
6. Adjust the **ADSR envelope** and **master volume** with the rotary knobs
7. Add and configure **effects** from the modular pedalboard

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | Project structure, data flow diagrams, key data structures |
| [Components](docs/components.md) | Detailed docs for parser, synth engine, effects, and UI components |
| [Glucose Sound Design](docs/glucose-sound-design.md) | How glucose metrics shape sound: effect selection, envelope mapping |
| [Input Controls](docs/input-controls.md) | Keyboard mapping, MIDI setup, virtual piano |
| [LibreView Format](docs/libreview-format.md) | How to export your CGM data and expected CSV format |

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

<p align="center">
  <strong>Turn your data into art. 🩸→🎵</strong>
</p>
