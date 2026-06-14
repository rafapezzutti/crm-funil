import { useState, useEffect } from 'react';
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

export default function Settings() {
  const { company, user, role } = useAuth();
  const isAdmin = role === 'admin' || role === 'master';

  const [companyName, setCompanyName] = useState(company?.name || '');
  const [savingName, setSavingName]   = useState(false);

  const [crmTypes, setCrmTypes] = useState(DEFAULT_TYPES);
  const [newLabel, setNewLabel] = useState('');
  const [newIcon,  setNewIcon]  = useState('🏢');

  const [wa, setWa]             = useState({ whatsapp_api_url:'', whatsapp_api_token:'', whatsapp_instance:'' });
  const [waStatus, setWaStatus] = useState(null);
  const [testingWa, setTestingWa] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState('');

  useEffect(() => {
    api.get('/company/settings').then(r => {
      if (r.data.crm_types?.length) setCrmTypes(r.data.crm_types);
      setWa({
        whatsapp_api_url:   r.data.whatsapp_api_url   || '',
        whatsapp_api_token: r.data.whatsapp_api_token || '',
        whatsapp_instance:  r.data.whatsapp_instance  || '',
      });
    }).catch(() => {});
  }, []);

  async function saveName(e) {
    e.preventDefault();
    setSavingName(true);
    try {
      await api.put('/company', { name: companyName });
      setMsg('✅ Nome atualizado!');
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.error || 'Erro ao salvar.'));
    } finally { setSavingName(false); }
  }

  function addType() {
    const label = newLabel.trim();
    if (!label) return;
    const value = slugify(label);
    if (crmTypes.find(t => t.value === value)) return;
    setCrmTypes(p => [...p, { value, label, icon: newIcon }]);
    setNewLabel(''); setNewIcon('🏢');
  }

  function removeType(val) { setCrmTypes(p => p.filter(t => t.value !== val)); }
  function updateType(val, field, v) {
    setCrmTypes(p => p.map(t => t.value === val ? { ...t, [field]: v } : t));
  }

  async function saveAll() {
    setSaving(true);
    try {
      await api.put('/company/settings', { crm_types: crmTypes, ...wa });
      setMsg('✅ Configurações salvas!');
    } catch (err) {
      setMsg('❌ ' + (err.response?.data?.error || 'Erro ao salvar.'));
    } finally { setSaving(false); }
  }

  async function testWhatsapp() {
    setTestingWa(true); setWaStatus(null);
    try {
      const { data } = await api.post('/company/settings/test-whatsapp', wa);
      setWaStatus(data);
    } catch (err) {
      setWaStatus({ connected: false, message: err.response?.data?.error || 'Não foi possível conectar.' });
    } finally { setTestingWa(false); }
  }

  const trialDias = company?.trial_ends_at
    ? Math.ceil((new Date(company.trial_ends_at) - Date.now()) / 86400000)
    : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>⚙️ Configurações</h1>
          <span className="text-muted" style={{fontSize:13}}>Personalize o P. Funil para sua empresa</span>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? 'Salvando…' : '💾 Salvar tudo'}
          </button>
        )}
      </div>

      {msg && (
        <div style={{
          padding:'10px 16px', borderRadius:8, marginBottom:16, fontSize:13,
          background: msg.startsWith('✅') ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
          color:      msg.startsWith('✅') ? 'var(--success)'        : 'var(--danger)',
        }}>
          {msg}
          <button onClick={() => setMsg('')} style={{float:'right', background:'none', border:'none', cursor:'pointer', color:'inherit', fontSize:15}}>✕</button>
        </div>
      )}

      {/* Plano */}
      <div className="card" style={{marginBottom:16, padding:16}}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:10}}>📋 Plano atual</div>
        <div style={{display:'flex', gap:24, flexWrap:'wrap', alignItems:'center'}}>
          <div>
            <div style={{fontSize:11, color:'var(--muted)', marginBottom:2}}>Plano</div>
            <div style={{fontWeight:700, textTransform:'uppercase', color:'var(--accent)', fontSize:15}}>
              {company?.plan || 'trial'}
            </div>
          </div>
          {trialDias !== null && company?.plan === 'trial' && (
            <div>
              <div style={{fontSize:11, color:'var(--muted)', marginBottom:2}}>Trial</div>
              <div style={{fontWeight:700, color: trialDias <= 3 ? 'var(--danger)' : 'var(--warning)'}}>
                {trialDias > 0 ? `${trialDias} dias restantes` : 'Expirado'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dados da empresa */}
      <div className="card" style={{marginBottom:16, padding:16}}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:14}}>🏢 Dados da empresa</div>
        <form onSubmit={saveName} style={{display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap'}}>
          <label style={{flex:1, minWidth:200}}>
            <div style={{fontSize:12, color:'var(--muted)', marginBottom:4}}>Nome da empresa</div>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)}
              disabled={!isAdmin} style={{width:'100%'}} />
          </label>
          {isAdmin && (
            <button type="submit" className="btn btn-primary" style={{fontSize:13, padding:'8px 14px'}} disabled={savingName}>
              {savingName ? '…' : 'Salvar'}
            </button>
          )}
        </form>
        <div style={{marginTop:12}}>
          <div style={{fontSize:11, color:'var(--muted)'}}>Usuário logado</div>
          <div style={{fontSize:13}}>{user?.name} · {user?.email} · <span style={{textTransform:'capitalize', fontWeight:600}}>{role}</span></div>
        </div>
      </div>

      {/* Segmentos */}
      <div className="card" style={{marginBottom:16, padding:16}}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>🗂️ Segmentos do funil</div>
        <div style={{fontSize:12, color:'var(--muted)', marginBottom:14}}>
          Categorias de leads. Cada segmento pode ter seus próprios planos.
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8, marginBottom:14}}>
          {crmTypes.map(t => (
            <div key={t.value} style={{display:'flex', gap:8, alignItems:'center', padding:'8px 12px',
              background:'var(--card2)', borderRadius:8}}>
              <select value={t.icon} disabled={!isAdmin}
                onChange={e => updateType(t.value, 'icon', e.target.value)}
                style={{width:54, fontSize:18, textAlign:'center', padding:'2px'}}>
                {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
              </select>
              <input value={t.label} disabled={!isAdmin}
                onChange={e => updateType(t.value, 'label', e.target.value)}
                style={{flex:1, fontSize:13}} />
              <span style={{fontSize:11, color:'var(--muted)', fontFamily:'monospace', minWidth:80}}>{t.value}</span>
              {isAdmin && crmTypes.length > 1 && (
                <button onClick={() => removeType(t.value)}
                  style={{background:'none', border:'none', cursor:'pointer', color:'var(--danger)', fontSize:18, lineHeight:1}}>✕</button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <select value={newIcon} onChange={e => setNewIcon(e.target.value)}
              style={{width:54, fontSize:18, textAlign:'center', padding:'2px'}}>
              {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
            </select>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
              placeholder="Novo segmento…" style={{flex:1, fontSize:13}}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addType())} />
            <button className="btn btn-primary" style={{fontSize:13, padding:'8px 14px'}}
              onClick={addType} disabled={!newLabel.trim()}>
              + Adicionar
            </button>
          </div>
        )}
      </div>

      {/* WhatsApp */}
      <div className="card" style={{marginBottom:16, padding:16}}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:4}}>📱 WhatsApp (Evolution API)</div>
        <div style={{fontSize:12, color:'var(--muted)', marginBottom:14}}>
          Configure sua instância própria da Evolution API para integração com WhatsApp.
        </div>
        <div style={{display:'grid', gap:12}}>
          <label>
            <div style={{fontSize:12, color:'var(--muted)', marginBottom:4}}>URL da API</div>
            <input value={wa.whatsapp_api_url} disabled={!isAdmin}
              onChange={e => setWa(p => ({...p, whatsapp_api_url: e.target.value}))}
              placeholder="https://sua-evolution-api.fly.dev" style={{width:'100%'}} />
          </label>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <label>
              <div style={{fontSize:12, color:'var(--muted)', marginBottom:4}}>Nome da instância</div>
              <input value={wa.whatsapp_instance} disabled={!isAdmin}
                onChange={e => setWa(p => ({...p, whatsapp_instance: e.target.value}))}
                placeholder="minha-empresa" style={{width:'100%'}} />
            </label>
            <label>
              <div style={{fontSize:12, color:'var(--muted)', marginBottom:4}}>Token (apikey)</div>
              <input value={wa.whatsapp_api_token} disabled={!isAdmin} type="password"
                onChange={e => setWa(p => ({...p, whatsapp_api_token: e.target.value}))}
                placeholder="••••••••••••" style={{width:'100%'}} />
            </label>
          </div>
          {isAdmin && (
            <div style={{display:'flex', gap:10, alignItems:'center', flexWrap:'wrap'}}>
              <button className="btn btn-ghost" style={{fontSize:13}} onClick={testWhatsapp}
                disabled={testingWa || !wa.whatsapp_api_url}>
                {testingWa ? '⏳ Testando…' : '🔌 Testar conexão'}
              </button>
              {waStatus && (
                <span style={{fontSize:13, color: waStatus.connected ? 'var(--success)' : 'var(--warning)'}}>
                  {waStatus.message || waStatus.error}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
