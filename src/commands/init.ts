import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initConfigDir, writeConfigFile } from "../core/config.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success, hint, cmd, error } from "../utils/output.js";

export async function init(
  options: OutputOptions & { token?: string; account?: string },
): Promise<void> {
  const dir = initConfigDir();

  const apiToken = options.token ?? process.env.CLOUDFLARE_API_TOKEN ?? process.env.CF_API_TOKEN;
  const accountId = options.account ?? process.env.CLOUDFLARE_ACCOUNT_ID ?? process.env.CF_ACCOUNT_ID;

  if (apiToken || accountId) {
    writeConfigFile(dir, {
      apiToken,
      accountId,
      prefix: "flaregun",
    });
  } else {
    writeConfigFile(dir, { prefix: "flaregun" });
  }

  // gitignore the config (has API tokens)
  const gitignorePath = join(process.cwd(), ".gitignore");
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (!content.includes(".flaregun")) {
      writeFileSync(gitignorePath, `${content.trimEnd()}\n.flaregun/\n`);
    }
  }

  output(options, {
    json: () => ({
      success: true,
      path: dir,
      configured: !!(apiToken && accountId),
    }),
    human: () => {
      success(`Initialized .flaregun/ in ${process.cwd()}`);
      if (!apiToken || !accountId) {
        console.log();
        hint("Set your Cloudflare credentials:");
        console.log(`  ${cmd("export CLOUDFLARE_API_TOKEN=your_token")}`);
        console.log(`  ${cmd("export CLOUDFLARE_ACCOUNT_ID=your_account_id")}`);
        console.log();
        hint("Or pass them directly:");
        console.log(`  ${cmd("flaregun init --token xxx --account yyy")}`);
      } else {
        hint("Ready! Deploy workers:");
        console.log(`  ${cmd("flaregun up 5")}`);
      }
    },
  });
}
