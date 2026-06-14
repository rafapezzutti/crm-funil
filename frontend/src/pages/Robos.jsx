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
  { value:'cron',   label:'⏰ Agendamento' },
  { value:'evento', label:'⚡ Evento' },
  { value:'ambos',  label:'🔄 Ambos' },
];
const EVENT_OPTS = [
  { value:'lead_created',   label:'Lead criado' },
  { value:'lead_moved',     label:'Lead mudou de etapa' },
  { value:'lead_closed',    label:'Lead fechado' },
  { value:'whatsapp_reply', label:'Resposta WhatsApp' },
];
const STATUS_COLOR = { ok:'var(--success)', erro:'var(--danger)', running:'var(--accent)' };

function tipoLabel(v) { return TIPO_OPTS.find(t => t.value === v)?.label || v; }
function triggerLabel(v) { return TRIGGER_OPTS.find(t => t.value === v)?.label || v; }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/robots');
      setRobots(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setForm(EMPTY); setErr(''); setModal('create'); }
  function openEdit(r)  { setForm({ ...r }); setErr(''); setModal(r); }

  async function openLogs(r) {
    try {
      const { data } = await api.get(`/robots/${r.id}/logs`);
      setLogs({ robot: r, items: data });
    } catch { setLogs({ robot: r, items: [] }); }
  }

  async function seedDefault() {
    if (!confirm('Criar os 6 robôs padrão da P Soluções?')) return;
    setSeeding(true);
    try {
      const { data } = await api.post('/robots/seed');
      setMsg(`✅ Criados: ${data.created.join(', ')}${data.skipped.length ? ` · Já existiam: ${data.skipped.join(', ')}` : ''}`);
      load();
    } catch (e) {
      setMsg('❌ ' + (e.response?.data?.error || 'Erro ao criar robôs padrão.'));
    } finally { setSeeding(false); }
  }

  async function save() {
    if (!form.name.trim()) { setErr('Nome é obrigatório.'); return; }
    setSaving(true); setErr('');
    try {
      if (modal === 'create') {
        await api.post('/robots', form);
        setMsg('✅ Robô criado!');
      } else {
        await api.put(`/robots/${modal.id}`, form);
        setMsg('✅ Robô atualizado!');
      }
      setModal(null);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Erro ao salvar.');
    } finally { setSaving(false); }
  }

  async function toggleAtivo(r) {
    try {
      await api.put(`/robots/${r.id}`, { ...r, ativo: !r.ativo });
      load();
    } catch { /* ignore */ }
  }

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>🤖 Robôs</h1>
          <span className="text-muted" style={{ fontSize:13 }}>
            {isMaster ? 'Todas as empresas' : 'Automações desta empresa'}
          </span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isMaster && (
            <button className="btn btn-ghost" onClick={seedDefault} disabled={seeding}
              title="Cria os 6 processos padrão da P Soluções">
              {seeding ? '⏳' : '🌱 Seed padrão'}
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
            {isMaster && (
              <button className="btn btn-ghost" onClick={seedDefault} disabled={seeding}>
                {seeding ? '⏳' : '🌱 Criar 6 robôs padrão'}
              </button>
            )}
            {isAdmin && (
              <button className="btn btn-primary" onClick={openCreate}>+ Criar robô</button>
            )}
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
                  <div style={{ fontSize:11, color:'var(--accent)', marginBottom:4, fontWeight:600 }}>
                    🏢 {r.company_name}
                  </div>
                )}
                {r.description && (
                  <div style={{ fontSize:12, color:'var(--muted)', marginBottom:6 }}>{r.description}</div>
                )}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, background:'var(--card2)', padding:'2px 8px', borderRadius:20 }}>
                    {tipoLabel(r.tipo)}
                  </span>
                  <span style={{ fontSize:11, background:'var(--card2)', padding:'2px 8px', borderRadius:20 }}>
                    {triggerLabel(r.trigger_type)}
                  </span>
                  {r.cron_expr && (
                    <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace' }}>{r.cron_expr}</span>
                  )}
                </div>
              </div>

              <div style={{ textAlign:'right', flexShrink:0, minWidth:110 }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>Última execução</div>
                <div style={{ fontSize:12, marginBottom:4 }}>{fmtDate(r.last_run_at)}</div>
                {r.last_status && (
                  <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[r.last_status] || 'var(--muted)' }}>
                    {r.last_status === 'ok' ? '✅ OK' : r.last_status === 'erro' ? '❌ Erro' : '⏳ Running'}
                  </span>
                )}
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                  {r.total_runs} exec.
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }}
                  onClick={() => openLogs(r)}>📋 Logs</button>
                {isAdmin && (
                  <>
                    <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 10px' }}
                      onClick={() => openEdit(r)}>✏️ Editar</button>
                    <button className="btn btn-ghost"
                      style={{ fontSize:12, padding:'5px 10px', color: r.ativo ? 'var(--warning)' : 'var(--success)' }}
                      onClick={() => toggleAtivo(r)}>
                      {r.ativo ? '⏸ Pausar' : '▶️ Ativar'}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal criar/editar ───────────────────────────────────────────────── */}
      {modal !== null && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth:600, maxHeight:'90vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>{modal === 'create' ? '🤖 Novo Robô' : `✏️ Editar: ${modal.name}`}</h2>
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
                <input value={form.description || ''} onChange={set('description')}
                  placeholder="O que este robô faz?" />
              </div>

              <div className="form-row form-row-2" style={{ marginBottom:12 }}>
                <div className="form-group">
                  <label>Gatilho</label>
                  <select value={form.trigger_type} onChange={set('trigger_type')}>
                    {TRIGGER_OPTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {(form.trigger_type === 'cron' || form.trigger_type === 'ambos') && (
                  <div className="form-group">
                    <label>Cron expression</label>
                    <input value={form.cron_expr || ''} onChange={set('cron_expr')}
                      placeholder="0 9 * * *" style={{ fontFamily:'monospace' }} />
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
                      min hora dia mês semana — ex: 0 9 * * * = todo dia às 9h
                    </div>
                  </div>
                )}
              </div>

              {(form.trigger_type === 'evento' || form.trigger_type === 'ambos') && (
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Evento</label>
                  <select value={form.event_trigger || ''} onChange={set('event_trigger')}>
                    <option value="">Selecione…</option>
                    {EVENT_OPTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              )}

              <div className="form-group" style={{ marginBottom:12 }}>
                <label>Prompt / Instruções</label>
                <textarea value={form.prompt_template || ''} onChange={set('prompt_template')}
                  rows={5} placeholder="Descreva o que o robô deve fazer quando executar…" />
              </div>

              {(form.tipo === 'prospeccao_whatsapp' || form.tipo === 'analise_conversas') && (
                <div className="form-group" style={{ marginBottom:12 }}>
                  <label>Template WhatsApp (opcional)</label>
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

      {/* ── Modal logs ──────────────────────────────────────────────────────── */}
      {logs && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setLogs(null)}>
          <div className="modal" style={{ maxWidth:700, maxHeight:'80vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h2>📋 Logs — {logs.robot.name}</h2>
              <button className="close-btn" onClick={() => setLogs(null)}>✕</button>
            </div>
            <div className="modal-body">
              {logs.items.length === 0 ? (
                <div style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>
                  Nenhuma execução registrada ainda.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {logs.items.map(l => (
                    <div key={l.id} style={{ padding:'10px 14px', background:'var(--card2)', borderRadius:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:12, fontWeight:700, color: STATUS_COLOR[l.status] || 'var(--muted)' }}>
                          {l.status === 'ok' ? '✅ OK' : l.status === 'erro' ? '❌ Erro' : `⏳ ${l.status}`}
                        </span>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>
                          {fmtDate(l.created_at)}{l.duration_ms ? ` · ${l.duration_ms}ms` : ''}
                        </span>
                      </div>
                      {l.output && (
                        <pre style={{ fontSize:11, color:'var(--muted)', whiteSpace:'pre-wrap', margin:0, lineHeight:1.5 }}>
                          {l.output}
                        </pre>
                      )}
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
