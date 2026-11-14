/**
 * Local dev server: runs the backend in the Apps Script emulator (in memory, reset on restart).
 * The frontend talks to it with VITE_API_URL=http://localhost:8787 and VITE_DEV_AUTH=true
 * (unsigned dev tokens, login by choosing an e-mail).
 *
 * Usage: npm run dev  (PORT env variable optional)
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { loadBackend } = require('./loadBackend');

const PORT = Number(process.env.PORT) || 8787;
const CHEF = 'chef@example.com';
const backend = loadBackend({ ownerEmail: CHEF, clientId: 'dev-client-id' });

/** Seeds employees, two projects and a few entries so the UI has something to show. */
function seed() {
  const call = (action, email, payload) => {
    const res = backend.call(action, email, payload);
    if (!res.ok) throw new Error(action + ': ' + res.error.message);
    return res.data;
  };
  call('saveEmployee', CHEF, { name: 'Christa Chef', shortName: 'CC', email: CHEF, hourlyRate: 55 });
  const max = call('saveEmployee', CHEF, { name: 'Max Monteur', shortName: 'MM', email: 'max@example.com', hourlyRate: 42 });
  call('saveEmployee', CHEF, { name: 'Eva Elektro', shortName: 'EE', email: 'eva@example.com', hourlyRate: 38 });
  const p1 = call('saveProject', CHEF, {
    name: 'Neubau Wohn- & Gewerbepark Westend', client: 'Immobilien Holding GmbH & Co KG',
    address: 'Gewerbestraße 14, 1030 Wien', siteManager: 'Ing. Markus Leitner',
  });
  call('saveProject', CHEF, { name: 'Wohnung Nina', client: 'Nina Muster', address: 'Hauptstraße 3, 2500 Baden', siteManager: '' });
  const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().substring(0, 10);
  call('saveTimeEntry', 'max@example.com', { id: crypto.randomUUID(), projectId: p1.id, date: day(3), from: '07:00', to: '15:30', description: 'Leerrohre Erdgeschoß verlegt' });
  call('saveTimeEntry', 'max@example.com', { id: crypto.randomUUID(), projectId: p1.id, date: day(2), from: '08:30', to: '16:20', description: 'Kabel für Küche eingezogen' });
  call('saveTimeEntry', CHEF, { id: crypto.randomUUID(), projectId: p1.id, date: day(2), from: '13:00', to: '15:00', description: 'Abnahme Verteiler' });
  call('savePurchase', 'max@example.com', { id: crypto.randomUUID(), projectId: p1.id, date: day(2), article: 'Kabel NYM-J 3x1,5 (50 m)', amount: 64.9, source: 'manual' });
  call('saveDemand', 'max@example.com', { id: crypto.randomUUID(), projectId: p1.id, material: 'FI-Schalter 40A', quantity: 2, unit: 'Stk', urgency: 'urgent', note: 'für UV Küche' });
  return max;
}

seed();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, data: { status: 'dev backend running' } }));
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    // Simulate typical Apps Script latency so loading states are visible.
    setTimeout(() => {
      const result = backend.run('handleRequest')(body);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    }, 300);
  });
});

server.listen(PORT, () => {
  console.log('Dev backend on http://localhost:' + PORT + ' (users: chef@example.com, max@example.com, eva@example.com)');
});
