import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const CRM_LABEL = { saude:'CRM Saúde', spa:'CRM Spa', esportes:'CRM Esportes', pet:'CRM Pet' };
const CRM_BADGE = { saude:'badge-saude', spa:'badge-spa', esportes:'badge-esportes', pet:'badge-pet' };

function fmt(v) {
  return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2});
}

export default function Producao() {
  const nav  = useNavigate();
  const [leads,  setLeads]  = useState([]);
  const [mrr,    setMrr]    = useState([]);
  const [loading,setLoading]= useState(true);
  const [crmF,   setCrmF]   = useState('');
  const [q,      setQ]      = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [l, m] = await Promise.all([
        api.get('/leads', { params:{ stage:'producao', crm: crmF || undefined, q: q||undefined }}),
        api.get('/dashboard/mrr'),
      ]);
      setLeads(l.data);
      setMrr(m.data);
    } finally { setLoading(false); }
  }

  const totalMrr = mrr.reduce((s,r) => s + parseFloat(r.mrr||0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🏭 Produção</h1>
          <span className="text-muted" style={{fontSize:13}}>Clientes ativos e pagantes</span>
        </div>
      </div>

      {/* MRR cards */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:24}}>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--success)'}}>
          <div className="kpi-label">💰 MRR Total</div>
          <div className="kpi-value" style={{color:'var(--success)',fontSize:22}}>{fmt(totalMrr)}</div>
          <div className="kpi-sub">{leads.length} clientes</div>
        </div>
        {mrr.map(r => (
          <div key={r.crm} className="kpi-card">
            <div className="kpi-label"><span className={`badge ${CRM_BADGE[r.crm]||''}`}>{CRM_LABEL[r.crm]||r.crm}</span></div>
            <div className="kpi-value" style={{fontSize:18}}>{fmt(r.mrr)}</div>
            <div className="kpi-sub">{r.clientes} cliente{r.clientes!=1?'s':''} · tk {fmt(r.ticket)}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{display:'flex', gap:8, marginBottom:16}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()}
          placeholder="🔍 Buscar…" style={{width:240, flex:'none'}} />
        <select value={crmF} onChange={e=>setCrmF(e.target.value)} style={{width:160, flex:'none'}}>
          <option value="">Todos os CRMs</option>
          {['saude','spa','esportes','pet'].map(c=><option key={c} value={c}>{CRM_LABEL[c]}</option>)}
        </select>
        <button className="btn btn-ghost" onClick={load}>Filtrar</button>
      </div>

      {/* Tabela */}
      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          {loading ? (
            <div style={{textAlign:'center', padding:40, color:'var(--muted)'}}>Carregando…</div>
          ) : leads.length === 0 ? (
            <div style={{textAlign:'center', padding:40, color:'var(--muted)', fontSize:13}}>
              Nenhum cliente em produção.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>CRM</th>
                  <th>Plano</th>
                  <th>Receita/mês</th>
                  <th>Health</th>
                  <th>Responsável</th>
                  <th>Desde</th>
                </tr>
              </thead>
              <tbody>
                {leads.map(l => (
                  <tr key={l.id} style={{cursor:'pointer'}} onClick={() => nav(`/leads/${l.id}`)}>
                    <td>
                      <div style={{fontWeight:600}}>{l.empresa||l.nome}</div>
                      {l.empresa && <div style={{fontSize:11,color:'var(--muted)'}}>{l.nome}</div>}
                    </td>
                    <td>{l.crm && <span className={`badge ${CRM_BADGE[l.crm]||''}`}>{CRM_LABEL[l.crm]||l.crm}</span>}</td>
                    <td style={{fontSize:12,color:'var(--muted)'}}>{l.plano_nome||'—'}</td>
                    <td style={{fontWeight:700, color:'var(--success)'}}>
                      {fmt(l.valor_negociado||l.plano_valor||0)}
                    </td>
                    <td>
                      <span style={{
                        fontSize:11, padding:'2px 8px', borderRadius:20, fontWeight:600,
                        background: l.health_score==='green'?'rgba(63,185,80,.15)':l.health_score==='yellow'?'rgba(210,153,34,.15)':'rgba(248,81,73,.15)',
                        color: l.health_score==='green'?'var(--success)':l.health_score==='yellow'?'var(--warning)':'var(--danger)',
                      }}>
                        {l.health_score==='green'?'🟢 OK':l.health_score==='yellow'?'🟡 Atenção':'🔴 Risco'}
                      </span>
                    </td>
                    <td style={{fontSize:12,color:'var(--muted)'}}>{l.responsavel_nome||'—'}</td>
                    <td style={{fontSize:12,color:'var(--muted)'}}>
                      {new Date(l.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'})}
                    </td>
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
