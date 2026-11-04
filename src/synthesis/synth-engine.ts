// Synth Engine
// Tone.js-based wavetable synthesizer with 3 oscillator layers
//
// Signal flow per layer:
//   WavetableVoice ×6 (PeriodicWave osc → lowpass → amp env) → Volume → Panner → master
// Master → EffectsChain → Destination

import * as Tone from 'tone';
import type { ADSREnvelope, FilterSettings, OscillatorTuning } from '../types';
import { DEFAULT_BODY, DEFAULT_ENVELOPE, DEFAULT_FILTER, DEFAULT_TUNING } from '../types';
import { applyFundamentalBody, computeHarmonicsFromWavetable, type WavetableHarmonics } from './wavetable';
import { EffectsChain, getEffectsChain } from './effects-chain';
import { WavetableVoice } from './wavetable-voice';

// Maximum polyphony per oscillator
const MAX_VOICES = 6;
const NUM_OSCILLATORS = 3;

// Harmonics per wavetable (band limit)
const NUM_PARTIALS = 64;

// Small lookahead for stable audio timing (in seconds)
const AUDIO_LOOKAHEAD = 0.01;

interface OscillatorLayer {
  voices: WavetableVoice[];
  availableVoices: Set<WavetableVoice>; // O(1) voice availability tracking
  volume: Tone.Volume;
  panner: Tone.Panner;
  wavetable: Float32Array | null;
  harmonics: WavetableHarmonics | null;
  dayLabel: string;
  level: number;
  tuning: OscillatorTuning;
}

interface ActiveVoice {
  layer: OscillatorLayer;
  voice: WavetableVoice;
}

export class GlucoseSynth {
  private oscillators: OscillatorLayer[] = [];
  private activeVoices: Map<string, ActiveVoice[]> = new Map();
  private masterVolume: Tone.Volume;
  private effectsChain: EffectsChain;
  private envelope: ADSREnvelope = { ...DEFAULT_ENVELOPE };
  private filter: FilterSettings = { ...DEFAULT_FILTER };
  private body: number = DEFAULT_BODY;
  private isInitialized = false;
  private userVolume: number = 0.7; // Store user's intended volume

  constructor() {
    // Initialize effects chain
    this.effectsChain = getEffectsChain();

    // Route: Master Volume → Effects Chain → Destination
    this.masterVolume = new Tone.Volume(-6);
    this.masterVolume.connect(this.effectsChain.getInput());
    this.effectsChain.getOutput().toDestination();

    this.initializeOscillators();
  }

  /**
   * Initialize all oscillator layers
   */
  private initializeOscillators(): void {
    for (let osc = 0; osc < NUM_OSCILLATORS; osc++) {
      const panner = new Tone.Panner(0).connect(this.masterVolume);
      const volume = new Tone.Volume(0).connect(panner);
      const voices: WavetableVoice[] = [];
      const availableVoices = new Set<WavetableVoice>();

      for (let i = 0; i < MAX_VOICES; i++) {
        const voice = new WavetableVoice(volume, this.envelope, this.filter);
        voices.push(voice);
        availableVoices.add(voice); // All voices start available
      }

      this.oscillators.push({
        voices,
        availableVoices,
        volume,
        panner,
        wavetable: null,
        harmonics: null,
        dayLabel: '',
        level: 0.5, // All oscillators start at half volume
        tuning: { ...DEFAULT_TUNING },
      });
    }
  }

  /**
   * Start audio context (must be called from user interaction)
   */
  async start(): Promise<void> {
    if (this.isInitialized) return;

    await Tone.start();
    this.isInitialized = true;
    console.log('Audio context started');
  }

  /**
   * Check if audio is initialized
   */
  get initialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get number of oscillators
   */
  get oscillatorCount(): number {
    return NUM_OSCILLATORS;
  }

  /**
   * Load a wavetable into a specific oscillator
   */
  setWavetable(oscillatorIndex: number, wavetable: Float32Array, dayLabel: string = ''): void {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return;

    const osc = this.oscillators[oscillatorIndex];
    osc.wavetable = wavetable;
    osc.harmonics = computeHarmonicsFromWavetable(wavetable, NUM_PARTIALS);
    osc.dayLabel = dayLabel;

    this.updateOscillatorWave(oscillatorIndex);
    this.updateGainCompensation();
  }

