import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CloudOff,
  CircleHelp,
  Delete,
  Info,
  Lightbulb,
  Mic,
  RotateCcw,
  Wifi,
} from 'lucide-react'

export function Tangram({ size = 32, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 48 48"
      width={size}
    >
      <path d="M5 25 20 10v30Z" fill="#FFD000" />
      <path d="m20 10 12 12-12 12Z" fill="#EBBF00" />
      <path d="m32 22 10-10v18Z" fill="#FFD000" />
      <path d="m20 34 8-8 8 8-8 8Z" fill="#F3C600" />
      <path d="m5 25 8 8-8 8Z" fill="#0067B1" />
    </svg>
  )
}

export function Logo({ light = false }) {
  return (
    <div className="brand" aria-label="CLARA">
      <Tangram size={30} />
      <span className={light ? 'brand-light' : ''}>CLARA</span>
    </div>
  )
}

export function Avatar({ initials = 'SV', size = 'md' }) {
  return <span className={`avatar avatar-${size}`} aria-label="Sofía Valencia">{initials}</span>
}

export function Button({ children, variant = 'primary', icon: Icon, className = '', ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {Icon && <Icon aria-hidden="true" size={19} />}
      <span>{children}</span>
    </button>
  )
}

export function TopBar({ title, online, onNetwork, onProfile, onBack, backLabel = 'Volver' }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        {onBack ? (
          <button className="icon-text-button on-blue" onClick={onBack} aria-label={backLabel}>
            <RotateCcw size={19} />
            <span>{backLabel}</span>
          </button>
        ) : <Logo light />}
        {title && <span className="topbar-divider" aria-hidden="true" />}
        {title && <strong className="topbar-title">{title}</strong>}
      </div>
      <div className="topbar-actions">
        {typeof online === 'boolean' && (
          <button className={`network-chip ${online ? '' : 'offline'}`} onClick={onNetwork}>
            {online ? <Wifi size={15} /> : <CloudOff size={15} />}
            <span>{online ? 'En línea' : 'Guardando local'}</span>
          </button>
        )}
        <button className="avatar-button" onClick={onProfile} aria-label="Abrir perfil">
          <Avatar size="sm" />
        </button>
      </div>
    </header>
  )
}

export function Progress({ current, total, alerts }) {
  const value = Math.min(100, Math.round((current / total) * 100))
  return (
    <div className="progress-block">
      <div className="progress-copy">
        <span>{current} de {total}</span>
        {alerts != null && <span>{alerts} alertas resueltas</span>}
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax={total}
        aria-valuenow={current}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function ConfidenceChip({ value }) {
  const level = value >= 0.85 ? 'high' : value >= 0.6 ? 'medium' : 'low'
  const label = level === 'high' ? 'Alta' : level === 'medium' ? 'Revisar' : 'Confirmar'
  const Icon = level === 'high' ? CheckCircle2 : AlertTriangle
  return (
    <span className={`confidence confidence-${level}`}>
      <Icon size={14} />
      {label} · {Math.round(value * 100)}%
    </span>
  )
}

export function Badge({ type }) {
  const content = {
    sincronizado: [CheckCircle2, 'Sincronizado'],
    pendiente: [CloudOff, 'Pendiente'],
    corregido: [RotateCcw, 'Corregido'],
    alerta: [AlertTriangle, 'Alerta'],
  }[type] || [Check, type]
  const [Icon, label] = content
  return (
    <span className={`badge badge-${type}`}>
      <Icon size={13} />
      {label}
    </span>
  )
}

export function InlineAlert({ alert, resolved, onResolve }) {
  const Icon = alert.level === 'info' ? Info : AlertTriangle
  const actions = alert.actions?.length
    ? alert.actions
    : [{ label: alert.action || 'Entendido', value: 'acknowledge' }]
  return (
    <div className={`inline-alert alert-${alert.level} ${resolved ? 'resolved' : ''}`}>
      <div className="inline-alert-message">
        {resolved ? <CheckCircle2 size={18} /> : <Icon size={18} />}
        <span>{resolved ? `${alert.rule || 'Alerta'} resuelta.` : alert.message}</span>
      </div>
      {!resolved && (
        <>
          {(alert.reason || alert.recommendation) && (
            <div className="inline-alert-explanation">
              {alert.reason && (
                <p><CircleHelp size={15} /><span><strong>Por qué:</strong> {alert.reason}</span></p>
              )}
              {alert.recommendation && (
                <p><Lightbulb size={15} /><span><strong>Recomendación:</strong> {alert.recommendation}</span></p>
              )}
            </div>
          )}
          <div className="inline-alert-actions">
            {actions.map((action) => (
              <button key={`${alert.rule}-${action.value}-${action.label}`} onClick={() => onResolve(action)}>
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function StatTile({ value, label, icon: Icon }) {
  return (
    <article className="stat-tile">
      {Icon && <span className="stat-icon"><Icon size={20} /></span>}
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  )
}

export function Toast({ message, type = 'ok' }) {
  if (!message) return null
  const Icon = type === 'info' ? Info : CheckCircle2
  return (
    <div className={`toast toast-${type}`} role="status">
      <Icon size={19} />
      <span>{message}</span>
    </div>
  )
}

export function PinPad({ value, onChange, length = 4 }) {
  const press = (digit) => {
    if (value.length >= length) return
    onChange(`${value}${digit}`)
  }
  const backspace = () => onChange(value.slice(0, -1))

  return (
    <>
      <div className="pin-dots" aria-label={`${value.length} de ${length} dígitos`}>
        {Array.from({ length }).map((_, dot) => (
          <span className={value.length > dot ? 'filled' : ''} key={dot} />
        ))}
      </div>
      <div className="pin-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button type="button" key={digit} onClick={() => press(digit)}>{digit}</button>
        ))}
        <span />
        <button type="button" onClick={() => press(0)}>0</button>
        <button type="button" aria-label="Borrar último dígito" onClick={backspace}>
          <Delete size={24} />
        </button>
      </div>
    </>
  )
}

export function MicButton({ state = 'idle', onClick }) {
  return (
    <button
      className={`mic-button mic-${state}`}
      onClick={onClick}
      aria-label={state === 'listening' ? 'Detener grabación' : 'Hablar'}
    >
      {state === 'processing' ? <span className="processing-dots"><i /><i /><i /></span> : <Mic size={34} />}
    </button>
  )
}
