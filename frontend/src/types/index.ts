export type UserRole = 'operator' | 'maintenance' | 'process' | 'planner' | 'quality' | 'admin';

export interface Team {
  id: string;
  code: string;
  name: string;
  telegram_topic_id: number | null;
  pin_code: string | null;
  created_at: string;
}

export interface User {
  id: string;
  badge_code: string;
  full_name: string;
  team_id: string | null;
  role: UserRole;
  pin_code: string | null;
  is_active: boolean;
  created_at: string;
  team?: Team | null;
}

export interface Machine {
  id: string;
  code: string;
  name: string;
  line: string | null;
  type: 'DECAN_S2' | 'DECAN_L2' | 'CONVEYOR' | 'OTHER';
  is_active: boolean;
  created_at: string;
}

export type DowntimeCategory = 
  | 'machine_fault'
  | 'material_shortage'
  | 'program_setup'
  | 'planned_maintenance'
  | 'quality_issue'
  | 'free_shift'
  | 'weekend'
  | 'unplanned_other';

export type DowntimeSource = 'manual' | 'mes_simulator' | 'auto';

// Shift planning types
export type ShiftOverrideType = 'force_workday' | 'force_free_shift' | 'force_weekend';

export interface ShiftOverride {
  id: string;
  date: string;  // ISO date (YYYY-MM-DD)
  override_type: ShiftOverrideType;
  work_start: string | null;  // HH:MM:SS
  work_end: string | null;
  note: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanDayInfo {
  date: string;
  day_name: string;
  weekday: number;
  is_weekend: boolean;
  is_holiday: boolean;
  holiday_name: string | null;
  is_workday_by_default: boolean;
  default_category: string | null;
  has_override: boolean;
  override_type: ShiftOverrideType | null;
  override_note: string | null;
}

export interface MonthPlan {
  year: number;
  month: number;
  month_name: string;
  total_days: number;
  workday_count: number;
  weekend_count: number;
  holiday_count: number;
  work_hours: string;
  days: PlanDayInfo[];
}

export interface DowntimeEvent {
  id: string;
  machine_id: string;
  machine_code: string;
  machine_name: string;
  line: string | null;
  opened_by_user_id: string;
  opened_by_name: string;
  opened_by_badge: string;
  closed_by_user_id: string | null;
  closed_by_name: string | null;
  category: DowntimeCategory;
  sub_category: string | null;
  problem_description: string | null;
  started_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  duration_seconds: number;
  duration_formatted: string;
  closure_code: string | null;
  closure_comment: string | null;
  mes_event_id: string | null;
  source: DowntimeSource;
  is_active: boolean;
}

export interface DowntimeListItem {
  id: string;
  machine_code: string;
  machine_name: string;
  line: string | null;
  opened_by_name: string;
  category: DowntimeCategory;
  sub_category: string | null;
  problem_description: string | null;
  started_at: string;
  duration_seconds: number;
  duration_formatted: string;
  is_active: boolean;
}

export interface DowntimeFilter {
  machine_id?: string;
  category?: DowntimeCategory;
  sub_category?: string;
  opened_by_user_id?: string;
  date_from?: string;
  date_to?: string;
  only_active?: boolean;
  page?: number;
  page_size?: number;
}

export interface KPICategoryStat {
  category: DowntimeCategory;
  count: number;
  total_hours: number;
  percentage: number;
}

export interface KPITopCause {
  sub_category: string;
  count: number;
  total_hours: number;
}

export interface KPIMonthlyResponse {
  period_start: string;
  period_end: string;
  total_downtime_hours: number;
  total_events: number;
  availability_loss_pct: number;
  by_category: KPICategoryStat[];
  top_causes: KPITopCause[];
  by_machine: Array<{ code: string; name: string; count: number; total_hours: number }>;
  by_line: Array<{ line: string; count: number; total_hours: number }>;
}

export interface AuthTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginRequest {
  badge_code: string;
  pin_code?: string;
}