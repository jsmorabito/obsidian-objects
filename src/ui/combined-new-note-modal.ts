import { App, Modal, Notice, Setting } from 'obsidian';
import { NoteType } from '../types.ts';
import { renderFieldInputs, sanitizeNoteTitle } from '../utils/helpers.ts';

export class CombinedNewNoteModal extends Modal {
  private noteTypes: NoteType[];
  private selectedType: NoteType;
  private onSubmit: (noteType: NoteType, title: string, fieldValues: Record<string, string>, description: string) => void | Promise<void>;
  private titleValue = '';
  private initialTitle: string;
  private fieldValues: Record<string, string> = {};
  private descriptionValue = '';
  private urlSelection: string;
  private titlePromise: Promise<string | null> | null;
  private titleTouched = false;

  constructor(
    app: App,
    noteTypes: NoteType[],
    onSubmit: (noteType: NoteType, title: string, fieldValues: Record<string, string>, description: string) => void | Promise<void>,
    initialTitle = '',
    urlSelection = '',
    titlePromise: Promise<string | null> | null = null,
  ) {
    super(app);
    this.noteTypes    = noteTypes;
    this.selectedType = noteTypes[0];
    this.onSubmit     = onSubmit;
    this.initialTitle = initialTitle;
    this.urlSelection = urlSelection;
    this.titlePromise = titlePromise;
    this.applyUrlPrefill();
  }

  /**
   * Seed the selected type's designated URL field with the highlighted URL, if
   * both are present. Re-run whenever the selected type changes, since switching
   * type resets the field-value map.
   */
  private applyUrlPrefill(): void {
    const key = this.selectedType?.urlFieldKey;
    if (this.urlSelection && key) this.fieldValues[key] = this.urlSelection;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('ffc-new-note-modal');
    contentEl.createEl('h2', { text: 'New note' });

    let descSettingEl: HTMLElement | null = null;

    new Setting(contentEl)
      .setName('Type')
      .addDropdown((dd) => {
        for (const obj of this.noteTypes) dd.addOption(obj.id, obj.name);
        dd.setValue(this.selectedType.id);
        dd.onChange((id) => {
          this.selectedType = this.noteTypes.find((o) => o.id === id) ?? this.noteTypes[0];
          this.fieldValues  = {};
          this.applyUrlPrefill();
          renderFieldInputs(contentEl, this.app, this.selectedType, this.fieldValues, () => this.submit(), descSettingEl);
        });
      });

    new Setting(contentEl)
      .setName('Title')
      .addText((text) => {
        text.setPlaceholder(this.titlePromise ? 'Fetching title…' : 'Enter title…')
          .setValue(this.initialTitle)
          .onChange((v) => { this.titleValue = v; this.titleTouched = true; });
        this.titleValue = this.initialTitle;
        text.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') this.submit();
          if (e.key === 'Escape') this.close();
        });
        window.setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 50);

        if (this.titlePromise) {
          void this.titlePromise.then((fetched) => {
            text.setPlaceholder('Enter title…');
            if (this.titleTouched || !fetched) return;
            const clean = sanitizeNoteTitle(fetched);
            if (!clean) return;
            this.titleValue = clean;
            text.setValue(clean);
            text.inputEl.select();
          });
        }
      });

    const descSetting = new Setting(contentEl)
      .setName('Description')
      .setDesc('Added to the body of the created page')
      .addTextArea((ta) => {
        ta.setPlaceholder('Optional description…')
          .onChange((v) => { this.descriptionValue = v; });
        ta.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') this.close();
        });
      });
    descSettingEl = descSetting.settingEl;

    renderFieldInputs(contentEl, this.app, this.selectedType, this.fieldValues, () => this.submit(), descSettingEl);

    new Setting(contentEl)
      .addButton((btn) => btn.setButtonText('Create').setCta().onClick(() => this.submit()))
      .addButton((btn) => btn.setButtonText('Cancel').onClick(() => this.close()));
  }

  private submit(): void {
    const title = this.titleValue.trim();
    if (!title) { new Notice('Please enter a title.'); return; }
    this.close();
    void this.onSubmit(this.selectedType, title, this.fieldValues, this.descriptionValue);
  }

  onClose(): void { this.contentEl.empty(); }
}
