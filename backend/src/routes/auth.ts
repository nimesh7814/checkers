import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { pool } from '../db';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { userRow } from '../utils/userRow';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const TOKEN_TTL = '7d';

// POST /api/auth/register
router.post(
  '/register',
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username must be 3-50 alphanumeric characters or underscores'),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed', details: errors.array() });
      return;
    }

    const { username, email, password, firstName, lastName, birthday, country, countryCode, avatar } = req.body;

    try {
      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)',
        [username, email],
      );
      if (existing.rows.length > 0) {
        res.status(409).json({ error: 'Username or email already taken' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const { rows } = await pool.query(
        `INSERT INTO users
           (username, email, password_hash, first_name, last_name, birthday, country, country_code, avatar, is_online)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         RETURNING *`,
        [
          username, email, passwordHash,
          firstName, lastName,
          birthday || null, country, countryCode,
          avatar || null,
        ],
      );

      const token = jwt.sign({ userId: rows[0].id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
      await pool.query('INSERT INTO sessions (user_id, token) VALUES ($1, $2)', [rows[0].id, token]);

      res.status(201).json({ token, user: userRow(rows[0]) });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').trim().notEmpty(),
    body('password').notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Validation failed' });
      return;
    }

    const { username, password } = req.body;

    try {
      const { rows } = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
        [username],
      );
      if (rows.length === 0) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      const valid = await bcrypt.compare(password, rows[0].password_hash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      // Mark online and create session
      await pool.query('UPDATE users SET is_online = true WHERE id = $1', [rows[0].id]);
      const token = jwt.sign({ userId: rows[0].id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
      await pool.query('INSERT INTO sessions (user_id, token) VALUES ($1, $2)', [rows[0].id, token]);

      res.json({ token, user: userRow({ ...rows[0], is_online: true }) });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const token = req.headers.authorization!.slice(7);
  try {
    await pool.query(
      'UPDATE sessions SET is_active = false, logged_out_at = NOW() WHERE token = $1',
      [token],
    );
    await pool.query('UPDATE users SET is_online = false WHERE id = $1', [req.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: userRow(rows[0]) });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
