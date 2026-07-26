import test from 'node:test'
import assert from 'node:assert/strict'
import { isPermanentSaveError } from '../src/lib/syncPolicy.js'

test('descarta conflictos que nunca se resolverán reintentando', () => {
  assert.equal(isPermanentSaveError({ status: 409 }), true)
  assert.equal(isPermanentSaveError({ status: 404 }), true)
  assert.equal(isPermanentSaveError({ status: 422 }), true)
})

test('conserva en cola errores temporales de red o servicio', () => {
  assert.equal(isPermanentSaveError(new TypeError('Failed to fetch')), false)
  assert.equal(isPermanentSaveError({ status: 408 }), false)
  assert.equal(isPermanentSaveError({ status: 429 }), false)
  assert.equal(isPermanentSaveError({ status: 503 }), false)
})
