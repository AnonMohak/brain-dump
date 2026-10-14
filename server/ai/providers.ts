import type { Env } from '../env'
import { streamChatCompletion, type ProviderId, type StreamChunk } from './chat-stream'
import type { ChatMessage } from './prompt'

export const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const MAX_TOKENS = 24_000

/** One try with one provider. The organize loop runs these in order until one gives items. */
export type Attempt = {
  provider: ProviderId
  /** The main model of this try, for status messages. */
  model: string
  stream: (messages: ChatMessage[], signal: AbortSignal, fetchFn?: typeof fetch) => AsyncGenerator<StreamChunk>
}

function geminiAttempt(env: Env, apiKey: string): Attempt {
  const model = env.GEMINI_MODEL
  return {
    provider: 'gemini',
    model,
    stream: (messages, signal, fetchFn) =>
      streamChatCompletion({
        provider: 'gemini',
        url: GEMINI_URL,
        apiKey,
        body: {
          model,
          messages,
          temperature: 0.2,
          max_tokens: MAX_TOKENS,
          // Gemini 3 models cannot turn thinking off; "minimal" is the fastest level.
          ...(env.GEMINI_REASONING_EFFORT === 'default' ? {} : { reasoning_effort: env.GEMINI_REASONING_EFFORT }),
        },
        signal,
        fetch: fetchFn,
      }),
  }
}

function openRouterAttempt(env: Env, apiKey: string, models: string[]): Attempt {
  const [model, ...fallbacks] = models
  return {
    provider: 'openrouter',
    model: model!,
    stream: (messages, signal, fetchFn) =>
      streamChatCompletion({
        provider: 'openrouter',
        url: OPENROUTER_URL,
        apiKey,
        headers: { 'HTTP-Referer': 'http://localhost/sift', 'X-Title': 'Sift' },
        body: {
          model,
          // OpenRouter tries the next models itself when the first one fails.
          ...(fallbacks.length ? { models } : {}),
          messages,
          temperature: 0.2,
          max_tokens: MAX_TOKENS,
          reasoning:
            env.OPENROUTER_REASONING_EFFORT === 'none'
              ? { enabled: false }
              : { effort: env.OPENROUTER_REASONING_EFFORT },
        },
        signal,
        fetch: fetchFn,
      }),
  }
}

/**
 * The order of tries: Gemini first (when its key is set), then Nemotron Ultra
 * with Super as OpenRouter's own fallback, then Super alone.
 */
export function attemptPlan(env: Env): Attempt[] {
  const plan: Attempt[] = []
  if (env.GEMINI_API_KEY) plan.push(geminiAttempt(env, env.GEMINI_API_KEY))
  if (env.OPENROUTER_API_KEY) {
    const primary = env.OPENROUTER_MODEL
    const fallback = env.OPENROUTER_FALLBACK_MODEL
    if (!fallback || fallback === primary) {
      plan.push(openRouterAttempt(env, env.OPENROUTER_API_KEY, [primary]))
    } else {
      plan.push(openRouterAttempt(env, env.OPENROUTER_API_KEY, [primary, fallback]))
      plan.push(openRouterAttempt(env, env.OPENROUTER_API_KEY, [fallback]))
    }
  }
  return plan
}
