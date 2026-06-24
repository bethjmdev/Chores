import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import express from 'express'
import cors from 'cors'

initializeApp()

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

export const api = onRequest({ region: 'us-central1' }, app)
