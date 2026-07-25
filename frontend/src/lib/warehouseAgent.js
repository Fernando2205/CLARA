import { isInventoryReviewPending } from './inventoryStatus.js'

function normalizeText (value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\xa0/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const SMALL_NUMBERS = {
  cero: 0,
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
}

const TENS = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
}

const HUNDREDS = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
}

const NUMBER_WORDS = new Set([
  ...Object.keys(SMALL_NUMBERS),
  ...Object.keys(TENS),
  ...Object.keys(HUNDREDS),
  'mil',
  'y',
  'medio',
  'media',
])

const UNIT_WORDS = new Set([
  'litro', 'litros', 'lt', 'lts', 'l',
  'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg', 'kgs',
  'unidad', 'unidades',
  'porcion', 'porciones',
  'botella', 'botellas',
  'caja', 'cajas',
  'bolsa', 'bolsas',
  'paquete', 'paquetes',
])

const COMMAND_WORDS = new Set([
  'reemplaza', 'reemplazar', 'cambia', 'cambiar', 'corrige', 'corregir',
  'ajusta', 'ajustar', 'actualiza', 'actualizar', 'pon', 'poner', 'deja',
  'reemplazalo', 'reemplazala', 'cambialo', 'cambiala', 'corrigelo',
  'corrigela', 'ajustalo', 'ajustala',
  'dejalo', 'dejala', 'muestra', 'muestrame', 'ver', 'abre', 'revisa',
  'revisar', 'revision', 'revisiones', 'pendiente', 'pendientes',
  'siguiente', 'anterior', 'primero', 'primera', 'segundo', 'segunda',
  'tercero', 'tercera', 'este', 'esta', 'esto', 'ese', 'esa', 'dato',
  'cantidad', 'valor', 'producto', 'articulo', 'ahora', 'antes', 'nuevo',
  'nueva', 'fisico', 'sistema', 'saldo', 'confirmo', 'confirmar', 'cancela',
  'cancelar', 'explica', 'explicame', 'porque', 'por', 'que', 'favor',
  'el', 'la', 'los', 'las', 'de', 'del', 'a', 'en', 'con', 'se', 'lo',
  'tenemos', 'tenemo', 'enemos', 'tengo', 'tiene', 'tienen', 'hay', 'ahi',
  'queda', 'quedan', 'quedo', 'quedaron', 'son', 'es', 'da', 'dan', 'dio',
  'me', 'veo', 'vemos', 'existe', 'existen', 'conte', 'cuento', 'contamos',
  'encontre', 'encontramos',
])

const UNIT_LABELS = {
  Unidad: 'unidades',
  Kilogram: 'kilogramos',
  Liter: 'litros',
  Portion: 'porciones',
}

function parseDigit (token) {
  const value = token.trim()
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(value)) {
    return Number(value.replace(/\./g, '').replace(',', '.'))
  }
  return Number(value.replace(',', '.'))
}

function parseNumberWords (text) {
  const tokens = normalizeText(text).split(' ')
  let total = 0
  let group = 0
  let started = false

  for (const token of tokens) {
    if (token === 'y' && started) continue
    if (SMALL_NUMBERS[token] != null) {
      group += SMALL_NUMBERS[token]
      started = true
      continue
    }
    if (TENS[token] != null) {
      group += TENS[token]
      started = true
      continue
    }
    if (HUNDREDS[token] != null) {
      group += HUNDREDS[token]
      started = true
      continue
    }
    if (token === 'mil') {
      total += Math.max(group, 1) * 1000
      group = 0
      started = true
      continue
    }
    if ((token === 'medio' || token === 'media') && started) {
      group += 0.5
      continue
    }
    if (started) break
  }
  return started ? total + group : null
}

export function extractReplacementQuantity (phrase) {
  const raw = phrase.toLocaleLowerCase('es-CO')
  const markerParts = raw.split(/\b(?:por|a|en)\b/iu)
  const targetSegment = markerParts.length > 1 ? markerParts.at(-1) : raw
  const targetDigits = [...targetSegment.matchAll(/-?\d+(?:[.,]\d+)*/g)]
  if (targetDigits.length) return parseDigit(targetDigits.at(-1)[0])

  const targetWords = parseNumberWords(targetSegment)
  if (targetWords != null) return targetWords

  const allDigits = [...raw.matchAll(/-?\d+(?:[.,]\d+)*/g)]
  if (allDigits.length) return parseDigit(allDigits.at(-1)[0])
  return parseNumberWords(raw)
}

export function extractSpokenUnit (phrase) {
  const text = ` ${normalizeText(phrase)} `
  if (/\b(litro|litros|lt|lts|l)\b/.test(text)) return 'litros'
  if (/\b(kilo|kilos|kilogramo|kilogramos|kg|kgs)\b/.test(text)) return 'kilogramos'
  if (/\b(porcion|porciones)\b/.test(text)) return 'porciones'
  if (/\b(botella|botellas)\b/.test(text)) return 'botellas'
  if (/\b(caja|cajas)\b/.test(text)) return 'cajas'
  if (/\b(bolsa|bolsas)\b/.test(text)) return 'bolsas'
  if (/\b(paquete|paquetes)\b/.test(text)) return 'paquetes'
  if (/\b(unidad|unidades)\b/.test(text)) return 'unidades'
  return null
}

function extractProductQuery (phrase) {
  return normalizeText(phrase)
    .split(' ')
    .filter((token) => (
      token &&
      !COMMAND_WORDS.has(token) &&
      !UNIT_WORDS.has(token) &&
      !NUMBER_WORDS.has(token) &&
      !/^-?\d/.test(token)
    ))
    .join(' ')
}

