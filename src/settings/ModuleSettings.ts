import { localize } from '@/utils/game';
import moduleJson from '@module';

export enum SettingKeys {
  // displayed in settings
  resultLength = 'resultLength',
  includedCompendia = 'includedCompendia',
  addName = 'addName',
  // internal only
}

type SettingType<K extends SettingKeys> =
    K extends SettingKeys.resultLength ? number :
    K extends SettingKeys.includedCompendia ? string :
    K extends SettingKeys.addName ? boolean :
    never;  

export class ModuleSettings {
  public static isSettingValueEmpty(setting: any): boolean {
    return Object.keys(setting).length === 0 || setting === null || setting === undefined;
  }

  public static get<T extends SettingKeys>(setting: T): SettingType<T> {
    return game.settings.get(moduleJson.id, setting) as SettingType<T>;
  }

  public static async set<T extends SettingKeys>(setting: T, value: SettingType<T>): Promise<void> {
    await game.settings.set(moduleJson.id, setting, value);
  }

  private static register(settingKey: string, settingConfig: ClientSettings.PartialSettingConfig) {
    game.settings.register(moduleJson.id, settingKey, settingConfig);
  }

  private static registerMenu(settingKey: string, settingConfig: ClientSettings.PartialSettingSubmenuConfig) {
    game.settings.registerMenu(moduleJson.id, settingKey, settingConfig);
  }

  // these are local menus (shown at top)
  private static localMenuParams: (ClientSettings.PartialSettingSubmenuConfig & { settingID: string })[] = [
  ];

  // these are globals shown in the options
  // name and hint should be the id of a localization string
  private static displayParams: (ClientSettings.PartialSettingConfig & { settingID: string })[] = [
    {
      settingID: SettingKeys.resultLength,
      name: 'acm.settings.resultLength',
      hint: 'acm.settings.resultLengthHelp',
      default: 5,
      type: Number,
    },
    {
      settingID: SettingKeys.includedCompendia,
      name: 'acm.settings.includedCompendia',
      hint: 'acm.settings.includedCompendiaHelp',
      default: '',
      type: String,
    },
    {
      settingID: SettingKeys.addName,
      name: 'acm.settings.addName',
      hint: 'acm.settings.addNameHelp',
      default: true,
      type: Boolean,
    }
  ];

  // these are client-specific and displayed in settings
  private static localDisplayParams: (ClientSettings.PartialSettingConfig & { settingID: string })[] = [
  ];

  // these are globals only used internally
  private static internalParams: (ClientSettings.PartialSettingConfig & { settingID: string })[] = [
  ];
  
  // these are client-specfic only used internally
  private static localInternalParams: (ClientSettings.PartialSettingConfig & { settingID: string })[] = [
  ];

  public static registerSettings(): void {
    for (let i=0; i<ModuleSettings.localMenuParams.length; i++) {
      const { settingID, ...settings} = ModuleSettings.localMenuParams[i];
      ModuleSettings.registerMenu(settingID, {
        ...settings,
        name: settings.name ? localize(settings.name) : '',
        hint: settings.hint ? localize(settings.hint) : '',
        restricted: true,
      });
    }

    for (let i=0; i<ModuleSettings.displayParams.length; i++) {
      const { settingID, ...settings} = ModuleSettings.displayParams[i];
      ModuleSettings.register(settingID, {
        ...settings,
        name: settings.name ? localize(settings.name) : '',
        hint: settings.hint ? localize(settings.hint) : '',
        scope: 'world',
        config: true,
      });
    }

    for (let i=0; i<ModuleSettings.localDisplayParams.length; i++) {
      const { settingID, ...settings} = ModuleSettings.localDisplayParams[i];
      ModuleSettings.register(settingID, {
        ...settings,
        name: settings.name ? localize(settings.name) : '',
        hint: settings.hint ? localize(settings.hint) : '',
        scope: 'client',
        config: true,
      });
    }

    for (let i=0; i<ModuleSettings.internalParams.length; i++) {
      const { settingID, ...settings} = ModuleSettings.internalParams[i];
      ModuleSettings.register(settingID, {
        ...settings,
        scope: 'world',
        config: false,
      });
    }

    for (let i=0; i<ModuleSettings.localInternalParams.length; i++) {
      const { settingID, ...settings} = ModuleSettings.localInternalParams[i];
      ModuleSettings.register(settingID, {
        ...settings,
        scope: 'client',
        config: false,
      });
    }
  }
}
