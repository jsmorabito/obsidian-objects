import { Setting, SettingPage } from 'obsidian';
import type { FilteredFileCommandsPlugin } from '../main.ts';
import type { CanvasField, FilterSpec, NoteField, PreviewField } from '../types.ts';
import { nameToCommandSlug } from '../utils/helpers.ts';
import { NoteTypeFilterModal } from './note-type-filter-modal.ts';
import { NoteFieldModal } from './note-field-modal.ts';
import { KeyLabelFieldModal } from './key-label-field-modal.ts';

const OP_LABELS: Record<FilterSpec['operator'], string> = {
  equals: 'equals',
  not_equals: 'does not equal',
  contains: 'contains',
  exists: 'exists',
  in_folder: 'in folder',
  not_in_folder: 'not in folder',
};

/**
 * The per-note-type settings sub-page. Rendered imperatively via the `page`
 * factory on the note types list definition, because its content is dynamic
 * (template choices, growable field lists).
 */
export class NoteTypeSettingsPage extends SettingPage {
  private plugin: FilteredFileCommandsPlugin;
  private index: number;
  private onDataChange: (() => void) | undefined;

  constructor(plugin: FilteredFileCommandsPlugin, index: number, onDataChange?: () => void) {
    super();
    this.plugin       = plugin;
    this.index        = index;
    this.onDataChange = onDataChange;
    this.title        = plugin.settings.noteTypes[index]?.name || 'Note type';
  }

