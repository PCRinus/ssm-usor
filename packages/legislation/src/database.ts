import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// A copy of the tables this package writes, as `pnpm generate:db` types them in
// apps/api/src/database.types.ts; the API's script typecheck fails when the two differ.
export type LegislationTables = {
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
};

export type LegislationDatabase = {
  public: {
    Tables: LegislationTables;
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type LegislationClient = SupabaseClient<LegislationDatabase>;

// The secret key bypasses row-level security; nobody signed in may write these tables.
export function createLegislationClient(url: string, secretKey: string): LegislationClient {
  return createClient<LegislationDatabase>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    },
  });
}
