import 'dotenv/config';
import { closeDb } from '../db.js';
import { syncJobsOnce, sendRemindersOnce } from './sync.js';
try { console.log(await syncJobsOnce(), await sendRemindersOnce()); } finally { await closeDb(); }
