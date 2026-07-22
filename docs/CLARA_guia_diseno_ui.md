# CLARA — Especificación de Diseño UI
### Documento ejecutable: un agente debe poder construir cada pantalla leyendo SOLO este documento y la spec del MVP (`CLARA_plan_desarrollo_mvp.md`). La lógica vive allá; aquí vive TODO lo visual y de interacción.
**Identidad alineada a la marca Colsubsidio · Hackathon Colsubsidio × 30X**

---

## 1 · Identidad

- **Nombre:** CLARA (*Captura por Lenguaje Asistido con Reconocimiento y Análisis*). Doble lectura: la asistente que saluda ("Hola, soy Clara") + la promesa "cuentas claras".
- **Tagline:** "Cuentas claras, cocina tranquila."
- **Wordmark:** texto "CLARA" en Poppins Bold, color `--cs-azul`, tracking `+0.02em`, acompañado del símbolo tangram (SVG §9) a la izquierda. NO diseñar logo nuevo.
- **Personalidad de Clara (rige todo microcopy, §8):** cercana, operativa, jamás regaña; pregunta con curiosidad y celebra los cierres.

> ⚠️ Los valores de color derivan de los activos públicos de Colsubsidio (sitio oficial + rediseño 2021: tangram amarillo, wordmark azul, tipografía Hurme Geometric Sans 4). Si Colsubsidio entrega manual de marca oficial durante el evento, sus valores REEMPLAZAN a estos.

---

## 2 · Design tokens (copiar tal cual a `frontend/src/index.css`)

```css
:root{
  /* — Marca Colsubsidio — */
  --cs-amarillo:      #FFD000;  /* SOLO acción primaria: botón hablar, CTA, foco */
  --cs-amarillo-dk:   #EBBF00;  /* pressed del amarillo */
  --cs-azul:          #0067B1;  /* barras superiores, enlaces, identidad */
  --cs-azul-dk:       #004E86;  /* hover/pressed del azul, titulares sobre claro */
  --cs-tinta:         #333333;  /* texto principal */

  /* — Soporte (ecosistema digital Colsubsidio) — */
  --cs-celeste:       #A1D6EF;  /* seleccionados suaves, burbuja de Clara (al 40%) */
  --cs-nube:          #F4FAFD;  /* fondo general de pantalla */
  --cs-niebla:        #F6F7FC;  /* fondo alterno, filas zebra */
  --cs-borde:         #CFD8E3;  /* bordes, divisores */
  --cs-gris:          #EBEBEB;  /* deshabilitado, skeleton */

  /* — Semánticos (¡ámbar ≠ amarillo marca, a propósito!) — */
  --ok:               #2E8540;
  --alerta:           #E8A200;
  --error:            #C6262E;
  --info:             #0067B1;

  /* — Theming por unidad de negocio (una sola variable) — */
  --acento-contexto:  #00A5A8;  /* Parques/Piscilago. Hotelería: #0067B1. AyB: #E8734A */

  /* — Tipografía — */
  --font: 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;

  /* — Geometría — */
  --r-card: 16px;  --r-btn: 12px;  --r-chip: 999px;
  --sombra-card: 0 2px 8px rgba(0,44,80,.06);
  --tap-min: 48px;             /* objetivo táctil mínimo */
}
```

**Reglas duras de color (verificables en revisión):**
1. `--cs-amarillo` aparece ÚNICAMENTE en: botón de hablar, botón primario, relleno de barra de avance, anillo de foco. Nunca en alertas, fondos ni texto.
2. Texto sobre amarillo: siempre `--cs-tinta`. Texto sobre azul: siempre `#FFFFFF`. Prohibido blanco sobre amarillo y ámbar en texto < 14 px.
3. Todo color semántico va SIEMPRE acompañado de icono + palabra (nunca color solo).
4. Proporción por pantalla ≈ 70 % neutros / 20 % azul / 10 % amarillo.

---

## 3 · Tipografía

- **Fuente:** Poppins vía Google Fonts (pesos 400, 600, 700). Fallback: la pila `--font`. (Hurme Geometric Sans 4 es la oficial de Colsubsidio pero es licenciada — usar solo si el equipo tiene licencia.)
- **Escala (base 16 px):**

