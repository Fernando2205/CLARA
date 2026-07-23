from app.services.gpt import local_extract
from app.services.assistant import local_assistant_analysis


def test_local_parser_acceptance_examples():
    cases = [
        ("quedan nueve cajas de harina pan", "harina pan", 9, "cajas"),
        ("treinta y cinco huevos", "huevos", 35, "unidades"),
        ("media arroba de cebolla", "cebolla", 6.25, "kilos"),
        ("diez gramos de aceite", "aceite", 10, "gramos"),
        ("contamos ochenta porciones de guiso criollo en buen estado", "guiso criollo", 80, "porciones"),
        ("harina cinco", "harina", 5, None),
        ("dos litros y medio de leche", "leche", 2.5, "litros"),
        ("no hay azúcar", "azucar", 0, None),
    ]
    for phrase, product, quantity, unit in cases:
        result = local_extract(phrase)
        assert result.producto_texto == product
        assert result.cantidad == quantity
        assert result.unidad == unit

    correction = local_extract("perdón, son nueve")
    assert correction.producto_texto is None
    assert correction.cantidad == 9
    assert correction.es_correccion is True

    out_of_domain = local_extract("hola cómo estás")
    assert out_of_domain.producto_texto is None


def test_local_conversational_intents():
    stock_query = local_assistant_analysis("¿Tenemos leche?")
    assert stock_query.intencion == "consultar_existencia"
    assert stock_query.producto_texto == "leche"

    show_all = local_assistant_analysis("Muéstrame todo el inventario")
    assert show_all.intencion == "listar_inventario"

    explain = local_assistant_analysis("¿Por qué dudas de esa cantidad?")
    assert explain.intencion == "explicar_alerta"

    capture = local_assistant_analysis("quedan nueve cajas de harina")
    assert capture.intencion == "registrar"
    assert capture.cantidad == 9
