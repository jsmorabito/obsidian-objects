import { App, Modal, Setting } from 'obsidian';
import type { FilteredFileCommandsPlugin } from '../main.ts';

/**
 * Edits a `{ key, label }` entry (a preview field or a canvas card field). The
 * entry object is mutated in place; `afterChange` runs after every edit (used to
 * refresh dependent styling), and `onDismiss` fires on close so the sub-page can
 * redraw its summary row.
 */
export class KeyLabelFieldModal extends Modal {
  private plugin: FilteredFileCommandsPlugin;
  private entry: { key: string; label: string };
  private heading: string;
  private afterChange: (() => void) | undefined;
  private onDismiss: (() => void) | undefined;

  constructor(
    app: App,
    plugin: FilteredFileCommandsPlugin,
    entry: { key: string; label: string },
    opts: { heading: string; afterChange?: () => void; onDismiss?: () => void },
  ) {
    super(app);
    this.plugin      = plugin;
    this.entry       = entry;
    this.heading     = opts.heading;
    this.afterChange = opts.afterChange;
    this.onDismiss   = opts.onDismiss;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ffc-item-modal');

    const entry = this.entry;

    contentEl.createEl('h2', { text: this.heading, cls: 'ffc-modal-title' });

    new Setting(contentEl)
      .setName('Display label')
      .setDesc('Leave blank to use the key name.')
      .addText((text) => text
        .setPlaceholder('E.g. Status')
        .setValue(entry.label ?? '')
        .onChange(async (value) => {
          entry.label = value;
          await this.plugin.saveSettings();
          this.afterChange?.();
        }));

    new Setting(contentEl)
      .setName('Frontmatter key')
      .setDesc('Property key whose value is shown.')
      .addText((text) => text
        .setPlaceholder('E.g. status')
        .setValue(entry.key ?? '')
        .onChange(async (value) => {
          entry.key = value.trim();
          await this.plugin.saveSettings();
          this.afterChange?.();
        }));

    new Setting(contentEl).addButton((btn) => btn.setButtonText('Done').setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDismiss?.();
  }
}
