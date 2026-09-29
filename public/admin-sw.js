// 仮のPWA用Service Worker。
// 管理画面は常に最新データと認証状態を必要とするため、現段階では
// キャッシュを持たず、install/activateだけを担当する。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
