const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, sql } = require('./db');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3001'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the bundled entry point. The source HTML imports npm packages that
// browsers cannot resolve without Vite, leaving its loading screen at 0%.
const projectRoot = path.join(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
app.get(['/', '/index.html'], (req, res) => {
  const entry = path.join(distRoot, 'index.html');
  if (!fs.existsSync(entry)) {
    return res.status(503).type('text').send('Portfolio belum siap. Jalankan npm run build, lalu muat ulang halaman ini.');
  }
  res.set('Cache-Control', 'no-cache');
  res.sendFile(entry);
});
app.use(express.static(distRoot, { index: false }));
app.use(express.static(path.join(projectRoot, 'public')));
app.use(express.static(projectRoot, { index: false }));

// Dashboard route
app.get('/dashboard', (req, res) => {
  // Try dist first (production), then root (development)
  const distPath = path.join(__dirname, '..', 'dist', 'dashboard.html');
  const rootPath = path.join(__dirname, '..', 'dashboard.html');
  if (fs.existsSync(distPath)) return res.sendFile(distPath);
  res.sendFile(rootPath);
});

// ============================================
// FILE UPLOAD — multer config
// ============================================
const UPLOAD_DIRS = {
  graphic_design: path.join(__dirname, '..', 'graphic design'),
  animation: path.join(__dirname, '..', 'animation'),
  video_editing: path.join(__dirname, '..', 'video editing'),
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.body.category || 'graphic_design';
    const dir = UPLOAD_DIRS[category] || UPLOAD_DIRS.graphic_design;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Preserve original name, replace spaces with spaces (keep as-is)
    cb(null, file.originalname);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

// Function to export database items to public/data.json
async function exportDataJson() {
  try {
    const result = await query('SELECT * FROM portfolio_items ORDER BY category, display_order ASC');
    const outPath = path.join(__dirname, '..', 'public', 'data.json');
    fs.writeFileSync(outPath, JSON.stringify({ success: true, data: result.recordset }, null, 2));
    console.log('[API] Exported updated items to public/data.json');
  } catch (err) {
    console.error('[API] Failed to export data.json:', err.message);
  }
}

// ============================================
// API: GET /api/items — list all items
// ============================================
app.get('/api/items', async (req, res) => {
  try {
    const { category } = req.query;
    let q = 'SELECT * FROM portfolio_items';
    if (category) q += ` WHERE category = '${category}'`;
    q += ' ORDER BY category, display_order ASC';
    const result = await query(q);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[API] GET /api/items error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// API: GET /api/items/:id — get single item
// ============================================
app.get('/api/items/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM portfolio_items WHERE id = @id',
      { id: req.params.id }
    );
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) {
    console.error('[API] GET /api/items/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// API: POST /api/items — create new item
// ============================================
app.post('/api/items', async (req, res) => {
  try {
    const { title, category, category_label, file_path, file_type, size_class, is_extra, display_order } = req.body;
    const result = await query(
      `INSERT INTO portfolio_items (title, category, category_label, file_path, file_type, size_class, is_extra, display_order)
       OUTPUT INSERTED.*
       VALUES (@title, @category, @category_label, @file_path, @file_type, @size_class, @is_extra, @display_order)`,
      {
        title: title,
        category: category,
        category_label: category_label || category,
        file_path: file_path,
        file_type: file_type || 'image',
        size_class: size_class || 'size-medium',
        is_extra: is_extra ? 1 : 0,
        display_order: display_order || 0,
      }
    );
    res.status(201).json({ success: true, data: result.recordset[0] });
    exportDataJson();
  } catch (err) {
    console.error('[API] POST /api/items error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// API: PUT /api/items/:id — update item
// ============================================
app.put('/api/items/:id', async (req, res) => {
  try {
    const { title, category, category_label, file_path, file_type, size_class, is_extra, display_order } = req.body;
    const result = await query(
      `UPDATE portfolio_items SET
         title = @title,
         category = @category,
         category_label = @category_label,
         file_path = @file_path,
         file_type = @file_type,
         size_class = @size_class,
         is_extra = @is_extra,
         display_order = @display_order
       OUTPUT INSERTED.*
       WHERE id = @id`,
      {
        id: parseInt(req.params.id, 10),
        title: title,
        category: category,
        category_label: category_label || category,
        file_path: file_path,
        file_type: file_type || 'image',
        size_class: size_class || 'size-medium',
        is_extra: is_extra ? 1 : 0,
        display_order: display_order || 0,
      }
    );
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: result.recordset[0] });
    exportDataJson();
  } catch (err) {
    console.error('[API] PUT /api/items/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// API: DELETE /api/items/:id — delete item
// ============================================
app.delete('/api/items/:id', async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM portfolio_items OUTPUT DELETED.* WHERE id = @id',
      { id: parseInt(req.params.id, 10) }
    );
    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: result.recordset[0] });
    exportDataJson();
  } catch (err) {
    console.error('[API] DELETE /api/items/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// API: POST /api/upload — upload file
// ============================================
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const category = req.body.category || 'graphic_design';
    const categoryFolder = {
      graphic_design: 'graphic design',
      animation: 'animation',
      video_editing: 'video editing',
    }[category] || 'graphic design';

    const filePath = `/${categoryFolder}/${req.file.originalname}`;
    res.json({
      success: true,
      file_path: filePath,
      filename: req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    console.error('[API] POST /api/upload error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// API: GET /api/stats — item counts per category
// ============================================
app.get('/api/stats', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        category,
        category_label,
        COUNT(*) as total,
        SUM(CASE WHEN is_extra = 0 THEN 1 ELSE 0 END) as visible_count,
        SUM(CASE WHEN is_extra = 1 THEN 1 ELSE 0 END) as extra_count
      FROM portfolio_items
      GROUP BY category, category_label
      ORDER BY category
    `);
    res.json({ success: true, data: result.recordset });
  } catch (err) {
    console.error('[API] GET /api/stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`[API] Express server running on http://localhost:${PORT}`);
  console.log(`[API] Dashboard: http://localhost:${PORT}/dashboard`);
  console.log('[API] Waiting for SQL Server connection...');
});
