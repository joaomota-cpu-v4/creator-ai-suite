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
      app_settings: {
        Row: {
          id: boolean
          price_centavos: number
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          id?: boolean
          price_centavos?: number
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          id?: boolean
          price_centavos?: number
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          asaas_payment_id: string | null
          cpf: string | null
          created_at: string
          delivered_at: string | null
          email: string | null
          id: string
          invoice_url: string | null
          metodo: Database["public"]["Enums"]["payment_method"]
          nome: string | null
          pix_copy_paste: string | null
          pix_qr_code: string | null
          plan_id: string | null
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          sticker_id: string
          telefone: string | null
          updated_at: string
          valor_centavos: number
        }
        Insert: {
          asaas_payment_id?: string | null
          cpf?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          id?: string
          invoice_url?: string | null
          metodo: Database["public"]["Enums"]["payment_method"]
          nome?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          sticker_id: string
          telefone?: string | null
          updated_at?: string
          valor_centavos?: number
        }
        Update: {
          asaas_payment_id?: string | null
          cpf?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          id?: string
          invoice_url?: string | null
          metodo?: Database["public"]["Enums"]["payment_method"]
          nome?: string | null
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          plan_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          sticker_id?: string
          telefone?: string | null
          updated_at?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sticker_id_fkey"
            columns: ["sticker_id"]
            isOneToOne: false
            referencedRelation: "stickers"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price_centavos: number
          quantity: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price_centavos: number
          quantity: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price_centavos?: number
          quantity?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      stickers: {
        Row: {
          altura_cm: number | null
          clube: string | null
          created_at: string
          data_nascimento: string | null
          email: string
          figurinha_url: string | null
          foto_original_path: string | null
          id: string
          nome: string
          order_id: string | null
          peso_kg: number | null
          preview_url: string | null
          status: Database["public"]["Enums"]["sticker_status"]
          updated_at: string
        }
        Insert: {
          altura_cm?: number | null
          clube?: string | null
          created_at?: string
          data_nascimento?: string | null
          email: string
          figurinha_url?: string | null
          foto_original_path?: string | null
          id?: string
          nome: string
          order_id?: string | null
          peso_kg?: number | null
          preview_url?: string | null
          status?: Database["public"]["Enums"]["sticker_status"]
          updated_at?: string
        }
        Update: {
          altura_cm?: number | null
          clube?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string
          figurinha_url?: string | null
          foto_original_path?: string | null
          id?: string
          nome?: string
          order_id?: string | null
          peso_kg?: number | null
          preview_url?: string | null
          status?: Database["public"]["Enums"]["sticker_status"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_attempt_at: string
          next_retry_at: string | null
          order_id: string | null
          request_payload: Json
          response_body: string | null
          response_status: number | null
          success: boolean
          webhook_url: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_attempt_at?: string
          next_retry_at?: string | null
          order_id?: string | null
          request_payload: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_url: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_attempt_at?: string
          next_retry_at?: string | null
          order_id?: string | null
          request_payload?: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
      order_status: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED"
      payment_method: "PIX" | "CREDIT_CARD"
      sticker_status: "draft" | "generated" | "paid" | "delivered"
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
    Enums: {
      app_role: ["admin"],
      order_status: ["PENDING", "CONFIRMED", "FAILED", "REFUNDED"],
      payment_method: ["PIX", "CREDIT_CARD"],
      sticker_status: ["draft", "generated", "paid", "delivered"],
    },
  },
} as const
