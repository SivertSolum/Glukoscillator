// Effects Panel - Modular Stomp Box Design
// Each effect is a standalone pedal-style module with knobs

import { getSynth } from '../synthesis/synth-engine';
import { 
  type EffectId, 
  getEffectDisplayName,
  type CompressorParams,
  type EQ3Params,
  type BitCrusherParams,
  type DistortionParams,
  type AutoWahParams,
  type AutoFilterParams,
  type PhaserParams,
  type ChorusParams,
  type TremoloParams,
  type VibratoParams,
  type FreqShiftParams,
  type PitchShiftParams,
  type DelayParams,
  type ReverbParams,
  type StereoWidenerParams,
  EffectsChain,
} from '../synthesis/effects-chain';
import { EFFECT_ICONS, EFFECT_COLORS } from './effects-icons';

export class EffectsPanel {
  private container: HTMLElement;
  private effectsContainer: HTMLElement | null = null;
  private dropIndicator: HTMLElement | null = null;
  private addDropdown: HTMLElement | null = null;
  private isDropdownOpen: boolean = false;
  private draggedEffect: EffectId | null = null;
  private dropTargetIndex: number = -1;
  private activeKnob: HTMLElement | null = null;
  private startY: number = 0;
  private startValue: number = 0;
  
  // Throttling state for knob updates
  private pendingKnobUpdate: { effectId: EffectId; param: string; value: number } | null = null;
  private knobUpdateScheduled: boolean = false;
  
