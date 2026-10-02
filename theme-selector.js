/* BSD-2-Clause License. See LICENSE. */
(function (global) {
  'use strict';

  function ThemeSelector(options = {}) {
    let viewer;
    let root;
    let panel;
    let mainButton;
    let themes = [];
    let backgrounds = [];

    function createButton(title, icon) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'padding-small icon-smaller light round box-shadow';
      button.title = title;
      button.setAttribute('aria-label', title);

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'o-icon-24');
      svg.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', icon || options.icon || '#o_legend_24px');
      svg.appendChild(use);
      button.appendChild(svg);
      return button;
    }

    function setOpen(open) {
      panel.hidden = !open;
      mainButton.setAttribute('aria-expanded', String(open));
    }

    function onKeydown(event) {
      if (event.key === 'Escape' && !panel.hidden) {
        setOpen(false);
        mainButton.focus();
      }
    }

    function setActive(theme, active) {
      // No snapshots: deactivation simply switches these layers off.
      theme.layers.forEach(layer => layer.setVisible(active));
      theme.active = active;
      theme.button.classList.toggle('active', active);
      theme.button.setAttribute('aria-pressed', String(active));
      mainButton.classList.toggle('active', themes.some(item => item.active));
    }

    function toggleTheme(theme) {
      if (theme.active) {
        setActive(theme, false);
        return;
      }

      if (options.exclusive !== false && !theme.config.combinable) {
        themes.forEach(other => {
          if (other.active && !other.config.combinable) setActive(other, false);
        });
      }
      setActive(theme, true);

      const background = backgrounds.find(layer => layer.get('name') === theme.config.background);
      if (background) {
        backgrounds.forEach(layer => layer.setVisible(layer === background));
      }

      if (theme.config.center && theme.config.zoom !== undefined) {
        const view = viewer.getMap().getView();
        view.setCenter(theme.config.center);
        view.setZoom(theme.config.zoom);
      }
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
          document.removeEventListener('keydown', onKeydown);
          root.remove();
          root = null;
          viewer = null;
          themes = [];
          backgrounds = [];
        });
      },
      onAdd(event) {
        viewer = event.target;
        const targetId = options.target || viewer.getMain().getNavigation().getId();
        const target = document.getElementById(targetId);
        const layers = viewer.getLayers();
        const groups = viewer.getGroups();
        backgrounds = layers.filter(layer => layer.get('group') === 'background');

        const localization = viewer.getControlByName('localization');
        const locale = localization ? localization.getCurrentLocaleId() : 'sv-SE';
        const title = locale === 'en-US' ? 'Select view' : 'Välj vy';

        root = document.createElement('div');
        root.className = 'o-theme-selector o-toolbar';
        root.id = this.getId();
        mainButton = createButton(title, options.icon);
        panel = document.createElement('div');
        panel.className = 'o-theme-selector-panel';
        panel.id = root.id + '-panel';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', title);
        mainButton.setAttribute('aria-controls', panel.id);
        mainButton.addEventListener('click', () => setOpen(panel.hidden));
        setOpen(false);
        root.appendChild(mainButton);
        root.appendChild(panel);

        (options.themes || []).forEach(config => {
          // Origo exposes nested groups as a flat list with parent names.
          const groupNames = new Set(config.groups || []);
          for (const name of groupNames) {
            groups.forEach(group => {
              if (group.parent === name) groupNames.add(group.name);
            });
          }

          const selectedLayers = layers.filter(layer => {
            const name = layer.get('name');
            if (layer.get('group') === 'background') return false;
            return (config.layers || []).includes(name)
              || (groupNames.has(layer.get('group')) && !(config.exclude || []).includes(name));
          });
          const label = typeof config.title === 'string' ? config.title
            : (config.title || {})[locale] || (config.title || {})['en-US']
              || (config.title || {})['sv-SE'] || config.name;
          const button = createButton(label, config.icon);
          const theme = { config, layers: selectedLayers, button, active: false };
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => toggleTheme(theme));
          themes.push(theme);
          panel.appendChild(button);
        });

        target.appendChild(root);
        document.addEventListener('keydown', onKeydown);
      }
    });
  }

  global.ThemeSelector = ThemeSelector;
}(window));
