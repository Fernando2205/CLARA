import { Boxes, ChevronDown, ClipboardCheck, FileText } from 'lucide-react'
import { Badge, Button, Progress, Tangram } from './ui'

export default function SessionPanel({
  records,
  current,
  total,
  alerts,
  onClose,
  onReport,
  onOpenInventory,
  mobileOpen,
  onMobileToggle,
}) {
  return (
    <aside className={`session-panel ${mobileOpen ? 'mobile-open' : ''}`}>
      <button className="mobile-sheet-handle" onClick={onMobileToggle} aria-label="Abrir inventario de la sesión">
        <span />
        <div>
          <strong>Toma en curso</strong>
          <span>{current} de {total}</span>
        </div>
        <ChevronDown size={20} />
      </button>
      <div className="session-panel-head">
        <div>
          <span className="eyebrow">Inventario en vivo</span>
          <h2>Toma en curso</h2>
        </div>
        <span className="live-dot">En vivo</span>
      </div>
      <Progress current={current} total={total} alerts={alerts} />
      <button className="open-inventory-button" onClick={onOpenInventory}>
        <Boxes size={18} />
        <span>
          <strong>Ver todo el inventario</strong>
          <small>Catálogo, saldos y conteo físico</small>
        </span>
      </button>
      <div className="record-list">
        {records.length ? records.map((record, index) => (
          <article className={`record-item ${index === 0 ? 'record-item-new' : ''}`} key={record.id}>
            <div className="record-item-icon"><ClipboardCheck size={19} /></div>
            <div className="record-item-copy">
              <strong>{record.name}</strong>
              <span>{record.sku ? `SKU ${record.sku}` : 'Sin código'} · hace {index + 1} min</span>
              <Badge type={record.badge} />
            </div>
            <div className="record-item-quantity">
              <strong>{record.quantity}</strong>
              <span>{record.unit}</span>
            </div>
          </article>
        )) : (
          <div className="empty-state">
            <Tangram size={62} />
            <p>Aún no hay tomas. Toca el micrófono para empezar.</p>
          </div>
        )}
      </div>
      <div className="session-panel-foot">
        <Button variant="secondary" onClick={onClose}>Cerrar y firmar</Button>
        <button className="report-shortcut" onClick={onReport}>
          <FileText size={16} /> Generar reporte con lo contado hasta ahora
        </button>
      </div>
    </aside>
  )
}
