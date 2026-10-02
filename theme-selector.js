/* BSD-2-Clause License. See LICENSE. */
(function (global) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

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
    let baseline = null;
    let busy = false;
    let checkQueued = false;
    let layerListeners = [];

    let pendingIcons = [];
    let iconObserver = null;
    let iconTimer = null;

    function iconHref(icon) {
      return icon.startsWith('#') ? icon : (options.iconPrefix || '#') + icon;
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
        const missing = new Set(pendingIcons.map(item => item.href));
        pendingIcons.forEach(item => {
          console.warn('ThemeSelector: icon not found in any loaded sprite:', item.href);
          const fallback = missing.has(item.fallback) ? '#o_legend_24px' : item.fallback;
          item.use.setAttribute('href', fallback);
        });
        stopWaitingForIcons();
      }, options.iconTimeout || 10000);
    }

    function createButton(title, placement) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'o-tooltip';
      button.setAttribute('aria-label', title);
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.appendChild(document.createElementNS(SVG_NS, 'use'));
      const tooltip = document.createElement('span');
      tooltip.setAttribute('data-tooltip', title);
      tooltip.setAttribute('data-placement', placement);
      button.append(svg, tooltip);
      return button;
    }

    function setOpen(open) {
      panel.hidden = !open;
      mainButton.setAttribute('aria-expanded', String(open));
    }

    function onKeydown(event) {
      if (event.key !== 'Escape' || panel.hidden) return;
      const focusInside = root.contains(document.activeElement);
      setOpen(false);
      if (focusInside) mainButton.focus();
    }

    function onDocumentClick(event) {
      if (!panel.hidden && !root.contains(event.target)) setOpen(false);
    }

    function visibleBackground() {
      const layer = backgrounds.find(item => item.getVisible());
      return layer ? layer.get('name') : null;
    }

    function showBackground(name) {
      const target = backgrounds.find(layer => layer.get('name') === name);
      if (target) backgrounds.forEach(layer => layer.setVisible(layer === target));
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

    function moveView(config) {
      const center = config.center;
      if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) || !Number.isFinite(config.zoom)) return;
      viewer.getMap().getView().animate({ center, zoom: config.zoom, duration: 600 });
    }

    function toggleTheme(theme, automatic) {
      busy = true;
      const before = themes.map(item => item.active);
      const backgroundBefore = visibleBackground();

      if (theme.active) {
        setActive(theme, false);
      } else {
        if (options.exclusive !== false && !theme.config.combinable) {
          themes.forEach(other => {
            if (other.active && !other.config.combinable) setActive(other, false);
          });
        }
        setActive(theme, true);
        if (theme.config.background) showBackground(theme.config.background);
        moveView(theme.config);
      }

      if (!automatic) {
        const startedWithBackground = theme.active && theme.config.background;
        const endedWithBackground = themes.some((item, i) => before[i] && !item.active && item.config.background);
        if (startedWithBackground && !themes.some((item, i) => before[i] && item.config.background)) {
          baseline = backgroundBefore;
        }
        if (endedWithBackground && !startedWithBackground) {
          const remaining = themes.find(item => item.active && item.config.background);
          if (remaining) {
            showBackground(remaining.config.background);
          } else if (baseline) {
            showBackground(baseline);
            baseline = null;
          }
        }
      }
      busy = false;
    }

    function checkActiveThemes() {
      checkQueued = false;
      if (!root) return;
      themes.forEach(theme => {
        if (theme.active && theme.layers.length && !theme.layers.some(layer => layer.getVisible())) {
          toggleTheme(theme, true);
        }
      });
    }

    function onLayerVisibility() {
      if (busy || checkQueued) return;
      checkQueued = true;
      queueMicrotask(checkActiveThemes);
    }

    function selectLayers(config, layers, groups) {
      const groupNames = new Set(toArray(config.groups));
      if (options.includeSubgroups) {
        for (const name of groupNames) {
          groups.forEach(group => {
            if (group.parent === name) groupNames.add(group.name);
          });
        }
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
          themes.forEach(theme => {
            if (theme.active) setActive(theme, false);
          });
          stopWaitingForIcons();
          layerListeners.forEach(layer => layer.un('change:visible', onLayerVisibility));
          document.removeEventListener('keydown', onKeydown);
          document.removeEventListener('click', onDocumentClick);
          root.remove();
          root = null;
          viewer = null;
          themes = [];
          backgrounds = [];
          layerListeners = [];
          baseline = null;
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
        const mainIcon = options.icon ? iconHref(options.icon) : '#o_legend_24px';

        root = document.createElement('div');
        root.className = 'o-theme-selector';
        root.id = this.getId();
        mainButton = createButton(title, 'east');
        setIcon(mainButton, mainIcon, '#o_legend_24px');
        panel = document.createElement('div');
        panel.className = 'o-theme-selector-panel';
        panel.id = root.id + '-panel';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', title);
        mainButton.setAttribute('aria-controls', panel.id);
        mainButton.addEventListener('click', () => setOpen(panel.hidden));
        setOpen(false);
        root.append(mainButton, panel);

        configs.forEach(config => {
          const label = localized(config.title, locale, config.name);
          const button = createButton(label, 'south');
          setIcon(button, config.icon ? iconHref(config.icon) : mainIcon, mainIcon);
          const theme = { config, layers: selectLayers(config, layers, groups), button, active: false };
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => toggleTheme(theme, false));
          themes.push(theme);
          panel.appendChild(button);
        });

        new Set(themes.flatMap(theme => theme.layers)).forEach(layer => {
          layer.on('change:visible', onLayerVisibility);
          layerListeners.push(layer);
        });

        const before = options.before === false ? null : target.querySelector(options.before || '.o-zoom');
        if (before && before.parentElement === target) {
          target.insertBefore(root, before);
        } else {
          target.appendChild(root);
        }
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('click', onDocumentClick);
        waitForIcons();
      }
    });
  }

  global.ThemeSelector = ThemeSelector;
}(window));
