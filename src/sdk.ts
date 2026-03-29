/**
 * FlareGun — the SDK class.
 *
 * All functionality lives here. The CLI is just a thin wrapper.
 */

import { CloudflareClient } from "./core/client.js";
import { resolveConfig, findConfigDir, saveWorkerCache, loadWorkerCache } from "./core/config.js";
import { createRotator, type Rotator } from "./core/rotation.js";
import { ProxyServer } from "./core/proxy-server.js";
import type {
  FlareGunConfig,
  FlareGunStats,
  FetchOptions,
  RotationStrategy,
  ServeOptions,
  WorkerInfo,
} from "./types.js";

export class FlareGun {
  private client: CloudflareClient;
  private workers: WorkerInfo[] = [];
  private rotator: Rotator | null = null;
  private strategy: RotationStrategy;
  private proxyServer: ProxyServer | null = null;
  private requestCount = 0;
  private perWorkerCount: Map<string, number> = new Map();

  constructor(
    config?: Partial<FlareGunConfig>,
    options?: { strategy?: RotationStrategy },
  ) {
    const resolved = resolveConfig(config);
    this.client = new CloudflareClient(resolved);
    this.strategy = options?.strategy ?? "round-robin";
  }

  /** Deploy N proxy workers (additive — adds to existing) */
  async up(
    count: number,
    onProgress?: (current: number, total: number, name: string) => void,
  ): Promise<WorkerInfo[]> {
    this.workers = await this.client.deployMany(count, onProgress);
    this.rotator = createRotator(this.strategy, this.workers);
    this.cacheWorkers();
    return this.workers;
  }

  /** Scale to exactly N workers */
  async scale(
    target: number,
    onProgress?: (current: number, total: number, name: string) => void,
  ): Promise<WorkerInfo[]> {
    this.workers = await this.client.scaleTo(target, onProgress);
    this.rotator = createRotator(this.strategy, this.workers);
    this.cacheWorkers();
    return this.workers;
  }

  /** Teardown all flaregun workers */
  async down(
    onProgress?: (current: number, total: number, name: string) => void,
  ): Promise<number> {
    const removed = await this.client.deleteAll(onProgress);
    this.workers = [];
    this.rotator = null;
    this.cacheWorkers();
    return removed;
  }

  /** List deployed workers */
  async ls(): Promise<WorkerInfo[]> {
    this.workers = await this.client.listWorkers();
    if (this.workers.length > 0) {
      this.rotator = createRotator(this.strategy, this.workers);
    }
    return this.workers;
  }

  /** Get the next worker URL (rotation) */
  next(): WorkerInfo {
    if (!this.rotator || this.workers.length === 0) {
      throw new Error("No workers deployed. Run fg.up(N) first.");
    }
    return this.rotator.next();
  }

  /**
   * Drop-in fetch replacement with automatic rotation.
   *
   * @example
   * const res = await fg.fetch("https://httpbin.org/ip");
   */
  async fetch(
    url: string,
    options?: FetchOptions,
  ): Promise<Response> {
    const worker = options?.workerIndex !== undefined
      ? this.workers[options.workerIndex]
      : this.next();

    if (!worker) {
      throw new Error("No workers available");
    }

    const start = Date.now();

    const headers = new Headers(options?.headers);
    headers.set("X-Target-URL", url);

    const resp = await globalThis.fetch(worker.url, {
      method: options?.method ?? "GET",
      headers,
      body: options?.body,
    });

    const latencyMs = Date.now() - start;

    // Track stats
    this.requestCount++;
    this.perWorkerCount.set(
      worker.name,
      (this.perWorkerCount.get(worker.name) ?? 0) + 1,
    );

    // Mark errors for adaptive rotation
    if (resp.status === 429 || resp.status >= 500) {
      this.rotator?.markError(worker);
    }

    return resp;
  }

  /**
   * Start a local HTTP proxy server.
   * All traffic through the proxy is automatically rotated across workers.
   */
  async serve(options?: ServeOptions): Promise<ProxyServer> {
    if (this.workers.length === 0) {
      await this.ls();
    }
    if (this.workers.length === 0) {
      throw new Error("No workers deployed. Run fg.up(N) first.");
    }

    this.proxyServer = new ProxyServer(this.workers, {
      strategy: this.strategy,
      ...options,
    });

    await this.proxyServer.start(options?.port ?? 8080);
    return this.proxyServer;
  }

  /** Stop the local proxy server */
  async stopServe(): Promise<void> {
    await this.proxyServer?.stop();
    this.proxyServer = null;
  }

  /** Get usage stats */
  stats(): FlareGunStats {
    return {
      workers: this.workers.length,
      totalRequests: this.requestCount,
      perWorker: Object.fromEntries(this.perWorkerCount),
    };
  }

  /** Get all current worker URLs */
  urls(): string[] {
    return this.workers.map((w) => w.url);
  }

  private cacheWorkers(): void {
    const configDir = findConfigDir();
    if (configDir) {
      saveWorkerCache(configDir, this.workers.map((w) => w.url));
    }
  }
}
