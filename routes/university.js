/* ═══════════════════════════════════════════
   Credbusiness — University Routes
   GET  /api/university/courses      — Listar cursos
   GET  /api/university/progress     — Progresso do usuário
   POST /api/university/progress     — Marcar curso como assistido
   DELETE /api/university/progress/:courseId — Desmarcar
   ═══════════════════════════════════════════ */

const express = require('express');
const { getDB } = require('../database/init');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── Listar cursos ──
router.get('/courses', auth, (req, res) => {
    try {
        const db = getDB();
        const courses = db.prepare('SELECT * FROM university_courses WHERE active = 1 ORDER BY sort_order, id').all();
        res.json(courses);
    } catch (err) {
        console.error('Erro listar cursos:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Progresso do usuário ──
router.get('/progress', auth, (req, res) => {
    try {
        const db = getDB();
        const progress = db.prepare(`
            SELECT up.course_id, up.completed, up.completed_at
            FROM university_progress up
            WHERE up.user_id = ?
        `).all(req.user.id);

        const totalCourses = db.prepare('SELECT COUNT(*) as c FROM university_courses WHERE active = 1').get().c;
        const completedCount = progress.filter(p => p.completed).length;

        res.json({
            items: progress,
            completed: completedCount,
            total: totalCourses,
            percentage: totalCourses > 0 ? Math.round((completedCount / totalCourses) * 100) : 0
        });
    } catch (err) {
        console.error('Erro progresso:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Marcar como assistido ──
router.post('/progress', auth, (req, res) => {
    try {
        const courseId = Number(req.body.courseId);
        if (!courseId) return res.status(400).json({ error: 'courseId é obrigatório' });

        const db = getDB();
        const course = db.prepare('SELECT id FROM university_courses WHERE id = ? AND active = 1').get(courseId);
        if (!course) return res.status(404).json({ error: 'Curso não encontrado' });

        db.prepare(`
            INSERT INTO university_progress (user_id, course_id, completed, completed_at)
            VALUES (?, ?, 1, datetime('now'))
            ON CONFLICT(user_id, course_id) DO UPDATE SET completed = 1, completed_at = datetime('now')
        `).run(req.user.id, courseId);

        res.json({ success: true });
    } catch (err) {
        console.error('Erro marcar progresso:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Desmarcar ──
router.delete('/progress/:courseId', auth, (req, res) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM university_progress WHERE user_id = ? AND course_id = ?')
            .run(req.user.id, Number(req.params.courseId));
        res.json({ success: true });
    } catch (err) {
        console.error('Erro desmarcar progresso:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
