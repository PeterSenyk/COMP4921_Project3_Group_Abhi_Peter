const express = require("express"); // Importing the express module
require("dotenv").config(); // Load environment variables from .env file
var session = require("express-session"); // import express session

const bcrypt = require("bcrypt"); // import bcrypt for password hashing
const ejs = require("ejs"); // import ejs for templating
const url = require("url"); // import url module
const multer = require("multer"); // import multer for file uploads
const path = require("path"); // import path module
const joi = require("joi"); // import joi for validation

// Import database service
const databaseService = require("../services/database-service");

module.exports = {
  express,
  session,
  bcrypt,
  ejs,
  url,
  multer,
  path,
  joi,
  databaseService,
};
