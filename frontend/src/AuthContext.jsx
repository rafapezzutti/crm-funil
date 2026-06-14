import React, { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

function decodeToken(token) {
  try { return JSON.parse(atob(token.split('.')[1])); }
  catch { return null; }
}

export function AuthProvider({ children }) {
  const [user,      setUser]      = useState(null);
  const [company,   setCompany]   = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading,   setLoading]   = useState(true);

  // Impersonation state
  const [impersonating,    setImpersonating]    = useState(false);
  const [originalToken,    setOriginalToken]    = useState(null);
  const [originalCompany,  setOriginalCompany]  = useState(null);

  function getRoleFromToken() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      return decodeToken(token)?.role || null;
    } catch { return null; }
  }

  const role = getRoleFromToken();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    // Restore impersonation state across reload
    const imp = localStorage.getItem('impersonating');
    const origTok = localStorage.getItem('originalToken');
    const origComp = localStorage.getItem('originalCompany');
    if (imp === 'true' && origTok) {
      setImpersonating(true);
      setOriginalToken(origTok);
      setOriginalCompany(origComp ? JSON.parse(origComp) : null);
    }

    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        setCompanies(data.companies);
        const stored = localStorage.getItem('company');
        const comp = stored
          ? data.companies.find(c => c.id === JSON.parse(stored).id) || data.companies[0]
          : data.companies[0];
        setCompany(comp);
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('company');
      })
      .finally(() => setLoading(false));
  }, []);

  function login(token, userData, companyData, companiesList) {
    localStorage.setItem('token', token);
    localStorage.setItem('company', JSON.stringify(companyData));
    setUser(userData);
    setCompany(companyData);
    setCompanies(companiesList || [companyData]);
  }

  async function switchCompany(comp) {
    try {
      const { data } = await api.post('/auth/switch-company', { companyId: comp.id });
      localStorage.setItem('token',   data.token);
      localStorage.setItem('company', JSON.stringify(data.company));
      setCompany(data.company);
      window.location.reload();
    } catch (err) {
      console.error('Erro ao trocar empresa:', err);
    }
  }

  // Impersonate: master entra no contexto de outro cliente
  async function impersonate(targetCompanyId) {
    try {
      const { data } = await api.post('/master/impersonate', { companyId: targetCompanyId });
      // Salva token original antes de trocar
      const currentToken = localStorage.getItem('token');
      const currentCompany = localStorage.getItem('company');
      localStorage.setItem('originalToken',   currentToken);
      localStorage.setItem('originalCompany', currentCompany);
      localStorage.setItem('impersonating',   'true');
      localStorage.setItem('token',   data.token);
      localStorage.setItem('company', JSON.stringify(data.company));
      window.location.reload();
    } catch (err) {
      console.error('Erro ao impersonar:', err);
    }
  }

  // Sai da impersonation, volta ao token original
  function exitImpersonation() {
    const orig = localStorage.getItem('originalToken');
    const origComp = localStorage.getItem('originalCompany');
    if (!orig) return;
    localStorage.setItem('token', orig);
    if (origComp) localStorage.setItem('company', origComp);
    localStorage.removeItem('originalToken');
    localStorage.removeItem('originalCompany');
    localStorage.removeItem('impersonating');
    window.location.reload();
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('company');
    localStorage.removeItem('originalToken');
    localStorage.removeItem('originalCompany');
    localStorage.removeItem('impersonating');
    setUser(null);
    setCompany(null);
    setCompanies([]);
  }

  return (
    <AuthContext.Provider value={{
      user, company, companies, loading, role,
      login, logout, switchCompany,
      impersonating, impersonate, exitImpersonation,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
