import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import admin from 'firebase-admin'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json')
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const db = admin.firestore()

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || (char === '\r' && next === '\n')) {
      row.push(field)
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row)
      }
      row = []
      field = ''
      if (char === '\r') i++
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

const csvPath = join(__dirname, '../data/chores.csv')
const csvText = readFileSync(csvPath, 'utf8')
const [header, ...dataRows] = parseCsv(csvText.trim())

const colIndex = Object.fromEntries(header.map((name, i) => [name, i]))

const chores = dataRows.map((cells) => ({
  rowId: Number(cells[colIndex._rowid]),
  chore: cells[colIndex.chore] || '',
  freqId: Number(cells[colIndex.freq_id]),
  challengeLevel: Number(cells[colIndex.challenge_level]),
  notes: cells[colIndex.notes] || '',
  active: 1,
}))

const batch = db.batch()

chores.forEach((chore) => {
  const ref = db.collection('Chores').doc(String(chore.rowId))
  batch.set(ref, chore)
})

await batch.commit()

console.log(`Seeded ${chores.length} chores into Firestore collection "Chores"`)
