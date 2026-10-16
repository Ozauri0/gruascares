import { describe, expect, test } from "bun:test";
import { EDIT_MARK, decodeKey, encodeKey } from "../components/EditBridge";
import { ALL_FIELDS } from "./site-content";

describe("marcas del editor visual", () => {
  test("la clave se codifica con caracteres invisibles y se recupera", () => {
    for (const { key } of ALL_FIELDS) {
      const encoded = encodeKey(key);
      expect(encoded).not.toMatch(/[a-z0-9]/i); // nada visible
      expect(decodeKey(encoded.slice(1, -1))).toBe(key);
      expect(encoded.startsWith(EDIT_MARK) && encoded.endsWith(EDIT_MARK)).toBe(true);
    }
  });
});
