/**
 * The JavaScript source deployed to each Cloudflare Worker.
 * Thin proxy: extracts target URL, forwards request, relays response.
 */
export function getWorkerScript(): string {
  return `
export default {
  async fetch(request) {
    const url = new URL(request.url);
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
