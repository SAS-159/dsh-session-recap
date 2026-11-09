# dsh-session-recap（会话复盘卡）

[English](README.md) | 中文

一个 DeepSeek Harness 组合包：把当前会话变成一张可分享的 **复盘卡**——轮次、步数、工具调用、Token 构成、缓存命中率，以及按官网峰谷价估算的花费；一键导出 Markdown 和独立 HTML。

它回答每个重度用户迟早会问的问题：*这场会话到底花了多少钱、干了什么？*

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

## 为什么做

- **看得见成本。** 输入框下方已有上下文压力提示，这张卡补上“账单”：输入侧的未缓存 / 缓存读 / 缓存写拆分、缓存命中率，以及按官网定价折算的美元区间。
- **可分享的产物。** 一键生成自包含的 HTML 卡片或 Markdown 段落，适合写复盘、做周报、发到社区。
- **数据不出本机。** 卡片完全由浏览器里 Conversation 层已发布的数据推导，不联网、不埋点、不落盘。

## 安装

### 本地目录安装

```js
// plugin_manager
{ "action": "install_bundle", "target": "<本目录的绝对路径>" }
```

### 通过社区市场上架

[dshmarket](https://github.com/dsh-market/dsh-market) 只允许安装精选列表
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 内的来源。
收录方式是提交一个 YAML 文件，清单与模板见 [`submission/`](submission/README.md)。
收录后可在市场界面一键安装，或：

```bash
dsh plugin --profile web add dsh-session-recap
```

### 通过插件市场索引安装

仓库同时自带一份 format-1 索引：[`market/index.json`](market/index.json)。把它放到任意 http(s) 静态服务上，在 **设置 → 插件 → 发现 → 索引源** 里填入 URL：

```bash
npx serve .        # http://localhost:3000/market/index.json
```

索引已用 DSH 同款校验器验证：

```bash
pnpm install
pnpm run index           # 重新生成 market/index.json（刷新 publishTimestamp）
pnpm run validate:index  # 校验并打印安装参数
```

要让索引里的条目真正可安装，只需发布到 npm：

```bash
npm publish --access public
```

## 实现说明

| 面 | 说明 |
|---|---|
| 挂载点 | `conversation.composer.dock`，在内置的 activity、usage 之后多一枚胶囊按钮 |
| 会话统计 | `useProjection('sessionStats')`：轮次、步数、模型耗时、工具耗时 |
| Token | `useProjection('tokenUsage')`：`uncachedInputTokens`、`cacheReadTokens`、`cacheWriteTokens`、`outputTokens` |
| 工具用量 | Chat 快照的 `legacy.nodes`（`tool-call` 行按名称聚合） |
| 花费 | DeepSeek Flash 官网价，美元 / 百万 token：缓存命中 `0.003 / 0.006`、未命中 `0.15 / 0.3`、输出 `0.6 / 1.2`（低谷 / 高峰）。高峰为工作日 UTC 01:00–04:00 与 06:00–10:00，因此会话总额按区间展示。来源：[api-docs.deepseek.com/quick_start/pricing](https://api-docs.deepseek.com/quick_start/pricing/) |

价格常量在 [`client.js`](client.js) 顶部的 `PRICE`，官网调价后改这一处即可。

## 隐私

只读取页面已持有的当前会话数据并在本地渲染。除非用户点下载，否则不写文件；不跨会话保存任何状态；不发网络请求。

## 兼容性

- 适用于带 Web UI 的 DSH 桌面版 / Web 版（`platform: web`）。
- 若拿不到 `react-dom`，自动退化为原地面板而不是 portal。
- 若某个投影不存在（旧版本），仍可仅凭 Chat 快照渲染。

## 开发

```bash
pnpm run check          # 对两端做 node --check
pnpm run index          # 重新生成 market/index.json
pnpm run validate:index # 用 @deepseek-ai/dsh-plugin-market-index 校验
```

## 许可

MIT
