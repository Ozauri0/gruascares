import { strToU8, zipSync } from "fflate";

/**
 * Generador mínimo de libros Excel (.xlsx) sin dependencias de terceros: varias hojas, encabezado con estilo, anchos de
 * columna, primera fila fija y filtros. Los textos van como cadenas (nunca como fórmulas), así un valor que empiece con
 * «=» o «+» no se ejecuta al abrir el archivo.
 */
export type XlsxCell = string | number | null | undefined;

export interface XlsxColumn {
  header: string;
  /** Ancho aproximado en caracteres. */
  width?: number;
  /** `decimal` muestra un decimal (0,0); `wrap` parte el texto largo en varias líneas. */
  format?: "decimal" | "wrap";
}

export interface XlsxSheet {
  /** Máximo 31 caracteres, sin `[ ] : * ? / \`. */
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAX_CELL_CHARS = 32767; // límite de Excel por celda

/** Escapa para XML 1.0 y quita los caracteres de control que Excel rechaza. */
function esc(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Letra de columna: 0 → A, 25 → Z, 26 → AA. */
export function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export function sheetName(raw: string): string {
  return raw.replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Hoja";
}

// Estilos (índices de cellXfs): 0 normal · 1 encabezado · 2 un decimal · 3 texto con saltos de línea
const STYLE = { header: 1, decimal: 2, wrap: 3 } as const;

const STYLES_XML =
  XML_HEADER +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF029834"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  "</styleSheet>";

function cellXml(ref: string, value: XlsxCell, style: number): string {
  if (value === null || value === undefined || value === "") return "";
  const s = style ? ` s="${style}"` : "";
  if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : "";
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value.slice(0, MAX_CELL_CHARS))}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const cols = sheet.columns;
  const lastCol = columnName(Math.max(cols.length, 1) - 1);
  const lastRow = sheet.rows.length + 1;
  const colsXml = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`).join("");
  const head = `<row r="1" ht="30" customHeight="1">${cols.map((c, i) => cellXml(`${columnName(i)}1`, c.header, STYLE.header)).join("")}</row>`;
  const body = sheet.rows
    .map((row, r) => {
      const cells = cols
        .map((c, i) => cellXml(`${columnName(i)}${r + 2}`, row[i], c.format === "decimal" ? STYLE.decimal : c.format === "wrap" ? STYLE.wrap : 0))
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");
  return (
    XML_HEADER +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${colsXml}</cols><sheetData>${head}${body}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${lastRow}"/>` +
    "</worksheet>"
  );
}

/** Genera el archivo .xlsx con las hojas indicadas. */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error("Un libro Excel necesita al menos una hoja");
  const names = sheets.map((s) => sheetName(s.name));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      XML_HEADER +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        "</Types>"
    ),
    "_rels/.rels": strToU8(
      XML_HEADER +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ),
    "xl/workbook.xml": strToU8(
      XML_HEADER +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
        "</sheets></workbook>"
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      XML_HEADER +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>"
    ),
    "xl/styles.xml": strToU8(STYLES_XML),
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
