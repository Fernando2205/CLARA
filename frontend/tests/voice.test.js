import test from 'node:test'
import assert from 'node:assert/strict'

test('la voz no termina hasta que finaliza la reproducción del audio', async () => {
  const originalWindow = globalThis.window
  const originalAudio = globalThis.Audio
  const originalFetch = globalThis.fetch
  const originalCreateObjectURL = globalThis.URL.createObjectURL
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL
  let audio = null

  class AudioMock {
    constructor () {
      audio = this
      this.currentTime = 0
    }

    play () {
      this.onplay?.()
      return Promise.resolve()
    }

    pause () {}
  }

  globalThis.window = {
    setTimeout,
    clearTimeout,
    MediaSource: null,
    speechSynthesis: { cancel: () => {} },
  }
  globalThis.Audio = AudioMock
  globalThis.fetch = async () => ({
    ok: true,
    body: null,
    blob: async () => new Blob(['audio'], { type: 'audio/mpeg' }),
  })
  globalThis.URL.createObjectURL = () => 'blob:clara-test'
  globalThis.URL.revokeObjectURL = () => {}

  try {
    const { speakNatural } = await import('../src/lib/voice.js')
    const events = []
    let finished = false
    const playback = speakNatural('Siguiente producto', {
      onStart: () => events.push('start'),
      onEnd: () => events.push('end'),
    }).then((result) => {
      finished = true
      return result
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.ok(audio)
    assert.equal(finished, false)
    assert.deepEqual(events, ['start'])

    audio.onended()
    assert.equal(await playback, 'elevenlabs')
    assert.equal(finished, true)
    assert.deepEqual(events, ['start', 'end'])
  } finally {
    globalThis.window = originalWindow
    globalThis.Audio = originalAudio
    globalThis.fetch = originalFetch
    globalThis.URL.createObjectURL = originalCreateObjectURL
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL
  }
})

test('usa la voz española del dispositivo si el servicio natural no está disponible', async () => {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const spoken = []

  class UtteranceMock {
    constructor (text) {
      this.text = text
    }
  }

  globalThis.window = {
    setTimeout,
    clearTimeout,
    SpeechSynthesisUtterance: UtteranceMock,
    speechSynthesis: {
      cancel: () => {},
      getVoices: () => [{
        name: 'Mónica',
        lang: 'es-ES',
        localService: true,
      }],
      speak: (utterance) => {
        spoken.push(utterance)
        utterance.onstart?.()
        utterance.onend?.()
      },
    },
  }
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ detail: 'Voz natural no disponible' }),
  })

  try {
    const { speakNatural } = await import('../src/lib/voice.js')
    const events = []
    const result = await speakNatural('Siguiente: champiñón cortado.', {
      onStart: (source) => events.push(`start:${source}`),
      onEnd: (source) => events.push(`end:${source}`),
    })
    assert.equal(result, 'device')
    assert.equal(spoken[0].text, 'Siguiente: champiñón cortado.')
    assert.equal(spoken[0].voice.name, 'Mónica')
    assert.deepEqual(events, ['start:device', 'end:device'])
  } finally {
    globalThis.window = originalWindow
    globalThis.fetch = originalFetch
  }
})
