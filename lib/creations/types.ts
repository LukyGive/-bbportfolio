export type Creation = {
  id: string;
  slug: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  coverImage: string;
  images: string[];
  animations: string[];
  featured: boolean;
  featuredOrder?: number;
  published: boolean;
  createdAt: string;
  software?: string;
  modelType?: string;
  version?: string;
  notes?: string;
};

export type CreationInput = Omit<Creation, 'id' | 'slug' | 'createdAt'> & {
  id?: string;
  slug?: string;
  createdAt?: string;
};
