import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircleMore,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Button, Logo, Toast, TopBar } from '../../components/ui'
import { API_URL, getInventory, getSessionSummary, requestReport } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { useSessionStore } from '../../stores/session'

const formats = [
  { key: 'pdf', label: 'PDF', caption: 'Acta firmada', icon: FileText },
  { key: 'xlsx', label: 'XLSX', caption: 'Libro de detalle', icon: FileSpreadsheet },
  { key: 'csv', label: 'CSV', caption: 'Listo para ERP', icon: FileBarChart2 },
]

const ALCANCES = [
  { value: 'contados', label: 'Solo contados' },
  { value: 'completo', label: 'Contados + faltantes' },
  { value: 'faltantes', label: 'Solo faltantes' },
]

export default function ReporteEnvio({ onBack, onProfile, onFinish }) {
  const warehouse = useSessionStore((state) => state.bodega)
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const sessionId = useSessionStore((state) => state.sessionId)
  const signature = useSessionStore((state) => state.signature)
  const user = useAuthStore((state) => state.user)
  const [summary, setSummary] = useState(null)
  const [inventory, setInventory] = useState(null)
  const [archivos, setArchivos] = useState(null)
  const [alcance, setAlcance] = useState('contados')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState('')
  const [deliveries, setDeliveries] = useState({})
  const [toast, setToast] = useState('')
  const [stamped, setStamped] = useState(!user.firma || !signature)

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3200)
  }

  useEffect(() => {
    if (!sessionId) { setLoading(false); return }
    let active = true
    Promise.all([
      getSessionSummary(sessionId),
      getInventory({ warehouse, sessionId }),
      requestReport(sessionId, { formatos: ['pdf', 'xlsx', 'csv'], enviar: {}, alcance: 'contados' }),
    ])
      .then(([summaryResponse, inventoryResponse, reportResponse]) => {
        if (!active) return
        setSummary(summaryResponse)
        setInventory(inventoryResponse)
        setArchivos(reportResponse.archivos)
      })
      .catch(() => { if (active) setError('No pudimos generar el reporte real de esta sesión.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId, warehouse])

  const cambiarAlcance = async (next) => {
    setAlcance(next)
    if (!sessionId) return
    setGenerating(true)
    try {
      const response = await requestReport(sessionId, {
        formatos: ['pdf', 'xlsx', 'csv'], enviar: {}, alcance: next,
      })
      setArchivos(response.archivos)
    } catch {
      notify('No pudimos regenerar el reporte con ese alcance.')
    } finally {
      setGenerating(false)
    }
  }

  const send = async (channel, extraEmail) => {
    if (!sessionId || !stamped) return
    setSending(channel)
    try {
      const response = await requestReport(sessionId, {
        formatos: ['pdf'],
        enviar: { telegram: channel === 'telegram', email: channel === 'email' ? extraEmail : null },
        alcance,
      })
      const status = response.detalle_envio[channel]
      setDeliveries((current) => ({ ...current, [channel]: status }))
      notify(
        status === 'enviado'
          ? 'Enviado correctamente.'
          : 'No hay credenciales configuradas en el backend: el envío quedó simulado.',
      )
    } catch {
      notify('No pudimos enviar el reporte.')
    } finally {
      setSending('')
    }
  }

  const rows = useMemo(() => {
    const contadas = (summary?.diferencias || []).map((row) => ({
      articulo: row.articulo, fisico: row.fisico, sistema: row.sistema, delta: row.delta,
    }))
    const faltantes = (inventory?.items || [])
      .filter((item) => !item.contado_en_sesion)
      .map((item) => ({ articulo: item.nombre, fisico: null, sistema: item.stock_sistema, delta: null }))
    if (alcance === 'contados') return contadas
    if (alcance === 'faltantes') return faltantes
    return [...contadas, ...faltantes]
  }, [summary, inventory, alcance])

  if (!sessionId) {
    return (
      <main className="report-screen">
        <TopBar title="Reporte y envío" onBack={onBack} onProfile={onProfile} />
        <div className="summary-empty">
          <ShieldCheck size={32} />
          <h1>No hay una sesión sincronizada</h1>
          <p>El reporte se genera desde el backend real; esta sesión no tiene un ID de servidor con el que pedirlo.</p>
          <Button onClick={onBack}>Volver</Button>
        </div>
      </main>
    )
  }

  const visibleRows = rows.slice(0, 8)

  return (
    <main className="report-screen">
      <TopBar title="Reporte y envío" onBack={onBack} onProfile={onProfile} />
      <div className="report-layout">
        <section className="preview-column">
          <div className="report-heading">
            <span className="eyebrow">{signature ? 'Acta firmada' : 'Acta sin firmar'}</span>
            <h1>Tu reporte está listo</h1>
            <p>Generado por el backend a partir de los datos reales de esta sesión.</p>
          </div>

          <div className="segmented alcance-switch" role="tablist" aria-label="Qué incluir en el reporte">
            {ALCANCES.map((option) => (
              <button
                key={option.value}
                className={alcance === option.value ? 'active' : ''}
                onClick={() => cambiarAlcance(option.value)}
                disabled={generating}
              >
                {option.label}
              </button>
            ))}
          </div>

          {loading && <p className="preconteo-status">Generando reporte…</p>}
          {error && <p className="mapa-error">{error}</p>}
          {!loading && !error && summary && (
            <div className="pdf-stage">
              <div className="pdf-shadow-sheet" />
              <article className="pdf-preview">
                <header>
                  <Logo light />
                  <div>
                    <strong>ACTA DE INVENTARIO</strong>
                    <span>{signature ? new Date(signature.fin).toLocaleString('es-CO') : 'Sin firmar'}</span>
                  </div>
                </header>
                <div className="pdf-body">
                  <div className="pdf-title">
                    <span>REPORTE DE EXISTENCIAS</span>
                    <h2>{bodegaLabel}</h2>
                    <p>Toma física asistida por voz · Sesión {sessionId.slice(0, 8)}</p>
                  </div>
                  <div className="pdf-stats">
                    <span><strong>{summary.contadas}</strong> Referencias</span>
                    <span><strong>{summary.tiempo_min} min</strong> Duración</span>
                    <span><strong>{summary.corregidos}</strong> Correcciones</span>
                  </div>
                  <table>
                    <thead><tr><th>Artículo</th><th>Físico</th><th>Sistema</th><th>Delta</th></tr></thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.articulo} className={row.fisico == null ? 'pendiente' : ''}>
                          <td>{row.articulo}</td>
                          {row.fisico == null ? (
                            <td colSpan={3}>Sin contar</td>
                          ) : (
                            <>
                              <td>{row.fisico}</td>
                              <td>{row.sistema}</td>
                              <td>{row.delta > 0 ? '+' : ''}{row.delta.toFixed(2)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                      {!visibleRows.length && (
                        <tr><td colSpan={4}>No hay filas para este alcance.</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="pdf-signature">
                    <div>
                      <span>{signature ? 'Firma digital verificada' : 'Sesión aún no firmada'}</span>
                      {signature && <strong className="signature-hash">{signature.hash_firma.slice(0, 24)}…</strong>}
                    </div>
                    {user.firma && signature && (
                      <img
                        className={`firma-stamp ${stamped ? 'firma-stamp-settled' : 'firma-stamp-animating'}`}
                        src={user.firma}
                        alt="Firma del responsable"
                        onAnimationEnd={() => setStamped(true)}
                      />
                    )}
                  </div>
                </div>
              </article>
            </div>
          )}
          {!stamped && <p className="preconteo-status">Estampando tu firma…</p>}
        </section>
        <aside className="delivery-column">
          <section className="delivery-card">
            <span className="eyebrow">Archivos</span>
            <h2>Descargar formatos</h2>
            <div className="format-list">
              {formats.map(({ key, label, caption, icon: Icon }) => (
                <a
                  key={key}
                  className={`format-download ${!archivos?.[key] || !stamped ? 'disabled' : ''}`}
                  href={archivos?.[key] && stamped ? `${API_URL}${archivos[key]}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="format-icon"><Icon size={23} /></span>
                  <span><strong>{label}</strong><small>{caption}</small></span>
                  <Download size={20} />
                </a>
              ))}
            </div>
          </section>
          <section className="delivery-card">
            <span className="eyebrow">Compartir</span>
            <h2>Enviar el acta</h2>
            <label className="report-email-field">
              <Mail size={16} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="correo@empresa.com"
              />
              <button type="button" onClick={() => send('email', email)} disabled={!email || !!sending || !stamped}>
                {sending === 'email' ? 'Enviando…' : 'Enviar'}
              </button>
            </label>
            <div className="channel-grid channel-grid-3">
              <button className="channel telegram" onClick={() => send('telegram')} disabled={!!sending || !stamped}>
                <span><Send size={24} /></span>{sending === 'telegram' ? 'Enviando…' : 'Telegram'}
              </button>
              <button className="channel unavailable" disabled>
                <span><MessageCircleMore size={24} /></span>WhatsApp<small>Próximamente</small>
              </button>
              <button className="channel unavailable" disabled>
                <span><Users size={24} /></span>Teams<small>Próximamente</small>
              </button>
            </div>
            {deliveries.telegram && (
              <div className="sent-confirmation">
                <CheckCircle2 size={22} />
                <span><strong>Telegram:</strong> {deliveries.telegram}</span>
              </div>
            )}
            {deliveries.email && (
              <div className="sent-confirmation">
                <CheckCircle2 size={22} />
                <span><strong>Correo:</strong> {deliveries.email}</span>
              </div>
            )}
          </section>
          <div className="report-finish">
            <ShieldCheck size={18} />
            <p>La toma firmada permanece disponible en tu historial.</p>
            <Button variant="secondary" onClick={onFinish} icon={ArrowRight}>Ver historial</Button>
          </div>
        </aside>
      </div>
      <Toast message={toast} type="info" />
    </main>
  )
}
