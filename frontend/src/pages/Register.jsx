import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import styles from './Auth.module.css';

const SEGMENTS = [
  { value:'saude',    label:'🏥 Saúde',       desc:'Clínicas, consultórios, laboratórios' },
  { value:'pet',      label:'🐾 Pet',          desc:'Pet shops, veterinárias, hotéis' },
  { value:'esportes', label:'⚽ Esportes',     desc:'Academias, estúdios, personal' },
  { value:'spa',      label:'💆 Beleza & Spa', desc:'Estéticas, salões, spas' },
  { value:'outro',    label:'🏢 Outro',        desc:'Qualquer outro segmento' },
];

export default function Register() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [step, setStep]     = useState(1); // 1=dados, 2=segmento
  const [form, setForm]     = useState({ name:'', email:'', password:'', companyName:'', segment:'saude' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  function nextStep(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password || !form.companyName) {
      setError('Preencha todos os campos.'); return;
    }
    if (form.password.length < 6) { setError('Senha deve ter ao menos 6 caracteres.'); return; }
    setError('');
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.token, data.user, data.company, [data.company]);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar conta.');
      setStep(1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={step === 1 ? nextStep : handleSubmit}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:4 }}>
          <img src="/logo-pfunil.svg" alt="P. Funil" style={{ height:52, objectFit:'contain' }} />
        </div>
        <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:20 }}>
          Teste grátis por 14 dias
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {step === 1 && (
          <>
            <label className={styles.label}>Seu nome
              <input value={form.name} onChange={set('name')} required autoFocus placeholder="João Silva" />
            </label>
            <label className={styles.label}>E-mail comercial
              <input type="email" value={form.email} onChange={set('email')} required placeholder="joao@empresa.com" />
            </label>
            <label className={styles.label}>Senha
              <input type="password" value={form.password} onChange={set('password')} required placeholder="Mínimo 6 caracteres" />
            </label>
            <label className={styles.label}>Nome da empresa
              <input value={form.companyName} onChange={set('companyName')} required placeholder="Clínica XYZ" />
            </label>
            <button type="submit" className={styles.button}>
              Continuar →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:10 }}>Qual é o seu segmento?</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {SEGMENTS.map(s => (
                  <label key={s.value} style={{
                    display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
                    borderRadius:8, cursor:'pointer',
                    border: form.segment === s.value
                      ? '2px solid var(--accent)'
                      : '2px solid var(--border)',
                    background: form.segment === s.value ? 'var(--accent-faint, rgba(0,223,196,0.08))' : 'transparent',
                  }}>
                    <input type="radio" name="segment" value={s.value}
                      checked={form.segment === s.value}
                      onChange={set('segment')}
                      style={{ display:'none' }} />
                    <span style={{ fontSize:18 }}>{s.label.split(' ')[0]}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{s.label.slice(3)}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{s.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" className={styles.button}
                style={{ background:'var(--card2)', color:'var(--text)', flex:'0 0 auto', width:44 }}
                onClick={() => setStep(1)}>←</button>
              <button type="submit" className={styles.button} disabled={loading} style={{ flex:1 }}>
                {loading ? 'Criando conta…' : '🚀 Criar conta grátis'}
              </button>
            </div>
          </>
        )}

        <p style={{ textAlign:'center', marginTop:16, fontSize:13, color:'var(--muted)', borderTop:'1px solid var(--border)', paddingTop:16 }}>
          Já tem conta? <Link to="/login" style={{ color:'var(--accent)', fontWeight:600 }}>Entrar</Link>
        </p>
      </form>
    </div>
  );
}
