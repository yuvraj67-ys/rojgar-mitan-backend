require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { checkAdminSecret } = require('./middleware/auth');
const { db, messaging } = require('./services/firebase');
const Razorpay = require('razorpay');

const app = express();
app.use(cors());
app.use(express.json());

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), version: '1.0.0' });
});

// --- PUSH NOTIFICATIONS ---
app.post('/api/notifications/send', checkAdminSecret, async (req, res) => {
  try {
    const { title, body, target, deepLink, channelId = 'general' } = req.body;

    if (!title || !body || !target) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    let tokens = [];

    // Fetch Tokens based on target
    if (target === 'all' || target === 'premium' || target === 'free') {
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val() || {};
      
      for (const uid in users) {
        const user = users[uid];
        if (!user.fcmToken) continue;

        if (target === 'all') {
          tokens.push(user.fcmToken);
        } else if (target === 'premium' && user.isPremium) {
          tokens.push(user.fcmToken);
        } else if (target === 'free' && !user.isPremium) {
          tokens.push(user.fcmToken);
        }
      }
    } else {
      // Target is a specific User ID
      const userSnap = await db.ref(`users/${target}`).once('value');
      const user = userSnap.val();
      if (user && user.fcmToken) tokens.push(user.fcmToken);
    }

    if (tokens.length === 0) {
      return res.status(404).json({ success: false, message: 'No valid FCM tokens found for target' });
    }

    // Send Multicast Message
    const message = {
      notification: { title, body },
      data: { type: channelId, ...(deepLink && { deepLink }) },
      tokens: tokens
    };

    const response = await messaging.sendMulticast(message);

    // Log to Firebase
    await db.ref('notifications_log').push({
      title, body, target, sentCount: response.successCount, timestamp: Date.now()
    });

    res.json({ success: true, sent: response.successCount, failed: response.failureCount });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- LEADERBOARD RESET ---
app.post('/api/leaderboard/reset', checkAdminSecret, async (req, res) => {
  try {
    const { period } = req.body; // "daily", "weekly", "monthly"
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return res.status(400).json({ success: false, message: 'Invalid period' });
    }

    const ref = db.ref(`leaderboard/${period}`);
    const snapshot = await ref.once('value');
    
    if (snapshot.exists()) {
      // 1. Archive current leaderboard
      const dateStr = new Date().toISOString().split('T')[0];
      await db.ref(`leaderboard_history/${period}/${dateStr}`).set(snapshot.val());
      
      // 2. Wipe current leaderboard
      await ref.remove();
    }

    res.json({ success: true, message: `${period} leaderboard reset and archived.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Export Express App for Vercel Serverless
module.exports = app;
