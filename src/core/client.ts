/**
 * Cloudflare API client for managing Workers.
 * All CF API interactions go through here.
 */

import type { FlareGunConfig, WorkerInfo } from "../types.js";
import { getWorkerScriptForName } from "./worker-script.js";

const CF_API = "https://api.cloudflare.com/client/v4";

interface CfApiResponse<T = unknown> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

export class CloudflareClient {
  private apiToken: string;
  private accountId: string;
  private prefix: string;

  constructor(config: FlareGunConfig) {
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
    this.prefix = config.prefix ?? "flaregun";
  }

  private async request<T = unknown>(
    path: string,
    options: RequestInit = {},
  ): Promise<CfApiResponse<T>> {
    const url = `${CF_API}/accounts/${this.accountId}${path}`;
    const resp = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        ...options.headers,
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Cloudflare API ${resp.status}: ${text}`);
    }

    return resp.json() as Promise<CfApiResponse<T>>;
  }

  /** Generate a worker name like flaregun-001 */
  workerName(index: number): string {
    return `${this.prefix}-${String(index).padStart(3, "0")}`;
  }

  /** Deploy a single proxy worker */
  async deployWorker(index: number): Promise<WorkerInfo> {
    const name = this.workerName(index);
    const script = getWorkerScriptForName(name);

    // Upload the worker script
    const formData = new FormData();

    const metadata = JSON.stringify({
      main_module: "index.js",
      compatibility_date: "2024-01-01",
    });
    formData.append(
      "metadata",
      new Blob([metadata], { type: "application/json" }),
    );
    formData.append(
      "index.js",
      new Blob([script], { type: "application/javascript+module" }),
      "index.js",
    );

    await this.request(`/workers/scripts/${name}`, {
      method: "PUT",
      body: formData,
    });

    // Enable the workers.dev subdomain route
    await this.request(`/workers/scripts/${name}/subdomain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    // Get the subdomain
    const subdomainResp = await this.request<{ subdomain: string }>(
      "/workers/subdomain",
    );
    const subdomain = subdomainResp.result.subdomain;

    return {
      id: name,
      name,
      url: `https://${name}.${subdomain}.workers.dev`,
      createdAt: new Date().toISOString(),
    };
  }

  /** Delete a single worker */
  async deleteWorker(name: string): Promise<void> {
    await this.request(`/workers/scripts/${name}`, {
      method: "DELETE",
    });
  }

  /** List all flaregun workers on the account */
  async listWorkers(): Promise<WorkerInfo[]> {
    const resp =
      await this.request<
        { id: string; created_on: string; modified_on: string }[]
      >("/workers/scripts");

    // Get subdomain for URL construction
    const subdomainResp = await this.request<{ subdomain: string }>(
      "/workers/subdomain",
    );
    const subdomain = subdomainResp.result.subdomain;

    return resp.result
      .filter((w) => w.id.startsWith(`${this.prefix}-`))
      .map((w) => ({
        id: w.id,
        name: w.id,
        url: `https://${w.id}.${subdomain}.workers.dev`,
        createdAt: w.created_on,
      }));
  }

  /** Deploy N workers, returns all deployed workers */
  async deployMany(
    count: number,
    onProgress?: (current: number, total: number, name: string) => void,
  ): Promise<WorkerInfo[]> {
    const existing = await this.listWorkers();
    const existingCount = existing.length;
    const workers: WorkerInfo[] = [...existing];

    for (let i = 0; i < count; i++) {
      const index = existingCount + i;
      const name = this.workerName(index);
      onProgress?.(i + 1, count, name);
      const worker = await this.deployWorker(index);
      workers.push(worker);
    }

    return workers;
  }

  /** Scale to exactly N workers — adds or removes as needed */
  async scaleTo(
    target: number,
    onProgress?: (current: number, total: number, name: string) => void,
  ): Promise<WorkerInfo[]> {
    const existing = await this.listWorkers();
    const current = existing.length;

    if (target > current) {
      const toAdd = target - current;
      return this.deployMany(toAdd, onProgress);
    }

    if (target < current) {
      const toRemove = existing.slice(target);
      for (let i = 0; i < toRemove.length; i++) {
        onProgress?.(i + 1, toRemove.length, toRemove[i].name);
        await this.deleteWorker(toRemove[i].name);
      }
      return existing.slice(0, target);
    }

    return existing;
  }

  /** Delete all flaregun workers */
  async deleteAll(
    onProgress?: (current: number, total: number, name: string) => void,
  ): Promise<number> {
    const workers = await this.listWorkers();
    for (let i = 0; i < workers.length; i++) {
      onProgress?.(i + 1, workers.length, workers[i].name);
      await this.deleteWorker(workers[i].name);
    }
    return workers.length;
  }
}
