import { describe, expect, it } from "vitest";
import { replaceAsciiControlCharacters } from "./replace-ascii-control-characters";

describe("replaceAsciiControlCharacters", () => {
  it("replaces C0 and DEL controls while preserving ordinary Unicode text", () => {
    expect(replaceAsciiControlCharacters("A\u0000B\u001fC\u007fD", "_")).toBe("A_B_C_D");
    expect(replaceAsciiControlCharacters("متجر الأغبري 📦", " ")).toBe("متجر الأغبري 📦");
  });
});
