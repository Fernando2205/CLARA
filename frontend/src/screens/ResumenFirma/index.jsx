import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react'
import { Button, StatTile, Toast, TopBar } from '../../components/ui'
import { useSessionStore } from '../../stores/session'

const differences = [
  { item: 'ACEITE VEGETAL', unit: 'Liter', physical: 12, system: 14, delta: -2, status: 'warn' },
  { item: 'ARROZ BLANCO', unit: 'Kilogram', physical: 18, system: 18, delta: 0, status: 'ok' },
  { item: 'HUEVO AA', unit: 'Unidad', physical: 35, system: 40, delta: -5, status: 'error' },
  { item: 'GUISO CRIOLLO', unit: 'Portion', physical: 45, system: -12, delta: 57, status: 'error' },
]

export default function ResumenFirma({ onBack, onContinue, onProfile }) {
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const sign = useSessionStore((state) => state.sign)
  const signed = useSessionStore((state) => state.signed)
  const [credentials, setCredentials] = useState({ user: 'sofia.valencia', password: '' })
  const [toast, setToast] = useState('')

  const submit = (event) => {
    event.preventDefault()
    if (!credentials.password) return
    sign()
    setToast('Toma firmada. El acta quedó sellada y ya no puede modificarse.')
  }

  return (
    <main className="summary-screen">
      <TopBar title="Resumen y firma" onBack={onBack} onProfile={onProfile} />
      <div className="summary-layout">
        <section className="summary-main">
          <div className="summary-heading">
            <span className="eyebrow">Cierre de sesión · {bodegaLabel}</span>
            <h1>Todo contado. Revisa antes de firmar.</h1>
            <p>Clara comparó la toma física con el saldo del sistema y agrupó las diferencias importantes.</p>
          </div>
          <div className="stats-row">
            <StatTile icon={FileCheck2} value="47" label="referencias" />
            <StatTile icon={Clock3} value="12 min" label="tiempo total" />
            <StatTile icon={ShieldCheck} value="3" label="errores corregidos a tiempo" />
          </div>
          <section className="differences-card">
            <div className="section-heading-row">
              <div>
                <span className="eyebrow">Conciliación</span>
                <h2>Diferencias encontradas</h2>
              </div>
              <span className="review-chip"><AlertTriangle size={15} /> 2 requieren revisión</span>
            </div>
            <div className="difference-table" role="table" aria-label="Diferencias del inventario">
              <div className="difference-row difference-head" role="row">
                <span>Artículo</span><span>Físico</span><span>Sistema</span><span>Delta</span>
              </div>
              {differences.map((row) => {
                const DeltaIcon = row.delta === 0 ? Check : row.delta > 0 ? ArrowUpRight : ArrowDownRight
                return (
                  <div className="difference-row" role="row" key={row.item}>
                    <span><strong>{row.item}</strong><small>{row.unit}</small></span>
                    <span>{row.physical}</span>
                    <span>{row.system}</span>
                    <span className={`delta delta-${row.status}`}><DeltaIcon size={16} />{row.delta > 0 ? '+' : ''}{row.delta}</span>
                  </div>
                )
              })}
            </div>
            <button className="collapse-row">
              <span><CheckCircle2 size={18} /> Consistentes (39)</span>
              <ChevronDown size={18} />
            </button>
            <button className="collapse-row alert-group">
              <span><AlertTriangle size={18} /> Con alerta resuelta (8)</span>
              <ChevronDown size={18} />
            </button>
          </section>
        </section>
        <aside className="signature-panel">
          {!signed ? (
            <>
              <div className="signature-icon"><ShieldCheck size={30} /></div>
              <span className="eyebrow">Acto formal</span>
              <h2>Firma la toma</h2>
              <p>Al firmar confirmas que revisaste las cantidades. La sesión quedará cerrada y no podrá editarse.</p>
              <form onSubmit={submit}>
                <label>
                  <span>Usuario</span>
                  <input
                    value={credentials.user}
                    onChange={(event) => setCredentials({ ...credentials, user: event.target.value })}
                    autoComplete="username"
                  />
                </label>
                <label>
                  <span>Contraseña</span>
                  <input
                    type="password"
                    value={credentials.password}
                    onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}
                    placeholder="Escribe cualquier clave para la demo"
                    autoComplete="current-password"
                  />
                </label>
                <Button variant="formal" type="submit" disabled={!credentials.password}>Firmar toma</Button>
              </form>
              <p className="signature-legal"><ShieldCheck size={15} /> Se generará un sello de integridad con fecha y hora.</p>
            </>
          ) : (
            <div className="signed-state">
              <div className="signed-check"><Check size={44} /></div>
              <span className="eyebrow">Firma verificada</span>
              <h2>Toma firmada</h2>
              <p>47 referencias en 12 minutos, 3 errores corregidos a tiempo.</p>
              <div className="signature-receipt">
                <span>Responsable</span><strong>Sofía Valencia</strong>
                <span>Fecha y hora</span><strong>23 jul 2026 · 14:32</strong>
                <span>Sello</span><strong>CL-8FA2-0726</strong>
              </div>
              <Button onClick={onContinue} icon={ArrowRight}>Generar reporte</Button>
            </div>
          )}
        </aside>
      </div>
      <Toast message={toast} />
    </main>
  )
}
