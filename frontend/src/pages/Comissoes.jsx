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

const REGRAS = [
  { mes: 'Mês 1',     pct: '100%', desc: '1ª mensalidade — 100% para o vendedor' },
  { mes: 'Mês 2',     pct: '50%',  desc: '2ª mensalidade — 50% para o vendedor' },
  { mes: 'Meses 3–12',pct: '10%',  desc: 'Meses seguintes até 12 — 10% por mês' },
  { mes: 'Após 12m',  pct: '0%',   desc: 'Sem comissão após 12 meses, mesmo com renovação' },
];

export default function Comissoes() {
  const { role } = useAuth();
  const isAdmin  = role === 'admin';

  const [sellers,  setSellers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [mes,      setMes]      = useState(mesAtual());
  const [obs,      setObs]      = useState({});   // sellerId → obs
  const [saving,   setSaving]   = useState({});
  const [showRule, setShowRule] = useState(false);

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

  const [ano, mesNum] = mes.split('-');
  const mesLabel = `${MESES[parseInt(mesNum)-1]} ${ano}`;
  const totalComm = sellers.reduce((s,r) => s + parseFloat(r.valor_comissao||0), 0);
  const totalMrr  = sellers.reduce((s,r) => s + parseFloat(r.mrr||0), 0);

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
      {showRule && (
        <div className="card" style={{marginBottom:16, padding:16, borderLeft:'3px solid var(--accent)'}}>
          <div style={{fontWeight:700, marginBottom:10, fontSize:14}}>📋 Regras de Comissão</div>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'1px solid var(--border)'}}>
                <th style={{textAlign:'left', padding:'4px 12px 4px 0', color:'var(--muted)'}}>Período</th>
                <th style={{textAlign:'center', padding:'4px 12px', color:'var(--muted)'}}>%</th>
                <th style={{textAlign:'left', padding:'4px 0', color:'var(--muted)'}}>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {REGRAS.map(r => (
                <tr key={r.mes} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'6px 12px 6px 0', fontWeight:600}}>{r.mes}</td>
                  <td style={{textAlign:'center', padding:'6px 12px', color:'var(--accent)', fontWeight:700}}>{r.pct}</td>
                  <td style={{padding:'6px 0', color:'var(--muted)'}}>{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{marginTop:10, fontSize:12, color:'var(--muted)'}}>
            ⏰ Pagamento 30 dias após o pagamento do cliente · ❌ Clientes inadimplentes não geram comissão
          </div>
          {!isAdmin && (
            <div style={{marginTop:8, fontSize:12, color:'var(--danger)'}}>
              🔒 Apenas administradores podem registrar observações ou ajustes.
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
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
            30 dias após o cliente pagar
          </div>
          <div className="kpi-sub">Ref: {mesLabel}</div>
        </div>
      </div>

      {/* Tabela */}
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
                  <th>Observações {isAdmin ? '' : '🔒'}</th>
                  {isAdmin && <th></th>}
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
                      {isAdmin ? (
                        <input value={obs[s.seller_id]||''}
                          onChange={e => setObs(o => ({...o, [s.seller_id]: e.target.value}))}
                          placeholder="Observações…"
                          style={{fontSize:12,padding:'4px 8px',width:'100%'}} />
                      ) : (
                        <span style={{fontSize:12,color:'var(--muted)'}}>{s.obs || '—'}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="btn btn-primary btn-sm" disabled={saving[s.seller_id]}
                          onClick={() => saveSeller(s.seller_id)}>
                          {saving[s.seller_id] ? '…' : '💾'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
