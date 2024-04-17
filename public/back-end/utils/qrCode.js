const QRCode = require('qrcode');

async function generateQRCode(data) {
    try {
        // Generate QR code with the provided data
        const qrCodeImage = await QRCode.toDataURL(data);
        return qrCodeImage;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw error;
    }
}

module.exports = { generateQRCode };
