import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import LeadModal from '../components/LeadModal';

const CRM_LABEL  = { saude:'CRM Saúde', spa:'CRM Spa', esportes:'CRM Esportes', pet:'CRM Pet' };
const CRM_BADGE  = { saude:'badge-saude', spa:'badge-spa', esportes:'badge-esportes', pet:'badge-pet' };
const STAGE_LABEL= { prospeccao:'Prospecção', negociacao:'Negociação', piloto:'Piloto / Teste', producao:'Produção', perdido:'Perdido', cancelado:'Cancelado' };
const SCORE_ICON = { muito_quente:'🔥 Muito quente', quente:'🌶️ Quente', morno:'⚡ Morno', frio:'💧 Frio', muito_frio:'❄️ Muito frio' };
const TIPO_ICON  = {
  criacao:'✨', mudanca_etapa:'📍', ligacao:'📞', email:'✉️', whatsapp:'💬',
  demo:'🖥', proposta:'📄', obs:'💬', trial_criado:'🚀', convertido:'🏆', perdido:'❌',
};
const ONBOARDING_LABEL = {
  usuario_criado:'Usuário criado',
  treinamento_realizado:'Treinamento realizado',
  primeiro_acesso:'Primeiro acesso',
  dados_cadastrados:'Dados cadastrados',
  configuracao_concluida:'Configuração concluída',
};
const STAGES_AVANCADOS = ['negociacao','piloto','producao'];
const STAGES_RECUAR    = ['prospeccao','negociacao','piloto'];
const MOTIVOS_PERDA    = ['Sem orçamento','Sem interesse','Concorrente','Não respondeu','Projeto cancelado','Outro'];

