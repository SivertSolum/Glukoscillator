// Oscillator Mixer
// UI for managing 3 oscillator layers with individual wavetables
// Each oscillator has its own dropdown for selecting days

import { getSynth, GlucoseSynth } from '../synthesis/synth-engine';
import { getWaveformForDisplay } from '../synthesis/wavetable';
import { formatDateForDisplay } from '../parser/libreview';
import type { DailyGlucoseData, ParsedLibreViewData } from '../types';
import {
  computeVolatility,
  computeRateOfChange,
  combineGlucoseStats,
  normalizeGlucoseStat,
  scaleInRange,
  amplifyValue,
  addRandomSpread,
  ENVELOPE_RANGES,
  type GlucoseStatsWithVolatility,
} from '../synthesis/effects-config';

type OscillatorChangeCallback = (oscIndex: number, dayData: DailyGlucoseData | null) => void;

export class OscillatorMixer {
  private container: HTMLElement;
  private data: ParsedLibreViewData | null = null;
  private selectedDays: (string | null)[] = [null, null, null];
  private onChangeCallback: OscillatorChangeCallback | null = null;
  private onRandomizeCallback: (() => void) | null = null;
  
  // Cached synth reference
  private synth: GlucoseSynth;
  
  // Hover waveform preview elements
  private waveformPreview: HTMLElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewCtx: CanvasRenderingContext2D | null = null;
  
