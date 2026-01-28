// Effects Chain
// Reorderable audio effects with randomization support

import * as Tone from 'tone';
import type {
  EffectId,
  CompressorParams,
  EQ3Params,
  BitCrusherParams,
  DistortionParams,
  AutoWahParams,
  AutoFilterParams,
  PhaserParams,
  ChorusParams,
  TremoloParams,
  VibratoParams,
  FreqShiftParams,
  PitchShiftParams,
  DelayParams,
  ReverbParams,
  StereoWidenerParams,
  AllEffectParams,
  EffectChangeCallback,
  OrderChangeCallback,
} from './effects-types';
import { DEFAULT_ORDER, STORAGE_KEY, RANDOM_RANGES } from './effects-config';

// Re-export types and config for convenience
export * from './effects-types';
export { getEffectDisplayName } from './effects-config';

// Effect node wrapper
interface EffectNode {
  id: EffectId;
  node: Tone.ToneAudioNode;
  enabled: boolean;
}

export class EffectsChain {
  private effects: Map<EffectId, EffectNode> = new Map();
  private order: EffectId[] = [];
  private input: Tone.Gain;
  private output: Tone.Gain;
  private onChangeCallback: EffectChangeCallback | null = null;
  private onOrderChangeCallback: OrderChangeCallback | null = null;

  // Individual effect references for parameter access
  private compressor!: Tone.Compressor;
  private eq3!: Tone.EQ3;
  private bitcrusher!: Tone.BitCrusher;
  private distortion!: Tone.Distortion;
  private autowah!: Tone.AutoWah;
  private autofilter!: Tone.AutoFilter;
  private phaser!: Tone.Phaser;
  private chorus!: Tone.Chorus;
  private tremolo!: Tone.Tremolo;
  private vibrato!: Tone.Vibrato;
  private freqshift!: Tone.FrequencyShifter;
  private pitchshift!: Tone.PitchShift;
  private delay!: Tone.FeedbackDelay;
  private reverb!: Tone.Reverb;
  private stereowidener!: Tone.StereoWidener;

  constructor() {
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.initializeEffects();
    this.order = this.loadOrder();
    this.rewireChain();
  }

