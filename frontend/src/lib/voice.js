import { getSpeechResponse, transcribeAudio } from './api.js'

let activeAudio = null
let activeObjectUrl = null
let activeSpeechController = null
let activeMediaSource = null

const LOW_CONFIDENCE_THRESHOLD = 0.8
const PREFERRED_SPANISH_VOICES = [
  'Mónica',
  'Monica',
  'Paulina',
  'Luciana',
  'Google español',
  'Microsoft Helena',
  'Microsoft Elvira',
]

function startBackupRecorder () {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return null

  const state = { chunks: [], stream: null, recorder: null, ready: null }
  state.ready = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    state.stream = stream
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) state.chunks.push(event.data)
    }
    recorder.start()
    state.recorder = recorder
    return recorder
  }).catch(() => null)

  return {
    async stopAndGetBlob () {
      await state.ready
      const recorder = state.recorder
      state.stream?.getTracks().forEach((track) => track.stop())
      if (!recorder || recorder.state === 'inactive') return null
      return new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(state.chunks, { type: recorder.mimeType || 'audio/webm' }))
        recorder.stop()
      })
    },
    discard () {
      state.ready.then(() => {
        state.stream?.getTracks().forEach((track) => track.stop())
      })
    },
  }
}

export function listenOnce ({ onStart, onInterim, onFinal, onRefine, onError, onEnd }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) {
    onError?.('Tu navegador no ofrece dictado. Puedes escribir el conteo.')
    return { supported: false, stop: () => {} }
  }

  const backup = startBackupRecorder()
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
    const confidence = result[0].confidence
    if (!backup) return
    if (confidence >= LOW_CONFIDENCE_THRESHOLD) {
      backup.discard()
      return
    }
    // Confianza baja del reconocimiento nativo: reintentamos en segundo
    // plano con Whisper y, si trae texto distinto, lo ofrecemos como ajuste.
    backup.stopAndGetBlob().then((blob) => {
      if (!blob || blob.size === 0) return null
      return transcribeAudio(blob)
    }).then((result) => {
      const refined = result?.texto?.trim()
      if (refined && refined.toLowerCase() !== text.trim().toLowerCase()) {
        onRefine?.(refined)
      }
    }).catch(() => {
      // Sin conexión o backend caído: nos quedamos con la transcripción local.
    })
  }
  recognition.onerror = (event) => {
    backup?.discard()
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
      backup?.discard()
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
