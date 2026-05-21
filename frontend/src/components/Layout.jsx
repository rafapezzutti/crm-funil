import React, { useState, useRef, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import styles from './Layout.module.css';

const NAV = [
  { to: '/',          label: 'Funil',      icon: '⬛' },
  { to: '/dashboard', label: 'Dashboard',  icon: '📊' },
  { to: '/team',      label: 'Equipe',     icon: '👥' },
  { to: '/settings',  label: 'Empresa',    icon: '⚙️'  },
];

export default function Layout() {
  const { user, company, companies, logout, switchCompany } = useAuth();
  const [dropOpen, setDropOpen]   = useState(false);
  const [switching, setSwitching] = useState(false);
  const dropRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function handleSwitch(comp) {
    if (comp.id === company?.id) { setDropOpen(false); return; }
    setSwitching(true);
    setDropOpen(false);
    await switchCompany(comp);
    setSwitching(false);
  }

  const multiCompany = companies && companies.length > 1;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>CRM Funil</div>
        <nav className={styles.nav}>
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              clas