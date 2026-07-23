from fastapi.testclient import TestClient

from app.db import connect
from app.main import app
from app.services.assistant import local_assistant_analysis
from app.services.matcher import match_catalog, normalize_text


WAREHOUSE = "STOCK RESTAURANTE FUENTES AYB"


def test_common_capture_phrases_never_jump_to_an_unrelated_product():
    cases = [
        ("agrega 6 litros de aceite", "ACEITE", "litros", True),
        ("puedes agregar 60 litros de aceite", "ACEITE", "litros", True),
        ("puedes agrega 10 kilogramos de azucar", "AZUCAR BLANCA", "kilos", True),
        ("agregue seis litros de aceite", "ACEITE", "litros", True),
        ("anota 5 lts de aceit", "ACEITE", "litros", True),
        ("pon cuatro litros de aseite", "ACEITE", "litros", True),
        ("registra 2 litros de aceite de ajonjoli", "ACEITE DE AJONJOLI", "litros", False),
        ("anota 3 litros de aceite de oliva", "ACEITE DE OLIVA", "litros", True),
        ("registra nueve cajas de harina", "HARINA DE SEMOLA", "cajas", True),
        ("pon 3 kilos de papa a la francesa", "PAPA A LA FRANCESA", "kilos", False),
        ("anota 45 porciones de guiso criollo", "GUISO CRIOLLO PISCILAGO (PA)", "porciones", False),
        ("registra 18 kilos de arroz", "ARROZ", "kilos", True),
        ("agrega 6 botellas de agua", "AGUA BOTELLA", "botellas", True),
        ("cuatro boteyas de agua", "AGUA BOTELLA", "botellas", True),
        ("registra 5 kilos de azucar", "AZUCAR BLANCA", "kilos", True),
    ]

    with TestClient(app) as client:
        for phrase, expected_product, expected_unit, selection in cases:
            response = client.post(
                "/assistant",
                json={"frase": phrase, "bodega": WAREHOUSE},
            )
            assert response.status_code == 200, phrase
            body = response.json()
            extraction = body["extraccion"]
            assert body["intencion"] == "registrar", phrase
            assert body["accion_ui"] == "mostrar_tarjeta", phrase
            assert extraction["articulo"]["nombre"] == expected_product, phrase
            assert extraction["unidad_dicha"] == expected_unit, phrase
            assert extraction["requiere_seleccion"] is selection, phrase


def test_unknown_products_are_rejected_instead_of_forced_to_a_catalog_item():
    phrases = [
        "agrega 6 litros de producto inexistente",
        "registra 4 kilos de xyzabc",
        "anota 3 botellas de elemento inventado",
    ]
    with TestClient(app) as client:
        for phrase in phrases:
            response = client.post(
                "/assistant",
                json={"frase": phrase, "bodega": WAREHOUSE},
            )
            assert response.status_code == 200, phrase
            extraction = response.json()["extraccion"]
            assert extraction["articulo"] is None, phrase
            assert extraction["alternativas"] == [], phrase


def test_every_exact_warehouse_catalog_name_resolves_to_itself():
    connection = connect()
    rows = connection.execute(
        "SELECT * FROM articulos WHERE bodega = ?",
        (WAREHOUSE,),
    ).fetchall()
    assert len(rows) > 300

    for row in rows:
        match = match_catalog(connection, row["articulo"], WAREHOUSE)
        assert match.article is not None, row["articulo"]
        assert normalize_text(match.article["articulo"]) == normalize_text(
            row["articulo"]
        ), row["articulo"]


def test_136_natural_command_variations_keep_the_intended_product_and_unit():
    commands = [
        "agrega", "agregue", "anota", "anote", "apunta", "apunte",
        "ingresa", "ingrese", "registra", "registre", "pon", "ponga",
        "quiero agregar", "puedes agregar", "puedes agrega",
        "podrias registrar", "me ayudas a agregar",
    ]
    products = [
        ("litros", "aceite", "ACEITE"),
        ("litros", "aceite de ajonjoli", "ACEITE DE AJONJOLI"),
        ("kilos", "papa a la francesa", "PAPA A LA FRANCESA"),
        ("litros", "leche deslactosada", "LECHE DESLACTOSADA"),
        ("kilos", "azucar", "AZUCAR BLANCA"),
        ("cajas", "harina", "HARINA DE SEMOLA"),
        ("porciones", "guiso criollo", "GUISO CRIOLLO PISCILAGO (PA)"),
        ("botellas", "agua", "AGUA BOTELLA"),
    ]
    connection = connect()

    simulated = 0
    for command in commands:
        for unit, product, expected in products:
            phrase = f"{command} 7 {unit} de {product}"
            analysis = local_assistant_analysis(phrase)
            match = match_catalog(connection, analysis.producto_texto, WAREHOUSE)
            assert analysis.intencion == "registrar", phrase
            assert analysis.cantidad == 7, phrase
            assert analysis.unidad == unit, phrase
            assert match.article is not None, phrase
            assert match.article["articulo"] == expected, phrase
            simulated += 1

    assert simulated == 136
