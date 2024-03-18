const jwt = require('jsonwebtoken');

const secretKey = 'your_secret_key'; // Change this to a secure key

const verifyToken = (req, res, next) => {
    const authorizationHeader = req.header('Authorization');
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return res.status(401).send('Unauthorized');
    }
    const token = authorizationHeader.split('Bearer ')[1];
  
    try {
      const decoded = jwt.verify(token, secretKey);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      return res.status(401).send('Unauthorized');
    }
};

module.exports = {
  verifyToken
};
