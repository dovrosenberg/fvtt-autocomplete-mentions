import moduleJson from '@module';
import { log } from '@/utils/log';
import { DOCUMENT_TYPES } from '@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/constants.mjs';

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
  private _target: HTMLElement;    // the editor element
  private _currentMode: AutocompleteMode;
  private _location: WindowPosition;   // location of the popup
  private _focusedMenuKey: number;

  constructor(target: HTMLElement, onClose: ()=>void) {
    super();

    log(false, 'Autocompleter construction');

    this._target = target;
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
    this._target = newTarget;
    this.render(false);
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
  //     this.render(false);
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

    switch (event.key) {
      case "Escape": {
        this.close();
        return;
      }
      case "ArrowUp": {
        this._focusedMenuKey = (this._focusedMenuKey - 1 + docTypes.length) % docTypes.length;
        this.render(false);
        return;
      }
      case "ArrowDown": {
        this._focusedMenuKey = (this._focusedMenuKey + 1) % docTypes.length;
        this.render(false);
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
        // this.render(false);
        return;
      }
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
    const editorRect = this._target?.getBoundingClientRect();
    if (!editorRect) return null;

    // return coord
    const rect = rects[0];  // this is the location of the cursor
    //return { x: rect.x - editorRect.left + paddingLeft, y: rect.y - editorRect.top + paddingTop };    
    return { left: rect.left + paddingLeft, top: rect.top + paddingTop }
  }

}
