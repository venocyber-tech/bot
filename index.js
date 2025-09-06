const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        message: 'WhatsApp Bot is running',
        timestamp: new Date().toISOString(),
        uptime: formatUptime(process.uptime())
    });
});

app.get('/qr', (req, res) => {
    res.json({ 
        message: 'Check Heroku logs for QR code',
        instruction: 'Run: heroku logs --tail --app YOUR_APP_NAME'
    });
});

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--remote-debugging-port=9222',
            '--remote-debugging-address=0.0.0.0'
        ],
        executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'
    },
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
    }
});

// QR Code generation
client.on('qr', (qr) => {
    console.log('QR RECEIVED: Scan this QR code with your WhatsApp');
    qrcode.generate(qr, { small: true });
    
    // For remote debugging - you can see this in Heroku logs
    console.log('If you cannot scan the QR code, check Heroku logs for the text version');
});

// Client ready
client.on('ready', () => {
    console.log('✅ Client is ready and connected!');
    
    // Send notification to admin if configured
    if (process.env.ADMIN_NUMBER) {
        client.sendMessage(
            process.env.ADMIN_NUMBER, 
            "🤖 WhatsApp Bot is now online!\n\n" +
            `Server: ${process.env.HEROKU_APP_NAME || 'Heroku'}\n` +
            `Uptime: ${formatUptime(process.uptime())}`
        ).catch(console.error);
    }
});

// Authentication failure handling
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failure:', msg);
});

// Disconnected handling with auto-reconnect
client.on('disconnected', (reason) => {
    console.log('❌ Client was logged out:', reason);
    console.log('🔄 Attempting to reconnect in 5 seconds...');
    setTimeout(() => {
        client.initialize();
    }, 5000);
});

// Message handler
client.on('message', async (message) => {
    // Ignore messages from status broadcasts
    if (message.from === 'status@broadcast') return;
    
    console.log(`📩 Message from ${message.from}: ${message.body}`);
    
    try {
        await handleIncomingMessage(message);
    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// Improved message handler function
async function handleIncomingMessage(message) {
    const command = message.body.toLowerCase().trim();
    const sender = message.from;
    
    // Simple command handler
    const commands = {
        '!hello': `Hello! 👋 How can I assist you today?`,
        '!help': `🤖 *Available Commands:*\n\n• !hello - Greet the bot\n• !info - Bot information\n• !time - Current time\n• !help - Show this help menu\n• !status - Check bot status`,
        '!info': `*Bot Information:*\n\n• Version: 2.0.0\n• Platform: Heroku\n• Status: Active\n• Uptime: ${formatUptime(process.uptime())}`,
        '!time': `🕒 Current time: ${new Date().toLocaleString()}`,
        '!status': `✅ Bot is online and running!\nUptime: ${formatUptime(process.uptime())}`
    };
    
    if (commands[command]) {
        await message.reply(commands[command]);
        return;
    }
    
    // Keyword-based responses
    const keywordResponses = [
        { keywords: ['price', 'cost', 'how much'], response: 'Our prices start from $10. Would you like to know more about our services?' },
        { keywords: ['thank', 'thanks'], response: 'You\'re welcome! 😊 Is there anything else I can help with?' },
        { keywords: ['hi', 'hello', 'hey'], response: 'Hello! 👋 How can I help you today?' },
        { keywords: ['bye', 'goodbye'], response: 'Goodbye! 👋 Have a great day!' },
        { keywords: ['help', 'support'], response: 'I can help you with basic queries. Type !help to see all commands.' }
    ];
    
    for (const item of keywordResponses) {
        if (item.keywords.some(keyword => command.includes(keyword))) {
            await message.reply(item.response);
            return;
        }
    }
    
    // Default response for unrecognized messages (only respond to 30% to avoid spam)
    if (Math.random() < 0.3) {
        await message.reply('Sorry, I didn\'t understand that. Type !help to see what I can do.');
    }
}

// Helper function to format uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds %= 24 * 60 * 60;
    const hours = Math.floor(seconds / (60 * 60));
    seconds %= 60 * 60;
    const minutes = Math.floor(seconds / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
}

// Initialize client with error handling
async function initializeClient() {
    try {
        await client.initialize();
        console.log('🚀 WhatsApp client initialization started');
    } catch (error) {
        console.error('Failed to initialize client:', error);
        setTimeout(initializeClient, 10000); // Retry after 10 seconds
    }
}

// Start the server
app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
    initializeClient();
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down gracefully...');
    try {
        await client.destroy();
        console.log('✅ Client destroyed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
