/* BSD-2-Clause License. See LICENSE. */
(function themeSelectorPlugin(global) {
  'use strict';

  const instances = new WeakMap();
  const strings = {
    'sv-SE': { buttonTitle: 'Välj vy' },
    'en-US': { buttonTitle: 'Select view' }
  };
  const warn = message => console.warn('ThemeSelector: ' + message);
  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const isLayer = value => value && typeof value.getVisible === 'function'
    && typeof value.setVisible === 'function';
  const same = (a, b) => Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((value, i) => value === b[i]) : a === b;

  function ThemeSelector(options = {}) {
    if (!isObject(options)) {
      warn('Options must be an object.');
      options = {};
    }
    const ui = global.Origo.ui;
    const themes = new Map();
    const active = new Map();
    const records = new Map();
    const buttons = new Map();
    const disposers = [];
    const backgroundKey = {};
    let viewer;
    let localization;
    let root;
    let panel;
    let mainButton;
    let mainElement;
    let writing = false;
    let pendingSync = false;
    let generation = 0;

    function list(value, field) {
      if (value === undefined) return [];
      if (!Array.isArray(value)) {
        warn(field + ' must be an array.');
        return [];
      }
      return value.filter(item => {
        const valid = typeof item === 'string' && item.length > 0
          || field !== 'groups' && isLayer(item);
        if (!valid) warn('Invalid entry in ' + field + '.');
        return valid;
      });
    }

    if (!Array.isArray(options.themes)) warn('themes must be an array.');
    (Array.isArray(options.themes) ? options.themes : []).forEach(theme => {
      if (!isObject(theme) || typeof theme.name !== 'string' || !theme.name.trim()) {
        warn('Skipping a theme without a non-empty name.');
        return;
      }
      if (themes.has(theme.name)) {
        warn('Skipping duplicate theme name "' + theme.name + '".');
        return;
      }
      const normalized = Object.assign({}, theme, {
        groups: list(theme.groups, 'groups'),
        layers: list(theme.layers, 'layers'),
        exclude: list(theme.exclude, 'exclude')
      });
      if (theme.center !== undefined || theme.zoom !== undefined) {
        if (!Array.isArray(theme.center) || theme.center.length !== 2
          || !theme.center.every(Number.isFinite) || !Number.isFinite(theme.zoom)) {
          warn('Theme "' + theme.name + '": center needs two numbers and zoom a number; ignoring view.');
          delete normalized.center;
          delete normalized.zoom;
        }
      }
      if (theme.filters !== undefined && !isObject(theme.filters) && !Array.isArray(theme.filters)) {
        warn('Theme "' + theme.name + '": filters must be an object or array.');
        normalized.filters = {};
      }
      themes.set(theme.name, normalized);
    });

    function catalog() {
      const entries = [];
      const seen = new Set();
      function visit(layer, parents, background) {
        if (!isLayer(layer) || seen.has(layer)) return;
        seen.add(layer);
        const isBackground = background || layer.get('group') === 'background';
        entries.push({ layer, parents, background: isBackground });
        if (typeof layer.getLayers === 'function') {
          layer.getLayers().getArray().forEach(child => visit(child, parents.concat(layer), isBackground));
        }
      }
      viewer.getLayers().forEach(layer => visit(layer, [], false));
      return entries;
    }

    function matches(layer, reference) {
      return isLayer(reference) ? layer === reference : layer.get('name') === reference;
    }

    function resolve(theme) {
      const entries = catalog();
      const claims = new Map();
      const selected = new Set();
      const groups = new Set(theme.groups);
      const definitions = viewer.getGroups();
      theme.groups.forEach(name => {
        if (!definitions.some(group => group.name === name)
          && !entries.some(entry => entry.layer.get('group') === name)) warn('Unknown group "' + name + '".');
      });
      let size;
      do {
        size = groups.size;
        definitions.forEach(group => {
          if (groups.has(group.parent)) groups.add(group.name);
        });
      } while (size !== groups.size);

      function select(entry) {
        if (entry.background) {
          warn('Use background to select background layer "' + entry.layer.get('name') + '".');
          return;
        }
        selected.add(entry.layer);
        [entry.layer].concat(entry.parents).forEach(layer => claims.set(layer, {
          kind: 'visibility', value: true,
          read: () => layer.getVisible(), write: value => layer.setVisible(value),
          watch: [layer]
        }));
      }
      entries.forEach(entry => {
        if ((groups.has(entry.layer.get('group'))
          && !theme.exclude.some(ref => matches(entry.layer, ref)))
          || theme.layers.some(ref => matches(entry.layer, ref))) select(entry);
      });
      theme.layers.concat(theme.exclude).forEach(ref => {
        if (!entries.some(entry => matches(entry.layer, ref))) warn('Unknown layer in "' + theme.name + '".');
      });

      if (theme.background !== undefined) {
        // A GROUP background is one choice; its children are not independent backgrounds.
        const backgrounds = entries.filter(entry => entry.background
          && !entry.parents.some(parent => parent.get('group') === 'background')).map(entry => entry.layer);
        const targets = backgrounds.filter(layer => matches(layer, theme.background));
        if (targets.length !== 1) {
          warn('Background in "' + theme.name + '" must identify exactly one background layer.');
        } else {
          claims.set(backgroundKey, {
            kind: 'background', value: backgrounds.map(layer => layer === targets[0]),
            read: () => backgrounds.map(layer => layer.getVisible()),
            write: values => backgrounds.forEach((layer, i) => layer.setVisible(values[i])),
            watch: backgrounds
          });
        }
      }

      const filters = Array.isArray(theme.filters) ? theme.filters
        : Object.entries(theme.filters || {}).map(([layer, value]) => ({ layer, value }));
      filters.forEach(filter => {
        if (!isObject(filter) || typeof filter.value !== 'string') {
          warn('Theme "' + theme.name + '": each filter needs a layer and string value.');
          return;
        }
        let candidates = entries.filter(entry => matches(entry.layer, filter.layer));
        // Prefer the occurrence selected by this theme over another layer with the same name.
        const scoped = candidates.filter(entry => selected.has(entry.layer));
        if (scoped.length) candidates = scoped;
        if (!candidates.length) warn('Unknown filter layer in "' + theme.name + '".');
        candidates.forEach(({ layer }) => {
          const source = typeof layer.getSource === 'function' && layer.getSource();
          let read;
          if (source && typeof source.getFilter === 'function') read = () => source.getFilter() || '';
          else if (source && typeof source.getOptions === 'function') read = () => source.getOptions().filter || '';
          if (!source || typeof source.setFilter !== 'function' || !read) {
            warn('Layer "' + layer.get('name') + '" needs setFilter and getFilter or getOptions; filter skipped.');
            return;
          }
          claims.set(source, {
            kind: 'filter', value: filter.value, read,
            write: value => {
              if (!value && typeof source.clearFilter === 'function') source.clearFilter();
              else source.setFilter(value);
            },
            watch: []
          });
        });
      });
      return { claims, selected, entries };
    }

    function scheduleSync() {
      if (pendingSync) return;
      pendingSync = true;
      const currentGeneration = generation;
      Promise.resolve().then(() => {
        if (currentGeneration !== generation) return;
        pendingSync = false;
        if (!viewer) return;
        let changed = false;
        active.forEach((state, name) => {
          if (!state.selected.size) return;
          const visible = state.entries.some(entry => state.selected.has(entry.layer)
            && entry.layer.getVisible() && entry.parents.every(parent => parent.getVisible()));
          if (!visible) {
            active.delete(name);
            changed = true;
          }
        });
        if (changed) reconcile();
      });
    }

    function observe(record) {
      const handler = () => {
        if (writing) return;
        record.baseline = record.read();
        record.last = record.baseline;
        record.manual = true;
        scheduleSync();
      };
      record.watch.forEach(layer => layer.on('change:visible', handler));
      record.dispose = () => record.watch.forEach(layer => layer.un('change:visible', handler));
    }

    function paint() {
      buttons.forEach((button, name) => {
        const pressed = active.has(name);
        button.component.setState(pressed ? 'active' : 'initial');
        button.element.setAttribute('aria-pressed', String(pressed));
        button.element.classList.toggle('primary', pressed);
        button.element.classList.toggle('light', !pressed);
      });
    }

    function reconcile(force = new Map()) {
      const desired = new Map();
      // Map order is activation order. Visibility is shared; latest filter/background wins.
      active.forEach(state => state.claims.forEach((claim, key) => desired.set(key, claim)));
      writing = true;
      try {
        records.forEach((record, key) => {
          const current = record.read();
          if (!same(current, record.last)) {
            record.baseline = current;
            record.last = current;
            record.manual = true;
          }
          if (!desired.has(key)) {
            if (!record.manual && !same(current, record.baseline)) record.write(record.baseline);
            record.dispose();
            records.delete(key);
          }
        });
        desired.forEach((claim, key) => {
          let record = records.get(key);
          if (!record) {
            const baseline = claim.read();
            record = Object.assign({}, claim, { baseline, last: baseline, wanted: undefined, manual: false });
            records.set(key, record);
            observe(record);
          }
          // An unrelated theme change must not undo a manual visibility/filter change.
          if (!same(record.wanted, claim.value) || force.has(key)) {
            if (!same(record.read(), claim.value)) record.write(claim.value);
            record.last = record.read();
            record.manual = false;
          }
          record.wanted = claim.value;
        });
      } finally {
        writing = false;
      }
      paint();
    }

    function activate(name) {
      if (!viewer) { warn('Add the component to a viewer before activating themes.'); return false; }
      const theme = themes.get(name);
      if (!theme) { warn('Unknown theme "' + name + '".'); return false; }
      if (active.has(name)) return false;
      const state = resolve(theme);
      if (options.exclusive !== false && !theme.combinable) {
        active.forEach((value, other) => {
          if (!themes.get(other).combinable) active.delete(other);
        });
      }
      active.set(name, state);
      reconcile(state.claims);
      if (theme.center) {
        const view = viewer.getMap().getView();
        view.setCenter(theme.center.slice());
        view.setZoom(theme.zoom);
      }
      return true;
    }

    function deactivate(name) {
      if (!active.delete(name)) return false;
      reconcile();
      return true;
    }

    function deactivateAll() {
      active.clear();
      reconcile();
    }

    function localizeTitle(title, fallback) {
      if (typeof title === 'string') return title;
      if (isObject(title)) {
        const locale = localization ? localization.getCurrentLocaleId() : 'sv-SE';
        return title[locale] || title['en-US'] || title['sv-SE'] || fallback;
      }
      return fallback;
    }

    function buttonTitle() {
      const localized = localization && localization.getStringByKeys({
        targetParentKey: 'themeSelector', targetKey: 'buttonTitle'
      });
      return typeof localized === 'string' ? localized : strings['sv-SE'].buttonTitle;
    }

    function label(button, title) {
      button.element.setAttribute('aria-label', title);
      button.element.querySelector('[data-tooltip]').setAttribute('data-tooltip', title);
      if (button.text) button.text.textContent = title;
    }

    function refreshLocale() {
      if (!root) return;
      label({ element: mainElement }, buttonTitle());
      panel.setAttribute('aria-label', buttonTitle());
      buttons.forEach((button, name) => label(button, localizeTitle(themes.get(name).title, name)));
    }

    function icon(reference) {
      const value = reference || options.icon || '#ic_layers_24px';
      if (typeof value === 'string' && /^#[A-Za-z_][\w:.-]*$/.test(value)) return value;
      warn('Icons must be SVG symbol references such as #ic_map_24px; using default.');
      return '#ic_layers_24px';
    }

    function listen(element, event, handler) {
      element.addEventListener(event, handler);
      disposers.push(() => element.removeEventListener(event, handler));
    }

    function positionPanel() {
      if (panel.hidden) return;
      const bounds = document.getElementById(viewer.getMain().getId()).getBoundingClientRect();
      const anchor = root.getBoundingClientRect();
      const right = bounds.right - anchor.right - 12;
      const left = anchor.left - bounds.left - 12;
      const useLeft = left > right;
      panel.style.left = useLeft ? 'auto' : 'calc(100% + .5rem)';
      panel.style.right = useLeft ? 'calc(100% + .5rem)' : 'auto';
      panel.style.maxWidth = Math.max(0, useLeft ? left : right) + 'px';
      panel.style.maxHeight = Math.max(0, bounds.height - 16) + 'px';
      const height = panel.getBoundingClientRect().height;
      panel.style.top = Math.max(bounds.top + 8 - anchor.top,
        Math.min(0, bounds.bottom - 8 - anchor.top - height)) + 'px';
    }

    function setOpen(open, focus = false) {
      panel.hidden = !open;
      mainElement.setAttribute('aria-expanded', String(open));
      mainButton.setState(open ? 'active' : 'initial');
      if (open) { refreshLocale(); positionPanel(); }
      if (focus) {
        if (open && buttons.size) buttons.values().next().value.element.focus();
        else mainElement.focus();
      }
    }

    function createButton(component, reference, click, cls) {
      // Origo Button renders HTML strings: only static strings and validated symbol IDs enter it.
      const button = ui.Button({
        icon: icon(reference), cls, tooltipText: ' ', tooltipPlacement: 'east'
      });
      component.addComponent(button);
      button.on('click', click);
      disposers.push(() => button.un('click', click));
      const element = ui.dom.html(button.render()).firstElementChild;
      element.type = 'button';
      element.querySelector('svg').setAttribute('aria-hidden', 'true');
      return { component: button, element };
    }

    function mount(component, target) {
      root = document.createElement('div');
      root.id = component.getId();
      root.className = 'o-theme-selector';
      panel = document.createElement('div');
      panel.id = root.id + '-panel';
      panel.className = 'o-theme-selector-panel bg-white box-shadow';
      panel.setAttribute('role', 'group');
      panel.hidden = true;
      const main = createButton(component, options.icon, () => setOpen(panel.hidden),
        'o-theme-selector-toggle padding-small icon-smaller light round box-shadow');
      mainButton = main.component;
      mainElement = main.element;
      mainElement.setAttribute('aria-controls', panel.id);
      mainElement.setAttribute('aria-expanded', 'false');
      root.appendChild(mainElement);
      themes.forEach(theme => {
        const button = createButton(component, theme.icon, () => component.toggle(theme.name),
          'o-theme-selector-item light');
        button.text = document.createElement('span');
        button.text.className = 'o-theme-selector-label';
        button.element.appendChild(button.text);
        buttons.set(theme.name, button);
        panel.appendChild(button.element);
      });
      root.appendChild(panel);
      target.appendChild(root);
      component.dispatch('render');
      refreshLocale();
      paint();
      const resize = new ResizeObserver(positionPanel);
      resize.observe(document.getElementById(viewer.getMain().getId()));
      disposers.push(() => resize.disconnect());
      listen(root, 'keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false, true);
        } else if (event.target === mainElement && event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true, true);
        }
      });
      listen(document, 'pointerdown', event => {
        if (!root.contains(event.target)) setOpen(false);
      });
      listen(root, 'focusout', event => {
        if (!root.contains(event.relatedTarget)) setOpen(false);
      });
    }

    function clear() {
      if (!viewer) return;
      generation += 1;
      pendingSync = false;
      deactivateAll();
      disposers.splice(0).forEach(dispose => dispose());
      this.clearComponents();
      root.remove();
      buttons.clear();
      instances.delete(viewer);
      viewer = null;
      root = null;
      panel = null;
      mainButton = null;
      mainElement = null;
      localization = null;
    }

    return ui.Component({
      name: 'themeSelector',
      onInit() { this.on('clear', clear); },
      onAdd(event) {
        if (viewer) return;
        const candidate = event.target;
        if (instances.has(candidate)) { warn('Only one ThemeSelector per viewer is supported.'); return; }
        const targetId = options.target || candidate.getMain().getNavigation().getId();
        const target = typeof targetId === 'string' && document.getElementById(targetId);
        if (!target) { warn('Target must be the ID of an existing element.'); return; }
        viewer = candidate;
        instances.set(viewer, this);
        localization = options.localization || viewer.getControlByName('localization');
        if (localization && typeof localization.addPluginToLocale === 'function') {
          Object.keys(strings).forEach(locale => {
            const existing = localization.getLocale(locale);
            const translation = existing && existing.plugins && existing.plugins.themeSelector;
            localization.addPluginToLocale(locale, {
              themeSelector: Object.assign({}, strings[locale], translation)
            });
          });
        } else {
          warn('Localization API unavailable; using Swedish labels.');
          localization = null;
        }
        mount(this, target);
      },
      activate,
      deactivate,
      toggle(name) { return active.has(name) ? deactivate(name) : activate(name); },
      deactivateAll,
      getActive: () => Array.from(active.keys()),
      refreshLocale
    });
  }

  global.ThemeSelector = ThemeSelector;
}(window));

