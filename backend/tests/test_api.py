from fastapi.testclient import TestClient

from app.main import app
from app.models import AssistantAnalysis
from app.routers import assistant as assistant_router
from app.routers import speech as speech_router
from app.services.speech import (
    _has_forbidden_preamble,
    _transcript_starts_with_message,
)


WAREHOUSE = "STOCK RESTAURANTE FUENTES AYB"


def test_health_and_seed():
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["articulos"] == 1405
    assert response.json()["database"] == "ok"


def test_local_development_cors_accepts_vite_on_any_port():
    with TestClient(app) as client:
        for origin in (
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
        ):
            response = client.options(
                "/assistant",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origin


def test_inventory_session_flow_and_reports():
    with TestClient(app) as client:
        created = client.post(
            "/sessions",
            json={"usuario_id": 1, "bodega": WAREHOUSE, "modo": "toma"},
        )
        assert created.status_code == 200
        session_id = created.json()["sesion_id"]

        extracted = client.post(
            "/extract",
            json={
                "frase": "doce litros de aceite de ajonjoli",
                "bodega": WAREHOUSE,
                "sesion_id": session_id,
                "contexto_ultimo_sku": None,
            },
        )
        assert extracted.status_code == 200
        body = extracted.json()
        assert body["tipo"] == "registro"
        assert body["articulo"]["nombre"] == "ACEITE DE AJONJOLI"
        assert body["cantidad"] == 12
        assert body["origen"] in {"local", "openai"}

        article_id = body["articulo"]["id"]
        original_stock = body["articulo"]["stock_sistema"]
        validation = client.post(
            "/validate",
            json={
                "articulo_id": article_id,
                "cantidad": 12,
                "unidad_dicha": "litros",
                "sesion_id": session_id,
                "modo": "toma",
                "confianza_match": body["confianza_match"],
            },
        )
        assert validation.status_code == 200

        saved = client.post(
            f"/sessions/{session_id}/registros",
            json={
                "articulo_id": article_id,
                "cantidad_fisica": 12,
                "unidad": "Liter",
                "estado_producto": "buen estado",
                "confianza": body["confianza_match"],
                "alertas": validation.json()["alertas"],
            },
        )
        assert saved.status_code == 200
        record_id = saved.json()["registros"][0]["id"]

        corrected = client.patch(
            f"/sessions/{session_id}/registros/{record_id}",
            json={"cantidad_fisica": 13},
        )
        assert corrected.status_code == 200

        summary = client.get(f"/sessions/{session_id}/resumen")
        assert summary.status_code == 200
        assert summary.json()["contadas"] == 1
        assert summary.json()["corregidos"] == 1
        assert summary.json()["diferencias"][0]["sistema"] == original_stock
        assert summary.json()["diferencias"][0]["fisico"] == 13

        signed = client.post(
            f"/sessions/{session_id}/firmar",
            json={"usuario": "Sofía Valencia", "password": "1234"},
        )
        assert signed.status_code == 200
        assert len(signed.json()["hash_firma"]) == 64
        assert signed.json()["inventario_maestro"] == {
            "aplicado": True,
            "articulos_actualizados": 1,
            "aplicado_en": signed.json()["fin"],
        }

        global_inventory = client.get(
            "/inventory",
            params={"bodega": WAREHOUSE},
        ).json()
        global_item = next(
            item for item in global_inventory["items"]
            if item["id"] == article_id
        )
        assert global_item["stock_sistema"] == 13
        assert global_item["cantidad_actual"] == 13

        signed_summary = client.get(f"/sessions/{session_id}/resumen").json()
        assert signed_summary["inventario_aplicado"] is True
        assert signed_summary["diferencias"][0]["sistema"] == original_stock
        assert signed_summary["diferencias"][0]["fisico"] == 13
        assert signed_summary["diferencias"][0]["delta"] == 13 - original_stock

        history = client.get("/sessions", params={"usuario_id": 1})
        assert history.status_code == 200
        entry = next(item for item in history.json() if item["sesion_id"] == session_id)
        assert entry["bodega"] == WAREHOUSE
        assert entry["contadas"] == 1
        assert entry["corregidos"] == 1
        assert entry["inventario_aplicado"] is True

        immutable = client.patch(
            f"/sessions/{session_id}/registros/{record_id}",
            json={"cantidad_fisica": 14},
        )
        assert immutable.status_code == 409

        report = client.post(
            "/report",
            json={
                "sesion_id": session_id,
                "formatos": ["pdf", "xlsx", "csv"],
                "enviar": {"telegram": True, "email": "demo@example.com"},
            },
        )
        assert report.status_code == 200
        result = report.json()
        assert result["envio"] == "simulado"
        assert set(result["archivos"]) == {"pdf", "xlsx", "csv"}
        for url in result["archivos"].values():
            download = client.get(url)
            assert download.status_code == 200
            assert download.content

        deleted = client.delete(f"/report/{session_id}")
        assert deleted.status_code == 200
        assert deleted.json()["eliminado"] is True
        for url in result["archivos"].values():
            assert client.get(url).status_code == 404

        # Idempotente: borrar de nuevo (o algo que nunca se generó) no falla.
        assert client.delete(f"/report/{session_id}").status_code == 200
        assert client.delete("/report/no-existe").status_code == 200

        # ".." literal se colapsa antes de llegar al servidor (normalización
        # estándar de URL); %2e%2e sí llega intacto y debe rechazarlo el guard.
        traversal = client.delete("/report/%2e%2e")
        assert traversal.status_code == 400


def test_conversational_correction_updates_latest_count_without_duplicates():
    with TestClient(app) as client:
        created = client.post(
            "/sessions",
            json={"usuario_id": 1, "bodega": WAREHOUSE, "modo": "toma"},
        )
        session_id = created.json()["sesion_id"]
        article = client.post(
            "/extract",
            json={"frase": "doce litros de aceite de ajonjoli", "bodega": WAREHOUSE},
        ).json()["articulo"]

        first = client.post(
            f"/sessions/{session_id}/registros",
            json={
                "articulo_id": article["id"],
                "cantidad_fisica": 1000,
                "unidad": article["unidad"],
            },
        )
        assert first.status_code == 200

        corrected = client.post(
            f"/sessions/{session_id}/registros",
            json={
                "articulo_id": article["id"],
                "cantidad_fisica": 10,
                "unidad": article["unidad"],
                "corregido": True,
            },
        )
        assert corrected.status_code == 200
        assert corrected.json()["registros"][0]["actualizado"] is True

        inventory = client.get(
            "/inventory",
            params={"bodega": WAREHOUSE, "sesion_id": session_id},
        ).json()
        item = next(row for row in inventory["items"] if row["id"] == article["id"])
        assert item["cantidad_actual"] == 10
        assert item["contado_en_sesion"] is True
        assert item["corregido"] is True

        summary = client.get(f"/sessions/{session_id}/resumen").json()
        assert summary["contadas"] == 1
        assert summary["corregidos"] == 1


def test_validate_integer_rule():
    with TestClient(app) as client:
        extracted = client.post(
            "/extract",
            json={"frase": "treinta y cinco huevos", "bodega": WAREHOUSE},
        ).json()
        assert extracted["articulo"]
        response = client.post(
            "/validate",
            json={
                "articulo_id": extracted["articulo"]["id"],
                "cantidad": 35.5,
                "unidad_dicha": "unidades",
                "confianza_match": 1,
            },
        )
        assert response.status_code == 200
        assert "V6" in {alert["regla"] for alert in response.json()["alertas"]}


def test_conversational_queries_and_complete_inventory():
    with TestClient(app) as client:
        created = client.post(
            "/sessions",
            json={"usuario_id": 1, "bodega": WAREHOUSE, "modo": "toma"},
        ).json()
        session_id = created["sesion_id"]

        query = client.post(
            "/assistant",
            json={
                "frase": "¿Tenemos leche?",
                "bodega": WAREHOUSE,
                "sesion_id": session_id,
            },
        )
        assert query.status_code == 200
        assert query.json()["intencion"] == "consultar_existencia"
        assert query.json()["accion_ui"] == "ninguna"
        assert query.json()["coincidencias"]
        assert query.json()["mensaje"] != query.json()["mensaje_hablado"]
        assert "sistema" in query.json()["mensaje_hablado"].lower()

        show_all = client.post(
            "/assistant",
            json={
                "frase": "Muéstrame todo el inventario",
                "bodega": WAREHOUSE,
                "sesion_id": session_id,
            },
        )
        assert show_all.status_code == 200
        assert show_all.json()["accion_ui"] == "mostrar_inventario"
        assert show_all.json()["mensaje"] != show_all.json()["mensaje_hablado"]

        inventory = client.get(
            "/inventory",
            params={"bodega": WAREHOUSE, "sesion_id": session_id},
        )
        assert inventory.status_code == 200
        result = inventory.json()
        assert result["resumen"]["total"] == len(result["items"])
        assert result["resumen"]["total"] > 100
        assert {
            "id", "sku", "nombre", "unidad", "stock_sistema",
            "hist_min", "hist_max", "cantidad_actual", "fuente",
            "contado_en_sesion",
        }.issubset(result["items"][0])
        historical_item = next(
            item for item in result["items"]
            if item["stock_sistema"] > 0
        )
        assert historical_item["hist_min"] is not None
        assert historical_item["hist_max"] is not None
        assert historical_item["hist_min"] <= historical_item["stock_sistema"]
        assert historical_item["hist_max"] >= historical_item["stock_sistema"]

        capture = client.post(
            "/assistant",
            json={
                "frase": "doce litros de aceite",
                "bodega": WAREHOUSE,
                "sesion_id": session_id,
            },
        )
        assert capture.status_code == 200
        assert capture.json()["accion_ui"] == "mostrar_tarjeta"
        assert capture.json()["extraccion"]["articulo"]["nombre"] == "ACEITE"
        assert capture.json()["extraccion"]["requiere_seleccion"] is True
        assert capture.json()["extraccion"]["tipo"] == "ambiguo"
        assert len(capture.json()["extraccion"]["alternativas"]) >= 3
        assert capture.json()["extraccion"]["unidad_dicha"] == "litros"
        assert capture.json()["mensaje"] != capture.json()["mensaje_hablado"]


def test_units_survive_assistant_analysis_and_voice_variations():
    cases = [
        ("doce litros de aceite", "litros"),
        ("tres lts de leche deslactosada", "litros"),
        ("seis botellas de agua", "botellas"),
        ("cuatro boteyas de agua", "botellas"),
    ]
    with TestClient(app) as client:
        for phrase, expected_unit in cases:
            response = client.post(
                "/assistant",
                json={"frase": phrase, "bodega": WAREHOUSE},
            )
            assert response.status_code == 200
            assert response.json()["extraccion"]["unidad_dicha"] == expected_unit


def test_voice_rejects_artificial_preambles():
    assert _has_forbidden_preamble("Claro, aquí está el mensaje")
    assert _has_forbidden_preamble("Por supuesto. El inventario tiene 10 productos.")
    assert _has_forbidden_preamble("Aquí tienes la respuesta.")
    assert not _has_forbidden_preamble("El inventario tiene 10 productos.")
    assert _transcript_starts_with_message(
        "El inventario tiene diez productos.", "El inventario tiene 10 productos."
    )
    assert not _transcript_starts_with_message(
        "Perfecto. El inventario tiene diez productos.",
        "El inventario tiene 10 productos.",
    )


def test_failed_local_match_gets_a_second_structured_interpretation(monkeypatch):
    async def fake_refinement(_, baseline):
        return AssistantAnalysis(
            intencion="registrar",
            producto_texto="aceite",
            cantidad=baseline.cantidad,
            unidad=baseline.unidad,
            estado_producto=baseline.estado_producto,
        )

    monkeypatch.setattr(
        assistant_router, "refine_failed_capture", fake_refinement
    )
    with TestClient(app) as client:
        response = client.post(
            "/assistant",
            json={
                "frase": "serías tan amable de apuntar 6 litros de aceite",
                "bodega": WAREHOUSE,
            },
        )
    assert response.status_code == 200
    extraction = response.json()["extraccion"]
    assert extraction["articulo"]["nombre"] == "ACEITE"
    assert extraction["unidad_dicha"] == "litros"
    assert extraction["requiere_seleccion"] is True


def test_speech_endpoint_streams_audio(monkeypatch):
    async def fake_open_speech_stream(_: str):
        async def stream():
            yield b"ID3-demo-mp3"
        return stream(), False

    monkeypatch.setattr(
        speech_router, "open_speech_stream", fake_open_speech_stream
    )
    with TestClient(app) as client:
        response = client.post("/speak", json={"texto": "Hola, soy Clara."})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["x-clara-voice"] == "elevenlabs"
    assert response.content == b"ID3-demo-mp3"


def test_report_alcance_includes_faltantes():
    with TestClient(app) as client:
        created = client.post(
            "/sessions",
            json={"usuario_id": 1, "bodega": WAREHOUSE, "modo": "toma"},
        )
        session_id = created.json()["sesion_id"]

        extracted = client.post(
            "/extract",
            json={"frase": "doce litros de aceite de ajonjoli", "bodega": WAREHOUSE},
        ).json()
        article_id = extracted["articulo"]["id"]
        client.post(
            f"/sessions/{session_id}/registros",
            json={"articulo_id": article_id, "cantidad_fisica": 12, "unidad": "Liter"},
        )

        solo_contados = client.post(
            "/report", json={"sesion_id": session_id, "formatos": ["csv"], "alcance": "contados"},
        )
        assert solo_contados.status_code == 200
        contados_csv = client.get(solo_contados.json()["archivos"]["csv"]).text
        assert "Sin contar" not in contados_csv
        contados_lines = len(contados_csv.strip().splitlines())

        faltantes = client.post(
            "/report", json={"sesion_id": session_id, "formatos": ["csv"], "alcance": "faltantes"},
        )
        assert faltantes.status_code == 200
        faltantes_csv = client.get(faltantes.json()["archivos"]["csv"]).text
        assert "Sin contar" in faltantes_csv
        assert "ACEITE DE AJONJOLI" not in faltantes_csv  # el contado no debe repetirse en faltantes
        faltantes_lines = len(faltantes_csv.strip().splitlines())
        assert faltantes_lines > contados_lines

        completo = client.post(
            "/report", json={"sesion_id": session_id, "formatos": ["csv"], "alcance": "completo"},
        )
        assert completo.status_code == 200
        completo_csv = client.get(completo.json()["archivos"]["csv"]).text
        completo_lines = len(completo_csv.strip().splitlines())
        assert completo_lines == contados_lines + faltantes_lines - 1  # el encabezado no se duplica
