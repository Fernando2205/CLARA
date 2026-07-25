import { deltaState } from './deltaState.js'

export function computeInventoryState (item) {
  if (!item.contado_en_sesion) return 'pending'
  return deltaState(Number(item.cantidad_actual), Number(item.stock_sistema))
}

export function isInventoryReviewPending (item) {
  if (item.reviewResolved || item.corregido) return false
  const state = item.state || computeInventoryState(item)
  if (!item.contado_en_sesion) return Number(item.stock_sistema) < 0
  return state === 'warn' || state === 'bad'
}

export function summarizeInventoryStates (items = []) {
  const summary = {
    total: items.length,
    counted: 0,
    pending: 0,
    ok: 0,
    warn: 0,
    bad: 0,
    issues: 0,
    systemIssues: 0,
    reviewPending: 0,
  }

  items.forEach((item) => {
    const state = item.state || computeInventoryState(item)
    if (state === 'pending') summary.pending += 1
    else summary.counted += 1
    if (state === 'ok') summary.ok += 1
    if (state === 'warn') summary.warn += 1
    if (state === 'bad') summary.bad += 1
    if (Number(item.stock_sistema) < 0) summary.systemIssues += 1
    if (isInventoryReviewPending({ ...item, state })) summary.reviewPending += 1
  })
  summary.issues = summary.warn + summary.bad
  return summary
}

export function zoneVisualState (summary) {
  if (!summary?.total || summary.counted === 0) return 'pending'
  if (summary.pending > 0) return summary.issues > 0 ? 'warn' : 'active'
  if (summary.bad > 0) return 'bad'
  if (summary.warn > 0) return 'warn'
  return 'ok'
}