  private initializeEffects(): void {
    // Compressor
    this.compressor = new Tone.Compressor({ threshold: -20, ratio: 4, attack: 0.003, release: 0.25 });
    this.effects.set('compressor', { id: 'compressor', node: this.compressor, enabled: false });

    // EQ3
    this.eq3 = new Tone.EQ3({ low: 0, mid: 0, high: 0 });
    this.effects.set('eq3', { id: 'eq3', node: this.eq3, enabled: false });

    // BitCrusher
    this.bitcrusher = new Tone.BitCrusher({ bits: 8, wet: 0 });
    this.effects.set('bitcrusher', { id: 'bitcrusher', node: this.bitcrusher, enabled: false });

    // Distortion
    this.distortion = new Tone.Distortion({ distortion: 0.4, wet: 0 });
    this.effects.set('distortion', { id: 'distortion', node: this.distortion, enabled: false });

    // AutoWah
    this.autowah = new Tone.AutoWah({ baseFrequency: 200, octaves: 4, sensitivity: 0, wet: 0 });
    this.effects.set('autowah', { id: 'autowah', node: this.autowah, enabled: false });

    // AutoFilter
    this.autofilter = new Tone.AutoFilter({ frequency: 2, depth: 0.5, octaves: 2.5, wet: 0 });
    this.autofilter.start();
    this.effects.set('autofilter', { id: 'autofilter', node: this.autofilter, enabled: false });

    // Phaser
    this.phaser = new Tone.Phaser({ frequency: 2, octaves: 2, baseFrequency: 400, wet: 0 });
    this.effects.set('phaser', { id: 'phaser', node: this.phaser, enabled: false });

    // Chorus
    this.chorus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.5, wet: 0 });
    this.chorus.start();
    this.effects.set('chorus', { id: 'chorus', node: this.chorus, enabled: false });

    // Tremolo
    this.tremolo = new Tone.Tremolo({ frequency: 6, depth: 0.5, wet: 0 });
    this.tremolo.start();
    this.effects.set('tremolo', { id: 'tremolo', node: this.tremolo, enabled: false });

    // Vibrato
    this.vibrato = new Tone.Vibrato({ frequency: 5, depth: 0.2, wet: 0 });
    this.effects.set('vibrato', { id: 'vibrato', node: this.vibrato, enabled: false });

    // FrequencyShifter
    this.freqshift = new Tone.FrequencyShifter({ frequency: 0, wet: 0 });
    this.effects.set('freqshift', { id: 'freqshift', node: this.freqshift, enabled: false });

    // PitchShift
    this.pitchshift = new Tone.PitchShift({ pitch: 0, wet: 0 });
    this.effects.set('pitchshift', { id: 'pitchshift', node: this.pitchshift, enabled: false });

    // Delay
    this.delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.4, wet: 0 });
    this.effects.set('delay', { id: 'delay', node: this.delay, enabled: false });

    // Reverb
    this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0 });
    this.effects.set('reverb', { id: 'reverb', node: this.reverb, enabled: false });

    // StereoWidener
    this.stereowidener = new Tone.StereoWidener({ width: 0.5, wet: 0 });
    this.effects.set('stereowidener', { id: 'stereowidener', node: this.stereowidener, enabled: false });
  }

  private loadOrder(): EffectId[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as EffectId[];
        if (parsed.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every(id => parsed.includes(id))) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load effect order:', e);
    }
    return [...DEFAULT_ORDER];
  }

  private saveOrder(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.order));
    } catch (e) {
      console.warn('Failed to save effect order:', e);
    }
  }

  /**
   * Rewire the effects chain - only enabled effects are connected
   * Disabled effects are completely bypassed (no audio processing overhead)
   */
  private rewireChain(): void {
    // Disconnect everything first
    this.input.disconnect();
    for (const [, effect] of this.effects) {
      effect.node.disconnect();
    }

    let currentNode: Tone.ToneAudioNode = this.input;
    
    // Only connect enabled effects in order
    for (const effectId of this.order) {
      const effect = this.effects.get(effectId);
      if (effect && effect.enabled) {
        currentNode.connect(effect.node);
        currentNode = effect.node;
      }
    }
    
    currentNode.connect(this.output);
  }

  getInput(): Tone.Gain { return this.input; }
  getOutput(): Tone.Gain { return this.output; }
  getOrder(): EffectId[] { return [...this.order]; }

  reorder(newOrder: EffectId[]): void {
    if (newOrder.length !== DEFAULT_ORDER.length || !DEFAULT_ORDER.every(id => newOrder.includes(id))) {
      console.error('Invalid effect order');
      return;
    }
    this.order = [...newOrder];
    this.rewireChain();
    this.saveOrder();
    this.onOrderChangeCallback?.(this.order);
  }

  onChange(callback: EffectChangeCallback): void { this.onChangeCallback = callback; }
  onOrderChange(callback: OrderChangeCallback): void { this.onOrderChangeCallback = callback; }

  setEnabled(effectId: EffectId, enabled: boolean): void {
    const effect = this.effects.get(effectId);
    if (!effect || effect.enabled === enabled) return;
    
    effect.enabled = enabled;
    
    // Rewire chain to add/remove the effect from audio path
    this.rewireChain();
    
    this.onChangeCallback?.(effectId, this.getEffectParams(effectId));
  }

  isEnabled(effectId: EffectId): boolean {
    return this.effects.get(effectId)?.enabled ?? false;
  }

  getEffectParams(effectId: EffectId): any {
    const effect = this.effects.get(effectId);
    if (!effect) return null;

    switch (effectId) {
      case 'compressor':
        return { threshold: this.compressor.threshold.value, ratio: this.compressor.ratio.value, attack: this.compressor.attack.value, release: this.compressor.release.value, enabled: effect.enabled } as CompressorParams;
      case 'eq3':
        return { low: this.eq3.low.value, mid: this.eq3.mid.value, high: this.eq3.high.value, enabled: effect.enabled } as EQ3Params;
      case 'bitcrusher':
        return { bits: this.bitcrusher.bits.value, wet: this.bitcrusher.wet.value, enabled: effect.enabled } as BitCrusherParams;
      case 'distortion':
        return { amount: this.distortion.distortion, wet: this.distortion.wet.value, enabled: effect.enabled } as DistortionParams;
      case 'autowah':
        return { baseFrequency: this.autowah.baseFrequency, octaves: this.autowah.octaves, sensitivity: this.autowah.sensitivity.value, wet: this.autowah.wet.value, enabled: effect.enabled } as AutoWahParams;
      case 'autofilter':
        return { frequency: this.autofilter.frequency.value, depth: this.autofilter.depth.value, octaves: this.autofilter.octaves, wet: this.autofilter.wet.value, enabled: effect.enabled } as AutoFilterParams;
      case 'phaser':
        return { frequency: this.phaser.frequency.value, octaves: this.phaser.octaves, wet: this.phaser.wet.value, enabled: effect.enabled } as PhaserParams;
      case 'chorus':
        return { frequency: this.chorus.frequency.value, depth: this.chorus.depth, wet: this.chorus.wet.value, enabled: effect.enabled } as ChorusParams;
      case 'tremolo':
        return { frequency: this.tremolo.frequency.value, depth: this.tremolo.depth.value, wet: this.tremolo.wet.value, enabled: effect.enabled } as TremoloParams;
      case 'vibrato':
        return { frequency: this.vibrato.frequency.value, depth: this.vibrato.depth.value, wet: this.vibrato.wet.value, enabled: effect.enabled } as VibratoParams;
      case 'freqshift':
        return { frequency: this.freqshift.frequency.value, wet: this.freqshift.wet.value, enabled: effect.enabled } as FreqShiftParams;
      case 'pitchshift':
        return { pitch: this.pitchshift.pitch, wet: this.pitchshift.wet.value, enabled: effect.enabled } as PitchShiftParams;
      case 'delay':
        return { time: this.delay.delayTime.value, feedback: this.delay.feedback.value, wet: this.delay.wet.value, enabled: effect.enabled } as DelayParams;
      case 'reverb':
        return { decay: this.reverb.decay, wet: this.reverb.wet.value, enabled: effect.enabled } as ReverbParams;
      case 'stereowidener':
        return { width: this.stereowidener.width.value, wet: this.stereowidener.wet.value, enabled: effect.enabled } as StereoWidenerParams;
      default:
        return null;
    }
  }

  getAllParams(): AllEffectParams {
    return {
      compressor: this.getEffectParams('compressor'),
      eq3: this.getEffectParams('eq3'),
      bitcrusher: this.getEffectParams('bitcrusher'),
      distortion: this.getEffectParams('distortion'),
      autowah: this.getEffectParams('autowah'),
      autofilter: this.getEffectParams('autofilter'),
      phaser: this.getEffectParams('phaser'),
      chorus: this.getEffectParams('chorus'),
      tremolo: this.getEffectParams('tremolo'),
      vibrato: this.getEffectParams('vibrato'),
      freqshift: this.getEffectParams('freqshift'),
      pitchshift: this.getEffectParams('pitchshift'),
      delay: this.getEffectParams('delay'),
      reverb: this.getEffectParams('reverb'),
      stereowidener: this.getEffectParams('stereowidener'),
    };
  }

  // Effect setters
  setCompressor(params: Partial<CompressorParams>): void {
    if (params.threshold !== undefined) this.compressor.threshold.value = params.threshold;
    if (params.ratio !== undefined) this.compressor.ratio.value = params.ratio;
    if (params.attack !== undefined) this.compressor.attack.value = params.attack;
    if (params.release !== undefined) this.compressor.release.value = params.release;
    if (params.enabled !== undefined) this.setEnabled('compressor', params.enabled);
    this.onChangeCallback?.('compressor', this.getEffectParams('compressor'));
  }

  setEQ3(params: Partial<EQ3Params>): void {
    if (params.low !== undefined) this.eq3.low.value = params.low;
    if (params.mid !== undefined) this.eq3.mid.value = params.mid;
    if (params.high !== undefined) this.eq3.high.value = params.high;
    if (params.enabled !== undefined) this.setEnabled('eq3', params.enabled);
    this.onChangeCallback?.('eq3', this.getEffectParams('eq3'));
  }

  setBitCrusher(params: Partial<BitCrusherParams>): void {
    const effect = this.effects.get('bitcrusher')!;
    if (params.bits !== undefined) this.bitcrusher.bits.value = params.bits;
    if (params.wet !== undefined && effect.enabled) this.bitcrusher.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('bitcrusher', params.enabled);
      if (params.enabled && params.wet !== undefined) this.bitcrusher.wet.value = params.wet;
    }
    this.onChangeCallback?.('bitcrusher', this.getEffectParams('bitcrusher'));
  }

  setDistortion(params: Partial<DistortionParams>): void {
    const effect = this.effects.get('distortion')!;
    if (params.amount !== undefined) this.distortion.distortion = params.amount;
    if (params.wet !== undefined && effect.enabled) this.distortion.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('distortion', params.enabled);
      if (params.enabled && params.wet !== undefined) this.distortion.wet.value = params.wet;
    }
    this.onChangeCallback?.('distortion', this.getEffectParams('distortion'));
  }

  setAutoWah(params: Partial<AutoWahParams>): void {
    const effect = this.effects.get('autowah')!;
    if (params.baseFrequency !== undefined) this.autowah.baseFrequency = params.baseFrequency;
    if (params.octaves !== undefined) this.autowah.octaves = params.octaves;
    if (params.sensitivity !== undefined) this.autowah.sensitivity.value = params.sensitivity;
    if (params.wet !== undefined && effect.enabled) this.autowah.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('autowah', params.enabled);
      if (params.enabled && params.wet !== undefined) this.autowah.wet.value = params.wet;
    }
    this.onChangeCallback?.('autowah', this.getEffectParams('autowah'));
  }

  setAutoFilter(params: Partial<AutoFilterParams>): void {
    const effect = this.effects.get('autofilter')!;
    if (params.frequency !== undefined) this.autofilter.frequency.value = params.frequency;
    if (params.depth !== undefined) this.autofilter.depth.value = params.depth;
    if (params.octaves !== undefined) this.autofilter.octaves = params.octaves;
    if (params.wet !== undefined && effect.enabled) this.autofilter.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('autofilter', params.enabled);
      if (params.enabled && params.wet !== undefined) this.autofilter.wet.value = params.wet;
    }
    this.onChangeCallback?.('autofilter', this.getEffectParams('autofilter'));
  }

  setPhaser(params: Partial<PhaserParams>): void {
    const effect = this.effects.get('phaser')!;
    if (params.frequency !== undefined) this.phaser.frequency.value = params.frequency;
    if (params.octaves !== undefined) this.phaser.octaves = params.octaves;
    if (params.wet !== undefined && effect.enabled) this.phaser.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('phaser', params.enabled);
      if (params.enabled && params.wet !== undefined) this.phaser.wet.value = params.wet;
    }
    this.onChangeCallback?.('phaser', this.getEffectParams('phaser'));
  }

  setChorus(params: Partial<ChorusParams>): void {
    const effect = this.effects.get('chorus')!;
    if (params.frequency !== undefined) this.chorus.frequency.value = params.frequency;
    if (params.depth !== undefined) this.chorus.depth = params.depth;
    if (params.wet !== undefined && effect.enabled) this.chorus.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('chorus', params.enabled);
      if (params.enabled && params.wet !== undefined) this.chorus.wet.value = params.wet;
    }
    this.onChangeCallback?.('chorus', this.getEffectParams('chorus'));
  }

  setTremolo(params: Partial<TremoloParams>): void {
    const effect = this.effects.get('tremolo')!;
    if (params.frequency !== undefined) this.tremolo.frequency.value = params.frequency;
    if (params.depth !== undefined) this.tremolo.depth.value = params.depth;
    if (params.wet !== undefined && effect.enabled) this.tremolo.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('tremolo', params.enabled);
      if (params.enabled && params.wet !== undefined) this.tremolo.wet.value = params.wet;
    }
    this.onChangeCallback?.('tremolo', this.getEffectParams('tremolo'));
  }

  setVibrato(params: Partial<VibratoParams>): void {
    const effect = this.effects.get('vibrato')!;
    if (params.frequency !== undefined) this.vibrato.frequency.value = params.frequency;
    if (params.depth !== undefined) this.vibrato.depth.value = params.depth;
    if (params.wet !== undefined && effect.enabled) this.vibrato.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('vibrato', params.enabled);
      if (params.enabled && params.wet !== undefined) this.vibrato.wet.value = params.wet;
    }
    this.onChangeCallback?.('vibrato', this.getEffectParams('vibrato'));
  }

  setFreqShift(params: Partial<FreqShiftParams>): void {
    const effect = this.effects.get('freqshift')!;
    if (params.frequency !== undefined) this.freqshift.frequency.value = params.frequency;
    if (params.wet !== undefined && effect.enabled) this.freqshift.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('freqshift', params.enabled);
      if (params.enabled && params.wet !== undefined) this.freqshift.wet.value = params.wet;
    }
    this.onChangeCallback?.('freqshift', this.getEffectParams('freqshift'));
  }

  setPitchShift(params: Partial<PitchShiftParams>): void {
    const effect = this.effects.get('pitchshift')!;
    if (params.pitch !== undefined) this.pitchshift.pitch = params.pitch;
    if (params.wet !== undefined && effect.enabled) this.pitchshift.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('pitchshift', params.enabled);
      if (params.enabled && params.wet !== undefined) this.pitchshift.wet.value = params.wet;
    }
    this.onChangeCallback?.('pitchshift', this.getEffectParams('pitchshift'));
  }

  setDelay(params: Partial<DelayParams>): void {
    const effect = this.effects.get('delay')!;
    if (params.time !== undefined) this.delay.delayTime.value = params.time;
    if (params.feedback !== undefined) this.delay.feedback.value = params.feedback;
    if (params.wet !== undefined && effect.enabled) this.delay.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('delay', params.enabled);
      if (params.enabled && params.wet !== undefined) this.delay.wet.value = params.wet;
    }
    this.onChangeCallback?.('delay', this.getEffectParams('delay'));
  }

  setReverb(params: Partial<ReverbParams>): void {
    const effect = this.effects.get('reverb')!;
    if (params.decay !== undefined) this.reverb.decay = params.decay;
    if (params.wet !== undefined && effect.enabled) this.reverb.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('reverb', params.enabled);
      if (params.enabled && params.wet !== undefined) this.reverb.wet.value = params.wet;
    }
    this.onChangeCallback?.('reverb', this.getEffectParams('reverb'));
  }

  setStereoWidener(params: Partial<StereoWidenerParams>): void {
    const effect = this.effects.get('stereowidener')!;
    if (params.width !== undefined) this.stereowidener.width.value = params.width;
    if (params.wet !== undefined && effect.enabled) this.stereowidener.wet.value = params.wet;
    if (params.enabled !== undefined) {
      this.setEnabled('stereowidener', params.enabled);
      if (params.enabled && params.wet !== undefined) this.stereowidener.wet.value = params.wet;
    }
    this.onChangeCallback?.('stereowidener', this.getEffectParams('stereowidener'));
  }

  randomize(): void {
    const rand = (min: number, max: number) => Math.random() * (max - min) + min;

    // First, disable all effects
    for (const effectId of DEFAULT_ORDER) {
      this.setEnabled(effectId, false);
    }

    // Randomly select 3-5 effects to enable
    const numEffects = Math.floor(Math.random() * 3) + 3; // 3 to 5 effects
    const shuffledEffects = [...DEFAULT_ORDER].sort(() => Math.random() - 0.5);
    const selectedEffects = new Set(shuffledEffects.slice(0, numEffects));

    // Randomize parameters for all effects, but only enable selected ones
    this.setCompressor({ threshold: rand(RANDOM_RANGES.compressor.threshold.min, RANDOM_RANGES.compressor.threshold.max), ratio: rand(RANDOM_RANGES.compressor.ratio.min, RANDOM_RANGES.compressor.ratio.max), enabled: selectedEffects.has('compressor') });
    this.setEQ3({ low: rand(RANDOM_RANGES.eq3.low.min, RANDOM_RANGES.eq3.low.max), mid: rand(RANDOM_RANGES.eq3.mid.min, RANDOM_RANGES.eq3.mid.max), high: rand(RANDOM_RANGES.eq3.high.min, RANDOM_RANGES.eq3.high.max), enabled: selectedEffects.has('eq3') });
    this.setBitCrusher({ bits: Math.round(rand(RANDOM_RANGES.bitcrusher.bits.min, RANDOM_RANGES.bitcrusher.bits.max)), wet: rand(RANDOM_RANGES.bitcrusher.wet.min, RANDOM_RANGES.bitcrusher.wet.max), enabled: selectedEffects.has('bitcrusher') });
    this.setDistortion({ amount: rand(RANDOM_RANGES.distortion.amount.min, RANDOM_RANGES.distortion.amount.max), wet: rand(RANDOM_RANGES.distortion.wet.min, RANDOM_RANGES.distortion.wet.max), enabled: selectedEffects.has('distortion') });
    this.setAutoWah({ baseFrequency: rand(RANDOM_RANGES.autowah.baseFrequency.min, RANDOM_RANGES.autowah.baseFrequency.max), octaves: Math.round(rand(RANDOM_RANGES.autowah.octaves.min, RANDOM_RANGES.autowah.octaves.max)), wet: rand(RANDOM_RANGES.autowah.wet.min, RANDOM_RANGES.autowah.wet.max), enabled: selectedEffects.has('autowah') });
    this.setAutoFilter({ frequency: rand(RANDOM_RANGES.autofilter.frequency.min, RANDOM_RANGES.autofilter.frequency.max), depth: rand(RANDOM_RANGES.autofilter.depth.min, RANDOM_RANGES.autofilter.depth.max), octaves: Math.round(rand(RANDOM_RANGES.autofilter.octaves.min, RANDOM_RANGES.autofilter.octaves.max)), wet: rand(RANDOM_RANGES.autofilter.wet.min, RANDOM_RANGES.autofilter.wet.max), enabled: selectedEffects.has('autofilter') });
    this.setPhaser({ frequency: rand(RANDOM_RANGES.phaser.frequency.min, RANDOM_RANGES.phaser.frequency.max), octaves: Math.round(rand(RANDOM_RANGES.phaser.octaves.min, RANDOM_RANGES.phaser.octaves.max)), wet: rand(RANDOM_RANGES.phaser.wet.min, RANDOM_RANGES.phaser.wet.max), enabled: selectedEffects.has('phaser') });
    this.setChorus({ frequency: rand(RANDOM_RANGES.chorus.frequency.min, RANDOM_RANGES.chorus.frequency.max), depth: rand(RANDOM_RANGES.chorus.depth.min, RANDOM_RANGES.chorus.depth.max), wet: rand(RANDOM_RANGES.chorus.wet.min, RANDOM_RANGES.chorus.wet.max), enabled: selectedEffects.has('chorus') });
    this.setTremolo({ frequency: rand(RANDOM_RANGES.tremolo.frequency.min, RANDOM_RANGES.tremolo.frequency.max), depth: rand(RANDOM_RANGES.tremolo.depth.min, RANDOM_RANGES.tremolo.depth.max), wet: rand(RANDOM_RANGES.tremolo.wet.min, RANDOM_RANGES.tremolo.wet.max), enabled: selectedEffects.has('tremolo') });
    this.setVibrato({ frequency: rand(RANDOM_RANGES.vibrato.frequency.min, RANDOM_RANGES.vibrato.frequency.max), depth: rand(RANDOM_RANGES.vibrato.depth.min, RANDOM_RANGES.vibrato.depth.max), wet: rand(RANDOM_RANGES.vibrato.wet.min, RANDOM_RANGES.vibrato.wet.max), enabled: selectedEffects.has('vibrato') });
    this.setFreqShift({ frequency: rand(RANDOM_RANGES.freqshift.frequency.min, RANDOM_RANGES.freqshift.frequency.max), wet: rand(RANDOM_RANGES.freqshift.wet.min, RANDOM_RANGES.freqshift.wet.max), enabled: selectedEffects.has('freqshift') });
    this.setPitchShift({ pitch: Math.round(rand(RANDOM_RANGES.pitchshift.pitch.min, RANDOM_RANGES.pitchshift.pitch.max)), wet: rand(RANDOM_RANGES.pitchshift.wet.min, RANDOM_RANGES.pitchshift.wet.max), enabled: selectedEffects.has('pitchshift') });
    this.setDelay({ time: rand(RANDOM_RANGES.delay.time.min, RANDOM_RANGES.delay.time.max), feedback: rand(RANDOM_RANGES.delay.feedback.min, RANDOM_RANGES.delay.feedback.max), wet: rand(RANDOM_RANGES.delay.wet.min, RANDOM_RANGES.delay.wet.max), enabled: selectedEffects.has('delay') });
    this.setReverb({ decay: rand(RANDOM_RANGES.reverb.decay.min, RANDOM_RANGES.reverb.decay.max), wet: rand(RANDOM_RANGES.reverb.wet.min, RANDOM_RANGES.reverb.wet.max), enabled: selectedEffects.has('reverb') });
    this.setStereoWidener({ width: rand(RANDOM_RANGES.stereowidener.width.min, RANDOM_RANGES.stereowidener.width.max), wet: rand(RANDOM_RANGES.stereowidener.wet.min, RANDOM_RANGES.stereowidener.wet.max), enabled: selectedEffects.has('stereowidener') });
  }

  /**
   * Get list of enabled effects in order
   */
  getEnabledEffects(): EffectId[] {
    return this.order.filter(id => this.isEnabled(id));
  }

  /**
   * Get list of disabled effects in order
   */
  getDisabledEffects(): EffectId[] {
    return this.order.filter(id => !this.isEnabled(id));
  }

  reset(): void {
    this.setCompressor({ threshold: -20, ratio: 4, attack: 0.003, release: 0.25, enabled: false });
    this.setEQ3({ low: 0, mid: 0, high: 0, enabled: false });
    this.setBitCrusher({ bits: 8, wet: 0.5, enabled: false });
    this.setDistortion({ amount: 0.4, wet: 0.5, enabled: false });
    this.setAutoWah({ baseFrequency: 200, octaves: 4, sensitivity: 0, wet: 0.5, enabled: false });
    this.setAutoFilter({ frequency: 2, depth: 0.5, octaves: 2.5, wet: 0.5, enabled: false });
    this.setPhaser({ frequency: 2, octaves: 2, wet: 0.5, enabled: false });
    this.setChorus({ frequency: 1.5, depth: 0.5, wet: 0.5, enabled: false });
    this.setTremolo({ frequency: 6, depth: 0.5, wet: 0.5, enabled: false });
    this.setVibrato({ frequency: 5, depth: 0.2, wet: 0.5, enabled: false });
    this.setFreqShift({ frequency: 0, wet: 0.5, enabled: false });
    this.setPitchShift({ pitch: 0, wet: 0.5, enabled: false });
    this.setDelay({ time: 0.25, feedback: 0.4, wet: 0.3, enabled: false });
    this.setReverb({ decay: 1.5, wet: 0.3, enabled: false });
    this.setStereoWidener({ width: 0.5, wet: 0.5, enabled: false });
  }

  dispose(): void {
    this.input.disconnect();
    this.output.disconnect();
    this.compressor.dispose();
    this.eq3.dispose();
    this.bitcrusher.dispose();
    this.distortion.dispose();
    this.autowah.dispose();
    this.autofilter.dispose();
    this.phaser.dispose();
    this.chorus.dispose();
    this.tremolo.dispose();
    this.vibrato.dispose();
    this.freqshift.dispose();
    this.pitchshift.dispose();
    this.delay.dispose();
    this.reverb.dispose();
    this.stereowidener.dispose();
    this.input.dispose();
    this.output.dispose();
    this.effects.clear();
  }
}

// Singleton instance
let effectsChainInstance: EffectsChain | null = null;

export function getEffectsChain(): EffectsChain {
  if (!effectsChainInstance) {
    effectsChainInstance = new EffectsChain();
  }
  return effectsChainInstance;
}
