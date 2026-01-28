// Day Selector Dropdown
// UI component for selecting glucose data days with waveform preview

import type { DailyGlucoseData, ParsedLibreViewData } from '../types';
import { formatDateForDisplay } from '../parser/libreview';
import { getWaveformForDisplay } from '../synthesis/wavetable';

type DaySelectedCallback = (date: string, dayData: DailyGlucoseData, oscIndex: number | null) => void;
type PreviewCallback = (dayData: DailyGlucoseData | null) => void;

export class DaySelector {
  private container: HTMLElement;
  private data: ParsedLibreViewData | null = null;
  private selectedDate: string | null = null;
  private onSelectCallback: DaySelectedCallback | null = null;
  private onPreviewCallback: PreviewCallback | null = null;
  private selectingForOsc: number | null = null;
  private isOpen: boolean = false;
  private previewingDate: string | null = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }
    this.container = container;

    // Listen for oscillator selection mode
    window.addEventListener('osc-select-mode', ((e: CustomEvent) => {
      this.selectingForOsc = e.detail.oscIndex;
      this.container.classList.add('selecting-for-osc');
      // Auto-open dropdown when selecting for oscillator
      this.open();
    }) as EventListener);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node) && this.isOpen) {
        this.close();
      }
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  /**
   * Set callback for day selection
   */
  onSelect(callback: DaySelectedCallback): void {
    this.onSelectCallback = callback;
  }

  /**
   * Set callback for hover preview
   */
  onPreview(callback: PreviewCallback): void {
    this.onPreviewCallback = callback;
  }

  /**
   * Clear oscillator selection mode
   */
  clearOscSelection(): void {
    this.selectingForOsc = null;
    this.container.classList.remove('selecting-for-osc');
  }

  /**
   * Load parsed LibreView data
   */
  setData(data: ParsedLibreViewData): void {
    this.data = data;
    this.render();
    
    // Auto-select first day
    const dates = Array.from(data.days.keys()).sort().reverse();
    if (dates.length > 0) {
      this.selectDate(dates[0]);
    }
  }

  /**
   * Get currently selected date
   */
  getSelectedDate(): string | null {
    return this.selectedDate;
  }

  /**
   * Open the dropdown
   */
  open(): void {
    this.isOpen = true;
    this.container.classList.add('open');
  }

  /**
   * Close the dropdown
   */
  close(): void {
    this.isOpen = false;
    this.container.classList.remove('open');
    
    // Reset preview to selected day
    if (this.previewingDate && this.selectedDate && this.data) {
      const selectedData = this.data.days.get(this.selectedDate);
      if (selectedData) {
        this.onPreviewCallback?.(selectedData);
      }
    }
    this.previewingDate = null;
    
    // Update previewing state on items
    const items = this.container.querySelectorAll('.day-item');
    items.forEach(item => item.classList.remove('previewing'));
  }

  /**
   * Toggle dropdown open/close
   */
  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Render the dropdown
   */
  render(): void {
    this.container.innerHTML = '';
    this.container.className = 'day-selector-dropdown';

    if (!this.data || this.data.days.size === 0) {
      this.container.innerHTML = '<div class="dropdown-placeholder">No data loaded</div>';
      return;
    }

    // Sort dates in reverse chronological order
    const dates = Array.from(this.data.days.keys()).sort().reverse();

    // Create dropdown header
    const header = this.createHeader(dates.length);
    this.container.appendChild(header);

    // Create dropdown panel
    const panel = document.createElement('div');
    panel.className = 'dropdown-panel';

    // Create scrollable list
    const list = document.createElement('div');
    list.className = 'day-list';

    for (const date of dates) {
      const dayData = this.data.days.get(date)!;
      const item = this.createDayItem(date, dayData);
      list.appendChild(item);
    }

    panel.appendChild(list);
    this.container.appendChild(panel);

    // Update header with selected day info
    this.updateHeader();
  }

  /**
   * Create the dropdown header
   */
  private createHeader(dayCount: number): HTMLElement {
    const header = document.createElement('div');
    header.className = 'dropdown-header';
    
    header.innerHTML = `
      <div class="header-selected-day">
        <span class="header-date">Select a day</span>
        <span class="header-stats"></span>
        <div class="header-waveform"></div>
      </div>
      <span class="header-day-count">${dayCount} days</span>
      <div class="dropdown-arrow">
        <svg viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    `;

    header.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    return header;
  }

  /**
   * Update header with selected day info
   */
  private updateHeader(): void {
    if (!this.selectedDate || !this.data) return;

    const dayData = this.data.days.get(this.selectedDate);
    if (!dayData) return;

    const dateEl = this.container.querySelector('.header-date');
    const statsEl = this.container.querySelector('.header-stats');
    const waveformEl = this.container.querySelector('.header-waveform');

    if (dateEl) {
      dateEl.textContent = formatDateForDisplay(this.selectedDate);
    }

    if (statsEl) {
      const stats = dayData.stats;
      const tirClass = stats.timeInRange >= 70 ? 'good' : stats.timeInRange >= 50 ? 'warning' : 'bad';
      statsEl.innerHTML = `
        <span class="stat">↓${Math.round(stats.min)}</span>
        <span class="stat">μ${Math.round(stats.avg)}</span>
        <span class="stat">↑${Math.round(stats.max)}</span>
        <span class="stat tir ${tirClass}">${Math.round(stats.timeInRange)}%</span>
      `;
    }

    if (waveformEl) {
      waveformEl.innerHTML = this.createMiniWaveform(dayData);
    }
  }

  /**
   * Create a single day item
   */
  private createDayItem(date: string, dayData: DailyGlucoseData): HTMLElement {
    const item = document.createElement('div');
    item.className = 'day-item';
    item.dataset.date = date;

    // Mini waveform preview
    const waveformPreview = this.createMiniWaveform(dayData);

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
      this.selectDate(date);
      this.close();
    });

    // Hover to preview
    item.addEventListener('mouseenter', () => {
      this.previewDate(date);
    });

    item.addEventListener('mouseleave', () => {
      // Don't reset preview immediately - let close() handle it
    });

    return item;
  }

  /**
   * Preview a date on hover
   */
  private previewDate(date: string): void {
    if (!this.data) return;

    const dayData = this.data.days.get(date);
    if (!dayData) return;

    this.previewingDate = date;
    
    // Update visual state
    const items = this.container.querySelectorAll('.day-item');
    items.forEach(item => {
      const isPreview = item.getAttribute('data-date') === date;
      item.classList.toggle('previewing', isPreview && date !== this.selectedDate);
    });

    // Trigger preview callback
    this.onPreviewCallback?.(dayData);
  }

  /**
   * Create mini waveform SVG preview
   */
  private createMiniWaveform(dayData: DailyGlucoseData): string {
    if (!dayData.wavetable || dayData.readings.length === 0) {
      return '<svg class="mini-wave" viewBox="0 0 60 24"><line x1="0" y1="12" x2="60" y2="12" stroke="currentColor" stroke-opacity="0.3"/></svg>';
    }

    const points = getWaveformForDisplay(dayData.wavetable, 60);
    const width = 60;
    const height = 24;
    const padding = 2;

    // Build path
    let path = '';
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * width;
      const y = padding + ((1 - points[i]) / 2) * (height - 2 * padding);
      path += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    }

    return `<svg class="mini-wave" viewBox="0 0 ${width} ${height}"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  }

  /**
   * Select a date
   */
  selectDate(date: string): void {
    if (!this.data) return;

    const dayData = this.data.days.get(date);
    if (!dayData) return;

    // Update selection state
    this.selectedDate = date;

    // Update visual state
    const items = this.container.querySelectorAll('.day-item');
    items.forEach(item => {
      item.classList.toggle('selected', item.getAttribute('data-date') === date);
    });

    // Update header
    this.updateHeader();

    // Call callback with oscillator index if in selection mode
    const oscIndex = this.selectingForOsc;
    this.onSelectCallback?.(date, dayData, oscIndex);
    
    // Clear oscillator selection mode after selecting
    if (oscIndex !== null) {
      this.clearOscSelection();
      window.dispatchEvent(new CustomEvent('osc-day-selected', { detail: { oscIndex, date } }));
    }
  }

  /**
   * Clear data
   */
  clear(): void {
    this.data = null;
    this.selectedDate = null;
    this.render();
  }
}

// Factory function
export function createDaySelector(containerId: string): DaySelector {
  return new DaySelector(containerId);
}
