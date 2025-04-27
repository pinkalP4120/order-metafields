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

    // Step 2: Get the variant label
    const variant = await shopify.productVariant.get(variantId);
    const product = await shopify.product.get(variant.product_id);
    const variantLabel = `${product.title} ${variant.title}`.trim();

    console.log(`🔖 Variant label: ${variantLabel}`);

    // Step 3: Fetch existing metafields
    const existingMetafields = await shopify.metafield.list({
      metafield: { owner_id: ORDER_ID, owner_resource: 'order' }
    });

    let detailsJsonObject = {};
    let existingVariantIds = [];

    // Step 4: Handle details_json metafield
    const existingDetailsMetafield = existingMetafields.find(
      (meta) => meta.namespace === 'custom' && meta.key === 'details_json'
    );

    if (existingDetailsMetafield) {
      try {
        detailsJsonObject = JSON.parse(existingDetailsMetafield.value || '{}');
      } catch (error) {
        console.warn("⚠️ Couldn't parse existing details_json, resetting to empty object");
        detailsJsonObject = {};
      }
    }

    detailsJsonObject = {
      ...detailsJsonObject,
      [variantLabel]: {
        ...(detailsJsonObject[variantLabel] || {}),
        ...selectedFields
      }
    };

    // Step 5: Handle submitted_variant_ids metafield
    const existingSubmittedVariantsMetafield = existingMetafields.find(
      (meta) => meta.namespace === 'custom' && meta.key === 'submitted_variant_ids'
    );

    if (existingSubmittedVariantsMetafield) {
      try {
        existingVariantIds = JSON.parse(existingSubmittedVariantsMetafield.value || '[]');
      } catch (error) {
        console.warn("⚠️ Couldn't parse existing submitted_variant_ids, resetting to empty array");
        existingVariantIds = [];
      }
    }

    if (!existingVariantIds.includes(variantId)) {
      existingVariantIds.push(variantId);
    }

    // Step 6: Save or update metafields
    const metafieldPromises = [];

    if (existingDetailsMetafield) {
      metafieldPromises.push(
        shopify.metafield.update(existingDetailsMetafield.id, {
          value: JSON.stringify(detailsJsonObject),
          type: 'json'
        })
      );
      console.log('✅ Updating existing metafield: custom.details_json');
    } else {
      metafieldPromises.push(
        shopify.metafield.create({
          namespace: 'custom',
          key: 'details_json',
          type: 'json',
          value: JSON.stringify(detailsJsonObject),
          owner_resource: 'order',
          owner_id: ORDER_ID
        })
      );
      console.log('✅ Creating new metafield: custom.details_json');
    }

    if (existingSubmittedVariantsMetafield) {
      metafieldPromises.push(
        shopify.metafield.update(existingSubmittedVariantsMetafield.id, {
          value: JSON.stringify(existingVariantIds),
          type: 'json'
        })
      );
      console.log('✅ Updating existing metafield: custom.submitted_variant_ids');
    } else {
      metafieldPromises.push(
        shopify.metafield.create({
          namespace: 'custom',
          key: 'submitted_variant_ids',
          type: 'json',
          value: JSON.stringify(existingVariantIds),
          owner_resource: 'order',
          owner_id: ORDER_ID
        })
      );
      console.log('✅ Creating new metafield: custom.submitted_variant_ids');
    }

    // Wait for all metafield operations to complete
    await Promise.all(metafieldPromises);

    res.json({ success: true, message: "Metafields updated successfully" });
  } catch (error) {
    console.error("❌ Error handling metafields:", error);
    res.status(500).json({ success: false, message: "Error updating metafields", error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
