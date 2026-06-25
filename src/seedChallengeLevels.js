import { collection, doc, getDocs, limit, query, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import challengeLevelsData from './data/challengeLevelsData'

export async function seedChallengeLevelsIfEmpty() {
  const challengeRef = collection(db, 'Challenge_Levels')
  const snapshot = await getDocs(query(challengeRef, limit(1)))

  if (!snapshot.empty) {
    return { seeded: false, count: snapshot.size }
  }

  const batch = writeBatch(db)

  challengeLevelsData.forEach((item) => {
    const ref = doc(db, 'Challenge_Levels', String(item.rowId))
    batch.set(ref, item)
  })

  await batch.commit()

  return { seeded: true, count: challengeLevelsData.length }
}