function tokenMatches (queryToken, nameToken) {
  if (queryToken === nameToken) return true
  if (queryToken.length < 4 || nameToken.length < 4) return false
  return queryToken.startsWith(nameToken) || nameToken.startsWith(queryToken)
}

export function findReviewCandidates (phrase, reviewItems, activeItem = null) {
  const query = extractProductQuery(phrase)
  if (!query) return activeItem ? [activeItem] : []
  const queryTokens = query.split(' ')

  return reviewItems
    .map((item) => {
      const name = normalizeText(item.nombre)
      const nameTokens = name.split(' ')
      const matched = queryTokens.filter((token) => (
        nameTokens.some((nameToken) => tokenMatches(token, nameToken))
      )).length
      const coverage = matched / queryTokens.length
      let score = coverage * 10
      if (name === query) score += 10
      if (name.includes(query)) score += 5
      if (String(item.sku || '') === query) score += 10
      return { item, score, coverage }
    })
    .filter((result) => result.coverage >= 0.7)
    .sort((left, right) => right.score - left.score)
    .map((result) => result.item)
}

export function selectReviewOption (phrase, options = []) {
  const normalized = normalizeText(phrase)
  const ordinal = [
    /\b(primero|primera|uno|1)\b/,
    /\b(segundo|segunda|dos|2)\b/,
    /\b(tercero|tercera|tres|3)\b/,
    /\b(cuarto|cuarta|cuatro|4)\b/,
  ].findIndex((pattern) => pattern.test(normalized))
  if (ordinal >= 0 && options[ordinal]) return options[ordinal]
  const matches = findReviewCandidates(phrase, options)
  return matches.length === 1 ? matches[0] : null
}

export function getWarehouseReviewItems (items = []) {
  const priority = { bad: 0, warn: 1, pending: 2, ok: 3 }
  return items
    .filter(isInventoryReviewPending)
    .sort((left, right) => (
      priority[left.state] - priority[right.state] ||
      Math.abs(Number(right.cantidad_actual) - Number(right.stock_sistema)) -
        Math.abs(Number(left.cantidad_actual) - Number(left.stock_sistema)) ||
      left.nombre.localeCompare(right.nombre, 'es')
    ))
}

export function reviewReason (item) {
  if (!item.contado_en_sesion && Number(item.stock_sistema) < 0) {
    return `El sistema registra ${formatAgentAmount(item.stock_sistema)} ${unitLabel(item)} y aún no existe un conteo físico.`
  }
  const delta = Number(item.cantidad_actual) - Number(item.stock_sistema)
  return `El conteo físico difiere del sistema en ${formatAgentAmount(Math.abs(delta))} ${unitLabel(item)}.`
}

export function historicalRangeText (item) {
  if (item?.hist_min == null || item?.hist_max == null) return null
  const minimum = Number(item.hist_min)
  const maximum = Number(item.hist_max)
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum < 0 || maximum < minimum) {
    return null
  }
  return `Habitualmente hay entre ${formatAgentAmount(minimum)} y ${formatAgentAmount(maximum)} ${unitLabel(item)}.`
}

export function nextReviewAfter (items = [], currentId = null) {
  if (items.length < 2) return null
  const currentIndex = items.findIndex((item) => item.id === currentId)
  if (currentIndex < 0) return items[0]
  return items[(currentIndex + 1) % items.length]
}

export function parseWarehouseAgentCommand (phrase, { reviewItems = [], activeItem = null } = {}) {
  const normalized = normalizeText(phrase)
  if (!normalized) return { type: 'empty' }

  if (/^(si|si esta bien|confirmo|confirmar|confirma|correcto|esta bien|hazlo|dale|de una)$/.test(normalized)) {
    return { type: 'confirm' }
  }
  if (/^(no|cancela|cancelar|dejalo|dejala|volver)$/.test(normalized)) {
    return { type: 'cancel' }
  }
  if (/\b(siguiente|proxima|proximo)\b/.test(normalized)) return { type: 'next' }
  if (/\b(anterior|atras)\b/.test(normalized)) return { type: 'previous' }
  if (/\b(por que|porque|explica|explicame|motivo)\b/.test(normalized)) {
    return { type: 'explain' }
  }
  if (
    /\b(muestra|muestrame|ver|abre|lista)\b.*\b(revision|revisiones|pendiente|pendientes|anomalias|diferencias)\b/.test(normalized) ||
    normalized === 'revisiones pendientes'
  ) {
    return { type: 'show_reviews' }
  }

  const quantity = extractReplacementQuantity(phrase)
  const hasCorrectionVerb = /\b(reemplaza|reemplazalo|reemplazala|cambia|cambialo|cambiala|corrige|corrigelo|corrigela|ajusta|ajustalo|ajustala|actualiza|pon|deja)\b/.test(normalized)
  if (hasCorrectionVerb || (activeItem && quantity != null)) {
    const productQuery = extractProductQuery(phrase)
    return {
      type: 'correction',
      quantity,
      spokenUnit: extractSpokenUnit(phrase),
      candidates: findReviewCandidates(phrase, reviewItems, activeItem),
      productQuery,
    }
  }
  return { type: 'fallback' }
}

export function unitLabel (item) {
  return UNIT_LABELS[item?.unidad] || item?.unidad || ''
}

export function formatAgentAmount (value) {
  return Number(value).toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

export function isSpokenUnitCompatible (spokenUnit, catalogUnit) {
  if (!spokenUnit) return true
  if (spokenUnit === 'litros') return catalogUnit === 'Liter'
  if (spokenUnit === 'kilogramos') return catalogUnit === 'Kilogram'
  if (spokenUnit === 'porciones') return catalogUnit === 'Portion'
  if (['unidades', 'botellas', 'cajas', 'bolsas', 'paquetes'].includes(spokenUnit)) {
    return catalogUnit === 'Unidad'
  }
  return false
}
