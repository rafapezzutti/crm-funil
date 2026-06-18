import { useState, useEffect } from 'react';
import api from '../api';
import { useCrmTypes } from '../CrmTypesContext';
function fmt(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}); }

export default function Planos() {
  const { types, crmLabel, crmBadgeClass } = useCrmTypes();
  const [plans,   setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState({ crm:'', nome:'', valor:'', ativo:true });
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try { const { data } = await api.get('/plans'); setPlans(data); }
    finally { setLoading(false); }
  }

  function openNew()  { setForm({ crm:'', nome:'', valor:'', ativo:true }); setEditing(null); setModal(true); }
  function openEdit(p){ setForm({ crm:p.crm, nome:p.nome, valor:p.valor, ativo:p.ativo }); setEditing(p); setModal(true); }
  function set(k,v)   { setForm(f => ({...f, [k]:v})); }

  async function save() {
    if (!form.crm||!form.nome||form.valor==='') return;
    setSaving(true);
    try {
      if (editing) await api.put(`/plans/${editing.id}`, form);
      else         await api.post('/plans', form);
      setModal(false); load();
    } finally { setSaving(false); }
  }

  async function del(id) {
    if (!confirm('Excluir este plano?')) return;
    await api.delete(`/plans/${id}`); load();
  }

  const byCrm = types.reduce((acc, t) => {
    acc[t.value] = plans.filter(p => p.crm === t.value);
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>💰 Planos</h1>
          <span className="text-muted" style={{fontSize:13}}>Configuração de preços por CRM</span>
        </div>
        <button className="btn btn-primary" onClick={openNew}>＋ Novo Plano</button>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Carregando…</div>
      ) : (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16}}>
          {types.map(t => { const crm = t.value; return (
            <div key={crm} className="card">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                <span className={`badge ${crmBadgeClass(crm)}`} style={{fontSize:12}}>{crmLabel(crm)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setForm({crm,nome:'',valor:'',ativo:true}); setEditing(null); setModal(true); }}>
                  ＋
                </button>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {byCrm[crm].length===0
                  ? <div style={{color:'var(--muted)', fontSize:12, textAlign:'center', padding:8}}>Nenhum plano</div>
                  : byCrm[crm].map(p => (
                    <div key={p.id} style={{
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                      padding:'10px 12px', background:'var(--card2)', borderRadius:'var(--radius)',
                      border:`1px solid ${p.ativo?'var(--border)':'var(--border)'}`,
                      opacity: p.ativo ? 1 : 0.5,
                    }}>
                      <div>
                        <div style={{fontWeight:600, fontSize:13}}>{p.nome}</div>
                        <div style={{fontSize:11, color:'var(--muted)'}}>{p.ativo?'Ativo':'Inativo'}</div>
                      </div>
                      <div style={{display:'flex', gap:8, alignItems:'center'}}>
                        <span style={{fontWeight:700, color:'var(--success)', fontSize:14}}>{fmt(p.valor)}</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => del(p.id)}>🗑</button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ); })}
        </div>
      )}

      {modal && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div className="modal" style={{maxWidth:400}}>
            <div className="modal-header">
              <h2>{editing?'Editar Plano':'Novo Plano'}</h2>
              <button className="close-btn" onClick={() => setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>CRM *</label>
                <select value={form.crm} onChange={e => set('crm', e.target.value)}>
                  <option value="">Selecione…</option>
                  {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Nome do Plano *</label>
                <input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Academia, Clínica…" />
              </div>
              <div className="form-group">
                <label>Valor Mensal (R$) *</label>
                <input type="number" step="0.01" value={form.valor} onChange={e => set('valor', e.target.value)} />
              </div>
              <div className="form-group">
                <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', color:'var(--text)'}}>
                  <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)}
                    style={{width:16,height:16}} />
                  Plano ativo
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving||!form.crm||!form.nome||form.valor===''} onClick={save}>
                {saving?'Salvando…':editing?'Salvar':'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
