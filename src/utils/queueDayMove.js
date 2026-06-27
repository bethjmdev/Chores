import { doc, deleteDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const dayMs = 24 * 60 * 60 * 1000

export function getWeekdayInWindow(dayOfWeek, todayStart, maxDayIndex) {
  for (let dayIndex = 0; dayIndex <= maxDayIndex; dayIndex += 1) {
    const candidateStart = todayStart + dayIndex * dayMs
    if (new Date(candidateStart).getDay() === dayOfWeek) {
      return dayIndex
    }
  }

  return null
}

function getDayStartForDayIndex(dayIndex, viewStart) {
  return viewStart + dayIndex * dayMs
}

function getDayIndexForStart(dayStart, viewStart, maxDayIndex) {
  const dayIndex = Math.round((dayStart - viewStart) / dayMs)
  if (dayIndex < 0 || dayIndex > maxDayIndex) {
    return null
  }

  return dayIndex
}

function getMoveTargetDayIndex(move, viewStart, maxDayIndex) {
  if (move.toDayStart != null) {
    return getDayIndexForStart(Number(move.toDayStart), viewStart, maxDayIndex)
  }

  if (move.toDayOfWeek != null) {
    return getWeekdayInWindow(move.toDayOfWeek, viewStart, maxDayIndex)
  }

  return null
}

function matchesMoveRecord(move, whoRowId, choreRowId, subcategoryRowId, fromDayStart, fromDayOfWeek) {
  if (
    move.whoRowId !== whoRowId ||
    move.choreRowId !== choreRowId ||
    (move.subcategoryRowId ?? null) !== (subcategoryRowId ?? null)
  ) {
    return false
  }

  if (fromDayStart != null && move.fromDayStart != null) {
    return Number(move.fromDayStart) === fromDayStart
  }

  return move.fromDayOfWeek === fromDayOfWeek
}

export function resolveQueueMoveFromDayStart(item, existingMoves, viewStart, maxDayIndex) {
  const displayDayStart = getDayStartForDayIndex(item.dayIndex, viewStart)

  const dateMatch = existingMoves.find((move) => (
    move.toDayStart != null && Number(move.toDayStart) === displayDayStart
  ))
  if (dateMatch?.fromDayStart != null) {
    return Number(dateMatch.fromDayStart)
  }

  const legacyMatch = existingMoves.find((move) => {
    if (move.toDayOfWeek == null) {
      return false
    }

    const targetIndex = getWeekdayInWindow(move.toDayOfWeek, viewStart, maxDayIndex)
    return targetIndex === item.dayIndex
  })

  if (legacyMatch?.fromDayStart != null) {
    return Number(legacyMatch.fromDayStart)
  }

  if (legacyMatch?.fromDayOfWeek != null) {
    const fromIndex = getWeekdayInWindow(legacyMatch.fromDayOfWeek, viewStart, maxDayIndex)
    if (fromIndex != null) {
      return getDayStartForDayIndex(fromIndex, viewStart)
    }
  }

  return displayDayStart
}

export function getQueueDayMovesForItem(queueDayMoveList, whoRowId, choreRowId, subcategoryRowId) {
  return queueDayMoveList.filter((move) => {
    if (move.whoRowId !== whoRowId || move.choreRowId !== choreRowId) {
      return false
    }

    if (subcategoryRowId == null) {
      return move.subcategoryRowId == null
    }

    return move.subcategoryRowId === subcategoryRowId
  })
}

export function applyQueueDayMoves(dayIndexes, viewStart, moves, maxDayIndex) {
  if (!moves.length) {
    return dayIndexes
  }

  const dateMoveMap = new Map()
  const dowMoveMap = new Map()

  moves.forEach((move) => {
    if (move.fromDayStart != null) {
      dateMoveMap.set(Number(move.fromDayStart), move)
      return
    }

    if (move.fromDayOfWeek != null && !dowMoveMap.has(move.fromDayOfWeek)) {
      dowMoveMap.set(move.fromDayOfWeek, move)
    }
  })

  const result = new Set()

  dayIndexes.forEach((dayIndex) => {
    const dayStart = getDayStartForDayIndex(dayIndex, viewStart)
    const dayOfWeek = new Date(dayStart).getDay()

    if (dateMoveMap.has(dayStart)) {
      const targetIndex = getMoveTargetDayIndex(dateMoveMap.get(dayStart), viewStart, maxDayIndex)
      if (targetIndex != null) {
        result.add(targetIndex)
      }
      return
    }

    if (dowMoveMap.has(dayOfWeek)) {
      const targetIndex = getMoveTargetDayIndex(dowMoveMap.get(dayOfWeek), viewStart, maxDayIndex)
      if (targetIndex != null) {
        result.add(targetIndex)
      }
      return
    }

    result.add(dayIndex)
  })

  return [...result].sort((a, b) => a - b)
}

export async function saveQueueDayMoveRecord({
  whoRowId,
  choreRowId,
  subcategoryRowId,
  fromDayStart,
  toDayStart,
  fromDayOfWeek = null,
  toDayOfWeek = null,
  queueDayMoveList,
}) {
  const existing = queueDayMoveList.find((move) => (
    matchesMoveRecord(
      move,
      whoRowId,
      choreRowId,
      subcategoryRowId,
      fromDayStart,
      fromDayOfWeek,
    )
  ))

  if (existing) {
    await setDoc(
      doc(db, 'Queue_Day_Move', String(existing.rowId)),
      {
        fromDayStart,
        toDayStart,
        fromDayOfWeek,
        toDayOfWeek,
      },
      { merge: true },
    )
    existing.fromDayStart = fromDayStart
    existing.toDayStart = toDayStart
    existing.fromDayOfWeek = fromDayOfWeek
    existing.toDayOfWeek = toDayOfWeek
    return
  }

  const maxRowId = queueDayMoveList.reduce(
    (max, move) => Math.max(max, move.rowId || 0),
    0,
  )
  const newRowId = maxRowId + 1

  const record = {
    rowId: newRowId,
    whoRowId,
    choreRowId,
    subcategoryRowId: subcategoryRowId ?? null,
    fromDayStart,
    toDayStart,
    fromDayOfWeek,
    toDayOfWeek,
  }

  await setDoc(doc(db, 'Queue_Day_Move', String(newRowId)), record)
  queueDayMoveList.push(record)
}

export async function clearQueueDayMovesForChore(queueDayMoveList, choreRowId, whoRowId = null) {
  const matches = queueDayMoveList.filter((move) => {
    if (move.choreRowId !== choreRowId) {
      return false
    }

    if (whoRowId == null) {
      return true
    }

    return move.whoRowId === whoRowId
  })

  if (!matches.length) {
    return 0
  }

  await Promise.all(
    matches.map((move) => deleteDoc(doc(db, 'Queue_Day_Move', String(move.rowId)))),
  )

  matches.forEach((move) => {
    const index = queueDayMoveList.indexOf(move)
    if (index >= 0) {
      queueDayMoveList.splice(index, 1)
    }
  })

  return matches.length
}

export async function clearQueueDayMoveRecord({
  whoRowId,
  choreRowId,
  subcategoryRowId,
  fromDayStart = null,
  fromDayOfWeek = null,
  queueDayMoveList,
}) {
  const existing = queueDayMoveList.find((move) => (
    matchesMoveRecord(
      move,
      whoRowId,
      choreRowId,
      subcategoryRowId,
      fromDayStart,
      fromDayOfWeek,
    )
  ))

  if (!existing) {
    return
  }

  await deleteDoc(doc(db, 'Queue_Day_Move', String(existing.rowId)))
  const index = queueDayMoveList.indexOf(existing)
  if (index >= 0) {
    queueDayMoveList.splice(index, 1)
  }
}
