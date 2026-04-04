/**
 * Tests for ProxyServer.
 *
 * We spin up:
 * 1. A fake "target" HTTP server (simulates the remote host)
 * 2. A fake "worker" server (simulates a CF Worker)
 *    - Handles HTTP requests via `?url=` (fetch proxy)
 *    - Handles WebSocket upgrades for TCP tunneling (simulates cloudflare:sockets)
 * 3. The ProxyServer under test, configured to route through the fake worker
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { createServer, type Server, request as httpRequest } from "node:http";
import { connect, type Socket } from "node:net";
import { ProxyServer } from "./proxy-server.js";
import type { WorkerInfo } from "../types.js";

let targetServer: Server;
let workerBunServer: ReturnType<typeof Bun.serve>;
let proxy: ProxyServer;

let targetPort: number;
let workerPort: number;
let proxyPort: number;

let workerHttpHit: boolean;
let workerWsHit: boolean;
let targetHit: boolean;

/**
 * Fake target server — plain HTTP, returns "hello from target"
 */
function createTargetServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      targetHit = true;
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("hello from target");
    });
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" ? addr!.port : 0;
      resolve({ server, port });
    });
  });
}

/**
 * Fake worker using Bun.serve — handles both HTTP fetch proxy and WebSocket tunnel.
 * Bun.serve handles WebSocket upgrades natively (no socket flush bugs).
 */
function createWorkerBunServer(): {
  server: ReturnType<typeof Bun.serve>;
  port: number;
} {
  const server = Bun.serve({
    port: 0,
    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade for tunnel
      if (
        url.pathname === "/tunnel" &&
        req.headers.get("upgrade") === "websocket"
      ) {
        const connectHost = req.headers.get("x-connect-host");
        if (server.upgrade(req, { data: { connectHost } })) {
          return undefined; // upgraded, no HTTP response needed
        }
        return new Response("WebSocket upgrade failed", { status: 500 });
      }

      // HTTP fetch proxy
      workerHttpHit = true;
      const target = url.searchParams.get("url");
      if (!target) return new Response("missing url param", { status: 400 });
      return fetch(target);
    },
    websocket: {
      open(ws) {
        workerWsHit = true;
        const { connectHost } = ws.data as { connectHost: string };
        const [host, portStr] = connectHost.split(":");
        const port = Number(portStr) || 80;

        // Connect to target (simulates cloudflare:sockets connect())
        const targetSocket = connect(port, host, () => {
          // Pipe target → ws
          targetSocket.on("data", (chunk) => {
            ws.sendBinary(chunk);
          });
          targetSocket.on("end", () => ws.close());
        });
        targetSocket.on("error", () => ws.close());

        // Store socket for message handler
        (ws as any)._targetSocket = targetSocket;
      },
      message(ws, message) {
        const targetSocket = (ws as any)._targetSocket as Socket;
        if (targetSocket?.writable) {
          targetSocket.write(
            typeof message === "string"
              ? Buffer.from(message)
              : Buffer.from(message),
          );
        }
      },
      close(ws) {
        const targetSocket = (ws as any)._targetSocket as Socket;
        targetSocket?.end();
      },
    },
  });

  return { server, port: server.port };
}

beforeAll(async () => {
  const target = await createTargetServer();
  targetServer = target.server;
  targetPort = target.port;

  const worker = createWorkerBunServer();
  workerBunServer = worker.server;
  workerPort = worker.port;

  const workers: WorkerInfo[] = [
    {
      id: "fake-worker-1",
      name: "flaregun-000",
      url: `http://localhost:${workerPort}`,
      createdAt: new Date().toISOString(),
    },
  ];

  proxy = new ProxyServer(workers);
  const server = await proxy.start(0);
  const addr = server.address();
  proxyPort = typeof addr === "object" ? addr!.port : 0;
});

beforeEach(() => {
  workerHttpHit = false;
  workerWsHit = false;
  targetHit = false;
});

afterAll(async () => {
  await proxy.stop();
  targetServer.close();
  workerBunServer.stop();
});

// ── Helpers ──────────────────────────────────────────────────────────────

function httpViaProxy(
  targetUrl: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const req = httpRequest(
      {
        hostname: "localhost",
        port: proxyPort,
        method: "GET",
        path: targetUrl,
        headers: { Host: parsed.host },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function connectViaProxy(
  host: string,
  port: number,
): Promise<{ socket: Socket }> {
  return new Promise((resolve, reject) => {
    const socket = connect(proxyPort, "localhost", () => {
      socket.write(
        `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`,
      );
    });

    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      if (buf.includes("\r\n\r\n")) {
        socket.removeListener("data", onData);
        if (buf.includes("200")) {
          resolve({ socket });
        } else {
          reject(new Error(`CONNECT failed: ${buf}`));
        }
      }
    };
    socket.on("data", onData);
    socket.on("error", reject);
  });
}

function httpOverTunnel(
  socket: Socket,
  host: string,
  path: string = "/",
): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    socket.on("data", (chunk) => (data += chunk.toString()));
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    socket.write(
      `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`,
    );
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("ProxyServer", () => {
  describe("HTTP requests", () => {
    it("routes through the worker", async () => {
      const result = await httpViaProxy(`http://localhost:${targetPort}/`);

      expect(result.status).toBe(200);
      expect(result.body).toBe("hello from target");
      expect(workerHttpHit).toBe(true);
      expect(targetHit).toBe(true);
    });
  });

  describe("CONNECT requests", () => {
    it("routes through the worker via WebSocket tunnel", async () => {
      const { socket } = await connectViaProxy("localhost", targetPort);
      const response = await httpOverTunnel(socket, `localhost:${targetPort}`);

      expect(response).toContain("hello from target");
      expect(targetHit).toBe(true);
      // The fix: CONNECT must go through the worker, not direct
      expect(workerWsHit).toBe(true);
    });

    it("tracks CONNECT requests in rotation stats", async () => {
      const countBefore = proxy.getStats().totalRequests;

      const { socket } = await connectViaProxy("localhost", targetPort);
      await httpOverTunnel(socket, `localhost:${targetPort}`);

      // Wait briefly for async tracking
      await new Promise((r) => setTimeout(r, 50));

      expect(proxy.getStats().totalRequests).toBeGreaterThan(countBefore);
    });
  });
});
