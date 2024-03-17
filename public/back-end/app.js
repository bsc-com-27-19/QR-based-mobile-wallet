const express = require('express');
const app = express();
const port = 3000;
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();


// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Configure body parser
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'front-end' directory
app.use(express.static(path.join(__dirname, '../front-end')));

// Define a route for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../front-end/html/login.html'));
});

// Middleware to parse JSON and URL-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Secret key for JWT signing
const secretKey = 'your_secret_key'; // Change this to a secure key

// Register a new user
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate if username is in email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(username)) {
      res.status(400).send('Invalid email address');
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store the user in the database
    const result = await pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', [username, hashedPassword]);
    const userId = result.rows[0].id;

    // Generate a unique 7-digit number
    const uniqueNumber = Math.floor(100000 + Math.random() * 900000); // Generate a random 7-digit number

    // Update the user record with the unique number
    await pool.query('UPDATE users SET unique_number = $1 WHERE id = $2', [uniqueNumber, userId]);

    res.status(201).send('User registered successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});


// Middleware to verify JWT token
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

// Login and return a JWT
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

    // Create JWT token
    const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '1h' }); // Token expires in 1 hour

    res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Protected route
app.get('/protected', async (req, res) => {
  // Extract the JWT token from the request header
  const authorizationHeader = req.header('Authorization');
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized');
    return;
  }

  const token = authorizationHeader.split('Bearer ')[1];

  try {
    // Verify the JWT token
    const decoded = jwt.verify(token, secretKey);

    // If token is valid, send the decoded information
    res.json(decoded);
  } catch (error) {
    res.status(401).send('Unauthorized');
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
