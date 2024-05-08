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

app.post('/register', async (req, res) => {
  try {
    const { username, password, confirm } = req.body;

    // Validate if password and confirm password match
    if (password !== confirm) {
      res.status(400).send('Passwords do not match');
      return;
    }

    // Validate if username is in email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(username)) {
      res.status(400).send('Invalid email address');
      return;
    }

    // Hash the password using the hashPassword function from utils.js
    const hashedPassword = await hashPassword(password);

    // Generate QR code
    const qrCodeData = `User: ${username}`; // Customize QR code data as per your requirement
    const qrCodeImage = await qr.toDataURL(qrCodeData);

    // Access the uploaded file
    const profilePicture = req.files && req.files.profilePicture ? req.files.profilePicture.data : null;

    // Store the user in the database
    const result = await pool.query('INSERT INTO users (username, password, profile_picture, qrcode) VALUES ($1, $2, $3, $4) RETURNING id', [username, hashedPassword, profilePicture, qrCodeImage]);
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


// Login route
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

    res.json({ message: 'Login successful' });
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

// User details route
app.get('/user/details', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.userId) {
      return res.status(401).send('Unauthorized');
    }

    // Query the database to get user details based on the user ID
    const queryResult = await pool.query('SELECT username FROM users WHERE id = $1', [req.session.userId]);

    if (queryResult.rows.length === 1) {
      const userDetails = queryResult.rows[0];
      res.json(userDetails);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
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
app.post('/create-order', async (req, res) => {
  try {
      const { purchase_units, card, clientId, clientSecret } = req.body;

      // Call the function to create and capture an order for the specific user
      const captureResponse = await createAndCaptureOrder(purchase_units, card, clientId, clientSecret);

      // Send a success response to the client
      res.status(200).json({ message: 'Order created and payment captured successfully', data: captureResponse });
  } catch (error) {
      console.error('Error:', error);
      // Send an error response to the client
      res.status(400).json({ error: error.message });
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