/**
 * Config resolution.
 * Priority: explicit config > env vars > project config > global config.
 *
 * Global config: ~/.flaregun/config.json  (credentials, shared across projects)
 * Project config: .flaregun/config.json   (project-specific overrides, worker cache)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

/** ~/.flaregun/ */
export function globalConfigDir(): string {
  return join(homedir(), CONFIG_DIR);
}

/** Walk up from cwd to find .flaregun/ (project-level) */
export function findProjectConfigDir(): string | null {
  const globalDir = globalConfigDir();
  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, CONFIG_DIR);
    // Skip if it's the global dir
    if (existsSync(candidate) && candidate !== globalDir) {
      return candidate;
    }
    const parent = join(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Find config dir — project first, then global */
export function findConfigDir(): string | null {
  return (
    findProjectConfigDir() ??
    (existsSync(globalConfigDir()) ? globalConfigDir() : null)
  );
}

export function requireConfigDir(): string {
  const dir = findConfigDir();
  if (!dir) {
    throw new Error("Not configured. Run: flaregun init");
  }
  return dir;
}

/** Init global config at ~/.flaregun/ */
export function initGlobalConfigDir(): string {
  const dir = globalConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Init project config at ./.flaregun/ */
export function initProjectConfigDir(): string {
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

export function writeConfigFile(configDir: string, config: ConfigFile): void {
  writeFileSync(
    join(configDir, CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

/** Resolve config from all sources */
export function resolveConfig(
  explicit?: Partial<FlareGunConfig>,
): FlareGunConfig {
  const projectDir = findProjectConfigDir();
  const globalDir = existsSync(globalConfigDir()) ? globalConfigDir() : null;

  // Merge: global < project (project overrides global)
  const globalFile = globalDir ? readConfigFile(globalDir) : {};
  const projectFile = projectDir ? readConfigFile(projectDir) : {};
  const file = { ...globalFile, ...projectFile };

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
export function saveWorkerCache(configDir: string, workers: string[]): void {
  const config = readConfigFile(configDir);
  config.workers = workers;
  writeConfigFile(configDir, config);
}

/** Load cached worker URLs */
export function loadWorkerCache(configDir: string): string[] {
  const config = readConfigFile(configDir);
  return config.workers ?? [];
}
