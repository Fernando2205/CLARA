import { getSpeechResponse } from './api.js'

let activeAudio = null
let activeObjectUrl = null
let activeSpeechController = null
let activeMediaSource = null

const PREFERRED_SPANISH_VOICES = [
  'Mónica',
  'Monica',
  'Paulina',
  'Luciana',
  'Google español',
  'Microsoft Helena',
  'Microsoft Elvira',
]

// Nota: hubo un intento de reforzar la transcripción de baja confianza con
// Whisper en segundo plano (grabar con MediaRecorder + /transcribe) y
// ofrecer el resultado vía `onRefine`. Se quitó: al reprocesar la frase
// automáticamente duplicaba la respuesta hablada de Clara, sin una forma
// confiable de saber si la primera pasada ya había hablado. Si el
// reconocimiento nativo falla, el usuario simplemente repite la frase.
export function listenOnce ({ onStart, onInterim, onFinal, onError, onEnd }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) {
    onError?.('Tu navegador no ofrece dictado. Puedes escribir el conteo.')
    return { supported: false, stop: () => {} }
  }

  let hadFinalResult = false
  let stoppedByUser = false

  const recognition = new Recognition()
  recognition.lang = 'es-CO'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.onstart = () => onStart?.()
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1]
    const text = result[0].transcript
    if (!result.isFinal) {
      onInterim?.(text)
      return
    }
    hadFinalResult = true
    onFinal?.(text)
  }
  recognition.onerror = (event) => {
    const message = event.error === 'no-speech'
      ? 'No escuché ninguna instrucción.'
      : 'No pude escuchar con claridad. Inténtalo otra vez o escribe el conteo.'
    onError?.(message, event.error)
  }
  recognition.onend = () => onEnd?.({
    hadFinalResult,
    stoppedByUser,
  })
  recognition.start()

  return {
    supported: true,
    stop: () => {
      stoppedByUser = true
      try {
        recognition.stop()
      } catch {
        // El navegador ya cerró este turno de escucha.
      }
    },
  }
}

export function stopSpeaking () {
  activeSpeechController?.abort()
  activeSpeechController = null
  window.speechSynthesis?.cancel()
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.currentTime = 0
    activeAudio = null
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl)
    activeObjectUrl = null
  }
  activeMediaSource = null
}

function waitForPlayback (audio, controller, callbacks) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      controller.signal.removeEventListener('abort', handleAbort)
      resolve(result)
    }
    const handleAbort = () => finish('stopped')

    controller.signal.addEventListener('abort', handleAbort, { once: true })
    audio.onplay = () => callbacks.onStart?.('elevenlabs')
    audio.onended = () => {
      callbacks.onEnd?.('elevenlabs')
      finish('elevenlabs')
      stopSpeaking()
    }
    audio.onerror = () => {
      if (!controller.signal.aborted) callbacks.onError?.()
      finish(controller.signal.aborted ? 'stopped' : 'unavailable')
      stopSpeaking()
    }
  })
}

async function getSpanishVoice () {
  const synthesis = window.speechSynthesis
  if (!synthesis?.getVoices) return null
  let voices = synthesis.getVoices()
  if (!voices.length) {
    voices = await new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(synthesis.getVoices()), 600)
      synthesis.addEventListener?.('voiceschanged', () => {
        window.clearTimeout(timer)
        resolve(synthesis.getVoices())
      }, { once: true })
    })
  }
  const spanishVoices = voices.filter((voice) => voice.lang?.toLowerCase().startsWith('es'))
  return spanishVoices.sort((left, right) => {
    const score = (voice) => {
      const preferredIndex = PREFERRED_SPANISH_VOICES.findIndex((name) => (
        voice.name.toLowerCase().includes(name.toLowerCase())
      ))
      return (
        (voice.lang?.toLowerCase() === 'es-co' ? 100 : 0) +
        (preferredIndex >= 0 ? 80 - preferredIndex : 0) +
        (voice.localService ? 5 : 0)
      )
    }
    return score(right) - score(left)
  })[0] || voices[0] || null
}

