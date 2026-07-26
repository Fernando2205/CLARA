import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  Database,
  ListChecks,
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { askClara, createSession, getSessionSummary } from '../lib/api'
import { categoryLabel } from '../lib/categories'
import { listenOnce, speakNatural, stopSpeaking } from '../lib/voice'
import {
  formatAgentAmount,
  historicalRangeText,
  isSpokenUnitCompatible,
  nextReviewAfter,
  parseWarehouseAgentCommand,
  reviewReason,
  selectReviewOption,
  unitLabel,
} from '../lib/warehouseAgent'
import { useAuthStore } from '../stores/auth'
import { useSessionStore } from '../stores/session'

const MAX_MESSAGES = 7

const ZONE_CHECKS = {
  lacteos: 'Revisa la cámara de frío y las unidades abiertas.',
  carnes: 'Revisa la cámara de frío y los paquetes ya abiertos.',
  frutas_verduras: 'Revisa canastillas, refrigeración y producto en preparación.',
  granos: 'Revisa el estante seco y los empaques abiertos.',
  bebidas: 'Revisa estantes, neveras y botellas abiertas.',
  panaderia: 'Revisa vitrinas, reserva y producto en preparación.',
  limpieza: 'Revisa el cuarto de aseo y los envases en uso.',
  desechables: 'Revisa cajas cerradas y paquetes ya abiertos.',
  general: 'Verifica físicamente todas las ubicaciones asignadas.',
}

function reviewInstruction (item) {
  if (!item) return { visible: '', spoken: '' }
  const zone = categoryLabel(item.category)
  const reference = historicalRangeText(item) || (
    Number(item.stock_sistema) >= 0
      ? `La referencia del sistema es ${formatAgentAmount(item.stock_sistema)} ${unitLabel(item)}.`
      : 'No hay una referencia confiable del sistema.'
  )
  const physicalCheck = ZONE_CHECKS[item.category] || ZONE_CHECKS.general
  return {
    summary: `Siguiente: ${item.nombre} · ${zone}.`,
    visible: `Siguiente: ${item.nombre} · Zona ${zone}. ${reference} ${physicalCheck}`,
    spoken: `Siguiente: ${item.nombre.toLowerCase()}, en ${zone.toLowerCase()}. ${reference} ${physicalCheck}`,
  }
}

function ClaraGuide ({ state = 'idle', compact = false }) {
  return (
    <span className={`clara-guide is-${state} ${compact ? 'is-compact' : ''}`} aria-hidden='true'>
      <span className='clara-guide-signal'><i /><i /></span>
      <span className='clara-guide-head'>
        <span className='clara-guide-eye clara-guide-eye-left' />
        <span className='clara-guide-eye clara-guide-eye-right' />
        <span className='clara-guide-mouth' />
      </span>
      <span className='clara-guide-body'>
        <i className='clara-guide-mark clara-guide-mark-one' />
        <i className='clara-guide-mark clara-guide-mark-two' />
      </span>
    </span>
  )
}

function ReviewCard ({ item }) {
  const sourceIsSystem = !item.contado_en_sesion
  const historicalReference = historicalRangeText(item)
  return (
    <article className='warehouse-agent-review'>
      <header>
        <span className={sourceIsSystem ? 'is-system' : 'is-physical'}>
          {sourceIsSystem ? <Database size={13} /> : <AlertTriangle size={13} />}
          {sourceIsSystem ? 'Saldo por verificar' : 'Diferencia física'}
        </span>
        <small>{item.sku ? `SKU ${item.sku}` : 'Sin SKU'}</small>
      </header>
      <h3>{item.nombre}</h3>
      <div className='warehouse-agent-review-values'>
        <span>
          <small>Sistema</small>
          <strong>{formatAgentAmount(item.stock_sistema)}</strong>
          <em>{unitLabel(item)}</em>
        </span>
        <i />
        <span>
          <small>Conteo físico</small>
          <strong>{item.contado_en_sesion ? formatAgentAmount(item.cantidad_actual) : '—'}</strong>
          <em>{item.contado_en_sesion ? unitLabel(item) : 'Sin contar'}</em>
        </span>
      </div>
      <p>{reviewReason(item)}</p>
      <div className='warehouse-agent-reference'>
        <span>
          <small>Zona</small>
          <strong>{categoryLabel(item.category)}</strong>
        </span>
        <span>
          <small>Referencia habitual</small>
          <strong>{historicalReference || 'Sin histórico confiable'}</strong>
        </span>
      </div>
    </article>
  )
}

