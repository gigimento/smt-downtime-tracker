import { useState, useEffect } from 'react';
import {
  Calendar,
  Loader2,
  Check,
  X as XIcon,
  Plus,
  Sparkles,
  Trash2,
  Briefcase,
  Coffee,
  TreePine,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { shiftApi } from '../../services/api';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { Button } from '../ui/Button';
import { Select } from '../ui/Input';
import { Badge } from '../ui/Badge';
import type { MonthPlan, PlanDayInfo, ShiftOverrideType } from '../../types';

const MONTH_NAMES = [
  '', 'Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun',
  'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar',
];

const DAY_NAMES = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'];

const OVERRIDE_LABELS: Record<ShiftOverrideType, { label: string; color: string; icon: any }> = {
  force_workday: { label: 'Radni dan', color: 'bg-success-100 text-success-800', icon: Briefcase },
  force_free_shift: { label: 'Slobodno', color: 'bg-warning-100 text-warning-800', icon: Coffee },
  force_weekend: { label: 'Vikend', color: 'bg-gray-200 text-gray-800', icon: TreePine },
};

export function ShiftPlanningPanel() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [plan, setPlan] = useState<MonthPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<PlanDayInfo | null>(null);

  useEffect(() => {
    loadPlan();
  }, [year, month]);

  const loadPlan = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await shiftApi.previewPlan(year, month);
      setPlan(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri učitavanju plana');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyPlan = async (dryRun: boolean = false) => {
    setIsApplying(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await shiftApi.applyPlan(year, month, true, dryRun);
      const data = response.data;
      if (dryRun) {
        setSuccess(
          `Dry-run: ${data.created_count} neradnih dana bi bilo kreirano, ${data.skipped_count} preskočeno (već postoje).`
        );
      } else {
        setSuccess(
          `Uspešno kreirano ${data.created_count} override-a, ${data.skipped_count} preskočeno.`
        );
        await loadPlan();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri primeni plana');
    } finally {
      setIsApplying(false);
    }
  };

  const handleAddOverride = async (date: string, type: ShiftOverrideType, note: string) => {
    try {
      await shiftApi.createOverride({ date, override_type: type, note });
      setSuccess(`Override za ${date} uspešno dodat`);
      setSelectedDay(null);
      await loadPlan();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri kreiranju');
    }
  };

  const handleDeleteOverride = async (id: string) => {
    if (!confirm('Obriši ovaj override?')) return;
    try {
      await shiftApi.deleteOverride(id);
      setSuccess('Override obrisan');
      await loadPlan();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri brisanju');
    }
  };

  const renderCalendar = () => {
    if (!plan) return null;

    // Build weeks: prvi dan meseca, dopuni sa prethodnim mesecom (pon=0)
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startOffset = (firstDay.getDay() + 6) % 7; // pon=0
    const daysInMonth = lastDay.getDate();

    const cells: (PlanDayInfo | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const info = plan.days.find((day) => day.date === dateStr);
      if (info) cells.push(info);
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d: string) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">
            {d}
          </div>
        ))}
        {cells.map((cell: PlanDayInfo | null, idx: number) => {
          if (!cell) return <div key={idx} className="h-20" />;
          return (
            <DayCell
              key={cell.date}
              day={cell}
              onClick={() => setSelectedDay(cell)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header sa kontrolama */}
      <div className="flex flex-wrap items-center gap-3">
        <Calendar className="w-5 h-5 text-primary-600" />
        <h2 className="text-lg font-semibold text-gray-900">Planiranje radnog vremena</h2>

        <div className="ml-auto flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="input !w-20 text-sm"
          >
            {[2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => {
              if (month === 1) { setMonth(12); setYear(y => y - 1) }
              else { setMonth(m => m - 1) }
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-lg font-semibold text-gray-900 min-w-[120px] text-center">
            {MONTH_NAMES[month]}
          </span>
          <button
            onClick={() => {
              if (month === 12) { setMonth(1); setYear(y => y + 1) }
              else { setMonth(m => m + 1) }
            }}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Poruke */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">
          <XIcon className="w-4 h-4" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 border border-success-200 text-success-700">
          <Check className="w-4 h-4" /> {success}
        </div>
      )}

      {/* Statistika + akcije */}
      {plan && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Ukupno dana" value={plan.total_days} icon={Calendar} color="gray" />
          <StatCard label="Radnih dana" value={plan.workday_count} icon={Briefcase} color="success" />
          <StatCard label="Vikend" value={plan.weekend_count} icon={TreePine} color="gray" />
          <StatCard label="Praznika" value={plan.holiday_count} icon={Coffee} color="warning" />
        </div>
      )}

      {/* Generator akcije */}
      {plan && (
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">Automatsko generisanje</p>
                <p className="text-sm text-gray-500">
                  Radno vreme: <span className="font-medium">{plan.work_hours}</span>
                  {' • '}
                  {plan.weekend_count + plan.holiday_count} neradnih dana
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleApplyPlan(true)}
                  loading={isApplying}
                >
                  <Sparkles className="w-4 h-4" />
                  Preview
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApplyPlan(false)}
                  loading={isApplying}
                  disabled={plan.weekend_count + plan.holiday_count === 0}
                >
                  <Plus className="w-4 h-4" />
                  Primeni za ceo mesec
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Kalendar */}
      <Card>
        <CardHeader>
          <h3 className="font-semibold text-gray-900">
            {plan ? (
              <span>
                {plan.workday_count} radnih dana
                <span className="text-gray-400 mx-2">•</span>
                {plan.work_hours}
              </span>
            ) : 'Učitavam...'}
          </h3>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : (
            renderCalendar()
          )}
        </CardBody>
      </Card>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Legend color="bg-success-100 border-success-300" label="Radni dan" />
        <Legend color="bg-gray-100 border-gray-300" label="Vikend" />
        <Legend color="bg-warning-100 border-warning-300" label="Praznik" />
        <Legend color="bg-primary-100 border-primary-300" label="Klikni na dan za override" />
      </div>

      {/* Lista override-a */}
      {plan && plan.days.some((d) => d.has_override) && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Aktivni override-i za ovaj mesec</h3>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-gray-200">
              {plan.days
                .filter((d: PlanDayInfo) => d.has_override)
                .map((d: PlanDayInfo) => {
                  const overrideInfo = OVERRIDE_LABELS[d.override_type!];
                  const Icon = overrideInfo.icon;
                  return (
                    <div key={d.date} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <Icon className="w-4 h-4 text-gray-500" />
                        <div>
                          <p className="font-medium text-gray-900">{d.date} - {d.day_name}</p>
                          <p className="text-xs text-gray-500">{d.override_note || '-'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={overrideInfo.color.includes('success') ? 'success' : overrideInfo.color.includes('warning') ? 'warning' : 'gray' as any}>
                          {overrideInfo.label}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // Find override id and delete
                            shiftApi.listOverrides({ date_from: d.date, date_to: d.date }).then((res) => {
                              const ov = res.data[0];
                              if (ov) handleDeleteOverride(ov.id);
                            });
                          }}
                        >
                          <Trash2 className="w-4 h-4 text-danger-600" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Modal za override */}
      {selectedDay && (
        <OverrideModal
          day={selectedDay}
          onClose={() => setSelectedDay(null)}
          onSave={handleAddOverride}
        />
      )}
    </div>
  );
}

function DayCell({ day, onClick }: { day: PlanDayInfo; onClick: () => void }) {
  let bgClass = 'bg-white hover:bg-gray-50 border-gray-200';
  let badge = null;

  if (day.is_holiday) {
    bgClass = 'bg-warning-50 hover:bg-warning-100 border-warning-300';
    badge = <span className="text-xs">🎉</span>;
  } else if (day.is_weekend) {
    bgClass = 'bg-gray-50 hover:bg-gray-100 border-gray-300';
  } else {
    bgClass = 'bg-success-50/50 hover:bg-success-50 border-success-200';
  }

  if (day.has_override) {
    bgClass = 'bg-primary-50 hover:bg-primary-100 border-primary-400 ring-1 ring-primary-300';
  }

  const dayNum = parseInt(day.date.split('-')[2], 10);

  return (
    <button
      onClick={onClick}
      className={`h-20 p-2 rounded-lg border text-left transition-colors ${bgClass}`}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-semibold text-gray-900">{dayNum}</span>
        {badge}
      </div>
      {day.has_override && (
        <div className="mt-1">
          <Badge variant="primary" className="text-[10px] px-1.5 py-0">
            OVERRIDE
          </Badge>
        </div>
      )}
      {day.is_holiday && !day.has_override && (
        <p className="text-[10px] text-warning-700 mt-1 line-clamp-1">{day.holiday_name}</p>
      )}
    </button>
  );
}

function StatCard({ label, value, icon: Icon, color }: any) {
  const colors: Record<string, string> = {
    success: 'bg-success-50 text-success-700 border-success-200',
    warning: 'bg-warning-50 text-warning-700 border-warning-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    primary: 'bg-primary-50 text-primary-700 border-primary-200',
  };
  return (
    <Card>
      <CardBody className="flex items-center gap-3 p-4">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded border ${color}`} />
      <span className="text-gray-600">{label}</span>
    </div>
  );
}

function OverrideModal({
  day,
  onClose,
  onSave,
}: {
  day: PlanDayInfo;
  onClose: () => void;
  onSave: (date: string, type: ShiftOverrideType, note: string) => void;
}) {
  const [overrideType, setOverrideType] = useState<ShiftOverrideType>('force_free_shift');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (day.is_holiday) {
      setOverrideType('force_free_shift');
      setNote(day.holiday_name || '');
    } else if (day.is_weekend) {
      setOverrideType('force_weekend');
      setNote(`${day.day_name} (vikend)`);
    } else {
      setOverrideType('force_workday');
      setNote('');
    }
  }, [day]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Override za {day.date}</h3>
            <p className="text-sm text-gray-500">{day.day_name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tip</label>
            <Select value={overrideType} onChange={(e) => setOverrideType(e.target.value as ShiftOverrideType)}>
              <option value="force_workday">Radni dan</option>
              <option value="force_free_shift">Slobodno (free_shift)</option>
              <option value="force_weekend">Vikend</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Napomena</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="npr. Praznik rada, Radna subota..."
              className="input"
              maxLength={200}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" size="sm" onClick={onClose}>Otkaži</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onSave(day.date, overrideType, note)}
          >
            <Check className="w-4 h-4" />
            Sačuvaj
          </Button>
        </div>
      </div>
    </div>
  );
}
