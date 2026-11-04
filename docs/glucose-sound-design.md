# 🎵 Glucose-Driven Sound Design

This document explains how Glukoscillator transforms your glucose data into unique sonic characteristics. The synthesis parameters and effects are not random — they directly reflect patterns in your CGM data.

---

## How It Works

When you click **Randomize**, the app:

1. **Analyzes** your current glucose data
2. **Calculates** several metrics about the day's patterns
3. **Selects** appropriate effects based on those patterns
4. **Tunes** effect parameters and envelope to match

The result is a direct sonic representation of your glucose patterns.

---

## From Glucose Curve to Oscillator

Each day's readings become one cycle of a waveform (normalized, resampled to 2048 samples, lightly smoothed). The oscillator then plays that exact shape:

- **Harmonics keep their phase.** The FFT result is passed to Web Audio as a `PeriodicWave` with both cosine and sine terms, so asymmetric spikes, slow rises and sharp crashes all shape the timbre — not just how much energy sits in each harmonic.
- **Band-limited to 64 harmonics** to avoid aliasing.
- **The cycle wraps from 24:00 back to 00:00.** If the day ends at a different level than it started, the jump at the seam adds bright, sawtooth-like buzz — part of that day's character.
- **Body (TONE section, default 50%)** lifts the fundamental when a day's curve concentrates energy in a higher harmonic (e.g. two big meal spikes ≈ 2nd harmonic). Without it such days can sound an octave or fifth off the key played; turn Body to 0 to hear the raw spectrum.

Oscillator tuning, pan and the filter are manual controls; Randomize does not change them yet.

---

## Glucose Metrics

The following metrics are calculated from your daily glucose data:

| Metric | Description | Calculation |
|--------|-------------|-------------|
| **Volatility** | How much glucose varies from the mean | Standard deviation of all readings |
| **Range** | Total spread of values | Max glucose − Min glucose |
| **Coefficient of Variation (CV)** | Normalized instability measure | Volatility ÷ Average |
| **Rate of Change** | How fast glucose rises/falls | Average of reading-to-reading differences |
| **Time in Range (TIR)** | Overall glucose control quality | % of readings between 70-180 mg/dL |

### What the Metrics Mean

**Volatility & CV** indicate how "chaotic" the day was. High values suggest rapid swings between high and low glucose.

**Range** shows the extremes. A day with readings from 50-300 mg/dL has very different character than 80-140 mg/dL.

**Rate of Change** captures the "speed" of glucose movements. Rapid spikes and crashes produce high rates.

**Time in Range** is a clinical measure of glucose control — higher is generally better.

---

## Effect Selection Logic

Different glucose patterns trigger different effect combinations:

### High Volatility / Chaotic Patterns

| Glucose Pattern | Effects Enabled | Sound Character |
|-----------------|-----------------|-----------------|
| High volatility | BitCrusher | Digital artifacts, lo-fi texture |
| High chaos metric | Distortion | Aggressive, driven tone |
| Rapid rate of change | Frequency Shifter | Metallic, inharmonic |

**Result:** Aggressive, glitchy, harsh sounds that sonify the "turbulence" of volatile days.

---

### Low Volatility / Stable Patterns

| Glucose Pattern | Effects Enabled | Sound Character |
|-----------------|-----------------|-----------------|
| Low volatility | Reverb | Spacious, ambient |
| Stable readings | Chorus | Lush, thickened |
| Low CV | Phaser | Smooth sweeping |

**Result:** Smooth, ambient, spacious sounds reflecting the calm of stable glucose days.

---

### Glucose Level Patterns

| Glucose Pattern | Effects Enabled | Sound Character |
|-----------------|-----------------|-----------------|
| High average glucose | Tremolo | Amplitude wobbling |
| High average glucose | Vibrato | Pitch modulation |
| Low average glucose | Compressor | Controlled dynamics |
| Low average glucose | EQ | Tonal shaping |

---

### Time in Range Patterns

| Glucose Pattern | Effects Enabled | Sound Character |
|-----------------|-----------------|-----------------|
| Poor TIR (<50%) | Auto-Wah | Vowel-like sweeps |
| Poor TIR | AutoFilter | Rhythmic filtering |
| Good TIR (>70%) | Delay | Echo, depth |
| Good TIR | Stereo Widener | Panoramic spread |
| Good TIR | Pitch Shift | Harmonic layers |

**Result:** Poor control days get filtered, restless sounds; good control days get wide, pleasant textures.

---

## Envelope Mapping

The ADSR envelope (Attack, Decay, Sustain, Release) is also shaped by glucose data:

| Parameter | Controlled By | Mapping Logic |
|-----------|---------------|---------------|
| **Attack** | Chaos metric | High chaos = short attack (punchy, aggressive) |
| **Decay** | Rate of change | Rapid changes = short decay (percussive) |
| **Sustain** | Range + average | High range/avg = lower sustain (less sustained) |
| **Release** | TIR + stability | Good control = longer release (smooth tails) |

### Chaos Metric

The "chaos" metric is a composite score:

```
chaos = (volatility × 0.4) + (CV × 0.3) + (rateOfChange × 0.3)
```

This combines multiple instability indicators into a single measure used for envelope shaping.

---

## Example Mappings

### Volatile Day (High Chaos)

```
Glucose: 45 → 280 → 90 → 250 → 65 mg/dL
│
├─ Volatility: High
├─ Range: 235 mg/dL
├─ CV: High
├─ Rate: High
└─ TIR: ~30%

↓ Results in:

Effects: BitCrusher, Distortion, AutoFilter, Tremolo
Envelope:
  • Attack:  0.02s  (very fast, punchy)
  • Decay:   0.1s   (quick)
  • Sustain: 0.3    (lower)
  • Release: 0.2s   (short)

Sound: Aggressive, glitchy, restless
```

### Stable Day (Low Chaos)

```
Glucose: 95 → 110 → 105 → 120 → 100 mg/dL
│
├─ Volatility: Low
├─ Range: 25 mg/dL
├─ CV: Low
├─ Rate: Low
└─ TIR: 100%

↓ Results in:

Effects: Reverb, Chorus, Delay, StereoWidener
Envelope:
  • Attack:  0.5s   (slow, gradual)
  • Decay:   0.8s   (gentle)
  • Sustain: 0.7    (full)
  • Release: 2.0s   (long, fading)

Sound: Smooth, ambient, spacious
```

---

## Manual Override

While the Randomize feature provides data-driven presets, you can always:

1. Manually enable/disable any effect
2. Adjust effect parameters with the knobs
3. Change ADSR envelope values
4. Reorder effects by dragging

Your manual adjustments override the randomized settings.

---

## Technical Implementation

The glucose-to-sound mapping is implemented in:

- `src/synthesis/effects-config.ts` — Metric calculations and normalization
- `src/synthesis/effects-chain.ts` — Effect selection and parameter mapping
- `src/synthesis/wavetable.ts` — Glucose curve → wavetable → harmonics (magnitude + phase), Body
- `src/synthesis/synth-engine.ts` — Envelope, filter and tuning application
- `src/synthesis/wavetable-voice.ts` — Per-voice oscillator, filter and envelopes

See [Components](components.md) for more technical details.

---

← [Components](components.md) | [Input Controls →](input-controls.md)

