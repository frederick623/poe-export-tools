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

  test("extracts file sections from Poe next-data when no file tree is present", () => {
    const entries = buildSourceArchiveEntries({
      name: "next-data.json",
      type: "application/json",
      raw: JSON.stringify({
        props: {
          pageProps: {
            data: {
              mainQuery: {
                chatShare: {
                  messagesConnection: {
                    edges: [
                      { node: { author: "human", text: "Write a script" } },
                      {
                        node: {
                          author: "bot",
                          text: [
                            "## `requirements.txt`",
                            "",
                            "```txt",
                            "requests",
                            "```",
                            "",
                            "## `.env.example`",
                            "```bash",
                            "# comment",
                            "KEY=value",
                            "```",
                            "",
                            "## `build_reels.py`",
                            "```python",
                            "print('hi')",
                            "```",
                            "",
                            "## Example reel object",
                            "```json",
                            "{}",
                            "```",
                          ].join("\n"),
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
    });

    expect(entries.map((entry) => entry.name)).toEqual([
      "next-data.json",
      "requirements.txt",
      ".env.example",
      "build_reels.py",
    ]);
  });

  test("resolves nested section paths when headings omit the tree root folder", () => {
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
          "### `Source/TetrisUE/TetrisUE.cpp`",
          "```cpp",
          "name = \"source\";",
          "```",
        ].join("\n"),
      }),
    });

    expect(entries.map((entry) => entry.name)).toEqual([
      "bundle.json",
      "TetrisUE/TetrisUE.uproject",
      "TetrisUE/Source/TetrisUE/TetrisUE.cpp",
    ]);
  });

  test("parses project-layout markdown with code-block sections and backtick headings", () => {
    const entries = buildSourceArchiveEntries({
      name: "bundle.json",
      type: "application/json",
      raw: JSON.stringify({
        content: [
          "## Project layout",
          "",
          "```",
          "stock-explorer/",
          "├── requirements.txt",
          "├── stock_data.py     # data layer",
          "└── app.py            # Streamlit UI",
          "```",
          "",
          "### `requirements.txt`",
          "```text",
          "yfinance",
          "```",
          "",
          "## `stock_data.py` — data layer",
          "```python",
          "import pandas",
          "```",
          "",
          "## `app.py` — Streamlit UI",
          "```python",
          "import streamlit",
          "```",
        ].join("\n"),
      }),
    });

    expect(entries.map((entry) => entry.name)).toEqual([
      "bundle.json",
      "stock-explorer/requirements.txt",
      "stock-explorer/stock_data.py",
      "stock-explorer/app.py",
    ]);
  });
});