  display(): void {
    const contentEl = this.containerEl;

    // `contentEl.empty()` collapses the page to zero height, so the settings
    // scroll container snaps back to the top. Capture its position and restore
    // it once the page has been rebuilt.
    const scroller   = this._scrollParent(contentEl);
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
          this.title = value || 'Note type';
          this.titlebarEl.querySelector<HTMLElement>('.setting-page-title')?.setText(this.title);
          // Refresh the tab's cached definitions so the list row shows the new
          // name when the user navigates back (no visible re-render while an
          // imperative sub-page is open).
          this.onDataChange?.();
        })
      );

    // ── Description ───────────────────────────────────────────────────────────
    new Setting(contentEl).setName('Description').setDesc('Short description shown beneath the note type name in the settings list.')
      .addText((text) => text.setPlaceholder('E.g. Tracks actionable to-dos').setValue(obj.description || '')
        .onChange(async (value) => {
          obj.description = value;
          await this.plugin.saveSettings();
          this.onDataChange?.();
        })
      );

    if (obj.commandSlug !== nameToCommandSlug(obj.name)) {
      contentEl.createEl('p', {
        text: `⚠ Command ID ("${obj.commandSlug}") was set when this type was first created and no longer matches the current name. Renaming only updates the display — to fix it, change "commandSlug" in data.json to "${nameToCommandSlug(obj.name)}" and rebind any shortcuts.`,
        cls: 'ffc-hint ffc-slug-warning',
      });
    }

    // ── Note detection ───────────────────────────────────────────────────────
    new Setting(contentEl).setName('Note detection').setHeading();
    contentEl.createEl('p', {
      text: 'Filters that identify existing files of this type. Used by the trigger menu and the "find" command. If no filters are set, files in the save folder are used as a fallback.',
      cls: 'ffc-hint',
    });

    new Setting(contentEl)
      .setName('Filter match mode')
      .setDesc('Should a file match all filters (and) or at least one filter (or)?')
      .addDropdown((dd) =>
        dd.addOption('all', 'Match all (and)').addOption('any', 'Match any (or)')
          .setValue(obj.matchMode ?? 'all')
          .onChange(async (value) => { obj.matchMode = value as 'all' | 'any'; await this.plugin.saveSettings(); })
      );

    if (!obj.matchFilters || obj.matchFilters.length === 0) {
      contentEl.createEl('p', { text: 'No filters — save folder will be used as a fallback.', cls: 'ffc-hint' });
    }
    for (let fi = 0; fi < (obj.matchFilters ?? []).length; fi++) {
      const filter = obj.matchFilters[fi];
      new Setting(contentEl)
        .setName(this._filterSummary(filter))
        .addExtraButton((btn) => btn.setIcon('pencil').setTooltip('Edit filter')
          .onClick(() => new NoteTypeFilterModal(this.plugin.app, this.plugin, filter, () => this.display()).open()))
        .addExtraButton((btn) => btn.setIcon('trash-2').setTooltip('Remove filter')
          .onClick(async () => {
            obj.matchFilters.splice(fi, 1);
            await this.plugin.saveSettings();
            this.display();
          }));
    }
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText('Add detection filter').onClick(async () => {
        if (!obj.matchFilters) obj.matchFilters = [];
        const filter: FilterSpec = { key: '', operator: 'equals', value: '' };
        obj.matchFilters.push(filter);
        await this.plugin.saveSettings();
        this.display();
        new NoteTypeFilterModal(this.plugin.app, this.plugin, filter, () => this.display()).open();
      })
    );

    new Setting(contentEl)
      .setName('Show in trigger menu')
      .setDesc(`When enabled, matching files appear in the "${this.plugin.settings.triggerKey || '@'}" inline trigger menu.`)
      .addToggle((toggle) =>
        toggle.setValue(obj.showInTriggerMenu ?? false)
          .onChange(async (value) => { obj.showInTriggerMenu = value; await this.plugin.saveSettings(); })
      );

    new Setting(contentEl)
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

    new Setting(contentEl)
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

    new Setting(contentEl)
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

    // ── Template & save folder ───────────────────────────────────────────────
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
      new Setting(contentEl).setName('Template').setDesc('No templates found. Set the templates folder in the main settings, or check it contains .md files.')
        .addText((text) => text.setPlaceholder('path/to/template.md').setValue(obj.templatePath || '')
          .onChange(async (value) => { obj.templatePath = value.trim(); await this.plugin.saveSettings(); })
        );
    }

    new Setting(contentEl).setName('Save folder').setDesc('Where new files are created (e.g. "projects/tasks"). Leave blank for vault root.')
      .addText((text) => text.setPlaceholder('E.g. Projects/tasks').setValue(obj.saveFolder || '')
        .onChange(async (value) => { obj.saveFolder = value.trim(); await this.plugin.saveSettings(); })
      );

    // ── Creation fields ─────────────────────────────────────────────────────
    new Setting(contentEl).setName('Creation fields').setHeading();
    contentEl.createEl('p', {
      text: "Fields shown in the creation dialog. Values are written into the new file's frontmatter.",
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.fields ?? []).length; fi++) {
      const field = obj.fields[fi];
      new Setting(contentEl)
        .setName(field.label?.trim() || field.key?.trim() || 'Unnamed field')
        .setDesc(this._fieldDesc(field))
        .addExtraButton((btn) => btn.setIcon('pencil').setTooltip('Edit field')
          .onClick(() => new NoteFieldModal(this.plugin.app, this.plugin, field, () => this.display()).open()))
        .addExtraButton((btn) => btn.setIcon('trash-2').setTooltip('Remove field')
          .onClick(async () => {
            obj.fields.splice(fi, 1);
            await this.plugin.saveSettings();
            this.display();
          }));
    }
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText('Add field').onClick(async () => {
        if (!obj.fields) obj.fields = [];
        const field: NoteField = { key: '', label: '', type: 'text' };
        obj.fields.push(field);
        await this.plugin.saveSettings();
        this.display();
        new NoteFieldModal(this.plugin.app, this.plugin, field, () => this.display()).open();
      })
    );

    const urlFieldOptions = (obj.fields ?? []).filter((f) => f.key?.trim());
    new Setting(contentEl)
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

    // ── Preview fields ──────────────────────────────────────────────────────
    new Setting(contentEl).setName('Preview fields').setHeading();
    contentEl.createEl('p', {
      text: 'Frontmatter keys shown when hovering over a link to a note of this type.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.previewFields ?? []).length; fi++) {
      const field = obj.previewFields[fi];
      new Setting(contentEl)
        .setName(field.label?.trim() || field.key?.trim() || 'Unnamed key')
        .setDesc(field.key?.trim() ? `key: ${field.key}` : 'no key set')
        .addExtraButton((btn) => btn.setIcon('pencil').setTooltip('Edit key')
          .onClick(() => new KeyLabelFieldModal(this.plugin.app, this.plugin, field, {
            heading: 'Preview field',
            afterChange: () => { this.plugin.buildStyledNoteSet(); this.plugin.refreshNoteLinkStyles(); },
            onDismiss: () => this.display(),
          }).open()))
        .addExtraButton((btn) => btn.setIcon('trash-2').setTooltip('Remove key')
          .onClick(async () => {
            obj.previewFields.splice(fi, 1);
            await this.plugin.saveSettings();
            this.plugin.buildStyledNoteSet();
            this.plugin.refreshNoteLinkStyles();
            this.display();
          }));
    }
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText('Add preview field').onClick(async () => {
        if (!obj.previewFields) obj.previewFields = [];
        const field: PreviewField = { key: '', label: '' };
        obj.previewFields.push(field);
        await this.plugin.saveSettings();
        this.display();
        new KeyLabelFieldModal(this.plugin.app, this.plugin, field, {
          heading: 'Preview field',
          afterChange: () => { this.plugin.buildStyledNoteSet(); this.plugin.refreshNoteLinkStyles(); },
          onDismiss: () => this.display(),
        }).open();
      })
    );

    new Setting(contentEl)
      .setName('Show cover image in preview')
      .setDesc('When enabled, the image from the image key is shown at the top of the hover card.')
      .addToggle((toggle) =>
        toggle.setValue(obj.showImageInPreview ?? false)
          .onChange(async (value) => { obj.showImageInPreview = value; await this.plugin.saveSettings(); })
      );

    // ── Canvas card fields ──────────────────────────────────────────────────
    new Setting(contentEl).setName('Canvas card fields').setHeading();
    contentEl.createEl('p', {
      text: 'Frontmatter keys shown on canvas cards for notes of this type.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.canvasFields ?? []).length; fi++) {
      const field = obj.canvasFields[fi];
      new Setting(contentEl)
        .setName(field.label?.trim() || field.key?.trim() || 'Unnamed key')
        .setDesc(field.key?.trim() ? `key: ${field.key}` : 'no key set')
        .addExtraButton((btn) => btn.setIcon('pencil').setTooltip('Edit key')
          .onClick(() => new KeyLabelFieldModal(this.plugin.app, this.plugin, field, {
            heading: 'Canvas card field',
            onDismiss: () => this.display(),
          }).open()))
        .addExtraButton((btn) => btn.setIcon('trash-2').setTooltip('Remove key')
          .onClick(async () => {
            obj.canvasFields.splice(fi, 1);
            await this.plugin.saveSettings();
            this.display();
          }));
    }
    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText('Add canvas field').onClick(async () => {
        if (!obj.canvasFields) obj.canvasFields = [];
        const field: CanvasField = { key: '', label: '' };
        obj.canvasFields.push(field);
        await this.plugin.saveSettings();
        this.display();
        new KeyLabelFieldModal(this.plugin.app, this.plugin, field, {
          heading: 'Canvas card field',
          onDismiss: () => this.display(),
        }).open();
      })
    );

    new Setting(contentEl)
      .setName('Show cover image on canvas cards')
      .setDesc('When enabled, the image from the image key is embedded at the top of the canvas card.')
      .addToggle((toggle) =>
        toggle.setValue(obj.showImageInCanvas ?? false)
          .onChange(async (value) => { obj.showImageInCanvas = value; await this.plugin.saveSettings(); })
      );

    // ── Cover image ─────────────────────────────────────────────────────────
    new Setting(contentEl).setName('Cover image').setHeading();
    contentEl.createEl('p', {
      text: 'The frontmatter key whose value is an image path or wikilink (e.g. "cover" or "image").',
      cls: 'ffc-hint',
    });

    new Setting(contentEl)
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

  private _filterSummary(f: FilterSpec): string {
    if (f.operator === 'in_folder' || f.operator === 'not_in_folder') {
      return `${OP_LABELS[f.operator]}: ${f.value?.trim() || '(unset)'}`;
    }
    const key = f.key?.trim() || '(no key)';
    if (f.operator === 'exists') return `${key} exists`;
    return `${key} ${OP_LABELS[f.operator]} ${f.value?.trim() ? `"${f.value}"` : '""'}`;
  }

  private _fieldDesc(f: NoteField): string {
    const parts: string[] = [];
    if (f.key?.trim()) parts.push(`key: ${f.key}`);
    parts.push(f.type === 'list' ? 'list' : 'text');
    return parts.join(' · ');
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
}
