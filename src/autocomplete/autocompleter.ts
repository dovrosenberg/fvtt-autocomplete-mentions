import moduleJson from '@module';
import { log } from '@/utils/log';
import { getGame, localize } from '@/utils/game';
import { DocumentType, ValidDocType, WindowPosition, SearchResult, AutocompleteMode, EditorType } from '@/types';
import { moduleSettings, SettingKeys } from '@/settings/ModuleSettings';

  /* so here's the flow...
      press @
      Get a menu of Actors, JournalEntries (which will then offer link to parent or pick a page), Items, Scenes, Roll Table
      Press the 1st letter of what you want
      Have an option to create a new one (???) + options for 1st n choices
      As you type more letters, choices filter down

      note: if you pick journalentries, once you pick the entry, you get a followup item with a choice to pick the entry + a list of pages (which
          then filter like the document choices)
  */


// keypress and title show in the menu to pick a type
// type is the internal doctype
// searchName shows in the search screen ("Searching ___ for: ")
// collectionName is the foundry collection
// referenceText is the text inserted into the editor @___[name]
let docTypes = [] as { type: ValidDocType, keypress: string, title: string, searchName: string, collectionName: string, referenceText: string, }[];

// load i18n strings after the game has loaded
export function initializeLocalizedText(): void {
  log(false, 'Loading localized document text');

  docTypes = [
    { type: ValidDocType.Actor, keypress: localize('acm.documents.keys.actors'), title: localize('acm.documents.titles.actors'), searchName: 'Actors', collectionName: 'actors', referenceText: 'Actor', },
    { type: ValidDocType.Item, keypress: localize('acm.documents.keys.items'), title: localize('acm.documents.titles.items'), searchName: 'Items', collectionName: 'items', referenceText: 'Item', },
    { type: ValidDocType.Journal, keypress: localize('acm.documents.keys.journals'), title: localize('acm.documents.titles.journals'), searchName: 'Journals', collectionName: 'journal', referenceText: 'JournalEntry', },
    { type: ValidDocType.RollTable, keypress: localize('acm.documents.keys.rollTables'), title: localize('acm.documents.titles.rollTables'), searchName: 'Roll Tables', collectionName: 'tables', referenceText: 'RollTable', },
    { type: ValidDocType.Scene, keypress: localize('acm.documents.keys.scenes'), title: localize('acm.documents.titles.scenes'), searchName: 'Scenes', collectionName: 'scenes', referenceText: 'Scene', },
  ];
}

export class Autocompleter extends Application {
  private _onClose: ()=>void;      // function to call when we close
  private _onPointerDown: (event: MouseEvent)=>void;      // this is the listener on document; need to remove it when we close
  private _location: WindowPosition;   // location of the popup
  private _editor: HTMLElement;    // the editor element
  private _editorType: EditorType;   // the type of editor we're supporting

  // status
  private _currentMode: AutocompleteMode;
  private _focusedMenuKey = 0 as number;
  private _searchDocType = null as ValidDocType | null;   // if we're in doc search mode, the key of the docType to search
  private _selectedJournal: SearchResult;   // name of the selected journal when we're looking for pages
  private _shownFilter = '' as string;    // current filter for doc search

  // search results
  private _lastPulledSearchResults = [] as SearchResult[];  // all of the results we got back last time
  private _lastPulledFilter = '' as string;      // the filter we last searched the database for
  private _lastPulledType = null as ValidDocType | null;     // the key of the doctype we last searched the database for
  private _lastPulledRowCount = 0 as number;   // the number of rows the last query returned
  private _filteredSearchResults = [] as SearchResult[];   // the currently shown search results

  constructor(target: HTMLElement, editorType: EditorType, onClose: ()=>void) {
    super();

    log(false, 'Autocompleter construction');

    this._editor = target;
    this._editorType = editorType;
    this._currentMode = AutocompleteMode.singleAtWaiting;
    this._onClose = onClose;

    this._location = this._getSelectionCoords(10, 0) || { left: 0, top: 0 };

    this.render();
  }

  static get defaultOptions(): ApplicationOptions {
    const options = super.defaultOptions;

    options.classes = ['acm-autocomplete'];
    options.template = `modules/${moduleJson.id}/templates/autocompleter.hbs`,
    options.popOut = false;
    options.resizable = false;
    options.height = 'auto';

    return options;
  }

