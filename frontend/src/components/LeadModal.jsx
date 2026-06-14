import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';

const CRM_OPTS_DEFAULT = ['saude','spa','esportes','pet'];
const ORIGEM_OPTS = ['whatsapp','linkedin','google','instagram','site','indicacao','evento','prospeccao_ativa','outro'];
const SCORE_OPTS  = ['muito_quente','quente','morno','frio','muito_frio'];
const ACAO_OPTS   = ['ligacao','whatsapp','demonstracao','proposta','follow_up','outro'];
const STAGE_OPTS  = ['prospeccao','negociacao','piloto','producao'];
const STAGE_LABEL = { prospeccao:'Prospecção', negociacao:'Negociação', piloto:'Piloto', producao:'Produção' };
const ROLE_LABEL  = { admin:'Admin', master:'Master', vendedor:'Vendedor' };

function optLabel(s) { return s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }

export default function LeadModal({ lead: initial, onClose, onSaved }) {
  const { user, role } = useAuth();
  const editing = !!initial;

  const [form, setForm] = useState({
    nome:'', empresa:'', email:'', telefone:'', crm:'', origem:'',
    score:'', stage:'prospeccao', obs:'',
    plano_id:'', valor_negociado:'',
    data_fechamento:'', proxima_acao:'', data_proxima_acao:'',
    responsavel_id:'',
    ...initial,
  });
  const [plans,    setPlans]   = useState([]);
  const [team,     setTeam]    = useState([]);
  const [crmOpts,  setCrmOpts] = useState(CRM_OPTS_DEFAULT);
  const [saving,   setSaving]  = useState(false);
  const [err,      setErr]     = useState('');

  // Carrega tipos de CRM da empresa
  useEffect(() => {
    api.get('/company/crm-types')
      .then(r => { if (r.data?.length) setCrmOpts(r.data.map(t => t.value)); })
      .catch(() => {});
  }, []);

  // Carrega planos quando CRM muda
  useEffect(() => {
    if (form.crm) api.get('/plans', { params:{ crm: form.crm }}).then(r => setPlans(r.data));
    else setPlans([]);
  }, [form.crm]);

  // Carrega membros da empresa para o dropdown de responsável
  useEffect(() => {
    api.get('/admin/team')
      .then(r => {
        setTeam(r.data);
        // Se vendedor, auto-seleciona a si mesmo e não permite mudar
        if (role === 'vendedor' && !initial?.responsavel_id) {
          const me = r.data.find(m => m.name === user?.name);
          if (me) setForm(f => ({...f, responsavel_id: me.id}));
        }
      })
      .catch(() => {});
  }, []);

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function save() {
    if (!form.nome.trim()) { setErr('Nome é obrigatório.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = { ...form };
      if (!payload.valor_negociado) payload.valor_negociado = null;
      if (!payload.plano_id)        payload.plano_id = null;
      if (!payload.responsavel_id)  payload.responsavel_id = null;
      if (editing) {
        await api.put(`/leads/${initial.id}`, payload);
      } else {
        await api.post('/leads', payload);
      }
      onSaved();
    } catch(e) {
      setErr(e.response?.data?.error || 'Erro ao salvar.');
    } finally { setSaving(false); }
  }

  const planOpts = plans.filter(p => p.ativo);
  const isVendedor = role === 'vendedor';

  return (
    <div className="overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{editing ? '✏️ Editar Lead' : '＋ Novo Lead'}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {err && <div className="alert alert-high">{err}</div>}

          {/* Identificação */}
          <div>
            <div className="section-title">Identificação</div>
            <div className="form-row form-row-2" style={{marginBottom:12}}>
              <div className="form-group">
                <label>Nome *</label>
                <input value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome do contato" />
              </div>
              <div className="form-group">
                <label>Empresa</label>
                <input value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="Razão social" />
              </div>
            </div>
            <div className="form-row form-row-2" style={{marginBottom:12}}>
              <div className="form-group">
                <label>E-mail</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Telefone</label>
                <input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label>Origem</label>
                <select value={form.origem} onChange={e => set('origem', e.target.value)}>
                  <option value="">Selecione…</option>
                  {ORIGEM_OPTS.map(o => <option key={o} value={o}>{optLabel(o)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Score / Temperatura</label>
                <select value={form.score} onChange={e => set('score', e.target.value)}>
                  <option value="">Selecione…</option>
                  {SCORE_OPTS.map(s => <option key={s} value={s}>{optLabel(s)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Etapa</label>
                <select value={form.stage} onChange={e => set('stage', e.target.value)}>
                  {STAGE_OPTS.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                </select>
              </div>
            </div>
          </div>

          <hr className="divider" />

          {/* Responsável */}
          <div className="form-group">
            <label>👤 Responsável (Vendedor)</label>
            {isVendedor ? (
              <input value={user?.name || 'Você'} disabled
                style={{opacity:.7, cursor:'not-allowed'}} />
            ) : (
              <select value={form.responsavel_id} onChange={e => set('responsavel_id', e.target.value)}>
                <option value="">— Sem responsável —</option>
                {team.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({ROLE_LABEL[m.role] || m.role})
                  </option>
                ))}
              </select>
            )}
          </div>

          <hr className="divider" />

          {/* Dados Comerciais */}
          <div>
            <div className="section-title">Dados Comerciais</div>
            <div className="form-row form-row-2" style={{marginBottom:12}}>
              <div className="form-group">
                <label>CRM de Interesse</label>
                <select value={form.crm} onChange={e => { set('crm', e.target.value); set('plano_id',''); }}>
                  <option value="">Selecione…</option>
                  {crmOpts.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Plano</label>
                <select value={form.plano_id} onChange={e => {
                  set('plano_id', e.target.value);
                  const p = planOpts.find(p => p.id == e.target.value);
                  if (p) set('valor_negociado', p.valor);
                }}>
                  <option value="">{form.crm ? 'Selecione…' : 'Selecione o CRM primeiro'}</option>
                  {planOpts.map(p =>
                    <option key={p.id} value={p.id}>
                      {p.nome} — R$ {Number(p.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </option>
                  )}
                </select>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label>Valor Negociado (R$)</label>
                <input type="number" step="0.01" value={form.valor_negociado}
                  onChange={e => set('valor_negociado', e.target.value)}
                  placeholder="Igual ao plano se não negociado" />
              </div>
              <div className="form-group">
                <label>Data Prev. Fechamento</label>
                <input type="date" value={form.data_fechamento||''}
                  onChange={e => set('data_fechamento', e.target.value)} />
              </div>
            </div>
          </div>

          <hr className="divider" />

          {/* Próxima ação */}
          <div>
            <div className="section-title">Próxima Ação</div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label>Tipo de Ação</label>
                <select value={form.proxima_acao} onChange={e => set('proxima_acao', e.target.value)}>
                  <option value="">Selecione…</option>
                  {ACAO_OPTS.map(a => <option key={a} value={a}>{optLabel(a)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Data da Próxima Ação</label>
                <input type="date" value={form.data_proxima_acao||''}
                  onChange={e => set('data_proxima_acao', e.target.value)} />
              </div>
            </div>
          </div>

          <hr className="divider" />

          <div className="form-group">
            <label>Observações</label>
            <textarea value={form.obs} onChange={e => set('obs', e.target.value)}
              placeholder="Notas sobre este lead…" rows={3} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCl