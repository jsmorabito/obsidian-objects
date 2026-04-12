/* Objects – Obsidian Plugin */
'use strict';

const obsidian = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert an object type name to a stable command slug.
 * e.g. "My Task" → "my-task", "  Hello World! " → "hello-world"
 */
function nameToCommandSlug(name) {
  return (name || 'object')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'object';
}

// ─── Default Settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  commands: [],
  objectTypes: [],
  templatesFolder: '',
  triggerKey: '',
};

// ─── Filtered File Modal ──────────────────────────────────────────────────────

class FilteredFileModal extends obsidian.FuzzySuggestModal {
  constructor(app, files, typeName) {
    super(app);
    this.files = files;
    this.setPlaceholder(typeName ? `Search ${typeName}…` : 'Type to search filtered files…');
    this.setInstructions([
      { command: '↑↓', purpose: 'navigate' },
      { command: '↵', purpose: 'open' },
      { command: 'esc', purpose: 'dismiss' },
    ]);
  }

  getItems() { return this.files; }

  getTitle(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const title = cache?.frontmatter?.title;
    return title ? String(title) : file.basename;
  }

  getItemText(file) { return this.getTitle(file); }

  renderSuggestion(match, el) {
    const file = match.item;
    const wrapper = el.createDiv({ cls: 'ffc-suggestion' });
    wrapper.createEl('span', { text: this.getTitle(file), cls: 'ffc-suggestion-name' });
    const folder = file.parent?.path;
    if (folder && folder !== '/') {
      wrapper.createEl('span', { text: folder, cls: 'ffc-suggestion-path' });
    }
  }

  onChooseItem(file) { this.app.workspace.getLeaf(false).openFile(file); }
}

// ─── Frontmatter Value Suggest ────────────────────────────────────────────────
//
// Custom lightweight autocomplete dropdown for frontmatter fields.
// Built from scratch instead of AbstractInputSuggest so we have full control
// over keyboard/mouse handling inside Obsidian modals.

class FrontmatterValueSuggest {
  constructor(app, inputEl, key, fieldType) {
    this.app = app;
    this.inputEl = inputEl;
    this.key = key;
    this.fieldType = fieldType;
    this.dropdown = null;
    this.suggestions = [];
    this.selectedIndex = -1;

    this._onInput   = () => this.refresh();
    this._onFocus   = () => this.refresh();
    this._onBlur    = () => setTimeout(() => this.close(), 150);
    this._onKeydown = (e) => this.handleKeydown(e);

    inputEl.addEventListener('input',   this._onInput);
    inputEl.addEventListener('focus',   this._onFocus);
    inputEl.addEventListener('blur',    this._onBlur);
    inputEl.addEventListener('keydown', this._onKeydown);
  }

  // ── Data ─────────────────────────────────────────────────────────────────────

  getVaultValues() {
    const values = new Set();
    if (this.key === 'tags' || this.key === 'tag') {
      const tags = this.app.metadataCache.getTags() ?? {};
      for (const tag of Object.keys(tags)) {
        values.add(tag.startsWith('#') ? tag.slice(1) : tag);
      }
    }
    for (const file of this.app.vault.getMarkdownFiles()) {
      const raw = this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.key];
      if (raw == null) continue;
      if (Array.isArray(raw)) raw.forEach((v) => { if (v != null) values.add(String(v).trim()); });
      else { const s = String(raw).trim(); if (s) values.add(s); }
    }
    return [...values].filter(Boolean)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }

  activeTerm() {
    return this.fieldType === 'list'
      ? this.inputEl.value.split(',').pop().trim()
      : this.inputEl.value.trim();
  }

  alreadyEntered() {
    if (this.fieldType !== 'list') return [];
    return this.inputEl.value.split(',').slice(0, -1).map((s) => s.trim().toLowerCase());
  }

  // ── Selection ─────────────────────────────────────────────────────────────────

  select(value) {
    if (this.fieldType === 'list') {
      const parts = this.inputEl.value.split(',');
      parts[parts.length - 1] = value;
      this.inputEl.value = parts.map((s) => s.trim()).join(', ');
    } else {
      this.inputEl.value = value;
    }
    this.inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    this.close();
    this.inputEl.focus();
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────

  handleKeydown(e) {
    if (!this.dropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
      this.updateHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.updateHighlight();
    } else if (e.key === 'Enter') {
      if (this.selectedIndex >= 0) {
        // A suggestion is highlighted — select it and swallow the event so
        // the modal's submit handler doesn't fire.
        e.preventDefault();
        e.stopImmediatePropagation();
        this.select(this.suggestions[this.selectedIndex]);
      }
      // If nothing is highlighted, fall through so the modal can submit.
    } else if (e.key === 'Escape') {
      this.close();
    }
  }

  // ── Dropdown UI ───────────────────────────────────────────────────────────────

  refresh() {
    const term    = this.activeTerm().toLowerCase();
    const entered = this.alreadyEntered();
    const matches = this.getVaultValues().filter((v) =>
      v.toLowerCase().includes(term) && !entered.includes(v.toLowerCase())
    );

    if (matches.length === 0 || document.activeElement !== this.inputEl) {
      this.close(); return;
    }

    this.suggestions    = matches;
    this.selectedIndex  = -1;

    // Reuse or create the dropdown element
    if (!this.dropdown) {
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'suggestion-container ffc-suggest-dropdown';
      document.body.appendChild(this.dropdown);
    }
    this.dropdown.empty();

    const rect = this.inputEl.getBoundingClientRect();
    Object.assign(this.dropdown.style, {
      position:  'fixed',
      top:       `${rect.bottom + 4}px`,
      left:      `${rect.left}px`,
      width:     `${rect.width}px`,
      zIndex:    '9999',
      maxHeight: '200px',
      overflowY: 'auto',
    });

    matches.forEach((value, i) => {
      const item = this.dropdown.createDiv({ cls: 'suggestion-item', text: value });
      // mousedown + preventDefault keeps focus on the input (avoids blur-before-click)
      item.addEventListener('mousedown', (e) => { e.preventDefault(); });
      item.addEventListener('click',     ()  => { this.select(value); });
      item.addEventListener('mouseover', ()  => {
        this.selectedIndex = i;
        this.updateHighlight();
      });
    });
  }

  updateHighlight() {
    if (!this.dropdown) return;
    this.dropdown.querySelectorAll('.suggestion-item').forEach((el, i) => {
      el.classList.toggle('is-selected', i === this.selectedIndex);
    });
  }

  close() {
    if (this.dropdown) { this.dropdown.remove(); this.dropdown = null; }
    this.suggestions   = [];
    this.selectedIndex = -1;
  }

  destroy() {
    this.close();
    this.inputEl.removeEventListener('input',   this._onInput);
    this.inputEl.removeEventListener('focus',   this._onFocus);
    this.inputEl.removeEventListener('blur',    this._onBlur);
    this.inputEl.removeEventListener('keydown', this._onKeydown);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Render the extra frontmatter fields defined on an object type into a container.
 * Attaches vault-wide autocomplete to every field input.
 * `app` is required for the suggest widget.
 */
function renderFieldInputs(container, app, objType, fieldValues, onEnter) {
  container.empty();
  const fields = objType?.fields ?? [];
  for (const field of fields) {
    new obsidian.Setting(container)
      .setName(field.label || field.key)
      .setDesc(field.type === 'list' ? 'Separate multiple values with commas' : '')
      .addText((text) => {
        text
          .setPlaceholder(field.type === 'list' ? 'e.g. tag1, tag2' : '')
          .setValue(fieldValues[field.key] ?? '')
          .onChange((v) => { fieldValues[field.key] = v; });

        // Create the suggest FIRST so its internal keydown listener is registered
        // before ours — the suggest's handler calls stopImmediatePropagation when
        // it selects a suggestion, which prevents our listener below from firing.
        if (field.key?.trim()) {
          new FrontmatterValueSuggest(app, text.inputEl, field.key, field.type);
        }

        // Submit the form on Enter. If a suggestion is highlighted the suggest's
        // keydown handler fires first (registered earlier) and calls
        // stopImmediatePropagation, so this listener is never reached in that case.
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') onEnter();
        });
      });
  }
}

// ─── New Object Modal (single type) ──────────────────────────────────────────

class NewObjectModal extends obsidian.Modal {
  constructor(app, objType, onSubmit) {
    super(app);
    this.objType = objType;
    this.onSubmit = onSubmit;
    this.titleValue = '';
    this.fieldValues = {};
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ffc-new-object-modal');
    contentEl.createEl('h2', { text: `New ${this.objType.name}` });

    // Title — focused immediately
    new obsidian.Setting(contentEl)
      .setName('Title')
      .addText((text) => {
        text.setPlaceholder(`Enter ${this.objType.name} title…`)
          .onChange((v) => { this.titleValue = v; });
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
          if (e.key === 'Escape') this.close();
        });
        setTimeout(() => text.inputEl.focus(), 50);
      });

    // Extra fields defined for this object type
    this.fieldsContainer = contentEl.createDiv();
    renderFieldInputs(this.fieldsContainer, this.app, this.objType, this.fieldValues, () => this.submit());

    new obsidian.Setting(contentEl)
      .addButton((btn) => btn.setButtonText('Create').setCta().onClick(() => this.submit()))
      .addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  submit() {
    const title = this.titleValue.trim();
    if (!title) { new obsidian.Notice('Please enter a title.'); return; }
    this.close();
    this.onSubmit(title, this.fieldValues);
  }

  onClose() { this.contentEl.empty(); }
}

// ─── Combined New Object Modal (multi-type) ───────────────────────────────────

