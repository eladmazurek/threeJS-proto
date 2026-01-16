/**
 * Base Data Feed
 *
 * Abstract base class for all data feeds. Provides common functionality
 * for update rate control, statistics tracking, and callback management.
 */

import type { DataFeed, FeedConfig, FeedStats } from "./types";

/** Default feed configuration */
export const DEFAULT_FEED_CONFIG: FeedConfig = {
  enabled: true,
  updateRateMs: 100, // 10 updates per second
  maxUnits: 1000,
};

/**
 * Abstract base class for data feeds.
 * Handles common functionality like timing, stats, and callbacks.
 */
export abstract class BaseFeed<TUpdate, TState> implements DataFeed<TUpdate, TState> {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly type: "ship" | "aircraft" | "satellite" | "drone";

  protected _config: FeedConfig;
  protected _running: boolean = false;
  protected _intervalId: ReturnType<typeof setInterval> | null = null;
  protected _units: Map<string, TState> = new Map();
  protected _callbacks: Set<(updates: TUpdate[]) => void> = new Set();

  // Statistics
  protected _totalMessages: number = 0;
  protected _messageCount: number = 0;
  protected _lastStatsTime: number = 0;
  protected _messagesPerSec: number = 0;
  protected _lastUpdateTime: number = 0;

  constructor(config: Partial<FeedConfig> = {}) {
    this._config = { ...DEFAULT_FEED_CONFIG, ...config };
  }

  get config(): FeedConfig {
    return { ...this._config };
  }

  /**
   * Start the feed. For simulated feeds, this starts the update loop.
   * For real feeds, this would connect to the data source.
   */
  start(): void {
    if (this._running) return;
    if (!this._config.enabled) return;

    this._running = true;
    this._lastStatsTime = performance.now();
    this._messageCount = 0;

    // Initialize units on first start
    this.initializeUnits();

    // Start update loop
    this._intervalId = setInterval(() => {
      this.tick();
    }, this._config.updateRateMs);

    console.log(`[${this.id}] Feed started (${this._config.updateRateMs}ms interval)`);
  }

  /**
   * Stop the feed.
   */
  stop(): void {
    if (!this._running) return;

    this._running = false;
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    console.log(`[${this.id}] Feed stopped`);
  }

  isRunning(): boolean {
    return this._running;
  }

  getStats(): FeedStats {
    return {
      messagesPerSec: this._messagesPerSec,
      totalMessages: this._totalMessages,
      avgLatencyMs: 0, // Simulated feeds have no latency
      lastUpdateTime: this._lastUpdateTime,
      activeUnits: this._units.size,
      status: this._running ? "simulated" : "disconnected",
    };
  }

  getUnits(): TState[] {
    return Array.from(this._units.values());
  }

  onUpdate(callback: (updates: TUpdate[]) => void): void {
    this._callbacks.add(callback);
  }

  offUpdate(callback: (updates: TUpdate[]) => void): void {
    this._callbacks.delete(callback);
  }

  setConfig(config: Partial<FeedConfig>): void {
    const wasRunning = this._running;
    const rateChanged = config.updateRateMs !== undefined &&
                        config.updateRateMs !== this._config.updateRateMs;

    this._config = { ...this._config, ...config };

    // Restart if rate changed while running
    if (wasRunning && rateChanged) {
      this.stop();
      this.start();
    }

    // Handle enable/disable
    if (config.enabled !== undefined) {
      if (config.enabled && !this._running) {
        this.start();
      } else if (!config.enabled && this._running) {
        this.stop();
      }
    }
  }

  /**
   * Called on each update interval. Subclasses implement this to
   * generate or process updates.
   */
  protected abstract tick(): void;

  /**
   * Initialize units. Called when feed starts.
   */
  protected abstract initializeUnits(): void;

  /**
   * Emit updates to all registered callbacks.
   */
  protected emit(updates: TUpdate[]): void {
    if (updates.length === 0) return;

    this._messageCount += updates.length;
    this._totalMessages += updates.length;
    this._lastUpdateTime = performance.now();

    // Update stats every second
    const now = performance.now();
    if (now - this._lastStatsTime >= 1000) {
      this._messagesPerSec = this._messageCount / ((now - this._lastStatsTime) / 1000);
      this._messageCount = 0;
      this._lastStatsTime = now;
    }

    // Notify callbacks
    for (const callback of this._callbacks) {
      callback(updates);
    }
  }

  /**
   * Get a unique ID for a unit.
   */
  protected abstract getUnitId(unit: TState): string;
}
