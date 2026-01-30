// MIDI Handler
// Web MIDI API integration for physical MIDI keyboards

import { getSynth, midiToNoteName, GlucoseSynth } from '../synthesis/synth-engine';

type MIDICallback = (note: string, isNoteOn: boolean, velocity: number) => void;
type DeviceChangeCallback = (devices: MIDIDeviceInfo[]) => void;

export interface MIDIDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

export class MIDIHandler {
  private midiAccess: MIDIAccess | null = null;
  private activeInput: MIDIInput | null = null;
  private selectedDeviceId: string | null = null;
  private callback: MIDICallback | null = null;
  private isEnabled = true;
  private connectionCallback: ((connected: boolean, deviceName: string) => void) | null = null;
  private deviceChangeCallback: DeviceChangeCallback | null = null;
  
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
      
      // Notify about available devices
      this.notifyDeviceChange();
      
      // Auto-select first device if none selected
      if (!this.selectedDeviceId) {
        const devices = this.getAvailableDevices();
        if (devices.length > 0) {
          this.selectDevice(devices[0].id);
        }
      }
      
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
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }
    
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
   * Set callback for device list changes
   */
  onDeviceChange(callback: DeviceChangeCallback): void {
    this.deviceChangeCallback = callback;
  }

  /**
   * Get list of all available MIDI input devices
   */
  getAvailableDevices(): MIDIDeviceInfo[] {
    if (!this.midiAccess) return [];
    
    const devices: MIDIDeviceInfo[] = [];
    for (const input of this.midiAccess.inputs.values()) {
      devices.push({
        id: input.id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || 'Unknown',
        state: input.state as 'connected' | 'disconnected'
      });
    }
    return devices;
  }

  /**
   * Get the currently selected device ID
   */
  getSelectedDeviceId(): string | null {
    return this.selectedDeviceId;
  }

  /**
   * Select a specific MIDI device to listen to
   */
  selectDevice(deviceId: string | null): void {
    if (!this.midiAccess) return;
    
    // Disconnect from current device
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.synth.allNotesOff();
      console.log(`Disconnected from MIDI device: ${this.activeInput.name}`);
      this.connectionCallback?.(false, this.activeInput.name || 'Unknown Device');
      this.activeInput = null;
    }
    
    this.selectedDeviceId = deviceId;
    
    // If no device selected, we're done
    if (!deviceId) {
      return;
    }
    
    // Connect to the selected device
    const input = this.midiAccess.inputs.get(deviceId);
    if (input && input.state === 'connected') {
      input.onmidimessage = this.handleMIDIMessage;
      this.activeInput = input;
      console.log(`Connected to MIDI device: ${input.name}`);
      this.connectionCallback?.(true, input.name || 'Unknown Device');
    }
  }

  /**
   * Notify listeners about device list changes
   */
  private notifyDeviceChange(): void {
    const devices = this.getAvailableDevices();
    this.deviceChangeCallback?.(devices);
  }

  /**
   * Handle MIDI device connection/disconnection
   */
  private handleStateChange(event: MIDIConnectionEvent): void {
    const port = event.port;
    if (!port) return;
    
    if (port.type === 'input') {
      // Notify about device list changes
      this.notifyDeviceChange();
      
      if (port.state === 'connected') {
        // If this is our selected device, reconnect to it
        if (port.id === this.selectedDeviceId && !this.activeInput) {
          this.selectDevice(port.id);
        }
        // If no device is selected and this is the first one, auto-select it
        else if (!this.selectedDeviceId) {
          this.selectDevice(port.id);
        }
      } else if (port.state === 'disconnected') {
        // If the disconnected device was our active one, clean up
        if (this.activeInput && this.activeInput.id === port.id) {
          this.activeInput.onmidimessage = null;
          this.activeInput = null;
          this.synth.allNotesOff();
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

