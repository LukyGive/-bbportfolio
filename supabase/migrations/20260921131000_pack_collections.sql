create table public.packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) > 0),
  description text not null default '',
  cover_image_path text,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pack_creations (
  pack_id uuid not null references public.packs(id) on delete cascade,
  creation_id uuid not null references public.creations(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (pack_id, creation_id)
);

create index pack_creations_pack_sort_idx
  on public.pack_creations (pack_id, sort_order, creation_id);

create index pack_creations_creation_idx
  on public.pack_creations (creation_id);

alter table public.packs enable row level security;
alter table public.pack_creations enable row level security;

revoke all on public.packs from anon, authenticated;
revoke all on public.pack_creations from anon, authenticated;

grant select on public.packs to anon, authenticated;
grant insert, update, delete on public.packs to authenticated;
grant select on public.pack_creations to anon, authenticated;
grant insert, update, delete on public.pack_creations to authenticated;

create policy "published packs are public"
on public.packs
for select to anon, authenticated
using (published = true);

create policy "admin can read all packs"
on public.packs
for select to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert packs"
on public.packs
for insert to authenticated
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update packs"
on public.packs
for update to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete packs"
on public.packs
for delete to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "published pack creations are public"
on public.pack_creations
for select to anon, authenticated
using (
  exists (
    select 1 from public.packs p
    where p.id = pack_id and p.published = true
  )
  and exists (
    select 1 from public.creations c
    where c.id = creation_id and c.published = true
  )
);

create policy "admin can read all pack creations"
on public.pack_creations
for select to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert pack creations"
on public.pack_creations
for insert to authenticated
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update pack creations"
on public.pack_creations
for update to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete pack creations"
on public.pack_creations
for delete to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create or replace function public.replace_pack_creations(
  target_pack_id uuid,
  ordered_creation_ids uuid[]
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from unnest(coalesce(ordered_creation_ids, '{}'::uuid[])) as ids(id)
    group by id
    having count(*) > 1
  ) then
    raise exception 'Duplicate creation ids are not allowed.' using errcode = '22023';
  end if;

  delete from public.pack_creations
  where pack_id = target_pack_id;

  insert into public.pack_creations (pack_id, creation_id, sort_order)
  select target_pack_id, member.creation_id, (member.ordinality - 1)::integer
  from unnest(coalesce(ordered_creation_ids, '{}'::uuid[]))
    with ordinality as member(creation_id, ordinality);
end;
$$;

revoke all on function public.replace_pack_creations(uuid, uuid[]) from public;
grant execute on function public.replace_pack_creations(uuid, uuid[]) to authenticated;
