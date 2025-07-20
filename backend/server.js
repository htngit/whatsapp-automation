const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3002'],
  credentials: true
}));
app.use(express.json());

// Store browser instance and session state
let browser;
let whatsappSessionState = {
  initialized: false,
  active: false,
  lastActivity: null,
  activeTabs: []
};

// Default delay between messages (in milliseconds)
let messageDelay = 5000;

/**
 * Closes all existing WhatsApp Web tabs to prevent session conflicts
 * @param {boolean} forceClose - If true, closes all tabs. If false, only closes send-specific tabs
 */
async function closeExistingWhatsAppTabs(forceClose = false) {
  try {
    if (!browser) return;
    
    const pages = await browser.pages();
    const whatsappPages = pages.filter(page => 
      page.url().includes('web.whatsapp.com')
    );
    
    console.log(`Found ${whatsappPages.length} existing WhatsApp tabs`);
    
    for (const page of whatsappPages) {
      try {
        const url = page.url();
        // If forceClose is true, close all tabs
        // If forceClose is false, only close tabs with send parameters (temporary message tabs)
        if (forceClose || url.includes('send/?phone=')) {
          await page.close();
          console.log('Closed WhatsApp tab:', url);
        }
      } catch (error) {
        console.error('Error closing WhatsApp tab:', error);
      }
    }
    
    // Update session state only if force closing
    if (forceClose) {
      whatsappSessionState.activeTabs = [];
      whatsappSessionState.active = false;
    } else {
      // Update active tabs list without marking session as inactive
      const remainingPages = await browser.pages();
      const remainingWhatsappPages = remainingPages.filter(page => 
        page.url().includes('web.whatsapp.com')
      );
      whatsappSessionState.activeTabs = remainingWhatsappPages.map(page => page.url());
      whatsappSessionState.active = remainingWhatsappPages.length > 0;
    }
    
  } catch (error) {
    console.error('Error closing existing WhatsApp tabs:', error);
  }
}

/**
 * Initializes a Puppeteer browser instance with WhatsApp Web
 * Uses userDataDir to maintain session between restarts
 */
async function initBrowser() {
  try {
    // Close existing browser if it exists
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.log('Error closing existing browser:', error);
      }
    }
    
    // Create a persistent browser session
    browser = await puppeteer.launch({
      headless: false, // Show browser for user interaction
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      defaultViewport: null,
      userDataDir: path.join(__dirname, 'wa_session') // Persistent session
    });

    whatsappSessionState.initialized = true;
    whatsappSessionState.lastActivity = new Date();
    
    console.log('Browser initialized successfully');
    return browser;
  } catch (error) {
    console.error('Error initializing browser:', error);
    whatsappSessionState.initialized = false;
    throw error;
  }
}

/**
 * Sends a WhatsApp message to a specific phone number
 * @param {string} phone - Phone number to send message to
 * @param {string} message - Message content to send
 * @returns {Promise<boolean>} - Success status
 */
/**
 * Send WhatsApp message to a specific phone number
 * Handles both successful sends and invalid numbers (OK button scenario)
 * @param {string} phone - Phone number to send message to
 * @param {string} message - Message content to send
 * @returns {boolean} - Success status
 */
async function sendWhatsAppMessage(phone, message) {
  try {
    // Format phone number (remove any non-numeric characters)
    const formattedPhone = phone.replace(/\D/g, '');
    
    // Create a new page for this message
    const page = await browser.newPage();
    
    // Generate WhatsApp Web URL with phone and encoded message
    const url = `https://web.whatsapp.com/send/?phone=%2B${formattedPhone}&text=${encodeURIComponent(message)}&type=phone_number`;
    
    // Navigate to the specific chat
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000 // 60 seconds timeout
    });

    // Wait for either Send button or OK button (for invalid numbers)
    try {
      // Try to find Send button first (valid number scenario)
      await page.waitForSelector('[aria-label="Send"]', { timeout: 15000 });
      
      // Click the send button
      await page.click('[aria-label="Send"]');
      
      console.log(`Message sent to ${phone} successfully`);
      
      // Wait 1.5 seconds after sending before proceeding to next number
      await page.waitForTimeout(1500);
      
      // Close the temporary send page but keep main session
      await page.close();
      
      return true;
      
    } catch (sendButtonError) {
      // If Send button not found, check for OK button (invalid number scenario)
      console.log(`Send button not found for ${phone}, checking for invalid number dialog...`);
      
      try {
        // Look for OK button in invalid number dialog
        const okButtonSelectors = [
          'button[data-testid="ok-button"]',
          'button:contains("OK")',
          '[role="button"]:contains("OK")',
          'div[role="button"]:contains("OK")',
          'button[aria-label="OK"]'
        ];
        
        let okButtonFound = false;
        
        for (const selector of okButtonSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000 });
            await page.click(selector);
            console.log(`Invalid number ${phone} - OK button clicked`);
            okButtonFound = true;
            break;
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // If no specific OK button found, try generic approach
        if (!okButtonFound) {
          // Look for any button containing "OK" text
          const okButton = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
            return buttons.find(button => 
              button.textContent && 
              button.textContent.trim().toUpperCase().includes('OK')
            );
          });
          
          if (okButton && okButton.asElement()) {
            await okButton.asElement().click();
            console.log(`Invalid number ${phone} - Generic OK button clicked`);
            okButtonFound = true;
          }
        }
        
        if (okButtonFound) {
          // Wait 1.5 seconds after clicking OK before proceeding to next number
          await page.waitForTimeout(1500);
          
          // Close the temporary send page but keep main session
          await page.close();
          
          console.log(`Invalid number ${phone} handled successfully`);
          return false; // Return false as message wasn't actually sent
        } else {
          console.log(`No OK button found for ${phone}, closing page`);
          await page.close();
          return false;
        }
        
      } catch (okButtonError) {
        console.error(`Error handling invalid number ${phone}:`, okButtonError);
        await page.close();
        return false;
      }
    }
    
  } catch (error) {
    console.error(`Error sending message to ${phone}:`, error);
    return false;
  }
}

