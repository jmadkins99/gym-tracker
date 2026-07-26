        // Firebase bootstrap. Initializes the compat SDK only outside the
        // local/test namespace (or with the explicit dev opt-in below), so the
        // test suite and plain localhost runs never touch the network and
        // never log errors. Sets FIREBASE_READY for the repo selection in
        // storageRepo.js.
        //
        // Manual sign-in testing on localhost (which is `gym-local:`):
        //   localStorage.setItem('gym-local:enableFirebaseDev', 'true')
        // then reload. Tests never set this key.
        window.FIREBASE_READY = false;
        (function () {
            const devOptIn = localStorage.getItem('gym-local:enableFirebaseDev') === 'true';
            if (APP_NAMESPACE === 'gym-local:' && !devOptIn) return;
            if (typeof firebase === 'undefined' || !FIREBASE_CONFIG) return;

            try {
                firebase.initializeApp(FIREBASE_CONFIG);
                // Must be the first Firestore call. Multi-tab safe; on
                // failure (unsupported browser) we continue online-only.
                firebase.firestore().enablePersistence({ synchronizeTabs: true })
                    .catch((err) => {
                        console.warn('[firebase] offline persistence unavailable:', err && err.code);
                    });
                window.FIREBASE_READY = true;
            } catch (e) {
                console.warn('[firebase] init failed, staying local-only:', e);
            }
        })();
