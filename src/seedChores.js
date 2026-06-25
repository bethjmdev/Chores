import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import choresData from './data/choresData'

export async function seedChoresIfEmpty() {
  const choresRef = collection(db, 'Chores')
  const snapshot = await getDocs(query(choresRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  choresData.forEach((chore) => {
    const ref = doc(db, 'Chores', String(chore.rowId))
    batch.set(ref, chore)
  })

  await batch.commit()

  return { seeded: true, count: choresData.length }
}
