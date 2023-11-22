import moduleJson from '@module';
import { log } from '@/utils/log';
import { getGame } from '@/utils/game';

enum AutocompleteMode {
  singleAtWaiting,  // entered a single @ and waiting for next char to determine what type of search (this is the default when we open it)
  docSearch, // entered a single @ plus a valid document search type
  journalPageSearch,  // entered a single @, picked journal type, selected a journal, and are now picking pages
}

// we can't use foundry's setPosition() because it doesn't work for fixed size, non popout windows
type WindowPosition = {
  left: number;
  top: number;
}

type SearchResult = {
  name: string;
}

enum ValidDocTypes {
  A = 'A',
  I = 'I',
  J = 'J',
  R = 'R',
  S = 'S'
}

type DocumentType = Actor | Scene | Journal | RollTable | Item;

const docTypes = [
  { key: 'A', title: 'Actors', collectionName: 'actors' },
  { key: 'I', title: 'Items', collectionName: 'items' },
  { key: 'J', title: 'Journal entries/pages', collectionName: 'journal' },
  { key: 'R', title: 'Roll Tables', collectionName: 'tables' },
  { key: 'S', title: 'Scenes', collectionName: 'scenes' },
] as { key: ValidDocTypes, title: string, collectionName: string }[];


export class Autocompleter extends Application {
  private _onClose: ()=>void;      // function to call when we close
  private _editor: HTMLElement;    // the editor element
  private _currentMode: AutocompleteMode;
  private _location: WindowPosition;   // location of the popup
  private _focusedMenuKey: number;
  private _searchDocType: ValidDocTypes | null;   // if we're in doc search mode, the key of the docType to search
  private _shownFilter: string;    // current filter for doc search
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
    //this.bringToTop();
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
        highlightedEntry: this._focusedMenuKey,
        searchResults: this._filteredSearchResults,
        shownFilter: this._shownFilter,
    };
    log(false, data);

    return data;
  }

  activateListeners($html: JQuery) {
    super.activateListeners($html);

    const html = $html[0];

    // set the focus to the input box
    //const list = html.querySelector(`ol.acm-list`) as HTMLOListElement;
    //list.focus();

    // set the focus to the control
    const wrapper = html.querySelector('#acm-wrapper') as HTMLDivElement;
    wrapper.focus();

    // close everything when we leave the input
    wrapper.addEventListener('focusout', () => {
      this.close();
    });

    // take keystrokes
    wrapper.addEventListener('keydown', this._onKeydown);

    // for some reason, if instead of putting focus elsewhere we drag the window, focusout never gets called
    // so, we listen for pointerdown events, too (this doesn't seem super safe because foundry could change the event they use...)
    // note for future versions of foundry - make sure this still works
    const onPointerDown = (event: MouseEvent): void => { 
      if (!html.contains(event.target as Node)) {
        // we clicked outside somewhere, so clean everything up
        document.removeEventListener('pointerdown', onPointerDown);
        this.close() 
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
  }

  public async render(force?: boolean) {
    const result = await super.render(force);
    
    //this.bringToTop();

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

  // /**
  //  * @private
  //  */
  // _onInputChanged() {
  //     const input = this.inputElement;
  //     this.rawPath = input.value;
  //     this.selectedCandidateIndex = null;
  //     this.render();
  // }


  /* so here's the flow...
      press @
      Get a menu of Actors, JournalEntries (which will then offer link to parent or pick a page), Items, Scenes, Roll Table
      Press the 1st letter of what you want
      Have an option to create a new one (???) + options for 1st n choices
      As you type more letters, choices filter down

      note: if you pick journalentries, once you pick the entry, you get a followup item with a choice to pick the entry + a list of pages (which
          then filter like the document choices)
  */


  // we render at the end, so can return for cases that don't require it to save that step
  private _onKeydown = async (event: KeyboardEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();

    // get the key of the selected item
    const selectedKey = docTypes[this._focusedMenuKey].key;

    log(false, 'down: ' + event.key);

    // some keys do the same thing in every mode
    switch (event.key) {
      case "Escape": {
        if (this._currentMode===AutocompleteMode.singleAtWaiting) {
          // if we're on the first menu, then we want to insert a @ symbol
          this._editor.focus();  // note that this will automatically trigger closing the menu, as well
          document.execCommand('insertText', false, '@');
        } else {
          // in other modes, we just close the menu without inserting, because it's more likely we just changed our mind
          this.close();
          return;
        }
        break;
      }
      case "ArrowUp": {
        this._focusedMenuKey = (this._focusedMenuKey - 1 + docTypes.length) % docTypes.length;
        break;
      }
      case "ArrowDown": {
        this._focusedMenuKey = (this._focusedMenuKey + 1) % docTypes.length;
        break;
      }
      case "Tab": {
        // const selectedOrBestMatch = this.selectedOrBestMatch;
        // if (!selectedOrBestMatch) {
        //   ui.notifications.warn(`The key "${this.rawPath}" does not match any known keys.`);
        //   this.rawPath = "";
        // } else {
        //   this.rawPath = this._keyWithTrailingDot(selectedOrBestMatch.key);
        // }
        // this.selectedCandidateIndex = null;
        // this.render();
        break;
      }
    }

    // for various other keys, it depends on the model
    switch (this._currentMode) {
      case AutocompleteMode.singleAtWaiting: {
        switch (event.key) {
          case 'Enter': {
            // select the item
            if (!selectedKey) return;

            // move to the next menu
            this._currentMode = AutocompleteMode.docSearch
            this._searchDocType = selectedKey;
            this._focusedMenuKey = 0;

            break;
          }

          case 'Backspace': {
            // close the menu
            this.close();
            return;
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
            this._currentMode = AutocompleteMode.docSearch;
            this._searchDocType = selectedKey;
            this._focusedMenuKey = 0;

            break;
          }
          default:
            // ignore
            return;
        }
        break;
      }
      case AutocompleteMode.docSearch: {
        // if it's a regular character, update the filter string
        if (event.key.length===1) {
          this._shownFilter += event.key;

          await this._refreshSearch();
        } else {
          // handle special keys
          switch (event.key) {
            case 'Enter': {
              // if (!this._searchDocType) return;

              // // if it's null, pop up the add item dialog
              // if (!_id) {
              //   showAddGlobalItemDialog.value = true;
              //   return;
              // } else {
              //   // get the clicked item
              //   item = searchResults.value.find((r)=>(r._id===_id));

              //   // insert the appropriate text
              //   if (item)
              //     insertItemText(item?._id, item?.name);

              //   // close out the menu
              //   this.close();
              //   return;
              // }
              break;
            }

            case 'Backspace': {
              // if the shownfilter is empty, go back to singleAtWaiting mode
              if (this._shownFilter.length === 0) {
                this._currentMode = AutocompleteMode.singleAtWaiting;
                this._focusedMenuKey = 0;
              } else {
                // otherwise delete a character
                this._shownFilter = this._shownFilter.slice(0, -1);

                await this._refreshSearch();

                this._focusedMenuKey = 0;
              }

              break;
            }
            
            default:
              // ignore
              return;
          }
        }

        break;
      }
      case AutocompleteMode.journalPageSearch: {
        break;
      }
      default: 
        return;
    }

    this.render();
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
    const FULL_TEXT_SEARCH = true; // TODO
    const RESULT_LENGTH = 5;  // TODO

    let retval: SearchResult[];

    if (FULL_TEXT_SEARCH) { // TODO
      retval = this._lastPulledSearchResults;  // we don't know enough to filter any more (other than length)
    } else {
      retval = this._lastPulledSearchResults.filter((i)=>(i.name.toLowerCase().includes(this._shownFilter.toLowerCase())));
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
    const MAX_ROWS = 5;  // TODO: pull from settings

    if (!this._shownFilter) {
      this._filteredSearchResults = [];
      this._lastPulledSearchResults = [];
      this._lastPulledRowCount = 0;
      this._lastPulledFilter = '';
      this._lastPulledType = this._searchDocType;
      return;
    }

    if (FULL_TEXT_SEARCH || (this._lastPulledType !== this._searchDocType) ||
        (!this._lastPulledFilter || !this._shownfilter.toLowerCase().startsWith(this._lastPulledFilter.toLowerCase()))) {
      // we need to refresh
      // clear the current results so they don't show while we're waiting
      this._filteredSearchResults = [];
      await this._pullData();
    }

    // if there's at least one result, select it  
    this._filteredSearchResults = this._getFilteredSearchResults();
    if (this._filteredSearchResults.length >=1) {
      this._focusedMenuKey = 1;
    } else {
      // select create option
      this._focusedMenuKey = 0;
    }
  }

  // pull the new data from the database
  private async _pullData<T extends Actors | Items | Journal | RollTables | Scenes>(): Promise<void> {
    if (!this._searchDocType) {
      this._lastPulledFilter = '';
      this._lastPulledType = null;
      this._lastPulledSearchResults = [];
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

    const collection = getGame()[docType.collectionName] as T;

    // note that current typescript definitions don't know about search() function
    let results: DocumentType[];
    const FULL_TEXT_SEARCH = true;   // TODO: pull from settings
    const RESULT_LENGTH = 5;  // TODO: pull from settings
    if (FULL_TEXT_SEARCH) {
      results = collection.search({query: this._shownFilter, filters:[]}) as DocumentType[];
    } else {
      results=[];
      //results = collection.search({query: this._shownFilter, filters: [nameFilter]});
    }

    // remove any null names (which Foundry allows)
    results = results.filter((item)=>(item.name));

    this._lastPulledRowCount = results.length;
    this._lastPulledSearchResults = results.map((item)=>({name: item.name})) as SearchResult[];

    return;
  }

  // private _insertItemText = function(_id: string, name: string): void {
  //   if (!editorRef.value)
  //     return;


  //   // insert the appropriate text
  //   // note the space at the end to ensure the next thing we type stays outside the link (just in case)
  //   const link = `<a href='/worlds/${itemStore.worldId}/${searchItemType.value}/${_id}' data-item-type="${searchItemType.value}">${name}</a>&nbsp;`;

  //   // if there's something selected, delete it
  //   const selection = document.getSelection();
  //   if (selection && !selection.isCollapsed)
  //     selection.deleteFromDocument();

  //   // let the cursor position update so cursor ends after the new text
  //   setTimeout(() => {
  //     // you can't be in the menu in html mode, so we always insert as html
  //     editorRef.value?.runCmd('insertHTML', link, false);

  //     // let parent know value changed
  //     emit('update:modelValue', value.value);
  //   }, 0);
  // }

}
