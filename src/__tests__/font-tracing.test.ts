import { readFileSync, readdirSync, statSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import nextConfig from "../../next.config"

/**
 * I font sono file su disco, caricati da resvg per path assoluto
 * (`src/lib/fonts.ts`). Su Vercel il filesystem è PER ROUTE: una route che
 * rasterizza testo senza i font tracciati nella propria lambda non fallisce —
 * resvg rende trasparente — e il testo sparisce in silenzio. È successo a
 * /api/logo. Questo test tiene `outputFileTracingIncludes` allineato alle route
 * che arrivano davvero a `fonts.ts`, così la prossima non parte rotta.
 */

const SRC = path.join(process.cwd(), "src")

function readSource(file: string): string {
  return readFileSync(file, "utf8")
}

/** Import relativi e con alias `@/`, risolti al file sorgente. */
function resolveImports(file: string): string[] {
  const src = readSource(file)
  const out: string[] = []
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const spec = m[1]
    let base: string
    if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2))
    else if (spec.startsWith(".")) base = path.resolve(path.dirname(file), spec)
    else continue
    for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      try {
        if (statSync(cand).isFile()) { out.push(cand); break }
      } catch { /* non è questo */ }
    }
  }
  return out
}

/** Route API che raggiungono `fonts.ts` per una qualunque catena di import. */
function routesNeedingFonts(): string[] {
  const fontsFile = path.join(SRC, "lib", "fonts.ts")
  const needs = new Map<string, boolean>()

  const reaches = (file: string, seen: Set<string>): boolean => {
    if (file === fontsFile) return true
    if (seen.has(file)) return false
    seen.add(file)
    const cached = needs.get(file)
    if (cached !== undefined) return cached
    const hit = resolveImports(file).some((d) => reaches(d, seen))
    needs.set(file, hit)
    return hit
  }

  const routes: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === "route.ts" && reaches(full, new Set())) routes.push(full)
    }
  }
  walk(path.join(SRC, "app", "api"))
  return routes
}

/** `/api/logo/[type]/[id]/route.ts` → `/api/logo`. */
function routeUrl(file: string): string {
  const rel = path.relative(path.join(SRC, "app"), path.dirname(file))
  return `/${rel.split(path.sep).filter((s) => !s.startsWith("[") && !s.startsWith("(")).join("/")}`
}

describe("font tracing", () => {
  it("traces the fonts into every API route that rasterises text", () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {}
    const covered = Object.entries(includes)
      .filter(([, files]) => (files as string[]).some((f) => f.includes("assets/fonts")))
      .map(([glob]) => glob.replace(/\/\*\*\/\*$/, ""))

    const routes = routesNeedingFonts().map(routeUrl)
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(covered, `${route} rasterises SVG text but has no fonts traced into its lambda`).toContain(route)
    }
  })

  it("finds both routes we know rasterise text", () => {
    // Se questa asserzione cade, il crawler sopra ha smesso di vedere le
    // dipendenze e il test di sopra passerebbe a vuoto.
    const routes = routesNeedingFonts().map(routeUrl).sort()
    expect(routes).toContain("/api/poster")
    expect(routes).toContain("/api/logo")
  })
})
