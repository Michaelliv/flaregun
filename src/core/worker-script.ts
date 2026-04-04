/**
 * The JavaScript source deployed to each Cloudflare Worker.
 * Two modes:
 * 1. HTTP fetch proxy: extracts target URL, forwards request, relays response.
 * 2. WebSocket tunnel: accepts WS upgrade, opens TCP connection to target
 *    via cloudflare:sockets, pipes bytes bidirectionally. Used for HTTPS CONNECT.
 */
export function getWorkerScript(): string {
  return `
import { connect } from "cloudflare:sockets";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket tunnel for CONNECT/HTTPS proxying
    if (url.pathname === "/tunnel" && request.headers.get("Upgrade") === "websocket") {
      const connectHost = request.headers.get("X-Connect-Host");
      if (!connectHost) {
        return new Response(JSON.stringify({ error: "Missing X-Connect-Host header" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const [host, port] = connectHost.split(":");
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();

      // Connect to target via cloudflare:sockets
      const targetSocket = connect({ hostname: host, port: Number(port) || 443 });

      // Target -> Client: read from TCP socket, send via WebSocket
      const reader = targetSocket.readable.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            server.send(value);
          }
        } catch { /* target closed */ } finally {
          server.close();
        }
      })();

      // Client -> Target: receive from WebSocket, write to TCP socket
      const writer = targetSocket.writable.getWriter();
      server.addEventListener("message", async (event) => {
        try {
          const data = event.data;
          if (data instanceof ArrayBuffer) {
            await writer.write(new Uint8Array(data));
          } else {
            await writer.write(new TextEncoder().encode(data));
          }
        } catch { /* target write failed */ 
          server.close();
        }
      });

      server.addEventListener("close", async () => {
        try { await writer.close(); } catch { /* already closed */ }
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP fetch proxy
    const target = request.headers.get("X-Target-URL") || url.searchParams.get("url");

    if (!target) {
      return new Response(JSON.stringify({ error: "Missing target. Set X-Target-URL header or ?url= param." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const targetUrl = new URL(target);

      // Forward all query params from the original request (except 'url')
      for (const [key, value] of url.searchParams) {
        if (key !== "url") targetUrl.searchParams.set(key, value);
      }

      const headers = new Headers(request.headers);
      headers.delete("X-Target-URL");
      headers.delete("X-Forwarded-For");
      headers.delete("CF-Connecting-IP");
      headers.delete("CF-IPCountry");
      headers.delete("CF-Ray");
      headers.delete("CF-Visitor");
      headers.set("Host", targetUrl.hostname);

      const resp = await fetch(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.body,
        redirect: "follow",
      });

      const responseHeaders = new Headers(resp.headers);
      responseHeaders.set("X-Flaregun-Worker", "WORKER_NAME_PLACEHOLDER");

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
};
`.trim();
}

/**
 * Returns the worker script with the worker name baked in for tracing.
 */
export function getWorkerScriptForName(name: string): string {
  return getWorkerScript().replace("WORKER_NAME_PLACEHOLDER", name);
}
