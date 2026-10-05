/* BSD-2-Clause License. See LICENSE. */
(function (global) {
  'use strict';

  if (!global.Origo) {
    console.error('ThemeSelector: Origo must be loaded before theme-selector.js');
    return;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  // In material-icons.svg, one of the sprites Origo loads by default.
  const DEFAULT_ICON = '#ic_map_24px';

  function toArray(value) {
    if (Array.isArray(value)) return value;
    return value === undefined || value === null ? [] : [value];
  }

  function localized(value, locale, fallback) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
      return value[locale] || value['sv-SE'] || value['en-US'] || fallback;
    }
    return fallback;
  }

  function ThemeSelector(options = {}) {
    let viewer;
    let root;
    let panel;
    let mainButton;
    let themes = [];
    let backgrounds = [];
    // Background visible before the first theme background was applied:
    // undefined when none is applied, null when no background was visible.
    let baseline;
    let appliedBackground = null;
    let busy = false;
    let checkQueued = false;
    let layerListeners = [];

    let pendingIcons = [];
    let iconObserver = null;
    let iconTimer = null;

    function iconHref(icon) {
      return icon.charAt(0) === '#' ? icon : (options.iconPrefix || '#') + icon;
    }

    function setIcon(button, href, fallback) {
      const use = button.querySelector('use');
      use.setAttribute('href', href);
      if (!document.getElementById(href.slice(1))) pendingIcons.push({ use, href, fallback });
    }

    function stopWaitingForIcons() {
      if (iconObserver) iconObserver.disconnect();
      clearTimeout(iconTimer);
      iconObserver = null;
      iconTimer = null;
      pendingIcons = [];
    }

    function waitForIcons() {
      const resolve = () => {
        pendingIcons = pendingIcons.filter(item => !document.getElementById(item.href.slice(1)));
        if (!pendingIcons.length) stopWaitingForIcons();
      };
      resolve();
      if (!pendingIcons.length) return;
      iconObserver = new MutationObserver(resolve);
      iconObserver.observe(document.body, { childList: true });
      iconTimer = setTimeout(() => {
        // A sprite may have arrived since the last mutation was handled.
        resolve();
        if (!pendingIcons.length) return;
        const missing = new Set(pendingIcons.map(item => item.href));
        pendingIcons.forEach(item => {
          console.warn('ThemeSelector: icon not found in any loaded sprite:', item.href);
          const fallback = missing.has(item.fallback) ? DEFAULT_ICON : item.fallback;
          item.use.setAttribute('href', fallback);
        });
        stopWaitingForIcons();
      }, options.iconTimeout || 10000);
    }

    // Without a placement the title is shown as text next to the icon
    // instead of in a tooltip, which touch screens never display.
    function createButton(title, placement) {
      const button = document.createElement('button');
      button.type = 'button';
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.appendChild(document.createElementNS(SVG_NS, 'use'));
      button.appendChild(svg);
      if (placement) {
        button.className = 'o-tooltip';
        button.setAttribute('aria-label', title);
        const tooltip = document.createElement('span');
        tooltip.setAttribute('data-tooltip', title);
        tooltip.setAttribute('data-placement', placement);
        button.appendChild(tooltip);
      } else {
        const text = document.createElement('span');
        text.className = 'o-theme-selector-label';
        text.textContent = title;
        button.appendChild(text);
      }
      return button;
    }

    // Opens to the left when the panel does not fit inside the map.
    function positionPanel() {
      if (!panel || panel.hidden) return;
      panel.classList.remove('o-theme-selector-panel-left');
      const mapElement = viewer.getMap().getTargetElement();
      const right = mapElement ? mapElement.getBoundingClientRect().right : window.innerWidth;
      if (panel.getBoundingClientRect().right > right) {
        panel.classList.add('o-theme-selector-panel-left');
      }
    }

    function setOpen(open) {
      panel.hidden = !open;
      mainButton.setAttribute('aria-expanded', String(open));
      positionPanel();
    }

    function onKeydown(event) {
      if (event.key !== 'Escape' || panel.hidden) return;
      const focusInside = root.contains(document.activeElement);
      setOpen(false);
      if (focusInside) mainButton.focus();
    }

    // pointerdown, because iOS Safari sends no click to the document when
    // tapping the map canvas. Listened to in the capture phase so the map
    // cannot stop it.
    function onDocumentPointerDown(event) {
      if (!panel.hidden && !root.contains(event.target)) setOpen(false);
    }

    function showBackground(target) {
      backgrounds.forEach(layer => layer.setVisible(layer === target));
    }

    // Shows the background of the newest theme that has one. When no active
    // theme has a background, the original one comes back, unless the
    // background has been changed elsewhere in the meantime.
    function updateBackground(activated) {
      const withBackground = themes.filter(theme => theme.active && theme.background);
      if (!withBackground.length) {
        if (baseline !== undefined && appliedBackground && appliedBackground.getVisible()) showBackground(baseline);
        baseline = undefined;
        appliedBackground = null;
        return;
      }
      let layer = activated && activated.background;
      if (!layer) {
        if (withBackground.some(theme => theme.background === appliedBackground)) return;
        layer = withBackground[withBackground.length - 1].background;
      }
      if (baseline === undefined) baseline = backgrounds.find(item => item.getVisible()) || null;
      showBackground(layer);
      appliedBackground = layer;
    }

    function setActive(theme, active) {
      theme.layers.forEach(layer => {
        if (active || !themes.some(other => other !== theme && other.active && other.layers.includes(layer))) {
          layer.setVisible(active);
        }
      });
      theme.active = active;
      theme.button.classList.toggle('active', active);
      theme.button.setAttribute('aria-pressed', String(active));
      mainButton.classList.toggle('active', themes.some(item => item.active));
    }

    function hasView(config) {
      const center = config.center;
      return Array.isArray(center) && center.length === 2 && center.every(Number.isFinite) && Number.isFinite(config.zoom);
    }

    function toggleTheme(theme) {
      busy = true;
      if (theme.active) {
        setActive(theme, false);
        updateBackground(null);
      } else {
        // Activating first keeps layers shared with the replaced theme on,
        // instead of switching them off and on again.
        setActive(theme, true);
        if (options.exclusive !== false && !theme.config.combinable) {
          themes.forEach(other => {
            if (other !== theme && other.active && !other.config.combinable) setActive(other, false);
          });
        }
        updateBackground(theme);
        if (hasView(theme.config)) {
          viewer.getMap().getView().animate({ center: theme.config.center, zoom: theme.config.zoom, duration: 600 });
        }
      }
      busy = false;
    }

    function checkActiveThemes() {
      checkQueued = false;
      if (!root) return;
      themes.forEach(theme => {
        if (theme.active && theme.layers.length && !theme.layers.some(layer => layer.getVisible())) {
          toggleTheme(theme);
        }
      });
    }

    function onLayerVisibility() {
      if (busy || checkQueued) return;
      checkQueued = true;
      queueMicrotask(checkActiveThemes);
    }

    // Warns about names and values that do not match the map.
    function validate(config, layers, groups) {
      const warn = message => console.warn(`ThemeSelector: theme "${config.name}": ${message}`);
      const layerNames = new Set(layers.map(layer => layer.get('name')));
      const groupNames = new Set(groups.map(group => group.name));
      const isBackground = name => backgrounds.some(layer => layer.get('name') === name);
      toArray(config.layers).concat(toArray(config.exclude)).forEach(name => {
        if (!layerNames.has(name)) warn(`unknown layer ${name}`);
        else if (isBackground(name)) warn(`${name} is a background layer; use background`);
      });
      toArray(config.groups).forEach(name => {
        if (!groupNames.has(name)) warn(`unknown group ${name}`);
      });
      if (config.background !== undefined && !isBackground(config.background)) {
        warn(`unknown background ${config.background}`);
      }
      if ((config.center !== undefined || config.zoom !== undefined) && !hasView(config)) {
        warn('center must be [x, y] and zoom a number; the map will not move');
      }
      if (config.icon !== undefined && typeof config.icon !== 'string') warn('icon must be a string');
    }

    function selectLayers(config, layers, groups) {
      const groupNames = new Set(toArray(config.groups));
      if (options.includeSubgroups) {
        // Set.forEach also visits names added during the iteration.
        groupNames.forEach(name => {
          groups.forEach(group => {
            if (group.parent === name) groupNames.add(group.name);
          });
        });
      }
      const names = toArray(config.layers);
      const exclude = toArray(config.exclude);
      return layers.filter(layer => {
        const name = layer.get('name');
        if (layer.get('group') === 'background') return false;
        return names.includes(name) || (groupNames.has(layer.get('group')) && !exclude.includes(name));
      });
    }

    return global.Origo.ui.Component({
      name: 'themeSelector',
      onInit() {
        this.on('clear', () => {
          if (!root) return;
          busy = true;
          themes.forEach(theme => {
            if (theme.active) setActive(theme, false);
          });
          updateBackground(null);
          busy = false;
          stopWaitingForIcons();
          layerListeners.forEach(layer => layer.un('change:visible', onLayerVisibility));
          viewer.getMap().un('change:size', positionPanel);
          document.removeEventListener('keydown', onKeydown);
          document.removeEventListener('pointerdown', onDocumentPointerDown, true);
          root.remove();
          root = null;
          viewer = null;
          themes = [];
          backgrounds = [];
          layerListeners = [];
        });
      },
      onAdd(event) {
        viewer = event.target;
        const configs = toArray(options.themes).filter((config, i, all) => {
          if (!config || !config.name) {
            console.warn('ThemeSelector: theme without name ignored:', config);
            return false;
          }
          if (all.findIndex(other => other && other.name === config.name) !== i) {
            console.warn('ThemeSelector: duplicate theme name ignored:', config.name);
            return false;
          }
          return true;
        });
        if (!configs.length) return;

        const targetId = options.target || viewer.getMain().getNavigation().getId();
        const target = document.getElementById(targetId);
        if (!target) {
          console.warn('ThemeSelector: target not found:', targetId);
          return;
        }

        const layers = viewer.getLayers();
        const groups = viewer.getGroups();
        backgrounds = layers.filter(layer => layer.get('group') === 'background');

        const localization = viewer.getControlByName('localization');
        const locale = localization ? localization.getCurrentLocaleId() : 'sv-SE';
        const title = localized(options.title, locale, locale === 'en-US' ? 'Select view' : 'Välj vy');
        const mainIcon = typeof options.icon === 'string' ? iconHref(options.icon) : DEFAULT_ICON;

        root = document.createElement('div');
        root.className = options.labels ? 'o-theme-selector o-theme-selector-labels' : 'o-theme-selector';
        root.id = this.getId();
        mainButton = createButton(title, options.labels ? null : 'east');
        setIcon(mainButton, mainIcon, DEFAULT_ICON);
        panel = document.createElement('div');
        panel.className = 'o-theme-selector-panel';
        panel.id = `${root.id}-panel`;
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', title);
        mainButton.setAttribute('aria-controls', panel.id);
        mainButton.addEventListener('click', () => setOpen(panel.hidden));
        setOpen(false);
        root.append(mainButton, panel);

        configs.forEach(config => {
          const label = localized(config.title, locale, config.name);
          const button = createButton(label, options.labels ? null : 'south');
          validate(config, layers, groups);
          setIcon(button, typeof config.icon === 'string' ? iconHref(config.icon) : mainIcon, mainIcon);
          const theme = {
            config,
            layers: selectLayers(config, layers, groups),
            background: backgrounds.find(layer => layer.get('name') === config.background) || null,
            button,
            active: false
          };
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => toggleTheme(theme));
          themes.push(theme);
          panel.appendChild(button);
        });

        new Set(themes.flatMap(theme => theme.layers)).forEach(layer => {
          layer.on('change:visible', onLayerVisibility);
          layerListeners.push(layer);
        });

        let before = null;
        if (options.before !== false) {
          try {
            before = target.querySelector(options.before || '.o-zoom');
          } catch (error) {
            console.warn('ThemeSelector: invalid before selector:', options.before);
          }
        }
        if (before && before.parentElement === target) {
          target.insertBefore(root, before);
        } else {
          target.appendChild(root);
        }
        // OpenLayers updates the map size on window and container resizes.
        viewer.getMap().on('change:size', positionPanel);
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('pointerdown', onDocumentPointerDown, true);
        waitForIcons();
      }
    });
  }

  global.ThemeSelector = ThemeSelector;
}(window));
