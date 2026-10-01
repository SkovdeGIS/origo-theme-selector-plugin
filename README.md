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

| Option | Required | Default | Meaning |
| --- | --- | --- | --- |
| `themes` | Yes | None | Array of theme definitions. |
| `exclusive` | No | `true` | Activating a non-combinable theme replaces other non-combinable themes. |
| `target` | No | Origo navigation | Existing element ID, without `#`. Keep it inside the map. |
| `icon` | No | `#ic_layers_24px` | Main button icon and default theme icon. |
| `localization` | No | Origo localization control | Localization control used for button labels and theme titles. |

| Theme option | Required | Default | Meaning |
| --- | --- | --- | --- |
| `name` | Yes | None | Unique non-empty name used by the API. |
| `title` | No | `name` | Plain string or locale-to-string object. |
| `icon` | No | Top-level `icon` | SVG symbol reference, such as `#ic_map_24px`. |
| `groups` | No | `[]` | Origo group names, including their descendant groups. |
| `layers` | No | `[]` | Explicit layer names or actual OpenLayers layer objects. |
| `exclude` | No | `[]` | Names or objects excluded from group selection. An explicit `layers` entry takes precedence. |
| `background` | No | Unchanged | A name or object identifying exactly one layer in the `background` group. |
| `filters` | No | Unchanged | Layer-name-to-filter-string object, or `[{ layer, value }]`. |
| `center`, `zoom` | Together, if used | Unchanged | Two finite coordinates in the map projection, and a finite zoom level. |
| `combinable` | No | `false` | This theme can coexist with exclusive themes. |

Groups include descendant groups. `exclude` applies to group selection, while
explicit `layers` entries take precedence. Names matching multiple layers select
all matches; pass a layer object to target one specific instance.

### Icons

Icons reference SVG symbols loaded by Origo, for example `#ic_layers_24px`,
`#ic_map_24px` or `#ic_home_24px`. Custom symbols must be added to a loaded
sprite first.

## Examples

Select a whole group, including its child groups:

```js
{ name: 'planning', groups: ['planning'] }
```

Select a group but leave one layer out. Explicit `layers` entries take
precedence over `exclude`:

```js
{
  name: 'environment',
  groups: ['environment'],
  exclude: ['protected_areas']
}
```

Select a background and open the map at a useful position. Coordinates use the
map's projection:

```js
{
  name: 'aerial',
  background: 'orthophoto',
  center: [435000, 6485000],
  zoom: 12
}
```

Filter a supported source, such as an Origo WFS layer. The expression follows
that source's filter type (for example CQL or QGIS); the plugin does not add
filter support to WMS or ordinary GeoJSON sources:

```js
{
  name: 'open-water',
  layers: ['water_areas'],
  filters: { water_areas: "status = 'open'" }
}
```

Keep a theme active alongside exclusive themes:

```js
{ name: 'emergency-sites', layers: ['shelters'], combinable: true }
```

## Localization

Swedish and English button labels are registered with Origo's localization
control. Theme titles can be strings or locale maps; missing titles fall back
to English, Swedish, then the theme name.

```js
var localization = viewer.getControlByName('localization');
localization.addPluginToLocale('en-US', { themeSelector: { buttonTitle: 'Map themes' } });
themeSelector.refreshLocale();
```

Add other locales to the title objects and Origo localization control. Origo's
language menu reloads the page; after changing locale programmatically, call
`refreshLocale()`.

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

The activation methods return whether the active set changed. `getActive()`
returns names in activation order. A removed component can be added again.

## Known limitations

- Use one selector per viewer.
- Themes resolve layers at activation time. Reordering existing layers is
  supported; adding/removing layers or replacing source objects while themes
  are active is not tracked. Deactivate themes before these changes, then
  activate them again.
- Active theme names are not saved in permalinks or restored after a reload.
- Filters require a source with `setFilter()` and `getFilter()` or
  `getOptions().filter`. WMS and ordinary GeoJSON sources are not filterable
  through this plugin.

## License

BSD-2-Clause; see [LICENSE](LICENSE). Origo is a separate dependency with its own license.
The implementation uses its public APIs; no code from the reference plugins is
redistributed here.

