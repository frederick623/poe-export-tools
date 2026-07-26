import { describe, expect, test } from "bun:test";
import { buildSourceArchiveEntries } from "./source-archive";

describe("buildSourceArchiveEntries", () => {
  test("includes the original JSON at the top level", () => {
    const entries = buildSourceArchiveEntries({
      name: "bundle.json",
      type: "application/json",
      raw: JSON.stringify({
        content: [
          "File tree",
          "",
          "```text",
          "TetrisUE/",
          "├── TetrisUE.uproject",
          "└── Source/",
          "    └── TetrisUE/",
          "        └── TetrisUE.cpp",
          "```",
          "",
          "### `TetrisUE.uproject`",
          "```json",
          "{ \"name\": \"uproject\" }",
          "```",
          "",
          "### `TetrisUE.cpp`",
          "```cpp",
          "name = \"source\";",
          "```",
          "",
          "### `README.md`",
          "```md",
          "not in tree",
          "```",
        ].join("\n"),
      }),
    });

    expect(entries[0]?.name).toBe("bundle.json");
    expect(entries.map((entry) => entry.name)).toEqual([
      "bundle.json",
      "TetrisUE/TetrisUE.uproject",
      "TetrisUE/Source/TetrisUE/TetrisUE.cpp",
    ]);
  });

  test("falls back to the raw JSON when no file tree is present", () => {
    const entries = buildSourceArchiveEntries({
      name: "next-data.json",
      type: "application/json",
      raw: JSON.stringify({ props: { pageProps: { data: { mainQuery: {} } } } }),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("next-data.json");
  });
});
