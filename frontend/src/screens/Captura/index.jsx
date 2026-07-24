import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Keyboard,
  PackageSearch,
  Repeat2,
  Send,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import InventoryDrawer from '../../components/InventoryDrawer'
import RegistroCard from '../../components/RegistroCard'
import SessionPanel from '../../components/SessionPanel'
import { Avatar, Button, MicButton, Tangram, Toast, TopBar } from '../../components/ui'
import { askClara, createSession, saveInventoryRecord } from '../../lib/api'
import { parseInventoryPhrase, validateInventoryRecord } from '../../lib/parser'
import { listenOnce, speakNatural, stopSpeaking } from '../../lib/voice'
import { useAuthStore } from '../../stores/auth'
import { useSessionStore } from '../../stores/session'

const prompts = [
  '¿Tenemos leche?',
  'Muéstrame todo el inventario',
  'Quedan noventa kilos de ajonjolí',
  'Quedan nueve cajas de harina',
  '¿Por qué dudas?',
]

const MAX_VISIBLE_MESSAGES = 8

const catalogUnits = {
  Unidad: 'unidades',
  Kilogram: 'kilogramos',
  Liter: 'litros',
  Portion: 'porciones',
}

function mapAlternative(item) {
  return {
    articleId: item.id,
    name: item.nombre,
    sku: item.sku,
    unit: catalogUnits[item.unidad] || item.unidad || 'unidades',
    catalogUnit: item.unidad,
    stock: item.stock_sistema ?? 0,
    warehouse: item.bodega,
    confidence: item.confianza ?? 0.5,
  }
}

function mapBackendExtraction(response, phrase, warehouse, records, spokenIntro) {
  if (response.tipo === 'correccion') {
    const previous = records[0]
    if (!previous) {
      return {
        type: 'no_match',
        phrase,
        message: 'No hay un registro anterior para corregir.',
        alternatives: [],
        spokenIntro,
      }
    }
    return {
      ...previous,
      type: 'record',
      phrase,
      isCorrection: true,
      oldQuantity: previous.quantity,
      quantity: response.cantidad,
      spokenUnit: response.unidad_dicha || previous.unit,
      alerts: [],
      source: response.origen,
      spokenIntro,
    }
  }

  const alternatives = (response.alternativas || []).map(mapAlternative)
  if (response.tipo === 'no_match' || !response.articulo) {
    return {
      type: 'no_match',
      phrase,
      message: 'No encontré una coincidencia segura en el catálogo.',
      alternatives,
      source: response.origen,
      spokenIntro,
    }
  }

  if (response.requiere_seleccion) {
    const primary = mapAlternative({
      ...response.articulo,
      confianza: response.confianza_match,
    })
    return {
      type: 'selection',
      phrase,
      productText: response.articulo.nombre,
      quantity: response.cantidad,
      spokenUnit: response.unidad_dicha,
      state: response.estado_producto,
      options: [primary, ...alternatives],
      alternatives: [],
      source: response.origen,
      spokenIntro,
    }
  }

  const record = {
    type: 'record',
    phrase,
    articleId: response.articulo.id,
    name: response.articulo.nombre,
    sku: response.articulo.sku,
    unit: catalogUnits[response.articulo.unidad] || response.articulo.unidad,
    catalogUnit: response.articulo.unidad,
    stock: response.articulo.stock_sistema,
    warehouse: response.articulo.bodega,
    quantity: response.cantidad,
    spokenUnit: response.unidad_dicha,
    state: response.estado_producto,
    confidence: response.confianza_match,
    alternatives,
    otherWarehouse: response.articulo.bodega !== warehouse,
    source: response.origen,
    spokenIntro,
  }
  record.alerts = validateInventoryRecord(record, records)
  return record
}

function alertSpeech(alert) {
  const prefix = {
    V1: 'Un momento. ',
    V2: 'Espera, ',
    V5: 'Un momento, ',
  }[alert.rule] || ''
  return `${prefix}${alert.message}`
}

function isConversationalQuery(phrase) {
  const normalized = phrase.toLocaleLowerCase('es-CO')
  return /(tenemos|hay|queda|existencias|inventario|por qué|por que|ayuda)/.test(normalized)
    && !/\d/.test(normalized)
}

