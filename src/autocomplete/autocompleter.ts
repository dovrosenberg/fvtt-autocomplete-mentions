import moduleJson from '@module';
import { log } from '@/utils/log';
import { getGame, localize } from '@/utils/game';
import { ValidDocType, WindowPosition, SearchResult, AutocompleteMode, EditorType, ui11, DocumentType11, JournalEntry11 } from '@/types';
import { ModuleSettings, SettingKeys } from '@/settings/ModuleSettings';

// isFCB is whether it's normal foundry or FCB
// keypress and title show in the menu to pick a type
// type is the internal doctype
// searchName shows in the search screen ("Searching ___ for: ")
// collectionName is the foundry collection (blank for FCB ones)
// referenceText is the text inserted into the editor @___[name]
type DocType = { 
  isFCB: boolean;
  type: ValidDocType, 
  keypress: string, 
  title: string, 
  searchName: string, 
  collectionName: string, 
  referenceText: string, 
}

let docTypes = [] as DocType[];

// Campaign builder specific document types
let campaignBuilderDocTypes = [] as DocType[];

  /* so here's the flow...
      press @
      Get a menu of Actors, JournalEntries (which will then offer link to parent or pick a page), Items, Scenes, Roll Table
      Press the 1st letter of what you want
      Have an option to create a new one (???) + options for 1st n choices
      As you type more letters, choices filter down

      note: if you pick journalentries, once you pick the entry, you get a followup item with a choice to pick the entry + a list of pages (which
          then filter like the document choices)
  */

// load i18n strings after the game has loaded
export function initializeLocalizedText(): void {
  log(false, 'Loading localized document text');

  docTypes = [
    { isFCB: false, type: ValidDocType.Actor, keypress: localize('acm.documents.keys.actors'), title: localize('acm.documents.titles.actors'), searchName: 'Actors', collectionName: 'actors', referenceText: 'Actor', },
    { isFCB: false, type: ValidDocType.Item, keypress: localize('acm.documents.keys.items'), title: localize('acm.documents.titles.items'), searchName: 'Items', collectionName: 'items', referenceText: 'Item', },
    { isFCB: false, type: ValidDocType.Journal, keypress: localize('acm.documents.keys.journals'), title: localize('acm.documents.titles.journals'), searchName: 'Journals', collectionName: 'journal', referenceText: 'JournalEntry', },
    { isFCB: false, type: ValidDocType.RollTable, keypress: localize('acm.documents.keys.rollTables'), title: localize('acm.documents.titles.rollTables'), searchName: 'Roll Tables', collectionName: 'tables', referenceText: 'RollTable', },
    { isFCB: false, type: ValidDocType.Scene, keypress: localize('acm.documents.keys.scenes'), title: localize('acm.documents.titles.scenes'), searchName: 'Scenes', collectionName: 'scenes', referenceText: 'Scene', },
  ].sort((a,b)=>(a.title.localeCompare(b.title)));  
  
  // Initialize campaign builder document types
  // These are specific to the campaign builder mode
  campaignBuilderDocTypes = [
    { isFCB: true, type: ValidDocType.Character, keypress: localize('acm.documents.keys.characters'), title: localize('acm.documents.titles.characters'), searchName: 'Characters', collectionName: '', referenceText: 'Chracter', },
    { isFCB: true, type: ValidDocType.Location, keypress: localize('acm.documents.keys.locations'), title: localize('acm.documents.titles.locations'), searchName: 'Locations', collectionName: '', referenceText: 'Location', },
    { isFCB: true, type: ValidDocType.Organization, keypress: localize('acm.documents.keys.organizations'), title: localize('acm.documents.titles.organizations'), searchName: 'Organizations', collectionName: '', referenceText: 'Organization', },
    { isFCB: true, type: ValidDocType.World, keypress: localize('acm.documents.keys.worlds'), title: localize('acm.documents.titles.worlds'), searchName: 'Worlds', collectionName: '', referenceText: 'World', },
    { isFCB: true, type: ValidDocType.Campaign, keypress: localize('acm.documents.keys.campaigns'), title: localize('acm.documents.titles.campaigns'), searchName: 'Campaigns', collectionName: '', referenceText: 'Campaign', },
    { isFCB: true, type: ValidDocType.Session, keypress: localize('acm.documents.keys.sessions'), title: localize('acm.documents.titles.sessions'), searchName: 'Sessions', collectionName: '', referenceText: 'Session', },
  ].sort((a,b)=>(a.title.localeCompare(b.title)));  
}