  // moves this to a new target (in the case of a re-render, for instance)
  retarget(newTarget) {
    this._editor = newTarget;
    this.render();
  }

  // this provides fields that will be available in the template; called by parent class
  public async getData(): Promise<any> {
    const data = {
        ...(await super.getData()),
        location: this._location,
        docTypes: docTypes,
        singleAtWaiting: this._currentMode===AutocompleteMode.singleAtWaiting,
        docSearch: this._currentMode===AutocompleteMode.docSearch,
        journalPageSearch: this._currentMode===AutocompleteMode.journalPageSearch,
        journalName: this._selectedJournal?.name,
        docType: docTypes.find((dt)=>(dt.type===this._searchDocType))?.searchName,
        highlightedEntry: this._focusedMenuKey,
        searchResults: this._filteredSearchResults,
        shownFilter: this._shownFilter,
        hasMore: (this._lastPulledRowCount || 0) > (this._filteredSearchResults?.length || 0),
    };
    //log(false, data);

    return data;
  }

  activateListeners($html: JQuery) {
    super.activateListeners($html);

    const html = $html[0];

    // set the focus to the control
    const wrapper = html.querySelector('#acm-wrapper') as HTMLDivElement;
    wrapper.focus();

    // take keystrokes
    wrapper.addEventListener('keydown', this._onKeydown);

    // watch for mouseover and clicks on menu items
    const menuItems = html.querySelectorAll('.acm-data-entry') as NodeListOf<HTMLLIElement>;
    for (let i=0; i<menuItems.length; i++) {
      menuItems[i].addEventListener('click', this._onListClick);
      menuItems[i].addEventListener('mouseover', this._onListMouseover);
    }

    // for some reason, if instead of putting focus elsewhere we drag the window, focusout never gets called
    // so, we listen for pointerdown events, too (this doesn't seem super safe because foundry could change the event they use...)
    // note for future versions of foundry - make sure this still works

    const onPointerDown = (event: MouseEvent): void => { 
      // find the wrapper 
      const wrapper = document.querySelector('#acm-wrapper') as HTMLDivElement;
      if (!wrapper) {
        // should never happen... if it does, it probably means we somehow failed to remove the listener
        document.removeEventListener('pointerdown', this._onPointerDown);
        if (this._editorType===EditorType.TinyMCE) {
          this._editor.ownerDocument.removeEventListener('pointerdown', this._onPointerDown);
        }
      } else if (!wrapper.contains(event.target as Node)) {
        this.close(); 
      }
    }

    // activateListeners happens every time we rerender, so if we've set the event listener before, we
    //    need to remove the old one and replace it with the new one (which ties to the new DOM elements)
    if (this._onPointerDown) {
      document.removeEventListener('pointerdown', this._onPointerDown);
      if (this._editorType===EditorType.TinyMCE) {
        this._editor.ownerDocument.removeEventListener('pointerdown', this._onPointerDown);
      }
    }

    this._onPointerDown = onPointerDown;
    document.addEventListener('pointerdown', onPointerDown);  

    if (this._editorType===EditorType.TinyMCE) {
      this._editor.ownerDocument.addEventListener('pointerdown', onPointerDown);
    }
}

  public async render(force?: boolean) {
    const result = await super.render(force);
    
    return result;
  }

  async close(options = {}): Promise<void> {
    // turn off visibility immediately so we don't have to wait for the animation
    // NOTE: the application is rendered into the parent application, even if we're in an iframe for TinyMCE
    const wrapper = document.querySelector(`.acm-autocomplete`) as HTMLElement;
    if (wrapper)
      wrapper.style.display = 'none';

    // remove the listener
    document.removeEventListener('pointerdown', this._onPointerDown);
    if (this._editorType===EditorType.TinyMCE) {
      this._editor.ownerDocument.removeEventListener('pointerdown', this._onPointerDown);
    }

    // call the callback, if present
    if (this._onClose)
      this._onClose();

    // force: true closes immediately without animation
    return super.close(options);
  }

  private _onListClick = async(event: MouseEvent): Promise<void> => {
    if (!event?.currentTarget)
      return;

    const index = (event.currentTarget as HTMLLIElement).attributes['data-acm-index'].nodeValue;

    // pretend we clicked in
    this._focusedMenuKey = Number.parseInt(index);
    this._onKeydown({key: 'Enter', preventDefault: ()=>{}, stopPropagation: ()=>{}} as KeyboardEvent);
  }

