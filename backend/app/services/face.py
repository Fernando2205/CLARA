from __future__ import annotations

import numpy as np

EMBEDDING_MODEL = "buffalo_l"
EMBEDDING_DIM = 512

# Umbrales de similitud coseno sobre embeddings normalizados de InsightFace.
# Punto de partida razonable; ajustar tras probar con fotos reales de usuarios enrolados.
MATCH_THRESHOLD = 0.45
AMBIGUOUS_THRESHOLD = 0.32


class NoFaceDetectedError(Exception):
    """No se detectó ningún rostro en la imagen."""


class MultipleFacesDetectedError(Exception):
    """Se detectó más de un rostro en la imagen."""


_face_app = None


def get_face_app():
    global _face_app
    if _face_app is None:
        from insightface.app import FaceAnalysis

        app = FaceAnalysis(name=EMBEDDING_MODEL, providers=["CPUExecutionProvider"])
        app.prepare(ctx_id=-1)
        _face_app = app
    return _face_app


def extract_embedding(image_bytes: bytes) -> np.ndarray:
    import cv2

    buffer = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
    if image is None:
        raise NoFaceDetectedError("No se pudo leer la imagen enviada")

    faces = get_face_app().get(image)
    if len(faces) == 0:
        raise NoFaceDetectedError("No se detectó ningún rostro en la foto")
    if len(faces) > 1:
        raise MultipleFacesDetectedError("Se detectó más de un rostro en la foto")

    return np.asarray(faces[0].normed_embedding, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def find_best_match(
    embedding: np.ndarray, candidates: list[tuple[int, np.ndarray]]
) -> tuple[int, float] | None:
    best_id: int | None = None
    best_similarity = -1.0
    for usuario_id, candidate_embedding in candidates:
        similarity = cosine_similarity(embedding, candidate_embedding)
        if similarity > best_similarity:
            best_similarity = similarity
            best_id = usuario_id
    if best_id is None:
        return None
    return best_id, best_similarity


def embedding_to_blob(embedding: np.ndarray) -> bytes:
    return np.asarray(embedding, dtype=np.float32).tobytes()


def blob_to_embedding(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32)
