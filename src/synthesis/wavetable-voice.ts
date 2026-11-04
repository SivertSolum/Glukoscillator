// Wavetable Voice
// One polyphonic voice: PeriodicWave oscillator → lowpass filter → amp envelope.
//
// Tone.Synth/Tone.Oscillator only accept sine-partial amplitudes, which throws
// away harmonic phase. This voice drives Tone's low-level ToneOscillatorNode
// with a full PeriodicWave (real + imag) so the played waveform matches the
// glucose curve, and adds a per-voice filter with its own envelope.

import * as Tone from 'tone';
import type { ADSREnvelope, FilterSettings } from '../types';

// Extra time after the amp release before the oscillator is stopped
const STOP_TAIL = 0.05;

export class WavetableVoice {
  private osc: Tone.ToneOscillatorNode | null = null;
  private wave: PeriodicWave | null = null;
  private detuneCents = 0;
  private releaseTime: number;

  private readonly filter: Tone.Filter;
  private readonly filterEnv: Tone.FrequencyEnvelope;
  private readonly ampEnv: Tone.AmplitudeEnvelope;

  constructor(destination: Tone.InputNode, envelope: ADSREnvelope, filter: FilterSettings) {
    this.releaseTime = envelope.release;

    this.ampEnv = new Tone.AmplitudeEnvelope({
      attack: envelope.attack,
      decay: envelope.decay,
      sustain: envelope.sustain,
      release: envelope.release,
    }).connect(destination);

    this.filter = new Tone.Filter({
      type: 'lowpass',
      rolloff: -12,
      frequency: filter.cutoff,
      Q: filter.resonance,
    }).connect(this.ampEnv);

    // Filter envelope sweeps up from the cutoff by `octaves` and decays back.
    // It shares attack/release with the amp envelope; sustain is 0 so the
    // sweep is a "pluck" that settles at the cutoff knob value.
    this.filterEnv = new Tone.FrequencyEnvelope({
      attack: envelope.attack,
      decay: filter.envDecay,
      sustain: 0,
      release: envelope.release,
      baseFrequency: filter.cutoff,
      octaves: filter.envAmount,
    });
    this.filterEnv.connect(this.filter.frequency);
  }

  setWave(wave: PeriodicWave | null): void {
    this.wave = wave;
    if (wave && this.osc) {
      this.osc.setPeriodicWave(wave);
    }
  }

  setDetune(cents: number): void {
    this.detuneCents = cents;
    if (this.osc) {
      this.osc.detune.value = cents;
    }
  }

  setEnvelope(envelope: ADSREnvelope): void {
    this.ampEnv.attack = envelope.attack;
    this.ampEnv.decay = envelope.decay;
    this.ampEnv.sustain = envelope.sustain;
    this.ampEnv.release = envelope.release;
    this.filterEnv.attack = envelope.attack;
    this.filterEnv.release = envelope.release;
    this.releaseTime = envelope.release;
  }

  setFilter(filter: FilterSettings): void {
    this.filter.Q.value = filter.resonance;
    this.filterEnv.baseFrequency = filter.cutoff;
    this.filterEnv.octaves = filter.envAmount;
    this.filterEnv.decay = filter.envDecay;
  }

  triggerAttack(frequency: number, time: number, velocity: number): void {
    if (!this.wave) return;

    if (this.osc && this.osc.getStateAtTime(time) === 'started') {
      // Retriggered during release: keep the running oscillator (no phase
      // reset, no click) and cancel its scheduled stop.
      this.osc.cancelStop();
      this.osc.frequency.setValueAtTime(frequency, time);
    } else {
      const osc = new Tone.ToneOscillatorNode({
        frequency,
        detune: this.detuneCents,
        onended: () => {
          // OneShotSource disposes itself after onended
          if (this.osc === osc) this.osc = null;
        },
      });
      osc.setPeriodicWave(this.wave);
      osc.connect(this.filter);
      osc.start(time);
      this.osc = osc;
    }

    // Velocity scales both loudness and how far the filter opens
    this.ampEnv.triggerAttack(time, velocity);
    this.filterEnv.triggerAttack(time, velocity);
  }

  triggerRelease(time: number): void {
    this.ampEnv.triggerRelease(time);
    this.filterEnv.triggerRelease(time);
    if (this.osc && this.osc.getStateAtTime(time) === 'started') {
      this.osc.stop(time + this.releaseTime + STOP_TAIL);
    }
  }

  dispose(): void {
    this.osc?.dispose();
    this.osc = null;
    this.filterEnv.dispose();
    this.filter.dispose();
    this.ampEnv.dispose();
  }
}
