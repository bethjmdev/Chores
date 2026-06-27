import { doc, setDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { getQueueDayIndexes, getFreqFromMap, getFrequencyQueueConfig, getCatchUpDetails, isAsNeededFrequency, isDueInQueueWindow, normalizeQueueWeekdays } from './frequencyQueue'
import { getTimeOfDaySort, getPreferredTimeOfDayIcon, getPreferredTimeOfDayLabel } from './preferredTimeOfDay'
import {
  applyQueueDayMoves,
  clearQueueDayMoveRecord,
  getQueueDayMovesForItem,
  resolveQueueMoveFromDayStart,
  saveQueueDayMoveRecord,
} from './queueDayMove'

const dayMs = 24 * 60 * 60 * 1000

export const MAX_QUEUE_DAYS = 10
export const BETH_QUEUE_DAYS = 10

export function getBethQueueViewStart(weekOffset = 0, now = Date.now()) {
  return getStartOfToday(now) + weekOffset * BETH_QUEUE_DAYS * dayMs
}

export function getQueueViewStart(weekOffset = 0, now = Date.now()) {
  return getStartOfToday(now) + weekOffset * MAX_QUEUE_DAYS * dayMs
}

export function formatQueueWeekNavLabel(weekOffset = 0, now = Date.now()) {
  if (weekOffset === 0) {
    return 'Starting today'
  }

  const viewStart = getQueueViewStart(weekOffset, now)
  const viewEnd = viewStart + (MAX_QUEUE_DAYS - 1) * dayMs
  const startLabel = new Date(viewStart).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = new Date(viewEnd).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  return `${startLabel} – ${endLabel}`
}

export function formatBethQueueWeekNavLabel(weekOffset = 0, now = Date.now()) {
  if (weekOffset === 0) {
    return 'Starting today'
  }

  const viewStart = getBethQueueViewStart(weekOffset, now)
  const viewEnd = viewStart + (BETH_QUEUE_DAYS - 1) * dayMs
  const startLabel = new Date(viewStart).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = new Date(viewEnd).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })

  return `${startLabel} – ${endLabel}`
}

