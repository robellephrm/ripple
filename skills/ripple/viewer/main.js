// Ripple viewer: opens a built Ripple Map (a workspace's dist/ folder) in its own app window.
// No localhost and no browser tab. Pages are served from a private ripple:// scheme so canvas and
// WebGL treat every file as same-origin. Source links (http/https) open in the default browser.
// Usage: electron <viewer dir> <path to workspace dist> [window title]
const { app, BrowserWindow, protocol, net, shell, nativeTheme, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

const dist = path.resolve(process.argv.find((a, i) => i >= 2 && fs.existsSync(path.join(a, 'index.html'))) || '');
const title = process.argv.find((a, i) => i >= 2 && a.startsWith('--title='))?.slice(8) || 'Ripple';
if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('ripple viewer: pass the path to a built dist/ folder (it must contain index.html)');
  process.exit(1);
}

app.setName('Ripple');
protocol.registerSchemesAsPrivileged([{ scheme: 'ripple', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const isExternal = url => /^https?:\/\//i.test(url);

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  // ripple://map/<file> -> <dist>/<file>, never outside dist
  protocol.handle('ripple', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(dist, rel);
    if (file !== dist && !file.startsWith(dist + path.sep)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString()).then(r => {
      const headers = new Headers(r.headers);
      // only the app's own code runs; fonts may come from Google Fonts; images only from the app
      headers.set('Content-Security-Policy', [
        "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
        "object-src 'none'", "base-uri 'none'", "form-action 'none'",
      ].join('; '));
      return new Response(r.body, { status: r.status, headers });
    });
  });

  const win = new BrowserWindow({
    title, width: 1600, height: 1000, minWidth: 1100, minHeight: 700, show: false,
    backgroundColor: '#0E0D0B', fullscreenable: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.on('page-title-updated', e => e.preventDefault());   // keep "Ripple · <company>"
  // Source links and any other web link: hand to the default browser, never navigate the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (isExternal(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('ripple://')) return;
    e.preventDefault(); if (isExternal(url)) shell.openExternal(url);
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('ripple://map/index.html');

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { role: 'windowMenu' },
  ]));
});
app.on('window-all-closed', () => app.quit());
