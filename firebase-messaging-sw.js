/* Firebase Cloud Messaging — Service Worker (background notifications) */
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyArAW7ori6d5DpHW3lMEvLDl8q0iQl7spc",
  authDomain: "conecta-martinez.firebaseapp.com",
  projectId: "conecta-martinez",
  storageBucket: "conecta-martinez.firebasestorage.app",
  messagingSenderId: "720625753943",
  appId: "1:720625753943:web:f2ff72f62aaec5e8ef2812"
});

const messaging = firebase.messaging();

// Notificaciones en segundo plano (app cerrada o minimizada)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Conecta Martínez';
  const body  = payload.notification?.body  || 'Tienes una nueva notificación.';
  self.registration.showNotification(title, {
    body,
    icon:  './logo-conecta-martinez.png',
    badge: './logo-conecta-martinez.png',
    data:  payload.data || {}
  });
});