| Token | Uso | Spec |
|---|---|---|
| `display` | "Hola, Sofía" | 28px / 700 / line-height 1.2 |
| `h1` | Título de pantalla | 22px / 700 |
| `h2` | Nombre de producto en tarjeta, secciones | 17px / 600 |
| `body` | Conversación, descripciones | 15px / 400 / lh 1.55 |
| `dato` | **Cantidad capturada** | 28px / 700 / `tabular-nums` |
| `caption` | SKU, hora, metadatos, confianza | 12px / 400 / `--cs-tinta` al 60% |
| `label` | Etiquetas de chips y badges | 11px / 600 / uppercase / tracking .05em |

- Números en tablas y cantidades: SIEMPRE `font-variant-numeric: tabular-nums`.

---

## 4 · Principios de interacción (rigen cualquier decisión no cubierta aquí)

1. **Manos ocupadas, ojos rápidos:** todo interactivo ≥ 48 px; el botón de hablar 88 px, fijo abajo al centro (zona de pulgar).
2. **Una decisión por pantalla:** Clara nunca hace dos preguntas a la vez.
3. **Lo dicho se ve al instante:** frase → tarjeta estructurada visible en < 1 s (con spinner de máx. 3 s si espera al backend).
4. **Estado siempre visible:** bodega, avance, red (en línea / guardando local), usuario firmado — los 4 visibles en P2 sin scroll.
5. **El error es conversación:** las alertas son preguntas con máximo 3 acciones de un toque; nunca modales que tapan todo.
6. **Nada ambiguo baja a la lista:** un registro con alerta abierta queda visualmente "flotando" (borde punteado ámbar) encima de la lista de confirmados.

---

## 5 · Especificación pantalla por pantalla

> **Dispositivo primario: TABLET 10–11" en horizontal.** Viewport de diseño: **1180×820** (iPad/Android tablet, landscape). Fondo `--cs-nube`, padding 24 px.
> Layout base: **dos paneles** — panel principal (conversación/captura, ~60 % izquierda) + panel de sesión (inventario vivo, ~40 % derecha, fondo blanco con borde izquierdo `--cs-borde`). Pantallas sin sesión activa (P0, P1) usan columna única centrada de máx 560 px.
> **Responsive obligatorio:** bajo 700 px de ancho (celular), el panel derecho se colapsa a una hoja deslizable desde abajo (bottom sheet con handle) y el layout vuelve a columna única — el mismo código sirve para ambos.

### P0 — Identificación (`screens/Identificacion/`)
| Elemento | Spec |
|---|---|
| Header | Wordmark CLARA + tangram, centrado, 24 px alto, sobre `--cs-nube` |
| Marco de cámara | Círculo 240 px centrado vertical, borde 3 px `--cs-azul`, video con `object-fit:cover`. Mientras busca: borde animado girando (2 s loop) |
| Estado | Caption bajo el círculo: "Buscando tu rostro…" → "¡Te encontré!" |
| Tarjeta bienvenida (al reconocer) | Card estándar: inicial/avatar 48 px, `display` "Hola, Sofía", caption "Auxiliar de Cocina 2 · Refrigerados · Turno mañana". Botones: `Confirmar` (primario) + `No soy yo` (secundario) |
| Fallback PIN | Enlace azul "Entrar con PIN" SIEMPRE visible bajo el círculo. A los 5 s sin rostro o 2 fallos → el teclado PIN (grid 3×4, teclas 64 px) sube automáticamente con animación slide-up |
| Estados | cargando modelos (skeleton + "Preparando cámara…") · sin permiso de cámara (mensaje + botón PIN) · reconocido · fallo |

### P1 — Selección de bodega (`screens/SeleccionBodega/`)
| Elemento | Spec |
|---|---|
| Header | Barra azul (`--cs-azul`, 56 px): título h1 blanco "¿Dónde vas a contar?", avatar sesión a la derecha |
| Lista | Una card por bodega asignada: nombre (h2), caption "344 referencias · última toma 30 jun". Si hay toma abierta: barra de avance mini + "47/344 · Continuar" |
| Bodega sugerida | Primera, con fondo `--cs-celeste` al 30 % y chip "Tu bodega" |
| Selector de modo | Segmented control 2 opciones: `Toma física` / `Requisición` (48 px alto) |

### P2 — Captura (`screens/Captura/`) — LA pantalla; 80 % del tiempo de uso
**Layout tablet: dos paneles.**

