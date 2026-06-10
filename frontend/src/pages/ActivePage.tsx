import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Clock, AlertCircle, CheckCircle, RotateCcw, ExternalLink } from 'lucide-react';
import { downtimeApi } from '../services/api';
import { Card, CardBody } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { formatDateTime, formatDuration, getCategoryLabel, getCategoryColor } from '../lib/utils';
import type { DowntimeListItem } from '../types';

export function ActivePage() {
  const navigate = useNavigate();
  const [downtimes, setDowntimes] = useState<DowntimeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchActive = useCallback(async () => {
    try {
      const response = await downtimeApi.getActive();
      setDowntimes(response.data);
      setError(null);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri učitavanju aktivnih zastoja');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchActive();
  }, [fetchActive]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchActive, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActive]);

  const handleAcknowledge = async (id: string) => {
    try {
      await downtimeApi.acknowledge(id);
      fetchActive();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Greška pri potvrđivanju');
    }
  };

  const handleNavigateToClose = (id: string) => {
    navigate(`/close/${id}`);
  };

  if (isLoading && downtimes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aktivni zastoji</h1>
          <p className="text-gray-500 mt-1">
            Trenutno otvoreni zastoji na liniji {'|'} 
            {lastRefresh ? `Poslednje osveženo: ${lastRefresh.toLocaleTimeString('sr-RS')}` : 'Učitavanje...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Auto-osvežavanje (10s)
          </label>
          <Button variant="outline" size="sm" onClick={fetchActive} loading={isLoading}>
            <RotateCcw className="w-4 h-4" />
            Osveži
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Downtimes List */}
      <Card>
        <CardBody className="p-0">
          {downtimes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <CheckCircle className="w-16 h-16 text-success-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">Nema aktivnih zastoja</h3>
              <p className="text-gray-500">Sve linije rade normalno</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {downtimes.map((dt) => (
                <div
                  key={dt.id}
                  className="p-4 sm:p-6 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    {/* Main info */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1 min-w-0">
                      {/* Status indicator */}
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-danger-500 animate-pulse" />
                        <div>
                          <p className="font-mono text-sm text-gray-500">#{dt.id.slice(0, 8)}</p>
                          <p className="text-lg font-semibold text-gray-900 truncate max-w-xs sm:max-w-md">
                            {dt.machine_code} {dt.machine_name && `(${dt.machine_name})`}
                          </p>
                        </div>
                      </div>

                      {/* Category badge */}
                      <Badge variant={getCategoryColor(dt.category) as any}>
                        {getCategoryLabel(dt.category)}
                        {dt.sub_category && ` • ${dt.sub_category.replace(/_/g, ' ')}`}
                      </Badge>

                      {/* Line */}
                      {dt.line && (
                        <Badge variant="gray">
                          Linija: {dt.line}
                        </Badge>
                      )}
                    </div>

                    {/* Right side - time and actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-right sm:text-left w-full sm:w-auto">
                      {/* Duration */}
                      <div className="flex items-center gap-2 text-danger-600 bg-danger-50 px-3 py-2 rounded-lg">
                        <Clock className="w-5 h-5" />
                        <div className="text-sm">
                          <p className="font-mono font-semibold">{formatDuration(dt.duration_seconds)}</p>
                          <p className="text-xs text-danger-500">Trajanje zastoja</p>
                        </div>
                      </div>

                      {/* Started at */}
                      <div className="text-sm text-gray-500 hidden sm:block">
                        <p>Počeo: <span className="font-medium text-gray-900">{formatDateTime(dt.started_at)}</span></p>
                        <p>Operater: <span className="font-medium text-gray-900">{dt.opened_by_name}</span></p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcknowledge(dt.id)}
                          className="hidden sm:inline-flex"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Potvrdi
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleNavigateToClose(dt.id)}
                        >
                          Zatvori
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {dt.problem_description && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-sm text-gray-600">{dt.problem_description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Mobile actions for each item (if needed) */}
    </div>
  );
}