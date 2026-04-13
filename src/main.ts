#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { down } from "./commands/down.js";
import { fire } from "./commands/fire.js";
import { init } from "./commands/init.js";
import { ls } from "./commands/ls.js";
import { serve } from "./commands/serve.js";
import { up } from "./commands/up.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program
  .name("flaregun")
  .description("Rotating proxy network on Cloudflare Workers")
  .version(`flaregun ${version}`, "-v, --version")
  .option("--json", "Output as JSON")
  .option("-q, --quiet", "Suppress output")
  .option("--no-color", "Disable color output")
  .hook("preAction", (thisCommand) => {
    if (thisCommand.opts().color === false) {
      process.env.NO_COLOR = "1";
    }
  })
  .addHelpText(
    "after",
    `
Examples:
  $ flaregun init --token cf_xxx --account abc123
  $ flaregun up 5
  $ flaregun fire https://httpbin.org/ip --count 3
  $ flaregun serve --port 8080
  $ flaregun ls
  $ flaregun down

https://github.com/Michaelliv/flaregun`,
  );

program
  .command("init")
  .description("Configure flaregun credentials")
  .option("-t, --token <token>", "Cloudflare API token")
  .option("-a, --account <id>", "Cloudflare account ID")
  .option(
    "-g, --global",
    "Store in ~/.flaregun/ (default when setting credentials)",
  )
  .action(async (opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    await init({
      token: opts.token,
      account: opts.account,
      global: opts.global,
      json: globals.json,
      quiet: globals.quiet,
    });
  });

program
  .command("up <count>")
  .description("Deploy N proxy workers")
  .action(async (count, _opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    await up(Number.parseInt(count, 10), {
      json: globals.json,
      quiet: globals.quiet,
    });
  });

program
  .command("down")
  .description("Teardown all proxy workers")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    await down({ force: opts.force, json: globals.json, quiet: globals.quiet });
  });

program
  .command("ls")
  .description("List deployed proxy workers")
  .action(async (_opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    await ls({ json: globals.json, quiet: globals.quiet });
  });

program
  .command("serve")
  .description("Start a local HTTP proxy server")
  .option("-p, --port <port>", "Port to listen on", "8080")
  .option(
    "-H, --host <host>",
    "Host to bind to (default: 127.0.0.1)",
    "127.0.0.1",
  )
  .option(
    "-s, --strategy <strategy>",
    "Rotation strategy: round-robin, random, adaptive",
    "round-robin",
  )
  .action(async (opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    await serve({
      port: Number.parseInt(opts.port, 10),
      host: opts.host,
      strategy: opts.strategy,
      json: globals.json,
      quiet: globals.quiet,
    });
  });

program
  .command("fire <url>")
  .description("Fire a request through the proxy")
  .option("-n, --count <n>", "Number of requests", "1")
  .option("-m, --method <method>", "HTTP method", "GET")
  .action(async (url, opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    await fire(url, {
      count: Number.parseInt(opts.count, 10),
      method: opts.method,
      json: globals.json,
      quiet: globals.quiet,
    });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
