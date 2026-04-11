/* Objects – Obsidian Plugin */
'use strict';

const obsidian = require('obsidian');

// ─── Default Settings ─────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  commands: [],
  objectTypes: [],
  templatesFolder: '',
};

// ─── Filtered File Modal ──────────────────────────────────────────────────────

class FilteredFileModal extends obsidian.FuzzySuggestModal {
  constructor(app, files) {
    super(app);
    this.files = files;
    this.setPlaceholder('Type to search filtered files…');
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

    // ── Object Types ──────────────────────────────────────────────────────────
    containerEl.createEl('h2', { text: 'Object Types' });
    containerEl.createEl('p', {
      text: 'Define object types to get "Create new …" commands in the palette. Optionally define fields that will be prompted at creation time and written into the new file\'s frontmatter.',
      cls: 'ffc-settings-desc',
    });

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

    for (let i = 0; i < this.plugin.settings.objectTypes.length; i++) {
      this.renderObjectType(containerEl, i);
    }

    new obsidian.Setting(containerEl).addButton((btn) =>
      btn.setButtonText('＋ Add Object Type').setCta().onClick(async () => {
        const id = `ffc-objtype-${Date.now()}`;
        this.plugin.settings.objectTypes.push({ id, name: 'New Object', templatePath: '', saveFolder: '', fields: [] });
        await this.plugin.saveSettings();
        this.plugin.registerObjectTypeCommand(this.plugin.settings.objectTypes[this.plugin.settings.objectTypes.length - 1]);
        this.display();
      })
    );

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
          if (this.plugin.commandRefs?.[obj.id]) this.plugin.commandRefs[obj.id].name = `Create new ${value}`;
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

  // ── Styles ───────────────────────────────────────────────────────────────────

  injectStyles() {
    const styleId = 'ffc-inline-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
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

      /* New object modal */
      .ffc-new-object-modal { padding: 8px; }
      .ffc-new-object-modal h2 { margin-bottom: 16px; }

      /* Suggestion items */
      .ffc-suggestion { display: flex; flex-direction: column; gap: 2px; padding: 2px 0; }
      .ffc-suggestion-name { font-size: 0.95em; color: var(--text-normal); }
      .ffc-suggestion-path { font-size: 0.78em; color: var(--text-muted); }
    `;
    document.head.appendChild(style);
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

class FilteredFileCommandsPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.commandRefs = {};
    this.registeredCommandIds = new Set();

    this.addSettingTab(new MyPluginSettingTab(this.app, this));

    for (const cmd of this.settings.commands) this.registerFilterCommand(cmd);
    for (const obj of this.settings.objectTypes) this.registerObjectTypeCommand(obj);
    this.registerNewObjectCommand();
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
      const results = cmd.filters.map((f) => this.evaluateFilter(fm, f));
      return cmd.matchMode === 'all' ? results.every(Boolean) : results.some(Boolean);
    });
  }

  evaluateFilter(fm, filter) {
    const { key, operator, value } = filter;
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
    if (this.registeredCommandIds.has(obj.id)) return;
    const registered = this.addCommand({
      id: obj.id,
      name: `Create new ${obj.name}`,
      callback: () => {
        const current = this.settings.objectTypes.find((o) => o.id === obj.id);
        if (!current) { new obsidian.Notice('Object type not found. Try reloading.'); return; }
        new NewObjectModal(this.app, current, (title, fieldValues) => this.createObject(current, title, fieldValues)).open();
      },
    });
    this.commandRefs[obj.id] = registered;
    this.registeredCommandIds.add(obj.id);
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
    // Ensure existing object types have the fields array
    for (const obj of this.settings.objectTypes) {
      if (!obj.fields) obj.fields = [];
    }
  }

  async saveSettings() { await this.saveData(this.settings); }
}

module.exports = FilteredFileCommandsPlugin;
