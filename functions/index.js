import { onRequest } from 'firebase-functions/v2/https'
import admin from 'firebase-admin'
import { createRequire } from 'module'
import express from 'express'
import cors from 'cors'

const require = createRequire(import.meta.url)

if (!admin.apps.length) {
  try {
    const serviceAccount = require('./serviceAccountKey.json')
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  } catch {
    admin.initializeApp()
  }
}

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

export const api = onRequest({ region: 'us-central1' }, app)
