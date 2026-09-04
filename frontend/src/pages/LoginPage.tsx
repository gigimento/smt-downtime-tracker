import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Activity, ScanLine } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { getApiErrorMessage } from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardBody } from '../components/ui/Card';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [badgeCode, setBadgeCode] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(badgeCode, pinCode || undefined);
      navigate('/scan', { replace: true });
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Pogrešan barkod ili PIN'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-4">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">SMT Downtime Tracker</h1>
          <p className="text-gray-500 mt-1">Prijavi se skeniranjem barkoda i PIN-a</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Barkod operatera
                </label>
                <Input
                  type="text"
                  value={badgeCode}
                  onChange={(e) => setBadgeCode(e.target.value)}
                  placeholder="Skeniraj barkod..."
                  required
                  autoFocus
                  autoComplete="off"
                  className="text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  PIN kod
                </label>
                <Input
                  type="password"
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value)}
                  placeholder="Lični PIN ili timski PIN"
                  autoComplete="off"
                  required
                />
              </div>
              <Button type="submit" size="lg" className="w-full" loading={isLoading}>
                {isLoading ? 'Prijavljivanje...' : 'Prijavi se'}
                <ScanLine className="w-4 h-4" />
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-xs text-gray-400">
          Skeniraj svoj barkod koji koristiš za logovanje na mašinama
        </p>
      </div>
    </div>
  );
}
