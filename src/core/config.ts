/**
 * Config resolution.
 * Priority: explicit config > env vars > config file.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FlareGunConfig } from "../types.js";

const CONFIG_DIR = ".flaregun";
const CONFIG_FILE = "config.json";

export interface ConfigFile {
  apiToken?: string;
  accountId?: string;
  prefix?: string;
  workers?: string[];
}

/** Walk up from cwd to find .flaregun/ */
export function findConfigDir(): string | null {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, CONFIG_DIR))) {
      return join(dir, CONFIG_DIR);
    }
    const parent = join(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireConfigDir(): string {
  const dir = findConfigDir();
  if (!dir) {
    throw new Error("Not a flaregun project. Run: flaregun init");
  }
  return dir;
}

export function initConfigDir(): string {
  const dir = join(process.cwd(), CONFIG_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function readConfigFile(configDir: string): ConfigFile {
  const filePath = join(configDir, CONFIG_FILE);
  if (!existsSync(filePath)) return {};
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

export function writeConfigFile(
  configDir: string,
  config: ConfigFile,
): void {
  writeFileSync(
    join(configDir, CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

/** Resolve config from all sources */
export function resolveConfig(
  explicit?: Partial<FlareGunConfig>,
): FlareGunConfig {
  const configDir = findConfigDir();
  const file = configDir ? readConfigFile(configDir) : {};

  const apiToken =
    explicit?.apiToken ??
    process.env.CLOUDFLARE_API_TOKEN ??
    process.env.CF_API_TOKEN ??
    file.apiToken;

  const accountId =
    explicit?.accountId ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID ??
    file.accountId;

  const prefix = explicit?.prefix ?? file.prefix ?? "flaregun";

  if (!apiToken) {
    throw new Error(
      "Missing Cloudflare API token. Set CLOUDFLARE_API_TOKEN or run: flaregun init",
    );
  }
  if (!accountId) {
    throw new Error(
      "Missing Cloudflare account ID. Set CLOUDFLARE_ACCOUNT_ID or run: flaregun init",
    );
  }

  return { apiToken, accountId, prefix };
}

/** Save worker URLs to config for offline use */
export function saveWorkerCache(
  configDir: string,
  workers: string[],
): void {
  const config = readConfigFile(configDir);
  config.workers = workers;
  writeConfigFile(configDir, config);
}

/** Load cached worker URLs */
export function loadWorkerCache(configDir: string): string[] {
  const config = readConfigFile(configDir);
  return config.workers ?? [];
}
