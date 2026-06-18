import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';
import { useAuth } from './AuthContext';

// Paleta de cores/badges por posição — mapeia index → estilo visual
const PALETTE = [
  { color: 'var(--crm-saude)',    badge: 'badge-saude'    },
  { color: 'var(--crm-pet)',      badge: 'badge-pet'      },
  { color: 'var(--crm-esportes)', badge: 'badge-esportes' },
  { color: 'var(--crm-spa)',      badge: 'badge-spa'      },
  { color: 'var(--warning)',      badge: 'badge-negociacao' },
  { color: 'var(--purple)',       badge: 'badge-piloto'   },
  { color: 'var(--danger)',       badge: 'badge-perdido'  },
  { color: 'var(--muted)',        badge: 'badge-cancelado' },
];

const DEFAULT_TYPES = [
  { value: 'saude',    label: 'Saúde',    icon: '🏥' },
  { value: 'pet',      label: 'Pet',      icon: '🐾' },
  { value: 'esportes', label: 'Esportes', icon: '⚽' },
  { value: 'spa',      label: 'Spa',      icon: '💆' },
];

const CrmTypesContext = createContext({
  types:        DEFAULT_TYPES,
  crmLabel:     v => v || '—',
  crmColor:     _v => 'var(--accent)',
  crmBadgeClass:_v => '',
  crmIcon:      _v => '',
});

export function CrmTypesProvider({ children }) {
  const { user } = useAuth();
  const [types, setTypes] = useState(DEFAULT_TYPES);

  useEffect(() => {
    if (!user) return;
    api.get('/company/crm-types')
      .then(r => { if (Array.isArray(r.data) && r.data.length) setTypes(r.data); })
      .catch(() => {});
  }, [user?.id]); // re-fetch ao trocar de empresa (impersonation)

  function getIdx(value) {
    const i = types.findIndex(t => t.value === value);
    return i >= 0 ? i : 0;
  }

  function crmLabel(v) {
    const t = types.find(x => x.value === v);
    return t ? t.label : v || '—';
  }

  function crmColor(v) {
    return PALETTE[getIdx(v) % PALETTE.length].color;
  }

  function crmBadgeClass(v) {
    return PALETTE[getIdx(v) % PALETTE.length].badge;
  }

  function crmIcon(v) {
    const t = types.find(x => x.value === v);
    return t ? (t.icon || '') : '';
  }

  return (
    <CrmTypesContext.Provider value={{ types, crmLabel, crmColor, crmBadgeClass, crmIcon }}>
      {children}
    </CrmTypesContext.Provider>
  );
}

export function useCrmTypes() {
  return useContext(CrmTypesContext);
}
