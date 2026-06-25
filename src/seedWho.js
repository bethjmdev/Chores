import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import whoData from './data/whoData'

export async function seedWhoIfEmpty() {
  const whoRef = collection(db, 'Who')
  const snapshot = await getDocs(query(whoRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  whoData.forEach((item) => {
    const ref = doc(db, 'Who', String(item.rowId))
    batch.set(ref, item)
  })

  await batch.commit()

  return { seeded: true, count: whoData.length }
}
