function parseDateOnly(value) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDateOnly(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

function getMonthlyFeeValue(db) {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'monthlyFee'").get();
    const configured = Number(row?.value);
    return configured > 0 ? configured : 95;
}

function getMonthlyFeeStatus(user) {
    const paidUntil = parseDateOnly(user?.monthly_fee_paid_until);
    const today = startOfToday();
    const isPaid = !!paidUntil && paidUntil >= today;
    const daysUntilDue = paidUntil ? Math.ceil((paidUntil - today) / (1000 * 60 * 60 * 24)) : null;
    return { paidUntil, isPaid, daysUntilDue };
}

function calculateNextPaidUntil(db, userId) {
    const user = db.prepare('SELECT monthly_fee_paid_until FROM users WHERE id = ?').get(userId);
    const paidUntil = parseDateOnly(user?.monthly_fee_paid_until);
    const today = startOfToday();
    const base = paidUntil && paidUntil > today ? paidUntil : today;
    return formatDateOnly(new Date(base.getFullYear(), base.getMonth() + 1, base.getDate()));
}

function releaseMonthlyFee(db, userId, options = {}) {
    const amount = Number(options.amount) > 0 ? Number(options.amount) : getMonthlyFeeValue(db);
    const paymentId = options.paymentId ? Number(options.paymentId) : null;
    const paidUntil = options.paidUntil || calculateNextPaidUntil(db, userId);
    const description = options.description || 'Mensalidade mensal';

    db.prepare('UPDATE users SET monthly_fee_paid_until = ?, access_blocked = 0, active = 1 WHERE id = ?')
        .run(paidUntil, userId);

    let hasTransaction = false;
    if (paymentId) {
        hasTransaction = !!db.prepare(`
            SELECT id FROM transactions
            WHERE type = 'mensalidade' AND reference_type = 'payment' AND reference_id = ?
            LIMIT 1
        `).get(paymentId);
    }

    if (!hasTransaction) {
        db.prepare(`
            INSERT INTO transactions (user_id, type, amount, description, reference_type, reference_id, date, status)
            VALUES (?, 'mensalidade', ?, ?, ?, ?, date('now'), 'concluido')
        `).run(userId, -Math.abs(amount), description, paymentId ? 'payment' : 'admin', paymentId);
    }

    return { paidUntil, amount };
}

module.exports = {
    calculateNextPaidUntil,
    formatDateOnly,
    getMonthlyFeeStatus,
    getMonthlyFeeValue,
    parseDateOnly,
    releaseMonthlyFee
};