export default function Captura({ onClose, onReport, onProfile, onBack, autoStart, onAutoStartHandled }) {
  const userId = useAuthStore((state) => state.user.id)
  const warehouse = useSessionStore((state) => state.bodega)
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const records = useSessionStore((state) => state.records)
  const total = useSessionStore((state) => state.totalRefs)
  const baselineCount = useSessionStore((state) => state.baselineCount)
  const online = useSessionStore((state) => state.online)
  const toggleOnline = useSessionStore((state) => state.toggleOnline)
  const addRecord = useSessionStore((state) => state.addRecord)
  const updateRecord = useSessionStore((state) => state.updateRecord)
  const undoLast = useSessionStore((state) => state.undoLast)
  const alertsResolved = useSessionStore((state) => state.alertsResolved)
  const mode = useSessionStore((state) => state.mode)
  const sessionId = useSessionStore((state) => state.sessionId)
  const setSessionId = useSessionStore((state) => state.setSessionId)
  const [input, setInput] = useState('')
  const [interim, setInterim] = useState('')
  const [voiceState, setVoiceState] = useState('idle')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [lastSpoken, setLastSpoken] = useState('')
  const [activeCaption, setActiveCaption] = useState('')
  const [pending, setPending] = useState(null)
  const [quantity, setQuantity] = useState(null)
  const [resolvedAlerts, setResolvedAlerts] = useState(new Set())
  const [duplicateAction, setDuplicateAction] = useState(null)
  const [messages, setMessages] = useState([{
    id: 'welcome',
    role: 'assistant',
    text: 'Te escucho. Puedes dictar un conteo o preguntarme qué tenemos en esta bodega.',
    meta: 'Asistente de inventario',
  }])
  const [toast, setToast] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [inventoryOpen, setInventoryOpen] = useState(false)
  const [autoListen, setAutoListen] = useState(false)
  const listener = useRef(null)
  const conversationScroll = useRef(null)
  const speechSequence = useRef(0)
  const spokenCardSignature = useRef('')
  const currentCount = baselineCount + records.length

  useEffect(() => {
    if (!online || sessionId) return undefined
    let active = true
    createSession({ userId, warehouse, mode })
      .then((created) => {
        if (active) setSessionId(created.sesion_id)
      })
      .catch(() => {
        // El modo local sigue disponible y se reintentará al volver a entrar.
      })
    return () => { active = false }
  }, [mode, online, sessionId, setSessionId, userId, warehouse])

  useEffect(() => {
    const panel = conversationScroll.current
    if (!panel) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.requestAnimationFrame(() => {
      panel.scrollTo({
        top: panel.scrollHeight,
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
  }, [activeCaption, messages, pending, voiceState])

  useEffect(() => () => stopSpeaking(), [])

  useEffect(() => {
    if (!autoStart) return
    setAutoListen(true)
    listener.current = listenOnce({
      onStart: () => setVoiceState('listening'),
      onInterim: setInterim,
      onFinal: processPhrase,
      onError: (message) => {
        setVoiceState('idle')
        showToast(message)
      },
    })
    if (listener.current.supported === false) setAutoListen(false)
    onAutoStartHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!autoListen || voiceState !== 'idle') return undefined
    const timer = window.setTimeout(() => startListening(), 550)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoListen, voiceState])

  const showToast = useCallback((message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }, [])

  const appendMessage = useCallback((role, text, meta) => {
    setMessages((current) => {
      const next = [
        ...current,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role,
          text,
          meta,
        },
      ]
      return next.slice(-MAX_VISIBLE_MESSAGES)
    })
  }, [])

  const speakResponse = useCallback(async (text) => {
    if (!voiceEnabled || !text) return
    const sequence = speechSequence.current + 1
    speechSequence.current = sequence
    setLastSpoken(text)
    setActiveCaption('')
    setVoiceState('speaking')
    await speakNatural(text, {
      onStart: () => {
        if (speechSequence.current === sequence) {
          setActiveCaption(text)
          setVoiceState('speaking')
        }
      },
      onEnd: () => {
        if (speechSequence.current === sequence) {
          setActiveCaption('')
          setVoiceState('idle')
        }
      },
      onError: () => {
        if (speechSequence.current === sequence) {
          setActiveCaption('')
          setVoiceState('idle')
          showToast('La voz natural no está disponible. Revisa la conexión con el backend.')
        }
      },
    })
  }, [showToast, voiceEnabled])

  useEffect(() => {
    if (!pending || !voiceEnabled) return
    const alerts = pending.alerts || []
    const firstAlert = alerts.find((alert) => !resolvedAlerts.has(alert.rule))
    const text = firstAlert
      ? alertSpeech(firstAlert)
      : pending.spokenIntro || pending.message
    const signature = `${pending.name || pending.phrase}-${firstAlert?.rule || 'summary'}`
    if (!text || spokenCardSignature.current === signature) return
    spokenCardSignature.current = signature
    speakResponse(text)
  }, [pending, resolvedAlerts, speakResponse, voiceEnabled])

  const clearPending = () => {
    setPending(null)
    setQuantity(null)
    setResolvedAlerts(new Set())
    setDuplicateAction(null)
    spokenCardSignature.current = ''
  }

  const currentAlertContext = () => {
    const alert = pending?.alerts?.find((item) => !resolvedAlerts.has(item.rule))
    return alert ? alertSpeech(alert) : null
  }

  const processPhrase = async (phrase) => {
    const clean = phrase.trim()
    if (!clean) return
    speechSequence.current += 1
    stopSpeaking()
    setActiveCaption('')
    setInput('')
    setInterim('')
    appendMessage('user', clean, 'Tú')
    setVoiceState('processing')
    try {
      const response = await askClara({
        phrase: clean,
        warehouse,
        sessionId,
        lastSku: records[0]?.sku,
        alertContext: currentAlertContext(),
      })
      const spokenMessage = response.mensaje_hablado || response.mensaje

      if (response.accion_ui === 'mostrar_inventario') {
        appendMessage('assistant', response.mensaje, 'CLARA · resumen')
        setInventoryOpen(true)
        await speakResponse(spokenMessage)
        return
      }

      if (response.accion_ui === 'mostrar_tarjeta' && response.extraccion) {
        const parsed = mapBackendExtraction(
          response.extraccion,
          clean,
          warehouse,
          records,
          spokenMessage,
        )
        spokenCardSignature.current = ''
        setPending(parsed)
        setQuantity(parsed.quantity ?? null)
        setResolvedAlerts(new Set())
        setDuplicateAction(null)
        return
      }

      appendMessage('assistant', response.mensaje, 'CLARA')
      await speakResponse(spokenMessage)
    } catch {
      if (isConversationalQuery(clean)) {
        const message = 'Estoy trabajando en modo local. Puedo seguir capturando conteos, pero necesito el backend para consultar existencias.'
        appendMessage('assistant', message, 'CLARA · modo local')
        await speakResponse(message)
      } else {
        const parsed = parseInventoryPhrase(clean, { warehouse, records })
        const localRecord = {
          ...parsed,
          source: 'local',
          spokenIntro: parsed.message || `Entendí ${parsed.quantity ?? ''} ${parsed.unit || ''} de ${parsed.name || 'ese producto'}.`,
        }
        spokenCardSignature.current = ''
        setPending(localRecord)
        setQuantity(parsed.quantity ?? null)
        setResolvedAlerts(new Set())
        setDuplicateAction(null)
        showToast('Backend no disponible: continuamos en modo local.')
      }
    } finally {
      setVoiceState((current) => (current === 'processing' ? 'idle' : current))
    }
  }

  const startListening = () => {
    speechSequence.current += 1
    stopSpeaking()
    setActiveCaption('')
    listener.current = listenOnce({
      onStart: () => setVoiceState('listening'),
      onInterim: setInterim,
      onFinal: processPhrase,
      onError: (message) => {
        setVoiceState('idle')
        showToast(message)
      },
    })
    if (listener.current.supported === false) setAutoListen(false)
  }

  const toggleVoice = () => {
    if (voiceState === 'listening') {
      setAutoListen(false)
      speechSequence.current += 1
      stopSpeaking()
      setActiveCaption('')
      listener.current?.stop()
      setVoiceState('idle')
      return
    }
    startListening()
  }

  const stopContinuousListening = () => {
    setAutoListen(false)
    speechSequence.current += 1
    stopSpeaking()
    setActiveCaption('')
    listener.current?.stop()
    setVoiceState('idle')
    showToast('Escucha continua detenida.')
  }

  const toggleSpokenResponses = () => {
    if (voiceEnabled) {
      speechSequence.current += 1
      stopSpeaking()
      setActiveCaption('')
      setVoiceState('idle')
      setVoiceEnabled(false)
      showToast('Respuestas habladas desactivadas.')
    } else {
      setVoiceEnabled(true)
      showToast('Respuestas habladas activadas.')
    }
  }

  const resolveRule = (rule) => {
    setResolvedAlerts((current) => new Set([...current, rule]))
  }

  const changeQuantity = (value) => {
    setQuantity(value)
    if (value != null) resolveRule('V3')
    if (value != null && value % 1 === 0) resolveRule('V6')
    if (pending?.quantity !== value) resolveRule('V1')
  }

  const resolveAlert = (alert, action) => {
    if (action.value === 'cancel') {
      clearPending()
      showToast('Registro cancelado. Puedes dictarlo otra vez.')
      return
    }
    if (action.value === 'round') changeQuantity(Math.round(Number(quantity || 0)))
    if (action.value === 'factor') {
      changeQuantity(Number(quantity || 0) * action.factor)
      setPending((current) => ({ ...current, spokenUnit: current.unit }))
    }
    if (action.value === 'use-catalog-unit') {
      setPending((current) => ({ ...current, spokenUnit: current.unit }))
    }
    if (action.value === 'replace' || action.value === 'sum') setDuplicateAction(action.value)
    if (action.value === 'edit-quantity') {
      showToast('Ajusta la cantidad y confirma nuevamente.')
      return
    }
    resolveRule(alert.rule)
  }

  const selectAlternative = (alternative) => {
    const availableOptions = pending.type === 'selection'
      ? pending.options
      : pending.alternatives
    const updated = {
      ...pending,
      ...alternative,
      type: 'record',
      otherWarehouse: alternative.warehouse !== warehouse,
      alternatives: availableOptions.filter((item) => item.name !== alternative.name),
    }
    delete updated.options
    updated.alerts = validateInventoryRecord(updated, records)
    spokenCardSignature.current = ''
    setPending(updated)
    setResolvedAlerts(new Set())
    setDuplicateAction(null)
  }

  const confirm = () => {
    const resolvedAlertCount = pending.alerts.filter((alert) => resolvedAlerts.has(alert.rule)).length
    const duplicateAlert = pending.alerts.find((alert) => alert.rule === 'V5')

    if (pending.isCorrection) {
      updateRecord(pending.id, { quantity, resolvedAlertCount })
      if (online && sessionId && pending.articleId) {
        saveInventoryRecord(sessionId, {
          articulo_id: pending.articleId,
          cantidad_fisica: Number(quantity),
          unidad: pending.catalogUnit,
          estado_producto: pending.state,
          confianza: pending.confidence,
          alertas: [],
        }).catch(() => showToast('Corrección guardada local; se sincronizará cuando vuelva el backend.'))
      }
      const visibleMessage = `Corrección guardada · ${pending.name} · ${quantity} ${pending.unit}`
      const spokenMessage = `Actualicé ${pending.name.toLowerCase()} a ${quantity} ${pending.unit}.`
      appendMessage('assistant', visibleMessage, 'CLARA · actualizado')
      speakResponse(spokenMessage)
      clearPending()
      showToast('Corrección guardada en la sesión.')
      return
    }

    if (duplicateAlert && duplicateAction) {
      const previous = records.find((record) => record.id === duplicateAlert.duplicateId)
      const nextQuantity = duplicateAction === 'sum' ? Number(previous.quantity) + Number(quantity) : quantity
      updateRecord(previous.id, { quantity: nextQuantity, resolvedAlertCount })
      if (online && sessionId && pending.articleId) {
        saveInventoryRecord(sessionId, {
          articulo_id: pending.articleId,
          cantidad_fisica: Number(nextQuantity),
          unidad: pending.catalogUnit,
          estado_producto: pending.state,
          confianza: pending.confidence,
          alertas: [],
        }).catch(() => showToast('Guardado local; se sincronizará cuando vuelva el backend.'))
      }
      const visibleMessage = `${duplicateAction === 'sum' ? 'Conteos sumados' : 'Conteo reemplazado'} · ${pending.name} · ${nextQuantity} ${pending.unit}`
      const spokenMessage = duplicateAction === 'sum'
        ? `${pending.name} queda en ${nextQuantity} ${pending.unit}, sumando ambos conteos.`
        : `Reemplacé el conteo. ${pending.name} queda en ${nextQuantity} ${pending.unit}.`
      appendMessage('assistant', visibleMessage, 'CLARA · doble conteo resuelto')
      speakResponse(spokenMessage)
      clearPending()
      showToast('Doble conteo resuelto.')
      return
    }

    addRecord({
      articleId: pending.articleId,
      name: pending.name,
      quantity,
      unit: pending.unit,
      catalogUnit: pending.catalogUnit,
      stock: pending.stock,
      sku: pending.sku,
      warehouse: pending.warehouse,
      state: pending.state,
      confidence: pending.confidence,
      resolvedAlertCount,
    })
    if (online && sessionId && pending.articleId) {
      saveInventoryRecord(sessionId, {
        articulo_id: pending.articleId,
        cantidad_fisica: Number(quantity),
        unidad: pending.catalogUnit,
        estado_producto: pending.state,
        confianza: pending.confidence,
        alertas: pending.alerts,
      }).catch(() => {
        setSessionId(null)
        showToast('Guardado local; se sincronizará cuando vuelva el backend.')
      })
    }
    const visibleMessage = `Guardado · ${pending.name} · ${quantity} ${pending.unit}`
    const spokenMessage = `Guardé ${quantity} ${pending.unit} de ${pending.name.toLowerCase()}.`
    appendMessage('assistant', visibleMessage, online ? 'CLARA · sincronizado' : 'CLARA · guardado local')
    speakResponse(spokenMessage)
    clearPending()
    showToast(online ? 'Registro confirmado y sincronizado.' : 'Registro guardado en el dispositivo.')
  }

  const handleNetwork = () => {
    toggleOnline()
    showToast(
      online
        ? 'Sin señal por aquí — sigo guardando en el teléfono. Todo se sube al volver.'
        : 'Conexión recuperada. Los registros pendientes se están sincronizando.',
    )
  }

  const statusCopy = {
    listening: ['Escuchando…', 'Habla con naturalidad'],
    processing: ['Entendiendo tu solicitud…', 'Consultando el inventario de esta bodega'],
  }[voiceState]

  return (
    <main className="capture-screen">
      <TopBar
        title={bodegaLabel}
        online={online}
        onNetwork={handleNetwork}
        onProfile={onProfile}
        onBack={onBack}
        backLabel="Bodegas"
      />
      <div className="capture-layout">
        <section className="conversation-panel">
          <div className="conversation-scroll" ref={conversationScroll}>
            <div className="capture-context">
              <div>
                <span className="eyebrow">Toma física · Asistente conversacional</span>
                <h1>Cuenta, pregunta y confirma hablando</h1>
              </div>
              <div className="capture-context-actions">
                {autoListen && (
                  <button className="auto-listen-chip" onClick={stopContinuousListening} title="Detener escucha continua">
                    <span className="auto-listen-dot" aria-hidden="true" />
                    <span>Escucha continua</span>
                  </button>
                )}
                <button
                  onClick={toggleSpokenResponses}
                  aria-pressed={voiceEnabled}
                  title={voiceEnabled ? 'Silenciar respuestas' : 'Activar respuestas'}
                >
                  {voiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  <span>{voiceEnabled ? 'Voz activa' : 'Voz apagada'}</span>
                </button>
                <button
                  onClick={() => lastSpoken && speakResponse(lastSpoken)}
                  disabled={!lastSpoken || !voiceEnabled}
                  title="Repetir última respuesta"
                >
                  <Repeat2 size={18} />
                  <span>Repetir</span>
                </button>
                <span>{currentCount} capturadas</span>
              </div>
            </div>

            <div className="conversation-messages" aria-live="polite">
              {messages.map((message) => (
                <div
                  className={`bubble ${message.role === 'assistant' ? 'bubble-clara' : 'bubble-user'}`}
                  key={message.id}
                >
                  {message.role === 'assistant'
                    ? <span className="clara-avatar"><Tangram size={23} /></span>
                    : <Avatar size="xs" />}
                  <div>
                    <p>{message.text}</p>
                    {message.meta && <small>{message.meta}</small>}
                  </div>
                </div>
              ))}
              {interim && (
                <div className="bubble bubble-user interim">
                  <Avatar size="xs" />
                  <p>{interim}</p>
                </div>
              )}
            </div>

            {statusCopy && (
              <div className={`voice-status-card voice-${voiceState}`} role="status">
                <span className="voice-bars" aria-hidden="true">
                  <i /><i /><i /><i /><i />
                </span>
                <div>
                  <strong>{statusCopy[0]}</strong>
                  <span>{statusCopy[1]}</span>
                </div>
              </div>
            )}

            {!pending && voiceState === 'idle' && (
              <div className="demo-prompts" aria-label="Frases de demostración">
                <span>También puedes preguntarme</span>
                <div>
                  {prompts.map((prompt) => (
                    <button key={prompt} onClick={() => processPhrase(prompt)}>{prompt}</button>
                  ))}
                </div>
              </div>
            )}

            {pending?.type === 'no_match' && (
              <article className="capture-issue">
                <span className="capture-issue-icon"><PackageSearch size={27} /></span>
                <div>
                  <span className="eyebrow"><AlertTriangle size={14} /> Producto no encontrado</span>
                  <h2>{pending.message}</h2>
                  <p>Prueba con un nombre más corto o consulta el inventario completo.</p>
                </div>
                {!!pending.alternatives.length && (
                  <div className="issue-alternatives">
                    <span>¿Será alguno de estos?</span>
                    {pending.alternatives.map((item) => (
                      <button key={item.sku || item.name} onClick={() => selectAlternative(item)}>{item.name}</button>
                    ))}
                  </div>
                )}
                <div className="record-actions">
                  <Button onClick={() => setInventoryOpen(true)}>Ver inventario</Button>
                  <Button variant="secondary" onClick={clearPending}>Intentar de nuevo</Button>
                </div>
              </article>
            )}

            {pending?.type === 'selection' && (
              <article className="variant-picker" aria-labelledby="variant-picker-title">
                <div className="variant-picker-heading">
                  <span className="capture-issue-icon"><PackageSearch size={25} /></span>
                  <div>
                    <span className="eyebrow">Coincidencias en esta bodega</span>
                    <h2 id="variant-picker-title">¿Cuál producto estás contando?</h2>
                    <p>Conservaremos la cantidad y la unidad que ya dijiste.</p>
                  </div>
                </div>
                <div className="variant-grid">
                  {pending.options.map((option) => (
                    <button
                      type="button"
                      key={option.sku || `${option.warehouse}-${option.name}`}
                      onClick={() => selectAlternative(option)}
                      aria-label={`Seleccionar ${option.name}`}
                    >
                      <span>
                        <strong>{option.name}</strong>
                        <small>{option.sku ? `SKU ${option.sku}` : 'Sin código SKU'}</small>
                      </span>
                      <span className="variant-stock">
                        <strong>{Number(option.stock).toLocaleString('es-CO', { maximumFractionDigits: 2 })}</strong>
                        <small>{option.unit} en sistema</small>
                      </span>
                    </button>
                  ))}
                </div>
                <Button variant="secondary" onClick={clearPending}>Cancelar selección</Button>
              </article>
            )}

            {pending?.type === 'record' && (
              <RegistroCard
                record={pending}
                quantity={quantity}
                setQuantity={changeQuantity}
                resolvedAlerts={resolvedAlerts}
                onResolve={resolveAlert}
                onConfirm={confirm}
                onCancel={clearPending}
                onAlternative={selectAlternative}
              />
            )}
          </div>

          {activeCaption && (
            <div className="spoken-caption" aria-label="Transcripción de la respuesta de CLARA">
              <Volume2 size={17} aria-hidden="true" />
              <p>{activeCaption}</p>
            </div>
          )}

          <div className="capture-dock">
            <form onSubmit={(event) => { event.preventDefault(); processPhrase(input) }}>
              <Keyboard size={20} />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escribe un conteo o pregunta: ¿tenemos leche?"
                aria-label="Hablar con Clara por texto"
              />
              <button type="submit" aria-label="Enviar a Clara"><Send size={21} /></button>
            </form>
            <MicButton state={voiceState === 'speaking' ? 'idle' : voiceState} onClick={toggleVoice} />
            <button
              className="undo-button"
              onClick={() => {
                if (!records.length) return
                undoLast()
                showToast('Último registro deshecho.')
              }}
              aria-label="Deshacer último registro"
            >
              <Undo2 size={21} />
              <span>Deshacer</span>
            </button>
          </div>
        </section>

        <SessionPanel
          records={records}
          current={currentCount}
          total={total}
          alerts={alertsResolved}
          onClose={onClose}
          onReport={onReport}
          onOpenInventory={() => setInventoryOpen(true)}
          mobileOpen={sheetOpen}
          onMobileToggle={() => setSheetOpen((value) => !value)}
        />
      </div>
      <InventoryDrawer
        open={inventoryOpen}
        onClose={() => setInventoryOpen(false)}
        warehouse={warehouse}
        warehouseLabel={bodegaLabel}
        sessionId={sessionId}
      />
      <Toast message={toast} type={online ? 'ok' : 'info'} />
    </main>
  )
}
