const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const csrf = require('csurf');
const axios = require('axios');
const app = express();
const port = 3000;

app.use(express.json());
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

mongoose.connect('mongodb+srv://AMIR:<db_password>@airdrop.zowdz.mongodb.net/?retryWrites=true&w=majority&appName=airdrop', { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('اتصال به MongoDB برقرار شد'))
    .catch(err => console.error('خطا در اتصال به MongoDB:', err));

const userSchema = new mongoose.Schema({
    wallet: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ariarangco@gmail.com', // ایمیل خودت
        pass: 'vjmchetsomcvqnmv'     // رمز اپلیکیشن
    }
});

const ETHERSCAN_API_KEY = 'Q9BB336VQVU8GPH25V7GM2AZDYZ9TSVJM9'; // کلید API خودت
const BLOCKCHAIN_API_URL = 'https://blockchain.info';

app.get('/check-balances', async (req, res) => {
    const address = req.query.address;
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!walletRegex.test(address)) {
        return res.status(400).json({ message: 'آدرس کیف پول نامعتبر است.' });
    }

    try {
        const ethResponse = await axios.get(`https://api.etherscan.io/api`, {
            params: { module: 'account', action: 'balance', address, tag: 'latest', apikey: ETHERSCAN_API_KEY }
        });
        const ethBalance = ethResponse.data.result / 1e18;

        const usdtContract = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        const usdtResponse = await axios.get(`https://api.etherscan.io/api`, {
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
        console.error(error);
        res.status(500).json({ message: 'خطا در بررسی موجودی‌ها' });
    }
});

app.get('/csrf-token', (req, res) => {
    res.json({ token: req.csrfToken() });
});

app.post('/submit', async (req, res) => {
    const { wallet, email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const walletRegex = /^0x[a-fA-F0-9]{40}$/;

    if (!walletRegex.test(wallet)) return res.status(400).json({ message: 'آدرس کیف پول نامعتبر است.' });
    if (!emailRegex.test(email)) return res.status(400).json({ message: 'ایمیل نامعتبر است.' });

    try {
        const existingUser = await User.findOne({ wallet });
        if (existingUser) return res.status(400).json({ message: 'این کیف پول قبلاً ثبت شده است.' });

        const newUser = new User({ wallet, email });
        await newUser.save();

        const mailOptions = {
            from: 'ariarangco@gmail.com',
            to: 'fatifatifati2000@yahoo.com', // ایمیل ادمین
            subject: 'ثبت کاربر جدید در ایردراپ',
            text: `Wallet: ${wallet}\nEmail: ${email}\nTimestamp: ${new Date().toISOString()}`
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'اطلاعات با موفقیت ثبت و ارسال شد!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'خطا در سرور رخ داد.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
    console.log(`سرور در پورت ${port} فعال است`);
});