import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import assignedToData from './data/assignedToData'

export async function seedAssignedToIfEmpty() {
  const assignedRef = collection(db, 'Assigned_To')
  const snapshot = await getDocs(query(assignedRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  assignedToData.forEach((item) => {
    const ref = doc(db, 'Assigned_To', String(item.choreRowId))
    batch.set(ref, item)
  })

  await batch.commit()

  return { seeded: true, count: assignedToData.length }
}
