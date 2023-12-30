export enum AutocompleteMode {
  singleAtWaiting,  // entered a single @ and waiting for next char to determine what type of search (this is the default when we open it)
  docSearch, // entered a single @ plus a valid document search type
  journalPageSearch,  // entered a single @, picked journal type, selected a journal, and are now picking pages
}

// we can't use foundry's setPosition() because it doesn't work for fixed size, non popout windows
export type WindowPosition = {
  left: number;
  top: number;
}

export type SearchResult = {
  uuid: string;
  name: string;
  parentJournal?: JournalEntry11
}

export enum ValidDocType {
  Actor,
  Item,
  Journal,
  RollTable,
  Scene,
}

export enum EditorType {
  ProseMirror,
  TinyMCE
}

// Below are some foundry type amendments.Since Foundry Types are supported up to 10,
// any definition added by version 11 are below.Those are not real definitions.
// They are only close enough to make the compilation with fewer false errors.
export type ui11 = typeof ui & {
  activeWindow: DocumentSheet
}

export type DocumentType11 = (Actor | Scene | JournalEntry | RollTable | Item) & {
  search(options: { query: string, filters?: string[], exclude?: string[] })
}

export type JournalEntry11 = typeof JournalEntry & {
  pages: JournalEntry11
  contents: { at(idx: number): JournalEntry11 }
  sort: number
  search(options: { query: string, filters?: string[], exclude?: string[] })
}
