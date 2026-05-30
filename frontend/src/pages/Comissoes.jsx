import { useState, useEffect } from 'react';
import api from '../api';

function fmt(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}); }

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
}

export default function Comissoes() {
  const [sellers,  setSellers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [mes,      setMes]      = useState(mesAtual());
  const [editing,  setEditing]  = useState({});   // sellerId → {percentual, obs}
  const [saving,   setSaving]   = useState({});

  useEffect(() => { load(); }, [mes]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/commissions', { params:{ mes } });
      setSellers(data);
      // Inicializar edição com valores existentes
      const ed = {};
      data.forEach(s => { ed[s.seller_id] = { percentual: s.percentual||'', obs: s.obs||'' }; });
      setEditing(ed);
    } finally { setLoading(false); }
  }

  function setField(sellerId, field, value) {
    setEditing(e => ({ ...e, [sellerId]: { ...e[sellerId], [field]: value } }));
  }

  async function saveSeller(sellerId) {
    setSaving(s => ({...s, [sellerId]:true}));
    try {
      const ed = editing[sellerId] || {};
      await api.put(`/commissions/${sellerId}`, { mes, ...ed });
      load();
    } finally {
      setSaving(s => ({...s, [sellerId]:false}));
    }
  }

  const totalMrr  = sellers.reduce((s,r) => s + parseFloat(r.mrr||0), 0);
  const totalComm = sellers.reduce((s,r) => s + parseFloat(r.valor_calculado||0), 0);

  const [ano, mesNum] = mes.split('-');
  const mesLabel = `${MESES[parseInt(mesNum)-1]} ${ano}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>💵 Comissões</h1>
          <span className="text-muted" style={{fontSize:13}}>Desempenho e comissão por vendedor</span>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <label style={{fontSize:12,color:'var(--muted)',margin:0}}>Mês de referência:</label>
          <input type="month" value={mes.slice(0,7)}
            onChange={e => setMes(e.target.value + '-01')}
            style={{width:160}} />
        </div>
      </div>

      {/* Totais */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24}}>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--success)'}}>
          <div className="kpi-label">MRR Total da Equipe</div>
          <div className="kpi-value" style={{fontSize:20,color:'var(--success)'}}>{fmt(totalMrr)}</div>
          <div className="kpi-sub">{mesLabel}</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--accent)'}}>
          <div className="kpi-label">Total em Comissões</div>
          <div className="kpi-value" style={{fontSize:20,color:'var(--accent)'}}>{fmt(totalComm)}</div>
          <div className="kpi-sub">{sellers.length} vendedores</div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          {loading ? (
            <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Carregando…</div>
          ) : sellers.length === 0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>
              Nenhum vendedor ativo. Crie vendedores em <strong>Vendedores</strong>.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th style={{textAlign:'center'}}>Ativos</th>
                  <th style={{textAlign:'center'}}>Produção</th>
                  <th style={{textAlign:'center'}}>Perdidos</th>
                  <th>MRR</th>
                  <th style={{width:110}}>Comissão %</th>
                  <th>Valor Comissão</th>
                  <th>Observações</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sellers.map(s => {
                  const ed  = editing[s.seller_id] || {};
                  const mrr = parseFloat(s.mrr || 0);
                  const pct = parseFloat(ed.percentual || 0);
                  const calc= mrr * pct / 100;
                  return (
                    <tr key={s.seller_id}>
                      <td>
                        <div style={{fontWeight:600}}>{s.name}</div>
                        <div style={{fontSize:11,color:'var(--muted)'}}>{s.email}</div>
                      </td>
                      <td style={{textAlign:'center'}}>{s.leads_ativos||0}</td>
                      <td style={{textAlign:'center',fontWeight:700,color:'var(--success)'}}>{s.leads_producao||0}</td>
                      <td style={{textAlign:'center',color:'var(--danger)'}}>{s.leads_perdidos||0}</td>
                      <td style={{fontWeight:700}}>{fmt(mrr)}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <input type="number" min="0" max="100" step="0.5"
                            value={ed.percentual}
                            onChange={e => setField(s.seller_id,'percentual',e.target.value)}
                            style={{width:70,padding:'4px 8px',fontSize:13}}
                          />
                          <span style={{fontSize:12,color:'var(--muted)'}}>%</span>
                        </div>
                      </td>
                      <td style={{fontWeight:700,color:'var(--accent)'}}>
                        {fmt(calc)}
                      </td>
                      <td>
                        <input value={ed.obs||''} onChange={e => setField(s.seller_id,'obs',e.target.value)}
                          placeholder="—" style={{fontSize:12,padding:'4px 8px'}} />
                      </td>
                      <td>
                        <button className="btn btn-primary btn-sm" disabled={saving[s.seller_id]}
                          onClick={() => saveSeller(s.seller_id)}>
                          {saving[s.seller_id] ? '…' : '💾'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{marginTop:16, fontSize:12, color:'var(--muted)'}}>
        💡 Defina o percentual de comissão por vendedor. O valor é calculado automaticamente com base no MRR dos leads em Produção.
        As regras de comissão serão detalhadas futuramente.
      </div>
    </div>
  );
}
