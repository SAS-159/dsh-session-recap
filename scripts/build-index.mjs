#!/usr/bin/env node
/**
 * Build a format-1 plugin market index that lists this bundle.
 *
 * The result is a plain JSON document you can host anywhere over http(s) and
 * add as an "index source" in DSH's Plugins → Discover tab. Relative icon
 * references resolve against the index URL, so we inline the icon as a data:
 * URL to keep the document self-contained.
 *
 * Usage: node scripts/build-index.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const iconSvg = await readFile(join(root, 'icon.svg'))
const icon = 'data:image/svg+xml;base64,' + iconSvg.toString('base64')

const locales = {}
for (const language of ['en', 'zh']) {
  locales[language] = JSON.parse(await readFile(join(root, 'locale', `${language}.json`), 'utf8')).meta
}

const index = {
  format: 1,
  title: { en: 'Session recap', zh: '会话复盘卡' },
  description: {
    en: 'A single-bundle index for dsh-session-recap.',
    zh: '只收录 dsh-session-recap 的插件索引。',
  },
  metadata: {
    categories: {
      insight: { title: { en: 'Insights', zh: '洞察' } },
    },
    labels: {
      'local-only': { title: { en: 'Local only', zh: '纯本地' } },
    },
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: locales.en.title, zh: locales.zh.title },
      description: { en: locales.en.description, zh: locales.zh.description },
      icon,
      author: typeof pkg.author === 'string' ? pkg.author : undefined,
      metadata: {
        category: 'insight',
        keywords: pkg.keywords ?? [],
        labels: ['local-only'],
      },
      versions: [
        {
          version: pkg.version,
          publishTimestamp: Math.floor(Date.now() / 1000),
          source: { type: 'npm' },
        },
      ],
    },
  ],
}

// Drop undefined optional members so the document stays byte-for-byte stable.
const clean = JSON.parse(JSON.stringify(index))

const outDir = join(root, 'market')
await mkdir(outDir, { recursive: true })
const outFile = join(outDir, 'index.json')
await writeFile(outFile, JSON.stringify(clean, null, 2) + '\n', 'utf8')
console.log(`wrote ${outFile}`)
