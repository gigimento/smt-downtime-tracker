import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { cn } from '../../lib/utils';
import { getRoleLabel } from '../../lib/utils';
import { downtimeApi } from '../../services/api';
import type { DowntimeCategory, DowntimeListItem } from '../../types';
import {
  Activity,
  CheckCircle,
  BarChart,
  Settings,
  User,
  ChevronDown,
  Menu,
  AlertTriangle,
  X,
  Clock,
  CalendarDays,
} from 'lucide-react';

const navigation = [
  { name: 'Skeniranje', href: '/scan', icon: Activity },
  { name: 'Aktivni zastoji', href: '/active', icon: AlertTriangle },
  { name: 'Zatvaranje', href: '/close', icon: CheckCircle },
  { name: 'Izveštaji', href: '/reports', icon: BarChart },
  { name: 'Admin', href: '/admin', icon: Settings, roles: ['admin', 'planner', 'process'] },
];

// --- Floating Active Downtime Ticker ---
// WebSocket URL - koristi isti host kao API
const WS_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws') + '/ws';

type WSState = 'connecting' | 'open' | 'closed' | 'error';
type WebSocketDowntimeItem = Partial<DowntimeListItem> & {
  id: string;
  machine_code?: string;
  category?: DowntimeCategory;
  elapsed_seconds?: number;
};
type DowntimeWebSocketMessage = {
  type?: string;
  items?: WebSocketDowntimeItem[];
};

