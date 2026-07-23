from __future__ import annotations

import csv
import html
import sqlite3
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill


def report_data(connection: sqlite3.Connection, session_id: str) -> tuple[sqlite3.Row, list[sqlite3.Row]]:
    session = connection.execute(
        """
        SELECT s.*, u.nombre, u.cargo FROM sesiones s
        JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.id = ?
        """,
        (session_id,),
    ).fetchone()
    if not session:
        raise ValueError("Sesión no encontrada")
    records = connection.execute(
        """
        SELECT r.*, a.sku, a.articulo, a.stock_sistema, a.bodega
        FROM registros r JOIN articulos a ON a.id = r.articulo_id
        WHERE r.sesion_id = ? ORDER BY a.articulo
        """,
        (session_id,),
    ).fetchall()
    return session, records


def generate_csv(path: Path, records: list[sqlite3.Row]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.writer(output, delimiter=";")
        writer.writerow(["CANTIDAD", "Nr.Artículo", "Artículo", "Unidad", "SD"])
        for row in records:
            writer.writerow([
                row["cantidad_fisica"], row["sku"] or "", row["articulo"],
                row["unidad"], row["cantidad_fisica"],
            ])


def generate_xlsx(path: Path, session: sqlite3.Row, records: list[sqlite3.Row]) -> None:
    workbook = Workbook()
    detail = workbook.active
    detail.title = "Detalle"
    headers = [
        "Nr.Artículo", "Artículo", "Bodega", "Cantidad física", "Unidad",
        "Stock sistema", "Diferencia", "Estado", "Corregido",
    ]
    detail.append(headers)
    for row in records:
        detail.append([
            row["sku"] or "", row["articulo"], row["bodega"],
            row["cantidad_fisica"], row["unidad"], row["stock_sistema"],
            row["cantidad_fisica"] - row["stock_sistema"],
            row["estado_producto"] or "", "Sí" if row["corregido"] else "No",
        ])

    differences = workbook.create_sheet("Diferencias")
    differences.append(["Artículo", "Físico", "Sistema", "Delta"])
    for row in records:
        delta = row["cantidad_fisica"] - row["stock_sistema"]
        differences.append([row["articulo"], row["cantidad_fisica"], row["stock_sistema"], delta])

    for sheet in (detail, differences):
        for cell in sheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="0069AA")
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        for column in sheet.columns:
            width = min(45, max(len(str(cell.value or "")) for cell in column) + 2)
            sheet.column_dimensions[column[0].column_letter].width = width

    detail["K1"] = "Sesión"
    detail["K2"] = session["id"]
    detail["K3"] = session["nombre"]
    detail["K4"] = session["hash_firma"] or "Sin firma"
    workbook.save(path)


