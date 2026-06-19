export default function SuspendedScreen({ status, onLogout }) {
  const inativo = status === 'inativo';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 32,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 64,
        marginBottom: 24,
        lineHeight: 1,
      }}>
        {inativo ? '🔒' : '⚠️'}
      </div>

      <h1 style={{
        fontSize: 24,
        fontWeight: 700,
        color: 'var(--text)',
        marginBottom: 12,
      }}>
        {inativo ? 'Conta inativa' : 'Conta suspensa'}
      </h1>

      <p style={{
        fontSize: 15,
        color: 'var(--muted)',
        maxWidth: 440,
        lineHeight: 1.6,
        marginBottom: 32,
      }}>
        {inativo
          ? 'Sua conta foi desativada. Entre em contato com o suporte para reativar o acesso.'
          : 'O acesso ao CRM Funil está suspenso. Isso geralmente ocorre por falta de pagamento ou por solicitação do administrador.'}
      </p>

      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 28px',
        marginBottom: 32,
        maxWidth: 380,
        width: '100%',
      }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
          Para regularizar sua situação, entre em contato:
        </div>
        <a
          href="https://wa.me/5511999999999"
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: '#25D366',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
            marginBottom: 12,
          }}
        >
          💬 Falar com suporte no WhatsApp
        </a>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          ou envie um e-mail para{' '}
          <a href="mailto:contato@pezzutti.com.br" style={{ color: 'var(--accent)' }}>
            contato@pezzutti.com.br
          </a>
        </div>
      </div>

      <button
        onClick={onLogout}
        className="btn btn-ghost"
        style={{ fontSize: 13 }}
      >
        Sair da conta
      </button>
    </div>
  );
}
