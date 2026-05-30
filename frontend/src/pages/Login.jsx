import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import styles from './Auth.module.css';

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      login(data.token, data.user, data.company, data.companies);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        {/* Logo P. Soluções */}
        <div style={{ textAlign:'center', marginBottom:4 }}>
          <img src="/logo-p.png" alt="P. Soluções"
            style={{ height:64, objectFit:'contain' }}
            onError={e => { e.target.style.display='none'; }} />
        </div>
        {/* Nome do produto */}
        <div style={{ textAlign:'center', marginBottom:4 }}>
          <span style={{ fontSize:22, fontWeight:700, color:'var(--accent)', letterSpacing:'-0.5px' }}>
            P. Funil
          </span>
        </div>
        <h2 className={styles.title}>Entrar</h2>
        {error && <p className={styles.error}>{error}</p>}
        <label className={styles.label}>E-mail
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className={styles.label}>Senha
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        <button type="submit" className={styles.btn} disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className={styles.links}>
          <Link to="/forgot-password">Esqueceu a senha?</Link>
        </p>
        <p style={{ marginTop: 16, fontSize: 11, color: '#666', textAlign: 'center' }}>
          Powered by P. Soluções
        </p>
      </form>
    </div>
  );
}
