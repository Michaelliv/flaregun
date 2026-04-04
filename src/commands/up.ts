import { FlareGun } from "../sdk.js";
import { Spinner } from "../utils/progress.js";
import type { OutputOptions } from "../utils/output.js";
import { output, bullet, dim, header, error } from "../utils/output.js";

export async function up(count: number, options: OutputOptions): Promise<void> {
  try {
    const fg = new FlareGun();

    const spinner = options.quiet
      ? null
      : new Spinner(`Deploying ${count} workers...`);
    spinner?.start();

    const progress = (current: number, total: number, name: string) => {
      spinner?.update(`Deploying worker ${current}/${total}: ${name}`);
    };

    const existing = await fg.ls();
    const workers =
      existing.length > 0
        ? await fg.scale(existing.length + count, progress)
        : await fg.up(count, progress);

    const added = workers.length - existing.length;
    spinner?.stop();

    output(options, {
      json: () => ({
        workers: workers.map((w) => ({ name: w.name, url: w.url })),
        added,
        total: workers.length,
      }),
      human: () => {
        header(
          existing.length > 0
            ? `Deployed ${added} new workers (${workers.length} total)`
            : `Deployed ${workers.length} workers`,
        );
        for (const w of workers) {
          bullet(`${w.name}  ${dim(w.url)}`);
        }
      },
    });
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}