class CombinedNewObjectModal extends obsidian.Modal {
  constructor(app, objectTypes, onSubmit) {
    super(app);
    this.objectTypes = objectTypes;
    this.selectedType = objectTypes[0];
    this.onSubmit = onSubmit;
    this.titleValue = '';
    this.fieldValues = {};
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ffc-new-object-modal');
    contentEl.createEl('h2', { text: 'New Object' });

    // Type dropdown
    new obsidian.Setting(contentEl)
      .setName('Type')
      .addDropdown((dd) => {
        for (const obj of this.objectTypes) dd.addOption(obj.id, obj.name);
        dd.setValue(this.selectedType.id);
        dd.onChange((id) => {
          this.selectedType = this.objectTypes.find((o) => o.id === id) ?? this.objectTypes[0];
          this.fieldValues = {}; // reset values when type changes
          renderFieldInputs(this.fieldsContainer, this.app, this.selectedType, this.fieldValues, () => this.submit());
        });
      });

    // Title — focused immediately
    new obsidian.Setting(contentEl)
      .setName('Title')
      .addText((text) => {
        text.setPlaceholder('Enter title…').onChange((v) => { this.titleValue = v; });
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
          if (e.key === 'Escape') this.close();
        });
        setTimeout(() => text.inputEl.focus(), 50);
      });

    // Dynamic fields for the selected type (re-rendered on type change)
    this.fieldsContainer = contentEl.createDiv();
    renderFieldInputs(this.fieldsContainer, this.app, this.selectedType, this.fieldValues, () => this.submit());

    new obsidian.Setting(contentEl)
      .addButton((btn) => btn.setButtonText('Create').setCta().onClick(() => this.submit()))
      .addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  submit() {
    const title = this.titleValue.trim();
    if (!title) { new obsidian.Notice('Please enter a title.'); return; }
    this.close();
    this.onSubmit(this.selectedType, title, this.fieldValues);
  }

  onClose() { this.contentEl.empty(); }
}

// ─── Object Type Settings Modal ───────────────────────────────────────────────
//
// Opens when the user clicks the gear icon next to an object type.
// Renders all the per-type settings (name, detection filters, template, fields,
// preview fields, etc.) inside a modal so the main settings page stays clean.

class ObjectTypeSettingsModal extends obsidian.Modal {
  constructor(app, plugin, index, onDismiss) {
    super(app);
    this.plugin    = plugin;
    this.index     = index;
    this.onDismiss = onDismiss;
  }

  onOpen() {
    this._render();
  }

  _render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ffc-objtype-modal');

    const obj = this.plugin.settings.objectTypes[this.index];
    if (!obj) { contentEl.createEl('p', { text: 'Object type not found.' }); return; }

    contentEl.createEl('h2', { text: obj.name || 'Object Type Settings', cls: 'ffc-modal-title' });

    // ── Name ────────────────────────────────────────────────────────────────
    new obsidian.Setting(contentEl).setName('Object name').setDesc('Creates a "Create new {name}" command in the palette.')
      .addText((text) => text.setPlaceholder('e.g. Task').setValue(obj.name)
        .onChange(async (value) => {
          obj.name = value;
          await this.plugin.saveSettings();
          const cmdId = `ffc-objtype-${obj.commandSlug}`;
          if (this.plugin.commandRefs?.[cmdId]) this.plugin.commandRefs[cmdId].name = `Create new ${value}`;
          const findCmdId = `${cmdId}-find`;
          if (this.plugin.commandRefs?.[findCmdId]) this.plugin.commandRefs[findCmdId].name = `Find ${value}`;
          // Update modal title live
          const titleEl = contentEl.querySelector('.ffc-modal-title');
          if (titleEl) titleEl.textContent = value || 'Object Type Settings';
        })
      );

