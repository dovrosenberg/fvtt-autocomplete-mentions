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
  parentJournal?: JournalEntry
}

export enum ValidDocType {
  Actor,
  Item,
  Journal,
  RollTable,
  Scene,

  // campaign builder
  Character,
  Location,
  Organization,
  World,
  Campaign,
  Session,
  PC
}

export enum EditorType {
  ProseMirror,
  TinyMCE
}

export type DocumentType = (Actor | Scene | JournalEntry | RollTable | Item);