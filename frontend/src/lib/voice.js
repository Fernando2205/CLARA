import { getSpeechResponse, transcribeAudio } from './api'

let activeAudio = null
let activeObjectUrl = null
let activeSpeechController = null
let activeMediaSource = null

const LOW_CONFIDENCE_THRESHOLD = 0.8

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

export function listenOnce ({ onStart, onInterim, onFinal, onRefine, onError }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Recognition) {
    onError?.('Tu navegador no ofrece dictado. Puedes escribir el conteo.')
    return { supported: false, stop: () => {} }
  }

  const backup = startBackupRecorder()

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
  recognition.onerror = () => {
    backup?.discard()
    onError?.('No pude escuchar con claridad. Inténtalo otra vez o escribe el conteo.')
  }
  recognition.start()

  return {
    supported: true,
    stop: () => {
      backup?.discard()
      recognition.stop()
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
      activeAudio.onplay = () => callbacks.onStart?.('elevenlabs')
      activeAudio.onended = () => {
        callbacks.onEnd?.('elevenlabs')
        stopSpeaking()
      }
      activeAudio.onerror = () => {
        stopSpeaking()
        callbacks.onError?.()
      }
      await activeAudio.play()
      return 'elevenlabs'
    }

    activeMediaSource = new MediaSource()
    activeObjectUrl = URL.createObjectURL(activeMediaSource)
    activeAudio = new Audio(activeObjectUrl)
    activeAudio.onplay = () => callbacks.onStart?.('elevenlabs')
    activeAudio.onended = () => {
      callbacks.onEnd?.('elevenlabs')
      stopSpeaking()
    }
    activeAudio.onerror = () => {
      if (controller.signal.aborted) return
      stopSpeaking()
      callbacks.onError?.()
    }

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
    return 'elevenlabs'
  } catch {
    if (controller.signal.aborted) return 'stopped'
    callbacks.onError?.()
    return 'unavailable'
  }
}
