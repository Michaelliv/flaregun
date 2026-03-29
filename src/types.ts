export interface FlareGunConfig {
  /** Cloudflare API token with Workers edit permission */
  apiToken: string;
  /** Cloudflare account ID */
  accountId: string;
  /** Prefix for deployed worker names */
  prefix?: string;
}

export interface WorkerInfo {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface ProxyRequest {
  worker: string;
  target: string;
  status: number;
  latencyMs: number;
  timestamp: string;
}

export interface FlareGunStats {
  workers: number;
  totalRequests: number;
  perWorker: Record<string, number>;
}

export type RotationStrategy = "random" | "round-robin" | "adaptive";

export interface ServeOptions {
  port?: number;
  strategy?: RotationStrategy;
  onRequest?: (req: ProxyRequest) => void;
}

export interface UpOptions {
  count: number;
}

export interface FetchOptions extends RequestInit {
  /** Override rotation — use this specific worker index */
  workerIndex?: number;
}
