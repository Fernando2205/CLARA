import { ArrowRight, Boxes, Building2, Clock3, MapPin } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { useSessionStore } from '../../stores/session'
import { Avatar, Button, Logo, Progress } from '../../components/ui'

const warehouses = [
  {
    id: 'STOCK RESTAURANTE FUENTES AYB',
    label: 'Restaurante Fuentes · AyB',
    refs: 344,
    date: '30 jun',
    suggested: true,
    open: 47,
  },
  {
    id: 'ALMACEN ALIMENTOS Y BEBIDAS',
    label: 'Almacén · Alimentos y Bebidas',
    refs: 286,
    date: '28 jun',
  },
  {
    id: 'STOCK KIOSCO TAQUILLA',
    label: 'Kiosco Taquilla · AyB',
    refs: 149,
    date: '26 jun',
  },
]

export default function SeleccionBodega({ onContinue, onProfile }) {
  const mode = useSessionStore((state) => state.mode)
  const setMode = useSessionStore((state) => state.setMode)
  const setBodega = useSessionStore((state) => state.setBodega)
  const selected = useSessionStore((state) => state.bodega)
  const user = useAuthStore((state) => state.user)

  const select = (warehouse) => setBodega(warehouse.id, warehouse.label)

  return (
    <main className="warehouse-screen">
      <header className="warehouse-header">
        <Logo light />
        <button className="user-compact" onClick={onProfile}>
          <div>
            <strong>{user.nombre}</strong>
            <span>{user.turno}</span>
          </div>
          <Avatar size="sm" />
        </button>
      </header>
      <section className="warehouse-shell">
        <div className="warehouse-title">
          <span className="eyebrow"><MapPin size={15} /> Nueva sesión</span>
          <h1>¿Dónde vas a contar?</h1>
          <p>Selecciona el punto de inventario. Clara recordará esta sesión si necesitas retomarla.</p>
        </div>
        <div className="mode-switch" aria-label="Modo de sesión">
          <button className={mode === 'toma' ? 'active' : ''} onClick={() => setMode('toma')}>
            <Boxes size={18} /> Toma física
          </button>
          <button className={mode === 'requisicion' ? 'active' : ''} onClick={() => setMode('requisicion')}>
            <Building2 size={18} /> Requisición
          </button>
        </div>
        <div className="warehouse-list">
          {warehouses.map((warehouse) => (
            <button
              className={`warehouse-card ${warehouse.suggested ? 'suggested' : ''} ${selected === warehouse.id ? 'selected' : ''}`}
              key={warehouse.id}
              onClick={() => select(warehouse)}
            >
              <span className="warehouse-icon"><Building2 size={24} /></span>
              <span className="warehouse-copy">
                <span className="warehouse-label-line">
                  <strong>{warehouse.label}</strong>
                  {warehouse.suggested && <em>Tu bodega</em>}
                </span>
                <span className="warehouse-meta">
                  <span>{warehouse.refs} referencias</span>
                  <i />
                  <span><Clock3 size={14} /> Última toma {warehouse.date}</span>
                </span>
                {warehouse.open && <Progress current={warehouse.open} total={warehouse.refs} />}
              </span>
              <span className="warehouse-action">
                {warehouse.open ? 'Continuar' : 'Empezar'} <ArrowRight size={20} />
              </span>
            </button>
          ))}
        </div>
        <div className="warehouse-footer">
          <div>
            <strong>{mode === 'toma' ? 'Toma física' : 'Requisición'} · {warehouses.find((item) => item.id === selected)?.label}</strong>
            <span>La sesión se guarda automáticamente en este dispositivo.</span>
          </div>
          <Button onClick={onContinue} icon={ArrowRight}>Comenzar conteo</Button>
        </div>
      </section>
    </main>
  )
}
