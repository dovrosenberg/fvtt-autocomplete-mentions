[![Supported Foundry Versions](https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https://github.com/dovrosenberg/fvtt-autocomplete-mentions/raw/master/static/module.json)](https://github.com/dovrosenberg/fvtt-autocomplete-mentions)

Quickly insert cross-references to actors, items, scenes, roll tables, and journals inside any editor box in Foundry without needing find them, drag & drop, or remember the precise spelling/capitalization.

[Feature requests?](https://github.com/dovrosenberg/fvtt-autocomplete-mentions/issues/new/choose)

## Features
- Facilitate your world building by rapidly cross-referencing other parts of your world as you write, 
without needing to stop to drag & drop or even create a new element. 
- Insert references to actors, items, journals (and pages), scenes, and roll tables.
- Quickly create new documents (actors, etc.) with a couple of keystrokes, simultaneous inserting a reference 
to the newly created element into the editor.
- Inserts references as pure UUID so that the link text updates when the name of the referenced item changes 

## How it works
- Typing @ in any* Foundry VTT editor will pop open a context menu where you can select the type of document.
- Select the document type by using the up/down arrows and enter key, typing the first letter as indicated, 
or clicking with the mouse
- You'll then get a list of the available documents of that type.  Start typing to filter the list.  Filtering is Foundry's full-text search (which currently appears to only search the name field, but finds matches in any part of the field - not just the start.  For example, 'j', 'jo', and 'oe' would all be matches for an actor named 'Joe'). Searching is not case sensitive.
- You can select the document you want with the arrow/enter keys or clicking with the mouse.  You can also use the "Create" button to quickly create a new document while simultaneously inserting a reference to it.
- In the case of journal entries, once you pick the main entry, you'll get a subscreen where you can search for and select a specific page to refer to (or just pick the option to point to the overall entry).
- Backspace will delete characters from the search string, and when the search string is empty, it will also go back to the prior menu.  
- The Escape key will close the menu without inserting a reference.  Pressing escape immediately on the first menu after typing '@' will insert a '@' character in the editor for scenarios where you need that character. 
- There is a module setting to set the maximum number of search results that will show at one time.  If you set it really high, I take no responsibility for failures of the UI to accomodate. :) 
- Note that links will be inserted as just UUID references, which means that when you view the text (not in edit mode), you'll see the current name of the referenced document - even if it has changed since the link was inserted. If you want to have the link text set permanently, regardless of future changes to the document name, you can manually add the text. For example, you might get a reference like: `@UUID[Actor.E6azrOSJJfSxvgty]`. By adding text in curly brackets immediately afterward (ex. `@UUID[Actor.E6azrOSJJfSxvgty]{Joe}`), you can make the link text read "Joe", even if you change the Actor's name in the future, while ensuring the link continues to work.

\* Note: currently only supports the new (standard) ProseMirror editor - send me a feature request if 
you need a different one


## Issues?

If you believe you found a bug or would like to post a feature request, head over to the module's [Github repo](https://github.com/dovrosenberg/fvtt-autocomplete-mentions) and [open a new issue](https://github.com/dovrosenberg/fvtt-autocomplete-mentions/issues/new/choose).

## Support

I'm happy to do this for free, as I primarily work on things I like to use myself.  But if you'd like to [buy me a root beer](https://ko-fi.com/phloro), I love knowing that people are using my projects and like them enough to make the effort. It's really appreciated!  

## Credits

Autocomplete Mentions is the result of the effort of many people (whether they know it or not). Please refer to [CREDITS.md](https://github.com/dovrosenberg/fvtt-autocomplete-mentions/blob/master/CREDITS.md) for the full list.


## Copyright and usage
THIS ENTIRE REPOSITORY IS COVERED BY THIS LICENSE AND COPYRIGHT NOTICE

Copyright 2023 Dov Rosenberg

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
