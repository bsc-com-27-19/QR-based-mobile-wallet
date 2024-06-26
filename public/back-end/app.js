const express = require('express');
const app = express();
const secretKey = require('./auth');
const port = 3003;
const session = require('express-session')
const db = require('./db');
const bcrypt = require('bcrypt')
const pg = require('pg-promise')();
const pool = require('./db'); // Import PostgreSQL connection from db.js
const { hashPassword, createToken } = require('./utils');
const path = require('path');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser');
const cors=require("cors")
const qr = require('qrcode'); // Import the QR code generation library
const { encode } = require('base64-arraybuffer'); // Import the base64-arraybuffer library
const { createAndCaptureOrder, getAccessToken, getPayPalBalance, updatePayeeBalance } = require('./paypal'); // Import the new functions
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:3003',
      },
    ],
  },
  apis: ['./app.js'], // Path to the API docs
};

// Use CORS middleware
app.use(cors());

app.use(session({
  secret: secretKey,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set secure to true if using HTTPS
}));
require('dotenv').config(); // Load environment variables from .env
const { createTables } = require('./migrate');
// Configure body parser
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware to parse JSON and URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Middleware for file uploads
app.use(fileUpload());

const swaggerSpec = swaggerJsdoc(options);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         email:
 *           type: string
 *         username:
 *           type: string
 *         password:
 *           type: string
 *         client_id:
 *           type: string
 *         secret_key:
 *           type: string
 *         card_name:
 *           type: string
 *         card_number:
 *           type: string
 *         card_security_code:
 *           type: string
 *         card_expiry:
 *           type: string
 */

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               confirm:
 *                 type: string
 *               client_id:
 *                 type: string
 *               secret_key:
 *                 type: string
 *               card:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   number:
 *                     type: string
 *                   security_code:
 *                     type: string
 *                   expiry:
 *                     type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Invalid input
 *       500:
 *         description: Internal server error
 */
