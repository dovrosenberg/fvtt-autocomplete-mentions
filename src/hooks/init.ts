import { Autocompleter } from '@/autocomplete/autocompleter';
import { ModuleSettings, updateModuleSettings } from '@/settings/ModuleSettings';

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
  jQuery(document).on('keydown', '.ProseMirror.editor-content[contenteditable="true"]', onKeydown);

  // MCE editors are inside an iframe :(
  // it really seems like there should be a better way to do this, but just putting a keydown on 
  //    iframes didn't work... I don't think the keys are bubbling up that high
  // ideally there'd be a hook or something that tells us when a new editor is opened, but the only
  //    one I can find is only called for ProseEditors
  var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        for (let i=0; i<mutation.addedNodes.length; i++) {
          if (mutation.addedNodes[i].nodeName==='IFRAME') {
            jQuery(mutation.addedNodes[i].contentDocument).on('keydown', 'body#tinymce.mce-content-body[contenteditable="true"]', onKeydown);
          }
        }
      })
  });
  observer.observe(document, {
      subtree: true,
      childList: true
  });

}

function onKeydown(event: KeyboardEvent) {
  // watch for the @
  if (event.key === '@') {
      event.preventDefault();
      activateAutocompleter(event.target);
  }
}

function activateAutocompleter(targetElement) {
  autocompleter?.close();

  // Otherwise, create a new autocompleter
  autocompleter = new Autocompleter(targetElement, () => {
      // When this Autocompleter gets closed, clean up the registration for this element.
      autocompleter = null;
  });
  
  autocompleter.render(true);
}