export default function WarehouseVoiceAgent ({
  reviewItems,
  warehouse,
  warehouseLabel,
  onFocusItem,
  onShowReviews,
  onShowAll,
}) {
  const userId = useAuthStore((state) => state.user?.id)
  const sessionId = useSessionStore((state) => state.sessionId)
  const signature = useSessionStore((state) => state.signature)
  const startSession = useSessionStore((state) => state.startSession)
  const mode = useSessionStore((state) => state.mode)
  const online = useSessionStore((state) => state.online)
  const correctRecord = useSessionStore((state) => state.correctRecord)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [interim, setInterim] = useState('')
  const [voiceState, setVoiceState] = useState('idle')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [continuousListening, setContinuousListening] = useState(false)
  const [activeId, setActiveId] = useState(reviewItems[0]?.id ?? null)
  const [proposal, setProposal] = useState(null)
  const [options, setOptions] = useState([])
  const [optionDraft, setOptionDraft] = useState(null)
  const [messages, setMessages] = useState([{
    id: 'welcome',
    role: 'assistant',
    text: 'Puedo recorrer las revisiones contigo y preparar correcciones seguras.',
  }])
  const listener = useRef(null)
  const messageScroll = useRef(null)
  const inputRef = useRef(null)
  const successTimer = useRef(null)

  const activeReview = useMemo(
    () => reviewItems.find((item) => item.id === activeId) || reviewItems[0] || null,
    [activeId, reviewItems]
  )
  const activeIndex = activeReview
    ? reviewItems.findIndex((item) => item.id === activeReview.id)
    : -1

  useEffect(() => {
    if (activeReview || !reviewItems.length) return
    setActiveId(reviewItems[0].id)
  }, [activeReview, reviewItems])

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => {
      messageScroll.current?.scrollTo({
        top: messageScroll.current.scrollHeight,
        behavior: 'smooth',
      })
    })
  }, [interim, messages, open, options, proposal])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      listener.current?.stop()
      stopSpeaking()
      setContinuousListening(false)
      setInterim('')
      setVoiceState('idle')
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => () => {
    listener.current?.stop()
    stopSpeaking()
    window.clearTimeout(successTimer.current)
  }, [])

  const appendMessage = useCallback((role, text) => {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, role, text },
    ].slice(-MAX_MESSAGES))
  }, [])

  const speakMessage = useCallback(async (visible, spoken = visible) => {
    // Si el micrófono seguía activo, lo cerramos antes de hablar para que
    // no se escuche a sí misma y confunda su propia respuesta con una
    // instrucción nueva.
    listener.current?.stop()
    appendMessage('assistant', visible)
    if (!voiceEnabled || !spoken) {
      setVoiceState('idle')
      return
    }
    setVoiceState('speaking')
    await speakNatural(spoken, {
      onStart: () => setVoiceState('speaking'),
      onEnd: () => setVoiceState('idle'),
      onError: () => setVoiceState('idle'),
    })
  }, [appendMessage, voiceEnabled])

  const focusReview = useCallback((item) => {
    if (!item) return
    setActiveId(item.id)
    setProposal(null)
    setOptions([])
    setOptionDraft(null)
    onFocusItem?.(item)
  }, [onFocusItem])

  const moveReview = useCallback((direction) => {
    if (!reviewItems.length) return null
    const currentIndex = Math.max(0, activeIndex)
    const nextIndex = (currentIndex + direction + reviewItems.length) % reviewItems.length
    const item = reviewItems[nextIndex]
    focusReview(item)
    return item
  }, [activeIndex, focusReview, reviewItems])

  const prepareProposal = useCallback(async (item, quantity, spokenUnit) => {
    if (!item) {
      await speakMessage('No encontré esa revisión pendiente.')
      return
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) < 0) {
      await speakMessage(`Dime la cantidad nueva para ${item.nombre.toLowerCase()}.`)
      return
    }
    if (!isSpokenUnitCompatible(spokenUnit, item.unidad)) {
      await speakMessage(
        `${item.nombre} se controla en ${unitLabel(item)}. Indica la cantidad usando esa unidad.`
      )
      return
    }

    const next = {
      item,
      quantity: Number(quantity),
      previous: item.contado_en_sesion
        ? Number(item.cantidad_actual)
        : Number(item.stock_sistema),
      previousSource: item.contado_en_sesion ? 'Conteo físico' : 'Saldo del sistema',
    }
    setActiveId(item.id)
    setOptions([])
    setOptionDraft(null)
    setProposal(next)
    onFocusItem?.(item)
    const spoken = item.contado_en_sesion
      ? `${item.nombre.toLowerCase()}: cambiaré ${formatAgentAmount(next.previous)} por ${formatAgentAmount(next.quantity)} ${unitLabel(item)}. ¿Confirmas?`
      : `Registraré ${formatAgentAmount(next.quantity)} ${unitLabel(item)} de ${item.nombre.toLowerCase()}. El sistema muestra ${formatAgentAmount(next.previous)}. ¿Confirmas?`
    await speakMessage('Cambio preparado. Revisa el antes y el después.', spoken)
  }, [onFocusItem, speakMessage])

  const confirmProposal = useCallback(async () => {
    if (!proposal) {
      await speakMessage('No hay ningún cambio preparado para confirmar.')
      return
    }
    setVoiceState('processing')
    try {
      let currentSessionId = sessionId
      if (currentSessionId && signature) currentSessionId = null
      if (currentSessionId && online) {
        try {
          const summary = await getSessionSummary(currentSessionId)
          if (summary.firmada) currentSessionId = null
        } catch (error) {
          if (error?.status === 404) currentSessionId = null
          else throw error
        }
      }
      if (!currentSessionId) {
        if (!online || !userId) {
          await speakMessage('Necesito conexión para abrir una sesión y guardar esta corrección.')
          return
        }
        const created = await createSession({ userId, warehouse, mode })
        currentSessionId = created.sesion_id
        startSession(currentSessionId)
      }

      const { item, quantity } = proposal
      const result = await correctRecord({
        articleId: item.id,
        name: item.nombre,
        quantity,
        unit: unitLabel(item),
        catalogUnit: item.unidad,
        stock: Number(item.stock_sistema),
        sku: item.sku,
        warehouse,
        state: null,
        confidence: 1,
        reviewResolved: true,
        resolvedAlertCount: 1,
      }, {
        articulo_id: item.id,
        cantidad_fisica: quantity,
        unidad: item.unidad,
        estado_producto: null,
        confianza: 1,
        alertas: [],
      })
      if (result.status === 'rejected') {
        throw new Error(result.error || 'La corrección fue rechazada por el servidor')
      }
      setProposal(null)
      const nextReview = nextReviewAfter(reviewItems, item.id)
      const visible = result.status === 'queued'
        ? `Corrección guardada en el dispositivo · ${item.nombre}`
        : `Corrección aplicada · ${item.nombre}`
      if (nextReview) {
        const nextInstruction = reviewInstruction(nextReview)
        focusReview(nextReview)
        await speakMessage(
          `${visible}. ${nextInstruction.summary}`,
          `${item.nombre.toLowerCase()} quedó en ${formatAgentAmount(quantity)} ${unitLabel(item)}. ${nextInstruction.spoken}`
        )
      } else {
        await speakMessage(
          `${visible}. No quedan revisiones pendientes.`,
          `${item.nombre.toLowerCase()} quedó en ${formatAgentAmount(quantity)} ${unitLabel(item)}. Terminaste las revisiones pendientes.`
        )
      }
      setVoiceState('success')
      window.clearTimeout(successTimer.current)
      successTimer.current = window.setTimeout(() => setVoiceState('idle'), 900)
    } catch {
      await speakMessage('No pude guardar el cambio. El dato anterior sigue intacto.')
    }
  }, [
    correctRecord,
    focusReview,
    mode,
    online,
    proposal,
    reviewItems,
    sessionId,
    signature,
    speakMessage,
    startSession,
    userId,
    warehouse,
  ])

  const showReviews = useCallback(async () => {
    onShowReviews?.()
    if (!reviewItems.length) {
      await speakMessage('No quedan revisiones pendientes en esta bodega.')
      return
    }
    focusReview(reviewItems[0])
    const instruction = reviewInstruction(reviewItems[0])
    await speakMessage(
      `${reviewItems.length} revisiones pendientes. ${instruction.visible}`,
      `Hay ${reviewItems.length} revisiones. ${instruction.spoken}`
    )
  }, [focusReview, onShowReviews, reviewItems, speakMessage])

  const handleFallback = useCallback(async (phrase) => {
    setVoiceState('processing')
    try {
      const response = await askClara({
        phrase,
        warehouse,
        sessionId,
        lastSku: activeReview?.sku,
        alertContext: activeReview ? reviewReason(activeReview) : null,
      })
      if (response.accion_ui === 'mostrar_inventario') onShowAll?.()

      const extraction = response.extraccion
      if (extraction?.articulo && extraction.cantidad != null) {
        const candidates = reviewItems.filter((item) => (
          item.id === extraction.articulo.id ||
          extraction.alternativas?.some((option) => option.id === item.id)
        ))
        if (candidates.length > 1) {
          setOptions(candidates)
          setOptionDraft({
            quantity: extraction.cantidad,
            spokenUnit: extraction.unidad_dicha,
          })
          await speakMessage(`Encontré ${candidates.length} opciones pendientes. Elige una.`)
          return
        }
        if (candidates.length === 1) {
          await prepareProposal(candidates[0], extraction.cantidad, extraction.unidad_dicha)
          return
        }
      }

      if (response.coincidencias?.[0]) {
        const item = reviewItems.find((candidate) => candidate.id === response.coincidencias[0].id)
        if (item) focusReview(item)
      }
      await speakMessage(response.mensaje, response.mensaje_hablado)
    } catch {
      await speakMessage('No pude consultar el servicio. Las revisiones siguen disponibles en pantalla.')
    } finally {
      setVoiceState((current) => current === 'processing' ? 'idle' : current)
    }
  }, [
    activeReview,
    focusReview,
    onShowAll,
    prepareProposal,
    reviewItems,
    sessionId,
    speakMessage,
    warehouse,
  ])

  const processPhrase = useCallback(async (phrase) => {
    const clean = phrase.trim()
    if (!clean) return
    stopSpeaking()
    setInput('')
    setInterim('')
    appendMessage('user', clean)
    const command = parseWarehouseAgentCommand(clean, {
      reviewItems,
      activeItem: activeReview,
    })

    if (proposal && command.type === 'confirm') {
      await confirmProposal()
      return
    }
    if ((proposal || options.length) && command.type === 'cancel') {
      setProposal(null)
      setOptions([])
      setOptionDraft(null)
      await speakMessage('Cambio cancelado. No modifiqué el inventario.')
      return
    }
    if (options.length) {
      const selected = selectReviewOption(clean, options)
      if (selected) {
        await prepareProposal(selected, optionDraft?.quantity, optionDraft?.spokenUnit)
      } else {
        await speakMessage('Dime el nombre exacto o el número de la opción.')
      }
      return
    }

    if (command.type === 'show_reviews') {
      await showReviews()
      return
    }
    if (command.type === 'next' || command.type === 'previous') {
      const item = moveReview(command.type === 'next' ? 1 : -1)
      const instruction = reviewInstruction(item)
      await speakMessage(
        item ? instruction.visible : 'No quedan revisiones pendientes.',
        item ? instruction.spoken : 'No quedan revisiones.'
      )
      return
    }
    if (command.type === 'explain') {
      await speakMessage(
        activeReview ? reviewReason(activeReview) : 'Selecciona primero una revisión.'
      )
      return
    }
    if (command.type === 'confirm') {
      await speakMessage('Primero prepara un cambio y luego lo confirmamos.')
      return
    }
    if (command.type === 'correction') {
      if (!command.candidates.length && command.productQuery) {
        await speakMessage(`No hay una revisión pendiente que coincida con «${command.productQuery}».`)
        return
      }
      if (command.candidates.length > 1) {
        setOptions(command.candidates)
        setOptionDraft({
          quantity: command.quantity,
          spokenUnit: command.spokenUnit,
        })
        await speakMessage(`Encontré ${command.candidates.length} opciones. Elige la correcta.`)
        return
      }
      await prepareProposal(
        command.candidates[0] || activeReview,
        command.quantity,
        command.spokenUnit
      )
      return
    }
    await handleFallback(clean)
  }, [
    activeReview,
    appendMessage,
    confirmProposal,
    handleFallback,
    moveReview,
    optionDraft,
    options,
    prepareProposal,
    proposal,
    reviewItems,
    showReviews,
    speakMessage,
  ])

  const startListening = useCallback(() => {
    stopSpeaking()
    setOpen(true)
    setVoiceState('listening')
    listener.current = listenOnce({
      onStart: () => setVoiceState('listening'),
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim('')
        processPhrase(text)
      },
      onError: (message, code) => {
        setVoiceState('idle')
        if (code !== 'no-speech') {
          setContinuousListening(false)
          appendMessage('assistant', message)
        }
      },
      onEnd: ({ hadFinalResult, stoppedByUser }) => {
        if (!hadFinalResult && !stoppedByUser) setVoiceState('idle')
      },
    })
    if (listener.current.supported === false) setContinuousListening(false)
  }, [appendMessage, processPhrase])

  const toggleListening = () => {
    if (continuousListening) {
      setContinuousListening(false)
      listener.current?.stop()
      stopSpeaking()
      setInterim('')
      setVoiceState('idle')
      return
    }
    setContinuousListening(true)
    startListening()
  }

  useEffect(() => {
    if (!continuousListening || !open || voiceState !== 'idle') return undefined
    // Este mismo reinicio ocurre tanto tras una pausa breve al hablar
    // (el navegador corta el reconocimiento con continuous=false) como
    // justo después de que Clara termina de responder — por eso el
    // margen es un punto medio: rápido para no perder palabras, pero no
    // tanto como para captar el eco de su propia voz sin audífonos.
    const timer = window.setTimeout(startListening, 300)
    return () => window.clearTimeout(timer)
  }, [continuousListening, open, startListening, voiceState])

  const submit = (event) => {
    event?.preventDefault()
    processPhrase(input)
  }

  const closeAgent = () => {
    listener.current?.stop()
    stopSpeaking()
    setInterim('')
    setVoiceState('idle')
    setContinuousListening(false)
    setOpen(false)
  }

  const toggleSpokenResponses = () => {
    if (voiceEnabled) {
      stopSpeaking()
      setVoiceState('idle')
    }
    setVoiceEnabled((current) => !current)
  }

  const chooseOption = (item) => {
    prepareProposal(item, optionDraft?.quantity, optionDraft?.spokenUnit)
  }

  const cancelProposal = () => {
    setProposal(null)
    speakMessage('Cambio cancelado. No modifiqué el inventario.')
  }

  const showNextReview = () => {
    const item = moveReview(1)
    if (item) {
      const instruction = reviewInstruction(item)
      speakMessage(instruction.visible, instruction.spoken)
    }
  }

  const explainActiveReview = () => {
    if (activeReview) speakMessage(reviewReason(activeReview))
  }

  const statusLabel = {
    idle: continuousListening ? 'Conversación activa' : 'Lista para revisar',
    listening: 'Escuchando',
    processing: 'Comprobando',
    speaking: 'Respondiendo',
    success: 'Cambio guardado',
  }[voiceState]

  return (
    <div className={`warehouse-agent-dock ${open ? 'is-open' : ''}`}>
      {!open && (
        <button
          type='button'
          className='warehouse-agent-launcher'
          onClick={() => {
            setOpen(true)
            window.setTimeout(() => inputRef.current?.focus(), 120)
          }}
          aria-label={`Abrir CLARA. ${reviewItems.length} revisiones pendientes`}
        >
          <ClaraGuide state={voiceState} />
          <span className='warehouse-agent-launcher-copy'>
            <strong>Revisar con CLARA</strong>
            <small>{reviewItems.length} pendientes</small>
          </span>
          {reviewItems.length > 0 && <em>{reviewItems.length}</em>}
        </button>
      )}

      {open && (
        <aside className='warehouse-agent-panel' role='dialog' aria-label='CLARA para revisiones de bodega'>
          <header className='warehouse-agent-head'>
            <ClaraGuide state={voiceState} compact />
            <div>
              <strong>CLARA</strong>
              <span>{statusLabel}</span>
            </div>
            <button
              type='button'
              className='warehouse-agent-voice-toggle'
              onClick={toggleSpokenResponses}
              aria-pressed={voiceEnabled}
              aria-label={voiceEnabled ? 'Desactivar respuestas habladas' : 'Activar respuestas habladas'}
            >
              {voiceEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
            </button>
            <button type='button' className='warehouse-agent-close' onClick={closeAgent} aria-label='Cerrar CLARA'>
              <X size={18} />
            </button>
          </header>

          <div className='warehouse-agent-location'>
            <ClipboardCheck size={15} />
            <span><strong>{warehouseLabel}</strong><small>{reviewItems.length} revisiones pendientes</small></span>
            <button type='button' onClick={onShowReviews}>Ver lista</button>
          </div>

          <div className='warehouse-agent-scroll' ref={messageScroll}>
            {activeReview
              ? (
                <>
                  <div className='warehouse-agent-review-nav'>
                    <span>Revisión {activeIndex + 1} de {reviewItems.length}</span>
                    <div>
                      <button type='button' onClick={() => moveReview(-1)} aria-label='Revisión anterior'>
                        <ArrowLeft size={15} />
                      </button>
                      <button type='button' onClick={() => moveReview(1)} aria-label='Siguiente revisión'>
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </div>
                  <ReviewCard item={activeReview} />
                </>
                )
              : (
                <div className='warehouse-agent-empty'>
                  <Check size={24} />
                  <strong>Bodega revisada</strong>
                  <p>No quedan correcciones pendientes.</p>
                </div>
                )}

            <div className='warehouse-agent-messages' aria-live='polite'>
              {messages.map((message) => (
                <p className={`warehouse-agent-message is-${message.role}`} key={message.id}>
                  {message.text}
                </p>
              ))}
              {interim && <p className='warehouse-agent-message is-user is-interim'>{interim}</p>}
            </div>

            {options.length > 0 && (
              <section className='warehouse-agent-options' aria-label='Elige el producto correcto'>
                <span>¿Cuál quieres corregir?</span>
                {options.map((item, index) => (
                  <button type='button' key={item.id} onClick={() => chooseOption(item)}>
                    <em>{index + 1}</em>
                    <span><strong>{item.nombre}</strong><small>{item.sku ? `SKU ${item.sku}` : unitLabel(item)}</small></span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </section>
            )}

            {proposal && (
              <section className='warehouse-agent-proposal' aria-label='Confirmar corrección'>
                <header>
                  <span>Cambio por confirmar</span>
                  <strong>{proposal.item.nombre}</strong>
                </header>
                <div>
                  <span>
                    <small>{proposal.previousSource}</small>
                    <strong>{formatAgentAmount(proposal.previous)}</strong>
                    <em>{unitLabel(proposal.item)}</em>
                  </span>
                  <ArrowRight size={18} />
                  <span className='is-new'>
                    <small>Nuevo conteo</small>
                    <strong>{formatAgentAmount(proposal.quantity)}</strong>
                    <em>{unitLabel(proposal.item)}</em>
                  </span>
                </div>
                <footer>
                  <button type='button' onClick={cancelProposal}>
                    Cancelar
                  </button>
                  <button type='button' onClick={confirmProposal}>
                    <Check size={15} /> Confirmar cambio
                  </button>
                </footer>
              </section>
            )}
          </div>

          <div className='warehouse-agent-quick'>
            <button type='button' onClick={showReviews}><ListChecks size={14} />Pendientes</button>
            <button type='button' onClick={showNextReview}>Siguiente</button>
            <button type='button' disabled={!activeReview} onClick={explainActiveReview}>¿Por qué?</button>
          </div>

          <form className='warehouse-agent-composer' onSubmit={submit}>
            <button
              type='button'
              className={`warehouse-agent-mic is-${voiceState} ${continuousListening ? 'is-conversation' : ''}`}
              onClick={toggleListening}
              aria-pressed={continuousListening}
              aria-label={continuousListening ? 'Detener conversación por voz' : 'Iniciar conversación continua con CLARA'}
            >
              {continuousListening ? <MicOff size={19} /> : <Mic size={19} />}
            </button>
            <label className={continuousListening ? 'is-conversation' : ''}>
              <span className='sr-only'>Escribe una instrucción para CLARA</span>
              {continuousListening && (
                <span className='warehouse-agent-continuous' aria-live='polite'>
                  <i /> Continuo
                </span>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  voiceState === 'listening'
                    ? 'Te escucho…'
                    : continuousListening
                      ? 'Volveré a escuchar al terminar'
                      : 'Ej. tenemos 10 kg'
                }
              />
            </label>
            <button type='submit' disabled={!input.trim()} aria-label='Enviar instrucción'>
              <Send size={17} />
            </button>
          </form>
        </aside>
      )}
    </div>
  )
}
