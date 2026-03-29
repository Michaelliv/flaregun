# flaregun 🔥

Rotating proxy network on Cloudflare Workers. Deploy, rotate, fire.

Turn Cloudflare's free tier into a rotating proxy network. Deploy N Workers, each exits through a different IP. Use as a drop-in `fetch`, local proxy server, or CLI. 100k requests/day free.

```bash
npm install -g @miclivs/flaregun
```

## Quick Start

```bash
flaregun init --token cf_xxx --account abc123
flaregun up 5
flaregun fire https://httpbin.org/ip --count 3
```

Each request shows a different IP. That's it.

## CLI

```bash
flaregun init                          # create .flaregun/ config
flaregun init --token T --account A    # with credentials
flaregun up 10                         # deploy 10 proxy workers
flaregun up 5                          # add 5 more (15 total)
flaregun ls                            # list deployed workers
flaregun fire <url>                    # fire a request through proxy
flaregun fire <url> -n 5              # fire 5 requests (rotated)
flaregun fire <url> -m POST            # POST request
flaregun serve                         # start local proxy on :8080
flaregun serve -p 3128 -s adaptive     # custom port & strategy
flaregun down                          # teardown all workers
```

## Local Proxy Server

Start a proxy server and use it from any tool, any language:

```bash
flaregun serve --port 8080
```

```bash
# curl
curl --proxy http://localhost:8080 https://httpbin.org/ip

# python
requests.get("https://httpbin.org/ip", proxies={"http": "http://localhost:8080"})

# playwright
browser.launch({ proxy: { server: "http://localhost:8080" } })
```

Live request log streams to stdout — every request shows which worker handled it, status, and latency.

## SDK

```typescript
import { FlareGun } from "flaregun";

const fg = new FlareGun({
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
});

// Deploy 5 workers
await fg.up(5);

// Drop-in fetch — automatically rotates
const res = await fg.fetch("https://httpbin.org/ip");
console.log(await res.json()); // { origin: "104.28.x.x" }

const res2 = await fg.fetch("https://httpbin.org/ip");
console.log(await res2.json()); // { origin: "172.67.x.x" } — different IP

// Or start a local proxy server
await fg.serve({ port: 8080, strategy: "adaptive" });

// Scale up/down
await fg.scale(20);  // now 20 workers
await fg.scale(3);   // scaled down to 3

// Get all URLs for external use
console.log(fg.urls());

// Cleanup
await fg.down();
```

## Rotation Strategies

| Strategy | Behavior |
|---|---|
| `round-robin` | Cycle through workers sequentially (default) |
| `random` | Random worker each request |
| `adaptive` | Backs off workers getting 429s/5xx, exponential cooldown |

## Configuration

Credentials resolve in order: explicit config → env vars → project `.flaregun/config.json` → global `~/.flaregun/config.json`.

```bash
# One-time setup (saved to ~/.flaregun/)
flaregun init --token xxx --account yyy

# Or use env vars
export CLOUDFLARE_API_TOKEN=your_token
export CLOUDFLARE_ACCOUNT_ID=your_account_id

# Or project-level config
flaregun init --global false
```

## Cloudflare Setup

### 1. Create a free account

Sign up at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).

### 2. Create an API token

1. Go to **My Profile → API Tokens** ([direct link](https://dash.cloudflare.com/profile/api-tokens))
2. Click **Create Token**
3. Find **Edit Cloudflare Workers** and click **Use template**
4. Under **Account Resources**, select your account from the dropdown
5. Leave everything else as-is
6. Click **Continue to summary → Create Token**
7. Copy the token

### 3. Get your Account ID

Your Account ID is in the Cloudflare dashboard URL: `dash.cloudflare.com/<ACCOUNT_ID>/...`

Or find it on the **Workers & Pages** overview page in the right sidebar.

### 4. Configure flaregun

```bash
flaregun init --token cfut_xxx --account abc123
```

This saves credentials to `~/.flaregun/config.json` — works globally across all projects. You're ready:

```bash
flaregun up 5
flaregun fire https://httpbin.org/ip
```

### Limits

| Plan | Requests | Cost |
|---|---|---|
| Free | 100k/day | $0 |
| Paid | 10M/month included | $5/mo + $0.30/million |

## For Agents

Every command supports `--json` for structured output:

```bash
flaregun ls --json
flaregun fire https://httpbin.org/ip --json
```

## License

MIT
