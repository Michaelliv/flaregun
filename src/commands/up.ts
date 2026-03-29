import { FlareGun } from "../sdk.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success, bullet, dim, header, error } from "../utils/output.js";

export async function up(
  count: number,
  options: OutputOptions,
): Promise<void> {
  try {
    const fg = new FlareGun();
    const existing = await fg.ls();

    if (existing.length > 0) {
      // Scale to new total
      const workers = await fg.scale(existing.length + count);
      output(options, {
        json: () => ({
          workers: workers.map((w) => ({ name: w.name, url: w.url })),
          added: count,
          total: workers.length,
        }),
        human: () => {
          header(`Deployed ${count} new workers (${workers.length} total)`);
          for (const w of workers) {
            bullet(`${w.name}  ${dim(w.url)}`);
          }
        },
      });
    } else {
      const workers = await fg.up(count);
      output(options, {
        json: () => ({
          workers: workers.map((w) => ({ name: w.name, url: w.url })),
          total: workers.length,
        }),
        human: () => {
          header(`Deployed ${workers.length} workers`);
          for (const w of workers) {
            bullet(`${w.name}  ${dim(w.url)}`);
          }
        },
      });
    }
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}
