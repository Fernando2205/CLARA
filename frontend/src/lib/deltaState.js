// Aproximación por diferencia porcentual entre el conteo físico y el saldo del
// sistema. No replica exactamente las reglas del validador (services/rules.py),
// que usa el rango histórico por artículo; esto es una lectura agregada rápida
// para mapas y resúmenes.
export function deltaState (actual, sistema) {
  if (actual < 0) return 'bad'
  // Un saldo negativo del sistema no puede "coincidir" con un conteo físico
  // válido. Se mantiene como diferencia por revisar, no como anomalía física
  // automática: el dato problemático proviene del sistema, no del operario.
  if (sistema < 0) return 'warn'
  if (sistema > 0) {
    const relDelta = Math.abs(actual - sistema) / sistema
    if (relDelta <= 0.08) return 'ok'
    if (relDelta <= 0.25) return 'warn'
    return 'bad'
  }
  return actual === 0 ? 'ok' : 'warn'
}
