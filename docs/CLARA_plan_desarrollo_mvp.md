# CLARA — Especificación de Desarrollo del MVP
### Documento ejecutable: un agente de desarrollo debe poder implementar cada módulo leyendo SOLO este documento y la guía de diseño (`CLARA_guia_diseno_ui.md`).
**Reto 4 · Hackathon Colsubsidio × 30X · 22–26 julio 2026**
**Stack CERRADO (no cambiar):** React 18 + Vite (PWA) · FastAPI (Python 3.11+) · OpenAI (GPT gpt-4o-mini + Whisper) · SQLite · face-api.js

---

## 0 · Qué es CLARA (contexto mínimo para el implementador)

App PWA móvil para la toma física de inventario en cocinas/bodegas de Colsubsidio. El operario se identifica (rostro o PIN), dicta por voz lo que contó ("quedan nueve cajas de harina"), el sistema lo convierte en un registro estructurado validado en tiempo real contra el catálogo e histórico, y al cerrar genera un acta firmada con reportes (PDF/XLSX/CSV) enviables por Telegram y correo.

**Datos semilla reales (incluidos en el repo):** `catalogo_piscilago.json` — 1.405 registros con esquema `{bodega, sku, articulo, unidad, stock}`; 8 bodegas; unidades posibles: `"Unidad" | "Kilogram" | "Liter" | "Portion"`. `sku` puede ser `null` (252 casos reales).

**Principios NO negociables:**
1. GPT nunca escribe un SKU — solo devuelve texto entendido; el match contra catálogo es código determinístico del backend.
2. Ningún registro con alerta abierta o confianza < 0.6 se guarda sin confirmación humana explícita.
3. La captura funciona sin backend (modo degradado con parser local): si `/extract` no responde en 3.000 ms, el cliente usa su parser propio.
4. El saldo del sistema NUNCA se sobreescribe durante la toma: la toma es una foto paralela que se concilia al cierre.

---

## 1 · Estructura del repositorio (crear exactamente así)

```
clara/
├── frontend/                      # React 18 + Vite + vite-plugin-pwa
│   ├── src/
│   │   ├── main.jsx  App.jsx
│   │   ├── screens/               # P0..P6 (una carpeta por pantalla, ver guía UI)
│   │   │   ├── Identificacion/  SeleccionBodega/  Captura/
│   │   │   ├── ResumenFirma/  ReporteEnvio/  Perfil/
│   │   ├── components/            # según inventario §6 de la guía UI
│   │   ├── stores/session.js      # Zustand: sesión de conteo
│   │   ├── stores/auth.js         # Zustand: usuario identificado
│   │   ├── lib/api.js             # cliente HTTP con timeout 3000ms y fallback
│   │   ├── lib/parser.js          # parser local de respaldo (portar de prototipo_mise.html)
│   │   ├── lib/matcher.js         # fuzzy matching local de respaldo (ídem)
│   │   ├── lib/facial.js          # wrapper face-api.js
│   │   ├── lib/voice.js           # wrapper Web Speech API
│   │   └── lib/offline.js         # cola IndexedDB (librería idb)
│   └── public/models/             # pesos de face-api.js (tiny_face_detector + face_recognition)
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI, CORS: origen del frontend + localhost:5173
│   │   ├── routers/extract.py  validate.py  sessions.py  report.py  transcribe.py
│   │   ├── services/gpt.py  matcher.py  rules.py  telegram.py  emailer.py  pdf.py
│   │   ├── models.py              # Pydantic (esquemas §3)
│   │   └── db.py                  # SQLite via sqlite3 o SQLModel
│   ├── seed/catalogo_piscilago.json
│   ├── seed/seed.py               # JSON → SQLite (tablas §2)
│   ├── requirements.txt           # fastapi uvicorn openai pydantic python-multipart weasyprint openpyxl httpx python-dotenv
│   └── .env.example               # OPENAI_API_KEY= TELEGRAM_BOT_TOKEN= TELEGRAM_CHAT_ID= RESEND_API_KEY=
└── docs/                          # este archivo + guía UI + deck
```

