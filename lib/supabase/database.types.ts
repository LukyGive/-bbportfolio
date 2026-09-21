export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      admin_users: {
        Row: { created_at: string; user_id: string };
        Insert: { created_at?: string; user_id: string };
        Update: { created_at?: string; user_id?: string };
        Relationships: [];
      };
      creation_images: {
        Row: {
          alt_text: string;
          created_at: string;
          creation_id: string;
          id: string;
          sort_order: number;
          storage_path: string;
        };
        Insert: {
          alt_text?: string;
          created_at?: string;
          creation_id: string;
          id?: string;
          sort_order?: number;
          storage_path: string;
        };
        Update: {
          alt_text?: string;
          created_at?: string;
          creation_id?: string;
          id?: string;
          sort_order?: number;
          storage_path?: string;
        };
        Relationships: [{
          foreignKeyName: 'creation_images_creation_id_fkey';
          columns: ['creation_id'];
          isOneToOne: false;
          referencedRelation: 'creations';
          referencedColumns: ['id'];
        }];
      };
      creations: {
        Row: {
          animations: string[];
          bbmodel_filename: string | null;
          bbmodel_path: string | null;
          bbmodel_size: number | null;
          category: string;
          cover_image_path: string | null;
          created_at: string;
          description: string;
          featured: boolean;
          featured_order: number | null;
          id: string;
          model_type: string | null;
          name: string;
          notes: string | null;
          published: boolean;
          slug: string;
          software: string | null;
          tags: string[];
          updated_at: string;
          version: string | null;
          viewer_animation_names: string[];
          viewer_error: string | null;
          viewer_model_path: string | null;
          viewer_status: string;
          viewer_updated_at: string | null;
        };
        Insert: {
          animations?: string[];
          bbmodel_filename?: string | null;
          bbmodel_path?: string | null;
          bbmodel_size?: number | null;
          category: string;
          cover_image_path?: string | null;
          created_at?: string;
          description?: string;
          featured?: boolean;
          featured_order?: number | null;
          id?: string;
          model_type?: string | null;
          name: string;
          notes?: string | null;
          published?: boolean;
          slug: string;
          software?: string | null;
          tags?: string[];
          updated_at?: string;
          version?: string | null;
          viewer_animation_names?: string[];
          viewer_error?: string | null;
          viewer_model_path?: string | null;
          viewer_status?: string;
          viewer_updated_at?: string | null;
        };
        Update: {
          animations?: string[];
          bbmodel_filename?: string | null;
          bbmodel_path?: string | null;
          bbmodel_size?: number | null;
          category?: string;
          cover_image_path?: string | null;
          created_at?: string;
          description?: string;
          featured?: boolean;
          featured_order?: number | null;
          id?: string;
          model_type?: string | null;
          name?: string;
          notes?: string | null;
          published?: boolean;
          slug?: string;
          software?: string | null;
          tags?: string[];
          updated_at?: string;
          version?: string | null;
          viewer_animation_names?: string[];
          viewer_error?: string | null;
          viewer_model_path?: string | null;
          viewer_status?: string;
          viewer_updated_at?: string | null;
        };
        Relationships: [];
      };
      pack_creations: {
        Row: {
          creation_id: string;
          pack_id: string;
          sort_order: number;
        };
        Insert: {
          creation_id: string;
          pack_id: string;
          sort_order?: number;
        };
        Update: {
          creation_id?: string;
          pack_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'pack_creations_creation_id_fkey';
            columns: ['creation_id'];
            isOneToOne: false;
            referencedRelation: 'creations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pack_creations_pack_id_fkey';
            columns: ['pack_id'];
            isOneToOne: false;
            referencedRelation: 'packs';
            referencedColumns: ['id'];
          },
        ];
      };
      packs: {
        Row: {
          cover_image_path: string | null;
          created_at: string;
          description: string;
          id: string;
          name: string;
          published: boolean;
          slug: string;
          updated_at: string;
        };
        Insert: {
          cover_image_path?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          published?: boolean;
          slug: string;
          updated_at?: string;
        };
        Update: {
          cover_image_path?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          published?: boolean;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      replace_pack_creations: {
        Args: { target_pack_id: string; ordered_creation_ids: string[] };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
