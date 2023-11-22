import moduleJson from '@module';
import { log } from '@/utils/log';

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

const docTypes = [
  { key: 'A', title: 'Actors' },
  { key: 'I', title: 'Items' },
  { key: 'J', title: 'Journal entries/pages' },
  { key: 'R', title: 'Roll Tables' },
  { key: 'S', title: 'Scenes' },
];

export class Autocompleter extends Application {
  private _onClose: ()=>void;      // function to call when we close
  private _editor: HTMLElement;    // the editor element
  private _currentMode: AutocompleteMode;
  private _location: WindowPosition;   // location of the popup
  private _focusedMenuKey: number;
  private _searchDocType: string;   // if we're in doc search mode, the key of the docType to search
  private _shownFilter: string;    // current filter for doc search

  constructor(target: HTMLElement, onClose: ()=>void) {
    super();

    log(false, 'Autocompleter construction');

    this._editor = target;
    this._currentMode = AutocompleteMode.singleAtWaiting;
    this._onClose = onClose;

    this._location = this._getSelectionCoords(10, 0) || { left: 0, top: 0 };
    this._focusedMenuKey = 0;

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
    };
    //log(false, data);

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


  private _onKeydown = async (event: KeyboardEvent): Promise<void> => {
    event.preventDefault();
    event.stopPropagation();

    // get the key of the selected item
    const selectedKey = ____.toUpperCase();

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
        }
        return;
      }
      case "ArrowUp": {
        this._focusedMenuKey = (this._focusedMenuKey - 1 + docTypes.length) % docTypes.length;
        this.render();
        return;
      }
      case "ArrowDown": {
        this._focusedMenuKey = (this._focusedMenuKey + 1) % docTypes.length;
        this.render();
        return;
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
        return;
      }
    }

    // for various other keys, it depends on the model
    switch (this._currentMode) {
      case AutocompleteMode.singleAtWaiting: {
        switch (event.key) {
          case 'Enter':
            // select the item
            if (!selectedKey) return;

            // move to the next menu
            this._currentMode = AutocompleteMode.docSearch
            this._searchDocType = selectedKey;
            this._focusedMenuKey = 0;

            this.render();

            return;

          case 'Backspace':
            // close the menu
            this.close();
            return;

          case 'a':
          case 'A':
          case 'i':
          case 'I':
          case 'j':
          case 'J':
          case 'r':
          case 'R':
          case 's':
          case 'S':
            // finalize search mode and select the item type
            this._currentMode = AutocompleteMode.docSearch;
            this._searchDocType = selectedKey;
            this._focusedMenuKey = 0;

            this.render();
            return;

          default:
            // ignore
            break;
        }
        break;
      }
      case AutocompleteMode.docSearch: {
        // if it's a regular character, update the filter string
        if (event.key.length===1) {
          this._shownFilter += event.key;

          await this._checkRefresh();

          return;
        } 

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

          case 'Backspace':
            // if the shownfilter is empty, go back to singleAtWaiting mode
            if (this._shownFilter.length === 0) {
              this._currentMode = AutocompleteMode.singleAtWaiting;
              this._focusedMenuKey = 0;

              this.render();

              return;
            } else {
              // otherwise delete a character
              this._shownFilter = this._shownFilter.slice(0, -1);

              await this._checkRefresh();

              this._focusedMenuKey = 0;

              this.render();

              return;
            }
          
          default:
            // ignore
            break;
        }
        break;
      }
      case AutocompleteMode.journalPageSearch: {
        break;
      }
      default: 
        break;
    }
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

  WORK ON THIS NEXT
  // has the filter changed in a way that we need to refresh the search results?
  // we only refresh the results if a) the active filter isn't an extension of the last searched one or
  //    b) the last search told us there were more rows than we pulled for the prior search
  // this is written as an async function that tracks what we've pulled from the server/database so that we can minimize unneeded pulls
  // for now, though, we're just reading everything in 
  private _checkRefresh = async function(): Promise<void> {
    // if it's a different type than we pulled last time, we need to refresh
    // if the current filter is an extension of the last one and we have all the rows, we don't need to refresh
    // also if there isn't a lastPulledFilter, we need to refresh
    if ((lastPulledType === searchItemType.value) &&
        (lastPulledFilter && shownfilter.value.toLowerCase().startsWith(lastPulledFilter.toLowerCase()) && (lastPulledRowCount <= searchResults.value.length)))
      return;

    // otherwise, we need to refresh
    // clear the current results so they don't show while we're waiting
    searchResults.value = [];
    await pullData();

    // if there's at least one result, select it
    if (searchResults.value.filter((i)=>(i.name.toLowerCase().includes(shownfilter.value.toLowerCase()))).length >= 1) {
      focusedMenuKey = 1;
      window.setTimeout(() => { document.getElementById(`menu-item-${focusedMenuKey}`)?.focus(); } , 0);
    } else {
      // select create option
      focusedMenuKey = 0;
      window.setTimeout(() => { document.getElementById(`menu-item-${focusedMenuKey}`)?.focus(); } , 0);
    }
  }

}
