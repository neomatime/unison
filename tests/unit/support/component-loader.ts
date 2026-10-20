import { existsSync, readFileSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

// Lets a node --test file import a .tsx component and render it with react-dom/server, with no new dependency:
//
// - a .tsx file is compiled by the TypeScript compiler the repo already has (JSX to react/jsx-runtime calls);
// - '@/...' resolves to the repo root, as tsconfig's paths say, and a relative import without an extension finds its
//   .ts or .tsx file, as the Next bundler does;
// - a specifier named in `stubs` is replaced by the module source given for it, for what cannot load outside Next
//   (next/navigation, the server actions and what they import).
//
// The hooks are process-wide, and node --test runs each test file in its own process, so they reach no other file.

const ROOT = pathToFileURL(`${process.cwd()}/`)
const SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx']
const STUB = 'stub:'

const isFile = (url: URL) => existsSync(fileURLToPath(url)) && statSync(fileURLToPath(url)).isFile()

function findSource(base: URL): string | null {
  if (isFile(base)) return base.href
  for (const suffix of SUFFIXES) {
    const candidate = new URL(`${base.href}${suffix}`)
    if (isFile(candidate)) return candidate.href
  }
  return null
}

export function installComponentLoader(stubs: Record<string, string> = {}): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (Object.hasOwn(stubs, specifier)) return { url: `${STUB}${specifier}`, shortCircuit: true }
      const local = specifier.startsWith('@/')
        ? new URL(specifier.slice(2), ROOT)
        : specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !context.parentURL.includes('/node_modules/')
          ? new URL(specifier, context.parentURL)
          : null
      const found = local ? findSource(local) : null
      return found ? { url: found, shortCircuit: true } : nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      if (url.startsWith(STUB)) return { format: 'module', source: stubs[url.slice(STUB.length)], shortCircuit: true }
      if (url.endsWith('.tsx')) {
        const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
          fileName: fileURLToPath(url),
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
        })
        return { format: 'module', source: outputText, shortCircuit: true }
      }
      return nextLoad(url, context)
    },
  })
}
