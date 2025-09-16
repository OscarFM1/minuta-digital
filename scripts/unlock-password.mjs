import { createClient } from '@supabase/supabase-js';

const URL   = process.env.SUPABASE_URL;
const SVC   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.USER_EMAIL || '').toLowerCase();

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

async function updateMetadataFlags(user) {
  const appMeta  = { ...(user.app_metadata || {}) };
  const userMeta = { ...(user.user_metadata || {}) };

  // elimina o fuerza a false los flags problemáticos
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

async function updateProfilesTable(userId, table) {
  try {
    // intentamos update directo
    const { error: updErr } = await admin
      .from(table)
      .update({ must_change_password: false, first_login: false, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updErr && !(updErr.code || '').startsWith('PGRST')) throw updErr;

    // si la tabla no existe o columnas faltan, no es crítico
  } catch (e) {
    // lo ignoramos de forma segura (proyectos sin esa tabla/columna)
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

    await updateMetadataFlags(user);

    // Actualiza ambas variantes de perfil si existen en el proyecto
    await updateProfilesTable(user.id, 'profiles');
    await updateProfilesTable(user.id, 'profile');

    console.log(`OK: desactivado must_change_password/first_login para ${EMAIL}`);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e?.message || e);
    process.exit(1);
  }
})();
