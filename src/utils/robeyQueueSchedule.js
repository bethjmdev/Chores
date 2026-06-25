import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getQueueDayIndexes, getFreqFromMap, getFrequencyQueueConfig, getCatchUpDetails, isAsNeededFrequency, isDueInQueueWindow, isMultiDayQueuePattern } from './frequencyQueue'
import { getTimeOfDaySort, getPreferredTimeOfDayIcon, getPreferredTimeOfDayLabel } from './preferredTimeOfDay'

const dayMs = 24 * 60 * 60 * 1000

export const MAX_QUEUE_DAYS = 10

export function getStartOfToday(now = Date.now()) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function getRobeyRowId(whoList) {
  return whoList.find((person) => person.name === 'Robey')?.rowId ?? null
}

function getCompletionWhoRowId(entry) {
  return entry.who ?? entry.whoRowid ?? null
}

function getCompletionChoreRowId(entry) {
  return entry.chore ?? entry.choreRowid ?? null
}

export function getQueueDueAtForDayIndex(dayIndex, now = Date.now()) {
  return getStartOfToday(now) + dayIndex * dayMs
}

function formatDayLabel(dayIndex, todayStart) {
  if (dayIndex === 0) {
    return 'Today'
  }

  if (dayIndex === 1) {
    return 'Tomorrow'
  }

  const date = new Date(todayStart + dayIndex * dayMs)
  return date.toLocaleDateString(undefined, {
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

function getQueueWeekdayLabel(dayOfWeek) {
  if (dayOfWeek == null) {
    return null
  }

  return getQueueWeekdayOptions().find((option) => option.value === dayOfWeek)?.label ?? null
}

function isSubcategoryUnscheduled(subcategory) {
  return (
    subcategory.dueDayOfWeek == null &&
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
      sort: subcategory.sort,
      rowId: subcategory.rowId,
      queueDueAt: subcategory.queueDueAt,
      groupAnchorDayOfWeek: null,
    }
  }

  const groupAnchorDayOfWeek = groupAnchors.get(subcategory.choreRowId) ?? null

  return {
    dueDayOfWeek: null,
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
  robeyRowId,
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

  const completion = whenCompletedList.find((entry) => {
    const whoRowId = getCompletionWhoRowId(entry)
    const choreRowId = getCompletionChoreRowId(entry)
    return whoRowId === robeyRowId && choreRowId === item.choreRowId
  })

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
    whoRowid: robeyRowId,
    choreRowid: item.choreRowId,
    freqRowid: chore?.freqId ?? null,
    timestamp: completedAt,
    isCompleted: 1,
    queueDueAt: null,
  })
}

export async function saveQueueDayMove({
  item,
  dayIndex,
  robeyRowId,
  whenCompletedList,
  choresList,
  frequencyOfList,
}) {
  const queueDueAt = getQueueDueAtForDayIndex(dayIndex)
  const dueDayOfWeek = new Date(queueDueAt).getDay()
  const freqMap = Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq]))
  const chore = choresList.find((entry) => entry.rowId === item.choreRowId)
  const freq = getFreqFromMap(freqMap, chore?.freqId)
  const queueConfig = getFrequencyQueueConfig(freq)
  const isMultiDay = isMultiDayQueuePattern(queueConfig.queuePattern)
  const movePatch = isMultiDay
    ? { queueDueAt: null, dueDayOfWeek }
    : { queueDueAt, dueDayOfWeek }

  if (item.type === 'subcategory') {
    await setDoc(
      doc(db, 'RobeySubCategory', String(item.subcategoryRowId)),
      movePatch,
      { merge: true },
    )
    return
  }

  const completion = whenCompletedList.find((entry) => {
    const whoRowId = getCompletionWhoRowId(entry)
    const choreRowId = getCompletionChoreRowId(entry)
    return whoRowId === robeyRowId && choreRowId === item.choreRowId
  })

  if (completion) {
    const docId = String(completion.rowId ?? completion.id)
    await setDoc(
      doc(db, 'When_Completed', docId),
      movePatch,
      { merge: true },
    )
    return
  }

  const maxRowId = whenCompletedList.reduce(
    (max, entry) => Math.max(max, entry.rowId || 0),
    0,
  )
  const newRowId = maxRowId + 1

  await setDoc(doc(db, 'When_Completed', String(newRowId)), {
    rowId: newRowId,
    whoRowid: robeyRowId,
    choreRowid: item.choreRowId,
    freqRowid: chore?.freqId ?? null,
    ...movePatch,
    isCompleted: null,
    timestamp: null,
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
  now = Date.now(),
}) {
  const robeyRowId = getRobeyRowId(whoList)
  if (robeyRowId == null) {
    return { robeyRowId: null, days: [], asNeededItems: [], catchUpItems: [] }
  }

  const todayStart = getStartOfToday(now)
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

  const completionMap = new Map()
  whenCompletedList.forEach((entry) => {
    const whoRowId = getCompletionWhoRowId(entry)
    const choreRowId = getCompletionChoreRowId(entry)

    if (whoRowId === robeyRowId && choreRowId != null) {
      completionMap.set(choreRowId, entry)
    }
  })

  const subcategoryGroupAnchors = buildSubcategoryGroupAnchors(
    robeySubcategories,
    completionMap,
    todayStart,
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
      queueDayLabel: getQueueWeekdayLabel(
        scheduleArgs.dueDayOfWeek ?? scheduleArgs.groupAnchorDayOfWeek,
      ),
      preferredTimeOfDay: subcategory.preferredTimeOfDay ?? null,
      timeOfDaySort: getTimeOfDaySort(subcategory.preferredTimeOfDay, timeOfDayList),
      timeOfDayIcon: getPreferredTimeOfDayIcon(subcategory.preferredTimeOfDay, timeOfDayList),
      timeOfDayLabel: getPreferredTimeOfDayLabel(subcategory.preferredTimeOfDay, timeOfDayList),
    }

    if (isAsNeededFrequency(freq)) {
      const intervalDays = getFrequencyQueueConfig(freq).intervalDays
      if (!isDueInQueueWindow(subcategory.completedAt, intervalDays, todayStart)) {
        return
      }

      asNeededItems.push({
        ...baseItem,
        key: `sub-${subcategory.rowId}-asNeeded`,
        completedAt: subcategory.completedAt,
      })
      return
    }

    const dayIndexes = getQueueDayIndexes({
      freq,
      completedAt: subcategory.completedAt,
      queueDueAt: scheduleArgs.queueDueAt,
      dueDayOfWeek: scheduleArgs.dueDayOfWeek,
      sort: scheduleArgs.sort,
      rowId: scheduleArgs.rowId,
      todayStart,
      groupAnchorDayOfWeek: scheduleArgs.groupAnchorDayOfWeek,
      maxDayIndex,
    })

    addCatchUpItem(`sub-${subcategory.rowId}`, baseItem, getCatchUpDetails({
      freq,
      completedAt: subcategory.completedAt,
      queueDueAt: scheduleArgs.queueDueAt,
      dueDayOfWeek: scheduleArgs.dueDayOfWeek,
      sort: scheduleArgs.sort,
      rowId: scheduleArgs.rowId,
      todayStart,
      groupAnchorDayOfWeek: scheduleArgs.groupAnchorDayOfWeek,
      maxDayIndex,
    }))

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
      queueDayLabel: getQueueWeekdayLabel(completion?.dueDayOfWeek),
      preferredTimeOfDay: completion?.preferredTimeOfDay ?? null,
      timeOfDaySort: getTimeOfDaySort(completion?.preferredTimeOfDay, timeOfDayList),
      timeOfDayIcon: getPreferredTimeOfDayIcon(completion?.preferredTimeOfDay, timeOfDayList),
      timeOfDayLabel: getPreferredTimeOfDayLabel(completion?.preferredTimeOfDay, timeOfDayList),
    }

    if (isAsNeededFrequency(freq)) {
      const intervalDays = getFrequencyQueueConfig(freq).intervalDays
      const completedAt = completion?.timestamp ?? null

      if (!isDueInQueueWindow(completedAt, intervalDays, todayStart)) {
        return
      }

      asNeededItems.push({
        ...baseItem,
        key: `chore-${chore.choreRowId}-asNeeded`,
        completedAt,
      })
      return
    }

    const dayIndexes = getQueueDayIndexes({
      freq,
      completedAt: completion?.timestamp ?? null,
      queueDueAt: completion?.queueDueAt,
      dueDayOfWeek: completion?.dueDayOfWeek,
      sort: chore.choreRowId,
      rowId: chore.choreRowId,
      todayStart,
      maxDayIndex,
    })

    addCatchUpItem(`chore-${chore.choreRowId}`, baseItem, getCatchUpDetails({
      freq,
      completedAt: completion?.timestamp ?? null,
      queueDueAt: completion?.queueDueAt,
      dueDayOfWeek: completion?.dueDayOfWeek,
      sort: chore.choreRowId,
      rowId: chore.choreRowId,
      todayStart,
      maxDayIndex,
    }))

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
      label: formatDayLabel(dayIndex, todayStart),
      items,
    }
  })

  return { robeyRowId, days, asNeededItems, catchUpItems }
}
