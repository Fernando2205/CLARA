import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Delete, ScanFace, UserRoundX } from 'lucide-react'
import referenceMockup from '../../../../docs/disenos/P0_facial.png'
import { useAuthStore } from '../../stores/auth'
import { Avatar, Button, Logo } from '../../components/ui'

export default function Identificacion({ onContinue }) {
  const [stage, setStage] = useState('face')
  const [pin, setPin] = useState('')
  const [cameraState, setCameraState] = useState('fallback')
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const authenticate = useAuthStore((state) => state.authenticate)
  const user = useAuthStore((state) => state.user)

  useEffect(() => {
    if (stage !== 'face') return undefined

    let active = true
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('fallback')
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        })
        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setCameraState('live')
        }
      } catch {
        setCameraState('fallback')
      }
    }

    startCamera()
    return () => {
      active = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [stage])

  const finishAuthentication = () => {
    authenticate()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    onContinue()
  }

  const confirmPin = (nextPin) => {
    if (nextPin === '1234') {
      finishAuthentication()
    } else if (nextPin.length === 4) {
      setPin('')
    }
  }

  const press = (digit) => {
    if (pin.length >= 4) return
    const nextPin = `${pin}${digit}`
    setPin(nextPin)
    window.setTimeout(() => confirmPin(nextPin), 120)
  }

  return (
    <main className="auth-screen">
      <section className={`auth-shell auth-shell-${stage}`}>
        <Logo />

        {stage === 'face' ? (
          <div className="face-stage">
            <div className={`camera-frame camera-${cameraState}`} aria-label="Vista de reconocimiento facial">
              <div
                className="camera-reference"
                style={{ backgroundImage: `url(${referenceMockup})` }}
                aria-hidden="true"
              />
              <video ref={videoRef} autoPlay muted playsInline aria-label="Video de la cámara frontal" />
              <span className="scan-line" />
            </div>

            <div className="face-status" role="status" aria-live="polite">
              <ScanFace size={19} />
              <span>Buscando tu rostro…</span>
            </div>

            <article className="recognition-card">
              <Avatar initials="S" size="lg" />
              <div>
                <h1>Hola, {user.nombreCorto}</h1>
                <p>{user.cargo} · Bodega Refrigerados · {user.turno}</p>
              </div>
            </article>

            <div className="face-actions">
              <Button icon={CheckCircle2} onClick={finishAuthentication}>Confirmar</Button>
              <Button variant="secondary" icon={UserRoundX} onClick={() => setStage('pin')}>No soy yo</Button>
            </div>

            <button className="link-button pin-entry-link" onClick={() => setStage('pin')}>
              <span aria-hidden="true">•••</span> Entrar con PIN
            </button>
          </div>
        ) : (
          <div className="pin-stage">
            <div className="pin-heading">
              <span>Acceso alternativo</span>
              <h1>Ingresa tu PIN</h1>
              <p>Usa tu clave de cuatro dígitos para continuar.</p>
            </div>
            <div className="pin-profile">
              <Avatar />
              <div>
                <strong>{user.nombre}</strong>
                <span>{user.cargo} · {user.turno}</span>
              </div>
            </div>
            <div className="pin-dots" aria-label={`${pin.length} de 4 dígitos`}>
              {[0, 1, 2, 3].map((dot) => <span className={pin.length > dot ? 'filled' : ''} key={dot} />)}
            </div>
            <div className="pin-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button key={digit} onClick={() => press(digit)}>{digit}</button>
              ))}
              <span />
              <button onClick={() => press(0)}>0</button>
              <button aria-label="Borrar último dígito" onClick={() => setPin((value) => value.slice(0, -1))}>
                <Delete size={24} />
              </button>
            </div>
            <p className="pin-hint">PIN de demostración: 1234</p>
            <button className="link-button" onClick={() => setStage('face')}>Volver al reconocimiento facial</button>
          </div>
        )}
      </section>
    </main>
  )
}
