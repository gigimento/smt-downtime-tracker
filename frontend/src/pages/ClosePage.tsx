import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, Lock, ArrowLeft, X } from 'lucide-react';
import { downtimeApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatDateTime, formatDuration, getCategoryLabel, getCategoryColor } from '../lib/utils';
import type { DowntimeEvent, DowntimeCategory } from '../types';

export function ClosePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [downtime, setDowntime] = useState<DowntimeEvent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  
  const [closureCode, setClosureCode] = useState('');
  const [closureComment, setClosureComment] = useState('');
  const [showCodeHint, setShowCodeHint] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchDowntime();
  }, [id]);

  const fetchDowntime = async () => {
    try {
      if (!id) return;
      const response = await downtimeApi.get(id);
      setDowntime(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri učitavanju zastoja.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !downtime) return;
    
    setError(null);
    setSuccess(null);
    setIsClosing(true);

    try {
      await downtimeApi.close(id, {
        closure_code: closureCode,
        closure_comment: closureComment || undefined,
      });
      
      setSuccess('Zastoj uspešno zatvoren!');
      setTimeout(() => navigate('/active'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri zatvaranju. Proverite šifru.');
    } finally {
      setIsClosing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <Card>
          <CardBody className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (error && !downtime) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <Card>
          <CardBody className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-danger-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Greška</h3>
            <p className="text-gray-500 mb-4">{error}</p>
            <Button onClick={() => navigate('/active')}>Nazad na aktivne</Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!downtime) return null;

  const responsibleTeams = getResponsibleTeams(downtime.category);

  return (
    <div className="max-w-md mx-auto mt-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/active')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Zatvaranje zastoja</h1>
          <p className="text-gray-500 text-sm">#{downtime.id.slice(0, 8)}...</p>
        </div>
      </div>

      {/* Downtime Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Detalji zastoja</h3>
            <Badge variant={getCategoryColor(downtime.category) as any}>
              {getCategoryLabel(downtime.category)}
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500">Mašina</p>
              <p className="font-medium">{downtime.machine_code}</p>
            </div>
            <div>
              <p className="text-gray-500">Linija</p>
              <p className="font-medium">{downtime.line || 'N/A'}</p>
            </div>
            <div>
              <p className="text-gray-500">Operater</p>
              <p className="font-medium">{downtime.opened_by_name}</p>
            </div>
            <div>
              <p className="text-gray-500">Počeo</p>
              <p className="font-medium">{formatDateTime(downtime.started_at)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500">Trajanje</p>
              <p className="font-medium text-danger-600 text-lg">{formatDuration(downtime.duration_seconds)}</p>
            </div>
            {downtime.sub_category && (
              <div className="col-span-2">
                <p className="text-gray-500">Podkategorija</p>
                <p className="font-medium">{downtime.sub_category.replace(/_/g, ' ')}</p>
              </div>
            )}
            {downtime.problem_description && (
              <div className="col-span-2">
                <p className="text-gray-500">Opis</p>
                <p className="font-medium">{downtime.problem_description}</p>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Responsible Teams Info */}
      <Card>
        <CardBody className="flex items-center gap-2 p-3 bg-warning-50 border-warning-200">
          <Lock className="w-5 h-5 text-warning-600 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-warning-800">Samo zaduženi timovi mogu zatvoriti:</p>
            <p className="text-warning-700">{responsibleTeams.join(', ')}</p>
          </div>
        </CardBody>
      </Card>

      {/* Error/Success Messages */}
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

      {/* Close Form */}
      <Card>
        <CardBody className="space-y-5">
          <form onSubmit={handleClose}>
            {/* Closure Code */}
            <div>
              <label htmlFor="closure-code" className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                Šifra za zatvaranje <span className="text-danger-500">*</span>
                <button
                  type="button"
                  onClick={() => setShowCodeHint(!showCodeHint)}
                  className="text-xs text-primary-600 hover:underline"
                >
                  {showCodeHint ? 'Sakrij' : 'Prikaži'} napomenu
                </button>
              </label>
              <Input
                id="closure-code"
                type="password"
                value={closureCode}
                onChange={(e) => setClosureCode(e.target.value)}
                placeholder="Unesite šifru tima ili ličnu šifru"
                required
                autoComplete="off"
                className="text-lg letter-spacing-wider"
              />
              {showCodeHint && (
                <p className="text-xs text-gray-500 mt-1">
                  Unesite PIN kod svog tima (Održavanje/Proces/Proizvodnja/Kvalitet) 
                  ili vašu ličnu šifru. Samo zaduženi tim može zatvoriti ovaj zastoj.
                </p>
              )}
            </div>

            {/* Closure Comment */}
            <div>
              <label htmlFor="closure-comment" className="block text-sm font-medium text-gray-700 mb-1.5">
                Komentar (opciono)
              </label>
              <Textarea
                id="closure-comment"
                value={closureComment}
                onChange={(e) => setClosureComment(e.target.value)}
                placeholder="Šta je urađeno, koliko je trajalo, zamenjeni delovi..."
                rows={3}
                maxLength={1000}
              />
              <p className="text-xs text-gray-500 mt-1">{closureComment.length}/1000 karaktera</p>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <Button type="submit" size="lg" className="w-full" loading={isClosing} variant="success">
                {isClosing ? 'Zatvaranje...' : 'Zatvori zastoj'}
                <CheckCircle className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Cancel */}
      <div className="text-center">
        <Button variant="ghost" onClick={() => navigate('/active')}>
          <X className="w-4 h-4" />
          Odustani
        </Button>
      </div>
    </div>
  );
}

function getResponsibleTeams(category: DowntimeCategory): string[] {
  const mapping: Record<string, string[]> = {
    machine_fault: ['Održavanje', 'Proces'],
    material_shortage: ['Proizvodnja'],
    program_setup: ['Proces'],
    planned_maintenance: ['Održavanje'],
    quality_issue: ['Kvalitet'],
    free_shift: ['Planeri (bez alarma)'],
    weekend: ['Planeri (bez alarma)'],
    unplanned_other: ['Proces'],
  };
  return mapping[category] || ['Proces'];
}