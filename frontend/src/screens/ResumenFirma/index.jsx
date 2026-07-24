import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  FileCheck2,
  ShieldCheck,
} from 'lucide-react'
import { Button, CategoryIcon, PinPad, StatTile, Toast, TopBar } from '../../components/ui'
import { SignatureField } from '../../components/SignaturePad'
import { categorize } from '../../lib/categories'
import { deltaState } from '../../lib/deltaState'
import { API_URL, getSessionSummary, signSession, updateSignature } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { useSessionStore } from '../../stores/session'

export default function ResumenFirma({ onBack, onContinue, onProfile }) {
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const sessionId = useSessionStore((state) => state.sessionId)
  const setSignature = useSessionStore((state) => state.setSignature)
  const user = useAuthStore((state) => state.user)
  const login = useAuthStore((state) => state.login)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pin, setPin] = useState('')
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState('')
  const [signed, setSigned] = useState(null)
  const [toast, setToast] = useState('')
  const [needsFirma, setNeedsFirma] = useState(!user.firma)
  const [savingFirma, setSavingFirma] = useState(false)
  const firmaRef = useRef(null)

  useEffect(() => {
    if (!sessionId) { setLoading(false); return }
    let active = true
    getSessionSummary(sessionId)
      .then((response) => { if (active) setSummary(response) })
      .catch(() => { if (active) setError('No pudimos cargar el resumen real de esta sesión.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [sessionId])

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }

  const guardarFirma = async () => {
    if (firmaRef.current?.isEmpty()) {
      notify('Dibuja tu firma antes de continuar.')
      return
    }
    setSavingFirma(true)
    try {
      const blob = await firmaRef.current.toBlob()
      const usuario = await updateSignature(user.id, blob)
      login({
        ...user,
        firma: usuario.firma_url ? `${API_URL}${usuario.firma_url}?t=${Date.now()}` : user.firma,
      })
      setNeedsFirma(false)
    } catch {
      notify('No pudimos guardar tu firma. Intenta de nuevo.')
    } finally {
      setSavingFirma(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pin.length !== 4 || !sessionId) return
    setSigning(true)
    setSignError('')
    try {
      const result = await signSession(sessionId, { usuario: user.nombre, password: pin })
      setSigned(result)
      setSignature(result)
      notify('Toma firmada. El acta quedó sellada y ya no puede modificarse.')
    } catch (err) {
      setSignError(err.message === 'Credenciales inválidas' ? 'PIN incorrecto. Intenta de nuevo.' : 'No pudimos firmar la toma. Intenta de nuevo.')
      setPin('')
    } finally {
      setSigning(false)
    }
  }

  if (!sessionId) {
    return (
      <main className="summary-screen">
        <TopBar title="Resumen y firma" onBack={onBack} onProfile={onProfile} />
        <div className="summary-empty">
          <AlertTriangle size={32} />
          <h1>Esta sesión no se sincronizó con el servidor</h1>
          <p>Sin una sesión guardada en el backend no es posible generar ni firmar un acta real. Vuelve a la captura cuando tengas conexión.</p>
          <Button onClick={onBack}>Volver a la captura</Button>
        </div>
      </main>
    )
  }

  const differences = summary?.diferencias || []
  const withState = differences.map((row) => ({ ...row, state: deltaState(row.fisico, row.sistema) }))
  const consistent = withState.filter((row) => row.state === 'ok')
  const flagged = withState.filter((row) => row.state !== 'ok')

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
          {loading && <p className="preconteo-status">Cargando resumen real de la sesión…</p>}
          {error && <p className="mapa-error">{error}</p>}
          {!loading && !error && (
            <>
              <div className="stats-row">
                <StatTile icon={FileCheck2} value={summary.contadas} label="referencias contadas" />
                <StatTile icon={Clock3} value={`${summary.tiempo_min} min`} label="tiempo total" />
                <StatTile icon={ShieldCheck} value={summary.corregidos} label="correcciones en sesión" />
              </div>
              <section className="differences-card">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Conciliación</span>
                    <h2>Diferencias encontradas</h2>
                  </div>
                  <span className="review-chip"><AlertTriangle size={15} /> {flagged.length} requieren revisión</span>
                </div>
                <div className="difference-table" role="table" aria-label="Diferencias del inventario">
                  <div className="difference-row difference-head" role="row">
                    <span>Artículo</span><span>Físico</span><span>Sistema</span><span>Delta</span>
                  </div>
                  {flagged.map((row) => {
                    const DeltaIcon = row.delta === 0 ? Check : row.delta > 0 ? ArrowUpRight : ArrowDownRight
                    const status = row.state === 'bad' ? 'error' : row.state
                    return (
                      <div className="difference-row" role="row" key={row.articulo}>
                        <span className="difference-product">
                          <CategoryIcon id={categorize(row.articulo)} size={18} />
                          <strong>{row.articulo}</strong>
                        </span>
                        <span>{row.fisico}</span>
                        <span>{row.sistema}</span>
                        <span className={`delta delta-${status}`}><DeltaIcon size={16} />{row.delta > 0 ? '+' : ''}{row.delta.toFixed(2)}</span>
                      </div>
                    )
                  })}
                </div>
                {!!consistent.length && (
                  <p className="difference-consistent-note"><Check size={15} /> {consistent.length} artículos coinciden con el sistema.</p>
                )}
              </section>
            </>
          )}
        </section>
        <aside className="signature-panel">
          {!signed ? (
            <>
              <div className="signature-icon"><ShieldCheck size={30} /></div>
              <span className="eyebrow">Acto formal</span>
              <h2>Firma la toma</h2>
              {needsFirma ? (
                <>
                  <p>Antes de firmar, guarda tu firma — todavía no tienes una en tu cuenta.</p>
                  <SignatureField padRef={firmaRef} width={280} height={130} />
                  <Button onClick={guardarFirma} disabled={savingFirma}>
                    {savingFirma ? 'Guardando…' : 'Guardar firma y continuar'}
                  </Button>
                </>
              ) : (
                <>
                  <p>Al firmar confirmas que revisaste las cantidades. La sesión quedará cerrada y no podrá editarse.</p>
                  <form onSubmit={submit} className="sign-form">
                    <div className="sign-identity">
                      <span>Firmando como</span>
                      <strong>{user.nombre}</strong>
                      {user.firma && <img className="sign-identity-firma" src={user.firma} alt="Tu firma" />}
                    </div>
                    <div className="sign-pin">
                      <span>PIN de 4 dígitos</span>
                      <PinPad value={pin} onChange={setPin} />
                    </div>
                    {signError && <p className="credentials-error">{signError}</p>}
                    <Button variant="formal" type="submit" disabled={pin.length !== 4 || signing}>
                      {signing ? 'Firmando…' : 'Firmar toma'}
                    </Button>
                  </form>
                  <p className="signature-legal"><ShieldCheck size={15} /> Se generará un sello de integridad con fecha y hora.</p>
                </>
              )}
            </>
          ) : (
            <div className="signed-state">
              <div className="signed-check"><Check size={44} /></div>
              <span className="eyebrow">Firma verificada</span>
              <h2>Toma firmada</h2>
              <p>{summary.contadas} referencias en {summary.tiempo_min} min, {summary.corregidos} correcciones a tiempo.</p>
              <div className="signature-receipt">
                <span>Responsable</span><strong>{user.nombre}</strong>
                <span>Fecha y hora</span><strong>{new Date(signed.fin).toLocaleString('es-CO')}</strong>
                <span>Sello</span><strong className="signature-hash">{signed.hash_firma.slice(0, 16)}…</strong>
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
