# Change Log

## v2.1.2 - Fixed positioning off screen
![](https://img.shields.io/badge/release%20date-May%2028%2C%202025-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v2.1.2/module.zip)

- The box now pops up to the top/left of the cursor if needed to avoid going off the edge of the window

## v2.1.1 - List filters by any match - not just at the start of a name
![](https://img.shields.io/badge/release%20date-May%2026%2C%202025-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v2.1.1/module.zip)

- The filter as you type used to only match the beginning of a document name - now it will match against anything; so (for example)
if you search "bla" it will now match "The Black Marsh" and not just "Black Marsh"

## v2.0.2 - FCB links no longer hard code names
![](https://img.shields.io/badge/release%20date-May%2026%2C%202025-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v2.0.2/module.zip)

- When inserting links into Foundry World & Campaign Builder, it no longer hard codes the names (instead allowing the editor to do an auto-lookup)

## v2.0.1 - Minor (and major?) bug fixes
![](https://img.shields.io/badge/release%20date-May%2024%2C%202025-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v2.0.1/module.zip)

- Some bug fixes.
- Some users were reporting that 2.0.0 wasn't working at all (hitting @ did nothing).  This has been fixed, I think.

## v2.0.0 - Foundry VTT v13 compatibility
![](https://img.shields.io/badge/release%20date-April%2017%2C%202025-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v2.0.0/module.zip)

- Update compatibility to support Foundry v13.  There are breaking changes - continue to use v1.1.1 for prior Foundry versions.
- Support for Campaign Builder module - allows you to mention characters, locations, organizations, campaigns, and sessions.  

## v1.1.1 - Update version support to 12.331
![](https://img.shields.io/badge/release%20date-August%2017%2C%202024-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v1.1.1/module.zip)

- Update version support to 12.331

## v1.1.0 - Lots of new features!
![](https://img.shields.io/badge/release%20date-December%2031%2C%202023-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v1.1.0/module.zip)

Many usability improvements, thanks to Sylvercode
- Use selected text as initial search input
  - Selected text will also be preserved as a manual label
- Use the current filter as the default text when creating a new item
- Easy ability to reference the current journal (when editing from inside a journal)
- Ability to search compendia (and a setting to indicate which ones)
- Ability to create a page in a journal
- When creating a new document of the same type as the one being edited, put it in the same folder

Also a bug fix (ditto on the credit):
- Give focus back to the editor when closing the search box

## v1.0.1 - URL fix in module.json
![](https://img.shields.io/badge/release%20date-December%202%2C%202023-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v1.0.1/module.zip)

Fixed bad URL in module.json

## v1.0.0 - Support for TinyMCE
![](https://img.shields.io/badge/release%20date-November%2025%2C%202023-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v1.0.0/module.zip)

Added support for TinyMCE editors.


## v0.0.8 - Initial Release

![](https://img.shields.io/badge/release%20date-November%2023%2C%202023-blue)
![GitHub release](https://img.shields.io/github/downloads-pre/dovrosenberg/fvtt-autocomplete-mentions/v0.0.8/module.zip)

The initial public release.

- Easily insert references to any document type
- Search by name
- Create new documents on the fly, simultaneously inserting references
- Setting to control search results length