**Variables de entorno:** solo en backend. El frontend JAMÁS contiene la API key de OpenAI.

---

## 2 · Modelo de datos (SQLite — crear con `seed.py`)

```sql
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY, nombre TEXT, cargo TEXT, bodega_asignada TEXT,
  turno TEXT, pin TEXT,               -- pin en claro está OK para el MVP demo
  password_hash TEXT                  -- sha256, para la firma
);
CREATE TABLE articulos (
  id INTEGER PRIMARY KEY, sku TEXT NULL, articulo TEXT NOT NULL,
  articulo_norm TEXT NOT NULL,        -- normalizado: minúsculas, sin tildes, sin dobles espacios
  bodega TEXT NOT NULL, unidad TEXT CHECK(unidad IN ('Unidad','Kilogram','Liter','Portion')),
  stock_sistema REAL NOT NULL         -- saldo del corte (semilla del xlsx; NO se modifica en la toma)
);
CREATE TABLE sesiones (
  id TEXT PRIMARY KEY,                -- uuid4
  usuario_id INTEGER, bodega TEXT, modo TEXT CHECK(modo IN ('toma','requisicion')),
  inicio TEXT, fin TEXT NULL, firmada INTEGER DEFAULT 0, hash_firma TEXT NULL
);
CREATE TABLE registros (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sesion_id TEXT, articulo_id INTEGER,
  cantidad_fisica REAL, unidad TEXT, estado_producto TEXT NULL,   -- "buen estado", etc.
  confianza REAL, alertas_json TEXT,  -- lista serializada de alertas mostradas y su resolución
  corregido INTEGER DEFAULT 0,        -- 1 si hubo corrección conversacional
  timestamp TEXT
);
```

**Datos demo a sembrar:** 3 usuarios — Sofía Valencia (Auxiliar Cocina 2, `STOCK RESTAURANTE FUENTES AYB`, PIN 1234), Carlos Ramírez (Jefe de Cocina), Piedad Gómez (Administradora). Histórico simulado: por cada artículo, generar `hist_min = stock*0.7`, `hist_max = stock*1.3` cuando `stock > 0`; si `stock <= 0`, `hist_min=NULL` (sin banda → no aplica V1).

---

## 3 · Contratos de API (FastAPI — implementar EXACTAMENTE estos esquemas)

### 3.1 `POST /extract`
Convierte una frase en registro estructurado. **Request:**
```json
{ "frase": "quedan nueve cajas de harina pan en buen estado",
  "bodega": "STOCK RESTAURANTE FUENTES AYB",
  "sesion_id": "uuid", "contexto_ultimo_sku": "7290" }
```
**Pipeline interno:** (1) llamar GPT (§4) → entidades crudas; (2) `services/matcher.py` resuelve `producto_texto` → artículo del catálogo (§5); (3) responder:
```json
{ "tipo": "registro",                  // "registro" | "correccion" | "no_match" | "ambiguo"
  "articulo": {"id": 812, "sku": "7290", "nombre": "ACEITE", "unidad": "Liter",
               "stock_sistema": 851.43, "bodega": "STOCK RESTAURANTE FUENTES AYB"},
  "cantidad": 9.0, "unidad_dicha": "Unidad", "estado_producto": "buen estado",
  "confianza_match": 0.92,             // score del matcher normalizado 0-1
  "alternativas": [{"id":813,"sku":null,"nombre":"ACEITE DE AJONJOLI"}],  // top-3 restantes
  "correccion_de": null }              // id de registro si tipo=correccion
```
- `tipo="correccion"`: la frase es del estilo "perdón, son nueve" / "no, corrige, eran doce kilos" → `correccion_de` = último registro de la sesión (el cliente lo envía en `contexto_ultimo_sku`).
- `tipo="no_match"`: matcher < 0.35 en la bodega Y global → el cliente ofrece "reportar referencia nueva".
- `tipo="ambiguo"`: falta cantidad o unidad → el cliente pregunta con chips.
- **Timeout total del endpoint ≤ 2.500 ms** (el cliente corta a 3.000 y usa parser local).

