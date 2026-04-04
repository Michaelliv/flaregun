import chalk from "chalk";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private message: string;

  constructor(message: string) {
    this.message = message;
  }

  start(): void {
    if (!process.stderr.isTTY) {
      process.stderr.write(`${this.message}\n`);
      return;
    }
    this.interval = setInterval(() => {
      const spinner = chalk.cyan(
        SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length],
      );
      process.stderr.write(`\r${spinner} ${this.message}`);
      this.frame++;
    }, 80);
  }

  update(message: string): void {
    this.message = message;
    if (!process.stderr.isTTY) {
      process.stderr.write(`${message}\n`);
    }
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (process.stderr.isTTY) {
      process.stderr.write("\r\x1b[K"); // clear line
      if (finalMessage) {
        process.stderr.write(`${finalMessage}\n`);
      }
    }
  }
}

/** Simple progress counter for deploying workers */
export function deployProgress(
  current: number,
  total: number,
  name: string,
): string {
  return `Deploying worker ${current}/${total}: ${name}`;
}
