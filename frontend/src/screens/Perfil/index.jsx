import { useState } from 'react'
import {
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  LogOut,
  SlidersHorizontal,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Avatar, Badge, Button, Logo, Toast } from '../../components/ui'
import { useAuthStore } from '../../stores/auth'

const history = [
  { date: '23 jul 2026 · 14:32', place: 'Restaurante Fuentes · AyB', refs: 47, time: 12, corrections: 3 },
  { date: '21 jul 2026 · 09:15', place: 'Almacén · Alimentos y Bebidas', refs: 112, time: 28, corrections: 0 },
  { date: '20 jul 2026 · 17:02', place: 'Kiosco Taquilla · AyB', refs: 85, time: 19, corrections: 1 },
  { date: '19 jul 2026 · 06:45', place: 'Zoológico · Alimentos', refs: 32, time: 8, corrections: 5 },
]

export default function Perfil({ onHome, onSignOut }) {
  const user = useAuthStore((state) => state.user)
  const [sound, setSound] = useState(true)
  const [toast, setToast] = useState('')

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  return (
    <main className="profile-screen">
      <header className="profile-topbar">
        <div className="profile-topbar-inner">
          <button onClick={onHome} className="plain-button"><Logo light /></button>
          <div className="profile-topbar-actions">
            <button aria-label={sound ? 'Desactivar sonidos' : 'Activar sonidos'} onClick={() => setSound((value) => !value)}>
              {sound ? <Volume2 size={21} /> : <VolumeX size={21} />}
            </button>
            <button aria-label="Notificaciones"><Bell size={21} /></button>
            <button className="avatar-button" aria-label="Perfil"><Avatar size="sm" /></button>
          </div>
        </div>
      </header>
      <div className="profile-layout">
        <section className="history-column">
          <div className="history-heading">
            <div>
              <span className="eyebrow">Actividad</span>
              <h1>Historial de tomas</h1>
              <p>Consulta y vuelve a generar los reportes de inventario finalizados.</p>
            </div>
            <button className="filter-button"><SlidersHorizontal size={18} /> Filtrar</button>
          </div>
          <div className="history-list">
            {history.map((item) => (
              <article className="history-card" key={`${item.date}-${item.place}`}>
                <span className="history-icon"><FileText size={22} /></span>
                <div className="history-copy">
                  <div><span>{item.date}</span><Badge type="sincronizado" /></div>
                  <h2>{item.place}</h2>
                  <p>{item.refs} refs · {item.time} min · {item.corrections} correcciones</p>
                </div>
                <Button variant="ghost" icon={Download} onClick={() => notify('Reporte regenerado y listo para descargar.')}>
                  Re-generar
                </Button>
              </article>
            ))}
          </div>
          <Button onClick={onHome} icon={ArrowRight}>Iniciar nueva toma</Button>
        </section>
        <aside className="profile-card">
          <div className="profile-blue">
            <div className="profile-avatar-wrap">
              <Avatar size="xl" />
              <span className="profile-verified"><CheckCircle2 size={17} /></span>
            </div>
            <h2>{user.nombre}</h2>
            <p>{user.cargo}</p>
          </div>
          <div className="profile-details">
            <div><UserRound size={20} /><span><small>Rol</small><strong>Operaria de inventario</strong></span></div>
            <div><Building2 size={20} /><span><small>Bodega asignada</small><strong>{user.bodega}</strong></span></div>
            <div><CalendarDays size={20} /><span><small>Turno</small><strong>Mañana · 06:00–14:00</strong></span></div>
          </div>
          <div className="profile-score">
            <span className="eyebrow">Este mes</span>
            <div><strong>12</strong><span>Tomas firmadas</span></div>
            <div><strong>96%</strong><span>Capturas sin corrección</span></div>
          </div>
          <button className="profile-logout" onClick={onSignOut}><LogOut size={19} /> Cerrar sesión</button>
        </aside>
      </div>
      <Toast message={toast} />
    </main>
  )
}
