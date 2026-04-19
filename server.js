const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DATA_FILE = path.join(__dirname, 'data', 'meals.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Tokens en memoria (simples, se resetean al reiniciar) ──
const tokens = new Set();

// ── Helpers ───────────────────────────────────────────────
function readMeals() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeMeals(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !tokens.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

// ── API ───────────────────────────────────────────────────

// Login
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = crypto.randomUUID();
  tokens.add(token);
  // Expira en 24h
  setTimeout(() => tokens.delete(token), 24 * 60 * 60 * 1000);
  res.json({ token });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) tokens.delete(token);
  res.json({ ok: true });
});

// Verificar token
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ ok: true });
});

// GET todas las comidas (público)
app.get('/api/meals', (req, res) => {
  const meals = readMeals();
  if (!meals) return res.status(500).json({ error: 'No se pudo leer los datos' });
  res.json(meals);
});

// PUT día completo (admin)
app.put('/api/meals/:dayIndex', authMiddleware, (req, res) => {
  const idx = parseInt(req.params.dayIndex);
  const meals = readMeals();
  if (!meals || idx < 0 || idx > 6) return res.status(400).json({ error: 'Índice inválido' });
  meals[idx] = req.body;
  writeMeals(meals);
  res.json({ ok: true });
});

// PUT comida individual dentro de un día
app.put('/api/meals/:dayIndex/:mealIndex', authMiddleware, (req, res) => {
  const dayIdx  = parseInt(req.params.dayIndex);
  const mealIdx = parseInt(req.params.mealIndex);
  const meals = readMeals();
  if (!meals) return res.status(500).json({ error: 'Error lectura' });
  if (!meals[dayIdx] || !meals[dayIdx].meals[mealIdx]) {
    return res.status(404).json({ error: 'No encontrado' });
  }
  meals[dayIdx].meals[mealIdx] = req.body;
  writeMeals(meals);
  res.json({ ok: true });
});

// POST nueva comida en un día
app.post('/api/meals/:dayIndex/meal', authMiddleware, (req, res) => {
  const dayIdx = parseInt(req.params.dayIndex);
  const meals  = readMeals();
  if (!meals || !meals[dayIdx]) return res.status(400).json({ error: 'Día inválido' });
  meals[dayIdx].meals.push(req.body);
  writeMeals(meals);
  res.json({ ok: true, index: meals[dayIdx].meals.length - 1 });
});

// DELETE comida
app.delete('/api/meals/:dayIndex/:mealIndex', authMiddleware, (req, res) => {
  const dayIdx  = parseInt(req.params.dayIndex);
  const mealIdx = parseInt(req.params.mealIndex);
  const meals   = readMeals();
  if (!meals || !meals[dayIdx]) return res.status(404).json({ error: 'No encontrado' });
  meals[dayIdx].meals.splice(mealIdx, 1);
  writeMeals(meals);
  res.json({ ok: true });
});

// PATCH datos del día (workout, note, totales)
app.patch('/api/meals/:dayIndex/meta', authMiddleware, (req, res) => {
  const dayIdx = parseInt(req.params.dayIndex);
  const meals  = readMeals();
  if (!meals || !meals[dayIdx]) return res.status(404).json({ error: 'No encontrado' });
  const { workout, note, kcal, protein, carbs, fat } = req.body;
  const day = meals[dayIdx];
  if (workout  !== undefined) day.workout = workout;
  if (note     !== undefined) day.note    = note;
  if (kcal     !== undefined) day.kcal    = kcal;
  if (protein  !== undefined) day.protein = protein;
  if (carbs    !== undefined) day.carbs   = carbs;
  if (fat      !== undefined) day.fat     = fat;
  writeMeals(meals);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🍽  ComidaSemanal corriendo en http://localhost:${PORT}`);
  console.log(`🔐  Admin en http://localhost:${PORT}/admin.html`);
  console.log(`🔑  Contraseña: ${ADMIN_PASSWORD === 'admin123' ? 'admin123 (¡cámbiala!)' : '***'}`);
});
