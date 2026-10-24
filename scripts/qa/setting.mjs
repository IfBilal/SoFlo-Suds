// Set or clear one shop setting for QA: node --env-file=apps/api/.env scripts/qa/setting.mjs <key> <value|__delete__>
import { createClient } from '@supabase/supabase-js';
const a = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const [k, v] = process.argv.slice(2);
if (v === '__delete__') await a.from('settings').delete().eq('key', k); else await a.from('settings').upsert({ key: k, value: v }, { onConflict: 'key' });
console.log(k, '=', v);
