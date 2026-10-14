import type { TextEvent, TextMode } from '@shared/events'
import { useCallback, useEffect, useRef, useState } from 'react'
import { postStream } from '@/lib/sse'

export type AiTextState = {
  phase: 'idle' | 'thinking' | 'writing' | 'done' | 'error'
  text: string
  model: string | null
  error: string | null
}

const IDLE: AiTextState = { phase: 'idle', text: '', model: null, error: null }

/** Streams a short AI answer about the board (Plan my day, Ask the board). */
export function useAiText() {
  const [state, setState] = useState<AiTextState>(IDLE)
  const controllerRef = useRef<AbortController | null>(null)

  const run = useCallback(async (mode: TextMode, question?: string) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ ...IDLE, phase: 'thinking' })
    const onEvent = (event: TextEvent) => {
      if (event.type === 'status') setState((s) => ({ ...s, model: event.model }))
      if (event.type === 'text') setState((s) => ({ ...s, phase: 'writing', text: s.text + event.delta }))
      if (event.type === 'done') setState((s) => ({ ...s, phase: 'done', model: event.model }))
      if (event.type === 'error') setState((s) => ({ ...s, phase: 'error', error: event.message }))
    }
    try {
      await postStream<TextEvent>(
        '/ai/text',
        {
          mode,
          question,
          now: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        onEvent,
        controller.signal,
      )
    } catch (error) {
      if (!controller.signal.aborted) {
        setState((s) => ({ ...s, phase: 'error', error: (error as Error).message }))
      }
    } finally {
      setState((s) => (s.phase === 'thinking' || s.phase === 'writing' ? { ...s, phase: 'done' } : s))
    }
  }, [])

  // Stop the stream when the component goes away.
  useEffect(() => () => controllerRef.current?.abort(), [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    setState(IDLE)
  }, [])

  return { state, run, reset }
}
