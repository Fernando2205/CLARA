import { Minus, Plus, Tag, X } from 'lucide-react'
import { Button, ConfidenceChip, InlineAlert } from './ui'

export default function RegistroCard({
  record,
  quantity,
  setQuantity,
  resolvedAlerts,
  onResolve,
  onConfirm,
  onCancel,
  onAlternative,
}) {
  const blockingAlerts = record.alerts.filter((alert) => alert.level !== 'info')
  const unresolvedBlocking = blockingAlerts.filter((alert) => !resolvedAlerts.has(alert.rule))
  const visibleAlerts = record.alerts.filter((alert) => !resolvedAlerts.has(alert.rule)).slice(0, 1)

  return (
    <article className={`record-card ${unresolvedBlocking.length ? 'record-card-alert' : ''}`}>
      <div className="record-meta">
        <span>
          {record.isCorrection
            ? 'CORRECCIÓN DEL ÚLTIMO REGISTRO'
            : record.sku
              ? `SKU ${record.sku} · ${record.warehouse || 'Almacén AyB'}`
              : 'SIN CÓDIGO EN EL MAESTRO'}
        </span>
        <ConfidenceChip value={record.confidence} />
      </div>
      <div className="record-heading">
        <div>
          <h2>{record.name}</h2>
          <p>Saldo en sistema: {Number(record.stock).toLocaleString('es-CO', { maximumFractionDigits: 2 })} {record.unit} · Toma física</p>
        </div>
        {record.state && <span className="state-chip"><Tag size={14} />{record.state}</span>}
      </div>
      <div className="quantity-editor" aria-label="Cantidad capturada">
        <button onClick={() => setQuantity(Math.max(0, Number(quantity || 0) - 1))} aria-label="Restar uno">
          <Minus size={22} />
        </button>
        <label>
          <span>{record.isCorrection ? 'Nueva cantidad' : 'Cantidad'}</span>
          {record.isCorrection && <del className="correction-old">{record.oldQuantity}</del>}
          <input
            inputMode="decimal"
            type="number"
            min="0"
            step="any"
            value={quantity ?? ''}
            onChange={(event) => setQuantity(event.target.value === '' ? null : Number(event.target.value))}
          />
        </label>
        <button onClick={() => setQuantity(Number(quantity || 0) + 1)} aria-label="Sumar uno">
          <Plus size={22} />
        </button>
        <strong>{record.spokenUnit || record.unit}</strong>
      </div>
      {record.conversionNote && <p className="conversion-note">{record.conversionNote}</p>}
      {visibleAlerts.map((alert) => (
        <InlineAlert
          alert={alert}
          key={alert.rule}
          resolved={resolvedAlerts.has(alert.rule)}
          onResolve={(action) => onResolve(alert, action)}
        />
      ))}
      {!!record.alternatives.length && (
        <div className="alternatives">
          <span>¿No era este?</span>
          {record.alternatives.map((item) => (
            <button key={item.sku || `${item.warehouse}-${item.name}`} onClick={() => onAlternative(item)}>
              {item.name}
            </button>
          ))}
        </div>
      )}
      <div className="record-actions">
        <Button onClick={onConfirm} disabled={unresolvedBlocking.length > 0 || quantity == null}>
          {record.isCorrection ? 'Guardar corrección' : 'Confirmar'}
        </Button>
        <Button onClick={onCancel} variant="secondary" icon={X}>Cancelar</Button>
      </div>
    </article>
  )
}
