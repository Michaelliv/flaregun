/**
 * Local HTTP proxy server.
 * Intercepts HTTP requests and forwards them through rotating CF Workers.
 *
 * Usage:
 *   curl --proxy http://localhost:8080 http://httpbin.org/ip
 *   curl -x http://localhost:8080 https://httpbin.org/ip
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";
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
    this.rotator = createRotator(
      options.strategy ?? "round-robin",
      workers,
    );

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
      const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : undefined;

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

  /** Handle CONNECT tunneling for HTTPS */
  private handleConnect(
    req: IncomingMessage,
    clientSocket: Socket,
    _head: Buffer,
  ): void {
    // For CONNECT, we can't easily route through Workers (they don't support raw TCP).
    // Instead we forward through the worker via a rewritten HTTPS request.
    // For now: direct CONNECT passthrough (no IP rotation for CONNECT tunnels).
    const [host, port] = (req.url ?? "").split(":");
    const serverSocket = connect(Number(port) || 443, host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on("error", () => {
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.end();
    });
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
