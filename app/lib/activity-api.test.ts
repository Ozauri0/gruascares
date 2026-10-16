import { describe, expect, test } from "bun:test";
import { formatDetails } from "./activity-api";

describe("formatDetails", () => {
  test("resume un JSON en una línea legible", () => {
    expect(formatDetails('{"from":"solicitada","to":"confirmada","mechanicId":null}')).toBe("de: solicitada · a: confirmada");
    expect(formatDetails('{"roles":["mecanico","vendedor"]}')).toBe("roles: mecanico, vendedor");
  });
  test("tolera texto plano y vacío", () => {
    expect(formatDetails(null)).toBe("");
    expect(formatDetails("sin formato")).toBe("sin formato");
  });
});