  // Dropdown state
  private openDropdownIndex: number = -1;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }
    this.container = container;
    
    // Cache synth reference
    this.synth = getSynth();
    
    // Create waveform preview overlay
    this.createWaveformPreview();
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node) && this.openDropdownIndex !== -1) {
        this.closeAllDropdowns();
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.openDropdownIndex !== -1) {
        this.closeAllDropdowns();
      }
    });
  }
  
  /**
   * Create the hover waveform preview element
   */
  private createWaveformPreview(): void {
    this.waveformPreview = document.createElement('div');
    this.waveformPreview.className = 'osc-waveform-preview';
    this.waveformPreview.innerHTML = `
      <div class="preview-header">
        <span class="preview-date"></span>
        <span class="preview-stats"></span>
      </div>
      <canvas class="preview-canvas"></canvas>
      <div class="preview-time-labels">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    `;
    
    this.previewCanvas = this.waveformPreview.querySelector('.preview-canvas');
    if (this.previewCanvas) {
      this.previewCtx = this.previewCanvas.getContext('2d');
    }
    
    // Prevent hover from triggering on the preview itself
    this.waveformPreview.addEventListener('mouseenter', () => {
      this.waveformPreview?.classList.add('active');
    });
    
    this.waveformPreview.addEventListener('mouseleave', () => {
      this.hideWaveformPreview();
    });
  }

  /**
   * Set callback for oscillator changes
   */
  onChange(callback: OscillatorChangeCallback): void {
    this.onChangeCallback = callback;
  }

  /**
   * Set callback for randomize button
   */
  onRandomize(callback: () => void): void {
    this.onRandomizeCallback = callback;
  }

  /**
   * Load data
   */
  setData(data: ParsedLibreViewData): void {
    this.data = data;
    this.render();
  }

  /**
   * Set a day for a specific oscillator
   */
  setOscillatorDay(oscIndex: number, date: string | null): void {
    if (oscIndex < 0 || oscIndex >= 3) return;
    
    this.selectedDays[oscIndex] = date;
    
    if (date && this.data) {
      const dayData = this.data.days.get(date);
      if (dayData?.wavetable) {
        this.synth.setWavetable(oscIndex, dayData.wavetable, date);
        this.onChangeCallback?.(oscIndex, dayData);
      }
    } else {
      this.synth.clearWavetable(oscIndex);
      this.onChangeCallback?.(oscIndex, null);
    }
    
    this.updateOscillatorDisplay(oscIndex);
  }

  /**
   * Get selected day for oscillator
   */
  getOscillatorDay(oscIndex: number): string | null {
    return this.selectedDays[oscIndex] ?? null;
  }

  /**
   * Randomize all oscillators and effects based on glucose data
   * Effects and envelope are determined by the glucose characteristics of selected days
   */
  randomize(): void {
    if (!this.data || this.data.days.size === 0) return;
    
    const dates = Array.from(this.data.days.keys());
    
    // Randomize oscillator wavetables
    for (let i = 0; i < 3; i++) {
      // Pick a random day (allow same day for multiple oscillators)
      const randomDate = dates[Math.floor(Math.random() * dates.length)];
      this.setOscillatorDay(i, randomDate);
    }
    
    // Collect glucose stats from all selected days
    const statsArray = this.collectGlucoseStats();
    
    if (statsArray.length > 0) {
      // Combine stats from all active oscillators
      const combinedStats = combineGlucoseStats(statsArray);
      
      // Randomize effects based on glucose data
      this.synth.getEffectsChain().randomizeFromGlucose(combinedStats);
      
      // Set envelope based on glucose data
      this.setEnvelopeFromGlucose(combinedStats);
    } else {
      // Fallback to random if no data
      this.synth.getEffectsChain().randomize();
    }
    
    this.onRandomizeCallback?.();
  }

  /**
   * Collect glucose stats with all computed metrics from all selected oscillator days
   */
  private collectGlucoseStats(): GlucoseStatsWithVolatility[] {
    if (!this.data) return [];
    
    const statsArray: GlucoseStatsWithVolatility[] = [];
    
    for (const date of this.selectedDays) {
      if (!date) continue;
      
      const dayData = this.data.days.get(date);
      if (!dayData) continue;
      
      // Compute all metrics from readings
      const volatility = computeVolatility(dayData.readings);
      const rateOfChange = computeRateOfChange(dayData.readings);
      const range = dayData.stats.max - dayData.stats.min;
      const coefficientOfVariation = dayData.stats.avg > 0 ? volatility / dayData.stats.avg : 0;
      
      statsArray.push({
        min: dayData.stats.min,
        max: dayData.stats.max,
        avg: dayData.stats.avg,
        timeInRange: dayData.stats.timeInRange,
        volatility,
        range,
        coefficientOfVariation,
        rateOfChange,
      });
    }
    
    return statsArray;
  }

  /**
   * Set envelope ADSR values based on glucose statistics
   * Uses multiple metrics and amplification for dramatic variation:
   * - High volatility/CV/rate = short attack/decay (punchy, aggressive)
   * - Low volatility = long attack/decay (smooth, pad-like)
   * - High range = more extreme sustain
   * - Poor time-in-range = shorter release
   */
  private setEnvelopeFromGlucose(stats: GlucoseStatsWithVolatility): void {
    // Normalize all stats
    const volatilityNorm = normalizeGlucoseStat(stats.volatility, 'volatility');
    const avgNorm = normalizeGlucoseStat(stats.avg, 'average');
    const tirNorm = normalizeGlucoseStat(stats.timeInRange, 'timeInRange');
    const rangeNorm = normalizeGlucoseStat(stats.range, 'range');
    const cvNorm = normalizeGlucoseStat(stats.coefficientOfVariation, 'coefficientOfVariation');
    const rocNorm = normalizeGlucoseStat(stats.rateOfChange, 'rateOfChange');
    
    // Combine multiple instability metrics for attack/decay
    // Higher values = more chaotic glucose = shorter, punchier envelope
    const chaosMetric = (volatilityNorm + cvNorm + rocNorm) / 3;
    const amplifiedChaos = amplifyValue(chaosMetric, 1.5); // Push toward extremes
    
    // High chaos = short attack (inverse relationship), add some randomness
    const attackFactor = addRandomSpread(1 - amplifiedChaos, 0.15);
    const attack = scaleInRange(
      attackFactor,
      ENVELOPE_RANGES.attack.min,
      ENVELOPE_RANGES.attack.max
    );
    
    // High chaos = short decay, influenced by rate of change
    const decayFactor = addRandomSpread(1 - amplifyValue((chaosMetric + rocNorm) / 2, 1.8), 0.15);
    const decay = scaleInRange(
      decayFactor,
      ENVELOPE_RANGES.decay.min,
      ENVELOPE_RANGES.decay.max
    );
    
    // Sustain based on average and range - extreme glucose = lower sustain
    // High range or high average = less stable sustained sound
    const stabilityMetric = (1 - rangeNorm + 1 - avgNorm + tirNorm) / 3;
    const sustainFactor = addRandomSpread(amplifyValue(stabilityMetric, 1.3), 0.2);
    const sustain = scaleInRange(
      sustainFactor,
      ENVELOPE_RANGES.sustain.min,
      ENVELOPE_RANGES.sustain.max
    );
    
    // Release based on time-in-range and volatility
    // Good TIR + low volatility = longer, more pleasant release
    const pleasantnessMetric = (tirNorm + (1 - volatilityNorm)) / 2;
    const releaseFactor = addRandomSpread(amplifyValue(pleasantnessMetric, 1.5), 0.15);
    const release = scaleInRange(
      releaseFactor,
      ENVELOPE_RANGES.release.min,
      ENVELOPE_RANGES.release.max
    );
    
    // Apply envelope to synth
    this.synth.setEnvelope({ attack, decay, sustain, release });
  }
  
  /**
   * Open dropdown for oscillator
   */
  private openDropdown(oscIndex: number): void {
    this.closeAllDropdowns();
    this.openDropdownIndex = oscIndex;
    
    const slot = document.getElementById(`osc-slot-${oscIndex}`);
    slot?.classList.add('dropdown-open');
    
    // Hide waveform preview when dropdown is open
    this.hideWaveformPreview();
  }
  
  /**
   * Close all dropdowns
   */
  private closeAllDropdowns(): void {
    this.openDropdownIndex = -1;
    document.querySelectorAll('.oscillator-slot').forEach(s => {
      s.classList.remove('dropdown-open');
    });
  }
  
  /**
   * Toggle dropdown for oscillator
   */
  private toggleDropdown(oscIndex: number, e: Event): void {
    e.stopPropagation();
    
    if (this.openDropdownIndex === oscIndex) {
      this.closeAllDropdowns();
    } else {
      this.openDropdown(oscIndex);
    }
  }

  /**
   * Show waveform preview for an oscillator
   */
  private showWaveformPreview(oscIndex: number): void {
    // Don't show preview if dropdown is open
    if (this.openDropdownIndex !== -1) return;
    if (!this.waveformPreview || !this.data) return;
    
    const date = this.selectedDays[oscIndex];
    if (!date) return;
    
    const dayData = this.data.days.get(date);
    if (!dayData?.wavetable) return;
    
    // Update preview content
    const dateLabel = this.waveformPreview.querySelector('.preview-date');
    const statsLabel = this.waveformPreview.querySelector('.preview-stats');
    
    if (dateLabel) {
      const d = new Date(date + 'T00:00:00');
      dateLabel.textContent = d.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    }
    
    if (statsLabel && dayData.stats) {
      const inRange = Math.round(dayData.stats.timeInRange);
      statsLabel.textContent = `↓${Math.round(dayData.stats.min)} µ${Math.round(dayData.stats.avg)} ↑${Math.round(dayData.stats.max)} | ${inRange}%`;
    }
    
    // Append to container if not already
    if (!this.waveformPreview.parentElement) {
      this.container.appendChild(this.waveformPreview);
    }
    
    // Position below the oscillator slots (after the mixer)
    this.waveformPreview.style.left = '0';
    this.waveformPreview.style.right = '0';
    this.waveformPreview.style.top = '100%';
    this.waveformPreview.style.bottom = 'auto';
    this.waveformPreview.style.marginTop = '8px';
    
    // Draw the waveform
    this.drawPreviewWaveform(dayData.wavetable, dayData.stats);
    
    // Show with animation
    this.waveformPreview.classList.add('active');
  }
  
  /**
   * Hide the waveform preview
   */
  private hideWaveformPreview(): void {
    this.waveformPreview?.classList.remove('active');
  }
  
  /**
   * Draw waveform on the preview canvas
   */
  private drawPreviewWaveform(wavetable: Float32Array, stats: DailyGlucoseData['stats']): void {
    if (!this.previewCanvas || !this.previewCtx) return;
    
    const ctx = this.previewCtx;
    const dpr = window.devicePixelRatio || 1;
    
    // Set canvas size
    const rect = this.previewCanvas.getBoundingClientRect();
    this.previewCanvas.width = rect.width * dpr;
    this.previewCanvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = 16;
    
    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Draw background grid
    this.drawPreviewGrid(ctx, width, height);
    
    // Get waveform points
    const points = getWaveformForDisplay(wavetable, Math.floor(width));
    const drawHeight = height - padding * 2;
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, '#c97064');    // High glucose - warm red/coral
    gradient.addColorStop(0.25, '#d4a574'); // Above target - warm amber
    gradient.addColorStop(0.5, '#8fbc8f');  // In range - sage green
    gradient.addColorStop(0.75, '#d4a574'); // Below target - warm amber
    gradient.addColorStop(1, '#6b9ac4');    // Low glucose - muted blue
    
    // Build path
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * width;
      const y = padding + ((1 - points[i]) / 2) * drawHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    // Fill area
    const fillPath = new Path2D();
    fillPath.moveTo(0, height / 2);
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * width;
      const y = padding + ((1 - points[i]) / 2) * drawHeight;
      fillPath.lineTo(x, y);
    }
    fillPath.lineTo(width, height / 2);
    fillPath.closePath();
    
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.25;
    ctx.fill(fillPath);
    ctx.globalAlpha = 1;
    
    // Glow effect
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.4;
    ctx.shadowColor = '#e8a87c';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    
    // Main line
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    // Highlight
    ctx.strokeStyle = 'rgba(240, 230, 216, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Draw min/max labels
    ctx.fillStyle = 'rgba(232, 168, 124, 0.8)';
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(stats.max)} mg/dL`, width - 6, padding + 12);
    
    ctx.fillStyle = 'rgba(107, 154, 196, 0.8)';
    ctx.fillText(`${Math.round(stats.min)} mg/dL`, width - 6, height - padding - 4);
  }
  
  /**
   * Draw grid for preview
   */
  private drawPreviewGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const gridColor = 'rgba(143, 188, 143, 0.1)';
    const gridColorBright = 'rgba(143, 188, 143, 0.18)';
    ctx.lineWidth = 1;
    
    // Vertical lines (hours)
    for (let i = 0; i <= 24; i++) {
      const x = (i / 24) * width;
      ctx.strokeStyle = i % 6 === 0 ? gridColorBright : gridColor;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * height;
      ctx.strokeStyle = i === 2 ? gridColorBright : gridColor;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // Center line emphasis
    ctx.strokeStyle = 'rgba(232, 168, 124, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  /**
   * Render the mixer
   */
  render(): void {
    this.container.innerHTML = '';
    this.container.className = 'oscillator-mixer';

    // Header with randomize button
    const header = document.createElement('div');
    header.className = 'mixer-header';
    header.innerHTML = `
      <h3>Oscillators</h3>
      <button id="randomize-btn" class="randomize-btn" title="Randomize oscillator wavetables">
        <span class="dice-icon">🎲</span> Randomize
      </button>
    `;
    this.container.appendChild(header);

    // Randomize button handler - stop propagation to prevent oscillator slot activation
    const randomizeBtn = header.querySelector('#randomize-btn');
    if (randomizeBtn) {
      // Prevent any clicks on header from bubbling
      header.addEventListener('click', (e) => e.stopPropagation());
      
      // Handle both click and touch events
      randomizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.randomize();
      });
      
      // Touch events for mobile
      randomizeBtn.addEventListener('touchend', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.randomize();
      }, { passive: false });
    }

    // Oscillator slots
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'oscillator-slots';

    for (let i = 0; i < 3; i++) {
      const slot = this.createOscillatorSlot(i);
      slotsContainer.appendChild(slot);
    }

    this.container.appendChild(slotsContainer);
    
    // Re-append waveform preview
    if (this.waveformPreview) {
      this.container.appendChild(this.waveformPreview);
    }
  }

  /**
   * Create a single oscillator slot with integrated dropdown
   */
  private createOscillatorSlot(index: number): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'oscillator-slot';
    slot.id = `osc-slot-${index}`;

    const level = this.synth.getOscillatorLevel(index);
    const info = this.synth.getOscillatorInfo(index);

    // Oscillator label
    const label = document.createElement('div');
    label.className = 'osc-label';
    label.textContent = `OSC ${index + 1}`;
    slot.appendChild(label);

    // Waveform preview (clickable to open dropdown)
    const waveformContainer = document.createElement('div');
    waveformContainer.className = 'osc-waveform';
    waveformContainer.id = `osc-wave-${index}`;
    
    if (info?.wavetable) {
      waveformContainer.innerHTML = this.createMiniWaveformSVG(info.wavetable);
    } else {
      waveformContainer.innerHTML = '<span class="empty-slot">Select Day</span>';
    }
    slot.appendChild(waveformContainer);

    // Day label with dropdown arrow
    const dayLabelContainer = document.createElement('div');
    dayLabelContainer.className = 'osc-day-selector';
    dayLabelContainer.innerHTML = `
      <span class="osc-day-label" id="osc-day-${index}">${info?.dayLabel ? this.formatShortDate(info.dayLabel) : 'Select...'}</span>
      <svg class="dropdown-arrow" viewBox="0 0 24 24" width="12" height="12">
        <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    slot.appendChild(dayLabelContainer);
    
    // Create dropdown panel
    const dropdownPanel = this.createDropdownPanel(index);
    slot.appendChild(dropdownPanel);

    // Level slider
    const levelContainer = document.createElement('div');
    levelContainer.className = 'osc-level';
    
    const levelSlider = document.createElement('input');
    levelSlider.type = 'range';
    levelSlider.min = '0';
    levelSlider.max = '100';
    levelSlider.value = String(Math.round(level * 100));
    levelSlider.className = 'level-slider';
    levelSlider.id = `osc-level-${index}`;
    
    levelSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const newLevel = parseInt(levelSlider.value) / 100;
      this.synth.setOscillatorLevel(index, newLevel);
    });
    
    levelSlider.addEventListener('click', (e) => e.stopPropagation());

    const levelLabel = document.createElement('span');
    levelLabel.className = 'level-label';
    levelLabel.textContent = 'Level';

    levelContainer.appendChild(levelLabel);
    levelContainer.appendChild(levelSlider);
    slot.appendChild(levelContainer);

    // Pitch offset + pan
    slot.appendChild(this.createTuningControls(index));

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'osc-clear-btn';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear oscillator';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOscillatorDay(index, null);
      this.closeAllDropdowns();
    });
    slot.appendChild(clearBtn);

    // Click to toggle dropdown
    slot.addEventListener('click', (e) => {
      // Don't toggle if clicking on slider, clear button, dropdown panel, or mixer header
      const target = e.target as HTMLElement;
      if (target.closest('.osc-level') ||
          target.closest('.osc-tuning') ||
          target.closest('.osc-clear-btn') ||
          target.closest('.osc-dropdown-panel') ||
          target.closest('.mixer-header') ||
          target.closest('.randomize-btn')) {
        return;
      }
      this.toggleDropdown(index, e);
    });
    
    // Touch event for mobile
    slot.addEventListener('touchend', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.osc-level') || 
          target.closest('.osc-clear-btn') ||
          target.closest('.osc-dropdown-panel') ||
          target.closest('.mixer-header') ||
          target.closest('.randomize-btn')) {
        return;
      }
      // Only toggle if not already handled by click
      // This prevents double-firing on some devices
    });
    
    // Hover to show waveform preview (only when dropdown is closed)
    slot.addEventListener('mouseenter', () => {
      if (this.selectedDays[index] && this.openDropdownIndex === -1) {
        this.showWaveformPreview(index);
      }
    });
    
    slot.addEventListener('mouseleave', (e) => {
      // Check if moving to the preview itself
      const relatedTarget = e.relatedTarget as HTMLElement;
      if (!relatedTarget?.closest('.osc-waveform-preview')) {
        this.hideWaveformPreview();
      }
    });

    return slot;
  }
  
  /**
   * Create octave/semitone steppers and fine/pan sliders for an oscillator
   */
  private createTuningControls(index: number): HTMLElement {
    const tuning = this.synth.getOscillatorTuning(index);

    const container = document.createElement('div');
    container.className = 'osc-tuning';
    // Keep interactions here from opening the day dropdown
    container.addEventListener('click', (e) => e.stopPropagation());

    const steppers = document.createElement('div');
    steppers.className = 'osc-tuning-row';
    steppers.appendChild(this.createStepper('Oct', tuning.octave, -2, 2, (v) => {
      this.synth.setOscillatorTuning(index, { octave: v });
    }));
    steppers.appendChild(this.createStepper('Semi', tuning.semitone, -12, 12, (v) => {
      this.synth.setOscillatorTuning(index, { semitone: v });
    }));
    container.appendChild(steppers);

    const sliders = document.createElement('div');
    sliders.className = 'osc-tuning-row';
    sliders.appendChild(this.createTuningSlider('Fine', tuning.fine, -50, 50, (v) => {
      this.synth.setOscillatorTuning(index, { fine: v });
    }));
    sliders.appendChild(this.createTuningSlider('Pan', Math.round(tuning.pan * 100), -100, 100, (v) => {
      this.synth.setOscillatorTuning(index, { pan: v / 100 });
    }));
    container.appendChild(sliders);

    return container;
  }

  /**
   * Compact −/+ stepper for integer values
   */
  private createStepper(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'osc-stepper';

    const labelEl = document.createElement('span');
    labelEl.className = 'level-label';
    labelEl.textContent = label;

    const controls = document.createElement('div');
    controls.className = 'osc-stepper-controls';

    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'osc-stepper-btn';
    down.textContent = '−';
    down.setAttribute('aria-label', `${label} down`);

    const display = document.createElement('span');
    display.className = 'osc-stepper-value';

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'osc-stepper-btn';
    up.textContent = '+';
    up.setAttribute('aria-label', `${label} up`);

    let current = value;
    const update = (next: number) => {
      current = Math.max(min, Math.min(max, next));
      display.textContent = current > 0 ? `+${current}` : String(current);
      down.disabled = current <= min;
      up.disabled = current >= max;
    };
    update(current);

    down.addEventListener('click', () => { update(current - 1); onChange(current); });
    up.addEventListener('click', () => { update(current + 1); onChange(current); });
    // Double-click the value to reset
    display.addEventListener('dblclick', () => { update(0); onChange(0); });

    controls.append(down, display, up);
    wrapper.append(labelEl, controls);
    return wrapper;
  }

  /**
   * Compact bipolar slider; double-click resets to center
   */
  private createTuningSlider(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'osc-tuning-slider';

    const labelEl = document.createElement('span');
    labelEl.className = 'level-label';
    labelEl.textContent = label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = '1';
    slider.value = String(value);
    slider.className = 'level-slider';
    slider.title = `${label} (double-click to center)`;

    slider.addEventListener('input', (e) => {
      e.stopPropagation();
      onChange(parseInt(slider.value));
    });
    slider.addEventListener('dblclick', () => {
      slider.value = '0';
      onChange(0);
    });

    wrapper.append(labelEl, slider);
    return wrapper;
  }

  /**
   * Create dropdown panel for oscillator
   */
  private createDropdownPanel(oscIndex: number): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'osc-dropdown-panel';
    panel.id = `osc-dropdown-${oscIndex}`;
    
    if (!this.data || this.data.days.size === 0) {
      panel.innerHTML = '<div class="dropdown-empty">No data loaded</div>';
      return panel;
    }
    
    // Sort dates in reverse chronological order
    const dates = Array.from(this.data.days.keys()).sort().reverse();
    
    // Create scrollable list
    const list = document.createElement('div');
    list.className = 'osc-day-list';
    
    for (const date of dates) {
      const dayData = this.data.days.get(date)!;
      const item = this.createDayItem(date, dayData, oscIndex);
      list.appendChild(item);
    }
    
    panel.appendChild(list);
    
    // Stop propagation on panel to prevent closing when interacting with it
    panel.addEventListener('click', (e) => e.stopPropagation());
    
    return panel;
  }
  
  /**
   * Create a single day item for dropdown
   */
  private createDayItem(date: string, dayData: DailyGlucoseData, oscIndex: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'osc-day-item';
    item.dataset.date = date;
    
    // Check if this day is already selected for this oscillator
    if (this.selectedDays[oscIndex] === date) {
      item.classList.add('selected');
    }
    
    // Mini waveform preview
    const waveformPreview = this.createMiniWaveformSVG(dayData.wavetable!);
    
    // Stats
    const stats = dayData.stats;
    const tirClass = stats.timeInRange >= 70 ? 'good' : stats.timeInRange >= 50 ? 'warning' : 'bad';
    
    item.innerHTML = `
      <div class="day-info">
        <div class="day-date">${formatDateForDisplay(date)}</div>
        <div class="day-stats">
          <span class="stat">↓${Math.round(stats.min)}</span>
          <span class="stat">μ${Math.round(stats.avg)}</span>
          <span class="stat">↑${Math.round(stats.max)}</span>
          <span class="stat tir ${tirClass}">${Math.round(stats.timeInRange)}%</span>
        </div>
      </div>
      <div class="day-waveform">${waveformPreview}</div>
    `;
    
    // Click to select
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOscillatorDay(oscIndex, date);
      this.closeAllDropdowns();
    });
    
    return item;
  }

  /**
   * Create mini waveform SVG
   */
  private createMiniWaveformSVG(wavetable: Float32Array): string {
    const points = getWaveformForDisplay(wavetable, 50);
    const width = 50;
    const height = 30;

    let path = '';
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * width;
      const y = 2 + ((1 - points[i]) / 2) * (height - 4);
      path += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }

    return `<svg viewBox="0 0 ${width} ${height}"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  /**
   * Update a single oscillator slot display
   */
  private updateOscillatorDisplay(index: number): void {
    const waveContainer = document.getElementById(`osc-wave-${index}`);
    const dayLabel = document.getElementById(`osc-day-${index}`);
    
    const info = this.synth.getOscillatorInfo(index);
    
    if (waveContainer) {
      if (info?.wavetable) {
        waveContainer.innerHTML = this.createMiniWaveformSVG(info.wavetable);
      } else {
        waveContainer.innerHTML = '<span class="empty-slot">Select Day</span>';
      }
    }
    
    if (dayLabel) {
      dayLabel.textContent = info?.dayLabel ? this.formatShortDate(info.dayLabel) : 'Select...';
    }
    
    // Update dropdown selection state
    const dropdown = document.getElementById(`osc-dropdown-${index}`);
    if (dropdown) {
      const items = dropdown.querySelectorAll('.osc-day-item');
      items.forEach(item => {
        const itemDate = item.getAttribute('data-date');
        item.classList.toggle('selected', itemDate === this.selectedDays[index]);
      });
    }
  }

  /**
   * Format date for display
   */
  private formatShortDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * Clear selection mode
   */
  clearSelectionMode(): void {
    this.closeAllDropdowns();
  }
}

// Factory function
export function createOscillatorMixer(containerId: string): OscillatorMixer {
  return new OscillatorMixer(containerId);
}
