export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      client_documents: {
        Row: {
          client_id: string;
          created_at: string;
          created_by: string | null;
          decision_number: number | null;
          document_group: Database['public']['Enums']['document_group'];
          id: string;
          organization_id: string;
          owners_only: boolean;
          title: string;
          type_key: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          decision_number?: number | null;
          document_group?: Database['public']['Enums']['document_group'];
          id?: string;
          organization_id: string;
          owners_only?: boolean;
          title: string;
          type_key: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          decision_number?: number | null;
          document_group?: Database['public']['Enums']['document_group'];
          id?: string;
          organization_id?: string;
          owners_only?: boolean;
          title?: string;
          type_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_documents_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'client_documents_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_owner_notes: {
        Row: {
          body: string;
          client_id: string;
          created_at: string;
          organization_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body: string;
          client_id: string;
          created_at?: string;
          organization_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body?: string;
          client_id?: string;
          created_at?: string;
          organization_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_owner_notes_client_fkey';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'client_owner_notes_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_responsible_persons: {
        Row: {
          archived_at: string | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          employee_id: string | null;
          full_name: string;
          id: string;
          job_title: string;
          organization_id: string;
          roles: Database['public']['Enums']['responsible_person_role'][];
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          employee_id?: string | null;
          full_name: string;
          id?: string;
          job_title: string;
          organization_id: string;
          roles: Database['public']['Enums']['responsible_person_role'][];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          employee_id?: string | null;
          full_name?: string;
          id?: string;
          job_title?: string;
          organization_id?: string;
          roles?: Database['public']['Enums']['responsible_person_role'][];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_responsible_persons_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_responsible_persons_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'client_responsible_persons_employee_of_client';
            columns: ['employee_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'employees';
            referencedColumns: ['id', 'client_id'];
          },
          {
            foreignKeyName: 'client_responsible_persons_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_workplaces: {
        Row: {
          address_line: string | null;
          archived_at: string | null;
          client_id: string;
          county_code: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          is_registered_office: boolean;
          locality: string | null;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          address_line?: string | null;
          archived_at?: string | null;
          client_id: string;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_registered_office?: boolean;
          locality?: string | null;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          address_line?: string | null;
          archived_at?: string | null;
          client_id?: string;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_registered_office?: boolean;
          locality?: string | null;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_workplaces_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'client_workplaces_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'client_workplaces_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      clients: {
        Row: {
          address_line: string | null;
          administrative_training_interval_months: number | null;
          administrative_training_not_applicable: boolean;
          archived_at: string | null;
          caen_code: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          county_code: string | null;
          created_at: string;
          created_by: string | null;
          cui: string;
          declared_employee_count: number | null;
          id: string;
          legal_name: string;
          legal_representative_name: string | null;
          legal_representative_role: string | null;
          locality: string | null;
          organization_id: string;
          periodic_training_minutes: number | null;
          promoted_at: string | null;
          promoted_by: string | null;
          stage: Database['public']['Enums']['client_stage'];
          trade_register_number: string | null;
          training_day_from: number | null;
          training_day_to: number | null;
          training_first_month: number | null;
          updated_at: string;
          vat_payer: boolean;
          worker_training_interval_months: number | null;
          worker_training_not_applicable: boolean;
        };
        Insert: {
          address_line?: string | null;
          administrative_training_interval_months?: number | null;
          administrative_training_not_applicable?: boolean;
          archived_at?: string | null;
          caen_code?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          cui: string;
          declared_employee_count?: number | null;
          id?: string;
          legal_name: string;
          legal_representative_name?: string | null;
          legal_representative_role?: string | null;
          locality?: string | null;
          organization_id: string;
          periodic_training_minutes?: number | null;
          promoted_at?: string | null;
          promoted_by?: string | null;
          stage?: Database['public']['Enums']['client_stage'];
          trade_register_number?: string | null;
          training_day_from?: number | null;
          training_day_to?: number | null;
          training_first_month?: number | null;
          updated_at?: string;
          vat_payer?: boolean;
          worker_training_interval_months?: number | null;
          worker_training_not_applicable?: boolean;
        };
        Update: {
          address_line?: string | null;
          administrative_training_interval_months?: number | null;
          administrative_training_not_applicable?: boolean;
          archived_at?: string | null;
          caen_code?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          cui?: string;
          declared_employee_count?: number | null;
          id?: string;
          legal_name?: string;
          legal_representative_name?: string | null;
          legal_representative_role?: string | null;
          locality?: string | null;
          organization_id?: string;
          periodic_training_minutes?: number | null;
          promoted_at?: string | null;
          promoted_by?: string | null;
          stage?: Database['public']['Enums']['client_stage'];
          trade_register_number?: string | null;
          training_day_from?: number | null;
          training_day_to?: number | null;
          training_first_month?: number | null;
          updated_at?: string;
          vat_payer?: boolean;
          worker_training_interval_months?: number | null;
          worker_training_not_applicable?: boolean;
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
      document_generations: {
        Row: {
          client_id: string;
          created_at: string;
          created_by: string | null;
          first_decision_number: number;
          id: string;
          issue_date: string;
          organization_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          first_decision_number?: number;
          id?: string;
          issue_date: string;
          organization_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          first_decision_number?: number;
          id?: string;
          issue_date?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_generations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_generations_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'document_generations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      document_revisions: {
        Row: {
          created_at: string;
          created_by: string | null;
          data_snapshot: Json | null;
          document_id: string;
          docx_path: string;
          docx_sha256: string | null;
          edited_at: string | null;
          edited_by: string | null;
          generation_id: string | null;
          id: string;
          issued_at: string | null;
          issued_by: string | null;
          organization_id: string;
          pdf_path: string | null;
          pdf_sha256: string | null;
          revision: number;
          status: Database['public']['Enums']['document_revision_status'];
          superseded_at: string | null;
          template_version_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          data_snapshot?: Json | null;
          document_id: string;
          docx_path: string;
          docx_sha256?: string | null;
          edited_at?: string | null;
          edited_by?: string | null;
          generation_id?: string | null;
          id?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          organization_id: string;
          pdf_path?: string | null;
          pdf_sha256?: string | null;
          revision: number;
          status?: Database['public']['Enums']['document_revision_status'];
          superseded_at?: string | null;
          template_version_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          data_snapshot?: Json | null;
          document_id?: string;
          docx_path?: string;
          docx_sha256?: string | null;
          edited_at?: string | null;
          edited_by?: string | null;
          generation_id?: string | null;
          id?: string;
          issued_at?: string | null;
          issued_by?: string | null;
          organization_id?: string;
          pdf_path?: string | null;
          pdf_sha256?: string | null;
          revision?: number;
          status?: Database['public']['Enums']['document_revision_status'];
          superseded_at?: string | null;
          template_version_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_revisions_document_in_organization';
            columns: ['document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'client_documents';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'document_revisions_generation_id_fkey';
            columns: ['generation_id'];
            isOneToOne: false;
            referencedRelation: 'document_generations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_revisions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_revisions_template_version_id_fkey';
            columns: ['template_version_id'];
            isOneToOne: false;
            referencedRelation: 'document_template_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      document_signed_copies: {
        Row: {
          document_id: string;
          organization_id: string;
          revision_id: string;
          sha256: string;
          storage_path: string;
          uploaded_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          document_id: string;
          organization_id: string;
          revision_id: string;
          sha256: string;
          storage_path: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          document_id?: string;
          organization_id?: string;
          revision_id?: string;
          sha256?: string;
          storage_path?: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_signed_copies_document_fkey';
            columns: ['document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'client_documents';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'document_signed_copies_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_signed_copies_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: true;
            referencedRelation: 'document_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      document_template_versions: {
        Row: {
          created_at: string;
          id: string;
          sha256: string;
          storage_path: string;
          template_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          sha256: string;
          storage_path: string;
          template_id: string;
          version: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          sha256?: string;
          storage_path?: string;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_template_versions_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'document_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      document_templates: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string | null;
          title: string;
          type_key: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          title: string;
          type_key: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string | null;
          title?: string;
          type_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_templates_organization_id_fkey';
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
          job_position_id: string;
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
          job_position_id: string;
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
          job_position_id?: string;
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
            foreignKeyName: 'employees_job_position_in_client';
            columns: ['job_position_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'job_positions';
            referencedColumns: ['id', 'client_id'];
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
      job_positions: {
        Row: {
          activities: string | null;
          archived_at: string | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          organization_id: string;
          staff_category: Database['public']['Enums']['staff_category'];
          training_interval_months: number | null;
          updated_at: string;
          work_zone: string | null;
        };
        Insert: {
          activities?: string | null;
          archived_at?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          staff_category?: Database['public']['Enums']['staff_category'];
          training_interval_months?: number | null;
          updated_at?: string;
          work_zone?: string | null;
        };
        Update: {
          activities?: string | null;
          archived_at?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          staff_category?: Database['public']['Enums']['staff_category'];
          training_interval_months?: number | null;
          updated_at?: string;
          work_zone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'job_positions_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_positions_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'job_positions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organization_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          revoked_at: string | null;
          role: Database['public']['Enums']['organization_role'];
          sent_at: string | null;
          token_hash: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          role?: Database['public']['Enums']['organization_role'];
          sent_at?: string | null;
          token_hash?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          revoked_at?: string | null;
          role?: Database['public']['Enums']['organization_role'];
          sent_at?: string | null;
          token_hash?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_invitations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
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
          address_line: string | null;
          authorization_certificate_date: string | null;
          authorization_certificate_issuer: string | null;
          authorization_certificate_number: string | null;
          bank_name: string | null;
          county_code: string | null;
          created_at: string;
          cui: string | null;
          fire_safety_technician_certificate: string | null;
          fire_safety_technician_name: string | null;
          iban: string | null;
          id: string;
          legal_name: string | null;
          legal_representative_name: string | null;
          legal_representative_role: string | null;
          locality: string | null;
          name: string;
          phone: string | null;
          terms_accepted_at: string | null;
          terms_accepted_by: string | null;
          terms_version: string | null;
          trade_register_number: string | null;
          updated_at: string;
          vat_payer: boolean;
        };
        Insert: {
          address_line?: string | null;
          authorization_certificate_date?: string | null;
          authorization_certificate_issuer?: string | null;
          authorization_certificate_number?: string | null;
          bank_name?: string | null;
          county_code?: string | null;
          created_at?: string;
          cui?: string | null;
          fire_safety_technician_certificate?: string | null;
          fire_safety_technician_name?: string | null;
          iban?: string | null;
          id?: string;
          legal_name?: string | null;
          legal_representative_name?: string | null;
          legal_representative_role?: string | null;
          locality?: string | null;
          name: string;
          phone?: string | null;
          terms_accepted_at?: string | null;
          terms_accepted_by?: string | null;
          terms_version?: string | null;
          trade_register_number?: string | null;
          updated_at?: string;
          vat_payer?: boolean;
        };
        Update: {
          address_line?: string | null;
          authorization_certificate_date?: string | null;
          authorization_certificate_issuer?: string | null;
          authorization_certificate_number?: string | null;
          bank_name?: string | null;
          county_code?: string | null;
          created_at?: string;
          cui?: string | null;
          fire_safety_technician_certificate?: string | null;
          fire_safety_technician_name?: string | null;
          iban?: string | null;
          id?: string;
          legal_name?: string | null;
          legal_representative_name?: string | null;
          legal_representative_role?: string | null;
          locality?: string | null;
          name?: string;
          phone?: string | null;
          terms_accepted_at?: string | null;
          terms_accepted_by?: string | null;
          terms_version?: string | null;
          trade_register_number?: string | null;
          updated_at?: string;
          vat_payer?: boolean;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          professional_title: string | null;
          terms_accepted_at: string | null;
          terms_version: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          professional_title?: string | null;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          professional_title?: string | null;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      service_contract_sends: {
        Row: {
          document_id: string;
          id: string;
          note: string | null;
          organization_id: string;
          provider_message_id: string | null;
          revision_id: string;
          sent_at: string;
          sent_by: string | null;
          sent_to: string;
        };
        Insert: {
          document_id: string;
          id?: string;
          note?: string | null;
          organization_id: string;
          provider_message_id?: string | null;
          revision_id: string;
          sent_at?: string;
          sent_by?: string | null;
          sent_to: string;
        };
        Update: {
          document_id?: string;
          id?: string;
          note?: string | null;
          organization_id?: string;
          provider_message_id?: string | null;
          revision_id?: string;
          sent_at?: string;
          sent_by?: string | null;
          sent_to?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_contract_sends_document_fkey';
            columns: ['document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'client_documents';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'service_contract_sends_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_contract_sends_revision_id_fkey';
            columns: ['revision_id'];
            isOneToOne: false;
            referencedRelation: 'document_revisions';
            referencedColumns: ['id'];
          },
        ];
      };
      service_contracts: {
        Row: {
          client_id: string;
          contract_date: string;
          contract_number: number;
          covers_fire_safety: boolean;
          covers_occupational_safety: boolean;
          created_at: string;
          created_by: string | null;
          duration_months: number;
          id: string;
          organization_id: string;
          renews_automatically: boolean;
          start_date: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          client_id: string;
          contract_date: string;
          contract_number: number;
          covers_fire_safety?: boolean;
          covers_occupational_safety?: boolean;
          created_at?: string;
          created_by?: string | null;
          duration_months: number;
          id?: string;
          organization_id: string;
          renews_automatically?: boolean;
          start_date: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          client_id?: string;
          contract_date?: string;
          contract_number?: number;
          covers_fire_safety?: boolean;
          covers_occupational_safety?: boolean;
          created_at?: string;
          created_by?: string | null;
          duration_months?: number;
          id?: string;
          organization_id?: string;
          renews_automatically?: boolean;
          start_date?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'service_contracts_client_fkey';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'service_contracts_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      waitlist_subscribers: {
        Row: {
          confirmation_sent_at: string | null;
          confirmation_token_hash: string;
          confirmed_at: string | null;
          consent_version: string;
          created_at: string;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          confirmation_sent_at?: string | null;
          confirmation_token_hash: string;
          confirmed_at?: string | null;
          consent_version: string;
          created_at?: string;
          email: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          confirmation_sent_at?: string | null;
          confirmation_token_hash?: string;
          confirmed_at?: string | null;
          consent_version?: string;
          created_at?: string;
          email?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation_as: {
        Args: {
          accepted_terms_version: string;
          accepting_user_id: string;
          invitation_token_hash: string;
          new_full_name: string;
        };
        Returns: string;
      };
      accept_organization_invitation: {
        Args: {
          accepted_terms_version?: string;
          invitation_token_hash: string;
          new_full_name?: string;
        };
        Returns: string;
      };
      can_access_document: { Args: { p_document_id: string }; Returns: boolean };
      change_organization_member_role: {
        Args: {
          member_user_id: string;
          new_role: Database['public']['Enums']['organization_role'];
        };
        Returns: boolean;
      };
      create_organization: {
        Args: {
          accepted_terms_version: string;
          organization_name: string;
          owner_full_name: string;
        };
        Returns: string;
      };
      create_organization_invitation: {
        Args: {
          invitee_email: string;
          invitee_role?: Database['public']['Enums']['organization_role'];
        };
        Returns: {
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          role: Database['public']['Enums']['organization_role'];
          sent_at: string;
        }[];
      };
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
      is_draft_document_path: { Args: { p_path: string }; Returns: boolean };
      is_organization_owner: { Args: never; Returns: boolean };
      is_platform_admin: { Args: never; Returns: boolean };
      is_readable_document_path: { Args: { p_path: string }; Returns: boolean };
      is_signed_copy_path: { Args: { p_path: string }; Returns: boolean };
      issue_document_revision: {
        Args: {
          p_docx_sha256: string;
          p_pdf_path?: string;
          p_pdf_sha256?: string;
          p_revision_id: string;
        };
        Returns: undefined;
      };
      lock_members_as_owner: { Args: never; Returns: string };
      my_open_invitations: {
        Args: never;
        Returns: {
          expires_at: string;
          inviter_name: string;
          organization_name: string;
          role: Database['public']['Enums']['organization_role'];
        }[];
      };
      organization_invitation_by_token: {
        Args: { invitation_token_hash: string };
        Returns: {
          account_exists: boolean;
          email: string;
          expires_at: string;
          inviter_name: string;
          organization_name: string;
          role: Database['public']['Enums']['organization_role'];
          status: string;
        }[];
      };
      organization_member_list: {
        Args: never;
        Returns: {
          email: string;
          full_name: string;
          joined_at: string;
          professional_title: string;
          role: Database['public']['Enums']['organization_role'];
          user_id: string;
        }[];
      };
      refuse_archived_client: {
        Args: { p_client_id: string };
        Returns: undefined;
      };
      register_built_in_template_version: {
        Args: {
          p_sha256: string;
          p_storage_path: string;
          p_title: string;
          p_type_key: string;
        };
        Returns: {
          created: boolean;
          template_version_id: string;
          version: number;
        }[];
      };
      remove_organization_member: {
        Args: { member_user_id: string };
        Returns: boolean;
      };
      revoke_organization_invitation: {
        Args: { invitation_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      client_stage: 'lead' | 'client';
      document_group: 'documentation_set' | 'other';
      document_revision_status: 'draft' | 'issued' | 'superseded';
      employee_status: 'active' | 'terminated';
      organization_role: 'owner' | 'specialist';
      responsible_person_role:
        | 'workplace_manager'
        | 'first_aid'
        | 'risk_evaluation_team'
        | 'imminent_danger'
        | 'workers_representative';
      staff_category: 'technical_administrative' | 'execution';
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
      client_stage: ['lead', 'client'],
      document_group: ['documentation_set', 'other'],
      document_revision_status: ['draft', 'issued', 'superseded'],
      employee_status: ['active', 'terminated'],
      organization_role: ['owner', 'specialist'],
      responsible_person_role: [
        'workplace_manager',
        'first_aid',
        'risk_evaluation_team',
        'imminent_danger',
        'workers_representative',
      ],
      staff_category: ['technical_administrative', 'execution'],
    },
  },
} as const;
