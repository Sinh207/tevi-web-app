import { env } from '@shared/config/env'
import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'

/**
 * Lazy Firebase init. Firebase is only used for Anonymous + Twitter auth, so the
 * SDK is dynamically imported the first time it is needed to keep it out of the
 * initial bundle.
 */
let appPromise: Promise<FirebaseApp> | null = null

const firebaseConfig = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
}

async function getApp(): Promise<FirebaseApp> {
    if (appPromise) return appPromise
    appPromise = (async () => {
        const { getApps, initializeApp } = await import('firebase/app')
        return getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
    })()
    return appPromise
}

export async function getFirebaseAuth(): Promise<Auth> {
    const { getAuth } = await import('firebase/auth')
    return getAuth(await getApp())
}
