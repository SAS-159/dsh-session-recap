/**
 * The catalog entry for awesome-dsh-plugin, shared by both release paths.
 *
 * Shape follows contributing.md: `url`, `name`, `category`, bilingual
 * `description`, optional GitHub-hosted raster `icon`. A hand-written `npm:`
 * key is rejected by their CI, so it is deliberately absent.
 */

export function buildEntry(owner, packageName) {
  const description = {
    en: 'Adds a recap card under the composer for the current session: turns, steps, tool calls grouped by name, the uncached / cache-read / cache-write / output token split, the cache-hit rate, and a cost range computed from the official Flash off-peak and peak list prices. Exports the same card as Markdown or a standalone HTML page.',
    zh: '在输入框下方为当前会话生成复盘卡：轮次、步数、按名称聚合的工具调用、未缓存 / 缓存读 / 缓存写 / 输出四段 Token、缓存命中率，以及按官网 Flash 峰谷挂牌价折算的花费区间；同一张卡可导出为 Markdown 或独立 HTML。',
  }
  const lines = [
    `url: https://github.com/${owner}/${packageName}`,
    `name: ${owner}/${packageName}`,
    'category: usage',
    'description:',
    `  en: '${description.en}'`,
    `  zh: '${description.zh}'`,
    `icon: https://raw.githubusercontent.com/${owner}/${packageName}/main/assets/icon-180.png`,
    '',
  ]
  return lines.join('\n')
}

export function buildPullRequestBody(owner, packageName) {
  return [
    `Adds ${owner}/${packageName} to the **Usage & Billing** category.`,
    '',
    '**What it does.** A composer-dock entry renders a recap card for the current session: turns, steps, duration, tool calls grouped by name, the uncached / cache-read / cache-write / output token split, the cache-hit rate, and a cost **range** computed from the official Flash off-peak and peak list prices. The same card exports as Markdown or a standalone HTML page.',
    '',
    '**Capabilities:** none. It is a client-only bundle — no filesystem, network, shell, environment, credentials, or LLM access. It reads the projections and Chat snapshot the page already holds for the open session and renders them locally.',
    '',
    '**Manifest:** `package.json` declares `dsh.bundle.patch` with `cordis.patch.yml` at the root, plus `dsh.client` for the browser half. Installable with `dsh plugin --profile web add github:' + owner + '/' + packageName + '`.',
    '',
    '**Numbers in this entry:** the four token buckets, the cache-hit rate and the cost range are all computed in `client.js`; the price constants are the published Flash rates (cache hit 0.003/0.006, cache miss 0.15/0.3, output 0.6/1.2 USD per 1M tokens, off-peak/peak).',
  ].join('\n')
}

export function entryFileName(owner, packageName) {
  return `${owner}__${packageName}.yml`
}
