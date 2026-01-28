// Wavetable Generation
// Converts glucose readings into playable waveforms

import type { DailyGlucoseData } from '../types';
import { GLUCOSE_RANGE } from '../types';

// Standard wavetable size (power of 2 for FFT efficiency)
export const WAVETABLE_SIZE = 2048;

// Pre-computed twiddle factors for FFT (cached for performance)
let twiddleFactorsReal: Float32Array | null = null;
let twiddleFactorsImag: Float32Array | null = null;
let twiddleSize = 0;

/**
 * Initialize twiddle factors for FFT
 * These are pre-computed complex exponentials used in the FFT algorithm
 */
function initTwiddleFactors(size: number): void {
  if (twiddleSize === size && twiddleFactorsReal && twiddleFactorsImag) return;
  
  twiddleSize = size;
  twiddleFactorsReal = new Float32Array(size / 2);
  twiddleFactorsImag = new Float32Array(size / 2);
  
  for (let i = 0; i < size / 2; i++) {
    const angle = (-2 * Math.PI * i) / size;
    twiddleFactorsReal[i] = Math.cos(angle);
    twiddleFactorsImag[i] = Math.sin(angle);
  }
}

/**
 * Bit-reversal permutation for in-place FFT
 */
function bitReverse(arr: Float32Array, n: number): void {
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) {
    let reversed = 0;
    let num = i;
    for (let j = 0; j < bits; j++) {
      reversed = (reversed << 1) | (num & 1);
      num >>= 1;
    }
    if (reversed > i) {
      const temp = arr[i];
      arr[i] = arr[reversed];
      arr[reversed] = temp;
    }
  }
}

/**
 * Cooley-Tukey FFT algorithm - O(n log n) complexity
 * Returns magnitude spectrum for the first numPartials harmonics
 */
function fft(input: Float32Array, numPartials: number): number[] {
  const N = input.length;
  
  // Ensure N is a power of 2
  if ((N & (N - 1)) !== 0) {
    throw new Error('FFT size must be a power of 2');
  }
  
  initTwiddleFactors(N);
  
  // Create working arrays for real and imaginary parts
  const real = new Float32Array(input);
  const imag = new Float32Array(N);
  
  // Bit-reversal permutation
  bitReverse(real, N);
  bitReverse(imag, N);
  
  // Cooley-Tukey iterative FFT
  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const step = N / size;
    
    for (let i = 0; i < N; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const twiddleIdx = j * step;
        const tReal = twiddleFactorsReal![twiddleIdx];
        const tImag = twiddleFactorsImag![twiddleIdx];
        
        const idx1 = i + j;
        const idx2 = i + j + halfSize;
        
        // Complex multiplication: (a + bi) * (c + di) = (ac - bd) + (ad + bc)i
        const tempReal = real[idx2] * tReal - imag[idx2] * tImag;
        const tempImag = real[idx2] * tImag + imag[idx2] * tReal;
        
        // Butterfly operation
        real[idx2] = real[idx1] - tempReal;
        imag[idx2] = imag[idx1] - tempImag;
        real[idx1] = real[idx1] + tempReal;
        imag[idx1] = imag[idx1] + tempImag;
      }
    }
  }
  
  // Extract magnitudes for the requested number of partials
  const partials: number[] = [];
  const normFactor = 2 / N;
  
  for (let k = 1; k <= numPartials; k++) {
    const magnitude = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]) * normFactor;
    partials.push(magnitude);
  }
  
  // Normalize so fundamental is 1
  const fundamental = partials[0] || 1;
  return partials.map(p => p / fundamental);
}

/**
 * Generate a wavetable from a day's glucose readings
 * The glucose curve becomes a single-cycle waveform
 */
export function generateWavetable(dayData: DailyGlucoseData): Float32Array {
  const readings = dayData.readings;
  
  if (readings.length === 0) {
    // Return silence if no data
    return new Float32Array(WAVETABLE_SIZE).fill(0);
  }
  
  // Extract just the glucose values
  const values = readings.map(r => r.value);
  
  // Normalize to [-1, 1] range
  const normalized = normalizeGlucoseValues(values);
  
  // Resample to wavetable size
  const wavetable = resampleToWavetableSize(normalized, WAVETABLE_SIZE);
  
  // Apply smoothing to reduce aliasing
  smoothWavetable(wavetable);
  
  return wavetable;
}

