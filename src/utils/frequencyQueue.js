import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const dayMs = 24 * 60 * 60 * 1000

const defaultFrequencyQueueConfigByRowId = {
  1: { queuePattern: 'asNeeded', occurrencesPerWeek: null, queueWeekdays: null, intervalWeeks: null },
  2: { queuePattern: 'daily', occurrencesPerWeek: 7, queueWeekdays: null, intervalWeeks: null },
  3: { queuePattern: 'weekdays', occurrencesPerWeek: 5, queueWeekdays: [1, 2, 3, 4, 5], intervalWeeks: null },
  4: { queuePattern: 'perWeek', occurrencesPerWeek: 3, queueWeekdays: null, intervalWeeks: null },
  5: { queuePattern: 'weekly', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: null },
  6: { queuePattern: 'biweekly', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: 2 },
  7: { queuePattern: 'monthly', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: null },
  8: { queuePattern: 'bimonthly', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: null },
  9: { queuePattern: 'quarterly', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: null },
  10: { queuePattern: 'biannual', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: null },
  11: { queuePattern: 'annual', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: null },
  12: { queuePattern: 'everyNWeeks', occurrencesPerWeek: 1, queueWeekdays: null, intervalWeeks: 6 },
}

const defaultIntervalDaysByRowId = {
  1: 7,
  2: 1,
  3: 1,
  4: 2,
  5: 7,
  6: 14,
  7: 30,
  8: 60,
  9: 90,
  10: 180,
  11: 365,
  12: 42,
}

export { defaultIntervalDaysByRowId }

export function getFrequencyIntervalDays(freq) {
  if (freq?.intervalDays != null && freq.intervalDays > 0) {
    return freq.intervalDays
  }

  if (freq?.rowId != null && defaultIntervalDaysByRowId[freq.rowId] != null) {
    return defaultIntervalDaysByRowId[freq.rowId]
  }

  return 7
}

export function getFrequencyQueueConfig(freq) {
  const defaults = defaultFrequencyQueueConfigByRowId[freq?.rowId] ?? {
    queuePattern: 'weekly',
    occurrencesPerWeek: 1,
    queueWeekdays: null,
    intervalWeeks: null,
  }

  return {
    queuePattern: freq?.queuePattern ?? defaults.queuePattern,
    occurrencesPerWeek: freq?.occurrencesPerWeek ?? defaults.occurrencesPerWeek,
    queueWeekdays: freq?.queueWeekdays ?? defaults.queueWeekdays,
    intervalWeeks: freq?.intervalWeeks ?? defaults.intervalWeeks,
    intervalDays: getFrequencyIntervalDays(freq),
  }
}

export function getFreqFromMap(freqMap, freqId) {
  if (freqId == null) {
    return null
  }

  return freqMap[freqId] ?? freqMap[Number(freqId)] ?? freqMap[String(freqId)] ?? null
}

export function isMultiDayQueuePattern(queuePattern) {
  return queuePattern === 'daily' || queuePattern === 'weekdays' || queuePattern === 'perWeek'
}

export async function ensureFrequencyQueueConfig(frequencyList) {
  const updates = []

  for (const freq of frequencyList) {
    const defaults = defaultFrequencyQueueConfigByRowId[freq.rowId]
    if (!defaults) {
      continue
    }

    const patch = {}

    if (freq.queuePattern == null) {
      patch.queuePattern = defaults.queuePattern
      freq.queuePattern = defaults.queuePattern
    }

    if (freq.occurrencesPerWeek == null && defaults.occurrencesPerWeek != null) {
      patch.occurrencesPerWeek = defaults.occurrencesPerWeek
      freq.occurrencesPerWeek = defaults.occurrencesPerWeek
    }

    if (freq.queueWeekdays == null && defaults.queueWeekdays != null) {
      patch.queueWeekdays = defaults.queueWeekdays
      freq.queueWeekdays = defaults.queueWeekdays
    }

    if (freq.intervalWeeks == null && defaults.intervalWeeks != null) {
      patch.intervalWeeks = defaults.intervalWeeks
      freq.intervalWeeks = defaults.intervalWeeks
    }

    if ((freq.intervalDays == null || freq.intervalDays <= 0) && defaultIntervalDaysByRowId[freq.rowId] != null) {
      patch.intervalDays = defaultIntervalDaysByRowId[freq.rowId]
      freq.intervalDays = defaultIntervalDaysByRowId[freq.rowId]
    }

    if (Object.keys(patch).length > 0) {
      updates.push(
        setDoc(doc(db, 'Frequency_Of', String(freq.rowId)), patch, { merge: true }),
      )
    }
  }

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  return frequencyList
}

