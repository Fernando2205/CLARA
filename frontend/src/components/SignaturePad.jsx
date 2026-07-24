import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Eraser } from 'lucide-react'

export const SignaturePad = forwardRef(function SignaturePad({ width = 480, height = 180 }, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const context = canvasRef.current.getContext('2d')
    context.lineWidth = 2.6
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#1c2b3a'
  }, [])

  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
      dirty.current = false
    },
    isEmpty() {
      return !dirty.current
    },
    toBlob() {
      return new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png'))
    },
  }), [])

  const posFromEvent = (event) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const start = (event) => {
    drawing.current = true
    dirty.current = true
    const context = canvasRef.current.getContext('2d')
    const { x, y } = posFromEvent(event)
    context.beginPath()
    context.moveTo(x, y)
    canvasRef.current.setPointerCapture(event.pointerId)
  }

  const move = (event) => {
    if (!drawing.current) return
    const context = canvasRef.current.getContext('2d')
    const { x, y } = posFromEvent(event)
    context.lineTo(x, y)
    context.stroke()
  }

  const stop = () => { drawing.current = false }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="signature-canvas"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={stop}
      onPointerLeave={stop}
      role="img"
      aria-label="Área para dibujar tu firma"
    />
  )
})

export function SignatureField({ padRef, hint = 'Dibuja tu firma con el dedo o el mouse', width, height }) {
  return (
    <div className="signature-field">
      <SignaturePad ref={padRef} width={width} height={height} />
      <div className="signature-field-foot">
        <span>{hint}</span>
        <button type="button" className="signature-clear-button" onClick={() => padRef.current?.clear()}>
          <Eraser size={14} /> Borrar
        </button>
      </div>
    </div>
  )
}
