import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import routes from './routes';
import './config/firebase.config';

const app = express();

app.use(cors());
app.use(express.json());

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
