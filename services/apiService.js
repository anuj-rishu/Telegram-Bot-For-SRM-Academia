const axios = require('axios');
const config = require('../config/config')

/**
 * Make authenticated API requests
 * @param {string} endpoint - API endpoint to call
 * @param {Object} session - User session with authentication tokens
 * @param {string} method - HTTP method (default: 'get')
 * @param {Object} data - Request payload for POST/PUT requests
 * @returns {Promise} Axios request promise
 */
async function makeAuthenticatedRequest(endpoint, session, method = 'get', data = null) {
  const url = `${config.API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Authorization': `Bearer ${session.token}`,
    'X-CSRF-Token': session.csrfToken
  };
  
  switch (method.toLowerCase()) {
    case 'post':
      return axios.post(url, data, { headers });
    case 'put':
      return axios.put(url, data, { headers });
    case 'delete':
      return axios.delete(url, { headers });
    default:
      return axios.get(url, { headers });
  }
}

/**
 * Login to SRM API
 * @param {string} account - Username or registration number
 * @param {string} password - User password
 * @returns {Promise} Axios request promise
 */
async function login(account, password) {
  return axios.post(`${config.API_BASE_URL}/login`, { account, password });
}

/**
 * Logout from SRM API
 * @param {Object} session - User session with authentication tokens
 * @returns {Promise} Axios request promise
 */
async function logout(session) {
  return makeAuthenticatedRequest('/logout', session, 'delete');
}

module.exports = {
  makeAuthenticatedRequest,
  login,
  logout
};