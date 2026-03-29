import chalk from "chalk";
import { FlareGun } from "../sdk.js";
import type { RotationStrategy } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { success, info, dim, error, bold } from "../utils/output.js";

export async function serve(
  options: OutputOptions & {
    port?: number;
    strategy?: RotationStrategy;
  },
): Promise<void> {
  const port = options.port ?? 8080;
  const strategy = options.strategy ?? "round-robin";

  try {
    const fg = new FlareGun(undefined, { strategy });
    const workers = await fg.ls();

    if (workers.length === 0) {
      error("No workers deployed. Run: flaregun up <count>");
      process.exit(1);
    }

    const server = await fg.serve({
      port,
      strategy,
      onRequest: (req) => {
        if (!options.quiet) {
          const statusColor =
            req.status < 300
              ? chalk.green
              : req.status < 400
                ? chalk.yellow
                : chalk.red;

          console.log(
            `${dim(req.timestamp.split("T")[1].split(".")[0])} ${dim(req.worker)} → ${req.target} ${statusColor(String(req.status))} ${dim(`${req.latencyMs}ms`)}`,
          );
        }
      },
    });

    if (options.json) {
      console.log(
        JSON.stringify({
          port,
          strategy,
          workers: workers.length,
          status: "listening",
        }),
      );
    } else {
      console.log();
      success(
        `Proxy server listening on ${bold(`http://localhost:${port}`)}`,
      );
      info(
        `Rotating across ${bold(String(workers.length))} workers (${strategy})`,
      );
      console.log();
      console.log(
        dim(
          `  curl --proxy http://localhost:${port} https://httpbin.org/ip`,
        ),
      );
      console.log();
    }

    // Keep alive until SIGINT
    process.on("SIGINT", async () => {
      if (!options.quiet) {
        console.log();
        info("Shutting down proxy server...");
      }
      await fg.stopServe();
      process.exit(0);
    });
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}
