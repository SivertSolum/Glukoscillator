// Glucose → Voice Mapping
// Data-driven values for the synth voice (filter, body, per-oscillator
// tuning/pan/unison), used by Randomize / Mutate alongside the effects and
// envelope mapping. See docs/glucose-sound-design.md.

import type { FilterSettings, OscillatorTuning } from '../types';
import { DEFAULT_TUNING, FILTER_RANGES, MAX_UNISON, normalizedToCutoff } from '../types';
import {
  normalizeGlucoseStat,
  scaleInRange,
  amplifyValue,
  addRandomSpread,
  type GlucoseStatsWithVolatility,
} from './effects-config';
import type { RandomSource } from './random';

// Musical ranges for the mapping (narrower than the knob ranges on purpose)
export const VOICE_RANGES = {
  cutoffNormalized: { min: 0.55, max: 1.0 }, // ≈ 850 Hz … 18 kHz on the log knob
  resonance: { min: 0.7, max: 6 },
  envAmount: { min: 0, max: 4 },             // octaves
  envDecay: { min: 0.08, max: 1.2 },         // seconds
  body: { min: 0.25, max: 0.9 },
  fine: { min: 2, max: 20 },                 // cents, magnitude
  pan: { min: 0.1, max: 0.7 },               // spread of osc 2/3 from center
  unisonDetune: { min: 6, max: 35 },         // cents
};

// Consonant intervals (semitones) a non-root oscillator may be shifted by
const INTERVALS = [7, 5, -5, -7];

export interface VoiceMapping {
  filter: FilterSettings;
  body: number;
  /** One entry per oscillator; null = no day assigned, leave as is */
  tunings: (OscillatorTuning | null)[];
}

/**
 * Compute voice settings from glucose stats.
 * @param combined  stats averaged over all assigned days (drives shared settings)
 * @param perOscillator  each oscillator's own day stats (drives its tuning), null if empty
 * @param rng  seeded source → reproducible "signature" sound per set of days
 */
export function computeVoiceFromGlucose(
  combined: GlucoseStatsWithVolatility,
  perOscillator: (GlucoseStatsWithVolatility | null)[],
  rng: RandomSource
): VoiceMapping {
  const volatilityNorm = normalizeGlucoseStat(combined.volatility, 'volatility');
  const avgNorm = normalizeGlucoseStat(combined.avg, 'average');
  const tirNorm = normalizeGlucoseStat(combined.timeInRange, 'timeInRange');
  const rangeNorm = normalizeGlucoseStat(combined.range, 'range');
  const cvNorm = normalizeGlucoseStat(combined.coefficientOfVariation, 'coefficientOfVariation');
  const rocNorm = normalizeGlucoseStat(combined.rateOfChange, 'rateOfChange');

  // Same composites as the effects/envelope mapping
  const chaosMetric = amplifyValue((volatilityNorm + cvNorm + rocNorm) / 3, 1.5);
  const qualityMetric = amplifyValue((tirNorm + (1 - volatilityNorm)) / 2, 1.5);

  // --- Filter -------------------------------------------------------------
  // Volatile / high days = brighter; calm days = warmer
  const brightness = addRandomSpread(chaosMetric * 0.7 + avgNorm * 0.3, 0.15, rng);
  const cutoff = normalizedToCutoff(
    scaleInRange(brightness, VOICE_RANGES.cutoffNormalized.min, VOICE_RANGES.cutoffNormalized.max)
  );
  // Sharp rises/falls = resonant peak
  const resonance = scaleInRange(
    addRandomSpread(amplifyValue(rocNorm, 1.5), 0.2, rng),
    VOICE_RANGES.resonance.min, VOICE_RANGES.resonance.max
  );
  // Wide glucose range = bigger filter sweep
  const envAmount = scaleInRange(
    addRandomSpread(amplifyValue(rangeNorm, 1.5), 0.2, rng),
    VOICE_RANGES.envAmount.min, VOICE_RANGES.envAmount.max
  );
  // Rapid changes = short, plucky sweep; slow drifts = long sweep
  const envDecay = scaleInRange(
    addRandomSpread(1 - amplifyValue(rocNorm, 1.5), 0.2, rng),
    VOICE_RANGES.envDecay.min, VOICE_RANGES.envDecay.max
  );

  // --- Body ---------------------------------------------------------------
  // Good control = grounded, clearly pitched; poor control = rawer spectrum
  const body = scaleInRange(addRandomSpread(qualityMetric, 0.15, rng), VOICE_RANGES.body.min, VOICE_RANGES.body.max);

  // --- Shared stereo / unison character -----------------------------------
  // Good control = wide stereo image
  const panWidth = scaleInRange(addRandomSpread(qualityMetric, 0.15, rng), VOICE_RANGES.pan.min, VOICE_RANGES.pan.max);
  // Calm days = lush unison stack; chaotic days = single, exposed oscillator
  const unisonAmount = addRandomSpread(1 - chaosMetric, 0.2, rng);
  const unison = Math.max(1, Math.min(MAX_UNISON, 1 + Math.round(unisonAmount * (MAX_UNISON - 1))));

  // --- Per-oscillator tuning (each oscillator's own day) ------------------
  const panPositions = [0, -panWidth, panWidth];
  const fineSigns = [0, 1, -1];

  const tunings = perOscillator.map((stats, i): OscillatorTuning | null => {
    if (!stats) return null;

    const dayAvg = normalizeGlucoseStat(stats.avg, 'average');
    const dayTir = normalizeGlucoseStat(stats.timeInRange, 'timeInRange');
    const dayCv = normalizeGlucoseStat(stats.coefficientOfVariation, 'coefficientOfVariation');
    const dayRange = normalizeGlucoseStat(stats.range, 'range');

    // OSC 1 is the root; others move up an octave on high days, down on low days
    let octave = 0;
    let semitone = 0;
    if (i > 0) {
      if (dayAvg >= 0.75) octave = 1;
      else if (dayAvg <= 0.25) octave = -1;

      // Days with poorer time in range are more likely to sit on an interval
      const intervalChance = 0.25 + 0.5 * (1 - dayTir);
      if (rng() < intervalChance) {
        semitone = INTERVALS[Math.floor(rng() * INTERVALS.length)];
      }
    }

    // Unstable days drift further out of tune (beating against the root)
    const fine = (fineSigns[i] ?? 0) * scaleInRange(addRandomSpread(dayCv, 0.2, rng), VOICE_RANGES.fine.min, VOICE_RANGES.fine.max);

    // A day's spread sets how wide its unison stack is detuned
    const unisonDetune = scaleInRange(addRandomSpread(dayRange, 0.2, rng), VOICE_RANGES.unisonDetune.min, VOICE_RANGES.unisonDetune.max);

    return {
      ...DEFAULT_TUNING,
      octave,
      semitone,
      fine: Math.round(fine),
      pan: Math.round((panPositions[i] ?? 0) * 100) / 100,
      unison,
      unisonDetune: Math.round(unisonDetune),
    };
  });

  return {
    filter: {
      cutoff,
      resonance: Math.max(FILTER_RANGES.resonance.min, resonance),
      envAmount,
      envDecay,
    },
    body,
    tunings,
  };
}
