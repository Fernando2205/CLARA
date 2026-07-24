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
import { useAuthStore } from './stores/auth'
import { useSessionStore } from './stores/session'

const screens = ['identificacion', 'registro', 'bodega', 'mapa', 'preconteo', 'captura', 'resumen', 'reporte', 'perfil']

export default function App() {
  const [screen, setScreen] = useState('identificacion')
  const [previous, setPrevious] = useState('bodega')
  const [autoStartVoice, setAutoStartVoice] = useState(false)
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

  const handleSignOut = () => {
    signOut()
    reset()
    go('identificacion', 'back')
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <div id="main-content">
        <div className="app-stage" data-screen={screen} key={screen}>
          {screen === 'identificacion' && (
            <Identificacion onContinue={() => go('bodega')} onRegister={() => go('registro')} />
          )}
          {screen === 'registro' && (
            <Registro
              onDone={() => go('bodega')}
              onBack={() => go('identificacion', 'back')}
            />
          )}
          {screen === 'bodega' && (
            <SeleccionBodega
              onContinue={() => go('preconteo')}
              onMap={() => go('mapa')}
              onProfile={openProfile}
            />
          )}
          {screen === 'mapa' && (
            <MapaBodega onBack={() => go('bodega', 'back')} onProfile={openProfile} />
          )}
          {screen === 'preconteo' && (
            <PreConteo
              onBack={() => go('bodega', 'back')}
              onProfile={openProfile}
              onStart={() => { setAutoStartVoice(true); go('captura') }}
            />
          )}
          {screen === 'captura' && (
            <Captura
              onClose={() => go('resumen')}
              onReport={() => go('reporte')}
              onProfile={openProfile}
              onBack={() => go('bodega', 'back')}
              autoStart={autoStartVoice}
              onAutoStartHandled={() => setAutoStartVoice(false)}
            />
          )}
          {screen === 'resumen' && (
            <ResumenFirma
              onBack={() => go('captura', 'back')}
              onContinue={() => go('reporte')}
              onProfile={openProfile}
            />
          )}
          {screen === 'reporte' && (
            <ReporteEnvio
              onBack={() => go('resumen', 'back')}
              onProfile={openProfile}
              onFinish={() => go('perfil')}
            />
          )}
          {screen === 'perfil' && (
            <Perfil
              onHome={() => go(previous === 'perfil' ? 'bodega' : previous, 'back')}
              onSignOut={handleSignOut}
            />
          )}
        </div>
      </div>
    </>
  )
}
