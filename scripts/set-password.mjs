import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.USER_EMAIL;
const PASS = process.env.NEW_PASSWORD;

if (!URL || !SERVICE || !EMAIL || !PASS) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_EMAIL, NEW_PASSWORD');
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

try {
  const { data: page1, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;

  const user = page1.users.find(u => (u.email || '').toLowerCase() === EMAIL.toLowerCase());
  if (!user) {
    console.error(`No existe ${EMAIL}`);
    process.exit(2);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: PASS });
  if (updErr) throw updErr;

  // Limpia flags del bucle de primer login
  await admin.from('profiles')
    .update({ first_login: false, must_change_password: false, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  console.log(`OK: contraseña actualizada para ${EMAIL}`);
  process.exit(0);
} catch (e) {
  console.error('Error:', e?.message || e);
  process.exit(1);
}