  /**
   * Clear wavetable from an oscillator
   */
  clearWavetable(oscillatorIndex: number): void {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return;

    const osc = this.oscillators[oscillatorIndex];
    osc.wavetable = null;
    osc.harmonics = null;
    osc.dayLabel = '';

    // Sounding notes keep their wave until released; new notes skip this layer
    for (const voice of osc.voices) {
      voice.setWave(null);
    }

    this.updateGainCompensation();
  }

  /**
   * Count active oscillators (those with wavetables and level > 0)
   */
  private getActiveOscillatorCount(): number {
    return this.oscillators.filter(osc => osc.wavetable !== null && osc.level > 0).length;
  }

  /**
   * Update master volume to compensate for number of active oscillators
   */
  private updateGainCompensation(): void {
    const activeCount = this.getActiveOscillatorCount();
    const compensatedVolume = activeCount > 0
      ? this.userVolume / Math.sqrt(activeCount)  // Use sqrt for more natural mixing
      : this.userVolume;

    const db = compensatedVolume > 0 ? 20 * Math.log10(compensatedVolume) : -60;
    this.masterVolume.volume.value = Math.max(-60, Math.min(0, db));
  }

  /**
   * Get wavetable info for an oscillator
   */
  getOscillatorInfo(oscillatorIndex: number): { wavetable: Float32Array | null; dayLabel: string; level: number } | null {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return null;
    const osc = this.oscillators[oscillatorIndex];
    return {
      wavetable: osc.wavetable,
      dayLabel: osc.dayLabel,
      level: osc.level,
    };
  }

  /**
   * Set oscillator mix level (0-1)
   */
  setOscillatorLevel(oscillatorIndex: number, level: number): void {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return;

    const osc = this.oscillators[oscillatorIndex];
    osc.level = Math.max(0, Math.min(1, level));

    // Convert to dB
    const db = osc.level > 0 ? 20 * Math.log10(osc.level) : -60;
    osc.volume.volume.value = Math.max(-60, Math.min(0, db));

    // Update gain compensation when levels change
    this.updateGainCompensation();
  }

  /**
   * Get oscillator level
   */
  getOscillatorLevel(oscillatorIndex: number): number {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return 0;
    return this.oscillators[oscillatorIndex].level;
  }

  /**
   * Set octave / semitone / fine detune and pan for an oscillator
   */
  setOscillatorTuning(oscillatorIndex: number, tuning: Partial<OscillatorTuning>): void {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return;

    const osc = this.oscillators[oscillatorIndex];
    const next = { ...osc.tuning, ...tuning };
    osc.tuning = {
      octave: Math.round(Math.max(-2, Math.min(2, next.octave))),
      semitone: Math.round(Math.max(-12, Math.min(12, next.semitone))),
      fine: Math.max(-50, Math.min(50, next.fine)),
      pan: Math.max(-1, Math.min(1, next.pan)),
    };

    const cents = osc.tuning.octave * 1200 + osc.tuning.semitone * 100 + osc.tuning.fine;
    for (const voice of osc.voices) {
      voice.setDetune(cents);
    }
    osc.panner.pan.value = osc.tuning.pan;
  }

  /**
   * Get tuning for an oscillator
   */
  getOscillatorTuning(oscillatorIndex: number): OscillatorTuning {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return { ...DEFAULT_TUNING };
    return { ...this.oscillators[oscillatorIndex].tuning };
  }

  /**
   * Rebuild an oscillator's PeriodicWave from its harmonics and the body setting
   */
  private updateOscillatorWave(oscillatorIndex: number): void {
    const osc = this.oscillators[oscillatorIndex];
    if (!osc.harmonics) return;

    const { real, imag } = applyFundamentalBody(osc.harmonics, this.body);
    const wave = Tone.getContext().createPeriodicWave(real, imag);
    for (const voice of osc.voices) {
      voice.setWave(wave);
    }
  }

  /**
   * Set fundamental reinforcement (0-1). See applyFundamentalBody().
   */
  setBody(body: number): void {
    this.body = Math.max(0, Math.min(1, body));
    for (let i = 0; i < NUM_OSCILLATORS; i++) {
      this.updateOscillatorWave(i);
    }
  }

