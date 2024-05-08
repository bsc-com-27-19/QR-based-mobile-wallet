const crypto = require('crypto');

// Generate a random string of 32 characters
const generateSecretKey = () => {
  return crypto.randomBytes(16).toString('hex');
};

const secretKey = generateSecretKey();

module.exports = secretKey;