const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { getAllUsers } = require('../controllers/userController');
const { generateQRCode } = require('../utils/qrCode');


router.get('/users', getAllUsers);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/protected', authController.protected);

router.get('/generateQRCode', async (req, res) => {
    try {
        // Generate QR code with some data 
        const qrCodeUrl = 'https://example.com'; 
        const qrCodeImage = await generateQRCode(qrCodeUrl);

        // Send the QR code image as response
        res.send(`<!DOCTYPE html>
        <html lang="en">
        <head> 
            <title></title>
        </head>
        <body>
        <h1>Scan to Pay</h1>
        <img src="${qrCodeImage}" alt="QR Code" />
        </body>
        </html>
        `);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;

