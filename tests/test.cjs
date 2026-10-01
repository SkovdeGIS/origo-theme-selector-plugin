/* Run: node tests/test.cjs ../origo-master-refrence-read-only [path-to-chrome] */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '..');
const coreRoot = path.resolve(process.argv[2] || '../origo-master-refrence-read-only', 'build');
const chrome = process.argv[3] || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'
].find(file => fs.existsSync(file));
if (!chrome || !fs.existsSync(path.join(coreRoot, 'js/origo.min.js'))) {
  throw new Error('Supply a built Origo checkout and a Chrome/Chromium executable; see command above.');
}

async function browserTests() {
  const results = [];
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
    results.push(message);
  };
  const v = origo.api();
  const initial = themeSelector;
  const planning = v.getLayer('planning');
  const nature = v.getLayer('nature');
  const buildings = v.getLayer('buildings');
  const plain = v.getLayer('plain');
  const photo = v.getLayer('orthophoto');
  const pluginElement = () => document.getElementById(themeSelector.getId());
  const tick = () => Promise.resolve();
  check(!!initial && !!pluginElement(), 'Example mounts through real viewer.addComponent');
  const toggle = pluginElement().querySelector('button');
  check(toggle.getAttribute('aria-label') === 'Välj vy', 'Swedish default label uses Origo locale');
  toggle.focus();
  toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  check(toggle.getAttribute('aria-expanded') === 'true', 'ArrowDown opens selector');
  check(document.activeElement === pluginElement().querySelector('.o-theme-selector-item'), 'ArrowDown focuses first theme');
  const item = document.activeElement;
  item.click();
  check(planning.getVisible() && !buildings.getVisible(), 'Real button activates group and respects exclude');
  check(item.getAttribute('aria-pressed') === 'true', 'ARIA pressed follows activation');
  item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check(toggle.getAttribute('aria-expanded') === 'false' && document.activeElement === toggle, 'Escape closes and restores focus');
  initial.activate('buildings');
  v.getMap().getView().setCenter([1000000, 1000000]);
  v.getMap().getView().setZoom(5);
  initial.activate('nature');
  check(v.getMap().getView().getCenter().every(value => value === 0)
    && v.getMap().getView().getZoom() === 3, 'Theme center and zoom applied in map projection');
  check(!planning.getVisible() && nature.getVisible() && buildings.getVisible(), 'Exclusive API preserves combinable themes');
  check(photo.getVisible() && !plain.getVisible(), 'Background selection');
  initial.deactivateAll();
  check(plain.getVisible() && !photo.getVisible() && !buildings.getVisible(), 'Background and layers restore');
  check(v.getMap().getView().getZoom() === 3, 'Deactivation leaves camera at the chosen view');
  const loc = v.getControlByName('localization');
  check(loc.getLocale('en-US').plugins.themeSelector.buttonTitle === 'Select view', 'Translations registered with Origo');
  loc.setLocale('en-US');
  initial.refreshLocale();
  check(toggle.getAttribute('aria-label') === 'Select view', 'Runtime refresh updates main label');
  check(item.textContent.includes('Planning'), 'Runtime refresh updates theme title');
  v.removeComponent(initial);
  check(!document.getElementById(initial.getId()), 'Origo clear lifecycle removes DOM');
  check(initial.getActive().length === 0, 'Clear releases active state');
  v.addComponent(initial);
  check(!!document.getElementById(initial.getId()), 'Component can be re-added');
  v.removeComponent(initial);

  function make(themes, options = {}) {
    const plugin = ThemeSelector(Object.assign({ themes, exclusive: false }, options));
    v.addComponent(plugin);
    return plugin;
  }
  function layer(name, group, visible = false, source) {
    const result = new Origo.ol.layer.Vector({ name, group, visible, source: source || new Origo.ol.source.Vector() });
    v.getMap().addLayer(result);
    return result;
  }
  const a = layer('duplicate', 'one');
  const b = layer('duplicate', 'two');
  const unrelated = layer('unrelated', 'one', true);
  const p = make([
    { name: 'a', groups: ['one'], exclude: ['unrelated'] },
    { name: 'b', layers: [a] },
    { name: 'c', layers: [b] }
  ]);
  p.activate('a');
  check(a.getVisible() && !b.getVisible(), 'Group selection keeps duplicate-name objects distinct');
  p.activate('b');
  p.deactivate('a');
  check(a.getVisible(), 'Shared layer remains visible until last owner releases');
  p.deactivate('b');
  check(!a.getVisible() && unrelated.getVisible(), 'Shared baseline and unrelated layer preserved');
  a.setVisible(true);
  p.activate('b');
  p.deactivate('b');
  check(a.getVisible(), 'Initially visible layer stays visible');
  a.setVisible(false);
  p.activate('a');
  p.activate('b');
  a.setVisible(false);
  await tick();
  check(p.getActive().length === 0 && !a.getVisible(), 'Last manual layer off releases every affected theme');
  p.activate('b');
  a.setVisible(false);
  a.setVisible(true);
  await tick();
  p.activate('c');
  p.deactivate('c');
  p.deactivate('b');
  check(a.getVisible(), 'Manual visibility becomes the restoration baseline');
  v.removeComponent(p);

  const q = make([
    { name: 'a', layers: [a, b], background: 'orthophoto' },
    { name: 'b', layers: [b], background: 'orthophoto' },
    { name: 'c', background: 'plain' }
  ]);
  a.setVisible(false);
  b.setVisible(false);
  q.activate('a');
  q.activate('b');
  q.deactivate('a');
  check(photo.getVisible() && b.getVisible() && !a.getVisible(), 'Shared background baseline survives first release');
  q.activate('c');
  check(plain.getVisible() && !photo.getVisible(), 'Latest background wins');
  q.deactivate('c');
  check(photo.getVisible() && !plain.getVisible(), 'Previous background owner resumes');
  q.deactivate('b');
  check(plain.getVisible() && !photo.getVisible(), 'Original background restored after all owners release');
  q.activate('a');
  photo.setVisible(false);
  plain.setVisible(true);
  q.deactivate('a');
  check(plain.getVisible() && !photo.getVisible(), 'Manual background choice preserved');
  q.activate('a');
  a.setVisible(false);
  await tick();
  check(q.getActive().includes('a') && !a.getVisible(), 'Partial manual visibility does not deactivate theme');
  q.activate('c');
  q.deactivate('c');
  check(!a.getVisible(), 'Unrelated theme transitions do not re-enable manual layer');
  b.setVisible(false);
  await tick();
  check(q.getActive().length === 0 && plain.getVisible(), 'Auto-deactivation releases background ownership too');
  v.removeComponent(q);
  plain.setVisible(false);
  photo.setVisible(false);
  const backgroundOnly = make([{ name: 'background', background: 'orthophoto' }]);
  backgroundOnly.activate('background');
  backgroundOnly.deactivateAll();
  check(!plain.getVisible() && !photo.getVisible(), 'An empty background baseline is restored');
  v.removeComponent(backgroundOnly);
  plain.setVisible(true);
  const exclusive = make([
    { name: 'one', layers: [a], background: 'orthophoto' },
    { name: 'two', layers: [a], background: 'orthophoto' }
  ], { exclusive: true });
  a.setVisible(false);
  exclusive.activate('one');
  exclusive.activate('two');
  exclusive.deactivateAll();
  check(!a.getVisible() && plain.getVisible(), 'Exclusive handoff preserves shared original baselines');
  v.removeComponent(exclusive);

  v.getMapSource().test = { type: 'WFS', url: '/wfs', strategy: 'all' };
  const wfs = v.addLayer({ name: 'filtered', type: 'WFS', source: 'test', group: 'none', filter: 'original = 1' });
  const source = wfs.getSource();
  const sharedSourceLayer = layer('shared-source', 'two', false, source);
  const f = make([
    { name: 'first', layers: [wfs], filters: [{ layer: wfs, value: 'first = 1' }] },
    { name: 'second', filters: [{ layer: sharedSourceLayer, value: 'second = 1' }] }
  ]);
  f.activate('first');
  check(source.getOptions().filter === 'first = 1', 'Real Origo WFS source accepts theme filter');
  f.activate('second');
  check(source.getOptions().filter === 'second = 1', 'Shared source uses latest filter');
  f.deactivate('second');
  check(source.getOptions().filter === 'first = 1', 'Earlier filter restored when latest releases');
  f.deactivate('first');
  check(source.getOptions().filter === 'original = 1', 'Original source filter restored');
  f.activate('first');
  source.setFilter('manual = 1');
  f.deactivate('first');
  check(source.getOptions().filter === 'manual = 1', 'External filter change preserved');
  f.activate('first');
  f.activate('second');
  v.removeComponent(f);
  check(source.getOptions().filter === 'manual = 1', 'Clear restores shared filter baseline');
  check(!wfs.getVisible(), 'Clear restores visibility');
  const scopedSourceA = new Origo.ol.source.Vector();
  const scopedSourceB = new Origo.ol.source.Vector();
  [scopedSourceA, scopedSourceB].forEach(s => {
    let filter = 'baseline';
    s.setFilter = value => { filter = value; };
    s.getFilter = () => filter;
  });
  const scopedA = layer('same-filter-name', 'scope-a', false, scopedSourceA);
  layer('same-filter-name', 'scope-b', false, scopedSourceB);
  const scoped = make([{ name: 'scoped', groups: ['scope-a'],
    filters: { 'same-filter-name': 'scoped-filter' } }]);
  scoped.activate('scoped');
  check(scopedSourceA.getFilter() === 'scoped-filter' && scopedSourceB.getFilter() === 'baseline',
    'Named filter respects selected duplicate-name occurrence');
  scopedA.setVisible(false);
  await tick();
  check(scopedSourceA.getFilter() === 'baseline', 'Manual last-layer off restores its filter');
  v.removeComponent(scoped);
  const child = layer('child', 'childgroup');
  v.getMap().removeLayer(child);
  const group = new Origo.ol.layer.Group({ name: 'parent', visible: false, layers: [child] });
  v.getMap().addLayer(group);
  const nested = make([{ name: 'nested', layers: [child] }]);
  nested.activate('nested');
  check(child.getVisible() && group.getVisible(), 'Nested layer selection enables its parent');
  nested.deactivateAll();
  check(!child.getVisible() && !group.getVisible(), 'Nested parent baseline restored');
  v.removeComponent(nested);
  v.addGroup({ name: 'parent-metadata' });
  v.addGroup({ name: 'child-metadata', parent: 'parent-metadata' });
  const descendant = layer('descendant', 'child-metadata');
  const recursive = make([{ name: 'recursive', groups: ['parent-metadata'] }]);
  recursive.activate('recursive');
  check(descendant.getVisible(), 'Origo metadata child groups are included');
  v.removeComponent(recursive);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  const bad = make([
    null, {}, { name: 'valid', layers: [a] }, { name: 'valid' },
    { name: 'bad', groups: ['absent'], layers: ['missing'], background: 'missing',
      center: [1, 2], filters: { nature: 'x = 1' } },
    { name: 'unsafe', title: '<img src=x onerror=alert(1)>', icon: '#x onclick=alert(1)' }
  ]);
  bad.activate('bad');
  bad.activate('valid');
  check(a.getVisible(), 'Bad theme does not prevent valid themes');
  check(warnings.length >= 7, 'Invalid config and unsupported filters produce warnings');
  check(!document.getElementById(bad.getId()).querySelector('img'), 'Config title and icon cannot inject HTML');
  console.warn = originalWarn;
  const retainedButton = bad.getComponents()[0];
  v.removeComponent(bad);
  retainedButton.dispatch('click');
  check(!document.getElementById(bad.getId()), 'Detached button handler cleaned up');
  const listenerCount = (a.getListeners('change:visible') || []).length;
  const repeated = make([{ name: 'repeat', layers: [a] }]);
  for (let i = 0; i < 5; i += 1) { repeated.activate('repeat'); repeated.deactivateAll(); }
  check((a.getListeners('change:visible') || []).length === listenerCount, 'Repeated activations do not leak layer listeners');
  v.removeComponent(repeated);
  v.addComponent(initial);
  initial.refreshLocale();
  themeSelector = initial;
  return results;
}

