import 'dotenv/config';
import { db, closeDb } from './db.js';
import { passwordHash } from './auth.js';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters)');
try { await db().query('INSERT INTO admins (email,password_hash) VALUES ($1,$2) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash,active=true', [email, await passwordHash(password)]); console.log('Admin account ready'); } finally { await closeDb(); }
