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
import { CATEGORY_ICON_PATHS } from '../lib/categories'

export function CategoryIcon ({ id, size = 15 }) {
  return (
    <svg
      viewBox='0 0 24 24' width={size} height={size} fill='none' stroke='currentColor'
      strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'
      dangerouslySetInnerHTML={{ __html: CATEGORY_ICON_PATHS[id] || CATEGORY_ICON_PATHS.general }}
    />
  )
}

export function Tangram ({ size = 32, className = '' }) {
  const height = Math.round(size * (80.6 / 62.4))
  return (
    <svg
      aria-hidden='true'
      className={className}
      height={height}
      viewBox='0 0 62.4 80.6'
      width={size}
    >
      <path
        fill='#FFD000'
        fillRule='evenodd'
        d='M26.8,60.8 L10.1,60.8 L9.4,61.6 L9.4,78.0 L9.9,78.5 L10.4,78.5 L26.8,62.1 Z M27.8,41.3 L27.3,40.8 L26.5,41.1 L10.4,57.2 L10.4,58.2 L27.3,58.2 L27.8,57.2 Z M34.1,34.8 L32.8,34.8 L30.2,37.4 L29.9,38.5 L30.4,57.7 L31.2,57.7 L43.4,45.2 L43.4,44.2 Z M2.1,26.3 L2.1,27.3 L18.2,43.4 L19.2,43.4 L19.5,27.6 L19.0,26.3 Z M21.8,23.4 L21.8,41.6 L22.4,41.9 L30.4,34.1 L31.2,32.8 L31.2,32.0 L22.6,23.4 Z M25.7,21.8 L25.5,22.9 L43.7,41.1 L44.5,41.1 L44.7,22.4 L44.2,21.8 Z M47.3,3.9 L47.3,16.6 L47.8,17.2 L60.1,17.2 L60.3,16.4 L47.8,3.9 Z M44.5,2.1 L43.4,2.3 L27.6,18.5 L28.1,19.5 L44.5,19.2 Z'
      />
    </svg>
  )
}

export function Logo ({ light = false }) {
  return (
    <div className='brand' aria-label='CLARA'>
      <Tangram size={30} />
      <span className={light ? 'brand-light' : ''}>CLARA</span>
    </div>
  )
}

export function Avatar ({ initials = 'SV', size = 'md' }) {
  return <span className={`avatar avatar-${size}`} aria-label='Sofía Valencia'>{initials}</span>
}

export function Button ({ children, variant = 'primary', icon: Icon, className = '', ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {Icon && <Icon aria-hidden='true' size={19} />}
      <span>{children}</span>
    </button>
  )
}

export function TopBar ({ title, online, onNetwork, onProfile, onBack, backLabel = 'Volver' }) {
  return (
    <header className='topbar'>
      <div className='topbar-left'>
        {onBack
          ? (
            <button className='icon-text-button on-blue' onClick={onBack} aria-label={backLabel}>
              <RotateCcw size={19} />
              <span>{backLabel}</span>
            </button>
            )
          : <Logo light />}
        {title && <span className='topbar-divider' aria-hidden='true' />}
        {title && <strong className='topbar-title'>{title}</strong>}
      </div>
      <div className='topbar-actions'>
        {typeof online === 'boolean' && (
          <button className={`network-chip ${online ? '' : 'offline'}`} onClick={onNetwork}>
            {online ? <Wifi size={15} /> : <CloudOff size={15} />}
            <span>{online ? 'En línea' : 'Guardando local'}</span>
          </button>
        )}
        <button className='avatar-button' onClick={onProfile} aria-label='Abrir perfil'>
          <Avatar size='sm' />
        </button>
      </div>
    </header>
  )
}

export function Progress ({ current, total, alerts }) {
  const value = Math.min(100, Math.round((current / total) * 100))
  return (
    <div className='progress-block'>
      <div className='progress-copy'>
        <span>{current} de {total}</span>
        {alerts != null && <span>{alerts} alertas resueltas</span>}
      </div>
      <div
        className='progress-track'
        role='progressbar'
        aria-valuemin='0'
        aria-valuemax={total}
        aria-valuenow={current}
      >
        <span style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function ConfidenceChip ({ value }) {
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

export function Badge ({ type }) {
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

export function InlineAlert ({ alert, resolved, onResolve }) {
  const Icon = alert.level === 'info' ? Info : AlertTriangle
  const actions = alert.actions?.length
    ? alert.actions
    : [{ label: alert.action || 'Entendido', value: 'acknowledge' }]
  return (
    <div className={`inline-alert alert-${alert.level} ${resolved ? 'resolved' : ''}`}>
      <div className='inline-alert-message'>
        {resolved ? <CheckCircle2 size={18} /> : <Icon size={18} />}
        <span>{resolved ? `${alert.rule || 'Alerta'} resuelta.` : alert.message}</span>
      </div>
      {!resolved && (
        <>
          {(alert.reason || alert.recommendation) && (
            <div className='inline-alert-explanation'>
              {alert.reason && (
                <p><CircleHelp size={15} /><span><strong>Por qué:</strong> {alert.reason}</span></p>
              )}
              {alert.recommendation && (
                <p><Lightbulb size={15} /><span><strong>Recomendación:</strong> {alert.recommendation}</span></p>
              )}
            </div>
          )}
          <div className='inline-alert-actions'>
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

export function StatTile ({ value, label, icon: Icon }) {
  return (
    <article className='stat-tile'>
      {Icon && <span className='stat-icon'><Icon size={20} /></span>}
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  )
}

export function Toast ({ message, type = 'ok' }) {
  if (!message) return null
  const Icon = type === 'info' ? Info : CheckCircle2
  return (
    <div className={`toast toast-${type}`} role='status'>
      <Icon size={19} />
      <span>{message}</span>
    </div>
  )
}

export function PinPad ({ value, onChange, length = 4 }) {
  const press = (digit) => {
    if (value.length >= length) return
    onChange(`${value}${digit}`)
  }
  const backspace = () => onChange(value.slice(0, -1))

  return (
    <div className='pin-pad'>
      <div className='pin-dots' aria-label={`${value.length} de ${length} dígitos`}>
        {Array.from({ length }).map((_, dot) => (
          <span className={value.length > dot ? 'filled' : ''} key={dot} />
        ))}
      </div>
      <div className='pin-grid'>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button type='button' key={digit} onClick={() => press(digit)}>{digit}</button>
        ))}
        <span />
        <button type='button' onClick={() => press(0)}>0</button>
        <button type='button' aria-label='Borrar último dígito' onClick={backspace}>
          <Delete size={24} />
        </button>
      </div>
    </div>
  )
}

export function MicButton ({ state = 'idle', onClick }) {
  return (
    <button
      className={`mic-button mic-${state}`}
      onClick={onClick}
      aria-label={state === 'listening' ? 'Detener grabación' : 'Hablar'}
    >
      {state === 'processing' ? <span className='processing-dots'><i /><i /><i /></span> : <Mic size={34} />}
    </button>
  )
}
