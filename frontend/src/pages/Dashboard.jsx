import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const CRM_COLOR = { saude:'var(--crm-saude)', spa:'var(--crm-spa)', esportes:'var(--crm-esportes)', pet:'var(--crm-pet)' };
const CRM_LABEL = { saude:'CRM Saúde', spa:'CRM Spa', esportes:'CRM Esportes', pet:'CRM Pet' };
const TIPO_ICON = {
  criacao:'✨', mudanca_etapa:'📍', ligacao:'📞', email:'✉️',
  whatsapp:'💬', demo:'🖥', proposta:'📄', obs:'💬',
};
const STAGE_LABEL = { prospeccao:'Prospecção', negociacao:'Negociação', piloto:'Piloto', producao:'Produção', perdido:'Perdido', cancelado:'Cancelado' };
const STAGE_COLOR = { prospeccao:'var(--muted)', negociacao:'var(--warning)', piloto:'var(--purple)', producao:'var(--success)', perdido:'var(--danger)', cancelado:'var(--muted)' };

function fmt(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}); }
function daysAgo(d) {
  const diff = Math.round((Date.now()-new Date(d))/86400000);
  return diff===0?'hoje':diff===1?'ontem':`${diff}d atrás`;
}

// ── Aba 1: Visão Geral ────────────────────────────────────────────────────────
function TabGeral({ data, alerts, nav }) {
  if (!data) return null;
  const stage = data.byStage||{};
  const mrr   = data.mrr||{};

  const stages = [
    { key:'prospeccao', label:'Prospecção',  color:'var(--stage-prospeccao)', icon:'🎯' },
    { key:'negociacao', label:'Negociação',  color:'var(--stage-negociacao)', icon:'🤝' },
    { key:'piloto',     label:'Piloto',      color:'var(--stage-piloto)',     icon:'🧪' },
    { key:'producao',   label:'Produção',    color:'var(--stage-producao)',   icon:'🏭' },
    { key:'perdido',    label:'Perdidos',    color:'var(--stage-perdido)',    icon:'❌' },
    { key:'cancelado',  label:'Cancelados',  color:'var(--stage-cancelado)', icon:'🚫' },
  ];

  return (
    <>
      <div className="kpi-grid">
        {stages.map(s => (
          <div key={s.key} className="kpi-card" style={{ borderLeft:`3px solid ${s.color}` }}>
            <div className="kpi-label">{s.icon} {s.label}</div>
            <div className="kpi-value" style={{ color: s.color }}>{stage[s.key]||0}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        <div className="card">
          <div className="section-title">💰 Receita Mensal Recorrente</div>
          <div style={{ fontSize:32, fontWeight:800, color:'var(--success)', marginBottom:12 }}>
            {fmt(mrr.total||0)}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {['saude','spa','esportes','pet'].filter(crm=>mrr[crm]>0).map(crm => (
              <div key={crm} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background: CRM_COLOR[crm] }} />
                  <span style={{ fontSize:13 }}>{CRM_LABEL[crm]}</span>
                </div>
                <span style={{ fontWeight:700, color: CRM_COLOR[crm] }}>{fmt(mrr[crm])}</span>
              </div>
            ))}
          </div>
          {data.ticket>0 && (
            <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)' }}>
              <span className="text-muted" style={{fontSize:12}}>Ticket médio: </span>
              <span style={{fontWeight:700}}>{fmt(data.ticket)}</span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">🔔 Alertas ({alerts.length})</div>
          {alerts.length===0 ? (
            <div style={{textAlign:'center',padding:'24px 0',color:'var(--muted)',fontSize:13}}>✅ Nenhum alerta pendente</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:260,overflowY:'auto'}}>
              {alerts.map((a,i) => (
                <div key={i} className={`alert alert-${a.severity}`}
                  style={{cursor:'pointer'}} onClick={()=>a.lead_id&&nav(`/leads/${a.lead_id}`)}>
                  <span style={{flexShrink:0}}>{a.tipo==='trial_vencido'?'⏰':a.tipo==='trial_vencendo'?'⚠️':a.tipo==='acao_atrasada'?'📅':'😶'}</span>
                  <span style={{fontSize:12,lineHeight:1.4}}>{a.descricao}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-title">📋 Atividades Recentes</div>
        {!(data.recentActivity?.length) ? (
          <div style={{color:'var(--muted)',fontSize:13,textAlign:'center',padding:'16px 0'}}>Sem atividades.</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {data.recentActivity.map(a => (
              <div key={a.id} style={{display:'flex',gap:10,alignItems:'flex-start',cursor:'pointer'}}
                onClick={()=>nav(`/leads/${a.lead_id}`)}>
                <div style={{width:28,height:28,borderRadius:'50%',background:'var(--card2)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>
                  {TIPO_ICON[a.tipo]||'💬'}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,fontSize:12}}>{a.lead_empresa||a.lead_nome}</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{a.descricao}</div>
                </div>
                <div style={{fontSize:11,color:'var(--muted)',flexShrink:0}}>{daysAgo(a.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Aba 2: Atividade 30 dias ──────────────────────────────────────────────────
function TabAtividade({ nav }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/activity').then(r => setData(r.data)).catch(console.error).finally(()=>setLoading(false));
  }, []);

  if (loading) return <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Carregando…</div>;
  if (!data)   return null;

  const totalAti = data.byDay?.reduce((s,d)=>s+parseInt(d.total||0),0)||0;
  const totalNovos = data.novosLeads?.reduce((s,d)=>s+parseInt(d.total||0),0)||0;

  return (
    <>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:24}}>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--accent)'}}>
          <div className="kpi-label">📋 Atividades registradas</div>
          <div className="kpi-value" style={{color:'var(--accent)'}}>{totalAti}</div>
          <div className="kpi-sub">últimos 30 dias</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--success)'}}>
          <div className="kpi-label">✨ Novos leads</div>
          <div className="kpi-value" style={{color:'var(--success)'}}>{totalNovos}</div>
          <div className="kpi-sub">últimos 30 dias</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--purple)'}}>
          <div className="kpi-label">📍 Mudanças de etapa</div>
          <div className="kpi-value" style={{color:'var(--purple)'}}>
            {data.conversoes?.reduce((s,c)=>s+parseInt(c.total||0),0)||0}
          </div>
          <div className="kpi-sub">últimos 30 dias</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        {/* Conversões por destino */}
        <div className="card">
          <div className="section-title">📍 Movimentações por Etapa</div>
          {data.conversoes?.length===0
            ? <div style={{color:'var(--muted)',fontSize:13}}>Sem movimentações no período.</div>
            : (data.conversoes||[]).map(c=>(
              <div key={c.para} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <span className={`badge badge-${c.para||'prospeccao'}`}>{STAGE_LABEL[c.para]||c.para}</span>
                <span style={{fontWeight:700}}>{c.total}</span>
              </div>
            ))}
        </div>

        {/* Top leads */}
        <div className="card">
          <div className="section-title">🔥 Leads Mais Ativos</div>
          {data.topLeads?.length===0
            ? <div style={{color:'var(--muted)',fontSize:13}}>Sem atividade no período.</div>
            : (data.topLeads||[]).map(l=>(
              <div key={l.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                padding:'8px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'}}
                onClick={()=>nav(`/leads/${l.id}`)}>
                <div>
                  <div style={{fontWeight:600,fontSize:13}}>{l.empresa||l.nome}</div>
                  <span className={`badge badge-${l.stage}`} style={{fontSize:9}}>{STAGE_LABEL[l.stage]}</span>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:'var(--accent)'}}>{l.atividades} atividades</div>
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

// ── Aba 3: Vendedores ─────────────────────────────────────────────────────────
function TabVendedores({ nav }) {
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/sellers').then(r=>setSellers(r.data)).catch(console.error).finally(()=>setLoading(false));
  }, []);

  if (loading) return <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Carregando…</div>;

  const totalMrr = sellers.reduce((s,r)=>s+parseFloat(r.mrr||0),0);

  return (
    <>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:24}}>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--success)'}}>
          <div className="kpi-label">👥 Vendedores ativos</div>
          <div className="kpi-value" style={{color:'var(--success)'}}>{sellers.length}</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--accent)'}}>
          <div className="kpi-label">💰 MRR total equipe</div>
          <div className="kpi-value" style={{fontSize:18,color:'var(--accent)'}}>{fmt(totalMrr)}</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--purple)'}}>
          <div className="kpi-label">🏭 Clientes em Produção</div>
          <div className="kpi-value" style={{color:'var(--purple)'}}>
            {sellers.reduce((s,r)=>s+parseInt(r.em_producao||0),0)}
          </div>
        </div>
      </div>

      <div className="card" style={{padding:0}}>
        <div className="table-wrap">
          {sellers.length===0 ? (
            <div style={{textAlign:'center',padding:40,color:'var(--muted)',fontSize:13}}>
              Nenhum vendedor cadastrado. <span style={{color:'var(--accent)',cursor:'pointer'}} onClick={()=>nav('/admin')}>Criar agora →</span>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Vendedor</th>
                  <th style={{textAlign:'center'}}>Leads Ativos</th>
                  <th style={{textAlign:'center'}}>Em Piloto</th>
                  <th style={{textAlign:'center'}}>Em Produção</th>
                  <th style={{textAlign:'center'}}>Perdidos</th>
                  <th>MRR</th>
                  <th>Conv. (%)</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map(s => {
                  const total = parseInt(s.leads_ativos||0) + parseInt(s.perdidos||0);
                  const conv  = total > 0 ? Math.round((parseInt(s.em_producao||0)/total)*100) : 0;
                  return (
                    <tr key={s.id}>
                      <td><div style={{fontWeight:600}}>{s.name}</div></td>
                      <td style={{textAlign:'center'}}>{s.leads_ativos||0}</td>
                      <td style={{textAlign:'center',color:'var(--purple)',fontWeight:600}}>{s.em_piloto||0}</td>
                      <td style={{textAlign:'center',color:'var(--success)',fontWeight:700}}>{s.em_producao||0}</td>
                      <td style={{textAlign:'center',color:'var(--danger)'}}>{s.perdidos||0}</td>
                      <td style={{fontWeight:700,color:'var(--success)'}}>{fmt(s.mrr)}</td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{flex:1,height:6,background:'var(--card2)',borderRadius:3}}>
                            <div style={{width:`${conv}%`,height:'100%',background:'var(--success)',borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:11,color:'var(--muted)',width:30}}>{conv}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ── Aba 4: Prospecção Ativa ───────────────────────────────────────────────────
function TabProspeccao({ nav }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/prospecting').then(r => setData(r.data)).catch(console.error).finally(()=>setLoading(false));
  }, []);

  if (loading) return <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>Carregando…</div>;
  if (!data)   return null;

  const stageLabels = { prospeccao:'Em Prospecção', negociacao:'Em Negociação', piloto:'Em Piloto', producao:'Em Produção', perdido:'Perdidos' };
  const stageColors = { prospeccao:'var(--muted)', negociacao:'var(--warning)', piloto:'var(--purple)', producao:'var(--success)', perdido:'var(--danger)' };
  const scoreLabels = { muito_quente:'🔥 Muito Quente', quente:'🌶️ Quente', morno:'⚡ Morno', frio:'💧 Frio', sem_score:'Sem score' };
  const totalProsp  = Object.values(data.byStage||{}).reduce((s,v)=>s+parseInt(v),0);

  return (
    <>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:24}}>
        <div className="kpi-card" style={{borderLeft:'3px solid #25D366'}}>
          <div className="kpi-label">📱 Leads este mês</div>
          <div className="kpi-value" style={{color:'#25D366'}}>{data.mesAtual}</div>
          <div className="kpi-sub">via prospecção ativa</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--accent)'}}>
          <div className="kpi-label">📊 Total histórico</div>
          <div className="kpi-value" style={{color:'var(--accent)'}}>{data.historico}</div>
          <div className="kpi-sub">todos os períodos</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--success)'}}>
          <div className="kpi-label">🎯 Avançaram</div>
          <div className="kpi-value" style={{color:'var(--success)'}}>{data.avancados}</div>
        </div>
        <div className="kpi-card" style={{borderLeft:'3px solid var(--purple)'}}>
          <div className="kpi-label">📈 Conversão</div>
          <div className="kpi-value" style={{color:'var(--purple)'}}>{data.taxaConv}%</div>
          <div className="kpi-sub">prosp → negociação+</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        <div className="card">
          <div className="section-title">🔽 Funil por Etapa</div>
          {Object.entries(data.byStage||{}).map(([stage, total]) => {
            const pct = totalProsp > 0 ? Math.round((parseInt(total)/totalProsp)*100) : 0;
            return (
              <div key={stage} style={{marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                  <span style={{color:stageColors[stage]||'var(--muted)',fontWeight:600}}>{stageLabels[stage]||stage}</span>
                  <span style={{fontWeight:700}}>{total} <span style={{color:'var(--muted)',fontWeight:400}}>({pct}%)</span></span>
                </div>
                <div style={{height:6,background:'var(--card2)',borderRadius:3}}>
                  <div style={{width:`${pct}%`,height:'100%',background:stageColors[stage]||'var(--muted)',borderRadius:3}}/>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div className="card">
            <div className="section-title">🌡️ Score (leads em Prospecção)</div>
            {Object.entries(data.byScore||{}).length === 0
              ? <div style={{color:'var(--muted)',fontSize:13}}>Nenhum lead em prospecção.</div>
              : Object.entries(data.byScore).map(([score, total]) => (
                <div key={score} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span>{scoreLabels[score]||score}</span>
                  <span style={{fontWeight:700}}>{total}</span>
                </div>
              ))}
          </div>
          <div className="card">
            <div className="section-title">🏷️ Por CRM</div>
            {['pet','saude','esportes','spa'].filter(c => data.byCrm?.[c]).map(c => (
              <div key={c} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                <span style={{color:`var(--crm-${c})`}}>{c.charAt(0).toUpperCase()+c.slice(1)}</span>
                <span style={{fontWeight:700}}>{data.byCrm[c]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.ultimasPromocoes?.length > 0 && (
        <div className="card">
          <div className="section-title">🚀 Últimas Promoções Automáticas (2× quente)</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {data.ultimasPromocoes.map((p,i) => (
              <div key={i} style={{display:'flex',gap:10,alignItems:'center',cursor:'pointer',
                padding:'6px 0',borderBottom:'1px solid var(--border)'}}
                onClick={()=>nav(`/leads/${p.lead_id}`)}>
                <span style={{fontSize:18}}>🎯</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{p.empresa||p.nome}</div>
                  <div style={{fontSize:11,color:'var(--muted)'}}>{p.descricao}</div>
                </div>
                <div style={{fontSize:11,color:'var(--muted)',flexShrink:0}}>
                  {new Date(p.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Dashboard principal ────────────────────────────────────────────────
export default function Dashboard() {
  const nav = useNavigate();
  const [tab,    setTab]    = useState('geral');
  const [data,   setData]   = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading,setLoading]= useState(true);

  useEffect(() => {
    Promise.all([api.get('/dashboard'), api.get('/dashboard/alerts')])
      .then(([d,a]) => { setData(d.data); setAlerts(a.data); })
      .catch(console.error)
      .finally(()=>setLoading(false));
  }, []);

  const TABS = [
    ['geral',       '📊 Visão Geral'],
    ['atividade',   '📅 Atividade 30d'],
    ['vendedores',  '👥 Vendedores'],
    ['prospeccao',  '📱 Prospecção Ativa'],
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <span className="text-muted" style={{fontSize:13}}>Visão executiva da operação</span>
        </div>
        <button className="btn btn-primary" onClick={()=>nav('/funil')}>🎯 Abrir Funil</button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
        {TABS.map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)}
            style={{
              padding:'8px 16px',border:'none',background:'none',cursor:'pointer',
              fontSize:13,fontWeight:600,
              color: tab===k?'var(--accent)':'var(--muted)',
              borderBottom: tab===k?'2px solid var(--accent)':'2px solid transparent',
              marginBottom:-1,
            }}>
            {l}
          </button>
        ))}
      </div>

      {loading && tab==='geral' ? (
        <div style={{textAlign:'center',padding:40,color:'var(--muted)'}}>⏳ Carregando…</div>
      ) : (
        <>
          {tab==='geral'       && <TabGeral data={data} alerts={alerts} nav={nav} />}
          {tab==='atividade'   && <TabAtividade nav={nav} />}
          {tab==='vendedores'  && <TabVendedores nav={nav} />}
          {tab==='prospeccao'  && <TabProspeccao nav={nav} />}
        </>
      )}
    </div>
  );
}
