import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const smtpHost = process.env.MAIL_SERVER || process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
const smtpUser = process.env.MAIL_USERNAME || process.env.SMTP_EMAIL || '';
const smtpPass = process.env.MAIL_PASSWORD || process.env.SMTP_APP_PASSWORD || '';
const smtpFrom = process.env.MAIL_FROM || smtpUser;
const smtpFromName = process.env.MAIL_FROM_NAME || 'MeetingAI';
const smtpUsesTls = String(process.env.MAIL_USE_TLS || process.env.SMTP_USE_TLS || 'true').toLowerCase() === 'true';
const isMailConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass && smtpFrom);

// Support both MAIL_* and legacy SMTP_* env names.
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpUsesTls,
  auth: smtpUser && smtpPass ? {
    user: smtpUser,
    pass: smtpPass,
  } : undefined,
});

app.post('/api/send-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  // Validate that SMTP is configured
  if (!isMailConfigured) {
     console.error('Mail variables not set in .env');
     return res.status(500).json({
       error: 'Mail server is not configured. Add MAIL_* values or the legacy SMTP_* values to your .env file.',
     });
  }

  const mailOptions = {
    from: smtpFromName ? `"${smtpFromName}" <${smtpFrom}>` : smtpFrom,
    to: email,
    subject: 'Your Password Reset OTP',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 500px; margin: auto; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #ff3366; text-align: center;">Forgot Your Password?</h2>
        <p>We received a request to reset your password. Here is your securely generated OTP code:</p>
        <div style="background-color: #f6f6f6; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #333; letter-spacing: 8px; margin: 0; font-size: 32px;">${otp}</h1>
        </div>
        <p>Please enter this code on the application to proceed with resetting your password.</p>
        <p style="font-size: 12px; color: #888; text-align: center; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Successfully sent OTP to ${email}`);
    res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending email via SMTP:', error);
    res.status(500).json({ error: 'Failed to send email. Check SMTP configuration.' });
  }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`SMTP Backend server running on http://127.0.0.1:${PORT}`);
  console.log(
    isMailConfigured
      ? `Mail config loaded for ${smtpHost}:${smtpPort}.`
      : 'Mail config missing. Set MAIL_* values (or legacy SMTP_* values) in your .env file.'
  );
});
