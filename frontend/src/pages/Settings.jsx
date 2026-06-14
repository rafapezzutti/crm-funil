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
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').slice(0,30);
}

export default function Settings() {
  const { company, user, role } = useAuth();
  const isAdmin = role === 'admin';

  // Empresa
  const [companyName, setCompanyName] = useState(company?.name || '');
  const [savingName, setSavingName]   = useState(false);

  // CRM Types
  const [crmTypes, setCrmTypes] = useState(DEFAULT_TYPES);
  const [newLabel, setNewLabel] = useState('');
  const [newIcon,  setNewIcon]  = useState('🏢');

  // WhatsApp
  const [wa, setWa]           = useState({ whatsapp_api_url:'', whatsapp_api_token:'', whatsapp_instance:'' });
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

      {/* ── Plano / Trial ── */}
      <div className="card" style={{marginBottom:16, padding:16}}>
        <div style={{fontWeight:700, fontSize:14, marginBottom:10}}>📋 Plano atual</div>
        <div style={{display:'flex', gap:24, flexWrap:'wrap', alignItems:'center'}}>
          <div>
            <div style={{fontSize:11, color:'var(--muted)', marginBottom:2}}>Plano</div>
            <div style={{fontWeight:700, textTransform:'uppercase', color:'var(--accent)', fontSize:15}}>
              {company?.plan || 'trial'}