export class Autocompleter extends Application {
  private _onClose: ()=>void;      // function to call when we close
  private _onPointerDown: (event: MouseEvent)=>void;      // this is the listener on document; need to remove it when we close
  private _location: WindowPosition;   // location of the popup
  /** the editor element */
  private _editor: HTMLElement;    

  /** the type of editor we're supporting */
  private _editorType: EditorType;   

  /** the current document being edited */
  private _currentDoc: DocumentType11 | null;

  /** are we searching from a journal page (used to let us more quickly search within that journal) */
  private _searchingFromJournalPage = false;

  /** whether we're in campaign builder mode */
  private _isCampaignBuilder = false;

  /////////////////////////////
  // status
  private _currentMode: AutocompleteMode;
  private _focusedMenuKey = 0 as number;

  /** if we're in doc search mode, the key of the docType to search */
  private _searchDocType = null as ValidDocType | null;   

  /** name of the selected journal when we're looking for pages */
  private _selectedJournal: SearchResult;   

  /** current filter for doc search */
  private _shownFilter = '' as string; 

  /** the filter on the journal search (so when we go back there from page search we can save it) */
  private _lastJournalFilter = '';    

  /////////////////////////////
  // search results
  /** all of the results we got back last time */
  private _lastPulledSearchResults = [] as SearchResult[];  

  /** the filter we last searched the database for */
  private _lastPulledFilter = '' as string;      

  /** the key of the doctype we last searched the database for */
  private _lastPulledType = null as ValidDocType | null;     

  /** the number of rows the last query returned */
  private _lastPulledRowCount = 0 as number;   

  /** the currently shown search results */
  private _filteredSearchResults = [] as SearchResult[];   

  constructor(target: HTMLElement, editorType: EditorType, onClose: ()=>void, isCampaignBuilder = false) {
    super();

    this._currentDoc = (ui as ui11).activeWindow.document as DocumentType11 ?? null;

    this._editor = target;
    this._editorType = editorType;
    this._isCampaignBuilder = isCampaignBuilder;
    this._currentMode = AutocompleteMode.singleAtWaiting;
    
    this._onClose = onClose;

    this._location = this._getSelectionCoords(10, 0) || { left: 0, top: 0 };

    void this.render();
  }

  static get defaultOptions(): ApplicationOptions {
    const options = {
      ...super.defaultOptions,

      classes: ['acm-autocomplete'],
      template: `modules/${moduleJson.id}/templates/autocompleter.hbs`,
      popOut: false,
      resizable: false,
      height: 'auto',
    } as ApplicationOptions;

    return options;
  }

  // moves this to a new target (in the case of a re-render, for instance)
  retarget(newTarget) {
    this._editor = newTarget;
    void this.render();
  }

  // this provides fields that will be available in the template; called by parent class
  public async getData(): Promise<any> {
    const currentDocTypes = this.currentDocTypes;

    const data = {
      ...(await super.getData()),
      location: this._location,
      docTypes: currentDocTypes,
      singleAtWaiting: this._currentMode===AutocompleteMode.singleAtWaiting,
      docSearch: this._currentMode===AutocompleteMode.docSearch,
      journalPageSearch: this._currentMode===AutocompleteMode.journalPageSearch,
      searchingFromJournalPage: this._searchingFromJournalPage,
      firstSearchIdx: this._initialSearchOffset(),
      journalName: this._selectedJournal?.name,
      docType: this.currentSearchDocType?.searchName,
      highlightedEntry: this._focusedMenuKey,
      searchResults: this._filteredSearchResults,
      shownFilter: this._shownFilter,
      hasMore: (this._lastPulledRowCount || 0) > (this._filteredSearchResults?.length || 0),
      isCampaignBuilder: this._isCampaignBuilder,
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
        void this.close(); 
      }
    };

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