export function getStartOfToday(now = Date.now()) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function formatQueueDateInputValue(queueDueAt) {
  if (queueDueAt == null) {
    return ''
  }

  const date = new Date(queueDueAt)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function parseQueueDateInputValue(dateValue) {
  if (!dateValue) {
    return null
  }

  const parsed = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return getStartOfToday(parsed.getTime())
}

export function getRobeyRowId(whoList) {
  return whoList.find((person) => person.name === 'Robey')?.rowId ?? null
}

export function getBethRowId(whoList) {
  return whoList.find((person) => person.name === 'Beth')?.rowId ?? null
}

function getCompletionWhoRowId(entry) {
  return entry.who ?? entry.whoRowid ?? null
}

function getCompletionChoreRowId(entry) {
  return entry.chore ?? entry.choreRowid ?? null
}

function matchesPersonChore(entry, personRowId, choreRowId) {
  const entryWho = getCompletionWhoRowId(entry)
  const entryChore = getCompletionChoreRowId(entry)
  if (entryWho == null || entryChore == null || personRowId == null || choreRowId == null) {
    return false
  }

  return Number(entryWho) === Number(personRowId)
    && Number(entryChore) === Number(choreRowId)
}

function entryHasScheduleData(entry) {
  return entry.queueWeekdays != null
    || entry.dueDayOfWeek != null
    || entry.preferredTimeOfDay != null
    || entry.queueDueAt != null
}

export function buildCompletionMap(whenCompletedList, personRowId) {
  const map = new Map()

  if (personRowId == null) {
    return map
  }

  whenCompletedList.forEach((entry) => {
    const entryChore = getCompletionChoreRowId(entry)
    if (!matchesPersonChore(entry, personRowId, entryChore)) {
      return
    }

    const choreRowId = Number(entryChore)
    const existing = map.get(choreRowId)

    if (!existing) {
      map.set(choreRowId, { ...entry })
      return
    }

    const merged = { ...existing }

    if (normalizeQueueWeekdays(entry.queueWeekdays)) {
      merged.queueWeekdays = entry.queueWeekdays
    }

    if (entry.dueDayOfWeek != null && entry.dueDayOfWeek !== '') {
      merged.dueDayOfWeek = entry.dueDayOfWeek
    }

    if (entry.preferredTimeOfDay != null && entry.preferredTimeOfDay !== '') {
      merged.preferredTimeOfDay = entry.preferredTimeOfDay
    }

    if (entry.queueDueAt != null) {
      merged.queueDueAt = entry.queueDueAt
    }

    if (entry.timestamp != null) {
      merged.timestamp = entry.timestamp
    }

    if (entry.isCompleted != null) {
      merged.isCompleted = entry.isCompleted
    }

    if (entry.completedAt != null) {
      merged.completedAt = entry.completedAt
    }

    const entryHasSchedule = entryHasScheduleData(entry)
    const existingHasSchedule = entryHasScheduleData(existing)

    if (entryHasSchedule && !existingHasSchedule) {
      merged.rowId = entry.rowId
      merged.id = entry.id
    } else if (!entryHasSchedule && existingHasSchedule) {
      // keep existing doc id
    } else if ((entry.rowId || 0) >= (existing.rowId || 0)) {
      merged.rowId = entry.rowId
      merged.id = entry.id
    }

    map.set(choreRowId, merged)
  })

  return map
}

function findPersonChoreCompletionMatches(whenCompletedList, personRowId, choreRowId) {
  return whenCompletedList.filter((entry) => matchesPersonChore(entry, personRowId, choreRowId))
}

function findPersonChoreCompletionDoc(whenCompletedList, personRowId, choreRowId, { preferSchedule = false } = {}) {
  const matches = findPersonChoreCompletionMatches(whenCompletedList, personRowId, choreRowId)
  if (matches.length === 0) {
    return null
  }

  if (preferSchedule) {
    const withWeekdays = matches.filter((entry) => normalizeQueueWeekdays(entry.queueWeekdays)?.length)
    if (withWeekdays.length > 0) {
      return withWeekdays.reduce((latest, entry) => (
        (entry.rowId || 0) >= (latest.rowId || 0) ? entry : latest
      ))
    }

    const withSchedule = matches.filter((entry) => entryHasScheduleData(entry))
    if (withSchedule.length > 0) {
      return withSchedule.reduce((latest, entry) => (
        (entry.rowId || 0) >= (latest.rowId || 0) ? entry : latest
      ))
    }
  }

  return matches.reduce((latest, entry) => (
    (entry.rowId || 0) >= (latest.rowId || 0) ? entry : latest
  ))
}

function findPersonChoreCompletion(whenCompletedList, personRowId, choreRowId) {
  return findPersonChoreCompletionDoc(whenCompletedList, personRowId, choreRowId, { preferSchedule: true })
}

async function loadWhenCompletedList() {
  const snapshot = await getDocs(collection(db, 'When_Completed'))
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }))
}

export function getQueueDueAtForDayIndex(dayIndex, viewStart = null, now = Date.now()) {
  const base = viewStart ?? getStartOfToday(now)
  return base + dayIndex * dayMs
}

function formatDayLabel(dayIndex, viewStart, useRelativeLabels = true) {
  if (useRelativeLabels) {
    if (dayIndex === 0) {
      return 'Today'
    }

    if (dayIndex === 1) {
      return 'Tomorrow'
    }
  }

  const date = new Date(viewStart + dayIndex * dayMs)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatBethDayLabel(dayIndex, viewStart, useRelativeLabels = true) {
  const dayStart = viewStart + dayIndex * dayMs

  if (useRelativeLabels) {
    const todayStart = getStartOfToday()
    if (dayStart === todayStart) {
      return 'Today'
    }

    if (dayStart === todayStart + dayMs) {
      return 'Tomorrow'
    }
  }

  return new Date(dayStart).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function getQueueWeekdayOptions() {
  const sunday = new Date(2024, 0, 7)

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const date = new Date(sunday)
    date.setDate(sunday.getDate() + dayOfWeek)

    return {
      value: dayOfWeek,
      label: date.toLocaleDateString(undefined, { weekday: 'long' }),
    }
  })
}

export function getBethQueueWeekdayOptions() {
  const monday = new Date(2024, 0, 8)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)

    return {
      value: date.getDay(),
      label: date.toLocaleDateString(undefined, { weekday: 'long' }),
    }
  })
}

function getQueueWeekdayLabel(dayOfWeek) {
  if (dayOfWeek == null) {
    return null
  }

  return getQueueWeekdayOptions().find((option) => option.value === dayOfWeek)?.label ?? null
}

