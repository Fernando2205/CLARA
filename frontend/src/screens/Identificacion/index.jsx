import { useEffect, useRef, useState } from 'react'
import { KeyRound, ScanFace, UserPlus } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { Button, Logo, PinPad } from '../../components/ui'
import { useCamera } from '../../lib/useCamera'
import { credentialsLogin, faceLogin, toStoreUser } from '../../lib/api'

const MAX_ATTEMPTS = 4
const ATTEMPT_INTERVAL_MS = 1800

export default function Identificacion({ onContinue, onRegister }) {
  const [stage, setStage] = useState('face')
  const [statusText, setStatusText] = useState('Buscando tu rostro…')
  const [identidad, setIdentidad] = useState('')
  const [pin, setPin] = useState('')
  const [credencialesError, setCredencialesError] = useState('')
  const [verificando, setVerificando] = useState(false)
  const attemptsRef = useRef(0)
  const busyRef = useRef(false)
  const login = useAuthStore((state) => state.login)
  const { videoRef, cameraState, captureFrame } = useCamera(stage === 'face')

  useEffect(() => {
    if (stage !== 'face' || cameraState !== 'live') return undefined

    let cancelled = false
    const attempt = async () => {
      if (busyRef.current || cancelled) return
      busyRef.current = true
      try {
        const blob = await captureFrame()
        const result = await faceLogin(blob)
        if (cancelled) return
        if (result.resultado === 'confirmado') {
          setStatusText('¡Listo! Te reconocimos.')
          login(toStoreUser(result.usuario))
          onContinue()
          return
        }
        attemptsRef.current += 1
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setStage('credenciales')
        } else {
          setStatusText('No logramos confirmarte, intentando de nuevo…')
        }
      } catch {
        attemptsRef.current += 1
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          setStage('credenciales')
        }
      } finally {
        busyRef.current = false
      }
    }

    const interval = window.setInterval(attempt, ATTEMPT_INTERVAL_MS)
    attempt()
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [stage, cameraState])

  const submitCredentials = async (event) => {
    event.preventDefault()
    if (!identidad.trim() || pin.length !== 4) return
    setVerificando(true)
    setCredencialesError('')
    try {
      const usuario = await credentialsLogin({ usuario: identidad.trim(), password: pin })
      login(toStoreUser(usuario))
      onContinue()
    } catch {
      setCredencialesError('Credenciales inválidas. Verifica tu cédula/nombre y PIN.')
      setPin('')
    } finally {
      setVerificando(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className={`auth-shell auth-shell-${stage}`}>
        <Logo />

        {stage === 'face' ? (
          <div className="face-stage">
            <div className={`camera-frame camera-${cameraState}`} aria-label="Vista de reconocimiento facial">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Video de la cámara frontal" />
              <span className="scan-line" />
            </div>

            <div className="face-status" role="status" aria-live="polite">
              <ScanFace size={19} />
              <span>{cameraState === 'live' ? statusText : 'Activa tu cámara para reconocerte'}</span>
            </div>

            <div className="face-actions">
              <Button variant="secondary" icon={KeyRound} onClick={() => setStage('credenciales')}>
                Usar credenciales
              </Button>
              <button className="link-button pin-entry-link" onClick={onRegister}>
                <UserPlus size={16} /> ¿Nuevo aquí? Regístrate
              </button>
            </div>
          </div>
        ) : (
          <div className="pin-stage">
            <div className="pin-heading">
              <span>Acceso alternativo</span>
              <h1>Ingresa tus credenciales</h1>
              <p>Escribe tu cédula o nombre y tu PIN de cuatro dígitos.</p>
            </div>
            <form className="credentials-form" onSubmit={submitCredentials}>
              <label className="credentials-field">
                <span>Cédula o nombre</span>
                <input
                  value={identidad}
                  onChange={(event) => setIdentidad(event.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </label>
              <PinPad value={pin} onChange={setPin} />
              {credencialesError && <p className="credentials-error">{credencialesError}</p>}
              <Button type="submit" disabled={!identidad.trim() || pin.length !== 4 || verificando}>
                {verificando ? 'Verificando…' : 'Entrar'}
              </Button>
            </form>
            <button className="link-button" onClick={onRegister}>
              <UserPlus size={16} /> ¿Nuevo aquí? Regístrate
            </button>
            <button className="link-button" onClick={() => { attemptsRef.current = 0; setStage('face') }}>
              Volver al reconocimiento facial
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
