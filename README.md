This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.


# Minuta Digital – Adjuntos, Compresión y Limpieza Automática (35 días)

**Stack:** Next.js (TS) + Supabase (Auth, Postgres, Storage, pg\_cron).
**Objetivo:** permitir subir evidencias (imágenes y documentos), almacenarlas por **minuta** bajo el prefijo `attachments/<minuteId>/<filename>`, y **eliminar automáticamente** minutas **no protegidas** y **todo su contenido** pasado el período de retención (35 días).

> Este README está escrito para 1 sola persona manteniendo el proyecto. Todo es **gratis** o del plan Free de Supabase. Incluye scripts de verificación, pruebas E2E y comandos de operación segura.

---

## 0) Estado del sistema

* Retención: `app.config.retention_days = '35'`
* Bucket de evidencias: `app.config.attachments_bucket = 'attachments'`
* Limpieza: `public.cleanup_old_minutes_v4()` + **pg\_cron** diario 02:05 UTC.
* Borrado por prefijo: `public.delete_storage_prefix_best_effort(p_minute_id uuid)` (usa `storage.delete_prefix` si existe y remata con hard delete en `storage.objects`).
* RLS:

  * `minute` y `attachment`: dueño CRUD sobre lo propio; admin ([operaciones@multi-impresos.com](mailto:operaciones@multi-impresos.com)) **SELECT** global.
  * `storage.objects`: subida autenticada y listado de metadatos por dueño mediante prefijo `minuteId/`.

---

## 1) Variables de entorno (cliente/servidor)

**Cliente (safe):**

