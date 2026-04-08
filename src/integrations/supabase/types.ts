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
      dashboard_preferences: {
        Row: {
          created_at: string
          id: string
          selected_kpis: string[]
          show_advanced_kpis: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          selected_kpis?: string[]
          show_advanced_kpis?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          selected_kpis?: string[]
          show_advanced_kpis?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          branch_id: string | null
          company_id: string
          created_at: string
          duplicate_rows: number
          error_rows: number
          file_name: string
          id: string
          published_at: string | null
          status: string
          total_rows: number
          uploaded_at: string
          uploaded_by: string
          valid_rows: number
        }
        Insert: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          duplicate_rows?: number
          error_rows?: number
          file_name: string
          id?: string
          published_at?: string | null
          status?: string
          total_rows?: number
          uploaded_at?: string
          uploaded_by: string
          valid_rows?: number
        }
        Update: {
          branch_id?: string | null
          company_id?: string
          created_at?: string
          duplicate_rows?: number
          error_rows?: number
          file_name?: string
          id?: string
          published_at?: string | null
          status?: string
          total_rows?: number
          uploaded_at?: string
          uploaded_by?: string
          valid_rows?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          access_scope: string
          avatar_url: string | null
          branch_id: string | null
          company_id: string
          created_at: string
          email: string
          id: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          access_scope?: string
          avatar_url?: string | null
          branch_id?: string | null
          company_id?: string
          created_at?: string
          email: string
          id: string
          name?: string
          role?: string
          updated_at?: string
        }
        Update: {
          access_scope?: string
          avatar_url?: string | null
          branch_id?: string | null
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      quality_issues: {
        Row: {
          chassis_no: string
          company_id: string
          created_at: string
          field: string
          id: string
          import_batch_id: string | null
          issue_type: string
          message: string
          severity: string
        }
        Insert: {
          chassis_no: string
          company_id?: string
          created_at?: string
          field: string
          id?: string
          import_batch_id?: string | null
          issue_type: string
          message: string
          severity?: string
        }
        Update: {
          chassis_no?: string
          company_id?: string
          created_at?: string
          field?: string
          id?: string
          import_batch_id?: string | null
          issue_type?: string
          message?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_issues_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          kpi_id: string
          label: string
          sla_days: number
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          kpi_id: string
          label: string
          sla_days: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          kpi_id?: string
          label?: string
          sla_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          assigned_user_id: string | null
          bg_date: string | null
          bg_to_delivery: number | null
          bg_to_disb: number | null
          bg_to_shipment_etd: number | null
          branch_code: string
          chassis_no: string
          company_branch_id: string | null
          company_id: string
          contra_sola: string | null
          created_at: string
          customer_name: string
          date_received_by_outlet: string | null
          dealer_transfer_price: string | null
          delivery_date: string | null
          delivery_to_disb: number | null
          disb_date: string | null
          etd_to_outlet: number | null
          full_payment_date: string | null
          full_payment_type: string | null
          id: string
          import_batch_id: string | null
          invoice_no: string | null
          is_d2d: boolean
          lou: string | null
          model: string
          obr: string | null
          outlet_to_reg: number | null
          payment_method: string
          reg_date: string | null
          reg_no: string | null
          reg_to_delivery: number | null
          remark: string | null
          salesman_name: string
          shipment_eta_kk_twu_sdk: string | null
          shipment_etd_pkg: string | null
          shipment_name: string | null
          source_row_id: string | null
          updated_at: string
          vaa_date: string | null
          variant: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code?: string
          chassis_no: string
          company_branch_id?: string | null
          company_id?: string
          contra_sola?: string | null
          created_at?: string
          customer_name?: string
          date_received_by_outlet?: string | null
          dealer_transfer_price?: string | null
          delivery_date?: string | null
          delivery_to_disb?: number | null
          disb_date?: string | null
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean
          lou?: string | null
          model?: string
          obr?: string | null
          outlet_to_reg?: number | null
          payment_method?: string
          reg_date?: string | null
          reg_no?: string | null
          reg_to_delivery?: number | null
          remark?: string | null
          salesman_name?: string
          shipment_eta_kk_twu_sdk?: string | null
          shipment_etd_pkg?: string | null
          shipment_name?: string | null
          source_row_id?: string | null
          updated_at?: string
          vaa_date?: string | null
          variant?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          bg_date?: string | null
          bg_to_delivery?: number | null
          bg_to_disb?: number | null
          bg_to_shipment_etd?: number | null
          branch_code?: string
          chassis_no?: string
          company_branch_id?: string | null
          company_id?: string
          contra_sola?: string | null
          created_at?: string
          customer_name?: string
          date_received_by_outlet?: string | null
          dealer_transfer_price?: string | null
          delivery_date?: string | null
          delivery_to_disb?: number | null
          disb_date?: string | null
          etd_to_outlet?: number | null
          full_payment_date?: string | null
          full_payment_type?: string | null
          id?: string
          import_batch_id?: string | null
          invoice_no?: string | null
          is_d2d?: boolean
          lou?: string | null
          model?: string
          obr?: string | null
          outlet_to_reg?: number | null
          payment_method?: string
          reg_date?: string | null
          reg_no?: string | null
          reg_to_delivery?: number | null
          remark?: string | null
          salesman_name?: string
          shipment_eta_kk_twu_sdk?: string | null
          shipment_etd_pkg?: string | null
          shipment_name?: string | null
          source_row_id?: string | null
          updated_at?: string
          vaa_date?: string | null
          variant?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_row: {
        Args: {
          row_assigned_user_id?: string
          row_branch_code: string
          row_company_id: string
        }
        Returns: boolean
      }
      get_my_access_scope: {
        Args: never
        Returns: {
          user_access_scope: string
          user_branch_id: string
          user_company_id: string
          user_role: string
        }[]
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
