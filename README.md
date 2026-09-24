
<!-- ABOUT THE PROJECT -->
## About The Project

On Poe, open the chat menu and tap **Share entire chat** to copy a `https://poe.com/s/<id>` URL, then paste it into export.tools.

<p align="center">
  <img src="images/how-to-share.webp" alt="Poe chat menu with Share entire chat highlighted" width="260">
</p>

<!-- GETTING STARTED -->
## Prerequisites and Usage

Install [Bun](https://bun.sh) and clone this repository:

```sh
git clone https://github.com/frederick623/poe-export-tools.git
cd poe-export-tools
bun install --cwd fullstack --production
```

Run the program from the repository root with a Poe share URL:

```sh
bun run fullstack/server.ts https://poe.com/s/<share-id>
```

Replace `<share-id>` with the ID from the Poe share link. The exported zip is
saved in the current directory.

<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE` for more information.

<!-- DISCLAIMER -->
## Disclaimer

This tool is for personal use. Please respect Poe's terms of service and only export content you have permission to access.
