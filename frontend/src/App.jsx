import { useState } from 'react'
import { flushSync } from 'react-dom'
import Identificacion from './screens/Identificacion'
import Registro from './screens/Registro'
import SeleccionBodega from './screens/SeleccionBodega'
import MapaBodega from './screens/MapaBodega'
import PreConteo from './screens/PreConteo'
import Captura from './screens/Captura'
import ResumenFirma from './screens/ResumenFirma'
import ReporteEnvio from './screens/ReporteEnvio'
import Perfil from './screens/Perfil'
import { LogIn } from 'lucide-react'
import { Button, Logo } from './components/ui'
import { useAuthStore } from './stores/auth'
import { useSessionStore } from './stores/session'

function SignOutSplash ({ onLogin }) {
  return (
    <div className='signout-splash'>
      <Logo light />
      <Button variant='secondary' icon={LogIn} onClick={onLogin}>Iniciar sesión</Button>
    </div>
  )
}

const screens = ['identificacion', 'registro', 'bodega', 'mapa', 'preconteo', 'captura', 'resumen', 'reporte', 'perfil']

export default function App () {
  // Si ya había una sesión guardada (stores/auth.js persiste en
  // localStorage), una recarga de página no debe mandar de vuelta a
  // identificarse — arranca directo en la selección de bodega.
  const [screen, setScreen] = useState(() => (
    useAuthStore.getState().authenticated ? 'bodega' : 'identificacion'
  ))
  const [previous, setPrevious] = useState('bodega')
  const [resumenFrom, setResumenFrom] = useState('captura')
  const [autoStartVoice, setAutoStartVoice] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  // Al reenviar una toma firmada desde el historial (Perfil), P5 debe
  // trabajar sobre ESA sesión pasada, no la activa del store.
  const [reportOverride, setReportOverride] = useState(null)
  const signOut = useAuthStore((state) => state.logout)
  const reset = useSessionStore((state) => state.reset)

  const go = (next, forcedDirection) => {
    if (!screens.includes(next) || next === screen) return

    const currentIndex = screens.indexOf(screen)
    const nextIndex = screens.indexOf(next)
    const direction = forcedDirection || (nextIndex >= currentIndex ? 'forward' : 'back')
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const changeScreen = () => {
      setScreen(next)
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }

    document.documentElement.dataset.transitionDirection = direction
    document.activeElement?.blur()

    if (document.startViewTransition && !reduceMotion) {
      const transition = document.startViewTransition(() => {
        flushSync(changeScreen)
      })
      transition.finished.finally(() => {
        delete document.documentElement.dataset.transitionDirection
      })
    } else {
      changeScreen()
      window.setTimeout(() => {
        delete document.documentElement.dataset.transitionDirection
      }, 380)
    }
  }

  const openProfile = () => {
    setPrevious(screen)
    go('perfil', 'forward')
  }

  const resendHistoricReport = (session) => {
    setReportOverride(session)
    setPrevious('perfil')
    go('reporte', 'forward')
  }

  const handleSignOut = () => {
    // signingOut reemplaza la pantalla de Perfil en el mismo render en que
    // se limpia el usuario, para que nunca quede montada leyendo `user` nulo.
    // Se queda en esta pantalla hasta que el usuario pida iniciar sesión.
    setSigningOut(true)
    signOut()
    reset()
  }

  const goToLogin = () => {
    setScreen('identificacion')
    setPrevious('bodega')
    setSigningOut(false)
  }

  return (
    <>
      <a className='skip-link' href='#main-content'>Saltar al contenido</a>
      <div id='main-content'>
        <div className='app-stage' data-screen={screen} key={screen}>
          {signingOut && <SignOutSplash onLogin={goToLogin} />}
          {!signingOut && screen === 'identificacion' && (
            <Identificacion onContinue={() => go('bodega')} onRegister={() => go('registro')} />
          )}
          {!signingOut && screen === 'registro' && (
            <Registro
              onDone={() => go('bodega')}
              onBack={() => go('identificacion', 'back')}
            />
          )}
          {!signingOut && screen === 'bodega' && (
            <SeleccionBodega
              onContinue={() => go('preconteo')}
              onMap={() => go('mapa')}
              onProfile={openProfile}
            />
          )}
          {!signingOut && screen === 'mapa' && (
            <MapaBodega
              onBack={() => go('bodega', 'back')}
              onProfile={openProfile}
              onStart={() => go('preconteo')}
              onClose={() => { setResumenFrom('mapa'); go('resumen') }}
            />
          )}
          {!signingOut && screen === 'preconteo' && (
            <PreConteo
              onBack={() => go('bodega', 'back')}
              onProfile={openProfile}
              onStart={() => { setAutoStartVoice(true); go('captura') }}
            />
          )}
          {!signingOut && screen === 'captura' && (
            <Captura
              onClose={() => { setResumenFrom('captura'); go('resumen') }}
              onReport={() => go('reporte')}
              onProfile={openProfile}
              onBack={() => go('bodega', 'back')}
              autoStart={autoStartVoice}
              onAutoStartHandled={() => setAutoStartVoice(false)}
            />
          )}
          {!signingOut && screen === 'resumen' && (
            <ResumenFirma
              onBack={() => go(resumenFrom, 'back')}
              onContinue={() => go('reporte')}
              onProfile={openProfile}
            />
          )}
          {!signingOut && screen === 'reporte' && (
            <ReporteEnvio
              onBack={() => {
                const backTo = reportOverride ? 'perfil' : 'resumen'
                setReportOverride(null)
                go(backTo, 'back')
              }}
              onProfile={openProfile}
              onFinish={() => { setReportOverride(null); go('perfil') }}
              sessionIdOverride={reportOverride?.sessionId}
              warehouseOverride={reportOverride?.warehouse}
              bodegaLabelOverride={reportOverride?.bodegaLabel}
            />
          )}
          {!signingOut && screen === 'perfil' && (
            <Perfil
              onHome={() => go(previous === 'perfil' ? 'bodega' : previous, 'back')}
              onSignOut={handleSignOut}
              onResend={resendHistoricReport}
            />
          )}
        </div>
      </div>
    </>
  )
}
