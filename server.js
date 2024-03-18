const express = require('express');
const app = express();
const port = 3000;
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();

const routes = require('./public/back-end/routes');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../front-end')));

app.use('/', routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