### 3.2 `POST /validate`
**Request:** `{ "articulo_id": 812, "cantidad": 90, "unidad_dicha": "Unidad", "sesion_id": "uuid", "modo": "toma" }`
**Response:** lista de alertas evaluando las reglas V1–V6 (§6):
```json
{ "alertas": [
   {"regla":"V1","nivel":"warn","mensaje":"¿Segura que son 90? Aquí suele haber entre 8 y 15.",
    "acciones":[{"label":"Sí, son 90","valor":90},{"label":"No, corregir","valor":null}]}
 ],
 "guardable_sin_confirmar": false }
```
`guardable_sin_confirmar = true` solo si `alertas == []` y confianza ≥ 0.85.

### 3.3 `POST /transcribe`
Multipart con blob de audio (webm/ogg) → Whisper (`whisper-1`, `language="es"`) → `{"texto": "..."}`. Solo lo llama el cliente cuando la confianza del Web Speech nativo < 0.8 o el usuario toca "no me entendió".

### 3.4 Sesiones
- `POST /sessions` `{usuario_id, bodega, modo}` → `{sesion_id, total_referencias}`.
- `POST /sessions/{id}/registros` — guarda un registro confirmado (esquema tabla `registros`). Acepta lista (sync de cola offline).
- `PATCH /sessions/{id}/registros/{rid}` — corrección: actualiza cantidad, marca `corregido=1`.
- `POST /sessions/{id}/firmar` `{usuario, password}` → valida hash, sella `fin`, `firmada=1`, `hash_firma = sha256(concat de registros ordenados)`. Después de firmar, la sesión es INMUTABLE (rechazar cualquier escritura con 409).
- `GET /sessions/{id}/resumen` → `{contadas, total, tiempo_min, corregidos, con_alerta, diferencias:[{articulo, fisico, sistema, delta}]}`.

### 3.5 `POST /report`
`{ "sesion_id": "uuid", "formatos": ["pdf","xlsx","csv"], "enviar": {"telegram": true, "email": "carlos@..."} }`
- **PDF** (WeasyPrint con plantilla HTML según guía UI §10.3): acta con membrete, resumen, tabla contado vs. sistema con deltas coloreados, bloque de firma (nombre, cargo, fecha, hash).
- **XLSX** (openpyxl): hoja 1 detalle de registros, hoja 2 diferencias.
- **CSV "listo para ERP":** columnas exactas del formato original del xlsx: `CANTIDAD;Nr.Artículo;Artículo;Unidad;SD` donde SD = cantidad física contada.
- **Telegram:** `httpx.post(f"https://api.telegram.org/bot{TOKEN}/sendDocument", ...)` al `TELEGRAM_CHAT_ID`. **Email:** Resend API con PDF adjunto. Si falta el token/key en `.env` → responder `{"envio": "simulado"}` y el frontend muestra el flujo igual (nunca romper el demo).

---

## 4 · Prompt de GPT (usar tal cual en `services/gpt.py`)

Modelo: `gpt-4o-mini` · `temperature=0` · **Structured Outputs** (`response_format` con JSON Schema `strict=true`).

