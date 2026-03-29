import { FlareGun } from "../sdk.js";
import type { OutputOptions } from "../utils/output.js";
import { output, success, warn, error } from "../utils/output.js";

export async function down(options: OutputOptions): Promise<void> {
  try {
    const fg = new FlareGun();
    const removed = await fg.down();

    output(options, {
      json: () => ({ removed, success: true }),
      human: () => {
        if (removed === 0) {
          warn("No flaregun workers found");
        } else {
          success(`Removed ${removed} worker${removed === 1 ? "" : "s"}`);
        }
      },
    });
  } catch (err) {
    error((err as Error).message);
    process.exit(1);
  }
}
