export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      folders: {
        Row: {
          created_at: string;
          csv_source_name: string | null;
          id: number;
          kind: Database["public"]["Enums"]["folder_kind"];
          last_added_at: string | null;
          name: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          csv_source_name?: string | null;
          id?: never;
          kind?: Database["public"]["Enums"]["folder_kind"];
          last_added_at?: string | null;
          name: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          csv_source_name?: string | null;
          id?: never;
          kind?: Database["public"]["Enums"]["folder_kind"];
          last_added_at?: string | null;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      import_failures: {
        Row: {
          id: number;
          job_id: number;
          product_name: string | null;
          reason: Database["public"]["Enums"]["import_fail_reason"];
          row_number: number;
          source_folder_name: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          job_id: number;
          product_name?: string | null;
          reason: Database["public"]["Enums"]["import_fail_reason"];
          row_number: number;
          source_folder_name?: string | null;
          user_id: string;
        };
        Update: {
          id?: never;
          job_id?: number;
          product_name?: string | null;
          reason?: Database["public"]["Enums"]["import_fail_reason"];
          row_number?: number;
          source_folder_name?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_failures_job_id_user_id_fkey";
            columns: ["job_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "import_jobs";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "import_failures_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      import_jobs: {
        Row: {
          duplicate_count: number;
          failed_count: number;
          finished_at: string | null;
          id: number;
          request_id: string;
          result: Json | null;
          started_at: string;
          status: Database["public"]["Enums"]["import_status"];
          success_count: number;
          total_count: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          duplicate_count?: number;
          failed_count?: number;
          finished_at?: string | null;
          id?: never;
          request_id: string;
          result?: Json | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["import_status"];
          success_count?: number;
          total_count: number;
          user_id: string;
        };
        Update: {
          duplicate_count?: number;
          failed_count?: number;
          finished_at?: string | null;
          id?: never;
          request_id?: string;
          result?: Json | null;
          started_at?: string;
          status?: Database["public"]["Enums"]["import_status"];
          success_count?: number;
          total_count?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_jobs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      legal_policies: {
        Row: {
          created_at: string;
          document_url: string;
          effective_at: string;
          id: number;
          kind: string;
          requires_reconsent: boolean;
          version: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          document_url: string;
          effective_at: string;
          id?: never;
          kind: string;
          requires_reconsent?: boolean;
          version: string;
        };
        Update: {
          created_at?: string;
          document_url?: string;
          effective_at?: string;
          id?: never;
          kind?: string;
          requires_reconsent?: boolean;
          version?: string;
        };
        Relationships: [];
      };
      product_folders: {
        Row: {
          created_at: string;
          folder_id: number;
          product_id: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          folder_id: number;
          product_id: number;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          folder_id?: number;
          product_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_folders_folder_fkey";
            columns: ["folder_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id", "user_id"];
          },
          {
            foreignKeyName: "product_folders_product_fkey";
            columns: ["product_id", "user_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      products: {
        Row: {
          brand: string | null;
          created_at: string;
          id: number;
          image_url: string | null;
          name: string;
          price: number | null;
          saved_at: string;
          updated_at: string;
          url: string;
          user_id: string;
          wish_level: Database["public"]["Enums"]["wish_level"] | null;
        };
        ComputedFields: never;
        Insert: {
          brand?: string | null;
          created_at?: string;
          id?: never;
          image_url?: string | null;
          name: string;
          price?: number | null;
          saved_at?: string;
          updated_at?: string;
          url: string;
          user_id?: string;
          wish_level?: Database["public"]["Enums"]["wish_level"] | null;
        };
        Update: {
          brand?: string | null;
          created_at?: string;
          id?: never;
          image_url?: string | null;
          name?: string;
          price?: number | null;
          saved_at?: string;
          updated_at?: string;
          url?: string;
          user_id?: string;
          wish_level?: Database["public"]["Enums"]["wish_level"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          id: string;
          nickname: string;
          restricted_until: string | null;
          status: Database["public"]["Enums"]["account_status"];
          suspended_at: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          id: string;
          nickname: string;
          restricted_until?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          suspended_at?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          id?: string;
          nickname?: string;
          restricted_until?: string | null;
          status?: Database["public"]["Enums"]["account_status"];
          suspended_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          id: number;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: never;
          platform: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: never;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_policy: { Args: { target_policy_id: number }; Returns: undefined };
      get_pending_policies: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          document_url: string;
          effective_at: string;
          id: number;
          kind: string;
          requires_reconsent: boolean;
          version: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "legal_policies";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      import_csv: { Args: { import_plan: Json; request_id: string }; Returns: Json };
      register_push_token: {
        Args: { new_platform: string; new_token: string };
        Returns: undefined;
      };
      save_product: {
        Args: {
          folder_ids?: number[];
          product_brand?: string;
          product_image_url?: string;
          product_name: string;
          product_price?: number;
          product_url: string;
          product_wish_level?: Database["public"]["Enums"]["wish_level"];
        };
        Returns: {
          is_duplicate: boolean;
          product_id: number;
        }[];
      };
      set_avatar: { Args: { new_path: string }; Returns: undefined };
      set_owned: {
        Args: {
          is_owned: boolean;
          keep_other_folders?: boolean;
          new_wish_level?: Database["public"]["Enums"]["wish_level"];
          target_product_id: number;
        };
        Returns: undefined;
      };
      update_nickname: { Args: { new_nickname: string }; Returns: string };
    };
    Enums: {
      account_status: "active" | "warning" | "community_restricted" | "suspended";
      folder_kind: "custom" | "owned";
      import_fail_reason:
        | "EMPTY_PRODUCT_NAME"
        | "EMPTY_PRODUCT_URL"
        | "INVALID_PRODUCT_URL"
        | "CSV_ROW_PARSE_ERROR"
        | "INVALID_PRODUCT_DATA"
        | "FOLDER_LIMIT_EXCEEDED"
        | "FOLDER_SAVE_FAILED";
      import_status: "processing" | "completed" | "failed";
      wish_level: "high" | "medium" | "low";
      withdrawal_reason:
        "rarely_used" | "missing_feature" | "other_service" | "hard_to_use" | "frequent_error";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["active", "warning", "community_restricted", "suspended"],
      folder_kind: ["custom", "owned"],
      import_fail_reason: [
        "EMPTY_PRODUCT_NAME",
        "EMPTY_PRODUCT_URL",
        "INVALID_PRODUCT_URL",
        "CSV_ROW_PARSE_ERROR",
        "INVALID_PRODUCT_DATA",
        "FOLDER_LIMIT_EXCEEDED",
        "FOLDER_SAVE_FAILED",
      ],
      import_status: ["processing", "completed", "failed"],
      wish_level: ["high", "medium", "low"],
      withdrawal_reason: [
        "rarely_used",
        "missing_feature",
        "other_service",
        "hard_to_use",
        "frequent_error",
      ],
    },
  },
} as const;
