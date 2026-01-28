// Synth Engine
// Tone.js-based wavetable synthesizer with 3 oscillator layers

import * as Tone from 'tone';
import type { ADSREnvelope } from '../types';
import { DEFAULT_ENVELOPE } from '../types';
import { computePartialsFromWavetable } from './wavetable';
import { EffectsChain, getEffectsChain } from './effects-chain';

// Maximum polyphony per oscillator
const MAX_VOICES = 6;
const NUM_OSCILLATORS = 3;

// Small lookahead for stable audio timing (in seconds)
const AUDIO_LOOKAHEAD = 0.01;

interface OscillatorLayer {
  synths: Tone.Synth[];
  availableVoices: Set<Tone.Synth>; // O(1) voice availability tracking
  volume: Tone.Volume;
  wavetable: Float32Array | null;
  partials: number[];
  dayLabel: string;
  level: number;
}

export class GlucoseSynth {
  private oscillators: OscillatorLayer[] = [];
  private activeVoices: Map<string, Tone.Synth[]> = new Map();
  private masterVolume: Tone.Volume;
  private effectsChain: EffectsChain;
  private envelope: ADSREnvelope = { ...DEFAULT_ENVELOPE };
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
      const volume = new Tone.Volume(0).connect(this.masterVolume);
      const synths: Tone.Synth[] = [];
      const availableVoices = new Set<Tone.Synth>();

      for (let i = 0; i < MAX_VOICES; i++) {
        const synth = new Tone.Synth({
          oscillator: {
            type: 'sine',
          },
          envelope: {
            attack: this.envelope.attack,
            decay: this.envelope.decay,
            sustain: this.envelope.sustain,
            release: this.envelope.release,
          },
        }).connect(volume);

        synths.push(synth);
        availableVoices.add(synth); // All voices start available
      }

      this.oscillators.push({
        synths,
        availableVoices,
        volume,
        wavetable: null,
        partials: [],
        dayLabel: '',
        level: osc === 0 ? 1 : 0.5, // First osc full, others half
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
    osc.partials = computePartialsFromWavetable(wavetable, 64);
    osc.dayLabel = dayLabel;
    
    this.updateOscillatorPartials(oscillatorIndex);
    this.updateGainCompensation();
  }

  /**
   * Clear wavetable from an oscillator
   */
  clearWavetable(oscillatorIndex: number): void {
    if (oscillatorIndex < 0 || oscillatorIndex >= NUM_OSCILLATORS) return;

    const osc = this.oscillators[oscillatorIndex];
    osc.wavetable = null;
    osc.partials = [];
    osc.dayLabel = '';
    
    // Reset to sine wave
    for (const synth of osc.synths) {
      synth.oscillator.type = 'sine';
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
   * Update oscillator partials
   */
  private updateOscillatorPartials(oscillatorIndex: number): void {
    const osc = this.oscillators[oscillatorIndex];
    if (osc.partials.length === 0) return;

    for (const synth of osc.synths) {
      try {
        synth.oscillator.type = 'custom';
        (synth.oscillator as any).partials = osc.partials;
      } catch (e) {
        console.warn('Failed to set custom oscillator:', e);
      }
    }
  }

  /**
   * Set ADSR envelope for all oscillators
   */
  setEnvelope(envelope: Partial<ADSREnvelope>): void {
    this.envelope = { ...this.envelope, ...envelope };
    
    for (const osc of this.oscillators) {
      for (const synth of osc.synths) {
        synth.envelope.attack = this.envelope.attack;
        synth.envelope.decay = this.envelope.decay;
        synth.envelope.sustain = this.envelope.sustain;
        synth.envelope.release = this.envelope.release;
      }
    }
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

    const activeForNote: Tone.Synth[] = [];
    const triggerTime = Tone.now() + AUDIO_LOOKAHEAD; // Slight lookahead for stable timing

    for (const osc of this.oscillators) {
      // Skip oscillators with no wavetable or zero level
      if (!osc.wavetable || osc.level === 0) continue;

      // O(1) voice allocation - get first available voice from Set
      const availableVoice = osc.availableVoices.values().next().value;
      
      if (availableVoice) {
        osc.availableVoices.delete(availableVoice); // Mark as in use
        availableVoice.triggerAttack(note, triggerTime, velocity);
        activeForNote.push(availableVoice);
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
      for (const voice of voices) {
        voice.triggerRelease(releaseTime);
        // Return voice to available pool after release time
        // Find which oscillator owns this voice and return it
        for (const osc of this.oscillators) {
          if (osc.synths.includes(voice)) {
            osc.availableVoices.add(voice);
            break;
          }
        }
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
      for (const voice of voices) {
        voice.triggerRelease(releaseTime);
        // Return voice to available pool
        for (const osc of this.oscillators) {
          if (osc.synths.includes(voice)) {
            osc.availableVoices.add(voice);
            break;
          }
        }
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
      for (const synth of osc.synths) {
        synth.dispose();
      }
      osc.volume.dispose();
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
