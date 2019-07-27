module.exports = function OnionError(message, causedBy) {
  this.message = message;
  this.stack = '';
  this.causedBy = causedBy;
  Error.captureStackTrace(this, OnionError);
};
