import { createInterface } from "node:readline";
import { FlareGun } from "../sdk.js";
import { Spinner } from "../utils/progress.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success, warn, error, bold } from "../utils/output.js";

async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

export async function down(
  options: OutputOptions & { force?: boolean },
): Promise<void> {
  try {
    const fg = new FlareGun();
    const workers = await fg.ls();

    if (workers.length === 0) {
      output(options, {
        json: () => ({ removed: 0, success: true }),
        human: () => warn("No flaregun workers found"),
      });
      return;
    }

    // Confirm unless --force or --quiet or --json
    if (!options.force && !options.quiet && !options.json) {
      const ok = await confirm(
        `Remove ${bold(String(workers.length))} worker${workers.length === 1 ? "" : "s"}?`,
      );
      if (!ok) {
        warn("Aborted");
        return;
      }
    }

    const spinner = options.quiet ? null : new Spinner(`Removing ${workers.length} workers...`);
    spinner?.start();

    const removed = await fg.down((current, total, name) => {
      spinner?.update(`Removing worker ${current}/${total}: ${name}`);
    });

    spinner?.stop();

    output(options, {
      json: () => ({ removed, success: true }),
      human: () => success(`Removed ${removed} worker${removed === 1 ? "" : "s"}`),
    });
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}
