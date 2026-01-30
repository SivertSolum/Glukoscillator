// Glukoscillator - Main Entry Point
// A wavetable synthesizer powered by glucose data

import './style.css';
import { parseLibreViewCSV } from './parser/libreview';
import { generateAllWavetables } from './synthesis/wavetable';
import { getSynth } from './synthesis/synth-engine';
import { getKeyboardHandler } from './input/keyboard-handler';
import { getMIDIHandler, MIDIHandler, type MIDIDeviceInfo } from './input/midi-handler';
import { createPianoKeyboard, PianoKeyboard } from './ui/piano-keyboard';
import { createSynthControls, SynthControls } from './ui/controls';
import { createOscillatorMixer, OscillatorMixer } from './ui/oscillator-mixer';
import { createEffectsPanel } from './ui/effects-panel';
import type { ParsedLibreViewData } from './types';

// Global state
let glucoseData: ParsedLibreViewData | null = null;
let pianoKeyboard: PianoKeyboard | null = null;
let oscillatorMixer: OscillatorMixer | null = null;
let synthControls: SynthControls | null = null;
let isAudioStarted = false;

/**
 * Initialize the application
 */
async function init(): Promise<void> {
  console.log('Glukoscillator initializing...');

  // Set up UI components
  setupFileLoader();
  setupStartButton();
  
  pianoKeyboard = createPianoKeyboard('piano-keyboard');
  oscillatorMixer = createOscillatorMixer('oscillator-mixer');
  createEffectsPanel('effects-panel');
  synthControls = createSynthControls('synth-controls');

  // Set up oscillator mixer callbacks
  oscillatorMixer.onChange((_oscIndex, _dayData) => {
    // Waveform display is now handled by hover in oscillator mixer
  });

  oscillatorMixer.onRandomize(() => {
    // Sync envelope knobs after randomization
    synthControls?.syncFromSynth();
  });

  // Set up keyboard handler callbacks for visual feedback
  const keyboardHandler = getKeyboardHandler();
  keyboardHandler.onNote((note, isNoteOn) => {
    pianoKeyboard?.setKeyActive(note, isNoteOn);
  });

  // Set up MIDI if supported
  if (MIDIHandler.isSupported()) {
    const midiHandler = getMIDIHandler();
    midiHandler.onNote((note, isNoteOn) => {
      pianoKeyboard?.setKeyActive(note, isNoteOn);
    });
    midiHandler.onConnection((connected, _deviceName) => {
      updateMIDIStatusIndicator(connected);
    });
    midiHandler.onDeviceChange((devices) => {
      updateMIDIDeviceList(devices);
    });
    setupMIDIDeviceSelector();
  } else {
    // Hide MIDI selector if not supported
    const midiSelector = document.querySelector('.midi-selector') as HTMLElement;
    if (midiSelector) {
      midiSelector.style.display = 'none';
    }
  }

  // Auto-load sample data on startup
  await loadSampleData();

  console.log('Glukoscillator ready!');
}

/**
 * Load the bundled sample glucose data
 */
async function loadSampleData(): Promise<void> {
  try {
    // Use import.meta.env.BASE_URL for correct path on GitHub Pages
    const response = await fetch(`${import.meta.env.BASE_URL}sample-data/sample-glucose.csv`);
    if (!response.ok) {
      console.warn('Sample data not found');
      return;
    }
    
    const text = await response.text();
    glucoseData = parseLibreViewCSV(text);
    
    if (glucoseData.days.size === 0) {
      console.warn('No glucose data found in sample file');
      return;
    }

    // Generate wavetables for all days
    generateAllWavetables(glucoseData.days);

    // Update UI
    oscillatorMixer?.setData(glucoseData);
    
    // Update file loader to show loaded state
    const fileLoaderBtn = document.getElementById('file-loader-btn');
    const fileLabel = document.getElementById('file-label');
    
    fileLoaderBtn?.classList.add('loaded');
    
    if (fileLabel) {
      fileLabel.textContent = `${glucoseData.days.size} days`;
    }

    // Auto-assign first day to oscillator 1
    const dates = Array.from(glucoseData.days.keys()).sort().reverse();
    if (dates.length > 0) {
      oscillatorMixer?.setOscillatorDay(0, dates[0]);
    }

    console.log(`Auto-loaded sample data: ${glucoseData.days.size} days`);
  } catch (error) {
    console.warn('Failed to load sample data:', error);
  }
}

/**
 * Set up the file loader button in header
 */