* `NEXT_PUBLIC_SUPABASE_URL`
* `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Servidor (API Routes / Edge Functions):**

* `SUPABASE_SERVICE_ROLE_KEY` *(no se usa en este flujo actual – solo si más adelante expones APIs admin)*
* `DATABASE_URL` *(para herramientas locales o migraciones)*

> **Nunca** publiques la service role en el cliente. Si en algún momento la guardaste temporalmente en DB para pruebas, **elimínala** de `app.config` y **rota** la llave en *Settings → API → Regenerate*.

---

## 2) Uploader con compresión selectiva (cliente)

**Archivo:** `src/lib/uploadAttachment.ts`
**Uso:** recibe `minuteId` y `File[]`, comprime imágenes y valida tamaños. Inserta fila en `public.attachment` tras cada subida.

**Tipos permitidos y límites (plan Free):**

* Imágenes (`image/*`): **≤ 1 MB** (se comprimen a **\~200–300 KB** y max 1600px)
* PDF, DOCX, XLSX: **≤ 1 MB**

> **Recomendado:** `npm i browser-image-compression`

**API principal:**

```ts
import { uploadAttachments } from '@/lib/uploadAttachment'
await uploadAttachments(minuteId, files)
```

**Componente de UI (ejemplo):** `src/components/AttachmentsList.tsx`

* Input `accept="image/*,.pdf,.docx,.xlsx,.doc,.xls"`
* Llama a `uploadAttachments(minuteId, files)`
* Lista objetos usando **URLs firmadas** (`createSignedUrl`) para mayor seguridad.

> Este README **no** repite el código completo. Ver archivos en `src/lib/uploadAttachment.ts` y `src/components/AttachmentsList.tsx` (ya agregados).

---

## 3) Políticas RLS mínimas (DB)

**storage.objects – INSERT (dueño puede subir)**

```sql
create policy if not exists "user_insert_own_storage_objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and exists (
    select 1
    from public.minute m
    where m.id::text = split_part(storage.filename(name), '/', 1)
      and m.created_by = auth.uid()
  )
);
```

**storage.objects – SELECT (dueño ve metadatos)**

```sql
create policy if not exists "user_select_own_storage_objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and exists (
    select 1
    from public.minute m
    where m.id::text = split_part(storage.filename(name), '/', 1)
      and m.created_by = auth.uid()
  )
);
```

**attachment – INSERT/SELECT (dueño)**

```sql
create policy if not exists "user_insert_own_attachment"
on public.attachment for insert to authenticated
with check (
  exists (
    select 1 from public.minute m
    where m.id = attachment.minute_id
      and m.created_by = auth.uid()
  )
);

create policy if not exists "user_select_own_attachment"
on public.attachment for select to authenticated
using (
  exists (
    select 1 from public.minute m
    where m.id = attachment.minute_id
      and m.created_by = auth.uid()
  )
);
```

> Admin de operaciones tiene SELECT global vía rol o política separada (ya existente en el proyecto).

---

## 4) Funciones de limpieza (DB)

### 4.1 `delete_storage_prefix_best_effort(p_minute_id uuid) → int`

* **Responsabilidad:** borrar **todos** los objetos `attachments/<minuteId>/*`.
* **Estrategia:**

  1. si existe `storage.delete_prefix(text,text)`, la invoca (borra binarios reales),
  2. hard delete en `storage.objects` para garantizar ausencia de metadatos.
* **Retorno:** cantidad de metadatos eliminados.

### 4.2 `cleanup_old_minutes_v4() → int`

* **Selecciona** minutas `is_protected=false` con `created_at < now() - interval 'retention_days days'`.
* Para cada una:

  1. `delete_storage_prefix_best_effort(id)`
  2. `DELETE FROM public.minute WHERE id = ...` (ON DELETE CASCADE → `attachment`)
* **Retorno:** número de minutas eliminadas en esa ejecución.

> Ambas funciones ya están creadas en la base. Si necesitas re-crearlas, usa los archivos versionados en `/supabase/sql/` (ver sección 8).

---

## 5) Cron diario (automatización)

**Programación:** 02:05 UTC (id `daily_cleanup_minutes`).

```sql
select cron.unschedule('daily_cleanup_minutes');
select cron.schedule(
  'daily_cleanup_minutes',
  '5 2 * * *',
  $$ select public.cleanup_old_minutes_v4(); $$
);
```

**Verificar estado del cron**

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'daily_cleanup_minutes';

select *
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname='daily_cleanup_minutes')
order by start_time desc
limit 10;
```

---

## 6) Prueba E2E (rápida) sobre una minuta existente

> Úsala para QA sin esperar 35 días.

**A) Snapshot inicial**

```sql
select m.id, m.created_at, m.is_protected, count(a.id) files
from public.minute m
left join public.attachment a on a.minute_id = m.id
where m.id = 'MINUTE_UUID'
group by m.id, m.created_at, m.is_protected;

select name
from storage.objects
where bucket_id = (select value from app.config where key='attachments_bucket')
  and name like 'MINUTE_UUID/%';
```

**B) Convertir en candidata (>35d) y desproteger**

```sql
update public.minute
set is_protected=false,
    created_at = now() - interval '40 days'
where id = 'MINUTE_UUID';
```

**C) Ejecutar limpieza**

```sql
select public.cleanup_old_minutes_v4();
```

**D) Verificaciones finales**

```sql
select name
from storage.objects
where bucket_id = (select value from app.config where key='attachments_bucket')
  and name like 'MINUTE_UUID/%';

select 1 from public.minute where id='MINUTE_UUID';
select 1 from public.attachment where minute_id='MINUTE_UUID';
```

> Resultado esperado: **0 filas** en Storage y DB.

---

## 7) Consultas útiles (operación)

**Minutas con adjuntos (DB)**

```sql
select m.id, m.created_at, m.created_by_name, count(a.id) attachments
from public.minute m
join public.attachment a on a.minute_id = m.id
group by m.id, m.created_at, m.created_by_name
order by m.created_at desc
limit 20;
```

**Minutas con adjuntos en DB **o** en Storage**

```sql
with att as (
  select minute_id, count(*) cnt from public.attachment group by minute_id
),
stor as (
  select (split_part(name,'/',1))::uuid as minute_id, count(*) cnt
  from storage.objects
  where bucket_id = (select value from app.config where key='attachments_bucket')
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
  group by 1
)
select m.id, m.created_at, coalesce(att.cnt,0) attachment_rows, coalesce(stor.cnt,0) storage_objects
from public.minute m
left join att  on att.minute_id  = m.id
left join stor on stor.minute_id = m.id
where coalesce(att.cnt,0) > 0 or coalesce(stor.cnt,0) > 0
order by m.created_at desc;
```

**Uso total del bucket (si existe `metadata->>'size'`)**

```sql
select round(sum(coalesce(nullif((metadata->>'size'),'')::bigint,0))/1024.0/1024.0,2) as mb_total
from storage.objects
where bucket_id=(select value from app.config where key='attachments_bucket');
```

**Promedio por archivo (KB)**

```sql
select round(avg(coalesce(nullif((metadata->>'size'),'')::bigint))/1024.0,1) as avg_kb
from storage.objects
where bucket_id=(select value from app.config where key='attachments_bucket');
```

---

## 8) Migraciones / SQL versionado (sugerido)

Estructura recomendada en repo:

```
/supabase/sql/
  2025-01-10_policies_storage_attachment.sql
  2025-01-10_functions_delete_prefix_best_effort.sql
  2025-01-10_functions_cleanup_old_minutes_v4.sql
  2025-01-10_cron_schedule_cleanup.sql
/tests/
  e2e_cleanup_minute.sql
```

> Mantén comentarios extensos en cada archivo. Ejecuta en QA antes de Prod. **Backups** antes de cambios sensibles.

---

## 9) Seguridad y costos

* **Firmar URLs** al listar (ya implementado) → no expongas bucket público por defecto.
* **Compresión** de imágenes en cliente (objetivo **200–300 KB**); DOCX/XLSX ≤ 1 MB.
* **`is_protected`** para excluir minutas críticas del borrado.
* **Rotar llaves** si se compartieron durante pruebas.
* **Plan Free**: con 10 operarios × 8 adjuntos/día (L–V), 35 días es viable si el promedio ≲ **300 KB**/archivo.

