-- 20251028_00_create_admin_minutes_page_v2.sql
-- -------------------------------------------------------------------
-- Migración: crea/reemplaza función admin_minutes_page_v2
-- Objetivo: devolver todas las minutas con conteo de adjuntos en un solo
-- llamado, serializando attachments como JSON y calculando attachments_count.
-- -------------------------------------------------------------------

create or replace function public.admin_minutes_page_v2(
  p_from date,   -- Fecha inicial (inclusive), formato 'YYYY-MM-DD'
  p_to   date    -- Fecha final (inclusive), formato 'YYYY-MM-DD'
)
returns table (
  id                 uuid,       -- ID único de la minuta
  user_id            uuid,       -- UUID del autor
  created_at         timestamp,  -- Fecha/hora de creación
  title              text,       -- Título de la minuta
  content            text,       -- Contenido de la minuta
  attachments        jsonb,      -- Array JSON de IDs de adjuntos
  attachments_count  int         -- Número de adjuntos
  -- Aquí podrías añadir más columnas calculadas...
) as $$
begin
  return query
  select
    m.id,
    m.user_id,
    m.created_at,
    m.title,
    m.content,

    -- Agrega los IDs de attachments como array JSON (vacío si no hay)
    coalesce(att.attachment_list, '[]')::jsonb      as attachments,

    -- Cuenta automáticamente cuántos elementos hay en ese JSON
    jsonb_array_length(coalesce(att.attachment_list, '[]')) 
                                                     as attachments_count

  from public.minute m

  -- LATERAL: para ejecutar el sub-select por cada fila de minute
  left join lateral (
    select
      jsonb_agg(a.id order by a.id) as attachment_list
    from public.attachments a
    where a.minute_id = m.id
  ) att on true

  -- Filtro de rango de fechas
  where m.created_at between p_from and p_to

  -- Orden descendente para ver primero las minutas más recientes
  order by m.created_at desc;
end;
$$ language plpgsql
   security definer;  -- permite que todos los roles públicos la ejecuten
