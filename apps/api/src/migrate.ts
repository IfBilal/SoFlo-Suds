import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { db, closeDb } from './db.js';
const file = fileURLToPath(new URL('../sql/001_initial.sql', import.meta.url));
if (process.env.MIGRATION_DATABASE_URL) process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
if (process.env.DATABASE_URL?.includes('soflo_api.')) throw new Error('The soflo_api runtime role cannot change the schema. Set MIGRATION_DATABASE_URL to a privileged migration connection.');
try { await db().query(await readFile(file, 'utf8')); console.log('Migration 001 applied'); } finally { await closeDb(); }
