const allowedHost = "poe.com";
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

type PoeAttachment = {
  url?: string;
  file?: {
    url?: string;
  };
};

type PoeMessage = {
  attachments?: PoeAttachment[];
};

type PoeMessageEdge = {
  node?: PoeMessage;
};

type PoeNextData = {
  props?: {
    pageProps?: {
      data?: {
        mainQuery?: {
          chatShare?: {
            messages?: PoeMessage[];
            messagesConnection?: {
              edges?: PoeMessageEdge[];
            };
          };
        };
      };
    };
  };
};

export function normalizeShareUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.hostname !== allowedHost) return null;
    if (url.search || url.hash) return null;
    const match = url.pathname.match(/^\/s\/[^/]+$/);
    if (!match) return null;
    return `https://${allowedHost}${url.pathname}`;
  } catch {
    return null;
  }
}

export async function fetchShareUrls(shareUrl: string) {
  const response = await fetch(shareUrl, {
    headers: {
      "User-Agent": userAgent,
      Connection: "close",
    },
  });

  if (!response.ok) {
    const error = response.status === 404 ? "Share not found" : "Upstream error";
    return {
      error: { error, status: response.status },
      urls: [],
      nextDataRaw: null,
    };
  }

  if (!response.body) {
    return {
      error: { error: "Missing response body", status: 502 },
      urls: [],
      nextDataRaw: null,
    };
  }

  const { urls, sawNextData, nextDataRaw, parseError } = await extractAttachmentUrls(
    response.body
  );
  if (!sawNextData) {
    return {
      error: { error: "Missing __NEXT_DATA__ payload", status: 502 },
      urls: [],
      nextDataRaw: null,
    };
  }

  if (parseError) {
    console.warn("Failed to parse __NEXT_DATA__ payload", parseError);
    return {
      error: { error: "Invalid __NEXT_DATA__ payload", status: 502 },
      urls: [],
      nextDataRaw: null,
    };
  }

  return { urls, nextDataRaw, error: null };
}

async function extractAttachmentUrls(
  stream: ReadableStream<Uint8Array>
): Promise<{
  urls: string[];
  sawNextData: boolean;
  nextDataRaw: string | null;
  parseError: string | null;
}> {
  let nextDataPayload = "";
  let sawNextData = false;

  const rewriter = new HTMLRewriter().on('script[id="__NEXT_DATA__"]', {
    text(text) {
      sawNextData = true;
      nextDataPayload += text.text;
    },
  });

  const rewritten = rewriter.transform(new Response(stream));
  if (rewritten.body) {
    await rewritten.body.pipeTo(new WritableStream<Uint8Array>({ write() {} }));
  }

  if (!sawNextData) {
    return { urls: [], sawNextData: false, nextDataRaw: null, parseError: null };
  }

  try {
    const nextData = JSON.parse(nextDataPayload) as PoeNextData;
    return {
      urls: collectAttachmentUrls(nextData),
      sawNextData: true,
      nextDataRaw: nextDataPayload,
      parseError: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    return {
      urls: [],
      sawNextData: true,
      nextDataRaw: nextDataPayload,
      parseError: message,
    };
  } finally {
    nextDataPayload = "";
  }
}

function collectAttachmentUrls(nextData: PoeNextData): string[] {
  const chatShare = nextData?.props?.pageProps?.data?.mainQuery?.chatShare;
  const edges = chatShare?.messagesConnection?.edges;
  const urls = new Set<string>();

  if (Array.isArray(edges)) {
    for (const edge of edges) {
      collectMessageAttachmentUrls(edge?.node, urls);
    }
  }

  if (Array.isArray(chatShare?.messages)) {
    for (const message of chatShare.messages) {
      collectMessageAttachmentUrls(message, urls);
    }
  }

  return [...urls];
}

function collectMessageAttachmentUrls(message: PoeMessage | undefined, urls: Set<string>) {
  const attachments = message?.attachments;
  if (!Array.isArray(attachments)) return;

  for (const attachment of attachments) {
    const url = attachment?.file?.url ?? attachment?.url;
    if (typeof url === "string" && url.length > 0) {
      urls.add(url);
    }
  }
}