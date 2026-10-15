import { describe, expect, test } from "bun:test";
import {
  getAppointmentConfirmationTemplate,
  getServiceCompletedTemplate,
  getWelcomeEmailTemplate,
} from "../src/services/email/templates.js";
import { escapeHtml, escapeMultiline, sanitizeHeader } from "../src/utils/html.js";

const EVIL = `<a href="https://evil.example">Pague aquí</a><script>alert(1)</script>`;

describe("SEC-2: escape de HTML en plantillas", () => {
  test("escapeHtml neutraliza los caracteres peligrosos", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
    expect(escapeHtml(null)).toBe("");
  });

  test("escapeMultiline conserva saltos de línea como <br> sin permitir HTML", () => {
    expect(escapeMultiline("a\n<b>b</b>")).toBe("a<br>&lt;b&gt;b&lt;/b&gt;");
  });

  test("sanitizeHeader elimina saltos de línea", () => {
    expect(sanitizeHeader("Hola\r\nBcc: x@y.z")).toBe("Hola Bcc: x@y.z");
  });

  test("bienvenida escapa el nombre", () => {
    const { html } = getWelcomeEmailTemplate(EVIL);
    expect(html).not.toContain("<a href=\"https://evil.example\">");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  test("confirmación de cita escapa todos los campos de texto", () => {
    const { html, subject } = getAppointmentConfirmationTemplate({
      name: EVIL,
      serviceName: EVIL + "\r\nBcc: x@y.z",
      scheduledDate: "2026-10-20",
      timeSlot: "10:30",
      vehiclePlate: EVIL,
      vehicleBrandModel: EVIL,
      status: EVIL,
      location: EVIL,
      notes: EVIL,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<a href=\"https://evil.example\">");
    expect(subject).not.toMatch(/[\r\n]/);
  });

  test("hoja de atención escapa observaciones, repuestos y recomendaciones", () => {
    const { html } = getServiceCompletedTemplate({
      name: EVIL,
      vehiclePlate: "ABCD12",
      vehicleInfo: EVIL,
      serviceName: EVIL,
      mechanicName: EVIL,
      observations: EVIL + "\nlinea 2",
      partsReplaced: EVIL,
      recommendations: EVIL,
      mileageAtService: 1000,
      completedAt: EVIL,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<a href=\"https://evil.example\">");
    expect(html).toContain("linea 2");
    expect(html).toContain("<br>");
  });
});