function setupFileLoader(): void {
  const fileLoaderBtn = document.getElementById('file-loader-btn');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  if (!fileLoaderBtn || !fileInput) return;

  // Click button to open file dialog
  fileLoaderBtn.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('input')) return;
    fileInput.click();
  });

  // File input change
  fileInput.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  });

  // Also allow drag & drop on the whole app
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileLoaderBtn.classList.add('drag-over');
    });

    appContainer.addEventListener('dragleave', (e) => {
      // Only remove if leaving the container entirely
      const dragEvent = e as DragEvent;
      if (!appContainer.contains(dragEvent.relatedTarget as Node)) {
        fileLoaderBtn.classList.remove('drag-over');
      }
    });

    appContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      fileLoaderBtn.classList.remove('drag-over');
      
      const files = (e as DragEvent).dataTransfer?.files;
      if (files && files[0]) {
        handleFile(files[0]);
      }
    });
  }
}

/**
 * Handle uploaded file
 */
async function handleFile(file: File): Promise<void> {
  const fileLoaderBtn = document.getElementById('file-loader-btn');
  const fileLabel = document.getElementById('file-label');
  
  if (!file.name.endsWith('.csv')) {
    showError('Please upload a CSV file from LibreView');
    return;
  }

  try {
    fileLoaderBtn?.classList.add('loading');
    
    const text = await file.text();
    glucoseData = parseLibreViewCSV(text);
    
    if (glucoseData.days.size === 0) {
      showError('No glucose data found in the file');
      return;
    }

    // Generate wavetables for all days
    generateAllWavetables(glucoseData.days);

    // Update UI
    oscillatorMixer?.setData(glucoseData);
    
    fileLoaderBtn?.classList.remove('loading');
    fileLoaderBtn?.classList.add('loaded');
    
    if (fileLabel) {
      fileLabel.textContent = `${glucoseData.days.size} days`;
    }

    // Auto-assign first day to oscillator 1
    const dates = Array.from(glucoseData.days.keys()).sort().reverse();
    if (dates.length > 0) {
      oscillatorMixer?.setOscillatorDay(0, dates[0]);
    }

    console.log(`Loaded ${glucoseData.days.size} days of glucose data`);
  } catch (error) {
    console.error('Error parsing file:', error);
    showError('Error parsing file. Make sure it\'s a valid LibreView export.');
    fileLoaderBtn?.classList.remove('loading');
  }
}

/**
 * Set up the start audio button
 */
function setupStartButton(): void {
  const startButton = document.getElementById('start-button');
  const startOverlay = document.getElementById('start-overlay');
  if (!startButton || !startOverlay) return;

  startButton.addEventListener('click', async () => {
    if (isAudioStarted) return;

    try {
      // Start audio context
      await getSynth().start();
      
      // Start keyboard input
      getKeyboardHandler().start();
      
      // Start MIDI
      if (MIDIHandler.isSupported()) {
        await getMIDIHandler().start();
      }

      isAudioStarted = true;
      
      // Hide the overlay (not just the button)
      startOverlay.classList.add('hidden');
      document.querySelector('.app-container')?.classList.add('audio-started');
      
      console.log('Audio started');
    } catch (error) {
      console.error('Failed to start audio:', error);
      showError('Failed to start audio. Please try again.');
    }
  });
}

/**
 * Set up MIDI device selector dropdown
 */
function setupMIDIDeviceSelector(): void {
  const select = document.getElementById('midi-device-select') as HTMLSelectElement;
  if (!select) return;

  select.addEventListener('change', () => {
    const midiHandler = getMIDIHandler();
    const deviceId = select.value || null;
    midiHandler.selectDevice(deviceId);
  });
}

/**
 * Update MIDI device dropdown list
 */
function updateMIDIDeviceList(devices: MIDIDeviceInfo[]): void {
  const select = document.getElementById('midi-device-select') as HTMLSelectElement;
  if (!select) return;

  const midiHandler = getMIDIHandler();
  const currentSelection = midiHandler.getSelectedDeviceId();

  // Clear existing options
  select.innerHTML = '';

  if (devices.length === 0) {
    select.innerHTML = '<option value="">No MIDI devices</option>';
    select.disabled = true;
    return;
  }

  // Add placeholder option
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select MIDI device...';
  select.appendChild(placeholder);

  // Add device options
  for (const device of devices) {
    const option = document.createElement('option');
    option.value = device.id;
    option.textContent = device.name;
    if (device.id === currentSelection) {
      option.selected = true;
    }
    select.appendChild(option);
  }

  select.disabled = false;
}

/**
 * Update MIDI status indicator (LED)
 */
function updateMIDIStatusIndicator(connected: boolean): void {
  const indicator = document.getElementById('midi-status-indicator');
  if (!indicator) return;

  if (connected) {
    indicator.classList.add('connected');
  } else {
    indicator.classList.remove('connected');
  }
}

/**
 * Show error message
 */
function showError(message: string): void {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('visible');
    setTimeout(() => {
      errorEl.classList.remove('visible');
    }, 5000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
