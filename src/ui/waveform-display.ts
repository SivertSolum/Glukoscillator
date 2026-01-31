// Waveform Display
// Canvas-based visualization of the current glucose wavetable
// Uses layered canvases for optimal performance

import type { DailyGlucoseData } from '../types';
import { getWaveformForDisplay } from '../synthesis/wavetable';

// Debounce utility
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  }) as T;
}

export class WaveformDisplay {
  private container: HTMLElement;
  // Layered canvases for optimal rendering
  private bgCanvas: HTMLCanvasElement;      // Static background grid
  private waveCanvas: HTMLCanvasElement;    // Waveform (changes on data update) 
  private playheadCanvas: HTMLCanvasElement; // Playhead animation only
  
  private bgCtx: CanvasRenderingContext2D;
  private waveCtx: CanvasRenderingContext2D;
  private playheadCtx: CanvasRenderingContext2D;
  
  private currentData: DailyGlucoseData | null = null;
  private animationFrame: number | null = null;
  private playheadPosition: number = 0;
  private isPlaying: boolean = false;
  
  // Cached waveform path for reuse
  private cachedWaveformPath: Path2D | null = null;
  private cachedGradient: CanvasGradient | null = null;
  
  // Debounced resize handler
  private debouncedResize: () => void;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container element #${containerId} not found`);
    }
    this.container = container;
    container.style.position = 'relative';

    // Create layered canvases
    this.bgCanvas = this.createCanvas('waveform-canvas-bg');
    this.waveCanvas = this.createCanvas('waveform-canvas-wave');
    this.playheadCanvas = this.createCanvas('waveform-canvas-playhead');
    
    container.appendChild(this.bgCanvas);
    container.appendChild(this.waveCanvas);
    container.appendChild(this.playheadCanvas);

    this.bgCtx = this.bgCanvas.getContext('2d')!;
    this.waveCtx = this.waveCanvas.getContext('2d')!;
    this.playheadCtx = this.playheadCanvas.getContext('2d')!;

    // Debounced resize handler (200ms)
    this.debouncedResize = debounce(this.handleResize.bind(this), 200);
    window.addEventListener('resize', this.debouncedResize);
    this.handleResize();
  }
  
  /**
   * Create a canvas element with proper styling for layering
   */
  private createCanvas(className: string): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = `waveform-canvas ${className}`;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    return canvas;
  }

  /**
   * Handle canvas resize - updates all three layers
   */
  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    if (!rect || rect.width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const canvases = [this.bgCanvas, this.waveCanvas, this.playheadCanvas];
    const contexts = [this.bgCtx, this.waveCtx, this.playheadCtx];
    
    for (let i = 0; i < canvases.length; i++) {
      canvases[i].width = rect.width * dpr;
      canvases[i].height = rect.height * dpr;
      canvases[i].style.width = `${rect.width}px`;
      canvases[i].style.height = `${rect.height}px`;
      contexts[i].scale(dpr, dpr);
    }

    // Invalidate cached gradient and path
    this.cachedGradient = null;
    this.cachedWaveformPath = null;
    
    this.drawBackground();
    this.drawWaveformLayer();
  }

  /**
   * Set the day data to display
   */
  setData(dayData: DailyGlucoseData): void {
    this.currentData = dayData;
    // Invalidate cached path when data changes
    this.cachedWaveformPath = null;
    this.drawWaveformLayer();
  }

  /**
   * Clear the display
   */
  clear(): void {
    this.currentData = null;
    this.cachedWaveformPath = null;
    this.drawWaveformLayer();
  }

  /**
   * Draw only the background layer (static, rarely changes)
   */
  private drawBackground(): void {
    const width = this.bgCanvas.width / (window.devicePixelRatio || 1);
    const height = this.bgCanvas.height / (window.devicePixelRatio || 1);
    
    this.bgCtx.clearRect(0, 0, width, height);
    this.drawGrid(this.bgCtx, width, height);
  }
  
  /**
   * Draw the waveform layer (changes on data update)
   */
  private drawWaveformLayer(): void {
    const width = this.waveCanvas.width / (window.devicePixelRatio || 1);
    const height = this.waveCanvas.height / (window.devicePixelRatio || 1);
    
    this.waveCtx.clearRect(0, 0, width, height);

    if (!this.currentData || !this.currentData.wavetable) {
      this.drawEmptyState(this.waveCtx, width, height);
      return;
    }

    this.drawWaveform(this.waveCtx, width, height);
    this.drawInfo(this.waveCtx, width, height);
  }
  
  /**
   * Draw the playhead only (animated layer)
   */
  private drawPlayheadLayer(): void {
    const width = this.playheadCanvas.width / (window.devicePixelRatio || 1);
    const height = this.playheadCanvas.height / (window.devicePixelRatio || 1);
    const x = this.playheadPosition * width;
    
    this.playheadCtx.clearRect(0, 0, width, height);
    
    // Outer glow
    this.playheadCtx.strokeStyle = 'rgba(232, 168, 124, 0.3)';
    this.playheadCtx.lineWidth = 8;
    this.playheadCtx.shadowColor = '#e8a87c';
    this.playheadCtx.shadowBlur = 15;
    this.playheadCtx.beginPath();
    this.playheadCtx.moveTo(x, 0);
    this.playheadCtx.lineTo(x, height);
    this.playheadCtx.stroke();
    this.playheadCtx.shadowBlur = 0;

    // Main playhead line
    this.playheadCtx.strokeStyle = 'rgba(240, 230, 216, 0.9)';
    this.playheadCtx.lineWidth = 2;
    this.playheadCtx.beginPath();
    this.playheadCtx.moveTo(x, 0);
    this.playheadCtx.lineTo(x, height);
    this.playheadCtx.stroke();

    // Bright center
    this.playheadCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    this.playheadCtx.lineWidth = 1;
    this.playheadCtx.beginPath();
    this.playheadCtx.moveTo(x, 0);
    this.playheadCtx.lineTo(x, height);
    this.playheadCtx.stroke();
  }
  
  /**
   * Legacy draw method for compatibility
   */
  draw(): void {
    this.drawBackground();
    this.drawWaveformLayer();
  }

  /**
   * Draw oscilloscope-style background grid
   */
  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Dark oscilloscope background with subtle vignette
    const bgGradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.max(width, height) * 0.7
    );
    bgGradient.addColorStop(0, '#0c0a08');
    bgGradient.addColorStop(1, '#050403');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Phosphor green grid lines (oscilloscope style)
    const gridColor = 'rgba(143, 188, 143, 0.12)';
    const gridColorBright = 'rgba(143, 188, 143, 0.2)';
    ctx.lineWidth = 1;

    // Vertical lines - one per hour with major divisions
    const vLines = 24;
    for (let i = 0; i <= vLines; i++) {
      const x = (i / vLines) * width;
      const isMajor = i % 6 === 0;
      ctx.strokeStyle = isMajor ? gridColorBright : gridColor;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // Horizontal lines with major divisions
    const hLines = 8;
    for (let i = 0; i <= hLines; i++) {
      const y = (i / hLines) * height;
      const isMajor = i === hLines / 2 || i === 0 || i === hLines;
      ctx.strokeStyle = isMajor ? gridColorBright : gridColor;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center crosshair emphasis
    ctx.strokeStyle = 'rgba(232, 168, 124, 0.3)';
    ctx.lineWidth = 1;
    
    // Horizontal center line
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Small center tick marks
    const tickSize = 6;
    for (let i = 0; i <= vLines; i++) {
      const x = (i / vLines) * width;
      ctx.beginPath();
      ctx.moveTo(x, height / 2 - tickSize);
      ctx.lineTo(x, height / 2 + tickSize);
      ctx.stroke();
    }
  }

  /**
   * Draw empty state message (oscilloscope style)
   */
  private drawEmptyState(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Draw "NO SIGNAL" style message
    ctx.fillStyle = 'rgba(143, 188, 143, 0.4)';
    ctx.font = "bold 12px 'IBM Plex Mono', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO SIGNAL', width / 2, height / 2 - 10);
    
    ctx.fillStyle = 'rgba(143, 188, 143, 0.25)';
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillText('SELECT A DAY TO VIEW WAVEFORM', width / 2, height / 2 + 10);
    
    // Draw a flat line at center
    ctx.strokeStyle = 'rgba(143, 188, 143, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(width * 0.2, height / 2);
    ctx.lineTo(width * 0.8, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Build or return cached waveform Path2D
   */
  private getWaveformPath(width: number, height: number): Path2D {
    if (this.cachedWaveformPath) {
      return this.cachedWaveformPath;
    }
    
    if (!this.currentData?.wavetable) {
      return new Path2D();
    }

    const points = getWaveformForDisplay(this.currentData.wavetable, Math.floor(width));
    const padding = 20;
    const drawHeight = height - padding * 2;

    const path = new Path2D();
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * width;
      const y = padding + ((1 - points[i]) / 2) * drawHeight;
      
      if (i === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    
    this.cachedWaveformPath = path;
    return path;
  }
  
  /**
   * Get or create cached gradient
   */
  private getWaveformGradient(ctx: CanvasRenderingContext2D, height: number): CanvasGradient {
    if (this.cachedGradient) {
      return this.cachedGradient;
    }
    
    const padding = 20;
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, '#c97064');    // High glucose - warm red/coral
    gradient.addColorStop(0.25, '#d4a574'); // Above target - warm amber
    gradient.addColorStop(0.5, '#8fbc8f');  // In range - sage green
    gradient.addColorStop(0.75, '#d4a574'); // Below target - warm amber
    gradient.addColorStop(1, '#6b9ac4');    // Low glucose - muted blue
    
    this.cachedGradient = gradient;
    return gradient;
  }

  /**
   * Draw the waveform path with warm organic colors
   * Uses cached Path2D for optimal performance
   */
  private drawWaveform(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.currentData?.wavetable) return;

    const path = this.getWaveformPath(width, height);
    const gradient = this.getWaveformGradient(ctx, height);
    
    // Create filled path (waveform + baseline closure)
    const filledPath = new Path2D();
    filledPath.moveTo(0, height / 2);
    filledPath.addPath(path);
    filledPath.lineTo(width, height / 2);
    filledPath.closePath();

    // Soft glow fill
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.15;
    ctx.shadowColor = '#8fbc8f';
    ctx.shadowBlur = 20;
    ctx.fill(filledPath);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Gradient fill area
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.25;
    ctx.fill(filledPath);
    ctx.globalAlpha = 1;

    // Outer glow stroke
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.3;
    ctx.shadowColor = '#e8a87c';
    ctx.shadowBlur = 15;
    ctx.stroke(path);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Main line
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(path);

    // Inner bright highlight
    ctx.strokeStyle = 'rgba(240, 230, 216, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke(path);
  }

  /**
   * Draw info overlay with warm styling
   */
  private drawInfo(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.currentData) return;

    const stats = this.currentData.stats;
    
    // Time labels - warm cream color
    ctx.fillStyle = 'rgba(184, 169, 154, 0.6)';
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.textAlign = 'left';
    ctx.fillText('00:00', 8, height - 6);
    
    ctx.textAlign = 'center';
    ctx.fillText('12:00', width / 2, height - 6);
    
    ctx.textAlign = 'right';
    ctx.fillText('24:00', width - 8, height - 6);

    // Glucose range labels with subtle background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(width - 70, 4, 66, 16);
    ctx.fillRect(width - 70, height - 24, 66, 16);
    
    ctx.fillStyle = 'rgba(232, 168, 124, 0.8)';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(stats.max)} mg/dL`, width - 8, 15);
    
    ctx.fillStyle = 'rgba(107, 154, 196, 0.8)';
    ctx.fillText(`${Math.round(stats.min)} mg/dL`, width - 8, height - 11);
  }

  /**
   * Start playhead animation
   */
  startPlayhead(): void {
    this.isPlaying = true;
    this.animatePlayhead();
  }

  /**
   * Stop playhead animation
   */
  stopPlayhead(): void {
    this.isPlaying = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.playheadPosition = 0;
    // Clear only the playhead canvas
    const width = this.playheadCanvas.width / (window.devicePixelRatio || 1);
    const height = this.playheadCanvas.height / (window.devicePixelRatio || 1);
    this.playheadCtx.clearRect(0, 0, width, height);
  }

  /**
   * Animate playhead - only redraws the playhead layer (not the entire display)
   */
  private animatePlayhead(): void {
    if (!this.isPlaying) return;

    this.playheadPosition = (this.playheadPosition + 0.005) % 1;
    
    // Only redraw the playhead layer - background and waveform stay static
    this.drawPlayheadLayer();

    this.animationFrame = requestAnimationFrame(() => this.animatePlayhead());
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    window.removeEventListener('resize', this.debouncedResize);
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    // Clear cached resources
    this.cachedWaveformPath = null;
    this.cachedGradient = null;
  }
}

// Factory function
export function createWaveformDisplay(containerId: string): WaveformDisplay {
  return new WaveformDisplay(containerId);
}

