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

export { ProxyServer } from "./core/proxy-server.js";
export { createRotator } from "./core/rotation.js";
export { FlareGun } from "./sdk.js";
export type {
  FetchOptions,
  FlareGunConfig,
  FlareGunStats,
  ProxyRequest,
  RotationStrategy,
  ServeOptions,
  WorkerInfo,
} from "./types.js";
