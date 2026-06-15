import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import routes from './routes';
import './config/firebase.config';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Main Routes
app.use('/api/v1', routes);

// Health Check
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', version: '1.0.0' });
});

// Generic Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
    },
  });
});

export default app;
