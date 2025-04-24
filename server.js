require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const Shopify = require('shopify-api-node');

const app = express();
const PORT = 5000;

// Middleware to parse JSON request bodies
app.use(bodyParser.json());

// Initialize Shopify API
const shopify = new Shopify({
  shopName: process.env.SHOPIFY_STORE,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN
});

// 🛠️ POST endpoint to receive form data
app.post('/submit-form', async (req, res) => {
  const { variantId, orderId, ...customFields } = req.body;

  console.log('📥 Received:', { variantId, orderId, customFields });

  try {
    // 🛠️ Step 3: Create/update metafield on the order
    const metafield = await shopify.metafield.create({
      namespace: 'custom',
      key: 'variant_id',
      value: variantId,
      type: 'single_line_text_field',
      owner_resource: 'order',
      owner_id: orderId
    });

    console.log('✅ Metafield created:', metafield);

    res.json({ success: true, metafield });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
