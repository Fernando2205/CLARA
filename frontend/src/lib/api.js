const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

async function apiFetch(path, options = {}, timeoutMs = 3000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Error ${response.status}`)
    }
    return response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

async function apiFetchForm(path, formData, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.detail || `Error ${response.status}`)
    }
    return response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

export function toStoreUser(usuario) {
  const [primerNombre] = usuario.nombre.trim().split(/\s+/)
  const iniciales = usuario.nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    nombreCorto: primerNombre,
    iniciales,
    cargo: usuario.cargo,
    turno: usuario.turno || '',
    bodega: usuario.bodega_asignada || '',
  }
}

export function registerUser({ nombre, cedula, correo, pin, foto }) {
  const formData = new FormData()
  formData.append('nombre', nombre)
  formData.append('cedula', cedula)
  formData.append('correo', correo)
  formData.append('pin', pin)
  formData.append('foto', foto, 'rostro.jpg')
  return apiFetchForm('/auth/register', formData, 12000)
}

export function faceLogin(foto) {
  const formData = new FormData()
  formData.append('foto', foto, 'rostro.jpg')
  return apiFetchForm('/auth/face-login', formData, 8000)
}

export function credentialsLogin({ usuario, password }) {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ usuario, password }),
  }, 4000)
}

export function createSession({ userId, warehouse, mode }) {
  return apiFetch('/sessions', {
    method: 'POST',
    body: JSON.stringify({ usuario_id: userId, bodega: warehouse, modo: mode }),
  }, 4500)
}

export function extractInventory({ phrase, warehouse, sessionId, lastSku }) {
  return apiFetch('/extract', {
    method: 'POST',
    body: JSON.stringify({
      frase: phrase,
      bodega: warehouse,
      sesion_id: sessionId || null,
      contexto_ultimo_sku: lastSku || null,
    }),
  }, 3000)
}

export function askClara({
  phrase,
  warehouse,
  sessionId,
  lastSku,
  alertContext,
}) {
  return apiFetch('/assistant', {
    method: 'POST',
    body: JSON.stringify({
      frase: phrase,
      bodega: warehouse,
      sesion_id: sessionId || null,
      contexto_ultimo_sku: lastSku || null,
      contexto_alerta: alertContext || null,
    }),
  }, 3500)
}

export function getInventory({ warehouse, sessionId, query = '', status = 'todos' }) {
  const params = new URLSearchParams({
    bodega: warehouse,
    q: query,
    estado: status,
  })
  if (sessionId) params.set('sesion_id', sessionId)
  return apiFetch(`/inventory?${params.toString()}`, {}, 5000)
}

export async function getSpeechResponse(text, externalSignal, timeoutMs = 30000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  const abortFromCaller = () => controller.abort()
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
  try {
    const response = await fetch(`${API_URL}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto: text }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error('Voz natural no disponible')
    return response
  } finally {
    window.clearTimeout(timeout)
  }
}

export function validateInventory(payload) {
  return apiFetch('/validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function saveInventoryRecord(sessionId, payload) {
  return apiFetch(`/sessions/${sessionId}/registros`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 5000)
}

export { API_URL }
