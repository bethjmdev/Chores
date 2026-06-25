import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import successTrackingData from './data/successTrackingData'

export async function seedSuccessTrackingIfEmpty() {
  const successRef = collection(db, 'Success_Tracking')
  const snapshot = await getDocs(query(successRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  successTrackingData.forEach((item) => {
    const ref = doc(db, 'Success_Tracking', String(item.rowId))
    batch.set(ref, item)
  })

  await batch.commit()

  return { seeded: true, count: successTrackingData.length }
}