function FloatingTicker() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeDowntimes, setActiveDowntimes] = useState<DowntimeListItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(true);
  const [wsState, setWsState] = useState<WSState>('closed');
  const wsRef = useRef<WebSocket | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);

  // Helper: konvertuj WS item u DowntimeListItem (za prikaz)
  const mapWsItem = (item: WebSocketDowntimeItem): DowntimeListItem => ({
    id: item.id,
    machine_code: item.machine_code || '',
    machine_name: item.machine_code || '',
    line: null,
    opened_by_name: item.opened_by_name || '',
    category: item.category || 'unplanned_other',
    sub_category: item.sub_category ?? null,
    problem_description: item.problem_description ?? null,
    started_at: item.started_at || new Date().toISOString(),
    duration_seconds: item.elapsed_seconds || 0,
    duration_formatted: '',
    is_active: true,
  });

  // WebSocket konekcija sa reconnect logikom i polling fallback-om
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem('access_token');
    if (!token) return;

    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (cancelled) return;
      setWsState('connecting');
      try {
        const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelled) return;
          setWsState('open');
          reconnectAttemptRef.current = 0;
          // Ako je polling radio, ugasi ga
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        };

        ws.onmessage = (event) => {
          if (cancelled) return;
          try {
            const msg = JSON.parse(event.data) as DowntimeWebSocketMessage;
            if (msg.type === 'active_update' && Array.isArray(msg.items)) {
              // Mapiramo WS items u oblik koji FloatingTicker očekuje
              setActiveDowntimes(msg.items.map(mapWsItem));
            } else if (msg.type === 'downtime_opened' || msg.type === 'downtime_closed' || msg.type === 'downtime_acknowledged') {
              if (Array.isArray(msg.items)) {
                setActiveDowntimes(msg.items.map(mapWsItem));
              }
            }
            // 'pong' / 'keepalive' ignorišemo
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          if (cancelled) return;
          setWsState('error');
        };

        ws.onclose = () => {
          if (cancelled) return;
          setWsState('closed');
          wsRef.current = null;
          // Reconnect sa exponential backoff (max 30s)
          const attempt = reconnectAttemptRef.current++;
          const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
          reconnectTimerRef.current = setTimeout(connect, delay);

          // Polling fallback dok se ne povežemo nazad
          if (!pollInterval) {
            const poll = async () => {
              try {
                const res = await downtimeApi.getActive();
                setActiveDowntimes(res.data);
              } catch {
                // ignore
              }
            };
            poll(); // odmah
            pollInterval = setInterval(poll, 5000); // češće nego 10s kad padne WS
          }
        };
      } catch {
        setWsState('error');
        // Fallback: polling
        if (!pollInterval) {
          pollInterval = setInterval(async () => {
            try {
              const res = await downtimeApi.getActive();
              setActiveDowntimes(res.data);
            } catch {}
          }, 5000);
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (pollInterval) clearInterval(pollInterval);
      if (wsRef.current) {
        wsRef.current.onclose = null; // spreci reconnect pri unmount
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user]);

  // Real-time tick every second for the oldest event
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (activeDowntimes.length === 0) return;

    const oldest = activeDowntimes[0];
    const startMs = new Date(oldest.started_at).getTime();

    const update = () => {
      const secs = Math.floor((Date.now() - startMs) / 1000);
      setElapsed(secs < 0 ? 0 : secs);
    };
    update();
    tickRef.current = setInterval(update, 1000);
    setVisible(true);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [activeDowntimes]);

  if (activeDowntimes.length === 0) return null;
  if (!visible) return null;

  const oldest = activeDowntimes[0];
  const others = activeDowntimes.length - 1;

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const timeStr = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  // Color urgency based on time
  const isUrgent = elapsed >= 1800; // 30+ min
  const isCritical = elapsed >= 3600; // 60+ min

  return (
    <div
      className={cn(
        'fixed bottom-5 right-5 z-[100] w-80 rounded-2xl shadow-2xl border backdrop-blur-sm cursor-pointer',
        'transition-all duration-300 hover:scale-[1.02] hover:shadow-3xl',
        isCritical
          ? 'bg-red-950/90 border-red-500/50'
          : isUrgent
          ? 'bg-orange-950/90 border-orange-500/50'
          : 'bg-gray-900/90 border-gray-700/60'
      )}
      onClick={() => navigate('/active')}
    >
      {/* WS status indicator (top-left, mali) */}
      <div
        className="absolute top-2 left-2 flex items-center gap-1"
        title={
          wsState === 'open' ? 'WebSocket povezan (real-time)' :
          wsState === 'connecting' ? 'Povezivanje...' :
          wsState === 'error' ? 'WS greška, polling fallback' :
          'WS disconnected, polling'
        }
      >
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            wsState === 'open' ? 'bg-green-400 animate-pulse' :
            wsState === 'connecting' ? 'bg-yellow-400 animate-pulse' :
            'bg-red-400'
          )}
        />
      </div>
      {/* Close button */}
      <button
        className="absolute top-2 right-2 p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        onClick={(e) => { e.stopPropagation(); setVisible(false); }}
        title="Sakrij (osvežava se automatski)"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      <div className="p-4 pr-8">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-3">
          {/* Pulsing dot */}
          <span className="relative flex h-3 w-3">
            <span className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              isCritical ? 'bg-red-400' : isUrgent ? 'bg-orange-400' : 'bg-red-400'
            )} />
            <span className={cn(
              'relative inline-flex rounded-full h-3 w-3',
              isCritical ? 'bg-red-500' : isUrgent ? 'bg-orange-500' : 'bg-red-500'
            )} />
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Aktivan zastoj
          </span>
          {others > 0 && (
            <span className={cn(
              'ml-auto text-xs font-bold px-2 py-0.5 rounded-full',
              isCritical
                ? 'bg-red-500/30 text-red-300'
                : isUrgent
                ? 'bg-orange-500/30 text-orange-300'
                : 'bg-gray-700 text-gray-300'
            )}>
              +{others} {others === 1 ? 'ostali' : 'ostala'}
            </span>
          )}
        </div>

        {/* Machine + category */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-white font-bold text-base leading-tight">
              {oldest.machine_code}
            </p>
            <p className="text-gray-400 text-xs mt-0.5">
              {oldest.machine_name && oldest.machine_name !== oldest.machine_code
                ? oldest.machine_name
                : oldest.line
                ? `Linija: ${oldest.line}`
                : 'Nepoznata linija'}
            </p>
          </div>
          <span className={cn(
            'text-xs font-medium px-2 py-1 rounded-lg whitespace-nowrap',
            isCritical
              ? 'bg-red-500/20 text-red-300'
              : isUrgent
              ? 'bg-orange-500/20 text-orange-300'
              : 'bg-blue-500/20 text-blue-300'
          )}>
            {getCategoryShort(oldest.category)}
          </span>
        </div>

        {/* Timer */}
        <div className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2',
          isCritical ? 'bg-red-500/15' : isUrgent ? 'bg-orange-500/15' : 'bg-white/5'
        )}>
          <Clock className={cn(
            'w-4 h-4',
            isCritical ? 'text-red-400' : isUrgent ? 'text-orange-400' : 'text-gray-400'
          )} />
          <span className={cn(
            'font-mono font-bold text-xl tracking-wider',
            isCritical ? 'text-red-300' : isUrgent ? 'text-orange-300' : 'text-white'
          )}>
            {timeStr}
          </span>
          <span className="text-gray-500 text-xs ml-auto">
            {oldest.opened_by_name?.split(' ')[0] || '—'}
          </span>
        </div>

        {/* Footer hint */}
        <p className="text-gray-600 text-xs text-center mt-2">
          Klikni za upravljanje zastojima →
        </p>
      </div>
    </div>
  );
}

