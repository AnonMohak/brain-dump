const MAX_FILE_BYTES = 100 * 1024

/** Reads a dropped or picked .txt / .md file. Throws a readable error for other files. */
export async function readTextFile(file: File): Promise<string> {
  const okType = /\.(txt|md|markdown)$/i.test(file.name) || file.type.startsWith('text/')
  if (!okType) throw new Error('Only .txt and .md files can be loaded.')
  if (file.size > MAX_FILE_BYTES) throw new Error('The file is larger than 100 KB.')
  return (await file.text()).trim()
}
