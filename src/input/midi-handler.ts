// MIDI Handler
// Web MIDI API integration for physical MIDI keyboards

import { getSynth, midiToNoteName, GlucoseSynth } from '../synthesis/synth-engine';

type MIDICallback = (note: string, isNoteOn: boolean, velocity: number) => void;

export class MIDIHandler {
  private midiAccess: MIDIAccess | null = null;
  private inputs: Map<string, MIDIInput> = new Map();
  private callback: MIDICallback | null = null;
  private isEnabled = true;
  private connectionCallback: ((connected: boolean, deviceName: string) => void) | null = null;
  
  // Cached synth reference (lazily initialized)
  private _synth: GlucoseSynth | null = null;
  
  private get synth(): GlucoseSynth {
    if (!this._synth) {
      this._synth = getSynth();
    }
    return this._synth;
  }

  constructor() {
    this.handleMIDIMessage = this.handleMIDIMessage.bind(this);
    this.handleStateChange = this.handleStateChange.bind(this);
  }

  /**
   * Check if Web MIDI is supported
   */
  static isSupported(): boolean {
    return 'requestMIDIAccess' in navigator;
  }

  /**
   * Request MIDI access and start listening
   */
  async start(): Promise<boolean> {
    if (!MIDIHandler.isSupported()) {
      console.warn('Web MIDI API not supported in this browser');
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.midiAccess.onstatechange = this.handleStateChange;
      
      // Connect to all available inputs
      this.connectInputs();
      
      console.log('MIDI access granted');
      return true;
    } catch (error) {
      console.error('Failed to get MIDI access:', error);
      return false;
    }
  }

  /**
   * Stop listening to MIDI
   */
  stop(): void {
    for (const input of this.inputs.values()) {
      input.onmidimessage = null;
    }
    this.inputs.clear();
    
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
    }
  }

  /**
   * Enable/disable MIDI input
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.synth.allNotesOff();
    }
  }

  /**
   * Set callback for note events
   */
  onNote(callback: MIDICallback): void {
    this.callback = callback;
  }

  /**
   * Set callback for connection events
   */
  onConnection(callback: (connected: boolean, deviceName: string) => void): void {
    this.connectionCallback = callback;
  }

  /**
   * Get list of connected MIDI devices
   */
  getConnectedDevices(): string[] {
    const devices: string[] = [];
    for (const input of this.inputs.values()) {
      devices.push(input.name || 'Unknown Device');
    }
    return devices;
  }

  /**
   * Connect to all available MIDI inputs
   */
  private connectInputs(): void {
    if (!this.midiAccess) return;

    for (const input of this.midiAccess.inputs.values()) {
      if (!this.inputs.has(input.id)) {
        input.onmidimessage = this.handleMIDIMessage;
        this.inputs.set(input.id, input);
        console.log(`Connected to MIDI device: ${input.name}`);
        this.connectionCallback?.(true, input.name || 'Unknown Device');
      }
    }
  }

  /**
   * Handle MIDI device connection/disconnection
   */
  private handleStateChange(event: MIDIConnectionEvent): void {
    const port = event.port;
    if (!port) return;
    
    if (port.type === 'input') {
      if (port.state === 'connected') {
        this.connectInputs();
      } else if (port.state === 'disconnected') {
        const input = this.inputs.get(port.id);
        if (input) {
          input.onmidimessage = null;
          this.inputs.delete(port.id);
          console.log(`Disconnected MIDI device: ${port.name}`);
          this.connectionCallback?.(false, port.name || 'Unknown Device');
        }
      }
    }
  }

  /**
   * Handle incoming MIDI message
   */
  private handleMIDIMessage(event: MIDIMessageEvent): void {
    if (!this.isEnabled) return;

    const data = event.data;
    if (!data || data.length < 2) return;

    const status = data[0];
    const noteNumber = data[1];
    const velocity = data.length > 2 ? data[2] : 0;

    // Extract message type (high nibble) and channel (low nibble)
    const messageType = status & 0xf0;
    
    const noteName = midiToNoteName(noteNumber);

    switch (messageType) {
      case 0x90: // Note On
        if (velocity > 0) {
          const normalizedVelocity = velocity / 127;
          this.synth.noteOn(noteName, normalizedVelocity);
          this.callback?.(noteName, true, normalizedVelocity);
        } else {
          // Note On with velocity 0 is equivalent to Note Off
          this.synth.noteOff(noteName);
          this.callback?.(noteName, false, 0);
        }
        break;

      case 0x80: // Note Off
        this.synth.noteOff(noteName);
        this.callback?.(noteName, false, 0);
        break;

      // Could add support for other MIDI messages here:
      // 0xB0 - Control Change (for knobs/sliders)
      // 0xE0 - Pitch Bend
    }
  }
}

// Singleton instance
let midiHandlerInstance: MIDIHandler | null = null;

export function getMIDIHandler(): MIDIHandler {
  if (!midiHandlerInstance) {
    midiHandlerInstance = new MIDIHandler();
  }
  return midiHandlerInstance;
}

