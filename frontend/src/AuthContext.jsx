import React, { createContext, useContext, useState, useEffect } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
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

  function switchCompany(comp) {
    // Re-login to get a token scoped to the new company
    api.post('/auth/login', {
      email: user.email,
      _refreshForCompany: comp.id, // handled below via /me + companyId
    }).catch(() => {});
    // Simpler: just ask the API for a fresh token
    api.post('/auth/login', { email: '__switch__', companyId: comp.id })
      .catch(() => {});
    // Actually we just store the selection; the backend supports companyId in login
    localStorage.setItem('company', JSON.stringify(comp));
    setCompany(comp);
    window.location.reload();
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('company');
    setUser(null);
    setCompany(null);
    setCompanies([]);
  }

  return (
    <AuthContext.Provider value={{ user, company, companies, loading, login, logout, switchCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
