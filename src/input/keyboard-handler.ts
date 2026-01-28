// Computer Keyboard Handler
// Maps QWERTY keys to piano notes

import { COMPUTER_KEY_MAP } from '../types';
import { getSynth, GlucoseSynth } from '../synthesis/synth-engine';

type KeyCallback = (note: string, isNoteOn: boolean) => void;

export class KeyboardHandler {
  private keyMap: Map<string, string> = new Map();
  private pressedKeys: Set<string> = new Set();
  private callback: KeyCallback | null = null;
  private isEnabled = true;
  
  // Cached synth reference (lazily initialized to avoid circular dependency)
  private _synth: GlucoseSynth | null = null;
  
  private get synth(): GlucoseSynth {
    if (!this._synth) {
      this._synth = getSynth();
    }
    return this._synth;
  }

  constructor() {
    // Build key-to-note map
    for (const mapping of COMPUTER_KEY_MAP) {
      const noteName = `${mapping.note}${mapping.octave}`;
      this.keyMap.set(mapping.key.toLowerCase(), noteName);
    }

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  /**
   * Start listening to keyboard events
   */
  start(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  /**
   * Stop listening to keyboard events
   */
  stop(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.allNotesOff();
  }

  /**
   * Enable/disable keyboard input
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.allNotesOff();
    }
  }

  /**
   * Set callback for note events
   */
  onNote(callback: KeyCallback): void {
    this.callback = callback;
  }

  /**
   * Handle keydown event
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled) return;
    
    // Ignore if typing in an input field
    if (this.isInputFocused()) return;

    const key = event.key.toLowerCase();
    const note = this.keyMap.get(key);

    if (note && !this.pressedKeys.has(key)) {
      event.preventDefault();
      this.pressedKeys.add(key);
      
      // Trigger note on synth (using cached reference)
      this.synth.noteOn(note);
      
      // Call callback
      this.callback?.(note, true);
    }
  }

  /**
   * Handle keyup event
   */
  private handleKeyUp(event: KeyboardEvent): void {
    if (!this.isEnabled) return;

    const key = event.key.toLowerCase();
    const note = this.keyMap.get(key);

    if (note && this.pressedKeys.has(key)) {
      event.preventDefault();
      this.pressedKeys.delete(key);
      
      // Trigger note off on synth (using cached reference)
      this.synth.noteOff(note);
      
      // Call callback
      this.callback?.(note, false);
    }
  }

  /**
   * Check if an input element is focused
   */
  private isInputFocused(): boolean {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    
    const tagName = activeElement.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  }

  /**
   * Release all pressed notes
   */
  allNotesOff(): void {
    for (const key of this.pressedKeys) {
      const note = this.keyMap.get(key);
      if (note) {
        this.synth.noteOff(note);
        this.callback?.(note, false);
      }
    }
    this.pressedKeys.clear();
  }

  /**
   * Get currently pressed notes
   */
  getPressedNotes(): string[] {
    const notes: string[] = [];
    for (const key of this.pressedKeys) {
      const note = this.keyMap.get(key);
      if (note) notes.push(note);
    }
    return notes;
  }

  /**
   * Get the key for a given note
   */
  getKeyForNote(note: string): string | undefined {
    for (const [key, mappedNote] of this.keyMap) {
      if (mappedNote === note) return key;
    }
    return undefined;
  }
}

// Singleton instance
let keyboardHandlerInstance: KeyboardHandler | null = null;

export function getKeyboardHandler(): KeyboardHandler {
  if (!keyboardHandlerInstance) {
    keyboardHandlerInstance = new KeyboardHandler();
  }
  return keyboardHandlerInstance;
}

