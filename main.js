"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  FilteredFileCommandsPlugin: () => FilteredFileCommandsPlugin,
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_obsidian16 = require("obsidian");

// src/settings.ts
var import_obsidian7 = require("obsidian");

// src/ui/note-type-settings-page.ts
var import_obsidian3 = require("obsidian");

// src/utils/helpers.ts
var import_obsidian2 = require("obsidian");

// src/ui/frontmatter-value-suggest.ts
var import_obsidian = require("obsidian");
function stringifyFrontmatterValue(v) {
  if (v == null)
    return "";
  if (typeof v === "string")
    return v;
  if (typeof v === "number" || typeof v === "boolean")
    return String(v);
  try {
    return JSON.stringify(v);
  } catch (e) {
    return "";
  }
}
var FrontmatterValueSuggest = class {
  constructor(app, inputEl, key, fieldType) {
    this.dropdown = null;
    this.suggestions = [];
    this.selectedIndex = -1;
    this.app = app;
    this.inputEl = inputEl;
    this.key = key;
    this.fieldType = fieldType;
    this._onInput = () => this.refresh();
    this._onFocus = () => this.refresh();
    this._onBlur = () => window.setTimeout(() => this.close(), 150);
    this._onKeydown = (e) => this.handleKeydown(e);
    inputEl.addEventListener("input", this._onInput);
    inputEl.addEventListener("focus", this._onFocus);
    inputEl.addEventListener("blur", this._onBlur);
    inputEl.addEventListener("keydown", this._onKeydown);
  }
  // ── Data ──────────────────────────────────────────────────────────────────────
  getVaultValues() {
    var _a, _b, _c;
    const values = /* @__PURE__ */ new Set();
    if (this.key === "tags" || this.key === "tag") {
      const tags = (_a = this.app.metadataCache.getTags()) != null ? _a : {};
      for (const tag of Object.keys(tags)) {
        values.add(tag.startsWith("#") ? tag.slice(1) : tag);
      }
    }
    for (const file of this.app.vault.getMarkdownFiles()) {
      const raw = (_c = (_b = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _b.frontmatter) == null ? void 0 : _c[this.key];
      if (raw == null)
        continue;
      if (Array.isArray(raw)) {
        raw.forEach((v) => {
          if (v != null)
            values.add(stringifyFrontmatterValue(v).trim());
        });
      } else {
        const s = stringifyFrontmatterValue(raw).trim();
        if (s)
          values.add(s);
      }
    }
    return [...values].filter(Boolean).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  }
  activeTerm() {
    var _a;
    return this.fieldType === "list" ? ((_a = this.inputEl.value.split(",").pop()) != null ? _a : "").trim() : this.inputEl.value.trim();
  }
  alreadyEntered() {
    if (this.fieldType !== "list")
      return [];
    return this.inputEl.value.split(",").slice(0, -1).map((s) => s.trim().toLowerCase());
  }
  // ── Selection ─────────────────────────────────────────────────────────────────
  select(value) {
    if (this.fieldType === "list") {
      const parts = this.inputEl.value.split(",");
      parts[parts.length - 1] = value;
      this.inputEl.value = parts.map((s) => s.trim()).join(", ");
    } else {
      this.inputEl.value = value;
    }
    this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    this.close();
    this.inputEl.focus();
  }
  // ── Keyboard ──────────────────────────────────────────────────────────────────
  handleKeydown(e) {
    if (!this.dropdown)
      return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.suggestions.length - 1);
      this.updateHighlight();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.updateHighlight();
    } else if (e.key === "Enter") {
      if (this.selectedIndex >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.select(this.suggestions[this.selectedIndex]);
      }
    } else if (e.key === "Escape") {
      this.close();
    }
  }
  // ── Dropdown UI ───────────────────────────────────────────────────────────────
  refresh() {
    const term = this.activeTerm().toLowerCase();
    const entered = this.alreadyEntered();
    const matches = this.getVaultValues().filter(
      (v) => v.toLowerCase().includes(term) && !entered.includes(v.toLowerCase())
    );
    if (matches.length === 0 || document.activeElement !== this.inputEl) {
      this.close();
      return;
    }
    this.suggestions = matches;
    this.selectedIndex = -1;
    if (!this.dropdown) {
      this.dropdown = createDiv();
      this.dropdown.className = "suggestion-container ffc-suggest-dropdown";
      document.body.appendChild(this.dropdown);
    }
    this.dropdown.empty();
    const rect = this.inputEl.getBoundingClientRect();
    Object.assign(this.dropdown.style, {
      position: "fixed",
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      zIndex: "9999",
      maxHeight: "200px",
      overflowY: "auto"
    });
    matches.forEach((value, i) => {
      const isLink = /^\[\[.*\]\]$/.test(value);
      const displayText = isLink ? value.slice(2, -2) : value;
      const item = this.dropdown.createDiv({ cls: "suggestion-item ffc-suggest-item" });
      item.createSpan({ cls: "ffc-suggest-label", text: displayText });
      if (isLink) {
        const icon = item.createSpan({ cls: "ffc-suggest-link-icon" });
        (0, import_obsidian.setIcon)(icon, "link");
      }
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });
      item.addEventListener("click", () => {
        this.select(value);
      });
      item.addEventListener("mouseover", () => {
        this.selectedIndex = i;
        this.updateHighlight();
      });
    });
  }
  updateHighlight() {
    if (!this.dropdown)
      return;
    this.dropdown.querySelectorAll(".suggestion-item").forEach((el, i) => {
      el.classList.toggle("is-selected", i === this.selectedIndex);
    });
  }
  close() {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
    this.suggestions = [];
    this.selectedIndex = -1;
  }
  destroy() {
    this.close();
    this.inputEl.removeEventListener("input", this._onInput);
    this.inputEl.removeEventListener("focus", this._onFocus);
    this.inputEl.removeEventListener("blur", this._onBlur);
    this.inputEl.removeEventListener("keydown", this._onKeydown);
  }
};

// src/utils/helpers.ts
function stringifyFrontmatterValue2(v) {
  if (v == null)
    return "";
  if (typeof v === "string")
    return v;
  if (typeof v === "number" || typeof v === "boolean")
    return String(v);
  try {
    return JSON.stringify(v);
  } catch (e) {
    return "";
  }
}
function nameToCommandSlug(name) {
  return (name || "note").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "note";
}
function renderFieldInputs(container, app, noteType, fieldValues, onEnter, insertBefore = null) {
  var _a;
  container.querySelectorAll("[data-ffc-field]").forEach((el) => el.remove());
  const fields = (_a = noteType == null ? void 0 : noteType.fields) != null ? _a : [];
  for (const field of fields) {
    const s = new import_obsidian2.Setting(container).setName(field.label || field.key).setDesc(field.type === "list" ? "Separate multiple values with commas" : "").addText((text) => {
      var _a2, _b;
      text.setPlaceholder(field.type === "list" ? "e.g. tag1, tag2" : "").setValue((_a2 = fieldValues[field.key]) != null ? _a2 : "").onChange((v) => {
        fieldValues[field.key] = v;
      });
      if ((_b = field.key) == null ? void 0 : _b.trim()) {
        new FrontmatterValueSuggest(app, text.inputEl, field.key, field.type);
      }
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          onEnter();
      });
    });
    s.settingEl.dataset["ffcField"] = "true";
    if (insertBefore)
      container.insertBefore(s.settingEl, insertBefore);
  }
}

