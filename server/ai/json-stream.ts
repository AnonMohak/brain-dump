/**
 * Finds complete top-level JSON objects in streamed model text.
 *
 * The prompt asks for JSON Lines (one object per line). Models sometimes add
 * code fences, wrap the lines in an array, or pretty-print an object over many
 * lines. This scanner counts braces outside of strings, so all of these work,
 * and each object is ready as soon as its closing brace arrives.
 */
export function createObjectScanner() {
  let depth = 0
  let inString = false
  let escaped = false
  let current = ''

  function feed(chunk: string): string[] {
    const found: string[] = []
    for (const char of chunk) {
      if (depth === 0) {
        // Text between objects: fences, commas, brackets, commentary.
        if (char === '{') {
          depth = 1
          current = '{'
        }
        continue
      }

      current += char
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }

      if (char === '"') inString = true
      else if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          found.push(current)
          current = ''
        }
      }
    }
    return found
  }

  /** True when the stream ended inside an unfinished object. */
  function hasPartial(): boolean {
    return depth > 0
  }

  return { feed, hasPartial }
}

/** JSON.parse that returns undefined instead of throwing. */
export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
