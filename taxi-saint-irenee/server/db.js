// Stockage JSON sur disque : suffisant pour l'activité d'un artisan,
// sans base de données à installer. Écritures atomiques et sérialisées.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

const EMPTY = () => ({
  users: [],
  sessions: [],
  bookings: [],
  invoices: [],
  messages: [],
  resetTokens: [],
  counters: { booking: 0, invoice: {} },
});

class Store {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    this.queue = Promise.resolve();
  }

  async load() {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await readFile(this.file, 'utf8');
      this.data = { ...EMPTY(), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await this.save();
    }
    this.purge();
  }

  save() {
    const snapshot = JSON.stringify(this.data);
    this.queue = this.queue.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      await rename(tmp, this.file);
    }).catch((err) => console.error('[db] écriture impossible', err));
    return this.queue;
  }

  purge() {
    const now = Date.now();
    const before = this.data.sessions.length + this.data.resetTokens.length;
    this.data.sessions = this.data.sessions.filter((s) => s.expiresAt > now);
    this.data.resetTokens = this.data.resetTokens.filter((t) => t.expiresAt > now);
    if (this.data.sessions.length + this.data.resetTokens.length !== before) this.save();
  }
}

export const db = new Store(config.dataFile);
export const uid = (prefix = '') => prefix + crypto.randomBytes(9).toString('base64url');

// Référence courte lisible au téléphone : TSI-4F7K2
export function bookingRef() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = '';
  for (const b of crypto.randomBytes(5)) ref += alphabet[b % alphabet.length];
  return `TSI-${ref}`;
}

// Numérotation des factures continue et chronologique par année : F2026-0001
export function nextInvoiceNumber(date = new Date()) {
  const year = String(date.getFullYear());
  const counters = db.data.counters.invoice;
  counters[year] = (counters[year] || 0) + 1;
  return `F${year}-${String(counters[year]).padStart(4, '0')}`;
}