function fmt(v)    { return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2}); }
function fmtDate(d){ return d ? new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—'; }
function fmtTs(d)  { return d ? new Date(d).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'; }

export default function LeadDetail() {
  const { id } = useParams();
  const nav    = useNavigate();
  const [lead,    setLead]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState('timeline');
  const [editing, setEditing] = useState(false);

  // Timeline
  const [actNote,  setActNote]  = useState('');
  const [actTipo,  setActTipo]  = useState('obs');
  const [actSaving,setActSaving]= useState(false);

  // Propostas
  const [propVal, setPropVal]   = useState('');
  const [propDate,setPropDate]  = useState('');
  const [propObs, setPropObs]   = useState('');
  const [propSaving,setPropSaving]=useState(false);

  // Mover etapa
  const [stageDlg,  setStageDlg]  = useState(false);
  const [targetStage,setTargetStage]=useState('');
  const [motivo,    setMotivo]    = useState('');
  const [trialDays, setTrialDays] = useState(10);
  const [stageLoad, setStageLoad] = useState(false);

  // Deletar
  const [deleting,  setDeleting]  = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/leads/${id}`);
      setLead(data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function addActivity() {
    if (!actNote.trim()) return;
    setActSaving(true);
    try {
      await api.post(`/leads/${id}/activities`, { tipo: actTipo, descricao: actNote });
      setActNote(''); load();
    } finally { setActSaving(false); }
  }

  async function addProposal() {
    setPropSaving(true);
    try {
      await api.post(`/leads/${id}/proposals`, { valor: propVal||null, data_envio: propDate||null, obs: propObs||null });
      setPropVal(''); setPropDate(''); setPropObs(''); load();
    } finally { setPropSaving(false); }
  }

  async function toggleOnboarding(item, done) {
    await api.put(`/leads/${id}/onboarding/${item}`, { concluido: done });
    load();
  }

  async function moveStage() {
    if (!targetStage) return;
    if (['perdido','cancelado'].includes(targetStage) && !motivo) {
      alert('Selecione o motivo de perda/cancelamento.'); return;
    }
    setStageLoad(true);
    try {
      await api.put(`/leads/${id}/stage`, {
        stage: targetStage,
        motivo_perda: motivo || undefined,
        trial_days: trialDays,
      });
      setStageDlg(false); setMotivo(''); load();
    } catch(e) { alert(e.response?.data?.error || 'Erro.'); }
    finally { setStageLoad(false); }
  }

  async function deleteLead() {
    if (!confirm('Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.')) return;
    setDeleting(true);
    try { await api.delete(`/leads/${id}`); nav('/funil'); }
    catch(e) { alert(e.response?.data?.error || 'Erro ao excluir.'); setDeleting(false); }
  }

  if (loading) return <div className="page" style={{textAlign:'center',paddingTop:80,color:'var(--muted)'}}>Carregando…</div>;
  if (!lead)   return <div className="page" style={{textAlign:'center',paddingTop:80,color:'var(--danger)'}}>Lead não encontrado.</div>;

  const onboardingDone = (lead.onboarding||[]).filter(o=>o.concluido).length;
  const onboardingTotal= (lead.onboarding||[]).length;

  return (
    <div className="page" style={{maxWidth:900}}>
      {/* Breadcrumb */}
      <div style={{marginBottom:16, fontSize:12, color:'var(--muted)'}}>
        <span style={{cursor:'pointer',color:'var(--accent)'}} onClick={() => nav('/funil')}>← Funil</span>
        <span> / {lead.empresa || lead.nome}</span>
      </div>

      {/* Header */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12}}>
          <div style={{flex:1}}>
            <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8, flexWrap:'wrap'}}>
              <h1 style={{fontSize:22, fontWeight:800}}>{lead.empresa || lead.nome}</h1>
              {lead.crm && <span className={`badge ${CRM_BADGE[lead.crm]}`}>{CRM_LABEL[lead.crm]}</span>}
              <span className={`badge badge-${lead.stage}`}>{STAGE_LABEL[lead.stage]||lead.stage}</span>
              {lead.score && <span style={{fontSize:14}} title={lead.score}>{SCORE_ICON[lead.score]}</span>}
              <span style={{
                display:'inline-flex', alignItems:'center', gap:4, fontSize:11, padding:'2px 8px', borderRadius:20,
                background: lead.health_score==='green'?'rgba(63,185,80,.15)':lead.health_score==='yellow'?'rgba(210,153,34,.15)':'rgba(248,81,73,.15)',
                color: lead.health_score==='green'?'var(--success)':lead.health_score==='yellow'?'var(--warning)':'var(--danger)',
              }}>
                {lead.health_score==='green'?'🟢 Saudável':lead.health_score==='yellow'?'🟡 Atenção':'🔴 Risco'}
              </span>
            </div>
            {lead.empresa && <div style={{color:'var(--muted)',fontSize:13,marginBottom:8}}>{lead.nome}</div>}
            <div style={{display:'flex', gap:16, flexWrap:'wrap', fontSize:12, color:'var(--muted)'}}>
              {lead.email    && <span>✉️ {lead.email}</span>}
              {lead.telefone && <span>📞 {lead.telefone}</span>}
              {lead.plano_nome && <span>📦 {lead.plano_nome}</span>}
              {(lead.valor_negociado||lead.plano_valor) &&
                <span style={{color:'var(--success)',fontWeight:700}}>
                  💰 {fmt(lead.valor_negociado || lead.plano_valor)}
                </span>}
              {lead.responsavel_nome && <span>👤 {lead.responsavel_nome}</span>}
            </div>
          </div>
          <div style={{display:'flex', gap:8, flexShrink:0}}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>✏️ Editar</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setStageDlg(true); }}>📍 Mover Etapa</button>
            <button className="btn btn-danger btn-sm" disabled={deleting} onClick={deleteLead}>🗑</button>
          </div>
        </div>

        {/* Infos adicionais */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginTop:16, paddingTop:16, borderTop:'1px solid var(--border)'}}>
          {lead.origem && <div><div style={{fontSize:11,color:'var(--muted)',marginBottom:2}}>Origem</div><div style={{fontSize:13}}>{lead.origem.replace(/_/g,' ')}</div></div>}
          {lead.data_fechamento && <div><div style={{fontSize:11,color:'var(--muted)',marginBottom:2}}>Previsão Fechamento</div><div style={{fontSize:13}}>{fmtDate(lead.data_fechamento)}</div></div>}
          {lead.proxima_acao && <div>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:2}}>Próxima Ação</div>
            <div style={{fontSize:13, color: lead.data_proxima_acao && new Date(lead.data_proxima_acao)<new Date()?'var(--danger)':'inherit'}}>
              {lead.proxima_acao.replace(/_/g,' ')} {lead.data_proxima_acao && '· ' + fmtDate(lead.data_proxima_acao)}
            </div>
          </div>}
          {lead.stage==='piloto' && lead.trial_end && <div>
            <div style={{fontSize:11,color:'var(--muted)',marginBottom:2}}>Trial</div>
            <div style={{fontSize:13, color: new Date(lead.trial_end)<new Date()?'var(--danger)':'var(--purple)'}}>
              {new Date(lead.trial_end)<new Date() ? '⏰ Vencido' : `🧪 Até ${fmtDate(lead.trial_end)}`}
            </div>
          </div>}
          {lead.crm_externo_slug && <div><div style={{fontSize:11,color:'var(--muted)',marginBottom:2}}>Origem Sync</div><div style={{fontSize:13}}>🔄 {lead.crm_externo_slug}</div></div>}
          <div><div style={{fontSize:11,color:'var(--muted)',marginBottom:2}}>Lead desde</div><div style={{fontSize:13}}>{fmtDate(lead.created_at)}</div></div>
        </div>
      </div>

      {/* Onboarding progress (se em produção) */}
      {lead.stage==='producao' && onboardingTotal>0 && (
        <div className="card" style={{marginBottom:20}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
            <div className="section-title" style={{marginBottom:0}}>✅ Onboarding ({onboardingDone}/{onboardingTotal})</div>
            <span style={{fontSize:12, color: onboardingDone===onboardingTotal?'var(--success)':'var(--muted)'}}>
              {onboardingDone===onboardingTotal ? '🎉 Completo!' : `${Math.round(onboardingDone/onboardingTotal*100)}%`}
            </span>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {lead.onboarding.map(o => (
              <label key={o.item} style={{display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontWeight:'normal', color:'var(--text)', fontSize:13}}>
                <input type="checkbox" checked={o.concluido}
                  onChange={e => toggleOnboarding(o.item, e.target.checked)}
                  style={{width:16, height:16, accentColor:'var(--success)'}} />
                <span style={{textDecoration:o.concluido?'line-through':'none', color:o.concluido?'var(--muted)':'var(--text)'}}>
                  {ONBOARDING_LABEL[o.item] || o.item}
                </span>
                {o.concluido_at && <span style={{fontSize:11,color:'var(--muted)',marginLeft:'auto'}}>{fmtDate(o.concluido_at)}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex', gap:4, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0}}>
        {[['timeline','📋 Timeline'], ['propostas','📄 Propostas']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding:'8px 16px', border:'none', background:'none', cursor:'pointer',
              fontSize:13, fontWeight:600, color: tab===k ? 'var(--accent)' : 'var(--muted)',
              borderBottom: tab===k ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom:-1,
            }}>
            {l}
          </button>
        ))}
      </div>

      {/* Tab: Timeline */}
      {tab==='timeline' && (
        <div className="card">
          {/* Adicionar nota */}
          <div style={{display:'flex', gap:8, marginBottom:20, alignItems:'flex-start'}}>
            <select value={actTipo} onChange={e=>setActTipo(e.target.value)} style={{width:130,flexShrink:0}}>
              {[['obs','💬 Nota'], ['ligacao','📞 Ligação'], ['email','✉️ E-mail'],
                ['whatsapp','💬 WhatsApp'], ['demo','🖥 Demo'], ['proposta','📄 Proposta']].map(([k,l]) =>
                <option key={k} value={k}>{l}</option>)}
            </select>
            <textarea value={actNote} onChange={e=>setActNote(e.target.value)} rows={2}
              placeholder="Registrar atividade ou observação…" style={{flex:1}} />
            <button className="btn btn-primary" disabled={actSaving||!actNote.trim()} onClick={addActivity}
              style={{flexShrink:0, alignSelf:'flex-end'}}>
              {actSaving?'…':'Registrar'}
            </button>
          </div>
          {/* Lista */}
          <div style={{display:'flex', flexDirection:'column', gap:12}}>
            {(lead.activities||[]).length===0
              ? <div style={{textAlign:'center',color:'var(--muted)',padding:'20px 0',fontSize:13}}>Nenhuma atividade registrada.</div>
              : (lead.activities||[]).map(a => (
                <div key={a.id} style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                  <div style={{
                    width:32, height:32, borderRadius:'50%', background:'var(--card2)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0,
                  }}>
                    {TIPO_ICON[a.tipo]||'💬'}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12, color:'var(--muted)', marginBottom:3}}>
                      <strong style={{color:'var(--text)'}}>{a.user_name||'Sistema'}</strong>
                      {' · '}{fmtTs(a.created_at)}
                    </div>
                    <div style={{fontSize:13, lineHeight:1.5}}>{a.descricao}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tab: Propostas */}
      {tab==='propostas' && (
        <div className="card">
          {/* Nova proposta */}
          <div style={{marginBottom:20, padding:'14px', background:'var(--card2)', borderRadius:'var(--radius)', border:'1px solid var(--border)'}}>
            <div className="section-title" style={{marginBottom:12}}>Nova Proposta</div>
            <div className="form-row form-row-3" style={{marginBottom:10}}>
              <div className="form-group">
                <label>Valor (R$)</label>
                <input type="number" step="0.01" value={propVal} onChange={e=>setPropVal(e.target.value)} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Data de Envio</label>
                <input type="date" value={propDate} onChange={e=>setPropDate(e.target.value)} />
              </div>
              <div className="form-group" style={{alignSelf:'flex-end'}}>
                <button className="btn btn-primary" disabled={propSaving} onClick={addProposal} style={{width:'100%'}}>
                  {propSaving?'Salvando…':'Registrar Proposta'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Observações</label>
              <input value={propObs} onChange={e=>setPropObs(e.target.value)} placeholder="Detalhes da proposta…" />
            </div>
          </div>
          {/* Lista */}
          {(lead.proposals||[]).length===0
            ? <div style={{textAlign:'center',color:'var(--muted)',padding:'20px 0',fontSize:13}}>Nenhuma proposta enviada ainda.</div>
            : (lead.proposals||[]).map(p => (
              <div key={p.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'10px 0', borderBottom:'1px solid var(--border)'}}>
                <div>
                  <div style={{fontWeight:600, fontSize:13}}>Proposta v{p.versao}</div>
                  {p.obs && <div style={{fontSize:12,color:'var(--muted)'}}>{p.obs}</div>}
                </div>
                <div style={{textAlign:'right'}}>
                  {p.valor && <div style={{fontWeight:700, color:'var(--success)'}}>{fmt(p.valor)}</div>}
                  {p.data_envio && <div style={{fontSize:11,color:'var(--muted)'}}>{fmtDate(p.data_envio)}</div>}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Dialog mover etapa */}
      {stageDlg && (
        <div className="overlay" onClick={e => e.target===e.currentTarget && setStageDlg(false)}>
          <div style={{background:'var(--card)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', padding:24, maxWidth:440, width:'100%'}}>
            <h3 style={{marginBottom:16}}>📍 Mover Etapa</h3>
            <div className="form-group" style={{marginBottom:12}}>
              <label>Nova Etapa</label>
              <select value={targetStage} onChange={e=>setTargetStage(e.target.value)}>
                <option value="">Selecione…</option>
                {['prospeccao','negociacao','piloto','producao','perdido','cancelado']
                  .filter(s=>s!==lead.stage)
                  .map(s=><option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </select>
            </div>
            {targetStage==='piloto' && (
              <div className="form-group" style={{marginBottom:12}}>
                <label>Duração do Teste (dias)</label>
                <input type="number" value={trialDays} onChange={e=>setTrialDays(e.target.value)} min={1} max={90} />
              </div>
            )}
            {['perdido','cancelado'].includes(targetStage) && (
              <div className="form-group" style={{marginBottom:12}}>
                <label>Motivo *</label>
                <select value={motivo} onChange={e=>setMotivo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {MOTIVOS_PERDA.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}>
              <button className="btn btn-ghost" onClick={() => setStageDlg(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={stageLoad||!targetStage} onClick={moveStage}>
                {stageLoad?'Movendo…':'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {editing && (
        <LeadModal lead={lead} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />
      )}
    </div>
  );
}
