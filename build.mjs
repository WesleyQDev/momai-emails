import { build, context } from 'esbuild'
import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))

const entries = []
if (manifest.ui?.page && existsSync(path.join(__dirname, 'src/page.tsx'))) {
  entries.push({ in: 'src/page.tsx', out: 'page' })
}

if (entries.length === 0) {
  console.log('[momai-emails:build] No UI entries in manifest. Nothing to do.')
  process.exit(0)
}

mkdirSync(path.join(__dirname, 'dist'), { recursive: true })

const makeHostGlobalsPlugin = {
  name: 'make-host-globals',
  setup(build) {
    const mapGlobal = (filter, globalName, namespace) => {
      build.onResolve({ filter }, (args) => {
        return { path: args.path, namespace }
      })
      build.onLoad({ filter, namespace }, () => {
        return {
          contents: `module.exports = ${globalName};`,
          loader: 'js'
        }
      })
    }
    mapGlobal(/^react$/, 'window.React', 'react-global')
    mapGlobal(/^react-dom$/, 'window.ReactDOM', 'react-dom-global')
    mapGlobal(/^react\/jsx-runtime$/, 'window.JSXRuntime', 'react-jsx-runtime-global')
    mapGlobal(/^momai:sdk$/, 'window.MomAISDK', 'sdk-global')
  }
}

// Locate MomAI renderer source
let momaiSrcDir = path.resolve(__dirname, '../../../../src/renderer/src')
if (!existsSync(momaiSrcDir)) {
  momaiSrcDir = path.resolve(__dirname, '../momai/apps/momai/src/renderer/src')
}
if (!existsSync(momaiSrcDir)) {
  momaiSrcDir = path.resolve(__dirname, '../../momai/apps/momai/src/renderer/src')
}

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: entries.map((e) => ({ in: e.in, out: e.out })),
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'react',
  target: 'es2022',
  platform: 'browser',
  minify: process.env.NODE_ENV === 'production',
  sourcemap: true,
  outdir: 'dist',
  logLevel: 'info',
  nodePaths: [path.join(__dirname, 'node_modules')],
  plugins: [makeHostGlobalsPlugin],
  alias: {
    'momai:registry': path.resolve(momaiSrcDir, 'components/chat/SkillResponseRegistry.ts'),
    'momai:events': path.resolve(momaiSrcDir, 'hooks/useExtensionEvents.ts'),
    'momai:api': path.resolve(momaiSrcDir, 'services/api.ts'),
    'momai:constants': path.resolve(momaiSrcDir, 'constants.ts')
  }
}

if (process.argv.includes('--watch')) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('[momai-emails:build] Watching for changes...')
} else {
  await build(options)
  console.log('[momai-emails:build] Built →', entries.map((e) => e.out + '.js').join(', '))
}