  // Cached references for performance
  private effectsChain: EffectsChain;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }
    this.container = container;
    
    // Cache effects chain reference
    this.effectsChain = getSynth().getEffectsChain();
    
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.addDropdown && !this.addDropdown.contains(e.target as Node) && this.isDropdownOpen) {
        this.closeDropdown();
      }
    });
    
    this.render();
    this.setupEffectsCallbacks();
  }

  private setupEffectsCallbacks(): void {
    this.effectsChain.onChange((effectId) => {
      this.updateEffectModule(effectId);
      this.updateDropdownList();
    });
    this.effectsChain.onOrderChange(() => {
      this.renderEffectModules();
      this.updateDropdownList();
    });
  }

  render(): void {
    this.container.innerHTML = '';
    this.container.className = 'effects-rack';

    const header = document.createElement('div');
    header.className = 'rack-header';
    header.innerHTML = `
      <div class="rack-screws left"><div class="screw"></div><div class="screw"></div></div>
      <div class="rack-title">
        <span class="rack-label">EFFECTS CHAIN</span>
        <button class="rack-reset-btn" title="Reset all effects">RESET</button>
      </div>
      <div class="rack-screws right"><div class="screw"></div><div class="screw"></div></div>
    `;
    this.container.appendChild(header);
    header.querySelector('.rack-reset-btn')?.addEventListener('click', () => {
      this.effectsChain.reset();
      this.renderEffectModules();
      this.updateDropdownList();
    });

    this.effectsContainer = document.createElement('div');
    this.effectsContainer.className = 'effects-pedalboard';
    this.container.appendChild(this.effectsContainer);
    
    // Create drop indicator
    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'drop-indicator';
    this.effectsContainer.appendChild(this.dropIndicator);
    
    // Set up container-level drag handlers
    this.setupContainerDragHandlers();
    
    // Create the add-effect dropdown
    this.addDropdown = this.createAddEffectDropdown();
    this.container.appendChild(this.addDropdown);
    
    this.renderEffectModules();
  }

  private setupContainerDragHandlers(): void {
    if (!this.effectsContainer) return;
    
    this.effectsContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!this.draggedEffect) return;
      
      this.updateDropIndicator(e.clientX);
    });
    
    this.effectsContainer.addEventListener('dragleave', (e) => {
      // Only hide if leaving the container entirely
      const rect = this.effectsContainer!.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || 
          e.clientY < rect.top || e.clientY > rect.bottom) {
        this.hideDropIndicator();
      }
    });
    
    this.effectsContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!this.draggedEffect || this.dropTargetIndex < 0) return;
      
      this.performDrop();
    });
  }

  private updateDropIndicator(clientX: number): void {
    if (!this.effectsContainer || !this.dropIndicator || !this.draggedEffect) return;
    
    const modules = Array.from(this.effectsContainer.querySelectorAll('.effect-module:not(.dragging)')) as HTMLElement[];
    if (modules.length === 0) {
      this.hideDropIndicator();
      return;
    }
    
    // Find the position to insert
    let insertIndex = modules.length;
    let indicatorX = 0;
    
    for (let i = 0; i < modules.length; i++) {
      const rect = modules[i].getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      
      if (clientX < midpoint) {
        insertIndex = i;
        indicatorX = rect.left - 8;
        break;
      }
      
      // If we're past the last module
      if (i === modules.length - 1) {
        indicatorX = rect.right + 8;
      }
    }
    
    // Don't show indicator if dropping in same position
    const enabledEffects = this.effectsChain.getEnabledEffects();
    const draggedIndex = enabledEffects.indexOf(this.draggedEffect);
    if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
      this.hideDropIndicator();
      this.dropTargetIndex = -1;
      return;
    }
    
    this.dropTargetIndex = insertIndex;
    
    // Position the indicator
    const containerRect = this.effectsContainer.getBoundingClientRect();
    this.dropIndicator.style.left = `${indicatorX - containerRect.left}px`;
    this.dropIndicator.classList.add('visible');
  }

  private hideDropIndicator(): void {
    this.dropIndicator?.classList.remove('visible');
  }

  private performDrop(): void {
    if (!this.draggedEffect || this.dropTargetIndex < 0) return;
    
    const enabledEffects = this.effectsChain.getEnabledEffects();
    const currentOrder = this.effectsChain.getOrder();
    const draggedIndex = enabledEffects.indexOf(this.draggedEffect);
    
    // Calculate the target effect to insert before/after
    let targetIndex = this.dropTargetIndex;
    if (draggedIndex < targetIndex) {
      targetIndex--; // Adjust for removal
    }
    
    // Build new order
    const newOrder = currentOrder.filter(id => id !== this.draggedEffect);
    
    // Find where to insert in the full order based on enabled effects position
    if (targetIndex >= enabledEffects.length - 1) {
      // Insert at end of enabled effects
      const lastEnabled = enabledEffects[enabledEffects.length - 1];
      if (lastEnabled && lastEnabled !== this.draggedEffect) {
        const lastEnabledOrderIndex = newOrder.indexOf(lastEnabled);
        newOrder.splice(lastEnabledOrderIndex + 1, 0, this.draggedEffect);
      } else {
        newOrder.push(this.draggedEffect);
      }
    } else {
      // Insert before the target
      const targetEffect = enabledEffects.filter(id => id !== this.draggedEffect)[targetIndex];
      if (targetEffect) {
        const targetOrderIndex = newOrder.indexOf(targetEffect);
        newOrder.splice(targetOrderIndex, 0, this.draggedEffect);
      }
    }
    
    this.effectsChain.reorder(newOrder);
    this.hideDropIndicator();
    this.dropTargetIndex = -1;
  }

  private createAddEffectDropdown(): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'add-effect-dropdown';
    
    dropdown.innerHTML = `
      <div class="add-effect-header">
        <span class="add-effect-label">+ Add Effect</span>
        <div class="dropdown-arrow">
          <svg viewBox="0 0 24 24">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>
      <div class="add-effect-panel">
        <div class="add-effect-list"></div>
      </div>
    `;
    
    const header = dropdown.querySelector('.add-effect-header');
    header?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });
    
    this.updateDropdownList(dropdown);
    
    return dropdown;
  }

  private updateDropdownList(dropdown?: HTMLElement): void {
    const container = dropdown || this.addDropdown;
    if (!container) return;
    
    const list = container.querySelector('.add-effect-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    const disabledEffects = this.effectsChain.getDisabledEffects();
    
    if (disabledEffects.length === 0) {
      list.innerHTML = '<div class="no-effects-available">All effects active</div>';
      return;
    }
    
    for (const effectId of disabledEffects) {
      const item = document.createElement('div');
      item.className = 'add-effect-item';
      item.dataset.effect = effectId;
      
      const accentColor = EFFECT_COLORS[effectId];
      item.innerHTML = `
        <div class="effect-item-icon" style="color: ${accentColor}">${EFFECT_ICONS[effectId]}</div>
        <span class="effect-item-name">${getEffectDisplayName(effectId)}</span>
      `;
      
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addEffect(effectId);
        this.closeDropdown();
      });
      
      list.appendChild(item);
    }
  }

  private toggleDropdown(): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    this.isDropdownOpen = true;
    this.addDropdown?.classList.add('open');
    this.updateDropdownList();
    
    // Position the panel above the header using fixed positioning
    const header = this.addDropdown?.querySelector('.add-effect-header') as HTMLElement;
    const panel = this.addDropdown?.querySelector('.add-effect-panel') as HTMLElement;
    if (header && panel) {
      const rect = header.getBoundingClientRect();
      panel.style.position = 'fixed';
      panel.style.bottom = `${window.innerHeight - rect.top}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.width = `${rect.width}px`;
    }
  }

  private closeDropdown(): void {
    this.isDropdownOpen = false;
    this.addDropdown?.classList.remove('open');
    
    // Reset panel positioning
    const panel = this.addDropdown?.querySelector('.add-effect-panel') as HTMLElement;
    if (panel) {
      panel.style.position = '';
      panel.style.bottom = '';
      panel.style.left = '';
      panel.style.width = '';
    }
  }

  private addEffect(effectId: EffectId): void {
    this.setEffectEnabled(effectId, true);
    this.renderEffectModules();
    this.updateDropdownList();
  }

  private removeEffect(effectId: EffectId): void {
    this.setEffectEnabled(effectId, false);
    this.renderEffectModules();
    this.updateDropdownList();
  }

  private renderEffectModules(): void {
    if (!this.effectsContainer) return;
    this.effectsContainer.innerHTML = '';
    
    // Only render enabled effects
    const enabledEffects = this.effectsChain.getEnabledEffects();
    
    if (enabledEffects.length === 0) {
      this.effectsContainer.innerHTML = '<div class="no-effects-message">No effects active. Add effects using the dropdown below.</div>';
    } else {
      for (const effectId of enabledEffects) {
        this.effectsContainer.appendChild(this.createEffectModule(effectId));
      }
    }
    
    // Re-add drop indicator (it gets removed when innerHTML is cleared)
    if (this.dropIndicator) {
      this.effectsContainer.appendChild(this.dropIndicator);
    }
  }

  private createEffectModule(effectId: EffectId): HTMLElement {
    const params = this.effectsChain.getEffectParams(effectId);
    const accentColor = EFFECT_COLORS[effectId];

    const module = document.createElement('div');
    module.className = 'effect-module enabled';
    module.id = `effect-module-${effectId}`;
    module.draggable = true;
    module.dataset.effect = effectId;

    module.innerHTML = `
      <div class="module-faceplate" style="--accent-color: ${accentColor}">
        <button class="module-remove-btn" title="Remove effect">×</button>
        <div class="module-screws top"><div class="screw small"></div><div class="screw small"></div></div>
        <div class="module-header">
          <div class="module-icon">${EFFECT_ICONS[effectId]}</div>
          <div class="module-name">${getEffectDisplayName(effectId)}</div>
        </div>
        <div class="module-knobs">${this.getEffectKnobsHTML(effectId, params)}</div>
        <div class="module-footer">
          <div class="module-label">${effectId.toUpperCase()}</div>
        </div>
        <div class="module-screws bottom"><div class="screw small"></div><div class="screw small"></div></div>
      </div>
    `;

    module.querySelector('.module-remove-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeEffect(effectId);
    });
    this.setupKnobHandlers(module, effectId);
    this.setupDragHandlers(module, effectId);
    return module;
  }

  private getEffectKnobsHTML(effectId: EffectId, params: any): string {
    const knob = (param: string, label: string, value: number, min: number, max: number) => this.createMiniKnobHTML(param, label, value, min, max);

    switch (effectId) {
      case 'compressor': { const p = params as CompressorParams; return `<div class="knob-row">${knob('threshold', 'THRESH', (p.threshold + 60) * (100/60), 0, 100)}${knob('ratio', 'RATIO', p.ratio * 5, 5, 100)}</div>`; }
      case 'eq3': { const p = params as EQ3Params; return `<div class="knob-row">${knob('low', 'LOW', p.low + 50, 0, 100)}${knob('mid', 'MID', p.mid + 50, 0, 100)}${knob('high', 'HIGH', p.high + 50, 0, 100)}</div>`; }
      case 'bitcrusher': { const p = params as BitCrusherParams; return `<div class="knob-row">${knob('bits', 'BITS', p.bits * 6, 24, 96)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'distortion': { const p = params as DistortionParams; return `<div class="knob-row">${knob('amount', 'DRIVE', p.amount * 100, 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'autowah': { const p = params as AutoWahParams; return `<div class="knob-row">${knob('baseFrequency', 'FREQ', p.baseFrequency / 10, 10, 100)}${knob('octaves', 'OCT', p.octaves * 10, 10, 80)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'autofilter': { const p = params as AutoFilterParams; return `<div class="knob-row">${knob('frequency', 'RATE', p.frequency * 10, 5, 100)}${knob('depth', 'DEPTH', p.depth * 100, 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'phaser': { const p = params as PhaserParams; return `<div class="knob-row">${knob('frequency', 'RATE', p.frequency * 10, 1, 100)}${knob('octaves', 'OCT', p.octaves, 1, 5)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'chorus': { const p = params as ChorusParams; return `<div class="knob-row">${knob('frequency', 'RATE', p.frequency * 10, 1, 80)}${knob('depth', 'DEPTH', p.depth * 100, 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'tremolo': { const p = params as TremoloParams; return `<div class="knob-row">${knob('frequency', 'RATE', p.frequency * 5, 10, 100)}${knob('depth', 'DEPTH', p.depth * 100, 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'vibrato': { const p = params as VibratoParams; return `<div class="knob-row">${knob('frequency', 'RATE', p.frequency * 5, 10, 100)}${knob('depth', 'DEPTH', p.depth * 100, 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'freqshift': { const p = params as FreqShiftParams; return `<div class="knob-row">${knob('frequency', 'SHIFT', (p.frequency + 500) / 10, 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'pitchshift': { const p = params as PitchShiftParams; return `<div class="knob-row">${knob('pitch', 'SEMI', (p.pitch + 12) * (100/24), 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'delay': { const p = params as DelayParams; return `<div class="knob-row">${knob('time', 'TIME', p.time * 100, 10, 100)}${knob('feedback', 'FDBK', p.feedback * 100, 0, 90)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'reverb': { const p = params as ReverbParams; return `<div class="knob-row">${knob('decay', 'DECAY', p.decay * 20, 10, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      case 'stereowidener': { const p = params as StereoWidenerParams; return `<div class="knob-row">${knob('width', 'WIDTH', p.width * 100, 0, 100)}${knob('wet', 'MIX', p.wet * 100, 0, 100)}</div>`; }
      default: return '';
    }
  }

  private createMiniKnobHTML(param: string, label: string, value: number, min: number, max: number): string {
    const rotation = -135 + ((value - min) / (max - min)) * 270;
    return `<div class="mini-knob-wrapper"><div class="mini-knob-label">${label}</div><div class="mini-knob-container"><div class="mini-knob" data-param="${param}" data-value="${value}" data-min="${min}" data-max="${max}" style="transform: rotate(${rotation}deg)"><div class="mini-knob-pointer"></div></div></div></div>`;
  }

  private setupKnobHandlers(module: HTMLElement, effectId: EffectId): void {
    module.querySelectorAll('.mini-knob').forEach(knob => {
      const knobEl = knob as HTMLElement;
      knobEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.activeKnob = knobEl;
        this.startY = e.clientY;
        this.startValue = parseFloat(knobEl.dataset.value || '0');
        knobEl.classList.add('active');
        (knobEl as any)._effectId = effectId;
      });
    });
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.activeKnob) return;
    const knob = this.activeKnob;
    const min = parseFloat(knob.dataset.min || '0');
    const max = parseFloat(knob.dataset.max || '100');
    const param = knob.dataset.param || '';
    const effectId = (knob as any)._effectId as EffectId;

    const deltaY = this.startY - e.clientY;
    const newValue = Math.max(min, Math.min(max, this.startValue + deltaY * 0.5));
    
    // Update visual immediately (CSS transform is cheap)
    knob.dataset.value = String(newValue);
    knob.style.transform = `rotate(${-135 + ((newValue - min) / (max - min)) * 270}deg)`;
    
    // Throttle audio parameter updates using requestAnimationFrame
    this.pendingKnobUpdate = { effectId, param, value: newValue };
    if (!this.knobUpdateScheduled) {
      this.knobUpdateScheduled = true;
      requestAnimationFrame(() => {
        if (this.pendingKnobUpdate) {
          this.updateEffectParameter(
            this.pendingKnobUpdate.effectId,
            this.pendingKnobUpdate.param,
            this.pendingKnobUpdate.value
          );
          this.pendingKnobUpdate = null;
        }
        this.knobUpdateScheduled = false;
      });
    }
  }

  private handleMouseUp(): void {
    if (this.activeKnob) {
      this.activeKnob.classList.remove('active');
      this.activeKnob = null;
    }
    // Clear any pending updates
    this.pendingKnobUpdate = null;
  }

  private updateEffectParameter(effectId: EffectId, param: string, rawValue: number): void {
    const fx = this.effectsChain;
    switch (effectId) {
      case 'compressor': if (param === 'threshold') fx.setCompressor({ threshold: (rawValue * 60 / 100) - 60 }); else if (param === 'ratio') fx.setCompressor({ ratio: rawValue / 5 }); break;
      case 'eq3': if (param === 'low') fx.setEQ3({ low: rawValue - 50 }); else if (param === 'mid') fx.setEQ3({ mid: rawValue - 50 }); else if (param === 'high') fx.setEQ3({ high: rawValue - 50 }); break;
      case 'bitcrusher': if (param === 'bits') fx.setBitCrusher({ bits: Math.round(rawValue / 6) }); else if (param === 'wet') fx.setBitCrusher({ wet: rawValue / 100 }); break;
      case 'distortion': if (param === 'amount') fx.setDistortion({ amount: rawValue / 100 }); else if (param === 'wet') fx.setDistortion({ wet: rawValue / 100 }); break;
      case 'autowah': if (param === 'baseFrequency') fx.setAutoWah({ baseFrequency: rawValue * 10 }); else if (param === 'octaves') fx.setAutoWah({ octaves: Math.round(rawValue / 10) }); else if (param === 'wet') fx.setAutoWah({ wet: rawValue / 100 }); break;
      case 'autofilter': if (param === 'frequency') fx.setAutoFilter({ frequency: rawValue / 10 }); else if (param === 'depth') fx.setAutoFilter({ depth: rawValue / 100 }); else if (param === 'wet') fx.setAutoFilter({ wet: rawValue / 100 }); break;
      case 'phaser': if (param === 'frequency') fx.setPhaser({ frequency: rawValue / 10 }); else if (param === 'octaves') fx.setPhaser({ octaves: Math.round(rawValue) }); else if (param === 'wet') fx.setPhaser({ wet: rawValue / 100 }); break;
      case 'chorus': if (param === 'frequency') fx.setChorus({ frequency: rawValue / 10 }); else if (param === 'depth') fx.setChorus({ depth: rawValue / 100 }); else if (param === 'wet') fx.setChorus({ wet: rawValue / 100 }); break;
      case 'tremolo': if (param === 'frequency') fx.setTremolo({ frequency: rawValue / 5 }); else if (param === 'depth') fx.setTremolo({ depth: rawValue / 100 }); else if (param === 'wet') fx.setTremolo({ wet: rawValue / 100 }); break;
      case 'vibrato': if (param === 'frequency') fx.setVibrato({ frequency: rawValue / 5 }); else if (param === 'depth') fx.setVibrato({ depth: rawValue / 100 }); else if (param === 'wet') fx.setVibrato({ wet: rawValue / 100 }); break;
      case 'freqshift': if (param === 'frequency') fx.setFreqShift({ frequency: (rawValue * 10) - 500 }); else if (param === 'wet') fx.setFreqShift({ wet: rawValue / 100 }); break;
      case 'pitchshift': if (param === 'pitch') fx.setPitchShift({ pitch: Math.round((rawValue * 24 / 100) - 12) }); else if (param === 'wet') fx.setPitchShift({ wet: rawValue / 100 }); break;
      case 'delay': if (param === 'time') fx.setDelay({ time: rawValue / 100 }); else if (param === 'feedback') fx.setDelay({ feedback: rawValue / 100 }); else if (param === 'wet') fx.setDelay({ wet: rawValue / 100 }); break;
      case 'reverb': if (param === 'decay') fx.setReverb({ decay: rawValue / 20 }); else if (param === 'wet') fx.setReverb({ wet: rawValue / 100 }); break;
      case 'stereowidener': if (param === 'width') fx.setStereoWidener({ width: rawValue / 100 }); else if (param === 'wet') fx.setStereoWidener({ wet: rawValue / 100 }); break;
    }
  }

  private setupDragHandlers(module: HTMLElement, effectId: EffectId): void {
    // Add will-change hint for smoother dragging
    module.style.willChange = 'transform';
    
    module.addEventListener('dragstart', (e) => {
      this.draggedEffect = effectId;
      module.classList.add('dragging');
      e.dataTransfer?.setData('text/plain', effectId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    
    module.addEventListener('dragend', () => {
      this.draggedEffect = null;
      module.classList.remove('dragging');
      this.hideDropIndicator();
      this.dropTargetIndex = -1;
    });
  }

  private setEffectEnabled(effectId: EffectId, enabled: boolean): void {
    const fx = this.effectsChain;
    switch (effectId) {
      case 'compressor': fx.setCompressor({ enabled }); break;
      case 'eq3': fx.setEQ3({ enabled }); break;
      case 'bitcrusher': fx.setBitCrusher({ enabled }); break;
      case 'distortion': fx.setDistortion({ enabled }); break;
      case 'autowah': fx.setAutoWah({ enabled }); break;
      case 'autofilter': fx.setAutoFilter({ enabled }); break;
      case 'phaser': fx.setPhaser({ enabled }); break;
      case 'chorus': fx.setChorus({ enabled }); break;
      case 'tremolo': fx.setTremolo({ enabled }); break;
      case 'vibrato': fx.setVibrato({ enabled }); break;
      case 'freqshift': fx.setFreqShift({ enabled }); break;
      case 'pitchshift': fx.setPitchShift({ enabled }); break;
      case 'delay': fx.setDelay({ enabled }); break;
      case 'reverb': fx.setReverb({ enabled }); break;
      case 'stereowidener': fx.setStereoWidener({ enabled }); break;
    }
    this.updateEffectModule(effectId);
  }

  private updateEffectModule(effectId: EffectId): void {
    const module = document.getElementById(`effect-module-${effectId}`);
    const isEnabled = this.effectsChain.isEnabled(effectId);
    
    // If enabled state changed, re-render all modules
    if (isEnabled && !module) {
      this.renderEffectModules();
      return;
    }
    if (!isEnabled && module) {
      this.renderEffectModules();
      return;
    }
    
    if (!module) return;
    this.updateKnobValues(module, effectId, this.effectsChain.getEffectParams(effectId));
  }

  private updateKnobValues(module: HTMLElement, effectId: EffectId, params: any): void {
    module.querySelectorAll('.mini-knob').forEach(knob => {
      const knobEl = knob as HTMLElement;
      const param = knobEl.dataset.param || '';
      const min = parseFloat(knobEl.dataset.min || '0');
      const max = parseFloat(knobEl.dataset.max || '100');
      
      let value = this.getKnobValueFromParams(effectId, param, params);
      knobEl.dataset.value = String(value);
      knobEl.style.transform = `rotate(${-135 + ((value - min) / (max - min)) * 270}deg)`;
    });
  }

  private getKnobValueFromParams(effectId: EffectId, param: string, params: any): number {
    switch (effectId) {
      case 'compressor': { const p = params as CompressorParams; return param === 'threshold' ? (p.threshold + 60) * (100/60) : p.ratio * 5; }
      case 'eq3': { const p = params as EQ3Params; return param === 'low' ? p.low + 50 : param === 'mid' ? p.mid + 50 : p.high + 50; }
      case 'bitcrusher': { const p = params as BitCrusherParams; return param === 'bits' ? p.bits * 6 : p.wet * 100; }
      case 'distortion': { const p = params as DistortionParams; return param === 'amount' ? p.amount * 100 : p.wet * 100; }
      case 'autowah': { const p = params as AutoWahParams; return param === 'baseFrequency' ? p.baseFrequency / 10 : param === 'octaves' ? p.octaves * 10 : p.wet * 100; }
      case 'autofilter': { const p = params as AutoFilterParams; return param === 'frequency' ? p.frequency * 10 : param === 'depth' ? p.depth * 100 : p.wet * 100; }
      case 'phaser': { const p = params as PhaserParams; return param === 'frequency' ? p.frequency * 10 : param === 'octaves' ? p.octaves : p.wet * 100; }
      case 'chorus': { const p = params as ChorusParams; return param === 'frequency' ? p.frequency * 10 : param === 'depth' ? p.depth * 100 : p.wet * 100; }
      case 'tremolo': { const p = params as TremoloParams; return param === 'frequency' ? p.frequency * 5 : param === 'depth' ? p.depth * 100 : p.wet * 100; }
      case 'vibrato': { const p = params as VibratoParams; return param === 'frequency' ? p.frequency * 5 : param === 'depth' ? p.depth * 100 : p.wet * 100; }
      case 'freqshift': { const p = params as FreqShiftParams; return param === 'frequency' ? (p.frequency + 500) / 10 : p.wet * 100; }
      case 'pitchshift': { const p = params as PitchShiftParams; return param === 'pitch' ? (p.pitch + 12) * (100/24) : p.wet * 100; }
      case 'delay': { const p = params as DelayParams; return param === 'time' ? p.time * 100 : param === 'feedback' ? p.feedback * 100 : p.wet * 100; }
      case 'reverb': { const p = params as ReverbParams; return param === 'decay' ? p.decay * 20 : p.wet * 100; }
      case 'stereowidener': { const p = params as StereoWidenerParams; return param === 'width' ? p.width * 100 : p.wet * 100; }
      default: return 0;
    }
  }
}

export function createEffectsPanel(containerId: string): EffectsPanel {
  return new EffectsPanel(containerId);
}
