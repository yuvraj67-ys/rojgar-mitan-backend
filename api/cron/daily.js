const { db, messaging } = require('../services/firebase');

module.exports = async (req, res) => {
  try {
    const now = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    const usersRef = db.ref('users');
    const snapshot = await usersRef.once('value');
    const users = snapshot.val() || {};

    let updates = {};
    let expiredTokens = [];

    for (const uid in users) {
      const user = users[uid];

      // 1. Reset Daily Test Count
      if (user.todayTestDate !== todayStr) {
        updates[`${uid}/todayTestCount`] = 0;
        updates[`${uid}/todayTestDate`] = todayStr;
      }

      // 2. Check Premium Expiry
      if (user.isPremium && user.premiumExpiry && user.premiumExpiry < now) {
        updates[`${uid}/isPremium`] = false;
        if (user.fcmToken) expiredTokens.push(user.fcmToken);
      }
    }

    // Apply updates in bulk
    if (Object.keys(updates).length > 0) {
      await usersRef.update(updates);
    }

    // Send Expiry Notifications
    if (expiredTokens.length > 0) {
      const message = {
        notification: { title: "Premium Expired ⚠️", body: "Aapka premium expire ho gaya hai. Ad-free tests ke liye renew karein!" },
        data: { type: "general", deepLink: "rojgarmitan://premium" },
        tokens: expiredTokens
      };
      await messaging.sendMulticast(message);
    }

    res.status(200).send('Daily Cron Job Completed Successfully');
  } catch (error) {
    console.error('Daily Cron Error:', error);
    res.status(500).send('Cron Error');
  }
};
