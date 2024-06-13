const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const { Vonage } = require('@vonage/server-sdk');

const BASE_URL = 'https://api-m.sandbox.paypal.com'; // Use sandbox environment for testing

// Initialize Vonage client
const vonage = new Vonage({
    apiKey: "87b97ea9",
    apiSecret: "HDpUYXWST0xBvQpl"
});
const from = "IZEpay";
const to = "265997189926";

// Function to send SMS
async function sendSMS(text) {
    await vonage.sms.send({ to, from, text })
        .then(resp => { console.log('Message sent successfully'); console.log(resp); })
        .catch(err => { console.log('There was an error sending the messages.'); console.error(err); });
}

// Function to obtain an OAuth2 access token from PayPal for a specific user
async function getAccessToken(clientId, clientSecret) {
    try {
        const response = await axios.post(`${BASE_URL}/v1/oauth2/token`, 'grant_type=client_credentials', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            auth: {
                username: clientId,
                password: clientSecret,
            },
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error obtaining access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Create and capture an order with a credit card for a specific user
async function createAndCaptureOrder(purchaseUnits, card, clientId, clientSecret) {
    try {
        const accessToken = await getAccessToken(clientId, clientSecret);
        const payPalRequestId = uuidv4();

        const createOrderResponse = await axios.post(`${BASE_URL}/v2/checkout/orders`, {
            intent: 'CAPTURE',
            purchase_units: purchaseUnits,
            payment_source: {
                card: {
                    name: card.name,
                    number: card.number,
                    security_code: card.security_code,
                    expiry: card.expiry
                }
            }
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': payPalRequestId
            }
        });

        if (!createOrderResponse.data.id) {
            throw new Error('Failed to create order');
        }

        const orderId = createOrderResponse.data.id;

        const captureResponse = await axios.post(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {}, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': payPalRequestId
            }
        });

        if (captureResponse.data.status !== 'COMPLETED') {
            throw new Error('Failed to capture payment');
        }
        const payerName = captureResponse.data.payment_source.card.name;
        const amount = captureResponse.data.purchase_units[0].payments.captures[0].amount.value;
        const currency = "MWK";
        const transactionId = captureResponse.data.purchase_units[0].payments.captures[0].id;
        const date = new Date().toLocaleString();

        // Construct the SMS text with payment details
        const text = `Transaction ID: ${transactionId}\nYou have successfully received an amount of ${currency} ${amount} from ${payerName}\nDate: ${date}\n\nThank you for using IZEpay.\n\n`;

        // Send SMS upon successful payment capture
        await sendSMS(text);

        return captureResponse.data;
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        throw new Error('Error creating or capturing order: ' + error.message);
    }
}

// Function to update the payee's balance
async function updatePayeeBalance(payeeEmail, amount) {
    try {
        const payeeResult = await pool.query('SELECT id, balance FROM users WHERE email = $1', [payeeEmail]);
        const payee = payeeResult.rows[0];

        if (!payee) {
            throw new Error('Payee not found');
        }

        const newPayeeBalance = parseFloat(payee.balance) + parseFloat(amount);
        await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newPayeeBalance, payee.id]);

        return newPayeeBalance;
    } catch (error) {
        console.error('Error updating payee balance:', error.message);
        throw new Error('Error updating payee balance: ' + error.message);
    }
}

module.exports = {
    createAndCaptureOrder,
    updatePayeeBalance
};
