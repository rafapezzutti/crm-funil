import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import api from '../api';

const ICONS = ['🏥','🐾','⚽','💆','🏢','💊','🦷','👁','🧘','🏋','🐕','🌿','💅','✂️','🚗','🍽️','📚','💻'];
const DEFAULT_TYPES = [
  { value:'saude',    label:'Saúde',    icon:'🏥' },
  { value:'pet',      label:'Pet',      icon:'🐾' },
  { value:'esportes', label:'Esportes', icon:'⚽' },
  { value:'spa',      label:'Spa',      icon:'💆' },
];

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,30);
}

// ── Aba 1: Empresa & Usuários ─────────────────────────────────────────────────
function TabEmpresa({ company, user, role }) {
  const isAdmin = ['admin','master'].includes(role);
  const [companyName, setCompanyName] = useState(company?.name || '');
  const [savingName,  setSavingName]  = useState(false);
  const [members,     setMembers]     = useState([]);
  const [invite,      setInvite]      = useState({ name:'', email:'', password:'', role:'vendedor' });
  const [inviting,    setInviting]    = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/company/members').then(r => setMembers(r.data)).catch(() => {});
  }, []);

  async function saveName(e) {
    e.preventDefault();
    setSavingName(true);
    try { await api.put('/company', { name: companyName }); setMsg('✅ Nome salvo!'); }
    catch (err) { setMsg('❌ ' + (err.response?.data?.error || 'Erro.')); }
    finally { setSavingName(false); }
  }

  async function addUser(e) {
    e.preventDefault();
    if (!invite.name || !invite.email || !invite.password) { setMsg('❌ Preencha todos os campos.'); return; }
    setInviting(true);
    try {
      await api.post('/admin/invite', invite);
      setMsg('✅ Usuário adicionado!');
      setInvite({ name:'', email:'', password:'', role:'vendedor' });
      api.get('/company/members').then(r => setMembers(r.data)).catch(() => {});
    } catch (err) { setMsg('❌ ' + (err.response?.data?.error || 'Erro.')); }
    finally { setInviting(false); }
  }

  const ROLE_LABEL = { admin:'Admin', master:'Master', vendedor:'Vendedor' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {msg && (
        <div style={{ padding:'10px 16px', borderRadius:8, fontSize:13,
          background: msg.startsWith('✅') ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
          color: msg.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>
          {msg} <button onClick={() => setMsg('')} style={{ float:'right', background:'none', border:'none', cursor:'pointer', color:'inherit' }}>✕</button>
        </div>
      )}

      {/* Plano */}
      <div className="card" style={{ padding:16 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:10 }}>📋 Plano</div>
        <div>
          <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>Plano atual</div>
          <div style={{ fontWeight:700, textTransform:'uppercase', color:'var(--accent)', fontSize:15 }}>
            {company?.plan === 'trial' ? 'Ativo' : (company?.plan || 'Ativo')}
          </div>
        </div>
      </div>

      {/* Dados da empresa */}
      <div className="card" style={{ padding:16 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>🏢 Empresa</div>
        <form onSubmit={saveName} style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap', marginBottom:12 }}>
          <label style={{ flex:1, minWidth:200 }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:4 }}>Nome da empresa</div>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} disabled={!isAdmin} style={{ width:'100%' }} />
          </label>
          {isAdmin && <button type="submit" className="btn btn-primary" style={{ fontSize:13, padding:'8px 14px' }} disabled={savingName}>{savingName ? '…' : 'Salvar'}</button>}
        </form>
        <div style={{ fontSize:12 }}>
          <span style={{ color:'var(--muted)' }}>Logado como: </span>
          {user?.name} · {user?.email}
          <span style={{ marginLeft:8, fontWeight:700, textTransform:'capitalize', color:'var(--accent)' }}>{ROLE_LABEL[role] || role}</span>
        </div>
      </div>

      {/* Membros */}
      <div className="card" style={{ padding:16 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>👥 Usuários da empresa</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
          {members.map(m => (
            <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--card2)', borderRadius:8 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>{m.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{m.email}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:'var(--accent)', background:'var(--card)', padding:'2px 8px', borderRadius:20 }}>{ROLE_LABEL[m.role] || m.role}</span>
            </div>
          ))}
        </div>

        {isAdmin && (
          <>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>+ Adicionar usuário</div>
            <form onSubmit={addUser}>
              <div className="form-row form-row-2" style={{ marginBottom:8 }}>
                <div className="form-group">
                  <label>Nome</label>
                  <input value={invite.name} onChange={e => setInvite(p => ({...p, name:e.target.value}))} placeholder="João Silva" />
                </div>
                <div className="form-group">
                  <label>E-mail</label>
                  <input type="email" value={invite.email} onChange={e => setInvite(p => ({...p, email:e.target.value}))} placeholder="joao@empresa.com" />
                </div>
              </div>
              <div className="form-row form-row-2" style={{ marginBottom:8 }}>
                <div className="form-group">
                  <label>Senha inicial</label>
                  <input type="password" value={invite.password} onChange={e => setInvite(p => ({...p, password:e.target.value}))} placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="form-group">
                  <label>Função</label>
                  <select value={invite.role} onChange={e => setInvite(p => ({...p, role:e.target.value}))}>
                    <option value="vendedor">Vendedor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ fontSize:13 }} disabled={inviting}>
                {inviting ? '⏳ Adicionando…' : '+ Adicionar usuário'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── WhatsApp Connect Component ────────────────────────────────────────────────
function WhatsAppConnect({ isAdmin }) {
  const [status,       setStatus]       = useState(null);   // null | { connected, state, phone, instanceName }
  const [qr,           setQr]           = useState(null);   // base64 string do QR code
  const [loading,      setLoading]      = useState(true);
  const [connecting,   setConnecting]   = useState(false);
  const [disconnecting,setDisconnecting]= useState(false);
  const [err,          setErr]          = useState('');

  // Polling interval ref
  const pollRef      = useRef(null);
  const qrRefreshRef = useRef(null);

  function stopAll() {
    clearInterval(pollRef.current);
    clearInterval(qrRefreshRef.current);
  }

  // Busca status ao montar e a cada 5s enquanto QR estiver visível
  async function fetchStatus() {
    try {
      const { data } = await api.get('/whatsapp/evolution/status');
      setStatus(data);
      if (data.connected) {
        setQr(null);
        stopAll();
      }
    } catch (_) {}
  }

  useEffect(() => {
    fetchStatus().finally(() => setLoading(false));
    return () => stopAll();
  }, []);

  // Inicia polling de status (5s) + auto-refresh do QR (55s — expira em ~60s)
  function startPolling() {
    stopAll();
    pollRef.current      = setInterval(fetchStatus,    10000);
    qrRefreshRef.current = setInterval(handleRefreshQr, 55000);
  }

  async function handleConnect() {
    setConnecting(true); setErr(''); setQr(null); stopAll();
    try {
      const { data } = await api.post('/whatsapp/evolution/connect');
      setQr(data.qr || null);
      setStatus(s => ({ ...s, connected: false, state: 'qrcode' }));
      startPolling();
    } catch (e) {
      setErr(e.response?.data?.error || 'Erro ao gerar QR code.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm('Desconectar o WhatsApp desta empresa?')) return;
    setDisconnecting(true); setErr('');
    try {
      await api.delete('/whatsapp/evolution/disconnect');
      setStatus(s => ({ ...s, connected: false, state: 'disconnected', phone: null }));
      setQr(null);
      stopAll();
    } catch (e) {
      setErr(e.response?.data?.error || 'Erro ao desconectar.');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleRefreshQr() {
    setErr('');
    try {
      const { data } = await api.post('/whatsapp/evolution/connect');
      setQr(data.qr || null);
    } catch (e) {
      setErr(e.response?.data?.error || 'Erro ao atualizar QR.');
    }
  }

  if (loading) {
    return <div style={{ fontSize:13, color:'var(--muted)', padding:'12px 0' }}>Verificando conexão…</div>;
  }

  const connected = status?.connected;

  return (
    <div>
      {/* Status badge */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <span style={{
          display:'inline-flex', alignItems:'center', gap:6,
          padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:700,
          background: connected ? 'rgba(16,185,129,.15)' : qr ? 'rgba(251,191,36,.12)' : 'rgba(107,114,128,.1)',
          color:      connected ? 'var(--success)'       : qr ? 'var(--warning)'        : 'var(--muted)',
        }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'currentColor', display:'inline-block' }} />
          {connected ? `Conectado · ${formatWaPhone(status.phone)}` : qr ? 'Aguardando leitura do QR…' : 'Desconectado'}
        </span>
        {status?.instanceName && (
          <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace' }}>
            instância: {status.instanceName}
          </span>
        )}
      </div>

      {/* QR Code */}
      {qr && !connected && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8 }}>
            Abra o WhatsApp no celular → <strong>Dispositivos vinculados → Vincular dispositivo</strong> → aponte para o QR abaixo:
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'flex-start', flexWrap:'wrap' }}>
            <img
              src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
              alt="QR Code WhatsApp"
              style={{ width:180, height:180, borderRadius:8, border:'2px solid var(--border)', background:'#fff' }}
            />
            <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:4 }}>
              <div style={{ fontSize:12, color:'var(--muted)' }}>O QR expira em ~60 segundos.</div>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={handleRefreshQr}>
                🔄 Novo QR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ações */}
      {isAdmin && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          {!connected && (
            <button className="btn btn-primary" style={{ fontSize:13 }} onClick={handleConnect} disabled={connecting}>
              {connecting ? '⏳ Gerando QR…' : qr ? '🔄 Reconectar' : '📱 Conectar WhatsApp'}
            </button>
          )}
          {connected && (
            <button className="btn btn-ghost" style={{ fontSize:13, color:'var(--danger)' }} onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? '⏳…' : '🔌 Desconectar'}
            </button>
          )}
          {err && <span style={{ fontSize:12, color:'var(--danger)' }}>{err}</span>}
        </div>
      )}
    </div>
  );
}

function formatWaPhone(raw) {
  if (!raw) return '—';
  const digits = raw.replace(/\D/g, '');
  // Formato BR: +55 (XX) XXXXX-XXXX
  if (digits.length === 13 && digits.startsWith('55')) {
    const ddd = digits.slice(2, 4);
    const num = digits.slice(4);
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  return `+${digits}`;
}

// ── Aba 2: Configurações gerais ───────────────────────────────────────────────
function TabConfig({ role }) {
  const isAdmin = ['admin','master'].includes(role);
  const [crmTypes, setCrmTypes] = useState(DEFAULT_TYPES);
  const [newLabel, setNewLabel] = useState('');
  const [newIcon,  setNewIcon]  = useState('🏢');
  const [addErr,   setAddErr]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const [msg,      setMsg]      = useState('');

  useEffect(() => {
    api.get('/company/settings').then(r => {
      if (r.data.crm_types?.length) setCrmTypes(r.data.crm_types);
    }).catch(() => {});
  }, []);

  function addType() {
    const label = newLabel.trim();
    if (!label) { setAddErr('Digite um nome para o segmento.'); return; }
    const value = slugify(label);
    if (!value) { setAddErr('Nome inválido — use letras ou números.'); return; }
    if (crmTypes.find(t => t.value === value)) {
      setAddErr(`Já existe um segmento com o identificador "${value}". Use um nome diferente.`);
      return;
    }
    setCrmTypes(p => [...p, { value, label, icon: newIcon }]);
    setNewLabel(''); setNewIcon('🏢'); setAddErr('');
  }
  function removeType(val) { setCrmTypes(p => p.filter(t => t.value !== val)); }
  function updateType(val, field, v) { setCrmTypes(p => p.map(t => t.value === val ? { ...t, [field]: v } : t)); }

  async function saveAll() {
    setSaving(true);
    try { await api.put('/company/settings', { crm_types: crmTypes }); setMsg('✅ Salvo!'); }
    catch (err) { setMsg('❌ ' + (err.response?.data?.error || 'Erro.')); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {msg && (
        <div style={{ padding:'10px 16px', borderRadius:8, fontSize:13,
          background: msg.startsWith('✅') ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
          color: msg.startsWith('✅') ? 'var(--success)' : 'var(--danger)' }}>
          {msg} <button onClick={() => setMsg('')} style={{ float:'right', background:'none', border:'none', cursor:'pointer', color:'inherit' }}>✕</button>
        </div>
      )}

      {isAdmin && (
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? 'Salvando…' : '💾 Salvar configurações'}
          </button>
        </div>
      )}

      {/* Segmentos */}
      <div className="card" style={{ padding:16 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>🗂️ Segmentos do funil</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>Categorias de leads. Cada segmento pode ter seus próprios planos.</div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:14 }}>
          {crmTypes.map(t => (
            <div key={t.value} style={{ display:'flex', gap:8, alignItems:'center', padding:'8px 12px', background:'var(--card2)', borderRadius:8 }}>
              <select value={t.icon} disabled={!isAdmin} onChange={e => updateType(t.value,'icon',e.target.value)} style={{ width:54, fontSize:18, textAlign:'center', padding:'2px' }}>
                {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input value={t.label} disabled={!isAdmin} onChange={e => updateType(t.value,'label',e.target.value)} style={{ flex:1, fontSize:13 }} />
              <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace', minWidth:80 }}>{t.value}</span>
              {isAdmin && crmTypes.length > 1 && (
                <button onClick={() => removeType(t.value)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', fontSize:18, lineHeight:1 }}>✕</button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <select value={newIcon} onChange={e => setNewIcon(e.target.value)} style={{ width:54, fontSize:18, textAlign:'center', padding:'2px', flex:'none' }}>
                {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input
                value={newLabel}
                onChange={e => { setNewLabel(e.target.value); setAddErr(''); }}
                placeholder="Nome do segmento (ex: Locação Residencial)"
                style={{ flex:1, fontSize:13, borderColor: addErr ? 'var(--danger)' : undefined }}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addType())}
              />
              <button className="btn btn-primary" style={{ fontSize:13, padding:'8px 14px', flex:'none' }} onClick={addType}>
                + Adicionar
              </button>
            </div>
            {newLabel && (
              <div style={{ fontSize:11, color:'var(--muted)', paddingLeft:62 }}>
                Identificador interno: <code style={{ color:'var(--accent)' }}>{slugify(newLabel) || '…'}</code>
              </div>
            )}
            {addErr && (
              <div style={{ fontSize:12, color:'var(--danger)', paddingLeft:62 }}>{addErr}</div>
            )}
          </div>
        )}
      </div>

      {/* WhatsApp via QR Code */}
      <div className="card" style={{ padding:16 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>📱 WhatsApp</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
          Conecte o WhatsApp da sua empresa para receber respostas de leads diretamente no CRM.
        </div>
        <WhatsAppConnect isAdmin={isAdmin} />
      </div>

    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Settings() {
  const { company, user, role } = useAuth();
  const [tab, setTab] = useState('empresa');

  const tabs = [
    { key:'empresa', label:'🏢 Empresa & Usuários' },
    { key:'config',  label:'⚙️ Configurações' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <span className="text-muted" style={{ fontSize:13 }}>{company?.name}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'10px 18px', border:'none', cursor:'pointer', fontSize:13, fontWeight:600,
            background:'none', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--muted)',
            marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'empresa' && <TabEmpresa company={company} user={user} role={role} />}
      {tab === 'config'  && <TabConfig  role={role} />}
    </div>
  );
}
