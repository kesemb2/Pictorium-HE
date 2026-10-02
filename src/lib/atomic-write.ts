import { promises as fsp } from "node:fs"

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

/**
 * Scrittura file atomica: tmp nella STESSA directory del target (stesso
 * filesystem → rename atomica) + rename. Su EXDEV (HF Storage FUSE con mount
 * diversi) fallback copy+unlink, come già in store.ts/flixpatrol.ts.
 * `mode` opzionale per preservare 0o600 sui file di segreti.
 */
export async function atomicWriteFile(
  filePath: string,
  data: string | Uint8Array,
  options?: { mode?: number },
): Promise<void> {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  await fsp.writeFile(tmp, data, options ?? {})
  try {
    await fsp.rename(tmp, filePath)
  } catch (e) {
    if (isNodeError(e) && e.code === "EXDEV") {
      await fsp.copyFile(tmp, filePath)
      await fsp.unlink(tmp).catch(() => {})
    } else {
      await fsp.unlink(tmp).catch(() => {})
      throw e
    }
  }
}
