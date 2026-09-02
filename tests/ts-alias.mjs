// Resolve the "@/*" tsconfig path alias when running .mts tests under
// `node --test --experimental-strip-types` (node has no tsconfig-paths support).
// Usage: node --test --experimental-strip-types --import ./tests/ts-alias.mjs tests/xxx.test.mts
import { register } from 'node:module'

const root = new URL('../', import.meta.url).href

register('data:text/javascript,' + encodeURIComponent(`
  const root = ${JSON.stringify(root)}
  const exts = ['.ts', '.tsx', '/index.ts', '']
  export async function resolve(spec, ctx, next) {
    if (!spec.startsWith('@/')) return next(spec, ctx)
    const base = new URL(spec.slice(2), root).href
    for (const e of exts) { try { return await next(base + e, ctx) } catch {} }
    return next(base, ctx)
  }
`))
