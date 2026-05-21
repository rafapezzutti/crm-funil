import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../AuthContext';
import styles from './Auth.module.css';

export default function Register() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]     = useState({ name:'', email:'', password:'', companyName:'' });
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('Senha deve ter ao menos 6 caracteres.'); return; }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', form);
      login(data.token, data.user, data.company, [data.company]);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <h1 className={styles.logo}>CRM Funil</h1>
        <h2 className={styles.title}>Criar conta</h2>
        {error && <p className={styles.error}>{error}</p>}
        <label className={styles.label}>Seu nome
          <input value={form.name} onChange={set('name')} required autoFocus />
        </label>
        <label className={styles.label}>E-mail
          <input type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label className={styles.label}>Senha
          <input type="password" value={form.password} onChange={set('password')} required />
        </label>
        <label className={styles.label}>Nome da empresa
          <input value={form.companyName} onChange={set('companyName')} required />
        </label>
        <button type="submit" className={styles.btn} disabled={loading}>
          {loading ? 'Criando…' : 'Criar conta'}
        </button>
        <p className={styles.links}>
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </form>
    </div>
  );
}
