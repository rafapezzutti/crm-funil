import React, { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);

  function getRoleFromToken() {
    try {
      const token = localStorage.getItem('token');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role || null;
    } catch { return null; }
  }

  const role = getRoleFromToken();
  const [company, setCompany]   = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

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

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('company');
    setUser(null);
    setCompany(null);
    setCompanies([]);
  }

  return (
    <AuthContext.Provider value={{ user, company, companies, loading, login, logout, switchCompany, role }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
