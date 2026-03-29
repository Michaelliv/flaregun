import { FlareGun } from "../sdk.js";
import type { OutputOptions } from "../utils/output.js";
import { output, bullet, dim, header, warn, error } from "../utils/output.js";

export async function ls(options: OutputOptions): Promise<void> {
  try {
    const fg = new FlareGun();
    const workers = await fg.ls();

    output(options, {
      json: () => ({
        workers: workers.map((w) => ({
          name: w.name,
          url: w.url,
          createdAt: w.createdAt,
        })),
        total: workers.length,
      }),
      human: () => {
        if (workers.length === 0) {
          warn("No flaregun workers deployed");
          return;
        }
        header(`${workers.length} worker${workers.length === 1 ? "" : "s"}`);
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
