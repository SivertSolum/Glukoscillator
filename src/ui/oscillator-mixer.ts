// Oscillator Mixer
// UI for managing 3 oscillator layers with individual wavetables

import { getSynth, GlucoseSynth } from '../synthesis/synth-engine';
import { getWaveformForDisplay } from '../synthesis/wavetable';
import type { DailyGlucoseData, ParsedLibreViewData } from '../types';

type OscillatorChangeCallback = (oscIndex: number, dayData: DailyGlucoseData | null) => void;

export class OscillatorMixer {
  private container: HTMLElement;
  private data: ParsedLibreViewData | null = null;
  private selectedDays: (string | null)[] = [null, null, null];
  private onChangeCallback: OscillatorChangeCallback | null = null;
  private onRandomizeCallback: (() => void) | null = null;
  
  // Cached synth reference
  private synth: GlucoseSynth;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }
    this.container = container;
    
    // Cache synth reference
    this.synth = getSynth();
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
   * Randomize all oscillators and effects
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
    
    // Randomize effects chain parameters
    this.synth.getEffectsChain().randomize();
    
    this.onRandomizeCallback?.();
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

    // Randomize button handler
    const randomizeBtn = header.querySelector('#randomize-btn');
    randomizeBtn?.addEventListener('click', () => this.randomize());

    // Oscillator slots
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'oscillator-slots';

    for (let i = 0; i < 3; i++) {
      const slot = this.createOscillatorSlot(i);
      slotsContainer.appendChild(slot);
    }

    this.container.appendChild(slotsContainer);
  }

  /**
   * Create a single oscillator slot
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

    // Waveform preview
    const waveformContainer = document.createElement('div');
    waveformContainer.className = 'osc-waveform';
    waveformContainer.id = `osc-wave-${index}`;
    
    if (info?.wavetable) {
      waveformContainer.innerHTML = this.createMiniWaveformSVG(info.wavetable);
    } else {
      waveformContainer.innerHTML = '<span class="empty-slot">Empty</span>';
    }
    slot.appendChild(waveformContainer);

    // Day label
    const dayLabel = document.createElement('div');
    dayLabel.className = 'osc-day-label';
    dayLabel.id = `osc-day-${index}`;
    dayLabel.textContent = info?.dayLabel || '—';
    slot.appendChild(dayLabel);

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
    
    levelSlider.addEventListener('input', () => {
      const newLevel = parseInt(levelSlider.value) / 100;
      this.synth.setOscillatorLevel(index, newLevel);
    });

    const levelLabel = document.createElement('span');
    levelLabel.className = 'level-label';
    levelLabel.textContent = 'Level';

    levelContainer.appendChild(levelLabel);
    levelContainer.appendChild(levelSlider);
    slot.appendChild(levelContainer);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'osc-clear-btn';
    clearBtn.textContent = '✕';
    clearBtn.title = 'Clear oscillator';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOscillatorDay(index, null);
    });
    slot.appendChild(clearBtn);

    // Click to select from day list
    slot.addEventListener('click', () => {
      this.highlightSlotForSelection(index);
    });

    return slot;
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
        waveContainer.innerHTML = '<span class="empty-slot">Empty</span>';
      }
    }
    
    if (dayLabel) {
      dayLabel.textContent = info?.dayLabel ? this.formatShortDate(info.dayLabel) : '—';
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
   * Highlight slot for selection
   */
  private highlightSlotForSelection(index: number): void {
    // Remove previous highlights
    document.querySelectorAll('.oscillator-slot').forEach(s => s.classList.remove('selecting'));
    
    // Add highlight to this slot
    const slot = document.getElementById(`osc-slot-${index}`);
    slot?.classList.add('selecting');
    
    // Dispatch custom event for day selector to listen to
    window.dispatchEvent(new CustomEvent('osc-select-mode', { detail: { oscIndex: index } }));
  }

  /**
   * Clear selection mode
   */
  clearSelectionMode(): void {
    document.querySelectorAll('.oscillator-slot').forEach(s => s.classList.remove('selecting'));
  }
}

// Factory function
export function createOscillatorMixer(containerId: string): OscillatorMixer {
  return new OscillatorMixer(containerId);
}

