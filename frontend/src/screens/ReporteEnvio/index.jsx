import { useState } from 'react'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileBarChart2,
  FileSpreadsheet,
  FileText,
  Mail,
  MessageCircleMore,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { Button, Logo, Toast, TopBar } from '../../components/ui'
import { useSessionStore } from '../../stores/session'

const formats = [
  { label: 'PDF', caption: 'Acta firmada', icon: FileText },
  { label: 'XLSX', caption: 'Libro de detalle', icon: FileSpreadsheet },
  { label: 'CSV', caption: 'Listo para ERP', icon: FileBarChart2 },
]

export default function ReporteEnvio({ onBack, onProfile, onFinish }) {
  const bodegaLabel = useSessionStore((state) => state.bodegaLabel)
  const [sent, setSent] = useState(false)
  const [toast, setToast] = useState('')

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 3000)
  }

  const download = (format) => {
    const content = format === 'CSV'
      ? 'CANTIDAD;Nr.Artículo;Artículo;Unidad;SD\n12;7290;ACEITE VEGETAL;Liter;12\n18;7301;ARROZ BLANCO;Kilogram;18'
      : `CLARA — ${format}\nActa de inventario\n${bodegaLabel}\nFirmada por Sofía Valencia`
    const blob = new Blob([content], { type: format === 'CSV' ? 'text/csv' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `CLARA_acta_2026-07-23.${format === 'CSV' ? 'csv' : 'txt'}`
    link.click()
    URL.revokeObjectURL(url)
    notify(`${format} preparado para descarga.`)
  }

  return (
    <main className="report-screen">
      <TopBar title="Reporte y envío" onBack={onBack} onProfile={onProfile} />
      <div className="report-layout">
        <section className="preview-column">
          <div className="report-heading">
            <span className="eyebrow">Acta CL-8FA2-0726</span>
            <h1>Tu reporte está listo</h1>
            <p>La toma quedó firmada. Descarga los archivos o compártelos con el responsable.</p>
          </div>
          <div className="pdf-stage">
            <div className="pdf-shadow-sheet" />
            <article className="pdf-preview">
              <header>
                <Logo light />
                <div><strong>ACTA DE INVENTARIO</strong><span>23 jul 2026 · 14:32</span></div>
              </header>
              <div className="pdf-body">
                <div className="pdf-title">
                  <span>REPORTE DE EXISTENCIAS</span>
                  <h2>{bodegaLabel}</h2>
                  <p>Toma física asistida por voz · Sesión 24-0726</p>
                </div>
                <div className="pdf-stats">
                  <span><strong>47</strong> Referencias</span>
                  <span><strong>12 min</strong> Duración</span>
                  <span><strong>3</strong> Correcciones</span>
                </div>
                <table>
                  <thead><tr><th>Código</th><th>Artículo</th><th>Físico</th><th>Delta</th></tr></thead>
                  <tbody>
                    <tr><td>7290</td><td>ACEITE VEGETAL</td><td>12</td><td>-2</td></tr>
                    <tr><td>7301</td><td>ARROZ BLANCO</td><td>18</td><td>0</td></tr>
                    <tr><td>7432</td><td>HUEVO AA</td><td>35</td><td>-5</td></tr>
                    <tr><td>—</td><td>GUISO CRIOLLO</td><td>45</td><td>+57</td></tr>
                  </tbody>
                </table>
                <div className="pdf-signature">
                  <span>Sofía Valencia</span>
                  <strong>Firma digital verificada</strong>
                  <small>Sello CL-8FA2-0726</small>
                </div>
              </div>
            </article>
          </div>
        </section>
        <aside className="delivery-column">
          <section className="delivery-card">
            <span className="eyebrow">Archivos</span>
            <h2>Descargar formatos</h2>
            <div className="format-list">
              {formats.map(({ label, caption, icon: Icon }) => (
                <button key={label} onClick={() => download(label)}>
                  <span className="format-icon"><Icon size={23} /></span>
                  <span><strong>{label}</strong><small>{caption}</small></span>
                  <Download size={20} />
                </button>
              ))}
            </div>
          </section>
          <section className="delivery-card">
            <span className="eyebrow">Compartir</span>
            <h2>Enviar a Carlos Ramírez</h2>
            <p>Jefe de Cocina · Responsable de reportes</p>
            <div className="channel-grid">
              <button className="channel telegram" onClick={() => setSent(true)}>
                <span><Send size={24} /></span>Telegram
              </button>
              <button className="channel email" onClick={() => setSent(true)}>
                <span><Mail size={24} /></span>Correo
              </button>
              <button className="channel unavailable" onClick={() => notify('WhatsApp requiere credenciales corporativas.')}>
                <span><MessageCircleMore size={24} /></span>WhatsApp<small>Próximamente</small>
              </button>
              <button className="channel unavailable" onClick={() => notify('Teams requiere credenciales corporativas.')}>
                <span><Users size={24} /></span>Teams<small>Próximamente</small>
              </button>
            </div>
            {sent && (
              <div className="sent-confirmation">
                <CheckCircle2 size={22} />
                <span><strong>Enviado correctamente</strong><small>A Carlos Ramírez · 14:32</small></span>
              </div>
            )}
          </section>
          <div className="report-finish">
            <ShieldCheck size={18} />
            <p>La toma firmada permanece disponible en tu historial.</p>
            <Button variant="secondary" onClick={onFinish} icon={ArrowRight}>Ver historial</Button>
          </div>
        </aside>
      </div>
      <Toast message={toast} type="info" />
    </main>
  )
}
