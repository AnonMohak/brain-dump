import { useCallback, useEffect, useRef, useState } from 'react'

// The Web Speech API is not in the TypeScript DOM types yet.
type Recognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => Recognition

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Dictation with the browser speech API (Chrome and Edge).
 * Caution: these browsers send the audio to Google or Microsoft servers.
 */
export function useSpeech(onFinalText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const callbackRef = useRef(onFinalText)
  useEffect(() => {
    callbackRef.current = onFinalText
  }, [onFinalText])

  const supported = typeof window !== 'undefined' && getRecognition() !== null

  const stop = useCallback(() => recognitionRef.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = getRecognition()
    if (!Ctor) return
    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!
        if (result.isFinal) callbackRef.current(result[0].transcript.trim())
        else pending += result[0].transcript
      }
      setInterim(pending)
    }
    recognition.onerror = (event) => {
      setError(event.error === 'not-allowed' ? 'Microphone access was blocked.' : `Dictation error: ${event.error}`)
    }
    recognition.onend = () => {
      setListening(false)
      setInterim('')
      recognitionRef.current = null
    }
    setError(null)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  return { supported, listening, interim, error, start, stop }
}