//register a user with associated client id and secret key
app.post('/register', async (req, res) => {
  try {
      const { email, username, password, confirm, client_id, secret_key, card } = req.body;

      // Perform validations (e.g., password match, email format)
      if (password !== confirm) {
          return res.status(400).send('Passwords do not match');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(username)) {
          return res.status(400).send('Invalid email address');
      }

      // Hash the password
      const hashedPassword = await hashPassword(password);

      // Check if card details are provided
      if (!card || !card.name || !card.number || !card.security_code || !card.expiry) {
          return res.status(400).send('Incomplete card details');
      }

      // Store user data including PayPal credentials and card details in the database
      const result = await pool.query(
          `INSERT INTO users (email, username, password, client_id, secret_key, card_name, card_number, card_security_code, card_expiry)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [email, username, hashedPassword, client_id, secret_key, card.name, card.number, card.security_code, card.expiry]
      );

      const userId = result.rows[0].id;

      // Store user ID in the session
      req.session.userId = userId;

      res.status(201).send('User registered successfully');
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

// JWT verify token section

function verifyToken(req, res, next) {
  // Extract the JWT token from the request header
  const authorizationHeader = req.header('Authorization');
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).send('Unauthorized');
  }

  const token = authorizationHeader.split('Bearer ')[1];

  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, secretKey);
    req.userId = decoded.userId; // Attach the user ID to the request object
    next(); // Call next middleware or route handler
  } catch (error) {
    return res.status(401).send('Unauthorized');
  }
}
/**
 * @swagger
 * /login:
 *   post:
 *     summary: Login a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Incorrect username or password
 *       500:
 *         description: Internal server error
 */
//Login endpoint
app.post('/login', async (req, res) => {
  try {
      const { username, password } = req.body;

      // Retrieve user from the database
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];

      if (!user) {
          return res.status(401).send('Incorrect username or password');
      }

      // Compare hashed password
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
          return res.status(401).send('Incorrect username or password');
      }

      // Store user ID in the session
      req.session.userId = user.id;

      // Update the user's session ID in the database
      await pool.query('UPDATE users SET session_id = $1 WHERE id = $2', [req.sessionID, user.id]);

      // Send user details along with the login response
      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          clientId: user.client_id,
          secretKey: user.secret_key,
          card: {
            name: user.card_name,
            number: user.card_number,
            securityCode: user.card_security_code,
            expiry: user.card_expiry
          },
          balance: user.balance
        },
        sessionId: req.sessionID,
      });
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});
/**
 * @swagger
 * /update-profile:
 *   post:
 *     summary: Update user profile
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               cardName:
 *                 type: string
 *               cardNumber:
 *                 type: string
 *               cardSecurityCode:
 *                 type: string
 *               cardExpiry:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       400:
 *         description: Invalid input
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

// Add the profile update endpoint
app.post('/update-profile', async (req, res) => {
  try {
    const { username, email, cardName, cardNumber, cardSecurityCode, cardExpiry } = req.body;

    // Perform validations (e.g., email format)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Update the user's information in the database based on the username
    const result = await pool.query(
      `UPDATE users SET email = $1, card_name = $2, card_number = $3, card_security_code = $4, card_expiry = $5 WHERE username = $6`,
      [email, cardName, cardNumber, cardSecurityCode, cardExpiry, username]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /protected:
 *   get:
 *     summary: Access protected route
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully accessed protected route
 *       401:
 *         description: Unauthorized
 */

// Protected route
app.get('/protected', verifyToken, async (req, res) => {
  // If token is valid, send the decoded information
  res.json(req.userId);
});

/**
 * @swagger
 * /qrcode:
 *   get:
 *     summary: Generate and display QR code
 *     responses:
 *       200:
 *         description: QR code generated successfully
 *       500:
 *         description: Internal server error
 */

// Define a route to generate and display the QR code
app.get('/qrcode', (req, res) => {
  try {
      // Generate the QR code with some sample data
      const qrCodeData = 'Sample QR Code Data'; // Replace this with your actual data
      
      // Generate the QR code as a data URL
      qr.toDataURL(qrCodeData, (err, url) => {
          if (err) {
              console.error('Error generating QR code:', err);
              res.status(500).send('Error generating QR code');
          } else {
              // Send the QR code data URL as a response
              res.send(`<img src="${url}" alt="QR Code">`);
          }
      });
  } catch (error) {
      console.error('Error handling request:', error);
      res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all registered users
 *     responses:
 *       200:
 *         description: A list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       500:
 *         description: Internal server error
 */

// Get all registered users
app.get('/users', async (req, res) => {
  try {
    // Retrieve all users from the database
    const result = await pool.query('SELECT * FROM users');
    const users = result.rows;

    // Remove sensitive information (like passwords) before sending response
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json(usersWithoutPasswords);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /order:
 *   post:
 *     summary: Create and capture an order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               purchase_units:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     amount:
 *                       type: object
 *                       properties:
 *                         value:
 *                           type: number
 *               card:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   number:
 *                     type: string
 *                   security_code:
 *                     type: string
 *                   expiry:
 *                     type: string
 *               clientId:
 *                 type: string
 *               secretKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order created and payment captured successfully
 *       400:
 *         description: Invalid input or insufficient balance
 *       401:
 *         description: User not logged in
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

app.post('/order', async (req, res) => {
  try {
      const userId = req.session.userId;

      if (!userId) {
          return res.status(401).json({ error: 'User not logged in' });
      }

      // Retrieve user data from the database, including stored card details and balance
      const userResult = await pool.query(`SELECT client_id, secret_key, card_name, card_number, card_security_code, card_expiry, balance FROM users WHERE id = $1`, [userId]);
      const user = userResult.rows[0];

      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      // Get the purchase units and the total amount from the request body
      const { purchase_units } = req.body;
      const totalAmount = purchase_units.reduce((acc, unit) => acc + parseFloat(unit.amount.value), 0);

      // Check if the user's balance is sufficient
      if (user.balance < totalAmount) {
          return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Use the stored card details from the user's data
      const card = {
          name: user.card_name,
          number: user.card_number,
          security_code: user.card_security_code,
          expiry: user.card_expiry,
      };

      // Retrieve PayPal client ID and secret key from the user's data
      const clientId = user.client_id;
      const secretKey = user.secret_key;

      // Call the function to create and capture an order
      const captureResponse = await createAndCaptureOrder(purchase_units, card, clientId, secretKey);

      // Deduct the amount from the user's balance
      const newBalance = user.balance - totalAmount;
      await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, userId]);

      // Send a success response to the client
      res.status(200).json({ message: 'Order created and payment captured successfully', data: captureResponse, balance: newBalance });
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /create-order:
 *   post:
 *     summary: Create an order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               purchase_units:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     amount:
 *                       type: object
 *                       properties:
 *                         value:
 *                           type: number
 *               card:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   number:
 *                     type: string
 *                   security_code:
 *                     type: string
 *                   expiry:
 *                     type: string
 *               clientId:
 *                 type: string
 *               secretKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order created and payment captured successfully
 *       400:
 *         description: Invalid input or insufficient balance
 *       401:
 *         description: User not logged in
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

//Create-order endpoint
app.post('/create-order', async (req, res) => {
  try {
      const { purchase_units, card, clientId, secretKey } = req.body;

      if (!purchase_units || !card || !clientId || !secretKey) {
          return res.status(400).json({ error: 'Missing required data in request body' });
      }

      const userResult = await pool.query('SELECT id, balance FROM users WHERE client_id = $1 AND secret_key = $2', [clientId, secretKey]);
      const user = userResult.rows[0];

      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      const totalAmount = purchase_units.reduce((acc, unit) => acc + parseFloat(unit.amount.value), 0);

      if (user.balance < totalAmount) {
          return res.status(400).json({ error: 'Insufficient balance' });
      }

      const captureResponse = await createAndCaptureOrder(purchase_units, card, clientId, secretKey);

      const newBalance = user.balance - totalAmount;
      await pool.query('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, user.id]);

      const payeeEmail = purchase_units[0].payee.email_address;
      const newPayeeBalance = await updatePayeeBalance(payeeEmail, totalAmount);

      res.status(200).json({ message: 'Order created and payment captured successfully', data: captureResponse, balance: newBalance, payeeBalance: newPayeeBalance });
  } catch (error) {
      console.error('Error:', error.message);
      res.status(500).json({ error: error.message });
  }
});
/**
 * @swagger
 * /balance:
 *   post:
 *     summary: Retrieve user balance from PayPal
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               clientId:
 *                 type: string
 *                 description: The client ID for PayPal API access
 *               secretKey:
 *                 type: string
 *                 description: The secret key for PayPal API access
 *     responses:
 *       200:
 *         description: Successfully retrieved balance
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 balance:
 *                   type: number
 *                   description: The user's PayPal balance
 *       400:
 *         description: Client ID and secret key are required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */

// Retrieve user balance from PayPal
app.post('/balance', async (req, res) => {
  try {
      const { clientId, secretKey } = req.body;

      if (!clientId || !secretKey) {
          return res.status(400).json({ error: 'Client ID and secret key are required' });
      }

      // Get PayPal access token
      const accessToken = await getAccessToken(clientId, secretKey);

      // Get PayPal balance
      const balance = await getPayPalBalance(accessToken);

      res.status(200).json(balance);
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: error.message });
  }
});



// Run the migration script to create tables if they don't exist
createTables().then(() => {
  // Start the server after tables are created
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}).catch(error => {
  console.error('Error creating tables:', error);
});