  private _onListMouseover = async(event: MouseEvent): Promise<void> => {
    if (!event?.currentTarget)
      return;

    const index = Number.parseInt((event.currentTarget as HTMLLIElement).attributes['data-acm-index'].nodeValue);

    // pretend we clicked in
    if (this._focusedMenuKey!==index) {
      this._focusedMenuKey = index;
      this.render();
    }
  }


  // we render at the end, so can return for cases that don't require it to save that step
  private _onKeydown = async (event: KeyboardEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();

    // for various other keys, it depends on the model
    switch (this._currentMode) {
      case AutocompleteMode.singleAtWaiting: {
        switch (event.key) {
          case 'Enter': {
            // select the item
            if (!docTypes[this._focusedMenuKey]) return;

            const dt = docTypes[this._focusedMenuKey].type;

            // move to the next menu
            await this._moveToDocSearch(dt);

            break;
          }

          case "Escape": {
            // if we're on the first menu, then we want to insert a @ symbol
            this._insertTextAndClose('@');
            break;
          }

          case 'Backspace': {
            // close the menu
            this.close();
            return;
          }

          case "ArrowUp": {
            this._focusedMenuKey = (this._focusedMenuKey - 1 + docTypes.length) % docTypes.length;
            
            break;
          }
          case "ArrowDown": {
            this._focusedMenuKey = (this._focusedMenuKey + 1) % docTypes.length;
    
            break;
          }

          default:
            // see if it's one of the valid keypresses
            const match = docTypes.find((dt)=>(dt.keypress.toLocaleLowerCase()===event.key.toLocaleLowerCase()));

            if (match) {
              // finalize search mode and select the item type
              await this._moveToDocSearch(match.type);

              break;
            } else {
              // ignore
              return;
            }

            break;
        }
        break;
      }

      case AutocompleteMode.docSearch: 
      case AutocompleteMode.journalPageSearch: {
        // if it's a regular character, update the filter string
        if (event.key.length===1) {
          this._shownFilter += event.key;

          await this._refreshSearch();
        } else {
          // handle special keys
          switch (event.key) {
            case 'Enter': {
              if (this._currentMode===AutocompleteMode.docSearch) {
                if (this._searchDocType === null) return;

                // if it's 0, pop up the add item dialog
                if (!this._focusedMenuKey) {
                  this._createDocument(this._searchDocType);
                } else if (this._searchDocType===ValidDocType.Journal) {
                  // for journal, we have to go into journal mode
                  this._currentMode = AutocompleteMode.journalPageSearch;

                  // get the clicked journal
                  const journal = this._filteredSearchResults[this._focusedMenuKey-1];
                  this._selectedJournal = {...journal};

                  // reset search
                  this._shownFilter = '';
                  this._focusedMenuKey = 0;   // use whole journal
                  await this._refreshSearch();
                } else {
                  // get the clicked item
                  const item = this._filteredSearchResults[this._focusedMenuKey-1];

                  // insert the appropriate text
                  if (item) {
                    const docType = docTypes.find((dt)=>(dt.type===this._searchDocType));
                    this._insertReferenceAndClose(item.uuid);
                  }
                }
              } else {
                // handle journal page select
                // if it's 0, we just add a reference to the whole journal
                if (!this._focusedMenuKey) {
                  this._insertReferenceAndClose(this._selectedJournal.uuid);
                } else {
                  // pages have to be entered as a UUID
                  // get the clicked item
                  const item = this._filteredSearchResults[this._focusedMenuKey-1];

                  // insert the appropriate text
                  if (item) {
                    const docType = docTypes.find((dt)=>(dt.type===this._searchDocType));
                    this._insertReferenceAndClose(item.uuid);
                  }
                }
              }
              break;
            }

            case 'Backspace': {
              // if the shownfilter is empty, go back to singleAtWaiting mode
              if (this._shownFilter.length === 0) {
                if (this._currentMode===AutocompleteMode.docSearch) {
                  this._currentMode = AutocompleteMode.singleAtWaiting;
                } else {
                  // journal search
                  this._currentMode = AutocompleteMode.docSearch;
                  this._shownFilter = '';
                  await this._refreshSearch();
                }
                this._focusedMenuKey = 0;
              } else {
                // otherwise delete a character
                this._shownFilter = this._shownFilter.slice(0, -1);
                await this._refreshSearch();
                this._focusedMenuKey = 0;
              }

              break;
            }
            
            case "Escape": {
              // just close the whole menu (without inserting @, because it's more likely we just changed our mind)
              this.close();
              return;
            }

            case "ArrowUp": {
              this._focusedMenuKey = (this._focusedMenuKey - 1 + this._filteredSearchResults.length+1) % (this._filteredSearchResults.length+1);
              break;
            }
            case "ArrowDown": {
              this._focusedMenuKey = (this._focusedMenuKey + 1) % (this._filteredSearchResults.length+1);
              break;
            }

            default:
              // ignore
              return;
          }
        }

        break;
      }
      default: 
        return;
    }

    await this.render();
  }
          
