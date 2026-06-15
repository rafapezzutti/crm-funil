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

  const [impersonating,   setImpersonating]   = useState(false);
  const [originalToken,   setOriginalToken]   = useState(null);
  const [originalCompany, setOriginalCompany] = useState(null);

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

    const imp     = localStorage.getItem('impersonating');
    const origTok = localStorage.getItem('originalToken');
    const origComp= localStorage.getItem('originalCompany');
    if (imp === 'true' && origTok) {
      setImpersonating(true);
      setOriginalToken(origTok);
      setOriginalCompany(origComp ? JSON.parse(origComp) : null);
    }

    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        setCompanies(data.companies);

        // Prioridade: 1) companyId do JWT  2) id salvo no localStorage  3) empresa master  4) primeira
        const payload  = decodeToken(token);
        const jwtCompId = payload?.companyId;
        const stored   = localStorage.getItem('company');
        const storedId = stored ? JSON.parse(stored).id : null;

        const comp =
          (jwtCompId && data.companies.find(c => c.id === jwtCompId)) ||
          (storedId  && data.companies.find(c => c.id === storedId))  ||
          data.companies.find(c => c.role === 'master')               ||
          data.companies[0];

        setCompany(comp);
        // Sincroniza localStorage com a empresa resolvida
        if (comp) localStorage.setItem('company', JSON.stringify(comp));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('company');
      })
      .finally(() => setLoading(false));
  }, []);

  function login(token, userData, companyData, companiesList) {
    localStorage.setItem('token',   token);
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

  async function impersonate(targetCompanyId) {
    try {
      const { data } = await api.post('/master/impersonate', { companyId: targetCompanyId });
      const currentToken   = localStorage.getItem('token');
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

  function exitImpersonation() {
    const orig     = localStorage.getItem('originalToken');
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
