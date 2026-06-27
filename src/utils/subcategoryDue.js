import { doc, deleteDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { ensureFrequencyQueueConfig, getFrequencyIntervalDays } from './frequencyQueue'
import { clearQueueDayMovesForChore } from './queueDayMove'
import { transferChoreScheduleOnReassign } from './robeyQueueSchedule'

const dayMs = 24 * 60 * 60 * 1000

export function getAssignedChoreRowId(assignment) {
  if (assignment.choreRowId != null && assignment.choreRowId !== '') {
    return Number(assignment.choreRowId)
  }

  if (assignment.choreRowid != null && assignment.choreRowid !== '') {
    return Number(assignment.choreRowid)
  }

  return Number(assignment.id)
}

export function getAssignedWhoRowId(assignment) {
  if (assignment.who === null) {
    return null
  }

  if (assignment.who != null && assignment.who !== '') {
    return Number(assignment.who)
  }

  if (assignment.whoRowid != null && assignment.whoRowid !== '') {
    return Number(assignment.whoRowid)
  }

  return null
}

export async function saveChoreAssignmentRecord(choreRowId, whoRowId) {
  const ref = doc(db, 'Assigned_To', String(choreRowId))

  if (whoRowId == null) {
    await deleteDoc(ref).catch(() => {})
    return
  }

  await setDoc(ref, { choreRowId, who: whoRowId }, { merge: true })
}

export async function applyChoreDeletion({
  choreRowId,
  whenCompletedList,
  queueDayMoveList,
}) {
  await clearQueueDayMovesForChore(queueDayMoveList, choreRowId)

  const completionMatches = whenCompletedList.filter((entry) => {
    const entryChore = entry.chore ?? entry.choreRowid
    return Number(entryChore) === Number(choreRowId)
  })

  if (completionMatches.length > 0) {
    await Promise.all(
      completionMatches.map((entry) => (
        deleteDoc(doc(db, 'When_Completed', String(entry.rowId ?? entry.id)))
      )),
    )

    completionMatches.forEach((entry) => {
      const index = whenCompletedList.indexOf(entry)
      if (index >= 0) {
        whenCompletedList.splice(index, 1)
      }
    })
  }
}

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

export async function applyChoreAssignmentChange({
  choreRowId,
  previousWhoRowId,
  newWhoRowId,
  choreInfo,
  choresList,
  whenCompletedList,
  queueDayMoveList,
  robeySubcategoryList,
  whoList,
}) {
  if (previousWhoRowId != null) {
    await clearQueueDayMovesForChore(queueDayMoveList, choreRowId, previousWhoRowId)
  }

  if (newWhoRowId != null && newWhoRowId !== previousWhoRowId) {
    await clearQueueDayMovesForChore(queueDayMoveList, choreRowId, newWhoRowId)
  }

  const robeyRowId = getRobeyRowIdFromWhoList(whoList)

  if (previousWhoRowId != null && newWhoRowId != null) {
    await transferChoreScheduleOnReassign({
      choreRowId,
      fromPersonRowId: previousWhoRowId,
      toPersonRowId: newWhoRowId,
      whenCompletedList,
      choresList,
      robeySubcategoryList,
      robeyRowId,
    })
  }

  const nextChoreInfo = choreInfo.map((item) => (
    item.choreRowId === choreRowId
      ? { ...item, who: newWhoRowId }
      : item
  ))

  await syncRobeySubcategoryAssignment({
    choreInfo: nextChoreInfo,
    robeySubcategoryList,
    whoList,
  })
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
