import { useState, useEffect, useCallback } from 'react';
import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react';
import { Plus, Edit2, Trash2, Loader2, Save, X, Users, Cpu, Shield, Calendar } from 'lucide-react';
import { getApiErrorMessage, usersApi, machinesApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Input';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { getRoleLabel } from '../lib/utils';
import { ShiftPlanningPanel } from '../components/admin/ShiftPlanningPanel';
import type { User, Team, Machine, UserRole } from '../types';

type MachineType = Machine['type'];

type TabType = 'users' | 'teams' | 'machines' | 'shifts';
interface MachineForm { code: string; name: string; line: string; type: MachineType; is_active: boolean; }
interface UserForm { badge_code: string; full_name: string; team_id: string; role: UserRole; pin_code: string; is_active: boolean; }
interface TeamForm { code: string; name: string; telegram_topic_id: number | null; pin_code: string; }

const emptyUserForm: UserForm = { badge_code: '', full_name: '', team_id: '', role: 'operator', pin_code: '', is_active: true };
const emptyTeamForm: TeamForm = { code: '', name: '', telegram_topic_id: null, pin_code: '' };
const emptyMachineForm: MachineForm = { code: '', name: '', line: '', type: 'DECAN_S2', is_active: true };

type IconComponent = ComponentType<{ className?: string }>;
type MessageSetter = Dispatch<SetStateAction<string | null>>;

const TABS: { id: TabType; label: string; icon: IconComponent }[] = [
  { id: 'users', label: 'Korisnici', icon: Users },
  { id: 'teams', label: 'Timovi', icon: Shield },
  { id: 'machines', label: 'Mašine', icon: Cpu },
  { id: 'shifts', label: 'Radno vreme', icon: Calendar },
];

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Users
  const [users, setUsers] = useState<User[]>([]);

  // Teams
  const [teams, setTeams] = useState<Team[]>([]);

  // Machines
  const [machines, setMachines] = useState<Machine[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (activeTab === 'users') {
        const r = await usersApi.list();
        setUsers(r.data);
      } else if (activeTab === 'teams') {
        const r = await usersApi.listTeams();
        setTeams(r.data);
      } else if (activeTab === 'machines') {
        const r = await machinesApi.list();
        setMachines(r.data);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Greška pri učitavanju'));
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Administracija</h1>
      {error && <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700">{error}</div>}
      {success && <div className="p-3 rounded-lg bg-success-50 border border-success-200 text-success-700">{success}</div>}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}>
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UserSection users={users} teams={teams} isLoading={isLoading}
        onRefresh={loadData} setError={setError} setSuccess={setSuccess} />}
      {activeTab === 'teams' && <TeamSection teams={teams} isLoading={isLoading}
        onRefresh={loadData} setError={setError} setSuccess={setSuccess} />}
      {activeTab === 'machines' && <MachineSection machines={machines} isLoading={isLoading}
        onRefresh={loadData} setError={setError} setSuccess={setSuccess} />}
      {activeTab === 'shifts' && <ShiftPlanningPanel />}
    </div>
  );
}

