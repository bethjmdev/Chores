import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import whenCompletedData from './data/whenCompletedData'

export async function seedWhenCompletedIfEmpty() {
  const whenCompletedRef = collection(db, 'When_Completed')
  const snapshot = await getDocs(query(whenCompletedRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  whenCompletedData.forEach((item) => {
    const ref = doc(db, 'When_Completed', String(item.rowId))
    batch.set(ref, item)
  })

  await batch.commit()

  return { seeded: true, count: whenCompletedData.length }
}
