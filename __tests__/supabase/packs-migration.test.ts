import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20260921131000_pack_collections.sql', 'utf8');

describe('pack collections migration', () => {
  it('creates many-to-many pack membership with cascade cleanup and ordered rows', () => {
    expect(sql).toMatch(/create table public\.packs/i);
    expect(sql).toMatch(/slug text not null unique/i);
    expect(sql).toMatch(/create table public\.pack_creations/i);
    expect(sql).toMatch(/pack_id uuid not null references public\.packs\(id\) on delete cascade/i);
    expect(sql).toMatch(/creation_id uuid not null references public\.creations\(id\) on delete cascade/i);
    expect(sql).toMatch(/primary key \(pack_id, creation_id\)/i);
    expect(sql).toMatch(/sort_order integer not null default 0 check \(sort_order >= 0\)/i);
  });

  it('keeps public reads publication-safe and admin writes restricted', () => {
    expect(sql).toMatch(/published packs are public/i);
    expect(sql).toMatch(/published pack creations are public/i);
    expect(sql).toMatch(/c\.published = true/i);
    expect(sql).toMatch(/p\.published = true/i);
    expect(sql).toMatch(/admin can insert packs/i);
    expect(sql).toMatch(/admin can update pack creations/i);
    expect(sql).toMatch(/admin can delete pack creations/i);
  });

  it('replaces ordered memberships inside one postgres function call', () => {
    expect(sql).toMatch(/function public\.replace_pack_creations/i);
    expect(sql).toMatch(/with ordinality/i);
    expect(sql).toMatch(/duplicate creation ids are not allowed/i);
  });
});
