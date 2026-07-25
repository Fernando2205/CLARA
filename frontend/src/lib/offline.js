import { openDB } from 'idb'

const DB_NAME = 'clara-offline'
const DB_VERSION = 1
const STORE = 'pendientesSync'

let dbPromise = null

function getDb () {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade (db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'localId' })
        }
      },
    })
  }
  return dbPromise
}

// Encola un registro que no se pudo confirmar contra el backend (offline o
// timeout). `payload` es el body exacto que espera POST /sessions/{id}/registros.
export async function queueRecord (sessionId, payload, recordId) {
  const db = await getDb()
  const localId = `${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await db.put(STORE, { localId, sessionId, payload, recordId, createdAt: Date.now() })
  return localId
}

export async function listQueued () {
  const db = await getDb()
  const all = await db.getAll(STORE)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeQueued (localId) {
  const db = await getDb()
  await db.delete(STORE, localId)
}

export async function queueSize () {
  const db = await getDb()
  return db.count(STORE)
}
