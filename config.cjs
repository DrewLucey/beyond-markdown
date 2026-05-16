// Load variables from .env file into process.env
require('dotenv').config();

// Access the secrets anywhere below
const cobaltSecret = process.env.COBALTSESSION;

// config.cjs
module.exports = {
  // Configuration for the downloader
  cobaltSession: cobaltSecret // Get this from browser cookies
};