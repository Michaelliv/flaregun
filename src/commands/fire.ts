import chalk from "chalk";
import { FlareGun } from "../sdk.js";
import type { OutputOptions } from "../utils/output.js";
import { dim, error, output } from "../utils/output.js";

/**
 * Fire a single request through the proxy. Quick test/debug command.
 *
 * flaregun fire https://httpbin.org/ip
 * flaregun fire https://httpbin.org/ip --count 5
 */
export async function fire(
  url: string,
  options: OutputOptions & { count?: number; method?: string },
): Promise<void> {
  const count = options.count ?? 1;
  const method = options.method ?? "GET";

  try {
    const fg = new FlareGun();
    await fg.ls();

    const results: {
      index: number;
      worker: string;
      status: number;
      latencyMs: number;
      body: string;
    }[] = [];

    for (let i = 0; i < count; i++) {
      const start = Date.now();
      const resp = await fg.fetch(url, { method });
      const latencyMs = Date.now() - start;
      const body = await resp.text();
      const worker = resp.headers.get("X-Flaregun-Worker") ?? "unknown";

      results.push({
        index: i,
        worker,
        status: resp.status,
        latencyMs,
        body: body.slice(0, 500),
      });

      if (!options.json && !options.quiet) {
        const statusColor =
          resp.status < 300
            ? chalk.green
            : resp.status < 400
              ? chalk.yellow
              : chalk.red;
        console.log(
          `${dim(`#${i + 1}`)} ${dim(worker)} ${statusColor(String(resp.status))} ${dim(`${latencyMs}ms`)}`,
        );
        if (count === 1) {
          console.log(body);
        }
      }
    }

    output(options, {
      json: () => (count === 1 ? results[0] : { results }),
      quiet: () => {
        for (const r of results) {
          console.log(r.body);
        }
      },
      human: () => {
        // Already printed above in the loop
      },
    });
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}
