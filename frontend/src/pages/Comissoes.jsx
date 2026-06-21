import { useState, useEffect } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';

function fmt(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}); }

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export default function Comissoes() {
  const { role } = useAuth();
  const isAdmin  = ['admin', 'master'].includes(role);

  const [sellers,  setSellers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [mes,      setMes]      = useState(mesAtual());
  const [obs,      setObs]      = useState({});
  const [saving,   setSaving]   = useState({});
  const [showRule, setShowRule] = useState(false);

  // Regras
  const [rules,     setRules]     = useState(null);
  const [rulesEdit, setRulesEdit] = useState(false);
  const [rulesForm, setRulesForm] = useState(null);
  const [rulesSaving,setRulesSaving] = useState(false);

  useEffect(() => {
    api.get('/commissions/rules').then(r => {
      setRules(r.data);
      setRulesForm(JSON.parse(JSON.stringify(r.data))); // deep copy
    }).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [mes]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/commissions', { params: { mes } });
      setSellers(data);
      const o = {};
      data.forEach(s => { o[s.seller_id] = s.obs || ''; });
      setObs(o);
    } finally { setLoading(false); }
  }

  async function saveSeller(sellerId) {
    if (!isAdmin) return;
    setSaving(s => ({...s, [sellerId]:true}));
    try {
      await api.put(`/commissions/${sellerId}`, { mes, obs: obs[sellerId] || '' });
      load();
    } finally {
      setSaving(s => ({...s, [sellerId]:false}));
    }
  }

  async function saveRules() {
    setRulesSaving(true);
    try {
      await api.put('/commissions/rules', rulesForm);
      setRules(rulesForm);
      setRulesEdit(false);
      load(); // recalcular com novas regras
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao salvar regras.');
    } finally { setRulesSaving(false); }
  }

  function updateTierPct(idx, val) {
    setRulesForm(r => {
      const tiers = [...r.tiers];
      tiers[idx] = { ...tiers[idx], pct: Number(val) };
      return { ...r, tiers };
    });
  }

  function updateTierLabel(idx, val) {
    setRulesForm(r => {
      const tiers = [...r.tiers];
      tiers[idx] = { ...tiers[idx], label: val };
      return { ...r, tiers };
    });
  }

  const [ano, mesNum] = mes.split('-');
  const mesLabel = `${MESES[parseInt(mesNum)-1]} ${ano}`;
  const totalComm = sellers.reduce((s,r) => s + parseFloat(r.valor_comissao||0), 0);
  const totalMrr  = sellers.reduce((s,r) => s + parseFloat(r.mrr||0), 0);

  const displayRules = rulesEdit ? rulesForm : rules;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>💵 Comissões</h1>
          <span className="text-muted" style={{fontSize:13}}>Calculadas automaticamente por faixa de tempo em Produção</span>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRule(r=>!r)}>
            📋 Regras
          </button>
          <label style={{fontSize:12,color:'var(--muted)',margin:0}}>Mês:</label>
          <input type="month" value={mes}
            onChange={e => setMes(e.target.value)}
            style={{width:150}} />
        </div>
      </div>

      {/* Painel de regras */}
      {showRule && displayRules && (
        <div className="card" style={{marginBottom:16, padding:16, borderLeft:'3px solid var(--accent)'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
            <div style={{fontWeight:700, fontSize:14}}>📋 Regras de Comissão</div>
            {isAdmin && !rulesEdit && (
              <button className="btn btn-ghost btn-sm" onClick={() => { setRulesForm(JSON.parse(JSON.stringify(rules))); setRulesEdit(true); }}>
                ✏️ Editar regras
              </button>
            )}
          </div>

          <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                <th style={{textAlign:'left', padding:'4px 12px 4px 0', color:'var(--muted)'}}>Período</th>
                <th style={{textAlign:'center', padding:'4px 12px', color:'var(--muted)'}}>%</th>
                {!rulesEdit && <th style={{textAlign:'left', padding:'4px 0', color:'var(--muted)'}}>Faixa (meses)</th>}
              </tr>
            </thead>
            <tbody>
              {displayRules.tiers.map((tier, idx) => (
                <tr key={idx} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'6px 12px 6px 0'}}>
                    {rulesEdit ? (
                      <input value={tier.label} onChange={e => updateTierLabel(idx, e.target.value)}
                        style={{fontSize:13, padding:'3px 6px', width:'100%'}} />
                    ) : (
                      <span style={{fontWeight:600}}>{tier.label}</span>
                    )}
                  </td>
                  <td style={{textAlign:'center', padding:'6px 12px'}}>
                    {rulesEdit ? (
                      <input type="number" min="0" max="100" value={tier.pct}
                        onChange={e => updateTierPct(idx, e.target.value)}
                        style={{fontSize:13, padding:'3px 6px', width:70, textAlign:'center'}} />
                    ) : (
                      <span style={{color:'var(--accent)', fontWeight:700}}>{tier.pct}%</span>
                    )}
                  </td>
                  {!rulesEdit && (
                    <td style={{padding:'6px 0', color:'var(--muted)', fontSize:12}}>
                      {tier.to === null
                        ? `A partir do mês ${tier.from + 1}`
                        : tier.from === tier.to
                          ? `Mês ${tier.from + 1}`
                          : `Meses ${tier.from + 1} a ${tier.to + 1}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {rulesEdit ? (
            <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
              <label style={{fontSize:12, color:'var(--muted)'}}>Prazo de pagamento:</label>
              <input type="number" min="1" value={rulesForm.payment_delay_days || 30}
                onChange={e => setRulesForm(r => ({...r, payment_delay_days: Number(e.target.value)}))}
                style={{width:60, fontSize:13, padding:'3px 6px'}} />
              <span style={{fontSize:12, color:'var(--muted)'}}>dias após o cliente pagar</span>
              <div style={{flex:1}} />
              <button className="btn btn-ghost btn-sm" onClick={() => setRulesEdit(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" disabled={rulesSaving} onClick={saveRules}>
                {rulesSaving ? '…' : '💾 Salvar regras'}
              </button>
            </div>
          ) : (
            <div style={{marginTop:10, fontSize:12, color:'var(--muted)'}}>
              ⏰ Pagamento {displayRules.payment_delay_days || 30} dias após o pagamento do cliente
              · ❌ Clientes inadimplentes não geram comissão
            </div>
          )}
        </div>
      )}

      {/* KPIs — apenas admin/master vê totais consolidados */}
      {isAdmin ? (
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24}}>
          <div className="kpi-card" style={{borderLeft:'3px solid var(--success)'}}>
            <div className="kpi-label">MRR Total</div>
            <div className="kpi-value" style={{fontSize:20,color:'var(--success)'}}>{fmt(totalMrr)}</div>
            <div className="kpi-sub">{mesLabel}</div>
          </div>
          <div className="kpi-card" style={{borderLeft:'3px solid var(--accent)'}}>
            <div className="kpi-label">Total em Comissões</div>
            <div className="kpi-value" style={{fontSize:20,color:'var(--accent)'}}>{fmt(totalComm)}</div>
            <div className="kpi-sub">{sellers.length} vendedor(es)</div>
          </div>
          <div className="kpi-card" style={{borderLeft:'3px solid var(--warning)'}}>
            <div className="kpi-label">Previsão de Pagamento</div>
            <div className="kpi-value" style={{fontSize:14,color:'var(--warning)'}}>
              {rules?.payment_delay_days || 30} dias após o cliente pagar
            </div>
            <div className="kpi-sub">Ref: {mesLabel}</div>
          </div>
        </div>
      ) : (
        /* Vendedor — card pessoal */
        sellers.length > 0 && (() => {
          const me = sellers[0];
          return (
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:24}}>
              <div className="kpi-card" style={{borderLeft:'3px solid var(--success)'}}>
                <div className="kpi-label">Minha Comissão</div>
                <div className="kpi-value" style={{fontSize:20,color:'var(--success)'}}>{fmt(me.valor_comissao)}</div>
                <div className="kpi-sub">{mesLabel}</div>
              </div>
              <div className="kpi-card" style={{borderLeft:'3px solid var(--accent)'}}>
                <div className="kpi-label">Leads em Produção</div>
                <div className="kpi-value" style={{fontSize:20,color:'var(--accent)'}}>{me.leads_producao||0}</div>
                <div className="kpi-sub">ativos: {me.leads_ativos||0}</div>
              </div>
              <div className="kpi-card" style={{borderLeft:'3px solid var(--warning)'}}>
                <div className="kpi-label">MRR</div>
                <div className="kpi-value" style={{fontSize:20,color:'var(--warning)'}}>{fmt(me.mrr)}</div>
                <div className="kpi-sub">Previsão: {me.data_pagamento || '—'}</div>
              </div>
            </div>
          );
        })()
      )}

      {/* Tabela de gestão — apenas admin/master */}
      {isAdmin && (
        <div className="card" style={{padding:0}}>
          <div className="table-wrap">
            {loading ? (
              <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Carregando…</div>
            ) : sellers.length === 0 ? (
              <div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>
                Nenhum vendedor ativo. Crie em <strong>Administração</strong>.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th style={{textAlign:'center'}}>Produção</th>
                    <th style={{textAlign:'center'}}>Ativos</th>
                    <th>MRR</th>
                    <th>Comissão Auto</th>
                    <th>Previsão Pgto</th>
                    <th>Observações</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map(s => (
                    <tr key={s.seller_id}>
                      <td>
                        <div style={{fontWeight:600}}>{s.name}</div>
                        <div style={{fontSize:11,color:'var(--muted)'}}>{s.email}</div>
                      </td>
                      <td style={{textAlign:'center',fontWeight:700,color:'var(--success)'}}>{s.leads_producao||0}</td>
                      <td style={{textAlign:'center'}}>{s.leads_ativos||0}</td>
                      <td style={{fontWeight:700}}>{fmt(s.mrr)}</td>
                      <td style={{fontWeight:700,color:'var(--accent)'}}>{fmt(s.valor_comissao)}</td>
                      <td style={{fontSize:12,color:'var(--muted)'}}>{s.data_pagamento || '—'}</td>
                      <td>
                        <input value={obs[s.seller_id]||''}
                          onChange={e => setObs(o => ({...o, [s.seller_id]: e.target.value}))}
                          placeholder="Observações…"
                          style={{fontSize:12,padding:'4px 8px',width:'100%'}} />
                      </td>
                      <td>
                        <button className="btn btn-primary btn-sm" disabled={saving[s.seller_id]}
                          onClick={() => saveSeller(s.seller_id)}>
                          {saving[s.seller_id] ? '…' : '💾'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Vendedor — mensagem se sem dados */}
      {!isAdmin && !loading && sellers.length === 0 && (
        <div style={{textAlign:'center',padding:60,color:'var(--muted)'}}>
          Você não possui comissões registradas para {mesLabel}.
        </div>
      )}
    </div>
  );
}
