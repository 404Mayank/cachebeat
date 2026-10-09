# The cachebeat logo

Three cache layers seen from above. The top one holds the prompt, lying flat on it. The one below runs as a glass bar that thins and warms into a heartbeat, which climbs the stack's receding edge into a heart.

## The files

| File | What it is | Where it works |
| --- | --- | --- |
| `logo.svg`, `logo.png` | The icon: the mark on its own dark tile (the PNG is 512px) | Any background |
| `logo-wordmark.svg` | The mark and the name on a dark card | Any background |
| `logo-mark-on-dark.svg` | The mark alone, with no background | Dark backgrounds only |
| `logo-wordmark-on-dark.svg` | The mark and the name, with no background | Dark backgrounds only |
| `social-preview.svg`, `social-preview.png` | A 1280×640 card for links to the repository | GitHub's Settings → General → Social preview |

## Rebuilding

Every file here is drawn by a script that lives on the [`dev` branch](https://github.com/404Mayank/cachebeat/tree/dev/assets/logo), with the steps to rebuild and change the logo.

The name and the social card's line are set in [Lexend](https://github.com/googlefonts/lexend), under the SIL Open Font License 1.1, and drawn as outlines, so the SVGs don't need the font.