function getQueueDayLabelForFrequency(freq, scheduleInfo = {}) {
  const { dueDayOfWeek, queueWeekdays, queueDueAt, fallbackDayOfWeek = null } = scheduleInfo
  const pattern = getFrequencyQueueConfig(freq).queuePattern
  if (pattern === 'daily') {
    if (queueDueAt == null) {
      return 'Daily'
    }

    return new Date(queueDueAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

  const customWeekdays = normalizeQueueWeekdays(queueWeekdays)
  if (customWeekdays?.length) {
    return customWeekdays
      .map((dayOfWeek) => getQueueWeekdayLabel(dayOfWeek))
      .filter(Boolean)
      .join(', ')
  }

  if (pattern === 'weekdays' || pattern === 'perWeek') {
    return null
  }

  return getQueueWeekdayLabel(dueDayOfWeek ?? fallbackDayOfWeek)
}

function isSubcategoryUnscheduled(subcategory) {
  return (
    subcategory.dueDayOfWeek == null &&
    normalizeQueueWeekdays(subcategory.queueWeekdays) == null &&
    subcategory.queueDueAt == null &&
    subcategory.completedAt == null
  )
}

function buildSubcategoryGroupAnchors(robeySubcategories, completionMap, todayStart) {
  const anchors = new Map()
  const subsByChore = new Map()

  robeySubcategories.forEach((subcategory) => {
    if (!subsByChore.has(subcategory.choreRowId)) {
      subsByChore.set(subcategory.choreRowId, [])
    }

    subsByChore.get(subcategory.choreRowId).push(subcategory)
  })

  subsByChore.forEach((subcategories, choreRowId) => {
    const hasUnscheduled = subcategories.some(isSubcategoryUnscheduled)
    if (!hasUnscheduled) {
      return
    }

    const parentCompletion = completionMap.get(choreRowId)
    const anchorDayOfWeek = parentCompletion?.dueDayOfWeek ?? new Date(todayStart).getDay()
    anchors.set(choreRowId, anchorDayOfWeek)
  })

  return anchors
}

function getSubcategoryScheduleArgs(subcategory, groupAnchors) {
  if (!isSubcategoryUnscheduled(subcategory)) {
    return {
      dueDayOfWeek: subcategory.dueDayOfWeek,
      queueWeekdays: subcategory.queueWeekdays,
      sort: subcategory.sort,
      rowId: subcategory.rowId,
      queueDueAt: subcategory.queueDueAt,
      groupAnchorDayOfWeek: null,
    }
  }

  const groupAnchorDayOfWeek = groupAnchors.get(subcategory.choreRowId) ?? null

  return {
    dueDayOfWeek: null,
    queueWeekdays: null,
    sort: 1,
    rowId: subcategory.rowId,
    queueDueAt: null,
    groupAnchorDayOfWeek,
  }
}

function compareQueueItemsByTimeOfDay(a, b) {
  if (a.timeOfDaySort !== b.timeOfDaySort) {
    return a.timeOfDaySort - b.timeOfDaySort
  }

  if (a.frequencySort !== b.frequencySort) {
    return a.frequencySort - b.frequencySort
  }

  const parentA = a.parentChore || a.label
  const parentB = b.parentChore || b.label
  if (parentA !== parentB) {
    return parentA.localeCompare(parentB)
  }

  return a.label.localeCompare(b.label)
}

function buildQueueItem({
  baseKey,
  type,
  dayIndex,
  label,
  parentChore,
  frequency,
  frequencySort,
  choreRowId,
  subcategoryRowId,
  queueDayLabel,
  preferredTimeOfDay,
  timeOfDaySort,
  timeOfDayIcon,
  timeOfDayLabel,
}) {
  return {
    key: `${baseKey}-d${dayIndex}`,
    type,
    dayIndex,
    label,
    parentChore,
    frequency,
    frequencySort,
    choreRowId,
    subcategoryRowId,
    queueDayLabel,
    preferredTimeOfDay,
    timeOfDaySort,
    timeOfDayIcon,
    timeOfDayLabel,
  }
}

export async function saveQueueCompletion({
  item,
  personRowId,
  whenCompletedList,
  choresList,
  isComplete,
}) {
  const completedAt = isComplete ? Date.now() : null

  if (item.type === 'subcategory') {
    const completionPatch = {
      completedAt,
      ...(isComplete ? { queueDueAt: null } : {}),
    }

    if (isComplete) {
      if (item.dayIndex != null) {
        completionPatch.dueDayOfWeek = new Date(getQueueDueAtForDayIndex(item.dayIndex)).getDay()
      } else if (item.missedDayStart != null) {
        completionPatch.dueDayOfWeek = new Date(item.missedDayStart).getDay()
      }
    }

    await setDoc(
      doc(db, 'RobeySubCategory', String(item.subcategoryRowId)),
      completionPatch,
      { merge: true },
    )
    return
  }

  const completion = findPersonChoreCompletionDoc(
    whenCompletedList,
    personRowId,
    item.choreRowId,
    { preferSchedule: true },
  )

  if (completion) {
    const docId = String(completion.rowId ?? completion.id)
    await setDoc(
      doc(db, 'When_Completed', docId),
      {
        timestamp: completedAt,
        isCompleted: isComplete ? 1 : null,
        ...(isComplete ? { queueDueAt: null } : {}),
      },
      { merge: true },
    )
    return
  }

  if (!isComplete) {
    return
  }

  const chore = choresList.find((entry) => entry.rowId === item.choreRowId)
  const maxRowId = whenCompletedList.reduce(
    (max, entry) => Math.max(max, entry.rowId || 0),
    0,
  )
  const newRowId = maxRowId + 1

  await setDoc(doc(db, 'When_Completed', String(newRowId)), {
    rowId: newRowId,
    whoRowid: personRowId,
    choreRowid: item.choreRowId,
    freqRowid: chore?.freqId ?? null,
    timestamp: completedAt,
    isCompleted: 1,
    queueDueAt: null,
  })
}

export async function transferChoreScheduleOnReassign({
  choreRowId,
  fromPersonRowId,
  toPersonRowId,
  whenCompletedList,
  choresList,
  robeySubcategoryList = [],
  robeyRowId = null,
}) {
  if (fromPersonRowId == null || toPersonRowId == null || fromPersonRowId === toPersonRowId) {
    return
  }

  const chore = choresList.find((entry) => entry.rowId === choreRowId)
  if (!chore) {
    return
  }

  const target = findPersonChoreCompletion(whenCompletedList, toPersonRowId, choreRowId)
  if (target && entryHasScheduleData(target)) {
    return
  }

  const hasRobeySubcategories = robeyRowId != null && robeySubcategoryList.some(
    (entry) => entry.choreRowId === choreRowId && entry.whoRowId === robeyRowId,
  )

  if (toPersonRowId === robeyRowId && hasRobeySubcategories) {
    return
  }

  let patch = null

  if (fromPersonRowId === robeyRowId && hasRobeySubcategories) {
    const subcategory = robeySubcategoryList.find(
      (entry) => entry.choreRowId === choreRowId && entry.whoRowId === robeyRowId,
    )

    if (subcategory) {
      patch = {
        dueDayOfWeek: subcategory.dueDayOfWeek ?? null,
        queueWeekdays: subcategory.queueWeekdays ?? null,
        preferredTimeOfDay: subcategory.preferredTimeOfDay ?? null,
        queueDueAt: subcategory.queueDueAt ?? null,
      }
    }
  } else {
    const source = findPersonChoreCompletion(whenCompletedList, fromPersonRowId, choreRowId)

    if (source && entryHasScheduleData(source)) {
      patch = {
        dueDayOfWeek: source.dueDayOfWeek ?? null,
        queueWeekdays: source.queueWeekdays ?? null,
        preferredTimeOfDay: source.preferredTimeOfDay ?? null,
        queueDueAt: source.queueDueAt ?? null,
      }
    }
  }

  if (!patch || !Object.values(patch).some((value) => value != null)) {
    return
  }

  await savePersonChoreSchedule({
    chore: {
      choreRowId,
      freqId: chore.freqId,
      chore: chore.chore,
    },
    personRowId: toPersonRowId,
    whenCompletedList,
    choresList,
    patch,
  })
}

export async function savePersonChoreSchedule({
  chore,
  personRowId,
  whenCompletedList,
  choresList,
  patch,
}) {
  const nextPatch = {}

  if (patch.preferredTimeOfDay !== undefined) {
    nextPatch.preferredTimeOfDay = patch.preferredTimeOfDay
  }

  if (patch.dueDayOfWeek !== undefined) {
    nextPatch.dueDayOfWeek = patch.dueDayOfWeek
    if (patch.dueDayOfWeek != null) {
      nextPatch.queueWeekdays = null
    }
  }

  if (patch.queueWeekdays !== undefined) {
    nextPatch.queueWeekdays = patch.queueWeekdays
    if (patch.queueWeekdays != null) {
      nextPatch.dueDayOfWeek = null
    }
  }

  if (patch.queueDueAt !== undefined) {
    nextPatch.queueDueAt = patch.queueDueAt
  }

  if (Object.keys(nextPatch).length === 0) {
    return
  }

  let completion = findPersonChoreCompletion(whenCompletedList, personRowId, chore.choreRowId)

  if (completion) {
    await setDoc(
      doc(db, 'When_Completed', String(completion.rowId ?? completion.id)),
      nextPatch,
      { merge: true },
    )
    return
  }

  const freshWhenCompletedList = await loadWhenCompletedList()
  completion = findPersonChoreCompletion(freshWhenCompletedList, personRowId, chore.choreRowId)

  if (completion) {
    await setDoc(
      doc(db, 'When_Completed', String(completion.rowId ?? completion.id)),
      nextPatch,
      { merge: true },
    )
    return
  }

  const hasSchedule = nextPatch.preferredTimeOfDay != null
    || nextPatch.dueDayOfWeek != null
    || nextPatch.queueWeekdays != null
    || nextPatch.queueDueAt != null
  if (!hasSchedule) {
    return
  }

  const choreRow = choresList.find((entry) => entry.rowId === chore.choreRowId)
  const maxRowId = freshWhenCompletedList.reduce(
    (max, entry) => Math.max(max, entry.rowId || 0),
    0,
  )
  const newRowId = maxRowId + 1

  await setDoc(doc(db, 'When_Completed', String(newRowId)), {
    rowId: newRowId,
    whoRowid: personRowId,
    choreRowid: chore.choreRowId,
    freqRowid: choreRow?.freqId ?? chore.freqId ?? null,
    preferredTimeOfDay: nextPatch.preferredTimeOfDay ?? null,
    dueDayOfWeek: nextPatch.dueDayOfWeek ?? null,
    queueWeekdays: nextPatch.queueWeekdays ?? null,
    queueDueAt: nextPatch.queueDueAt ?? null,
    isCompleted: null,
    timestamp: null,
  })
}

export async function saveQueueDayMove({
  item,
  dayIndex,
  personRowId,
  whenCompletedList,
  choresList,
  frequencyOfList,
  queueDayMoveList = [],
  viewStart = null,
  maxDayIndex = MAX_QUEUE_DAYS - 1,
}) {
  if (item.dayIndex == null || viewStart == null) {
    return
  }

  const toDayStart = getQueueDueAtForDayIndex(dayIndex, viewStart)
  const toDayOfWeek = new Date(toDayStart).getDay()
  const existingMoves = getQueueDayMovesForItem(
    queueDayMoveList,
    personRowId,
    item.choreRowId,
    item.subcategoryRowId ?? null,
  )
  const fromDayStart = resolveQueueMoveFromDayStart(
    item,
    existingMoves,
    viewStart,
    maxDayIndex,
  )
  const fromDayOfWeek = new Date(fromDayStart).getDay()

  if (fromDayStart === toDayStart) {
    if (existingMoves.length > 0) {
      await clearQueueDayMoveRecord({
        whoRowId: personRowId,
        choreRowId: item.choreRowId,
        subcategoryRowId: item.subcategoryRowId ?? null,
        fromDayStart,
        fromDayOfWeek,
        queueDayMoveList,
      })
    }
    return
  }

  await saveQueueDayMoveRecord({
    whoRowId: personRowId,
    choreRowId: item.choreRowId,
    subcategoryRowId: item.subcategoryRowId ?? null,
    fromDayStart,
    toDayStart,
    fromDayOfWeek,
    toDayOfWeek,
    queueDayMoveList,
  })
}

export function buildRobeyQueueSchedule({
  whoList,
  choreInfo,
  choresList,
  robeySubcategoryList,
  whenCompletedList,
  frequencyOfList,
  timeOfDayList = [],
  queueDayMoveList = [],
  weekOffset = 0,
  now = Date.now(),
}) {
  const robeyRowId = getRobeyRowId(whoList)
  if (robeyRowId == null) {
    return { robeyRowId: null, days: [], asNeededItems: [], catchUpItems: [], weekOffset, viewStart: null }
  }

  const viewStart = getQueueViewStart(weekOffset, now)
  const useRelativeLabels = weekOffset === 0
  const maxDayIndex = MAX_QUEUE_DAYS - 1
  const freqMap = Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq]))
  const activeChoreIds = new Set(
    choresList.filter((chore) => chore.active !== 0).map((chore) => chore.rowId),
  )

  const robeyChores = choreInfo.filter(
    (item) => item.who === robeyRowId && activeChoreIds.has(item.choreRowId),
  )
  const choreMap = Object.fromEntries(robeyChores.map((item) => [item.choreRowId, item]))

  const robeySubcategories = robeySubcategoryList.filter(
    (item) => item.whoRowId === robeyRowId && item.active !== 0,
  )

  const choresWithSubcategories = new Set(
    robeySubcategories.map((item) => item.choreRowId),
  )

  const completionMap = buildCompletionMap(whenCompletedList, robeyRowId)

  const subcategoryGroupAnchors = buildSubcategoryGroupAnchors(
    robeySubcategories,
    completionMap,
    viewStart,
  )

  const queueItems = []
  const asNeededItems = []
  const catchUpItems = []

  function addCatchUpItem(baseKey, baseItem, catchUpDetails) {
    if (!catchUpDetails) {
      return
    }

    catchUpItems.push({
      ...baseItem,
      key: `${baseKey}-catchUp`,
      missedDayLabel: catchUpDetails.missedDayLabel,
      missedDayStart: catchUpDetails.missedDayStart,
      daysAgo: catchUpDetails.daysAgo,
    })
  }

  robeySubcategories.forEach((subcategory) => {
    const parentChore = choreMap[subcategory.choreRowId]
    if (!parentChore) {
      return
    }

    const freq = getFreqFromMap(freqMap, parentChore.freqId)
    const scheduleArgs = getSubcategoryScheduleArgs(subcategory, subcategoryGroupAnchors)
    const baseItem = {
      type: 'subcategory',
      label: subcategory.label,
      parentChore: parentChore.chore,
      frequency: parentChore.frequency,
      frequencySort: parentChore.frequencySort ?? 999,
      choreRowId: parentChore.choreRowId,
      subcategoryRowId: subcategory.rowId,
      queueDayLabel: getQueueDayLabelForFrequency(freq, {
        dueDayOfWeek: scheduleArgs.dueDayOfWeek,
        queueWeekdays: scheduleArgs.queueWeekdays,
        queueDueAt: scheduleArgs.queueDueAt,
        fallbackDayOfWeek: scheduleArgs.groupAnchorDayOfWeek,
      }),
      preferredTimeOfDay: subcategory.preferredTimeOfDay ?? null,
      timeOfDaySort: getTimeOfDaySort(subcategory.preferredTimeOfDay, timeOfDayList),
      timeOfDayIcon: getPreferredTimeOfDayIcon(subcategory.preferredTimeOfDay, timeOfDayList),
      timeOfDayLabel: getPreferredTimeOfDayLabel(subcategory.preferredTimeOfDay, timeOfDayList),
    }

    if (isAsNeededFrequency(freq)) {
      if (weekOffset !== 0) {
        return
      }

      const intervalDays = getFrequencyQueueConfig(freq).intervalDays
      if (!isDueInQueueWindow(subcategory.completedAt, intervalDays, viewStart)) {
        return
      }

      asNeededItems.push({
        ...baseItem,
        key: `sub-${subcategory.rowId}-asNeeded`,
        completedAt: subcategory.completedAt,
      })
      return
    }

    const rawDayIndexes = getQueueDayIndexes({
      freq,
      completedAt: subcategory.completedAt,
      queueDueAt: scheduleArgs.queueDueAt,
      dueDayOfWeek: scheduleArgs.dueDayOfWeek,
      queueWeekdays: scheduleArgs.queueWeekdays,
      sort: scheduleArgs.sort,
      rowId: scheduleArgs.rowId,
      todayStart: viewStart,
      groupAnchorDayOfWeek: scheduleArgs.groupAnchorDayOfWeek,
      maxDayIndex,
    })
    const moves = getQueueDayMovesForItem(
      queueDayMoveList,
      robeyRowId,
      parentChore.choreRowId,
      subcategory.rowId,
    )
    const dayIndexes = applyQueueDayMoves(rawDayIndexes, viewStart, moves, maxDayIndex)

    if (weekOffset === 0) {
      addCatchUpItem(`sub-${subcategory.rowId}`, baseItem, getCatchUpDetails({
        freq,
        completedAt: subcategory.completedAt,
        queueDueAt: scheduleArgs.queueDueAt,
        dueDayOfWeek: scheduleArgs.dueDayOfWeek,
        queueWeekdays: scheduleArgs.queueWeekdays,
        sort: scheduleArgs.sort,
        rowId: scheduleArgs.rowId,
        todayStart: viewStart,
        groupAnchorDayOfWeek: scheduleArgs.groupAnchorDayOfWeek,
        maxDayIndex,
      }))
    }

    dayIndexes.forEach((dayIndex) => {
      queueItems.push(
        buildQueueItem({
          baseKey: `sub-${subcategory.rowId}`,
          ...baseItem,
          dayIndex,
        }),
      )
    })
  })

  robeyChores.forEach((chore) => {
    if (choresWithSubcategories.has(chore.choreRowId)) {
      return
    }

    const completion = completionMap.get(chore.choreRowId)
    const freq = getFreqFromMap(freqMap, chore.freqId)
    const baseItem = {
      type: 'chore',
      label: chore.chore,
      parentChore: null,
      frequency: chore.frequency,
      frequencySort: chore.frequencySort ?? 999,
      choreRowId: chore.choreRowId,
      subcategoryRowId: null,
      queueDayLabel: getQueueDayLabelForFrequency(freq, {
        dueDayOfWeek: completion?.dueDayOfWeek,
        queueWeekdays: completion?.queueWeekdays,
        queueDueAt: completion?.queueDueAt,
      }),
      preferredTimeOfDay: completion?.preferredTimeOfDay ?? null,
      timeOfDaySort: getTimeOfDaySort(completion?.preferredTimeOfDay, timeOfDayList),
      timeOfDayIcon: getPreferredTimeOfDayIcon(completion?.preferredTimeOfDay, timeOfDayList),
      timeOfDayLabel: getPreferredTimeOfDayLabel(completion?.preferredTimeOfDay, timeOfDayList),
    }

    if (isAsNeededFrequency(freq)) {
      if (weekOffset !== 0) {
        return
      }

      const intervalDays = getFrequencyQueueConfig(freq).intervalDays
      const completedAt = completion?.timestamp ?? null

      if (!isDueInQueueWindow(completedAt, intervalDays, viewStart)) {
        return
      }

      asNeededItems.push({
        ...baseItem,
        key: `chore-${chore.choreRowId}-asNeeded`,
        completedAt,
      })
      return
    }

    const rawDayIndexes = getQueueDayIndexes({
      freq,
      completedAt: completion?.timestamp ?? null,
      queueDueAt: completion?.queueDueAt,
      dueDayOfWeek: completion?.dueDayOfWeek,
      queueWeekdays: completion?.queueWeekdays,
      sort: chore.choreRowId,
      rowId: chore.choreRowId,
      todayStart: viewStart,
      maxDayIndex,
    })
    const moves = getQueueDayMovesForItem(
      queueDayMoveList,
      robeyRowId,
      chore.choreRowId,
      null,
    )
    const dayIndexes = applyQueueDayMoves(rawDayIndexes, viewStart, moves, maxDayIndex)

    if (weekOffset === 0) {
      addCatchUpItem(`chore-${chore.choreRowId}`, baseItem, getCatchUpDetails({
        freq,
        completedAt: completion?.timestamp ?? null,
        queueDueAt: completion?.queueDueAt,
        dueDayOfWeek: completion?.dueDayOfWeek,
        queueWeekdays: completion?.queueWeekdays,
        sort: chore.choreRowId,
        rowId: chore.choreRowId,
        todayStart: viewStart,
        maxDayIndex,
      }))
    }

    dayIndexes.forEach((dayIndex) => {
      queueItems.push(
        buildQueueItem({
          baseKey: `chore-${chore.choreRowId}`,
          ...baseItem,
          dayIndex,
        }),
      )
    })
  })

  catchUpItems.sort((a, b) => {
    if (b.daysAgo !== a.daysAgo) {
      return b.daysAgo - a.daysAgo
    }

    return compareQueueItemsByTimeOfDay(a, b)
  })

  asNeededItems.sort(compareQueueItemsByTimeOfDay)

  const days = Array.from({ length: MAX_QUEUE_DAYS }, (_, dayIndex) => {
    const items = queueItems
      .filter((item) => item.dayIndex === dayIndex)
      .sort(compareQueueItemsByTimeOfDay)

    return {
      dayIndex,
      label: formatDayLabel(dayIndex, viewStart, useRelativeLabels),
      items,
    }
  })

  return { robeyRowId, days, asNeededItems, catchUpItems, weekOffset, viewStart }
}

