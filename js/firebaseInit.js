        // Firebase bootstrap. Loads the compat SDK scripts dynamically and
        // initializes Firebase — but only outside the local/test namespace
        // (or with the explicit dev opt-in below). The test suite and plain
        // localhost runs therefore make zero gstatic requests, log no errors,
        // and a partially-failed SDK download can never execute out of order.
        //
        // window.FIREBASE_INIT resolves true when Firebase is ready, false
        // when running local-only (repo selection in storageRepo.js awaits it).
        //
        // Manual sign-in testing on localhost (which is `gym-local:`):
        //   localStorage.setItem('gym-local:enableFirebaseDev', 'true')
        // then reload. Tests never set this key.
        window.FIREBASE_INIT = (function () {
            const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.14.1/';

            const devOptIn = localStorage.getItem('gym-local:enableFirebaseDev') === 'true';
            if ((APP_NAMESPACE === 'gym-local:' && !devOptIn) || !FIREBASE_CONFIG) {
                return Promise.resolve(false);
            }

            const load = (name) => new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = SDK_BASE + name;
                s.onload = resolve;
                s.onerror = () => reject(new Error('SDK script failed to load: ' + name));
                document.head.appendChild(s);
            });

            // app-compat must execute before the feature SDKs.
            return load('firebase-app-compat.js')
                .then(() => Promise.all([
                    load('firebase-auth-compat.js'),
                    load('firebase-firestore-compat.js'),
                ]))
                .then(() => {
                    firebase.initializeApp(FIREBASE_CONFIG);
                    // Must be the first Firestore call. Multi-tab safe; on
                    // failure (unsupported browser) we continue online-only.
                    firebase.firestore().enablePersistence({ synchronizeTabs: true })
                        .catch((err) => {
                            console.warn('[firebase] offline persistence unavailable:', err && err.code);
                        });
                    return true;
                })
                .catch((e) => {
                    console.warn('[firebase] unavailable, staying local-only:', e && e.message);
                    return false;
                });
        })();
        window.FIREBASE_READY = false;
        window.FIREBASE_INIT.then((ready) => { window.FIREBASE_READY = ready; });
