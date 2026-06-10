import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  User, Team, Machine, DowntimeEvent, DowntimeListItem, DowntimeFilter,
  DowntimeCategory, KPIMonthlyResponse, AuthTokens, LoginRequest,
  ShiftOverride, ShiftOverrideType, MonthPlan
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Request interceptor to add auth token
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (data: LoginRequest) => api.post<AuthTokens>('/auth/login', data),
  me: () => api.get<User>('/auth/me'),
  refresh: () => api.post<AuthTokens>('/auth/refresh'),
};

// Downtime
export const downtimeApi = {
  open: (data: {
    badge_code: string;
    machine_code: string;
    category: DowntimeCategory;
    sub_category?: string;
    problem_description?: string;
  }) => api.post<DowntimeEvent>('/downtime/open', data),
  
  getActive: () => api.get<DowntimeListItem[]>('/downtime/active'),
  
  get: (id: string) => api.get<DowntimeEvent>(`/downtime/${id}`),
  
  getHistory: (params?: DowntimeFilter) => 
    api.get<DowntimeListItem[]>('/downtime/history', { params }),
  
  acknowledge: (id: string) => api.post<DowntimeEvent>(`/downtime/${id}/acknowledge`),
  
  close: (id: string, data: { closure_code: string; closure_comment?: string }) => 
    api.post<DowntimeEvent>(`/downtime/${id}/close`, data),
  
  getMonthlyKPI: (year?: number, month?: number) => 
    api.get<KPIMonthlyResponse>('/downtime/kpi/monthly', { params: { year, month } }),
};

// Machines
export const machinesApi = {
  list: (params?: { line?: string; type?: string; is_active?: boolean }) => 
    api.get<Machine[]>('/machines', { params }),
  
  get: (id: string) => api.get<Machine>(`/machines/${id}`),
  
  create: (data: { code: string; name: string; line?: string; type?: string }) => 
    api.post<Machine>('/machines', data),
  
  update: (id: string, data: Partial<Machine>) => 
    api.patch<Machine>(`/machines/${id}`, data),
  
  delete: (id: string) => api.delete(`/machines/${id}`),
};

// Users
export const usersApi = {
  list: (params?: { role?: string; team_id?: string; is_active?: boolean }) => 
    api.get<User[]>('/users', { params }),
  
  get: (id: string) => api.get<User>(`/users/${id}`),
  
  create: (data: { 
    badge_code: string; 
    full_name: string; 
    team_id?: string; 
    role?: string; 
    pin_code?: string 
  }) => api.post<User>('/users', data),
  
  update: (id: string, data: Partial<User>) => 
    api.patch<User>(`/users/${id}`, data),
  
  delete: (id: string) => api.delete(`/users/${id}`),
  
  // Teams
  listTeams: () => api.get<Team[]>('/users/teams/'),
  
  createTeam: (data: { code: string; name: string; telegram_topic_id?: number; pin_code?: string }) => 
    api.post<Team>('/users/teams/', data),
  
  updateTeam: (id: string, data: Partial<Team>) => 
    api.patch<Team>(`/users/teams/${id}`, data),
};

// KPI
export const kpiApi = {
  daily: (date: string, line?: string) =>
    api.get('/kpi/daily', { params: { date, line } }),

  shift: (date: string, shift: '1' | '2' | '3', line?: string) =>
    api.get('/kpi/shift', { params: { date, shift, line } }),

  topCauses: (days?: number, limit?: number, line?: string) =>
    api.get('/kpi/top-causes', { params: { days, limit, line } }),
};

// Export
export const exportApi = {
  monthlyKpi: async (params: { year?: number; month?: number; line?: string } = {}) => {
    const response = await api.get('/export/kpi/monthly.xlsx', {
      params,
      responseType: 'blob',
    });
    // Extract filename from Content-Disposition header
    const contentDisposition = response.headers['content-disposition'] || '';
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `KPI_${params.year || 'export'}.xlsx`;
    // Trigger browser download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },
};

// Shift Overrides & Planning
export const shiftApi = {
  listOverrides: (params?: { date_from?: string; date_to?: string }) =>
    api.get<ShiftOverride[]>('/shift-overrides', { params }),

  checkDate: (date: string) =>
    api.get(`/shift-overrides/check/${date}`),

  createOverride: (data: {
    date: string;
    override_type: ShiftOverrideType;
    work_start?: string;
    work_end?: string;
    note?: string;
  }) => api.post<ShiftOverride>('/shift-overrides', data),

  updateOverride: (id: string, data: Partial<{
    override_type: ShiftOverrideType;
    work_start: string;
    work_end: string;
    note: string;
  }>) => api.patch<ShiftOverride>(`/shift-overrides/${id}`, data),

  deleteOverride: (id: string) => api.delete(`/shift-overrides/${id}`),

  // Planning
  previewPlan: (year: number, month: number) =>
    api.get<MonthPlan>('/shift-overrides/plan/preview', { params: { year, month } }),

  getHolidays: (year: number) =>
    api.get<{ date: string; name: string }[]>('/shift-overrides/plan/holidays', { params: { year } }),

  applyPlan: (year: number, month: number, includeHolidays: boolean = true, dryRun: boolean = false) =>
    api.post('/shift-overrides/plan/apply', null, {
      params: { year, month, include_holidays: includeHolidays, dry_run: dryRun },
    }),
};

export default api;