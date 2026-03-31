import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { context as createEsbuildContext, build as esbuildBuild } from 'esbuild'
import vue from '@vitejs/plugin-vue'
import { build as viteBuild } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..')
const distDir = resolve(rootDir, 'dist')
const watchMode = process.argv.includes('--watch')

function resolveFromRoot(...segments) {
  return resolve(rootDir, ...segments)
}

function createSidepanelBuildOptions() {
  return {
    configFile: false,
    base: './',
    root: rootDir,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolveFromRoot('src'),
      },
    },
    define: {
      'import.meta.env.VITE_BOAT_SEARCH_EXTENSION_DEFAULT_API_KEY': JSON.stringify(
        process.env.BOAT_SEARCH_EXTENSION_DEFAULT_API_KEY || '',
      ),
      'import.meta.env.VITE_BOAT_SEARCH_EXTENSION_DEFAULT_APP_BASE_URL': JSON.stringify(
        process.env.BOAT_SEARCH_EXTENSION_DEFAULT_APP_BASE_URL || '',
      ),
    },
    build: {
      outDir: distDir,
      emptyOutDir: false,
      ...(watchMode ? { watch: {} } : {}),
      rollupOptions: {
        input: {
          sidepanel: resolveFromRoot('sidepanel.html'),
        },
        output: {
          entryFileNames: 'sidepanel.js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  }
}

function createScriptBuildOptions(entryPoint, outfile, format) {
  return {
    absWorkingDir: rootDir,
    bundle: true,
    format,
    outfile: resolveFromRoot('dist', outfile),
    platform: 'browser',
    target: ['chrome114'],
    entryPoints: [resolveFromRoot(entryPoint)],
    tsconfig: resolveFromRoot('tsconfig.json'),
  }
}

async function prepareDist() {
  await rm(distDir, { recursive: true, force: true })
  await mkdir(distDir, { recursive: true })
  const manifestPath = resolveFromRoot('manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  const distManifest = {
    ...manifest,
    background: {
      ...manifest.background,
      service_worker: String(manifest.background.service_worker).replace(/^dist\//, ''),
    },
    side_panel: {
      ...manifest.side_panel,
      default_path: String(manifest.side_panel.default_path).replace(/^dist\//, ''),
    },
    content_scripts: manifest.content_scripts.map((entry) => ({
      ...entry,
      js: entry.js.map((file) => String(file).replace(/^dist\//, '')),
    })),
  }

  await writeFile(
    resolveFromRoot('dist', 'manifest.json'),
    `${JSON.stringify(distManifest, null, 2)}\n`,
  )
}

async function buildScripts() {
  await esbuildBuild(createScriptBuildOptions('src/background/index.ts', 'background.js', 'esm'))
  await esbuildBuild(createScriptBuildOptions('src/content/index.ts', 'content.js', 'iife'))
}

async function watchScripts() {
  const background = await createEsbuildContext(
    createScriptBuildOptions('src/background/index.ts', 'background.js', 'esm'),
  )
  const content = await createEsbuildContext(
    createScriptBuildOptions('src/content/index.ts', 'content.js', 'iife'),
  )

  await Promise.all([background.watch(), content.watch()])
}

await prepareDist()

if (watchMode) {
  await Promise.all([viteBuild(createSidepanelBuildOptions()), watchScripts()])
  await new Promise(() => {})
} else {
  await Promise.all([viteBuild(createSidepanelBuildOptions()), buildScripts()])
}
