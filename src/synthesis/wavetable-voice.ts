// Wavetable Voice
// One polyphonic voice: PeriodicWave oscillator(s) → lowpass filter → amp envelope.
//
// Tone.Synth/Tone.Oscillator only accept sine-partial amplitudes, which throws
// away harmonic phase. This voice drives Tone's low-level ToneOscillatorNode
// with a full PeriodicWave (real + imag) so the played waveform matches the
// glucose curve, and adds a per-voice filter with its own envelope.
//
// Unison: up to MAX_UNISON oscillators per voice, detuned symmetrically and
// spread across the stereo field, summed before the filter.

import * as Tone from 'tone';
import type { ADSREnvelope, FilterSettings } from '../types';
import { MAX_UNISON } from '../types';

// Extra time after the amp release before the oscillators are stopped
const STOP_TAIL = 0.05;

// Stereo width of the outermost unison oscillators (-1..1)
const UNISON_PAN_WIDTH = 0.6;

/** Oscillators started together for one note */
interface OscGroup {
  oscs: Tone.ToneOscillatorNode[];
  remaining: number;
}

export class WavetableVoice {
  private group: OscGroup | null = null;
  private wave: PeriodicWave | null = null;
  private detuneCents = 0;
  private unison = 1;
  private unisonDetune = 0;
  private releaseTime: number;

  private readonly unisonPanners: Tone.Panner[] = [];
  private readonly unisonGain: Tone.Gain;
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

    // Unison oscillators → own panner → shared gain (level compensation) → filter
    this.unisonGain = new Tone.Gain(1).connect(this.filter);
    for (let i = 0; i < MAX_UNISON; i++) {
      this.unisonPanners.push(new Tone.Panner(0).connect(this.unisonGain));
    }
    this.applyUnisonLayout();
  }

  setWave(wave: PeriodicWave | null): void {
    this.wave = wave;
    if (wave && this.group) {
      for (const osc of this.group.oscs) osc.setPeriodicWave(wave);
    }
  }

  setDetune(cents: number): void {
    this.detuneCents = cents;
    this.applyGroupDetune();
  }

  /**
   * Set unison size and spread. A new size applies from the next note;
   * spread (and pan layout for the current size) apply immediately.
   */
  setUnison(voices: number, detuneCents: number): void {
    this.unison = Math.max(1, Math.min(MAX_UNISON, Math.round(voices)));
    this.unisonDetune = Math.max(0, detuneCents);
    this.applyUnisonLayout();
    this.applyGroupDetune();
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

    const running = this.group;
    if (running && running.oscs.length === this.unison && running.oscs[0].getStateAtTime(time) === 'started') {
      // Retriggered during release with the same unison size: keep the
      // running oscillators (no phase reset, no click) and cancel their stop.
      for (const osc of running.oscs) {
        osc.cancelStop();
        osc.frequency.setValueAtTime(frequency, time);
      }
    } else {
      if (running) {
        for (const osc of running.oscs) {
          if (osc.getStateAtTime(time) === 'started') osc.stop(time);
        }
      }
      this.group = this.startGroup(frequency, time);
    }

    // Velocity scales both loudness and how far the filter opens
    this.ampEnv.triggerAttack(time, velocity);
    this.filterEnv.triggerAttack(time, velocity);
  }

  triggerRelease(time: number): void {
    this.ampEnv.triggerRelease(time);
    this.filterEnv.triggerRelease(time);
    if (this.group) {
      for (const osc of this.group.oscs) {
        if (osc.getStateAtTime(time) === 'started') {
          osc.stop(time + this.releaseTime + STOP_TAIL);
        }
      }
    }
  }

  dispose(): void {
    if (this.group) {
      for (const osc of this.group.oscs) osc.dispose();
    }
    this.group = null;
    this.filterEnv.dispose();
    this.filter.dispose();
    this.ampEnv.dispose();
    this.unisonGain.dispose();
    for (const panner of this.unisonPanners) panner.dispose();
  }

  private startGroup(frequency: number, time: number): OscGroup {
    const wave = this.wave!;
    const group: OscGroup = { oscs: [], remaining: this.unison };
    const period = 1 / frequency;

    for (let i = 0; i < this.unison; i++) {
      const osc = new Tone.ToneOscillatorNode({
        frequency,
        detune: this.detuneCents + this.unisonOffset(i, this.unison),
        onended: () => {
          // OneShotSource disposes itself after onended
          group.remaining--;
          if (group.remaining <= 0 && this.group === group) this.group = null;
        },
      });
      osc.setPeriodicWave(wave);
      osc.connect(this.unisonPanners[i]);
      // Stagger unison starts by a random fraction of a cycle so the copies
      // don't begin phase-aligned (avoids a summed spike at note-on)
      osc.start(i === 0 ? time : time + Math.random() * period);
      group.oscs.push(osc);
    }

    return group;
  }

  /** Cents offset for unison oscillator i of n, spread symmetrically */
  private unisonOffset(i: number, n: number): number {
    if (n <= 1) return 0;
    return this.unisonDetune * (i / (n - 1) - 0.5);
  }

  private applyGroupDetune(): void {
    if (!this.group) return;
    const n = this.group.oscs.length;
    this.group.oscs.forEach((osc, i) => {
      osc.detune.value = this.detuneCents + this.unisonOffset(i, n);
    });
  }

  private applyUnisonLayout(): void {
    const n = this.unison;
    for (let i = 0; i < MAX_UNISON; i++) {
      const pan = n <= 1 ? 0 : UNISON_PAN_WIDTH * (2 * i / (n - 1) - 1);
      this.unisonPanners[i].pan.value = i < n ? pan : 0;
    }
    // Uncorrelated (detuned) copies add roughly by power
    this.unisonGain.gain.value = 1 / Math.sqrt(n);
  }
}
