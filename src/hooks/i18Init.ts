import { initializeLocalizedText } from '@/autocomplete/autocompleter';

export function registerFori18nInitHook() {
  Hooks.once('i18Init', i18Init);
}

async function i18Init(): Promise<void> {
  // load the text
  initializeLocalizedText();
}

