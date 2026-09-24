import { downloadZip } from "client-zip";
import { buildSourceArchiveEntries, type SourceFileLike } from "./source-archive";

export function formatGalleryZipName(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear() % 100).padStart(2, "0");
  return `gallery${month}${day}${year}.zip`;
}

export function buildAttachmentName(
  rawUrl: string,
  index: number,
  seenNames: Map<string, number>,
  contentType?: string | null
) {
  let name = `attachment-${index + 1}`;
  try {
    const url = new URL(rawUrl);
    name = url.pathname.split("/").pop() || name;
  } catch {
    // Fallback to default name.
  }

  const count = seenNames.get(name) ?? 0;
  if (count > 0) {
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex > 0) {
      name = name.slice(0, dotIndex) + `-${count + 1}` + name.slice(dotIndex);
    } else {
      name = `${name}-${count + 1}`;
    }
  }

  if (!name.includes(".")) {
    const extension =
      extensionFromContentType(contentType) ?? (isVideoUrl(rawUrl) ? "mp4" : "png");
    name = `${name}.${extension}`;
  }

  seenNames.set(name, count + 1);
  return name;
}

const contentTypeExtensions: Record<string, string> = {
  "text/html": "html",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/json": "json",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export function extensionFromContentType(contentType?: string | null) {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  return mime ? contentTypeExtensions[mime] ?? null : null;
}

export async function createGalleryZipBlob(options: {
  sourceFile: SourceFileLike | null;
  urls: string[];
  fetchAttachment?: typeof fetch;
}) {
  const fetchAttachment = options.fetchAttachment ?? fetch;
  const seenNames = new Map<string, number>();
  const zipResponse = downloadZip(
    (async function* () {
      if (options.sourceFile) {
        for (const entry of buildSourceArchiveEntries(options.sourceFile)) {
          yield entry;
        }
      }

      for (const [index, url] of options.urls.entries()) {
        const response = await fetchAttachment(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch attachment ${index + 1}`);
        }

        yield {
          name: buildAttachmentName(
            url,
            index,
            seenNames,
            response.headers.get("content-type")
          ),
          input: response,
        };
      }
    })()
  );

  return zipResponse.blob();
}

function isVideoUrl(rawUrl: string) {
  const extension = extensionFromUrl(rawUrl);
  if (extension && new Set(["mp4", "webm", "ogg", "mov", "m4v"]).has(extension)) {
    return true;
  }

  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/");
    return segments.includes("video");
  } catch {
    return false;
  }
}

function extensionFromUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.split("/").pop() ?? "";
    const extension = path.includes(".") ? path.split(".").pop() : "";
    return extension?.toLowerCase() || "";
  } catch {
    return "";
  }
}