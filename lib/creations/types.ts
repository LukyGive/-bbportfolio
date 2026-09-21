export type ViewerInfo = {
  modelUrl: string;
  animationNames: string[];
  format: 'bbpreview' | 'glb';
};

export type ViewerStatus = 'none' | 'processing' | 'ready' | 'error';

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
  viewer?: ViewerInfo;
};

export type AdminCreation = Creation & {
  galleryImages: AdminGalleryImage[];
  bbmodel?: {
    filename: string;
    size: number;
  };
  viewerStatus: ViewerStatus;
  viewerError?: string;
  viewerUpdatedAt?: string;
};

export type CreationInput = Omit<Creation, 'id' | 'slug' | 'createdAt' | 'viewer'> & {
  id?: string;
  slug?: string;
  createdAt?: string;
};

export type AdminGalleryImage = {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
};
