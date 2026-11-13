// Firebase Configuration & Analytics Loader Template
// Copy this file to 'firebase-config.js' and fill in your Firebase project credentials.
// 'firebase-config.js' is gitignored to protect production analytics streams from clone/local pollution.
(function () {
  // Define your allowed production domains:
  const prodHosts = [
    "your-app-id.web.app",
    "your-app-id.firebaseapp.com"
  ];

  const isProd = prodHosts.includes(window.location.hostname);
  if (!isProd) {
    console.log(`[Firebase Analytics] Inactive on host (${window.location.hostname}). Analytics tracking disabled.`);
    return;
  }

  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
  };

  import("https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js")
    .then(({ initializeApp }) => {
      return import("https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js")
        .then(({ getAnalytics, isSupported, logEvent }) => {
          return isSupported().then((supported) => {
            if (!supported) return;
            const app = initializeApp(firebaseConfig);
            const analytics = getAnalytics(app);
            window.firebaseApp = app;
            window.firebaseAnalytics = analytics;
            window.logAnalyticsEvent = (name, params = {}) => {
              try {
                logEvent(analytics, name, params);
              } catch (_) {}
            };
            window.logAnalyticsEvent("page_view", {
              page_title: document.title,
              page_location: window.location.href,
              page_path: window.location.pathname
            });
          });
        });
    })
    .catch((err) => {
      console.warn("[Firebase Analytics] Load error:", err?.message || err);
    });
})();
