import { useState, FormEvent, useRef, useEffect } from 'react';
import { ArrowRight, AlertCircle, CheckCircle, User } from 'lucide-react';
import { downtimeApi, machinesApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Input';
import { Textarea } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { getCategoryLabel, getCategoryColor, getRoleLabel } from '../lib/utils';
import type { DowntimeCategory, Machine } from '../types';

const SUBCATEGORIES: Record<DowntimeCategory, string[]> = {
  machine_fault: ['feeder_jam', 'nozzle_clog', 'head_error', 'conveyor_stuck', 'vision_error', 'other'],
  material_shortage: ['reel_empty', 'wrong_component', 'missing_reel', 'wrong_feeder', 'other'],
  program_setup: ['npi_setup', 'changeover', 'program_edit', 'component_pickup', 'substitute_component', 'other'],
  planned_maintenance: ['pm_scheduled', 'cleaning', 'calibration', 'part_replacement', 'other'],
  quality_issue: ['spi_fail', 'aoi_fail', 'first_article_fail', 'solder_bridge', 'tombstone', 'other'],
  free_shift: ['no_production', 'meeting', 'training', 'other'],
  weekend: ['no_production', 'other'],
  unplanned_other: ['power_outage', 'network_issue', 'software_crash', 'unknown', 'other'],
};

export function ScanPage() {
  const { user } = useAuth();
  const badgeRef = useRef<HTMLInputElement>(null);
  const isAdmin = user?.role === 'admin';
  
  const [badgeCode, setBadgeCode] = useState(user?.badge_code ?? '');
  const [machineCode, setMachineCode] = useState('');
  const [category, setCategory] = useState<DowntimeCategory>('machine_fault');
  const [subCategory, setSubCategory] = useState('');
  const [description, setDescription] = useState('');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch machines on mount
  useEffect(() => {
    machinesApi.list().then(res => setMachines(res.data)).catch(() => {
      setError('Greška pri učitavanju mašina. Proverite konekciju.');
    });
  }, []);

  // Auto-fill badge from logged-in user
  useEffect(() => {
    if (user?.badge_code) {
      setBadgeCode(user.badge_code);
    }
  }, [user?.badge_code]);

  // Reset subcategory when category changes
  useEffect(() => {
    setSubCategory('');
  }, [category]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await downtimeApi.open({
        badge_code: badgeCode,
        machine_code: machineCode,
        category,
        sub_category: subCategory || undefined,
        problem_description: description || undefined,
      });
      
      setSuccess(`Zastoj uspešno otvoren! ID: ${response.data.id.slice(0, 8)}...`);
      
      // Reset form but keep badge code
      if (!isAdmin && user?.badge_code) {
        setBadgeCode(user.badge_code);
      }
      setMachineCode('');
      setCategory('machine_fault');
      setSubCategory('');
      setDescription('');
      
      setTimeout(() => {
        document.getElementById('machine-code')?.focus();
      }, 100);
      
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri otvaranju zastoja. Pokušajte ponovo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter key submits form
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Otvaranje zastoja</h1>
          <p className="text-gray-500 mt-1">Popuni podatke o zastoju</p>
        </div>
      </div>

      {/* Form Card */}
      <Card>
        <CardBody className="space-y-5">
          {/* Status messages */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success-50 border border-success-200 text-success-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
            {/* Badge Code - auto-filled from logged-in user, read-only */}
            {isAdmin ? (
              <div>
                <label htmlFor="badge-code" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Barkod operatera <span className="text-danger-500">*</span>
                </label>
                <Input
                  ref={badgeRef}
                  id="badge-code"
                  type="text"
                  value={badgeCode}
                  disabled
                  placeholder="Unesi barkod operatera..."
                  required
                  autoComplete="off"
                  className="text-lg"
                />
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary-50 border border-primary-200">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-primary-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-primary-900">{user?.full_name}</p>
                  <p className="text-xs text-primary-700">
                    {user?.badge_code} · {getRoleLabel(user?.role ?? '')}
                  </p>
                </div>
              </div>
            )}

            {/* Machine Code */}
            <div>
              <label htmlFor="machine-code" className="block text-sm font-medium text-gray-700 mb-1.5">
                Mašina <span className="text-danger-500">*</span>
              </label>
              <Select
                id="machine-code"
                value={machineCode}
                onChange={(e) => setMachineCode(e.target.value)}
                required
              >
                <option value="">Izaberi mašinu...</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.code}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1.5">
                Kategorija zastoja <span className="text-danger-500">*</span>
              </label>
              <Select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as DowntimeCategory)}
                required
              >
                <option value="machine_fault">🔧 Kvar mašine</option>
                <option value="material_shortage">📦 Nedostatak materijala</option>
                <option value="program_setup">💻 Program / Setup</option>
                <option value="planned_maintenance">📅 Planirano održavanje</option>
                <option value="quality_issue">🔍 Kvalitet</option>
                <option value="free_shift">⏸ Free Shift</option>
                <option value="weekend">🗓 Vikend</option>
                <option value="unplanned_other">❓ Ostalo</option>
              </Select>
            </div>

            {/* Sub-category */}
            <div>
              <label htmlFor="sub-category" className="block text-sm font-medium text-gray-700 mb-1.5">
                Podkategorija
              </label>
              <Select
                id="sub-category"
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
              >
                <option value="">Izaberi podkategoriju...</option>
                {SUBCATEGORIES[category]?.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </option>
                ))}
              </Select>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">
                Kratak opis problema (opciono)
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Npr. Feeder 12 ne prenosi komponentu, zacepljenje..."
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-gray-500 mt-1">{description.length}/500 karaktera</p>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                {isSubmitting ? 'Otvaranje...' : 'Otvori zastoj'}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Category Legend */}
      <Card>
        <CardBody>
          <h3 className="text-sm font-medium text-gray-700 mb-3">Legenda kategorija i rutiranje alarma:</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {([
              { cat: 'machine_fault', teams: 'Održavanje + Proces' },
              { cat: 'material_shortage', teams: 'Proizvodnja' },
              { cat: 'program_setup', teams: 'Proces' },
              { cat: 'planned_maintenance', teams: 'Održavanje' },
              { cat: 'quality_issue', teams: 'Kvalitet' },
              { cat: 'free_shift', teams: 'Bez alarma' },
              { cat: 'weekend', teams: 'Bez alarma' },
              { cat: 'unplanned_other', teams: 'Proces' },
            ] as const).map(({ cat, teams }) => (
              <div key={cat} className="flex items-center gap-2">
                <Badge variant={getCategoryColor(cat) as any}>{getCategoryLabel(cat)}</Badge>
                <span className="text-gray-500">→ {teams}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}