**System prompt:**
```
Eres el motor de extracción de CLARA, asistente de inventarios de cocinas de Colsubsidio (Colombia).
Recibes una frase dictada por un operario durante una toma física de inventario.
Devuelve SOLO el JSON del esquema. Reglas:
- "producto_texto": el nombre del producto tal como lo dijo, limpio de muletillas. NO lo cambies por un nombre de catálogo.
- "cantidad": número. Convierte palabras a número ("nueve"→9, "treinta y cinco"→35, "media"→0.5, "docena"→12, "una arroba"→12.5 con unidad kg, "una libra"→0.5 con unidad kg).
- "unidad": una de: unidades|cajas|bolsas|paquetes|botellas|kilos|gramos|litros|porciones|null. "gramos" NO se convierte a kilos: repórtalo como gramos.
- "estado_producto": si menciona condición ("buen estado", "vencido", "averiado"), captúrala; si no, null.
- "es_correccion": true SOLO si la frase corrige lo anterior ("perdón...", "no, eran...", "me equivoqué", "corrige").
- "cantidad" o "unidad" ausentes en la frase → null (NO inventes).
Frases fuera de dominio (no son inventario) → producto_texto null.
```
**JSON Schema (campos, todos required, additionalProperties false):** `producto_texto: string|null`, `cantidad: number|null`, `unidad: string|null (enum de arriba)`, `estado_producto: string|null`, `es_correccion: boolean`.

**Conversión de unidades dichas → unidad de catálogo (código, NO GPT):** `kilos→Kilogram ×1`, `gramos→Kilogram ×0.001`, `litros→Liter ×1`, `porciones→Portion ×1`, `unidades|cajas|bolsas|paquetes|botellas→Unidad ×1` (si dijo caja/bolsa/paquete, adjuntar alerta V7 de factor de empaque).

**Tests de aceptación del prompt (correr los 10 antes de integrar):**
| Frase | producto_texto | cantidad | unidad |
|---|---|---|---|
| "quedan nueve cajas de harina pan" | harina pan | 9 | cajas |
| "treinta y cinco huevos" | huevos | 35 | unidades |
| "media arroba de cebolla" | cebolla | 12.5×0.5=6.25* | kilos |
| "diez gramos de aceite" | aceite | 10 | gramos |
| "perdón, son nueve" | null | 9 | null, es_correccion=true |
| "contamos ochenta porciones de guiso criollo en buen estado" | guiso criollo | 80 | porciones (+estado) |
| "harina cinco" | harina | 5 | null (→ tipo ambiguo) |
| "dos litros y medio de leche" | leche | 2.5 | litros |
| "no hay azúcar" | azúcar | 0 | null→unidades |
| "hola cómo estás" | null | — | — (fuera de dominio) |

*La arroba la convierte GPT según prompt; verificar.

---

## 5 · Matcher (`services/matcher.py` — determinístico, portar la lógica ya probada del prototipo)

1. Normalizar query y catálogo: minúsculas, sin tildes, `\xa0`→espacio, colapsar espacios, quitar caracteres no alfanuméricos.
2. Score por tokens: token exacto=3 · prefijo=2 · substring (len>3)=1.5 · bonus frase completa contenida=2.5 · penalización `−0.05×len(tokens_nombre)`.
3. Buscar primero en la bodega de la sesión; si score máximo < 2, buscar global (marcar `otra_bodega=true` → alerta).
4. `confianza_match = min(1.0, score / (3 × n_tokens_query))`. Umbrales: `≥0.85` alta · `0.6–0.84` media (mostrar alternativas) · `0.35–0.59` baja (exigir confirmación) · `<0.35` → `no_match`.
5. Devolver top-4 (1 principal + 3 alternativas).

---

## 6 · Reglas de validación (`services/rules.py` — funciones puras, con tests)

