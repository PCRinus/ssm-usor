export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          address_line: string | null;
          archived_at: string | null;
          caen_code: string | null;
          county_code: string | null;
          created_at: string;
          created_by: string | null;
          cui: string;
          declared_employee_count: number | null;
          id: string;
          legal_name: string;
          legal_representative_name: string | null;
          locality: string | null;
          organization_id: string;
          trade_register_number: string | null;
          updated_at: string;
          vat_payer: boolean;
        };
        Insert: {
          address_line?: string | null;
          archived_at?: string | null;
          caen_code?: string | null;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          cui: string;
          declared_employee_count?: number | null;
          id?: string;
          legal_name: string;
          legal_representative_name?: string | null;
          locality?: string | null;
          organization_id: string;
          trade_register_number?: string | null;
          updated_at?: string;
          vat_payer?: boolean;
        };
        Update: {
          address_line?: string | null;
          archived_at?: string | null;
          caen_code?: string | null;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          cui?: string;
          declared_employee_count?: number | null;
          id?: string;
          legal_name?: string;
          legal_representative_name?: string | null;
          locality?: string | null;
          organization_id?: string;
          trade_register_number?: string | null;
          updated_at?: string;
          vat_payer?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'clients_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      employees: {
        Row: {
          archived_at: string | null;
          birth_date: string | null;
          birth_place: string | null;
          blood_group: string | null;
          client_id: string;
          cnp: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          employee_number: string | null;
          first_name: string;
          hired_at: string;
          home_address: string | null;
          id: string;
          job_title: string;
          last_name: string;
          notes: string | null;
          organization_id: string;
          phone: string | null;
          rh_factor: string | null;
          status: Database['public']['Enums']['employee_status'];
          terminated_at: string | null;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          blood_group?: string | null;
          client_id: string;
          cnp?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          employee_number?: string | null;
          first_name: string;
          hired_at: string;
          home_address?: string | null;
          id?: string;
          job_title: string;
          last_name: string;
          notes?: string | null;
          organization_id: string;
          phone?: string | null;
          rh_factor?: string | null;
          status?: Database['public']['Enums']['employee_status'];
          terminated_at?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          blood_group?: string | null;
          client_id?: string;
          cnp?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          employee_number?: string | null;
          first_name?: string;
          hired_at?: string;
          home_address?: string | null;
          id?: string;
          job_title?: string;
          last_name?: string;
          notes?: string | null;
          organization_id?: string;
          phone?: string | null;
          rh_factor?: string | null;
          status?: Database['public']['Enums']['employee_status'];
          terminated_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'employees_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'employees_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'employees_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      impersonations: {
        Row: {
          admin_user_id: string;
          ended_at: string | null;
          expires_at: string;
          id: string;
          reason: string | null;
          started_at: string;
          target_user_id: string;
        };
        Insert: {
          admin_user_id: string;
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          reason?: string | null;
          started_at?: string;
          target_user_id: string;
        };
        Update: {
          admin_user_id?: string;
          ended_at?: string | null;
          expires_at?: string;
          id?: string;
          reason?: string | null;
          started_at?: string;
          target_user_id?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          created_at: string;
          organization_id: string;
          role: Database['public']['Enums']['organization_role'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          organization_id: string;
          role?: Database['public']['Enums']['organization_role'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          organization_id?: string;
          role?: Database['public']['Enums']['organization_role'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_membership: {
        Args: never;
        Returns: {
          organization_id: string;
          role: Database['public']['Enums']['organization_role'];
          user_id: string;
        }[];
      };
      current_organization_id: { Args: never; Returns: string };
      effective_user_id: { Args: never; Returns: string };
      is_platform_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      employee_status: 'active' | 'terminated';
      organization_role: 'owner' | 'specialist';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      employee_status: ['active', 'terminated'],
      organization_role: ['owner', 'specialist'],
    },
  },
} as const;
