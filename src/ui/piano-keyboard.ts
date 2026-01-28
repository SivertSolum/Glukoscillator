// Virtual Piano Keyboard
// On-screen clickable piano with dynamic sizing

import { getSynth, GlucoseSynth } from '../synthesis/synth-engine';
import { getKeyboardHandler, KeyboardHandler } from '../input/keyboard-handler';

interface PianoKey {
  note: string;
  isBlack: boolean;
  keyboardShortcut?: string;
}

// Key dimensions for calculation
const WHITE_KEY_WIDTH = 44;
const MIN_OCTAVES = 3;
const MAX_OCTAVES = 6;

// Debounce timeout for resize
const RESIZE_DEBOUNCE_MS = 200;

export class PianoKeyboard {
  private container: HTMLElement;
  private keys: Map<string, HTMLElement> = new Map();
  private activeNotes: Set<string> = new Set();
  private startOctave: number;
  private octaveCount: number;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // Cached singleton references
  private synth: GlucoseSynth;
  private keyboardHandler: KeyboardHandler;

  constructor(containerId: string, startOctave: number = 2, octaveCount: number = 5) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }
    this.container = container;
    this.startOctave = startOctave;
    this.octaveCount = octaveCount;
    
    // Cache singleton references
    this.synth = getSynth();
    this.keyboardHandler = getKeyboardHandler();

    // Set up resize observer for dynamic sizing
    this.setupResizeObserver();
  }

  /**
   * Set up resize observer for dynamic octave calculation
   * Uses debouncing to avoid excessive re-renders
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      // Debounce resize handling
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.calculateAndRender();
        this.resizeTimeout = null;
      }, RESIZE_DEBOUNCE_MS);
    });
    this.resizeObserver.observe(this.container.parentElement || this.container);
  }

  /**
   * Calculate optimal octave count based on container width
   */
  private calculateOptimalOctaves(): { startOctave: number; octaveCount: number } {
    const containerWidth = this.container.parentElement?.clientWidth || this.container.clientWidth;
    const padding = 20; // Account for container padding
    const availableWidth = containerWidth - padding * 2;
    
    // Each octave has 7 white keys
    const whiteKeysPerOctave = 7;
    // Plus one extra white key for the final C
    const extraKeys = 1;
    
    // Calculate how many octaves can fit
    let possibleOctaves = Math.floor((availableWidth / WHITE_KEY_WIDTH - extraKeys) / whiteKeysPerOctave);
    
    // Clamp to min/max
    possibleOctaves = Math.max(MIN_OCTAVES, Math.min(MAX_OCTAVES, possibleOctaves));
    
    // Center the keyboard range around middle C (C4)
    // For odd octave counts: C2-C7 (5 octaves), C3-C6 (3 octaves)
    // For even octave counts: C2-C6 (4 octaves), C2-C8 (6 octaves)
    let startOctave: number;
    switch (possibleOctaves) {
      case 3:
        startOctave = 3; // C3 to C6
        break;
      case 4:
        startOctave = 2; // C2 to C6
        break;
      case 5:
        startOctave = 2; // C2 to C7
        break;
      case 6:
        startOctave = 1; // C1 to C7
        break;
      default:
        startOctave = 2;
    }
    
    return { startOctave, octaveCount: possibleOctaves };
  }

  /**
   * Calculate and render with optimal settings
   */
  private calculateAndRender(): void {
    const { startOctave, octaveCount } = this.calculateOptimalOctaves();
    
    // Only re-render if octave count changed
    if (this.octaveCount !== octaveCount || this.startOctave !== startOctave) {
      this.startOctave = startOctave;
      this.octaveCount = octaveCount;
      this.render();
    }
  }

  /**
   * Build and render the piano keyboard
   */
  render(): void {
    this.container.innerHTML = '';
    this.container.className = 'piano-keyboard';
    this.keys.clear();

    for (let octave = this.startOctave; octave < this.startOctave + this.octaveCount; octave++) {
      const octaveKeys = this.getOctaveKeys(octave);
      
      for (const keyInfo of octaveKeys) {
        const keyElement = this.createKeyElement(keyInfo);
        this.container.appendChild(keyElement);
        this.keys.set(keyInfo.note, keyElement);
      }
    }

    // Add extra C at the end
    const finalC: PianoKey = { 
      note: `C${this.startOctave + this.octaveCount}`, 
      isBlack: false,
      keyboardShortcut: this.keyboardHandler.getKeyForNote(`C${this.startOctave + this.octaveCount}`)
    };
    const finalKeyElement = this.createKeyElement(finalC);
    this.container.appendChild(finalKeyElement);
    this.keys.set(finalC.note, finalKeyElement);
  }

  /**
   * Get keys for one octave
   */
  private getOctaveKeys(octave: number): PianoKey[] {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    return noteNames.map(name => ({
      note: `${name}${octave}`,
      isBlack: name.includes('#'),
      keyboardShortcut: this.keyboardHandler.getKeyForNote(`${name}${octave}`)
    }));
  }

  /**
   * Create a single piano key element
   */
  private createKeyElement(keyInfo: PianoKey): HTMLElement {
    const key = document.createElement('div');
    key.className = `piano-key ${keyInfo.isBlack ? 'black-key' : 'white-key'}`;
    key.dataset.note = keyInfo.note;
    
    // Add keyboard shortcut label
    if (keyInfo.keyboardShortcut) {
      key.classList.add('has-shortcut');
      const shortcutLabel = document.createElement('span');
      shortcutLabel.className = 'key-shortcut';
      shortcutLabel.textContent = keyInfo.keyboardShortcut.toUpperCase();
      key.appendChild(shortcutLabel);
    }

    // Add note label
    const noteLabel = document.createElement('span');
    noteLabel.className = 'key-note';
    noteLabel.textContent = keyInfo.note;
    key.appendChild(noteLabel);

    // Mouse/touch events
    key.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.handleNoteOn(keyInfo.note);
    });

    key.addEventListener('mouseup', () => {
      this.handleNoteOff(keyInfo.note);
    });

    key.addEventListener('mouseleave', () => {
      if (this.activeNotes.has(keyInfo.note)) {
        this.handleNoteOff(keyInfo.note);
      }
    });

    key.addEventListener('mouseenter', (e) => {
      if (e.buttons === 1) { // Left mouse button held
        this.handleNoteOn(keyInfo.note);
      }
    });

    // Touch events
    key.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.handleNoteOn(keyInfo.note);
    });

    key.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.handleNoteOff(keyInfo.note);
    });

    return key;
  }

  /**
   * Handle note on
   */
  private handleNoteOn(note: string): void {
    if (this.activeNotes.has(note)) return;
    
    this.synth.noteOn(note);
    this.activeNotes.add(note);
    this.setKeyActive(note, true);
  }

  /**
   * Handle note off
   */
  private handleNoteOff(note: string): void {
    if (!this.activeNotes.has(note)) return;
    
    this.synth.noteOff(note);
    this.activeNotes.delete(note);
    this.setKeyActive(note, false);
  }

  /**
   * Set visual active state for a key
   */
  setKeyActive(note: string, active: boolean): void {
    const keyElement = this.keys.get(note);
    if (keyElement) {
      keyElement.classList.toggle('active', active);
    }
  }

  /**
   * Clear all active states
   */
  clearAllActive(): void {
    for (const note of this.activeNotes) {
      this.setKeyActive(note, false);
    }
    this.activeNotes.clear();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
  }
}

// Factory function
export function createPianoKeyboard(containerId: string): PianoKeyboard {
  const keyboard = new PianoKeyboard(containerId, 2, 5);
  keyboard.render();
  return keyboard;
}
