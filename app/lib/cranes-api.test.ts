import { expect, test } from "bun:test";
import { unassignedCount, type Crane } from "./cranes-api";

const crane = (over: Partial<Crane>): Crane => ({ id: "1", name: "Grúa", plate: "ABCD12", type: "plataforma", notes: null, isActive: true, workerId: null, workerName: null, ...over });

test("unassignedCount cuenta solo grúas activas sin gruero", () => {
  expect(unassignedCount([crane({}), crane({ workerId: "w" }), crane({ isActive: false }), crane({})])).toBe(2);
  expect(unassignedCount([])).toBe(0);
});
