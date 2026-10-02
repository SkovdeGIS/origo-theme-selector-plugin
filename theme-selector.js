/* BSD-2-Clause License. See LICENSE. */
(function (global) {
  'use strict';

  const DEFAULT_TITLE = { 'sv-SE': 'Välj vy', 'en-US': 'Select view' };

  function warn(...args) {
    console.warn('ThemeSelector:', ...args);
  }

  // Accepts a single name or an array of names.
  function toNames(value, field, themeName) {
    if (value === undefined || value === null) return [];
    const list = Array.isArray(value) ? value : [value];
    const names = list.filter(item => typeof item === 'string');
    if (names.length !== list.length) warn(`theme "${themeName}": ${field} must contain names only`);
    return names;
  }

  function ThemeSelector(options = {}) {
    let viewer;
    let root;
    let panel;
    let mainButton;
    let locale;
    let themes = [];
    let backgrounds = [];
    let watchedLayers = [];
    // Backgrounds visible before the first theme background was applied.
    let baselineBackgrounds = null;
    let themeBackground = null;
    let updating = false;

    function localize(value, fallback) {
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object') {
        return value[locale] || value['sv-SE'] || value['en-US'] || fallback;
      }
      return fallback;
    }

    function iconExists(icon) {
      return typeof icon === 'string' && icon.charAt(0) === '#' && !!document.getElementById(icon.slice(1));
    }

    function createButton(title, icon, placement) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'padding-small icon-smaller light round box-shadow o-tooltip';
      button.setAttribute('aria-label', title);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'o-icon-24');
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', icon);
      svg.appendChild(use);
      button.appendChild(svg);

      // Origo's tooltip bubble, as on the other toolbar buttons.
      const tooltip = document.createElement('span');
      tooltip.setAttribute('data-tooltip', title);
      tooltip.setAttribute('data-placement', placement);
      button.appendChild(tooltip);
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
      const hadFocus = root.contains(document.activeElement);
      setOpen(false);
      if (hadFocus) mainButton.focus();
    }

    function onPointerdown(event) {
      if (!panel.hidden && !root.contains(event.target)) setOpen(false);
    }

    function updateMainButton() {
      mainButton.classList.toggle('active', themes.some(item => item.active));
    }

    function markActive(theme, active) {
      theme.active = active;
      theme.button.classList.toggle('active', active);
      theme.button.setAttribute('aria-pressed', String(active));
    }

    function setActive(theme, active) {
      updating = true;
      // No snapshots: keep layers used by another active theme visible.
      theme.layers.forEach(layer => {
        if (active || !themes.some(other => other !== theme && other.active && other.layers.includes(layer))) {
          layer.setVisible(active);
        }
      });
      updating = false;
      markActive(theme, active);
    }

    function showBackground(layer) {
      backgrounds.forEach(item => item.setVisible(item === layer));
    }

    // Restores the original background when no active theme sets one,
    // unless the background has been changed elsewhere in the meantime.
    function restoreBackground() {
      if (!baselineBackgrounds || themes.some(theme => theme.active && theme.background)) return;
      if (themeBackground && themeBackground.getVisible()) {
        backgrounds.forEach(layer => layer.setVisible(baselineBackgrounds.includes(layer)));
      }
      baselineBackgrounds = null;
      themeBackground = null;
    }

    // Switches a theme button off when its layers are all switched off elsewhere.
    function onLayerVisibility() {
      if (updating) return;
      themes.forEach(theme => {
        if (theme.active && theme.layers.length && !theme.layers.some(layer => layer.getVisible())) {
          markActive(theme, false);
        }
      });
      restoreBackground();
      updateMainButton();
    }

    function moveView(center, zoom) {
      const view = viewer.getMap().getView();
      const duration = options.animationDuration === undefined ? 500 : options.animationDuration;
      if (duration > 0) {
        view.animate({ center, zoom, duration });
      } else {
        view.setCenter(center);
        view.setZoom(zoom);
      }
    }

    function toggleTheme(theme) {
      if (theme.active) {
        setActive(theme, false);
        restoreBackground();
        updateMainButton();
        return;
      }

      if (options.exclusive !== false && !theme.combinable) {
        themes.forEach(other => {
          if (other.active && !other.combinable) setActive(other, false);
        });
      }
      setActive(theme, true);

      if (theme.background) {
        if (!baselineBackgrounds) baselineBackgrounds = backgrounds.filter(layer => layer.getVisible());
        showBackground(theme.background);
        themeBackground = theme.background;
      } else {
        restoreBackground();
      }
      updateMainButton();

      if (theme.center) moveView(theme.center, theme.zoom);
    }

    function createTheme(config, layers, groups, mainIcon, seenNames) {
      if (!config || typeof config !== 'object' || typeof config.name !== 'string' || !config.name) {
        warn('skipping theme without name', config);
        return null;
      }
      const name = config.name;
      if (seenNames.has(name)) warn(`duplicate theme name "${name}"`);
      seenNames.add(name);

      const layerNames = toNames(config.layers, 'layers', name);
      const excludeNames = toNames(config.exclude, 'exclude', name);
      const groupList = toNames(config.groups, 'groups', name);
      const knownLayers = new Set(layers.filter(layer => layer.get('group') !== 'background').map(layer => layer.get('name')));
      const knownGroups = new Set(groups.map(group => group.name));
      layerNames.concat(excludeNames).forEach(layerName => {
        if (!knownLayers.has(layerName)) warn(`theme "${name}": unknown layer "${layerName}"`);
      });
      groupList.forEach(groupName => {
        if (!knownGroups.has(groupName)) warn(`theme "${name}": unknown group "${groupName}"`);
      });

      // Origo exposes nested groups as a flat list with parent names.
      const groupNames = new Set(groupList);
      for (const groupName of groupNames) {
        groups.forEach(group => {
          if (group.parent === groupName) groupNames.add(group.name);
        });
      }

      const selectedLayers = layers.filter(layer => {
        const layerName = layer.get('name');
        if (layer.get('group') === 'background') return false;
        return layerNames.includes(layerName)
          || (groupNames.has(layer.get('group')) && !excludeNames.includes(layerName));
      });

      let background = null;
      if (config.background !== undefined) {
        background = backgrounds.find(layer => layer.get('name') === config.background) || null;
        if (!background) warn(`theme "${name}": unknown background "${config.background}"`);
      }

      let center = null;
      let zoom = null;
      if (config.center !== undefined || config.zoom !== undefined) {
        const validCenter = Array.isArray(config.center) && config.center.length === 2
          && config.center.every(Number.isFinite);
        if (validCenter && Number.isFinite(config.zoom)) {
          center = config.center;
          zoom = config.zoom;
        } else {
          warn(`theme "${name}": center must be [x, y] and zoom a number; the map will not move`);
        }
      }

      let icon = config.icon || mainIcon;
      if (config.icon && !iconExists(config.icon)) {
        warn(`theme "${name}": icon "${config.icon}" not found in loaded sprites`);
        icon = mainIcon;
      }

      const label = localize(config.title, name);
      const button = createButton(label, icon, 'south');
      const theme = {
        name,
        layers: selectedLayers,
        background,
        center,
        zoom,
        combinable: config.combinable === true,
        button,
        active: false
      };
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => toggleTheme(theme));
      return theme;
    }

    return global.Origo.ui.Component({
      name: 'themeSelector',
      onInit() {
        // Use Origo's existing component lifecycle for removal.
        this.on('clear', () => {
          if (!root) return;
          themes.forEach(theme => {
            if (theme.active) setActive(theme, false);
          });
          restoreBackground();
          watchedLayers.forEach(layer => layer.un('change:visible', onLayerVisibility));
          viewer.getMap().un('change:size', positionPanel);
          document.removeEventListener('keydown', onKeydown);
          document.removeEventListener('pointerdown', onPointerdown, true);
          root.remove();
          root = null;
          viewer = null;
          themes = [];
          backgrounds = [];
          watchedLayers = [];
        });
      },
      onAdd(event) {
        viewer = event.target;
        const targetId = options.target || viewer.getMain().getNavigation().getId();
        const target = document.getElementById(targetId);
        if (!target) {
          warn('target not found:', targetId);
          return;
        }
        const layers = viewer.getLayers();
        const groups = viewer.getGroups();
        backgrounds = layers.filter(layer => layer.get('group') === 'background');

        const localization = viewer.getControlByName('localization');
        locale = localization ? localization.getCurrentLocaleId() : 'sv-SE';
        const title = localize(options.title, localize(DEFAULT_TITLE));

        const mainIcon = options.icon || '#ic_map_24px';
        if (!iconExists(mainIcon)) warn(`icon "${mainIcon}" not found in loaded sprites`);

        root = document.createElement('div');
        root.className = 'o-theme-selector o-toolbar';
        root.id = this.getId();
        mainButton = createButton(title, mainIcon, 'east');
        panel = document.createElement('div');
        panel.className = 'o-theme-selector-panel';
        panel.id = root.id + '-panel';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', title);
        mainButton.setAttribute('aria-controls', panel.id);
        mainButton.addEventListener('click', () => setOpen(panel.hidden));
        root.appendChild(mainButton);
        root.appendChild(panel);

        let configs = options.themes || [];
        if (!Array.isArray(configs)) {
          warn('themes must be an array');
          configs = [];
        }
        const seenNames = new Set();
        configs.forEach(config => {
          const theme = createTheme(config, layers, groups, mainIcon, seenNames);
          if (!theme) return;
          themes.push(theme);
          panel.appendChild(theme.button);
        });

        watchedLayers = [...new Set(themes.flatMap(theme => theme.layers))];
        watchedLayers.forEach(layer => layer.on('change:visible', onLayerVisibility));
        // OpenLayers updates the map size on window and container resizes.
        viewer.getMap().on('change:size', positionPanel);

        if (options.placement === 'first') {
          target.insertBefore(root, target.firstChild);
        } else {
          target.appendChild(root);
        }
        setOpen(false);
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('pointerdown', onPointerdown, true);
      }
    });
  }

  global.ThemeSelector = ThemeSelector;
}(window));
