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
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
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
      client_files: {
        Row: {
          client_id: string;
          created_at: string;
          id: string;
          mime_type: string;
          name: string;
          note: string | null;
          organization_id: string;
          original_file_name: string;
          owners_only: boolean;
          sha256: string;
          size_bytes: number;
          storage_path: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          id?: string;
          mime_type: string;
          name: string;
          note?: string | null;
          organization_id: string;
          original_file_name: string;
          owners_only?: boolean;
          sha256: string;
          size_bytes: number;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          id?: string;
          mime_type?: string;
          name?: string;
          note?: string | null;
          organization_id?: string;
          original_file_name?: string;
          owners_only?: boolean;
          sha256?: string;
          size_bytes?: number;
          storage_path?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_files_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'client_files_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      client_fire_safety: {
        Row: {
          administrative_training_interval_months: number | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          organization_id: string;
          periodic_training_hours: number | null;
          smoking_policy: Database['public']['Enums']['fire_smoking_policy'] | null;
          training_day_from: number | null;
          training_day_to: number | null;
          training_first_month: number | null;
          updated_at: string;
          waste_contractor: string | null;
          waste_kinds: string[];
          worker_training_interval_months: number | null;
        };
        Insert: {
          administrative_training_interval_months?: number | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          organization_id: string;
          periodic_training_hours?: number | null;
          smoking_policy?: Database['public']['Enums']['fire_smoking_policy'] | null;
          training_day_from?: number | null;
          training_day_to?: number | null;
          training_first_month?: number | null;
          updated_at?: string;
          waste_contractor?: string | null;
          waste_kinds?: string[];
          worker_training_interval_months?: number | null;
        };
        Update: {
          administrative_training_interval_months?: number | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          organization_id?: string;
          periodic_training_hours?: number | null;
          smoking_policy?: Database['public']['Enums']['fire_smoking_policy'] | null;
          training_day_from?: number | null;
          training_day_to?: number | null;
          training_first_month?: number | null;
          updated_at?: string;
          waste_contractor?: string | null;
          waste_kinds?: string[];
          worker_training_interval_months?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_fire_safety_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'client_fire_safety_organization_id_fkey';
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
          workplace_id: string | null;
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
          workplace_id?: string | null;
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
          workplace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_responsible_persons_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
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
          {
            foreignKeyName: 'client_responsible_persons_workplace_of_client';
            columns: ['workplace_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'client_workplaces';
            referencedColumns: ['id', 'client_id'];
          },
        ];
      };
      client_workplaces: {
        Row: {
          activity: string | null;
          address_line: string | null;
          archived_at: string | null;
          assembly_point: string | null;
          client_id: string;
          combustible_materials: string | null;
          county_code: string | null;
          created_at: string;
          created_by: string | null;
          extinguisher_norm: Database['public']['Enums']['fire_extinguisher_norm'] | null;
          fire_risk_equipment: string | null;
          floor_area_m2: number | null;
          id: string;
          ignition_sources: string | null;
          is_registered_office: boolean;
          locality: string | null;
          name: string;
          organization_id: string;
          specific_measures: string | null;
          updated_at: string;
        };
        Insert: {
          activity?: string | null;
          address_line?: string | null;
          archived_at?: string | null;
          assembly_point?: string | null;
          client_id: string;
          combustible_materials?: string | null;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          extinguisher_norm?: Database['public']['Enums']['fire_extinguisher_norm'] | null;
          fire_risk_equipment?: string | null;
          floor_area_m2?: number | null;
          id?: string;
          ignition_sources?: string | null;
          is_registered_office?: boolean;
          locality?: string | null;
          name: string;
          organization_id: string;
          specific_measures?: string | null;
          updated_at?: string;
        };
        Update: {
          activity?: string | null;
          address_line?: string | null;
          archived_at?: string | null;
          assembly_point?: string | null;
          client_id?: string;
          combustible_materials?: string | null;
          county_code?: string | null;
          created_at?: string;
          created_by?: string | null;
          extinguisher_norm?: Database['public']['Enums']['fire_extinguisher_norm'] | null;
          fire_risk_equipment?: string | null;
          floor_area_m2?: number | null;
          id?: string;
          ignition_sources?: string | null;
          is_registered_office?: boolean;
          locality?: string | null;
          name?: string;
          organization_id?: string;
          specific_measures?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_workplaces_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
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
          current_employee_count: number | null;
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
          document_group: Database['public']['Enums']['document_group'];
          first_decision_number: number | null;
          id: string;
          issue_date: string;
          organization_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          document_group?: Database['public']['Enums']['document_group'];
          first_decision_number?: number | null;
          id?: string;
          issue_date: string;
          organization_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          document_group?: Database['public']['Enums']['document_group'];
          first_decision_number?: number | null;
          id?: string;
          issue_date?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_generations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
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
            foreignKeyName: 'document_revisions_document_in_organization';
            columns: ['document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'documents_behind';
            referencedColumns: ['document_id', 'organization_id'];
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
          confirmed_at: string | null;
          confirmed_by: string | null;
          document_id: string;
          organization_id: string;
          revision_id: string;
          sha256: string;
          source: string;
          storage_path: string;
          uploaded_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          document_id: string;
          organization_id: string;
          revision_id: string;
          sha256: string;
          source?: string;
          storage_path: string;
          uploaded_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          document_id?: string;
          organization_id?: string;
          revision_id?: string;
          sha256?: string;
          source?: string;
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
            foreignKeyName: 'document_signed_copies_document_fkey';
            columns: ['document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'documents_behind';
            referencedColumns: ['document_id', 'organization_id'];
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
          kind: string;
          note: string | null;
          resolves_legal_change_id: string | null;
          sha256: string;
          storage_path: string;
          template_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          note?: string | null;
          resolves_legal_change_id?: string | null;
          sha256: string;
          storage_path: string;
          template_id: string;
          version: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          note?: string | null;
          resolves_legal_change_id?: string | null;
          sha256?: string;
          storage_path?: string;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_template_versions_resolves_legal_change_id_fkey';
            columns: ['resolves_legal_change_id'];
            isOneToOne: false;
            referencedRelation: 'legal_changes';
            referencedColumns: ['id'];
          },
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
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
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
      evaluation_profile_factors: {
        Row: {
          actions: string | null;
          component: Database['public']['Enums']['work_system_component'];
          created_at: string;
          created_by: string | null;
          deadline: string | null;
          description: string;
          factor_group: string;
          gravity_class: number;
          id: string;
          observations: string | null;
          organization_id: string;
          probability_class: number;
          profile_id: string;
          responsible_person: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          actions?: string | null;
          component: Database['public']['Enums']['work_system_component'];
          created_at?: string;
          created_by?: string | null;
          deadline?: string | null;
          description: string;
          factor_group: string;
          gravity_class: number;
          id?: string;
          observations?: string | null;
          organization_id: string;
          probability_class: number;
          profile_id: string;
          responsible_person?: string | null;
          sort_order: number;
          updated_at?: string;
        };
        Update: {
          actions?: string | null;
          component?: Database['public']['Enums']['work_system_component'];
          created_at?: string;
          created_by?: string | null;
          deadline?: string | null;
          description?: string;
          factor_group?: string;
          gravity_class?: number;
          id?: string;
          observations?: string | null;
          organization_id?: string;
          probability_class?: number;
          profile_id?: string;
          responsible_person?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluation_profile_factors_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'evaluation_profile_factors_profile_in_organization';
            columns: ['profile_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'evaluation_profiles';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      evaluation_profile_measures: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string;
          factor_id: string;
          id: string;
          kind: Database['public']['Enums']['prevention_measure_kind'];
          organization_id: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description: string;
          factor_id: string;
          id?: string;
          kind: Database['public']['Enums']['prevention_measure_kind'];
          organization_id: string;
          sort_order: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          factor_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['prevention_measure_kind'];
          organization_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluation_profile_measures_factor_in_organization';
            columns: ['factor_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'evaluation_profile_factors';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'evaluation_profile_measures_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      evaluation_profiles: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'evaluation_profiles_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      fire_equipment: {
        Row: {
          agent: Database['public']['Enums']['fire_extinguishing_agent'] | null;
          capacity: number | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          kind: Database['public']['Enums']['fire_equipment_kind'];
          label: string | null;
          last_service_on: string | null;
          location: string | null;
          maintainer: string | null;
          manufactured_year: number | null;
          next_service_on: string | null;
          organization_id: string;
          updated_at: string;
          wheeled: boolean;
          workplace_id: string;
        };
        Insert: {
          agent?: Database['public']['Enums']['fire_extinguishing_agent'] | null;
          capacity?: number | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind: Database['public']['Enums']['fire_equipment_kind'];
          label?: string | null;
          last_service_on?: string | null;
          location?: string | null;
          maintainer?: string | null;
          manufactured_year?: number | null;
          next_service_on?: string | null;
          organization_id: string;
          updated_at?: string;
          wheeled?: boolean;
          workplace_id: string;
        };
        Update: {
          agent?: Database['public']['Enums']['fire_extinguishing_agent'] | null;
          capacity?: number | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['fire_equipment_kind'];
          label?: string | null;
          last_service_on?: string | null;
          location?: string | null;
          maintainer?: string | null;
          manufactured_year?: number | null;
          next_service_on?: string | null;
          organization_id?: string;
          updated_at?: string;
          wheeled?: boolean;
          workplace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fire_equipment_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fire_equipment_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fire_equipment_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'fire_equipment_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fire_equipment_workplace_of_client';
            columns: ['workplace_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'client_workplaces';
            referencedColumns: ['id', 'client_id'];
          },
        ];
      };
      fire_installations: {
        Row: {
          client_id: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          kind: Database['public']['Enums']['fire_installation_kind'];
          last_check_on: string | null;
          maintainer: string | null;
          next_check_on: string | null;
          organization_id: string;
          updated_at: string;
          workplace_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind: Database['public']['Enums']['fire_installation_kind'];
          last_check_on?: string | null;
          maintainer?: string | null;
          next_check_on?: string | null;
          organization_id: string;
          updated_at?: string;
          workplace_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['fire_installation_kind'];
          last_check_on?: string | null;
          maintainer?: string | null;
          next_check_on?: string | null;
          organization_id?: string;
          updated_at?: string;
          workplace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fire_installations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fire_installations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fire_installations_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'fire_installations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fire_installations_workplace_of_client';
            columns: ['workplace_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'client_workplaces';
            referencedColumns: ['id', 'client_id'];
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
      instruction_module_versions: {
        Row: {
          article_count: number;
          created_at: string;
          created_by: string | null;
          docx_path: string;
          id: string;
          module_id: string;
          number: number;
          organization_id: string;
          sha256: string;
          size_bytes: number;
        };
        Insert: {
          article_count?: number;
          created_at?: string;
          created_by?: string | null;
          docx_path: string;
          id?: string;
          module_id: string;
          number: number;
          organization_id: string;
          sha256: string;
          size_bytes: number;
        };
        Update: {
          article_count?: number;
          created_at?: string;
          created_by?: string | null;
          docx_path?: string;
          id?: string;
          module_id?: string;
          number?: number;
          organization_id?: string;
          sha256?: string;
          size_bytes?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'instruction_module_versions_module_in_organization';
            columns: ['module_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'instruction_modules';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'instruction_module_versions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      instruction_modules: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          module_group: Database['public']['Enums']['instruction_module_group'];
          organization_id: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          module_group: Database['public']['Enums']['instruction_module_group'];
          organization_id: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          module_group?: Database['public']['Enums']['instruction_module_group'];
          organization_id?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'instruction_modules_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      job_position_equipment: {
        Row: {
          allocation: Database['public']['Enums']['equipment_allocation'];
          client_id: string;
          created_at: string;
          created_by: string | null;
          duration_months: number | null;
          id: string;
          item: string;
          job_position_id: string;
          organization_id: string;
          quantity: number;
          risk: string;
          updated_at: string;
        };
        Insert: {
          allocation?: Database['public']['Enums']['equipment_allocation'];
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          duration_months?: number | null;
          id?: string;
          item: string;
          job_position_id: string;
          organization_id: string;
          quantity?: number;
          risk: string;
          updated_at?: string;
        };
        Update: {
          allocation?: Database['public']['Enums']['equipment_allocation'];
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          duration_months?: number | null;
          id?: string;
          item?: string;
          job_position_id?: string;
          organization_id?: string;
          quantity?: number;
          risk?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_position_equipment_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_position_equipment_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_position_equipment_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'job_position_equipment_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_position_equipment_position_in_client';
            columns: ['job_position_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'job_positions';
            referencedColumns: ['id', 'client_id'];
          },
        ];
      };
      job_position_instructions: {
        Row: {
          client_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          job_position_id: string;
          module_id: string;
          organization_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          job_position_id: string;
          module_id: string;
          organization_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          job_position_id?: string;
          module_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_position_instructions_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_position_instructions_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_position_instructions_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'job_position_instructions_module_in_organization';
            columns: ['module_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'instruction_modules';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'job_position_instructions_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_position_instructions_position_in_client';
            columns: ['job_position_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'job_positions';
            referencedColumns: ['id', 'client_id'];
          },
        ];
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
          needs_instructions: boolean | null;
          needs_protective_equipment: boolean | null;
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
          needs_instructions?: boolean | null;
          needs_protective_equipment?: boolean | null;
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
          needs_instructions?: boolean | null;
          needs_protective_equipment?: boolean | null;
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
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
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
      legal_acts: {
        Row: {
          checked_by_hand_on: string | null;
          created_at: string;
          id: string;
          last_amending_act: string | null;
          last_checked_at: string | null;
          last_consolidated_on: string | null;
          name: string;
          portal_id: number | null;
          portal_status: string | null;
          updated_at: string;
          verified_consolidated_on: string | null;
        };
        Insert: {
          checked_by_hand_on?: string | null;
          created_at?: string;
          id: string;
          last_amending_act?: string | null;
          last_checked_at?: string | null;
          last_consolidated_on?: string | null;
          name: string;
          portal_id?: number | null;
          portal_status?: string | null;
          updated_at?: string;
          verified_consolidated_on?: string | null;
        };
        Update: {
          checked_by_hand_on?: string | null;
          created_at?: string;
          id?: string;
          last_amending_act?: string | null;
          last_checked_at?: string | null;
          last_consolidated_on?: string | null;
          name?: string;
          portal_id?: number | null;
          portal_status?: string | null;
          updated_at?: string;
          verified_consolidated_on?: string | null;
        };
        Relationships: [];
      };
      legal_changes: {
        Row: {
          act_id: string;
          amending_act: string | null;
          consolidated_on: string;
          id: string;
          resolution: string;
          resolved_at: string | null;
          resolved_by_note: string | null;
          seen_at: string;
        };
        Insert: {
          act_id: string;
          amending_act?: string | null;
          consolidated_on: string;
          id?: string;
          resolution?: string;
          resolved_at?: string | null;
          resolved_by_note?: string | null;
          seen_at?: string;
        };
        Update: {
          act_id?: string;
          amending_act?: string | null;
          consolidated_on?: string;
          id?: string;
          resolution?: string;
          resolved_at?: string | null;
          resolved_by_note?: string | null;
          seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'legal_changes_act_id_fkey';
            columns: ['act_id'];
            isOneToOne: false;
            referencedRelation: 'legal_acts';
            referencedColumns: ['id'];
          },
        ];
      };
      legal_check_runs: {
        Row: {
          acts_checked: number;
          acts_skipped: number;
          changes_found: number;
          errors: Json | null;
          finished_at: string | null;
          id: string;
          started_at: string;
          status: string;
        };
        Insert: {
          acts_checked?: number;
          acts_skipped?: number;
          changes_found?: number;
          errors?: Json | null;
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          status?: string;
        };
        Update: {
          acts_checked?: number;
          acts_skipped?: number;
          changes_found?: number;
          errors?: Json | null;
          finished_at?: string | null;
          id?: string;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
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
      prevention_measures: {
        Row: {
          client_id: string;
          created_at: string;
          created_by: string | null;
          description: string;
          factor_id: string;
          id: string;
          kind: Database['public']['Enums']['prevention_measure_kind'];
          organization_id: string;
          sort_order: number;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          description: string;
          factor_id: string;
          id?: string;
          kind: Database['public']['Enums']['prevention_measure_kind'];
          organization_id: string;
          sort_order: number;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string;
          factor_id?: string;
          id?: string;
          kind?: Database['public']['Enums']['prevention_measure_kind'];
          organization_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'prevention_measures_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prevention_measures_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prevention_measures_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'prevention_measures_factor_in_client';
            columns: ['factor_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'risk_factors';
            referencedColumns: ['id', 'client_id'];
          },
          {
            foreignKeyName: 'prevention_measures_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
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
      regeneration_job_items: {
        Row: {
          client_id: string;
          detail: string | null;
          job_id: string;
          missing: string[] | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          detail?: string | null;
          job_id: string;
          missing?: string[] | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          detail?: string | null;
          job_id?: string;
          missing?: string[] | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'regeneration_job_items_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'regeneration_job_items_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'regeneration_job_items_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'regeneration_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      regeneration_jobs: {
        Row: {
          done_count: number;
          failed_count: number;
          finished_at: string | null;
          id: string;
          organization_id: string;
          requested_at: string;
          requested_by: string | null;
          skipped_count: number;
          total_count: number;
          type_key: string;
        };
        Insert: {
          done_count?: number;
          failed_count?: number;
          finished_at?: string | null;
          id?: string;
          organization_id: string;
          requested_at?: string;
          requested_by?: string | null;
          skipped_count?: number;
          total_count: number;
          type_key: string;
        };
        Update: {
          done_count?: number;
          failed_count?: number;
          finished_at?: string | null;
          id?: string;
          organization_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          skipped_count?: number;
          total_count?: number;
          type_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'regeneration_jobs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      risk_evaluations: {
        Row: {
          client_id: string;
          created_at: string;
          created_by: string | null;
          exposed_persons: string | null;
          exposure: string;
          id: string;
          job_position_id: string | null;
          kind: Database['public']['Enums']['risk_evaluation_kind'];
          means_of_production: string | null;
          name: string | null;
          organization_id: string;
          updated_at: string;
          work_environment: string | null;
          work_task: string | null;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          exposed_persons?: string | null;
          exposure?: string;
          id?: string;
          job_position_id?: string | null;
          kind: Database['public']['Enums']['risk_evaluation_kind'];
          means_of_production?: string | null;
          name?: string | null;
          organization_id: string;
          updated_at?: string;
          work_environment?: string | null;
          work_task?: string | null;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          exposed_persons?: string | null;
          exposure?: string;
          id?: string;
          job_position_id?: string | null;
          kind?: Database['public']['Enums']['risk_evaluation_kind'];
          means_of_production?: string | null;
          name?: string | null;
          organization_id?: string;
          updated_at?: string;
          work_environment?: string | null;
          work_task?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'risk_evaluations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_evaluations_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_evaluations_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'risk_evaluations_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_evaluations_position_in_client';
            columns: ['job_position_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'job_positions';
            referencedColumns: ['id', 'client_id'];
          },
        ];
      };
      risk_factors: {
        Row: {
          actions: string | null;
          client_id: string;
          component: Database['public']['Enums']['work_system_component'];
          created_at: string;
          created_by: string | null;
          deadline: string | null;
          description: string;
          evaluation_id: string;
          factor_group: string;
          gravity_class: number;
          id: string;
          observations: string | null;
          organization_id: string;
          probability_class: number;
          responsible_person: string | null;
          sort_order: number;
          source_profile_factor_id: string | null;
          updated_at: string;
        };
        Insert: {
          actions?: string | null;
          client_id: string;
          component: Database['public']['Enums']['work_system_component'];
          created_at?: string;
          created_by?: string | null;
          deadline?: string | null;
          description: string;
          evaluation_id: string;
          factor_group: string;
          gravity_class: number;
          id?: string;
          observations?: string | null;
          organization_id: string;
          probability_class: number;
          responsible_person?: string | null;
          sort_order: number;
          source_profile_factor_id?: string | null;
          updated_at?: string;
        };
        Update: {
          actions?: string | null;
          client_id?: string;
          component?: Database['public']['Enums']['work_system_component'];
          created_at?: string;
          created_by?: string | null;
          deadline?: string | null;
          description?: string;
          evaluation_id?: string;
          factor_group?: string;
          gravity_class?: number;
          id?: string;
          observations?: string | null;
          organization_id?: string;
          probability_class?: number;
          responsible_person?: string | null;
          sort_order?: number;
          source_profile_factor_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'risk_factors_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_factors_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_factors_client_in_organization';
            columns: ['client_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id', 'organization_id'];
          },
          {
            foreignKeyName: 'risk_factors_evaluation_in_client';
            columns: ['evaluation_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'risk_evaluations';
            referencedColumns: ['id', 'client_id'];
          },
          {
            foreignKeyName: 'risk_factors_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'risk_factors_source_profile_factor_in_organization';
            columns: ['source_profile_factor_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'evaluation_profile_factors';
            referencedColumns: ['id', 'organization_id'];
          },
        ];
      };
      service_contract_sends: {
        Row: {
          document_id: string;
          id: string;
          note: string | null;
          organization_id: string;
          provider_message_id: string | null;
          return_expires_at: string | null;
          return_uploads: number;
          revision_id: string;
          sent_at: string;
          sent_by: string | null;
          sent_to: string;
          token_hash: string | null;
        };
        Insert: {
          document_id: string;
          id?: string;
          note?: string | null;
          organization_id: string;
          provider_message_id?: string | null;
          return_expires_at?: string | null;
          return_uploads?: number;
          revision_id: string;
          sent_at?: string;
          sent_by?: string | null;
          sent_to: string;
          token_hash?: string | null;
        };
        Update: {
          document_id?: string;
          id?: string;
          note?: string | null;
          organization_id?: string;
          provider_message_id?: string | null;
          return_expires_at?: string | null;
          return_uploads?: number;
          revision_id?: string;
          sent_at?: string;
          sent_by?: string | null;
          sent_to?: string;
          token_hash?: string | null;
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
            foreignKeyName: 'service_contract_sends_document_fkey';
            columns: ['document_id', 'organization_id'];
            isOneToOne: false;
            referencedRelation: 'documents_behind';
            referencedColumns: ['document_id', 'organization_id'];
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
      client_list: {
        Row: {
          address_line: string | null;
          archived_at: string | null;
          caen_code: string | null;
          client_since: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          county_code: string | null;
          created_at: string | null;
          cui: string | null;
          current_employee_count: number | null;
          declared_employee_count: number | null;
          documentation_generated_type_keys: string[] | null;
          documentation_issued_count: number | null;
          documentation_last_generated_at: string | null;
          id: string | null;
          job_position_count: number | null;
          job_positions_needing_work_count: number | null;
          legal_name: string | null;
          legal_representative_name: string | null;
          locality: string | null;
          promoted_at: string | null;
          stage: Database['public']['Enums']['client_stage'] | null;
          trade_register_number: string | null;
          updated_at: string | null;
          vat_payer: boolean | null;
        };
        Relationships: [];
      };
      documents_behind: {
        Row: {
          client_id: string | null;
          client_name: string | null;
          document_id: string | null;
          edited_draft: boolean | null;
          newest_kind: string | null;
          newest_note: string | null;
          newest_version: number | null;
          organization_id: string | null;
          revision_version: number | null;
          template_title: string | null;
          type_key: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'client_documents_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'client_list';
            referencedColumns: ['id'];
          },
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
      apply_evaluation_profile: {
        Args: { p_evaluation_id: string; p_profile_id: string };
        Returns: number;
      };
      can_access_document: { Args: { p_document_id: string }; Returns: boolean };
      change_organization_member_role: {
        Args: {
          member_user_id: string;
          new_role: Database['public']['Enums']['organization_role'];
        };
        Returns: boolean;
      };
      copy_risk_factors: {
        Args: { p_evaluation_id: string; p_from_evaluation_id: string };
        Returns: number;
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
      current_employee_count: {
        Args: { '': Database['public']['Tables']['clients']['Row'] };
        Returns: {
          error: true;
        } & 'the function public.current_employee_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache';
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
      is_instruction_module_path: { Args: { p_path: string }; Returns: boolean };
      is_organization_owner: { Args: never; Returns: boolean };
      is_platform_admin: { Args: never; Returns: boolean };
      is_readable_client_file_path: {
        Args: { p_path: string };
        Returns: boolean;
      };
      is_readable_document_path: { Args: { p_path: string }; Returns: boolean };
      is_signed_copy_path: { Args: { p_path: string }; Returns: boolean };
      is_writable_client_file_path: {
        Args: { p_path: string };
        Returns: boolean;
      };
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
      record_regeneration_item: {
        Args: {
          p_client_id: string;
          p_detail: string;
          p_job_id: string;
          p_missing?: string[];
          p_status: string;
        };
        Returns: boolean;
      };
      refuse_archived_client: {
        Args: { p_client_id: string };
        Returns: undefined;
      };
      register_built_in_template_version: {
        Args: {
          p_kind: string;
          p_note: string;
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
      reorder_risk_factors: {
        Args: { p_evaluation_id: string; p_factor_ids: string[] };
        Returns: boolean;
      };
      revoke_organization_invitation: {
        Args: { invitation_id: string };
        Returns: boolean;
      };
      save_evaluation_profile_factor: {
        Args: {
          p_actions?: string;
          p_component: Database['public']['Enums']['work_system_component'];
          p_deadline?: string;
          p_description: string;
          p_factor_group: string;
          p_factor_id?: string;
          p_gravity_class: number;
          p_measures: Json;
          p_observations?: string;
          p_probability_class: number;
          p_profile_id: string;
          p_responsible_person?: string;
        };
        Returns: string;
      };
      save_risk_evaluation_as_profile: {
        Args: { p_evaluation_id: string; p_name: string };
        Returns: string;
      };
      save_risk_factor: {
        Args: {
          p_actions?: string;
          p_component: Database['public']['Enums']['work_system_component'];
          p_deadline?: string;
          p_description: string;
          p_evaluation_id: string;
          p_factor_group: string;
          p_factor_id?: string;
          p_gravity_class: number;
          p_measures: Json;
          p_observations?: string;
          p_probability_class: number;
          p_responsible_person?: string;
        };
        Returns: string;
      };
      start_regeneration_job: {
        Args: {
          p_client_ids: string[];
          p_organization_id: string;
          p_requested_by: string;
          p_type_key: string;
        };
        Returns: {
          done_count: number;
          failed_count: number;
          finished_at: string | null;
          id: string;
          organization_id: string;
          requested_at: string;
          requested_by: string | null;
          skipped_count: number;
          total_count: number;
          type_key: string;
        };
        SetofOptions: {
          from: '*';
          to: 'regeneration_jobs';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      text_items_length_between: {
        Args: { p_items: string[]; p_max: number; p_min: number };
        Returns: boolean;
      };
    };
    Enums: {
      client_stage: 'lead' | 'client';
      document_group: 'documentation_set' | 'other' | 'fire_safety_set';
      document_revision_status: 'draft' | 'issued' | 'superseded';
      employee_status: 'active' | 'terminated';
      equipment_allocation: 'personal_inventory' | 'section_inventory' | 'consumable';
      fire_equipment_kind: 'extinguisher' | 'sand_box' | 'fire_post' | 'fire_blanket' | 'other';
      fire_extinguisher_norm:
        'administrative_300' | 'commercial_200' | 'residential_level' | 'mixed_300' | 'other_150';
      fire_extinguishing_agent: 'powder' | 'co2' | 'foam' | 'water' | 'clean_agent';
      fire_installation_kind:
        | 'detection_alarm'
        | 'interior_hydrants'
        | 'exterior_hydrants'
        | 'sprinklers'
        | 'smoke_exhaust'
        | 'emergency_lighting'
        | 'lightning_protection'
        | 'gas_detection'
        | 'other';
      fire_smoking_policy: 'forbidden_everywhere' | 'designated_places';
      instruction_module_group: 'work_activity' | 'work_equipment' | 'protective_equipment';
      organization_role: 'owner' | 'specialist';
      prevention_measure_kind: 'technical' | 'organizational' | 'hygienic_sanitary' | 'other';
      responsible_person_role:
        | 'workplace_manager'
        | 'first_aid'
        | 'risk_evaluation_team'
        | 'imminent_danger'
        | 'workers_representative'
        | 'fire_safety_coordinator'
        | 'fire_intervention_leader';
      risk_evaluation_kind: 'job_position' | 'sensitive_groups' | 'other';
      staff_category: 'technical_administrative' | 'execution';
      work_system_component: 'executant' | 'work_task' | 'means_of_production' | 'work_environment';
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
      document_group: ['documentation_set', 'other', 'fire_safety_set'],
      document_revision_status: ['draft', 'issued', 'superseded'],
      employee_status: ['active', 'terminated'],
      equipment_allocation: ['personal_inventory', 'section_inventory', 'consumable'],
      fire_equipment_kind: ['extinguisher', 'sand_box', 'fire_post', 'fire_blanket', 'other'],
      fire_extinguisher_norm: [
        'administrative_300',
        'commercial_200',
        'residential_level',
        'mixed_300',
        'other_150',
      ],
      fire_extinguishing_agent: ['powder', 'co2', 'foam', 'water', 'clean_agent'],
      fire_installation_kind: [
        'detection_alarm',
        'interior_hydrants',
        'exterior_hydrants',
        'sprinklers',
        'smoke_exhaust',
        'emergency_lighting',
        'lightning_protection',
        'gas_detection',
        'other',
      ],
      fire_smoking_policy: ['forbidden_everywhere', 'designated_places'],
      instruction_module_group: ['work_activity', 'work_equipment', 'protective_equipment'],
      organization_role: ['owner', 'specialist'],
      prevention_measure_kind: ['technical', 'organizational', 'hygienic_sanitary', 'other'],
      responsible_person_role: [
        'workplace_manager',
        'first_aid',
        'risk_evaluation_team',
        'imminent_danger',
        'workers_representative',
        'fire_safety_coordinator',
        'fire_intervention_leader',
      ],
      risk_evaluation_kind: ['job_position', 'sensitive_groups', 'other'],
      staff_category: ['technical_administrative', 'execution'],
      work_system_component: ['executant', 'work_task', 'means_of_production', 'work_environment'],
    },
  },
} as const;
