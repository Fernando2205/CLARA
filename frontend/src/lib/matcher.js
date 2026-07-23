import catalog from '../../../docs/catalogo_piscilago.json'

const unitLabels = {
  Unidad: 'unidades',
  Kilogram: 'kilogramos',
  Liter: 'litros',
  Portion: 'porciones',
}

const matchNoiseWords = new Set([
  'agrega', 'agregar', 'agregue', 'anada', 'anade', 'anadir', 'anota',
  'anote', 'anotar', 'apunta', 'apunte', 'apuntar', 'ingresa', 'ingrese',
  'ingresar', 'registra', 'registre', 'registrar', 'pon', 'ponga', 'poner',
  'suma', 'sume', 'sumar', 'marca', 'marque', 'marcar', 'quiero',
  'necesito', 'puede', 'puedes', 'podria', 'podrias', 'podemos',
  'ayuda', 'ayudas', 'ayudar', 'quieres', 'por', 'favor', 'porfa',
  'a', 'de', 'del', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
])

export function normalizeText(value = '') {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\xa0/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function meaningfulTokens(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token && !matchNoiseWords.has(token))
}

function cleanProductQuery(value) {
  return meaningfulTokens(value).join(' ')
}

function similarity(left, right) {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index])
  for (let column = 0; column <= right.length; column += 1) rows[0][column] = column
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
  }
  return 1 - (rows[left.length][right.length] / Math.max(left.length, right.length, 1))
}

function tokenScore(queryToken, nameToken) {
  if (queryToken === nameToken) return 3
  if (queryToken.length < 3 || nameToken.length < 3) return 0
  if (queryToken.startsWith(nameToken) || nameToken.startsWith(queryToken)) return 2.2
  if (
    queryToken.length >= 4
    && nameToken.length >= 4
    && (queryToken.includes(nameToken) || nameToken.includes(queryToken))
  ) return 1.8
  return similarity(queryToken, nameToken) >= 0.78 ? 1.6 : 0
}

function lexicalCoverage(query, name) {
  const queryTokens = meaningfulTokens(query)
  const nameTokens = meaningfulTokens(name)
  if (!queryTokens.length) return 0
  const matched = queryTokens.filter((token) => (
    Math.max(0, ...nameTokens.map((candidate) => tokenScore(token, candidate))) > 0
  )).length
  return matched / queryTokens.length
}

function isVariantFamily(query, name) {
  const queryTokens = meaningfulTokens(query)
  const nameTokens = meaningfulTokens(name)
  if (!queryTokens.length || nameTokens.length < queryTokens.length) return false
  return queryTokens.every((token, index) => tokenScore(token, nameTokens[index]) > 0)
}

function scoreName(query, name) {
  const queryNorm = cleanProductQuery(query)
  const nameNorm = cleanProductQuery(name)
  const queryTokens = meaningfulTokens(queryNorm)
  const nameTokens = meaningfulTokens(nameNorm)
  if (!queryTokens.length) return 0

  let score = 0
  let matched = 0
  queryTokens.forEach((queryToken) => {
    const bestScore = Math.max(0, ...nameTokens.map((token) => tokenScore(queryToken, token)))
    score += bestScore
    if (bestScore > 0) matched += 1
  })

  score -= (queryTokens.length - matched) * 1.25
  if (queryNorm === nameNorm) score += 2.5
  return Math.max(0, score - (0.05 * nameTokens.length))
}

function toProduct(item, confidence) {
  return {
    name: item.articulo,
    sku: item.sku,
    unit: unitLabels[item.unidad] || item.unidad,
    catalogUnit: item.unidad,
    stock: Number(item.stock),
    warehouse: item.bodega,
    confidence: Math.max(0, Math.min(1, confidence)),
  }
}

function rank(query, rows) {
  const tokenCount = Math.max(1, normalizeText(query).split(' ').filter(Boolean).length)
  return rows
    .map((item) => {
      const score = scoreName(query, item.articulo)
      return {
        item,
        score,
        confidence: Math.min(1, score / (3 * tokenCount)),
      }
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
}

export function matchCatalog(query, warehouse) {
  query = cleanProductQuery(query)
  const localRows = catalog.filter((item) => item.bodega === warehouse)
  let ranked = rank(query, localRows)
  let otherWarehouse = false

  const localSupported = ranked.length
    && ranked[0].confidence >= 0.45
    && lexicalCoverage(query, ranked[0].item.articulo) >= 0.6
  if (!localSupported) {
    ranked = rank(query, catalog)
    otherWarehouse = true
  }

  if (!ranked.length) {
    return { type: 'no_match', product: null, alternatives: [], otherWarehouse: false }
  }

  const [best, ...rest] = ranked
  const product = toProduct(best.item, best.confidence)
  const supported = best.confidence >= 0.45 && lexicalCoverage(query, best.item.articulo) >= 0.6
  const closeMatches = rest
    .filter((result) => result.score >= best.score * 0.82)
    .slice(0, 6)
  const familyMatches = rest
    .filter((result) => isVariantFamily(query, result.item.articulo))
    .slice(0, 6)
  const selectionMatches = familyMatches.length ? familyMatches : closeMatches
  const eligibleSelectionMatches = supported ? selectionMatches : []
  const alternatives = (eligibleSelectionMatches.length
    ? eligibleSelectionMatches
    : rest
      .filter((result) => (
        result.confidence >= 0.35
        && lexicalCoverage(query, result.item.articulo) >= 0.6
      ))
      .slice(0, 3))
    .map((result) => toProduct(result.item, result.confidence))

  return {
    type: supported ? 'match' : 'no_match',
    product,
    alternatives,
    otherWarehouse,
    requiresSelection: eligibleSelectionMatches.length > 0,
  }
}

export function catalogUnitFromSpoken(spokenUnit) {
  if (!spokenUnit) return null
  if (['kilos', 'kilogramos', 'gramos'].includes(spokenUnit)) return 'Kilogram'
  if (['litro', 'litros'].includes(spokenUnit)) return 'Liter'
  if (['porcion', 'porciones'].includes(spokenUnit)) return 'Portion'
  return 'Unidad'
}
