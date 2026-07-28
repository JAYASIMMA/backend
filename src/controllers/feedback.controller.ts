import { Request, Response } from 'express';
import { mailTransporter, getMailConfig, createMailTransporter } from '../config/mail.config';

/**
 * Handles POST requests to send feedback emails via Gmail SMTP.
 * Accepts:
 * - `name` or `senderName`
 * - `email` or `senderEmail`
 * - `feedback` or `message` or `comment`
 * - `subject`, `category`, `rating`, `receiverEmail` (optional)
 */
export const sendFeedbackEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      senderName,
      email,
      senderEmail,
      feedback,
      message,
      comment,
      subject,
      rating,
      category,
      receiverEmail,
      requestId
    } = req.body;

    // Extract user inputs with flexible field fallback
    const userName = name || senderName || 'Anonymous / Customer';
    const userEmail = email || senderEmail || '';
    const feedbackText = feedback || message || comment;

    // Input Validation
    if (!feedbackText || typeof feedbackText !== 'string' || !feedbackText.trim()) {
      res.status(400).json({
        success: false,
        message: 'Feedback content is required (provide `feedback`, `message`, or `comment`).'
      });
      return;
    }

    const mailConfig = getMailConfig();
    const targetRecipient = receiverEmail || mailConfig.defaultReceiver;

    // Check backend Gmail SMTP configuration
    if (!mailConfig.smtpUser || !process.env.SMTP_PASS) {
      console.warn('⚠️ SMTP Warning: SMTP_USER or SMTP_PASS environment variables are missing.');
      res.status(500).json({
        success: false,
        message: 'Backend server is missing Gmail SMTP credentials (SMTP_USER / SMTP_PASS in .env).'
      });
      return;
    }

    const emailSubject = subject 
      ? `[Nearby Feedback] ${subject}`
      : `[Nearby Feedback] New Submission from ${userName}`;

    const starRatingText = rating ? '★'.repeat(Number(rating)) + '☆'.repeat(5 - Number(rating)) : 'N/A';

    // HTML Email Template for Nearby Feedback
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5; color: #18181b; margin: 0; padding: 24px; }
          .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e4e4e7; }
          .header { background: #09090b; padding: 28px 32px; color: #ffffff; text-align: left; }
          .header h2 { margin: 0; font-size: 22px; font-weight: 800; tracking: -0.5px; color: #ffffff; }
          .subtitle { font-size: 12px; color: #a1a1aa; margin-top: 4px; font-weight: 600; }
          .content { padding: 32px; }
          .info-grid { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; margin-bottom: 24px; }
          .info-row { display: flex; margin-bottom: 10px; font-size: 14px; color: #334155; }
          .info-label { font-weight: 700; width: 140px; color: #0f172a; flex-shrink: 0; }
          .info-value { font-weight: 500; color: #334155; word-break: break-word; }
          .feedback-box { background: #f7fee7; border: 1px solid #d9f99d; border-left: 5px solid #84cc16; border-radius: 12px; padding: 20px; font-size: 15px; line-height: 1.6; color: #1a2e05; font-style: italic; }
          .footer { background: #fafafa; padding: 18px 32px; font-size: 12px; color: #71717a; text-align: center; border-top: 1px solid #f4f4f5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h2>Nearby App Feedback</h2>
            <div class="subtitle">New Customer Feedback Submission Received</div>
          </div>
          <div class="content">
            <div class="info-grid">
              <div class="info-row">
                <span class="info-label">Customer Name:</span>
                <span class="info-value">${userName}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Email Address:</span>
                <span class="info-value">${userEmail ? `<a href="mailto:${userEmail}" style="color: #0284c7;">${userEmail}</a>` : 'Not provided'}</span>
              </div>
              ${category ? `<div class="info-row"><span class="info-label">Category:</span><span class="info-value">${category}</span></div>` : ''}
              ${rating ? `<div class="info-row"><span class="info-label">Rating:</span><span class="info-value" style="color: #65a30d;">${starRatingText} (${rating}/5)</span></div>` : ''}
              ${requestId ? `<div class="info-row"><span class="info-label">Request ID:</span><span class="info-value">#${requestId}</span></div>` : ''}
              <div class="info-row" style="margin-bottom: 0;">
                <span class="info-label">Received At:</span>
                <span class="info-value">${new Date().toLocaleString()}</span>
              </div>
            </div>

            <h4 style="margin-top: 0; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #64748b;">Feedback Content:</h4>
            <div class="feedback-box">
              "${feedbackText.replace(/\n/g, '<br/>')}"
            </div>
          </div>
          <div class="footer">
            Sent automatically via Nearby Express Backend Gateway (Gmail SMTP)
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
Nearby App Feedback Submission
==================================
Name: ${userName}
Email: ${userEmail || 'Not provided'}
${category ? `Category: ${category}\n` : ''}${rating ? `Rating: ${rating}/5\n` : ''}${requestId ? `Request ID: #${requestId}\n` : ''}Date: ${new Date().toLocaleString()}

Feedback Message:
"${feedbackText}"
    `;

    const mailOptions = {
      from: `"${userName}" <${mailConfig.smtpUser}>`,
      replyTo: userEmail || undefined,
      to: targetRecipient,
      subject: emailSubject,
      text: textBody,
      html: htmlBody
    };

    // Create fresh mail transporter with stripped password
    const transporter = createMailTransporter();
    const mailInfo = await transporter.sendMail(mailOptions);

    console.log('✅ Nearby Feedback Email sent successfully:', mailInfo.messageId);

    res.status(200).json({
      success: true,
      message: 'Feedback email sent successfully via Gmail SMTP!',
      data: {
        messageId: mailInfo.messageId,
        recipient: targetRecipient,
        sender: {
          name: userName,
          email: userEmail
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Send Feedback Email Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error while sending feedback email via Gmail SMTP.'
    });
  }
};
