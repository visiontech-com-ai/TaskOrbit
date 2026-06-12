require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '512kb' }));

const readLimiter  = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60 * 1000, max: 10,  standardHeaders: true, legacyHeaders: false });

const CATEGORIES = [
  'General', 'Form Automation', 'Data Scraping', 'Navigation',
  'Testing', 'Productivity', 'Finance', 'E-Commerce', 'Social Media', 'Other'
];

function requireAdmin(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized.' });
  }
  next();
}

function generateId() {
  return 'mkt_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function validateWorkflow(body) {
  const { name, steps, description = '' } = body;
  if (!name || typeof name !== 'string' || !name.trim()) return 'name is required.';
  if (name.trim().length > 100) return 'name must be 100 characters or fewer.';
  if (!Array.isArray(steps) || steps.length === 0) return 'steps must be a non-empty array.';
  if (steps.length > 200) return 'Workflows cannot exceed 200 steps.';
  if (description.length > 500) return 'description must be 500 characters or fewer.';
  return null;
}

// Sanitize a steps array: strip local-only IDs from runWorkflow steps
function sanitizeSteps(steps) {
  return JSON.parse(JSON.stringify(steps)).map(step => {
    if (step.type === 'runWorkflow') step.value = '';
    return step;
  });
}

// ---- Routes ----

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Date.now() });
});

// List categories
app.get('/api/categories', readLimiter, async (req, res) => {
  try {
    const rows = await db.all(
      "SELECT category, COUNT(*) as count FROM workflows WHERE status = 'approved' GROUP BY category ORDER BY count DESC"
    );
    res.json({ success: true, categories: rows });
  } catch (err) {
    console.error('Categories error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch categories.' });
  }
});

// List workflows (paginated, searchable, filterable)
app.get('/api/workflows', readLimiter, async (req, res) => {
  try {
    const {
      q = '',
      category = '',
      sort = 'downloads',
      page = '1',
      limit: lim = '20'
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(lim) || 20));
    const offset   = (pageNum - 1) * limitNum;

    let where = "status = 'approved'";
    const params = [];

    if (q) {
      where += ' AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(author) LIKE ? OR LOWER(tags) LIKE ?)';
      const like = `%${q.toLowerCase()}%`;
      params.push(like, like, like, like);
    }
    if (category) {
      where += ' AND LOWER(category) = ?';
      params.push(category.toLowerCase());
    }

    const orderBy = sort === 'newest' ? 'created_at DESC' : 'downloads DESC, created_at DESC';

    const countRow = await db.get(`SELECT COUNT(*) as total FROM workflows WHERE ${where}`, params);
    const rows = await db.all(
      `SELECT id, name, description, author, category, tags, sites, step_count, downloads, created_at
       FROM workflows WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      total: countRow.total,
      page: pageNum,
      limit: limitNum,
      workflows: rows.map(r => ({
        ...r,
        tags: JSON.parse(r.tags || '[]'),
        sites: JSON.parse(r.sites || '[]')
      }))
    });
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ success: false, error: 'Failed to list workflows.' });
  }
});

// Get single workflow (full steps included, increments download counter)
app.get('/api/workflows/:id', readLimiter, async (req, res) => {
  try {
    const row = await db.get("SELECT * FROM workflows WHERE id = ? AND status = 'approved'", [req.params.id]);
    if (!row) return res.status(404).json({ success: false, error: 'Workflow not found.' });

    db.run('UPDATE workflows SET downloads = downloads + 1 WHERE id = ?', [req.params.id]).catch(() => {});

    res.json({
      success: true,
      workflow: {
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        sites: JSON.parse(row.sites || '[]'),
        variables: JSON.parse(row.variables || '[]'),
        steps: JSON.parse(row.steps_json)
      }
    });
  } catch (err) {
    console.error('Get error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch workflow.' });
  }
});

// Submit workflow for publication
app.post('/api/workflows', writeLimiter, async (req, res) => {
  try {
    const {
      name,
      description = '',
      author = 'Anonymous',
      category = 'General',
      tags = [],
      sites = [],
      steps,
      variables = [],
      maxRetries = 3
    } = req.body;

    const validationError = validateWorkflow({ name, steps, description });
    if (validationError) return res.status(400).json({ success: false, error: validationError });

    const resolvedCategory = CATEGORIES.includes(category) ? category : 'General';
    const requiresApproval = process.env.REQUIRE_APPROVAL === 'true';
    const status = requiresApproval ? 'pending' : 'approved';
    const id  = generateId();
    const now = Date.now();

    const sanitized = sanitizeSteps(steps);
    const stepsJson = JSON.stringify(sanitized);

    await db.run(
      `INSERT INTO workflows (id, name, description, author, category, tags, sites, variables, step_count, steps_json, downloads, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        id,
        name.trim().slice(0, 100),
        description.slice(0, 500),
        String(author || 'Anonymous').slice(0, 60),
        resolvedCategory,
        JSON.stringify(Array.isArray(tags) ? tags.slice(0, 10).map(t => String(t).slice(0, 30)) : []),
        JSON.stringify(Array.isArray(sites) ? sites.slice(0, 10) : []),
        JSON.stringify(Array.isArray(variables) ? variables : []),
        sanitized.length,
        stepsJson,
        status,
        now,
        now
      ]
    );

    res.status(201).json({
      success: true,
      id,
      status,
      message: requiresApproval
        ? 'Workflow submitted for review. It will appear publicly once approved.'
        : 'Workflow published successfully.'
    });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ success: false, error: 'Failed to submit workflow.' });
  }
});

// ---- Admin routes ----

// List all workflows regardless of status
app.get('/api/admin/workflows', requireAdmin, async (req, res) => {
  try {
    const { status = '' } = req.query;
    const where  = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];
    const rows = await db.all(
      `SELECT id, name, author, category, step_count, downloads, status, created_at
       FROM workflows ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, workflows: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list.' });
  }
});

// Approve a pending workflow
app.post('/api/admin/workflows/:id/approve', requireAdmin, async (req, res) => {
  try {
    const result = await db.run(
      "UPDATE workflows SET status = 'approved', updated_at = ? WHERE id = ?",
      [Date.now(), req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Workflow not found.' });
    res.json({ success: true, message: 'Workflow approved.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to approve.' });
  }
});

// Delete a workflow
app.delete('/api/admin/workflows/:id', requireAdmin, async (req, res) => {
  try {
    const result = await db.run('DELETE FROM workflows WHERE id = ?', [req.params.id]);
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Workflow not found.' });
    res.json({ success: true, message: 'Workflow deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete.' });
  }
});

// ---- Start ----

db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`TaskOrbit Marketplace listening on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize marketplace database:', err);
  process.exit(1);
});

const shutdown = async () => {
  console.log('Shutting down Marketplace server...');
  try { await db.close(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
