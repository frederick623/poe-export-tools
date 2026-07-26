export type SourceFileLike = {
  name: string;
  raw: string;
  type: string;
};

export type ArchiveEntry = {
  name: string;
  input: Blob;
};

type ParsedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

type CollectedFile = {
  path: string;
  content: string;
};

const descriptorPathKeys = ["path", "filePath", "relativePath"] as const;
const descriptorNameKeys = ["name", "filename", "fileName", "title"] as const;
const descriptorContentKeys = ["content", "text", "source", "body", "value"] as const;
const descriptorChildrenKeys = ["children", "files", "entries", "items"] as const;

export function buildSourceArchiveEntries(sourceFile: SourceFileLike): ArchiveEntry[] {
  const rawEntry = {
    name: sourceFile.name,
    input: new Blob([sourceFile.raw], { type: sourceFile.type }),
  };

  if (sourceFile.type !== "application/json") {
    return [rawEntry];
  }

  const parsed = parseJson(sourceFile.raw);
  if (!parsed.ok) {
    return [rawEntry];
  }

  const collected = collectSourceFiles(parsed.value);
  if (collected.length === 0) {
    return [rawEntry];
  }

  return [
    rawEntry,
    ...collected.map((file) => ({
      name: file.path,
      input: new Blob([file.content], { type: contentTypeForPath(file.path) }),
    })),
  ];
}

function parseJson(raw: string): ParsedJsonResult {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    };
  }
}

function collectSourceFiles(value: unknown, basePath = ""): CollectedFile[] {
  if (Array.isArray(value)) {
    const files: CollectedFile[] = [];
    for (const item of value) {
      files.push(...collectSourceFiles(item, basePath));
    }
    return files;
  }

  if (!isRecord(value)) {
    return [];
  }

  const explicitPath = firstString(value, descriptorPathKeys);
  const explicitName = firstString(value, descriptorNameKeys);
  const content = firstStringOrPrimitive(value, descriptorContentKeys);
  const children = firstArray(value, descriptorChildrenKeys);
  const nodeType = firstString(value, ["type", "kind", "nodeType"]);

  if (explicitPath && content !== null) {
    return [
      {
        path: normalizeZipPath(basePath, explicitPath),
        content,
      },
    ];
  }

  if (explicitName && content !== null && !children) {
    return [
      {
        path: normalizeZipPath(basePath, explicitName),
        content,
      },
    ];
  }

  if (children) {
    const folderName =
      nodeType === "folder" || !content ? explicitName ?? explicitPath : null;
    const nextBasePath = folderName ? normalizeZipPath(basePath, folderName) : basePath;
    const files: CollectedFile[] = [];
    for (const child of children) {
      files.push(...collectSourceFiles(child, nextBasePath));
    }
    return files;
  }

  for (const candidate of collectStrings(value)) {
    const markdownBundle = parseMarkdownSourceBundle(candidate);
    if (markdownBundle.length > 0) {
      return markdownBundle;
    }
  }

  return [];
}

function collectStrings(value: unknown, seen = new Set<unknown>()): string[] {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    const strings: string[] = [];
    for (const item of value) {
      strings.push(...collectStrings(item, seen));
    }
    return strings;
  }

  const strings: string[] = [];
  for (const child of Object.values(value)) {
    if (typeof child === "string") {
      strings.push(child);
    } else if (child && typeof child === "object") {
      strings.push(...collectStrings(child, seen));
    }
  }
  return strings;
}

