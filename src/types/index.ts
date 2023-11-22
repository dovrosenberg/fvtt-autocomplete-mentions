import EmbeddedCollection from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/abstract/embedded-collection.mjs';

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
  _id: string;   
  name: string;
  pages: EmbeddedCollection<any, any> | null;
}

export enum ValidDocTypes {
  A = 'A',
  I = 'I',
  J = 'J',
  R = 'R',
  S = 'S'
}

export type DocumentType = Actor | Scene | Journal | RollTable | Item;
