import { App, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type { FilteredFileCommandsPlugin } from './main.ts';
import { PluginSettings } from './types.ts';
import { NoteTypeSettingsPage } from './ui/note-type-settings-page.ts';
import { NoteTypeDeleteModal } from './ui/note-type-delete-modal.ts';
import { FilteredCommandSettingsModal } from './ui/filtered-command-settings-modal.ts';
import { FilteredCommandDeleteModal } from './ui/filtered-command-delete-modal.ts';
import { nameToCommandSlug } from './utils/helpers.ts';

export const DEFAULT_SETTINGS: PluginSettings = {
  commands: [],
  filteredCommandsEnabled: false,
  filteredWidgetEnabled: false,
  filteredWidgetRibbon: false,
  noteTypes: [],
  templatesFolder: '',
  triggerKey: '',
  ffwSections: [],
  ffwDisplayNameKey: '',
};

export class MyPluginSettingTab extends PluginSettingTab {
  plugin: FilteredFileCommandsPlugin;

  constructor(app: App, plugin: FilteredFileCommandsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private filteredCmdsSectionEl?: HTMLElement;
  private filteredWidgetSectionEl?: HTMLElement;
  private activeNoteType: number | null = null;

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ffc-settings');
    this.filteredCmdsSectionEl = undefined;
    this.filteredWidgetSectionEl = undefined;

    if (this.activeNoteType !== null) {
      this.renderNoteTypePage(containerEl, this.activeNoteType);
      return;
    }

    new Setting(containerEl)
      .setName('Trigger key')
      .setDesc('Character that opens the inline note picker while editing (e.g. "@"). Leave blank to disable.')
      .addText((text) =>
        text
          .setPlaceholder('E.g. @')
          .setValue(this.plugin.settings.triggerKey || '')
          .onChange(async (value) => {
            this.plugin.settings.triggerKey = value.trim().slice(0, 1);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Templates folder')
      .setDesc('Path to your templates folder (e.g. "Templates"). Leave blank to auto-detect from the core Templates plugin.')
      .addText((text) =>
        text.setPlaceholder('Templates').setValue(this.plugin.settings.templatesFolder || '')
          .onChange(async (value) => {
            this.plugin.settings.templatesFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    const filteredCmdsSetting = new Setting(containerEl)
      .setName('Filtered file commands')
      .setDesc('Create palette commands that open a fuzzy file picker filtered by frontmatter.');
    if (this.plugin.settings.filteredCommandsEnabled) {
      filteredCmdsSetting.addExtraButton((btn) =>
        btn.setIcon('arrow-down').setTooltip('Jump to filtered file commands').onClick(() => {
          this.filteredCmdsSectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
      );
    }
    filteredCmdsSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.filteredCommandsEnabled)
        .onChange(async (value) => {
          this.plugin.settings.filteredCommandsEnabled = value;
          await this.plugin.saveSettings();
          this.display();
        })
    );

    const filteredWidgetSetting = new Setting(containerEl)
      .setName('Filtered files widget')
      .setDesc('A sidebar panel that shows lists of files matching configurable filter rules.');
    if (this.plugin.settings.filteredWidgetEnabled) {
      filteredWidgetSetting.addExtraButton((btn) =>
        btn.setIcon('arrow-down').setTooltip('Jump to filtered files widget').onClick(() => {
          this.filteredWidgetSectionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
      );
    }
    filteredWidgetSetting.addToggle((toggle) =>
      toggle
        .setValue(this.plugin.settings.filteredWidgetEnabled)
        .onChange(async (value) => {
          this.plugin.settings.filteredWidgetEnabled = value;
          await this.plugin.saveSettings();
          this.plugin.refreshWidgetRibbonIcon();
          this.display();
        })
    );

    containerEl.createEl('hr', { cls: 'ffc-divider' });

    // ── Note Types ────────────────────────────────────────────────────────────
    const objTypesHeader = containerEl.createDiv({ cls: 'ffc-section-header' });
    new Setting(objTypesHeader).setName('Definitions').setHeading();
    const addObjTypeBtn = objTypesHeader.createEl('button', {
      cls: 'clickable-icon ffc-btn-add',
      attr: { title: 'Add note type', 'aria-label': 'Add note type' },
    });
    setIcon(addObjTypeBtn, 'plus');
    addObjTypeBtn.onclick = async () => {
      const id          = `ffc-notetype-${Date.now()}`;
      const takenSlugs  = new Set(this.plugin.settings.noteTypes.map((o) => o.commandSlug).filter(Boolean));
      const baseSlug    = nameToCommandSlug('New Note');
      let newSlug = baseSlug; let slugN = 2;
      while (takenSlugs.has(newSlug)) newSlug = `${baseSlug}-${slugN++}`;
      this.plugin.settings.noteTypes.push({
        id, commandSlug: newSlug, name: 'New Note', templatePath: '', saveFolder: '',
        fields: [], matchFilters: [], matchMode: 'all', enableFindCommand: false,
        showInTriggerMenu: false, previewFields: [], canvasFields: [],
      });
      await this.plugin.saveSettings();
      this.plugin.registerNoteTypeCommand(this.plugin.settings.noteTypes[this.plugin.settings.noteTypes.length - 1]);
      this.display();
    };

    const objTypesList = containerEl.createDiv({ cls: 'setting-group ffc-item-list' });
    if (this.plugin.settings.noteTypes.length === 0) {
      objTypesList.createEl('p', { text: 'No note types yet. Select + to add one.', cls: 'ffc-hint ffc-item-empty' });
    } else {
      for (let i = 0; i < this.plugin.settings.noteTypes.length; i++) {
        this.renderNoteTypeRow(objTypesList, i);
      }
    }

    containerEl.createEl('hr', { cls: 'ffc-divider' });

    // ── Filtered File Commands ────────────────────────────────────────────────
    if (this.plugin.settings.filteredCommandsEnabled) {
      this.filteredCmdsSectionEl = containerEl.createDiv();

      const filteredCmdsHeader = this.filteredCmdsSectionEl.createDiv({ cls: 'ffc-section-header' });
      new Setting(filteredCmdsHeader).setName('Filtered file commands').setHeading();
      const addCmdBtn = filteredCmdsHeader.createEl('button', {
        cls: 'clickable-icon ffc-btn-add',
        attr: { title: 'Add filtered command', 'aria-label': 'Add filtered command' },
      });
      setIcon(addCmdBtn, 'plus');
      addCmdBtn.onclick = async () => {
        const id = `ffc-command-${Date.now()}`;
        this.plugin.settings.commands.push({ id, name: 'New Filtered Command', matchMode: 'all', filters: [] });
        await this.plugin.saveSettings();
        this.plugin.registerFilterCommand(this.plugin.settings.commands[this.plugin.settings.commands.length - 1]);
        this.display();
      };

      const cmdList = this.filteredCmdsSectionEl.createDiv({ cls: 'setting-group ffc-item-list' });
      if (this.plugin.settings.commands.length === 0) {
        cmdList.createEl('p', { text: 'No filtered commands yet. Select + to add one.', cls: 'ffc-hint ffc-item-empty' });
      } else {
        for (let i = 0; i < this.plugin.settings.commands.length; i++) {
          this.renderFilteredCommandRow(cmdList, i);
        }
      }

      containerEl.createEl('hr', { cls: 'ffc-divider' });
    }

    // ── Filtered Files Widget ─────────────────────────────────────────────────
    if (this.plugin.settings.filteredWidgetEnabled) {
      this.filteredWidgetSectionEl = containerEl.createDiv();
      new Setting(this.filteredWidgetSectionEl).setName('Filtered files widget').setHeading();

      new Setting(this.filteredWidgetSectionEl)
        .setName('Show ribbon icon')
        .setDesc('Add a button to the left ribbon that opens the filtered files widget.')
        .addToggle((toggle) => toggle
          .setValue(this.plugin.settings.filteredWidgetRibbon)
          .onChange(async (value) => {
            this.plugin.settings.filteredWidgetRibbon = value;
            await this.plugin.saveSettings();
            this.plugin.refreshWidgetRibbonIcon();
          })
        );

      new Setting(this.filteredWidgetSectionEl)
        .setName('Open the widget')
        .setDesc('Reveal the filtered files widget in the left sidebar.')
        .addButton((btn) => btn.setButtonText('Open widget').setCta().onClick(() => {
          void this.plugin.activateWidgetView();
        }));

      new Setting(this.filteredWidgetSectionEl)
        .setName('Display name frontmatter key')
        .setDesc('Show a frontmatter value instead of the filename in the widget. Enter the key you use (e.g. "title"). Leave blank to use the filename.')
        .addText((text) => text
          .setPlaceholder('E.g. title')
          .setValue(this.plugin.settings.ffwDisplayNameKey)
          .onChange(async (v) => {
            this.plugin.settings.ffwDisplayNameKey = v.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshWidgetViews();
          })
        );

      new Setting(this.filteredWidgetSectionEl)
        .setName('Reset all filter sections')
        .setDesc('Remove every filter section from the widget. This cannot be undone.')
        .addButton((btn) => btn.setButtonText('Reset').setWarning().onClick(async () => {
          this.plugin.settings.ffwSections = [];
          await this.plugin.saveSettings();
          this.plugin.refreshWidgetViews();
        }));
    }
  }

  // ── Filtered command compact row ────────────────────────────────────────────────

  private renderFilteredCommandRow(containerEl: HTMLElement, index: number): void {
    const cmd = this.plugin.settings.commands[index];
    const row = containerEl.createDiv({ cls: 'ffc-item-row' });
    row.onclick = (e) => {
      if (!(e.target as Element).closest('.ffc-item-row-actions')) {
        new FilteredCommandSettingsModal(this.app, this.plugin, index, () => this.display()).open();
      }
    };

    const info = row.createDiv({ cls: 'ffc-item-row-info' });
    info.createDiv({ text: cmd.name || 'Unnamed', cls: 'ffc-item-row-name' });
    const filterCount = cmd.filters.length;
    const desc = `${filterCount} filter${filterCount === 1 ? '' : 's'}${cmd.fileTypes ? ` · ${cmd.fileTypes}` : ''}`;
    info.createDiv({ text: desc, cls: 'ffc-item-row-desc' });

    const actions = row.createDiv({ cls: 'ffc-item-row-actions' });

    const gearBtn = actions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit settings' } });
    setIcon(gearBtn, 'settings');
    gearBtn.onclick = () => {
      new FilteredCommandSettingsModal(this.app, this.plugin, index, () => this.display()).open();
    };

    const trashBtn = actions.createEl('button', { cls: 'clickable-icon ffc-btn-icon-danger', attr: { 'aria-label': 'Delete command' } });
    setIcon(trashBtn, 'trash-2');
    trashBtn.onclick = () => {
      new FilteredCommandDeleteModal(this.app, this.plugin, index, () => this.display()).open();
    };
  }

  // ── Note type compact row ─────────────────────────────────────────────────────

  private renderNoteTypeRow(containerEl: HTMLElement, index: number): void {
    const obj = this.plugin.settings.noteTypes[index];
    const row = containerEl.createDiv({ cls: 'ffc-item-row' });
    row.onclick = (e) => {
      if (!(e.target as Element).closest('.ffc-item-row-actions')) {
        this.activeNoteType = index;
        this.display();
      }
    };

    const info = row.createDiv({ cls: 'ffc-item-row-info' });
    info.createDiv({ text: obj.name || 'Unnamed', cls: 'ffc-item-row-name' });
    if (obj.description) {
      info.createDiv({ text: obj.description, cls: 'ffc-item-row-desc' });
    }

    const actions = row.createDiv({ cls: 'ffc-item-row-actions' });

    const gearBtn = actions.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Edit settings' } });
    setIcon(gearBtn, 'settings');
    gearBtn.onclick = () => {
      this.activeNoteType = index;
      this.display();
    };

    const trashBtn = actions.createEl('button', { cls: 'clickable-icon ffc-btn-icon-danger', attr: { 'aria-label': 'Delete note type' } });
    setIcon(trashBtn, 'trash-2');
    trashBtn.onclick = () => {
      new NoteTypeDeleteModal(this.app, this.plugin, index, () => this.display()).open();
    };
  }

  // ── Note type sub-page ────────────────────────────────────────────────────────

  private renderNoteTypePage(containerEl: HTMLElement, index: number): void {
    const obj = this.plugin.settings.noteTypes[index];
    if (!obj) { this.activeNoteType = null; this.display(); return; }

    const header = containerEl.createDiv({ cls: 'ffc-subpage-header' });
    const backBtn = header.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': 'Back' } });
    setIcon(backBtn, 'arrow-left');
    backBtn.onclick = () => {
      this.activeNoteType = null;
      this.display();
    };
    const titleEl = header.createSpan({ text: obj.name || 'Note type', cls: 'ffc-subpage-title' });

    const pageEl = containerEl.createDiv();
    new NoteTypeSettingsPage(this.app, this.plugin, index, (title) => { titleEl.textContent = title; }).render(pageEl);
  }
}
