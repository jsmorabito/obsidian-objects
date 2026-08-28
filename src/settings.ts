import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
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
  fetchUrlTitles: false,
  ffwSections: [],
  ffwDisplayNameKey: '',
};

export class MyPluginSettingTab extends PluginSettingTab {
  plugin: FilteredFileCommandsPlugin;

  constructor(app: App, plugin: FilteredFileCommandsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Route declarative `control` reads/writes through the plugin's own store. */
  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  setControlValue(key: string, value: unknown): Promise<void> {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    return this.plugin.saveSettings();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = this.plugin.settings;

    return [
      // ── General ─────────────────────────────────────────────────────────────
      {
        name: 'Trigger key',
        desc: 'Character that opens the inline note picker while editing (e.g. "@"). Leave blank to disable.',
        render: (setting) => {
          setting.addText((text) => text
            .setPlaceholder('E.g. @')
            .setValue(s.triggerKey || '')
            .onChange(async (value) => {
              s.triggerKey = value.trim().slice(0, 1);
              await this.plugin.saveSettings();
            }));
        },
      },
      {
        name: 'Templates folder',
        desc: 'Folder holding your templates. Leave blank to auto-detect from the core Templates plugin.',
        control: { type: 'folder', key: 'templatesFolder', placeholder: 'Templates' },
      },
      {
        name: 'Fetch page title from URL',
        desc: 'When creating a note from a highlighted URL, fetch the linked page and use its title (makes a network request to that site).',
        control: { type: 'toggle', key: 'fetchUrlTitles' },
      },
      {
        name: 'Filtered file commands',
        desc: 'Create palette commands that open a fuzzy file picker filtered by frontmatter.',
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(s.filteredCommandsEnabled)
            .onChange(async (value) => {
              s.filteredCommandsEnabled = value;
              await this.plugin.saveSettings();
              this.update();
            }));
        },
      },
      {
        name: 'Filtered files widget',
        desc: 'A sidebar panel that shows lists of files matching configurable filter rules.',
        render: (setting) => {
          setting.addToggle((toggle) => toggle
            .setValue(s.filteredWidgetEnabled)
            .onChange(async (value) => {
              s.filteredWidgetEnabled = value;
              await this.plugin.saveSettings();
              this.plugin.refreshWidgetRibbonIcon();
              this.update();
            }));
        },
      },

      // ── Note types ─────────────────────────────────────────────────────────
      {
        type: 'list',
        heading: 'Definitions',
        emptyState: 'No note types defined yet.',
        addItem: {
          name: 'Add note type',
          action: () => { void this.addNoteType(); },
        },
        onReorder: (from, to) => {
          const list = s.noteTypes;
          const [moved] = list.splice(from, 1);
          list.splice(to, 0, moved);
          void this.plugin.saveSettings();
          this.update();
        },
        onDelete: (index) => {
          new NoteTypeDeleteModal(this.app, this.plugin, index, () => this.update()).open();
        },
        // Rows are `action` items, not `type: 'page'` — Obsidian's list renderer
        // skips the delete/reorder affordances on page rows, so navigation to the
        // sub-page is done by hand in `openNoteTypePage`.
        items: s.noteTypes.map((obj) => {
          const slugMismatch = obj.commandSlug !== nameToCommandSlug(obj.name);
          const desc = [obj.description, slugMismatch ? '⚠ command ID no longer matches the name' : '']
            .filter(Boolean).join(' · ');
          return {
            name: obj.name || 'Untitled note type',
            desc: desc || undefined,
            searchable: false,
            action: (_el: HTMLElement, index: number) => this.openNoteTypePage(index),
          };
        }),
      },

      // ── Filtered file commands ─────────────────────────────────────────────
      {
        type: 'list',
        heading: 'Filtered file commands',
        visible: () => s.filteredCommandsEnabled,
        emptyState: 'No filtered commands defined yet.',
        addItem: {
          name: 'Add filtered command',
          action: () => { void this.addFilteredCommand(); },
        },
        onReorder: (from, to) => {
          const list = s.commands;
          const [moved] = list.splice(from, 1);
          list.splice(to, 0, moved);
          void this.plugin.saveSettings();
          this.update();
        },
        onDelete: (index) => {
          new FilteredCommandDeleteModal(this.app, this.plugin, index, () => this.update()).open();
        },
        items: s.commands.map((cmd, i) => {
          const n = cmd.filters.length;
          const desc = `${n} filter${n === 1 ? '' : 's'}${cmd.fileTypes ? ` · ${cmd.fileTypes}` : ''}`;
          return {
            name: cmd.name || 'Untitled command',
            desc,
            action: () => {
              new FilteredCommandSettingsModal(this.app, this.plugin, i, () => this.update()).open();
            },
          };
        }),
      },

      // ── Filtered files widget ─────────────────────────────────────────────
      {
        type: 'group',
        heading: 'Filtered files widget',
        visible: () => s.filteredWidgetEnabled,
        items: [
          {
            name: 'Show ribbon icon',
            desc: 'Add a button to the left ribbon that opens the filtered files widget.',
            render: (setting) => {
              setting.addToggle((toggle) => toggle
                .setValue(s.filteredWidgetRibbon)
                .onChange(async (value) => {
                  s.filteredWidgetRibbon = value;
                  await this.plugin.saveSettings();
                  this.plugin.refreshWidgetRibbonIcon();
                }));
            },
          },
          {
            name: 'Open the widget',
            desc: 'Reveal the filtered files widget in the left sidebar.',
            action: () => { void this.plugin.activateWidgetView(); },
          },
          {
            name: 'Display name frontmatter key',
            desc: 'Show a frontmatter value instead of the filename in the widget (e.g. "title"). Leave blank to use the filename.',
            render: (setting) => {
              setting.addText((text) => text
                .setPlaceholder('E.g. title')
                .setValue(s.ffwDisplayNameKey)
                .onChange(async (value) => {
                  s.ffwDisplayNameKey = value.trim();
                  await this.plugin.saveSettings();
                  this.plugin.refreshWidgetViews();
                }));
            },
          },
          {
            name: 'Reset all filter sections',
            desc: 'Remove every filter section from the widget. This cannot be undone.',
            render: (setting) => {
              setting.addButton((btn) => btn
                .setButtonText('Reset')
                .setDestructive()
                .onClick(async () => {
                  s.ffwSections = [];
                  await this.plugin.saveSettings();
                  this.plugin.refreshWidgetViews();
                }));
            },
          },
        ],
      },
    ];
  }

  /**
   * Open a note type's editor as a settings sub-page. `app.setting.openPage` is
   * the same call Obsidian's own list renderer makes for `type: 'page'` rows; we
   * invoke it directly because our rows are `action` rows (see the note types
   * list above).
   */
  private openNoteTypePage(index: number): void {
    const settingModal = (this.app as unknown as { setting?: { openPage?: (page: unknown) => void } }).setting;
    const page = new NoteTypeSettingsPage(this.plugin, index, () => this.update());
    if (settingModal?.openPage) {
      settingModal.openPage(page);
    } else {
      console.error('Note Types: could not open the note type sub-page (app.setting.openPage unavailable).');
    }
  }

  private async addNoteType(): Promise<void> {
    const s = this.plugin.settings;
    const id         = `ffc-notetype-${Date.now()}`;
    const takenSlugs = new Set(s.noteTypes.map((o) => o.commandSlug).filter(Boolean));
    const baseSlug   = nameToCommandSlug('New Note');
    let newSlug = baseSlug; let slugN = 2;
    while (takenSlugs.has(newSlug)) newSlug = `${baseSlug}-${slugN++}`;
    s.noteTypes.push({
      id, commandSlug: newSlug, name: 'New Note', templatePath: '', saveFolder: '',
      fields: [], matchFilters: [], matchMode: 'all', enableFindCommand: false,
      showInTriggerMenu: false, previewFields: [], canvasFields: [],
    });
    await this.plugin.saveSettings();
    this.plugin.registerNoteTypeCommand(s.noteTypes[s.noteTypes.length - 1]);
    this.update();
  }

  private async addFilteredCommand(): Promise<void> {
    const s = this.plugin.settings;
    const id = `ffc-command-${Date.now()}`;
    s.commands.push({ id, name: 'New Filtered Command', matchMode: 'all', filters: [] });
    await this.plugin.saveSettings();
    this.plugin.registerFilterCommand(s.commands[s.commands.length - 1]);
    this.update();
  }
}
