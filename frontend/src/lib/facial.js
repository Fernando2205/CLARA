import * as faceapi from 'face-api.js'

const MODELS_URL = '/models'
const STORAGE_KEY = 'clara_faces'
const MATCH_DISTANCE = 0.5
const ENROLL_FRAMES = 3
const ENROLL_INTERVAL_MS = 350

let modelsLoaded = null

// Carga los pesos de face-api.js una sola vez. El reconocimiento corre
// siempre en el dispositivo: ninguna imagen ni descriptor sale de aquí.
export function loadModels() {
  if (!modelsLoaded) {
    modelsLoaded = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
    ]).catch((err) => {
      // Si la carga falla (red, 404, etc.) no dejamos la promesa rechazada
      // en caché para siempre: el próximo intento vuelve a pedir los pesos.
      modelsLoaded = null
      throw err
    })
  }
  return modelsLoaded
}

function readGallery() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeGallery(gallery) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(gallery))
}

async function detectDescriptor(videoEl) {
  const result = await faceapi
    .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor()
  return result ? Array.from(result.descriptor) : null
}

function averageDescriptors(descriptors) {
  const length = descriptors[0].length
  const sum = new Array(length).fill(0)
  for (const descriptor of descriptors) {
    for (let i = 0; i < length; i += 1) sum[i] += descriptor[i]
  }
  return sum.map((value) => value / descriptors.length)
}

function euclideanDistance(a, b) {
  let total = 0
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i]
    total += diff * diff
  }
  return Math.sqrt(total)
}

// Captura ENROLL_FRAMES cuadros del video y promedia sus descriptores.
// No persiste nada todavía: útil cuando el usuario aún no existe en el
// backend (pantalla de registro) y el guardado debe esperar a tener su id real.
export async function captureDescriptor(videoEl) {
  await loadModels()
  const descriptors = []
  for (let i = 0; i < ENROLL_FRAMES; i += 1) {
    const descriptor = await detectDescriptor(videoEl)
    if (!descriptor) throw new Error('No detectamos tu rostro. Acércate a la cámara e inténtalo de nuevo.')
    descriptors.push(descriptor)
    if (i < ENROLL_FRAMES - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, ENROLL_INTERVAL_MS))
    }
  }
  return averageDescriptors(descriptors)
}

// Guarda un descriptor ya calculado en la galería local, junto con los
// datos del usuario (para poder iniciar sesión sin volver a llamar al backend).
export function saveToGallery(descriptor, usuario) {
  const gallery = readGallery().filter((entry) => entry.usuario.id !== usuario.id)
  gallery.push({ descriptor, usuario })
  writeGallery(gallery)
}

// Atajo: captura y guarda en un solo paso (para enrolar un usuario que
// ya existe, p. ej. desde el Perfil).
export async function enroll(videoEl, usuario) {
  const descriptor = await captureDescriptor(videoEl)
  saveToGallery(descriptor, usuario)
}

// Compara el rostro actual contra la galería local. Retorna un resultado
// discriminado para que la UI pueda distinguir "no hay rostro en cámara"
// (dispara el temporizador de 5s) de "hay rostro pero no coincide"
// (cuenta como fallo de reconocimiento).
export async function identify(videoEl) {
  await loadModels()
  const descriptor = await detectDescriptor(videoEl)
  if (!descriptor) return { status: 'no_face' }

  const gallery = readGallery()
  let best = null
  let bestDistance = Infinity
  for (const entry of gallery) {
    const distance = euclideanDistance(descriptor, entry.descriptor)
    if (distance < bestDistance) {
      bestDistance = distance
      best = entry
    }
  }
  if (!best || bestDistance >= MATCH_DISTANCE) return { status: 'no_match' }
  return { status: 'matched', usuario: best.usuario, distancia: bestDistance }
}

export function hasEnrolledFace(usuarioId) {
  return readGallery().some((entry) => entry.usuario.id === usuarioId)
}

export function forgetFace(usuarioId) {
  writeGallery(readGallery().filter((entry) => entry.usuario.id !== usuarioId))
}