  getBody(): number {
    return this.body;
  }

  /**
   * Set ADSR envelope for all oscillators
   */
  setEnvelope(envelope: Partial<ADSREnvelope>): void {
    this.envelope = { ...this.envelope, ...envelope };

    for (const osc of this.oscillators) {
      for (const voice of osc.voices) {
        voice.setEnvelope(this.envelope);
      }
    }
  }

  /**
   * Set per-voice filter settings for all oscillators
   */
  setFilter(filter: Partial<FilterSettings>): void {
    this.filter = { ...this.filter, ...filter };

    for (const osc of this.oscillators) {
      for (const voice of osc.voices) {
        voice.setFilter(this.filter);
      }
    }
  }

  getFilter(): FilterSettings {
    return { ...this.filter };
  }

  /**
   * Set master volume (0-1)
   */
  setVolume(volume: number): void {
    this.userVolume = Math.max(0, Math.min(1, volume));
    this.updateGainCompensation();
  }

  /**
   * Trigger a note on all active oscillators
   * Uses O(1) voice allocation via Set lookup
   */
  noteOn(note: string, velocity: number = 0.8): void {
    if (!this.isInitialized) {
      console.warn('Audio not initialized. Call start() first.');
      return;
    }

    if (this.activeVoices.has(note)) {
      return;
    }

    const activeForNote: ActiveVoice[] = [];
    const triggerTime = Tone.now() + AUDIO_LOOKAHEAD; // Slight lookahead for stable timing
    const frequency = Tone.Frequency(note).toFrequency();

    for (const osc of this.oscillators) {
      // Skip oscillators with no wavetable or zero level
      if (!osc.wavetable || osc.level === 0) continue;

      // O(1) voice allocation - get first available voice from Set
      const voice = osc.availableVoices.values().next().value;

      if (voice) {
        osc.availableVoices.delete(voice); // Mark as in use
        voice.triggerAttack(frequency, triggerTime, velocity);
        activeForNote.push({ layer: osc, voice });
      }
    }

    if (activeForNote.length > 0) {
      this.activeVoices.set(note, activeForNote);
    }
  }

  /**
   * Trigger a note off
   * Returns voices to the available pool
   */
  noteOff(note: string): void {
    const voices = this.activeVoices.get(note);
    if (voices) {
      const releaseTime = Tone.now() + AUDIO_LOOKAHEAD;
      for (const { layer, voice } of voices) {
        voice.triggerRelease(releaseTime);
        layer.availableVoices.add(voice);
      }
      this.activeVoices.delete(note);
    }
  }

  /**
   * Stop all notes
   * Returns all voices to available pools
   */
  allNotesOff(): void {
    const releaseTime = Tone.now() + AUDIO_LOOKAHEAD;
    for (const [, voices] of this.activeVoices) {
      for (const { layer, voice } of voices) {
        voice.triggerRelease(releaseTime);
        layer.availableVoices.add(voice);
      }
    }
    this.activeVoices.clear();
  }

  /**
   * Get current envelope settings
   */
  getEnvelope(): ADSREnvelope {
    return { ...this.envelope };
  }

  /**
   * Get the effects chain
   */
  getEffectsChain(): EffectsChain {
    return this.effectsChain;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.allNotesOff();
    for (const osc of this.oscillators) {
      for (const voice of osc.voices) {
        voice.dispose();
      }
      osc.volume.dispose();
      osc.panner.dispose();
    }
    this.masterVolume.dispose();
    this.effectsChain.dispose();
    this.oscillators = [];
    this.activeVoices.clear();
  }
}

// Singleton instance
let synthInstance: GlucoseSynth | null = null;

export function getSynth(): GlucoseSynth {
  if (!synthInstance) {
    synthInstance = new GlucoseSynth();
  }
  return synthInstance;
}

/**
 * Convert MIDI note number to note name
 */
export function midiToNoteName(midiNote: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = noteNames[midiNote % 12];
  return `${noteName}${octave}`;
}

/**
 * Convert note name to frequency
 */
export function noteToFrequency(note: string): number {
  return Tone.Frequency(note).toFrequency();
}
