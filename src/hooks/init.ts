import { ModuleSettings, updateModuleSettings } from '@/settings/ModuleSettings';

export function registerForInitHook() {
  Hooks.once("init", init);
}

const init = async (): Promise<void> {
  // initialize settings first, so other things can use them
  updateModuleSettings(new ModuleSettings());
}