export function buildBethQueueSchedule({
  whoList,
  choreInfo,
  choresList,
  whenCompletedList,
  frequencyOfList,
  timeOfDayList = [],
  queueDayMoveList = [],
  weekOffset = 0,
  now = Date.now(),
}) {
  const personRowId = getBethRowId(whoList)
  if (personRowId == null) {
    return { personRowId: null, days: [], asNeededItems: [], catchUpItems: [], weekOffset, viewStart: null }
  }

  const viewStart = getBethQueueViewStart(weekOffset, now)
  const useRelativeLabels = weekOffset === 0
  const maxDayIndex = BETH_QUEUE_DAYS - 1
  const freqMap = Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq]))
  const activeChoreIds = new Set(
    choresList.filter((chore) => chore.active !== 0).map((chore) => chore.rowId),
  )

  const personChores = choreInfo.filter(
    (item) => item.who === personRowId && activeChoreIds.has(item.choreRowId),
  )

  const completionMap = buildCompletionMap(whenCompletedList, personRowId)

  const queueItems = []
  const asNeededItems = []
  const catchUpItems = []

  function addCatchUpItem(baseKey, baseItem, catchUpDetails) {
    if (!catchUpDetails) {
      return
    }

    catchUpItems.push({
      ...baseItem,
      key: `${baseKey}-catchUp`,
      missedDayLabel: catchUpDetails.missedDayLabel,
      missedDayStart: catchUpDetails.missedDayStart,
      daysAgo: catchUpDetails.daysAgo,
    })
  }

  personChores.forEach((chore) => {
    const completion = completionMap.get(chore.choreRowId)
    const freq = getFreqFromMap(freqMap, chore.freqId)
    const baseItem = {
      type: 'chore',
      label: chore.chore,
      parentChore: null,
      frequency: chore.frequency,
      frequencySort: chore.frequencySort ?? 999,
      choreRowId: chore.choreRowId,
      subcategoryRowId: null,
      queueDayLabel: getQueueDayLabelForFrequency(freq, {
        dueDayOfWeek: completion?.dueDayOfWeek,
        queueWeekdays: completion?.queueWeekdays,
        queueDueAt: completion?.queueDueAt,
      }),
      preferredTimeOfDay: completion?.preferredTimeOfDay ?? null,
      timeOfDaySort: getTimeOfDaySort(completion?.preferredTimeOfDay, timeOfDayList),
      timeOfDayIcon: getPreferredTimeOfDayIcon(completion?.preferredTimeOfDay, timeOfDayList),
      timeOfDayLabel: getPreferredTimeOfDayLabel(completion?.preferredTimeOfDay, timeOfDayList),
    }

    if (isAsNeededFrequency(freq)) {
      if (weekOffset !== 0) {
        return
      }

      const intervalDays = getFrequencyQueueConfig(freq).intervalDays
      const completedAt = completion?.timestamp ?? null

      if (!isDueInQueueWindow(completedAt, intervalDays, viewStart)) {
        return
      }

      asNeededItems.push({
        ...baseItem,
        key: `chore-${chore.choreRowId}-asNeeded`,
        completedAt,
      })
      return
    }

    const rawDayIndexes = getQueueDayIndexes({
      freq,
      completedAt: completion?.timestamp ?? null,
      queueDueAt: completion?.queueDueAt,
      dueDayOfWeek: completion?.dueDayOfWeek,
      queueWeekdays: completion?.queueWeekdays,
      sort: chore.choreRowId,
      rowId: chore.choreRowId,
      todayStart: viewStart,
      maxDayIndex,
    })
    const moves = getQueueDayMovesForItem(
      queueDayMoveList,
      personRowId,
      chore.choreRowId,
      null,
    )
    const dayIndexes = applyQueueDayMoves(rawDayIndexes, viewStart, moves, maxDayIndex)

    if (weekOffset === 0) {
      addCatchUpItem(`chore-${chore.choreRowId}`, baseItem, getCatchUpDetails({
        freq,
        completedAt: completion?.timestamp ?? null,
        queueDueAt: completion?.queueDueAt,
        dueDayOfWeek: completion?.dueDayOfWeek,
        queueWeekdays: completion?.queueWeekdays,
        sort: chore.choreRowId,
        rowId: chore.choreRowId,
        todayStart: viewStart,
        maxDayIndex,
      }))
    }

    dayIndexes.forEach((dayIndex) => {
      queueItems.push(
        buildQueueItem({
          baseKey: `chore-${chore.choreRowId}`,
          ...baseItem,
          dayIndex,
        }),
      )
    })
  })

  catchUpItems.sort((a, b) => {
    if (b.daysAgo !== a.daysAgo) {
      return b.daysAgo - a.daysAgo
    }

    return compareQueueItemsByTimeOfDay(a, b)
  })

  asNeededItems.sort(compareQueueItemsByTimeOfDay)

  const days = Array.from({ length: BETH_QUEUE_DAYS }, (_, dayIndex) => {
    const items = queueItems
      .filter((item) => item.dayIndex === dayIndex)
      .sort(compareQueueItemsByTimeOfDay)

    return {
      dayIndex,
      label: formatBethDayLabel(dayIndex, viewStart, useRelativeLabels),
      items,
    }
  })

  return { personRowId, days, asNeededItems, catchUpItems, weekOffset, viewStart }
}
