import { Autocompleter } from '@/autocomplete/autocompleter';
import { ModuleSettings, updateModuleSettings } from '@/settings/ModuleSettings';
import { EditorType } from '@/types';

let autocompleter = null as Autocompleter | null;

export function registerForInitHook() {
  Hooks.once('init', init);
}

async function init(): Promise<void> {
  // initialize settings first, so other things can use them
  updateModuleSettings(new ModuleSettings());

  registerKeyListeners();
}

// register the main listener
function registerKeyListeners() {
  jQuery(document).on('keydown', '.ProseMirror.editor-content[contenteditable="true"]', { editorType: EditorType.ProseMirror }, onKeydown);

  // MCE editors are inside an iframe :(
  // it really seems like there should be a better way to do this, but just putting a keydown on 
  //    iframes didn't work... I don't think the keys are bubbling up that high
  // ideally there'd be a hook or something that tells us when a new editor is opened, but the only
  //    one I can find is only called for ProseEditors
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      for (let i=0; i<mutation.addedNodes.length; i++) {
        if (mutation.addedNodes[i].nodeName==='IFRAME') {
          // for some reason I can't figure out, this only works if there's a delay here
          // either way, it successfully attaches - I can see the event on the document - but it never executes
          //   unless I wrap in this delay
          setTimeout(()=> {
            jQuery((mutation.addedNodes[i] as any).contentDocument).on('keydown', 'body#tinymce.mce-content-body[contenteditable="true"]', { editorType: EditorType.TinyMCE }, onKeydown);
          }, 100);
        }
      }
    });
  });
  observer.observe(document, {
    subtree: true,
    childList: true
  });

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

  // Otherwise, create a new autocompleter
  autocompleter = new Autocompleter(targetElement, editorType,  () => {
    // When this Autocompleter gets closed, clean up the registration for this element.
    autocompleter = null;
  });
  
  await autocompleter.render(true);
}