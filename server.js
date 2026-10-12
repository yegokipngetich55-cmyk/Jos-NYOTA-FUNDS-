
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 8080;
const PAYLOR_API_URL = "https://api.paylorke.com";

const BACKEND_URL = (
  process.env.BACKEND_URL ||
  "https://jos-nyota-funds-production.up.railway.app"
).replace(/\/+$/, "");

// ===============================
// CORS
// ===============================

app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Idempotency-Key"
  ]
}));

app.use(express.json());

// ===============================
// SERVE FRONTEND
// HTML and other frontend files
// are stored in the repository root.
// ===============================

const FRONTEND_FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/amount.html": "amount.html",
  "/apply.html": "apply.html",
  "/commitment.html": "commitment.html",
  "/delivery.html": "delivery.html",
  "/payment.html": "payment.html",
  "/purpose.html": "purpose.html",
  "/success.html": "success.html",
  "/style.css": "style.css",
  "/nyotake.png": "nyotake.png"
};

for (const [route, filename] of Object.entries(FRONTEND_FILES)) {
  app.get(route, (req, res) => {
    res.sendFile(path.join(__dirname, filename), (err) => {
      if (err && !res.headersSent) {
        res.status(err.statusCode || 404).send("Page or file not found");
      }
    });
  });
}

// ===============================
// STK PUSH
// ===============================

app.post("/stk-push", async (req, res) => {
  try {
    const { phone, amount } = req.body || {};

    if (!phone || amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        message: "Phone number and amount are required"
      });
    }

    const cleanPhone = String(phone)
      .replace(/\s+/g, "")
      .replace(/^\+/, "");

    if (!/^254(?:7|1)\d{8}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Use a valid Kenyan phone number, e.g. 254712345678"
      });
    }

    const paymentAmount = Number(amount);

    if (!Number.isSafeInteger(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount"
      });
    }

    if (!process.env.PAYLOR_API_KEY ||
        !process.env.PAYLOR_CHANNEL_ID) {
      console.error("Paylor credentials are not configured");

      return res.status(500).json({
        success: false,
        message: "Payment service is not configured"
      });
    }

    const reference = (
      `ORDER-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
    ).toUpperCase();

    const callbackUrl = `${BACKEND_URL}/api/paylor-callback`;

    const payload = {
      phone: cleanPhone,
      amount: paymentAmount,
      reference,
      channelId: process.env.PAYLOR_CHANNEL_ID,
      description: "Business payment",
      callbackUrl
    };

    console.log("Sending STK request to Paylor", { reference });

    const response = await axios.post(
      `${PAYLOR_API_URL}/api/v1/merchants/payments/stk-push`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYLOR_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": reference
        },
        timeout: 30000
      }
    );

    res.json({
      success: true,
      transactionId: response.data.transactionId,
      status: response.data.status,
      reference
    });

  } catch (error) {
    console.error(
      "STK Push error:",
      error.response?.data?.message || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Unable to initiate payment. Please try again."
    });
  }
});

// ===============================
// PAYMENT STATUS
// This endpoint requires a POST
// request containing transactionId.
// ===============================

app.post("/payment-status", async (req, res) => {
  try {
    const { transactionId } = req.body || {};

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "transactionId is required"
      });
    }

    if (!process.env.PAYLOR_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Payment service is not configured"
      });
    }

    const response = await axios.get(
      `${PAYLOR_API_URL}/api/v1/merchants/payments/transactions/${encodeURIComponent(transactionId)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYLOR_API_KEY}`
        },
        timeout: 30000
      }
    );

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error(
      "Payment status error:",
      error.response?.data?.message || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Unable to retrieve payment status"
    });
  }
});

// ===============================
// PAYLOR CALLBACK
// IMPORTANT:
// This acknowledges callbacks only.
// Verify callback authenticity and
// payment status before trusting them.
// ===============================

app.post("/api/paylor-callback", (req, res) => {
  console.log("Paylor callback received");

  // Do not treat this acknowledgement
  // as proof that a payment succeeded.
  // Add Paylor's documented signature/
  // status verification before production.

  return res.status(200).json({
    success: true
  });
});

// ===============================
// WALLET
// IMPORTANT:
// Protect this endpoint with
// authentication before production.
// ===============================

app.get("/api/wallet", async (req, res) => {
  try {
    if (!process.env.PAYLOR_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Payment service is not configured"
      });
    }

    const response = await axios.get(
      `${PAYLOR_API_URL}/api/v1/merchants/payments/wallet`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYLOR_API_KEY}`
        },
        timeout: 30000
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error(
      "Wallet error:",
      error.response?.data?.message || error.message
    );

    res.status(error.response?.status || 500).json({
      success: false,
      message: "Unable to retrieve wallet"
    });
  }
});

// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "NYOTA Funds backend is running"
  });
});

// ===============================
// 404
// ===============================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// ===============================
// ERROR HANDLER
// ===============================

app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NYOTA Funds server running on port ${PORT}`);
});
