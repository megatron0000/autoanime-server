var express = require('express');
var router = express.Router();
const db = require('../db');

router.get('/', function(req, res) {
  res.json(db.get('servers').value());
});

module.exports = router;
