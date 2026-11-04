// Core data types for the Glukoscillator

export interface GlucoseReading {
  timestamp: Date;
  value: number; // mg/dL or mmol/L
  recordType: number; // 0 = historic, 1 = scan
}

export interface DailyGlucoseData {
  date: string; // YYYY-MM-DD format
  readings: GlucoseReading[];
  wavetable: Float32Array | null;
  stats: {
    min: number;
    max: number;
    avg: number;
    timeInRange: number; // percentage
  };
}

export interface ParsedLibreViewData {
  days: Map<string, DailyGlucoseData>;
  unit: 'mg/dL' | 'mmol/L';
  deviceName: string;
  serialNumber: string;
}

export interface SynthState {
  currentDay: string | null;
  wavetable: Float32Array | null;
  envelope: ADSREnvelope;
  volume: number;
  activeNotes: Set<string>;
}

export interface ADSREnvelope {
  attack: number;  // seconds
  decay: number;   // seconds
  sustain: number; // 0-1 level
  release: number; // seconds
}

export const DEFAULT_ENVELOPE: ADSREnvelope = {
  attack: 0.02,
  decay: 0.1,
  sustain: 0.7,
  release: 0.3,
};

// Per-voice lowpass filter + filter envelope (shared by all oscillators)
export interface FilterSettings {
  cutoff: number;     // Hz — resting cutoff
  resonance: number;  // Q
  envAmount: number;  // octaves the filter envelope sweeps above cutoff
  envDecay: number;   // seconds for the sweep to fall back to cutoff
}

export const DEFAULT_FILTER: FilterSettings = {
  cutoff: 18000,
  resonance: 0.7,
  envAmount: 0,
  envDecay: 0.4,
};

// Per-oscillator pitch offset and stereo position
export interface OscillatorTuning {
  octave: number;    // -2..+2
  semitone: number;  // -12..+12
  fine: number;      // cents, -50..+50
  pan: number;       // -1 (left)..+1 (right)
}

export const DEFAULT_TUNING: OscillatorTuning = {
  octave: 0,
  semitone: 0,
  fine: 0,
  pan: 0,
};

// Default fundamental reinforcement (see applyFundamentalBody in wavetable.ts)
export const DEFAULT_BODY = 0.5;

// Glucose target range (mg/dL)
export const GLUCOSE_RANGE = {
  low: 70,
  targetMin: 70,
  targetMax: 180,
  high: 250,
  absolute: {
    min: 40,
    max: 400,
  },
};

// Piano key mappings
export interface KeyMapping {
  key: string;
  note: string;
  octave: number;
}

export const COMPUTER_KEY_MAP: KeyMapping[] = [
  // Lower row - C3 to B3
  { key: 'z', note: 'C', octave: 3 },
  { key: 's', note: 'C#', octave: 3 },
  { key: 'x', note: 'D', octave: 3 },
  { key: 'd', note: 'D#', octave: 3 },
  { key: 'c', note: 'E', octave: 3 },
  { key: 'v', note: 'F', octave: 3 },
  { key: 'g', note: 'F#', octave: 3 },
  { key: 'b', note: 'G', octave: 3 },
  { key: 'h', note: 'G#', octave: 3 },
  { key: 'n', note: 'A', octave: 3 },
  { key: 'j', note: 'A#', octave: 3 },
  { key: 'm', note: 'B', octave: 3 },
  // Upper row - C4 to B4
  { key: 'q', note: 'C', octave: 4 },
  { key: '2', note: 'C#', octave: 4 },
  { key: 'w', note: 'D', octave: 4 },
  { key: '3', note: 'D#', octave: 4 },
  { key: 'e', note: 'E', octave: 4 },
  { key: 'r', note: 'F', octave: 4 },
  { key: '5', note: 'F#', octave: 4 },
  { key: 't', note: 'G', octave: 4 },
  { key: '6', note: 'G#', octave: 4 },
  { key: 'y', note: 'A', octave: 4 },
  { key: '7', note: 'A#', octave: 4 },
  { key: 'u', note: 'B', octave: 4 },
  // Extended - C5 to E5
  { key: 'i', note: 'C', octave: 5 },
  { key: '9', note: 'C#', octave: 5 },
  { key: 'o', note: 'D', octave: 5 },
  { key: '0', note: 'D#', octave: 5 },
  { key: 'p', note: 'E', octave: 5 },
];

