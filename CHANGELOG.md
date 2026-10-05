# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Added

- `labels` option that shows theme titles as text in the panel, for touch screens.
- A clear console error when Origo is not loaded before the plugin.
- Compatibility section in the README.

### Changed

- The default main icon is now `#ic_map_24px` instead of `#o_legend_24px`, which is the icon of the layers in Origo's legend.
- In exclusive mode the new theme is activated before the others are switched off, so shared layers are no longer switched off and on again.
- Line endings are normalised to LF through `.gitattributes`.

### Fixed

- On iOS Safari the panel now closes when the map is tapped. It closes on `pointerdown` instead of `click`.
- An icon whose sprite loads just before `iconTimeout` runs out is kept instead of being replaced by the fallback icon.

### Removed

- The unused `examples/theme-selector-preview.png`.
