# flaregun

Rotating proxy network on Cloudflare Workers.

## Commands

```bash
bun run dev -- --help
bun run dev -- up 5
bun run dev -- fire https://httpbin.org/ip --count 3
bun run dev -- serve --port 8080
bun test
bun run format
bun run lint
bun run build
```

## Architecture

```
CLI (src/main.ts) → Commands (src/commands/) → SDK (src/sdk.ts) → Core
```

The CLI is a thin Commander wrapper. All logic lives in the SDK class (`FlareGun`).

### Layers

| Layer | File | Purpose |
|-------|------|---------|
| SDK | `src/sdk.ts`, `src/index.ts` | `FlareGun` class, library entrypoint |
| CLI | `src/main.ts` | Commander setup, routes to commands |
| Commands | `src/commands/` | init, up, down, ls, serve, fire |
| CF Client | `src/core/client.ts` | Cloudflare API — deploy, delete, list workers |
| Worker Script | `src/core/worker-script.ts` | JS proxy script deployed to each Worker |
| Rotation | `src/core/rotation.ts` | Round-robin, random, adaptive strategies |
| Proxy Server | `src/core/proxy-server.ts` | Local HTTP proxy that rotates across workers |
| Config | `src/core/config.ts` | `.flaregun/config.json`, env var resolution |
| Output | `src/utils/output.ts` | chalk helpers, json/quiet/human triple |

### Key Patterns

- **SDK-first**: CLI calls SDK. Never put logic in commands.
- **Output triple**: Every command supports `--json`, `--quiet`, and human-readable (chalk).
- **Config resolution**: explicit arg → env var (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) → `.flaregun/config.json`.
- **Worker naming**: `flaregun-000`, `flaregun-001`, etc. Prefix is configurable.
- **Rotation**: `createRotator(strategy, workers)` returns a `Rotator` with `.next()` and `.markError()`.

## Adding a New Command

1. Create `src/commands/<name>.ts`
2. Export an async function that takes `OutputOptions` (plus command-specific options)
3. Use the SDK (`new FlareGun()`) for all logic
4. Use `output(options, { json, human })` for output
5. Import and register in `src/main.ts` as a Commander subcommand

## Exit Codes

- `0` success
- `1` error
- `2` user error (missing args, bad input)
- `3` not found