/**
 * Normalize glucose values to [-1, 1] audio range
 * Uses the day's min/max for maximum dynamic range
 */
export function normalizeGlucoseValues(values: number[]): Float32Array {
  if (values.length === 0) {
    return new Float32Array(0);
  }
  
  // Use day's actual range for normalization
  // This gives each day its unique character
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  // Prevent division by zero (flat line)
  if (range === 0) {
    return new Float32Array(values.length).fill(0);
  }
  
  const normalized = new Float32Array(values.length);
  
  for (let i = 0; i < values.length; i++) {
    // Map to [-1, 1]
    normalized[i] = ((values[i] - min) / range) * 2 - 1;
  }
  
  return normalized;
}

/**
 * Alternative normalization using fixed physiological range
 * Useful for comparing days against each other
 */
export function normalizeToPhysiologicalRange(values: number[]): Float32Array {
  const { min, max } = GLUCOSE_RANGE.absolute;
  const range = max - min;
  
  const normalized = new Float32Array(values.length);
  
  for (let i = 0; i < values.length; i++) {
    // Clamp to physiological range
    const clamped = Math.max(min, Math.min(max, values[i]));
    // Map to [-1, 1]
    normalized[i] = ((clamped - min) / range) * 2 - 1;
  }
  
  return normalized;
}

/**
 * Resample normalized values to standard wavetable size
 * Uses linear interpolation
 */
function resampleToWavetableSize(values: Float32Array, targetSize: number): Float32Array {
  if (values.length === 0) {
    return new Float32Array(targetSize).fill(0);
  }
  
  if (values.length === targetSize) {
    return values;
  }
  
  const result = new Float32Array(targetSize);
  const ratio = values.length / targetSize;
  
  for (let i = 0; i < targetSize; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, values.length - 1);
    const fraction = srcIndex - srcIndexFloor;
    
    // Linear interpolation
    result[i] = values[srcIndexFloor] * (1 - fraction) + values[srcIndexCeil] * fraction;
  }
  
  return result;
}

// Reusable buffer for smoothing operations (avoids allocation in hot path)
let smoothingBuffer: Float32Array | null = null;

/**
 * Apply gentle smoothing to reduce harsh high frequencies
 * Uses a reusable buffer to avoid allocations
 */
function smoothWavetable(wavetable: Float32Array, passes: number = 2): void {
  // Reuse or create buffer
  if (!smoothingBuffer || smoothingBuffer.length !== wavetable.length) {
    smoothingBuffer = new Float32Array(wavetable.length);
  }
  const temp = smoothingBuffer;
  const len = wavetable.length;
  
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < len; i++) {
      const prev = wavetable[(i - 1 + len) % len];
      const curr = wavetable[i];
      const next = wavetable[(i + 1) % len];
      
      // 3-point moving average with emphasis on current
      temp[i] = prev * 0.25 + curr * 0.5 + next * 0.25;
    }
    
    // Copy back
    wavetable.set(temp);
  }
}

/**
 * Compute FFT partials from wavetable for Tone.js
 * Uses optimized Cooley-Tukey FFT algorithm - O(n log n) instead of O(n²)
 * Tone.js uses Fourier coefficients for custom oscillators
 */
export function computePartialsFromWavetable(wavetable: Float32Array, numPartials: number = 64): number[] {
  return fft(wavetable, numPartials);
}

/**
 * Generate wavetables for all days in the dataset
 */
export function generateAllWavetables(days: Map<string, DailyGlucoseData>): void {
  for (const [, dayData] of days) {
    dayData.wavetable = generateWavetable(dayData);
  }
}

/**
 * Get waveform data for visualization (downsampled for canvas)
 */
export function getWaveformForDisplay(wavetable: Float32Array, points: number = 200): number[] {
  const result: number[] = [];
  const step = wavetable.length / points;
  
  for (let i = 0; i < points; i++) {
    const index = Math.floor(i * step);
    result.push(wavetable[index]);
  }
  
  return result;
}

