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
  const { to, message, userName, fromOverride } = req.body;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const envFrom = process.env.TWILIO_PHONE_NUMBER;

  // Prioritize UI override if it looks valid, else fall back to env
  const from = (fromOverride && fromOverride.length > 5) ? fromOverride : envFrom;

  console.log(`[SERVER] SOS Request Received for ${to} from ${from}`);

  // Validate credentials
  const isMock = !sid || !token || !from || sid.includes('AC...') || token === '...' || from.includes('+1...');

  if (isMock) {
    console.warn('[SERVER] Simulation Mode: Missing valid Twilio credentials.');
    return res.json({ 
      success: true, 
      simulated: true,
      message: 'Simulation successful. To send real SMS, configure TWILIO secrets.'
    });
  }

  try {
    const client = twilio(sid, token);
    
    // Ensure number starts with + for E.164
    const formattedTo = to.startsWith('+') ? to : `+${to}`;
    
    console.log(`[SERVER] Attempting dispatch: From(${from}) To(${formattedTo})`);

    const result = await client.messages.create({
      body: message,
      from: from,
      to: formattedTo
    });

    console.log(`[SERVER] Dispatch SUCCESS: SID ${result.sid}`);
    res.json({ success: true, simulated: false });
  } catch (error: any) {
    console.error('[SERVER] DISPATCH FAILED:', error.code, error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message,
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
