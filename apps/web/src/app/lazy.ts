/*
 * Everything behind sign-in is one chunk (Firestore, data hooks, main screens). The router
 * loads it on demand; the welcome screen prefetches it once it has rendered, so neither the
 * first paint nor sign-in waits for it.
 */
export const loadSignedIn = () => import('./signed-in');

let prefetched = false;
export function prefetchSignedIn() {
  if (prefetched) return;
  prefetched = true;
  void loadSignedIn();
}
