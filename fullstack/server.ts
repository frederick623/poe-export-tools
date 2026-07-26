import { serve, embeddedFiles } from "bun";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import index from "./index.html";
import { createGalleryZipBlob } from "./gallery-archive";
import { fetchShareUrls, normalizeShareUrl } from "./share-fetch";

// Files referenced only in meta tags, manifest.json, or `rel="shortcut icon"`
// — Bun's HTML bundler can't trace these, so import explicitly to embed them.
import "./static/og.png" with { type: "file" };
import "./static/og_image.svg" with { type: "file" };
import "./static/favicon.ico" with { type: "file" };
import "./static/webappmanifestbig.png" with { type: "file" };
import "./static/webappmanifestsmall.png" with { type: "file" };

const envPort = Bun.env.PORT;
const parsedPort = envPort ? Number.parseInt(envPort, 10) : NaN;
const port = Number.isInteger(parsedPort) && parsedPort >= 0 ? parsedPort : 3000;

// Expose every embedded asset under /static/<name> for stable external refs
// (og:image, twitter:image, og:logo, sitemaps). Bun's HTML bundler serves the
// in-page hashed references automatically via routes: { "/": index }.
const staticRoutes: Record<string, Response> = {};
for (const blob of embeddedFiles) {
  const rawName = (blob as Blob & { name: string }).name.replace(/\\/g, "/").split("/").pop();
  if (!rawName) continue;
  // Skip bundler output that isn't a user-facing static asset.
  if (rawName.endsWith(".html")) continue;
  if (rawName.startsWith("chunk-")) continue;
  // Normalize hashed names (faviconpng-jd5gacpj.png) to their stable form.
  // Bun uses an alphanumeric hash (a-z, 0-9), not hex.
  const name = rawName.replace(/-[a-z0-9]{8}\./, ".");
  staticRoutes[`/static/${name}`] = new Response(blob);
}

const indexHtmlPath = join(import.meta.dir, "index.html");
const siteLastMod = statSync(existsSync(indexHtmlPath) ? indexHtmlPath : process.execPath)
  .mtime.toISOString()
  .slice(0, 10);

const routes: Record<string, unknown> = {
  ...staticRoutes,
  "/": index,
  "/robots.txt": new Response(
    "User-agent: *\nAllow: /\nSitemap: https://export.tools/sitemap.xml\n",
    { headers: { "Content-Type": "text/plain" } }
  ),
  "/sitemap.xml": new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://export.tools/</loc>\n    <lastmod>${siteLastMod}</lastmod>\n  </url>\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml" } }
  ),
  "/api/embedded": {
    GET() {
      const files = embeddedFiles.map((blob) => ({
        name: (blob as Blob & { name: string }).name,
        size: blob.size,
        type: blob.type,
      }));
      return Response.json({ count: files.length, files });
    },
  },
  "/api/routes": {
    GET() {
      const explicit = Object.keys(routes).sort();
      // Bun's HTML bundler additionally serves every embedded file at /<name>
      // (its compiled output path), e.g. /faviconpng-7kqrmrr8.png
      const implicit = embeddedFiles
        .map((blob) => `/${(blob as Blob & { name: string }).name}`)
        .sort();
      return Response.json({
        explicit_count: explicit.length,
        explicit,
        implicit_via_html_bundler_count: implicit.length,
        implicit_via_html_bundler: implicit,
      });
    },
  },
  "/api/share": {
    async GET(req: Request) {
      const requestUrl = new URL(req.url);
      const rawUrl = requestUrl.searchParams.get("url");
      if (!rawUrl) {
        return Response.json({ error: "Missing url parameter" }, { status: 400 });
      }

      const shareUrl = normalizeShareUrl(rawUrl);
      if (!shareUrl) {
        return Response.json(
          { error: "Invalid share URL. Expected https://poe.com/s/<share-id>." },
          { status: 400 }
        );
      }

      try {
        const result = await fetchShareUrls(shareUrl);
        if (result.error) {
          const status =
            Number.isInteger(result.error.status) &&
            result.error.status >= 400 &&
            result.error.status <= 599
              ? result.error.status
              : 502;
          return Response.json(result.error, { status });
        }

        return Response.json({ urls: result.urls, nextData: result.nextDataRaw });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ error: `Fetch failed: ${message}` }, { status: 502 });
      }
    },
  },
};

async function runCli(shareInput: string) {
  const shareUrl = normalizeShareUrl(shareInput);
  if (!shareUrl) {
    throw new Error("Invalid share URL. Expected https://poe.com/s/<share-id>.");
  }

  const result = await fetchShareUrls(shareUrl);
  if (result.error) {
    const message = result.error.error || "Failed to fetch share.";
    throw new Error(message);
  }

  const zipBlob = await createGalleryZipBlob({
    sourceFile: result.nextDataRaw
      ? { name: "next-data.json", raw: result.nextDataRaw, type: "application/json" }
      : null,
    urls: result.urls,
  });

  const shareCode = shareUrl.split("/").pop() ?? "poe";
  const outputName = `${shareCode}.zip`;
  const outputPath = join(process.cwd(), outputName);
  await Bun.write(outputPath, zipBlob);
  console.log(`Saved ${outputPath}`);
}

async function main() {
  const arg = Bun.argv[2];
  if (arg === "--help" || arg === "-h") {
    console.log("Usage: bun run server.ts [https://poe.com/s/<id>]");
    console.log("Without a URL, the web server starts on http://localhost:3000.");
    return;
  }
  if (arg && !arg.startsWith("-")) {
    await runCli(arg);
    return;
  }

  const server = serve({ port, routes } as Parameters<typeof serve>[0]);
  console.log(`Server running at http://localhost:${server.port}`);
}

await main();
