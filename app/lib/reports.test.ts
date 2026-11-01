import { describe, expect, test } from "bun:test";
import { reportUrl } from "./reports";

describe("reportes Excel (#131)", () => {
  test("sin fechas exporta todo; con fechas las envía", () => {
    expect(reportUrl("taller")).toBe("/api/admin/reports/taller");
    expect(reportUrl("grua", "2026-10-01", "2026-10-31")).toBe("/api/admin/reports/grua?startDate=2026-10-01&endDate=2026-10-31");
    expect(reportUrl("grua", undefined, "2026-10-31")).toBe("/api/admin/reports/grua?endDate=2026-10-31");
  });
});
