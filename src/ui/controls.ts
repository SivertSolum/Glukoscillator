// ADSR and Volume Controls
// Rotary knobs for synth parameters - inspired by vintage analog synths

import type { ADSREnvelope } from '../types';
import { DEFAULT_ENVELOPE } from '../types';
import { getSynth, GlucoseSynth } from '../synthesis/synth-engine';

export class SynthControls {
  private container: HTMLElement;
  private envelope: ADSREnvelope = { ...DEFAULT_ENVELOPE };
  private volume: number = 0.7;
  private activeKnob: HTMLElement | null = null;
  private startY: number = 0;
  private startValue: number = 0;
  
  // Throttling state
  private pendingUpdate: (() => void) | null = null;
  private updateScheduled: boolean = false;
  
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

    // Global mouse handlers for knob dragging
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
  }

  /**
   * Render controls
   */
  render(): void {
    this.container.innerHTML = '';
    this.container.className = 'synth-controls';

    // Create main faceplate
    const faceplate = document.createElement('div');
    faceplate.className = 'controls-faceplate';

    // ADSR Section
    const adsrSection = document.createElement('div');
    adsrSection.className = 'controls-section adsr-section';
    adsrSection.innerHTML = `
      <div class="section-label">
        <span class="label-text">ENVELOPE</span>
        <div class="section-line"></div>
      </div>
    `;

    const adsrControls = document.createElement('div');
    adsrControls.className = 'adsr-controls';

    // Attack
    adsrControls.appendChild(this.createKnob('attack', 'ATK', 0.001, 2, this.envelope.attack, (v) => {
      this.envelope.attack = v;
      this.updateSynth();
    }));

    // Decay
    adsrControls.appendChild(this.createKnob('decay', 'DCY', 0.001, 2, this.envelope.decay, (v) => {
      this.envelope.decay = v;
      this.updateSynth();
    }));

    // Sustain
    adsrControls.appendChild(this.createKnob('sustain', 'SUS', 0, 1, this.envelope.sustain, (v) => {
      this.envelope.sustain = v;
      this.updateSynth();
    }));

    // Release
    adsrControls.appendChild(this.createKnob('release', 'REL', 0.001, 4, this.envelope.release, (v) => {
      this.envelope.release = v;
      this.updateSynth();
    }));

    adsrSection.appendChild(adsrControls);
    faceplate.appendChild(adsrSection);

    // Volume Section
    const volumeSection = document.createElement('div');
    volumeSection.className = 'controls-section volume-section';
    volumeSection.innerHTML = `
      <div class="section-label">
        <span class="label-text">MASTER</span>
        <div class="section-line"></div>
      </div>
    `;

    const volumeKnob = this.createKnob('volume', 'VOL', 0, 1, this.volume, (v) => {
      this.volume = v;
      this.synth.setVolume(v);
    }, true);
    volumeSection.appendChild(volumeKnob);

    faceplate.appendChild(volumeSection);
    this.container.appendChild(faceplate);

    // Apply initial values to synth
    this.updateSynth();
    this.synth.setVolume(this.volume);
  }

  /**
   * Create a rotary knob control
   */
  private createKnob(
    id: string,
    label: string,
    min: number,
    max: number,
    value: number,
    onChange: (value: number) => void,
    isLarge: boolean = false
  ): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `knob-wrapper ${isLarge ? 'knob-large' : ''}`;

    // Label at top
    const labelEl = document.createElement('div');
    labelEl.className = 'knob-label';
    labelEl.textContent = label;

    // Knob container with dial indicators
    const knobContainer = document.createElement('div');
    knobContainer.className = 'knob-container';

    // SVG dial indicators
    const dialSvg = this.createDialSvg(isLarge);
    knobContainer.appendChild(dialSvg);

    // The actual knob
    const knob = document.createElement('div');
    knob.className = 'knob';
    knob.id = `knob-${id}`;
    knob.dataset.min = String(min);
    knob.dataset.max = String(max);
    knob.dataset.value = String(value);

    // Knob pointer/indicator
    const pointer = document.createElement('div');
    pointer.className = 'knob-pointer';
    knob.appendChild(pointer);

    // Set initial rotation
    const rotation = this.valueToRotation(value, min, max);
    knob.style.transform = `rotate(${rotation}deg)`;

    // Mouse down handler for dragging
    knob.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.activeKnob = knob;
      this.startY = e.clientY;
      this.startValue = parseFloat(knob.dataset.value || '0');
      knob.classList.add('active');
    });

    // Store onChange callback
    (knob as any)._onChange = onChange;
    (knob as any)._min = min;
    (knob as any)._max = max;

    knobContainer.appendChild(knob);
    
    // Value display
    const valueDisplay = document.createElement('div');
    valueDisplay.className = 'knob-value';
    valueDisplay.id = `knob-value-${id}`;
    valueDisplay.textContent = this.formatValue(value, id);

    wrapper.appendChild(labelEl);
    wrapper.appendChild(knobContainer);
    wrapper.appendChild(valueDisplay);

    return wrapper;
  }

  /**
   * Create SVG dial indicators
   */
  private createDialSvg(isLarge: boolean): SVGElement {
    const size = isLarge ? 80 : 56;
    const radius = (size / 2) - 4;
    const cx = size / 2;
    const cy = size / 2;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'dial-indicators');
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));

    // Draw tick marks around the dial (from -135° to +135°)
    const numTicks = 11;
    for (let i = 0; i < numTicks; i++) {
      const angle = -135 + (i * 270 / (numTicks - 1));
      const radians = (angle * Math.PI) / 180;
      
      const isMajor = i === 0 || i === numTicks - 1 || i === Math.floor(numTicks / 2);
      const innerRadius = radius - (isMajor ? 8 : 5);
      const outerRadius = radius - 2;

      const x1 = cx + innerRadius * Math.cos(radians);
      const y1 = cy + innerRadius * Math.sin(radians);
      const x2 = cx + outerRadius * Math.cos(radians);
      const y2 = cy + outerRadius * Math.sin(radians);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', isMajor ? 'tick-major' : 'tick-minor');
      svg.appendChild(line);
    }

    return svg;
  }

  /**
   * Handle mouse move for knob dragging
   * Uses requestAnimationFrame throttling for audio parameter updates
   */
  private handleMouseMove(e: MouseEvent): void {
    if (!this.activeKnob) return;

    const knob = this.activeKnob;
    const min = (knob as any)._min;
    const max = (knob as any)._max;
    const onChange = (knob as any)._onChange;

    // Calculate new value based on vertical drag
    const deltaY = this.startY - e.clientY;
    const sensitivity = 0.005;
    const range = max - min;
    const deltaValue = deltaY * sensitivity * range;
    
    const newValue = Math.max(min, Math.min(max, this.startValue + deltaValue));
    
    // Update knob visual immediately (CSS transform is cheap)
    knob.dataset.value = String(newValue);
    const rotation = this.valueToRotation(newValue, min, max);
    knob.style.transform = `rotate(${rotation}deg)`;

    // Update value display
    const id = knob.id.replace('knob-', '');
    const valueDisplay = document.getElementById(`knob-value-${id}`);
    if (valueDisplay) {
      valueDisplay.textContent = this.formatValue(newValue, id);
    }

    // Throttle audio parameter updates using requestAnimationFrame
    this.pendingUpdate = () => onChange(newValue);
    if (!this.updateScheduled) {
      this.updateScheduled = true;
      requestAnimationFrame(() => {
        if (this.pendingUpdate) {
          this.pendingUpdate();
          this.pendingUpdate = null;
        }
        this.updateScheduled = false;
      });
    }
  }

  /**
   * Handle mouse up
   */
  private handleMouseUp(): void {
    if (this.activeKnob) {
      this.activeKnob.classList.remove('active');
      this.activeKnob = null;
    }
    // Clear pending update
    this.pendingUpdate = null;
  }

  /**
   * Convert value to rotation angle (-135 to +135 degrees)
   */
  private valueToRotation(value: number, min: number, max: number): number {
    const normalized = (value - min) / (max - min);
    return -135 + (normalized * 270);
  }

  /**
   * Format value for display
   */
  private formatValue(value: number, type: string): string {
    if (type === 'sustain' || type === 'volume') {
      return `${Math.round(value * 100)}%`;
    }
    if (value < 0.01) {
      return `${(value * 1000).toFixed(0)}ms`;
    }
    if (value < 1) {
      return `${(value * 1000).toFixed(0)}ms`;
    }
    return `${value.toFixed(2)}s`;
  }

  /**
   * Update synth with current envelope
   */
  private updateSynth(): void {
    this.synth.setEnvelope(this.envelope);
  }

  /**
   * Get current envelope values
   */
  getEnvelope(): ADSREnvelope {
    return { ...this.envelope };
  }

  /**
   * Set envelope values programmatically
   */
  setEnvelope(envelope: Partial<ADSREnvelope>): void {
    this.envelope = { ...this.envelope, ...envelope };
    this.render();
  }
}

// Factory function
export function createSynthControls(containerId: string): SynthControls {
  const controls = new SynthControls(containerId);
  controls.render();
  return controls;
}
