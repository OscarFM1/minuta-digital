/**
 * scripts/reset-admin-password.js
 * Reinicia la contraseña de un usuario (admin/worker) y fuerza must_change_password=true.
 *
 * Uso:
 *   node scripts/reset-admin-password.js esteban.macias@multi-impresos.com "ClaveTemporal123!"
 *
 * Seguridad:
 *  - Usa Service Role (solo local/servidor). NO subir la clave al repo.
 */
const fs = require('fs');
const path = require('path');
const envPathLocal = path.resolve(process.cwd(), '.env.local');
const envPath = fs.existsSync(envPathLocal) ? envPathLocal : path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

const { createClient } = require('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  try {
    const [login, newPassword] = process.argv.slice(2);
    if (!URL || !SERVICE) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    if (!login || !newPassword) throw new Error('Uso: node scripts/reset-admin-password.js <login@login.local> "<NuevaPassword>"');
    if (newPassword.length < 8) throw new Error('La nueva contraseña debe tener al menos 8 caracteres');

    const supa = createClient(URL, SERVICE);

    // 1) Buscar usuario por email/login
    const { data: list, error: listErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw listErr;
    const user = list.users.find(u => (u.email || '').toLowerCase() === login.toLowerCase());
    if (!user) throw new Error(`No se encontró el usuario: ${login}`);

    // 2) Actualizar contraseña
    const { error: updErr } = await supa.auth.admin.updateUserById(user.id, { password: newPassword });
    if (updErr) throw updErr;

    // 3) Forzar cambio de contraseña al próximo login
    const { error: upsertErr } = await supa.from('profiles').upsert({
      id: user.id,
      email: login,
      must_change_password: true,
    }, { onConflict: 'id' });
    if (upsertErr) throw upsertErr;

    console.log(`OK: Password reseteado y must_change_password=true para ${login} (id=${user.id})`);
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message || e);
    process.exit(1);
  }
})();
