# dsh-session-recap

English | [中文](README.zh.md)

A DeepSeek Harness bundle that turns the current session into a shareable **recap card**: turns, steps, tool calls, token split, cache-hit rate, and an off-peak/peak cost estimate — plus one-click Markdown and standalone HTML export.

It answers a question every agent user eventually asks: *what did this session actually cost, and what did it do?*

```
┌─────────────────────────────────────────────┐
│ 会话复盘                              ×     │
│ 11月9日 18:12 · 12 轮次                     │
├─────────────────────────────────────────────┤
│  轮次 12   步数 28   耗时 42m   工具 76     │
│                                             │
│ Token                                       │
│ ████████████████████░░░░░▒▒                 │
│ 缓存命中 1.1M · 输入 180k · 写入 12k · 输出 34k │
│ 缓存命中率 85.7%                             │
│                                             │
│ 预估花费  $0.09 – $0.18                     │
│ DeepSeek Flash 官网定价，低谷价–高峰价        │
│                                             │
│ [复制 Markdown] [下载 .md] [下载 .html]      │
└─────────────────────────────────────────────┘
```

## Why

- **Cost visibility.** The composer already shows context pressure; this card shows the *bill* — the prompt-side split (uncached / cache read / cache write), the cache-hit rate, and a dollar range at list price.
- **Shareable artifacts.** One click produces a self-contained HTML card or a Markdown block. Useful for post-mortems, team updates, and writing about how an agent worked.
- **Nothing leaves the machine.** The card is derived in the browser from data the Conversation layer already publishes. No network calls, no telemetry, no storage.

## Install

### From a local checkout

```js
// plugin_manager
{ "action": "install_bundle", "target": "<absolute path to this directory>" }
```

### From the community market

[dshmarket](https://github.com/dsh-market/dsh-market) lists only sources from the curated
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) list. The
submission is one YAML file; see [`submission/`](submission/README.md) for the checklist and a
ready-to-fill template. Once listed, install from the market UI or:

```bash
dsh plugin --profile web add dsh-session-recap
```

### From a plugin market index

This repository also ships a format-1 index at [`market/index.json`](market/index.json). Host it over http(s), then add it in **Plugins → Discover → Index sources**:

```bash
# any static file server works
npx serve .        # http://localhost:3000/market/index.json
```

The index is validated with the same validator DSH uses:

```bash
pnpm install
pnpm run index           # regenerate market/index.json (bumps publishTimestamp)
pnpm run validate:index  # parse + print install targets
```

Publishing the package to npm is the only step needed to make the index entry installable:

```bash
npm publish --access public
```

## How it works

| Surface | Detail |
|---|---|
| Slot | `conversation.composer.dock`, one pill after the built-in activity and usage pills |
| Session stats | `useProjection('sessionStats')` — turns, steps, model time, tool time |
| Tokens | `useProjection('tokenUsage')` — `uncachedInputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `outputTokens` |
| Tool usage | the Chat snapshot's `legacy.nodes` (`tool-call` rows, grouped by name) |
| Cost | DeepSeek Flash list price, USD per 1M tokens: cache hit `0.003 / 0.006`, cache miss `0.15 / 0.3`, output `0.6 / 1.2` (off-peak / peak). Peak is 01:00–04:00 and 06:00–10:00 UTC on weekdays, so a session total is shown as a low–high range. Source: [api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing/) |

Pricing constants live at the top of [`client.js`](client.js); update `PRICE` when the official price changes.

## Privacy

The plugin reads only what the page already holds for the open session and renders it locally. It makes no network request, writes no file unless the user presses a download button, and persists nothing between sessions.

## Compatibility

- DSH desktop / web with the Web UI (`platform: web`).
- The client module recognises an unavailable `react-dom` and falls back to an in-place panel instead of a portal.
- If a projection is missing (older build), the card still renders from the Chat snapshot alone.

## Development

```bash
pnpm run check          # node --check on both halves
pnpm run index          # rebuild market/index.json
pnpm run validate:index # validate with @deepseek-ai/dsh-plugin-market-index
```

## License

MIT
