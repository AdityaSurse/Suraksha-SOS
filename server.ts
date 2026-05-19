import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// API Route for Sending SOS
app.post('/api/send-sos', async (req, res) => {
  try {
    const { to, message, userName, fromOverride } = req.body;

    const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
    const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
    const envFrom = (process.env.TWILIO_PHONE_NUMBER || '').trim();

    // Prioritize UI override if it looks valid, else fall back to env
    const from = (fromOverride && fromOverride.length > 5) ? fromOverride : envFrom;

    console.log(`[SERVER] SOS Triggered: To=${to}, From=${from}`);

    // Validate credentials
    const hasSid = sid && sid.startsWith('AC') && sid.length > 30;
    const hasToken = token && token.length > 10;
    const hasFrom = from && from.length > 5 && !from.includes('...');
    
    const isMock = !hasSid || !hasToken || !hasFrom;

    if (isMock) {
      console.warn('[SERVER] Simulation Mode triggered (Credentials missing or invalid)');
      return res.json({ 
        success: true, 
        simulated: true,
        message: 'Simulation successful. To send real SMS, add valid TWILIO_ACCOUNT_SID, AUTH_TOKEN, and PHONE_NUMBER to environment variables.'
      });
    }

    const client = twilio(sid, token);
    
    // Ensure numbers are E.164 (Twilio requirement)
    const formattedTo = to.startsWith('+') ? to : `+${to.replace(/\D/g, '')}`;
    const formattedFrom = from.startsWith('+') ? from : `+${from.replace(/\D/g, '')}`;
    
    console.log(`[SERVER] Sending real SMS...`);

    const result = await client.messages.create({
      body: message,
      from: formattedFrom,
      to: formattedTo
    });

    console.log(`[SERVER] SMS Sent Successfully. SID: ${result.sid}`);
    return res.json({ success: true, simulated: false });

  } catch (error: any) {
    console.error('[SERVER] Twilio/SOS Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Unknown server error',
      code: error.code,
      moreInfo: error.moreInfo 
    });
  }
});

// For Local and Cloud Run Environments
async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER] Suraksha SOS Engine running on http://localhost:${PORT}`);
  });
}

// Only run standalone server if not in a serverless environment (like Vercel)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  startServer();
}

export default app;
