import { useEffect, useRef, useState } from 'react'

export function useCamera(active) {
  const [cameraState, setCameraState] = useState('fallback')
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    if (!active) return undefined

    let cancelled = false
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
        if (cancelled) {
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
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [active])

  const captureFrame = () => new Promise((resolve, reject) => {
    const video = videoRef.current
    if (!video || cameraState !== 'live') {
      reject(new Error('La cámara no está disponible'))
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('No se pudo capturar la foto'))
    }, 'image/jpeg', 0.92)
  })

  return { videoRef, cameraState, captureFrame }
}