// src/ui/note-type-settings-page.ts
var NoteTypeSettingsPage = class {
  constructor(app, plugin, index, onTitleChange) {
    this.app = app;
    this.plugin = plugin;
    this.index = index;
    this.onTitleChange = onTitleChange;
  }
  render(containerEl) {
    this.containerEl = containerEl;
    this._render();
  }
  _render() {
    var _a, _b, _c, _d;
    const contentEl = this.containerEl;
    contentEl.empty();
    contentEl.addClass("ffc-item-page");
    const obj = this.plugin.settings.noteTypes[this.index];
    if (!obj) {
      contentEl.createEl("p", { text: "Note type not found." });
      return;
    }
    new import_obsidian3.Setting(contentEl).setName("Note type name").setDesc('Creates a "Create new {name}" command in the palette.').addText(
      (text) => text.setPlaceholder("E.g. Task").setValue(obj.name).onChange(async (value) => {
        var _a2;
        obj.name = value;
        await this.plugin.saveSettings();
        const cmdId = `ffc-notetype-${obj.commandSlug}`;
        const refs = this.plugin.commandRefs;
        if (refs[cmdId])
          refs[cmdId].name = `Create new ${value}`;
        const findCmdId = `${cmdId}-find`;
        if (refs[findCmdId])
          refs[findCmdId].name = `Find ${value}`;
        (_a2 = this.onTitleChange) == null ? void 0 : _a2.call(this, value || "Note type");
      })
    );
    new import_obsidian3.Setting(contentEl).setName("Description").setDesc("Short description shown beneath the note type name in the settings list.").addText(
      (text) => text.setPlaceholder("E.g. Tracks actionable to-dos").setValue(obj.description || "").onChange(async (value) => {
        obj.description = value;
        await this.plugin.saveSettings();
      })
    );
    if (obj.commandSlug !== nameToCommandSlug(obj.name)) {
      contentEl.createEl("p", {
        text: `\u26A0 Command ID ("${obj.commandSlug}") was set when this type was first created and no longer matches the current name. Renaming only updates the display \u2014 to fix it, change "commandSlug" in data.json to "${nameToCommandSlug(obj.name)}" and rebind any shortcuts.`,
        cls: "ffc-hint ffc-slug-warning"
      });
    }
    const detectionSection = contentEl.createDiv({ cls: "ffc-filters-section" });
    detectionSection.createEl("p", { text: "Note detection", cls: "ffc-filters-title" });
    detectionSection.createEl("p", {
      text: 'Filters that identify existing files of this type. Used by the trigger menu and the "find" command. If no filters are set, files in the save folder are used as a fallback.',
      cls: "ffc-hint"
    });
    new import_obsidian3.Setting(detectionSection).setName("Filter match mode").setDesc("Should a file match all filters (and) or at least one filter (or)?").addDropdown(
      (dd) => {
        var _a2;
        return dd.addOption("all", "Match all (and)").addOption("any", "Match any (or)").setValue((_a2 = obj.matchMode) != null ? _a2 : "all").onChange(async (value) => {
          obj.matchMode = value;
          await this.plugin.saveSettings();
        });
      }
    );
    if (!obj.matchFilters || obj.matchFilters.length === 0) {
      detectionSection.createEl("p", { text: "No filters \u2014 save folder will be used as a fallback.", cls: "ffc-hint" });
    }
    for (let fi = 0; fi < ((_a = obj.matchFilters) != null ? _a : []).length; fi++) {
      this._renderNoteMatchFilter(detectionSection, fi);
    }
    new import_obsidian3.Setting(detectionSection).addButton(
      (btn) => btn.setButtonText("\uFF0B add detection filter").onClick(async () => {
        if (!obj.matchFilters)
          obj.matchFilters = [];
        obj.matchFilters.push({ key: "", operator: "equals", value: "" });
        await this.plugin.saveSettings();
        this._render();
      })
    );
    new import_obsidian3.Setting(detectionSection).setName("Show in trigger menu").setDesc(`When enabled, matching files appear in the "${this.plugin.settings.triggerKey || "@"}" inline trigger menu.`).addToggle(
      (toggle) => {
        var _a2;
        return toggle.setValue((_a2 = obj.showInTriggerMenu) != null ? _a2 : false).onChange(async (value) => {
          obj.showInTriggerMenu = value;
          await this.plugin.saveSettings();
        });
      }
    );
    new import_obsidian3.Setting(detectionSection).setName('Enable "find" command').setDesc(`When enabled, adds a "Find ${obj.name}" command to the palette for fuzzy-searching files of this type.`).addToggle(
      (toggle) => {
        var _a2;
        return toggle.setValue((_a2 = obj.enableFindCommand) != null ? _a2 : false).onChange(async (value) => {
          obj.enableFindCommand = value;
          await this.plugin.saveSettings();
          if (value)
            this.plugin.registerFindCommand(obj);
        });
      }
    );
    new import_obsidian3.Setting(detectionSection).setName("Style note links").setDesc("When enabled, inline links to files of this type will have their underline removed and a background fill applied.").addToggle(
      (toggle) => {
        var _a2;
        return toggle.setValue((_a2 = obj.styledLinks) != null ? _a2 : false).onChange(async (value) => {
          obj.styledLinks = value;
          await this.plugin.saveSettings();
          this.plugin.buildStyledNoteSet();
          this.plugin.refreshNoteLinkStyles();
        });
      }
    );
    new import_obsidian3.Setting(detectionSection).setName("Show status in links").setDesc('When enabled, a status icon is shown on inline links to files of this type that have a "status" frontmatter field.').addToggle(
      (toggle) => {
        var _a2;
        return toggle.setValue((_a2 = obj.showStatusInLinks) != null ? _a2 : false).onChange(async (value) => {
          obj.showStatusInLinks = value;
          await this.plugin.saveSettings();
          this.plugin.buildStyledNoteSet();
          this.plugin.refreshNoteLinkStyles();
        });
      }
    );
    const templateFiles = this.plugin.getTemplateFiles();
    if (templateFiles.length > 0) {
      new import_obsidian3.Setting(contentEl).setName("Template").setDesc("Template file applied when creating a new note of this type.").addDropdown((dd) => {
        dd.addOption("", "\u2014 none \u2014");
        for (const f of templateFiles)
          dd.addOption(f.path, f.basename);
        dd.setValue(obj.templatePath || "");
        dd.onChange(async (value) => {
          obj.templatePath = value;
          await this.plugin.saveSettings();
        });
      });
    } else {
      new import_obsidian3.Setting(contentEl).setName("Template").setDesc("No templates found. Set the templates folder in General settings, or check it contains .md files.").addText(
        (text) => text.setPlaceholder("path/to/template.md").setValue(obj.templatePath || "").onChange(async (value) => {
          obj.templatePath = value.trim();
          await this.plugin.saveSettings();
        })
      );
    }
    new import_obsidian3.Setting(contentEl).setName("Save folder").setDesc('Where new files are created (e.g. "projects/tasks"). Leave blank for vault root.').addText(
      (text) => text.setPlaceholder("E.g. Projects/tasks").setValue(obj.saveFolder || "").onChange(async (value) => {
        obj.saveFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
    const fieldsSection = contentEl.createDiv({ cls: "ffc-filters-section" });
    fieldsSection.createEl("p", { text: "Creation fields", cls: "ffc-filters-title" });
    fieldsSection.createEl("p", {
      text: "Fields shown in the creation dialog. Values are written into the new file's frontmatter.",
      cls: "ffc-hint"
    });
    for (let fi = 0; fi < ((_b = obj.fields) != null ? _b : []).length; fi++) {
      this._renderNoteField(fieldsSection, fi);
    }
    new import_obsidian3.Setting(fieldsSection).addButton(
      (btn) => btn.setButtonText("\uFF0B add field").onClick(async () => {
        if (!obj.fields)
          obj.fields = [];
        obj.fields.push({ key: "", label: "", type: "text" });
        await this.plugin.saveSettings();
        this._render();
      })
    );
    const previewSection = contentEl.createDiv({ cls: "ffc-filters-section" });
    previewSection.createEl("p", { text: "Preview fields", cls: "ffc-filters-title" });
    previewSection.createEl("p", {
      text: "Frontmatter keys shown when hovering over a link to a note of this type.",
      cls: "ffc-hint"
    });
    for (let fi = 0; fi < ((_c = obj.previewFields) != null ? _c : []).length; fi++) {
      this._renderPreviewField(previewSection, fi);
    }
    new import_obsidian3.Setting(previewSection).addButton(
      (btn) => btn.setButtonText("\uFF0B add preview field").onClick(async () => {
        if (!obj.previewFields)
          obj.previewFields = [];
        obj.previewFields.push({ key: "", label: "" });
        await this.plugin.saveSettings();
        this._render();
      })
    );
    new import_obsidian3.Setting(previewSection).setName("Show cover image in preview").setDesc("When enabled, the image from the image key is shown at the top of the hover card.").addToggle(
      (toggle) => {
        var _a2;
        return toggle.setValue((_a2 = obj.showImageInPreview) != null ? _a2 : false).onChange(async (value) => {
          obj.showImageInPreview = value;
          await this.plugin.saveSettings();
        });
      }
    );
    const canvasSection = contentEl.createDiv({ cls: "ffc-filters-section" });
    canvasSection.createEl("p", { text: "Canvas card fields", cls: "ffc-filters-title" });
    canvasSection.createEl("p", {
      text: "Frontmatter keys shown on canvas cards for notes of this type.",
      cls: "ffc-hint"
    });
    for (let fi = 0; fi < ((_d = obj.canvasFields) != null ? _d : []).length; fi++) {
      this._renderCanvasField(canvasSection, fi);
    }
    new import_obsidian3.Setting(canvasSection).addButton(
      (btn) => btn.setButtonText("\uFF0B add canvas field").onClick(async () => {
        if (!obj.canvasFields)
          obj.canvasFields = [];
        obj.canvasFields.push({ key: "", label: "" });
        await this.plugin.saveSettings();
        this._render();
      })
    );
    new import_obsidian3.Setting(canvasSection).setName("Show cover image on canvas cards").setDesc("When enabled, the image from the image key is embedded at the top of the canvas card.").addToggle(
      (toggle) => {
        var _a2;
        return toggle.setValue((_a2 = obj.showImageInCanvas) != null ? _a2 : false).onChange(async (value) => {
          obj.showImageInCanvas = value;
          await this.plugin.saveSettings();
        });
      }
    );
    const imageSection = contentEl.createDiv({ cls: "ffc-filters-section" });
    imageSection.createEl("p", { text: "Cover image", cls: "ffc-filters-title" });
    imageSection.createEl("p", {
      text: 'The frontmatter key whose value is an image path or wikilink (e.g. "cover" or "image").',
      cls: "ffc-hint"
    });
    new import_obsidian3.Setting(imageSection).setName("Image frontmatter key").setDesc("E.g. cover, image, thumbnail").addText(
      (text) => {
        var _a2;
        return text.setPlaceholder("cover").setValue((_a2 = obj.imageKey) != null ? _a2 : "").onChange(async (value) => {
          obj.imageKey = value.trim();
          await this.plugin.saveSettings();
        });
      }
    );
  }
  _renderNoteMatchFilter(container, filterIndex) {
    var _a, _b;
    const obj = this.plugin.settings.noteTypes[this.index];
    const filter = obj.matchFilters[filterIndex];
    const row = container.createDiv({ cls: "ffc-filter-row" });
    const isPathOp = filter.operator === "in_folder" || filter.operator === "not_in_folder";
    if (!isPathOp) {
      const keyInput = row.createEl("input", { cls: "ffc-input ffc-input-key" });
      keyInput.type = "text";
      keyInput.placeholder = "Property key";
      keyInput.value = (_a = filter.key) != null ? _a : "";
      keyInput.addEventListener("change", () => {
        filter.key = keyInput.value.trim();
        void this.plugin.saveSettings();
      });
    }
    const opSelect = row.createEl("select", { cls: "ffc-select" });
    for (const op of [
      { value: "equals", label: "=" },
      { value: "not_equals", label: "\u2260" },
      { value: "contains", label: "contains" },
      { value: "exists", label: "exists" },
      { value: "in_folder", label: "in folder" },
      { value: "not_in_folder", label: "not in folder" }
    ]) {
      const opt = opSelect.createEl("option", { text: op.label, value: op.value });
      if (filter.operator === op.value)
        opt.selected = true;
    }
    opSelect.addEventListener("change", () => {
      filter.operator = opSelect.value;
      void this.plugin.saveSettings();
      this._render();
    });
    if (filter.operator !== "exists") {
      const valInput = row.createEl("input", { cls: "ffc-input ffc-input-val" });
      valInput.type = "text";
      valInput.placeholder = isPathOp ? "Folder path (e.g. Templates)" : "Value";
      valInput.value = (_b = filter.value) != null ? _b : "";
      valInput.addEventListener("change", () => {
        filter.value = valInput.value;
        void this.plugin.saveSettings();
      });
    }
    row.createEl("button", { text: "\u2715", cls: "ffc-btn-remove" }).onclick = async () => {
      obj.matchFilters.splice(filterIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }
  _renderNoteField(container, fieldIndex) {
    var _a, _b;
    const obj = this.plugin.settings.noteTypes[this.index];
    const field = obj.fields[fieldIndex];
    const row = container.createDiv({ cls: "ffc-filter-row" });
    const labelInput = row.createEl("input", { cls: "ffc-input ffc-input-label" });
    labelInput.type = "text";
    labelInput.placeholder = "Label";
    labelInput.value = (_a = field.label) != null ? _a : "";
    labelInput.title = "Display label shown in the creation dialog";
    labelInput.addEventListener("change", () => {
      field.label = labelInput.value;
      void this.plugin.saveSettings();
    });
    const keyInput = row.createEl("input", { cls: "ffc-input ffc-input-key" });
    keyInput.type = "text";
    keyInput.placeholder = "Frontmatter key";
    keyInput.value = (_b = field.key) != null ? _b : "";
    keyInput.title = "The frontmatter property key written into the new file";
    keyInput.addEventListener("change", () => {
      field.key = keyInput.value.trim();
      void this.plugin.saveSettings();
    });
    const typeSelect = row.createEl("select", { cls: "ffc-select" });
    for (const t of [{ value: "text", label: "Text" }, { value: "list", label: "List" }]) {
      const opt = typeSelect.createEl("option", { text: t.label, value: t.value });
      if (field.type === t.value)
        opt.selected = true;
    }
    typeSelect.title = "List splits comma-separated input into a YAML array";
    typeSelect.addEventListener("change", () => {
      field.type = typeSelect.value;
      void this.plugin.saveSettings();
    });
    row.createEl("button", { text: "\u2715", cls: "ffc-btn-remove" }).onclick = async () => {
      obj.fields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }
  _renderPreviewField(container, fieldIndex) {
    var _a, _b;
    const obj = this.plugin.settings.noteTypes[this.index];
    const field = obj.previewFields[fieldIndex];
    const row = container.createDiv({ cls: "ffc-filter-row" });
    const labelInput = row.createEl("input", { cls: "ffc-input ffc-input-label" });
    labelInput.type = "text";
    labelInput.placeholder = "Display label";
    labelInput.value = (_a = field.label) != null ? _a : "";
    labelInput.title = "Label shown in the preview card (leave blank to use the key name)";
    labelInput.addEventListener("change", () => {
      field.label = labelInput.value;
      void this.plugin.saveSettings();
    });
    const keyInput = row.createEl("input", { cls: "ffc-input ffc-input-key" });
    keyInput.type = "text";
    keyInput.placeholder = "Frontmatter key";
    keyInput.value = (_b = field.key) != null ? _b : "";
    keyInput.title = "The frontmatter property key whose value will appear in the preview";
    keyInput.addEventListener("change", () => {
      field.key = keyInput.value.trim();
      void this.plugin.saveSettings();
      this.plugin.buildStyledNoteSet();
      this.plugin.refreshNoteLinkStyles();
    });
    row.createEl("button", { text: "\u2715", cls: "ffc-btn-remove" }).onclick = async () => {
      obj.previewFields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this.plugin.buildStyledNoteSet();
      this.plugin.refreshNoteLinkStyles();
      this._render();
    };
  }
  _renderCanvasField(container, fieldIndex) {
    var _a, _b;
    const obj = this.plugin.settings.noteTypes[this.index];
    const field = obj.canvasFields[fieldIndex];
    const row = container.createDiv({ cls: "ffc-filter-row" });
    const labelInput = row.createEl("input", { cls: "ffc-input ffc-input-label" });
    labelInput.type = "text";
    labelInput.placeholder = "Display label";
    labelInput.value = (_a = field.label) != null ? _a : "";
    labelInput.title = "Label shown on the canvas card (leave blank to use the key name)";
    labelInput.addEventListener("change", () => {
      field.label = labelInput.value;
      void this.plugin.saveSettings();
    });
    const keyInput = row.createEl("input", { cls: "ffc-input ffc-input-key" });
    keyInput.type = "text";
    keyInput.placeholder = "Frontmatter key";
    keyInput.value = (_b = field.key) != null ? _b : "";
    keyInput.title = "The frontmatter property key whose value will appear on the card";
    keyInput.addEventListener("change", () => {
      field.key = keyInput.value.trim();
      void this.plugin.saveSettings();
    });
    row.createEl("button", { text: "\u2715", cls: "ffc-btn-remove" }).onclick = async () => {
      obj.canvasFields.splice(fieldIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }
};

// src/ui/note-type-delete-modal.ts
var import_obsidian4 = require("obsidian");
var NoteTypeDeleteModal = class extends import_obsidian4.Modal {
  constructor(app, plugin, index, onDismiss) {
    super(app);
    this.plugin = plugin;
    this.index = index;
    this.onDismiss = onDismiss;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ffc-confirm-modal");
    const obj = this.plugin.settings.noteTypes[this.index];
    contentEl.createEl("h2", { text: "Delete note type?" });
    contentEl.createEl("p", {
      text: `Are you sure you want to delete "${(obj == null ? void 0 : obj.name) || "this note type"}"? This will remove it from your settings. Existing files will not be affected.`,
      cls: "ffc-confirm-desc"
    });
    const btnRow = contentEl.createDiv({ cls: "ffc-confirm-buttons" });
    btnRow.createEl("button", { text: "Cancel", cls: "ffc-btn-cancel" }).onclick = () => {
      this.close();
    };
    const deleteBtn = btnRow.createEl("button", { text: "Delete", cls: "mod-warning" });
    deleteBtn.onclick = async () => {
      this.plugin.settings.noteTypes.splice(this.index, 1);
      await this.plugin.saveSettings();
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
    if (this.onDismiss)
      this.onDismiss();
  }
};

// src/ui/filtered-command-settings-modal.ts
var import_obsidian5 = require("obsidian");
var FilteredCommandSettingsModal = class extends import_obsidian5.Modal {
  constructor(app, plugin, index, onDismiss) {
    super(app);
    this.plugin = plugin;
    this.index = index;
    this.onDismiss = onDismiss;
  }
  onOpen() {
    this._render();
  }
  _render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ffc-item-modal");
    const cmd = this.plugin.settings.commands[this.index];
    if (!cmd) {
      contentEl.createEl("p", { text: "Command not found." });
      return;
    }
    contentEl.createEl("h2", { text: cmd.name || "Command settings", cls: "ffc-modal-title" });
    new import_obsidian5.Setting(contentEl).setName("Command name").setDesc("Shown in the command palette and hotkey settings.").addText(
      (text) => text.setPlaceholder("E.g. Show active projects").setValue(cmd.name).onChange(async (value) => {
        cmd.name = value;
        await this.plugin.saveSettings();
        const ref = this.plugin.commandRefs[cmd.id];
        if (ref)
          ref.name = value;
        const titleEl = contentEl.querySelector(".ffc-modal-title");
        if (titleEl)
          titleEl.textContent = value || "Command settings";
      })
    );
    new import_obsidian5.Setting(contentEl).setName("Filter match mode").setDesc("Should a file match all filters (and) or at least one filter (or)?").addDropdown(
      (dd) => dd.addOption("all", "Match all filters (and)").addOption("any", "Match any filter (or)").setValue(cmd.matchMode).onChange(async (value) => {
        cmd.matchMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian5.Setting(contentEl).setName("File types").setDesc("Comma-separated extensions (e.g. md, canvas). Leave blank for Markdown only.").addText(
      (text) => text.setPlaceholder("md, canvas").setValue(cmd.fileTypes || "").onChange(async (value) => {
        cmd.fileTypes = value;
        await this.plugin.saveSettings();
      })
    );
    const filtersSection = contentEl.createDiv({ cls: "ffc-filters-section" });
    filtersSection.createEl("p", { text: "Frontmatter filters", cls: "ffc-filters-title" });
    if (cmd.filters.length === 0) {
      filtersSection.createEl("p", { text: "No filters \u2014 all files of the specified type(s) will be shown.", cls: "ffc-hint" });
    }
    for (let fi = 0; fi < cmd.filters.length; fi++)
      this._renderFilter(filtersSection, fi);
    new import_obsidian5.Setting(filtersSection).addButton(
      (btn) => btn.setButtonText("\uFF0B add filter").onClick(async () => {
        cmd.filters.push({ key: "", operator: "equals", value: "" });
        await this.plugin.saveSettings();
        this._render();
      })
    );
  }
  _renderFilter(container, filterIndex) {
    const cmd = this.plugin.settings.commands[this.index];
    const filter = cmd.filters[filterIndex];
    const row = container.createDiv({ cls: "ffc-filter-row" });
    const keyInput = row.createEl("input", { cls: "ffc-input ffc-input-key" });
    keyInput.type = "text";
    keyInput.placeholder = "Property key";
    keyInput.value = filter.key;
    keyInput.addEventListener("change", () => {
      filter.key = keyInput.value.trim();
      void this.plugin.saveSettings();
    });
    const opSelect = row.createEl("select", { cls: "ffc-select" });
    for (const op of [{ value: "equals", label: "=" }, { value: "not_equals", label: "\u2260" }, { value: "contains", label: "contains" }, { value: "exists", label: "exists" }]) {
      const opt = opSelect.createEl("option", { text: op.label, value: op.value });
      if (filter.operator === op.value)
        opt.selected = true;
    }
    opSelect.addEventListener("change", () => {
      filter.operator = opSelect.value;
      void this.plugin.saveSettings();
      this._render();
    });
    if (filter.operator !== "exists") {
      const valInput = row.createEl("input", { cls: "ffc-input ffc-input-val" });
      valInput.type = "text";
      valInput.placeholder = "Value";
      valInput.value = filter.value;
      valInput.addEventListener("change", () => {
        filter.value = valInput.value;
        void this.plugin.saveSettings();
      });
    }
    row.createEl("button", { text: "\u2715", cls: "ffc-btn-remove" }).onclick = async () => {
      cmd.filters.splice(filterIndex, 1);
      await this.plugin.saveSettings();
      this._render();
    };
  }
  onClose() {
    this.contentEl.empty();
    if (this.onDismiss)
      this.onDismiss();
  }
};

// src/ui/filtered-command-delete-modal.ts
var import_obsidian6 = require("obsidian");
var FilteredCommandDeleteModal = class extends import_obsidian6.Modal {
  constructor(app, plugin, index, onDismiss) {
    super(app);
    this.plugin = plugin;
    this.index = index;
    this.onDismiss = onDismiss;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ffc-confirm-modal");
    const cmd = this.plugin.settings.commands[this.index];
    contentEl.createEl("h2", { text: "Delete command?" });
    contentEl.createEl("p", {
      text: `Are you sure you want to delete "${(cmd == null ? void 0 : cmd.name) || "this command"}"? This will remove it from your settings.`,
      cls: "ffc-confirm-desc"
    });
    const btnRow = contentEl.createDiv({ cls: "ffc-confirm-buttons" });
    btnRow.createEl("button", { text: "Cancel", cls: "ffc-btn-cancel" }).onclick = () => {
      this.close();
    };
    const deleteBtn = btnRow.createEl("button", { text: "Delete", cls: "mod-warning" });
    deleteBtn.onclick = async () => {
      this.plugin.settings.commands.splice(this.index, 1);
      await this.plugin.saveSettings();
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
    if (this.onDismiss)
      this.onDismiss();
  }
};

// src/settings.ts
var DEFAULT_SETTINGS = {
  commands: [],
  filteredCommandsEnabled: false,
  filteredWidgetEnabled: false,
  filteredWidgetRibbon: false,
  noteTypes: [],
  templatesFolder: "",
  triggerKey: "",
  ffwSections: [],
  ffwDisplayNameKey: ""
};
var MyPluginSettingTab = class extends import_obsidian7.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.activeNoteType = null;
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("ffc-settings");
    this.filteredCmdsSectionEl = void 0;
    this.filteredWidgetSectionEl = void 0;
    if (this.activeNoteType !== null) {
      this.renderNoteTypePage(containerEl, this.activeNoteType);
      return;
    }
    new import_obsidian7.Setting(containerEl).setName("Trigger key").setDesc('Character that opens the inline note picker while editing (e.g. "@"). Leave blank to disable.').addText(
      (text) => text.setPlaceholder("E.g. @").setValue(this.plugin.settings.triggerKey || "").onChange(async (value) => {
        this.plugin.settings.triggerKey = value.trim().slice(0, 1);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian7.Setting(containerEl).setName("Templates folder").setDesc('Path to your templates folder (e.g. "Templates"). Leave blank to auto-detect from the core Templates plugin.').addText(
      (text) => text.setPlaceholder("Templates").setValue(this.plugin.settings.templatesFolder || "").onChange(async (value) => {
        this.plugin.settings.templatesFolder = value.trim();
        await this.plugin.saveSettings();
      })
    );
    const filteredCmdsSetting = new import_obsidian7.Setting(containerEl).setName("Filtered file commands").setDesc("Create palette commands that open a fuzzy file picker filtered by frontmatter.");
    if (this.plugin.settings.filteredCommandsEnabled) {
      filteredCmdsSetting.addExtraButton(
        (btn) => btn.setIcon("arrow-down").setTooltip("Jump to filtered file commands").onClick(() => {
          var _a;
          (_a = this.filteredCmdsSectionEl) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "start" });
        })
      );
    }
    filteredCmdsSetting.addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.filteredCommandsEnabled).onChange(async (value) => {
        this.plugin.settings.filteredCommandsEnabled = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    const filteredWidgetSetting = new import_obsidian7.Setting(containerEl).setName("Filtered files widget").setDesc("A sidebar panel that shows lists of files matching configurable filter rules.");
    if (this.plugin.settings.filteredWidgetEnabled) {
      filteredWidgetSetting.addExtraButton(
        (btn) => btn.setIcon("arrow-down").setTooltip("Jump to filtered files widget").onClick(() => {
          var _a;
          (_a = this.filteredWidgetSectionEl) == null ? void 0 : _a.scrollIntoView({ behavior: "smooth", block: "start" });
        })
      );
    }
    filteredWidgetSetting.addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.filteredWidgetEnabled).onChange(async (value) => {
        this.plugin.settings.filteredWidgetEnabled = value;
        await this.plugin.saveSettings();
        this.plugin.refreshWidgetRibbonIcon();
        this.display();
      })
    );
    containerEl.createEl("hr", { cls: "ffc-divider" });
    const objTypesHeader = containerEl.createDiv({ cls: "ffc-section-header" });
    new import_obsidian7.Setting(objTypesHeader).setName("Definitions").setHeading();
    const addObjTypeBtn = objTypesHeader.createEl("button", {
      cls: "clickable-icon ffc-btn-add",
      attr: { title: "Add note type", "aria-label": "Add note type" }
    });
    (0, import_obsidian7.setIcon)(addObjTypeBtn, "plus");
    addObjTypeBtn.onclick = async () => {
      const id = `ffc-notetype-${Date.now()}`;
      const takenSlugs = new Set(this.plugin.settings.noteTypes.map((o) => o.commandSlug).filter(Boolean));
      const baseSlug = nameToCommandSlug("New Note");
      let newSlug = baseSlug;
      let slugN = 2;
      while (takenSlugs.has(newSlug))
        newSlug = `${baseSlug}-${slugN++}`;
      this.plugin.settings.noteTypes.push({
        id,
        commandSlug: newSlug,
        name: "New Note",
        templatePath: "",
        saveFolder: "",
        fields: [],
        matchFilters: [],
        matchMode: "all",
        enableFindCommand: false,
        showInTriggerMenu: false,
        previewFields: [],
        canvasFields: []
      });
      await this.plugin.saveSettings();
      this.plugin.registerNoteTypeCommand(this.plugin.settings.noteTypes[this.plugin.settings.noteTypes.length - 1]);
      this.display();
    };
    const objTypesList = containerEl.createDiv({ cls: "setting-group ffc-item-list" });
    if (this.plugin.settings.noteTypes.length === 0) {
      objTypesList.createEl("p", { text: "No note types yet. Select + to add one.", cls: "ffc-hint ffc-item-empty" });
    } else {
      for (let i = 0; i < this.plugin.settings.noteTypes.length; i++) {
        this.renderNoteTypeRow(objTypesList, i);
      }
    }
    containerEl.createEl("hr", { cls: "ffc-divider" });
    if (this.plugin.settings.filteredCommandsEnabled) {
      this.filteredCmdsSectionEl = containerEl.createDiv();
      const filteredCmdsHeader = this.filteredCmdsSectionEl.createDiv({ cls: "ffc-section-header" });
      new import_obsidian7.Setting(filteredCmdsHeader).setName("Filtered file commands").setHeading();
      const addCmdBtn = filteredCmdsHeader.createEl("button", {
        cls: "clickable-icon ffc-btn-add",
        attr: { title: "Add filtered command", "aria-label": "Add filtered command" }
      });
      (0, import_obsidian7.setIcon)(addCmdBtn, "plus");
      addCmdBtn.onclick = async () => {
        const id = `ffc-command-${Date.now()}`;
        this.plugin.settings.commands.push({ id, name: "New Filtered Command", matchMode: "all", filters: [] });
        await this.plugin.saveSettings();
        this.plugin.registerFilterCommand(this.plugin.settings.commands[this.plugin.settings.commands.length - 1]);
        this.display();
      };
      const cmdList = this.filteredCmdsSectionEl.createDiv({ cls: "setting-group ffc-item-list" });
      if (this.plugin.settings.commands.length === 0) {
        cmdList.createEl("p", { text: "No filtered commands yet. Select + to add one.", cls: "ffc-hint ffc-item-empty" });
      } else {
        for (let i = 0; i < this.plugin.settings.commands.length; i++) {
          this.renderFilteredCommandRow(cmdList, i);
        }
      }
      containerEl.createEl("hr", { cls: "ffc-divider" });
    }
    if (this.plugin.settings.filteredWidgetEnabled) {
      this.filteredWidgetSectionEl = containerEl.createDiv();
      new import_obsidian7.Setting(this.filteredWidgetSectionEl).setName("Filtered files widget").setHeading();
      new import_obsidian7.Setting(this.filteredWidgetSectionEl).setName("Show ribbon icon").setDesc("Add a button to the left ribbon that opens the filtered files widget.").addToggle(
        (toggle) => toggle.setValue(this.plugin.settings.filteredWidgetRibbon).onChange(async (value) => {
          this.plugin.settings.filteredWidgetRibbon = value;
          await this.plugin.saveSettings();
          this.plugin.refreshWidgetRibbonIcon();
        })
      );
      new import_obsidian7.Setting(this.filteredWidgetSectionEl).setName("Open the widget").setDesc("Reveal the filtered files widget in the left sidebar.").addButton((btn) => btn.setButtonText("Open widget").setCta().onClick(() => {
        void this.plugin.activateWidgetView();
      }));
      new import_obsidian7.Setting(this.filteredWidgetSectionEl).setName("Display name frontmatter key").setDesc('Show a frontmatter value instead of the filename in the widget. Enter the key you use (e.g. "title"). Leave blank to use the filename.').addText(
        (text) => text.setPlaceholder("E.g. title").setValue(this.plugin.settings.ffwDisplayNameKey).onChange(async (v) => {
          this.plugin.settings.ffwDisplayNameKey = v.trim();
          await this.plugin.saveSettings();
          this.plugin.refreshWidgetViews();
        })
      );
      new import_obsidian7.Setting(this.filteredWidgetSectionEl).setName("Reset all filter sections").setDesc("Remove every filter section from the widget. This cannot be undone.").addButton((btn) => btn.setButtonText("Reset").setWarning().onClick(async () => {
        this.plugin.settings.ffwSections = [];
        await this.plugin.saveSettings();
        this.plugin.refreshWidgetViews();
      }));
    }
  }
  // ── Filtered command compact row ────────────────────────────────────────────────
  renderFilteredCommandRow(containerEl, index) {
    const cmd = this.plugin.settings.commands[index];
    const row = containerEl.createDiv({ cls: "ffc-item-row" });
    row.onclick = (e) => {
      if (!e.target.closest(".ffc-item-row-actions")) {
        new FilteredCommandSettingsModal(this.app, this.plugin, index, () => this.display()).open();
      }
    };
    const info = row.createDiv({ cls: "ffc-item-row-info" });
    info.createDiv({ text: cmd.name || "Unnamed", cls: "ffc-item-row-name" });
    const filterCount = cmd.filters.length;
    const desc = `${filterCount} filter${filterCount === 1 ? "" : "s"}${cmd.fileTypes ? ` \xB7 ${cmd.fileTypes}` : ""}`;
    info.createDiv({ text: desc, cls: "ffc-item-row-desc" });
    const actions = row.createDiv({ cls: "ffc-item-row-actions" });
    const gearBtn = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Edit settings" } });
    (0, import_obsidian7.setIcon)(gearBtn, "settings");
    gearBtn.onclick = () => {
      new FilteredCommandSettingsModal(this.app, this.plugin, index, () => this.display()).open();
    };
    const trashBtn = actions.createEl("button", { cls: "clickable-icon ffc-btn-icon-danger", attr: { "aria-label": "Delete command" } });
    (0, import_obsidian7.setIcon)(trashBtn, "trash-2");
    trashBtn.onclick = () => {
      new FilteredCommandDeleteModal(this.app, this.plugin, index, () => this.display()).open();
    };
  }
  // ── Note type compact row ─────────────────────────────────────────────────────
  renderNoteTypeRow(containerEl, index) {
    const obj = this.plugin.settings.noteTypes[index];
    const row = containerEl.createDiv({ cls: "ffc-item-row" });
    row.onclick = (e) => {
      if (!e.target.closest(".ffc-item-row-actions")) {
        this.activeNoteType = index;
        this.display();
      }
    };
    const info = row.createDiv({ cls: "ffc-item-row-info" });
    info.createDiv({ text: obj.name || "Unnamed", cls: "ffc-item-row-name" });
    if (obj.description) {
      info.createDiv({ text: obj.description, cls: "ffc-item-row-desc" });
    }
    const actions = row.createDiv({ cls: "ffc-item-row-actions" });
    const gearBtn = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Edit settings" } });
    (0, import_obsidian7.setIcon)(gearBtn, "settings");
    gearBtn.onclick = () => {
      this.activeNoteType = index;
      this.display();
    };
    const trashBtn = actions.createEl("button", { cls: "clickable-icon ffc-btn-icon-danger", attr: { "aria-label": "Delete note type" } });
    (0, import_obsidian7.setIcon)(trashBtn, "trash-2");
    trashBtn.onclick = () => {
      new NoteTypeDeleteModal(this.app, this.plugin, index, () => this.display()).open();
    };
  }
  // ── Note type sub-page ────────────────────────────────────────────────────────
  renderNoteTypePage(containerEl, index) {
    const obj = this.plugin.settings.noteTypes[index];
    if (!obj) {
      this.activeNoteType = null;
      this.display();
      return;
    }
    const header = containerEl.createDiv({ cls: "ffc-subpage-header" });
    const backBtn = header.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Back" } });
    (0, import_obsidian7.setIcon)(backBtn, "arrow-left");
    backBtn.onclick = () => {
      this.activeNoteType = null;
      this.display();
    };
    const titleEl = header.createSpan({ text: obj.name || "Note type", cls: "ffc-subpage-title" });
    const pageEl = containerEl.createDiv();
    new NoteTypeSettingsPage(this.app, this.plugin, index, (title) => {
      titleEl.textContent = title;
    }).render(pageEl);
  }
};

// src/utils/status-svg.ts
var VALID_STATUSES = /* @__PURE__ */ new Set(["Backlog", "Todo", "In Progress", "Done", "Cancelled"]);
function statusToClass(status) {
  switch (status) {
    case "Backlog":
      return "ffc-status-backlog";
    case "Todo":
      return "ffc-status-todo";
    case "In Progress":
      return "ffc-status-in-progress";
    case "Done":
      return "ffc-status-done";
    case "Cancelled":
      return "ffc-status-cancelled";
    default:
      return "";
  }
}
var STATUS_SVG_MARKUP = {
  "Backlog": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="#A1A1A1" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 4"/></svg>`,
  "Todo": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="#A1A1A1" stroke-width="2" stroke-linecap="round"/></svg>`,
  "In Progress": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="#BD8E37" stroke-width="2" stroke-linecap="round"/><path d="M12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6V18Z" fill="#BD8E37"/></svg>`,
  "Done": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM15.707 9.29297C15.3165 8.90244 14.6835 8.90244 14.293 9.29297L11 12.5859L9.70703 11.293C9.31651 10.9024 8.68349 10.9024 8.29297 11.293C7.90244 11.6835 7.90244 12.3165 8.29297 12.707L10.293 14.707C10.6835 15.0976 11.3165 15.0976 11.707 14.707L15.707 10.707C16.0976 10.3165 16.0976 9.68349 15.707 9.29297Z" fill="#8E68F5"/></svg>`,
  "Cancelled": `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2ZM15.707 8.29297C15.3165 7.90244 14.6835 7.90244 14.293 8.29297L12 10.5859L9.70703 8.29297C9.31651 7.90244 8.68349 7.90244 8.29297 8.29297C7.90244 8.68349 7.90244 9.31651 8.29297 9.70703L10.5859 12L8.29297 14.293C7.90244 14.6835 7.90244 15.3165 8.29297 15.707C8.68349 16.0976 9.31651 16.0976 9.70703 15.707L12 13.4141L14.293 15.707C14.6835 16.0976 15.3165 16.0976 15.707 15.707C16.0976 15.3165 16.0976 14.6835 15.707 14.293L13.4141 12L15.707 9.70703C16.0976 9.31651 16.0976 8.68349 15.707 8.29297Z" fill="#A1A1A1"/></svg>`
};
var parser = new DOMParser();
var statusSvgElCache = /* @__PURE__ */ new Map();
function statusSvg(status) {
  const cached = statusSvgElCache.get(status);
  if (cached)
    return cached.cloneNode(true);
  const markup = STATUS_SVG_MARKUP[status];
  if (!markup)
    return null;
  const svg = parser.parseFromString(markup, "image/svg+xml").documentElement;
  statusSvgElCache.set(status, svg);
  return svg.cloneNode(true);
}

// src/utils/ffw-utils.ts
var import_obsidian8 = require("obsidian");
var FFW_VIEW_TYPE = "filtered-files-widget-view";
var FFW_FILTER_TYPE_LABELS = {
  tag: "Tag",
  frontmatter: "Frontmatter",
  path: "Path / folder",
  name: "File name"
};
var FFW_SORT_OPTIONS = [
  { value: "modified-desc", label: "Modified (newest)" },
  { value: "modified-asc", label: "Modified (oldest)" },
  { value: "created-desc", label: "Created (newest)" },
  { value: "created-asc", label: "Created (oldest)" },
  { value: "name-asc", label: "Name (A\u2192Z)" },
  { value: "name-desc", label: "Name (Z\u2192A)" },
  { value: "frontmatter-asc", label: "Frontmatter field (asc)" },
  { value: "frontmatter-desc", label: "Frontmatter field (desc)" }
];
function ffwNewSectionId() {
  return `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function ffwDefaultFilter(type) {
  switch (type) {
    case "tag":
      return { type: "tag", tag: "", include: true };
    case "frontmatter":
      return { type: "frontmatter", key: "", value: "", comparison: "equals" };
    case "path":
      return { type: "path", pattern: "", matchMode: "starts-with", negate: false };
    case "name":
      return { type: "name", pattern: "", matchMode: "contains", caseSensitive: false, negate: false };
  }
}
function ffwDefaultSort() {
  return { field: "modified-desc" };
}
function ffwSortLabel(sort) {
  var _a, _b;
  switch (sort.field) {
    case "created-desc":
      return "Created (newest)";
    case "created-asc":
      return "Created (oldest)";
    case "modified-desc":
      return "Modified (newest)";
    case "modified-asc":
      return "Modified (oldest)";
    case "name-asc":
      return "Name (A-Z)";
    case "name-desc":
      return "Name (Z-A)";
    case "frontmatter-asc":
      return `Frontmatter "${(_a = sort.frontmatterKey) != null ? _a : ""}" (asc)`;
    case "frontmatter-desc":
      return `Frontmatter "${(_b = sort.frontmatterKey) != null ? _b : ""}" (desc)`;
    default:
      return sort.field;
  }
}
function ffwFuzzyMatch(query, str) {
  if (!query)
    return true;
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  let n = 0;
  for (let i = 0; i < s.length && n < q.length; i++) {
    if (s[i] === q[n])
      n++;
  }
  return n === q.length;
}
function ffwGetIconicIcon(app, file) {
  var _a, _b, _c, _d;
  try {
    const plugins = (_a = app.plugins) == null ? void 0 : _a.plugins;
    if (!plugins)
      return null;
    const iconic = plugins.iconic;
    if (!iconic)
      return null;
    if (typeof iconic.getFileItem === "function") {
      const item = iconic.getFileItem(file.path);
      if (item == null ? void 0 : item.icon)
        return item;
    }
    const lm = iconic.ruleManager;
    if ((lm == null ? void 0 : lm.fileRulings) instanceof Map) {
      const c = lm.fileRulings.get(file.path);
      if (c) {
        const icon = (_c = (_b = c.icon) != null ? _b : c.iconDefault) != null ? _c : null;
        if (icon)
          return { icon, color: (_d = c.color) != null ? _d : null };
      }
    }
    for (const src of [iconic.settings, iconic.data]) {
      if (!src)
        continue;
      for (const key of ["fileIcons", "file", "files"]) {
        const store = src[key];
        if (!store)
          continue;
        const entry = store[file.path];
        if (entry == null ? void 0 : entry.icon)
          return entry;
      }
    }
  } catch (e) {
  }
  return null;
}
function ffwSetIconEl(el, icon, color) {
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(icon)) {
    (0, import_obsidian8.setIcon)(el, icon);
  } else {
    el.setText(icon);
    el.addClass("ffw-file-icon--emoji");
  }
  if (color)
    el.style.color = color;
}
function ffwFormatValue(v) {
  if (v == null)
    return "";
  if (typeof v === "string")
    return v;
  if (typeof v === "number" || typeof v === "boolean")
    return String(v);
  try {
    return JSON.stringify(v);
  } catch (e) {
    return "";
  }
}
function ffwNormalizeTag(tag) {
  return (tag || "").trim().replace(/^#/, "").toLowerCase();
}
function ffwEvalTagFilter(cache, filter) {
  var _a;
  const tag = ffwNormalizeTag(filter.tag);
  if (!tag)
    return true;
  const allTags = cache ? ((_a = (0, import_obsidian8.getAllTags)(cache)) != null ? _a : []).map(ffwNormalizeTag) : [];
  const has = allTags.includes(tag);
  return filter.include ? has : !has;
}
function ffwEvalFrontmatterFilter(cache, filter) {
  if (!filter.key)
    return true;
  const fm = cache == null ? void 0 : cache.frontmatter;
  if (!fm)
    return filter.comparison === "not-equals";
  const raw = fm[filter.key];
  if (filter.comparison === "exists")
    return raw != null && raw !== "";
  if (raw == null)
    return filter.comparison === "not-equals";
  const needle = filter.value.trim().toLowerCase();
  const values = Array.isArray(raw) ? raw.map(ffwFormatValue) : [ffwFormatValue(raw)];
  switch (filter.comparison) {
    case "equals":
      return values.some((v) => v.toLowerCase() === needle);
    case "not-equals":
      return !values.some((v) => v.toLowerCase() === needle);
    case "contains":
      return values.some((v) => v.toLowerCase().includes(needle));
    default:
      return true;
  }
}
function ffwEvalPathFilter(file, filter) {
  if (!filter.pattern)
    return true;
  const path = file.path;
  const pattern = filter.pattern;
  let matches;
  switch (filter.matchMode) {
    case "starts-with":
      matches = path.startsWith(pattern);
      break;
    case "ends-with":
      matches = path.endsWith(pattern);
      break;
    case "equals":
      matches = path === pattern;
      break;
    case "contains":
      matches = path.includes(pattern);
      break;
    default:
      matches = false;
  }
  return filter.negate ? !matches : matches;
}
function ffwEvalNameFilter(file, filter) {
  if (!filter.pattern)
    return true;
  const name = filter.caseSensitive ? file.basename : file.basename.toLowerCase();
  const pattern = filter.caseSensitive ? filter.pattern : filter.pattern.toLowerCase();
  let matches;
  switch (filter.matchMode) {
    case "contains":
      matches = name.includes(pattern);
      break;
    case "starts-with":
      matches = name.startsWith(pattern);
      break;
    case "ends-with":
      matches = name.endsWith(pattern);
      break;
    case "regex":
      try {
        matches = new RegExp(filter.pattern, filter.caseSensitive ? "" : "i").test(file.basename);
      } catch (e) {
        matches = false;
      }
      break;
    default:
      matches = false;
  }
  return filter.negate ? !matches : matches;
}
function ffwApplyFilter(file, cache, filter) {
  switch (filter.type) {
    case "tag":
      return ffwEvalTagFilter(cache, filter);
    case "frontmatter":
      return ffwEvalFrontmatterFilter(cache, filter);
    case "path":
      return ffwEvalPathFilter(file, filter);
    case "name":
      return ffwEvalNameFilter(file, filter);
    default:
      return true;
  }
}
function ffwGetFrontmatterSortValue(app, file, key) {
  var _a;
  const fm = (_a = app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter;
  if (!fm)
    return void 0;
  const val = fm[key];
  if (val == null || val === "")
    return void 0;
  return typeof val === "number" || typeof val === "string" ? val : Array.isArray(val) ? val.map(ffwFormatValue).join(", ") : ffwFormatValue(val);
}
function ffwSortFiles(files, app, sort) {
  const arr = files.slice();
  switch (sort.field) {
    case "created-desc":
      return arr.sort((a, b) => b.stat.ctime - a.stat.ctime);
    case "created-asc":
      return arr.sort((a, b) => a.stat.ctime - b.stat.ctime);
    case "modified-desc":
      return arr.sort((a, b) => b.stat.mtime - a.stat.mtime);
    case "modified-asc":
      return arr.sort((a, b) => a.stat.mtime - b.stat.mtime);
    case "name-asc":
      return arr.sort((a, b) => a.basename.localeCompare(b.basename, void 0, { sensitivity: "base" }));
    case "name-desc":
      return arr.sort((a, b) => b.basename.localeCompare(a.basename, void 0, { sensitivity: "base" }));
    case "frontmatter-asc":
    case "frontmatter-desc": {
      const key = sort.frontmatterKey;
      if (!key)
        return arr;
      const dir = sort.field === "frontmatter-asc" ? 1 : -1;
      return arr.sort((a, b) => {
        const va = ffwGetFrontmatterSortValue(app, a, key);
        const vb = ffwGetFrontmatterSortValue(app, b, key);
        if (va === void 0 && vb === void 0)
          return 0;
        if (va === void 0)
          return 1;
        if (vb === void 0)
          return -1;
        if (typeof va === "number" && typeof vb === "number")
          return (va - vb) * dir;
        return String(va).localeCompare(String(vb), void 0, { sensitivity: "base" }) * dir;
      });
    }
    default:
      return arr;
  }
}
function ffwGetSectionFiles(app, section) {
  const files = app.vault.getMarkdownFiles().filter((file) => {
    const cache = app.metadataCache.getFileCache(file);
    return section.filters.every((filter) => ffwApplyFilter(file, cache, filter));
  });
  const sorted = ffwSortFiles(files, app, section.sort);
  return section.maxResults && section.maxResults > 0 ? sorted.slice(0, section.maxResults) : sorted;
}

// src/ui/filtered-file-modal.ts
var import_obsidian9 = require("obsidian");
var FilteredFileModal = class extends import_obsidian9.FuzzySuggestModal {
  constructor(app, files, typeName) {
    super(app);
    this.files = files;
    this.setPlaceholder(typeName ? `Search ${typeName}\u2026` : "Type to search filtered files\u2026");
    this.setInstructions([
      { command: "\u2191\u2193", purpose: "navigate" },
      { command: "\u21B5", purpose: "open" },
      { command: "esc", purpose: "dismiss" }
    ]);
  }
  getTitle(file) {
    var _a;
    const cache = this.app.metadataCache.getFileCache(file);
    const title = (_a = cache == null ? void 0 : cache.frontmatter) == null ? void 0 : _a["title"];
    return title ? stringifyFrontmatterValue2(title) : file.basename;
  }
  getItems() {
    return this.files;
  }
  getItemText(file) {
    return this.getTitle(file);
  }
  renderSuggestion(match, el) {
    var _a;
    const file = match.item;
    el.createSpan({ text: this.getTitle(file), cls: "suggestion-title" });
    const folder = (_a = file.parent) == null ? void 0 : _a.path;
    if (folder && folder !== "/") {
      el.createSpan({ text: folder, cls: "suggestion-note" });
    }
  }
  onChooseItem(file) {
    void this.app.workspace.getLeaf(false).openFile(file);
  }
};

// src/ui/new-note-modal.ts
var import_obsidian10 = require("obsidian");
var NewNoteModal = class extends import_obsidian10.Modal {
  constructor(app, noteType, onSubmit, initialTitle = "") {
    super(app);
    this.fieldValues = {};
    this.descriptionValue = "";
    this.noteType = noteType;
    this.onSubmit = onSubmit;
    this.titleValue = initialTitle;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ffc-new-note-modal");
    contentEl.createEl("h2", { text: `New ${this.noteType.name}` });
    new import_obsidian10.Setting(contentEl).setName("Title").addText((text) => {
      text.setPlaceholder(`Enter ${this.noteType.name} title\u2026`).setValue(this.titleValue).onChange((v) => {
        this.titleValue = v;
      });
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          this.submit();
        if (e.key === "Escape")
          this.close();
      });
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      }, 50);
    });
    const descSetting = new import_obsidian10.Setting(contentEl).setName("Description").setDesc("Added to the body of the created page").addTextArea((ta) => {
      ta.setPlaceholder("Optional description\u2026").onChange((v) => {
        this.descriptionValue = v;
      });
      ta.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape")
          this.close();
      });
    });
    renderFieldInputs(contentEl, this.app, this.noteType, this.fieldValues, () => this.submit(), descSetting.settingEl);
    new import_obsidian10.Setting(contentEl).addButton((btn) => btn.setButtonText("Create").setCta().onClick(() => this.submit())).addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }
  submit() {
    const title = this.titleValue.trim();
    if (!title) {
      new import_obsidian10.Notice("Please enter a title.");
      return;
    }
    this.close();
    void this.onSubmit(title, this.fieldValues, this.descriptionValue);
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/combined-new-note-modal.ts
var import_obsidian11 = require("obsidian");
var CombinedNewNoteModal = class extends import_obsidian11.Modal {
  constructor(app, noteTypes, onSubmit, initialTitle = "") {
    super(app);
    this.titleValue = "";
    this.fieldValues = {};
    this.descriptionValue = "";
    this.noteTypes = noteTypes;
    this.selectedType = noteTypes[0];
    this.onSubmit = onSubmit;
    this.initialTitle = initialTitle;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("ffc-new-note-modal");
    contentEl.createEl("h2", { text: "New note" });
    let descSettingEl = null;
    new import_obsidian11.Setting(contentEl).setName("Type").addDropdown((dd) => {
      for (const obj of this.noteTypes)
        dd.addOption(obj.id, obj.name);
      dd.setValue(this.selectedType.id);
      dd.onChange((id) => {
        var _a;
        this.selectedType = (_a = this.noteTypes.find((o) => o.id === id)) != null ? _a : this.noteTypes[0];
        this.fieldValues = {};
        renderFieldInputs(contentEl, this.app, this.selectedType, this.fieldValues, () => this.submit(), descSettingEl);
      });
    });
    new import_obsidian11.Setting(contentEl).setName("Title").addText((text) => {
      text.setPlaceholder("Enter title\u2026").setValue(this.initialTitle).onChange((v) => {
        this.titleValue = v;
      });
      this.titleValue = this.initialTitle;
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          this.submit();
        if (e.key === "Escape")
          this.close();
      });
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      }, 50);
    });
    const descSetting = new import_obsidian11.Setting(contentEl).setName("Description").setDesc("Added to the body of the created page").addTextArea((ta) => {
      ta.setPlaceholder("Optional description\u2026").onChange((v) => {
        this.descriptionValue = v;
      });
      ta.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Escape")
          this.close();
      });
    });
    descSettingEl = descSetting.settingEl;
    renderFieldInputs(contentEl, this.app, this.selectedType, this.fieldValues, () => this.submit(), descSettingEl);
    new import_obsidian11.Setting(contentEl).addButton((btn) => btn.setButtonText("Create").setCta().onClick(() => this.submit())).addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
  }
  submit() {
    const title = this.titleValue.trim();
    if (!title) {
      new import_obsidian11.Notice("Please enter a title.");
      return;
    }
    this.close();
    void this.onSubmit(this.selectedType, title, this.fieldValues, this.descriptionValue);
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/note-type-suggest.ts
var import_obsidian12 = require("obsidian");
var NoteTypeSuggest = class extends import_obsidian12.EditorSuggest {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onTrigger(cursor, editor) {
    const triggerKey = this.plugin.settings.triggerKey;
    if (!triggerKey)
      return null;
    const line = editor.getLine(cursor.line);
    const sub = line.substring(0, cursor.ch);
    const triggerIndex = sub.lastIndexOf(triggerKey);
    if (triggerIndex === -1)
      return null;
    const query = sub.substring(triggerIndex + triggerKey.length);
    const beforeTrigger = sub.substring(0, triggerIndex);
    if (beforeTrigger.includes("[[") && !beforeTrigger.includes("]]"))
      return null;
    return {
      start: { line: cursor.line, ch: triggerIndex },
      end: cursor,
      query
    };
  }
  getSuggestions(context) {
    const query = context.query.toLowerCase();
    const noteItems = this._getMatchingFiles().map((file) => {
      var _a;
      const cache = this.app.metadataCache.getFileCache(file);
      const title = ((_a = cache == null ? void 0 : cache.frontmatter) == null ? void 0 : _a["title"]) ? String(cache.frontmatter["title"]) : file.basename;
      return { kind: "note", file, title };
    }).filter(({ title }) => title.toLowerCase().includes(query)).sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(query) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.title.localeCompare(b.title);
    });
    const providerItems = [];
    for (const provider of this.plugin.triggerProviders.values()) {
      for (const item of provider.getItems(query)) {
        providerItems.push({ kind: "provider", provider, item });
      }
    }
    return [...noteItems, ...providerItems].slice(0, 30);
  }
  _getMatchingFiles() {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const noteType of this.plugin.settings.noteTypes) {
      if (!noteType.showInTriggerMenu)
        continue;
      for (const file of this.plugin.getNoteTypeFiles(noteType)) {
        if (!seen.has(file.path)) {
          seen.add(file.path);
          result.push(file);
        }
      }
    }
    return result;
  }
  renderSuggestion(suggestion, el) {
    var _a;
    if (suggestion.kind === "provider") {
      if (suggestion.provider.renderItem) {
        suggestion.provider.renderItem(suggestion.item, el);
      } else {
        el.createSpan({ text: suggestion.item.title, cls: "suggestion-title" });
        if (suggestion.item.subtitle) {
          el.createSpan({ text: suggestion.item.subtitle, cls: "suggestion-note" });
        }
      }
      return;
    }
    el.createSpan({ text: suggestion.title, cls: "suggestion-title" });
    const folder = (_a = suggestion.file.parent) == null ? void 0 : _a.path;
    if (folder && folder !== "/") {
      el.createSpan({ text: folder, cls: "suggestion-note" });
    }
  }
  selectSuggestion(suggestion) {
    const context = this.context;
    if (!context)
      return;
    if (suggestion.kind === "provider") {
      suggestion.provider.selectItem(
        suggestion.item,
        context.editor,
        context.start,
        context.end
      );
      return;
    }
    const { file, title } = suggestion;
    const link = title !== file.basename ? `[[${file.basename}|${title}]]` : `[[${file.basename}]]`;
    context.editor.replaceRange(link, context.start, context.end);
  }
};

// src/ui/note-preview-popup.ts
var NotePreviewPopup = class {
  constructor(plugin) {
    this.popup = null;
    this.hideTimer = null;
    this.showTimer = null;
    this._currentFile = null;
    this.plugin = plugin;
    this._onMouseOver = (e) => this._handleMouseOver(e);
    this._onMouseOut = (e) => this._handleMouseOut(e);
    document.addEventListener("mouseover", this._onMouseOver, true);
    document.addEventListener("mouseout", this._onMouseOut, true);
    const leafChangeRef = plugin.app.workspace.on("active-leaf-change", () => this.hide());
    plugin.registerEvent(leafChangeRef);
  }
  // ── Mouse event handlers ──────────────────────────────────────────────────────
  _handleMouseOver(e) {
    var _a, _b;
    if (this.popup && this.popup.contains(e.target))
      return;
    const el = e.target;
    let linkpath = null;
    const anchor = el.matches("a.internal-link[data-href]") ? el : el.closest("a.internal-link[data-href]");
    if (anchor) {
      linkpath = ((_a = anchor.getAttribute("data-href")) != null ? _a : "").split("#")[0].trim();
    }
    if (!linkpath) {
      const cmSpan = el.classList.contains("cm-hmd-internal-link") ? el : el.closest(".cm-hmd-internal-link");
      if (cmSpan) {
        linkpath = ((_b = cmSpan.textContent) != null ? _b : "").replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].split("#")[0].trim();
      }
    }
    if (!linkpath)
      return;
    const file = this.plugin.app.metadataCache.getFirstLinkpathDest(linkpath, "");
    if (!file)
      return;
    const noteType = this._getNoteTypeForFile(file);
    if (!noteType)
      return;
    if (this.hideTimer)
      window.clearTimeout(this.hideTimer);
    if (this.showTimer)
      window.clearTimeout(this.showTimer);
    if (this.popup && this._currentFile === file)
      return;
    const triggerEl = anchor != null ? anchor : el.closest(".cm-hmd-internal-link");
    this.showTimer = window.setTimeout(() => {
      void this._showForFile(file, noteType, e.clientX, e.clientY, triggerEl);
    }, 280);
  }
  _handleMouseOut(e) {
    if (this.showTimer)
      window.clearTimeout(this.showTimer);
    const toEl = e.relatedTarget;
    if (this.popup && toEl && this.popup.contains(toEl))
      return;
    this.hideTimer = window.setTimeout(() => this.hide(), 200);
  }
  // ── Build and position the popup ──────────────────────────────────────────────
  async _showForFile(file, noteType, clientX, clientY, triggerEl) {
    var _a, _b, _c, _d, _e, _f, _g;
    const hasFields = ((_b = (_a = noteType.previewFields) == null ? void 0 : _a.length) != null ? _b : 0) > 0;
    const hasImage = !!(noteType.showImageInPreview && noteType.imageKey);
    if (!hasFields && !hasImage)
      return;
    const app = this.plugin.app;
    const fm = (_d = (_c = app.metadataCache.getFileCache(file)) == null ? void 0 : _c.frontmatter) != null ? _d : {};
    const title = fm["title"] ? String(fm["title"]) : file.basename;
    this.hide();
    const popup = createDiv();
    popup.className = "ffc-preview-popup";
    if (hasImage && noteType.imageKey) {
      const rawImg = fm[noteType.imageKey];
      const imgSrc = rawImg ? await this._resolveImageSrc(String(rawImg).trim(), app) : null;
      if (imgSrc) {
        const imgEl = popup.createEl("img", { cls: "ffc-preview-image" });
        imgEl.src = imgSrc;
        imgEl.alt = title;
      }
    }
    const header = popup.createDiv({ cls: "ffc-preview-header" });
    header.createSpan({ text: title, cls: "ffc-preview-title" });
    popup.createEl("hr", { cls: "ffc-preview-divider" });
    const body = popup.createDiv({ cls: "ffc-preview-body" });
    let hasRows = false;
    const renderValue = (valueEl, str) => {
      const wikiMatch = String(str).match(/^\[\[(.+?)(?:\|(.+?))?\]\]$/);
      if (wikiMatch) {
        const linkPath = wikiMatch[1];
        const linkLabel = wikiMatch[2] || wikiMatch[1];
        const a = valueEl.createEl("a", { text: linkLabel, cls: "ffc-preview-wikilink internal-link" });
        a.dataset["href"] = linkPath;
        a.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.hide();
          void app.workspace.openLinkText(linkPath, "", false);
        });
      } else {
        valueEl.appendText(String(str));
      }
    };
    for (const pf of (_e = noteType.previewFields) != null ? _e : []) {
      const key = typeof pf === "string" ? pf : (_f = pf.key) != null ? _f : "";
      const label = (typeof pf === "string" ? pf : pf.label || pf.key) || key;
      if (!key)
        continue;
      const raw = fm[key];
      if (raw === void 0 || raw === null || raw === "")
        continue;
      const row = body.createDiv({ cls: "ffc-preview-row" });
      row.createSpan({ text: label, cls: "ffc-preview-label" });
      const valueEl = row.createSpan({ cls: "ffc-preview-value" });
      if (Array.isArray(raw)) {
        raw.forEach((item, i) => {
          if (i > 0)
            valueEl.appendText(", ");
          renderValue(valueEl, item);
        });
      } else {
        renderValue(valueEl, raw);
      }
      hasRows = true;
    }
    if (!hasRows) {
      body.remove();
      (_g = popup.querySelector(".ffc-preview-divider")) == null ? void 0 : _g.remove();
    }
    document.body.appendChild(popup);
    this.popup = popup;
    this._currentFile = file;
    popup.addEventListener("mouseenter", () => {
      if (this.hideTimer)
        window.clearTimeout(this.hideTimer);
    });
    popup.addEventListener("mouseleave", () => {
      this.hideTimer = window.setTimeout(() => this.hide(), 200);
    });
    popup.addEventListener("click", (e) => {
      if (e.target.closest(".ffc-preview-wikilink"))
        return;
      const fileToOpen = this._currentFile;
      this.hide();
      if (fileToOpen) {
        const newLeaf = e.metaKey || e.ctrlKey ? "tab" : false;
        void this.plugin.app.workspace.openLinkText(fileToOpen.basename, "", newLeaf);
      }
    });
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const positionPopup = () => {
      if (!this.popup)
        return;
      const pw = popup.offsetWidth || 280;
      const ph = popup.offsetHeight || 120;
      let left, top;
      const r = triggerEl ? triggerEl.getBoundingClientRect() : null;
      if (r && (r.width > 0 || r.height > 0)) {
        left = r.left;
        top = r.bottom + 6;
        if (top + ph > vh - margin)
          top = r.top - ph - 6;
        if (left + pw > vw - margin)
          left = vw - margin - pw;
      } else {
        left = clientX + margin;
        top = clientY + margin;
        if (left + pw > vw - margin)
          left = clientX - pw - margin;
        if (top + ph > vh - margin)
          top = clientY - ph - margin;
      }
      popup.style.left = `${Math.max(margin, left)}px`;
      popup.style.top = `${Math.max(margin, top)}px`;
    };
    window.requestAnimationFrame(positionPopup);
  }
  async _resolveImageSrc(rawValue, app) {
    if (!rawValue)
      return null;
    const v = rawValue.trim();
    if (!v)
      return null;
    if (/^https?:\/\//i.test(v))
      return v;
    const linkPath = v.replace(/^\[\[/, "").replace(/\]\]$/, "");
    const imageFile = app.metadataCache.getFirstLinkpathDest(linkPath, "");
    if (imageFile)
      return app.vault.getResourcePath(imageFile);
    return null;
  }
  _getNoteTypeForFile(file) {
    var _a, _b;
    for (const noteType of this.plugin.settings.noteTypes) {
      const hasContent = ((_b = (_a = noteType.previewFields) == null ? void 0 : _a.length) != null ? _b : 0) > 0 || noteType.showImageInPreview && noteType.imageKey;
      if (!hasContent)
        continue;
      const files = this.plugin.getNoteTypeFiles(noteType);
      if (files.some((f) => f.path === file.path))
        return noteType;
    }
    return null;
  }
  // ── Public API ────────────────────────────────────────────────────────────────
  hide() {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
    this._currentFile = null;
  }
  destroy() {
    this.hide();
    if (this.hideTimer)
      window.clearTimeout(this.hideTimer);
    if (this.showTimer)
      window.clearTimeout(this.showTimer);
    document.removeEventListener("mouseover", this._onMouseOver, true);
    document.removeEventListener("mouseout", this._onMouseOut, true);
  }
};

// src/ui/canvas-note-switcher.ts
var import_obsidian13 = require("obsidian");
var CanvasNoteSwitcher = class extends import_obsidian13.FuzzySuggestModal {
  constructor(app, plugin, canvas, dropPos) {
    super(app);
    this.plugin = plugin;
    this.canvas = canvas;
    this.dropPos = dropPos;
    this.setPlaceholder("Search notes\u2026");
    this.setInstructions([
      { command: "\u2191\u2193", purpose: "navigate" },
      { command: "\u21B5", purpose: "add to canvas" },
      { command: "esc", purpose: "dismiss" }
    ]);
    const seen = /* @__PURE__ */ new Set();
    this._items = [];
    for (const noteType of plugin.settings.noteTypes) {
      for (const file of plugin.getNoteTypeFiles(noteType)) {
        if (seen.has(file.path))
          continue;
        seen.add(file.path);
        this._items.push({ file, noteType });
      }
    }
  }
  getItems() {
    return this._items;
  }
  getItemText({ file, noteType }) {
    var _a, _b;
    const fm = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
    const title = fm["title"] ? String(fm["title"]) : file.basename;
    return `${title} ${file.basename} ${noteType.name}`;
  }
  renderSuggestion({ item: { file, noteType } }, el) {
    var _a, _b;
    const fm = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
    const title = fm["title"] ? String(fm["title"]) : file.basename;
    el.createSpan({ text: title, cls: "suggestion-title" });
    el.createSpan({ text: noteType.name, cls: "suggestion-note" });
  }
  onChooseItem({ file, noteType }) {
    this._createCanvasCard(file, noteType);
  }
  _createCanvasCard(file, noteType) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const fm = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
    const title = fm["title"] ? stringifyFrontmatterValue2(fm["title"]) : file.basename;
    const canvasFields = (_c = noteType.canvasFields) != null ? _c : [];
    let imageEmbed = "";
    if (noteType.showImageInCanvas && noteType.imageKey) {
      const rawImg = fm[noteType.imageKey];
      if (rawImg) {
        const v = stringifyFrontmatterValue2(rawImg).trim();
        if (/^https?:\/\//i.test(v)) {
          imageEmbed = `![](${v})
`;
        } else {
          const inner = v.replace(/^\[\[/, "").replace(/\]\]$/, "");
          imageEmbed = `![[${inner}]]
`;
        }
      }
    }
    let text = `${imageEmbed}**${title}**`;
    for (const pf of canvasFields) {
      const key = typeof pf === "string" ? pf : (_d = pf.key) != null ? _d : "";
      const label = typeof pf === "string" ? pf : pf.label || pf.key || key;
      if (!key)
        continue;
      const raw = fm[key];
      if (raw === void 0 || raw === null || raw === "")
        continue;
      const displayVal = Array.isArray(raw) ? raw.map(stringifyFrontmatterValue2).join(", ") : stringifyFrontmatterValue2(raw);
      text += `
${label}: ${displayVal}`;
    }
    text += `

[[${file.basename}]]`;
    const pos = (_e = this.dropPos) != null ? _e : this._getViewportCenter();
    const imageExtra = imageEmbed ? 200 : 0;
    const size = { width: 300, height: Math.max(160, 60 + canvasFields.length * 28 + imageExtra) };
    try {
      const node = this.canvas.createTextNode({
        pos: { x: pos.x - size.width / 2, y: pos.y - size.height / 2 },
        size,
        text,
        focus: false,
        save: true
      });
      (_g = (_f = this.canvas).deselectAll) == null ? void 0 : _g.call(_f);
      if (node)
        (_i = (_h = this.canvas).selectOnly) == null ? void 0 : _i.call(_h, node);
      new import_obsidian13.Notice(`Added "${title}" to canvas`);
    } catch (err) {
      new import_obsidian13.Notice(`Could not add card to canvas: ${err.message}`);
    }
  }
  _getViewportCenter() {
    var _a, _b, _c, _d, _e;
    try {
      const c = this.canvas;
      if (typeof c.getViewportBBox === "function") {
        const bb = c.getViewportBBox();
        return { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
      }
      const el = (_b = (_a = c.wrapperEl) != null ? _a : c.canvasEl) != null ? _b : c.containerEl;
      const rect = el == null ? void 0 : el.getBoundingClientRect();
      if (!rect)
        return { x: 0, y: 0 };
      const zoom = (_c = c.zoom) != null ? _c : 1;
      return {
        x: (rect.width / 2 - ((_d = c.x) != null ? _d : 0)) / zoom,
        y: (rect.height / 2 - ((_e = c.y) != null ? _e : 0)) / zoom
      };
    } catch (e) {
      return { x: 0, y: 0 };
    }
  }
};

// src/views/filtered-files-widget.ts
var import_obsidian15 = require("obsidian");

// src/views/ffw-section-edit-modal.ts
var import_obsidian14 = require("obsidian");
var FfwSectionEditModal = class extends import_obsidian14.Modal {
  constructor(app, section, onSave) {
    super(app);
    this.filtersContainer = null;
    this.frontmatterKeyContainer = null;
    this.isNew = section === null;
    this.working = section ? JSON.parse(JSON.stringify(section)) : { id: ffwNewSectionId(), title: "", filters: [ffwDefaultFilter("tag")], sort: ffwDefaultSort(), collapsed: false, maxResults: 0 };
    this.onSave = onSave;
  }
  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.addClass("ffw-modal");
    titleEl.setText(this.isNew ? "Add filter section" : "Edit filter section");
    new import_obsidian14.Setting(contentEl).setName("Title").setDesc("Shown as the section header in the widget.").addText(
      (text) => text.setPlaceholder("Active projects").setValue(this.working.title).onChange((v) => {
        this.working.title = v;
      })
    );
    contentEl.createEl("h3", { text: "Filters" });
    contentEl.createEl("p", { cls: "setting-item-description", text: "All filters must match. Add as many rows as you need." });
    this.filtersContainer = contentEl.createDiv({ cls: "ffw-filter-rows" });
    this.renderFilterRows();
    const addRow = contentEl.createDiv({ cls: "ffw-add-filter-row" });
    for (const type of ["tag", "frontmatter", "path", "name"]) {
      new import_obsidian14.ButtonComponent(addRow).setButtonText(`+ ${FFW_FILTER_TYPE_LABELS[type]}`).onClick(() => {
        this.working.filters.push(ffwDefaultFilter(type));
        this.renderFilterRows();
      });
    }
    contentEl.createEl("h3", { text: "Sort" });
    new import_obsidian14.Setting(contentEl).setName("Sort by").addDropdown((dd) => {
      for (const opt of FFW_SORT_OPTIONS)
        dd.addOption(opt.value, opt.label);
      dd.setValue(this.working.sort.field).onChange((v) => {
        this.working.sort.field = v;
        this.updateFrontmatterKeyVisibility();
      });
    });
    this.frontmatterKeyContainer = contentEl.createDiv();
    new import_obsidian14.Setting(this.frontmatterKeyContainer).setName("Frontmatter sort key").setDesc("Required when sorting by a frontmatter field.").addText(
      (text) => {
        var _a;
        return text.setPlaceholder("Due").setValue((_a = this.working.sort.frontmatterKey) != null ? _a : "").onChange((v) => {
          this.working.sort.frontmatterKey = v.trim() || void 0;
        });
      }
    );
    this.updateFrontmatterKeyVisibility();
    new import_obsidian14.Setting(contentEl).setName("Result limit").setDesc("Maximum number of files to show. 0 means unlimited.").addText(
      (text) => text.setPlaceholder("0").setValue(String(this.working.maxResults)).onChange((v) => {
        const n = parseInt(v, 10);
        this.working.maxResults = Number.isFinite(n) && n > 0 ? n : 0;
      })
    );
    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    new import_obsidian14.ButtonComponent(btnRow).setButtonText("Cancel").onClick(() => this.close());
    new import_obsidian14.ButtonComponent(btnRow).setButtonText(this.isNew ? "Add section" : "Save").setCta().onClick(() => this.handleSave());
  }
  onClose() {
    this.contentEl.empty();
  }
  updateFrontmatterKeyVisibility() {
    if (!this.frontmatterKeyContainer)
      return;
    const show = this.working.sort.field === "frontmatter-asc" || this.working.sort.field === "frontmatter-desc";
    this.frontmatterKeyContainer.style.display = show ? "" : "none";
  }
  renderFilterRows() {
    if (!this.filtersContainer)
      return;
    this.filtersContainer.empty();
    if (this.working.filters.length === 0) {
      this.filtersContainer.createEl("p", { cls: "setting-item-description ffw-empty", text: "No filters yet \u2014 add one below." });
      return;
    }
    this.working.filters.forEach((filter, idx) => {
      const row = this.filtersContainer.createDiv({ cls: "ffw-filter-row" });
      const typeSelect = row.createEl("select", { cls: "dropdown ffw-type-select" });
      for (const [val, label] of Object.entries(FFW_FILTER_TYPE_LABELS)) {
        const opt = typeSelect.createEl("option", { value: val, text: label });
        if (val === filter.type)
          opt.selected = true;
      }
      typeSelect.addEventListener("change", () => {
        if (typeSelect.value !== filter.type) {
          this.working.filters[idx] = ffwDefaultFilter(typeSelect.value);
          this.renderFilterRows();
        }
      });
      const inputsEl = row.createDiv({ cls: "ffw-filter-inputs" });
      this.renderFilterInputs(inputsEl, filter, idx);
      const removeBtn = row.createEl("button", { text: "\u2715", cls: "ffw-filter-remove" });
      removeBtn.setAttribute("aria-label", "Remove filter");
      removeBtn.addEventListener("click", () => {
        this.working.filters.splice(idx, 1);
        this.renderFilterRows();
      });
    });
  }
  renderFilterInputs(el, filter, idx) {
    switch (filter.type) {
      case "tag":
        this.renderTagInputs(el, filter, idx);
        break;
      case "frontmatter":
        this.renderFrontmatterInputs(el, filter, idx);
        break;
      case "path":
        this.renderPathInputs(el, filter, idx);
        break;
      case "name":
        this.renderNameInputs(el, filter, idx);
        break;
    }
  }
  renderTagInputs(el, filter, idx) {
    const modeSelect = el.createEl("select", { cls: "dropdown" });
    const inclOpt = modeSelect.createEl("option", { value: "include", text: "Has tag" });
    const exclOpt = modeSelect.createEl("option", { value: "exclude", text: "Does not have tag" });
    (filter.include ? inclOpt : exclOpt).selected = true;
    modeSelect.addEventListener("change", () => {
      this.working.filters[idx].include = modeSelect.value === "include";
    });
    const tagInput = el.createEl("input", { type: "text", placeholder: "e.g. project", value: filter.tag, cls: "ffw-text-input" });
    tagInput.addEventListener("input", () => {
      this.working.filters[idx].tag = tagInput.value;
    });
  }
  renderFrontmatterInputs(el, filter, idx) {
    const keyInput = el.createEl("input", { type: "text", placeholder: "key", value: filter.key, cls: "ffw-text-input" });
    keyInput.addEventListener("input", () => {
      this.working.filters[idx].key = keyInput.value;
    });
    const compSelect = el.createEl("select", { cls: "dropdown" });
    for (const { v, label } of [{ v: "equals", label: "=" }, { v: "not-equals", label: "\u2260" }, { v: "contains", label: "contains" }, { v: "exists", label: "exists" }]) {
      const opt = compSelect.createEl("option", { value: v, text: label });
      if (v === filter.comparison)
        opt.selected = true;
    }
    const valInput = el.createEl("input", { type: "text", placeholder: "value", value: filter.value, cls: "ffw-text-input" });
    valInput.disabled = filter.comparison === "exists";
    valInput.addEventListener("input", () => {
      this.working.filters[idx].value = valInput.value;
    });
    compSelect.addEventListener("change", () => {
      const comp = compSelect.value;
      this.working.filters[idx].comparison = comp;
      valInput.disabled = comp === "exists";
    });
  }
  renderPathInputs(el, filter, idx) {
    const negateSelect = el.createEl("select", { cls: "dropdown" });
    negateSelect.createEl("option", { value: "is", text: "is" }).selected = !filter.negate;
    negateSelect.createEl("option", { value: "is-not", text: "is not" }).selected = filter.negate;
    negateSelect.addEventListener("change", () => {
      this.working.filters[idx].negate = negateSelect.value === "is-not";
    });
    const modeSelect = el.createEl("select", { cls: "dropdown" });
    for (const { v, label } of [{ v: "starts-with", label: "starts with" }, { v: "contains", label: "contains" }, { v: "equals", label: "equals" }, { v: "ends-with", label: "ends with" }]) {
      const opt = modeSelect.createEl("option", { value: v, text: label });
      if (v === filter.matchMode)
        opt.selected = true;
    }
    modeSelect.addEventListener("change", () => {
      this.working.filters[idx].matchMode = modeSelect.value;
    });
    const patInput = el.createEl("input", { type: "text", placeholder: "e.g. Work/", value: filter.pattern, cls: "ffw-text-input" });
    patInput.addEventListener("input", () => {
      this.working.filters[idx].pattern = patInput.value;
    });
  }
  renderNameInputs(el, filter, idx) {
    const negateSelect = el.createEl("select", { cls: "dropdown" });
    negateSelect.createEl("option", { value: "is", text: "is" }).selected = !filter.negate;
    negateSelect.createEl("option", { value: "is-not", text: "is not" }).selected = filter.negate;
    negateSelect.addEventListener("change", () => {
      this.working.filters[idx].negate = negateSelect.value === "is-not";
    });
    const modeSelect = el.createEl("select", { cls: "dropdown" });
    for (const { v, label } of [{ v: "contains", label: "contains" }, { v: "starts-with", label: "starts with" }, { v: "ends-with", label: "ends with" }, { v: "regex", label: "regex" }]) {
      const opt = modeSelect.createEl("option", { value: v, text: label });
      if (v === filter.matchMode)
        opt.selected = true;
    }
    modeSelect.addEventListener("change", () => {
      this.working.filters[idx].matchMode = modeSelect.value;
    });
    const patInput = el.createEl("input", { type: "text", placeholder: "pattern", value: filter.pattern, cls: "ffw-text-input" });
    patInput.addEventListener("input", () => {
      this.working.filters[idx].pattern = patInput.value;
    });
    const caseLbl = el.createEl("label", { cls: "ffw-checkbox" });
    const caseCheck = caseLbl.createEl("input", { type: "checkbox" });
    caseCheck.checked = filter.caseSensitive;
    caseLbl.appendChild(document.createTextNode(" case sensitive"));
    caseCheck.addEventListener("change", () => {
      this.working.filters[idx].caseSensitive = caseCheck.checked;
    });
  }
  handleSave() {
    const title = this.working.title.trim();
    if (!title) {
      new import_obsidian14.Notice("Please enter a title for the section.");
      return;
    }
    if (this.working.filters.length === 0) {
      new import_obsidian14.Notice("Add at least one filter to the section.");
      return;
    }
    if ((this.working.sort.field === "frontmatter-asc" || this.working.sort.field === "frontmatter-desc") && !this.working.sort.frontmatterKey) {
      new import_obsidian14.Notice("Please specify a frontmatter key to sort by.");
      return;
    }
    this.working.title = title;
    this.onSave(this.working);
    this.close();
  }
};

// src/views/filtered-files-widget.ts
var FilteredFilesWidgetView = class extends import_obsidian15.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.query = "";
    this.rootEl = null;
    this.sectionsEl = null;
    this.dragSourceId = null;
    this.plugin = plugin;
    this.refresh = (0, import_obsidian15.debounce)(() => this.render(), 80, true);
  }
  getViewType() {
    return FFW_VIEW_TYPE;
  }
  getDisplayText() {
    return "Filtered files";
  }
  getIcon() {
    return "file-sliders";
  }
  async onOpen() {
    this.rootEl = this.containerEl.children[1];
    this.rootEl.empty();
    this.rootEl.addClass("ffw-root");
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.refresh()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refresh()));
    this.registerEvent(this.app.vault.on("create", () => this.refresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.refresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.refresh()));
    this.registerEvent(this.app.workspace.on("iconic:icon-changed", () => this.refresh()));
    this.render();
  }
  async onClose() {
    this.containerEl.empty();
  }
  render() {
    if (!this.rootEl)
      return;
    this.rootEl.empty();
    this.renderHeader(this.rootEl);
    this.sectionsEl = this.rootEl.createDiv({ cls: "ffw-sections" });
    this.renderSections();
  }
  renderHeader(el) {
    const row = el.createDiv({ cls: "ffw-header" }).createDiv({ cls: "ffw-search-row" });
    const search = new import_obsidian15.SearchComponent(row);
    search.setPlaceholder("Filter...");
    search.setValue(this.query);
    search.onChange((v) => {
      this.query = v;
      this.renderSections();
    });
    const addBtn = row.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Add filter section" } });
    (0, import_obsidian15.setIcon)(addBtn, "plus");
    addBtn.addEventListener("click", () => this.openAddModal());
  }
  renderSections() {
    if (!this.sectionsEl)
      return;
    this.sectionsEl.empty();
    const sections = this.plugin.settings.ffwSections;
    if (sections.length === 0) {
      const empty = this.sectionsEl.createDiv({ cls: "ffw-empty-state" });
      empty.createEl("p", { text: "No filter sections yet." });
      empty.createEl("p", { cls: "setting-item-description", text: "Use the + button above to create your first filter section." });
      return;
    }
    sections.forEach((section) => this.renderSection(section));
  }
  renderSection(section) {
    if (!this.sectionsEl)
      return;
    const sectionEl = this.sectionsEl.createDiv({ cls: "ffw-section" });
    sectionEl.dataset["sectionId"] = section.id;
    if (section.collapsed)
      sectionEl.addClass("is-collapsed");
    sectionEl.setAttr("draggable", "true");
    sectionEl.addEventListener("dragstart", (e) => this.handleDragStart(e, section.id));
    sectionEl.addEventListener("dragover", (e) => this.handleDragOver(e, sectionEl));
    sectionEl.addEventListener("dragleave", () => sectionEl.removeClass("is-drag-over"));
    sectionEl.addEventListener("drop", (e) => void this.handleDrop(e, section.id, sectionEl));
    sectionEl.addEventListener("dragend", () => this.clearDragState());
    const header = sectionEl.createDiv({ cls: "ffw-section-header" });
    const dragHandle = header.createSpan({ cls: "ffw-drag-handle" });
    (0, import_obsidian15.setIcon)(dragHandle, "grip-vertical");
    dragHandle.setAttr("aria-label", "Drag to reorder");
    const collapseToggle = header.createSpan({ cls: "ffw-collapse-toggle" });
    (0, import_obsidian15.setIcon)(collapseToggle, section.collapsed ? "chevron-right" : "chevron-down");
    collapseToggle.setAttr("aria-label", section.collapsed ? "Expand section" : "Collapse section");
    collapseToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.toggleCollapse(section);
    });
    const titleWrap = header.createDiv({ cls: "ffw-section-title-wrap" });
    titleWrap.createDiv({ cls: "ffw-section-title", text: section.title });
    titleWrap.createDiv({
      cls: "ffw-section-meta",
      text: `${section.filters.length} filter${section.filters.length === 1 ? "" : "s"} \xB7 ${ffwSortLabel(section.sort)}`
    });
    titleWrap.addEventListener("click", () => void this.toggleCollapse(section));
    const controls = header.createDiv({ cls: "ffw-section-controls" });
    this.addIconButton(controls, "more-vertical", "More actions", (e) => this.openSectionMenu(section, e));
    const body = sectionEl.createDiv({ cls: "ffw-section-body" });
    if (!section.collapsed) {
      try {
        const files = ffwGetSectionFiles(this.app, section);
        const filtered = this.query ? files.filter((f) => ffwFuzzyMatch(this.query, f.basename) || ffwFuzzyMatch(this.query, f.path)) : files;
        if (filtered.length === 0) {
          body.createDiv({ cls: "ffw-no-results", text: this.query ? "No files match the search." : "No files match the filters." });
          return;
        }
        const list = body.createDiv({ cls: "ffw-file-list" });
        filtered.forEach((f) => this.renderFileRow(list, f));
        if (files.length > filtered.length) {
          body.createDiv({ cls: "ffw-truncated", text: `${files.length - filtered.length} hidden by search` });
        }
      } catch (err) {
        body.createDiv({ cls: "ffw-error", text: `Error rendering section: ${err.message}` });
      }
    }
  }
  renderFileRow(el, file) {
    var _a, _b;
    const row = el.createDiv({ cls: "ffw-file-row" });
    const iconEl = row.createSpan({ cls: "ffw-file-icon" });
    const iconicIcon = ffwGetIconicIcon(this.app, file);
    if (iconicIcon == null ? void 0 : iconicIcon.icon) {
      ffwSetIconEl(iconEl, iconicIcon.icon, iconicIcon.color);
    } else {
      (0, import_obsidian15.setIcon)(iconEl, "file-text");
    }
    const labelEl = row.createDiv({ cls: "ffw-file-label" });
    const key = this.plugin.settings.ffwDisplayNameKey;
    const fmCache = key ? (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter : null;
    const displayName = key && (fmCache == null ? void 0 : fmCache[key]) != null ? String(fmCache[key]) : file.basename;
    labelEl.createDiv({ cls: "ffw-file-name", text: displayName });
    const folder = ((_b = file.parent) == null ? void 0 : _b.path) && file.parent.path !== "/" ? file.parent.path : "";
    if (folder)
      labelEl.createDiv({ cls: "ffw-file-path", text: folder });
    row.addEventListener("click", (e) => {
      void this.app.workspace.openLinkText(file.path, "", e.ctrlKey || e.metaKey);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new import_obsidian15.Menu();
      menu.addItem((item) => item.setTitle("Open").setIcon("file-text").onClick(() => this.app.workspace.openLinkText(file.path, "", false)));
      menu.addItem((item) => item.setTitle("Open in new tab").setIcon("file-plus").onClick(() => this.app.workspace.openLinkText(file.path, "", true)));
      menu.addItem((item) => item.setTitle("Reveal in file explorer").setIcon("folder").onClick(() => {
        var _a2, _b2;
        const fe = (_b2 = (_a2 = this.app.internalPlugins) == null ? void 0 : _a2.getPluginById) == null ? void 0 : _b2.call(_a2, "file-explorer");
        const inst = fe == null ? void 0 : fe.instance;
        if (inst == null ? void 0 : inst.revealInFolder) {
          try {
            inst.revealInFolder(file);
            return;
          } catch (e2) {
          }
        }
        new import_obsidian15.Notice("Could not reveal file in the file explorer.");
      }));
      menu.showAtMouseEvent(e);
    });
  }
  addIconButton(el, icon, label, onClick) {
    const btn = el.createEl("button", { cls: "clickable-icon" });
    (0, import_obsidian15.setIcon)(btn, icon);
    btn.setAttr("aria-label", label);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(e);
    });
  }
  openSectionMenu(section, e) {
    const menu = new import_obsidian15.Menu();
    menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(() => this.openEditModal(section)));
    menu.addItem((item) => item.setTitle("Duplicate").setIcon("copy").onClick(() => this.duplicateSection(section)));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle("Delete section").setIcon("trash").onClick(() => this.deleteSection(section.id)));
    menu.showAtMouseEvent(e);
  }
  openAddModal() {
    new FfwSectionEditModal(this.app, null, (section) => {
      this.plugin.settings.ffwSections.push(section);
      void this.persistAndRender();
    }).open();
  }
  openEditModal(section) {
    new FfwSectionEditModal(this.app, section, (updated) => {
      const idx = this.plugin.settings.ffwSections.findIndex((s) => s.id === section.id);
      if (idx >= 0) {
        this.plugin.settings.ffwSections[idx] = updated;
        void this.persistAndRender();
      }
    }).open();
  }
  async persistAndRender() {
    await this.plugin.saveSettings();
    this.renderSections();
  }
  async toggleCollapse(section) {
    section.collapsed = !section.collapsed;
    await this.plugin.saveSettings();
    this.renderSections();
  }
  async duplicateSection(section) {
    const copy = JSON.parse(JSON.stringify(section));
    copy.id = ffwNewSectionId();
    copy.title = `${section.title} (copy)`;
    const idx = this.plugin.settings.ffwSections.findIndex((s) => s.id === section.id);
    this.plugin.settings.ffwSections.splice(idx + 1, 0, copy);
    await this.plugin.saveSettings();
    this.renderSections();
  }
  async deleteSection(id) {
    const sections = this.plugin.settings.ffwSections;
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0)
      return;
    const [removed] = sections.splice(idx, 1);
    await this.plugin.saveSettings();
    this.renderSections();
    if (removed)
      new import_obsidian15.Notice(`Removed "${removed.title}"`);
  }
  // ── Drag-and-drop reorder ─────────────────────────────────────────────────────
  handleDragStart(e, id) {
    this.dragSourceId = id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
    }
  }
  handleDragOver(e, el) {
    if (!this.dragSourceId)
      return;
    e.preventDefault();
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = "move";
    el.addClass("is-drag-over");
  }
  async handleDrop(e, targetId, el) {
    e.preventDefault();
    el.removeClass("is-drag-over");
    const sourceId = this.dragSourceId;
    this.dragSourceId = null;
    if (!sourceId || sourceId === targetId)
      return;
    const sections = this.plugin.settings.ffwSections;
    const fromIdx = sections.findIndex((s) => s.id === sourceId);
    const toIdx = sections.findIndex((s) => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0)
      return;
    const [moved] = sections.splice(fromIdx, 1);
    if (!moved)
      return;
    const newIdx = sections.findIndex((s) => s.id === targetId);
    sections.splice(newIdx < 0 ? sections.length : newIdx, 0, moved);
    await this.plugin.saveSettings();
    this.renderSections();
  }
  clearDragState() {
    this.dragSourceId = null;
    this.containerEl.querySelectorAll(".ffw-section.is-drag-over").forEach((el) => el.classList.remove("is-drag-over"));
  }
};

// src/views/note-link-view-plugin.ts
var import_view = require("@codemirror/view");
var import_state = require("@codemirror/state");
var StatusIconWidget = class extends import_view.WidgetType {
  constructor(cls, svg) {
    super();
    this.cls = cls;
    this.svg = svg;
  }
  toDOM() {
    const span = createSpan();
    span.className = `ffc-status-icon ${this.cls}`;
    span.appendChild(this.svg);
    return span;
  }
  eq(other) {
    return other.cls === this.cls;
  }
  ignoreEvent() {
    return true;
  }
};
function buildNoteLinkViewPlugin(ffcPlugin) {
  return import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.build(view);
        this.applyFoldedLinkClasses(view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = this.build(update.view);
          this.applyFoldedLinkClasses(update.view);
        }
      }
      /**
       * When the cursor is outside a wikilink, Obsidian replaces CM6 spans with
       * a widget <a> element. Decoration.mark() doesn't reach those widgets, so
       * we apply the class directly to the DOM elements here.
       */
      applyFoldedLinkClasses(view) {
        const basenames = ffcPlugin.styledNoteBasenames;
        const previewBasenames = ffcPlugin.previewNoteBasenames;
        const hasStyled = basenames && basenames.size > 0;
        const hasPreview = previewBasenames && previewBasenames.size > 0;
        view.dom.querySelectorAll("a.internal-link[data-href]").forEach((el) => {
          var _a, _b;
          const href = ((_a = el.getAttribute("data-href")) != null ? _a : "").split("#")[0].trim();
          const basename = href.includes("/") ? (_b = href.split("/").pop()) != null ? _b : href : href;
          el.classList.toggle(
            "ffc-note-link",
            hasStyled && (basenames.has(href) || basenames.has(basename))
          );
          el.classList.toggle(
            "ffc-note-preview-link",
            hasPreview && (previewBasenames.has(href) || previewBasenames.has(basename))
          );
        });
      }
      build(view) {
        var _a, _b;
        const basenames = ffcPlugin.styledNoteBasenames;
        const previewBasenames = ffcPlugin.previewNoteBasenames;
        const statusMap = ffcPlugin.statusNoteMap;
        const hasStyled = basenames && basenames.size > 0;
        const hasPreview = previewBasenames && previewBasenames.size > 0;
        const hasStatus = statusMap && statusMap.size > 0;
        if (!hasStyled && !hasPreview && !hasStatus)
          return import_view.Decoration.none;
        const builder = new import_state.RangeSetBuilder();
        const text = view.state.doc.toString();
        const re = /\[\[([^\]|#\n]+)(?:[|#][^\]\n]*)?\]\]/g;
        let m;
        const selection = view.state.selection;
        while ((m = re.exec(text)) !== null) {
          const target = m[1].trim();
          const targetBasename = target.includes("/") ? (_a = target.split("/").pop()) != null ? _a : target : target;
          const isStyled = hasStyled && (basenames.has(target) || basenames.has(targetBasename));
          const isPreview = hasPreview && (previewBasenames.has(target) || previewBasenames.has(targetBasename));
          const linkFrom = m.index;
          const linkTo = m.index + m[0].length;
          const cursorOnLink = selection.ranges.some((r) => r.from <= linkTo && r.to >= linkFrom);
          if (isStyled || isPreview) {
            const cls = [isStyled ? "ffc-note-link" : "", isPreview ? "ffc-note-preview-link" : ""].filter(Boolean).join(" ");
            builder.add(linkFrom, linkTo, import_view.Decoration.mark({ class: cls }));
          }
          if (hasStatus && !cursorOnLink) {
            const rawStatus = (_b = statusMap.get(targetBasename)) != null ? _b : statusMap.get(target);
            if (rawStatus) {
              const cls = statusToClass(rawStatus);
              const svg = statusSvg(rawStatus);
              if (cls && svg) {
                builder.add(linkFrom + 2, linkFrom + 2, import_view.Decoration.widget({
                  widget: new StatusIconWidget(cls, svg),
                  side: -1
                }));
              }
            }
          }
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations }
  );
}

// src/main.ts
var FilteredFileCommandsPlugin = class extends import_obsidian16.Plugin {
  constructor() {
    super(...arguments);
    this.commandRefs = {};
    this.registeredCommandIds = /* @__PURE__ */ new Set();
    this.styledNoteBasenames = /* @__PURE__ */ new Set();
    this.styledNotePaths = /* @__PURE__ */ new Set();
    this.previewNoteBasenames = /* @__PURE__ */ new Set();
    this.previewNotePaths = /* @__PURE__ */ new Set();
    this.statusNoteMap = /* @__PURE__ */ new Map();
    // ── Trigger provider registry ─────────────────────────────────────────────────
    /**
     * External plugins can contribute items to the @ trigger menu by calling
     * registerTriggerProvider(). They should call unregisterTriggerProvider()
     * in their own onunload() to avoid holding a dead reference.
     */
    this.triggerProviders = /* @__PURE__ */ new Map();
    // ── Filtered Files Widget helpers ─────────────────────────────────────────────
    this.widgetRibbonEl = null;
  }
  registerTriggerProvider(provider) {
    this.triggerProviders.set(provider.id, provider);
  }
  unregisterTriggerProvider(id) {
    this.triggerProviders.delete(id);
  }
  // ── Lifecycle ─────────────────────────────────────────────────────────────────
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MyPluginSettingTab(this.app, this));
    this.registerView(FFW_VIEW_TYPE, (leaf) => new FilteredFilesWidgetView(leaf, this));
    if (this.settings.filteredWidgetEnabled) {
      this.refreshWidgetRibbonIcon();
      this.addCommand({
        id: "ffc-open-filtered-files-widget",
        name: "Open filtered files widget",
        callback: () => this.activateWidgetView()
      });
    }
    if (this.settings.filteredCommandsEnabled) {
      for (const cmd of this.settings.commands)
        this.registerFilterCommand(cmd);
    }
    for (const noteType of this.settings.noteTypes) {
      this.registerNoteTypeCommand(noteType);
      if (noteType.enableFindCommand)
        this.registerFindCommand(noteType);
    }
    this.registerNewNoteCommand();
    this.registerEditorSuggest(new NoteTypeSuggest(this.app, this));
    this.buildStyledNoteSet();
    this.previewPopup = new NotePreviewPopup(this);
    this.register(() => this.previewPopup.destroy());
    this.registerMarkdownPostProcessor((el) => {
      el.querySelectorAll("a.internal-link[data-href]").forEach((link) => {
        var _a, _b, _c;
        const href = ((_a = link.getAttribute("data-href")) != null ? _a : "").split("#")[0].trim();
        const basename = href.includes("/") ? (_b = href.split("/").pop()) != null ? _b : href : href;
        if (this.styledNoteBasenames.has(href) || this.styledNoteBasenames.has(basename)) {
          link.classList.add("ffc-note-link");
        }
        if (this.previewNoteBasenames.has(href) || this.previewNoteBasenames.has(basename)) {
          link.classList.add("ffc-note-preview-link");
        }
        const status = (_c = this.statusNoteMap.get(basename)) != null ? _c : this.statusNoteMap.get(href);
        if (status) {
          const svg = statusSvg(status);
          if (svg) {
            const span = createSpan();
            span.className = "ffc-status-icon";
            span.appendChild(svg);
            link.prepend(span);
          }
        }
      });
    });
    this.registerEditorExtension(buildNoteLinkViewPlugin(this));
    this.registerEvent(
      this.app.metadataCache.on("resolved", () => {
        this.buildStyledNoteSet();
        this.refreshNoteLinkStyles();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        var _a;
        const selection = (_a = editor.getSelection()) == null ? void 0 : _a.trim();
        if (!selection)
          return;
        const types = this.settings.noteTypes;
        if (types.length === 0)
          return;
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        menu.addItem((item) => {
          item.setTitle("Note from selection").setIcon("box-select");
          const submenu = item.setSubmenu();
          for (const noteType of types) {
            submenu.addItem((subItem) => {
              subItem.setTitle(noteType.name).onClick(() => {
                const current = this.settings.noteTypes.find((o) => o.id === noteType.id);
                if (!current) {
                  new import_obsidian16.Notice("Note type not found. Try reloading.");
                  return;
                }
                new NewNoteModal(
                  this.app,
                  current,
                  async (title, fv, desc) => {
                    editor.replaceRange(`[[${title}]]`, from, to);
                    await this.createNote(current, title, fv, desc);
                  },
                  selection
                ).open();
              });
            });
          }
        });
      })
    );
    this.injectCanvasButtons();
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        window.setTimeout(() => this.injectCanvasButtons(), 50);
      })
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        window.setTimeout(() => this.injectCanvasButtons(), 50);
      })
    );
  }
  // ── Canvas card menu button ───────────────────────────────────────────────────
  injectCanvasButtons() {
    this.app.workspace.iterateAllLeaves((leaf) => this._injectIntoCanvasLeaf(leaf));
  }
  _injectIntoCanvasLeaf(leaf) {
    var _a, _b, _c;
    const view = leaf == null ? void 0 : leaf.view;
    if (((_a = view == null ? void 0 : view.getViewType) == null ? void 0 : _a.call(view)) !== "canvas")
      return;
    const container = view.containerEl;
    const menuEl = container.querySelector(".canvas-card-menu");
    if (!menuEl || menuEl.querySelector(".ffc-canvas-note-btn"))
      return;
    const canvas = view.canvas;
    const btn = menuEl.createDiv({
      cls: "canvas-card-menu-button mod-draggable ffc-canvas-note-btn"
    });
    btn.setAttribute("aria-label", "Add note card");
    btn.setAttribute("data-tooltip-position", "top");
    (0, import_obsidian16.setIcon)(btn, "shapes");
    const wrapperEl = (_c = (_b = canvas.wrapperEl) != null ? _b : canvas.canvasEl) != null ? _c : container;
    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0)
        return;
      e.preventDefault();
      e.stopPropagation();
      const CARD_W = 300;
      const CARD_H = 160;
      let zoom = 1;
      const _wRect = wrapperEl.getBoundingClientRect();
      if (typeof canvas.getViewportBBox === "function" && _wRect.width > 0) {
        const _bb = canvas.getViewportBBox();
        const _canvasW = _bb.maxX - _bb.minX;
        if (_canvasW > 0)
          zoom = _wRect.width / _canvasW;
      } else {
        const _z = canvas.zoom;
        if (typeof _z === "number" && isFinite(_z) && _z > 0)
          zoom = _z;
      }
      const GHOST_W = CARD_W * zoom;
      const GHOST_H = CARD_H * zoom;
      const ghost = document.body.createDiv({ cls: "ffc-canvas-drop-ghost" });
      ghost.setAttribute("aria-hidden", "true");
      ghost.setCssProps({ "--ffc-ghost-w": `${GHOST_W}px`, "--ffc-ghost-h": `${GHOST_H}px` });
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;
      const onMouseMove = (me) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!dragging && Math.sqrt(dx * dx + dy * dy) >= 5) {
          dragging = true;
          ghost.classList.add("is-visible");
          btn.classList.add("is-dragging");
        }
        if (dragging) {
          ghost.setCssProps({ "--ffc-ghost-x": `${me.clientX}px`, "--ffc-ghost-y": `${me.clientY}px` });
        }
      };
      const onMouseUp = (ue) => {
        var _a2, _b2, _c2;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        ghost.remove();
        btn.classList.remove("is-dragging");
        if (!dragging) {
          new CanvasNoteSwitcher(this.app, this, canvas, null).open();
          return;
        }
        const rect = wrapperEl.getBoundingClientRect();
        if (ue.clientX < rect.left || ue.clientX > rect.right || ue.clientY < rect.top || ue.clientY > rect.bottom)
          return;
        let pos;
        const relX = ue.clientX - rect.left;
        const relY = ue.clientY - rect.top;
        if (typeof canvas.getViewportBBox === "function") {
          const bb = canvas.getViewportBBox();
          pos = {
            x: bb.minX + relX / rect.width * (bb.maxX - bb.minX),
            y: bb.minY + relY / rect.height * (bb.maxY - bb.minY)
          };
        } else {
          const z = (_a2 = canvas.zoom) != null ? _a2 : 1;
          pos = {
            x: (relX - ((_b2 = canvas.x) != null ? _b2 : 0)) / z,
            y: (relY - ((_c2 = canvas.y) != null ? _c2 : 0)) / z
          };
        }
        new CanvasNoteSwitcher(this.app, this, canvas, pos).open();
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }
  /** Add or remove the widget ribbon icon to match the current settings. */
  refreshWidgetRibbonIcon() {
    const shouldShow = this.settings.filteredWidgetEnabled && this.settings.filteredWidgetRibbon;
    if (shouldShow && !this.widgetRibbonEl) {
      this.widgetRibbonEl = this.addRibbonIcon(
        "file-sliders",
        "Open filtered files widget",
        () => this.activateWidgetView()
      );
    } else if (!shouldShow && this.widgetRibbonEl) {
      this.widgetRibbonEl.remove();
      this.widgetRibbonEl = null;
    }
  }
  async activateWidgetView() {
    var _a;
    const { workspace } = this.app;
    let leaf = (_a = workspace.getLeavesOfType(FFW_VIEW_TYPE)[0]) != null ? _a : null;
    if (!leaf) {
      const newLeaf = workspace.getLeftLeaf(false);
      if (newLeaf) {
        await newLeaf.setViewState({ type: FFW_VIEW_TYPE, active: true });
        leaf = newLeaf;
      }
    }
    if (leaf)
      await workspace.revealLeaf(leaf);
  }
  refreshWidgetViews() {
    this.app.workspace.getLeavesOfType(FFW_VIEW_TYPE).forEach((leaf) => {
      if (leaf.view instanceof FilteredFilesWidgetView)
        leaf.view.render();
    });
  }
  // ── Filtered file commands ────────────────────────────────────────────────────
  registerFilterCommand(cmd) {
    if (this.registeredCommandIds.has(cmd.id))
      return;
    const registered = this.addCommand({
      id: cmd.id,
      name: cmd.name,
      callback: () => {
        const current = this.settings.commands.find((c) => c.id === cmd.id);
        if (!current) {
          new import_obsidian16.Notice("Note Types: Command not found. Try reloading.");
          return;
        }
        const files = this.getFilteredFiles(current);
        if (files.length === 0) {
          new import_obsidian16.Notice("Note Types: No files match the current filters.");
          return;
        }
        new FilteredFileModal(this.app, files).open();
      }
    });
    this.commandRefs[cmd.id] = registered;
    this.registeredCommandIds.add(cmd.id);
  }
  getFilteredFiles(cmd) {
    const fileTypes = (cmd.fileTypes || "").split(",").map((e) => e.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);
    const allFiles = fileTypes.length > 0 ? this.app.vault.getFiles().filter((f) => fileTypes.includes(f.extension.toLowerCase())) : this.app.vault.getMarkdownFiles();
    if (!cmd.filters || cmd.filters.length === 0)
      return allFiles;
    return allFiles.filter((file) => {
      var _a, _b;
      const fm = (_b = (_a = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : {};
      const results = cmd.filters.map((f) => this.evaluateFilter(fm, f, file));
      return cmd.matchMode === "all" ? results.every(Boolean) : results.some(Boolean);
    });
  }
  getNoteTypeFiles(noteType) {
    var _a, _b;
    const filters = (_a = noteType.matchFilters) != null ? _a : [];
    const matchMode = (_b = noteType.matchMode) != null ? _b : "all";
    return this.app.vault.getMarkdownFiles().filter((file) => {
      var _a2, _b2, _c;
      if (filters.length > 0) {
        const fm = (_b2 = (_a2 = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _a2.frontmatter) != null ? _b2 : {};
        const results = filters.map((f) => this.evaluateFilter(fm, f, file));
        return matchMode === "all" ? results.every(Boolean) : results.some(Boolean);
      } else if ((_c = noteType.saveFolder) == null ? void 0 : _c.trim()) {
        const prefix = noteType.saveFolder.trim().replace(/\/$/, "") + "/";
        return file.path.startsWith(prefix);
      }
      return false;
    });
  }
  evaluateFilter(fm, filter, file) {
    const { key, operator, value } = filter;
    if (operator === "in_folder" || operator === "not_in_folder") {
      if (!file)
        return true;
      const folder = value.trim().replace(/\/$/, "");
      const inFolder = file.path.startsWith(folder + "/") || file.path === folder;
      return operator === "in_folder" ? inFolder : !inFolder;
    }
    if (!(key == null ? void 0 : key.trim()))
      return true;
    const raw = fm[key];
    switch (operator) {
      case "exists":
        return raw !== void 0 && raw !== null && raw !== "";
      case "equals":
        return Array.isArray(raw) ? raw.map(stringifyFrontmatterValue2).includes(value) : stringifyFrontmatterValue2(raw) === value;
      case "not_equals":
        return Array.isArray(raw) ? !raw.map(stringifyFrontmatterValue2).includes(value) : stringifyFrontmatterValue2(raw) !== value;
      case "contains":
        return Array.isArray(raw) ? raw.some((v) => stringifyFrontmatterValue2(v).toLowerCase().includes(value.toLowerCase())) : stringifyFrontmatterValue2(raw).toLowerCase().includes(value.toLowerCase());
      default:
        return true;
    }
  }
  // ── Note type commands ────────────────────────────────────────────────────────
  registerNoteTypeCommand(noteType) {
    const cmdId = `ffc-notetype-${noteType.commandSlug}`;
    if (this.registeredCommandIds.has(cmdId))
      return;
    const registered = this.addCommand({
      id: cmdId,
      name: `Create new ${noteType.name}`,
      callback: () => {
        const current = this.settings.noteTypes.find((o) => o.id === noteType.id);
        if (!current) {
          new import_obsidian16.Notice("Note type not found. Try reloading.");
          return;
        }
        new NewNoteModal(
          this.app,
          current,
          (title, fieldValues, description) => this.createNote(current, title, fieldValues, description)
        ).open();
      }
    });
    this.commandRefs[cmdId] = registered;
    this.registeredCommandIds.add(cmdId);
  }
  registerFindCommand(noteType) {
    const cmdId = `ffc-notetype-${noteType.commandSlug}-find`;
    if (this.registeredCommandIds.has(cmdId))
      return;
    const registered = this.addCommand({
      id: cmdId,
      name: `Find ${noteType.name}`,
      callback: () => {
        const current = this.settings.noteTypes.find((o) => o.id === noteType.id);
        if (!current) {
          new import_obsidian16.Notice("Note Types: Note type not found. Try reloading.");
          return;
        }
        const files = this.getNoteTypeFiles(current);
        if (files.length === 0) {
          new import_obsidian16.Notice("Note Types: No files match this note type.");
          return;
        }
        new FilteredFileModal(this.app, files, current.name).open();
      }
    });
    this.commandRefs[cmdId] = registered;
    this.registeredCommandIds.add(cmdId);
  }
  registerNewNoteCommand() {
    this.addCommand({
      id: "ffc-new-note",
      name: "New note",
      callback: () => {
        const types = this.settings.noteTypes;
        if (types.length === 0) {
          new import_obsidian16.Notice("No note types defined. Add one in the Note Types settings.");
          return;
        }
        if (types.length === 1) {
          new NewNoteModal(
            this.app,
            types[0],
            (title, fv, desc) => this.createNote(types[0], title, fv, desc)
          ).open();
          return;
        }
        new CombinedNewNoteModal(
          this.app,
          types,
          (noteType, title, fv, desc) => this.createNote(noteType, title, fv, desc)
        ).open();
      }
    });
    this.addCommand({
      id: "ffc-new-note-from-selection",
      name: "New note from selection",
      editorCallback: (editor) => {
        var _a;
        const types = this.settings.noteTypes;
        if (types.length === 0) {
          new import_obsidian16.Notice("No note types defined. Add one in the Note Types settings.");
          return;
        }
        const selection = (_a = editor.getSelection()) == null ? void 0 : _a.trim();
        const from = editor.getCursor("from");
        const to = editor.getCursor("to");
        const replaceWithLink = async (title) => {
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
      }
    });
  }
  // ── File creation ─────────────────────────────────────────────────────────────
  async createNote(noteType, title, fieldValues = {}, description = "") {
    var _a, _b;
    const saveFolder = (_b = (_a = noteType.saveFolder) == null ? void 0 : _a.trim()) != null ? _b : "";
    const filePath = saveFolder ? `${saveFolder}/${title}.md` : `${title}.md`;
    if (this.app.vault.getAbstractFileByPath(filePath)) {
      new import_obsidian16.Notice(`A file named "${title}" already exists at that location.`);
      return;
    }
    let content = "";
    if (noteType.templatePath) {
      const tplFile = this.app.vault.getAbstractFileByPath(noteType.templatePath);
      if (tplFile instanceof import_obsidian16.TFile) {
        content = await this.app.vault.read(tplFile);
      } else {
        new import_obsidian16.Notice(`Template not found: ${noteType.templatePath}`);
      }
    }
    const now = new Date();
    content = content.replace(/\{\{title\}\}/gi, title).replace(/\{\{date\}\}/gi, now.toISOString().split("T")[0]).replace(/\{\{time\}\}/gi, now.toTimeString().split(" ")[0]);
    content = this.injectFieldsIntoContent(content, noteType, fieldValues);
    if (description.trim()) {
      content = this.appendDescriptionToContent(content, description.trim());
    }
    if (saveFolder && !this.app.vault.getAbstractFileByPath(saveFolder)) {
      try {
        await this.app.vault.createFolder(saveFolder);
      } catch (e) {
      }
    }
    try {
      const newFile = await this.app.vault.create(filePath, content);
      const notice = new import_obsidian16.Notice("", 6e3);
      const frag = notice.messageEl.createSpan();
      frag.appendText("Created: ");
      const link = frag.createEl("a", { text: title, href: "#", cls: "ffc-notice-link" });
      link.addEventListener("click", (e) => {
        e.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(newFile);
        notice.hide();
      });
    } catch (err) {
      new import_obsidian16.Notice(`Failed to create file: ${err.message}`);
    }
  }
  injectFieldsIntoContent(content, noteType, fieldValues) {
    var _a, _b;
    const fields = ((_a = noteType.fields) != null ? _a : []).filter((f) => {
      var _a2;
      return (_a2 = f.key) == null ? void 0 : _a2.trim();
    });
    if (fields.length === 0)
      return content;
    for (const field of fields) {
      const raw = ((_b = fieldValues[field.key]) != null ? _b : "").trim();
      if (!raw)
        continue;
      if (field.type === "list") {
        const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
        content = this.upsertListInFrontmatter(content, field.key, items);
      } else {
        content = this.upsertTextInFrontmatter(content, field.key, raw);
      }
    }
    return content;
  }
  appendDescriptionToContent(content, description) {
    const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/);
    if (fmMatch) {
      const fmEnd = fmMatch.index + fmMatch[0].length;
      const body = content.slice(fmEnd);
      if (body.trim()) {
        return content.trimEnd() + "\n\n" + description + "\n";
      } else {
        return content.slice(0, fmEnd) + "\n" + description + "\n";
      }
    } else {
      return content.trim() ? content.trimEnd() + "\n\n" + description + "\n" : description + "\n";
    }
  }
  keyBlockRegex(esc) {
    return new RegExp(`^${esc}:[^\\n]*((?:\\r?\\n  - [^\\r\\n]*)*)`, "m");
  }
  upsertListInFrontmatter(content, key, newItems) {
    if (!newItems.length)
      return content;
    content = this.ensureFrontmatter(content);
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const yamlItem = (i) => /^\[\[.*\]\]$/.test(i) ? `"${i}"` : i;
    const inlineRe = new RegExp(`(^${esc}:\\s*\\[)([^\\]]*)(\\])`, "m");
    if (inlineRe.test(content)) {
      return content.replace(inlineRe, (_, open, body, close) => {
        const existing = body.split(",").map((s) => s.trim()).filter(Boolean);
        const merged = [.../* @__PURE__ */ new Set([...existing, ...newItems])];
        return `${open}${merged.map(yamlItem).join(", ")}${close}`;
      });
    }
    const blockRe = this.keyBlockRegex(esc);
    const m = content.match(blockRe);
    if (m) {
      const blockPart = m[1];
      let existing = [];
      if (blockPart.trim()) {
        existing = [...blockPart.matchAll(/- ([^\r\n]+)/g)].map((x) => x[1].trim());
      } else {
        const scalarVal = m[0].replace(new RegExp(`^${esc}:\\s*`), "").trim();
        if (scalarVal)
          existing = [scalarVal];
      }
      const merged = [.../* @__PURE__ */ new Set([...existing, ...newItems])];
      const replacement = `${key}:
` + merged.map((i) => `  - ${yamlItem(i)}`).join("\n");
      return content.replace(blockRe, replacement);
    }
    return content.replace(/^(---\r?\n)/, `$1${key}: [${newItems.map(yamlItem).join(", ")}]
`);
  }
  upsertTextInFrontmatter(content, key, value) {
    content = this.ensureFrontmatter(content);
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const yamlValue = /^\[\[.*\]\]$/.test(value) ? `"${value}"` : value;
    const blockRe = this.keyBlockRegex(esc);
    if (blockRe.test(content)) {
      return content.replace(blockRe, `${key}: ${yamlValue}`);
    }
    return content.replace(/^(---\r?\n)/, `$1${key}: ${yamlValue}
`);
  }
  ensureFrontmatter(content) {
    if (/^---\r?\n/.test(content))
      return content;
    return `---
---

${content}`;
  }
  // ── Template helpers ──────────────────────────────────────────────────────────
  getTemplatesFolder() {
    var _a, _b, _c, _d, _e;
    if (this.settings.templatesFolder)
      return this.settings.templatesFolder;
    try {
      const core = (_b = (_a = this.app.internalPlugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b["templates"];
      if (core == null ? void 0 : core.enabled)
        return (_e = (_d = (_c = core.instance) == null ? void 0 : _c.options) == null ? void 0 : _d.folder) != null ? _e : "";
    } catch (e) {
    }
    return "";
  }
  getTemplateFiles() {
    const folder = this.getTemplatesFolder();
    const allMd = this.app.vault.getMarkdownFiles();
    if (!folder)
      return allMd;
    const prefix = folder.endsWith("/") ? folder : folder + "/";
    return allMd.filter((f) => f.path.startsWith(prefix));
  }
  // ── Persistence ───────────────────────────────────────────────────────────────
  async loadSettings() {
    var _a;
    const raw = (_a = await this.loadData()) != null ? _a : {};
    if (raw.noteTypes === void 0 && Array.isArray(raw.objectTypes)) {
      raw.noteTypes = raw.objectTypes;
    }
    delete raw.objectTypes;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    if (!this.settings.noteTypes)
      this.settings.noteTypes = [];
    if (this.settings.templatesFolder === void 0)
      this.settings.templatesFolder = "";
    if (this.settings.triggerKey === void 0)
      this.settings.triggerKey = "";
    if (!Array.isArray(this.settings.ffwSections))
      this.settings.ffwSections = [];
    if (this.settings.ffwDisplayNameKey === void 0)
      this.settings.ffwDisplayNameKey = "";
    this.settings.ffwSections = this.settings.ffwSections.filter(
      (s) => s && typeof s === "object" && typeof s.id === "string" && typeof s.title === "string" && Array.isArray(s.filters) && !!s.sort
    );
    const takenSlugs = new Set(
      this.settings.noteTypes.filter((o) => o.commandSlug).map((o) => o.commandSlug)
    );
    let needsSave = false;
    for (const obj of this.settings.noteTypes) {
      if (!obj.fields) {
        obj.fields = [];
        needsSave = true;
      }
      if (!obj.matchFilters) {
        obj.matchFilters = [];
        needsSave = true;
      }
      if (!obj.matchMode) {
        obj.matchMode = "all";
        needsSave = true;
      }
      if (obj.enableFindCommand === void 0) {
        obj.enableFindCommand = false;
        needsSave = true;
      }
      if (obj.showInTriggerMenu === void 0) {
        obj.showInTriggerMenu = false;
        needsSave = true;
      }
      if (obj.styledLinks === void 0) {
        obj.styledLinks = false;
        needsSave = true;
      }
      if (!obj.previewFields) {
        obj.previewFields = [];
        needsSave = true;
      }
      if (!obj.canvasFields) {
        obj.canvasFields = [];
        needsSave = true;
      }
      if (!obj.imageKey) {
        obj.imageKey = "";
        needsSave = true;
      }
      if (obj.showImageInPreview === void 0) {
        obj.showImageInPreview = false;
        needsSave = true;
      }
      if (obj.showImageInCanvas === void 0) {
        obj.showImageInCanvas = false;
        needsSave = true;
      }
      if (!obj.commandSlug) {
        const base = nameToCommandSlug(obj.name);
        let slug = base;
        let n = 2;
        while (takenSlugs.has(slug))
          slug = `${base}-${n++}`;
        obj.commandSlug = slug;
        takenSlugs.add(slug);
        needsSave = true;
      }
    }
    if (needsSave)
      await this.saveSettings();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  // ── Note link styling ─────────────────────────────────────────────────────────
  buildStyledNoteSet() {
    var _a, _b, _c;
    this.styledNoteBasenames = /* @__PURE__ */ new Set();
    this.styledNotePaths = /* @__PURE__ */ new Set();
    this.previewNoteBasenames = /* @__PURE__ */ new Set();
    this.previewNotePaths = /* @__PURE__ */ new Set();
    this.statusNoteMap = /* @__PURE__ */ new Map();
    for (const noteType of this.settings.noteTypes) {
      const hasPreview = ((_a = noteType.previewFields) != null ? _a : []).length > 0;
      if (!noteType.styledLinks && !hasPreview && !noteType.showStatusInLinks)
        continue;
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
          const raw = (_c = (_b = this.app.metadataCache.getFileCache(file)) == null ? void 0 : _b.frontmatter) == null ? void 0 : _c["status"];
          if (typeof raw === "string" && VALID_STATUSES.has(raw)) {
            this.statusNoteMap.set(file.basename, raw);
          }
        }
      }
    }
  }
  refreshNoteLinkStyles() {
    document.querySelectorAll("a.internal-link[data-href]").forEach((link) => {
      var _a, _b;
      const href = ((_a = link.getAttribute("data-href")) != null ? _a : "").split("#")[0].trim();
      const basename = href.includes("/") ? (_b = href.split("/").pop()) != null ? _b : href : href;
      const isStyled = this.styledNoteBasenames.has(href) || this.styledNoteBasenames.has(basename);
      const isPreview = this.previewNoteBasenames.has(href) || this.previewNoteBasenames.has(basename);
      link.classList.toggle("ffc-note-link", isStyled);
      link.classList.toggle("ffc-note-preview-link", isPreview);
    });
  }
};
var main_default = FilteredFileCommandsPlugin;
