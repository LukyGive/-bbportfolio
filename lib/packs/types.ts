import type { Creation } from '@/lib/creations/types';

export type Pack = {
  id: string;
  slug: string;
  name: string;
  description: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  coverImage?: string;
  creations: Creation[];
};

export type AdminPack = Omit<Pack, 'creations'> & {
  orderedCreationIds: string[];
  memberCount: number;
};

export type PackInput = {
  slug?: string;
  name: string;
  description: string;
  published: boolean;
  orderedCreationIds: string[];
};

export type PackStat = {
  label: string;
  count: number;
};
export type PackStat = { label: string; count: number };
