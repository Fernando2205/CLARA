import { catalogUnitFromSpoken, matchCatalog, normalizeText } from './matcher'

const smallNumbers = {
  cero: 0, un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22,
  veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
}

const tens = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
}

const unitWords = [
  'unidades', 'unidad', 'cajas', 'caja', 'bolsas', 'bolsa', 'paquetes',
  'paquete', 'botellas', 'botella', 'kilos', 'kilo', 'kilogramos',
  'gramos', 'gramo', 'litros', 'litro', 'porciones', 'porcion',
  'lt', 'lts', 'kg', 'kgs', 'gr', 'boteya', 'boteyas',
]

const removableWords = new Set([
  'quedan', 'queda', 'hay', 'contamos', 'conte', 'conté', 'tenemos', 'tengo',
  'encontre', 'encontré', 'son', 'eran', 'es', 'de', 'del', 'el', 'la', 'los',
  'las', 'a', 'y', 'medio', 'media', 'buen', 'bueno', 'estado', 'vencido', 'vencida',
  'averiado', 'averiada', 'no', 'por', 'favor', 'registrar', 'registra',
  'agrega', 'agregar', 'agregue', 'anada', 'anade', 'anadir', 'anota',
  'anote', 'anotar', 'apunta', 'apunte', 'apuntar', 'ingresa', 'ingrese',
  'ingresar', 'registre', 'pon', 'ponga', 'poner', 'suma', 'sume', 'sumar',
  'marca', 'marque', 'marcar', 'quiero', 'necesito', 'puede', 'puedes',
  'podria', 'podrias', 'podemos', 'ayuda', 'ayudas', 'ayudar', 'quieres',
  'porfa', 'arroba',
  'hola', 'como', 'estas',
  ...unitWords,
  ...Object.keys(smallNumbers),
  ...Object.keys(tens),
])

function extractQuantity(normalized) {
  if (normalized.includes('no hay')) return 0
  if (normalized.includes('media arroba')) return 6.25

  const digit = normalized.match(/\d+(?:[.,]\d+)?/)
  if (digit) return Number(digit[0].replace(',', '.'))

  const tokens = normalized.split(' ')
  let total = null
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (smallNumbers[token] != null) {
      total = smallNumbers[token]
      break
    }
    if (tens[token] != null) {
      const next = tokens[index + 1] === 'y' ? tokens[index + 2] : tokens[index + 1]
      total = tens[token] + (smallNumbers[next] || 0)
      break
    }
  }

  if (total != null && normalized.includes('y medio')) return total + 0.5
  return total
}

function extractUnit(normalized) {
  if (normalized.includes('media arroba') || normalized.includes('kilo')) return 'kilogramos'
  if (/\bkgs?\b/.test(normalized)) return 'kilogramos'
  if (normalized.includes('gramo')) return 'gramos'
  if (/\bgr\b/.test(normalized)) return 'gramos'
  if (normalized.includes('litro') || /\blts?\b/.test(normalized)) return 'litros'
  if (normalized.includes('porcion')) return 'porciones'
  if (normalized.includes('caja')) return 'cajas'
  if (normalized.includes('bolsa')) return 'bolsas'
  if (normalized.includes('paquete')) return 'paquetes'
  if (normalized.includes('botella') || normalized.includes('boteya')) return 'botellas'
  if (normalized.includes('unidad')) return 'unidades'
  return null
}

function extractProductText(normalized) {
  return normalized
    .split(' ')
    .filter((token) => !removableWords.has(token) && !/^\d+(?:[.,]\d+)?$/.test(token))
    .join(' ')
    .trim()
}

function isCorrectionPhrase(normalized) {
  return /(perdon|corrige|me equivoque|eran|quise decir)/.test(normalized)
    || /^no son? /.test(normalized)
}

function productKey(record) {
  return record?.sku || normalizeText(record?.name)
}

