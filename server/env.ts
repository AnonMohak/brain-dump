import { z } from 'zod'

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().default('gemini-3.8-flash')),
  GEMINI_REASONING_EFFORT: z.preprocess(
    emptyToUndefined,
    z.enum(['default', 'none', 'minimal', 'low', 'medium', 'high']).default('minimal'),
  ),
  OPENROUTER_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  OPENROUTER_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().default('nvidia/nemotron-3-ultra-550b-a55b:free'),
  ),
  OPENROUTER_FALLBACK_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().default('nvidia/nemotron-3-super-120b-a12b:free'),
  ),
  OPENROUTER_REASONING_EFFORT: z.preprocess(
    emptyToUndefined,
    z.enum(['none', 'low', 'medium', 'high']).default('none'),
  ),
  HOST: z.preprocess(emptyToUndefined, z.string().default('127.0.0.1')),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(3001)),
  DATABASE_PATH: z.preprocess(emptyToUndefined, z.string().default('./data/sift.db')),
  APP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid .env values:\n${issues}`)
  }
  return result.data
}
