/**
 * scripts/seed-super-admin.js
 * Crea/asegura un SUPER ADMIN en Auth y lo marca en public.profiles.
 * Uso:
 *   node scripts/seed-super-admin.js super@login.local "Tu Nombre" "ClaveTemporal123!"
 *
 * Requisitos:
 *  - .env.local en la raíz (no subir a Git) con:
 *      NEXT_PUBLIC_SUPABASE_URL=...
 *      SUPABASE_SERVICE_ROLE_KEY=...
 */

const fs = require('fs');
const path = require('path');

// 1) Carga .env.local (o .env como fallback)
const envPathLocal = path.resolve(process.cwd(), '.env.local');
const envPath = fs.existsSync(envPathLocal) ? envPathLocal : path.resolve(process.cwd(), '.env');
require('dotenv').config({ path: envPath });

// 2) Dependencias
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

(async () => {
  try {
    const [login, fullName, password] = process.argv.slice(2);

    // 3) Validaciones de entorno y argumentos
    if (!url || !serviceKey) {
      console.error('FAIL: Faltan vars: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
      console.error('Usando archivo env:', envPath);
      console.error('NEXT_PUBLIC_SUPABASE_URL:', url ? 'OK' : 'MISSING');
      console.error('SUPABASE_SERVICE_ROLE_KEY:', serviceKey ? 'OK' : 'MISSING');
      process.exit(1);
    }
    if (!login || !password) {
      console.error('Uso: node scripts/seed-super-admin.js <login@login.local> "<Nombre>" "<Password >= 8>"');
      process.exit(1);
    }
    if (password.length < 8) {
      console.error('La contraseña debe tener al menos 8 caracteres');
      process.exit(1);
    }

    const supa = createClient(url, serviceKey);

    // 4) Crea usuario o reutiliza si ya existe
    let userId = null;
    const { data: created, error: createErr } = await supa.auth.admin.createUser({
      email: login,
      password,
      email_confirm: true, // sin flujos de correo
      user_metadata: { full_name: fullName || '', role: 'super_admin' },
    });

    if (createErr) {
      // Puede ser que ya exista → buscamos por email
      const { data: list, error: listErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listErr) throw listErr;
      const existing = list.users.find(u => u.email?.toLowerCase() === login.toLowerCase());
      if (!existing) throw createErr; // error real
      userId = existing.id;
      console.log('Usuario ya existía, usando id:', userId);
    } else {
      userId = created?.user?.id;
      console.log('Usuario creado:', userId);
    }

    if (!userId) throw new Error('No se pudo obtener el userId');

    // 5) Upsert en profiles como SUPER ADMIN
    const { error: upErr } = await supa
      .from('profiles')
      .upsert({
        id: userId,
        email: login,
        full_name: fullName || '',
        role: 'super_admin',
        must_change_password: false,
      });
    if (upErr) throw upErr;

    console.log('OK: super_admin =>', login, userId);
    process.exit(0);
  } catch (e) {
    console.error('FAIL:', e.message || e);
    process.exit(1);
  }
})();
