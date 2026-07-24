// Treemap tipo "slice-and-dice" recursivo: reparte un rectángulo en sub-zonas
// de tamaño proporcional a su valor, alternando cortes verticales/horizontales.
// Esto es lo que produce el efecto de "plano real" (bloques de tamaños distintos
// encajados unos junto a otros) en vez de una grilla uniforme de tarjetas.
export function sliceTreemap(items, x, y, w, h, direction = w >= h ? 'h' : 'v') {
  if (!items.length) return []
  if (items.length === 1) {
    return [{ id: items[0].id, x, y, w, h }]
  }

  const total = items.reduce((sum, item) => sum + item.value, 0)
  let running = 0
  let splitIndex = 1
  for (let i = 0; i < items.length; i += 1) {
    running += items[i].value
    if (running >= total / 2) { splitIndex = i + 1; break }
  }
  splitIndex = Math.min(Math.max(splitIndex, 1), items.length - 1)

  const left = items.slice(0, splitIndex)
  const right = items.slice(splitIndex)
  const leftTotal = left.reduce((sum, item) => sum + item.value, 0)
  const fraction = leftTotal / total
  const next = direction === 'h' ? 'v' : 'h'

  if (direction === 'h') {
    const w1 = w * fraction
    return [
      ...sliceTreemap(left, x, y, w1, h, next),
      ...sliceTreemap(right, x + w1, y, w - w1, h, next),
    ]
  }
  const h1 = h * fraction
  return [
    ...sliceTreemap(left, x, y, w, h1, next),
    ...sliceTreemap(right, x, y + h1, w, h - h1, next),
  ]
}

// Reparte una lista de {id, total} en `count` grupos balanceados por suma,
// para formar "alas" del edificio con superficie total comparable.
export function balancedGroups(entries, count) {
  const groups = Array.from({ length: count }, () => ({ items: [], total: 0 }))
  const sorted = entries.slice().sort((a, b) => b.total - a.total)
  sorted.forEach((entry) => {
    const target = groups.reduce((min, group) => (group.total < min.total ? group : min), groups[0])
    target.items.push(entry)
    target.total += entry.total
  })
  return groups.map((group) => group.items).filter((group) => group.length)
}