def generate_pdf(path: Path, session: sqlite3.Row, records: list[sqlite3.Row]) -> None:
    rows = []
    for row in records:
        delta = row["cantidad_fisica"] - row["stock_sistema"]
        delta_class = "positive" if delta > 0 else "negative" if delta < 0 else ""
        rows.append(
            "<tr>"
            f"<td>{html.escape(row['sku'] or '—')}</td>"
            f"<td>{html.escape(row['articulo'])}</td>"
            f"<td>{row['cantidad_fisica']:g}</td>"
            f"<td>{html.escape(row['unidad'])}</td>"
            f"<td>{row['stock_sistema']:g}</td>"
            f"<td class='{delta_class}'>{delta:+g}</td>"
            "</tr>"
        )
    document = f"""
    <!doctype html>
    <html lang="es">
    <meta charset="utf-8">
    <style>
      @page {{ size: A4 landscape; margin: 18mm; }}
      body {{ font: 12px Arial, sans-serif; color: #15324b; }}
      header {{ display:flex; justify-content:space-between; border-bottom:4px solid #ffcb05;
                padding-bottom:12px; margin-bottom:22px; }}
      h1 {{ color:#0069aa; margin:0 0 4px; font-size:24px; }}
      .brand {{ color:#0069aa; font-size:26px; font-weight:800; }}
      .meta {{ background:#eef7fc; padding:12px 16px; border-radius:10px; margin-bottom:18px; }}
      table {{ width:100%; border-collapse:collapse; }}
      th {{ background:#0069aa; color:white; text-align:left; padding:8px; }}
      td {{ padding:7px 8px; border-bottom:1px solid #d6e1e8; }}
      .positive {{ color:#218739; }} .negative {{ color:#c72d37; }}
      .signature {{ margin-top:24px; border-top:1px solid #9eb4c3; padding-top:12px; }}
      .hash {{ font-family:monospace; font-size:9px; word-break:break-all; color:#5d7180; }}
    </style>
    <body>
      <header><div><h1>Acta de toma física de inventario</h1>
      <span>Cuentas claras, cocina tranquila.</span></div><div class="brand">◆ CLARA</div></header>
      <section class="meta">
        <strong>{html.escape(session['bodega'])}</strong><br>
        Responsable: {html.escape(session['nombre'])} · {html.escape(session['cargo'])}<br>
        Inicio: {html.escape(session['inicio'])} · Cierre: {html.escape(session['fin'] or 'En curso')}
      </section>
      <table><thead><tr><th>SKU</th><th>Artículo</th><th>Físico</th><th>Unidad</th>
      <th>Sistema</th><th>Delta</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
      <section class="signature"><strong>Firma digital de la sesión</strong>
      <p class="hash">{html.escape(session['hash_firma'] or 'Sesión aún no firmada')}</p></section>
    </body></html>
    """
    try:
        from weasyprint import HTML
        HTML(string=document).write_pdf(path)
    except (ImportError, OSError):
        # macOS suele no incluir Pango/GLib. ReportLab mantiene el endpoint
        # operativo; en producción WeasyPrint conserva la plantilla completa.
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        styles = getSampleStyleSheet()
        story = [
            Paragraph("CLARA · Acta de toma física de inventario", styles["Title"]),
            Paragraph(html.escape(session["bodega"]), styles["Heading2"]),
            Paragraph(
                f"Responsable: {html.escape(session['nombre'])} · "
                f"{html.escape(session['cargo'])}",
                styles["BodyText"],
            ),
            Spacer(1, 5 * mm),
        ]
        data = [["SKU", "Artículo", "Físico", "Unidad", "Sistema", "Delta"]]
        for row in records:
            delta = row["cantidad_fisica"] - row["stock_sistema"]
            data.append([
                row["sku"] or "—", row["articulo"], f"{row['cantidad_fisica']:g}",
                row["unidad"], f"{row['stock_sistema']:g}", f"{delta:+g}",
            ])
        table = Table(data, repeatRows=1, colWidths=[24 * mm, 78 * mm, 20 * mm, 25 * mm, 22 * mm, 20 * mm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0069AA")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D6E1E8")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F8FB")]),
        ]))
        story.extend([
            table,
            Spacer(1, 7 * mm),
            Paragraph(
                f"Firma digital: {html.escape(session['hash_firma'] or 'Sesión aún no firmada')}",
                styles["Code"],
            ),
        ])
        SimpleDocTemplate(
            str(path), pagesize=landscape(A4), rightMargin=12 * mm,
            leftMargin=12 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
        ).build(story)


def generate_reports(
    connection: sqlite3.Connection,
    session_id: str,
    formats: list[str],
    output_root: Path,
) -> dict[str, Path]:
    session, records = report_data(connection, session_id)
    output_dir = output_root / session_id
    output_dir.mkdir(parents=True, exist_ok=True)
    generated: dict[str, Path] = {}
    for file_format in dict.fromkeys(formats):
        path = output_dir / f"CLARA_{session_id[:8]}.{file_format}"
        if file_format == "pdf":
            generate_pdf(path, session, records)
        elif file_format == "xlsx":
            generate_xlsx(path, session, records)
        elif file_format == "csv":
            generate_csv(path, records)
        generated[file_format] = path
    return generated
