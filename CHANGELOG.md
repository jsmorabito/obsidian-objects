# Changelog

All notable changes to this plugin are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0]

### Added

- Note types can designate a creation field to receive a highlighted URL. Set
  **Field for highlighted URL** in a note type's **Creation fields** section.
  When you run "Note from selection" / "New note from selection" and the
  selection is a bare `http(s)` URL, the URL is written into that field and the
  title is left blank for you to fill in, instead of the URL becoming the title.
  In the combined (multi-type) dialog the URL re-routes to whichever selected
  type's designated field applies.
- **Fetch page title from URL** setting (off by default). When enabled, creating
  a note from a highlighted URL fetches the linked page and pre-fills the title
  field with its `og:title` / `<title>` (unless you have already typed a title).
  This makes one network request to the linked site; the request times out after
  8 seconds and any failure falls back silently.

### Fixed

- The note type settings sub-page no longer jumps back to the top when adding or
  removing a field, filter, or preview/canvas key. Scroll position is preserved
  across the re-render.

## [1.5.15]

### Fixed

- Removed the direct injection of a "New note from selection" button into the
  Text Formatting Toolbar. That toolbar's external-command list is owned by the
  Commander plugin (which manages it with a full replace), so the injected button
  could not be removed or reordered from any settings UI and was wiped whenever
  Commander re-synced. The `filtered-file-commands:ffc-new-note-from-selection`
  command still exists and can be added to the floating toolbar through
  Commander's "Text Toolbar" tab; the editor context menu also still offers
  "Note from selection".

## [1.5.14]

### Added

- "Show ribbon icon" toggle for the filtered files widget. The ribbon icon is
  now off by default and can be turned on from the widget settings section; it
  adds and removes without reloading the plugin.

### Changed

- The filtered files widget ribbon icon is no longer added automatically when
  the widget feature is enabled — it requires the new toggle.

## [1.5.13]

### Changed

- Note type definitions open in a settings sub-page instead of a modal.

## [1.5.12]

### Changed

- Default filters for filtered file commands are disabled unless explicitly
  enabled.

## [1.5.11]

### Fixed

- Lint fixes and release preparation for Obsidian plugin standards.
