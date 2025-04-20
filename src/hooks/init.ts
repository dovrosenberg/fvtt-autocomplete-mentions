import { Autocompleter } from '@/autocomplete/autocompleter';
import { ModuleSettings, } from '@/settings/ModuleSettings';
import { EditorType } from '@/types';

let autocompleter = null as Autocompleter | null;

export function registerForInitHook() {
  Hooks.once('init', init);
}

async function init(): Promise<void> {
  // initialize settings first, so other things can use them
  ModuleSettings.registerSettings();

  registerKeyListeners();
}

// register the main listener
function registerKeyListeners() {
  jQuery(document).on('keydown', '.ProseMirror.editor-content[contenteditable="true"]', { editorType: EditorType.ProseMirror }, onKeydown);
}

async function onKeydown (event: JQuery.KeyDownEvent) {
  // watch for the @
  if (event.key === '@') {
    event.preventDefault();

    const editorType = event.data.editorType as EditorType;

    await activateAutocompleter(event.target, editorType);
  }
}

async function activateAutocompleter (targetElement, editorType) {
  await autocompleter?.close();

  // Check if the editor is inside a div with .fcb-editor class
  const isCampaignBuilderEditor = targetElement.closest && targetElement.closest('.fcb-editor') != null;
  
  // Create a new autocompleter
  autocompleter = new Autocompleter(targetElement, editorType, () => {
    // When this Autocompleter gets closed, clean up the registration for this element.
    autocompleter = null;
  }, isCampaignBuilderEditor);
  
  await autocompleter.render(true);
}