function UserSection({
  users,
  teams,
  isLoading,
  onRefresh,
  setError,
  setSuccess,
}: {
  users: User[];
  teams: Team[];
  isLoading: boolean;
  onRefresh: () => void;
  setError: MessageSetter;
  setSuccess: MessageSetter;
}) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>({ badge_code: '', full_name: '', team_id: '', role: 'operator', pin_code: '', is_active: true });

  const openCreate = () => { setEditing(null); setForm(emptyUserForm); setModal(true); };
  const openEdit = (u: User) => { setEditing(u); setForm({ badge_code: u.badge_code, full_name: u.full_name, team_id: u.team_id || '', role: u.role, pin_code: '', is_active: u.is_active }); setModal(true); };

  const save = async () => {
    try {
      if (editing) { await usersApi.update(editing.id, form); setSuccess('Korisnik ažuriran'); }
      else { await usersApi.create(form); setSuccess('Korisnik kreiran'); }
      setModal(false); onRefresh();
    } catch (err: unknown) { setError(getApiErrorMessage(err, 'Greška')); }
  };

  const remove = async (id: string) => {
    if (!confirm('Deaktivirati korisnika ako ima istoriju, ili obrisati ako nema zapisa?')) return;
    try { await usersApi.delete(id); setSuccess('Korisnik uklonjen ili deaktiviran'); onRefresh(); }
    catch (err: unknown) { setError(getApiErrorMessage(err, 'Greška')); }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="font-semibold">Korisnici ({users.length})</span>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Novi korisnik</Button>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div> :
        <div className="overflow-x-auto">
          <table className="w-full"><thead className="bg-gray-50">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase">
              <th className="px-6 py-3">Barkod</th><th className="px-6 py-3">Ime</th>
              <th className="px-6 py-3">Tim</th><th className="px-6 py-3">Uloga</th>
              <th className="px-6 py-3">Status</th><th className="px-6 py-3"></th>
            </tr>
          </thead><tbody className="divide-y divide-gray-200">
            {users.map((u: User) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-mono text-sm">{u.badge_code}</td>
                <td className="px-6 py-4 font-medium">{u.full_name}</td>
                <td className="px-6 py-4">{u.team?.name || '-'}</td>
                <td className="px-6 py-4"><Badge variant="primary">{getRoleLabel(u.role)}</Badge></td>
                <td className="px-6 py-4">{u.is_active ? <Badge variant="success">Aktivan</Badge> : <Badge variant="gray">Neaktivan</Badge>}</td>
                <td className="px-6 py-4 text-right"><div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Edit2 className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(u.id)}><Trash2 className="w-4 h-4 text-danger-500" /></Button>
                </div></td>
              </tr>
            ))}
          </tbody></table>
        </div>}
      </CardBody>
      {modal && <FormModal title={editing ? 'Izmeni korisnika' : 'Novi korisnik'} onClose={() => setModal(false)} onSave={save}>
        <Input placeholder="Barkod kod" value={form.badge_code} onChange={(e) => setForm({ ...form, badge_code: e.target.value })} required />
        <Input placeholder="Ime i prezime" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        <Select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
          <option value="">Bez tima</option>
          {teams.map((t: Team) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
        </Select>
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
          <option value="operator">Operater</option>
          <option value="maintenance">Održavanje</option>
          <option value="process">Proces</option>
          <option value="planner">Planer</option>
          <option value="quality">Kvalitet</option>
          <option value="admin">Admin</option>
        </Select>
        <Input type="password" placeholder="PIN kod (opciono)" value={form.pin_code} onChange={(e) => setForm({ ...form, pin_code: e.target.value })} />
      </FormModal>}
    </Card>
  );
}

function TeamSection({
  teams,
  isLoading,
  onRefresh,
  setError,
  setSuccess,
}: {
  teams: Team[];
  isLoading: boolean;
  onRefresh: () => void;
  setError: MessageSetter;
  setSuccess: MessageSetter;
}) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [form, setForm] = useState<TeamForm>({ code: '', name: '', telegram_topic_id: null, pin_code: '' });

  const openCreate = () => { setEditing(null); setForm(emptyTeamForm); setModal(true); };
  const openEdit = (t: Team) => { setEditing(t); setForm({ code: t.code, name: t.name, telegram_topic_id: t.telegram_topic_id, pin_code: '' }); setModal(true); };

  const save = async () => {
    try {
      const payload = {
        code: form.code,
        name: form.name,
        telegram_topic_id: form.telegram_topic_id || undefined,
        pin_code: form.pin_code || undefined,
      };
      if (editing) { await usersApi.updateTeam(editing.id, payload); setSuccess('Tim ažuriran'); }
      else { await usersApi.createTeam(payload); setSuccess('Tim kreiran'); }
      setModal(false); onRefresh();
    } catch (err: unknown) { setError(getApiErrorMessage(err, 'Greška')); }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="font-semibold">Timovi ({teams.length})</span>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Novi tim</Button>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div> :
        <div className="divide-y divide-gray-200">
          {teams.map((t: Team) => (
            <div key={t.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
              <div><p className="font-medium">{t.name}</p><p className="text-xs text-gray-500 font-mono">{t.code} | Telegram topic ID: {t.telegram_topic_id || 'Nije podešen'}</p></div>
              <Button variant="ghost" size="sm" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4" /></Button>
            </div>
          ))}
        </div>}
      </CardBody>
      {modal && <FormModal title={editing ? 'Izmeni tim' : 'Novi tim'} onClose={() => setModal(false)} onSave={save}>
        <Input placeholder="Kod tima (npr. MAINT)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <Input placeholder="Naziv" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input type="number" placeholder="Telegram Topic ID" value={form.telegram_topic_id ?? ''} onChange={(e) => setForm({ ...form, telegram_topic_id: e.target.value ? Number(e.target.value) : null })} />
        <Input type="password" placeholder="PIN kod tima" value={form.pin_code} onChange={(e) => setForm({ ...form, pin_code: e.target.value })} />
      </FormModal>}
    </Card>
  );
}

