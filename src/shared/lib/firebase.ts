import { env } from '@shared/config/env'
import type { FirebaseApp } from 'firebase/app'
import type { Auth } from 'firebase/auth'

/**
 * Lazy Firebase init. Firebase is used for Anonymous + Twitter auth and for **Remote
 * Config** (`features/remote-config`), so the SDK is dynamically imported the first time it
 * is needed to keep it out of the initial bundle.
 *
 * The `app` is shared between them on purpose: `initializeApp` twice with the same config
 * warns, and Remote Config and Auth are two products of one project. Each product's own
 * entry point (`firebase/auth`, `firebase/remote-config`) is still imported separately, so
 * a page that only reads config never pulls Auth in and vice versa.
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

/**
 * The shared `FirebaseApp`, initialising it on first use.
 *
 * Exported for products other than Auth — Remote Config reads it. Prefer a product-specific
 * accessor (`getFirebaseAuth`) where one exists; this is the door for the ones that have no
 * wrapper of their own.
 */
export async function getFirebaseApp(): Promise<FirebaseApp> {
    return getApp()
}

export async function getFirebaseAuth(): Promise<Auth> {
    const { getAuth } = await import('firebase/auth')
    return getAuth(await getApp())
}
