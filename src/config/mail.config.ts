import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export const getMailConfig = () => {
  // Re-read dotenv values dynamically
  dotenv.config();

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpUser = (process.env.SMTP_USER || '').trim();
  // Strip all whitespace spaces from Gmail 16-character App Passwords
  const smtpPass = (process.env.SMTP_PASS || '').replace(/\s+/g, '').trim();

  return {
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    defaultReceiver: (process.env.FEEDBACK_RECEIVER_EMAIL || smtpUser).trim()
  };
};

/**
 * Creates and returns a fresh Nodemailer transport instance using the latest credentials.
 */
export const createMailTransporter = () => {
  const config = getMailConfig();

  // For Gmail SMTP, service: 'gmail' works best with Nodemailer
  if (config.smtpHost.includes('gmail')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

export const mailTransporter = createMailTransporter();