  private _getSelectionCoords = function(paddingLeft: number, paddingTop: number): WindowPosition | null {
    const sel = this._editor.ownerDocument.getSelection();

    // check if selection exists
    if (!sel || !sel.rangeCount) return null;

    // get range
    const range = sel.getRangeAt(0).cloneRange();
    if (!range.getClientRects()) return null;

    // get client rect
    range.collapse(false);
    let rects = range.getClientRects();

    // if we don't have any, it's probably the beginning of a newline, which works strange
    if(!rects.length) {
      if(range.startContainer && range.collapsed) {
        // explicitely select the contents
        range.selectNodeContents(range.startContainer);
      }
      rects = range.getClientRects();
    }
    if (rects.length <= 0) return null;

    // get editor position
    const editorRect = this._editor?.getBoundingClientRect();
    if (!editorRect) return null;

    const rect = rects[0];  // this is the location of the cursor

    let adjustmentRect = { left: 0, top: 0 };

    // if it's TinyMCE, we have to adjust for the location of the iframe it's in
    if (this._editorType===EditorType.TinyMCE) {
      const iframe = this._editor.ownerDocument.defaultView.frameElement;
      if (!iframe)
        throw 'Error locating TinyMCE - is it not in an iframe???';

      adjustmentRect = iframe.getBoundingClientRect();      
    }

    // return coord
    //return { x: rect.x - editorRect.left + paddingLeft, y: rect.y - editorRect.top + paddingTop };    
    return { left: rect.left + adjustmentRect.left + paddingLeft, top: rect.top + adjustmentRect.top + paddingTop }
  }

  // _lastPulledSearchResults contains the full set of what we got back last time we pulled
  private _getFilteredSearchResults(): SearchResult[] {
    const FULL_TEXT_SEARCH = true; // TODO (for now, only name is searchable anyway)
    const RESULT_LENGTH = moduleSettings.get(SettingKeys.resultLength);

    let retval: SearchResult[];

    if (FULL_TEXT_SEARCH) { // TODO
      retval = this._lastPulledSearchResults;  // we don't know enough to filter any more (other than length of list)
    } else {
      //retval = this._lastPulledSearchResults.filter((i)=>(i.name.toLowerCase().includes(this._shownFilter.toLowerCase())));
    }

    return retval.slice(0, RESULT_LENGTH);  
  }

  // refresh the search results, if needed
  // has the filter changed in a way that we need to refresh the search results?
  // we only refresh the results if a) the active filter isn't an extension of the last searched one or
  //    b) the last search told us there were more rows than we pulled for the prior search
  private _refreshSearch = async function(): Promise<void> {
    // when do we NOT need to refresh the main search results?
    //   * we're not using full text (because we don't have a way to further filter here)
    //   * we're searching the same type we did last time
    //   * the new search results are a subset of the old ones - meaning the new filter starts with the old filter 
    const FULL_TEXT_SEARCH = true; //TODO: pull from settings

    if (FULL_TEXT_SEARCH || (this._lastPulledType !== this._searchDocType) ||
        (!this._lastPulledFilter || !this._shownfilter.toLowerCase().startsWith(this._lastPulledFilter.toLowerCase()))) {
      // we need to refresh
      // clear the current results so they don't show while we're waiting
      this._filteredSearchResults = [];

      if (this._currentMode===AutocompleteMode.journalPageSearch)
        await this._pullJournalData();
      else  
        await this._pullData();
    }

    // if there's at least one result, select it  
    this._filteredSearchResults = this._getFilteredSearchResults();
    if (this._filteredSearchResults.length >=1) {
      this._focusedMenuKey = 1;
    } else {
      // select create/whole journal option
      this._focusedMenuKey = 0;
    }
  }