/**
 * API endpoint to send WhatsApp messages to multiple contacts
 * Accepts an array of {phone, message} objects and optional delay configuration
 */
app.post('/send-messages', async (req, res) => {
  const { contacts, delay } = req.body;
  
  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid request. Please provide an array of contacts with phone and message.' 
    });
  }

  // Update delay if provided
  if (delay && typeof delay === 'number' && delay >= 1000) {
    messageDelay = delay;
    console.log(`Message delay updated to: ${messageDelay}ms`);
  }

  try {
    // Close only temporary send tabs, keep main WhatsApp session open
    await closeExistingWhatsAppTabs(false);
    
    // Initialize browser if not already initialized
    if (!browser) {
      await initBrowser();
    }

    let successCount = 0;
    let failCount = 0;

    // Process each contact
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const { phone, message } = contact;
      
      if (!phone || !message) {
        failCount++;
        continue;
      }

      console.log(`Sending message ${i + 1}/${contacts.length} to ${phone}`);
      const success = await sendWhatsAppMessage(phone, message);
      
      if (success) {
        successCount++;
        whatsappSessionState.lastActivity = new Date();
      } else {
        failCount++;
      }

      // Add configurable delay between messages
      if (i < contacts.length - 1) { // Don't delay after the last message
        console.log(`Waiting ${messageDelay}ms before next message...`);
        await new Promise(resolve => setTimeout(resolve, messageDelay));
      }
    }

    res.json({
      success: true,
      message: `Messages sent successfully: ${successCount}, Failed: ${failCount}`,
      delay: messageDelay
    });
  } catch (error) {
    console.error('Error sending WhatsApp messages:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * API endpoint to check WhatsApp connection status
 */
app.get('/api/whatsapp-status', async (req, res) => {
  try {
    // Check if browser is initialized
    if (!browser) {
      return res.json({ 
        ready: false, 
        message: 'WhatsApp browser not initialized',
        sessionState: whatsappSessionState,
        delay: messageDelay
      });
    }
    
    // Check if there are active pages (WhatsApp Web sessions)
    const pages = await browser.pages();
    const whatsappPages = pages.filter(page => {
      return page.url().includes('web.whatsapp.com');
    });
    
    // Update session state
    whatsappSessionState.activeTabs = whatsappPages.map(page => page.url());
    whatsappSessionState.active = whatsappPages.length > 0;
    
    if (whatsappPages.length > 0) {
      return res.json({ 
        ready: true, 
        message: `WhatsApp is ready (${whatsappPages.length} active tab${whatsappPages.length > 1 ? 's' : ''})`,
        sessionState: whatsappSessionState,
        delay: messageDelay
      });
    } else {
      return res.json({ 
        ready: false, 
        message: 'WhatsApp session not active',
        sessionState: whatsappSessionState,
        delay: messageDelay
      });
    }
  } catch (error) {
    console.error('Error checking WhatsApp status:', error);
    return res.status(500).json({ 
      ready: false, 
      message: `Error: ${error.message}`,
      sessionState: whatsappSessionState,
      delay: messageDelay
    });
  }
});

/**
 * API endpoint to close WhatsApp session
 */
app.post('/api/close-whatsapp', async (req, res) => {
  try {
    await closeExistingWhatsAppTabs(true); // Force close all tabs
    
    res.json({ 
      success: true, 
      message: 'WhatsApp session closed successfully',
      sessionState: whatsappSessionState
    });
  } catch (error) {
    console.error('Error closing WhatsApp session:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      sessionState: whatsappSessionState
    });
  }
});

/**
 * API endpoint to update message delay configuration
 */
app.post('/api/update-delay', async (req, res) => {
  try {
    const { delay } = req.body;
    
    if (!delay || typeof delay !== 'number' || delay < 1000) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid delay. Must be a number >= 1000 (milliseconds)' 
      });
    }
    
    messageDelay = delay;
    
    res.json({ 
      success: true, 
      message: `Message delay updated to ${messageDelay}ms`,
      delay: messageDelay
    });
  } catch (error) {
    console.error('Error updating delay:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

/**
 * API endpoint to initialize WhatsApp Web
 */
app.post('/api/init-whatsapp', async (req, res) => {
  try {
    // Close existing WhatsApp tabs first
    await closeExistingWhatsAppTabs(true); // Force close all tabs
    
    // Initialize browser if not already initialized
    if (!browser) {
      await initBrowser();
    }
    
    // Open WhatsApp Web in a new page
    const page = await browser.newPage();
    await page.goto('https://web.whatsapp.com/', {
      waitUntil: 'networkidle2',
      timeout: 60000 // 60 seconds timeout
    });
    
    // Update session state
    whatsappSessionState.activeTabs = [page.url()];
    whatsappSessionState.active = true;
    whatsappSessionState.lastActivity = new Date();
    
    res.json({ 
      success: true, 
      message: 'WhatsApp Web initialized. Please scan the QR code in the browser window.',
      sessionState: whatsappSessionState
    });
  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
    whatsappSessionState.active = false;
    res.status(500).json({ 
      success: false, 
      message: error.message,
      sessionState: whatsappSessionState
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}/send-messages to use the API`);
  
  // Initialize browser on startup
  initBrowser().catch(err => {
    console.error('Failed to initialize browser on startup:', err);
  });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});