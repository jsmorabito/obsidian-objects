import { App, Modal, Setting } from 'obsidian';
import type { FilteredFileCommandsPlugin } from '../main.ts';
import type { NoteField } from '../types.ts';

/**
 * Edits a single creation field on a note type. The field object is mutated in
 * place; `onDismiss` fires on close so the sub-page can redraw its summary row.
 */
export class NoteFieldModal extends Modal {
  private plugin: FilteredFileCommandsPlugin;
  private field: NoteField;
  private onDismiss: (() => void) | undefined;

  constructor(app: App, plugin: FilteredFileCommandsPlugin, field: NoteField, onDismiss?: () => void) {
    super(app);
    this.plugin    = plugin;
    this.field     = field;
    this.onDismiss = onDismiss;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ffc-item-modal');

    const field = this.field;

    contentEl.createEl('h2', { text: 'Creation field', cls: 'ffc-modal-title' });

    new Setting(contentEl)
      .setName('Label')
      .setDesc('Shown next to the input in the creation dialog.')
      .addText((text) => text
        .setPlaceholder('E.g. Status')
        .setValue(field.label ?? '')
        .onChange(async (value) => { field.label = value; await this.plugin.saveSettings(); }));

    new Setting(contentEl)
      .setName('Frontmatter key')
      .setDesc('Property key written into the new file.')
      .addText((text) => text
        .setPlaceholder('E.g. status')
        .setValue(field.key ?? '')
        .onChange(async (value) => { field.key = value.trim(); await this.plugin.saveSettings(); }));

    new Setting(contentEl)
      .setName('Type')
      .setDesc('List splits comma-separated input into a YAML array.')
      .addDropdown((dd) => dd
        .addOption('text', 'Text')
        .addOption('list', 'List')
        .setValue(field.type ?? 'text')
        .onChange(async (value) => { field.type = value as NoteField['type']; await this.plugin.saveSettings(); }));

    new Setting(contentEl).addButton((btn) => btn.setButtonText('Done').setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDismiss?.();
  }
}
