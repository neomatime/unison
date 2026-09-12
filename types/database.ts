export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      approval_decisions: {
        Row: {
          action: string
          actor_id: string | null
          approval_id: string
          assignee_id: string | null
          comment: string | null
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          approval_id: string
          assignee_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          approval_id?: string
          assignee_id?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_approval_id_organization_id_fkey"
            columns: ["approval_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "approval_decisions_organization_id_assignee_id_fkey"
            columns: ["organization_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "approval_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approver_id: string | null
          created_at: string
          decided_at: string | null
          description: string | null
          due_date: string | null
          framework_id: string | null
          gate_id: string | null
          id: string
          organization_id: string
          priority: string
          project_id: string | null
          requested_by: string | null
          status: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          description?: string | null
          due_date?: string | null
          framework_id?: string | null
          gate_id?: string | null
          id?: string
          organization_id: string
          priority?: string
          project_id?: string | null
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          approver_id?: string | null
          created_at?: string
          decided_at?: string | null
          description?: string | null
          due_date?: string | null
          framework_id?: string | null
          gate_id?: string | null
          id?: string
          organization_id?: string
          priority?: string
          project_id?: string | null
          requested_by?: string | null
          status?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_framework_id_organization_id_fkey"
            columns: ["framework_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "approvals_gate_id_organization_id_fkey"
            columns: ["gate_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "governance_gates"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "approvals_organization_id_approver_id_fkey"
            columns: ["organization_id", "approver_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          organization_id: string | null
          resource: string
          resource_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string | null
          resource: string
          resource_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string | null
          resource?: string
          resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          integration_connection_id: string | null
          last_run_at: string | null
          name: string
          organization_id: string
          run_count: number
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          integration_connection_id?: string | null
          last_run_at?: string | null
          name: string
          organization_id: string
          run_count?: number
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          integration_connection_id?: string | null
          last_run_at?: string | null
          name?: string
          organization_id?: string
          run_count?: number
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_integration_connection_id_organization_id_fkey"
            columns: ["integration_connection_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input: Json
          integration_event_id: number | null
          organization_id: string
          output: Json | null
          rule_id: string
          started_at: string | null
          status: string
          trigger_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json
          integration_event_id?: number | null
          organization_id: string
          output?: Json | null
          rule_id: string
          started_at?: string | null
          status?: string
          trigger_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input?: Json
          integration_event_id?: number | null
          organization_id?: string
          output?: Json | null
          rule_id?: string
          started_at?: string | null
          status?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_integration_event_id_fkey"
            columns: ["integration_event_id"]
            isOneToOne: false
            referencedRelation: "integration_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_rule_id_organization_id_fkey"
            columns: ["rule_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      automation_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          interval_minutes: number
          last_enqueued_at: string | null
          next_run_at: string
          organization_id: string
          rule_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes: number
          last_enqueued_at?: string | null
          next_run_at: string
          organization_id: string
          rule_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_enqueued_at?: string | null
          next_run_at?: string
          organization_id?: string
          rule_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_schedules_rule_id_organization_id_fkey"
            columns: ["rule_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempts: number
          created_at: string
          id: number
          idempotency_key: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          organization_id: string
          payload: Json
          priority: number
          rule_id: string
          run_at: string
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: never
          idempotency_key: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          organization_id: string
          payload?: Json
          priority?: number
          rule_id: string
          run_at?: string
          run_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: never
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          organization_id?: string
          payload?: Json
          priority?: number
          rule_id?: string
          run_at?: string
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "background_jobs_rule_id_organization_id_fkey"
            columns: ["rule_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "background_jobs_run_id_organization_id_fkey"
            columns: ["run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automation_runs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          archived_at: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_at: string
          event_type: string
          id: string
          location: string | null
          onboarding_id: string | null
          organization_id: string
          owner_id: string | null
          project_id: string | null
          start_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at: string
          event_type?: string
          id?: string
          location?: string | null
          onboarding_id?: string | null
          organization_id: string
          owner_id?: string | null
          project_id?: string | null
          start_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_at?: string
          event_type?: string
          id?: string
          location?: string | null
          onboarding_id?: string | null
          organization_id?: string
          owner_id?: string | null
          project_id?: string | null
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_events_onboarding_id_organization_id_fkey"
            columns: ["onboarding_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "client_onboardings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      client_onboardings: {
        Row: {
          archived_at: string | null
          client_id: string | null
          client_name: string
          created_at: string
          health: string
          id: string
          notes: string | null
          onboarding_type: string
          organization_id: string
          owner_id: string | null
          priority: string
          progress_percent: number
          required_documents: number
          stage: string
          start_date: string | null
          status: string
          target_go_live: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          health?: string
          id?: string
          notes?: string | null
          onboarding_type?: string
          organization_id: string
          owner_id?: string | null
          priority?: string
          progress_percent?: number
          required_documents?: number
          stage?: string
          start_date?: string | null
          status?: string
          target_go_live?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          health?: string
          id?: string
          notes?: string | null
          onboarding_type?: string
          organization_id?: string
          owner_id?: string | null
          priority?: string
          progress_percent?: number
          required_documents?: number
          stage?: string
          start_date?: string | null
          status?: string
          target_go_live?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboardings_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "client_onboardings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboardings_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          billing_email: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          health: string
          id: string
          industry: string | null
          name: string
          notes: string | null
          organization_id: string
          owner_id: string | null
          service: string | null
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          archived_at?: string | null
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          health?: string
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          service?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          archived_at?: string | null
          billing_email?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          health?: string
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          service?: string | null
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_import_jobs: {
        Row: {
          collection: string
          created_at: string
          created_by: string
          errors: Json
          file_name: string
          file_type: string
          id: string
          imported_count: number
          organization_id: string
          row_count: number
          skipped_count: number
          status: string
        }
        Insert: {
          collection: string
          created_at?: string
          created_by?: string
          errors?: Json
          file_name: string
          file_type: string
          id?: string
          imported_count: number
          organization_id: string
          row_count: number
          skipped_count: number
          status: string
        }
        Update: {
          collection?: string
          created_at?: string
          created_by?: string
          errors?: Json
          file_name?: string
          file_type?: string
          id?: string
          imported_count?: number
          organization_id?: string
          row_count?: number
          skipped_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_item_phase_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          delivery_item_id: string
          from_phase_id: string | null
          id: string
          organization_id: string
          to_phase_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          delivery_item_id: string
          from_phase_id?: string | null
          id?: string
          organization_id: string
          to_phase_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          delivery_item_id?: string
          from_phase_id?: string | null
          id?: string
          organization_id?: string
          to_phase_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_item_phase_history_delivery_item_id_fkey"
            columns: ["delivery_item_id"]
            isOneToOne: false
            referencedRelation: "delivery_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_item_phase_history_from_phase_id_fkey"
            columns: ["from_phase_id"]
            isOneToOne: false
            referencedRelation: "framework_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_item_phase_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_item_phase_history_to_phase_id_fkey"
            columns: ["to_phase_id"]
            isOneToOne: false
            referencedRelation: "framework_phases"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          archived_at: string | null
          created_at: string
          current_phase_id: string | null
          description: string | null
          external_reference: string | null
          framework_id: string
          health: string
          id: string
          level: number
          name: string
          organization_id: string
          owner_id: string | null
          parent_id: string | null
          parent_level: number | null
          project_id: string
          source_system: string | null
          start_date: string | null
          status: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          current_phase_id?: string | null
          description?: string | null
          external_reference?: string | null
          framework_id: string
          health?: string
          id?: string
          level: number
          name: string
          organization_id: string
          owner_id?: string | null
          parent_id?: string | null
          parent_level?: number | null
          project_id: string
          source_system?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          current_phase_id?: string | null
          description?: string | null
          external_reference?: string | null
          framework_id?: string
          health?: string
          id?: string
          level?: number
          name?: string
          organization_id?: string
          owner_id?: string | null
          parent_id?: string | null
          parent_level?: number | null
          project_id?: string
          source_system?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_owner_fkey"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "delivery_items_parent_fkey"
            columns: ["parent_id", "parent_level", "project_id"]
            isOneToOne: false
            referencedRelation: "delivery_items"
            referencedColumns: ["id", "level", "project_id"]
          },
          {
            foreignKeyName: "delivery_items_phase_fkey"
            columns: ["framework_id", "current_phase_id"]
            isOneToOne: false
            referencedRelation: "framework_phases"
            referencedColumns: ["framework_id", "id"]
          },
          {
            foreignKeyName: "delivery_items_project_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "delivery_items_project_framework_fkey"
            columns: ["project_id", "framework_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "framework_id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          classification: string
          confidentiality: string
          created_at: string
          description: string | null
          display_name: string
          file_size: number
          id: string
          linked_path: string | null
          linked_record_id: string | null
          linked_record_type: string | null
          mime_type: string
          organization_id: string
          storage_bucket: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          archived_at?: string | null
          classification?: string
          confidentiality?: string
          created_at?: string
          description?: string | null
          display_name: string
          file_size: number
          id?: string
          linked_path?: string | null
          linked_record_id?: string | null
          linked_record_type?: string | null
          mime_type: string
          organization_id: string
          storage_bucket?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          archived_at?: string | null
          classification?: string
          confidentiality?: string
          created_at?: string
          description?: string | null
          display_name?: string
          file_size?: number
          id?: string
          linked_path?: string | null
          linked_record_id?: string | null
          linked_record_type?: string | null
          mime_type?: string
          organization_id?: string
          storage_bucket?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          category: string
          client_id: string | null
          created_at: string
          currency: string
          description: string
          expense_date: string
          id: string
          notes: string | null
          organization_id: string
          project_id: string | null
          receipt_reference: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category?: string
          client_id?: string | null
          created_at?: string
          currency?: string
          description: string
          expense_date: string
          id?: string
          notes?: string | null
          organization_id: string
          project_id?: string | null
          receipt_reference?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category?: string
          client_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string | null
          receipt_reference?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_approved_by_organization_id_fkey"
            columns: ["approved_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "expenses_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "expenses_submitted_by_organization_id_fkey"
            columns: ["submitted_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_organization_id_fkey"
            columns: ["vendor_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      financial_forecasts: {
        Row: {
          actual_value: number
          archived_at: string | null
          assumptions: string | null
          confidence_percent: number
          created_at: string
          currency: string
          forecast_type: string
          id: string
          name: string
          organization_id: string
          owner_id: string | null
          period_end: string | null
          period_label: string
          period_start: string | null
          projected_value: number
          status: string
          updated_at: string
        }
        Insert: {
          actual_value?: number
          archived_at?: string | null
          assumptions?: string | null
          confidence_percent?: number
          created_at?: string
          currency?: string
          forecast_type?: string
          id?: string
          name: string
          organization_id: string
          owner_id?: string | null
          period_end?: string | null
          period_label: string
          period_start?: string | null
          projected_value?: number
          status?: string
          updated_at?: string
        }
        Update: {
          actual_value?: number
          archived_at?: string | null
          assumptions?: string | null
          confidence_percent?: number
          created_at?: string
          currency?: string
          forecast_type?: string
          id?: string
          name?: string
          organization_id?: string
          owner_id?: string | null
          period_end?: string | null
          period_label?: string
          period_start?: string | null
          projected_value?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_forecasts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_forecasts_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      framework_phases: {
        Row: {
          archived_at: string | null
          framework_id: string
          id: string
          name: string
          organization_id: string
          position: number
        }
        Insert: {
          archived_at?: string | null
          framework_id: string
          id?: string
          name: string
          organization_id: string
          position: number
        }
        Update: {
          archived_at?: string | null
          framework_id?: string
          id?: string
          name?: string
          organization_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "framework_phases_framework_fkey"
            columns: ["framework_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      framework_versions: {
        Row: {
          changed_by: string | null
          created_at: string
          framework_id: string
          id: string
          organization_id: string
          snapshot: Json
          version: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          framework_id: string
          id?: string
          organization_id: string
          snapshot: Json
          version?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          framework_id?: string
          id?: string
          organization_id?: string
          snapshot?: Json
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "framework_versions_framework_id_organization_id_fkey"
            columns: ["framework_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "framework_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      frameworks: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          level_1_label: string | null
          level_2_label: string | null
          name: string
          organization_id: string
          type: string | null
          updated_at: string
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          level_1_label?: string | null
          level_2_label?: string | null
          name: string
          organization_id: string
          type?: string | null
          updated_at?: string
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          level_1_label?: string | null
          level_2_label?: string | null
          name?: string
          organization_id?: string
          type?: string | null
          updated_at?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "frameworks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      governance_artefacts: {
        Row: {
          approval_id: string | null
          created_at: string
          external_url: string | null
          framework_id: string | null
          gate_id: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          project_id: string | null
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          approval_id?: string | null
          created_at?: string
          external_url?: string | null
          framework_id?: string | null
          gate_id?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          project_id?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          approval_id?: string | null
          created_at?: string
          external_url?: string | null
          framework_id?: string | null
          gate_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          project_id?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "governance_artefacts_approval_id_organization_id_fkey"
            columns: ["approval_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "governance_artefacts_framework_id_organization_id_fkey"
            columns: ["framework_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "governance_artefacts_gate_id_organization_id_fkey"
            columns: ["gate_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "governance_gates"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "governance_artefacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "governance_artefacts_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      governance_gates: {
        Row: {
          approval_required: boolean
          created_at: string
          description: string | null
          evidence_required: boolean
          framework_id: string
          id: string
          name: string
          organization_id: string
          phase_id: string
          position: number
          updated_at: string
        }
        Insert: {
          approval_required?: boolean
          created_at?: string
          description?: string | null
          evidence_required?: boolean
          framework_id: string
          id?: string
          name: string
          organization_id: string
          phase_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          approval_required?: boolean
          created_at?: string
          description?: string | null
          evidence_required?: boolean
          framework_id?: string
          id?: string
          name?: string
          organization_id?: string
          phase_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "governance_gates_framework_id_organization_id_fkey"
            columns: ["framework_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "governance_gates_framework_id_phase_id_fkey"
            columns: ["framework_id", "phase_id"]
            isOneToOne: false
            referencedRelation: "framework_phases"
            referencedColumns: ["framework_id", "id"]
          },
          {
            foreignKeyName: "governance_gates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          created_at: string
          created_by: string | null
          event_key: string
          id: string
          last_error: string | null
          last_event_at: string | null
          name: string
          organization_id: string
          provider: string
          secret_hint: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_key?: string
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          name: string
          organization_id: string
          provider?: string
          secret_hint?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_key?: string
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          name?: string
          organization_id?: string
          provider?: string
          secret_hint?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          connection_id: string
          event_key: string
          external_id: string | null
          id: number
          organization_id: string
          payload: Json
          received_at: string
          status: string
        }
        Insert: {
          connection_id: string
          event_key: string
          external_id?: string | null
          id?: never
          organization_id: string
          payload: Json
          received_at?: string
          status?: string
        }
        Update: {
          connection_id?: string
          event_key?: string
          external_id?: string | null
          id?: never
          organization_id?: string
          payload?: Json
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_connection_id_organization_id_fkey"
            columns: ["connection_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "integration_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role_id: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role_id: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role_id?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          archived_at: string | null
          balance_amount: number
          client_id: string | null
          client_name: string
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string | null
          notes: string | null
          opportunity_id: string | null
          organization_id: string
          owner_id: string | null
          paid_at: string | null
          payment_terms: string | null
          project_id: string | null
          quote_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          balance_amount?: number
          client_id?: string | null
          client_name: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string | null
          notes?: string | null
          opportunity_id?: string | null
          organization_id: string
          owner_id?: string | null
          paid_at?: string | null
          payment_terms?: string | null
          project_id?: string | null
          quote_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          balance_amount?: number
          client_id?: string | null
          client_name?: string
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string | null
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string
          owner_id?: string | null
          paid_at?: string | null
          payment_terms?: string | null
          project_id?: string | null
          quote_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_opportunity_id_organization_id_fkey"
            columns: ["opportunity_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "invoices_quote_id_organization_id_fkey"
            columns: ["quote_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          published_at: string | null
          slug: string
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          visibility: string
        }
        Insert: {
          category?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          published_at?: string | null
          slug: string
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visibility?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          published_at?: string | null
          slug?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_at: string | null
          company_name: string
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          currency: string
          estimated_value: number
          id: string
          last_activity_at: string | null
          notes: string | null
          organization_id: string
          owner_id: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_name: string
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          currency?: string
          estimated_value?: number
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          currency?: string
          estimated_value?: number
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          href: string | null
          id: string
          organization_id: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          href?: string | null
          id?: string
          organization_id: string
          read_at?: string | null
          title: string
          user_id?: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          href?: string | null
          id?: string
          organization_id?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          email_domain: string | null
          id: string
          name: string
          slug: string
          status: string
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_domain?: string | null
          id?: string
          name: string
          slug: string
          status?: string
          tier?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_domain?: string | null
          id?: string
          name?: string
          slug?: string
          status?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          amount: number
          billing_cycle: string
          billing_email: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          organization_id: string
          plan_key: string
          renews_on: string | null
          seat_limit: number
          starts_on: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          organization_id: string
          plan_key: string
          renews_on?: string | null
          seat_limit?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          billing_cycle?: string
          billing_email?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          organization_id?: string
          plan_key?: string
          renews_on?: string | null
          seat_limit?: number
          starts_on?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          archived_at: string | null
          business_unit: string | null
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          owner_id: string | null
          sponsor_id: string | null
          start_date: string | null
          status: string
          strategic_objective: string | null
          target_end_date: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_unit?: string | null
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          owner_id?: string | null
          sponsor_id?: string | null
          start_date?: string | null
          status?: string
          strategic_objective?: string | null
          target_end_date?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_unit?: string | null
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          owner_id?: string | null
          sponsor_id?: string | null
          start_date?: string | null
          status?: string
          strategic_objective?: string | null
          target_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_organization_id_owner_id_fkey"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "portfolios_organization_id_sponsor_id_fkey"
            columns: ["organization_id", "sponsor_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      programmes: {
        Row: {
          archived_at: string | null
          code: string
          created_at: string
          description: string | null
          health: string
          id: string
          name: string
          organization_id: string
          owner_id: string | null
          portfolio_id: string
          sponsor_id: string | null
          start_date: string | null
          status: string
          target_end_date: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          code: string
          created_at?: string
          description?: string | null
          health?: string
          id?: string
          name: string
          organization_id: string
          owner_id?: string | null
          portfolio_id: string
          sponsor_id?: string | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          code?: string
          created_at?: string
          description?: string | null
          health?: string
          id?: string
          name?: string
          organization_id?: string
          owner_id?: string | null
          portfolio_id?: string
          sponsor_id?: string | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programmes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programmes_organization_id_owner_id_fkey"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "programmes_organization_id_sponsor_id_fkey"
            columns: ["organization_id", "sponsor_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "programmes_portfolio_id_organization_id_fkey"
            columns: ["portfolio_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_assignments: {
        Row: {
          allocation_percent: number
          created_at: string
          delivery_role: string
          end_date: string | null
          id: string
          notes: string | null
          organization_id: string
          project_id: string
          start_date: string
          status: string
          team_member_id: string
          updated_at: string
        }
        Insert: {
          allocation_percent?: number
          created_at?: string
          delivery_role: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          project_id: string
          start_date: string
          status?: string
          team_member_id: string
          updated_at?: string
        }
        Update: {
          allocation_percent?: number
          created_at?: string
          delivery_role?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          project_id?: string
          start_date?: string
          status?: string
          team_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assignments_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_assignments_team_member_id_organization_id_fkey"
            columns: ["team_member_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_decisions: {
        Row: {
          created_at: string
          decided_at: string
          decided_by: string | null
          decision: string
          id: string
          organization_id: string
          project_id: string
          rationale: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          organization_id: string
          project_id: string
          rationale?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          organization_id?: string
          project_id?: string
          rationale?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_decisions_organization_id_decided_by_fkey"
            columns: ["organization_id", "decided_by"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "project_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_decisions_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      project_dependencies: {
        Row: {
          created_at: string
          criticality: string
          dependency_owner_id: string | null
          dependent_project_id: string
          id: string
          notes: string | null
          organization_id: string
          prerequisite_framework_id: string
          prerequisite_project_id: string
          relationship_type: string
          required_by_date: string | null
          required_phase_id: string | null
          required_status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          criticality?: string
          dependency_owner_id?: string | null
          dependent_project_id: string
          id?: string
          notes?: string | null
          organization_id: string
          prerequisite_framework_id: string
          prerequisite_project_id: string
          relationship_type?: string
          required_by_date?: string | null
          required_phase_id?: string | null
          required_status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          criticality?: string
          dependency_owner_id?: string | null
          dependent_project_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          prerequisite_framework_id?: string
          prerequisite_project_id?: string
          relationship_type?: string
          required_by_date?: string | null
          required_phase_id?: string | null
          required_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_dependencies_dependent_fkey"
            columns: ["dependent_project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_dependencies_organization_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_dependencies_owner_fkey"
            columns: ["organization_id", "dependency_owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "project_dependencies_phase_fkey"
            columns: ["prerequisite_framework_id", "required_phase_id"]
            isOneToOne: false
            referencedRelation: "framework_phases"
            referencedColumns: ["framework_id", "id"]
          },
          {
            foreignKeyName: "project_dependencies_prerequisite_fkey"
            columns: ["prerequisite_project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_dependencies_prerequisite_framework_fkey"
            columns: ["prerequisite_project_id", "prerequisite_framework_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "framework_id"]
          },
        ]
      }
      project_risks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          impact: string
          mitigation: string | null
          organization_id: string
          owner_id: string | null
          probability: string
          project_id: string
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          impact?: string
          mitigation?: string | null
          organization_id: string
          owner_id?: string | null
          probability?: string
          project_id: string
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          impact?: string
          mitigation?: string | null
          organization_id?: string
          owner_id?: string | null
          probability?: string
          project_id?: string
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_risks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_risks_organization_id_owner_id_fkey"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "project_risks_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          client_id: string | null
          created_at: string
          due_date: string | null
          framework_id: string
          health: string
          id: string
          name: string
          next_gate: string | null
          notes: string | null
          organization_id: string
          owner_id: string | null
          phase_id: string | null
          portfolio_id: string | null
          programme_id: string | null
          progress: number
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          framework_id: string
          health?: string
          id?: string
          name: string
          next_gate?: string | null
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          phase_id?: string | null
          portfolio_id?: string | null
          programme_id?: string | null
          progress?: number
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          framework_id?: string
          health?: string
          id?: string
          name?: string
          next_gate?: string | null
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          phase_id?: string | null
          portfolio_id?: string | null
          programme_id?: string | null
          progress?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_framework_fkey"
            columns: ["framework_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "frameworks"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_fkey"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "projects_phase_fkey"
            columns: ["framework_id", "phase_id"]
            isOneToOne: false
            referencedRelation: "framework_phases"
            referencedColumns: ["framework_id", "id"]
          },
          {
            foreignKeyName: "projects_portfolio_fkey"
            columns: ["portfolio_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_programme_fkey"
            columns: ["programme_id", "portfolio_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "programmes"
            referencedColumns: ["id", "portfolio_id", "organization_id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          archived_at: string | null
          client_id: string | null
          client_name: string
          contact_name: string | null
          created_at: string
          currency: string
          id: string
          lead_id: string | null
          notes: string | null
          opportunity_id: string | null
          organization_id: string
          owner_id: string | null
          quote_number: string
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          terms: string | null
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          archived_at?: string | null
          client_id?: string | null
          client_name: string
          contact_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          organization_id: string
          owner_id?: string | null
          quote_number: string
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          terms?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          archived_at?: string | null
          client_id?: string | null
          client_name?: string
          contact_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string
          owner_id?: string | null
          quote_number?: string
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          terms?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotes_lead_id_organization_id_fkey"
            columns: ["lead_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_organization_id_fkey"
            columns: ["opportunity_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      record_change_events: {
        Row: {
          actor_id: string | null
          changed_at: string
          id: number
          operation: string
          organization_id: string
          record_id: string
          resource: string
        }
        Insert: {
          actor_id?: string | null
          changed_at?: string
          id?: never
          operation: string
          organization_id: string
          record_id: string
          resource: string
        }
        Update: {
          actor_id?: string | null
          changed_at?: string
          id?: never
          operation?: string
          organization_id?: string
          record_id?: string
          resource?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_change_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      record_index: {
        Row: {
          href: string
          organization_id: string
          record_id: string
          resource: string
          search_vector: unknown
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          href: string
          organization_id: string
          record_id: string
          resource: string
          search_vector?: unknown
          subtitle?: string
          title: string
          updated_at?: string
        }
        Update: {
          href?: string
          organization_id?: string
          record_id?: string
          resource?: string
          search_vector?: unknown
          subtitle?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_index_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements: {
        Row: {
          created_at: string
          description: string | null
          id: string
          organization_id: string
          owner_id: string | null
          priority: string
          project_id: string
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          owner_id?: string | null
          priority?: string
          project_id: string
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          owner_id?: string | null
          priority?: string
          project_id?: string
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_owner_fkey"
            columns: ["organization_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
          {
            foreignKeyName: "requirements_project_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      sales_opportunities: {
        Row: {
          archived_at: string | null
          client_id: string | null
          client_name: string
          created_at: string
          currency: string
          expected_close: string | null
          expected_value: number
          id: string
          lead_id: string | null
          lost_reason: string | null
          name: string
          next_step: string | null
          notes: string | null
          organization_id: string
          owner_id: string | null
          probability_percent: number
          stage: string
          updated_at: string
          won_at: string | null
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string
          currency?: string
          expected_close?: string | null
          expected_value?: number
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          name: string
          next_step?: string | null
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          probability_percent?: number
          stage?: string
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string
          currency?: string
          expected_close?: string | null
          expected_value?: number
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          name?: string
          next_step?: string | null
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          probability_percent?: number
          stage?: string
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_opportunities_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_opportunities_lead_id_organization_id_fkey"
            columns: ["lead_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_opportunities_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      subscription_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          subscription_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          subscription_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "platform_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      support_cases: {
        Row: {
          assignee_name: string | null
          case_number: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          internal_notes: string | null
          organization_id: string
          priority: string
          resolution: string | null
          sla_due_at: string | null
          status: string
          subject: string
          support_ticket_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_name?: string | null
          case_number?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          internal_notes?: string | null
          organization_id: string
          priority?: string
          resolution?: string | null
          sla_due_at?: string | null
          status?: string
          subject: string
          support_ticket_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_name?: string | null
          case_number?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          internal_notes?: string | null
          organization_id?: string
          priority?: string
          resolution?: string | null
          sla_due_at?: string | null
          status?: string
          subject?: string
          support_ticket_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_cases_support_ticket_id_organization_id_fkey"
            columns: ["support_ticket_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          organization_id: string
          priority: string
          resolution: string | null
          status: string
          subject: string
          submitted_by: string
          ticket_number: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          organization_id: string
          priority?: string
          resolution?: string | null
          status?: string
          subject: string
          submitted_by?: string
          ticket_number?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          organization_id?: string
          priority?: string
          resolution?: string | null
          status?: string
          subject?: string
          submitted_by?: string
          ticket_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          assignee_id: string | null
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          onboarding_id: string | null
          organization_id: string
          priority: string
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          onboarding_id?: string | null
          organization_id: string
          priority?: string
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assignee_id?: string | null
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          onboarding_id?: string | null
          organization_id?: string
          priority?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_organization_id_fkey"
            columns: ["assignee_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_client_id_organization_id_fkey"
            columns: ["client_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_onboarding_id_organization_id_fkey"
            columns: ["onboarding_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "client_onboardings"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_organization_id_fkey"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      team_members: {
        Row: {
          access_role: string
          archived_at: string | null
          availability: string
          availability_note: string | null
          capacity_percent: number
          created_at: string
          delivery_role: string | null
          department: string | null
          email: string
          full_name: string
          id: string
          job_title: string | null
          joined_on: string | null
          manager_id: string | null
          organization_id: string
          status: string
          team_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_role?: string
          archived_at?: string | null
          availability?: string
          availability_note?: string | null
          capacity_percent?: number
          created_at?: string
          delivery_role?: string | null
          department?: string | null
          email: string
          full_name: string
          id?: string
          job_title?: string | null
          joined_on?: string | null
          manager_id?: string | null
          organization_id: string
          status?: string
          team_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_role?: string
          archived_at?: string | null
          availability?: string
          availability_note?: string | null
          capacity_percent?: number
          created_at?: string
          delivery_role?: string | null
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          job_title?: string | null
          joined_on?: string | null
          manager_id?: string | null
          organization_id?: string
          status?: string
          team_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_manager_id_organization_id_fkey"
            columns: ["manager_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "team_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_organization_id_user_id_fkey"
            columns: ["organization_id", "user_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["organization_id", "user_id"]
          },
        ]
      }
      tenant_configurations: {
        Row: {
          approval_escalation_hours: number
          created_at: string
          data_region: string
          default_currency: string
          evidence_required: boolean
          operating_model: string
          organization_id: string
          project_visibility: string
          retention_days: number
          strategic_objectives: string[]
          timezone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approval_escalation_hours?: number
          created_at?: string
          data_region?: string
          default_currency?: string
          evidence_required?: boolean
          operating_model?: string
          organization_id: string
          project_visibility?: string
          retention_days?: number
          strategic_objectives?: string[]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approval_escalation_hours?: number
          created_at?: string
          data_region?: string
          default_currency?: string
          evidence_required?: boolean
          operating_model?: string
          organization_id?: string
          project_visibility?: string
          retention_days?: number
          strategic_objectives?: string[]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          archived_at: string | null
          compliance_status: string
          contact_email: string | null
          contract_end: string | null
          contract_start: string | null
          contract_value: number | null
          created_at: string
          data_sensitivity: string
          id: string
          name: string
          notes: string | null
          organization_id: string
          owner_id: string | null
          phone: string | null
          primary_contact: string | null
          region: string | null
          renewal_notice_days: number | null
          risk_level: string
          service_category: string | null
          sla_percent: number | null
          status: string
          updated_at: string
          vendor_type: string
        }
        Insert: {
          archived_at?: string | null
          compliance_status?: string
          contact_email?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contract_value?: number | null
          created_at?: string
          data_sensitivity?: string
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          owner_id?: string | null
          phone?: string | null
          primary_contact?: string | null
          region?: string | null
          renewal_notice_days?: number | null
          risk_level?: string
          service_category?: string | null
          sla_percent?: number | null
          status?: string
          updated_at?: string
          vendor_type?: string
        }
        Update: {
          archived_at?: string | null
          compliance_status?: string
          contact_email?: string | null
          contract_end?: string | null
          contract_start?: string | null
          contract_value?: number | null
          created_at?: string
          data_sensitivity?: string
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          owner_id?: string | null
          phone?: string | null
          primary_contact?: string | null
          region?: string | null
          renewal_notice_days?: number | null
          risk_level?: string
          service_category?: string | null
          sla_percent?: number | null
          status?: string
          updated_at?: string
          vendor_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_owner_id_organization_id_fkey"
            columns: ["owner_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { raw_token: string }; Returns: string }
      claim_directory_membership: { Args: never; Returns: string }
      delete_organization: { Args: { target_org: string }; Returns: undefined }
      enqueue_automation_rule: {
        Args: { p_input?: Json; p_rule_id: string }
        Returns: string
      }
      has_role: { Args: { org: string; roles: string[] }; Returns: boolean }
      has_role_for: {
        Args: { actor: string; org: string; roles: string[] }
        Returns: boolean
      }
      ingest_integration_event: {
        Args: {
          p_connection_id: string
          p_event_key: string
          p_external_id?: string
          p_payload?: Json
          p_secret: string
        }
        Returns: {
          event_id: number
          run_ids: string[]
        }[]
      }
      invitation_preview: {
        Args: { raw_token: string }
        Returns: {
          email: string
          organization_name: string
        }[]
      }
      is_himark_admin: { Args: never; Returns: boolean }
      is_member_of: { Args: { org: string }; Returns: boolean }
      list_organization_members: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          full_name: string
          role_id: string
          status: string
          user_id: string
        }[]
      }
      list_provisioned_organizations: {
        Args: never
        Returns: {
          admin_email: string
          created_at: string
          id: string
          name: string
          slug: string
          status: string
        }[]
      }
      provision_organization: {
        Args: {
          p_actor_id: string
          p_admin_email: string
          p_expires_at: string
          p_name: string
          p_slug: string
          p_tier?: string
          p_token_hash: string
        }
        Returns: string
      }
      reissue_invitation: {
        Args: {
          p_actor_id: string
          p_email: string
          p_expires_at: string
          p_organization_id: string
          p_token_hash: string
        }
        Returns: undefined
      }
      reorder_framework_phases: {
        Args: { p_framework_id: string; p_phase_ids: string[] }
        Returns: undefined
      }
      rls_test_give_azure_identity: {
        Args: { target_email: string; target_user_id: string }
        Returns: undefined
      }
      rotate_integration_secret: {
        Args: { p_connection_id: string }
        Returns: string
      }
      search_organization_records: {
        Args: {
          result_limit?: number
          search_query: string
          target_organization: string
        }
        Returns: {
          href: string
          rank: number
          record_id: string
          resource: string
          subtitle: string
          title: string
          updated_at: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
