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
const { createAndCaptureOrder } = require('./paypal');

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
// Serve static files from the 'front-end' directory
app.use(express.static(path.join(__dirname, '../front-end')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../front-end/html/login.html'));
});

// Middleware to parse JSON and URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Middleware for file uploads
app.use(fileUpload());

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
          }
        },
        sessionId: req.sessionID,
      });
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

// Protected route
app.get('/protected', verifyToken, async (req, res) => {
  // If token is valid, send the decoded information
  res.json(req.userId);
});

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

// Create an Express route to handle incoming requests for different users
app.post('/create-order1', async (req, res) => {
  try {
      const userId = req.session.userId;

      if (!userId) {
          return res.status(401).json({ error: 'User not logged in' });
      }

      // Retrieve user data from the database, including stored card details
      const userResult = await pool.query(`SELECT client_id, secret_key, card_name, card_number, card_security_code, card_expiry FROM users WHERE id = $1`, [userId]);
      const user = userResult.rows[0];

      if (!user) {
          return res.status(404).json({ error: 'User not found' });
      }

      // Get the purchase units from the request body
      const { purchase_units } = req.body;

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

      // Send a success response to the client
      res.status(200).json({ message: 'Order created and payment captured successfully', data: captureResponse });
  } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: error.message });
  }
});

// Create an Express route to handle incoming requests for creating an order
app.post('/create-order', async (req, res) => {
  try {
      // Retrieve data from the request body sent by the frontend
      const { purchase_units, card, clientId, secretKey } = req.body;

      // Check if all required data is present
      if (!purchase_units || !card || !clientId || !secretKey) {
          return res.status(400).json({ error: 'Missing required data in request body' });
      }

      // Call the function to create and capture an order
      const captureResponse = await createAndCaptureOrder(purchase_units, card, clientId, secretKey);

      // Send a success response to the client
      res.status(200).json({ message: 'Order created and payment captured successfully', data: captureResponse });
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