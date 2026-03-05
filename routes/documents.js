/* ═══════════════════════════════════════════
   Credbusiness — Documents / Upload Routes
   POST   /api/documents/upload/:processId — Upload documento para processo
   GET    /api/documents/process/:processId — Listar documentos de um processo
   GET    /api/documents/download/:id — Download de documento
   DELETE /api/documents/:id — Deletar documento
   ═══════════════════════════════════════════ */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { getDB } = require('../database/init');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// ── Configuração Multer ──
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const uniqueName = crypto.randomBytes(16).toString('hex') + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = [
        'application/pdf',
        'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
    ];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de arquivo não permitido. Use PDF, imagens, DOC ou TXT.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ── Upload documento para processo ──
router.post('/upload/:processId', auth, upload.single('document'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

        const processId = Number(req.params.processId);
        const db = getDB();

        // Verificar se processo pertence ao usuário (ou admin)
        const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(processId);
        if (!process) return res.status(404).json({ error: 'Processo não encontrado' });
        if (req.user.role !== 'admin' && process.user_id !== req.user.id) {
            // Remover arquivo enviado
            fs.unlinkSync(path.join(UPLOAD_DIR, req.file.filename));
            return res.status(403).json({ error: 'Sem permissão para este processo' });
        }

        const result = db.prepare(`
            INSERT INTO documents (process_id, user_id, filename, original_name, mimetype, size, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(processId, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size);

        res.json({
            success: true,
            document: {
                id: result.lastInsertRowid,
                process_id: processId,
                filename: req.file.filename,
                original_name: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            }
        });
    } catch (err) {
        console.error('Erro upload:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Listar documentos de um processo ──
router.get('/process/:processId', auth, (req, res) => {
    try {
        const processId = Number(req.params.processId);
        const db = getDB();

        // Verificar permissão
        const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(processId);
        if (!process) return res.status(404).json({ error: 'Processo não encontrado' });
        if (req.user.role !== 'admin' && process.user_id !== req.user.id) {
            return res.status(403).json({ error: 'Sem permissão' });
        }

        const docs = db.prepare('SELECT * FROM documents WHERE process_id = ? ORDER BY created_at DESC').all(processId);
        res.json(docs);
    } catch (err) {
        console.error('Erro listar docs:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Download de documento ──
router.get('/download/:id', auth, (req, res) => {
    try {
        const db = getDB();
        const doc = db.prepare('SELECT d.*, p.user_id as process_owner FROM documents d JOIN processes p ON d.process_id = p.id WHERE d.id = ?')
            .get(req.params.id);

        if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
        if (req.user.role !== 'admin' && doc.process_owner !== req.user.id) {
            return res.status(403).json({ error: 'Sem permissão' });
        }

        const filePath = path.join(UPLOAD_DIR, doc.filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado no servidor' });

        res.download(filePath, doc.original_name);
    } catch (err) {
        console.error('Erro download:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Deletar documento ──
router.delete('/:id', auth, (req, res) => {
    try {
        const db = getDB();
        const doc = db.prepare('SELECT d.*, p.user_id as process_owner FROM documents d JOIN processes p ON d.process_id = p.id WHERE d.id = ?')
            .get(req.params.id);

        if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
        if (req.user.role !== 'admin' && doc.process_owner !== req.user.id) {
            return res.status(403).json({ error: 'Sem permissão' });
        }

        // Remover arquivo
        const filePath = path.join(UPLOAD_DIR, doc.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erro deletar doc:', err.message);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ── Error handler multer ──
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Arquivo muito grande. Máximo: 10MB' });
        }
        return res.status(400).json({ error: 'Erro no upload: ' + err.message });
    }
    if (err.message && err.message.includes('Tipo de arquivo')) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

module.exports = router;
