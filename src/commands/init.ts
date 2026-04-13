import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  globalConfigDir,
  initGlobalConfigDir,
  initProjectConfigDir,
  writeConfigFile,
} from "../core/config.js";
import type { OutputOptions } from "../utils/output.js";
import { cmd, hint, output, success } from "../utils/output.js";

export async function init(
  options: OutputOptions & {
    token?: string;
    account?: string;
    global?: boolean;
  },
): Promise<void> {
  const isGlobal = options.global ?? !!(options.token || options.account);
  const dir = isGlobal ? initGlobalConfigDir() : initProjectConfigDir();

  const apiToken =
    options.token ??
    process.env.CLOUDFLARE_API_TOKEN ??
    process.env.CF_API_TOKEN;
  const accountId =
    options.account ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.CF_ACCOUNT_ID;

  if (apiToken || accountId) {
    writeConfigFile(dir, {
      apiToken,
      accountId,
      prefix: "flaregun",
    });
  } else {
    writeConfigFile(dir, { prefix: "flaregun" });
  }

  // gitignore project-level config (has API tokens)
  if (!isGlobal) {
    const gitignorePath = join(process.cwd(), ".gitignore");
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, "utf-8");
      if (!content.includes(".flaregun")) {
        writeFileSync(gitignorePath, `${content.trimEnd()}\n.flaregun/\n`);
      }
    }
  }

  output(options, {
    json: () => ({
      success: true,
      path: dir,
      global: isGlobal,
      configured: !!(apiToken && accountId),
    }),
    human: () => {
      success(
        isGlobal
          ? `Initialized ~/.flaregun/ (global config)`
          : `Initialized .flaregun/ in ${process.cwd()}`,
      );
      if (!apiToken || !accountId) {
        console.log();
        hint("Set your Cloudflare credentials:");
        console.log(`  ${cmd("flaregun init --token xxx --account yyy")}`);
        console.log();
        hint(
          "Tip: to avoid leaking the token in shell history, prefix with a space:",
        );
        console.log(`  ${cmd(" flaregun init --token xxx --account yyy")}`);
      } else {
        hint("Ready! Deploy workers:");
        console.log(`  ${cmd("flaregun up 5")}`);
      }
    },
  });
}
