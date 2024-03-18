const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const user = require('../models/user'); 

const secretKey = 'your_secret_key'; // Change this to a secure key

const register = async (req, res) => {
  try {
    
    await user.register(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

const login = async (req, res) => {
  try {
    
    await user.login(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

const protected = async (req, res) => {
  try {
    await user.protected(req, res);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
  register,
  login,
  protected
};