function parseMarkdownSourceBundle(markdown: string): CollectedFile[] {
  if (!/File tree/i.test(markdown) || !/```/.test(markdown)) return [];

  const treePaths = parseMarkdownTreePaths(markdown);
  const sections = parseMarkdownFileSections(markdown);
  if (sections.length === 0) return [];

  const pathIndex = buildPathIndex(treePaths);
  const files: CollectedFile[] = [];

  for (const section of sections) {
    const resolvedPath = resolveMarkdownSectionPath(section.path, treePaths, pathIndex);
    if (!resolvedPath) continue;
    files.push({
      path: resolvedPath,
      content: section.content,
    });
  }

  return files;
}

function parseMarkdownTreePaths(markdown: string) {
  const block = markdown.match(/```[\s\S]*?\n([\s\S]*?)```/);
  if (!block?.[1] || !/File tree/i.test(markdown.slice(0, block.index ?? 0))) return [];

  const paths: string[] = [];
  const stack: string[] = [];
  let rootFolder = "";
  for (const rawLine of block[1].replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    const rootMatch = line.match(/^([A-Za-z0-9._-]+)\/$/);
    if (rootMatch?.[1]) {
      rootFolder = rootMatch[1];
      stack.length = 0;
      continue;
    }

    const match = line.match(/^((?:[│ ]{4})*)(?:├── |└── )(.*)$/);
    if (!match?.[2]) continue;

    const depth = Math.floor((match[1]?.length ?? 0) / 4);
    const name = match[2].trim();
    if (!name) continue;

    stack.length = depth;
    if (name.endsWith("/")) {
      stack[depth] = name.slice(0, -1);
      continue;
    }

    paths.push(normalizeZipPath(rootFolder, ...stack.slice(0, depth), name));
  }

  return paths;
}

function parseMarkdownFileSections(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sections: Array<{ path: string; content: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i]?.match(/^#{2,6}\s+`?([^`]+?)`?\s*$/);
    if (!heading?.[1]) continue;

    let fenceStart = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^```/.test(lines[j] ?? "")) {
        fenceStart = j;
        break;
      }
      if (/^#{2,6}\s+/.test(lines[j] ?? "")) break;
    }

    if (fenceStart < 0) continue;

    let fenceEnd = -1;
    for (let j = fenceStart + 1; j < lines.length; j++) {
      if (/^```\s*$/.test(lines[j] ?? "")) {
        fenceEnd = j;
        break;
      }
    }

    if (fenceEnd < 0) continue;

    sections.push({
      path: heading[1].trim(),
      content: lines.slice(fenceStart + 1, fenceEnd).join("\n"),
    });
    i = fenceEnd;
  }

  return sections;
}

function buildPathIndex(paths: string[]) {
  const index = new Map<string, string[]>();
  for (const path of paths) {
    const name = path.split("/").pop();
    if (!name) continue;
    const bucket = index.get(name) ?? [];
    bucket.push(path);
    index.set(name, bucket);
  }
  return index;
}

function resolveMarkdownSectionPath(
  sectionPath: string,
  treePaths: string[],
  pathIndex: Map<string, string[]>
) {
  const cleanPath = normalizeZipPath(sectionPath);
  if (!cleanPath) return null;

  if (cleanPath.includes("/")) {
    return treePaths.includes(cleanPath) ? cleanPath : null;
  }

  const matches = pathIndex.get(cleanPath);
  if (matches?.length === 1) return matches[0] ?? null;
  if (matches && matches.length > 1) {
    const exact = matches.find((path) => path.split("/").pop() === cleanPath);
    if (exact) return exact;
  }

  return null;
}

function firstString(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function firstStringOrPrimitive(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (value === null) {
      return null; // Treat null content as missing
    }
  }

  return null;
}

function firstArray(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeZipPath(...segments: Array<string | null | undefined>) {
  const parts: string[] = [];

  for (const segment of segments) {
    if (!segment) continue;
    for (const part of segment.replaceAll("\\", "/").split("/")) {
      const trimmed = part.trim();
      if (!trimmed || trimmed === "." || trimmed === "..") continue;
      parts.push(trimmed);
    }
  }

  return parts.join("/");
}

function contentTypeForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "json":
      return "application/json";
    case "md":
      return "text/markdown";
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "css":
    case "html":
    case "txt":
    case "yaml":
    case "yml":
    case "toml":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}