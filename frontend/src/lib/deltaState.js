// Aproximación por diferencia porcentual entre el conteo físico y el saldo del
// sistema. No replica exactamente las reglas del validador (services/rules.py),
// que usa el rango histórico por artículo; esto es una lectura agregada rápida
// para mapas y resúmenes.
export function deltaState(actual, sistema) {
  if (actual < 0) return 'bad'
  if (sistema > 0) {
    const relDelta = Math.abs(actual - sistema) / sistema
    if (relDelta <= 0.08) return 'ok'
    if (relDelta <= 0.25) return 'warn'
    return 'bad'
  }
  return actual === 0 ? 'ok' : 'warn'
}
