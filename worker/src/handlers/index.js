const emailHandler = require('./emailHandler');
const imageHandler = require('./imageHandler');
const dataExportHandler = require('./dataExportHandler');

const handlers = {
  'email_send': emailHandler,
  'image_process': imageHandler,
  'data_export': dataExportHandler
};

module.exports = handlers;