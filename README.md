# CLARA — Captura por Lenguaje Asistido con Reconocimiento y Análisis

> **Cuentas claras, cocina tranquila.**

Asistente inteligente para la toma física de inventarios en las cocinas y bodegas de Colsubsidio. El operario se identifica con el rostro (o PIN), **dicta por voz lo que contó** — *«quedan nueve cajas de harina»* — y CLARA lo convierte en un registro estructurado, lo **valida en tiempo real** contra el catálogo y el histórico, y al cierre genera un **acta firmada** con reportes listos para el ERP, enviables por Telegram y correo.

Proyecto del **Reto 4 · "Captura inteligente en operaciones de cocina" · Hackathon Colsubsidio × 30X** (22–26 de julio de 2026).

## El problema (con la data real del reto)

En el inventario que Colsubsidio entregó para el reto (Piscilago: 48 bodegas, 1.405 referencias) encontramos **79 saldos negativos físicamente imposibles** (gaseosas en −9.120, porciones de arroz en −5.577), **252 referencias sin código** (18 %) y **47.588 unidades "fantasma"**. Ninguno es un error de conteo: son errores de *transcripción* de la cadena papel -> digitación -> revisión. CLARA elimina esa cadena — la validación ocurre en el momento de la captura, no semanas después.

## Cómo funciona

```
Rostro/PIN -> Bodega -> Voz -> GPT extrae {SKU, cantidad, unidad} -> Reglas V1–V7 validan
-> ¿Anomalía? Clara pregunta ANTES de guardar -> Firma con credenciales -> Acta PDF/XLSX/CSV
-> Envío por Telegram / correo
```

Principios no negociables:
1. **GPT nunca escribe un SKU** — solo estructura lenguaje; el match contra catálogo es código determinístico.
2. **Nada ambiguo se guarda** sin confirmación humana explícita.
3. **Funciona sin señal** — parser local de respaldo + cola offline con sincronización.
4. **La toma no sobreescribe el sistema** — es una foto paralela que se concilia y firma al cierre.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite (PWA), Zustand, tablet-first (1180×820, dos paneles) |
| Backend | FastAPI (Python 3.11+), SQLite, Pydantic |
| IA | GPT `gpt-4o-mini` (Structured Outputs) + Whisper · face-api.js on-device · Web Speech API `es-CO` |
| Reportes | WeasyPrint (PDF) · openpyxl (XLSX) · CSV formato ERP |
| Envío | Telegram Bot API · Resend/SMTP |
| Deploy | Vercel (frontend) · Railway/Render (backend) — HTTPS obligatorio |

## Estado del proyecto

**Fase actual: frontend P0–P6 y backend MVP implementados.** La captura usa FastAPI cuando está disponible y conserva el parser local como respaldo offline. El catálogo real se carga en SQLite, GPT estructura las frases sin decidir SKUs, las reglas V1–V7 validan los conteos y las sesiones pueden firmarse y exportarse.

```
clara/
├── frontend/                           # React + Vite PWA, pantallas P0–P6
├── backend/                            # FastAPI + SQLite + OpenAI + reportes
│   ├── app/routers/                    # Contratos HTTP
│   ├── app/services/                   # GPT, matcher, reglas, PDF y envíos
│   ├── seed/                           # Carga del catálogo y usuarios demo
│   └── tests/                          # Flujo API y casos del parser
└── docs/                               # Plan, guía, catálogo y mockups
```

## Ejecutar la aplicación

Requiere Node 18+ y Python 3.11+.

### 1. Configurar el backend y OpenAI

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edita `backend/.env`:

```dotenv
OPENAI_API_KEY=tu_clave_de_openai
OPENAI_MODEL=gpt-4o-mini
OPENAI_TRANSCRIBE_MODEL=whisper-1
```

La clave vive únicamente en el servidor. No debe llamarse `VITE_OPENAI_API_KEY` ni aparecer en archivos de React. Si se deja vacía, CLARA funciona con el parser local y `/health` muestra `"openai_configurado": false`.

Inicia la API:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

La primera ejecución crea `clara.db` y carga 1.405 artículos. Abre la documentación interactiva en `http://127.0.0.1:8000/docs`.

### 2. Iniciar el frontend

