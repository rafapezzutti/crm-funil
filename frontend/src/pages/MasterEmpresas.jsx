import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

const PLANS = [
  { value:'trial',    label:'Trial',    color:'var(--warning)' },
  { value:'starter',  label:'Starter',  color:'#60a5fa' },
  { value:'pro',      label:'Pro',      color:'#a78bfa' },
  { value:'business', label:'Business', color:'#34d399' },
  { value:'master',   label:'Master',   color:'#f59e0b' },
];

function planColor(plan) {
  return PLANS.find(p => p.value === plan)?.color || 'var(--muted)';
}

function EditModal({ company, onClose, onSave }) {
  const [name,   setName]   = useState(company.name);
  const [plan,   setPlan]   = useState(company.plan || 'trial');
  const [status, setStatus] = useState(company.status || 'ativo');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const { data } = await api.put('/master/companies/' + company.id, { name, plan, status });
      onSave(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width:420, padding:28, borderRadius:14 }}>
        <h2 style={{ margin:'0 0 20px', fontSize:16 }}>✏️ Editar empresa</h2>

        <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Nome</label>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ width:'100%', boxSizing:'border-box', marginBottom:16, padding:'8px 12px', borderRadius:8, fontSize:14 }} />

        <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Plano</label>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
          {PLANS.map(p => (
            <button key={p.value} onClick={() => setPlan(p.value)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border: '2px solid ' + (plan === p.value ? p.color : 'var(--border)'),
              background: plan === p.value ? p.color + '22' : 'var(--card2)',
              color: plan === p.value ? p.color : 'var(--muted)',
            }}>{p.label}</button>
          ))}
        </div>

        <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Status</label>
        <div style={{ display:'flex', gap:8, marginBottom:24 }}>
          {['ativo','inativo','suspenso'].map(s => (
            <button key={s} onClick={() => setStatus(s)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border: '2px solid ' + (status === s ? 'var(--accent)' : 'var(--border)'),
              background: status === s ? 'rgba(31,111,235,.15)' : 'var(--card2)',
              color: status === s ? 'var(--accent)' : 'var(--muted)',
              textTransform:'capitalize',
            }}>{s}</button>
          ))}
        </div>

        {error && <div style={{ color:'var(--danger)', fontSize:12, marginBottom:12 }}>{error}</div>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MasterEmpresas() {
  const { role, impersonate } = useAuth();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState(null);

  useEffect(() => {
    if (role !== 'master') { navigate('/'); return; }
    api.get('/master/companies')
      .then(r => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(updated) {
    setCompanies(cs => cs.map(c => c.id === updated.id ? { ...c, ...updated } : c));
    setEditing(null);
  }

  function trialDias(ends_at) {
    if (!ends_at) return null;
    const d = Math.ceil((new Date(ends_at) - Date.now()) / 86400000);
    if (d <= 0) return <span style={{ fontSize:11, color:'var(--danger)' }}>Expirado</span>;
    return <span style={{ fontSize:11, color: d <= 3 ? 'var(--danger)' : 'var(--muted)' }}>{d}d restantes</span>;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🏢 Empresas</h1>
          <span className="text-muted" style={{ fontSize:13 }}>{companies.length} clientes cadastrados</span>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>Carregando…</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {companies.map(c => (
            <div key={c.id} className="card" style={{ padding:'14px 20px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{c.name}</div>
                <div style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace', marginTop:2, opacity:.5 }}>{c.id}</div>
              </div>

              <div style={{ display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Plano</div>
                  <span style={{ fontSize:12, fontWeight:700, color: planColor(c.plan), textTransform:'uppercase' }}>{c.plan}</span>
                  {c.plan === 'trial' && <div>{trialDias(c.trial_ends_at)}</div>}
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Leads</div>
                  <div style={{ fontWeight:700 }}>{c.total_leads}</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Robôs</div>
                  <div style={{ fontWeight:700 }}>{c.total_robots}</div>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Status</div>
                  <span style={{ fontSize:11, fontWeight:600,
                    color: c.status === 'ativo' ? 'var(--success)' : c.status === 'suspenso' ? 'var(--danger)' : 'var(--muted)',
                    textTransform:'capitalize' }}>{c.status || '—'}</span>
                </div>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost" style={{ fontSize:12 }}
                  onClick={() => setEditing(c)}>
                  ✏️ Editar
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12 }}
                  onClick={() => impersonate(c.id)}>
                  🎭 Entrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          company={editing}
          onClose={() => setEditing(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