function getCategoryShort(category: string): string {
  const map: Record<string, string> = {
    machine_fault: '🔧 Kvar',
    material_shortage: '📦 Materijal',
    program_setup: '💻 Program',
    planned_maintenance: '📅 Održavanje',
    quality_issue: '🔍 Kvalitet',
    free_shift: '⏸ Free shift',
    weekend: '🗓 Vikend',
    unplanned_other: '❓ Ostalo',
  };
  return map[category] || category;
}

// --- Live Clock (vreme + datum pored user menija) ---
const DAY_NAMES = ['Ned', 'Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub'];
const MONTH_NAMES = [
  'januar', 'februar', 'mart', 'april', 'maj', 'jun',
  'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar',
];

function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dayName = DAY_NAMES[now.getDay()];
  const dateStr = `${dayName}, ${now.getDate()}. ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}.`;

  return (
    <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200">
      <div className="flex items-center gap-1.5 text-gray-500">
        <CalendarDays className="w-3.5 h-3.5" />
        <span className="text-xs font-medium capitalize">{dateStr}</span>
      </div>
      <div className="h-4 w-px bg-gray-300" />
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-primary-600" />
        <span className="text-sm font-bold font-mono tabular-nums text-gray-900">
          {hh}:{mm}<span className="text-primary-600">:{ss}</span>
        </span>
      </div>
    </div>
  );
}

// --- Main Layout ---
export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const canAccess = (roles?: string[]) => {
    if (!roles || !user) return true;
    return roles.includes(user.role);
  };

  const filteredNav = navigation.filter((item) => canAccess(item.roles));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center px-6 border-b border-gray-200">
          <Link to="/scan" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-gray-900">SMT Tracker</span>
          </Link>
        </div>

        <nav className="p-4 space-y-1" role="navigation" aria-label="Main navigation">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href === '/active' && location.pathname.startsWith('/close'));
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-200">
          <div className="flex h-full items-center justify-between px-4 sm:px-6">
            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Page title */}
            <h1 className="flex-1 text-lg font-semibold text-gray-900 truncate">
              {getPageTitle(location.pathname)}
            </h1>

            {/* Live clock */}
            <LiveClock />

            {/* User menu */}
            <div className="relative">
              <button
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                  <p className="text-xs text-gray-500">{getRoleLabel(user?.role || '')}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-gray-200 focus:outline-none z-50">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900">{user?.full_name}</p>
                      <p className="text-xs text-gray-500">{user?.badge_code}</p>
                    </div>
                    <Link
                      to="/admin"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Postavke
                    </Link>
                    <button
                      onClick={() => { logout(); setUserMenuOpen(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-danger-600 hover:bg-gray-50"
                    >
                      Odjavi se
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Floating active downtime ticker */}
      <FloatingTicker />
    </div>
  );
}

function getPageTitle(pathname: string): string {
  const titles: Record<string, string> = {
    '/scan': 'Otvaranje zastoja',
    '/active': 'Aktivni zastoji',
    '/close': 'Zatvaranje zastoja',
    '/reports': 'Izveštaji i KPI',
    '/admin': 'Administracija',
    '/login': 'Prijava',
  };
  if (pathname.startsWith('/close/')) return 'Zatvaranje zastoja';
  return titles[pathname] || 'SMT Downtime Tracker';
}
