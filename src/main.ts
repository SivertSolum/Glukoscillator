// Glukoscillator - Main Entry Point
// A wavetable synthesizer powered by glucose data

import './style.css';
import { parseLibreViewCSV } from './parser/libreview';
import { generateAllWavetables } from './synthesis/wavetable';
import { getSynth } from './synthesis/synth-engine';
import { getKeyboardHandler } from './input/keyboard-handler';
import { getMIDIHandler, MIDIHandler } from './input/midi-handler';
import { createPianoKeyboard, PianoKeyboard } from './ui/piano-keyboard';
import { createDaySelector, DaySelector } from './ui/day-selector';
import { createWaveformDisplay, WaveformDisplay } from './ui/waveform-display';
import { createSynthControls } from './ui/controls';
import { createOscillatorMixer, OscillatorMixer } from './ui/oscillator-mixer';
import { createEffectsPanel } from './ui/effects-panel';
import type { ParsedLibreViewData, DailyGlucoseData } from './types';

// Global state
let glucoseData: ParsedLibreViewData | null = null;
let daySelector: DaySelector | null = null;
let waveformDisplay: WaveformDisplay | null = null;
let pianoKeyboard: PianoKeyboard | null = null;
let oscillatorMixer: OscillatorMixer | null = null;
let isAudioStarted = false;

/**
 * Initialize the application
 */
async function init(): Promise<void> {
  console.log('Glukoscillator initializing...');

  // Set up UI components
  setupDropZone();
  setupStartButton();
  
  daySelector = createDaySelector('day-selector');
  waveformDisplay = createWaveformDisplay('waveform-display');
  pianoKeyboard = createPianoKeyboard('piano-keyboard');
  oscillatorMixer = createOscillatorMixer('oscillator-mixer');
  createEffectsPanel('effects-panel');
  createSynthControls('synth-controls');

  // Set up day selection callback
  daySelector.onSelect((date, dayData, oscIndex) => {
    onDaySelected(date, dayData, oscIndex);
  });

  // Set up hover preview callback
  daySelector.onPreview((dayData) => {
    if (dayData) {
      waveformDisplay?.setData(dayData);
    }
  });

  // Set up oscillator mixer callbacks
  oscillatorMixer.onChange((_oscIndex, dayData) => {
    // Update waveform display to show the first active oscillator
    if (dayData) {
      waveformDisplay?.setData(dayData);
    }
  });

  oscillatorMixer.onRandomize(() => {
    // Update waveform display after randomize
    const info = getSynth().getOscillatorInfo(0);
    if (info?.wavetable && glucoseData) {
      const dayData = glucoseData.days.get(info.dayLabel);
      if (dayData) {
        waveformDisplay?.setData(dayData);
      }
    }
  });

  // Listen for oscillator day selection
  window.addEventListener('osc-day-selected', ((_e: Event) => {
    oscillatorMixer?.clearSelectionMode();
  }) as EventListener);

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
    midiHandler.onConnection((connected, deviceName) => {
      updateMIDIStatus(connected, deviceName);
    });
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
    const response = await fetch('/sample-data/sample-glucose.csv');
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
    daySelector?.setData(glucoseData);
    oscillatorMixer?.setData(glucoseData);
    
    // Update drop zone to show loaded state
    const dropZone = document.getElementById('drop-zone');
    dropZone?.classList.add('loaded');
    
    const fileNameEl = dropZone?.querySelector('.file-name');
    if (fileNameEl) {
      fileNameEl.textContent = `Sample Data (${glucoseData.days.size} days)`;
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
 * Set up the file drop zone
 */
function setupDropZone(): void {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  if (!dropZone || !fileInput) return;

  // Click to browse
  dropZone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  });

  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  });
}

/**
 * Handle uploaded file
 */
async function handleFile(file: File): Promise<void> {
  const dropZone = document.getElementById('drop-zone');
  
  if (!file.name.endsWith('.csv')) {
    showError('Please upload a CSV file from LibreView');
    return;
  }

  try {
    dropZone?.classList.add('loading');
    
    const text = await file.text();
    glucoseData = parseLibreViewCSV(text);
    
    if (glucoseData.days.size === 0) {
      showError('No glucose data found in the file');
      return;
    }

    // Generate wavetables for all days
    generateAllWavetables(glucoseData.days);

    // Update UI
    daySelector?.setData(glucoseData);
    oscillatorMixer?.setData(glucoseData);
    
    dropZone?.classList.remove('loading');
    dropZone?.classList.add('loaded');
    
    const fileNameEl = dropZone?.querySelector('.file-name');
    if (fileNameEl) {
      fileNameEl.textContent = `${file.name} (${glucoseData.days.size} days)`;
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
    dropZone?.classList.remove('loading');
  }
}

/**
 * Handle day selection
 */
function onDaySelected(date: string, dayData: DailyGlucoseData, oscIndex: number | null): void {
  console.log(`Selected day: ${date}${oscIndex !== null ? ` for OSC ${oscIndex + 1}` : ''}`);
  
  // Update waveform display
  waveformDisplay?.setData(dayData);
  
  // If selecting for a specific oscillator, assign it there
  if (oscIndex !== null) {
    oscillatorMixer?.setOscillatorDay(oscIndex, date);
  } else {
    // Default behavior: assign to first oscillator
    oscillatorMixer?.setOscillatorDay(0, date);
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
 * Update MIDI status display
 */
function updateMIDIStatus(connected: boolean, deviceName: string): void {
  const statusEl = document.getElementById('midi-status');
  if (!statusEl) return;

  if (connected) {
    statusEl.textContent = `MIDI: ${deviceName}`;
    statusEl.classList.add('connected');
  } else {
    statusEl.textContent = 'MIDI: Disconnected';
    statusEl.classList.remove('connected');
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
