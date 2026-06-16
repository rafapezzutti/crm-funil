import { useState, useEffect, useCallback } from 'react';
import api from '../api';
import { useAuth } from '../AuthContext';

const TIPO_OPTS = [
  { value:'prospeccao_whatsapp', label:'📲 Prospecção WhatsApp' },
  { value:'analise_conversas',   label:'🔍 Análise de Conversas' },
  { value:'relatorio',           label:'📊 Relatório Periódico' },
  { value:'melhoria',            label:'💡 Proposta de Melhorias' },
  { value:'custom',              label:'⚙️ Personalizado' },
];
const TRIGGER_OPTS = [
  { value:'cron',   label:'⏰ Agendamento automático' },
  { value:'evento', label:'⚡ Gatilho por evento' },
  { value:'ambos',  label:'🔄 Agendamento + Evento' },
];
const EVENT_OPTS = [
  { value:'lead_created',   label:'Lead criado' },
  { value:'lead_moved',     label:'Lead mudou de etapa' },
  { value:'lead_closed',    label:'Lead fechado' },
  { value:'whatsapp_reply', label:'Resposta no WhatsApp' },
];
const STATUS_COLOR = { ok:'var(--success)', erro:'var(--danger)', aviso:'var(--warning)', running:'var(--accent)' };

function progressStep(pct) {
  if (pct < 20) return '🔄 Aguardando Cowork...';
  if (pct < 45) return '📊 Buscando dados do CRM...';
  if (pct < 75) return '🤖 Processando com IA...';
  if (pct < 95) return '💾 Finalizando resposta...';
  return '✅ Concluído!';
}

