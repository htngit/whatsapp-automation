const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Store browser instance
let browser;
let isWhatsAppReady = false;

// Initialize WhatsApp Web
async function initWhatsApp() {
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: false, // Set to true in production
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null
    });

    const page = await browser.newPage();
    
    // Navigate to WhatsApp Web
    await page.goto('https://web.whatsapp.com/', {
      waitUntil: 'networkidle2'
    });

    console.log('WhatsApp Web loaded. Please scan QR code with your phone.');

    // Wait for WhatsApp to load and QR code to be scanned
    await page.waitForSelector('._main', { timeout: 60000 })
      .then(() => {
        console.log('WhatsApp Web is ready!');
        isWhatsAppReady = true;
      })
      .catch(err => {
        console.error('Error waiting for WhatsApp to load:', err);
        isWhatsAppReady = false;
      });

    return page;
  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
    throw error;
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(page, phoneNumber, message) {
  try {
    // Format phone number (remove any non-numeric characters)
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    
    // Navigate to the specific chat
    await page.goto(`https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`, {
      waitUntil: 'networkidle2'
    });

    // Wait for the chat to load
    await page.waitForSelector('div[data-testid="conversation-panel-wrapper"]', { timeout: 30000 });

    // Click the send button
    await page.waitForSelector('span[data-testid="send"]', { timeout: 5000 });
    await page.click('span[data-testid="send"]');

    // Wait for message to be sent
    await page.waitForSelector('div[data-testid="msg-dblcheck"]', { timeout: 10000 })
      .catch(() => console.log('Could not confirm message was sent, but continuing...'));

    // Wait a bit before sending the next message
    await page.waitForTimeout(1000);

    return true;
  } catch (error) {
    console.error(`Error sending message to ${phoneNumber}:`, error);
    return false;
  }
}

// API endpoint to send WhatsApp messages
app.post('/api/send-whatsapp', async (req, res) => {
  const { contacts, message } = req.body;

  if (!contacts || !message) {
    return res.status(400).json({ success: false, message: 'Contacts and message are required' });
  }

  if (!isWhatsAppReady) {
    return res.status(503).json({ success: false, message: 'WhatsApp Web is not ready. Please initialize first.' });
  }

  try {
    const page = await browser.newPage();
    let successCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      if (!contact.phone) continue;

      // Replace template variables in message
      const personalizedMessage = message.replace(/{name}/g, contact.name || '');
      
      const success = await sendWhatsAppMessage(page, contact.phone, personalizedMessage);
      
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    await page.close();

    res.json({
      success: true,
      message: `Messages sent successfully: ${successCount}, Failed: ${failCount}`
    });
  } catch (error) {
    console.error('Error sending WhatsApp messages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API endpoint to initialize WhatsApp
app.post('/api/init-whatsapp', async (req, res) => {
  try {
    if (browser) {
      await browser.close();
    }
    
    isWhatsAppReady = false;
    const page = await initWhatsApp();
    
    if (isWhatsAppReady) {
      res.json({ success: true, message: 'WhatsApp Web initialized successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to initialize WhatsApp Web' });
    }
  } catch (error) {
    console.error('Error in init-whatsapp endpoint:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API endpoint to check WhatsApp status
app.get('/api/whatsapp-status', (req, res) => {
  res.json({ ready: isWhatsAppReady });
});

// Serve the React app for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to use the WhatsApp Automation tool`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});