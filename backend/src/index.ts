import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { initDb } from './db';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import invitesRouter from './routes/invites';
import matchesRouter from './routes/matches';
import { pool } from './db';
import { setRealtimeServer } from './realtime';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080').split(',');

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. server-to-server) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// 10 MB body limit to support base64 profile pictures
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth',  authRouter);
app.use('/api/users', usersRouter);
app.use('/api/invites', invitesRouter);
app.use('/api/matches', matchesRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

initDb()
  .then(() => {
    const server = http.createServer(app);
    const io = new SocketIOServer(server, {
      path: '/socket.io',
      cors: {
        origin: allowedOrigins,
        credentials: true,
      },
    });

    setRealtimeServer(io);

    io.use(async (socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }

      try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
        const { rows } = await pool.query(
          'SELECT id FROM sessions WHERE token = $1 AND is_active = true',
          [token],
        );
        if (rows.length === 0) {
          next(new Error('Session expired'));
          return;
        }

        socket.data.userId = payload.userId;
        next();
      } catch {
        next(new Error('Invalid token'));
      }
    });

    io.on('connection', socket => {
      socket.on('join_match', async (matchId: string) => {
        if (!matchId) return;

        try {
          const userId = socket.data.userId as string | undefined;
          if (!userId) return;

          const { rows } = await pool.query(
            `SELECT id
             FROM game_matches
             WHERE id = $1
               AND (white_user_id = $2 OR black_user_id = $2)`,
            [matchId, userId],
          );
          if (rows.length === 0) {
            return;
          }

          await socket.join(`match:${matchId}`);
        } catch {
          // Ignore room join failures; HTTP APIs remain fallback.
        }
      });

      socket.on('leave_match', async (matchId: string) => {
        if (!matchId) return;
        await socket.leave(`match:${matchId}`);
      });
    });

    server.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
