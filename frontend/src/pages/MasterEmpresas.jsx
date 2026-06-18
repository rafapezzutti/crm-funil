import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';

const EMPTY_FORM = { name:'', cnpj:'', telefone:'', email:'', password:'', confirmPassword:'', status:'ativo' };

function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type='text', autoFocus }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus}
      style={{ width:'100%', boxSizing:'border-box', padding:'8px 12px', borderRadius:8, fontSize:14 }} />
  );
}

function CompanyModal({ company, onClose, onSave }) {
  const isNew = !company?.id;
  const [form,    setForm]    = useState(
    company
      ? { name: company.name, cnpj: company.cnpj || '', telefone: company.telefone || '',
          email:'', password:'', confirmPassword:'', status: company.status || 'ativo' }
      : EMPTY_FORM
  );
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  // Verificação de senhas em tempo real
  const pwMatch = !form.password || !form.confirmPassword || form.password === form.confirmPassword;

  async function handleSave() {
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return; }
    if (isNew) {
      if (!form.email.trim())    { setError('E-mail é obrigatório.'); return; }
      if (!form.password)        { setError('Senha é obrigatória.'); return; }
      if (form.password.length < 6) { setError('Senha deve ter pelo menos 6 caracteres.'); return; }
      if (form.password !== form.confirmPassword) { setError('As senhas não coincidem.'); return; }
    }
    setSaving(true); setError('');
    try {
      const payload = isNew
        ? { name: form.name, cnpj: form.cnpj, telefone: form.telefone, email: form.email, password: form.password, status: form.status }
        : { name: form.name, cnpj: form.cnpj, telefone: form.telefone, status: form.status };
      const { data } = isNew
        ? await api.post('/master/companies', payload)
        : await api.put('/master/companies/' + company.id, payload);
      onSave(data, isNew);
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao salvar');
    } finally { setSaving(false); }
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      background:'rgba(0,0,0,.7)', display:'flex', alignItems:'center', justifyContent:'center', padding:16,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card" style={{ width:480, padding:28, borderRadius:14, maxHeight:'90vh', overflowY:'auto' }}>
        <h2 style={{ margin:'0 0 20px', fontSize:16 }}>
          {isNew ? '🏢 Nova Empresa' : '✏️ Editar empresa'}
        </h2>

        <Field label="Nome da empresa *">
          <Input value={form.name} onChange={set('name')} placeholder="Ex: Petshop do João" autoFocus />
        </Field>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <Field label="CNPJ">
            <Input value={form.cnpj} onChange={set('cnpj')} placeholder="00.000.000/0001-00" />
          </Field>
          <Field label="Telefone">
            <Input value={form.telefone} onChange={set('telefone')} placeholder="(00) 00000-0000" />
          </Field>
        </div>

        {isNew && (
          <>
            <div style={{ borderTop:'1px solid var(--border)', margin:'4px 0 16px', paddingTop:14 }}>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>
                👤 Acesso do administrador — o cliente usará estas credenciais para entrar no CRM
              </div>
              <Field label="E-mail *">
                <Input value={form.email} onChange={set('email')} placeholder="admin@empresa.com" type="email" />
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <Field label="Senha *">
                    <Input value={form.password} onChange={set('password')} placeholder="mínimo 6 caracteres" type="password" />
                  </Field>
                </div>
                <div>
                  <Field label="Confirmar senha *">
                    <Input value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="repita a senha" type="password" />
                  </Field>
                </div>
              </div>
              {form.password && form.confirmPassword && (
                <div style={{ fontSize:11, marginTop:-8, marginBottom:8,
                  color: pwMatch ? 'var(--success)' : 'var(--danger)' }}>
                  {pwMatch ? '✅ Senhas idênticas' : '❌ Senhas não coincidem'}
                </div>
              )}
            </div>
          </>
        )}

        <Field label="Status">
          <div style={{ display:'flex', gap:8, marginTop:2 }}>
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
        </Field>

        {error && <div style={{ color:'var(--danger)', fontSize:12, marginBottom:12 }}>{error}</div>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || (!pwMatch && isNew)}>
            {saving ? 'Salvando…' : isNew ? 'Criar empresa' : 'Salvar'}
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
