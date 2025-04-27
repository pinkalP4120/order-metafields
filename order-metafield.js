require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Shopify = require('shopify-api-node');
const he = require('he'); // Import HTML encoder library for encoding special characters

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

// Check if variant has been already submitted
app.post('/check-variant', async (req, res) => {
  const { orderId, variantId } = req.body;

  try {
    const orders = await shopify.order.list({ limit: 50 });
    const matchedOrder = orders.find(order => order.name === `#${orderId}`);

    if (!matchedOrder) {
      return res.json({ alreadySubmitted: false });
    }

    const order_id = matchedOrder.id;
    const existingMetafields = await shopify.metafield.list({
      metafield: { owner_id: order_id, owner_resource: 'order' }
    });

    const existingSubmittedVariantsMetafield = existingMetafields.find(
      (meta) => meta.namespace === 'custom' && meta.key === 'submitted_variant_ids'
    );

    if (existingSubmittedVariantsMetafield) {
      const existingVariantIds = JSON.parse(existingSubmittedVariantsMetafield.value || '[]');
      const alreadySubmitted = existingVariantIds.includes(variantId);
      return res.json({ alreadySubmitted });
    } else {
      return res.json({ alreadySubmitted: false });
    }
  } catch (error) {
    console.error('Error checking variant submission:', error);
    return res.status(500).json({ alreadySubmitted: false });
  }
});

// Handle form submission
app.post('/submit-form', async (req, res) => {
  const { orderId, variantId, ...selectedFields } = req.body;

  console.log("📦 Received form data:", req.body);

  try {
    // Step 1: Get Shopify order
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
    console.log(`🆔 Matched Order ID: ${ORDER_ID}`);

    // Step 2: Get variant label
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

    const existingDetailsMetafield = existingMetafields.find(
      (meta) => meta.namespace === 'custom' && meta.key === 'details_json'
    );

    const existingFormulaDetailsMetafield = existingMetafields.find(
      (meta) => meta.namespace === 'custom' && meta.key === 'formula_details'
    );

    const existingSubmittedVariantsMetafield = existingMetafields.find(
      (meta) => meta.namespace === 'custom' && meta.key === 'submitted_variant_ids'
    );

    if (existingSubmittedVariantsMetafield) {
      try {
        existingVariantIds = JSON.parse(existingSubmittedVariantsMetafield.value || '[]');
      } catch (error) {
        console.warn("⚠️ Couldn't parse submitted_variant_ids, resetting to empty array");
        existingVariantIds = [];
      }
    }

    if (existingVariantIds.includes(variantId)) {
      console.log(`⚠️ Variant ID ${variantId} already submitted. Skipping update.`);
      return res.json({ success: false, message: "Variant already submitted." });
    }

    if (existingDetailsMetafield) {
      try {
        detailsJsonObject = JSON.parse(existingDetailsMetafield.value || '{}');
      } catch (error) {
        console.warn("⚠️ Couldn't parse details_json, resetting to empty object");
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

    existingVariantIds.push(variantId);

    // Now prepare formulaDetailsText for the 'formula_details' metafield (multiline text)
    let formulaDetailsText = '';
    for (const [productName, fields] of Object.entries(detailsJsonObject)) {
      formulaDetailsText += `Products Name - ${he.encode(productName)}\n`; // Encode product name and use newline
      for (const [question, answer] of Object.entries(fields)) {
        formulaDetailsText += `${he.encode(question)} - ${he.encode(answer)}\n`; // Encode question and answer with newline
      }
      formulaDetailsText += `\n`; // extra space between products
    }

    // Update metafields
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

    if (existingFormulaDetailsMetafield) {
      metafieldPromises.push(
        shopify.metafield.update(existingFormulaDetailsMetafield.id, {
          value: formulaDetailsText.trim(),
          type: 'multi_line_text_field' // Changed to multiline text
        })
      );
      console.log('✅ Updating existing metafield: custom.formula_details');
    } else {
      metafieldPromises.push(
        shopify.metafield.create({
          namespace: 'custom',
          key: 'formula_details',
          type: 'multi_line_text_field', // Changed to multiline text
          value: formulaDetailsText.trim(),
          owner_resource: 'order',
          owner_id: ORDER_ID
        })
      );
      console.log('✅ Creating new metafield: custom.formula_details');
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

    await Promise.all(metafieldPromises);

    res.json({ success: true, message: "Metafields updated successfully." });
  } catch (error) {
    console.error("❌ Error handling metafields:", error);
    res.status(500).json({ success: false, message: "Error updating metafields", error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