| Regla | Condición exacta (pseudocódigo) | Nivel | Mensaje (plantilla) |
|---|---|---|---|
| **V1** cantidad atípica | `hist_min is not None and (cantidad < hist_min*0.5 or cantidad > hist_max*2) and abs(cantidad-stock) > 15` | warn | "¿Segura que son {cantidad}? Aquí suele haber entre {hist_min:.0f} y {hist_max:.0f}." |
| **V2** unidad incoherente | `unidad_convertida != articulo.unidad` | error | "Dijiste {unidad_dicha}; {articulo} se controla en {unidad_cat}. ¿Quisiste decir {cantidad} {unidad_cat}?" |
| **V3** ambigüedad | `cantidad is None or (unidad is None and articulo.unidad=='Unidad' es ambiguo) or confianza_match < 0.6` | warn | "¿{cantidad} qué? — cajas, bolsas o kilos" / "¿Será alguno de estos?" |
| **V4** saneamiento | `stock_sistema < 0` | info | "El sistema muestra {stock}. Tu conteo de {cantidad} lo corrige de raíz ✅" |
| **V5** doble conteo | `existe registro previo de articulo_id en la sesión` | warn | "Ya registraste {articulo} ({prev}). ¿Corrección o segundo estante (suma)?" — acciones: Reemplazar / Sumar / Cancelar |
| **V6** entero requerido | `articulo.unidad=='Unidad' and cantidad % 1 != 0` | error | "{articulo} se cuenta por unidades enteras." |
| **V7** factor de empaque | `unidad_dicha in (cajas,bolsas,paquetes)` | warn | "Capturaste por {unidad_dicha}: ¿cuántas unidades trae cada una?" — input numérico multiplica |

Orden de evaluación: V2 → V6 → V3 → V5 → V7 → V1 → V4. `error` bloquea guardar hasta resolver; `warn` exige elegir una acción; `info` no bloquea.

---

## 7 · Frontend — comportamiento por módulo (la apariencia está en la guía UI; aquí va la lógica)

### 7.1 `lib/voice.js`
- `startListening(onInterim, onFinal)` → `webkitSpeechRecognition`, `lang='es-CO'`, `interimResults=true`, `continuous=false`.
- Si `SpeechRecognition` no existe (iOS Safari viejo) → devolver `{supported:false}` y la UI muestra solo el campo de texto SIN romperse.
- Grabar en paralelo con `MediaRecorder`; si `confidence` del resultado final < 0.8 → enviar blob a `/transcribe` y usar esa transcripción.

### 7.2 `lib/facial.js`
- Cargar `tinyFaceDetector` + `faceRecognitionNet` desde `/models` (pesos en el repo, ~6 MB).
- `enroll(nombre)`: captura 3 frames, promedia descriptores, guarda en `localStorage` (`clara_faces`).
- `identify()`: descriptor actual vs. galería con distancia euclidiana; match si `< 0.5`. **Dos fallos consecutivos o 5 s sin rostro → mostrar automáticamente el teclado PIN.** El demo JAMÁS se queda esperando la cámara.
- La imagen nunca sale del dispositivo: no hay endpoint de rostros en el backend (verificable en el código — argumento de privacidad del pitch).

### 7.3 `stores/session.js` (Zustand)
Estado: `{sesionId, bodega, modo, registros[], pendientesSync[], totalRefs, contadas, ultimoRegistroId, online}`.
- `agregarRegistro(r)`: si `navigator.onLine` → POST; si falla o offline → push a `pendientesSync` + persistir en IndexedDB.
- Listener `window.online` → flush de `pendientesSync` en orden.
- `corregirUltimo(cantidad)`: PATCH + marca visual de tachado.
- Barra de avance: `contadas / totalRefs` de la bodega (viene de `/sessions`).

### 7.4 `lib/api.js`
- `extract(frase)`: `AbortController` con timeout 3.000 ms → catch → `parserLocal(frase)` + `matcherLocal()` y marcar el registro con `origen:'local'`. La UI no distingue visualmente (misma tarjeta), solo un caption "procesado en el dispositivo".

### 7.5 Flujo de pantallas (máquina de estados)
`P0 Identificación → P1 Bodega → P2 Captura ⇄ (tarjeta registro/alerta) → P4 Resumen+Firma → P5 Reporte+Envío → P6 Perfil`.
Regla: desde P2 siempre se puede volver a P1 (cambiar bodega guarda la sesión abierta). Tras firmar (P4→P5), la sesión pasa a solo-lectura.

