/**
 * Local HTTP proxy server.
 * Intercepts HTTP requests and forwards them through rotating CF Workers.
 *
 * Usage:
 *   curl --proxy http://localhost:8080 http://httpbin.org/ip
 *   curl -x http://localhost:8080 https://httpbin.org/ip
 */

import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { Duplex } from "node:stream";
import type { WorkerInfo, ProxyRequest, ServeOptions } from "../types.js";
import { createRotator, type Rotator } from "./rotation.js";

export class ProxyServer {
  private server: Server;
  private rotator: Rotator;
  private requestCount = 0;
  private perWorkerCount: Map<string, number> = new Map();

  constructor(
    private workers: WorkerInfo[],
    private options: ServeOptions = {},
  ) {
    this.rotator = createRotator(options.strategy ?? "round-robin", workers);

    this.server = createServer((req, res) => this.handleRequest(req, res));

    // Handle CONNECT for HTTPS tunneling
    this.server.on("connect", (req, clientSocket, head) => {
      this.handleConnect(req, clientSocket, head);
    });
  }

  /** Handle regular HTTP proxy requests */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const target = req.url;
    if (!target) {
      res.writeHead(400);
      res.end("Missing URL");
      return;
    }

    const worker = this.rotator.next();
    const start = Date.now();

    try {
      // Collect request body
      const bodyChunks: Buffer[] = [];
      for await (const chunk of req) {
        bodyChunks.push(chunk as Buffer);
      }
      const body =
        bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

      // Forward through worker
      const workerUrl = `${worker.url}/?url=${encodeURIComponent(target)}`;
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (value && key !== "host" && key !== "proxy-connection") {
          headers[key] = Array.isArray(value) ? value.join(", ") : value;
        }
      }

      const resp = await fetch(workerUrl, {
        method: req.method,
        headers,
        body,
      });

      // Relay response
      const respHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });

      res.writeHead(resp.status, respHeaders);

      if (resp.body) {
        const reader = resp.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        await pump();
      } else {
        res.end();
      }

      this.trackRequest(worker, target, resp.status, Date.now() - start);
    } catch (err) {
      this.rotator.markError(worker);
      res.writeHead(502);
      res.end(`Proxy error: ${(err as Error).message}`);
      this.trackRequest(worker, target, 502, Date.now() - start);
    }
  }

  /**
   * Handle CONNECT tunneling for HTTPS.
   * Opens a WebSocket to a CF Worker, which uses cloudflare:sockets to
   * connect to the target. Bytes flow: client ↔ proxy ↔ worker(WS) ↔ target(TCP).
   * The target sees the worker's Cloudflare IP, not the client's.
   */
  private handleConnect(
    req: IncomingMessage,
    clientSocket: Duplex,
    _head: Buffer,
  ): void {
    const connectTarget = req.url ?? "";
    const worker = this.rotator.next();
    const start = Date.now();

    const workerUrl = new URL(worker.url);
    const wsProtocol = workerUrl.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${workerUrl.host}/tunnel`;

    try {
      // Bun's WebSocket supports custom headers; cast needed for standard typings
      const ws = new WebSocket(wsUrl, {
        headers: { "X-Connect-Host": connectTarget },
      } as any);
      ws.binaryType = "arraybuffer";

      ws.addEventListener("open", () => {
        // Tunnel established through worker — tell the client
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");

        // Client → Worker (via WebSocket)
        clientSocket.on("data", (chunk) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
          }
        });
        clientSocket.on("end", () => ws.close());
        clientSocket.on("error", () => ws.close());

        this.trackRequest(worker, connectTarget, 200, Date.now() - start);
      });

      // Worker → Client
      ws.addEventListener("message", (event) => {
        const data = event.data;
        if (data instanceof ArrayBuffer) {
          clientSocket.write(Buffer.from(data));
        } else {
          clientSocket.write(data);
        }
      });

      ws.addEventListener("close", () => clientSocket.end());
      ws.addEventListener("error", () => {
        this.rotator.markError(worker);
        clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        clientSocket.end();
        this.trackRequest(worker, connectTarget, 502, Date.now() - start);
      });
    } catch {
      this.rotator.markError(worker);
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.end();
      this.trackRequest(worker, connectTarget, 502, Date.now() - start);
    }
  }

  private trackRequest(
    worker: WorkerInfo,
    target: string,
    status: number,
    latencyMs: number,
  ): void {
    this.requestCount++;
    this.perWorkerCount.set(
      worker.name,
      (this.perWorkerCount.get(worker.name) ?? 0) + 1,
    );

    const proxyReq: ProxyRequest = {
      worker: worker.name,
      target,
      status,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    this.options.onRequest?.(proxyReq);
  }

  async start(port: number = 8080): Promise<Server> {
    return new Promise((resolve) => {
      this.server.listen(port, () => resolve(this.server));
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  getStats() {
    return {
      workers: this.workers.length,
      totalRequests: this.requestCount,
      perWorker: Object.fromEntries(this.perWorkerCount),
    };
  }
}