async function speakWithDeviceVoice (text, controller, callbacks) {
  const synthesis = window.speechSynthesis
  const Utterance = window.SpeechSynthesisUtterance
  if (!synthesis?.speak || !Utterance || controller.signal.aborted) {
    callbacks.onError?.()
    return 'unavailable'
  }

  const voice = await getSpanishVoice()
  if (controller.signal.aborted) return 'stopped'
  return await new Promise((resolve) => {
    let settled = false
    const utterance = new Utterance(text)
    const finish = (result) => {
      if (settled) return
      settled = true
      controller.signal.removeEventListener('abort', handleAbort)
      resolve(result)
    }
    const handleAbort = () => {
      synthesis.cancel()
      finish('stopped')
    }

    utterance.lang = voice?.lang || 'es-CO'
    utterance.voice = voice
    utterance.rate = 1.02
    utterance.pitch = 0.96
    utterance.volume = 1
    utterance.onstart = () => callbacks.onStart?.('device')
    utterance.onend = () => {
      callbacks.onEnd?.('device')
      finish('device')
    }
    utterance.onerror = () => {
      if (!controller.signal.aborted) callbacks.onError?.()
      finish(controller.signal.aborted ? 'stopped' : 'unavailable')
    }
    controller.signal.addEventListener('abort', handleAbort, { once: true })
    synthesis.cancel()
    synthesis.speak(utterance)
  })
}

export async function speakNatural (text, callbacks = {}) {
  stopSpeaking()
  const controller = new AbortController()
  activeSpeechController = controller
  try {
    const response = await getSpeechResponse(text, controller.signal)
    const canStream = (
      response.body &&
      window.MediaSource &&
      window.MediaSource.isTypeSupported('audio/mpeg')
    )
    if (!canStream) {
      const audioBlob = await response.blob()
      if (controller.signal.aborted) return 'stopped'
      activeObjectUrl = URL.createObjectURL(audioBlob)
      activeAudio = new Audio(activeObjectUrl)
      const playbackFinished = waitForPlayback(activeAudio, controller, callbacks)
      await activeAudio.play()
      return await playbackFinished
    }

    activeMediaSource = new MediaSource()
    activeObjectUrl = URL.createObjectURL(activeMediaSource)
    activeAudio = new Audio(activeObjectUrl)
    const playbackFinished = waitForPlayback(activeAudio, controller, callbacks)

    await new Promise((resolve, reject) => {
      activeMediaSource.addEventListener('sourceopen', resolve, { once: true })
      activeMediaSource.addEventListener('error', reject, { once: true })
    })
    if (controller.signal.aborted) return 'stopped'

    const sourceBuffer = activeMediaSource.addSourceBuffer('audio/mpeg')
    const reader = response.body.getReader()
    let started = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength || controller.signal.aborted) continue
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          sourceBuffer.removeEventListener('updateend', handleUpdate)
          sourceBuffer.removeEventListener('error', handleError)
        }
        const handleUpdate = () => {
          cleanup()
          resolve()
        }
        const handleError = (error) => {
          cleanup()
          reject(error)
        }
        sourceBuffer.addEventListener('updateend', handleUpdate, { once: true })
        sourceBuffer.addEventListener('error', handleError, { once: true })
        sourceBuffer.appendBuffer(value)
      })
      if (!started) {
        started = true
        await activeAudio.play()
      }
    }
    if (activeMediaSource.readyState === 'open' && !sourceBuffer.updating) {
      activeMediaSource.endOfStream()
    }
    if (!started) throw new Error('La respuesta de voz llegó vacía.')
    return await playbackFinished
  } catch {
    if (controller.signal.aborted) return 'stopped'
    return await speakWithDeviceVoice(text, controller, callbacks)
  }
}
