import { createClient } from '@supabase/supabase-js';

const URL   = process.env.SUPABASE_URL;
const SVC   = process.env.SUPABASE_SERVICE_ROLE_KEY; // SERVICE ROLE (no el anon)
const EMAIL = (process.env.USER_EMAIL || '').toLowerCase();
const NEW_PASSWORD = process.env.NEW_PASSWORD || null; // opcional

if (!URL || !SVC || !EMAIL) {
  console.error('Faltan variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USER_EMAIL');
  process.exit(1);
}

const admin = createClient(URL, SVC, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function updatePassword(userId, pwd) {
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pwd });
  if (error) throw error;
}

async function clearMetadataFlags(user) {
  const appMeta  = { ...(user.app_metadata || {}) };
  const userMeta = { ...(user.user_metadata || {}) };

  delete appMeta.must_change_password;
  delete appMeta.first_login;
  delete userMeta.must_change_password;
  delete userMeta.first_login;

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: appMeta,
    user_metadata: userMeta,
  });
  if (error) throw error;
}

async function updateProfilesFlags(userId, table) {
  try {
    const { error } = await admin
      .from(table)
      .update({ must_change_password: false, first_login: false, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error && !(error.code || '').startsWith('PGRST')) {
      throw error;
    }
  } catch (e) {
    console.warn(`[warn] No se pudo actualizar ${table}:`, e?.message || e);
  }
}

(async () => {
  try {
    const user = await findUserByEmail(EMAIL);
    if (!user) {
      console.error(`No existe el usuario ${EMAIL}`);
      process.exit(2);
    }

    if (NEW_PASSWORD) {
      await updatePassword(user.id, NEW_PASSWORD);
      console.log('Contraseña actualizada.');
    }

    await clearMetadataFlags(user);
    await updateProfilesFlags(user.id, 'profiles');
    await updateProfilesFlags(user.id, 'profile');

    console.log(`OK: desbloqueado para ${EMAIL}`);
    console.log('👉 Ahora cierra sesión en el navegador y borra los keys sb-* del localStorage antes de iniciar sesión de nuevo.');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e?.message || e);
    process.exit(1);
  }
})();