---

## 8 · Orden de construcción (para agentes: cada fase deja algo demostrable)

| # | Tarea | Depende de | Criterio de "hecho" (verificable) |
|---|---|---|---|
| 1 | `seed.py` + SQLite + FastAPI esqueleto con CORS | — | `GET /health` 200; `SELECT count(*) FROM articulos` = 1405 |
| 2 | `/extract` con GPT + matcher | 1 | Los 10 tests del §4 pasan contra el endpoint real |
| 3 | `/validate` con V1–V7 | 1 | Test unitario por regla (14 casos: cada regla dispara y no dispara) |
| 4 | Vite PWA + pantallas esqueleto + stores | — | Navegación P0→P5 con datos mock en el navegador |
| 5 | P2 Captura: voz + texto + tarjeta + alertas | 2,3,4 | Demo E2E: "quedan 90 cajas de arroz" → alerta V1 → corregir → guardado |
| 6 | Parser/matcher local + timeout fallback + cola offline | 4 | Con backend apagado, el flujo del paso 5 sigue funcionando |
| 7 | Sesión viva: avance, doble conteo, corrección conversacional | 5 | V5 dispara; "perdón, son nueve" edita el registro |
| 8 | P0 facial + PIN | 4 | Reconoce 2 caras enroladas; con cámara tapada, PIN aparece solo |
| 9 | P4 firma + `/sessions/firmar` + inmutabilidad | 5 | Tras firmar, un POST de registro devuelve 409 |
| 10 | `/report` PDF/XLSX/CSV + P5 | 9 | Los 3 archivos se generan con datos de una sesión real |
| 11 | Telegram + email reales | 10 | PDF llega a un chat de Telegram y a un correo |
| 12 | UI final según guía de diseño + PWA instalable | 5-11 | Lighthouse PWA ≥ 90; revisión visual contra la guía |
| 13 | QA en el dispositivo del demo + video plan B | 12 | Flujo completo grabado en el celular definido para el pitch |

**Desarrollo y pruebas: en Chrome de escritorio** (DevTools modo móvil). **Verificación diaria de 10 min en el celular del demo** (definir día 1 cuál es: marca/OS). HTTPS obligatorio para cámara/micrófono fuera de localhost → desplegar temprano (frontend: Vercel; backend: Railway/Render).

---

## 9 · Fuera de alcance (NO implementar aunque parezca fácil)

Integración real con ERP · gestión de usuarios (CRUD) · recuperación de contraseña · multi-idioma · notificaciones push · WhatsApp/Teams reales (solo botones "próximamente") · edición de catálogo · modo requisición completo (solo el selector y el descuento simple contra disponible, si sobra tiempo).

---

## 10 · Riesgos operativos y su respuesta implementada

| Riesgo | Respuesta EN CÓDIGO (no en promesas) |
|---|---|
| OpenAI caído/lento en demo | Timeout 3 s → parser local (paso 6) |
| Backend caído | Catálogo completo en IndexedDB desde el primer load; flujo core 100 % cliente |
| Micrófono falla en escenario | Campo de texto + chips de frases demo siempre visibles |
| Cámara/luz mala | Fallback PIN automático a los 5 s |
| Sin red en el recinto | Cola offline + video plan B grabado en paso 13 |
| Gasto API descontrolado | Tope USD 10 en dashboard OpenAI el día 1; gpt-4o-mini (~USD 0.15 por millón de tokens de entrada) |

---

## 11 · Métricas que el demo debe poder mostrar en vivo

- Tiempo por referencia capturada (cronómetro de sesión) — objetivo < 10 s/frase.
- Contador de errores interceptados (alertas resueltas + correcciones).
- 0 registros ambiguos guardados (por diseño, mostrable en la tabla `registros`).
- El acta CSV con el formato exacto del xlsx original — "así entra limpio al ERP".