function MachineSection({
  machines,
  isLoading,
  onRefresh,
  setError,
  setSuccess,
}: {
  machines: Machine[];
  isLoading: boolean;
  onRefresh: () => void;
  setError: MessageSetter;
  setSuccess: MessageSetter;
}) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [form, setForm] = useState<MachineForm>({ code: '', name: '', line: '', type: 'DECAN_S2', is_active: true });

  const openCreate = () => { setEditing(null); setForm(emptyMachineForm); setModal(true); };
  const openEdit = (m: Machine) => { setEditing(m); setForm({ code: m.code, name: m.name, line: m.line || '', type: m.type, is_active: m.is_active }); setModal(true); };

  const save = async () => {
    try {
      if (editing) { await machinesApi.update(editing.id, form); setSuccess('Mašina ažurirana'); }
      else { await machinesApi.create(form); setSuccess('Mašina kreirana'); }
      setModal(false); onRefresh();
    } catch (err: unknown) { setError(getApiErrorMessage(err, 'Greška')); }
  };

  const remove = async (id: string) => {
    if (!confirm('Deaktivirati mašinu ako ima istoriju, ili obrisati ako nema zapisa?')) return;
    try { await machinesApi.delete(id); setSuccess('Mašina uklonjena ili deaktivirana'); onRefresh(); }
    catch (err: unknown) { setError(getApiErrorMessage(err, 'Greška')); }
  };

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <span className="font-semibold">Mašine ({machines.length})</span>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Nova mašina</Button>
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary-600" /></div> :
        <div className="divide-y divide-gray-200">
          {machines.map((m: Machine) => (
            <div key={m.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
              <div>
                <p className="font-medium">{m.code}</p>
                <p className="text-xs text-gray-500">{m.name} | Linija: {m.line || '-'} | Tip: {m.type}</p>
              </div>
              <div className="flex items-center gap-2">
                {m.is_active ? <Badge variant="success">Aktivna</Badge> : <Badge variant="gray">Neaktivna</Badge>}
                <Button variant="ghost" size="sm" onClick={() => openEdit(m)}><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => remove(m.id)}><Trash2 className="w-4 h-4 text-danger-500" /></Button>
              </div>
            </div>
          ))}
        </div>}
      </CardBody>
      {modal && <FormModal title={editing ? 'Izmeni mašinu' : 'Nova mašina'} onClose={() => setModal(false)} onSave={save}>
        <Input placeholder="Kod (npr. DECAN-S2-01)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        <Input placeholder="Naziv" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <Input placeholder="Linija (npr. SMT-01)" value={form.line} onChange={(e) => setForm({ ...form, line: e.target.value })} />
        <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MachineType })}>
          <option value="DECAN_S2">DECAN S2</option><option value="DECAN_L2">DECAN L2</option>
          <option value="CONVEYOR">Conveyor</option><option value="OTHER">Ostalo</option>
        </Select>
      </FormModal>}
    </Card>
  );
}

export default AdminPage;

function FormModal({ title, children, onClose, onSave }: { title: string; children: ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">{children}</div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <Button variant="outline" onClick={onClose}>Odustani</Button>
          <Button onClick={onSave}><Save className="w-4 h-4" /> Sačuvaj</Button>
        </div>
      </div>
    </div>
  );
}
