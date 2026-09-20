drop policy if exists "published creations are public" on public.creations;
drop policy if exists "admin can read all creations" on public.creations;

create policy "published creations are public"
on public.creations
for select to anon
using (published = true);

create policy "authenticated can read published or admin all"
on public.creations
for select to authenticated
using (
  published = true
  or exists (
    select 1 from public.admin_users au
    where au.user_id = (select auth.uid())
  )
);

drop policy if exists "published creation images are public" on public.creation_images;
drop policy if exists "admin can read all creation images" on public.creation_images;

create policy "published creation images are public"
on public.creation_images
for select to anon
using (
  exists (
    select 1 from public.creations c
    where c.id = creation_id and c.published = true
  )
);

create policy "authenticated can read published images or admin all"
on public.creation_images
for select to authenticated
using (
  exists (
    select 1 from public.creations c
    where c.id = creation_id
      and (
        c.published = true
        or exists (
          select 1 from public.admin_users au
          where au.user_id = (select auth.uid())
        )
      )
  )
);