export function validateInventoryRecord(record, records = []) {
  const alerts = []
  const spokenCatalogUnit = catalogUnitFromSpoken(record.spokenUnit)
  const duplicate = records.find((item) => productKey(item) === productKey(record))

  if (spokenCatalogUnit && spokenCatalogUnit !== record.catalogUnit) {
    alerts.push({
      rule: 'V2',
      level: 'error',
      message: `Dijiste ${record.spokenUnit}; ${record.name} se controla en ${record.unit}. ¿Quisiste decir ${record.quantity ?? ''} ${record.unit}?`,
      reason: 'La unidad que dijiste no coincide con la unidad definida en el catálogo.',
      recommendation: `Usa ${record.unit} o vuelve a dictar el conteo.`,
      actions: [
        { label: `Usar ${record.unit}`, value: 'use-catalog-unit' },
        { label: 'Cancelar', value: 'cancel' },
      ],
    })
  }

  if (record.catalogUnit === 'Unidad' && record.quantity != null && record.quantity % 1 !== 0) {
    alerts.push({
      rule: 'V6',
      level: 'error',
      message: `${record.name} se cuenta por unidades enteras.`,
      reason: 'Este artículo no admite cantidades fraccionadas.',
      recommendation: 'Revisa el conteo y utiliza un número entero.',
      actions: [{ label: 'Redondear cantidad', value: 'round' }],
    })
  }

  if (record.quantity == null || !record.spokenUnit || record.confidence < 0.6) {
    alerts.push({
      rule: 'V3',
      level: 'warn',
      message: record.quantity == null
        ? `¿${record.name} cuánto? Dime o escribe la cantidad.`
        : record.confidence < 0.6
          ? 'No estoy completamente segura del producto. Confirma una opción.'
          : `¿${record.quantity} qué? — cajas, bolsas o unidades`,
      reason: 'Falta un dato o la coincidencia del producto necesita confirmación.',
      recommendation: 'Confirma el producto, la cantidad y la unidad antes de guardar.',
      actions: [{ label: 'Confirmar datos', value: 'confirm-data' }],
    })
  }

  if (duplicate && !record.isCorrection) {
    alerts.push({
      rule: 'V5',
      level: 'warn',
      message: `Ya registraste ${record.name} (${duplicate.quantity} ${duplicate.unit}). ¿Es corrección o un segundo estante?`,
      reason: 'El mismo artículo ya tiene un conteo dentro de esta sesión.',
      recommendation: 'Reemplaza si era una corrección o suma si contaste otro lugar.',
      duplicateId: duplicate.id,
      actions: [
        { label: 'Reemplazar', value: 'replace' },
        { label: 'Sumar', value: 'sum' },
        { label: 'Cancelar', value: 'cancel' },
      ],
    })
  }

  if (['cajas', 'bolsas', 'paquetes'].includes(record.spokenUnit)) {
    alerts.push({
      rule: 'V7',
      level: 'warn',
      message: `Capturaste por ${record.spokenUnit}. ¿Cuántas unidades trae cada una?`,
      reason: 'El catálogo controla este producto por unidades, no por empaques.',
      recommendation: 'Indica el factor del empaque para calcular la cantidad total.',
      actions: [
        { label: '12 por empaque', value: 'factor', factor: 12 },
        { label: '24 por empaque', value: 'factor', factor: 24 },
      ],
    })
  }

  const histMin = record.stock > 0 ? record.stock * 0.7 : null
  const histMax = record.stock > 0 ? record.stock * 1.3 : null
  if (
    histMin != null
    && record.quantity != null
    && (record.quantity < histMin * 0.5 || record.quantity > histMax * 2)
    && Math.abs(record.quantity - record.stock) > 15
  ) {
    alerts.push({
      rule: 'V1',
      level: 'warn',
      message: `¿Segura que son ${record.quantity}? Aquí suele haber entre ${histMin.toFixed(0)} y ${histMax.toFixed(0)}.`,
      reason: `El conteo se aleja del rango histórico de ${histMin.toFixed(0)} a ${histMax.toFixed(0)} y del saldo del sistema.`,
      recommendation: 'Haz una segunda comprobación antes de confirmar.',
      actions: [
        { label: `Sí, son ${record.quantity}`, value: 'confirm-atypical' },
        { label: 'Corregir cantidad', value: 'edit-quantity' },
      ],
    })
  }

  if (record.stock < 0) {
    alerts.push({
      rule: 'V4',
      level: 'info',
      message: `El sistema muestra ${record.stock}. Tu conteo lo corrige de raíz.`,
      reason: 'El saldo del sistema es negativo y necesita saneamiento.',
      recommendation: 'Confirma el conteo físico para dejar evidencia de la diferencia.',
      actions: [{ label: 'Entendido', value: 'acknowledge' }],
    })
  }

  if (record.otherWarehouse) {
    alerts.push({
      rule: 'BODEGA',
      level: 'info',
      message: `${record.name} aparece en otra bodega. Confirma antes de continuar.`,
      reason: 'La mejor coincidencia pertenece a una bodega diferente.',
      recommendation: 'Comprueba la bodega y el nombre del producto.',
      actions: [{ label: 'Entendido', value: 'acknowledge' }],
    })
  }

  return alerts
}

