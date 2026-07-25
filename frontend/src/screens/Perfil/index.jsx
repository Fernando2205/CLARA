import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  LogOut,
  PenLine,
  ScanFace,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Avatar, Badge, Button, Logo, Toast } from '../../components/ui'
import { SignatureField } from '../../components/SignaturePad'
import { API_URL, deleteReportFiles, listUserSessions, requestReport, updateSignature } from '../../lib/api'
import { useAuthStore } from '../../stores/auth'
import { useCamera } from '../../lib/useCamera'
import { enroll, hasEnrolledFace, loadModels } from '../../lib/facial'

const WAREHOUSE_LABELS = {
  'STOCK RESTAURANTE FUENTES AYB': 'Restaurante Fuentes · AyB',
  'STOCK ALMACEN AYB': 'Almacén · Alimentos y Bebidas',
  'STOCK KIOSCO TAQUILLA AYB': 'Kiosco Taquilla · AyB',
  'STOCK KIOSCO PISCIGIROS AYB': 'Kiosco Piscigiros · AyB',
}

export default function Perfil ({ onHome, onSignOut }) {
  const user = useAuthStore((state) => state.user)
  const login = useAuthStore((state) => state.login)
  const [sound, setSound] = useState(true)
  const [toast, setToast] = useState('')
  const [editingFirma, setEditingFirma] = useState(false)
  const [savingFirma, setSavingFirma] = useState(false)
  const [enrolandoRostro, setEnrolandoRostro] = useState(false)
  const [capturandoRostro, setCapturandoRostro] = useState(false)
  const [rostroEnrolado, setRostroEnrolado] = useState(() => hasEnrolledFace(user.id))
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [openingId, setOpeningId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [modelosListos, setModelosListos] = useState(false)
  const [modelosError, setModelosError] = useState(false)
  const firmaRef = useRef(null)
  const { videoRef, cameraState } = useCamera(enrolandoRostro)

  useEffect(() => {
    if (!enrolandoRostro) return undefined
    let active = true
    setModelosListos(false)
    setModelosError(false)
    loadModels()
      .then(() => { if (active) setModelosListos(true) })
      .catch(() => { if (active) setModelosError(true) })
    return () => { active = false }
  }, [enrolandoRostro])

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  useEffect(() => {
    let active = true
    listUserSessions(user.id)
      .then((items) => { if (active) setHistory(items) })
      .catch(() => { if (active) notify('No pudimos cargar tu historial de tomas.') })
      .finally(() => { if (active) setLoadingHistory(false) })
    return () => { active = false }
  }, [user.id])

  const abrirReporte = async (sesionId) => {
    if (openingId) return
    setOpeningId(sesionId)
    try {
      const response = await requestReport(sesionId, { formatos: ['pdf'], enviar: {}, alcance: 'contados' })
      const url = response.archivos?.pdf
      if (!url) throw new Error('El acta no incluyó un PDF')
      window.open(`${API_URL}${url}`, '_blank', 'noopener')
    } catch {
      notify('No pudimos abrir ese reporte. Intenta de nuevo.')
    } finally {
      setOpeningId('')
    }
  }

  const borrarReporte = async (sesionId) => {
    if (deletingId) return
    if (!window.confirm('¿Borrar esta toma de la vista? Los archivos generados se eliminan; la toma firmada sigue guardada y se puede regenerar si vuelve a hacer falta.')) return
    setDeletingId(sesionId)
    try {
      await deleteReportFiles(sesionId)
      setHistory((current) => current.filter((item) => item.sesion_id !== sesionId))
      notify('Reporte borrado de la vista.')
    } catch {
      notify('No pudimos borrar los archivos generados.')
    } finally {
      setDeletingId('')
    }
  }

  const enrolarRostro = async () => {
    setCapturandoRostro(true)
    try {
      await enroll(videoRef.current, {
        id: user.id,
        nombre: user.nombre,
        cargo: user.cargo,
        turno: user.turno,
        bodega_asignada: user.bodega,
        firma_url: user.firma ? user.firma.replace(API_URL, '') : null,
      })
      setRostroEnrolado(true)
      setEnrolandoRostro(false)
      notify('Rostro enrolado en este dispositivo.')
    } catch (err) {
      notify(err.message || 'No pudimos leer tu rostro. Verifica el permiso de cámara.')
    } finally {
      setCapturandoRostro(false)
    }
  }

  const guardarFirma = async () => {
    if (firmaRef.current?.isEmpty()) {
      notify('Dibuja tu firma antes de guardar.')
      return
    }
    setSavingFirma(true)
    try {
      const blob = await firmaRef.current.toBlob()
      const usuario = await updateSignature(user.id, blob)
      const firmaUrl = usuario.firma_url ? `${API_URL}${usuario.firma_url}?t=${Date.now()}` : user.firma
      login({ ...user, firma: firmaUrl })
      setEditingFirma(false)
      notify('Firma guardada.')
    } catch {
      notify('No pudimos guardar tu firma. Intenta de nuevo.')
    } finally {
      setSavingFirma(false)
    }
  }

  return (
    <main className='profile-screen'>
      <header className='profile-topbar'>
        <div className='profile-topbar-inner'>
          <button onClick={onHome} className='plain-button'><Logo light /></button>
          <div className='profile-topbar-actions'>
            <button aria-label={sound ? 'Desactivar sonidos' : 'Activar sonidos'} onClick={() => setSound((value) => !value)}>
              {sound ? <Volume2 size={21} /> : <VolumeX size={21} />}
            </button>
            <button aria-label='Notificaciones'><Bell size={21} /></button>
            <button className='avatar-button' aria-label='Perfil'><Avatar size='sm' /></button>
          </div>
        </div>
      </header>
      <div className='profile-layout'>
        <section className='history-column'>
          <div className='history-heading'>
            <div>
              <span className='eyebrow'>Actividad</span>
              <h1>Historial de tomas</h1>
              <p>Haz clic en una toma para abrir su acta en PDF.</p>
            </div>
            <button className='filter-button'><SlidersHorizontal size={18} /> Filtrar</button>
          </div>
          <div className='history-list'>
            {loadingHistory && <p className='preconteo-status'>Cargando tu historial…</p>}
            {!loadingHistory && !history.length && (
              <p className='profile-signature-empty'>Todavía no tienes tomas firmadas.</p>
            )}
            {history.map((item) => (
              <article
                className='history-card history-card-clickable'
                key={item.sesion_id}
                role='button'
                tabIndex={0}
                onClick={() => abrirReporte(item.sesion_id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    abrirReporte(item.sesion_id)
                  }
                }}
              >
                <span className='history-icon'><FileText size={22} /></span>
                <div className='history-copy'>
                  <div><span>{new Date(item.fin).toLocaleString('es-CO')}</span><Badge type='sincronizado' /></div>
                  <h2>{WAREHOUSE_LABELS[item.bodega] || item.bodega}</h2>
                  <p>{item.contadas} refs · {item.tiempo_min} min · {item.corregidos} correcciones</p>
                </div>
                <div className='history-card-actions'>
                  <Button
                    variant='ghost'
                    icon={Download}
                    disabled={openingId === item.sesion_id}
                    onClick={(event) => { event.stopPropagation(); abrirReporte(item.sesion_id) }}
                  >
                    {openingId === item.sesion_id ? 'Abriendo…' : 'Abrir PDF'}
                  </Button>
                  <button
                    type='button'
                    className='history-card-delete'
                    aria-label='Borrar archivos generados de esta toma'
                    disabled={deletingId === item.sesion_id}
                    onClick={(event) => { event.stopPropagation(); borrarReporte(item.sesion_id) }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          <Button onClick={onHome} icon={ArrowRight}>Iniciar nueva toma</Button>
        </section>
        <aside className='profile-card'>
          <div className='profile-blue'>
            <div className='profile-avatar-wrap'>
              <Avatar size='xl' />
              <span className='profile-verified'><CheckCircle2 size={17} /></span>
            </div>
            <h2>{user.nombre}</h2>
            <p>{user.cargo}</p>
          </div>
          <div className='profile-details'>
            <div><UserRound size={20} /><span><small>Rol</small><strong>Operaria de inventario</strong></span></div>
            <div><Building2 size={20} /><span><small>Bodega asignada</small><strong>{user.bodega}</strong></span></div>
            <div><CalendarDays size={20} /><span><small>Turno</small><strong>Mañana · 06:00–14:00</strong></span></div>
          </div>
          <div className='profile-signature-card'>
            <span className='eyebrow'><PenLine size={14} /> Tu firma</span>
            {!editingFirma
              ? (
                <>
                  {user.firma
                    ? (
                      <img className='profile-signature-preview' src={user.firma} alt='Tu firma' />
                      )
                    : (
                      <p className='profile-signature-empty'>Aún no has guardado una firma. Se usa para sellar tus reportes.</p>
                      )}
                  <Button variant='secondary' icon={PenLine} onClick={() => setEditingFirma(true)}>
                    {user.firma ? 'Actualizar firma' : 'Agregar firma'}
                  </Button>
                </>
                )
              : (
                <>
                  <SignatureField padRef={firmaRef} width={280} height={120} />
                  <div className='profile-signature-actions'>
                    <Button onClick={guardarFirma} disabled={savingFirma}>
                      {savingFirma ? 'Guardando…' : 'Guardar firma'}
                    </Button>
                    <Button variant='secondary' onClick={() => setEditingFirma(false)}>Cancelar</Button>
                  </div>
                </>
                )}
          </div>
          <div className='profile-signature-card'>
            <span className='eyebrow'><ScanFace size={14} /> Reconocimiento facial</span>
            {!enrolandoRostro
              ? (
                <>
                  <p className='profile-signature-empty'>
                    {rostroEnrolado
                      ? 'Tu rostro está enrolado en este dispositivo. Vuelve a capturarlo si cambia mucho tu apariencia.'
                      : 'Aún no enrolas tu rostro en este dispositivo. El reconocimiento facial es 100% local: la foto nunca se envía al servidor.'}
                  </p>
                  <Button variant='secondary' icon={ScanFace} onClick={() => setEnrolandoRostro(true)}>
                    {rostroEnrolado ? 'Volver a enrolar' : 'Enrolar rostro en este dispositivo'}
                  </Button>
                </>
                )
              : (
                <>
                  <div className={`camera-frame camera-${cameraState}`} aria-label='Captura de rostro'>
                    <video ref={videoRef} autoPlay muted playsInline aria-label='Video de la cámara frontal' />
                  </div>
                  {!modelosListos && !modelosError && (
                    <p className='models-loading'>
                      <span className='processing-dots'><i /><i /><i /></span>
                      Preparando reconocimiento facial…
                    </p>
                  )}
                  {modelosError && (
                    <p className='register-photo-error'>
                      No pudimos cargar el reconocimiento facial. Verifica tu conexión e intenta de nuevo.
                    </p>
                  )}
                  <div className='profile-signature-actions'>
                    <Button
                      onClick={enrolarRostro}
                      disabled={capturandoRostro || cameraState !== 'live' || !modelosListos}
                    >
                      {capturandoRostro ? 'Leyendo tu rostro…' : 'Capturar rostro'}
                    </Button>
                    <Button variant='secondary' onClick={() => setEnrolandoRostro(false)}>Cancelar</Button>
                  </div>
                </>
                )}
          </div>
          <div className='profile-score'>
            <span className='eyebrow'>Este mes</span>
            <div><strong>12</strong><span>Tomas firmadas</span></div>
            <div><strong>96%</strong><span>Capturas sin corrección</span></div>
          </div>
          <button className='profile-logout' onClick={onSignOut}><LogOut size={19} /> Cerrar sesión</button>
        </aside>
      </div>
      <Toast message={toast} />
    </main>
  )
}
