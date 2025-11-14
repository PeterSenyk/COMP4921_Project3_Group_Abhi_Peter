// OAuth service for Google Calendar API
const { google } = require("googleapis");
require("dotenv").config();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Valid Google Calendar API scopes
const scopes = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

/**
 * Generate the authorization URL for OAuth2 flow
 * @returns {string} Authorization URL
 */
function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent", // Force consent screen to get refresh token
  });
}

/**
 * Get tokens from authorization code
 * @param {string} code - Authorization code from OAuth callback
 * @returns {Promise<Object>} Tokens object
 */
async function getTokens(code) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
}

/**
 * Set credentials for the OAuth2 client
 * @param {Object} tokens - Token object with access_token, refresh_token, etc.
 */
function setCredentials(tokens) {
  oauth2Client.setCredentials(tokens);
}

/**
 * Get the OAuth2 client instance
 * @returns {google.auth.OAuth2Client} OAuth2 client
 */
function getClient() {
  return oauth2Client;
}

/**
 * Refresh the access token if needed
 * @returns {Promise<Object>} New tokens
 */
async function refreshAccessToken() {
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  return credentials;
}

module.exports = {
  oauth2Client,
  scopes,
  getAuthUrl,
  getTokens,
  setCredentials,
  getClient,
  refreshAccessToken,
};
