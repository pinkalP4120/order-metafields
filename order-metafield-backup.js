require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Shopify = require('shopify-api-node');

const app = express();
const port = 5000;

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
  const { orderId, variantId, ...selectedFields } = req.body;

  console.log("📦 Received form data:", req.body);

  try {
    // Step 1: Get the Shopify order ID based on the order name
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

    // Step 2: Fetch existing metafields
    const existingMetafields = await shopify.metafield.list({
      metafield: { owner_id: ORDER_ID, owner_resource: 'order' }
    });

    let detailsJsonObject = {};

    // Step 3: Find if 'details_json' already exists
    const existingDetailsMetafield = existingMetafields.find(
      (meta) => meta.namespace === 'custom' && meta.key === 'details_json'
    );

    if (existingDetailsMetafield) {
      try {
        detailsJsonObject = JSON.parse(existingDetailsMetafield.value || '{}');
      } catch (error) {
        console.warn("⚠️ Couldn't parse existing JSON, resetting to empty object");
      }
    }

    // Step 4: Update the JSON with the new variant's formula details
    detailsJsonObject[variantId] = selectedFields;

    // Step 5: Save or update the metafield
    if (existingDetailsMetafield) {
      // Update existing metafield
      await shopify.metafield.update(existingDetailsMetafield.id, {
        value: JSON.stringify(detailsJsonObject),
        type: 'json'
      });
      console.log('✅ Updated existing metafield: custom.details_json');
    } else {
      // Create new metafield
      await shopify.metafield.create({
        namespace: 'custom',
        key: 'details_json',
        type: 'json',
        value: JSON.stringify(detailsJsonObject),
        owner_resource: 'order',
        owner_id: ORDER_ID
      });
      console.log('✅ Created new metafield: custom.details_json');
    }

    res.json({ success: true, message: "Metafield updated successfully" });
  } catch (error) {
    console.error("❌ Error handling metafield:", error);
    res.status(500).json({ success: false, message: "Error updating metafield", error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
