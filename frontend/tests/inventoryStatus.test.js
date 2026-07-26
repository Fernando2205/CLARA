import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeInventoryState,
  summarizeInventoryStates,
  zoneVisualState,
} from '../src/lib/inventoryStatus.js'

test('un saldo negativo sin conteo físico permanece pendiente', () => {
  assert.equal(computeInventoryState({
    contado_en_sesion: false,
    cantidad_actual: -30,
    stock_sistema: -30,
  }), 'pending')
})

test('un saldo negativo contado se revisa, pero no se vuelve anomalía automática', () => {
  assert.equal(computeInventoryState({
    contado_en_sesion: true,
    cantidad_actual: 12,
    stock_sistema: -30,
  }), 'warn')
})

test('un conteo cercano al saldo positivo coincide', () => {
  assert.equal(computeInventoryState({
    contado_en_sesion: true,
    cantidad_actual: 96,
    stock_sistema: 100,
  }), 'ok')
})

test('las incidencias del sistema se separan de las diferencias físicas', () => {
  const summary = summarizeInventoryStates([
    { state: 'pending', stock_sistema: -10, contado_en_sesion: false },
    { state: 'ok', stock_sistema: 20, contado_en_sesion: true },
    { state: 'warn', stock_sistema: 30, contado_en_sesion: true },
  ])
  assert.deepEqual(summary, {
    total: 3,
    counted: 2,
    pending: 1,
    ok: 1,
    warn: 1,
    bad: 0,
    issues: 1,
    systemIssues: 1,
    reviewPending: 2,
  })
})

test('una corrección confirmada sale de la cola aunque conserve diferencia', () => {
  const summary = summarizeInventoryStates([
    {
      state: 'warn',
      stock_sistema: 1000,
      cantidad_actual: 10,
      contado_en_sesion: true,
      corregido: true,
    },
  ])
  assert.equal(summary.issues, 1)
  assert.equal(summary.reviewPending, 0)
})

test('una zona sin conteos sigue pendiente aunque tenga saldos negativos', () => {
  assert.equal(zoneVisualState({
    total: 20,
    counted: 0,
    pending: 20,
    ok: 0,
    warn: 0,
    bad: 0,
    issues: 0,
    systemIssues: 4,
  }), 'pending')
})

test('una zona incompleta con diferencia pide revisión sin pintarse como anomalía', () => {
  assert.equal(zoneVisualState({
    total: 20,
    counted: 5,
    pending: 15,
    ok: 4,
    warn: 0,
    bad: 1,
    issues: 1,
    systemIssues: 0,
  }), 'warn')
})

test('una zona completa solo es anomalía si el conteo físico la confirma', () => {
  assert.equal(zoneVisualState({
    total: 20,
    counted: 20,
    pending: 0,
    ok: 19,
    warn: 0,
    bad: 1,
    issues: 1,
    systemIssues: 0,
  }), 'bad')
})

test('una zona completa sin diferencias queda verde', () => {
  assert.equal(zoneVisualState({
    total: 20,
    counted: 20,
    pending: 0,
    ok: 20,
    warn: 0,
    bad: 0,
    issues: 0,
    systemIssues: 0,
  }), 'ok')
})
