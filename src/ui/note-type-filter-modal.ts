import { App, Modal, Setting } from 'obsidian';
import type { FilteredFileCommandsPlugin } from '../main.ts';
import type { FilterSpec } from '../types.ts';

/**
 * Edits a single note-type detection filter. The filter object is mutated in
 * place; `onDismiss` fires on close so the sub-page can redraw its summary row.
 */
export class NoteTypeFilterModal extends Modal {
  private plugin: FilteredFileCommandsPlugin;
  private filter: FilterSpec;
  private onDismiss: (() => void) | undefined;

  constructor(app: App, plugin: FilteredFileCommandsPlugin, filter: FilterSpec, onDismiss?: () => void) {
    super(app);
    this.plugin    = plugin;
    this.filter    = filter;
    this.onDismiss = onDismiss;
  }

  onOpen(): void { this._render(); }

  private _render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ffc-item-modal');

    const filter   = this.filter;
    const isPathOp = filter.operator === 'in_folder' || filter.operator === 'not_in_folder';

    contentEl.createEl('h2', { text: 'Detection filter', cls: 'ffc-modal-title' });

    if (!isPathOp) {
      new Setting(contentEl)
        .setName('Property key')
        .setDesc('Frontmatter property to test on each file.')
        .addText((text) => text
          .setPlaceholder('E.g. type')
          .setValue(filter.key ?? '')
          .onChange(async (value) => { filter.key = value.trim(); await this.plugin.saveSettings(); }));
    }

    new Setting(contentEl)
      .setName('Condition')
      .setDesc('How the property is compared.')
      .addDropdown((dd) => dd
        .addOption('equals', 'Equals')
        .addOption('not_equals', 'Does not equal')
        .addOption('contains', 'Contains')
        .addOption('exists', 'Exists')
        .addOption('in_folder', 'In folder')
        .addOption('not_in_folder', 'Not in folder')
        .setValue(filter.operator)
        .onChange(async (value) => {
          filter.operator = value as FilterSpec['operator'];
          await this.plugin.saveSettings();
          this._render();
        }));

    if (filter.operator !== 'exists') {
      new Setting(contentEl)
        .setName(isPathOp ? 'Folder path' : 'Value')
        .setDesc(isPathOp
          ? 'Files under this path match (e.g. Projects/tasks).'
          : 'Value to compare the property against.')
        .addText((text) => text
          .setPlaceholder(isPathOp ? 'E.g. Projects/tasks' : 'Value')
          .setValue(filter.value ?? '')
          .onChange(async (value) => { filter.value = value; await this.plugin.saveSettings(); }));
    }

    new Setting(contentEl).addButton((btn) => btn.setButtonText('Done').setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDismiss?.();
  }
}
