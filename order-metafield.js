require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Shopify = require('shopify-api-node');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Shopify API
const shopify = new Shopify({
  shopName: process.env.SHOPIFY_STORE,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN
});

// Handle form submission
app.post('/submit-form', async (req, res) => {
  // Destructure the received form data
  const { orderId, variantId, ...selectedFields } = req.body;

  console.log("📦 Received form data:", req.body);

  // Construct formula details dynamically based on the fields received
  let formulaDetails = '';
  Object.keys(selectedFields).forEach((key, index) => {
    const value = selectedFields[key];
    // Add a comma after each pair except the last one
    formulaDetails += `${key}: ${value}${index < Object.keys(selectedFields).length - 1 ? ', ' : ''}`;
  });

  try {
    // Step 1: Get the Shopify order ID based on the order name (orderId received)
    console.log(`🔍 Fetching Order by Order Name #${orderId}`);

    const orders = await shopify.order.list({ limit: 50 });
    const matchedOrder = orders.find(order => order.name === `#${orderId}`);

    if (!matchedOrder) {
      console.log(`❌ Order with name #${orderId} not found`);
      return res.status(404).json({
        success: false,
        message: `Order with name #${orderId} not found`
      });
    }

    const ORDER_ID = matchedOrder.id;
    console.log(`🆔 Matched Order ID for #${orderId}: ${ORDER_ID}`);

    // Step 2: Create metafields for the order in Shopify
    const metafields = [
      {
        namespace: 'custom',
        key: 'variant_id',
        value: variantId,
        value_type: 'single_line_text_field',
        owner_resource: 'order',
        owner_id: ORDER_ID
      },
      {
        namespace: 'custom',
        key: 'formula_details',
        value: formulaDetails,
        value_type: 'single_line_text_field',
        owner_resource: 'order',
        owner_id: ORDER_ID
      }
    ];

    // Step 3: Loop through the metafields and create them
    for (let metafield of metafields) {
      const createdMetafield = await shopify.metafield.create(metafield);
      console.log('✅ Metafield created:', createdMetafield);
    }

    res.json({ success: true, message: "Metafields updated successfully" });
  } catch (error) {
    console.error("❌ Error creating metafields:", error);
    res.status(500).json({ success: false, message: "Error creating metafields", error: error.message });
  }
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