(async () => {
  const profile = fs.mkdtempSync(path.join(pluginRoot, '.browser-test-'));
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/wfs') {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"type":"FeatureCollection","features":[]}');
      return;
    }
    const prefix = '/plugins/theme-selector/';
    const base = pathname.startsWith(prefix) ? pluginRoot : coreRoot;
    let relative = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname.slice(1);
    if (relative === 'js/origo.js') relative = 'js/origo.min.js';
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.html': 'text/html', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/plugins/theme-selector/examples/index.html';
  let child;
  let socket;
  try {
    child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000);
      child.once('error', reject);
      child.stderr.on('data', data => {
        output += data;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    const browserErrors = [];
    const pending = new Map();
    let id = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.exception?.description || 'Browser exception');
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push(JSON.stringify(message.params.args));
      if (pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        clearTimeout(timer); pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      }
    });
    function send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        id += 1;
        const requestId = id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(method + ' timed out')); }, 20000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params, sessionId }));
      });
    }
    const { targetId } = await send('Target.createTarget', { url });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    async function evaluate(expression) {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || JSON.stringify(response.exceptionDetails));
      return response.result.value;
    }
    await send('Runtime.enable', {}, sessionId);
    const started = Date.now();
    while (true) {
      let ready = false;
      try { ready = await evaluate('!!window.themeSelector'); }
      catch (error) { if (!/context/.test(error.message)) throw error; }
      if (ready) break;
      if (Date.now() - started > 15000) throw new Error('Example failed to load');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const results = await evaluate('(' + browserTests.toString() + ')()');
    results.forEach(result => console.log('PASS ' + result));
    async function key(key, code, windowsVirtualKeyCode) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, text: key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode }, sessionId);
    }
    await evaluate("document.getElementById(themeSelector.getId()).querySelector('button').focus()");
    await key('Enter', 'Enter', 13);
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-expanded')"), 'true');
    await key('Tab', 'Tab', 9);
    assert(await evaluate("document.activeElement.classList.contains('o-theme-selector-item')"));
    await key(' ', 'Space', 32);
    assert(await evaluate("themeSelector.getActive().includes('planning')"));
    await key('Escape', 'Escape', 27);
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-expanded')"), 'false');
    console.log('PASS native Enter, Tab, Space and Escape keyboard input');
    for (const [width, height] of [[1280, 800], [320, 568], [568, 320]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
      await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const bounds = await evaluate(`(() => {
        const root = document.getElementById(themeSelector.getId());
        const button = root.querySelector('button');
        if (button.getAttribute('aria-expanded') !== 'true') button.click();
        const panel = root.querySelector('.o-theme-selector-panel').getBoundingClientRect();
        return { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom, width: panel.width };
      })()`);
      assert(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= height && bounds.width > 100,
        'Panel fits ' + width + 'x' + height + ': ' + JSON.stringify(bounds));
      assert(await evaluate(`(() => {
        const button = document.getElementById(themeSelector.getId()).querySelector('.o-theme-selector-item');
        const rect = button.getBoundingClientRect();
        return button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      })()`), 'Theme button receives pointer input');
      console.log('PASS panel fits and accepts pointer input at ' + width + 'x' + height);
    }
    assert.deepEqual(browserErrors, [], 'No browser exceptions or console errors');
    await send('Browser.close');
    console.log(results.length + 5 + ' browser checks passed against ' + coreRoot);
  } finally {
    if (socket) socket.close();
    if (child && child.exitCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
    server.close();
    const verified = path.resolve(profile);
    if (path.dirname(verified) !== pluginRoot || !path.basename(verified).startsWith('.browser-test-')) {
      throw new Error('Refusing cleanup outside test profile');
    }
    fs.rmSync(verified, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

