---
name: blob-cli-share
description: Use when the user wants to share a generated artifact (HTML deck, SVG, markdown, image) via a browser-renderable URL. Uses blob-cli to upload and returns the URL. Requires blob-cli to be already configured — if not, run blob-cli-setup first.
---

# Share an artifact via blob-cli

## When this fires

The user said something like:
- "Share this with my friend"
- "Send me the link to view"
- "Get me a URL for this"
- "I want to open this in a browser, not the terminal"

…and you have a file at a known path on their machine.

## Preflight

```bash
command -v blob >/dev/null || { echo "blob-cli not installed; use blob-cli-setup skill"; exit 1; }
test -f "$HOME/.config/blob-cli/config.json" || { echo "blob-cli not configured; use blob-cli-setup skill"; exit 1; }
```

If either check fails, stop and use the `blob-cli-setup` skill first.

## Upload

```bash
blob upload <path-to-file>
```

The last line of stdout is the URL.

## Output to the user

Print the URL as plain text on its own line. Do **not** wrap it in `**bold**` or any other markdown emphasis. The user copies these into chat clients, and asterisks leak through if the destination doesn't render markdown.

Good:
```
Uploaded. Here's the link:

https://blob-viewer-abc.vercel.app/my-deck-x7Ka2.html
```

Bad:
```
**https://blob-viewer-abc.vercel.app/my-deck-x7Ka2.html**
```

## Notes

- HTML, SVG, Markdown, plain text render inline in the browser thanks to the viewer's `Content-Disposition: inline` header.
- File URLs are openly accessible to anyone with the link. Don't upload anything sensitive.
- Each upload gets a random suffix; you can't overwrite an existing file. Re-upload to get a fresh URL.
- If the user wants to manage their files, point them at their viewer dashboard at `<viewer-url>/` (password-gated).
