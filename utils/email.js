/* ═══════════════════════════════════════════
   MI2 — Email Utility (Nodemailer)
   ═══════════════════════════════════════════ */

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        console.warn('⚠️  SMTP não configurado. Emails não serão enviados.');
        return null;
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
    });

    return transporter;
}

/**
 * Envia um email
 * @param {string} to - Destinatário
 * @param {string} subject - Assunto
 * @param {string} html - Corpo HTML
 * @returns {Promise<boolean>}
 */
async function sendEmail(to, subject, html) {
    const t = getTransporter();
    if (!t) {
        console.warn(`📧 [SIMULADO] Para: ${to} | Assunto: ${subject}`);
        return true; // Simula sucesso se SMTP não configurado
    }

    try {
        await t.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to,
            subject,
            html
        });
        console.log(`📧 Email enviado para: ${to}`);
        return true;
    } catch (err) {
        console.error('❌ Erro ao enviar email:', err.message);
        return false;
    }
}

/**
 * Email de reset de senha com token
 */
async function sendPasswordResetEmail(email, name, token) {
    const domain = process.env.DOMAIN || 'localhost:3001';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const resetUrl = `${protocol}://${domain}/password-reset.html?token=${token}`;

    const html = `
    <div style="max-width:500px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
        <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:1.5rem">MI2</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:0.9rem">Escritório Virtual</p>
        </div>
        <div style="padding:32px 24px">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:1.15rem">Olá, ${name}!</h2>
            <p style="color:#64748b;font-size:0.9rem;line-height:1.6;margin:0 0 24px">
                Recebemos uma solicitação para redefinir a senha da sua conta. 
                Clique no botão abaixo para criar uma nova senha:
            </p>
            <div style="text-align:center;margin:24px 0">
                <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:0.95rem;box-shadow:0 4px 14px rgba(99,102,241,0.3)">
                    Redefinir Senha
                </a>
            </div>
            <p style="color:#94a3b8;font-size:0.82rem;line-height:1.5;margin:24px 0 0">
                Se você não solicitou essa alteração, ignore este email. O link expira em <strong>1 hora</strong>.
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
            <p style="color:#94a3b8;font-size:0.75rem;margin:0">
                Caso o botão não funcione, copie e cole este link no navegador:<br>
                <a href="${resetUrl}" style="color:#6366f1;word-break:break-all">${resetUrl}</a>
            </p>
        </div>
        <div style="background:#f8fafc;padding:16px 24px;text-align:center">
            <p style="color:#94a3b8;font-size:0.72rem;margin:0">© 2026 MI2 — Escritório Virtual. Todos os direitos reservados.</p>
        </div>
    </div>`;

    return sendEmail(email, 'MI2 — Redefinição de Senha', html);
}

/**
 * Email com código 2FA
 */
async function send2FAEnabledEmail(email, name) {
    const html = `
    <div style="max-width:500px;margin:0 auto;font-family:'Segoe UI',Arial,sans-serif;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
        <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 24px;text-align:center">
            <h1 style="color:#fff;margin:0;font-size:1.5rem">MI2</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:0.9rem">Escritório Virtual</p>
        </div>
        <div style="padding:32px 24px">
            <h2 style="margin:0 0 8px;color:#1e293b;font-size:1.15rem">Olá, ${name}!</h2>
            <p style="color:#64748b;font-size:0.9rem;line-height:1.6">
                A autenticação em dois fatores (2FA) foi <strong>ativada</strong> com sucesso na sua conta. 
                A partir de agora, será necessário informar o código do app autenticador ao fazer login.
            </p>
            <p style="color:#94a3b8;font-size:0.82rem;margin-top:16px">
                Se você não realizou essa alteração, entre em contato com o suporte imediatamente.
            </p>
        </div>
        <div style="background:#f8fafc;padding:16px 24px;text-align:center">
            <p style="color:#94a3b8;font-size:0.72rem;margin:0">© 2026 MI2 — Escritório Virtual</p>
        </div>
    </div>`;

    return sendEmail(email, 'MI2 — 2FA Ativado na sua conta', html);
}

module.exports = { sendEmail, sendPasswordResetEmail, send2FAEnabledEmail };
