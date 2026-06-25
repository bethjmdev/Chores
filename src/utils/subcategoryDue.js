import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { ensureFrequencyQueueConfig, getFrequencyIntervalDays } from './frequencyQueue'

const dayMs = 24 * 60 * 60 * 1000

export { getFrequencyIntervalDays }

export function isSubcategoryDue(completedAt, intervalDays, now = Date.now()) {
  if (completedAt == null) {
    return true
  }

  if (intervalDays == null || intervalDays <= 0) {
    return true
  }

  return now >= completedAt + intervalDays * dayMs
}

export function isSubcategoryChecked(completedAt, intervalDays, now = Date.now()) {
  if (completedAt == null) {
    return false
  }

  return !isSubcategoryDue(completedAt, intervalDays, now)
}

export async function ensureFrequencyIntervalDays(frequencyList) {
  return ensureFrequencyQueueConfig(frequencyList)
}

export async function resetDueSubcategories(subcategoryList, choresList, frequencyList) {
  const choreMap = Object.fromEntries(choresList.map((chore) => [chore.rowId, chore]))
  const freqMap = Object.fromEntries(frequencyList.map((freq) => [freq.rowId, freq]))
  const now = Date.now()
  const updates = []

  for (const subcategory of subcategoryList) {
    if (subcategory.completedAt == null) {
      continue
    }

    const parentChore = choreMap[subcategory.choreRowId]
    if (!parentChore) {
      continue
    }

    const intervalDays = getFrequencyIntervalDays(freqMap[parentChore.freqId])

    if (isSubcategoryDue(subcategory.completedAt, intervalDays, now)) {
      updates.push(
        setDoc(
          doc(db, 'RobeySubCategory', String(subcategory.rowId)),
          { completedAt: null },
          { merge: true },
        ),
      )
      subcategory.completedAt = null
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  return updates.length
}

export function getRobeyRowIdFromWhoList(whoList) {
  return whoList.find((person) => person.name === 'Robey')?.rowId ?? null
}

export async function syncRobeySubcategoryAssignment({
  choreInfo,
  robeySubcategoryList,
  whoList,
}) {
  const robeyRowId = getRobeyRowIdFromWhoList(whoList)
  if (robeyRowId == null) {
    return 0
  }

  const robeyChoreIds = new Set(
    choreInfo
      .filter((item) => item.who === robeyRowId)
      .map((item) => item.choreRowId),
  )

  const updates = []

  robeySubcategoryList.forEach((subcategory) => {
    if (subcategory.whoRowId !== robeyRowId) {
      return
    }

    const shouldBeActive = robeyChoreIds.has(subcategory.choreRowId) ? 1 : 0
    const currentActive = subcategory.active === 0 ? 0 : 1

    if (shouldBeActive === currentActive) {
      return
    }

    updates.push(
      setDoc(
        doc(db, 'RobeySubCategory', String(subcategory.rowId)),
        { active: shouldBeActive },
        { merge: true },
      ),
    )
    subcategory.active = shouldBeActive
  })

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  return updates.length
}
