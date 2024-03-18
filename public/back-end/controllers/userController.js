const pool = require('../db'); 

const getAllUsers = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users');
        const users = result.rows;
        const usersWithoutPasswords = users.map(user => {
          const { password, ...userWithoutPassword } = user;
          return userWithoutPassword;
        });
        res.json(usersWithoutPasswords);
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
};

module.exports = {
  getAllUsers
};