  /** get the right set */
  public get currentDocTypes(): DocType[] {
    return this._isCampaignBuilder ? docTypes.concat(campaignBuilderDocTypes) : docTypes;
  }

  /** get the right set */
  public get currentSearchDocType(): DocType | null {
    return this._searchDocType!=null ? this.currentDocTypes.find((dt)=>(dt.type===this._searchDocType)) || null : null;
  }

  public async render(force?: boolean) {
    const result = await super.render(force);
    
    return result;
  }

  async close(options = {}): Promise<void> {
    // turn off visibility immediately so we don't have to wait for the animation
    // NOTE: the application is rendered into the parent application, even if we're in an iframe for TinyMCE
    const wrapper = document.querySelector('.acm-autocomplete') as HTMLElement;
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

  private _onListClick = async (event: MouseEvent): Promise<void> => {
    if (!event?.currentTarget)
      return;

    const index = (event.currentTarget as HTMLLIElement).attributes['data-acm-index'].nodeValue;

    // pretend we clicked in
    this._focusedMenuKey = Number.parseInt(index);
    await this._onKeydown({key: 'Enter', preventDefault: ()=>{}, stopPropagation: ()=>{}} as KeyboardEvent);
  };

  private _onListMouseover = async (event: MouseEvent): Promise<void> => {
    if (!event?.currentTarget)
      return;

    const index = Number.parseInt((event.currentTarget as HTMLLIElement).attributes['data-acm-index'].nodeValue);

    // pretend we clicked in
    if (this._focusedMenuKey!==index) {
      this._focusedMenuKey = index;
      await this.render();
    }
  };


  // we render at the end, so can return for cases that don't require it to save that step
  private _onKeydown = async (event: KeyboardEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();

    const currentDocTypes = this.currentDocTypes;

    // for various other keys, it depends on the mode
    switch (this._currentMode) {
      case AutocompleteMode.singleAtWaiting: {
        switch (event.key) {
          case 'Enter': {
            // select the item
            if (!currentDocTypes[this._focusedMenuKey]) return;

            const dt = currentDocTypes[this._focusedMenuKey].type;

            // move to the next menu
            await this._moveToDocSearch(dt);

            break;
          }

          case 'Escape': {
            // if we're on the first menu, then we want to insert a @ symbol
            this._insertTextAndClose('@');
            break;
          }

          case 'Backspace': {
            // close the menu
            this._editor.focus();
            await this.close();
            return;
          }

          case 'ArrowUp': {
            this._focusedMenuKey = (this._focusedMenuKey - 1 + currentDocTypes.length) % currentDocTypes.length;
            
            break;
          }
          case 'ArrowDown': {
            this._focusedMenuKey = (this._focusedMenuKey + 1) % currentDocTypes.length;
    
            break;
          }

          default: {
            // see if it's one of the valid keypresses
            const match = currentDocTypes.find((dt)=>(dt.keypress.toLocaleLowerCase()===event.key.toLocaleLowerCase()));

            if (match) {
              // finalize search mode and select the item type
              await this._moveToDocSearch(match.type);

              break;
            } else {
              // ignore
              return;
            }
          }
        }
        break;
      }

      case AutocompleteMode.docSearch: 
      case AutocompleteMode.journalPageSearch: {
        // if it's a regular character, update the filter string
        if (event.key.length===1) {
          // if the filter is the same as the default, we want to start a new search.
          if (this._shownFilter === this._editor.ownerDocument.getSelection()?.toString()) {
            this._shownFilter = '';
          }

          this._shownFilter += event.key;

          await this._refreshSearch();
        } else {
          // handle special keys

          // Before the searche result we can have one or two specion command:
          //   - Create New (always there)
          //   - Select current Journal (in search journal page only)
          const resultStartOffset = this._initialSearchOffset();
          switch (event.key) {
            case 'Enter': {
              if (this._currentMode===AutocompleteMode.docSearch) {
                if (this._searchDocType === null) return;

                // if it's 0, pop up the add item dialog
                if (this._focusedMenuKey===0) {
                  if (this.currentSearchDocType?.isFCB) {
                    await this._createFCBDocument(this._searchDocType);
                  } else {
                    await this._createDocument(this._searchDocType);
                  }
                } else if (this._searchDocType===ValidDocType.Journal) {
                  // for journal, we have to go into journal mode
                  this._currentMode = AutocompleteMode.journalPageSearch;

                  // get the clicked journal
                  let journal;
                  if (this._currentDoc && this._focusedMenuKey===1) {
                    // the current journal special command
                    journal = {
                      uuid: this._currentDoc.parent?.uuid,
                      name: this._currentDoc.parent?.name,
                      parentJournal: this._currentDoc.parent
                    };
                  } else {
                    journal = this._filteredSearchResults?.[this._focusedMenuKey - 2];
                  }
                  this._selectedJournal = {...journal};

                  // reset search
                  this._lastJournalFilter = this._shownFilter;
                  this._shownFilter = (() => {
                    const selectedTextInEditor = this._editor.ownerDocument.getSelection()?.toString();
                    // If there is a selected text in the editor and it was not use as filter 
                    //    to select the journal, put back the selected text as filter for the page.
                    if (selectedTextInEditor &&
                        (this._focusedMenuKey === 1 || this._shownFilter !== selectedTextInEditor))
                      return selectedTextInEditor ;
                      
                    return '';
                  })();
                  this._focusedMenuKey = 0;   // use whole journal
                  this._searchingFromJournalPage = false;

                  await this._refreshSearch();
                } else {
                  // get the clicked item
                  const item = this._filteredSearchResults[this._focusedMenuKey-1];

                  // insert the appropriate text
                  if (item) {
                    // FCB items need names, the others we want to leave blank
                    if (this.currentSearchDocType?.isFCB) {
                      this._insertReferenceAndClose(item.uuid, item.name);
                    } else {
                      this._insertReferenceAndClose(item.uuid);
                    }
                  }
                }
              } else {
                // handle journal page select
                // if it's 0, we are creating a new page.
                if (!this._focusedMenuKey) {
                  await this._createDocument(this._searchDocType as ValidDocType);
                }
                // if it's 1 (and we're not searching current journal), we just add a reference to the whole journal
                else if (this._focusedMenuKey === 1) {
                  this._insertReferenceAndClose(this._selectedJournal.uuid);
                } else {
                  const numFixedEntries = 2;

                  // pages have to be entered as a UUID
                  // get the clicked item
                  const item = this._filteredSearchResults[this._focusedMenuKey-numFixedEntries];

                  // insert the appropriate text
                  if (item) {
                    if (this.currentSearchDocType.isFCB)
                      this._insertReferenceAndClose(item.uuid, item.name);
                    else
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
                  // we're in journal page search mode; go back to journal search
                  this._currentMode = AutocompleteMode.docSearch;
                  this._shownFilter = this._lastJournalFilter;
                  this._lastJournalFilter = '';
                  this._searchingFromJournalPage = (this._currentDoc?.documentName === 'JournalEntryPage');
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
            
            case 'Escape': {
              // just close the whole menu (without inserting @, because it's more likely we just changed our mind)
              this._editor.focus();
              await this.close();
              return;
            }

            case 'ArrowUp': {
              this._focusedMenuKey = (this._focusedMenuKey - 1 + this._filteredSearchResults.length + resultStartOffset) % (this._filteredSearchResults.length + resultStartOffset);
              break;
            }

            case 'ArrowDown': {
              this._focusedMenuKey = (this._focusedMenuKey + 1) % (this._filteredSearchResults.length + resultStartOffset);
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
  };
          
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

    // return coord
    //return { x: rect.x - editorRect.left + paddingLeft, y: rect.y - editorRect.top + paddingTop };    
    return { left: rect.left + adjustmentRect.left + paddingLeft, top: rect.top + adjustmentRect.top + paddingTop }
  };

  // _lastPulledSearchResults contains the full set of what we got back last time we pulled
  private _getFilteredSearchResults(): SearchResult[] {
    const FULL_TEXT_SEARCH = true; // TODO (for now, only name is searchable anyway)
    const RESULT_LENGTH = ModuleSettings.get(SettingKeys.resultLength);

    let retval = [] as SearchResult[];

    if (FULL_TEXT_SEARCH) { // TODO
      retval = this._lastPulledSearchResults;  // we don't know enough to filter any more (other than length of list)
    } else {
      retval = [];
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
      else if (this.currentSearchDocType?.isFCB)
        await this._pullFCBData();
      else
        await this._pullData();
    }

    // if there's at least one result, select it  
    // TODO - check this... should it be >=2 when _searchingFromJournalPage
    this._filteredSearchResults = this._getFilteredSearchResults();
    if (this._filteredSearchResults.length >=1) {
      this._focusedMenuKey = this._initialSearchOffset();
    } else {
      // select create/whole journal option
      this._focusedMenuKey = 0;
    }
  };

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

    if (!this.currentSearchDocType?.collectionName) {
      this._lastPulledFilter = '';
      this._lastPulledType = null;
      this._lastPulledSearchResults = [];
      return;
    }

    // Check how many result make the <...> appear; we want that many (if available)
    //   because otherwise when we display the list we don't know if there were
    //   more
    const resultsDesired = ModuleSettings.get(SettingKeys.resultLength) + 1;
    let results = [] as DocumentType11[];

    // if we have a current doc, check for a compendium (if doc is a journal page, use the parent entry instead)
    const curMainDoc = this._currentDoc?.parent ?? this._currentDoc;
    const curCompendium = curMainDoc?.compendium?.collection;

    // If we are editing from a compendium, search compendia first
    if (curCompendium) {
      results = await this._searchCompendia(resultsDesired, this.currentSearchDocType.referenceText);
    }

    // Check in game document (not in compendium)
    const collection = getGame()[this.currentSearchDocType.collectionName] as DocumentType11;
    const FULL_TEXT_SEARCH = true;   // TODO: pull from settings; at the moment, only name seems to be searchable

    if (FULL_TEXT_SEARCH) {
      results = results.concat(collection.search({query: this._shownFilter, filters:[]}) as DocumentType11[]);
    } else {
      //results.concat(collection.search({query: this._shownFilter, filters: [nameFilter]}));
    }

    // If we are not editing from a compendium, search compendia last
    if (!curCompendium) {
      const compendiumResult = await this._searchCompendia(resultsDesired - results.length, this.currentSearchDocType.referenceText);
      results = results.concat(compendiumResult);
    }

    // remove any null names (which Foundry allows)
    results = results.filter((item)=>(item.name));

    this._lastPulledRowCount = results.length;

    this._lastPulledSearchResults = results.map((item) => {
      const pack = (() => {
        // There is no compendium to display in name if the result is not from one.
        if (!item.pack)
          return '';

        // When the result is in the same compendium explicitly show it.
        if (curCompendium === item.pack)
          return ' (this compendium)';
        
        return ` (${item.pack})`;
      })();

      const name = `${item.name}${pack}`;

      if (this._searchDocType === ValidDocType.Journal)
        return {
          uuid: item.uuid,
          name,
          parentJournal: item
        }
      return { uuid: item.uuid, name }
    }) as SearchResult[];
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

    const collection = this._selectedJournal?.parentJournal?.pages;
    if (!collection)
      return;

    let results: DocumentType11[];
    const FULL_TEXT_SEARCH = true;   // TODO: pull from settings; for now it doesn't seem to matter
    if (FULL_TEXT_SEARCH) {
      results = collection.search({query: this._shownFilter, filters:[]}) as DocumentType11[];
    } else {
      results=[];
      //results = collection.search({query: this._shownFilter, filters: [nameFilter]});
    }

    // remove any null names (which Foundry allows)
    results = results.filter((item)=>(item.name));

    this._lastPulledRowCount = results.length;

    this._lastPulledSearchResults = results.map((item)=>({ uuid: item.uuid, name: item.name})) as SearchResult[];

    return;
  }

  // pull the new data from the FCB API
  private async _pullFCBData(): Promise<void> {
    if (this._searchDocType === null) {
      this._lastPulledFilter = '';
      this._lastPulledType = null;
      this._lastPulledSearchResults = [];
      this._lastPulledRowCount = 0;
      return;
    }

    this._lastPulledFilter = this._shownFilter;
    this._lastPulledType = this._searchDocType;

    let results = [] as SearchResult[];

    // in theory campaign-builder must be installed since we got here because we're in an fcb div... but 
    //    maybe some other module is conflicting
    try {
      const api = game.modules.get('campaign-builder').api;

      switch (this._searchDocType) {
        case ValidDocType.Character:
          results = await api.getEntries(api.TOPICS.Character);
          break;
        case ValidDocType.Location:
          results = await api.getEntries(api.TOPICS.Location);
          break;
        case ValidDocType.Organization:
          results = await api.getEntries(api.TOPICS.Organization);
          break;
        case ValidDocType.World:
          results = await api.getWorld();
          break;
        case ValidDocType.Campaign:
          results = await api.getCampaigns();
          break;
        case ValidDocType.Session:
          results = await api.getSessions();
          break;  
        default:
          this._lastPulledFilter = '';
          this._lastPulledType = null;
          this._lastPulledSearchResults = [];
          this._lastPulledRowCount = 0;
          return;  
      }

      results = results.filter((i)=>(i.name.toLowerCase().startsWith(this._shownFilter.toLowerCase())));

      this._lastPulledRowCount = results.length;
      this._lastPulledSearchResults = results;
      return;
    } catch (_e) {
      throw new Error('Autocomplete mentions thought there was Campaign Builder but api failed');
    }
  }
  
  // maxResultCount is the max number of matches desired
  private async _searchCompendia(maxResultCount: number, documentName: string): Promise<DocumentType11[]> {
    // No need to do anything if there is no place for any result.
    if (maxResultCount < 1)
      return [];

    // Check in the settings what are the compendium to include.
    const includedCompendia = ModuleSettings.get(SettingKeys.includedCompendia);
    if (!includedCompendia)
      return [];

    let results = [] as DocumentType11[];
    const query = SearchFilter.cleanQuery(this._shownFilter);
    const queryRegex = new RegExp(RegExp.escape(query), "i");

    const compendia = includedCompendia.split(',');
    for (const compendium of compendia) {
      const compendiumRegEx = new RegExp(compendium.trim());
      const compMatchs = getGame().packs.filter(p => compendiumRegEx.test(p.collection) && p.documentName === documentName);
      for (const compMatch of compMatchs) {
        // find any matching docs
        const matches = compMatch.index.filter(r => r.name !== undefined && queryRegex.test(r.name)).map(c => c._id);
        const matchdocs = (await compMatch.getDocuments({ _id__in: matches })) as DocumentType11[];
        results = results.concat(matchdocs);

        if (results.length >= maxResultCount)
          return results;
      }
    }

    return results;
  }

  private async _moveToDocSearch(docType: ValidDocType) {
    this._currentMode = AutocompleteMode.docSearch
    this._searchDocType = docType;
    this._shownFilter = this._editor.ownerDocument.getSelection()?.toString() || '';
    this._focusedMenuKey = 0;
    this._searchingFromJournalPage = (docType === ValidDocType.Journal && this._currentDoc?.documentName === 'JournalEntryPage');
    
    await this._refreshSearch();
  }
  private _insertReferenceAndClose(uuid: string, name?: string): void {
    // convert any highlighted text into the manual label for the link
    const selectedTextInEditor = this._editor.ownerDocument.getSelection()?.toString();

    if (name)
      this._insertTextAndClose(`@UUID[${uuid}]{${name}}`);
    else {
      const label = selectedTextInEditor ? `{${selectedTextInEditor}}` : '';
      this._insertTextAndClose(`@UUID[${uuid}]${label}`);
    }
  }

  private _insertTextAndClose(text: string): void {
    this._editor.focus();  
    this._editor.ownerDocument.execCommand('insertText', false, text);
    void this.close();
  }

  private async _createFCBDocument(docType: ValidDocType): Promise<void> {
    throw new Error("Not implemented - _createFCBDocument");
    return;
  }

  private async _createDocument(docType: ValidDocType): Promise<void> {
    const docTypeInfo = this.currentDocTypes.find((dt) => dt.type === docType);

    if (!docTypeInfo)
      return;

    if (docTypeInfo.isFCB) {
      await this._createFCBDocument(docType);
      return;
    }
    
    let pack = null as string | null;
    let folder = null as string | null;
    let parent = null as JournalEntry11 | null;
    let sort = null as number | null;
    let documentName = '';

    const collection = getGame()[docTypeInfo.collectionName] as DocumentType11;
    const curMainDoc = (this._currentDoc?.parent ?? this._currentDoc) as DocumentType11;

    TODO: if we're in campaign mode we don't have a current document, so need to do something else

    if (this._currentMode === AutocompleteMode.journalPageSearch) {
      // We are creating a new page in a journal; set the journal as parent
      //    and add it at the end of the journal
      parent = this._selectedJournal?.parentJournal as JournalEntry11;
      sort = (this._selectedJournal?.parentJournal?.pages.contents.at(-1)?.sort ?? 0) + CONST.SORT_INTEGER_DENSITY;
      documentName ='JournalEntryPage'; 
    } else if (curMainDoc.documentName === collection.documentName) {
      // We are creating a new entry of the same type of the document we are editing;
      //    create it in the same pack/compendium and folder.
      pack = curMainDoc.compendium?.collection;
      folder = curMainDoc.folder?.id ?? null;
      documentName = collection.documentName;
    } else {
      documentName = collection.documentName;
    }

    // Use current filter as default name
    const data = { folder, name: this._shownFilter, sort };
    const options = { pack, parent };

    // register the hook to catch after the document is made
    // we need to save the current editor selection because it goes away when the new boxes pop up
    const selection = this._editor.ownerDocument.getSelection();
    const range = selection?.rangeCount ? selection?.getRangeAt(0) : null;

    const cls = getDocumentClass(documentName) as any;
    cls.createDialog(data, options).then(async (result: DocumentType11 | null): void => {
      if (result) {
        // it was created

        // Check if we had a default name and if the user did not change it; if
        //    so, change it to the filter name
        // We have to do this because we can't actually prepopulate the name box,
        //    so we instead change the prompt label and then look for them
        //    leaving the prompt showing (by typing nothing)
        if (this._shownFilter.length > 0) {
          const label = getGame().i18n.localize(cls.metadata.label);
          const docDefaultName = getGame().i18n.format('DOCUMENT.New', { type: label });
          if (result.name?.startsWith(docDefaultName)) {
            await result.update({ name: this._shownFilter });
          }
        }
        if (range) {
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
        this._insertReferenceAndClose(result.uuid);
      } else {
        // dialog was canceled; nothing to do      
      }
    });

    void this.close();
  }

  private _initialSearchOffset = (): number => (
    this._searchingFromJournalPage || this._currentMode === AutocompleteMode.journalPageSearch ? 2 : 1
  );
}