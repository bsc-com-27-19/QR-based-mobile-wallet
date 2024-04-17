const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { getAllUsers } = require('../controllers/userController');


router.get('/users', getAllUsers);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/protected', authController.protected);

module.exports = router;

