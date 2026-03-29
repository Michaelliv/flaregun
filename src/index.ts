/**
 * FlareGun SDK
 *
 * Rotating proxy network on Cloudflare Workers.
 *
 * @example
 * ```ts
 * import { FlareGun } from "flaregun";
 *
 * const fg = new FlareGun({ apiToken: "xxx", accountId: "yyy" });
 * await fg.up(5);
 *
 * // Drop-in fetch with automatic rotation
 * const res = await fg.fetch("https://httpbin.org/ip");
 * console.log(await res.json());
 *
 * // Or start a local proxy server
 * await fg.serve({ port: 8080 });
 *
 * // Cleanup
 * await fg.down();
 * ```
 */

export { FlareGun } from "./sdk.js";
export { createRotator } from "./core/rotation.js";
export { ProxyServer } from "./core/proxy-server.js";
export type {
  FlareGunConfig,
  WorkerInfo,
  ProxyRequest,
  FlareGunStats,
  RotationStrategy,
  ServeOptions,
  FetchOptions,
} from "./types.js";