function getStartOfToday(now = Date.now()) {
  const date = new Date(now)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function getDayIndex(nextDueAt, todayStart, maxDayIndex = 6) {
  if (nextDueAt < todayStart) {
    return 0
  }

  const dayIndex = Math.floor((nextDueAt - todayStart) / dayMs)
  if (dayIndex > maxDayIndex) {
    return -1
  }

  return dayIndex
}

function getWeekdayInWindow(dayOfWeek, todayStart, maxDayIndex = 6) {
  for (let dayIndex = 0; dayIndex <= maxDayIndex; dayIndex += 1) {
    const candidateStart = todayStart + dayIndex * dayMs
    if (new Date(candidateStart).getDay() === dayOfWeek) {
      return dayIndex
    }
  }

  return null
}

function getWeekdayDayIndexes(todayStart, weekdayNumbers, maxDayIndex = 6) {
  const indexes = []

  for (let dayIndex = 0; dayIndex <= maxDayIndex; dayIndex += 1) {
    const dayOfWeek = new Date(todayStart + dayIndex * dayMs).getDay()
    if (weekdayNumbers.includes(dayOfWeek)) {
      indexes.push(dayIndex)
    }
  }

  return indexes
}

function getSpreadDayIndexes(count, seed, maxDayIndex = 6) {
  if (count <= 0) {
    return []
  }

  if (count === 1) {
    return [seed % (maxDayIndex + 1)]
  }

  const indexes = new Set()

  for (let i = 0; i < count; i += 1) {
    const offset = Math.round((i * maxDayIndex) / (count - 1))
    indexes.add((offset + seed) % (maxDayIndex + 1))
  }

  return [...indexes].sort((a, b) => a - b)
}

function getPinnedDayIndex(queueDueAt, todayStart, maxDayIndex = 6) {
  if (queueDueAt == null) {
    return null
  }

  const pinnedStart = getStartOfToday(queueDueAt)
  const windowEnd = todayStart + maxDayIndex * dayMs

  if (pinnedStart < todayStart || pinnedStart > windowEnd) {
    return null
  }

  return getDayIndex(pinnedStart, todayStart, maxDayIndex)
}

function isBiweeklyOnWeek(todayStart, completedAt, seed) {
  const weekIndex = Math.floor(todayStart / (7 * dayMs))

  if (completedAt == null) {
    return weekIndex % 2 === seed % 2
  }

  const completedWeek = Math.floor(getStartOfToday(completedAt) / (7 * dayMs))
  const weeksSinceCompleted = weekIndex - completedWeek

  if (weeksSinceCompleted < 0) {
    return false
  }

  if (weeksSinceCompleted < 2) {
    return false
  }

  return weeksSinceCompleted % 2 === 0
}

function isEveryNWeeksDue(todayStart, completedAt, intervalWeeks, seed) {
  if (intervalWeeks == null || intervalWeeks <= 0) {
    return true
  }

  const weekIndex = Math.floor(todayStart / (7 * dayMs))

  if (completedAt == null) {
    return weekIndex % intervalWeeks === seed % intervalWeeks
  }

  const completedWeek = Math.floor(getStartOfToday(completedAt) / (7 * dayMs))
  const weeksSinceCompleted = weekIndex - completedWeek

  return weeksSinceCompleted >= intervalWeeks
}

function isDueOnQueueDay(completedAt, intervalDays, dayStart) {
  if (completedAt == null) {
    return true
  }

  const nextDueDayStart = getStartOfToday(completedAt + intervalDays * dayMs)
  return dayStart >= nextDueDayStart
}

function filterIndexesByCompletion(candidateIndexes, completedAt, intervalDays, todayStart) {
  return candidateIndexes.filter((dayIndex) => {
    const dayStart = todayStart + dayIndex * dayMs
    return isDueOnQueueDay(completedAt, intervalDays, dayStart)
  })
}

export function isDueInQueueWindow(completedAt, intervalDays, todayStart) {
  return isDueOnQueueDay(completedAt, intervalDays, todayStart)
}

export function formatMissedDayLabel(missedDayStart, todayStart) {
  const daysAgo = Math.floor((todayStart - missedDayStart) / dayMs)

  if (daysAgo === 1) {
    return 'Yesterday'
  }

  return new Date(missedDayStart).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function getCatchUpDetails({
  freq,
  completedAt,
  queueDueAt,
  dueDayOfWeek,
  sort,
  rowId,
  todayStart,
  groupAnchorDayOfWeek,
  maxDayIndex = 6,
}) {
  if (!freq || isAsNeededFrequency(freq)) {
    return null
  }

  const config = getFrequencyQueueConfig(freq)

  if (config.queuePattern === 'daily') {
    return null
  }

  const intervalDays = config.intervalDays

  if (completedAt != null) {
    const nextDueDayStart = getStartOfToday(completedAt + intervalDays * dayMs)

    if (nextDueDayStart >= todayStart) {
      return null
    }

    return {
      missedDayStart: nextDueDayStart,
      missedDayLabel: formatMissedDayLabel(nextDueDayStart, todayStart),
      daysAgo: Math.floor((todayStart - nextDueDayStart) / dayMs),
    }
  }

  for (let daysAgo = 1; daysAgo <= 21; daysAgo += 1) {
    const pastDayStart = todayStart - daysAgo * dayMs
    const dayIndexes = getQueueDayIndexes({
      freq,
      completedAt: null,
      queueDueAt,
      dueDayOfWeek,
      sort,
      rowId,
      todayStart: pastDayStart,
      groupAnchorDayOfWeek,
      maxDayIndex,
    })

    if (dayIndexes.includes(0)) {
      return {
        missedDayStart: pastDayStart,
        missedDayLabel: formatMissedDayLabel(pastDayStart, todayStart),
        daysAgo,
      }
    }
  }

  return null
}

function getRawQueueDayIndexes({
  freq,
  completedAt,
  dueDayOfWeek,
  sort,
  rowId,
  todayStart,
  groupAnchorDayOfWeek,
  maxDayIndex = 6,
}) {
  const config = getFrequencyQueueConfig(freq)
  const seed = (sort ?? rowId ?? 1) - 1
  const anchorDayOfWeek = dueDayOfWeek ?? groupAnchorDayOfWeek ?? (seed % 7)

  if (config.queuePattern === 'asNeeded') {
    return []
  }

  if (dueDayOfWeek != null && isMultiDayQueuePattern(config.queuePattern)) {
    const dayIndex = getWeekdayInWindow(dueDayOfWeek, todayStart, maxDayIndex)
    return dayIndex == null ? [] : [dayIndex]
  }

  switch (config.queuePattern) {
    case 'daily':
      return Array.from({ length: maxDayIndex + 1 }, (_, dayIndex) => dayIndex)

    case 'weekdays':
      return getWeekdayDayIndexes(
        todayStart,
        config.queueWeekdays ?? [1, 2, 3, 4, 5],
        maxDayIndex,
      )

    case 'perWeek': {
      if (groupAnchorDayOfWeek != null && dueDayOfWeek == null) {
        const dayIndex = getWeekdayInWindow(anchorDayOfWeek, todayStart, maxDayIndex)
        return dayIndex == null ? [] : [dayIndex]
      }

      const count = config.occurrencesPerWeek ?? 3
      return getSpreadDayIndexes(count, seed, maxDayIndex)
    }

    case 'weekly': {
      const dayIndex = getWeekdayInWindow(anchorDayOfWeek, todayStart, maxDayIndex)
      return dayIndex == null ? [] : [dayIndex]
    }

    case 'biweekly': {
      if (!isBiweeklyOnWeek(todayStart, completedAt, seed)) {
        return []
      }

      const dayIndex = getWeekdayInWindow(anchorDayOfWeek, todayStart, maxDayIndex)
      return dayIndex == null ? [] : [dayIndex]
    }

    case 'everyNWeeks': {
      if (!isEveryNWeeksDue(todayStart, completedAt, config.intervalWeeks, seed)) {
        return []
      }

      const dayIndex = getWeekdayInWindow(anchorDayOfWeek, todayStart, maxDayIndex)
      return dayIndex == null ? [] : [dayIndex]
    }

    case 'monthly':
    case 'bimonthly':
    case 'quarterly':
    case 'biannual':
    case 'annual': {
      const dayIndex = getWeekdayInWindow(anchorDayOfWeek, todayStart, maxDayIndex)
      if (dayIndex != null) {
        return [dayIndex]
      }

      return [seed % (maxDayIndex + 1)]
    }

    default: {
      const dayIndex = getWeekdayInWindow(anchorDayOfWeek, todayStart, maxDayIndex)
      return dayIndex == null ? [] : [dayIndex]
    }
  }
}

export function getQueueDayIndexes({
  freq,
  completedAt,
  queueDueAt,
  dueDayOfWeek,
  sort,
  rowId,
  todayStart,
  groupAnchorDayOfWeek,
  maxDayIndex = 6,
}) {
  const config = getFrequencyQueueConfig(freq)
  const pinnedDayIndex = getPinnedDayIndex(queueDueAt, todayStart, maxDayIndex)

  if (pinnedDayIndex != null && !isMultiDayQueuePattern(config.queuePattern)) {
    return filterIndexesByCompletion(
      [pinnedDayIndex],
      completedAt,
      config.intervalDays,
      todayStart,
    )
  }

  const rawIndexes = getRawQueueDayIndexes({
    freq,
    completedAt,
    dueDayOfWeek,
    sort,
    rowId,
    todayStart,
    groupAnchorDayOfWeek,
    maxDayIndex,
  })

  return filterIndexesByCompletion(
    rawIndexes,
    completedAt,
    config.intervalDays,
    todayStart,
  )
}

export function isAsNeededFrequency(freq) {
  return getFrequencyQueueConfig(freq).queuePattern === 'asNeeded'
}

export async function clearMultiDayQueuePins({
  robeySubcategoryList,
  whenCompletedList,
  choresList,
  frequencyOfList,
}) {
  const freqMap = Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq]))
  const choreMap = Object.fromEntries(choresList.map((chore) => [chore.rowId, chore]))
  const updates = []

  robeySubcategoryList.forEach((subcategory) => {
    if (subcategory.queueDueAt == null) {
      return
    }

    const chore = choreMap[subcategory.choreRowId]
    const freq = getFreqFromMap(freqMap, chore?.freqId)
    const queuePattern = getFrequencyQueueConfig(freq).queuePattern

    if (!isMultiDayQueuePattern(queuePattern)) {
      return
    }

    updates.push(
      setDoc(
        doc(db, 'RobeySubCategory', String(subcategory.rowId)),
        { queueDueAt: null },
        { merge: true },
      ),
    )
    subcategory.queueDueAt = null
  })

  whenCompletedList.forEach((entry) => {
    if (entry.queueDueAt == null) {
      return
    }

    const choreRowId = entry.chore ?? entry.choreRowid
    const chore = choreMap[choreRowId]
    const freq = getFreqFromMap(freqMap, chore?.freqId)
    const queuePattern = getFrequencyQueueConfig(freq).queuePattern

    if (!isMultiDayQueuePattern(queuePattern)) {
      return
    }

    updates.push(
      setDoc(
        doc(db, 'When_Completed', String(entry.rowId ?? entry.id)),
        { queueDueAt: null },
        { merge: true },
      ),
    )
    entry.queueDueAt = null
  })

  if (updates.length > 0) {
    await Promise.all(updates)
  }

  return updates.length
}
