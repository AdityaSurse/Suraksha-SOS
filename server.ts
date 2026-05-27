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
    
    // Ensure numbers are perfectly formatted for E.164 (Twilio requirement)
    // Strip any possible remaining spaces, dashes, parentheses to prevent format/mismatch errors
    const cleanedTo = to.replace(/\D/g, '');
    const cleanedFrom = from.replace(/\D/g, '');
    
    const formattedTo = `+${cleanedTo}`;
    const formattedFrom = `+${cleanedFrom}`;
    
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
    
    let errorMessage = error.message || 'Unknown server error';
    
    // Specific Twilio Trial/Setup Error Mapping
    if (error.code === 21608) {
      errorMessage = `Twilio Trial Limit: The recipient number you are sending to is not verified. On Twilio Trial accounts, YOU MUST verify each recipient number in your Twilio Console under 'Verified Caller IDs' before they can receive SMS.`;
    } else if (error.code === 21606) {
      errorMessage = `Twilio Sender Number Mismatch: The "Twilio Sender Number" you entered does not belong to or is not associated with the TWILIO_ACCOUNT_SID used. Please double-check your Twilio console to ensure you purchased/active this exact sender number.`;
    } else if (error.code === 20003) {
      errorMessage = `Twilio Authentication Failed: The TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is invalid. Please copy the credentials exact from your Twilio Console and update your environment variables.`;
    } else if (error.code === 21211) {
      errorMessage = `Invalid phone number format. Please ensure the recipient number includes the correct country code (e.g. +91 or +1).`;
    } else if (error.code === 21408) {
      errorMessage = `Region Restriction: Twilio has not enabled SMS permissions for this country in your account settings. Go to Programmable Messaging -> Settings -> Geo-Permissions in your Twilio Console to enable it.`;
    }

    return res.status(error.status || 500).json({ 
      success: false, 
      error: errorMessage,
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
