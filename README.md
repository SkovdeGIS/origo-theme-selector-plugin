# Origo Theme Selector

[![License](https://img.shields.io/github/license/SkovdeGIS/origo-theme-selector-plugin?style=flat-square)](LICENSE)
[![No build step](https://img.shields.io/badge/build-no%20build%20step-brightgreen?style=flat-square)](#installation)

## What does it do?

Adds a toolbar button with map themes to Origo. Click a theme to enable its
layers, select a background and optionally move the map. Click again to switch
its layers off. Written in vanilla JavaScript, with no build step.

![Origokommuner, Mask, and the combined Båda preset selected in sequence](examples/theme-selector-toggle.gif)

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
| `icon` | Main button and fallback theme icon. Defaults to `#o_legend_24px`. |
| `target` | Optional container ID; defaults to Origo's navigation toolbar. |

| Theme option | Meaning |
| --- | --- |
| `name`, `title` | Name and button title. Title can be a string or Swedish/English object; defaults to the name. |
| `icon` | SVG symbol ID from your Origo map, including `#`. |
| `groups` | Enable layers in these Origo groups, including nested groups. |
| `layers` | Explicit layer names to enable. |
| `exclude` | Exclude layer names from group selection. Explicit `layers` entries take precedence. |
| `background` | Switch to this layer in the `background` group. |
| `center`, `zoom` | Supply both to move the map when activated. |
| `combinable` | Defaults to `false`. Set `true` to keep this theme active alongside a normal theme. |

The panel closes with Escape. Active themes are marked visually. Titles use
Origo's language when the selector is added, or Swedish without localization.

## Limitations

- Deactivation switches selected layers off, including layers already visible before activation. Shared layers can be switched off while another theme remains active.
- Background and map position are not restored. Unrelated and excluded layers are left alone.
- Manual changes elsewhere do not update active buttons. Layers and groups added later are not tracked.
- OpenLayers `GROUP` layers are treated as a whole; their children cannot be selected or excluded individually.
- No filters, permalink handling or public activation API. Use one selector per map and valid configuration; unknown names are ignored.
- The panel opens to the right. Custom toolbar placement or narrow embedded maps may need CSS adjustments.
- Based on Origo `2.11.0-dev`; the simplified version has not yet been verified in a browser.
