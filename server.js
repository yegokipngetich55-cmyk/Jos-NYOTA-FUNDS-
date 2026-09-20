require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;
const PAYLOR_API_URL = "https://api.paylorke.com";

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://nyota-program.onrender.com",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"]
  })
);

app.use(express.json());


// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Paylor backend is running"
  });
});


// ===============================
// STK PUSH
// ===============================

app.post("/stk-push", async (req, res) => {
  try {
    const { phone, amount } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({
        success: false,
        message: "Phone number and amount are required"
      });
    }

    const cleanPhone = String(phone)
      .replace(/\s+/g, "")
      .replace(/^\+/, "");

    if (!/^2547\d{8}$/.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Use a valid Kenyan phone number, e.g. 254712345678"
      });
    }

    const paymentAmount = Number(amount);

    if (!Number.isInteger(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount"
      });
    }

    // Generate a unique reference for this payment
    const reference =
      `ORDER-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`
        .toUpperCase();

    const callbackUrl =
      `${process.env.BACKEND_URL}/api/paylor-callback`;

    const payload = {
      phone: cleanPhone,
      amount: paymentAmount,
      reference,
      channelId: process.env.PAYLOR_CHANNEL_ID,
      description: "Business payment",
      callbackUrl
    };

    console.log("Sending STK request to Paylor");
    console.log("Reference:", reference);
    console.log("Phone:", cleanPhone);
    console.log("Amount:", paymentAmount);

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

    console.log("Paylor response:", response.data);

    return res.status(200).json({
      success: true,
      transactionId: response.data.transactionId,
      status: response.data.status,
      reference
    });

  } catch (error) {
    console.error(
      "STK Push error:",
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Unable to initiate STK Push",
      error: error.response?.data || null
    });
  }
});


// ===============================
// PAYMENT STATUS
// ===============================

app.post("/payment-status", async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "transactionId is required"
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

    return res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error(
      "Payment status error:",
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.message ||
        "Unable to check payment status",
      error: error.response?.data || null
    });
  }
});


// ===============================
// PAYLOR CALLBACK
// ===============================

app.post("/api/paylor-callback", async (req, res) => {
  try {
    console.log("Paylor callback received:");
    console.log(JSON.stringify(req.body, null, 2));

    /*
      Paylor documentation says webhook callbacks
      are signed.

      Do NOT use an unverified callback as proof of payment.
      The transaction-status endpoint above can be used
      to reconcile the transaction.
    */

    return res.status(200).json({
      success: true
    });

  } catch (error) {
    console.error("Callback error:", error);

    return res.status(500).json({
      success: false
    });
  }
});


// ===============================
// WALLET
// ===============================

app.get("/api/wallet", async (req, res) => {
  try {
    const response = await axios.get(
      `${PAYLOR_API_URL}/api/v1/merchants/payments/wallet`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYLOR_API_KEY}`
        },
        timeout: 30000
      }
    );

    return res.status(200).json(response.data);

  } catch (error) {
    console.error(
      "Wallet error:",
      error.response?.data || error.message
    );

    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Unable to retrieve wallet"
    });
  }
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
// START SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
