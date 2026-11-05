import { describe, expect, test } from "bun:test";
import { contactMessage, cuentaWhatsappUrl } from "./whatsapp";

describe("whatsapp", () => {
  test("arma el enlace wa.me con el texto codificado", () => {
    const url = cuentaWhatsappUrl("Hola & chao");
    expect(url).toBe("https://wa.me/56991627809?text=Hola%20%26%20chao");
  });
  test("incluye los datos del formulario y omite el detalle vacío", () => {
    const msg = contactMessage({ name: " Ana ", phone: "+56 9 1111 2222", service: "Camiones grúa", details: " " });
    expect(msg).toContain("Nombre: Ana");
    expect(msg).toContain("Servicio: Camiones grúa");
    expect(msg).not.toContain("Detalle");
  });
});
