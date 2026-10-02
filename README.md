# Origo Theme Selector

[![License](https://img.shields.io/github/license/SkovdeGIS/origo-theme-selector-plugin?style=flat-square)](LICENSE)
[![No build step](https://img.shields.io/badge/build-no%20build%20step-brightgreen?style=flat-square)](#installation)

## What does it do?

Adds a toolbar button with map themes to Origo. Click a theme to enable its
layers, select a background and optionally move the map. Click again to switch
its layers off and restore the background. Written in vanilla JavaScript, with
no build step.

![Three themes selected in sequence, the last one combined with the others](examples/theme-selector-toggle.gif)

The recording comes from another map, with the themes Origokommuner, Mask and
the combinable Båda. The example below uses Planering, Natur and Byggnader.

## Installation

Copy `theme-selector.js` and `theme-selector.css` to `plugins/theme-selector/`
in your Origo installation. Load them after Origo's own CSS and JavaScript:

```html
<link rel="stylesheet" href="plugins/theme-selector/theme-selector.css">
<script src="plugins/theme-selector/theme-selector.js"></script>
```

## Example

Add this inside your existing map's `load` handler in `index.html`:

```js
origo.on('load', function (viewer) {
  viewer.addComponent(ThemeSelector({
    exclusive: true,
    themes: [
      {
        name: 'planning',
        title: { 'sv-SE': 'Planering', 'en-US': 'Planning' },
        icon: '#ic_place_24px',
        groups: ['planning'],
        layers: ['some_layer'],
        exclude: ['buildings'],
        background: 'orthophoto',
        center: [435000, 6485000],
        zoom: 12
      },
      {
        name: 'buildings',
        title: 'Byggnader',
        layers: ['buildings'],
        combinable: true
      }
    ]
  }));
});
```

Use your own group and layer names, and coordinates in the map's projection.
A complete example is in [examples/index.html](examples/index.html). Serve it
from `plugins/theme-selector/examples/` in an Origo installation. Its orthophoto
is an empty placeholder; replace it with your own imagery layer.

## Configuration

| Option | Meaning |
| --- | --- |
| `themes` | Array of themes, as above. |
| `exclusive` | Defaults to `true`: activating a normal theme deactivates other normal themes. Set `false` to allow all themes together. |
| `title` | Main button title. A string or Swedish/English object; defaults to `Välj vy` / `Select view`. |
| `icon` | Main button and fallback theme icon. Defaults to `#ic_map_24px` from Origo's `material-icons.svg`. |
| `target` | Optional container ID; defaults to Origo's navigation toolbar. |
| `placement` | `'first'` puts the button first in the target, for example above the zoom buttons. Defaults to last. |
| `animationDuration` | Map movement in milliseconds. Defaults to `500`; `0` jumps directly. |

| Theme option | Meaning |
| --- | --- |
| `name`, `title` | Name and button title. Title can be a string or Swedish/English object; defaults to the name. |
| `icon` | SVG symbol ID, including `#`. |
| `groups` | Enable layers in these Origo groups, including nested groups. A name or an array. |
| `layers` | Explicit layer names to enable. A name or an array. |
| `exclude` | Exclude layer names from group selection. Explicit `layers` entries take precedence. |
| `background` | Switch to this layer in the `background` group. |
| `center`, `zoom` | Supply both, `[x, y]` and a number, to move the map when activated. |
| `combinable` | Defaults to `false`. Set `true` to keep this theme active alongside a normal theme. |

Icons must exist as symbols in a sprite that Origo loads, either Origo's own
or one of your own listed in `svgSprites` in the map configuration, for example
`css/svg/custom.svg`. An unknown icon ID would give an empty button, so the
selector warns in the console and uses the main icon instead.

The configuration is checked when the selector is added. Themes without `name`
are skipped. Unknown layers, groups, backgrounds and icons, duplicate theme
names and invalid `center`/`zoom` give a console warning.

The panel closes with Escape or a click outside it. Escape moves focus back to
the main button only when focus was inside the selector. The panel opens to the
left when it does not fit to the right inside the map. Active themes are marked
visually, and a theme button is switched off when all its layers are switched
off elsewhere. Buttons use Origo's tooltips.

Titles use Origo's language when the selector is added. Other languages, and
maps without the localization control, fall back to Swedish, then English,
then the theme name.

## Limitations

- Deactivation switches selected layers off unless another active theme uses them. Previous visibility is not restored, including when the component is removed.
- The background is restored when the last theme with a background is deactivated, unless it has been changed elsewhere. Map position is not restored. Unrelated and excluded layers are left alone.
- Switching layers on elsewhere does not activate a theme button. Layers and groups added later are not tracked.
- OpenLayers `GROUP` layers are treated as a whole; their children cannot be selected or excluded individually.
- No filters, permalink handling or public activation API. Use one selector per map.
- The panel position is checked when it opens and when the map is resized. Narrow embedded maps may need CSS adjustments.
- Verified in a browser against Origo `2.11.0-dev`.
