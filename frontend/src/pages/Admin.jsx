import { useState, useEffect } from 'react';
import api from '../api';

function fmt(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}); }
function fmtCPF(v) {
  const d = (v||'').replace(/\D/g,'');
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export default function Admin() {
  const [sellers, setSellers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal,   setModal]     = useState(false);
  const [form,    setForm]      = useState({ name:'', email:'', cpf:'', password:'', confirm:'' });
  const [saving,  setSaving]    = useState(false);
  const [err,     setErr]       = useState('');
  const [msg,     setMsg]       = useState('');
  const [assigning, setAssigning] = useState(false);

  async function assignLeadsToMe() {
    if (!confirm('Atribuir todos os leads SEM responsável para você?')) return;
    setAssigning(true);
    try {
      const { data } = await api.post('/leads/assign-me');
      setMsg(`✅ ${data.updated} lead(s) atribuído(s) a você com sucesso!`);
      setTimeout(() => setMsg(''), 5000);
    } catch(e) {
      setErr(e.response?.data?.error || 'Erro ao atribuir.');
    } finally { setAssigning(false); }
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const { data } = await api.get('/admin/sellers'); setSellers(data); }
    catch(e) { setErr(e.response?.data?.error || 'Erro ao carregar.'); }
    finally { setLoading(false); }
  }

  function set(k, v) { setForm(f => ({...f, [k]:v})); }

  async function save() {
    if (!form.name || !form.email || !form.password) { setErr('Preencha nome, e-mail e senha.'); return; }
    if (form.password !== form.confirm) { setErr('Senhas não conferem.'); return; }
    if (form.password.length < 6) { setErr('Senha deve ter ao menos 6 caracteres.'); return; }
    setSaving(true); setErr('');
    try {
      await api.post('/admin/sellers', { name:form.name, email:form.email, cpf:form.cpf, password:form.password });
      setModal(false);
      setForm({ name:'', email:'', cpf:'', password:'', confirm:'' });
      setMsg('Vendedor criado com sucesso!');
      setTimeout(() => setMsg(''), 4000);
      load();
    } catch(e) {
      setErr(e.response?.data?.error || 'Erro ao criar.');
    } finally { setSaving(false); }
  }

  async function toggleAtivo(seller) {
    try {
      await api.put(`/admin/sellers/${seller.id}`, { ativo: !seller.ativo });
      load();
    } catch(e) { alert(e.response?.data?.error || 'Erro.'); }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>👥 Vendedores</h1>
          <span className="text-muted" style={{fontSize:13}}>Gerenciamento de equipe comercial</span>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-ghost" onClick={assignLeadsToMe} disabled={assigning}>
            {assigning ? '⏳…' : '🔗 Atribuir leads sem dono para mim'}
          </button>
          <button className="btn btn-primary" onClick={() => { setErr(''); setModal(true); }}>
            ＋ Novo Vendedor
          </button>
        </div>
      </div>

      {msg && <div className="alert alert-low" style={{marginBottom:16}}>✅ {msg}</div>}

      {/* Tabela */}
      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          {loading ? (
            <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Carregando…</div>
          ) : sellers.length === 0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>
              Nenhum vendedor cadastrado ainda.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th>CPF</th>
                  <th>Leads Ativos</th>
                  <th>Em Produção</th>
                  <th>MRR</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sellers.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{fontWeight:600}}>{s.name}</div>
                      <div style={{fontSize:11,color:'var(--muted)'}}>{s.email}</div>
                    </td>
                    <td style={{fontSize:12,color:'var(--muted)'}}>{s.cpf ? fmtCPF(s.cpf) : '—'}</td>
                    <td style={{textAlign:'center',fontWeight:600}}>{s.leads_ativos||0}</td>
                    <td style={{textAlign:'center',fontWeight:600,color:'var(--success)'}}>{s.leads_producao||0}</td>
                    <td style={{fontWeight:700,color:'var(--success)'}}>{fmt(s.mrr)}</td>
                    <td>
                      <span style={{
                        fontSize:11, padding:'2px 10px', borderRadius:20, fontWeight:600,
                        background: s.ativo ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
                        color: s.ativo ? 'var(--success)' : 'var(--danger)',
                      }}>
                        {s.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleAtivo(s)}>
                        {s.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal criar vendedor */}
      {modal && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div className="modal" style={{maxWidth:480}}>
            <div className="modal-header">
              <h2>👤 Novo Vendedor</h2>
              <button className="close-btn" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-high">{err}</div>}
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Nome completo *</label>
                  <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="João Silva" />
                </div>
                <div className="form-group">
                  <label>CPF</label>
                  <input value={form.cpf} onChange={e=>set('cpf',e.target.value.replace(/\D/g,''))}
                    placeholder="000.000.000-00" maxLength={11} />
                </div>
              </div>
              <div className="form-group">
                <label>E-mail *</label>
                <input type="email" value={form.email} onChange={e=>set('email',e.target.value)}
                  placeholder="vendedor@empresa.com" />
              </div>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label>Senha *</label>
                  <input type="password" value={form.password} onChange={e=>set('password',e.target.value)}
                    placeholder="Mín. 6 caracteres" />
                </div>
                <div className="form-group">
                  <label>Confirmar senha *</label>
                  <input type="password" value={form.confirm} onChange={e=>set('confirm',e.target.value)}
                    placeholder="Repita a senha" />
                </div>
              </div>
              <div style={{fontSize:12, color:'var(--muted)', padding:'8px 12px', background:'var(--card2)', borderRadius:'var(--radius)'}}>
                💡 O vendedor fará login com e-mail e senha e verá apenas os leads que criou ou está responsável.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ Criando…' : 'Criar Vendedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