    // ── Description ──────────────────────────────────────────────────────────
    new obsidian.Setting(contentEl).setName('Description').setDesc('Short description shown beneath the object type name in the settings list.')
      .addText((text) => text.setPlaceholder('e.g. Tracks actionable to-dos').setValue(obj.description || '')
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

    // ── Object Detection ─────────────────────────────────────────────────────
    const detectionSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    detectionSection.createEl('p', { text: 'Object Detection', cls: 'ffc-filters-title' });
    detectionSection.createEl('p', {
      text: 'Filters that identify existing files of this type. Used by the trigger menu and the "Find" command. If no filters are set, files in the Save Folder are used as a fallback.',
      cls: 'ffc-hint',
    });

    new obsidian.Setting(detectionSection)
      .setName('Filter match mode')
      .setDesc('Should a file match ALL filters (AND) or at least ONE filter (OR)?')
      .addDropdown((dd) =>
        dd.addOption('all', 'Match ALL (AND)').addOption('any', 'Match ANY (OR)')
          .setValue(obj.matchMode ?? 'all')
          .onChange(async (value) => { obj.matchMode = value; await this.plugin.saveSettings(); })
      );

    if (!obj.matchFilters || obj.matchFilters.length === 0) {
      detectionSection.createEl('p', { text: 'No filters — save folder will be used as a fallback.', cls: 'ffc-hint' });
    }
    for (let fi = 0; fi < (obj.matchFilters ?? []).length; fi++) {
      this._renderObjectMatchFilter(detectionSection, fi);
    }
    new obsidian.Setting(detectionSection).addButton((btn) =>
      btn.setButtonText('＋ Add Detection Filter').onClick(async () => {
        if (!obj.matchFilters) obj.matchFilters = [];
        obj.matchFilters.push({ key: '', operator: 'equals', value: '' });
        await this.plugin.saveSettings();
        this._render();
      })
    );

    new obsidian.Setting(detectionSection)
      .setName('Show in trigger menu')
      .setDesc(`When enabled, matching files appear in the "${this.plugin.settings.triggerKey || '@'}" inline trigger menu.`)
      .addToggle((toggle) =>
        toggle.setValue(obj.showInTriggerMenu ?? false)
          .onChange(async (value) => { obj.showInTriggerMenu = value; await this.plugin.saveSettings(); })
      );

    new obsidian.Setting(detectionSection)
      .setName('Enable "Find" command')
      .setDesc(`When enabled, adds a "Find ${obj.name}" command to the palette for fuzzy-searching files of this type.`)
      .addToggle((toggle) =>
        toggle.setValue(obj.enableFindCommand ?? false)
          .onChange(async (value) => {
            obj.enableFindCommand = value;
            await this.plugin.saveSettings();
            if (value) this.plugin.registerFindCommand(obj);
          })
      );

    new obsidian.Setting(detectionSection)
      .setName('Style object links')
      .setDesc('When enabled, inline links to files of this type will have their underline removed and a background fill applied (using tag style variables).')
      .addToggle((toggle) =>
        toggle.setValue(obj.styledLinks ?? false)
          .onChange(async (value) => {
            obj.styledLinks = value;
            await this.plugin.saveSettings();
            this.plugin.buildStyledObjectSet();
            this.plugin.refreshObjectLinkStyles();
          })
      );

    // ── Template & Save Folder ───────────────────────────────────────────────
    const templateFiles = this.plugin.getTemplateFiles();
    if (templateFiles.length > 0) {
      new obsidian.Setting(contentEl).setName('Template').setDesc('Template file applied when creating a new object of this type.')
        .addDropdown((dd) => {
          dd.addOption('', '— None —');
          for (const f of templateFiles) dd.addOption(f.path, f.basename);
          dd.setValue(obj.templatePath || '');
          dd.onChange(async (value) => { obj.templatePath = value; await this.plugin.saveSettings(); });
        });
    } else {
      new obsidian.Setting(contentEl).setName('Template').setDesc('No templates found. Set the templates folder in General settings, or check it contains .md files.')
        .addText((text) => text.setPlaceholder('path/to/template.md').setValue(obj.templatePath || '')
          .onChange(async (value) => { obj.templatePath = value.trim(); await this.plugin.saveSettings(); })
        );
    }

    new obsidian.Setting(contentEl).setName('Save folder').setDesc('Where new files are created (e.g. "Projects/Tasks"). Leave blank for vault root.')
      .addText((text) => text.setPlaceholder('e.g. Projects/Tasks').setValue(obj.saveFolder || '')
        .onChange(async (value) => { obj.saveFolder = value.trim(); await this.plugin.saveSettings(); })
      );

    // ── Creation Fields ──────────────────────────────────────────────────────
    const fieldsSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    fieldsSection.createEl('p', { text: 'Creation Fields', cls: 'ffc-filters-title' });
    fieldsSection.createEl('p', {
      text: 'Fields shown in the creation dialog. Values are written into the new file\'s frontmatter.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.fields ?? []).length; fi++) {
      this._renderObjectField(fieldsSection, fi);
    }
    new obsidian.Setting(fieldsSection).addButton((btn) =>
      btn.setButtonText('＋ Add Field').onClick(async () => {
        if (!obj.fields) obj.fields = [];
        obj.fields.push({ key: '', label: '', type: 'text' });
        await this.plugin.saveSettings();
        this._render();
      })
    );

    // ── Preview Fields ───────────────────────────────────────────────────────
    const previewSection = contentEl.createDiv({ cls: 'ffc-filters-section' });
    previewSection.createEl('p', { text: 'Preview Fields', cls: 'ffc-filters-title' });
    previewSection.createEl('p', {
      text: 'Frontmatter keys shown when hovering over a link to an object of this type. The title is always shown; these fields appear below it.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.previewFields ?? []).length; fi++) {
      this._renderPreviewField(previewSection, fi);
    }
    new obsidian.Setting(previewSection).addButton((btn) =>
      btn.setButtonText('＋ Add Preview Field').onClick(async () => {
        if (!obj.previewFields) obj.previewFields = [];
        obj.previewFields.push({ key: '', label: '' });
        await this.plugin.saveSettings();
        this._render();
      })
    );
  }

  _renderObjectMatchFilter(container, filterIndex) {
    const obj    = this.plugin.settings.objectTypes[this.index];
    const filter = obj.matchFilters[filterIndex];
    const row    = container.createDiv({ cls: 'ffc-filter-row' });

    const isPathOp = filter.operator === 'in_folder' || filter.operator === 'not_in_folder';

    if (!isPathOp) {
      const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
      keyInput.type = 'text'; keyInput.placeholder = 'Property key'; keyInput.value = filter.key ?? '';
      keyInput.addEventListener('change', async () => { filter.key = keyInput.value.trim(); await this.plugin.saveSettings(); });
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
    opSelect.addEventListener('change', async () => { filter.operator = opSelect.value; await this.plugin.saveSettings(); this._render(); });

    if (filter.operator !== 'exists') {
      const valInput = row.createEl('input', { cls: 'ffc-input ffc-input-val' });
      valInput.type = 'text';
      valInput.placeholder = isPathOp ? 'Folder path (e.g. Templates)' : 'Value';
      valInput.value = filter.value ?? '';
      valInput.addEventListener('change', async () => { filter.value = valInput.value; await this.plugin.saveSettings(); });
    }

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.matchFilters.splice(filterIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }

  _renderObjectField(container, fieldIndex) {
    const obj   = this.plugin.settings.objectTypes[this.index];
    const field = obj.fields[fieldIndex];
    const row   = container.createDiv({ cls: 'ffc-filter-row' });

    const labelInput = row.createEl('input', { cls: 'ffc-input ffc-input-label' });
    labelInput.type = 'text'; labelInput.placeholder = 'Label'; labelInput.value = field.label ?? '';
    labelInput.title = 'Display label shown in the creation dialog';
    labelInput.addEventListener('change', async () => { field.label = labelInput.value; await this.plugin.saveSettings(); });

    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type = 'text'; keyInput.placeholder = 'Frontmatter key'; keyInput.value = field.key ?? '';
    keyInput.title = 'The frontmatter property key written into the new file';
    keyInput.addEventListener('change', async () => { field.key = keyInput.value.trim(); await this.plugin.saveSettings(); });

    const typeSelect = row.createEl('select', { cls: 'ffc-select' });
    for (const t of [{ value: 'text', label: 'Text' }, { value: 'list', label: 'List' }]) {
      const opt = typeSelect.createEl('option', { text: t.label, value: t.value });
      if (field.type === t.value) opt.selected = true;
    }
    typeSelect.title = 'List splits comma-separated input into a YAML array';
    typeSelect.addEventListener('change', async () => { field.type = typeSelect.value; await this.plugin.saveSettings(); });

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.fields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }

  _renderPreviewField(container, fieldIndex) {
    const obj   = this.plugin.settings.objectTypes[this.index];
    const field = obj.previewFields[fieldIndex];
    const row   = container.createDiv({ cls: 'ffc-filter-row' });

    const labelInput = row.createEl('input', { cls: 'ffc-input ffc-input-label' });
    labelInput.type = 'text'; labelInput.placeholder = 'Display label'; labelInput.value = field.label ?? '';
    labelInput.title = 'Label shown in the preview card (leave blank to use the key name)';
    labelInput.addEventListener('change', async () => { field.label = labelInput.value; await this.plugin.saveSettings(); });

    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type = 'text'; keyInput.placeholder = 'Frontmatter key'; keyInput.value = field.key ?? '';
    keyInput.title = 'The frontmatter property key whose value will appear in the preview';
    keyInput.addEventListener('change', async () => {
      field.key = keyInput.value.trim();
      await this.plugin.saveSettings();
      this.plugin.buildStyledObjectSet();
      this.plugin.refreshObjectLinkStyles();
    });

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.previewFields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this.plugin.buildStyledObjectSet();
      this.plugin.refreshObjectLinkStyles();
      this._render();
    };
  }

  onClose() {
    this.contentEl.empty();
    if (this.onDismiss) this.onDismiss();
  }
}

// ─── Object Type Delete Confirmation Modal ────────────────────────────────────

class ObjectTypeDeleteModal extends obsidian.Modal {
  constructor(app, plugin, index, onDismiss) {
    super(app);
    this.plugin    = plugin;
    this.index     = index;
    this.onDismiss = onDismiss;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ffc-confirm-modal');
    const obj = this.plugin.settings.objectTypes[this.index];

    contentEl.createEl('h2', { text: 'Delete Object Type?' });
    contentEl.createEl('p', {
      text: `Are you sure you want to delete "${obj?.name || 'this object type'}"? This will remove it from your settings. Existing files will not be affected.`,
      cls: 'ffc-confirm-desc',
    });

    const btnRow = contentEl.createDiv({ cls: 'ffc-confirm-buttons' });

    btnRow.createEl('button', { text: 'Cancel', cls: 'ffc-btn-cancel' }).onclick = () => {
      this.close();
    };

    const deleteBtn = btnRow.createEl('button', { text: 'Delete', cls: 'ffc-btn-danger' });
    deleteBtn.onclick = async () => {
      this.plugin.settings.objectTypes.splice(this.index, 1);
      await this.plugin.saveSettings();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
    if (this.onDismiss) this.onDismiss();
  }
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class MyPluginSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ffc-settings');

    // ── Filtered File Commands ────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Filtered File Commands' });
    containerEl.createEl('p', {
      text: 'Each command opens a fuzzy file picker showing only files whose frontmatter properties match your filters.',
      cls: 'ffc-settings-desc',
    });

    for (let i = 0; i < this.plugin.settings.commands.length; i++) {
      this.renderCommand(containerEl, i);
    }

    new obsidian.Setting(containerEl).addButton((btn) =>
      btn.setButtonText('＋ Add New Command').setCta().onClick(async () => {
        const id = `ffc-command-${Date.now()}`;
        this.plugin.settings.commands.push({ id, name: 'New Filtered Command', matchMode: 'all', filters: [] });
        await this.plugin.saveSettings();
        this.plugin.registerFilterCommand(this.plugin.settings.commands[this.plugin.settings.commands.length - 1]);
        this.display();
      })
    );

    containerEl.createEl('hr', { cls: 'ffc-divider' });

    // ── General ───────────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'General' });
    containerEl.createEl('p', {
      text: 'Define object types to get "Create new …" commands in the palette. Optionally define fields that will be prompted at creation time and written into the new file\'s frontmatter.',
      cls: 'ffc-settings-desc',
    });

    new obsidian.Setting(containerEl)
      .setName('Trigger key')
      .setDesc('Character that opens the inline object picker while editing (e.g. "@"). Leave blank to disable. Changes take effect immediately.')
      .addText((text) =>
        text
          .setPlaceholder('e.g. @')
          .setValue(this.plugin.settings.triggerKey || '')
          .onChange(async (value) => {
            // Only allow a single character (or empty)
            const trimmed = value.trim().slice(0, 1);
            this.plugin.settings.triggerKey = trimmed;
            await this.plugin.saveSettings();
          })
      );

    new obsidian.Setting(containerEl)
      .setName('Templates folder')
      .setDesc('Path to your templates folder (e.g. "Templates"). Leave blank to auto-detect from the core Templates plugin.')
      .addText((text) =>
        text.setPlaceholder('Templates').setValue(this.plugin.settings.templatesFolder || '')
          .onChange(async (value) => {
            this.plugin.settings.templatesFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('hr', { cls: 'ffc-divider' });

    // ── Object Types ──────────────────────────────────────────────────────────
    const objTypesHeader = containerEl.createDiv({ cls: 'ffc-section-header' });
    objTypesHeader.createEl('h2', { text: 'Object Types', cls: 'ffc-section-header-title' });
    const addObjTypeBtn = objTypesHeader.createEl('button', { cls: 'clickable-icon ffc-btn-add', title: 'Add object type', attr: { 'aria-label': 'Add object type' } });
    obsidian.setIcon(addObjTypeBtn, 'plus');
    addObjTypeBtn.onclick = async () => {
      const id = `ffc-objtype-${Date.now()}`;
      const takenSlugs = new Set(this.plugin.settings.objectTypes.map((o) => o.commandSlug).filter(Boolean));
      const baseSlug = nameToCommandSlug('New Object');
      let newSlug = baseSlug; let slugN = 2;
      while (takenSlugs.has(newSlug)) newSlug = `${baseSlug}-${slugN++}`;
      this.plugin.settings.objectTypes.push({ id, commandSlug: newSlug, name: 'New Object', templatePath: '', saveFolder: '', fields: [], matchFilters: [], matchMode: 'all', enableFindCommand: false, showInTriggerMenu: false, previewFields: [] });
      await this.plugin.saveSettings();
      this.plugin.registerObjectTypeCommand(this.plugin.settings.objectTypes[this.plugin.settings.objectTypes.length - 1]);
      this.display();
    };

    const objTypesList = containerEl.createDiv({ cls: 'setting-group ffc-objtype-list' });
    if (this.plugin.settings.objectTypes.length === 0) {
      objTypesList.createEl('p', { text: 'No object types yet. Click + to add one.', cls: 'ffc-hint ffc-objtype-empty' });
    } else {
      for (let i = 0; i < this.plugin.settings.objectTypes.length; i++) {
        this.renderObjectTypeRow(objTypesList, i);
      }
    }

    this.injectStyles();
  }

  // ── Filtered command block ────────────────────────────────────────────────────

  renderCommand(containerEl, index) {
    const cmd = this.plugin.settings.commands[index];
    const block = containerEl.createDiv({ cls: 'ffc-command-block' });

    const header = block.createDiv({ cls: 'ffc-command-header' });
    header.createEl('span', { text: `Command ${index + 1}`, cls: 'ffc-command-label' });
    header.createEl('button', { text: '✕ Remove', cls: 'ffc-btn-danger' }).onclick = async () => {
      this.plugin.settings.commands.splice(index, 1);
      await this.plugin.saveSettings();
      this.display();
    };

    new obsidian.Setting(block).setName('Command name').setDesc('Shown in the command palette and hotkey settings.')
      .addText((text) => text.setPlaceholder('e.g. Show Active Projects').setValue(cmd.name)
        .onChange(async (value) => {
          cmd.name = value;
          await this.plugin.saveSettings();
          if (this.plugin.commandRefs?.[cmd.id]) this.plugin.commandRefs[cmd.id].name = value;
        })
      );

    new obsidian.Setting(block).setName('Filter match mode').setDesc('Should a file match ALL filters (AND) or at least ONE filter (OR)?')
      .addDropdown((dd) => dd.addOption('all', 'Match ALL filters (AND)').addOption('any', 'Match ANY filter (OR)')
        .setValue(cmd.matchMode)
        .onChange(async (value) => { cmd.matchMode = value; await this.plugin.saveSettings(); })
      );

    new obsidian.Setting(block).setName('File types').setDesc('Comma-separated extensions (e.g. md, canvas). Leave blank for markdown only.')
      .addText((text) => text.setPlaceholder('md, canvas').setValue(cmd.fileTypes || '')
        .onChange(async (value) => { cmd.fileTypes = value; await this.plugin.saveSettings(); })
      );

    const filtersSection = block.createDiv({ cls: 'ffc-filters-section' });
    filtersSection.createEl('p', { text: 'Frontmatter Filters', cls: 'ffc-filters-title' });
    if (cmd.filters.length === 0) {
      filtersSection.createEl('p', { text: 'No filters — all files of the specified type(s) will be shown.', cls: 'ffc-hint' });
    }
    for (let fi = 0; fi < cmd.filters.length; fi++) this.renderFilter(filtersSection, index, fi);
    new obsidian.Setting(filtersSection).addButton((btn) =>
      btn.setButtonText('＋ Add Filter').onClick(async () => {
        cmd.filters.push({ key: '', operator: 'equals', value: '' });
        await this.plugin.saveSettings();
        this.display();
      })
    );
  }

  renderFilter(container, cmdIndex, filterIndex) {
    const cmd = this.plugin.settings.commands[cmdIndex];
    const filter = cmd.filters[filterIndex];
    const row = container.createDiv({ cls: 'ffc-filter-row' });

    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type = 'text'; keyInput.placeholder = 'Property key'; keyInput.value = filter.key;
    keyInput.addEventListener('change', async () => { filter.key = keyInput.value.trim(); await this.plugin.saveSettings(); });

    const opSelect = row.createEl('select', { cls: 'ffc-select' });
    for (const op of [{ value: 'equals', label: '=' }, { value: 'not_equals', label: '≠' }, { value: 'contains', label: 'contains' }, { value: 'exists', label: 'exists' }]) {
      const opt = opSelect.createEl('option', { text: op.label, value: op.value });
      if (filter.operator === op.value) opt.selected = true;
    }
    opSelect.addEventListener('change', async () => { filter.operator = opSelect.value; await this.plugin.saveSettings(); this.display(); });

    if (filter.operator !== 'exists') {
      const valInput = row.createEl('input', { cls: 'ffc-input ffc-input-val' });
      valInput.type = 'text'; valInput.placeholder = 'Value'; valInput.value = filter.value;
      valInput.addEventListener('change', async () => { filter.value = valInput.value; await this.plugin.saveSettings(); });
    }

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      cmd.filters.splice(filterIndex, 1);
      await this.plugin.saveSettings();
      this.display();
    };
  }

  // ── Object type compact row (list view) ──────────────────────────────────────

  renderObjectTypeRow(containerEl, index) {
    const obj = this.plugin.settings.objectTypes[index];
    const row = containerEl.createDiv({ cls: 'ffc-objtype-row' });
    row.onclick = (e) => {
      // Only open modal if the click wasn't on an action button
      if (!e.target.closest('.ffc-objtype-row-actions')) {
        new ObjectTypeSettingsModal(this.app, this.plugin, index, () => this.display()).open();
      }
    };

    // Left: name + subtitle
    const info = row.createDiv({ cls: 'ffc-objtype-row-info' });
    info.createEl('div', { text: obj.name || 'Unnamed', cls: 'ffc-objtype-row-name' });
    if (obj.description) {
      info.createEl('div', { text: obj.description, cls: 'ffc-objtype-row-desc' });
    }

    // Right: action buttons
    const actions = row.createDiv({ cls: 'ffc-objtype-row-actions' });

    // Gear icon — opens settings modal
    const gearBtn = actions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit settings' } });
    obsidian.setIcon(gearBtn, 'settings');
    gearBtn.onclick = () => {
      new ObjectTypeSettingsModal(this.app, this.plugin, index, () => this.display()).open();
    };

    // Trash icon — delete with confirmation
    const trashBtn = actions.createEl('button', { cls: 'clickable-icon ffc-btn-icon-danger', attr: { 'aria-label': 'Delete object type' } });
    obsidian.setIcon(trashBtn, 'trash-2');
    trashBtn.onclick = () => {
      new ObjectTypeDeleteModal(this.app, this.plugin, index, () => this.display()).open();
    };
  }

  // ── Object type block ─────────────────────────────────────────────────────────

  renderObjectType(containerEl, index) {
    const obj = this.plugin.settings.objectTypes[index];
    const block = containerEl.createDiv({ cls: 'ffc-command-block' });

    const header = block.createDiv({ cls: 'ffc-command-header' });
    header.createEl('span', { text: `Object Type ${index + 1}`, cls: 'ffc-command-label ffc-objtype-label' });
    header.createEl('button', { text: '✕ Remove', cls: 'ffc-btn-danger' }).onclick = async () => {
      this.plugin.settings.objectTypes.splice(index, 1);
      await this.plugin.saveSettings();
      this.display();
    };

    // Name
    new obsidian.Setting(block).setName('Object name').setDesc('Creates a "Create new {name}" command in the palette.')
      .addText((text) => text.setPlaceholder('e.g. Task').setValue(obj.name)
        .onChange(async (value) => {
          obj.name = value;
          await this.plugin.saveSettings();
          const cmdId = `ffc-objtype-${obj.commandSlug}`;
          if (this.plugin.commandRefs?.[cmdId]) this.plugin.commandRefs[cmdId].name = `Create new ${value}`;
          const findCmdId = `${cmdId}-find`;
          if (this.plugin.commandRefs?.[findCmdId]) this.plugin.commandRefs[findCmdId].name = `Find ${value}`;
        })
      );
    if (obj.commandSlug !== nameToCommandSlug(obj.name)) {
      block.createEl('p', {
        text: `⚠ Command ID ("${obj.commandSlug}") was set when this type was first created and no longer matches the current name. Renaming only updates the display — to fix it, change "commandSlug" in data.json to "${nameToCommandSlug(obj.name)}" and rebind any shortcuts.`,
        cls: 'ffc-hint ffc-slug-warning',
      });
    }

    // ── Object Detection ──────────────────────────────────────────────────────
    const detectionSection = block.createDiv({ cls: 'ffc-filters-section' });
    detectionSection.createEl('p', { text: 'Object Detection', cls: 'ffc-filters-title' });
    detectionSection.createEl('p', {
      text: 'Filters that identify existing files of this type. Used by the trigger menu and the "Find" command. If no filters are set, files in the Save Folder are used as a fallback.',
      cls: 'ffc-hint',
    });

    new obsidian.Setting(detectionSection)
      .setName('Filter match mode')
      .setDesc('Should a file match ALL filters (AND) or at least ONE filter (OR)?')
      .addDropdown((dd) =>
        dd
          .addOption('all', 'Match ALL (AND)')
          .addOption('any', 'Match ANY (OR)')
          .setValue(obj.matchMode ?? 'all')
          .onChange(async (value) => { obj.matchMode = value; await this.plugin.saveSettings(); })
      );

    if (!obj.matchFilters || obj.matchFilters.length === 0) {
      detectionSection.createEl('p', { text: 'No filters — save folder will be used as a fallback.', cls: 'ffc-hint' });
    }
    for (let fi = 0; fi < (obj.matchFilters ?? []).length; fi++) {
      this.renderObjectMatchFilter(detectionSection, index, fi);
    }
    new obsidian.Setting(detectionSection).addButton((btn) =>
      btn.setButtonText('＋ Add Detection Filter').onClick(async () => {
        if (!obj.matchFilters) obj.matchFilters = [];
        obj.matchFilters.push({ key: '', operator: 'equals', value: '' });
        await this.plugin.saveSettings();
        this.display();
      })
    );

    new obsidian.Setting(detectionSection)
      .setName('Show in trigger menu')
      .setDesc(`When enabled, matching files appear in the "${this.plugin.settings.triggerKey || '@'}" inline trigger menu.`)
      .addToggle((toggle) =>
        toggle.setValue(obj.showInTriggerMenu ?? false)
          .onChange(async (value) => { obj.showInTriggerMenu = value; await this.plugin.saveSettings(); })
      );

    new obsidian.Setting(detectionSection)
      .setName('Enable "Find" command')
      .setDesc(`When enabled, adds a "Find ${obj.name}" command to the palette for fuzzy-searching files of this type.`)
      .addToggle((toggle) =>
        toggle.setValue(obj.enableFindCommand ?? false)
          .onChange(async (value) => {
            obj.enableFindCommand = value;
            await this.plugin.saveSettings();
            if (value) this.plugin.registerFindCommand(obj);
          })
      );

    new obsidian.Setting(detectionSection)
      .setName('Style object links')
      .setDesc('When enabled, inline links to files of this type will have their underline removed and a background fill applied (using tag style variables).')
      .addToggle((toggle) =>
        toggle.setValue(obj.styledLinks ?? false)
          .onChange(async (value) => {
            obj.styledLinks = value;
            await this.plugin.saveSettings();
            this.plugin.buildStyledObjectSet();
            this.plugin.refreshObjectLinkStyles();
          })
      );

    // Template picker
    const templateFiles = this.plugin.getTemplateFiles();
    if (templateFiles.length > 0) {
      new obsidian.Setting(block).setName('Template').setDesc('Template file applied when creating a new object of this type.')
        .addDropdown((dd) => {
          dd.addOption('', '— None —');
          for (const f of templateFiles) dd.addOption(f.path, f.basename);
          dd.setValue(obj.templatePath || '');
          dd.onChange(async (value) => { obj.templatePath = value; await this.plugin.saveSettings(); });
        });
    } else {
      new obsidian.Setting(block).setName('Template').setDesc('No templates found. Set the templates folder above, or check it contains .md files.')
        .addText((text) => text.setPlaceholder('path/to/template.md').setValue(obj.templatePath || '')
          .onChange(async (value) => { obj.templatePath = value.trim(); await this.plugin.saveSettings(); })
        );
    }

    // Save folder
    new obsidian.Setting(block).setName('Save folder').setDesc('Where new files are created (e.g. "Projects/Tasks"). Leave blank for vault root.')
      .addText((text) => text.setPlaceholder('e.g. Projects/Tasks').setValue(obj.saveFolder || '')
        .onChange(async (value) => { obj.saveFolder = value.trim(); await this.plugin.saveSettings(); })
      );

    // ── Creation Fields ───────────────────────────────────────────────────────
    const fieldsSection = block.createDiv({ cls: 'ffc-filters-section' });
    fieldsSection.createEl('p', { text: 'Creation Fields', cls: 'ffc-filters-title' });
    fieldsSection.createEl('p', {
      text: 'Fields shown in the creation dialog. Values are written into the new file\'s frontmatter.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.fields ?? []).length; fi++) {
      this.renderObjectField(fieldsSection, index, fi);
    }

    new obsidian.Setting(fieldsSection).addButton((btn) =>
      btn.setButtonText('＋ Add Field').onClick(async () => {
        if (!obj.fields) obj.fields = [];
        obj.fields.push({ key: '', label: '', type: 'text' });
        await this.plugin.saveSettings();
        this.display();
      })
    );

    // ── Preview Fields ────────────────────────────────────────────────────────
    const previewSection = block.createDiv({ cls: 'ffc-filters-section' });
    previewSection.createEl('p', { text: 'Preview Fields', cls: 'ffc-filters-title' });
    previewSection.createEl('p', {
      text: 'Frontmatter keys shown when hovering over a link to an object of this type. The title is always shown; these fields appear below it.',
      cls: 'ffc-hint',
    });

    for (let fi = 0; fi < (obj.previewFields ?? []).length; fi++) {
      this.renderPreviewField(previewSection, index, fi);
    }

    new obsidian.Setting(previewSection).addButton((btn) =>
      btn.setButtonText('＋ Add Preview Field').onClick(async () => {
        if (!obj.previewFields) obj.previewFields = [];
        obj.previewFields.push({ key: '', label: '' });
        await this.plugin.saveSettings();
        this.display();
      })
    );
  }

  renderObjectMatchFilter(container, objIndex, filterIndex) {
    const obj = this.plugin.settings.objectTypes[objIndex];
    const filter = obj.matchFilters[filterIndex];
    const row = container.createDiv({ cls: 'ffc-filter-row' });

    const isPathOp = filter.operator === 'in_folder' || filter.operator === 'not_in_folder';

    // Key input — hidden for path-based operators (path is the implicit "key")
    if (!isPathOp) {
      const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
      keyInput.type = 'text'; keyInput.placeholder = 'Property key'; keyInput.value = filter.key ?? '';
      keyInput.addEventListener('change', async () => { filter.key = keyInput.value.trim(); await this.plugin.saveSettings(); });
    }

    const opSelect = row.createEl('select', { cls: 'ffc-select' });
    for (const op of [
      { value: 'equals',       label: '=' },
      { value: 'not_equals',   label: '≠' },
      { value: 'contains',     label: 'contains' },
      { value: 'exists',       label: 'exists' },
      { value: 'in_folder',    label: 'in folder' },
      { value: 'not_in_folder',label: 'not in folder' },
    ]) {
      const opt = opSelect.createEl('option', { text: op.label, value: op.value });
      if (filter.operator === op.value) opt.selected = true;
    }
    opSelect.addEventListener('change', async () => { filter.operator = opSelect.value; await this.plugin.saveSettings(); this.display(); });

    const needsValue = filter.operator !== 'exists';
    if (needsValue) {
      const valInput = row.createEl('input', { cls: 'ffc-input ffc-input-val' });
      valInput.type = 'text';
      valInput.placeholder = isPathOp ? 'Folder path (e.g. Templates)' : 'Value';
      valInput.value = filter.value ?? '';
      valInput.addEventListener('change', async () => { filter.value = valInput.value; await this.plugin.saveSettings(); });
    }

    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.matchFilters.splice(filterIndex, 1);
      await this.plugin.saveSettings();
      this.display();
    };
  }

  renderObjectField(container, objIndex, fieldIndex) {
    const obj = this.plugin.settings.objectTypes[objIndex];
    const field = obj.fields[fieldIndex];
    const row = container.createDiv({ cls: 'ffc-filter-row' });

    // Label
    const labelInput = row.createEl('input', { cls: 'ffc-input ffc-input-label' });
    labelInput.type = 'text'; labelInput.placeholder = 'Label'; labelInput.value = field.label ?? '';
    labelInput.title = 'Display label shown in the creation dialog';
    labelInput.addEventListener('change', async () => { field.label = labelInput.value; await this.plugin.saveSettings(); });

    // Key
    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type = 'text'; keyInput.placeholder = 'Frontmatter key'; keyInput.value = field.key ?? '';
    keyInput.title = 'The frontmatter property key written into the new file';
    keyInput.addEventListener('change', async () => { field.key = keyInput.value.trim(); await this.plugin.saveSettings(); });

    // Type dropdown
    const typeSelect = row.createEl('select', { cls: 'ffc-select' });
    for (const t of [{ value: 'text', label: 'Text' }, { value: 'list', label: 'List' }]) {
      const opt = typeSelect.createEl('option', { text: t.label, value: t.value });
      if (field.type === t.value) opt.selected = true;
    }
    typeSelect.title = 'List splits comma-separated input into a YAML array';
    typeSelect.addEventListener('change', async () => { field.type = typeSelect.value; await this.plugin.saveSettings(); });

    // Remove
    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.fields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this.display();
    };
  }

  renderPreviewField(container, objIndex, fieldIndex) {
    const obj   = this.plugin.settings.objectTypes[objIndex];
    const field = obj.previewFields[fieldIndex];
    const row   = container.createDiv({ cls: 'ffc-filter-row' });

    // Display label (optional — falls back to key if blank)
    const labelInput = row.createEl('input', { cls: 'ffc-input ffc-input-label' });
    labelInput.type        = 'text';
    labelInput.placeholder = 'Display label';
    labelInput.value       = field.label ?? '';
    labelInput.title       = 'Label shown in the preview card (leave blank to use the key name)';
    labelInput.addEventListener('change', async () => {
      field.label = labelInput.value;
      await this.plugin.saveSettings();
    });

    // Frontmatter key
    const keyInput = row.createEl('input', { cls: 'ffc-input ffc-input-key' });
    keyInput.type        = 'text';
    keyInput.placeholder = 'Frontmatter key';
    keyInput.value       = field.key ?? '';
    keyInput.title       = 'The frontmatter property key whose value will appear in the preview';
    keyInput.addEventListener('change', async () => {
      field.key = keyInput.value.trim();
      await this.plugin.saveSettings();
      this.plugin.buildStyledObjectSet();
      this.plugin.refreshObjectLinkStyles();
    });

    // Remove
    row.createEl('button', { text: '✕', cls: 'ffc-btn-remove' }).onclick = async () => {
      obj.previewFields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this.plugin.buildStyledObjectSet();
      this.plugin.refreshObjectLinkStyles();
      this.display();
    };
  }

  // ── Styles ───────────────────────────────────────────────────────────────────

  injectStyles() {
    const styleId = 'ffc-inline-styles';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      .ffc-settings-desc { color: var(--text-muted); margin-bottom: 1.5em; line-height: 1.5; }
      .ffc-divider { border: none; border-top: 1px solid var(--background-modifier-border); margin: 2em 0; }

      .ffc-command-block {
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px; padding: 16px; margin-bottom: 20px;
        background: var(--background-secondary);
      }
      .ffc-command-header {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
      }
      .ffc-command-label { font-weight: 600; font-size: 1em; color: var(--text-accent); }
      .ffc-objtype-label { color: var(--color-green); }

      .ffc-btn-danger {
        background: var(--color-red); color: white; border: none;
        border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 0.8em;
      }
      .ffc-filters-section {
        margin-top: 12px; padding-top: 12px;
        border-top: 1px solid var(--background-modifier-border);
      }
      .ffc-filters-title {
        font-weight: 600; margin-bottom: 4px; font-size: 0.85em;
        color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em;
      }
      .ffc-hint { color: var(--text-muted); font-style: italic; font-size: 0.85em; margin-bottom: 8px; }
      .ffc-filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }

      .ffc-input {
        background: var(--background-primary); border: 1px solid var(--background-modifier-border);
        border-radius: 4px; padding: 5px 8px; color: var(--text-normal); font-size: 0.9em; outline: none;
      }
      .ffc-input:focus { border-color: var(--interactive-accent); box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb), 0.2); }
      .ffc-input-key   { width: 140px; }
      .ffc-input-val   { width: 150px; }
      .ffc-input-label { width: 110px; }

      .ffc-select {
        background: var(--background-primary); border: 1px solid var(--background-modifier-border);
        border-radius: 4px; padding: 5px 6px; color: var(--text-normal); font-size: 0.9em; cursor: pointer;
      }
      .ffc-btn-remove {
        background: transparent; border: 1px solid var(--background-modifier-border);
        border-radius: 4px; color: var(--text-muted); cursor: pointer;
        padding: 4px 8px; font-size: 0.85em; line-height: 1; transition: color 0.1s, border-color 0.1s;
      }
      .ffc-btn-remove:hover { color: var(--color-red); border-color: var(--color-red); }

      /* Section header with + button */
      .ffc-section-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 0.5em;
      }
      .ffc-section-header-title { margin: 0; }

      /* Danger variant for trash icon */
      .ffc-btn-icon-danger:hover { color: var(--color-red) !important; }

      /* Object types list — uses Obsidian's setting-group card + plugin-list row pattern */
      .ffc-objtype-list {
        background: var(--setting-items-background);
        border-radius: var(--radius-m);
        padding: 0 18px;
        margin-bottom: 16px;
      }
      .ffc-objtype-empty { color: var(--text-muted); font-style: italic; font-size: 0.9em; padding: 4px 0; }
      .ffc-objtype-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 0; cursor: pointer;
      }
      .ffc-objtype-row + .ffc-objtype-row { border-top: 1px solid var(--background-modifier-border); }
      .ffc-objtype-row-info { flex: 1; min-width: 0; }
      .ffc-objtype-row-name {
        font-size: var(--font-ui-medium); font-weight: var(--font-semibold);
        color: var(--text-normal); margin-bottom: 2px;
      }
      .ffc-objtype-row-desc { font-size: var(--font-ui-small); color: var(--text-muted); }
      .ffc-objtype-row-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; margin-left: 12px; }

      /* Object type settings modal */
      .ffc-objtype-modal { padding: 4px 8px 16px; max-width: 640px; }
      .ffc-modal-title { margin-bottom: 16px; }

      /* Delete confirmation modal */
      .ffc-confirm-modal { padding: 8px; }
      .ffc-confirm-desc { color: var(--text-muted); margin: 12px 0 24px; line-height: 1.5; }
      .ffc-confirm-buttons { display: flex; gap: 8px; justify-content: flex-end; }
      .ffc-btn-cancel {
        background: var(--interactive-normal); border: 1px solid var(--background-modifier-border);
        border-radius: 4px; color: var(--text-normal); cursor: pointer; padding: 6px 14px; font-size: 0.9em;
      }
      .ffc-btn-cancel:hover { background: var(--interactive-hover); }

      /* New object modal */
      .ffc-new-object-modal { padding: 8px; }
      .ffc-new-object-modal h2 { margin-bottom: 16px; }

      /* Suggestion items */
      .ffc-suggestion { display: flex; flex-direction: column; gap: 2px; padding: 2px 0; }
      .ffc-suggestion-name { font-size: 0.95em; color: var(--text-normal); }
      .ffc-suggestion-path { font-size: 0.78em; color: var(--text-muted); }
    `;
  }
}

// ─── Object Preview Popup ─────────────────────────────────────────────────────
//
// Shows a Linear-style hover card when the user hovers over an object link
// (any link whose target matches an object type that has previewFields set).
// Works in both reading mode (<a class="internal-link">) and live-preview
// (CM6 decorated spans).

class ObjectPreviewPopup {
  constructor(plugin) {
    this.plugin    = plugin;
    this.popup     = null;
    this.hideTimer = null;
    this.showTimer = null;

    this._onMouseOver = this._handleMouseOver.bind(this);
    this._onMouseOut  = this._handleMouseOut.bind(this);
    document.addEventListener('mouseover', this._onMouseOver, true);
    document.addEventListener('mouseout',  this._onMouseOut,  true);
  }

  // ── Mouse event handlers ──────────────────────────────────────────────────────

  _handleMouseOver(e) {
    const el = e.target;
    let linkpath = null;

    // Reading mode: <a class="internal-link" data-href="filename">
    const anchor = el.matches('a.internal-link[data-href]')
      ? el
      : el.closest('a.internal-link[data-href]');
    if (anchor) {
      linkpath = anchor.getAttribute('data-href').split('#')[0].trim();
    }

    // Live-preview mode: <span class="cm-hmd-internal-link">filename</span>
    // No data-href — the text content IS the link target.
    if (!linkpath) {
      const cmSpan = el.classList.contains('cm-hmd-internal-link')
        ? el
        : el.closest('.cm-hmd-internal-link');
      if (cmSpan) {
        // Strip [[ ]] visible when cursor is on the raw wikilink; drop alias after |
        linkpath = (cmSpan.textContent ?? '')
          .replace(/^\[\[/, '').replace(/\]\]$/, '')
          .split('|')[0].split('#')[0].trim();
      }
    }

    if (!linkpath) return;

    // Use Obsidian's resolver — handles short names, paths, and aliases
    const file = this.plugin.app.metadataCache.getFirstLinkpathDest(linkpath, '');
    if (!file) return;

    const objType = this._getObjectTypeForFile(file);
    if (!objType) return;

    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => {
      this._showForFile(file, objType, e.clientX, e.clientY);
    }, 280);
  }

  _handleMouseOut(e) {
    clearTimeout(this.showTimer);
    // Keep popup alive if the mouse moves into the popup itself
    const toEl = e.relatedTarget;
    if (this.popup && this.popup.contains(toEl)) return;
    this.hideTimer = setTimeout(() => this.hide(), 200);
  }

  // ── Build and position the popup ──────────────────────────────────────────────

  async _showForFile(file, objType, clientX, clientY) {
    if (!objType.previewFields?.length) return;

    const app = this.plugin.app;

    // Get frontmatter
    const fm    = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const title = fm.title ? String(fm.title) : file.basename;

    // Tear down any existing popup
    this.hide();

    const popup = document.createElement('div');
    popup.className = 'ffc-preview-popup';

    // Title row
    const header = popup.createDiv({ cls: 'ffc-preview-header' });
    header.createEl('span', { text: title, cls: 'ffc-preview-title' });

    popup.createEl('hr', { cls: 'ffc-preview-divider' });

    // Frontmatter field rows
    const body    = popup.createDiv({ cls: 'ffc-preview-body' });
    let   hasRows = false;
    for (const pf of objType.previewFields) {
      const key   = typeof pf === 'string' ? pf : (pf.key ?? '');
      const label = (typeof pf === 'string' ? pf : (pf.label || pf.key)) || key;
      if (!key) continue;
      const raw = fm[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const displayVal = Array.isArray(raw)
        ? raw.map(String).join(', ')
        : String(raw);

      const row = body.createDiv({ cls: 'ffc-preview-row' });
      row.createEl('span', { text: label, cls: 'ffc-preview-label' });
      row.createEl('span', { text: displayVal, cls: 'ffc-preview-value' });
      hasRows = true;
    }

    // Nothing to show below the title → still show title-only card
    if (!hasRows) {
      body.remove();
      popup.querySelector('.ffc-preview-divider')?.remove();
    }

    document.body.appendChild(popup);
    this.popup = popup;

    // Keep popup alive while mouse is over it
    popup.addEventListener('mouseenter', () => clearTimeout(this.hideTimer));
    popup.addEventListener('mouseleave', () => {
      this.hideTimer = setTimeout(() => this.hide(), 200);
    });

    // Smart positioning: prefer bottom-right of cursor, flip if near edges
    const margin = 12;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;
    const pw     = popup.offsetWidth  || 280;
    const ph     = popup.offsetHeight || 120;
    let   left   = clientX + margin;
    let   top    = clientY + margin;
    if (left + pw > vw - margin) left = clientX - pw - margin;
    if (top  + ph > vh - margin) top  = clientY - ph - margin;
    popup.style.left = `${Math.max(margin, left)}px`;
    popup.style.top  = `${Math.max(margin, top)}px`;
  }

  _getObjectTypeForFile(file) {
    for (const objType of this.plugin.settings.objectTypes) {
      if (!(objType.previewFields?.length)) continue;
      const files = this.plugin.getObjectTypeFiles(objType);
      if (files.some((f) => f.path === file.path)) return objType;
    }
    return null;
  }

  // ── Public ────────────────────────────────────────────────────────────────────

  hide() {
    if (this.popup) { this.popup.remove(); this.popup = null; }
  }

  destroy() {
    this.hide();
    clearTimeout(this.hideTimer);
    clearTimeout(this.showTimer);
    document.removeEventListener('mouseover', this._onMouseOver, true);
    document.removeEventListener('mouseout',  this._onMouseOut,  true);
  }
}

// ─── Object Type Inline Suggest ───────────────────────────────────────────────
//
// Watches the editor for the user-configured trigger key (e.g. "@") and opens
// a fuzzy suggestion menu populated by all files that match any object type's
// match filters. Selecting an item inserts a [[wikilink]] at the cursor.

class ObjectTypeSuggest extends obsidian.EditorSuggest {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onTrigger(cursor, editor /*, file */) {
    const triggerKey = this.plugin.settings.triggerKey;
    if (!triggerKey) return null;

    const line = editor.getLine(cursor.line);
    const sub = line.substring(0, cursor.ch);

    // Find the last occurrence of the trigger key on this line
    const triggerIndex = sub.lastIndexOf(triggerKey);
    if (triggerIndex === -1) return null;

    // If there's already a space after the trigger key (but not right after it)
    // that contains a space in the middle, the user has likely moved on — don't
    // re-trigger. Allow spaces within the query for multi-word file names.
    const query = sub.substring(triggerIndex + triggerKey.length);

    // Don't fire inside an existing wikilink (after "[[")
    const beforeTrigger = sub.substring(0, triggerIndex);
    if (beforeTrigger.includes('[[') && !beforeTrigger.includes(']]')) return null;

    return {
      start: { line: cursor.line, ch: triggerIndex },
      end: cursor,
      query,
    };
  }

  getSuggestions(context) {
    const query = context.query.toLowerCase();
    const files = this._getMatchingFiles();
    return files
      .map((file) => {
        const cache = this.app.metadataCache.getFileCache(file);
        const title = cache?.frontmatter?.title ? String(cache.frontmatter.title) : file.basename;
        return { file, title };
      })
      .filter(({ title }) => title.toLowerCase().includes(query))
      .sort((a, b) => {
        // Prefer results that start with the query
        const aStarts = a.title.toLowerCase().startsWith(query) ? 0 : 1;
        const bStarts = b.title.toLowerCase().startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.title.localeCompare(b.title);
      })
      .slice(0, 30);
  }

  /** Collect all files matching object types that have showInTriggerMenu enabled. */
  _getMatchingFiles() {
    const plugin = this.plugin;
    const seen = new Set();
    const result = [];

    for (const objType of plugin.settings.objectTypes) {
      if (!objType.showInTriggerMenu) continue;
      for (const file of plugin.getObjectTypeFiles(objType)) {
        if (!seen.has(file.path)) {
          seen.add(file.path);
          result.push(file);
        }
      }
    }

    return result;
  }

  renderSuggestion({ file, title }, el) {
    const wrapper = el.createDiv({ cls: 'ffc-suggestion' });
    wrapper.createEl('span', { text: title, cls: 'ffc-suggestion-name' });
    const folder = file.parent?.path;
    if (folder && folder !== '/') {
      wrapper.createEl('span', { text: folder, cls: 'ffc-suggestion-path' });
    }
  }

  selectSuggestion({ file, title }, _evt) {
    const context = this.context;
    if (!context) return;

    // Replace the trigger key + query with a wikilink.
    // Use display text only when the title differs from the filename (e.g. a
    // frontmatter title is set), so the link stays clean in the common case.
    const link = title !== file.basename
      ? `[[${file.basename}|${title}]]`
      : `[[${file.basename}]]`;

    context.editor.replaceRange(link, context.start, context.end);
  }
}

// ─── Object Link View Plugin (CM6 live-preview decoration) ───────────────────
//
// Scans the CM6 document for wikilinks whose targets are detected objects with
// styledLinks enabled, and marks those ranges with the `ffc-obj-link` class so
// CSS can remove the underline and add a background fill.

function buildObjectLinkViewPlugin(ffcPlugin) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) { this.decorations = this.build(view); }

      update(update) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = this.build(update.view);
        }
      }

      build(view) {
        const basenames        = ffcPlugin.styledObjectBasenames;
        const previewBasenames = ffcPlugin.previewObjectBasenames;
        const hasStyled  = basenames        && basenames.size > 0;
        const hasPreview = previewBasenames && previewBasenames.size > 0;
        if (!hasStyled && !hasPreview) return Decoration.none;
        const builder = new RangeSetBuilder();
        const text = view.state.doc.toString();
        // Matches [[Target]], [[Target|Alias]], [[Target#Heading]], etc.
        const re = /\[\[([^\]|#\n]+)(?:[|#][^\]\n]*)?\]\]/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          const target = m[1].trim();
          const targetBasename = target.includes('/') ? target.split('/').pop() : target;
          const isStyled  = hasStyled  && (basenames.has(target)        || basenames.has(targetBasename));
          const isPreview = hasPreview && (previewBasenames.has(target)  || previewBasenames.has(targetBasename));
          if (isStyled || isPreview) {
            const cls = [isStyled ? 'ffc-obj-link' : '', isPreview ? 'ffc-obj-preview-link' : ''].filter(Boolean).join(' ');
            builder.add(m.index, m.index + m[0].length, Decoration.mark({ class: cls }));
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class FilteredFileCommandsPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.commandRefs = {};
    this.registeredCommandIds = new Set();

    this.addSettingTab(new MyPluginSettingTab(this.app, this));

    for (const cmd of this.settings.commands) this.registerFilterCommand(cmd);
    for (const obj of this.settings.objectTypes) {
      this.registerObjectTypeCommand(obj);
      if (obj.enableFindCommand) this.registerFindCommand(obj);
    }
    this.registerNewObjectCommand();

    // Register the inline trigger-key suggest
    this.objectTypeSuggest = new ObjectTypeSuggest(this.app, this);
    this.registerEditorSuggest(this.objectTypeSuggest);

    // ── Object link styling ───────────────────────────────────────────────────
    this.styledObjectBasenames  = new Set();
    this.styledObjectPaths      = new Set();
    this.previewObjectBasenames = new Set();
    this.previewObjectPaths     = new Set();
    this.buildStyledObjectSet();
    this.injectLinkStyles();
    this.register(() => document.getElementById('ffc-link-styles')?.remove());

    // Hover preview popup
    this.previewPopup = new ObjectPreviewPopup(this);
    this.register(() => this.previewPopup.destroy());

    // Reading mode: mark rendered <a class="internal-link"> elements
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll('a.internal-link[data-href]').forEach((link) => {
        const href     = link.getAttribute('data-href').split('#')[0].trim();
        const basename = href.includes('/') ? href.split('/').pop() : href;
        if (this.styledObjectBasenames.has(href) || this.styledObjectBasenames.has(basename)) {
          link.classList.add('ffc-obj-link');
        }
        if (this.previewObjectBasenames.has(href) || this.previewObjectBasenames.has(basename)) {
          link.classList.add('ffc-obj-preview-link');
        }
      });
    });

    // Live preview: CM6 decoration for wikilinks in source/live-preview mode
    this.registerEditorExtension(buildObjectLinkViewPlugin(this));

    // Rebuild whenever the metadata cache settles (new files, frontmatter edits, etc.)
    this.registerEvent(
      this.app.metadataCache.on('resolved', () => {
        this.buildStyledObjectSet();
        this.refreshObjectLinkStyles();
      })
    );
  }

  // ── Filtered file commands ────────────────────────────────────────────────────

  registerFilterCommand(cmd) {
    if (this.registeredCommandIds.has(cmd.id)) return;
    const registered = this.addCommand({
      id: cmd.id,
      name: cmd.name,
      callback: () => {
        const current = this.settings.commands.find((c) => c.id === cmd.id);
        if (!current) { new obsidian.Notice('Objects: Command not found. Try reloading.'); return; }
        const files = this.getFilteredFiles(current);
        if (files.length === 0) { new obsidian.Notice('Objects: No files match the current filters.'); return; }
        new FilteredFileModal(this.app, files).open();
      },
    });
    this.commandRefs[cmd.id] = registered;
    this.registeredCommandIds.add(cmd.id);
  }

  getFilteredFiles(cmd) {
    const fileTypes = (cmd.fileTypes || '').split(',').map((e) => e.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
    let allFiles = fileTypes.length > 0
      ? this.app.vault.getFiles().filter((f) => fileTypes.includes(f.extension.toLowerCase()))
      : this.app.vault.getMarkdownFiles();
    if (!cmd.filters || cmd.filters.length === 0) return allFiles;
    return allFiles.filter((file) => {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const results = cmd.filters.map((f) => this.evaluateFilter(fm, f, file));
      return cmd.matchMode === 'all' ? results.every(Boolean) : results.some(Boolean);
    });
  }

  /** Return all vault files that match a single object type's detection filters. */
  getObjectTypeFiles(obj) {
    const filters = obj.matchFilters ?? [];
    const matchMode = obj.matchMode ?? 'all';
    const allFiles = this.app.vault.getMarkdownFiles();
    return allFiles.filter((file) => {
      if (filters.length > 0) {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
        const results = filters.map((f) => this.evaluateFilter(fm, f, file));
        return matchMode === 'all' ? results.every(Boolean) : results.some(Boolean);
      } else if (obj.saveFolder?.trim()) {
        const prefix = obj.saveFolder.trim().replace(/\/$/, '') + '/';
        return file.path.startsWith(prefix);
      }
      return false;
    });
  }

  evaluateFilter(fm, filter, file) {
    const { key, operator, value } = filter;

    // Path-based operators — work on the file path, not frontmatter
    if (operator === 'in_folder' || operator === 'not_in_folder') {
      if (!file) return true;
      const folder = value.trim().replace(/\/$/, '');
      const inFolder = file.path.startsWith(folder + '/') || file.path === folder;
      return operator === 'in_folder' ? inFolder : !inFolder;
    }

    if (!key?.trim()) return true;
    const raw = fm[key];
    switch (operator) {
      case 'exists':     return raw !== undefined && raw !== null && raw !== '';
      case 'equals':     return Array.isArray(raw) ? raw.map(String).includes(value) : String(raw ?? '') === value;
      case 'not_equals': return Array.isArray(raw) ? !raw.map(String).includes(value) : String(raw ?? '') !== value;
      case 'contains':   return Array.isArray(raw) ? raw.some((v) => String(v).toLowerCase().includes(value.toLowerCase())) : String(raw ?? '').toLowerCase().includes(value.toLowerCase());
      default: return true;
    }
  }

  // ── Object type commands ──────────────────────────────────────────────────────

  registerObjectTypeCommand(obj) {
    const cmdId = `ffc-objtype-${obj.commandSlug}`;
    if (this.registeredCommandIds.has(cmdId)) return;
    const registered = this.addCommand({
      id: cmdId,
      name: `Create new ${obj.name}`,
      callback: () => {
        const current = this.settings.objectTypes.find((o) => o.id === obj.id);
        if (!current) { new obsidian.Notice('Object type not found. Try reloading.'); return; }
        new NewObjectModal(this.app, current, (title, fieldValues) => this.createObject(current, title, fieldValues)).open();
      },
    });
    this.commandRefs[cmdId] = registered;
    this.registeredCommandIds.add(cmdId);
  }

  registerFindCommand(obj) {
    const cmdId = `ffc-objtype-${obj.commandSlug}-find`;
    if (this.registeredCommandIds.has(cmdId)) return;
    const registered = this.addCommand({
      id: cmdId,
      name: `Find ${obj.name}`,
      callback: () => {
        const current = this.settings.objectTypes.find((o) => o.id === obj.id);
        if (!current) { new obsidian.Notice('Objects: Object type not found. Try reloading.'); return; }
        const files = this.getObjectTypeFiles(current);
        if (files.length === 0) { new obsidian.Notice('Objects: No files match this object type.'); return; }
        new FilteredFileModal(this.app, files, current.name).open();
      },
    });
    this.commandRefs[cmdId] = registered;
    this.registeredCommandIds.add(cmdId);
  }

  registerNewObjectCommand() {
    this.addCommand({
      id: 'ffc-new-object',
      name: 'New object',
      callback: () => {
        const types = this.settings.objectTypes;
        if (types.length === 0) {
          new obsidian.Notice('No object types defined. Add one in the Objects settings.');
          return;
        }
        if (types.length === 1) {
          new NewObjectModal(this.app, types[0], (title, fv) => this.createObject(types[0], title, fv)).open();
          return;
        }
        new CombinedNewObjectModal(this.app, types, (objType, title, fv) => this.createObject(objType, title, fv)).open();
      },
    });
  }

  // ── File creation ─────────────────────────────────────────────────────────────

  async createObject(objType, title, fieldValues = {}) {
    const saveFolder = objType.saveFolder?.trim() ?? '';
    const filePath = saveFolder ? `${saveFolder}/${title}.md` : `${title}.md`;

    if (this.app.vault.getAbstractFileByPath(filePath)) {
      new obsidian.Notice(`A file named "${title}" already exists at that location.`);
      return;
    }

    // Read template
    let content = '';
    if (objType.templatePath) {
      const tplFile = this.app.vault.getAbstractFileByPath(objType.templatePath);
      if (tplFile instanceof obsidian.TFile) {
        content = await this.app.vault.read(tplFile);
      } else {
        new obsidian.Notice(`Template not found: ${objType.templatePath}`);
      }
    }

    // Standard template variable substitution
    const now = new Date();
    content = content
      .replace(/\{\{title\}\}/gi, title)
      .replace(/\{\{date\}\}/gi, now.toISOString().split('T')[0])
      .replace(/\{\{time\}\}/gi, now.toTimeString().split(' ')[0]);

    // Inject user-provided field values into frontmatter
    content = this.injectFieldsIntoContent(content, objType, fieldValues);

    // Ensure save folder exists
    if (saveFolder && !this.app.vault.getAbstractFileByPath(saveFolder)) {
      try { await this.app.vault.createFolder(saveFolder); } catch { /* race: already exists */ }
    }

    try {
      const newFile = await this.app.vault.create(filePath, content);
      await this.app.workspace.getLeaf(false).openFile(newFile);
      new obsidian.Notice(`Created: ${title}`);
    } catch (err) {
      new obsidian.Notice(`Failed to create file: ${err.message}`);
    }
  }

  /**
   * Injects user-provided field values into the content's YAML frontmatter.
   * If the key already exists in the template's frontmatter the values are
   * merged rather than duplicated, so tags/lists accumulate correctly.
   */
  injectFieldsIntoContent(content, objType, fieldValues) {
    const fields = (objType.fields ?? []).filter((f) => f.key?.trim());
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

  /**
   * Build a regex that matches a frontmatter key and ALL of its value lines —
   * whether inline `key: [a, b]`, plain scalar `key: value`, empty `key:`,
   * or a block list `key:\n  - a\n  - b`.
   * Handles both LF and CRLF line endings.
   */
  keyBlockRegex(esc) {
    // Matches the key line (anything up to but not including \n),
    // then greedily captures every following line that starts with two spaces.
    return new RegExp(`^${esc}:[^\\n]*((?:\\r?\\n  - [^\\r\\n]*)*)`, 'm');
  }

  /** Add `newItems` to a list key, merging with any existing values. */
  upsertListInFrontmatter(content, key, newItems) {
    if (!newItems.length) return content;
    content = this.ensureFrontmatter(content);
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Inline array:  key: [a, b]  — handle separately as it needs different merge logic
    const inlineRe = new RegExp(`(^${esc}:\\s*\\[)([^\\]]*)(\\])`, 'm');
    if (inlineRe.test(content)) {
      return content.replace(inlineRe, (_, open, body, close) => {
        const existing = body.split(',').map((s) => s.trim()).filter(Boolean);
        const merged = [...new Set([...existing, ...newItems])];
        return `${open}${merged.join(', ')}${close}`;
      });
    }

    // Block list, plain scalar, or empty key — use the unified key-block regex
    // so the entire key + any orphan-prone sub-lines are replaced atomically.
    const blockRe = this.keyBlockRegex(esc);
    const m = content.match(blockRe);
    if (m) {
      const blockPart = m[1]; // the "\n  - item" section (may be empty string)
      let existing = [];
      if (blockPart.trim()) {
        existing = [...blockPart.matchAll(/- ([^\r\n]+)/g)].map((x) => x[1].trim());
      } else {
        // Plain scalar: grab the value after "key: "
        const scalarVal = m[0].replace(new RegExp(`^${esc}:\\s*`), '').trim();
        if (scalarVal) existing = [scalarVal];
      }
      const merged = [...new Set([...existing, ...newItems])];
      const replacement = `${key}:\n` + merged.map((i) => `  - ${i}`).join('\n');
      return content.replace(blockRe, replacement);
    }

    // Key absent — inject as inline list
    return content.replace(/^(---\r?\n)/, `$1${key}: [${newItems.join(', ')}]\n`);
  }

  /** Set a text key, replacing any existing value (and any orphan block lines). */
  upsertTextInFrontmatter(content, key, value) {
    content = this.ensureFrontmatter(content);
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use the unified key-block regex so block-list sub-lines are replaced too
    const blockRe = this.keyBlockRegex(esc);
    if (blockRe.test(content)) {
      return content.replace(blockRe, `${key}: ${value}`);
    }
    return content.replace(/^(---\r?\n)/, `$1${key}: ${value}\n`);
  }

  /** If there's no frontmatter block yet, prepend an empty one. */
  ensureFrontmatter(content) {
    if (/^---\r?\n/.test(content)) return content;
    return `---\n---\n\n${content}`;
  }

  // ── Template helpers ──────────────────────────────────────────────────────────

  getTemplatesFolder() {
    if (this.settings.templatesFolder) return this.settings.templatesFolder;
    try {
      const core = this.app.internalPlugins?.plugins?.['templates'];
      if (core?.enabled) return core.instance?.options?.folder ?? '';
    } catch { /* ignore */ }
    return '';
  }

  getTemplateFiles() {
    const folder = this.getTemplatesFolder();
    const allMd = this.app.vault.getMarkdownFiles();
    if (!folder) return allMd;
    const prefix = folder.endsWith('/') ? folder : folder + '/';
    return allMd.filter((f) => f.path.startsWith(prefix));
  }

  // ── Persistence ───────────────────────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.objectTypes) this.settings.objectTypes = [];
    if (this.settings.templatesFolder === undefined) this.settings.templatesFolder = '';
    if (this.settings.triggerKey === undefined) this.settings.triggerKey = '';

    // Build the set of slugs already assigned so we can guarantee uniqueness
    const takenSlugs = new Set(
      this.settings.objectTypes.filter((o) => o.commandSlug).map((o) => o.commandSlug)
    );

    let needsSave = false;
    for (const obj of this.settings.objectTypes) {
      if (!obj.fields)                          { obj.fields = [];        needsSave = true; }
      if (!obj.matchFilters)                    { obj.matchFilters = [];  needsSave = true; }
      if (!obj.matchMode)                       { obj.matchMode = 'all';  needsSave = true; }
      if (obj.enableFindCommand === undefined)  { obj.enableFindCommand = false; needsSave = true; }
      if (obj.showInTriggerMenu === undefined)  { obj.showInTriggerMenu = false; needsSave = true; }
      if (obj.styledLinks === undefined)        { obj.styledLinks = false; needsSave = true; }
      if (!obj.previewFields)                   { obj.previewFields = []; needsSave = true; }

      // Assign a stable commandSlug the first time (derived from the name, unique).
      // This slug never changes after creation — renames only update the display name.
      if (!obj.commandSlug) {
        const base = nameToCommandSlug(obj.name);
        let slug = base;
        let n = 2;
        while (takenSlugs.has(slug)) slug = `${base}-${n++}`;
        obj.commandSlug = slug;
        takenSlugs.add(slug);
        needsSave = true;
      }
    }

    if (needsSave) await this.saveSettings();
  }

  async saveSettings() { await this.saveData(this.settings); }

  // ── Object link styling ───────────────────────────────────────────────────────

  /**
   * Rebuild the sets of file basenames / paths whose object type has
   * `styledLinks` enabled.  Called on load, on metadata resolve, and whenever
   * the styledLinks toggle changes.
   */
  buildStyledObjectSet() {
    this.styledObjectBasenames  = new Set();
    this.styledObjectPaths      = new Set();
    this.previewObjectBasenames = new Set();
    this.previewObjectPaths     = new Set();
    for (const objType of this.settings.objectTypes) {
      const hasPreview = (objType.previewFields ?? []).length > 0;
      if (!objType.styledLinks && !hasPreview) continue;
      for (const file of this.getObjectTypeFiles(objType)) {
        if (objType.styledLinks) {
          this.styledObjectBasenames.add(file.basename);
          this.styledObjectPaths.add(file.path);
        }
        if (hasPreview) {
          this.previewObjectBasenames.add(file.basename);
          this.previewObjectPaths.add(file.path);
        }
      }
    }
  }

  /**
   * Walk any already-rendered internal links in the DOM (reading view) and
   * add or remove the `ffc-obj-link` class to match the current object set.
   * CM6 (live preview) picks up the new set automatically on the next update.
   */
  refreshObjectLinkStyles() {
    document.querySelectorAll('a.internal-link[data-href]').forEach((link) => {
      const href      = link.getAttribute('data-href').split('#')[0].trim();
      const basename  = href.includes('/') ? href.split('/').pop() : href;
      const isStyled  = this.styledObjectBasenames.has(href)  || this.styledObjectBasenames.has(basename);
      const isPreview = this.previewObjectBasenames.has(href)  || this.previewObjectBasenames.has(basename);
      link.classList.toggle('ffc-obj-link',         isStyled);
      link.classList.toggle('ffc-obj-preview-link', isPreview);
    });
  }

  /**
   * Inject a persistent <style> block with CSS for object link pill styling.
   * Uses the same CSS custom properties as Obsidian's tag pills so object
   * links blend with the active theme automatically.
   */
  injectLinkStyles() {
    const styleId = 'ffc-link-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* ── Object link pill — reading / preview mode ── */
      .markdown-rendered a.internal-link.ffc-obj-link,
      .markdown-preview-view a.internal-link.ffc-obj-link,
      .markdown-reading-view a.internal-link.ffc-obj-link {
        --link-decoration: none;
        --link-decoration-hover: none;
        text-decoration: none !important;
        text-decoration-line: none !important;
        background: var(--tag-background);
        color: var(--tag-color) !important;
        border-radius: 2px;
        padding: 1px 5px;
        border: var(--tag-border-width, 0px) solid var(--tag-border-color, transparent);
        font-size: var(--tag-size, inherit);
      }
      .markdown-rendered a.internal-link.ffc-obj-link:hover,
      .markdown-preview-view a.internal-link.ffc-obj-link:hover,
      .markdown-reading-view a.internal-link.ffc-obj-link:hover {
        --link-decoration: none;
        --link-decoration-hover: none;
        text-decoration: none !important;
        text-decoration-line: none !important;
        background: var(--tag-background-hover, var(--interactive-hover));
        color: var(--tag-color-hover, var(--tag-color)) !important;
        border-color: var(--tag-border-color-hover, var(--tag-border-color, transparent));
      }

      /* ── Object preview popup ── */
      .ffc-preview-popup {
        position: fixed;
        z-index: 9999;
        background: var(--background-primary);
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.08);
        padding: 14px 16px 12px;
        min-width: 220px;
        max-width: 360px;
        pointer-events: auto;
        font-size: var(--font-ui-small, 13px);
        line-height: 1.5;
      }
      .ffc-preview-header { margin-bottom: 10px; }
      .ffc-preview-title {
        display: block;
        font-weight: 600;
        font-size: 0.95em;
        color: var(--text-normal);
        line-height: 1.4;
        word-break: break-word;
      }
      .ffc-preview-divider {
        border: none;
        border-top: 1px solid var(--background-modifier-border);
        margin: 0 0 10px;
      }
      .ffc-preview-body { display: flex; flex-direction: column; gap: 5px; }
      .ffc-preview-row  { display: flex; align-items: baseline; gap: 10px; font-size: 0.88em; }
      .ffc-preview-label {
        color: var(--text-muted);
        min-width: 64px;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .ffc-preview-value {
        color: var(--text-normal);
        flex: 1;
        word-break: break-word;
      }

      /* ── Object link pill — live preview / source mode (CM6 decoration) ── */
      /* No padding here — padding on CM6 inline spans causes layout gaps when
         Obsidian expands the [[...]] brackets on cursor entry. Use box-shadow
         to extend the background fill without affecting the element's box. */
      .cm-editor .ffc-obj-link {
        background: var(--tag-background);
        border-radius: 2px;
        padding: 2px 0;
        box-shadow: 4px 0 0 var(--tag-background), -4px 0 0 var(--tag-background);
      }
      /* Target the inner CM6 link spans directly — you can't cancel a child's
         own text-decoration by setting none on an ancestor wrapper. */
      .cm-editor .ffc-obj-link,
      .cm-editor .ffc-obj-link .cm-hmd-internal-link,
      .cm-editor .ffc-obj-link .cm-link,
      .cm-editor .ffc-obj-link .cm-underline {
        text-decoration: none !important;
        text-decoration-line: none !important;
        color: var(--tag-color) !important;
      }
    `;
    document.head.appendChild(style);
  }
}

module.exports = FilteredFileCommandsPlugin;
