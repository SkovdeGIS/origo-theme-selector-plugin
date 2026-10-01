# Origo Theme Selector

A theme selector for Origo maps. Each theme can enable groups or individual
layers, select a background, set source filters and move the map.
Load the JavaScript and CSS directly; there is no install or build step.

## Requirements

Developed against Origo `2.11.0-dev`, commit
[`728cbc6`](https://github.com/origo-map/origo/tree/728cbc6b3ce6e68debb73d0cfc3d3d03fd1394af),
and tested with the browser distribution in that checkout.
Older releases have not been verified.

Use a current browser with ResizeObserver support.

## Installation

Copy `theme-selector.js` and `theme-selector.css` to
`plugins/theme-selector/` in your Origo installation. Load the CSS after
Origo's stylesheet and the script after Origo.

These are the only two files needed to run the plugin. The `examples/` folder
contains an optional sample map for demonstration and manual testing.

Add the stylesheet, plugin script and `ThemeSelector` setup to your existing
`index.html`, following the example below. Keep your existing `Origo('index.json')`
call and add the component inside its `load` handler; do not create a second map.
The group and layer names in the theme configuration must match those defined
in `index.json`.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Map</title>
  <link rel="stylesheet" href="css/style.css">
  <link rel="stylesheet" href="plugins/theme-selector/theme-selector.css">
</head>
<body>
  <div id="app-wrapper"></div>
  <script src="js/origo.js"></script>
  <script src="plugins/theme-selector/theme-selector.js"></script>
  <script>
    var themeSelector;
    var origo = Origo('index.json');
    origo.on('load', function (viewer) {
      themeSelector = ThemeSelector({
        exclusive: true,
        themes: [
          {
            name: 'planning',
            title: { 'sv-SE': 'Planering', 'en-US': 'Planning' },
            icon: '#ic_map_24px',
            groups: ['planning'],
            exclude: ['buildings']
          },
          {
            name: 'nature',
            title: { 'sv-SE': 'Natur', 'en-US': 'Nature' },
            layers: ['nature'],
            background: 'orthophoto'
          },
          {
            name: 'buildings',
            title: { 'sv-SE': 'Byggnader', 'en-US': 'Buildings' },
            icon: '#ic_home_24px',
            layers: ['buildings'],
            combinable: true
          }
        ]
      });
      viewer.addComponent(themeSelector);
    });
  </script>
</body>
</html>
```

Use `js/origo.min.js` instead if that is the filename in your Origo distribution.

For a working sample, also copy `examples/` to `plugins/theme-selector/` and
open `plugins/theme-selector/examples/index.html` through your existing HTTP
server. The example uses local synthetic GeoJSON. Its `orthophoto` is an empty
placeholder; replace it with your own background layer for imagery.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `themes` | Required | Array of theme definitions. |
| `exclusive` | `true` | Activating a non-combinable theme replaces other non-combinable themes. |
| `target` | Origo navigation | Existing element ID, without `#`. Keep it inside the map. |
| `icon` | `#ic_layers_24px` | Main button icon and default theme icon. |

| Theme option | Meaning |
| --- | --- |
| `name` | Required unique name used by the API. |
| `title` | Plain string or locale-to-string object. Defaults to `name`. |
| `icon` | SVG symbol reference, such as `#ic_map_24px`. |
| `groups` | Origo group names, including their descendant groups. |
| `layers` | Explicit layer names or actual OpenLayers layer objects. |
| `exclude` | Names or objects excluded from group selection. An explicit `layers` entry takes precedence. |
| `background` | A name or object identifying exactly one layer in the `background` group. |
| `filters` | Layer-name-to-filter-string object, or `[{ layer, value }]`. |
| `center`, `zoom` | Two finite coordinates in the map projection, and a finite zoom level. Both are required. |
| `combinable` | Defaults to `false`. This theme can coexist with exclusive themes. |

Group selection works on layer objects, so two occurrences of a name in
different groups stay separate. Explicit names in `layers` select every
matching occurrence. Pass an actual object when you need one specific occurrence.
An excluded layer is left alone; exclusion does not force an already visible
layer off.

An OpenLayers GROUP layer can be selected as one layer. Selecting a child also
enables its parent containers and restores their previous visibility later.
Enabling a parent can expose other children whose own visibility is already on.

Icons use Origo's loaded SVG sprites. For a custom icon, add a uniquely named
`<symbol>` to your installation's `custom.svg` and reference its ID.

Invalid theme names are skipped. Invalid view settings, missing layers/groups,
ambiguous backgrounds and unsupported filters generate console warnings.
Layer references are checked when a theme is activated.

## State and filters

Only selected properties change. Shared layers stay enabled until their last
owner releases them. For conflicting backgrounds or filters, the most recently
activated theme wins; removing it reveals the previous owner's setting.
Filters are replaced, not combined with AND or OR.

The first owner saves the previous value. The last owner restores it unless
the user or other code has changed it in the meantime. Manual visibility changes
are retained. Turning off all selected layers automatically deactivates that
theme and releases its filters and background. This synchronization runs after
the current batch of visibility events.

Activating a new theme re-applies that theme's requested settings. Unrelated
theme changes leave manual overrides alone. Camera position is an activation
action and is not restored when a theme is deactivated.

Filtering requires a source with `setFilter()` and a readable filter through
`getFilter()` or `getOptions().filter`. The inspected Origo WFS source provides
`setFilter()`, `clearFilter()` and `getOptions()`. Filter syntax follows the
source's `filterType`, for example CQL or QGIS expressions. WMS, ordinary GeoJSON
and cluster wrappers do not gain filter support from this plugin.

```js
{
  name: 'open-parks',
  layers: ['parks'],
  filters: { parks: "status = 'open'" }
}
```

For duplicate names, filters prefer the occurrences selected by the theme.
If none are selected, the name matches all occurrences. Use
`filters: [{ layer: exactLayerObject, value: "status = 'open'" }]` for an exact
target. Ownership is tracked by source object because multiple layers can share
one source. External filter changes are detected before the next theme change
or cleanup; the source has no dedicated filter-change event.

## Localization

The plugin registers Swedish and English defaults under
`plugins.themeSelector` using `localization.addPluginToLocale()`, and reads
strings with `getStringByKeys()`. Existing plugin translations are preserved.

```js
var localization = viewer.getControlByName('localization');
localization.addPluginToLocale('en-US', {
  themeSelector: { buttonTitle: 'Map themes' }
});
themeSelector.refreshLocale();
```

Theme titles use the current locale ID. Missing translations fall back to
English, Swedish, then the theme name. Other locale IDs can be added to a title
object and to Origo's localization control.

The inspected Origo language menu reloads the page. It has no runtime
language-change event. If your application successfully changes the locale
programmatically, call `themeSelector.refreshLocale()` afterwards. Opening the
selector also refreshes its text.

## API

Call these methods after `viewer.addComponent(themeSelector)`:

```js
themeSelector.activate('planning');
themeSelector.deactivate('planning');
themeSelector.toggle('nature');
themeSelector.getActive(); // New array of names in activation order
themeSelector.deactivateAll();
themeSelector.refreshLocale();

viewer.removeComponent(themeSelector); // Restore state, detach listeners and remove UI
```

`activate`, `deactivate` and `toggle` return whether the active set changed.
Activating an already active theme is a no-op. Buttons and API calls use the
same exclusivity rules. A removed component can be added again.

Tab navigates between buttons; Enter or Space toggles them. Arrow Down on the
main button opens the selector and focuses its first item. Escape closes it
and returns focus. Clicking outside or moving focus outside also closes it.

## Limitations

Use one selector per viewer. Reordering existing layers is supported. Themes
resolve layers at activation time; adding/removing layers or replacing source
objects while themes are active is not tracked. Deactivate themes before these
changes, then activate them again. Active themes are not stored in permalinks.

## Testing

Open `examples/index.html` in your Origo installation as described above.
Use the example for these manual checks:

- Toggle Planning on and off. Its polygon should appear and disappear;
  Buildings should stay off because it is excluded.
- Activate Planning and Buildings, then Nature. Buildings should stay on,
  while Nature replaces Planning.
- Deactivate Nature. The background selection in the legend should return
  to Plain background. Both example backgrounds are empty placeholders.
- Activate Nature again, then hide its layer in the legend. The theme should
  deactivate and release its background. Buildings should remain on.
- Switch between Swedish and English in Origo's language menu. The theme
  buttons and selector title should use the selected language after the reload.
- Navigate with Tab and Shift+Tab, toggle themes with Enter or Space, and close
  the selector with Escape. Check that focus returns to the main button.
- Try a narrow and short map window and a touch device. All theme buttons
  should remain reachable, with scrolling when needed.

The example uses GeoJSON. If your configuration uses filters, also check
filter application and restoration with your own WFS layers, including two
themes sharing a source.

## License

BSD-2-Clause; see [LICENSE](LICENSE). Origo is a separate dependency with its own license.
The implementation uses its public APIs; no code from the reference plugins is
redistributed here.

