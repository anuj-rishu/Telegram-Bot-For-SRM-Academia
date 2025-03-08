require('dotenv').config();
const axios = require('axios');

const setWebhook = async () => {
  const url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/setWebhook`;
  const webhookUrl = `${process.env.API_BASE_URL}/webhook`;

  try {
    const response = await axios.post(url, {
      url: webhookUrl,
    });
    console.log('Webhook set:', response.data);
  } catch (error) {
    console.error('Error setting webhook:', error);
  }
};

setWebhook();