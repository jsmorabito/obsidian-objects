// ─── Shared TypeScript interfaces ─────────────────────────────────────────────

export interface FilterSpec {
  key: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'exists' | 'in_folder' | 'not_in_folder';
  value: string;
}

export interface NoteField {
  key: string;
  label: string;
  type: 'text' | 'list';
}

export interface PreviewField {
  key: string;
  label: string;
}

export interface CanvasField {
  key: string;
  label: string;
}

export interface NoteType {
  id: string;
  commandSlug: string;
  name: string;
  description?: string;
  templatePath: string;
  saveFolder: string;
  fields: NoteField[];
  /**
   * Key of the creation field that receives a highlighted URL when a note of
   * this type is created from a selection. When set and the selection is a bare
   * URL, the URL is written into this field instead of becoming the title.
   */
  urlFieldKey?: string;
  matchFilters: FilterSpec[];
  matchMode: 'all' | 'any';
  enableFindCommand: boolean;
  showInTriggerMenu: boolean;
  styledLinks?: boolean;
  showStatusInLinks?: boolean;
  previewFields: PreviewField[];
  canvasFields: CanvasField[];
  imageKey?: string;
  showImageInPreview?: boolean;
  showImageInCanvas?: boolean;
}

export interface CommandSpec {
  id: string;
  name: string;
  matchMode: 'all' | 'any';
  filters: FilterSpec[];
  fileTypes?: string;
}

// ─── Filtered Files Widget filter types ───────────────────────────────────────

export interface FfwTagFilter {
  type: 'tag';
  tag: string;
  include: boolean;
}

export interface FfwFrontmatterFilter {
  type: 'frontmatter';
  key: string;
  value: string;
  comparison: 'equals' | 'not-equals' | 'contains' | 'exists';
}

export interface FfwPathFilter {
  type: 'path';
  pattern: string;
  matchMode: 'starts-with' | 'ends-with' | 'equals' | 'contains';
  negate: boolean;
}

export interface FfwNameFilter {
  type: 'name';
  pattern: string;
  matchMode: 'contains' | 'starts-with' | 'ends-with' | 'regex';
  caseSensitive: boolean;
  negate: boolean;
}

export type FfwFilter = FfwTagFilter | FfwFrontmatterFilter | FfwPathFilter | FfwNameFilter;
export type FfwFilterType = FfwFilter['type'];

export interface FfwSort {
  field: string;
  frontmatterKey?: string;
}

export interface FfwSection {
  id: string;
  title: string;
  filters: FfwFilter[];
  sort: FfwSort;
  collapsed: boolean;
  maxResults: number;
}

export interface PluginSettings {
  commands: CommandSpec[];
  filteredCommandsEnabled: boolean;
  filteredWidgetEnabled: boolean;
  filteredWidgetRibbon: boolean;
  noteTypes: NoteType[];
  templatesFolder: string;
  triggerKey: string;
  fetchUrlTitles: boolean;
  ffwSections: FfwSection[];
  ffwDisplayNameKey: string;
}
