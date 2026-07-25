import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, UserPlus } from 'lucide-react'
import { useAuthStore } from '../../stores/auth'
import { Button, Logo, PinPad } from '../../components/ui'
import { SignatureField } from '../../components/SignaturePad'
import { useCamera } from '../../lib/useCamera'
import { captureDescriptor, loadModels, saveToGallery } from '../../lib/facial'
import { registerUser, toStoreUser } from '../../lib/api'

export default function Registro ({ onDone, onBack }) {
  const [nombre, setNombre] = useState('')
  const [cedula, setCedula] = useState('')
  const [correo, setCorreo] = useState('')
  const [pin, setPin] = useState('')
  const [rostroListo, setRostroListo] = useState(false)
  const [enrolando, setEnrolando] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [modelosListos, setModelosListos] = useState(false)
  const [modelosError, setModelosError] = useState(false)
  const login = useAuthStore((state) => state.login)
  const { videoRef, cameraState } = useCamera(true)
  const firmaRef = useRef(null)
  // El descriptor facial se calcula en el dispositivo (lib/facial.js) y solo
  // se persiste en localStorage tras crear la cuenta; ninguna imagen de
  // rostro viaja al backend.
  const descriptorRef = useRef(null)

  useEffect(() => {
    let active = true
    loadModels()
      .then(() => { if (active) setModelosListos(true) })
      .catch(() => { if (active) setModelosError(true) })
    return () => { active = false }
  }, [])

  const capturarRostro = async () => {
    setError('')
    setEnrolando(true)
    try {
      descriptorRef.current = await captureDescriptor(videoRef.current)
      setRostroListo(true)
    } catch (err) {
      setError(err.message || 'No pudimos leer tu rostro. Verifica el permiso de cámara e inténtalo de nuevo.')
    } finally {
      setEnrolando(false)
    }
  }

  const listo = nombre.trim() && cedula.trim() && correo.trim() && pin.length === 4 && rostroListo

  const submit = async (event) => {
    event.preventDefault()
    if (!listo) return
    if (firmaRef.current?.isEmpty()) {
      setError('Dibuja tu firma antes de crear la cuenta.')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const firma = await firmaRef.current.toBlob()
      const { usuario } = await registerUser({
        nombre: nombre.trim(),
        cedula: cedula.trim(),
        correo: correo.trim(),
        pin,
        firma,
      })
      saveToGallery(descriptorRef.current, usuario)
      login(toStoreUser(usuario))
      onDone()
    } catch (err) {
      setError(err.message || 'No pudimos crear tu cuenta. Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className='auth-screen'>
      <section className='auth-shell register-shell'>
        <Logo />
        <div className='pin-heading'>
          <span>Alta de usuario</span>
          <h1>Crea tu cuenta</h1>
          <p>Necesitamos tus datos, una foto de tu rostro para reconocerte y tu firma para sellar tus reportes.</p>
        </div>

        <form className='register-form' onSubmit={submit}>
          <div className='register-fields'>
            <label className='credentials-field'>
              <span>Nombre completo</span>
              <input value={nombre} onChange={(event) => setNombre(event.target.value)} autoFocus />
            </label>
            <label className='credentials-field'>
              <span>Cédula</span>
              <input value={cedula} onChange={(event) => setCedula(event.target.value)} inputMode='numeric' />
            </label>
            <label className='credentials-field'>
              <span>Correo</span>
              <input type='email' value={correo} onChange={(event) => setCorreo(event.target.value)} />
            </label>
            <div className='register-pin'>
              <span>PIN de 4 dígitos</span>
              <PinPad value={pin} onChange={setPin} />
            </div>
          </div>

          <div className='register-photo'>
            <div className={`camera-frame camera-${cameraState}`} aria-label='Captura de rostro para registro'>
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
                No pudimos cargar el reconocimiento facial. Verifica tu conexión y recarga la página.
              </p>
            )}
            <Button
              type='button'
              variant='secondary'
              icon={Camera}
              onClick={capturarRostro}
              disabled={enrolando || !modelosListos}
            >
              {enrolando ? 'Leyendo tu rostro…' : rostroListo ? 'Capturar de nuevo' : 'Capturar rostro'}
            </Button>
            {rostroListo && <p className='register-photo-ok'>Rostro listo ✓ (se guarda solo en este dispositivo)</p>}
          </div>

          <div className='register-signature'>
            <span className='credentials-field-label'>Tu firma</span>
            <SignatureField padRef={firmaRef} width={420} height={150} />
          </div>

          {error && <p className='credentials-error'>{error}</p>}

          <Button type='submit' icon={UserPlus} disabled={!listo || enviando}>
            {enviando ? 'Creando cuenta…' : 'Crear cuenta'}
          </Button>
        </form>

        <button className='link-button' onClick={onBack}>
          <ArrowLeft size={16} /> Volver al reconocimiento facial
        </button>
      </section>
    </main>
  )
}
