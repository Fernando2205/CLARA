from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


UnitSpeech = Literal[
    "unidades", "cajas", "bolsas", "paquetes", "botellas",
    "kilos", "gramos", "litros", "porciones"
]


class RawExtraction(BaseModel):
    producto_texto: str | None
    cantidad: float | None
    unidad: UnitSpeech | None
    estado_producto: str | None
    es_correccion: bool


class ExtractRequest(BaseModel):
    frase: str = Field(min_length=1, max_length=500)
    bodega: str
    sesion_id: str | None = None
    contexto_ultimo_sku: str | None = None


class ArticleOut(BaseModel):
    id: int
    sku: str | None
    nombre: str
    unidad: str
    stock_sistema: float
    bodega: str


class AlternativeOut(BaseModel):
    id: int
    sku: str | None
    nombre: str
    unidad: str | None = None
    bodega: str | None = None
    stock_sistema: float | None = None
    confianza: float | None = None


class ExtractResponse(BaseModel):
    tipo: Literal["registro", "correccion", "no_match", "ambiguo"]
    articulo: ArticleOut | None = None
    cantidad: float | None = None
    unidad_dicha: str | None = None
    estado_producto: str | None = None
    confianza_match: float = 0
    alternativas: list[AlternativeOut] = []
    requiere_seleccion: bool = False
    correccion_de: int | None = None
    origen: Literal["openai", "local"] = "local"


class ValidateRequest(BaseModel):
    articulo_id: int
    cantidad: float | None = None
    unidad_dicha: str | None = None
    sesion_id: str | None = None
    modo: str = "toma"
    confianza_match: float = 1


class AlertAction(BaseModel):
    label: str
    valor: str | float | None = None


class AlertOut(BaseModel):
    regla: str
    nivel: Literal["error", "warn", "info"]
    mensaje: str
    razon: str | None = None
    recomendacion: str | None = None
    acciones: list[AlertAction] = []


class ValidateResponse(BaseModel):
    alertas: list[AlertOut]
    guardable_sin_confirmar: bool


class SessionCreate(BaseModel):
    usuario_id: int
    bodega: str
    modo: str = "toma"


class SessionCreated(BaseModel):
    sesion_id: str
    total_referencias: int


class RecordCreate(BaseModel):
    articulo_id: int
    cantidad_fisica: float
    unidad: str
    estado_producto: str | None = None
    confianza: float = 1
    alertas: list[dict] = []


class RecordUpdate(BaseModel):
    cantidad_fisica: float
    unidad: str | None = None


class SignRequest(BaseModel):
    usuario: str
    password: str


class ReportSend(BaseModel):
    telegram: bool = False
    email: str | None = None


class ReportRequest(BaseModel):
    sesion_id: str
    formatos: list[Literal["pdf", "xlsx", "csv"]] = ["pdf", "xlsx", "csv"]
    enviar: ReportSend = ReportSend()
    alcance: Literal["contados", "completo", "faltantes"] = "contados"


class ReportResponse(BaseModel):
    archivos: dict[str, str]
    envio: Literal["enviado", "parcial", "simulado", "no_solicitado"]
    detalle_envio: dict[str, str] = {}


class ApiMessage(BaseModel):
    ok: bool = True
    mensaje: str

    model_config = ConfigDict(extra="forbid")


AssistantIntent = Literal[
    "registrar", "consultar_existencia", "listar_inventario", "corregir",
    "explicar_alerta", "ayuda", "saludo", "desconocido",
]


class AssistantAnalysis(BaseModel):
    intencion: AssistantIntent
    producto_texto: str | None
    cantidad: float | None
    unidad: UnitSpeech | None
    estado_producto: str | None


class AssistantRequest(ExtractRequest):
    contexto_alerta: str | None = None


class InventoryItem(BaseModel):
    id: int
    sku: str | None
    nombre: str
    unidad: str
    bodega: str
    stock_sistema: float
    cantidad_actual: float
    fuente: Literal["sistema", "conteo_fisico"]
    contado_en_sesion: bool = False


class InventorySummary(BaseModel):
    total: int
    con_existencias: int
    sin_existencias: int
    saldo_negativo: int
    contadas_en_sesion: int = 0


class InventoryResponse(BaseModel):
    bodega: str
    items: list[InventoryItem]
    resumen: InventorySummary


class AssistantResponse(BaseModel):
    intencion: AssistantIntent
    mensaje: str
    mensaje_hablado: str
    hablar: bool = True
    accion_ui: Literal["ninguna", "mostrar_tarjeta", "mostrar_inventario"] = "ninguna"
    extraccion: ExtractResponse | None = None
    inventario: InventorySummary | None = None
    coincidencias: list[InventoryItem] = []
    origen: Literal["openai", "local"] = "local"


class SpeechRequest(BaseModel):
    texto: str = Field(min_length=1, max_length=900)


class UsuarioOut(BaseModel):
    id: int
    nombre: str
    cargo: str
    bodega_asignada: str | None = None
    turno: str | None = None
    firma_url: str | None = None


class RegisterResponse(BaseModel):
    ok: bool = True
    usuario: UsuarioOut


class FaceLoginResult(BaseModel):
    resultado: Literal["confirmado", "ambiguo", "sin_coincidencia"]
    usuario: UsuarioOut | None = None
    similitud: float = 0


class CredentialsLoginRequest(BaseModel):
    usuario: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=4, max_length=4)