---

## 10) Playbooks rápidos

**Forzar limpieza de una sola minuta**

```sql
select public.delete_storage_prefix_best_effort('MINUTE_UUID'::uuid);
delete from public.minute where id='MINUTE_UUID';
```

**Cambiar retención (temporal)**

```sql
update app.config set value='21', updated_at=now() where key='retention_days';
-- revertir
update app.config set value='35', updated_at=now() where key='retention_days';
```

**Revisar/activar cron**

```sql
-- ver
select jobid, jobname, schedule, active from cron.job where jobname='daily_cleanup_minutes';
-- reprogramar
select cron.unschedule('daily_cleanup_minutes');
select cron.schedule('daily_cleanup_minutes','5 2 * * *', $$ select public.cleanup_old_minutes_v4(); $$);
```

---

## 11) Git (muy importante)

Sube cada cambio en **commits pequeños** y mensajes claros:

* `feat(ui): uploader con compresión + signed urls`
* `feat(db): cleanup_old_minutes_v4 + cron`
* `chore(db): rls policies storage/attachment`
* `test(db): e2e limpieza por minute`
* `docs: actualizar README (operación y monitoreo)`

> **Regla de oro:** *configurar primero en QA, probar E2E, luego merge a main y desplegar*.

---

## 12) Roadmap opcional

* Previews (thumbnails) para imágenes.
* Tabla `_cleanup_log` para auditoría (minute\_id, deleted\_at, notes).
* Botón "Marcar como protegida" en UI.
* Métricas en un dashboard simple (suma de MB, avg KB, top minutas por peso).

---

**Fin.** Cualquier cambio de esquema o lógica de limpieza recuerda: **Git primero**, luego QA, luego Prod. ✔️