function tipoLabel(v) { return TIPO_OPTS.find(t => t.value === v)?.label || v; }
function triggerLabel(v) { return TRIGGER_OPTS.find(t => t.value === v)?.label || v; }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// ── Seletor de agendamento amigável ────────────────────────────────────────────
function buildCron(freq, hour, weekday) {
  if (freq === 'daily')    return '0 ' + hour + ' * * *';
  if (freq === 'weekdays') return '0 ' + hour + ' * * 1-5';
  if (freq === 'weekly')   return '0 ' + hour + ' * * ' + weekday;
  return null;
}
function parseCron(expr) {
  if (!expr) return { freq:'daily', hour:'9', weekday:'1' };
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return { freq:'daily', hour:'9', weekday:'1' };
  const [, hour, , , dow] = parts;
  if (dow === '1-5') return { freq:'weekdays', hour, weekday:'1' };
  if (dow !== '*')   return { freq:'weekly',   hour, weekday: dow };
  return { freq:'daily', hour, weekday:'1' };
}
const FREQ_OPTS = [
  { value:'daily',    label:'Todo dia' },
  { value:'weekdays', label:'Dias úteis (seg–sex)' },
  { value:'weekly',   label:'Uma vez por semana' },
  { value:'manual',   label:'Somente manual (sem agendamento)' },
];
const HOUR_OPTS = Array.from({length:24}, (_,i) => ({ value:String(i), label: String(i).padStart(2,'0') + ':00' }));
const DOW_OPTS  = [
  { value:'1', label:'Segunda' }, { value:'2', label:'Terça'  },
  { value:'3', label:'Quarta'  }, { value:'4', label:'Quinta' },
  { value:'5', label:'Sexta'   }, { value:'6', label:'Sábado' },
  { value:'0', label:'Domingo' },
];
function CronPicker({ value, onChange }) {
  const p = parseCron(value);
  const [freq, setFreq]       = useState(value ? p.freq : 'daily');
  const [hour, setHour]       = useState(p.hour);
  const [weekday, setWeekday] = useState(p.weekday);
  function upd(f, h, w) { onChange(f === 'manual' ? '' : (buildCron(f, h, w) || '')); }
  return (
    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
      <div style={{ flex:'1 1 160px' }}>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Com que frequência?</div>
        <select value={freq} onChange={e => { setFreq(e.target.value); upd(e.target.value, hour, weekday); }}>
          {FREQ_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {freq !== 'manual' && (
        <div style={{ flex:'0 0 110px' }}>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Horário</div>
          <select value={hour} onChange={e => { setHour(e.target.value); upd(freq, e.target.value, weekday); }}>
            {HOUR_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
      {freq === 'weekly' && (
        <div style={{ flex:'1 1 130px' }}>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Dia da semana</div>
          <select value={weekday} onChange={e => { setWeekday(e.target.value); upd(freq, hour, e.target.value); }}>
            {DOW_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
const EMPTY = {
  name:'', description:'', tipo:'prospeccao_whatsapp',
  trigger_type:'cron', cron_expr:'0 9 * * *', event_trigger:'',
  prompt_template:'', whatsapp_template:'',
};

export default function Robos() {
  const { role } = useAuth();
  const isAdmin  = ['admin','master'].includes(role);
  const isMaster = role === 'master';

  const [robots,   setRobots]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [seeding,  setSeeding]  = useState(false);
  const [modal,    setModal]    = useState(null);
  const [logs,     setLogs]     = useState(null);
  const [form,     setForm]     = useState(EMPTY);
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState('');
  const [msg,      setMsg]      = useState('');
  const [running,  setRunning]  = useState(null); // id do robô em execução
  const [progress, setProgress] = useState(null); // { robot, pct, step, done, logStatus }

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/robots'); setRobots(data); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Polling de progresso — roda enquanto o robô está na fila
  useEffect(() => {
    if (!progress || progress.done) return;
    const interval = setInterval(async () => {
      // Avança progress fake até 85%
      setProgress(p => {
        if (!p || p.done) return p;
        const next = Math.min(85, p.pct + 2.5); // sobe ~2.5% a cada 3s → 85% em ~34s
        return { ...p, pct: Math.round(next) };
      });
      // Verifica se robô saiu da fila
      try {
        const { data } = await api.get('/robots');
        const robot = data.find(r => r.id === progress.robot.id);
        if (robot && !robot.queued_at) {
          // Busca último log para saber status
          const { data: logItems } = await api.get('/robots/' + progress.robot.id + '/logs');
          const latest = logItems[0];
          const st = latest?.status || 'ok';
          const stepMsg = st === 'ok' ? '✅ Concluído com sucesso!'
                        : st === 'erro' ? '❌ Erro na execução'
                        : '⚠️ Concluído com aviso';
          setProgress(p => p ? { ...p, pct: 100, done: true, step: stepMsg, logStatus: st } : null);
          load(); // atualiza lista de robôs
        }
      } catch { /* ignora */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [progress?.robot?.id, progress?.done]); // eslint-disable-line

  function openCreate() { setForm(EMPTY); setErr(''); setModal('create'); }
  function openEdit(r)  { setForm({ ...r }); setErr(''); setModal(r); }

  async function openLogs(r) {
    try { const { data } = await api.get('/robots/' + r.id + '/logs'); setLogs({ robot: r, items: data }); }
    catch { setLogs({ robot: r, items: [] }); }
  }

  async function seedDefault() {
    if (!confirm('Criar os 6 robôs padrão da P Soluções?')) return;
    setSeeding(true);
    try {
      const { data } = await api.post('/robots/seed');
      setMsg('✅ Criados: ' + data.created.join(', ') + (data.skipped.length ? ' · Já existiam: ' + data.skipped.join(', ') : ''));
      load();
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.error || 'Erro ao criar robôs padrão.'));
    } finally { setSeeding(false); }
  }

  async function save() {
    if (!form.name.trim()) { setErr('Nome é obrigatório.'); return; }
    setSaving(true); setErr('');
    try {
      if (modal === 'create') { await api.post('/robots', form); setMsg('✅ Robô criado!'); }
      else { await api.put('/robots/' + modal.id, form); setMsg('✅ Robô atualizado!'); }
      setModal(null); load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Erro ao salvar.');
    } finally { setSaving(false); }
  }

  async function toggleAtivo(r) {
    try { await api.put('/robots/' + r.id, { ...r, ativo: !r.ativo }); load(); }
    catch { /* ignore */ }
  }

  async function runNow(r) {
    setRunning(r.id);
    try {
      await api.post('/robots/' + r.id + '/run');
      setProgress({ robot: r, pct: 10, step: null, done: false, logStatus: null });
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.error || 'Erro ao executar robô.'));
    } finally {
      setRunning(null);
    }
  }

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  function descAgendamento(cron_expr, trigger_type) {
    if (trigger_type === 'evento') return '⚡ Por evento';
    if (!cron_expr) return '▶️ Manual';
    const p = parseCron(cron_expr);
    const h = String(p.hour).padStart(2,'0') + ':00';
    if (p.freq === 'daily')    return '⏰ Todo dia às ' + h;
    if (p.freq === 'weekdays') return '⏰ Dias úteis às ' + h;
    const dia = DOW_OPTS.find(d => d.value === p.weekday)?.label || 'Semana';
    if (p.freq === 'weekly')   return '⏰ ' + dia + ' às ' + h;
    return cron_expr;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🤖 Robôs</h1>
          <span className="text-muted" style={{ fontSize:13 }}>
            {isMaster ? 'Todos os processos automatizados' : 'Automações desta empresa'}
          </span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isMaster && (
            <button className="btn btn-ghost" onClick={seedDefault} disabled={seeding}>
              {seeding ? '⏳' : '🌱 Criar padrões'}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={openCreate}>+ Novo Robô</button>
          )}
        </div>
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
      ) : robots.length === 0 ? (
        <div className="card" style={{ padding:48, textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🤖</div>
          <div style={{ fontWeight:600, marginBottom:6 }}>Nenhum robô configurado</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>
            Robôs executam tarefas automáticas como prospecção, análise e relatórios.
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
            {isMaster && <button className="btn btn-ghost" onClick={seedDefault} disabled={seeding}>{seeding ? '⏳' : '🌱 Criar 6 robôs padrão'}</button>}
            {isAdmin && <button className="btn btn-primary" onClick={openCreate}>+ Criar robô</button>}
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {robots.map(r => (
            <div key={r.id} className="card" style={{ padding:'16px 20px', display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}>
              <div style={{ marginTop:4, flexShrink:0 }}>
                <span style={{
                  display:'inline-block', width:10, height:10, borderRadius:'50%',
                  background: r.ativo ? 'var(--success)' : 'var(--muted)',
                  boxShadow: r.ativo ? '0 0 6px var(--success)' : 'none',
                }} />
              </div>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>
                  {tipoLabel(r.tipo).split(' ')[0]} {r.name}
                </div>
                {isMaster && r.company_name && (
                  <div style={{ fontSize:11, color:'var(--accent)', marginBottom:4, fontWeight:600 }}>🏢 {r.company_name}</div>
                )}
                {r.description && (
                  <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>{r.description}</div>
                )}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, background:'var(--card2)', padding:'2px 8px', borderRadius:20 }}>{tipoLabel(r.tipo)}</span>
                  <span style={{ fontSize:11, background:'var(--card2)', padding:'2px 8px', borderRadius:20 }}>{descAgendamento(r.cron_expr, r.trigger_type)}</span>
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0, minWidth:110 }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>Última execução</div>
                <div style={{ fontSize:12, marginBottom:4 }}>{fmtDate(r.last_run_at)}</div>
                {r.last_status && (
                  <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[r.last_status] || 'var(--muted)' }}>
                    {r.last_status === 'ok' ? '✅ OK' : r.last_status === 'erro' ? '❌ Erro' : '⏳ Rodando'}
                  </span>
                )}
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{r.total_runs} exec.</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }} onClick={() => openLogs(r)}>📋 Logs</button>
                {isAdmin && <>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize:12, padding:'5px 10px' }}
                    onClick={() => runNow(r)}
                    disabled={running === r.id}
                  >
                    {running === r.id ? '⏳ Rodando…' : '▶ Executar agora'}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }} onClick={() => openEdit(r)}>✏️ Editar</button>
                  <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px', color: r.ativo ? 'var(--warning)' : 'var(--success)' }} onClick={() => toggleAtivo(r)}>
                    {r.ativo ? '⏸ Pausar' : '▶️ Ativar'}
                  </button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      {modal !== null && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth:620, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>{modal === 'create' ? '🤖 Novo Robô' : '✏️ Editar: ' + modal.name}</h2>
              <button className="close-btn" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-high" style={{ marginBottom:12 }}>{err}</div>}

              <div className="form-row form-row-2" style={{ marginBottom:12 }}>
                <div className="form-group">
                  <label>Nome *</label>
                  <input value={form.name} onChange={set('name')} placeholder="Ex: Prospecção Matinal" />
                </div>
                <div className="form-group">
                  <label>Tipo</label>
                  <select value={form.tipo} onChange={set('tipo')}>
                    {TIPO_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom:12 }}>
                <label>Descrição</label>
                <input value={form.description || ''} onChange={set('description')} placeholder="O que este robô faz?" />
              </div>

              <div className="form-group" style={{ marginBottom:12 }}>
                <label>Gatilho de execução</label>
                <select value={form.trigger_type} onChange={set('trigger_type')}>
                  {TRIGGER_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {(form.trigger_type === 'cron' || form.trigger_type === 'ambos') && (
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Quando executar automaticamente?</label>
                  <CronPicker
                    value={form.cron_expr || ''}
                    onChange={v => setForm(p => ({ ...p, cron_expr: v }))}
                  />
                </div>
              )}

              {(form.trigger_type === 'evento' || form.trigger_type === 'ambos') && (
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Qual evento dispara o robô?</label>
                  <select value={form.event_trigger || ''} onChange={set('event_trigger')}>
                    <option value="">Selecione…</option>
                    {EVENT_OPTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group" style={{ marginBottom:12 }}>
                <label>Instruções para o robô</label>
                <textarea value={form.prompt_template || ''} onChange={set('prompt_template')}
                  rows={5} placeholder="Descreva o que o robô deve fazer quando executar…" />
              </div>

              {(form.tipo === 'prospeccao_whatsapp' || form.tipo === 'analise_conversas') && (
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Template de mensagem WhatsApp (opcional)</label>
                  <textarea value={form.whatsapp_template || ''} onChange={set('whatsapp_template')}
                    rows={3} placeholder="Olá {nome}, tudo bem?…" />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '⏳ Salvando…' : modal === 'create' ? 'Criar Robô' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de progresso */}
      {progress && (
        <div className="overlay" style={{ zIndex:1100 }}>
          <div className="modal" style={{ maxWidth:420, padding:0, overflow:'hidden' }}>
            {/* Header colorido */}
            <div style={{
              padding:'18px 24px 16px',
              background: progress.done
                ? (progress.logStatus === 'erro' ? 'rgba(239,68,68,.15)' : progress.logStatus === 'aviso' ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,.15)')
                : 'rgba(99,102,241,.12)',
              borderBottom:'1px solid var(--border)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                <span style={{ fontSize:22 }}>🤖</span>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{progress.robot.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>Executando via Cowork</div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:'20px 24px 24px' }}>
              {/* Barra de progresso */}
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>Progresso</span>
                  <span style={{ fontSize:13, fontWeight:700, color: progress.done
                    ? (progress.logStatus === 'erro' ? 'var(--danger)' : progress.logStatus === 'aviso' ? 'var(--warning)' : 'var(--success)')
                    : 'var(--accent)'
                  }}>{progress.pct}%</span>
                </div>
                <div style={{ height:10, borderRadius:20, background:'var(--card2)', overflow:'hidden' }}>
                  <div style={{
                    height:'100%',
                    width: progress.pct + '%',
                    borderRadius:20,
                    transition:'width 1s ease',
                    background: progress.done
                      ? (progress.logStatus === 'erro' ? 'var(--danger)' : progress.logStatus === 'aviso' ? 'var(--warning)' : 'var(--success)')
                      : 'linear-gradient(90deg, var(--accent), #a78bfa)',
                    boxShadow: progress.done ? 'none' : '0 0 12px rgba(99,102,241,.5)',
                    animation: progress.done ? 'none' : 'pulse-bar 2s ease-in-out infinite',
                  }} />
                </div>
              </div>

              {/* Etapa atual */}
              <div style={{
                fontSize:13, color:'var(--muted)', textAlign:'center', marginTop:14,
                minHeight:22,
              }}>
                {progress.step || progressStep(progress.pct)}
              </div>

              {/* Instrução quando aguardando */}
              {!progress.done && (
                <div style={{
                  marginTop:16, padding:'10px 14px', borderRadius:8,
                  background:'var(--card2)', fontSize:12, color:'var(--muted)',
                  lineHeight:1.6,
                }}>
                  💡 O robô está sendo executado pelo <strong>Cowork</strong>. Esta tela atualiza automaticamente quando concluir.
                </div>
              )}

              {/* Botão fechar (só quando concluído) */}
              {progress.done && (
                <button
                  className="btn btn-primary"
                  style={{ width:'100%', marginTop:18 }}
                  onClick={() => { setProgress(null); }}
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal logs */}
      {logs && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setLogs(null)}>
          <div className="modal" style={{ maxWidth:700, maxHeight:'80vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>📋 Histórico — {logs.robot.name}</h2>
              <button className="close-btn" onClick={() => setLogs(null)}>✕</button>
            </div>
            <div className="modal-body">
              {logs.items.length === 0 ? (
                <div style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>Nenhuma execução registrada ainda.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {logs.items.map(l => (
                    <div key={l.id} style={{ padding:'10px 14px', background:'var(--card2)', borderRadius:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, color: STATUS_COLOR[l.status] || 'var(--muted)' }}>
                          {l.status === 'ok' ? '✅ OK' : l.status === 'erro' ? '❌ Erro' : '⏳ ' + l.status}
                        </span>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>
                          {fmtDate(l.created_at)}{l.duration_ms ? ' · ' + l.duration_ms + 'ms' : ''}
                        </span>
                      </div>
                      {l.output && <pre style={{ fontSize:11, color:'var(--muted)', whiteSpace:'pre-wrap', margin:0, lineHeight:1.5 }}>{l.output}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