export function parseInventoryPhrase(phrase, { warehouse, records = [] } = {}) {
  const normalized = normalizeText(phrase)
  const quantity = extractQuantity(normalized)
  const spokenUnit = extractUnit(normalized)
  const state = normalized.includes('buen estado')
    ? 'Buen estado'
    : normalized.includes('vencid')
      ? 'Vencido'
      : normalized.includes('averiad')
        ? 'Averiado'
        : null

  if (isCorrectionPhrase(normalized)) {
    const previous = records[0]
    if (!previous || quantity == null) {
      return {
        type: 'no_match',
        phrase,
        productText: '',
        message: 'No tengo un registro anterior que pueda corregir.',
        alternatives: [],
      }
    }
    return {
      ...previous,
      type: 'correction',
      phrase,
      quantity,
      oldQuantity: previous.quantity,
      spokenUnit: spokenUnit || previous.unit,
      catalogUnit: previous.catalogUnit || catalogUnitFromSpoken(previous.unit),
      stock: previous.stock ?? 0,
      confidence: 1,
      isCorrection: true,
      alerts: [],
      alternatives: [],
    }
  }

  const productText = extractProductText(normalized)
  const match = matchCatalog(productText, warehouse)

  if (!productText || match.type === 'no_match') {
    return {
      type: 'no_match',
      phrase,
      productText,
      quantity,
      spokenUnit,
      state,
      message: `No encontré «${productText || phrase}» en esta bodega.`,
      alternatives: match.alternatives,
    }
  }

  const inferredUnit = normalized.includes('no hay') ? match.product.unit : spokenUnit
  if (match.requiresSelection) {
    return {
      type: 'selection',
      phrase,
      productText,
      quantity,
      spokenUnit: inferredUnit,
      state,
      options: [match.product, ...match.alternatives],
      alternatives: [],
      spokenIntro: `Encontré varias opciones de ${productText}. Elige la correcta.`,
    }
  }
  const convertsGrams = spokenUnit === 'gramos' && match.product.catalogUnit === 'Kilogram'
  const convertedQuantity = convertsGrams && quantity != null ? quantity * 0.001 : quantity
  const record = {
    ...match.product,
    type: 'record',
    phrase,
    productText,
    quantity: convertedQuantity,
    spokenUnit: convertsGrams ? match.product.unit : inferredUnit,
    conversionNote: convertsGrams
      ? `${quantity} gramos → ${convertedQuantity} ${match.product.unit}`
      : null,
    state,
    alternatives: match.alternatives,
    otherWarehouse: match.otherWarehouse,
  }
  record.alerts = validateInventoryRecord(record, records)
  return record
}
