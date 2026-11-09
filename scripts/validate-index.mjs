#!/usr/bin/env node
/**
 * Validate market/index.json with the same validator DSH uses.
 *
 * Usage: node scripts/validate-index.mjs [indexUrl]
 *
 * `indexUrl` only provides the base for relative icon/title resolution; it
 * does not fetch anything. Default: http://127.0.0.1:8788/index.json
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseMarketIndex, marketInstallTarget, MarketIndexError } from '@deepseek-ai/dsh-plugin-market-index'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const indexUrl = process.argv[2] ?? 'http://127.0.0.1:8788/index.json'
const document = JSON.parse(await readFile(join(root, 'market', 'index.json'), 'utf8'))

try {
  const index = parseMarketIndex(document, indexUrl)
  console.log(`ok: ${index.plugins.length} plugin(s), title ${JSON.stringify(index.title)}`)
  for (const plugin of index.plugins) {
    console.log(`  ${plugin.name}  versions: ${plugin.versions.map((version) => version.version).join(', ')}`)
    for (const version of plugin.versions) {
      const target = marketInstallTarget(plugin.name, version)
      console.log(`    install: ${target.spec}${target.registry === undefined ? '' : `  registry: ${target.registry}`}`)
    }
  }
} catch (error) {
  if (error instanceof MarketIndexError) {
    console.error(`invalid index: ${error.path} ${error.reason}`)
    process.exit(1)
  }
  throw error
}
