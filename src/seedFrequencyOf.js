import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import frequencyOfData from './data/frequencyOfData'

export async function seedFrequencyOfIfEmpty() {
  const frequencyRef = collection(db, 'Frequency_Of')
  const snapshot = await getDocs(query(frequencyRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  frequencyOfData.forEach((item) => {
    const ref = doc(db, 'Frequency_Of', String(item.rowId))
    batch.set(ref, item)
  })

  await batch.commit()

  return { seeded: true, count: frequencyOfData.length }
}
