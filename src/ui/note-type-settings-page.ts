import { App, Setting } from 'obsidian';
import type { FilteredFileCommandsPlugin } from '../main.ts';
import { nameToCommandSlug } from '../utils/helpers.ts';

export class NoteTypeSettingsPage {
  private app: App;
  private plugin: FilteredFileCommandsPlugin;
  private index: number;
  private onTitleChange: ((title: string) => void) | undefined;
  private containerEl!: HTMLElement;

  constructor(app: App, plugin: FilteredFileCommandsPlugin, index: number, onTitleChange?: (title: string) => void) {
    this.app           = app;
    this.plugin        = plugin;
    this.index         = index;
    this.onTitleChange = onTitleChange;
  }

  render(containerEl: HTMLElement): void {
    this.containerEl = containerEl;
    this._render();
  }

  private _render(): void {
    const contentEl = this.containerEl;

    // `contentEl.empty()` collapses the page to zero height, so the settings
    // scroll container snaps back to the top. Capture its position and restore
    // it once the page has been rebuilt.
    const scroller = this._scrollParent(contentEl);
    const prevScroll = scroller?.scrollTop ?? 0;

    contentEl.empty();
    contentEl.addClass('ffc-item-page');

    const obj = this.plugin.settings.noteTypes[this.index];
    if (!obj) { contentEl.createEl('p', { text: 'Note type not found.' }); return; }

    // ── Name ──────────────────────────────────────────────────────────────────
    new Setting(contentEl).setName('Note type name').setDesc('Creates a "Create new {name}" command in the palette.')
      .addText((text) => text.setPlaceholder('E.g. Task').setValue(obj.name)
        .onChange(async (value) => {
          obj.name = value;
          await this.plugin.saveSettings();
          const cmdId = `ffc-notetype-${obj.commandSlug}`;
          const refs = this.plugin.commandRefs;
          if (refs[cmdId]) refs[cmdId].name = `Create new ${value}`;
          const findCmdId = `${cmdId}-find`;
          if (refs[findCmdId]) refs[findCmdId].name = `Find ${value}`;
          this.onTitleChange?.(value || 'Note type');
        })
      );

    // ── Description ───────────────────────────────────────────────────────────
    new Setting(contentEl).setName('Description').setDesc('Short description shown beneath the note type name in the settings list.')
      .addText((text) => text.setPlaceholder('E.g. Tracks actionable to-dos').setValue(obj.description || '')
        .onChange(async (value) => {
          obj.description = value;
          await this.plugin.saveSettings();
        })
      );

    if (obj.commandSlug !== nameToCommandSlug(obj.name)) {
      contentEl.createEl('p', {
        text: `⚠ Command ID ("${obj.commandSlug}") was set when this type was first created and no longer matches the current name. Renaming only updates the display — to fix it, change "commandSlug" in data.json to "${nameToCommandSlug(obj.name)}" and rebind any shortcuts.`,
        cls: 'ffc-hint ffc-slug-warning',
      });
    }

    // ── Note Detection ────────────────────────────────────────────────────────
    const detectionSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    detectionSection.createEl('p', { text: 'Note detection', cls: 'ffc-filters-title' });
    detectionSection.createEl('p', {
      text: 'Filters that identify existing files of this type. Used by the trigger menu and the "find" command. If no filters are set, files in the save folder are used as a fallback.',
      cls: 'ffc-hint',
    });

    new Setting(detectionSection)
      .setName('Filter match mode')
      .setDesc('Should a file match all filters (and) or at least one filter (or)?')
      .addDropdown((dd) =>
        dd.addOption('all', 'Match all (and)').addOption('any', 'Match any (or)')
          .setValue(obj.matchMode ?? 'all')
          .onChange(async (value) => { obj.matchMode = value as 'all' | 'any'; await this.plugin.saveSettings(); })
      );

    if (!obj.matchFilters || obj.matchFilters.length === 0) {
      detectionSection.createEl('p', { text: 'No filters — save folder will be used as a fallback.', cls: 'ffc-hint' });
    }
    for (let fi = 0; fi < (obj.matchFilters ?? []).length; fi++) {
      this._renderNoteMatchFilter(detectionSection, fi);
    }
    new Setting(detectionSection).addButton((btn) =>
      btn.setButtonText('＋ add detection filter').onClick(async () => {
        if (!obj.matchFilters) obj.matchFilters = [];
        obj.matchFilters.push({ key: '', operator: 'equals', value: '' });
        await this.plugin.saveSettings();
        this._render();
      })
    );

    new Setting(detectionSection)
      .setName('Show in trigger menu')
      .setDesc(`When enabled, matching files appear in the "${this.plugin.settings.triggerKey || '@'}" inline trigger menu.`)
      .addToggle((toggle) =>
        toggle.setValue(obj.showInTriggerMenu ?? false)
          .onChange(async (value) => { obj.showInTriggerMenu = value; await this.plugin.saveSettings(); })
      );

    new Setting(detectionSection)
      .setName('Enable "find" command')
      .setDesc(`When enabled, adds a "Find ${obj.name}" command to the palette for fuzzy-searching files of this type.`)
      .addToggle((toggle) =>
        toggle.setValue(obj.enableFindCommand ?? false)
          .onChange(async (value) => {
            obj.enableFindCommand = value;
            await this.plugin.saveSettings();
            if (value) this.plugin.registerFindCommand(obj);
          })
      );

    new Setting(detectionSection)
      .setName('Style note links')
      .setDesc('When enabled, inline links to files of this type will have their underline removed and a background fill applied.')
      .addToggle((toggle) =>
        toggle.setValue(obj.styledLinks ?? false)
          .onChange(async (value) => {
            obj.styledLinks = value;
            await this.plugin.saveSettings();
            this.plugin.buildStyledNoteSet();
            this.plugin.refreshNoteLinkStyles();
          })
      );

    new Setting(detectionSection)
      .setName('Show status in links')
      .setDesc('When enabled, a status icon is shown on inline links to files of this type that have a "status" frontmatter field.')
      .addToggle((toggle) =>
        toggle.setValue(obj.showStatusInLinks ?? false)
          .onChange(async (value) => {
            obj.showStatusInLinks = value;
            await this.plugin.saveSettings();
            this.plugin.buildStyledNoteSet();
            this.plugin.refreshNoteLinkStyles();
          })
      );

    // ── Template & Save Folder ────────────────────────────────────────────────
    const templateFiles = this.plugin.getTemplateFiles();
    if (templateFiles.length > 0) {
      new Setting(contentEl).setName('Template').setDesc('Template file applied when creating a new note of this type.')
        .addDropdown((dd) => {
          dd.addOption('', '— none —');
          for (const f of templateFiles) dd.addOption(f.path, f.basename);
          dd.setValue(obj.templatePath || '');
          dd.onChange(async (value) => { obj.templatePath = value; await this.plugin.saveSettings(); });
        });
    } else {
      new Setting(contentEl).setName('Template').setDesc('No templates found. Set the templates folder in General settings, or check it contains .md files.')
        .addText((text) => text.setPlaceholder('path/to/template.md').setValue(obj.templatePath || '')
          .onChange(async (value) => { obj.templatePath = value.trim(); await this.plugin.saveSettings(); })
        );
    }

    new Setting(contentEl).setName('Save folder').setDesc('Where new files are created (e.g. "projects/tasks"). Leave blank for vault root.')
      .addText((text) => text.setPlaceholder('E.g. Projects/tasks').setValue(obj.saveFolder || '')
        .onChange(async (value) => { obj.saveFolder = value.trim(); await this.plugin.saveSettings(); })
      );

    // ── Creation Fields ───────────────────────────────────────────────────────
    const fieldsSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    fieldsSection.createEl('p', { text: 'Creation fields', cls: 'ffc-filters-title' });
    fieldsSection.createEl('p', {
      text: "Fields shown in the creation dialog. Values are written into the new file's frontmatter.",
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.fields ?? []).length; fi++) {
      this._renderNoteField(fieldsSection, fi);
    }
    new Setting(fieldsSection).addButton((btn) =>
      btn.setButtonText('＋ add field').onClick(async () => {
        if (!obj.fields) obj.fields = [];
        obj.fields.push({ key: '', label: '', type: 'text' });
        await this.plugin.saveSettings();
        this._render();
      })
    );

    const urlFieldOptions = (obj.fields ?? []).filter((f) => f.key?.trim());
    new Setting(fieldsSection)
      .setName('Field for highlighted URL')
      .setDesc('When you create a note of this type from a highlighted URL, the URL is written into this field instead of becoming the title.')
      .addDropdown((dd) => {
        dd.addOption('', '— none —');
        for (const f of urlFieldOptions) {
          dd.addOption(f.key, f.label?.trim() ? `${f.label} (${f.key})` : f.key);
        }
        // Keep a stale reference visible so it isn't silently dropped.
        if (obj.urlFieldKey && !urlFieldOptions.some((f) => f.key === obj.urlFieldKey)) {
          dd.addOption(obj.urlFieldKey, `${obj.urlFieldKey} (missing field)`);
        }
        dd.setValue(obj.urlFieldKey ?? '');
        dd.onChange(async (value) => {
          obj.urlFieldKey = value || undefined;
          await this.plugin.saveSettings();
        });
      });

    // ── Preview Fields ────────────────────────────────────────────────────────
    const previewSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    previewSection.createEl('p', { text: 'Preview fields', cls: 'ffc-filters-title' });
    previewSection.createEl('p', {
      text: 'Frontmatter keys shown when hovering over a link to a note of this type.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.previewFields ?? []).length; fi++) {
      this._renderPreviewField(previewSection, fi);
    }
    new Setting(previewSection).addButton((btn) =>
      btn.setButtonText('＋ add preview field').onClick(async () => {
        if (!obj.previewFields) obj.previewFields = [];
        obj.previewFields.push({ key: '', label: '' });
        await this.plugin.saveSettings();
        this._render();
      })
    );

    new Setting(previewSection)
      .setName('Show cover image in preview')
      .setDesc('When enabled, the image from the image key is shown at the top of the hover card.')
      .addToggle((toggle) =>
        toggle.setValue(obj.showImageInPreview ?? false)
          .onChange(async (value) => { obj.showImageInPreview = value; await this.plugin.saveSettings(); })
      );

    // ── Canvas Card Fields ────────────────────────────────────────────────────
    const canvasSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    canvasSection.createEl('p', { text: 'Canvas card fields', cls: 'ffc-filters-title' });
    canvasSection.createEl('p', {
      text: 'Frontmatter keys shown on canvas cards for notes of this type.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.canvasFields ?? []).length; fi++) {
      this._renderCanvasField(canvasSection, fi);
    }
    new Setting(canvasSection).addButton((btn) =>
      btn.setButtonText('＋ add canvas field').onClick(async () => {
        if (!obj.canvasFields) obj.canvasFields = [];
        obj.canvasFields.push({ key: '', label: '' });
        await this.plugin.saveSettings();
        this._render();
      })
    );

    new Setting(canvasSection)
      .setName('Show cover image on canvas cards')
      .setDesc('When enabled, the image from the image key is embedded at the top of the canvas card.')
      .addToggle((toggle) =>
        toggle.setValue(obj.showImageInCanvas ?? false)
          .onChange(async (value) => { obj.showImageInCanvas = value; await this.plugin.saveSettings(); })
      );

    // ── Cover Image ───────────────────────────────────────────────────────────
    const imageSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    imageSection.createEl('p', { text: 'Cover image', cls: 'ffc-filters-title' });
    imageSection.createEl('p', {
      text: 'The frontmatter key whose value is an image path or wikilink (e.g. "cover" or "image").',
      cls: 'ffc-hint',
    });

    new Setting(imageSection)
      .setName('Image frontmatter key')
      .setDesc('E.g. cover, image, thumbnail')
      .addText((text) =>
        text.setPlaceholder('cover')
          .setValue(obj.imageKey ?? '')
          .onChange(async (value) => { obj.imageKey = value.trim(); await this.plugin.saveSettings(); })
      );

    if (scroller && prevScroll) {
      scroller.scrollTop = Math.min(prevScroll, scroller.scrollHeight - scroller.clientHeight);
    }
  }

  /** Nearest vertically-scrollable ancestor of `el`, or null. */
  private _scrollParent(el: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = el.parentElement;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  private _renderNoteMatchFilter(container: HTMLElement, filterIndex: number): void {
    const obj    = this.plugin.settings.noteTypes[this.index];
    const filter = obj.matchFilters[filterIndex];
    const row    = container.createDiv({ cls: 'ffc-filter-row' });

    const isPathOp = filter.operator === 'in_folder' || filter.operator === 'not_in_folder';

    if (!isPathOp) {
      const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
      keyInput.type = 'text'; keyInput.placeholder = 'Property key'; keyInput.value = filter.key ?? '';
      keyInput.addEventListener('change', () => { filter.key = keyInput.value.trim(); void this.plugin.saveSettings(); });
    }

    const opSelect = row.createEl('select', { cls: 'ffc-select' });
    for (const op of [
      { value: 'equals',        label: '=' },
      { value: 'not_equals',    label: '≠' },
      { value: 'contains',      label: 'contains' },
      { value: 'exists',        label: 'exists' },
      { value: 'in_folder',     label: 'in folder' },
      { value: 'not_in_folder', label: 'not in folder' },
    ]) {
      const opt = opSelect.createEl('option', { text: op.label, value: op.value });
      if (filter.operator === op.value) opt.selected = true;
    }
    opSelect.addEventListener('change', () => {
      filter.operator = opSelect.value as typeof filter.operator;
      void this.plugin.saveSettings();
      this._render();
    });

    if (filter.operator !== 'exists') {
      const valInput = row.createEl('input', { cls: 'ffc-input ffc-input-val' });
      valInput.type = 'text';
      valInput.placeholder = isPathOp ? 'Folder path (e.g. Templates)' : 'Value';
      valInput.value = filter.value ?? '';
      valInput.addEventListener('change', () => { filter.value = valInput.value; void this.plugin.saveSettings(); });
    }

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.matchFilters.splice(filterIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }

  private _renderNoteField(container: HTMLElement, fieldIndex: number): void {
    const obj   = this.plugin.settings.noteTypes[this.index];
    const field = obj.fields[fieldIndex];
    const row   = container.createDiv({ cls: 'ffc-filter-row' });

    const labelInput = row.createEl('input', { cls: 'ffc-input ffc-input-label' });
    labelInput.type = 'text'; labelInput.placeholder = 'Label'; labelInput.value = field.label ?? '';
    labelInput.title = 'Display label shown in the creation dialog';
    labelInput.addEventListener('change', () => { field.label = labelInput.value; void this.plugin.saveSettings(); });

    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type = 'text'; keyInput.placeholder = 'Frontmatter key'; keyInput.value = field.key ?? '';
    keyInput.title = 'The frontmatter property key written into the new file';
    keyInput.addEventListener('change', () => {
      field.key = keyInput.value.trim();
      void this.plugin.saveSettings();
    });

    const typeSelect = row.createEl('select', { cls: 'ffc-select' });
    for (const t of [{ value: 'text', label: 'Text' }, { value: 'list', label: 'List' }]) {
      const opt = typeSelect.createEl('option', { text: t.label, value: t.value });
      if (field.type === t.value) opt.selected = true;
    }
    typeSelect.title = 'List splits comma-separated input into a YAML array';
    typeSelect.addEventListener('change', () => { field.type = typeSelect.value as 'text' | 'list'; void this.plugin.saveSettings(); });

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.fields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }

  private _renderPreviewField(container: HTMLElement, fieldIndex: number): void {
    const obj   = this.plugin.settings.noteTypes[this.index];
    const field = obj.previewFields[fieldIndex];
    const row   = container.createDiv({ cls: 'ffc-filter-row' });

    const labelInput = row.createEl('input', { cls: 'ffc-input ffc-input-label' });
    labelInput.type = 'text'; labelInput.placeholder = 'Display label'; labelInput.value = field.label ?? '';
    labelInput.title = 'Label shown in the preview card (leave blank to use the key name)';
    labelInput.addEventListener('change', () => { field.label = labelInput.value; void this.plugin.saveSettings(); });

    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type = 'text'; keyInput.placeholder = 'Frontmatter key'; keyInput.value = field.key ?? '';
    keyInput.title = 'The frontmatter property key whose value will appear in the preview';
    keyInput.addEventListener('change', () => {
      field.key = keyInput.value.trim();
      void this.plugin.saveSettings();
      this.plugin.buildStyledNoteSet();
      this.plugin.refreshNoteLinkStyles();
    });

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.previewFields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this.plugin.buildStyledNoteSet();
      this.plugin.refreshNoteLinkStyles();
      this._render();
    };
  }

  private _renderCanvasField(container: HTMLElement, fieldIndex: number): void {
    const obj   = this.plugin.settings.noteTypes[this.index];
    const field = obj.canvasFields[fieldIndex];
    const row   = container.createDiv({ cls: 'ffc-filter-row' });

    const labelInput = row.createEl('input', { cls: 'ffc-input ffc-input-label' });
    labelInput.type        = 'text';
    labelInput.placeholder = 'Display label';
    labelInput.value       = field.label ?? '';
    labelInput.title       = 'Label shown on the canvas card (leave blank to use the key name)';
    labelInput.addEventListener('change', () => {
      field.label = labelInput.value;
      void this.plugin.saveSettings();
    });

    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type        = 'text';
    keyInput.placeholder = 'Frontmatter key';
    keyInput.value       = field.key ?? '';
    keyInput.title       = 'The frontmatter property key whose value will appear on the card';
    keyInput.addEventListener('change', () => {
      field.key = keyInput.value.trim();
      void this.plugin.saveSettings();
    });

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.canvasFields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }
}
