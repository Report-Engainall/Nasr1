import { describe, expect, it } from "vitest";
import { StreamingCsvParser } from "@/lib/unified-import";

describe("StreamingCsvParser CRLF chunk boundaries", () => {
  it("holds a trailing CR until the next chunk resolves whether it is CRLF", async () => {
    const parser = new StreamingCsvParser();
    const rows: string[][] = [];
    const onRow = (row: string[]) => { rows.push(row); };

    await parser.push("item_code,name\r", onRow);
    expect(rows).toEqual([]);

    await parser.push("\n001,First\r", onRow);
    expect(rows).toEqual([["item_code", "name"]]);

    await parser.push("\n002,Second", onRow, true);
    expect(rows).toEqual([
      ["item_code", "name"],
      ["001", "First"],
      ["002", "Second"],
    ]);
  });

  it("preserves CRLF inside a quoted cell when the pair is split across chunks", async () => {
    const parser = new StreamingCsvParser();
    const rows: string[][] = [];
    const onRow = (row: string[]) => { rows.push(row); };

    await parser.push('"line one\r', onRow);
    await parser.push('\nline two",memo\r', onRow);
    expect(rows).toEqual([]);

    await parser.push("\n", onRow, true);
    expect(rows).toEqual([["line one\r\nline two", "memo"]]);
  });

  it("still accepts a lone CR as a row delimiter when the next chunk starts with data", async () => {
    const parser = new StreamingCsvParser();
    const rows: string[][] = [];
    const onRow = (row: string[]) => { rows.push(row); };

    await parser.push("a,b\r", onRow);
    await parser.push("1,2", onRow, true);

    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
});
