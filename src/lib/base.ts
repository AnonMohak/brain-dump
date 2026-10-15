/**
 * The path where Sift lives: "/" locally, "/sift/" on me-momo.co.in.
 * Vite sets it from BASE_PATH at build time (see vite.config.ts).
 */
export const BASE = import.meta.env.BASE_URL

/** The full URL of an API path, for example apiUrl('/items') -> "/sift/api/items". */
export const apiUrl = (path: string) => `${BASE}api${path}`
