import moduleJson from '@module';
import { log } from '@/utils/log';
import { getGame } from '@/utils/game';
import { DocumentType, ValidDocTypes, WindowPosition, SearchResult, AutocompleteMode } from '@/types';
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


// key and title show in the menu to pick a type
// searchName shows in the search screen ("Searching ___ for: ")
// collectionName is the foundry collection
// referenceText is the text inserted into the editor @___[name]
const docTypes = [
  { key: 'A', title: 'Actors', searchName: 'Actors', collectionName: 'actors', referenceText: 'Actor' },
  { key: 'I', title: 'Items', searchName: 'Items', collectionName: 'items', referenceText: 'Item' },
  { key: 'J', title: 'Journal entries/pages', searchName: 'Journals', collectionName: 'journal', referenceText: 'JournalEntry' },
  { key: 'R', title: 'Roll Tables', searchName: 'Roll Tables', collectionName: 'tables', referenceText: 'RollTable' },
  { key: 'S', title: 'Scenes', searchName: 'Scenes', collectionName: 'scenes', referenceText: 'Scene' },
] as { key: ValidDocTypes, title: string, searchName: string, collectionName: string, referenceText: string }[];


export class Autocompleter extends Application {
  private _onClose: ()=>void;      // function to call when we close
  private _location: WindowPosition;   // location of the popup
  private _editor: HTMLElement;    // the editor element

  // status
  private _currentMode: AutocompleteMode;
  private _focusedMenuKey: number;
  private _searchDocType: ValidDocTypes | null;   // if we're in doc search mode, the key of the docType to search
  private _selectedJournal: SearchResult;   // name of the selected journal when we're looking for pages
  private _shownFilter: string;    // current filter for doc search

  // search results
  private _lastPulledSearchResults: SearchResult[];  // all of the results we got back last time
  private _lastPulledFilter: string;      // the filter we last searched the database for
  private _lastPulledType: ValidDocTypes | null;     // the key of the doctype we last searched the database for
  private _lastPulledRowCount: number;   // the number of rows the last query returned
  private _filteredSearchResults: SearchResult[];   // the currently shown search results

  constructor(target: HTMLElement, onClose: ()=>void) {
    super();

    log(false, 'Autocompleter construction');

    this._editor = target;
    this._currentMode = AutocompleteMode.singleAtWaiting;
    this._onClose = onClose;

    this._location = this._getSelectionCoords(10, 0) || { left: 0, top: 0 };
    this._focusedMenuKey = 0;

    this._searchDocType = null;
    this._shownFilter = '';
    this._lastPulledSearchResults=[];

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
        docType: docTypes.find((dt)=>(dt.key===this._searchDocType))?.searchName,
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
      if (!wrapper.contains(event.target as Node)) {
        // we clicked outside somewhere, so clean everything up
        document.removeEventListener('pointerdown', onPointerDown);
        this.close(); 
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
  }

  public async render(force?: boolean) {
    const result = await super.render(force);
    
    return result;
  }

  async close(options = {}): Promise<void> {
    // turn off visibility immediately so we don't have to wait for the animation
    const wrapper = document.querySelector(`.acm-autocomplete`) as HTMLElement;
    if (wrapper)
      wrapper.style.display = 'none';

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

    console.log(event.key);
    
    // for various other keys, it depends on the model
    switch (this._currentMode) {
      case AutocompleteMode.singleAtWaiting: {
        switch (event.key) {
          case 'Enter': {
            // select the item
            const selectedKey = docTypes[this._focusedMenuKey].key;
            if (!selectedKey) return;

            // move to the next menu
            await this._moveToDocSearch(selectedKey);

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

          case 'a':
          case 'A':
          case 'i':
          case 'I':
          case 'j':
          case 'J':
          case 'r':
          case 'R':
          case 's':
          case 'S': {
            // finalize search mode and select the item type
            await this._moveToDocSearch(event.key.toUpperCase() as ValidDocTypes);

            break;
          }

          default:
            // ignore
            return;
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
                if (!this._searchDocType) return;

                // if it's 0, pop up the add item dialog
                if (!this._focusedMenuKey) {
                  //showAddGlobalItemDialog.value = true;
                } else if (this._searchDocType==='J') {
                  // for journal, we have to go into journal mode
                  this._currentMode = AutocompleteMode.journalPageSearch;

                  // get the clicked journal
                  const journal = this._filteredSearchResults[this._focusedMenuKey-1];
                  this._selectedJournal = { name: journal.name, pages: journal.pages, _id: journal._id };

                  // reset search
                  this._shownFilter = '';
                  this._focusedMenuKey = 0;   // use whole journal
                  await this._refreshSearch();
                } else {
                  // get the clicked item
                  const item = this._filteredSearchResults[this._focusedMenuKey-1];

                  // insert the appropriate text
                  if (item) {
                    const docType = docTypes.find((dt)=>(dt.key===this._searchDocType));
                    this._insertTextAndClose(`@${docType?.referenceText}[${item.name}]`);
                  }
                }
              } else {
                // handle journal page select
                // if it's 0, we just add a reference to the whole journal
                if (!this._focusedMenuKey) {
                  this._insertTextAndClose(`@JournalEntry[${this._selectedJournal.name}]`);
                } else {
                  // pages have to be entered as a UUID
                  // get the clicked item
                  const item = this._filteredSearchResults[this._focusedMenuKey-1];

                  // insert the appropriate text
                  if (item) {
                    const docType = docTypes.find((dt)=>(dt.key===this._searchDocType));
                    this._insertTextAndClose(`@UUID[JournalEntry.${this._selectedJournal._id}.JournalEntryPage.${item._id}]{${item.name}}`);
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
    const sel = document.getSelection();

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

    // return coord
    const rect = rects[0];  // this is the location of the cursor
    //return { x: rect.x - editorRect.left + paddingLeft, y: rect.y - editorRect.top + paddingTop };    
    return { left: rect.left + paddingLeft, top: rect.top + paddingTop }
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
    if (!this._searchDocType) {
      this._lastPulledFilter = '';
      this._lastPulledType = null;
      this._lastPulledSearchResults = [];
      this._lastPulledRowCount = 0;
      return;
    }

    this._lastPulledFilter = this._shownFilter;
    this._lastPulledType = this._searchDocType;  

    const docType = docTypes.find((d)=>(d.key===this._searchDocType));
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

    // id and pages are OK here despite typescript
    this._lastPulledSearchResults = results.map((item)=>({_id: item.id, name: item.name, pages: this._searchDocType==='J' ? item.pages : undefined})) as SearchResult[];  
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

    // id ok here despite typescript
    this._lastPulledSearchResults = results.map((item)=>({_id: item.id, name: item.name, pages: null})) as SearchResult[];

    return;
  }

  private async _moveToDocSearch(docType: ValidDocTypes) {
    this._currentMode = AutocompleteMode.docSearch
    this._searchDocType = docType;
    this._shownFilter = '';
    this._focusedMenuKey = 0;
    await this._refreshSearch();
  }

  private _insertTextAndClose(text: string): void {
    this._editor.focus();  
    document.execCommand('insertText', false, text);
    this.close();
  }

}
