import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
const version = pkg.version
const zipName = `momai-emails-v${version}.zip`

console.log(`[package] Empacotando MomAI E-mails v${version}...`)

// 1. Build UI
console.log('[package] Buildando UI...')
execSync('node build.mjs', { cwd: rootDir, stdio: 'inherit' })

// 2. Prune dev dependencies
console.log('[package] Limpando devDependencies (pnpm prune --prod)...')
execSync('pnpm prune --prod', { cwd: rootDir, stdio: 'inherit' })

// 3. Compactar arquivos necessários
console.log('[package] Compactando ZIP final...')
const items = [
  'manifest.json',
  'README.md',
  'SKILL.md',
  'AUTOMATION.md',
  'package.json',
  'runtime.ts',
  'runtime-shim.d.ts',
  'account-manager.ts',
  'email-client.ts',
  'providers-data.ts',
  'secure-storage-bridge.ts',
  'icon.svg',
  'dist',
  'node_modules'
].join(',')

const psCmd = `Compress-Archive -Path ${items} -DestinationPath ${zipName} -Force`
execSync(`powershell -NoProfile -Command "${psCmd}"`, { cwd: rootDir, stdio: 'inherit' })

// 4. Calcular SHA256 e tamanho
const zipBuf = fs.readFileSync(path.join(rootDir, zipName))
const hash = crypto.createHash('sha256').update(zipBuf).digest('hex')
const sizeMB = (zipBuf.length / (1024 * 1024)).toFixed(2)

console.log(`\n✅ Pacote gerado com sucesso!`)
console.log(`📦 Arquivo:  ${zipName}`)
console.log(`📊 Tamanho:  ${sizeMB} MB`)
console.log(`🔒 SHA256:   ${hash}\n`)

// 5. Restore full dev dependencies for ongoing local work
console.log('[package] Restaurando dependências de desenvolvimento (pnpm install)...')
execSync('pnpm install', { cwd: rootDir, stdio: 'inherit' })
