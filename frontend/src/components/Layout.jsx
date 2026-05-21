import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import styles from './Layout.module.css';

const NAV = [
  { to: '/',          label: 'Funil',      icon: '⬛' },
  { to: '/dashboard', label: 'Dashboard',  icon: '📊' },
  { to: '/team',      label: 'Equipe',     icon: '👥' },
  { to: '/settings',  label: 'Empresa',    icon: '⚙️'  },
];

export default function Layout() {
  const { user, company, companies, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

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
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.bottom}>
          <div className={styles.company} title={company?.name}>{company?.name}</div>
          <div className={styles.userRow}>
            <span className={styles.userName}>{user?.name}</span>
            <button className={styles.logoutBtn} onClick={logout} title="Sair">↩</button>
          </div>
        </div>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