**Panel izquierdo (~60 %) — conversación y captura:**
1. **Barra superior** (azul, 56 px, ancho completo de la pantalla): nombre bodega (blanco, 15/600) · chip de red (§6) · avatar 32 px.
2. **Zona de conversación** (flex 1, scroll): burbujas — Clara izquierda (fondo `#E8F4FB`, radios 16/16/16/4, avatar tangram 24 px), transcripción del usuario derecha (blanco, borde `--cs-borde`, radios 16/16/4/16). Transcripción interina en itálica al 60 %.
3. **Tarjeta de registro** (aparece al pie de la conversación con slide-up 200 ms, ancho del panel): ver §5.1.
4. **Dock inferior del panel** (fondo blanco, sombra hacia arriba, padding 12): botón hablar 88 px circular amarillo con mic 36 px en tinta, centrado. Grabando: fondo pasa a `--error`, anillo pulsante (keyframe `pulse` 1.2 s). A la izquierda: campo de texto expandido SIEMPRE visible en tablet (hay espacio); a la derecha: botón "deshacer último" 48 px.

**Panel derecho (~40 %) — sesión en vivo (el "inventario que se llena solo"):**
1. **Encabezado del panel:** h2 "Toma en curso" + **barra de avance** (8 px riel `--cs-borde`, relleno `--cs-amarillo`) con caption "47 de 344 · 3 alertas".
2. **Lista de registros** (scroll independiente): `RegistroItem` en orden inverso (último arriba). El registro recién confirmado entra con highlight celeste 800 ms — ese destello mientras el operario habla ES el efecto demo.
3. **Registros con alerta abierta:** fijados arriba de la lista con borde punteado ámbar (regla §4.6).
4. **Pie del panel:** botón `Cerrar y firmar` (secundario azul) + caption con métricas vivas ("12 min · 3 correcciones").

**En celular (<700 px):** panel derecho → bottom sheet colapsada que muestra solo la barra de avance como asa; se desliza hacia arriba para ver la lista. El dock y la tarjeta se comportan igual.

#### 5.1 Tarjeta de registro (componente `RegistroCard`)
| Zona | Spec |
|---|---|
| Línea 1 | caption: `SKU 7290 · Almacén AyB` — si sku null: `SIN CÓDIGO EN EL MAESTRO` en `--error` |
| Línea 2 | h2 nombre del artículo + `ChipConfianza` (§6) |
| Cantidad | Input `dato` (28/700) centrado, 120 px, steppers − / + de 48 px a los lados; unidad al lado en body ("cajas → unidades" si aplica factor) |
| Referencia | caption: "Saldo en sistema: 851 litros · Toma física" |
| Alertas | 0–2 `AlertaInline` (§6) apiladas |
| Estado (si viene) | chip gris: "🏷 buen estado" |
| Alternativas | caption "¿No era este?" + hasta 3 chips con nombres alternativos |
| Acciones | `Confirmar` (primario, flex 1) + `Cancelar` (secundario). Si hay alerta nivel error: Confirmar deshabilitado hasta resolverla |
| Corrección | Cuando llega una corrección conversacional: la cantidad vieja se tacha (línea `--error`, 200 ms) y la nueva entra con fade — NO cerrar la tarjeta |

### P3 — no existe como pantalla: las alertas son `AlertaInline` DENTRO de la tarjeta (decisión de diseño: el operario nunca pierde contexto).

### P4 — Resumen y firma (`screens/ResumenFirma/`)
| Elemento | Spec |
|---|---|
| Métricas | Fila de 3 stat-tiles: "47 referencias", "12 min", "3 errores corregidos a tiempo" (dato 22/700 + caption) |
| Lista de diferencias | Tabla: artículo · físico · sistema · delta. Delta con flecha e ícono: verde si |delta|=0, ámbar si <10 %, rojo si ≥10 %. `tabular-nums` |
| Grupos colapsables | "✅ Consistentes (39)" colapsado · "⚠ Con alerta resuelta (8)" expandido |
| Bloque firma | Card con borde `--cs-azul`: inputs usuario/contraseña (48 px) + botón `Firmar toma` **AZUL, no amarillo** (firmar es acto formal, no acción operativa). Al firmar: check animado 600 ms + toast "Toma firmada ✅" |
| Layout tablet | Dos columnas: métricas + diferencias a la izquierda (~60 %), bloque de firma fijo a la derecha (~40 %). En celular: columna única, firma al final |

