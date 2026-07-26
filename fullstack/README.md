# fullstack

Small Bun fullstack app to extract attachment URLs from Poe share links and Poe chat export files.

## How it works

- `/` serves a minimal UI where you paste a Poe share URL and press Enter, or upload a Poe chat export `.json` or `.md` file.
- `/api/share?url=...` fetches the share HTML and extracts attachment URLs from `__NEXT_DATA__`.
- The browser downloads attachments directly and builds a zip locally with client-zip.
- Uploaded JSON exports are expanded back into their folder structure when the JSON includes file-tree metadata.
- `bun run server.ts https://poe.com/s/<id>` fetches a share and saves `<share-id>.zip` in the current folder.

To install dependencies:

```bash
bun install --production
```

To run locally:

```bash
bun run server.ts
```

To save a zip from a Poe share URL without opening the web UI:

```bash
bun run server.ts https://poe.com/s/<id>
```

Open `http://localhost:3000`.

To build a standalone executable:

```bash
bun run build.ts
```

To run:

```bash
./fullstack
```

railway env:
```
RAILPACK_BUILD_CMD="bun run build.ts"
RAILPACK_INSTALL_CMD="bun install --production"
RAILPACK_PACKAGES="bun@latest"
```
!TODO: in build.ts, programatically adjust "version" to git commit id, so we dont have to manually change.
