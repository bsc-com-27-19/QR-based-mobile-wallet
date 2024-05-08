const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();

const BASE_URL = 'https://api-m.sandbox.paypal.com'; // Use sandbox environment for testing

app.use(bodyParser.json()); // Use bodyParser to parse JSON payloads

// Function to obtain an OAuth2 access token from PayPal for a specific user
async function getAccessToken(clientId, clientSecret) {
    try {
        // Make a POST request to the PayPal token endpoint
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

        // Return the access token
        return response.data.access_token;
    } catch (error) {
        console.error('Error obtaining access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// Create and capture an order with a credit card for a specific user
async function createAndCaptureOrder(purchaseUnits, card, clientId, clientSecret) {
    try {
        // Get access token for the specific user
        const accessToken = await getAccessToken(clientId, clientSecret);

        // Generate a unique PayPal-Request-Id
        const payPalRequestId = uuidv4();

        // Create an order with the provided purchase_units and credit card details
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

        // Capture the payment
        const orderId = createOrderResponse.data.id;
        const captureResponse = await axios.post(`${BASE_URL}/v2/checkout/orders/${orderId}/capture`, {}, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': payPalRequestId
            }
        });

        console.log('Capture Response:', captureResponse.data);
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
    }
}



module.exports = {
    createAndCaptureOrder: createAndCaptureOrder
  };

