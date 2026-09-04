import { useState, useEffect, useCallback } from 'react';
import type { ComponentType } from 'react';
import {
  BarChart as BarChartIcon,
  PieChart,
  TrendingUp,
  Calendar,
  Filter,
  Loader2,
  FileSpreadsheet,
  Check,
  AlertCircle,
} from 'lucide-react';
import { downtimeApi, kpiApi, exportApi, getApiErrorMessage } from '../services/api';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Select } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { getCategoryLabel, getCategoryColor } from '../lib/utils';
import type { DowntimeCategory, KPIMonthlyResponse } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = [
  '#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4',
];

type ReportTab = 'monthly' | 'daily' | 'top';
type SummaryColor = 'primary' | 'warning' | 'danger' | 'success' | 'gray';
type IconComponent = ComponentType<{ className?: string }>;

interface DailyCategoryStat {
  category: DowntimeCategory;
  hours?: number;
  count: number;
}

interface DailyKPIResponse {
  total_hours?: number;
  total_events?: number;
  availability_pct?: number;
  by_category?: DailyCategoryStat[];
}

interface TopCause {
  sub_category: string;
  category: DowntimeCategory;
  count: number;
  total_hours?: number;
}

interface TopCausesResponse {
  top_causes?: TopCause[];
}

export function ReportsPage() {
  const [kpiData, setKpiData] = useState<KPIMonthlyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedLine, setSelectedLine] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ReportTab>('monthly');
  const [dailyData, setDailyData] = useState<DailyKPIResponse | null>(null);
  const [topCausesData, setTopCausesData] = useState<TopCausesResponse | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const lines = ['', 'SMT-01', 'SMT-02', 'ASSEMBLY-01', 'ASSEMBLY-02', 'INJECTION-01'];

  const fetchMonthlyKPI = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await downtimeApi.getMonthlyKPI(selectedYear, selectedMonth);
      setKpiData(response.data);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Greška pri učitavanju izveštaja'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(null);
    setError(null);
    try {
      const filename = await exportApi.monthlyKpi({
        year: selectedYear,
        month: selectedMonth,
        line: selectedLine || undefined,
      });
      setExportSuccess(filename);
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Greška pri eksportu izveštaja'));
    } finally {
      setIsExporting(false);
    }
  };

  const fetchDailyKPI = useCallback(async () => {
    try {
      setSectionError(null);
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const response = await kpiApi.daily(dateStr);
      setDailyData(response.data as DailyKPIResponse);
    } catch (err: unknown) {
      setSectionError(getApiErrorMessage(err, 'Greška pri učitavanju dnevnog KPI'));
    }
  }, [selectedYear, selectedMonth]);

  const fetchTopCauses = useCallback(async () => {
    try {
      setSectionError(null);
      const response = await kpiApi.topCauses(30, 15);
      setTopCausesData(response.data as TopCausesResponse);
    } catch (err: unknown) {
      setSectionError(getApiErrorMessage(err, 'Greška pri učitavanju top uzroka'));
    }
  }, []);

  useEffect(() => {
    fetchMonthlyKPI();
    fetchDailyKPI();
    fetchTopCauses();
  }, [fetchMonthlyKPI, fetchDailyKPI, fetchTopCauses]);

  if (isLoading && !kpiData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Izveštaji i KPI</h1>
          <p className="text-gray-500 mt-1">Analiza zastoja i dostupnosti linija</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <Select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-auto"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </Select>
            <Select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-auto"
            >
              {months.map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </Select>
            <Select
              value={selectedLine}
              onChange={(e) => setSelectedLine(e.target.value)}
              className="w-auto"
              title="Filtriraj po liniji"
            >
              {lines.map((l) => (
                <option key={l || 'all'} value={l}>{l || 'Sve linije'}</option>
              ))}
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={fetchMonthlyKPI} loading={isLoading}>
            <Filter className="w-4 h-4" />
            Filtriraj
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            loading={isExporting}
            disabled={isExporting}
            title="Eksportuj u Excel (.xlsx)"
          >
            {exportSuccess ? (
              <>
                <Check className="w-4 h-4" />
                Sačuvan
              </>
            ) : isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Eksportujem...
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-4 h-4" />
                Izvezi Excel
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">
          <span>{error}</span>
        </div>
      )}

      {/* Export success */}
      {exportSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 border border-success-200 text-success-700">
          <FileSpreadsheet className="w-4 h-4" />
          <span className="font-medium">Fajl preuzet:</span>
          <span className="text-sm">{exportSuccess}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4" role="tablist">
          {[
            { id: 'monthly', label: 'Mesečni pregled', icon: BarChartIcon },
            { id: 'daily', label: 'Dnevni prikaz', icon: Calendar },
            { id: 'top', label: 'Top uzroci', icon: TrendingUp },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {sectionError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{sectionError}</span>
        </div>
      )}
      {activeTab === 'monthly' && kpiData && <MonthlyTab data={kpiData} />}
      {activeTab === 'daily' && dailyData && <DailyTab data={dailyData} />}
      {activeTab === 'top' && topCausesData && <TopCausesTab data={topCausesData} />}
    </div>
  );
}

function MonthlyTab({ data }: { data: KPIMonthlyResponse }) {
  const totalHours = data.total_downtime_hours;
  
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Ukupno zastoja"
          value={`${totalHours.toFixed(1)}h`}
          icon={BarChartIcon}
          color="primary"
        />
        <SummaryCard
          title="Broj događaja"
          value={data.total_events.toString()}
          icon={PieChart}
          color="warning"
        />
        <SummaryCard
          title="Gubitak dostupnosti"
          value={`${data.availability_loss_pct.toFixed(2)}%`}
          icon={TrendingUp}
          color={data.availability_loss_pct > 5 ? 'danger' : 'success'}
        />
        <SummaryCard
          title="Prosečno po događaju"
          value={`${(totalHours / (data.total_events || 1) * 60).toFixed(0)} min`}
          icon={BarChartIcon}
          color="gray"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Bar Chart */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Zastoji po kategoriji</h3>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.by_category}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} tickFormatter={getCategoryLabel} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'Sati', angle: -90, position: 'insideLeft', offset: 10 }} />
                <Tooltip 
                  formatter={(value: number) => [`${value.toFixed(1)}h`, 'Ukupno sati']}
                  labelFormatter={getCategoryLabel}
                />
                <Bar dataKey="total_hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Category Pie Chart */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Distribucija vremena</h3>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={data.by_category.map((d, i) => ({
                    ...d,
                    color: COLORS[i % COLORS.length],
                  }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="total_hours"
                  nameKey="category"
                  label={({ category, total_hours, percentage }) => (
                    `${getCategoryLabel(category)}: ${total_hours.toFixed(1)}h (${percentage.toFixed(1)}%)`
                  )}
                  labelLine={false}
                >
                  {data.by_category.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `${value.toFixed(1)}h`} labelFormatter={getCategoryLabel} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Machine */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Po mašinama</h3>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-gray-200">
              {data.by_machine.slice(0, 10).map((m, i) => (
                <div key={m.code} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm text-gray-500">{i + 1}.</span>
                    <div>
                      <p className="font-medium text-gray-900">{m.code}</p>
                      <p className="text-xs text-gray-500">{m.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{m.total_hours.toFixed(1)}h</p>
                    <p className="text-xs text-gray-500">{m.count} događaja</p>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* By Line */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Po linijama</h3>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-gray-200">
              {data.by_line.map((l) => (
                <div key={l.line} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">Linija {l.line}</p>
                    <p className="text-xs text-gray-500">{l.count} događaja</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{l.total_hours.toFixed(1)}h</p>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Category Detail Table */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Detalji po kategorijama</h3>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Kategorija</th>
                  <th className="px-6 py-3 text-right">Broj događaja</th>
                  <th className="px-6 py-3 text-right">Ukupno sati</th>
                  <th className="px-6 py-3 text-right">Procenat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.by_category.map((cat) => (
                  <tr key={cat.category} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Badge variant={getCategoryColor(cat.category)}>
                          {getCategoryLabel(cat.category)}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-900">{cat.count}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">{cat.total_hours.toFixed(1)}</td>
                    <td className="px-6 py-4 text-right text-gray-500">{cat.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function DailyTab({ data }: { data: DailyKPIResponse }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard title="Ukupno sati" value={`${data.total_hours?.toFixed(1) || 0}h`} icon={BarChartIcon} color="primary" />
        <SummaryCard title="Događaji" value={data.total_events?.toString() || '0'} icon={PieChart} color="warning" />
        <SummaryCard title="Dostupnost" value={`${data.availability_pct?.toFixed(1) || 100}%`} icon={TrendingUp} color="success" />
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Po kategorijama</h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.by_category?.map((cat) => (
              <div key={cat.category} className="p-4 rounded-lg bg-gray-50">
                <Badge variant={getCategoryColor(cat.category)} className="mb-2">
                  {getCategoryLabel(cat.category)}
                </Badge>
                <p className="text-2xl font-bold text-gray-900">{cat.hours?.toFixed(1) || 0}h</p>
                <p className="text-sm text-gray-500">{cat.count} događaja</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function TopCausesTab({ data }: { data: TopCausesResponse }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">Top {data.top_causes?.length || 0} uzroka zastoja (poslednjih 30 dana)</h3>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">#</th>
                  <th className="px-6 py-3">Uzrok</th>
                  <th className="px-6 py-3">Kategorija</th>
                  <th className="px-6 py-3 text-right">Broj</th>
                  <th className="px-6 py-3 text-right">Ukupno sati</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data.top_causes?.map((cause, i) => (
                  <tr key={cause.sub_category} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-500">{i + 1}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {cause.sub_category.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getCategoryColor(cause.category)}>
                        {getCategoryLabel(cause.category)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-900">{cause.count}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">{cause.total_hours?.toFixed(1) || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default ReportsPage;

function SummaryCard({ title, value, icon: Icon, color }: { title: string; value: string; icon: IconComponent; color: SummaryColor }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600 border-primary-200',
    warning: 'bg-warning-50 text-warning-600 border-warning-200',
    danger: 'bg-danger-50 text-danger-600 border-danger-200',
    success: 'bg-success-50 text-success-600 border-success-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${colors[color as keyof typeof colors] || colors.primary}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}
