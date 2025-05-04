const axios = require("axios");
const config = require("../config/config");
const sessionManager = require("../utils/sessionManager");
const logger = require("../utils/logger");

function isTokenExpired(error) {
  if (!error) return false;

  if (error.response?.status === 401 || error.response?.status === 403) {
    return true;
  }

  const errorMsg = [
    error.response?.data?.message,
    error.response?.data?.error,
    error.message,
  ]
    .filter(Boolean)
    .map((msg) => String(msg).toLowerCase())
    .join(" ");

  return (
    errorMsg.includes("token expired") ||
    errorMsg.includes("invalid token") ||
    errorMsg.includes("unauthorized") ||
    errorMsg.includes("auth") ||
    errorMsg.includes("login required") ||
    errorMsg.includes("session expired") ||
    errorMsg.includes("not logged in") ||
    errorMsg.includes("authentication failed")
  );
}

async function notifyTokenExpiry(telegramId) {
  if (!telegramId || !global.botInstance) return;

  try {
    await global.botInstance.telegram.sendMessage(
      telegramId,
      "⚠️ *Your session has expired or been terminated*\n\nYou need to log in again to continue using the bot.\n\nUse the /login command to reconnect your account.",
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    logger.error(
      `Failed to send token expiry notification to user ${telegramId}: ${error.message}`
    );
  }
}

async function verifyToken(session) {
  if (!session || !session.token) return false;

  try {
    await axios.get(`${config.API_BASE_URL}/user`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        "X-CSRF-Token": session.csrfToken || session.token,
      },
      timeout: 5000,
    });
    return true;
  } catch (error) {
    return !isTokenExpired(error);
  }
}

async function makeAuthenticatedRequest(
  endpoint,
  session,
  method = "get",
  data = null
) {
  if (!session || !session.token) {
    throw new Error("No active session found");
  }

  const url = `${config.API_BASE_URL}${endpoint}`;
  const headers = {
    Authorization: `Bearer ${session.token}`,
    "X-CSRF-Token": session.csrfToken || session.token,
  };

  try {
    let response;
    switch (method.toLowerCase()) {
      case "post":
        response = await axios.post(url, data, { headers });
        break;
      case "put":
        response = await axios.put(url, data, { headers });
        break;
      case "delete":
        response = await axios.delete(url, { headers });
        break;
      default:
        response = await axios.get(url, { headers });
    }
    return response;
  } catch (error) {
    if (isTokenExpired(error) && session.telegramId) {
      await notifyTokenExpiry(session.telegramId);
      await sessionManager.deleteSession(session.telegramId);
      throw new Error("TOKEN_EXPIRED");
    }
    throw error;
  }
}

async function login(account, password) {
  const url = `${config.API_BASE_URL}/login`;
  const data = { account, password };
  return await axios.post(url, data);
}

async function logout(session) {
  if (!session || !session.token) {
    throw new Error("No active session found");
  }

  try {
    const response = await makeAuthenticatedRequest("/logout", session, "post");
    if (session.telegramId) {
      await sessionManager.deleteSession(session.telegramId);
    }
    return response;
  } catch (error) {
    if (session.telegramId && error.message !== "TOKEN_EXPIRED") {
      await sessionManager.deleteSession(session.telegramId);
    }
    if (error.message !== "TOKEN_EXPIRED") {
      throw error;
    }
  }
}

module.exports = {
  makeAuthenticatedRequest,
  login,
  logout,
  verifyToken,
  notifyTokenExpiry,
  isTokenExpired,
};