  // pull the new data from the database
  private async _pullData(): Promise<void> {
    if (this._searchDocType === null) {
      this._lastPulledFilter = '';
      this._lastPulledType = null;
      this._lastPulledSearchResults = [];
      this._lastPulledRowCount = 0;
      return;
    }

    this._lastPulledFilter = this._shownFilter;
    this._lastPulledType = this._searchDocType;  

    const docType = docTypes.find((d)=>(d.type===this._searchDocType));
    if (!docType?.collectionName) {
      this._lastPulledFilter = '';
      this._lastPulledType = null;
      this._lastPulledSearchResults = [];
      return;
    }

    const collection = getGame()[docType.collectionName] as DocumentType;

    // note that current typescript definitions don't know about search() function
    let results: DocumentType[];
    const FULL_TEXT_SEARCH = true;   // TODO: pull from settings; at the moment, only name seems to be searchable
    if (FULL_TEXT_SEARCH) {
      results = collection.search({query: this._shownFilter, filters:[]}) as DocumentType[];
    } else {
      results=[];
      //results = collection.search({query: this._shownFilter, filters: [nameFilter]});
    }

    // remove any null names (which Foundry allows)
    results = results.filter((item)=>(item.name));

    this._lastPulledRowCount = results.length;

    // uuid, and pages are OK here despite typescript
    this._lastPulledSearchResults = results.map((item)=>({uuid: item.uuid, name: item.name, pages: this._searchDocType===ValidDocType.Journal ? item.pages : undefined})) as SearchResult[];  
    return;
  }

  private async _pullJournalData(): Promise<void> {
    if (this._currentMode!==AutocompleteMode.journalPageSearch) {
      this._lastPulledFilter = '';
      this._lastPulledType = null;
      this._lastPulledSearchResults = [];
      this._lastPulledRowCount = 0;
      return;
    }

    this._lastPulledFilter = this._shownFilter;
    this._lastPulledType = null;  

    const collection = this._selectedJournal.pages;
    if (!collection)
      return;

    // note that current typescript definitions don't know about search() function
    let results: DocumentType[];
    const FULL_TEXT_SEARCH = true;   // TODO: pull from settings; for now it doesn't seem to matter
    if (FULL_TEXT_SEARCH) {
      results = collection.search({query: this._shownFilter, filters:[]}) as DocumentType[];
    } else {
      results=[];
      //results = collection.search({query: this._shownFilter, filters: [nameFilter]});
    }

    // remove any null names (which Foundry allows)
    results = results.filter((item)=>(item.name));

    this._lastPulledRowCount = results.length;

    // uuid ok here despite typescript
    this._lastPulledSearchResults = results.map((item)=>({ uuid: item.uuid, name: item.name, pages: null})) as SearchResult[];

    return;
  }

  private async _moveToDocSearch(docType: ValidDocType) {
    this._currentMode = AutocompleteMode.docSearch
    this._searchDocType = docType;
    this._shownFilter = '';
    this._focusedMenuKey = 0;
    await this._refreshSearch();
  }

  private _insertReferenceAndClose(uuid: string): void {
    this._insertTextAndClose(`@UUID[${uuid}]`);
  }

  private _insertTextAndClose(text: string): void {
    this._editor.focus();  
    this._editor.ownerDocument.execCommand('insertText', false, text);
    this.close();
  }

  private async _createDocument(docType: ValidDocType): Promise<void> {
    const docTypeInfo = docTypes.find((dt)=>(dt.type===docType));
    if (!docTypeInfo)
      return;

    const collection = getGame()[docTypeInfo.collectionName] as DocumentType;

    // TODO: maybe default the folder to what's currently open?
    const data = {folder: undefined };
    const options = {width: 320, left: 300, top: 300 };

    // register the hook to catch after the document is made
    // we need to save the current editor selection because it goes away when the new boxes pop up
    const selection = this._editor.ownerDocument.getSelection();
    const range = selection?.rangeCount ? selection?.getRangeAt(0) : null;

    //if ( this.collection instanceof CompendiumCollection ) options.pack = this.collection.collection;

    const cls = getDocumentClass(collection.documentName);
    cls.createDialog(data, options).then((result) => {
      if (result) {
        // it was created
        if (range) {
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        this._insertReferenceAndClose(result.uuid);
      } else {
        // dialog was canceled; nothing to do      
      }
    });

    this.close();
  }
}