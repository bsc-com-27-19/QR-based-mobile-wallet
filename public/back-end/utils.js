const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Secret key for JWT signing
const secretKey = 'thuyjukijmjmjmj'; // Change this to a secure key

// Function to hash the password
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

// Function to create JWT token
function createToken(userId) {
  return jwt.sign({ userId }, secretKey, { expiresIn: '1h' });
}

module.exports = { hashPassword, createToken };