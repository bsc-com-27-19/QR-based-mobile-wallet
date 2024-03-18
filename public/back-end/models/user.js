const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const secretKey = '123'; // Change this to a secure key

const register = async (req, res) => {
  try {
    const { username, password } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(username)) {
      res.status(400).send('Invalid email address');
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query('INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id', [username, hashedPassword]);
    const userId = result.rows[0].id;
    const uniqueNumber = Math.floor(100000 + Math.random() * 900000);
    await pool.query('UPDATE users SET unique_number = $1 WHERE id = $2', [uniqueNumber, userId]);
    res.status(201).send('User registered successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).send('Incorrect username or password');
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).send('Incorrect username or password');
    }
    const token = jwt.sign({ userId: user.id }, secretKey, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

const protected = async (req, res) => {
  try {
    res.json({ userId: req.userId });
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
  register,
  login,
  protected
};

