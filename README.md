# Note Types — Obsidian Plugin

Define custom **note types** in your vault. Each type gets creation commands, filtered file pickers, hover previews, styled wikilinks, and a sidebar widget — all driven by frontmatter.

---

## Features

**Note types**  
Define named types (e.g. *Project*, *Person*, *Book*) with a template, a save folder, and custom frontmatter fields. Each type registers two commands in the palette:

- **Create new `<Type>`** — opens a modal pre-filled with the type's fields, creates the file from the template, and inserts a `[[wikilink]]` if triggered from the editor.
- **Find `<Type>`** — opens a fuzzy picker scoped to files that match the type's frontmatter filters.

**Note from selection**  
Select text in the editor, right-click (or use the editor menu), and choose *Note from selection* to create a typed note whose title is pre-filled with the selection. The selection is replaced with the new `[[wikilink]]`.

If the selection is a bare URL and the note type has a **Field for highlighted URL** set (in its *Creation fields* section), the URL is written into that frontmatter field instead of becoming the title. With the optional **Fetch page title from URL** setting enabled, the plugin then makes one network request to the linked page and pre-fills the title with its `og:title` / `<title>`. That setting is off by default; when off, no network requests are made.

**Inline trigger**  
Set a single trigger character (e.g. `@`) in settings. Typing it in the editor opens a quick picker for any note type that has *Show in trigger menu* enabled.

**Styled wikilinks**  
Enable *Styled links* on a note type to apply a CSS class (`ffc-note-link`) to every `[[wikilink]]` pointing at a file of that type — in both the editor and reading view. Pairs well with a CSS snippet.

**Hover preview card**  
Enable *Preview fields* on a type and hovering a styled wikilink shows a popup card with those frontmatter values (and an optional image).

**Filtered file commands**  
Create arbitrary command-palette commands that open a fuzzy picker showing only files whose frontmatter matches your filters (AND / OR, with `equals`, `not_equals`, `contains`, `exists` operators). Optionally restrict to specific file extensions (e.g. `md, canvas`).

**Filtered Files Widget**  
A sidebar panel (left ribbon → *Filtered files*) with collapsible, drag-reorderable sections. Each section has its own filter rules, sort order, and optional result limit. Supports tag, frontmatter, path, and filename filters.

---

## Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` (if present) into `<Vault>/.obsidian/plugins/filtered-file-commands/`.
2. Reload Obsidian.
3. Enable **Note Types** under *Settings → Community plugins*.

---

## Settings

Open *Settings → Note Types* to configure:

- **Filtered File Commands** — custom palette commands with frontmatter filters.
- **Trigger key** — single character for the inline note picker (`@` recommended).
- **Templates folder** — path to your templates folder (leave blank to auto-detect from the core Templates plugin).
- **Fetch page title from URL** — off by default. When on, creating a note from a highlighted URL fetches the linked page (one network request, 8-second timeout) to pre-fill the title.
- **Note Types** — define, edit, and delete your note types.
- **Filtered Files Widget** — open the widget, set a display-name frontmatter key, or reset all sections.

---

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # type-check + production bundle
npm run lint     # ESLint
```

Output artifacts (`main.js`) are written to the plugin root. See [AGENTS.md](AGENTS.md) for conventions.

---

## License

MIT
