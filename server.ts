import express from 'express';
import twilioLib from 'twilio';

// Handle various Twilio import patterns (ESM/CJS)
const twilio = (twilioLib as any).default || twilioLib;

const app = express();
app.use(express.json());

// API Route for Sending SOS
app.post('/api/send-sos', async (req, res) => {
  console.log('[SERVER] SOS Request Received');
  try {
    const { to, message, fromOverride } = req.body;

    if (!to || !message) {
      return res.status(400).json({ success: false, error: 'Recipient and message required' });
    }

    const sid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
    const token = (process.env.TWILIO_AUTH_TOKEN || '').trim();
    const envFrom = (process.env.TWILIO_PHONE_NUMBER || '').trim();

    // Prioritize UI override if it looks valid, else fall back to env
    const from = (fromOverride && typeof fromOverride === 'string' && fromOverride.length > 5) ? fromOverride : envFrom;

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

    // Initialize Twilio client
    // Note: In some environments, twilio might need to be called differently if exported as a module
    const client = twilio(sid, token);
    
    // Ensure numbers are E.164 (Twilio requirement)
    const formattedTo = to.startsWith('+') ? to : `+${to.replace(/\D/g, '')}`;
    const formattedFrom = from.startsWith('+') ? from : `+${from.replace(/\D/g, '')}`;
    
    console.log(`[SERVER] Sending real SMS via Twilio: ${formattedFrom} -> ${formattedTo}`);

    const result = await client.messages.create({
      body: message,
      from: formattedFrom,
      to: formattedTo
    });

    console.log(`[SERVER] SMS Sent Successfully. SID: ${result.sid}`);
    return res.json({ success: true, simulated: false, sid: result.sid });

  } catch (error: any) {
    console.error('[SERVER] SOS Engine Error:', error);
    return res.status(error.status || 500).json({ 
      success: false, 
      error: error.message || 'Unknown server error',
      code: error.code
    });
  }
});

// For Local and Cloud Run Environments
async function startServer() {
  const PORT = 3000;
  
  // Use dynamic imports for dev-only dependencies
  const path = await import('path');
  const dotenv = await import('dotenv');
  dotenv.config();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import('vite');
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
