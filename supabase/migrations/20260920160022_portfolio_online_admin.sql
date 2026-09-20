create extension if not exists pgcrypto;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.creations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) > 0),
  category text not null check (char_length(trim(category)) > 0),
  tags text[] not null default '{}',
  description text not null default '',
  animations text[] not null default '{}',
  featured boolean not null default false,
  featured_order integer,
  published boolean not null default true,
  created_at date not null default current_date,
  updated_at timestamptz not null default now(),
  software text,
  model_type text,
  version text,
  notes text,
  cover_image_path text,
  bbmodel_path text,
  bbmodel_filename text,
  bbmodel_size bigint,
  check (featured_order is null or featured_order >= 0),
  check (bbmodel_size is null or bbmodel_size >= 0)
);

create table public.creation_images (
  id uuid primary key default gen_random_uuid(),
  creation_id uuid not null references public.creations(id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now()
);

create index creation_images_creation_sort_idx
  on public.creation_images (creation_id, sort_order, created_at);

alter table public.admin_users enable row level security;
alter table public.creations enable row level security;
alter table public.creation_images enable row level security;

revoke all on public.admin_users from anon, authenticated;
revoke all on public.creations from anon, authenticated;
revoke all on public.creation_images from anon, authenticated;

grant select on public.admin_users to authenticated;
grant select on public.creations to anon, authenticated;
grant insert, update, delete on public.creations to authenticated;
grant select on public.creation_images to anon, authenticated;
grant insert, update, delete on public.creation_images to authenticated;

create policy "admin can identify self"
on public.admin_users
for select to authenticated
using ((select auth.uid()) = user_id);

create policy "published creations are public"
on public.creations
for select to anon, authenticated
using (published = true);

create policy "admin can read all creations"
on public.creations
for select to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert creations"
on public.creations
for insert to authenticated
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update creations"
on public.creations
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

create policy "admin can delete creations"
on public.creations
for delete to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "published creation images are public"
on public.creation_images
for select to anon, authenticated
using (
  exists (
    select 1 from public.creations c
    where c.id = creation_id and c.published = true
  )
);

create policy "admin can read all creation images"
on public.creation_images
for select to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert creation images"
on public.creation_images
for insert to authenticated
with check (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update creation images"
on public.creation_images
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

create policy "admin can delete creation images"
on public.creation_images
for delete to authenticated
using (
  exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('portfolio-renders', 'portfolio-renders', true, 10485760),
  ('bbmodels', 'bbmodels', false, 52428800)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "admin can read render objects"
on storage.objects
for select to authenticated
using (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert render objects"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update render objects"
on storage.objects
for update to authenticated
using (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete render objects"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'portfolio-renders'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can read bbmodels"
on storage.objects
for select to authenticated
using (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can insert bbmodels"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can update bbmodels"
on storage.objects
for update to authenticated
using (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

create policy "admin can delete bbmodels"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'bbmodels'
  and exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);
