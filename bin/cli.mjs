#!/usr/bin/env node
// Serves the built party tracker from dist/ on localhost and opens the browser.
// The port is fixed by default: localStorage (where the whole party lives) is
// keyed by origin, so a stable http://localhost:8725 keeps your party across
// package updates and install locations. localhost is a secure context, so the
// service worker and the "Install app" PWA button work too. (8725, one above
// pf2e-spellbook's 8724, so the two apps never share an origin.)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const DEFAULT_PORT = 8725;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: pf2e-party-tracker [--port N] [--no-open]

Serves the PF2e Party Tracker at http://localhost:${DEFAULT_PORT} and opens your browser.

  --port N    listen on port N instead of ${DEFAULT_PORT} (note: your party is
              stored per-origin, so a different port is a different, empty party)
  --no-open   don't open the browser, just serve`);
  process.exit(0);
}
const portIdx = args.indexOf('--port');
const port = portIdx !== -1 ? Number(args[portIdx + 1]) : DEFAULT_PORT;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`pf2e-party-tracker: invalid --port ${args[portIdx + 1]}`);
  process.exit(1);
}
const noOpen = args.includes('--no-open');

const distDir = new URL('../dist/', import.meta.url);
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
};

const server = http.createServer(async (req, res) => {
  const entry = FILES[new URL(req.url, 'http://localhost').pathname];
  if (!entry || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  const [file, type] = entry;
  try {
    const body = await readFile(new URL(file, distDir));
    // no-cache so package updates (new sw.js/index.html) are picked up on reload
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.byteLength,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Read error');
  }
});

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : ['xdg-open', [url]];
  spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {
    console.error(`Couldn't open a browser — go to ${url}`);
  }).unref();
}

const url = `http://localhost:${port}/`;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${port} is in use — assuming the tracker is already running at ${url}`);
    if (!noOpen) openBrowser(url);
    process.exit(0);
  }
  console.error(`pf2e-party-tracker: ${err.message}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`PF2e Party Tracker running at ${url}  (Ctrl+C to stop)`);
  if (!noOpen) openBrowser(url);
});
