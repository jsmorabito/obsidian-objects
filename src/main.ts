import { Notice, Plugin, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettingTab } from './settings.ts';
import { PluginSettings, NoteType, CommandSpec } from './types.ts';
import { nameToCommandSlug, stringifyFrontmatterValue } from './utils/helpers.ts';
import { VALID_STATUSES, statusSvg } from './utils/status-svg.ts';
import { FFW_VIEW_TYPE } from './utils/ffw-utils.ts';
import { FilteredFileModal } from './ui/filtered-file-modal.ts';
import { NewNoteModal } from './ui/new-note-modal.ts';
import { CombinedNewNoteModal } from './ui/combined-new-note-modal.ts';
import { NoteTypeSuggest } from './ui/note-type-suggest.ts';
import { NotePreviewPopup } from './ui/note-preview-popup.ts';
import { CanvasNoteSwitcher, ObsidianCanvas } from './ui/canvas-note-switcher.ts';
import { FilteredFilesWidgetView } from './views/filtered-files-widget.ts';
import { buildNoteLinkViewPlugin } from './views/note-link-view-plugin.ts';
import type { TriggerProvider } from './trigger-registry.ts';

// Command reference type returned by addCommand
type CommandRef = { name: string };

export class FilteredFileCommandsPlugin extends Plugin {
  settings!: PluginSettings;
  commandRefs: Record<string, CommandRef> = {};
  registeredCommandIds = new Set<string>();

  styledNoteBasenames:  Set<string> = new Set();
  styledNotePaths:      Set<string> = new Set();
  previewNoteBasenames: Set<string> = new Set();
  previewNotePaths:     Set<string> = new Set();
  statusNoteMap:        Map<string, string> = new Map();

  private previewPopup!: NotePreviewPopup;

  // ── Trigger provider registry ─────────────────────────────────────────────────

  /**
   * External plugins can contribute items to the @ trigger menu by calling
   * registerTriggerProvider(). They should call unregisterTriggerProvider()
   * in their own onunload() to avoid holding a dead reference.
   */
  readonly triggerProviders: Map<string, TriggerProvider> = new Map();

  registerTriggerProvider(provider: TriggerProvider): void {
    this.triggerProviders.set(provider.id, provider);
  }

  unregisterTriggerProvider(id: string): void {
    this.triggerProviders.delete(id);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new MyPluginSettingTab(this.app, this));

    // ── Filtered Files Widget ───────────────────────────────────────────────────
    this.registerView(FFW_VIEW_TYPE, (leaf) => new FilteredFilesWidgetView(leaf, this));
    if (this.settings.filteredWidgetEnabled) {
      this.refreshWidgetRibbonIcon();
      this.addCommand({
        id:       'ffc-open-filtered-files-widget',
        name:     'Open filtered files widget',
        callback: () => this.activateWidgetView(),
      });
    }

    if (this.settings.filteredCommandsEnabled) {
      for (const cmd of this.settings.commands) this.registerFilterCommand(cmd);
    }
    for (const noteType of this.settings.noteTypes) {
      this.registerNoteTypeCommand(noteType);
      if (noteType.enableFindCommand) this.registerFindCommand(noteType);
    }
    this.registerNewNoteCommand();

    this.registerEditorSuggest(new NoteTypeSuggest(this.app, this));

    // ── Note link styling ────────────────────────────────────────────────────────
    this.buildStyledNoteSet();

