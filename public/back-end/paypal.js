const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');

const BASE_URL = 'https://api-m.sandbox.paypal.com'; // Use sandbox environment for testing

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
