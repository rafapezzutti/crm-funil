import { useEffect, useRef, useState } from 'react';

const OPS_URL = 'https://crm-master-psolucoes.onrender.com/ops';

export default function Ops() {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  function reload() {
    setLoading(true);
    setError(false);
    setLastRefresh(new Date());
    if (iframeRef.current) {
      iframeRef.current.src = OPS_URL + '?t=' + Date.now();
    }
  }

  useEffect(() => {
    // Auto-refresh a cada 60s
    const interval = setInterval(reload, 60_000);
    return () => clearInterval(interval);
  }, []);

  const ts = lastRefresh.toLocaleTimeString('pt-BR');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Barra superior */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', background: 'var(--card)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🚀</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              Ops Dashboard
            </h2>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Status dos robôs · Leads Neon · CRM Master
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            Última atualização: {ts}
          </span>
          <button
            onClick={reload}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', border: 'none',
              fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            🔄 Atualizar
          </button>
          <a
            href={OPS_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              background: 'var(--card2)', color: 'var(--text)', border: '1px solid var(--border)',
              fontSize: 12, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ↗ Abrir externo
          </a>
        </div>
      </div>

      {/* Iframe */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && !error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg)', gap: 12, zIndex: 2,
          }}>
            <div style={{
              width: 36, height: 36, border: '3px solid var(--border)',
              borderTop: '3px solid var(--accent)', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Carregando dashboard…</span>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg)', gap: 16, zIndex: 2,
          }}>
            <span style={{ fontSize: 40 }}>⚠️</span>
            <p style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', maxWidth: 340 }}>
              Não foi possível carregar o dashboard.<br />O CRM Master pode estar iniciando (cold start).
            </p>
            <button
              onClick={reload}
              style={{
                padding: '8px 20px', borderRadius: 8, background: 'var(--accent)',
                color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={OPS_URL}
          title="Ops Dashboard"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true); }}
          style={{
            width: '100%', height: '100%', border: 'none',
            display: error ? 'none' : 'block',
            colorScheme: 'dark',
          }}
        />
      </div>
    </div>
  );
}
