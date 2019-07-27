const crypto = require("crypto");

module.exports = function idGenerator() {
  return crypto.randomBytes(16).toString("hex");
};
