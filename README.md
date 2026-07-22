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

**Fase actual: especificación completa, desarrollo por iniciar.** El repo contiene hoy la documentación (fuente de verdad), el catálogo de datos real y los mockups de referencia. El código de `frontend/` y `backend/` se construye a partir de estas specs siguiendo el orden de la sección 8 del plan.

```
clara/
└── docs/                               # LO QUE EXISTE HOY
    ├── CLARA_plan_desarrollo_mvp.md    # Spec técnica: API, datos, prompts, reglas, orden de build
    ├── CLARA_guia_diseno_ui.md         # Design system: tokens, pantallas, componentes, microcopy
    ├── CLARA_prompts_diseno.md         # Prompts por pantalla para agentes de diseño
    ├── catalogo_piscilago.json         # Catálogo real: 1.405 SKUs, 8 bodegas
    └── disenos/                        # Mockups HTML de referencia (P0-P6)
```

Estructura objetivo al finalizar (definida en la sección 1 del plan):

```
clara/
├── frontend/          # React + Vite PWA (pantallas P0-P6)
├── backend/           # FastAPI: /extract /validate /sessions /report /transcribe
│   └── seed/          # catalogo_piscilago.json -> SQLite
└── docs/
```

## Primeros pasos de desarrollo (hoy)

1. Crear `backend/` con FastAPI: `/health`, `seed.py` (JSON -> SQLite, criterio: 1.405 filas en `articulos`) y CORS.
2. Implementar `/extract` con GPT usando el prompt de la sección 4 del plan; validar contra sus 10 tests.
3. Crear `frontend/` con Vite + PWA y las pantallas esqueleto navegables.
4. Desplegar dummy desde el día 1 (Vercel + Railway/Render): cámara y micrófono solo funcionan en `localhost` o bajo HTTPS.
5. Poner tope de gasto (USD 10) en el dashboard de OpenAI.

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
