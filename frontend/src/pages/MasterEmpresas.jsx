import { useState, useEffect, useCallback } from 'react';
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

const EMPTY_FORM = { name:'', plan:'trial', status:'ativo' };

function CompanyModal({ company, onClose, onSave }) {
  const isNew = !company?.id;
  const [form,   setForm]   = useState(company ? { name: company.name, plan: company.plan || 'trial', status: company.status || 'ativo' } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = isNew
        ? await api.post('/master/companies', form)
        : await api.put('/master/companies/' + company.id, form);
      onSave(data, isNew);
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width:440, padding:28, borderRadius:14 }}>
        <h2 style={{ margin:'0 0 20px', fontSize:16 }}>
          {isNew ? '🏢 Nova Empresa' : '✏️ Editar empresa'}
        </h2>

        <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Nome *</label>
        <input
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
          placeholder="Ex: CRM Petshop"
          autoFocus
          style={{ width:'100%', boxSizing:'border-box', marginBottom:16, padding:'8px 12px', borderRadius:8, fontSize:14 }}
        />

        <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Plano</label>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
          {PLANS.map(p => (
            <button key={p.value} onClick={() => setForm(f => ({ ...f, plan: p.value }))} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border: '2px solid ' + (form.plan === p.value ? p.color : 'var(--border)'),
              background: form.plan === p.value ? p.color + '22' : 'var(--card2)',
              color: form.plan === p.value ? p.color : 'var(--muted)',
            }}>{p.label}</button>
          ))}
        </div>

        <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:6 }}>Status</label>
        <div style={{ display:'flex', gap:8, marginBottom:24 }}>
          {['ativo','inativo','suspenso'].map(s => (
            <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border: '2px solid ' + (form.status === s ? 'var(--accent)' : 'var(--border)'),
              background: form.status === s ? 'rgba(31,111,235,.15)' : 'var(--card2)',
              color: form.status === s ? 'var(--accent)' : 'var(--muted)',
              textTransform:'capitalize',
            }}>{s}</button>
          ))}
        </div>

        {error && <div style={{ color:'var(--danger)', fontSize:12, marginBottom:12 }}>{error}</div>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : isNew ? 'Criar' : 'Salvar'}
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
  const [modal,     setModal]     = useState(null); // null | 'create' | company obj
  const [msg,       setMsg]       = useState('');
  const [deleting,  setDeleting]  = useState(null); // id sendo deletado

  const load = useCallback(() => {
    setLoading(true);
    api.get('/master/companies')
      .then(r => setCompanies(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (role !== 'master') { navigate('/'); return; }
    load();
  }, []);

  function handleSaved(data, isNew) {
    if (isNew) {
      setCompanies(cs => [...cs, { ...data, total_leads: 0, total_robots: 0 }]);
      setMsg('✅ Empresa "' + data.name + '" criada!');
    } else {
      setCompanies(cs => cs.map(c => c.id === data.id ? { ...c, ...data } : c));
      setMsg('✅ Empresa atualizada.');
    }
    setModal(null);
  }

  async function toggleStatus(c) {
    const next = c.status === 'ativo' ? 'inativo' : 'ativo';
    try {
      const { data } = await api.put('/master/companies/' + c.id, { status: next });
      setCompanies(cs => cs.map(x => x.id === data.id ? { ...x, ...data } : x));
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.error || 'Erro ao alterar status.'));
    }
  }

  async function deleteCompany(c) {
    if (!confirm('⚠️ Excluir "' + c.name + '"?\n\nIsso removerá TODOS os leads, robôs e usuários desta empresa. Ação irreversível.')) return;
    setDeleting(c.id);
    try {
      await api.delete('/master/companies/' + c.id);
      setCompanies(cs => cs.filter(x => x.id !== c.id));
      setMsg('🗑️ Empresa "' + c.name + '" excluída.');
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.error || 'Erro ao excluir empresa.'));
    } finally { setDeleting(null); }
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
        <button className="btn btn-primary" onClick={() => setModal('create')}>+ Nova Empresa</button>
      </div>

      {msg && (
        <div style={{
          padding:'10px 16px', borderRadius:8, marginBottom:16, fontSize:13,
          background: msg.startsWith('✅') ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
          color: msg.startsWith('✅') ? 'var(--success)' : 'var(--danger)',
        }}>
          {msg}
          <button onClick={() => setMsg('')} style={{ float:'right', background:'none', border:'none', cursor:'pointer', color:'inherit' }}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>Carregando…</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {companies.map(c => (
            <div key={c.id} className="card" style={{
              padding:'14px 20px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap',
              opacity: c.status !== 'ativo' ? 0.65 : 1,
            }}>
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
                  <span style={{ fontSize:11, fontWeight:600, textTransform:'capitalize',
                    color: c.status === 'ativo' ? 'var(--success)' : c.status === 'suspenso' ? 'var(--danger)' : 'var(--muted)',
                  }}>{c.status || '—'}</span>
                </div>
              </div>

              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }}
                  onClick={() => setModal(c)}>✏️ Editar</button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px',
                  color: c.status === 'ativo' ? 'var(--warning)' : 'var(--success)' }}
                  onClick={() => toggleStatus(c)}>
                  {c.status === 'ativo' ? '⏸ Desativar' : '▶️ Ativar'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }}
                  onClick={() => impersonate(c.id)}>🎭 Entrar</button>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px', color:'var(--danger)' }}
                  onClick={() => deleteCompany(c)}
                  disabled={deleting === c.id}>
                  {deleting === c.id ? '⏳' : '🗑️ Excluir'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <CompanyModal
          company={modal === 'create' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
