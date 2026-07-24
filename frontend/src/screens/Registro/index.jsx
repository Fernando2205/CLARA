import { useState } from 'react'
import { ArrowLeft, Camera, UserPlus } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { Button, Logo, PinPad } from '../../components/ui'
import { useCamera } from '../../lib/useCamera'
import { registerUser, toStoreUser } from '../../lib/api'

export default function Registro({ onDone, onBack }) {
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [correo, setCorreo] = useState('')
  const [pin, setPin] = useState('')
  const [foto, setFoto] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const login = useAuthStore((state) => state.login)
  const { videoRef, cameraState, captureFrame } = useCamera(true)

  const tomarFoto = async () => {
    setError('')
    try {
      const blob = await captureFrame()
      setFoto(blob)
    } catch {
      setError('No pudimos tomar la foto. Verifica el permiso de cámara.')
    }
  }

  const listo = nombre.trim() && cedula.trim() && correo.trim() && pin.length === 4 && foto

  const submit = async (event) => {
    event.preventDefault()
    if (!listo) return
    setEnviando(true)
    setError('')
    try {
      const { usuario } = await registerUser({
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        correo: correo.trim(),
        pin,
        foto,
      })
      login(toStoreUser(usuario))
      onDone()
    } catch (err) {
      setError(err.message || 'No pudimos crear tu cuenta. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-shell register-shell">
        <Logo />
        <div className="pin-heading">
          <span>Alta de usuario</span>
          <h1>Crea tu cuenta</h1>
          <p>Necesitamos tus datos y una foto de tu rostro para reconocerte la próxima vez.</p>
        </div>

        <form className="register-form" onSubmit={submit}>
          <div className="register-fields">
            <label className="credentials-field">
              <span>Nombre completo</span>
              <input value={nombre} onChange={(event) => setNombre(event.target.value)} autoFocus />
            </label>
            <label className="credentials-field">
              <span>Cédula</span>
              <input value={cedula} onChange={(event) => setCedula(event.target.value)} inputMode="numeric" />
            </label>
            <label className="credentials-field">
              <span>Correo</span>
              <input type="email" value={correo} onChange={(event) => setCorreo(event.target.value)} />
            </label>
            <div className="register-pin">
              <span>PIN de 4 dígitos</span>
              <PinPad value={pin} onChange={setPin} />
            </div>
          </div>

          <div className="register-photo">
            <div className={`camera-frame camera-${cameraState}`} aria-label="Captura de rostro para registro">
              <video ref={videoRef} autoPlay muted playsInline aria-label="Video de la cámara frontal" />
            </div>
            <Button type="button" variant="secondary" icon={Camera} onClick={tomarFoto}>
              {foto ? 'Tomar otra foto' : 'Tomar foto'}
            </Button>
            {foto && <p className="register-photo-ok">Foto lista ✓</p>}
          </div>

          {error && <p className="credentials-error">{error}</p>}

          <Button type="submit" icon={UserPlus} disabled={!listo || enviando}>
            {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
          </Button>
        </form>

        <button className="link-button" onClick={onBack}>
          <ArrowLeft size={16} /> Volver al reconocimiento facial
        </button>
      </section>
    </main>
  )
}
