import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractReplacementQuantity,
  findReviewCandidates,
  getWarehouseReviewItems,
  historicalRangeText,
  nextReviewAfter,
  parseWarehouseAgentCommand,
  selectReviewOption,
} from '../src/lib/warehouseAgent.js'

const reviews = [
  {
    id: 1,
    nombre: 'ACEITE',
    sku: '7290',
    unidad: 'Liter',
    stock_sistema: 851.43,
    hist_min: 596,
    hist_max: 1106,
    cantidad_actual: 1000,
    contado_en_sesion: true,
    state: 'warn',
  },
  {
    id: 2,
    nombre: 'ACEITE DE AJONJOLI',
    sku: '7292',
    unidad: 'Liter',
    stock_sistema: -11,
    hist_min: null,
    hist_max: null,
    cantidad_actual: -11,
    contado_en_sesion: false,
    state: 'pending',
  },
  {
    id: 3,
    nombre: 'AZUCAR',
    sku: '6012',
    unidad: 'Kilogram',
    stock_sistema: 9,
    hist_min: 6.3,
    hist_max: 11.7,
    cantidad_actual: 50,
    contado_en_sesion: true,
    state: 'bad',
  },
]

test('toma el valor nuevo y no el valor anterior de una sustitución', () => {
  assert.equal(extractReplacementQuantity('reemplaza 1000 litros de aceite por 10'), 10)
  assert.equal(extractReplacementQuantity('cambia de 1.000 a 10 litros'), 10)
  assert.equal(extractReplacementQuantity('déjalo en diez litros'), 10)
})

test('aceite devuelve todas las variantes pendientes para obligar a elegir', () => {
  const matches = findReviewCandidates('corrige aceite a 10 litros', reviews)
  assert.deepEqual(matches.map((item) => item.id), [1, 2])
})

test('un nombre específico selecciona una sola variante', () => {
  const matches = findReviewCandidates('corrige aceite de ajonjolí a 10 litros', reviews)
  assert.deepEqual(matches.map((item) => item.id), [2])
})

test('una orden contextual conserva el producto activo', () => {
  const command = parseWarehouseAgentCommand('reemplázalo por 10', {
    reviewItems: reviews,
    activeItem: reviews[0],
  })
  assert.equal(command.type, 'correction')
  assert.equal(command.quantity, 10)
  assert.equal(command.candidates[0].id, 1)
  assert.equal(command.productQuery, '')
})

test('formas naturales de decir un conteo conservan el producto visible', () => {
  for (const phrase of [
    'tenemos 10 kg',
    'enemos 10 kg',
    'hay 10 kilos',
    'quedan diez kilogramos',
    'son 10 kg',
    'me dio 10 kg',
  ]) {
    const command = parseWarehouseAgentCommand(phrase, {
      reviewItems: reviews,
      activeItem: reviews[2],
    })
    assert.equal(command.type, 'correction', phrase)
    assert.equal(command.quantity, 10, phrase)
    assert.equal(command.candidates[0].id, reviews[2].id, phrase)
    assert.equal(command.productQuery, '', phrase)
  }
})

test('reconoce navegación y confirmación sin enviarlas al modelo', () => {
  assert.equal(parseWarehouseAgentCommand('muestra las revisiones pendientes').type, 'show_reviews')
  assert.equal(parseWarehouseAgentCommand('siguiente revisión').type, 'next')
  assert.equal(parseWarehouseAgentCommand('sí, está bien').type, 'confirm')
})

test('una corrección confirmada deja de estar pendiente', () => {
  const corrected = { ...reviews[0], corregido: true }
  assert.deepEqual(getWarehouseReviewItems([corrected, reviews[1]]).map((item) => item.id), [2])
})

test('permite elegir una variante por voz', () => {
  assert.equal(selectReviewOption('el segundo', reviews.slice(0, 2)).id, 2)
  assert.equal(selectReviewOption('aceite de ajonjolí', reviews.slice(0, 2)).id, 2)
})

test('no sustituye el producto visible cuando se menciona otro que no está pendiente', () => {
  const command = parseWarehouseAgentCommand('corrige leche a 10 litros', {
    reviewItems: reviews,
    activeItem: reviews[0],
  })
  assert.equal(command.productQuery, 'leche')
  assert.equal(command.candidates.length, 0)
})

test('explica el rango habitual con la unidad real del catálogo', () => {
  assert.equal(
    historicalRangeText(reviews[0]),
    'Habitualmente hay entre 596 y 1.106 litros.'
  )
  assert.equal(historicalRangeText(reviews[1]), null)
})

test('encuentra la revisión que sigue sin repetir la recién confirmada', () => {
  assert.equal(nextReviewAfter(reviews, reviews[0].id).id, reviews[1].id)
  assert.equal(nextReviewAfter(reviews, reviews[2].id).id, reviews[0].id)
  assert.equal(nextReviewAfter([reviews[0]], reviews[0].id), null)
})
