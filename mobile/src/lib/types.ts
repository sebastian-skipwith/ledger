// Shared data types mirroring the backend API contract.

export interface User {
  id: string;
  email: string;
  full_name: string;
  tier: 'free' | 'pro' | 'wealth';
}

export interface Account {
  id: string;
  name: string;
  official_name?: string | null;
  type: string; // 'depository' | 'investment' | 'credit' | 'loan' | ...
  subtype: string | null;
  current_balance: number;
  available_balance?: number | null;
  previous_balance?: number | null;
  currency?: string | null;
  institution_name?: string | null;
  linked_institution?: string | null;
  mask?: string | null;
  color?: string | null;
  is_hidden?: boolean;
}

export interface FinancialSummary {
  net_worth: number;
  cash: number;
  investments: number;
  retirement: number;
  total_debt: number;
  monthly_bills: number;
}

// GET /api/summary/hud
export interface Hud {
  net_worth: number;
  cash: number;
  investments: number;
  retirement: number;
  total_debt: number;
  monthly_bills: number;
  safe_to_spend: { amount: number; until: string };
  credit_week: { spent: number };
  bills_7d: { total: number; count: number };
  goal_progress: { diff: number; goals_count: number; status: 'none' | 'behind' | 'ahead' | 'on_track' };
}
