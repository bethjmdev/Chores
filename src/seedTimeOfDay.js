import { collection, doc, getDocs, limit, query, setDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import timeOfDayData from './data/timeOfDayData'

const defaultTimeOfDayByRowId = Object.fromEntries(
  timeOfDayData.map((item) => [item.rowId, item]),
)

export async function seedTimeOfDayIfEmpty() {
  const timeOfDayRef = collection(db, 'Time_Of_Day')
  const snapshot = await getDocs(query(timeOfDayRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  timeOfDayData.forEach((item) => {
    const ref = doc(db, 'Time_Of_Day', String(item.rowId))
    batch.set(ref, item)
  })

  await batch.commit()

  return { seeded: true, count: timeOfDayData.length }
}

export async function ensureTimeOfDayConfig(timeOfDayList) {
  const updates = []

  for (const item of timeOfDayList) {
    const defaults = defaultTimeOfDayByRowId[item.rowId]
    if (!defaults) {
      continue
    }

    const patch = {}

    if (item.icon == null && defaults.icon != null) {
      patch.icon = defaults.icon
      item.icon = defaults.icon
    }

    if (Object.keys(patch).length > 0) {
      updates.push(
        setDoc(doc(db, 'Time_Of_Day', String(item.rowId)), patch, { merge: true }),
      )
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  return timeOfDayList
}