### P5 — Reporte y envío (`screens/ReporteEnvio/`)
| Elemento | Spec |
|---|---|
| Preview | Miniatura del PDF (primera página) en card con sombra |
| Formatos | 3 chips descargables: PDF · XLSX · CSV para ERP |
| Canales | Fila de 4 botones-canal 64 px: **Telegram** y **Correo** a color y activos; WhatsApp y Teams en `--cs-gris` con caption "requiere credenciales corporativas" (no deshabilitados en silencio: al tocarlos, toast explicativo) |
| Confirmación | Al enviar: check verde + caption "Enviado a Carlos Ramírez · 14:32" |
| Layout tablet | Dos columnas: preview del PDF grande a la izquierda (~55 %), formatos + canales + confirmación a la derecha |

### P6 — Perfil (`screens/Perfil/`)
Historial de tomas firmadas (cards: fecha, bodega, métricas, botón "re-generar reporte"). Header con datos del usuario y su bodega asignada. *Vista supervisor (solo si sobra tiempo): misma pantalla + sección "Registros por revisar" (los de confianza < 0.6 del equipo).*

---

## 6 · Inventario de componentes (`src/components/`)

| Componente | Props | Spec visual |
|---|---|---|
| `BotonPrimario` | `{label, onPress, disabled}` | Amarillo, texto tinta 15/600, radio 12, alto 48; pressed: `--cs-amarillo-dk`; disabled: `--cs-gris` + texto 40 % |
| `BotonSecundario` | ídem | Transparente, borde 1.5 px azul, texto azul |
| `BotonVoz` | `{estado: idle\|grabando\|procesando}` | 88 px círculo; idle amarillo/mic tinta; grabando `--error` + anillo `pulse`; procesando: spinner 3 puntos |
| `ChipConfianza` | `{valor: 0-1}` | ≥.85 verde "alta" · .6–.84 ámbar "revisar" · <.6 rojo "confirmar" — icono + palabra + %, píldora 11/600 |
| `ChipRed` | `{online: bool}` | "● en línea" (azul s/ blanco) / "○ guardando local" (ámbar) — clickable en build demo para simular |
| `AlertaInline` | `{nivel, mensaje, acciones[]}` | Banda radio 8, padding 10×12: warn fondo `#FBF3DC`, error `#F9E7E7`, info `#E8F4FB`, ok `#E7F3EA`; icono 16 + body 13.5; máx 3 botones-acción (chips 40 px alto) |
| `RegistroCard` | ver §5.1 | Card blanca radio 16, sombra card |
| `RegistroItem` | `{registro}` | Fila de lista: nombre + caption meta izquierda; cantidad `dato-sm` (17/700) + `Badge` derecha |
| `Badge` | `{tipo: sincronizado\|pendiente\|alerta\|corregido}` | label 11/600 en píldora: verde/ámbar/rojo/azul |
| `BarraAvance` | `{actual, total, alertas}` | Riel 8 px `--cs-borde` radio full, relleno amarillo, etiqueta caption |
| `StatTile` | `{valor, etiqueta}` | Card, dato 22/700 + caption |
| `BurbujaClara` / `BurbujaUsuario` | `{texto}` | §5 zona 3 |
| `TecladoPin` | `{onSubmit}` | Grid 3×4, teclas 64 px, dots de progreso arriba |
| `Toast` | `{nivel, mensaje}` | Slide-down desde arriba, 3 s, icono + texto, un toast a la vez |

**Iconos:** Lucide (`lucide-react`), trazo 2 px, tamaño 24 (16 en captions). **PROHIBIDO emoji en la UI** (los ✅/⚠ de este doc son notación; en pantalla van iconos Lucide: `check-circle`, `alert-triangle`, `info`, `mic`, `wifi-off`…).

---

## 7 · Movimiento y sonido

- Transiciones 150–250 ms `ease-out`. Nada rebota (herramienta de trabajo, no juguete).
- Animaciones permitidas (SOLO estas): slide-up de tarjeta de registro · tachado de corrección (90→9) · pulso de grabación · check de firma · slide del teclado PIN.
- Sonido (Web Audio, 3 tonos cortos generados, sin archivos): reconocido (1 tono 880 Hz 80 ms) · alerta (2 tonos descendentes) · firma (acorde breve). Toggle en header de P6; alternativa `navigator.vibrate(50)`.
- Respetar `prefers-reduced-motion`: todo pasa a fades de 100 ms.

---

## 8 · Microcopy de Clara (usar estos textos EXACTOS; ampliar imitando el patrón)