En otra terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Abre `http://localhost:5173`. El PIN de demostración es `1234`.

## API implementada

| Endpoint | Función |
|---|---|
| `GET /health` | Estado de SQLite y configuración de OpenAI, sin exponer secretos |
| `POST /extract` | Structured Outputs + matcher determinístico; respaldo local a los 3 s |
| `POST /assistant` | Distingue captura, consulta, explicación, ayuda y apertura del inventario |
| `GET /inventory` | Devuelve todas las referencias de la bodega y prioriza el conteo físico |
| `POST /validate` | Reglas V1–V7 en el orden definido por el plan |
| `POST /transcribe` | Audio multipart a `whisper-1` en español |
| `POST /speak` | Respuesta WAV natural con `gpt-audio-1.5` y caché privada |
| `POST /sessions` | Abre una toma para usuario, bodega y modo |
| `POST/PATCH /sessions/{id}/registros` | Guarda lotes offline y corrige registros |
| `POST /sessions/{id}/firmar` | Firma SHA-256 y vuelve la sesión inmutable |
| `GET /sessions/{id}/resumen` | Avance, alertas, correcciones y diferencias |
| `POST /report` | PDF, XLSX y CSV ERP; Telegram/Resend opcionales |

Sin tokens de Telegram o Resend, el envío responde como simulado y no interrumpe el demo.

## Asistente conversacional y voz

En la captura puedes dictar o escribir:

```text
¿Tenemos leche?
Muéstrame todo el inventario
Quedan noventa kilos de ajonjolí
¿Por qué dudas?
Perdón, eran nueve
```

Las consultas no abren una tarjeta de captura: CLARA responde en la conversación,
consulta SQLite y habla mediante OpenAI. Las afirmaciones de conteo sí muestran la
tarjeta. Si hay una alerta, la voz lee la pregunta, explica la razón y ofrece una
recomendación. El botón `Voz activa` permite silenciarla y `Repetir` reproduce la
última respuesta.

La voz se configura exclusivamente en `backend/.env`:

```dotenv
OPENAI_VOICE_MODEL=gpt-audio-1.5
OPENAI_VOICE=coral
VOICE_CACHE_DIR=./voice_cache
```

Si OpenAI no responde, el frontend utiliza `speechSynthesis` como respaldo. Los
audios generados se almacenan por hash en una carpeta ignorada por Git para reducir
latencia y consumo. El endpoint limita solicitudes repetidas para evitar abuso.

## Verificación

```bash
cd backend
source .venv/bin/activate
pytest -q

cd ../frontend
npm run build
```

## Próximos pasos de desarrollo

1. Añadir la captura del blob de `MediaRecorder` como respaldo de Web Speech.
2. Sincronizar toda la cola histórica de Zustand, no solo los registros nuevos.
3. Conectar firma y descarga del frontend a las sesiones reales.
4. Desplegar bajo HTTPS y configurar límites de gasto/uso en OpenAI.

Los comandos de arranque detallados de cada servicio se agregarán a este README a medida que las carpetas existan.

## Cómo desarrollar (humanos y agentes)

1. La fuente de verdad son los dos `.md` de `docs/` — los mockups son referencia visual; **donde difieran, manda la guía**.
2. Seguir el **orden de construcción** (sección 8 del plan): 13 pasos, cada uno con criterio de "hecho" verificable. Un paso a la vez.
3. Desarrollo y pruebas en Chrome de escritorio (DevTools modo tablet); **verificación diaria de 10 min en la tablet del demo**.
4. Los 10 tests del prompt de GPT (sección 4 del plan) deben pasar antes de integrar `/extract`.

## Usuarios demo

| Usuario | Rol | Credencial |
|---|---|---|
| Sofía Valencia | Auxiliar de Cocina 2 · Restaurante Fuentes AyB | PIN 1234 |
| Carlos Ramírez | Jefe de Cocina (recibe reportes) | — |
| Piedad Gómez | Administradora | — |

## Equipo

Hackathon Colsubsidio × 30X — Equipo CLARA. *(agregar nombres y roles)*

---

 *¿Por qué un ave en tangram? Canta como la voz que captura el inventario, encaja como las cuentas que por fin cuadran, y es colombiana como el país con más aves del mundo.*