    this.previewPopup = new NotePreviewPopup(this);
    this.register(() => this.previewPopup.destroy());

    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll('a.internal-link[data-href]').forEach((link) => {
        const href     = (link.getAttribute('data-href') ?? '').split('#')[0].trim();
        const basename = href.includes('/') ? href.split('/').pop() ?? href : href;
        if (this.styledNoteBasenames.has(href) || this.styledNoteBasenames.has(basename)) {
          link.classList.add('ffc-note-link');
        }
        if (this.previewNoteBasenames.has(href) || this.previewNoteBasenames.has(basename)) {
          link.classList.add('ffc-note-preview-link');
        }
        const status = this.statusNoteMap.get(basename) ?? this.statusNoteMap.get(href);
        if (status) {
          const svg = statusSvg(status);
          if (svg) {
            const span = createSpan();
            span.className = 'ffc-status-icon';
            span.appendChild(svg);
            link.prepend(span);
          }
        }
      });
    });

    this.registerEditorExtension(buildNoteLinkViewPlugin(this));

    this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        this.buildStyledNoteSet();
        this.refreshNoteLinkStyles();
      })
    );

    // ── "Note from selection" context menu ───────────────────────────────────────
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const selection = editor.getSelection()?.trim();
        if (!selection) return;
        const types = this.settings.noteTypes;
        if (types.length === 0) return;

        const from = editor.getCursor('from');
        const to   = editor.getCursor('to');

        /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call --
           `setSubmenu` isn't part of the public Obsidian Menu typings. */
        menu.addItem((item) => {
          item.setTitle('Note from selection').setIcon('box-select');
          const submenu = (item as any).setSubmenu();
          for (const noteType of types) {
            submenu.addItem((subItem: any) => {
              subItem.setTitle(noteType.name)
                .onClick(() => {
                  const current = this.settings.noteTypes.find((o) => o.id === noteType.id);
                  if (!current) { new Notice('Note type not found. Try reloading.'); return; }
                  new NewNoteModal(
                    this.app, current,
                    async (title, fv, desc) => {
                      editor.replaceRange(`[[${title}]]`, from, to);
                      await this.createNote(current, title, fv, desc);
                    },
                    selection,
                  ).open();
                });
            });
          }
        });
        /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call --
           End of the Menu.setSubmenu reflection block. */
      })
    );

    // ── Canvas card menu buttons ────────────────────────────────────────────────
    this.injectCanvasButtons();
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        window.setTimeout(() => this.injectCanvasButtons(), 50);
      })
    );
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        window.setTimeout(() => this.injectCanvasButtons(), 50);
      })
    );
  }

  // ── Canvas card menu button ───────────────────────────────────────────────────

  injectCanvasButtons(): void {
    this.app.workspace.iterateAllLeaves((leaf) => this._injectIntoCanvasLeaf(leaf));
  }

  private _injectIntoCanvasLeaf(leaf: WorkspaceLeaf): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- WorkspaceLeaf.view has no canvas-specific public type.
    const view = leaf?.view as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- see above.
    if (view?.getViewType?.() !== 'canvas') return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- see above.
    const container = view.containerEl as HTMLElement;
    const menuEl    = container.querySelector('.canvas-card-menu');
    if (!menuEl || menuEl.querySelector('.ffc-canvas-note-btn')) return;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- see above.
    const canvas = view.canvas as ObsidianCanvas;

    const btn = menuEl.createDiv({
      cls: 'canvas-card-menu-button mod-draggable ffc-canvas-note-btn',
    });
    btn.setAttribute('aria-label', 'Add note card');
    btn.setAttribute('data-tooltip-position', 'top');
    setIcon(btn, 'shapes');

    const wrapperEl = canvas.wrapperEl ?? canvas.canvasEl ?? container;

    btn.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const CARD_W = 300;
      const CARD_H = 160;

      let zoom = 1;
      const _wRect = wrapperEl.getBoundingClientRect();
      if (typeof canvas.getViewportBBox === 'function' && _wRect.width > 0) {
        const _bb = canvas.getViewportBBox();
        const _canvasW = _bb.maxX - _bb.minX;
        if (_canvasW > 0) zoom = _wRect.width / _canvasW;
      } else {
        const _z = canvas.zoom;
        if (typeof _z === 'number' && isFinite(_z) && _z > 0) zoom = _z;
      }

      const GHOST_W = CARD_W * zoom;
      const GHOST_H = CARD_H * zoom;

      const ghost = document.body.createDiv({ cls: 'ffc-canvas-drop-ghost' });
      ghost.setAttribute('aria-hidden', 'true');
      ghost.setCssProps({ '--ffc-ghost-w': `${GHOST_W}px`, '--ffc-ghost-h': `${GHOST_H}px` });

      const startX   = e.clientX;
      const startY   = e.clientY;
      let   dragging = false;

      const onMouseMove = (me: MouseEvent): void => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!dragging && Math.sqrt(dx * dx + dy * dy) >= 5) {
          dragging = true;
          ghost.classList.add('is-visible');
          btn.classList.add('is-dragging');
        }
        if (dragging) {
          ghost.setCssProps({ '--ffc-ghost-x': `${me.clientX}px`, '--ffc-ghost-y': `${me.clientY}px` });
        }
      };

      const onMouseUp = (ue: MouseEvent): void => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
        ghost.remove();
        btn.classList.remove('is-dragging');

        if (!dragging) {
          new CanvasNoteSwitcher(this.app, this, canvas, null).open();
          return;
        }

        const rect = wrapperEl.getBoundingClientRect();
        if (
          ue.clientX < rect.left || ue.clientX > rect.right ||
          ue.clientY < rect.top  || ue.clientY > rect.bottom
        ) return;

        let pos: { x: number; y: number };
        const relX = ue.clientX - rect.left;
        const relY = ue.clientY - rect.top;
        if (typeof canvas.getViewportBBox === 'function') {
          const bb = canvas.getViewportBBox();
          pos = {
            x: bb.minX + (relX / rect.width)  * (bb.maxX - bb.minX),
            y: bb.minY + (relY / rect.height) * (bb.maxY - bb.minY),
          };
        } else {
          const z = canvas.zoom ?? 1;
          pos = {
            x: (relX - (canvas.x ?? 0)) / z,
            y: (relY - (canvas.y ?? 0)) / z,
          };
        }

        new CanvasNoteSwitcher(this.app, this, canvas, pos).open();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   onMouseUp);
    });
  }

  // ── Filtered Files Widget helpers ─────────────────────────────────────────────

  private widgetRibbonEl: HTMLElement | null = null;

  /** Add or remove the widget ribbon icon to match the current settings. */
  refreshWidgetRibbonIcon(): void {
    const shouldShow = this.settings.filteredWidgetEnabled && this.settings.filteredWidgetRibbon;
    if (shouldShow && !this.widgetRibbonEl) {
      this.widgetRibbonEl = this.addRibbonIcon(
        'file-sliders',
        'Open filtered files widget',
        () => this.activateWidgetView(),
      );
    } else if (!shouldShow && this.widgetRibbonEl) {
      this.widgetRibbonEl.remove();
      this.widgetRibbonEl = null;
    }
  }

  async activateWidgetView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(FFW_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      const newLeaf = workspace.getLeftLeaf(false);
      if (newLeaf) {
        await newLeaf.setViewState({ type: FFW_VIEW_TYPE, active: true });
        leaf = newLeaf;
      }
    }
    if (leaf) await workspace.revealLeaf(leaf);
  }

  refreshWidgetViews(): void {
    this.app.workspace.getLeavesOfType(FFW_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof FilteredFilesWidgetView) leaf.view.render();
    });
  }

  // ── Filtered file commands ────────────────────────────────────────────────────

  registerFilterCommand(cmd: CommandSpec): void {
    if (this.registeredCommandIds.has(cmd.id)) return;
    const registered = this.addCommand({
      id: cmd.id,
      name: cmd.name,
      callback: () => {
        const current = this.settings.commands.find((c) => c.id === cmd.id);
        if (!current) { new Notice('Note Types: Command not found. Try reloading.'); return; }
        const files = this.getFilteredFiles(current);
        if (files.length === 0) { new Notice('Note Types: No files match the current filters.'); return; }
        new FilteredFileModal(this.app, files).open();
      },
    });
    this.commandRefs[cmd.id] = registered;
    this.registeredCommandIds.add(cmd.id);
  }

  getFilteredFiles(cmd: CommandSpec): TFile[] {
    const fileTypes = (cmd.fileTypes || '').split(',')
      .map((e) => e.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
    const allFiles = fileTypes.length > 0
      ? this.app.vault.getFiles().filter((f) => fileTypes.includes(f.extension.toLowerCase()))
      : this.app.vault.getMarkdownFiles();
    if (!cmd.filters || cmd.filters.length === 0) return allFiles;
    return allFiles.filter((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const results = cmd.filters.map((f) => this.evaluateFilter(fm, f, file));
      return cmd.matchMode === 'all' ? results.every(Boolean) : results.some(Boolean);
    });
  }

  getNoteTypeFiles(noteType: NoteType): TFile[] {
    const filters  = noteType.matchFilters ?? [];
    const matchMode = noteType.matchMode ?? 'all';
    return this.app.vault.getMarkdownFiles().filter((file) => {
      if (filters.length > 0) {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const results = filters.map((f) => this.evaluateFilter(fm, f, file));
        return matchMode === 'all' ? results.every(Boolean) : results.some(Boolean);
      } else if (noteType.saveFolder?.trim()) {
        const prefix = noteType.saveFolder.trim().replace(/\/$/, '') + '/';
        return file.path.startsWith(prefix);
      }
      return false;
    });
  }

  evaluateFilter(fm: Record<string, unknown>, filter: { key: string; operator: string; value: string }, file?: TFile): boolean {
    const { key, operator, value } = filter;
    if (operator === 'in_folder' || operator === 'not_in_folder') {
      if (!file) return true;
      const folder   = value.trim().replace(/\/$/, '');
      const inFolder = file.path.startsWith(folder + '/') || file.path === folder;
      return operator === 'in_folder' ? inFolder : !inFolder;
    }
    if (!key?.trim()) return true;
    const raw = fm[key];
    switch (operator) {
      case 'exists':     return raw !== undefined && raw !== null && raw !== '';
      case 'equals':     return Array.isArray(raw) ? (raw as unknown[]).map(stringifyFrontmatterValue).includes(value) : stringifyFrontmatterValue(raw) === value;
      case 'not_equals': return Array.isArray(raw) ? !(raw as unknown[]).map(stringifyFrontmatterValue).includes(value) : stringifyFrontmatterValue(raw) !== value;
      case 'contains':   return Array.isArray(raw)
        ? (raw as unknown[]).some((v) => stringifyFrontmatterValue(v).toLowerCase().includes(value.toLowerCase()))
        : stringifyFrontmatterValue(raw).toLowerCase().includes(value.toLowerCase());
      default: return true;
    }
  }

  // ── Note type commands ────────────────────────────────────────────────────────

  registerNoteTypeCommand(noteType: NoteType): void {
    const cmdId = `ffc-notetype-${noteType.commandSlug}`;
    if (this.registeredCommandIds.has(cmdId)) return;
    const registered = this.addCommand({
      id: cmdId,
      name: `Create new ${noteType.name}`,
      callback: () => {
        const current = this.settings.noteTypes.find((o) => o.id === noteType.id);
        if (!current) { new Notice('Note type not found. Try reloading.'); return; }
        new NewNoteModal(this.app, current, (title, fieldValues, description) =>
          this.createNote(current, title, fieldValues, description)
        ).open();
      },
    });
    this.commandRefs[cmdId] = registered;
    this.registeredCommandIds.add(cmdId);
  }

  registerFindCommand(noteType: NoteType): void {
    const cmdId = `ffc-notetype-${noteType.commandSlug}-find`;
    if (this.registeredCommandIds.has(cmdId)) return;
    const registered = this.addCommand({
      id: cmdId,
      name: `Find ${noteType.name}`,
      callback: () => {
        const current = this.settings.noteTypes.find((o) => o.id === noteType.id);
        if (!current) { new Notice('Note Types: Note type not found. Try reloading.'); return; }
        const files = this.getNoteTypeFiles(current);
        if (files.length === 0) { new Notice('Note Types: No files match this note type.'); return; }
        new FilteredFileModal(this.app, files, current.name).open();
      },
    });
    this.commandRefs[cmdId] = registered;
    this.registeredCommandIds.add(cmdId);
  }

  private registerNewNoteCommand(): void {
    this.addCommand({
      id: 'ffc-new-note',
      name: 'New note',
      callback: () => {
        const types = this.settings.noteTypes;
        if (types.length === 0) {
          new Notice('No note types defined. Add one in the Note Types settings.');
          return;
        }
        if (types.length === 1) {
          new NewNoteModal(this.app, types[0], (title, fv, desc) =>
            this.createNote(types[0], title, fv, desc)
          ).open();
          return;
        }
        new CombinedNewNoteModal(this.app, types, (noteType, title, fv, desc) =>
          this.createNote(noteType, title, fv, desc)
        ).open();
      },
    });

    this.addCommand({
      id: 'ffc-new-note-from-selection',
      name: 'New note from selection',
      editorCallback: (editor) => {
        const types = this.settings.noteTypes;
        if (types.length === 0) {
          new Notice('No note types defined. Add one in the Note Types settings.');
          return;
        }
        const selection = editor.getSelection()?.trim();
        const from = editor.getCursor('from');
        const to   = editor.getCursor('to');
        const replaceWithLink = async (title: string) => {
          editor.replaceRange(`[[${title}]]`, from, to);
        };
        if (types.length === 1) {
          new NewNoteModal(this.app, types[0], async (title, fv, desc) => {
            await replaceWithLink(title);
            await this.createNote(types[0], title, fv, desc);
          }, selection).open();
          return;
        }
        new CombinedNewNoteModal(this.app, types, async (noteType, title, fv, desc) => {
          await replaceWithLink(title);
          await this.createNote(noteType, title, fv, desc);
        }, selection).open();
      },
    });

    // Note: we deliberately do NOT push this command into the text-formatting-toolbar
    // plugin ourselves. That toolbar's external-command registry is owned by Commander,
    // which manages it with setCommands() (a full replace) — an uncoordinated addCommand()
    // here produces a toolbar button that Commander wipes on its next sync and that the
    // user cannot remove or reorder from any settings UI. Anyone who wants
    // "New note from selection" on the floating toolbar can add the regular
    // `filtered-file-commands:ffc-new-note-from-selection` command via Commander's
    // "Text Toolbar" tab. The editor context menu ("Note from selection") also covers this.
  }

  // ── File creation ─────────────────────────────────────────────────────────────

  async createNote(
    noteType: NoteType,
    title: string,
    fieldValues: Record<string, string> = {},
    description = '',
  ): Promise<void> {
    const saveFolder = noteType.saveFolder?.trim() ?? '';
    const filePath   = saveFolder ? `${saveFolder}/${title}.md` : `${title}.md`;

    if (this.app.vault.getAbstractFileByPath(filePath)) {
      new Notice(`A file named "${title}" already exists at that location.`);
      return;
    }

    let content = '';
    if (noteType.templatePath) {
      const tplFile = this.app.vault.getAbstractFileByPath(noteType.templatePath);
      if (tplFile instanceof TFile) {
        content = await this.app.vault.read(tplFile);
      } else {
        new Notice(`Template not found: ${noteType.templatePath}`);
      }
    }

    const now = new Date();
    content = content
      .replace(/\{\{title\}\}/gi, title)
      .replace(/\{\{date\}\}/gi, now.toISOString().split('T')[0])
      .replace(/\{\{time\}\}/gi, now.toTimeString().split(' ')[0]);

    content = this.injectFieldsIntoContent(content, noteType, fieldValues);
    if (description.trim()) {
      content = this.appendDescriptionToContent(content, description.trim());
    }

    if (saveFolder && !this.app.vault.getAbstractFileByPath(saveFolder)) {
      try { await this.app.vault.createFolder(saveFolder); } catch { /* race: already exists */ }
    }

    try {
      const newFile = await this.app.vault.create(filePath, content);
      const notice = new Notice('', 6000);
      const frag = notice.messageEl.createSpan();
      frag.appendText('Created: ');
      const link = frag.createEl('a', { text: title, href: '#', cls: 'ffc-notice-link' });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(newFile);
        notice.hide();
      });
    } catch (err) {
      new Notice(`Failed to create file: ${(err as Error).message}`);
    }
  }

  private injectFieldsIntoContent(
    content: string,
    noteType: NoteType,
    fieldValues: Record<string, string>,
  ): string {
    const fields = (noteType.fields ?? []).filter((f) => f.key?.trim());
    if (fields.length === 0) return content;
    for (const field of fields) {
      const raw = (fieldValues[field.key] ?? '').trim();
      if (!raw) continue;
      if (field.type === 'list') {
        const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
        content = this.upsertListInFrontmatter(content, field.key, items);
      } else {
        content = this.upsertTextInFrontmatter(content, field.key, raw);
      }
    }
    return content;
  }

  private appendDescriptionToContent(content: string, description: string): string {
    const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
    if (fmMatch) {
      const fmEnd = fmMatch.index! + fmMatch[0].length;
      const body  = content.slice(fmEnd);
      if (body.trim()) {
        return content.trimEnd() + '\n\n' + description + '\n';
      } else {
        return content.slice(0, fmEnd) + '\n' + description + '\n';
      }
    } else {
      return content.trim() ? content.trimEnd() + '\n\n' + description + '\n' : description + '\n';
    }
  }

  private keyBlockRegex(esc: string): RegExp {
    return new RegExp(`^${esc}:[^\\n]*((?:\\r?\\n  - [^\\r\\n]*)*)`, 'm');
  }

  private upsertListInFrontmatter(content: string, key: string, newItems: string[]): string {
    if (!newItems.length) return content;
    content = this.ensureFrontmatter(content);
    const esc      = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const yamlItem = (i: string): string => /^\[\[.*\]\]$/.test(i) ? `"${i}"` : i;

    const inlineRe = new RegExp(`(^${esc}:\\s*\\[)([^\\]]*)(\\])`, 'm');
    if (inlineRe.test(content)) {
      return content.replace(inlineRe, (_, open, body, close) => {
        const existing = (body as string).split(',').map((s: string) => s.trim()).filter(Boolean);
        const merged   = [...new Set([...existing, ...newItems])];
        return `${open}${merged.map(yamlItem).join(', ')}${close}`;
      });
    }

    const blockRe = this.keyBlockRegex(esc);
    const m       = content.match(blockRe);
    if (m) {
      const blockPart = m[1];
      let existing: string[] = [];
      if (blockPart.trim()) {
        existing = [...blockPart.matchAll(/- ([^\r\n]+)/g)].map((x) => x[1].trim());
      } else {
        const scalarVal = m[0].replace(new RegExp(`^${esc}:\\s*`), '').trim();
        if (scalarVal) existing = [scalarVal];
      }
      const merged      = [...new Set([...existing, ...newItems])];
      const replacement = `${key}:\n` + merged.map((i) => `  - ${yamlItem(i)}`).join('\n');
      return content.replace(blockRe, replacement);
    }

    return content.replace(/^(---\r?\n)/, `$1${key}: [${newItems.map(yamlItem).join(', ')}]\n`);
  }

  private upsertTextInFrontmatter(content: string, key: string, value: string): string {
    content = this.ensureFrontmatter(content);
    const esc       = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const yamlValue = /^\[\[.*\]\]$/.test(value) ? `"${value}"` : value;
    const blockRe   = this.keyBlockRegex(esc);
    if (blockRe.test(content)) {
      return content.replace(blockRe, `${key}: ${yamlValue}`);
    }
    return content.replace(/^(---\r?\n)/, `$1${key}: ${yamlValue}\n`);
  }

  private ensureFrontmatter(content: string): string {
    if (/^---\r?\n/.test(content)) return content;
    return `---\n---\n\n${content}`;
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  private getTemplatesFolder(): string {
    if (this.settings.templatesFolder) return this.settings.templatesFolder;
    try {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
         Core plugin internals (app.internalPlugins) aren't part of the public Obsidian API. */
      const core = (this.app as any).internalPlugins?.plugins?.['templates'];
      if (core?.enabled) return core.instance?.options?.folder ?? '';
      /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return --
         End of the internalPlugins reflection block. */
    } catch { /* ignore */ }
    return '';
  }

  getTemplateFiles(): TFile[] {
    const folder = this.getTemplatesFolder();
    const allMd  = this.app.vault.getMarkdownFiles();
    if (!folder) return allMd;
    const prefix = folder.endsWith('/') ? folder : folder + '/';
    return allMd.filter((f) => f.path.startsWith(prefix));
  }

  // ── Persistence ───────────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    if (raw.noteTypes === undefined && Array.isArray(raw.objectTypes)) {
      raw.noteTypes = raw.objectTypes;
    }
    delete raw.objectTypes;

    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    if (!this.settings.noteTypes)                     this.settings.noteTypes = [];
    if (this.settings.templatesFolder === undefined)  this.settings.templatesFolder = '';
    if (this.settings.triggerKey === undefined)       this.settings.triggerKey = '';
    if (!Array.isArray(this.settings.ffwSections))   this.settings.ffwSections = [];
    if (this.settings.ffwDisplayNameKey === undefined) this.settings.ffwDisplayNameKey = '';

    this.settings.ffwSections = this.settings.ffwSections.filter((s) =>
      s && typeof s === 'object' &&
      typeof s.id === 'string' && typeof s.title === 'string' &&
      Array.isArray(s.filters) && !!s.sort
    );

    const takenSlugs = new Set(
      this.settings.noteTypes.filter((o) => o.commandSlug).map((o) => o.commandSlug)
    );

    let needsSave = false;
    for (const obj of this.settings.noteTypes) {
      if (!obj.fields)                           { obj.fields = [];         needsSave = true; }
      if (!obj.matchFilters)                     { obj.matchFilters = [];   needsSave = true; }
      if (!obj.matchMode)                        { obj.matchMode = 'all';   needsSave = true; }
      if (obj.enableFindCommand === undefined)   { obj.enableFindCommand = false; needsSave = true; }
      if (obj.showInTriggerMenu === undefined)   { obj.showInTriggerMenu = false; needsSave = true; }
      if (obj.styledLinks === undefined)         { obj.styledLinks = false; needsSave = true; }
      if (!obj.previewFields)                    { obj.previewFields = [];  needsSave = true; }
      if (!obj.canvasFields)                     { obj.canvasFields = [];   needsSave = true; }
      if (!obj.imageKey)                         { obj.imageKey = '';       needsSave = true; }
      if (obj.showImageInPreview === undefined)  { obj.showImageInPreview = false; needsSave = true; }
      if (obj.showImageInCanvas  === undefined)  { obj.showImageInCanvas  = false; needsSave = true; }

      if (!obj.commandSlug) {
        const base = nameToCommandSlug(obj.name);
        let slug = base; let n = 2;
        while (takenSlugs.has(slug)) slug = `${base}-${n++}`;
        obj.commandSlug = slug;
        takenSlugs.add(slug);
        needsSave = true;
      }
    }

    if (needsSave) await this.saveSettings();
  }

  async saveSettings(): Promise<void> { await this.saveData(this.settings); }

  // ── Note link styling ─────────────────────────────────────────────────────────

  buildStyledNoteSet(): void {
    this.styledNoteBasenames  = new Set();
    this.styledNotePaths      = new Set();
    this.previewNoteBasenames = new Set();
    this.previewNotePaths     = new Set();
    this.statusNoteMap        = new Map();
    for (const noteType of this.settings.noteTypes) {
      const hasPreview = (noteType.previewFields ?? []).length > 0;
      if (!noteType.styledLinks && !hasPreview && !noteType.showStatusInLinks) continue;
      for (const file of this.getNoteTypeFiles(noteType)) {
        if (noteType.styledLinks) {
          this.styledNoteBasenames.add(file.basename);
          this.styledNotePaths.add(file.path);
        }
        if (hasPreview) {
          this.previewNoteBasenames.add(file.basename);
          this.previewNotePaths.add(file.path);
        }
        if (noteType.showStatusInLinks) {
          const raw: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.['status'];
          if (typeof raw === 'string' && VALID_STATUSES.has(raw)) {
            this.statusNoteMap.set(file.basename, raw);
          }
        }
      }
    }
  }

  refreshNoteLinkStyles(): void {
    document.querySelectorAll('a.internal-link[data-href]').forEach((link) => {
      const href      = (link.getAttribute('data-href') ?? '').split('#')[0].trim();
      const basename  = href.includes('/') ? href.split('/').pop() ?? href : href;
      const isStyled  = this.styledNoteBasenames.has(href)  || this.styledNoteBasenames.has(basename);
      const isPreview = this.previewNoteBasenames.has(href)  || this.previewNoteBasenames.has(basename);
      (link as HTMLElement).classList.toggle('ffc-note-link',         isStyled);
      (link as HTMLElement).classList.toggle('ffc-note-preview-link', isPreview);
    });
  }
}

export default FilteredFileCommandsPlugin;