| Momento | Texto |
|---|---|
| Bienvenida P0 | "Hola, {nombre}. ¿Lista para {bodega}?" |
| Inicio P2 | "Te escucho. Dime qué contaste — por ejemplo: «quedan nueve cajas de harina»." |
| V1 | "¿Segura que son {n}? Aquí suele haber entre {min} y {max}." |
| V2 | "{articulo} se controla en {unidad}. ¿Quisiste decir {n} {unidad}?" |
| V3 cantidad | "¿{articulo} cuánto? Dime la cantidad." |
| V3 unidad | "¿{n} qué? — cajas, bolsas o kilos" |
| V4 | "El sistema muestra {stock}. Tu conteo lo corrige de raíz." |
| V5 | "Ya registraste {articulo} ({prev}). ¿Es corrección o un segundo estante?" |
| V7 | "Capturaste por {empaque}. ¿Cuántas unidades trae cada una?" |
| Sin match | "No encontré «{texto}» en esta bodega. ¿Será alguno de estos?" |
| Offline | "Sin señal por aquí — sigo guardando en el teléfono. Todo se sube al volver." |
| Cierre | "Toma firmada. {n} referencias en {t} minutos, {e} errores corregidos a tiempo." |

Regla: Clara pregunta, no acusa; informa, no alarma; siempre ofrece la salida en el mismo mensaje. Trato de "tú". Sin jerga técnica jamás ("no encontré ese producto", nunca "match score insuficiente").

---

## 9 · Activos

- **Tangram (el ave de CLARA):** SVG propio — 5–7 polígonos geométricos simples (triángulos + cuadrado + paralelogramo) en `--cs-amarillo` formando un **ave abstracta**, sobre transparente. NO copiar el logo exacto de Colsubsidio (no tenemos el vector oficial); es un *motivo inspirado*. Usos: avatar de Clara (24 px), splash, icono PWA, estados vacíos.
  **Justificación del ave (usar en pitch y defensa de marca):** (1) el ave es el animal de la voz — canta al amanecer, cuando las cocinas arrancan turno; CLARA funciona hablando y escuchando. (2) Colombia es el país con más especies de aves del mundo (~1.900): identidad nacional instantánea para una marca colombiana, con guiño a Piscilago y su zoológico. (3) El ave está *armada* con piezas tangram, el lenguaje visual de Colsubsidio: un inventario que cuadra es un tangram resuelto — todas las piezas encajan. Frase canónica: *"CLARA es un ave armada en tangram: canta como la voz que captura el inventario, encaja como las cuentas que por fin cuadran, y es colombiana como el país con más aves del mundo."*
- **Icono PWA:** tangram amarillo sobre `--cs-azul`, 512/192/64. `theme_color: #0067B1`, `background_color: #F4FAFD` en el manifest.
- **Estados vacíos:** tangram gris + body: "Aún no hay tomas. Toca el micrófono para empezar."

## 10 · Piezas hermanas (misma familia visual)

1. **PDF del acta** (plantilla HTML para WeasyPrint): encabezado banda azul con wordmark CLARA blanco + fecha/bodega; tabla con zebra `--cs-niebla`; deltas coloreados; pie con bloque de firma (nombre, cargo, hash, hora) y tangram pequeño.
2. **Deck del pitch:** mismos tokens (fondo nube, titulares azul oscuro, acentos amarillos SOLO en datos clave, Poppins).
3. **Bot de Telegram:** avatar = icono PWA; mensaje de envío: "📋 Acta de inventario — {bodega} · {fecha} · firmada por {nombre}".

## 11 · Checklist de aceptación visual (revisar antes del pitch)

- [ ] Ningún texto blanco sobre amarillo; ningún semántico sin icono+palabra.
- [ ] Amarillo solo en acción/avance/foco (buscar `--cs-amarillo` en el CSS y verificar cada uso).
- [ ] Todos los interactivos ≥ 48 px reales (auditar con DevTools).
- [ ] P2 en tablet muestra sin scroll: bodega, avance, red, botón de hablar Y la lista de sesión del panel derecho.
- [ ] El responsive <700 px funciona: panel derecho colapsa a bottom sheet, nada se rompe.
- [ ] Cantidades y tablas en `tabular-nums`.
- [ ] Flujo completo navegable solo con teclado y solo con toque.
- [ ] `prefers-reduced-motion` respetado.
- [ ] Contraste AA verificado en: tinta/nube, blanco/azul, tinta/amarillo, azul/blanco.
- [ ] Cero emojis en la UI; iconos Lucide en su lugar.
- [ ] Probado en el celular definido para el demo (no solo DevTools).
