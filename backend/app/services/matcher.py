from __future__ import annotations

import re
import sqlite3
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher


MATCH_NOISE_WORDS = {
    "agrega", "agregar", "agregue", "anada", "anade", "anadir", "anota",
    "anote", "anotar", "apunta", "apunte", "apuntar", "ingresa", "ingrese",
    "ingresar", "registra", "registre", "registrar", "pon", "ponga", "poner",
    "suma", "sume", "sumar", "marca", "marque", "marcar", "quiero",
    "necesito", "puede", "puedes", "podria", "podrias", "podemos",
    "ayuda", "ayudas", "ayudar", "quieres", "por", "favor", "porfa",
    "a", "de", "del", "el", "la", "los", "las", "un", "una", "unos", "unas",
}


def normalize_text(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", (value or "").replace("\xa0", " "))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-zA-Z0-9\s]", " ", text.lower())
    return " ".join(text.split())


def meaningful_tokens(value: str | None) -> list[str]:
    return [
        token for token in normalize_text(value).split()
        if token not in MATCH_NOISE_WORDS
    ]


def clean_product_query(value: str | None) -> str:
    return " ".join(meaningful_tokens(value))


def _token_score(query_token: str, name_token: str) -> float:
    if query_token == name_token:
        return 3.0
    if len(query_token) < 3 or len(name_token) < 3:
        return 0
    if query_token.startswith(name_token) or name_token.startswith(query_token):
        return 2.2
    if len(query_token) >= 4 and len(name_token) >= 4 and (
        query_token in name_token or name_token in query_token
    ):
        return 1.8
    similarity = SequenceMatcher(None, query_token, name_token).ratio()
    return 1.6 if similarity >= 0.78 else 0


def lexical_coverage(query: str, name: str) -> float:
    query_tokens = meaningful_tokens(query)
    name_tokens = meaningful_tokens(name)
    if not query_tokens:
        return 0
    matched = sum(
        1 for token in query_tokens
        if max((_token_score(token, candidate) for candidate in name_tokens), default=0) > 0
    )
    return matched / len(query_tokens)


def is_variant_family(query: str, name: str) -> bool:
    query_tokens = meaningful_tokens(query)
    name_tokens = meaningful_tokens(name)
    if not query_tokens or len(name_tokens) < len(query_tokens):
        return False
    return all(
        _token_score(query_token, name_tokens[index]) > 0
        for index, query_token in enumerate(query_tokens)
    )


def score_name(query: str, name: str) -> float:
    query_norm = clean_product_query(query)
    name_norm = clean_product_query(name)
    query_tokens = query_norm.split()
    name_tokens = name_norm.split()
    if not query_tokens:
        return 0

    score = 0.0
    matched = 0
    for token in query_tokens:
        token_score = max(
            (_token_score(token, candidate) for candidate in name_tokens),
            default=0,
        )
        score += token_score
        if token_score > 0:
            matched += 1
    score -= (len(query_tokens) - matched) * 1.25
    if query_norm and query_norm == name_norm:
        score += 2.5
    return max(0, score - (0.05 * len(name_tokens)))


@dataclass
class Match:
    article: sqlite3.Row | None
    confidence: float
    alternatives: list[tuple[sqlite3.Row, float]]
    other_warehouse: bool = False
    ambiguous: bool = False


def _rank(rows: list[sqlite3.Row], query: str) -> list[tuple[sqlite3.Row, float]]:
    ranked = [(row, score_name(query, row["articulo"])) for row in rows]
    return sorted(ranked, key=lambda item: item[1], reverse=True)


def match_catalog(connection: sqlite3.Connection, query: str, warehouse: str) -> Match:
    query = clean_product_query(query)
    tokens = meaningful_tokens(query)
    if not tokens:
        return Match(None, 0, [])

    local = connection.execute(
        "SELECT * FROM articulos WHERE bodega = ?", (warehouse,)
    ).fetchall()
    ranked = _rank(local, query)
    other_warehouse = False

    local_supported = bool(
        ranked
        and ranked[0][1] / (3 * len(tokens)) >= 0.45
        and lexical_coverage(query, ranked[0][0]["articulo"]) >= 0.6
    )
    if not local_supported:
        global_rows = connection.execute("SELECT * FROM articulos").fetchall()
        ranked = _rank(global_rows, query)
        other_warehouse = bool(ranked and ranked[0][0]["bodega"] != warehouse)

    if not ranked:
        return Match(None, 0, [])

    main_row, main_score = ranked[0]
    confidence = min(1.0, main_score / (3 * len(tokens)))
    coverage = lexical_coverage(query, main_row["articulo"])
    close_matches = [
        (row, score)
        for row, score in ranked[1:7]
        if score > 0 and score >= main_score * 0.82
    ]
    family_matches = [
        (row, score)
        for row, score in ranked[1:7]
        if score > 0 and is_variant_family(query, row["articulo"])
    ]
    selection_matches = family_matches or close_matches
    is_supported = confidence >= 0.45 and coverage >= 0.6
    eligible_selection_matches = selection_matches if is_supported else []
    alternatives = [
        (row, min(1.0, score / (3 * len(tokens))))
        for row, score in (
            eligible_selection_matches if eligible_selection_matches else ranked[1:4]
        )
        if score > 0
        and (
            bool(eligible_selection_matches)
            or (
                score / (3 * len(tokens)) >= 0.35
                and lexical_coverage(query, row["articulo"]) >= 0.6
            )
        )
    ]
    ambiguous = bool(eligible_selection_matches)
    return Match(
        main_row if is_supported else None,
        confidence,
        alternatives,
        other_warehouse,
        ambiguous,
    )
