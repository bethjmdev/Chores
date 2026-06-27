import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildBethQueueSchedule,
  saveQueueCompletion,
  saveQueueDayMove,
  BETH_QUEUE_DAYS,
  buildCompletionMap,
  formatBethQueueWeekNavLabel,
  getBethQueueWeekdayOptions,
  getBethRowId,
  savePersonChoreSchedule,
} from '../utils/robeyQueueSchedule'
import { supportsQueueDayOfWeek, supportsQueueWeekdaysPicker, getQueueWeekdayPickCount, normalizeQueueWeekdays } from '../utils/frequencyQueue'
import { sortChoresByFrequency } from '../utils/sortChores'
import { parsePreferredTimeOfDayRowId } from '../utils/preferredTimeOfDay'
import { useViewSelection } from '../utils/viewSelectionStorage'

const QUEUE_VIEW_STORAGE_KEY = 'chores-view-beth-queue-days'
const choreScheduleCollapsedKey = 'bethQueue-choreScheduleCollapsed'

function loadChoreScheduleCollapsed() {
  try {
    return localStorage.getItem(choreScheduleCollapsedKey) === 'true'
  } catch {
    return false
  }
}

function saveChoreScheduleCollapsed(isCollapsed) {
  try {
    localStorage.setItem(choreScheduleCollapsedKey, String(isCollapsed))
  } catch {
    // ignore storage errors
  }
}

function QueueWeekdayPicker({
  value,
  maxCount,
  disabled,
  onChange,
  options,
}) {
  const pickLimit = maxCount ?? 7
  const [localDays, setLocalDays] = useState(() => normalizeQueueWeekdays(value) ?? [])

  useEffect(() => {
    setLocalDays(normalizeQueueWeekdays(value) ?? [])
  }, [value])

  const selected = new Set(localDays)

  function toggle(day) {
    const next = new Set(selected)

    if (next.has(day)) {
      next.delete(day)
    } else if (next.size < pickLimit) {
      next.add(day)
    }

    const nextDays = [...next].sort((a, b) => a - b)
    setLocalDays(nextDays)
    onChange(nextDays)
  }

  return (
    <div className="BethQueue-Weekdays">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`BethQueue-Weekday-Button${selected.has(option.value) ? ' BethQueue-Weekday-Button-Active' : ''}`}
          disabled={disabled || (!selected.has(option.value) && selected.size >= pickLimit)}
          onClick={() => toggle(option.value)}
          title={option.label}
        >
          {option.label.slice(0, 3)}
        </button>
      ))}
      <span className="BethQueue-Weekdays-Count">
        {selected.size}
        /
        {maxCount}
      </span>
    </div>
  )
}

function renderQueueDayField({
  freq,
  frequencyLabel,
  queueWeekdays,
  dueDayOfWeek,
  disabled,
  onQueueWeekdaysChange,
  onDueDayChange,
  queueWeekdayOptions,
}) {
  if (supportsQueueWeekdaysPicker(freq, frequencyLabel)) {
    return (
      <QueueWeekdayPicker
        value={queueWeekdays}
        maxCount={getQueueWeekdayPickCount(freq, frequencyLabel)}
        disabled={disabled}
        onChange={onQueueWeekdaysChange}
        options={queueWeekdayOptions}
      />
    )
  }

  if (supportsQueueDayOfWeek(freq, frequencyLabel)) {
    return (
      <select
        className="BethQueue-ChoreSchedule-Select"
        value={dueDayOfWeek != null ? String(dueDayOfWeek) : ''}
        disabled={disabled}
        onChange={(e) => onDueDayChange(e.target.value)}
      >
        <option value="">Auto spread</option>
        {queueWeekdayOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  return <span className="BethQueue-ChoreSchedule-Na">—</span>
}

function getDayKey(dayIndex) {
  return String(dayIndex)
}

function BethQueue({
  whoList,
  choreInfo,
  choresList,
  whenCompletedList,
  frequencyOfList,
  timeOfDayList = [],
  queueDayMoveList = [],
  seedStatus,
  reloadData,
}) {
  const [draggedItemKey, setDraggedItemKey] = useState(null)
  const [dragOverDayIndex, setDragOverDayIndex] = useState(null)
  const [showCatchUp, setShowCatchUp] = useState(false)
  const [actionStatus, setActionStatus] = useState('idle')
  const [weekOffset, setWeekOffset] = useState(0)
  const [choreScheduleCollapsed, setChoreScheduleCollapsed] = useState(() => loadChoreScheduleCollapsed())
  const [scheduleSaveStatus, setScheduleSaveStatus] = useState('idle')
  const scheduleSaveQueue = useRef(Promise.resolve())

  const isViewingCurrentWindow = weekOffset === 0
  const weekNavLabel = formatBethQueueWeekNavLabel(weekOffset)

  const bethRowId = useMemo(
    () => getBethRowId(whoList),
    [whoList],
  )

  const frequencyMap = useMemo(
    () => Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq])),
    [frequencyOfList],
  )

  const queueWeekdayOptions = useMemo(() => getBethQueueWeekdayOptions(), [])

  const timeOfDayOptions = useMemo(
    () => [...timeOfDayList].sort((a, b) => a.sort - b.sort),
    [timeOfDayList],
  )

  const bethChores = useMemo(() => {
    if (bethRowId == null) {
      return []
    }

    return sortChoresByFrequency(
      choreInfo.filter((item) => item.who === bethRowId),
    )
  }, [choreInfo, bethRowId])

  const completionMap = useMemo(
    () => buildCompletionMap(whenCompletedList, bethRowId),
    [whenCompletedList, bethRowId],
  )

  const dayKeys = useMemo(
    () => Array.from({ length: BETH_QUEUE_DAYS }, (_, dayIndex) => getDayKey(dayIndex)),
    [],
  )

  const [selectedDayKeys, setSelectedDayKeys] = useViewSelection(
    QUEUE_VIEW_STORAGE_KEY,
    dayKeys,
  )

  const schedule = useMemo(
    () => buildBethQueueSchedule({
      whoList,
      choreInfo,
      choresList,
      whenCompletedList,
      frequencyOfList,
      timeOfDayList,
      queueDayMoveList,
      weekOffset,
    }),
    [
      whoList,
      choreInfo,
      choresList,
      whenCompletedList,
      frequencyOfList,
      timeOfDayList,
      queueDayMoveList,
      weekOffset,
    ],
  )

  const isShowingAllDays = selectedDayKeys === null

  const visibleDays = useMemo(() => {
    if (isShowingAllDays) {
      return schedule.days
    }

    return schedule.days.filter((day) => selectedDayKeys.has(getDayKey(day.dayIndex)))
  }, [schedule.days, selectedDayKeys, isShowingAllDays])

  const itemMap = useMemo(() => {
    const map = new Map()

    schedule.days.forEach((day) => {
      day.items.forEach((item) => {
        map.set(item.key, item)
      })
    })

    schedule.asNeededItems.forEach((item) => {
      map.set(item.key, item)
    })

    ;(schedule.catchUpItems ?? []).forEach((item) => {
      map.set(item.key, item)
    })

    return map
  }, [schedule.days, schedule.asNeededItems, schedule.catchUpItems])

  const scheduledCount = visibleDays.reduce((sum, day) => sum + day.items.length, 0)
  const allScheduledCount = schedule.days.reduce((sum, day) => sum + day.items.length, 0)
  const catchUpCount = (schedule.catchUpItems ?? []).length
  const totalVisibleItems = scheduledCount + schedule.asNeededItems.length + catchUpCount
  const totalQueueItems = allScheduledCount + schedule.asNeededItems.length + catchUpCount

  function showAllDays() {
    setSelectedDayKeys(null)
  }

  function clearDaySelection() {
    setSelectedDayKeys(null)
  }

  function selectDay(dayKey) {
    setSelectedDayKeys((prev) => {
      if (prev === null) {
        return new Set([dayKey])
      }

      const next = new Set(prev)
      if (next.has(dayKey)) {
        next.delete(dayKey)
        return next.size === 0 ? null : next
      }

      next.add(dayKey)
      return next
    })
  }

  function isDaySelected(dayKey) {
    if (isShowingAllDays) {
      return true
    }

    return selectedDayKeys.has(dayKey)
  }

  function toggleChoreScheduleCollapsed() {
    setChoreScheduleCollapsed((prev) => {
      const next = !prev
      saveChoreScheduleCollapsed(next)
      return next
    })
  }

  function saveChoreSchedule(chore, field, value) {
    if (bethRowId == null) {
      return Promise.resolve()
    }

    const patch = {}

    if (field === 'preferredTimeOfDay') {
      patch.preferredTimeOfDay = parsePreferredTimeOfDayRowId(value)
    }

    if (field === 'dueDayOfWeek') {
      patch.dueDayOfWeek = value === '' ? null : Number(value)
    }

    if (field === 'queueWeekdays') {
      patch.queueWeekdays = normalizeQueueWeekdays(value)
    }

    scheduleSaveQueue.current = scheduleSaveQueue.current
      .then(async () => {
        setScheduleSaveStatus('saving')

        try {
          await savePersonChoreSchedule({
            chore,
            personRowId: bethRowId,
            whenCompletedList,
            choresList,
            patch,
          })

          await reloadData({ silent: true })
          setScheduleSaveStatus('idle')
        } catch (err) {
          console.error('Failed to save chore schedule:', err)
          setScheduleSaveStatus('error')
        }
      })
      .catch(() => {})

    return scheduleSaveQueue.current
  }

  async function handleComplete(item) {
    if (schedule.personRowId == null) {
      return
    }

    setActionStatus('saving')

    try {
      await saveQueueCompletion({
        item,
        personRowId: schedule.personRowId,
        whenCompletedList,
        choresList,
        isComplete: true,
      })

      await reloadData({ silent: true })
      setActionStatus('idle')
    } catch (err) {
      console.error('Failed to complete queue item:', err)
      setActionStatus('error')
    }
  }

  function renderQueueItem(item, { draggable = true, showMissedDay = false } = {}) {
    const canInteract = isViewingCurrentWindow

    return (
      <li
        key={item.key}
        className={`RobeyQueue-Day-ListItem${draggedItemKey === item.key ? ' RobeyQueue-Day-ListItem-Dragging' : ''}`}
        draggable={canInteract && draggable && actionStatus !== 'saving'}
        onDragStart={() => setDraggedItemKey(item.key)}
        onDragEnd={() => {
          setDraggedItemKey(null)
          setDragOverDayIndex(null)
        }}
      >
        <label className="RobeyQueue-CheckLabel">
          <input
            type="checkbox"
            className="RobeyQueue-Checkbox"
            disabled={!canInteract || actionStatus === 'saving'}
            onChange={() => handleComplete(item)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="RobeyQueue-CheckLabel-Content">
            <div className="RobeyQueue-Day-ListItem-Label">
              {item.label}
            </div>
            <div className="RobeyQueue-Day-ListItem-Meta">
              {showMissedDay && item.missedDayLabel && (
                <span className="RobeyQueue-Day-ListItem-Missed">
                  Missed
                  {' '}
                  {item.missedDayLabel}
                </span>
              )}
              {(item.timeOfDayIcon || item.frequency) && (
                <span className="RobeyQueue-Day-ListItem-FrequencyGroup">
                  {item.timeOfDayIcon && (
                    <span
                      className="RobeyQueue-Day-ListItem-TimeIcon"
                      title={item.timeOfDayLabel || undefined}
                      aria-hidden="true"
                    >
                      {item.timeOfDayIcon}
                    </span>
                  )}
                  {item.frequency && (
                    <span className="RobeyQueue-Day-ListItem-Frequency">
                      {item.frequency}
                    </span>
                  )}
                </span>
              )}
              {item.queueDayLabel && (
                <span className="RobeyQueue-Day-ListItem-QueueDay">
                  {item.queueDayLabel}
                </span>
              )}
            </div>
          </div>
        </label>
      </li>
    )
  }

  async function handleDrop(targetDayIndex) {
    if (!isViewingCurrentWindow || draggedItemKey == null || schedule.personRowId == null) {
      return
    }

    const item = itemMap.get(draggedItemKey)
    if (!item || item.dayIndex === targetDayIndex) {
      setDraggedItemKey(null)
      setDragOverDayIndex(null)
      return
    }

    setActionStatus('saving')

    try {
      await saveQueueDayMove({
        item,
        dayIndex: targetDayIndex,
        personRowId: schedule.personRowId,
        whenCompletedList,
        choresList,
        frequencyOfList,
        queueDayMoveList,
        viewStart: schedule.viewStart,
      })

      await reloadData({ silent: true })
      setActionStatus('idle')
    } catch (err) {
      console.error('Failed to move queue item:', err)
      setActionStatus('error')
    } finally {
      setDraggedItemKey(null)
      setDragOverDayIndex(null)
    }
  }

  return (
    <div className="BethQueue">
      <div className="BethQueue-Container">
        <header className="BethQueue-Header">
          <h2>Beth Queue</h2>
          <p>
            Set queue days in Chore schedule below. Check off when done — chores come back after the frequency interval.
            Use Catch up for chores that were missed on a past day.
          </p>
        </header>

        <section className="BethQueue-Content">
          {seedStatus === 'loading' && (
            <p className="RobeyQueue-Loading">Loading queue...</p>
          )}
          {seedStatus === 'error' && (
            <p className="RobeyQueue-Error">Could not load queue.</p>
          )}

          {seedStatus === 'ready' && schedule.personRowId == null && (
            <p className="RobeyQueue-Empty">Beth was not found in the Who table.</p>
          )}

          {seedStatus === 'ready' && schedule.personRowId != null && bethChores.length > 0 && (
                <div className={`BethQueue-ChoreSchedule${choreScheduleCollapsed ? ' BethQueue-ChoreSchedule-Collapsed' : ''}`}>
                  <div className="BethQueue-ChoreSchedule-Header">
                    <button
                      type="button"
                      className="BethQueue-ChoreSchedule-Toggle"
                      onClick={toggleChoreScheduleCollapsed}
                      aria-expanded={!choreScheduleCollapsed}
                    >
                      <span className="BethQueue-ChoreSchedule-Toggle-Icon" aria-hidden="true">
                        {choreScheduleCollapsed ? '▸' : '▾'}
                      </span>
                      <span className="BethQueue-ChoreSchedule-Title">Chore schedule</span>
                      <span className="BethQueue-ChoreSchedule-Count">
                        {bethChores.length}
                      </span>
                    </button>
                  </div>

                  {!choreScheduleCollapsed && (
                    <>
                      <p className="BethQueue-ChoreSchedule-Note">
                        Pick which days each chore runs. For 2–3×/week or 5×/week chores, tap the day buttons (Sun–Sat).
                      </p>
                      <div className="BethQueue-ChoreSchedule-Table">
                        <div className="BethQueue-ChoreSchedule-Table-Header">
                          <span className="BethQueue-ChoreSchedule-Table-Header-Label">Chore</span>
                          <span className="BethQueue-ChoreSchedule-Table-Header-Label">Schedule</span>
                          <span className="BethQueue-ChoreSchedule-Table-Header-Label">Time of day</span>
                        </div>
                        <ul className="BethQueue-ChoreSchedule-List">
                          {bethChores.map((chore) => {
                            const completion = completionMap.get(Number(chore.choreRowId))
                            const freq = frequencyMap[chore.freqId]
                            const timeValue = completion?.preferredTimeOfDay != null
                              ? String(completion.preferredTimeOfDay)
                              : ''
                            const scheduleKey = `${chore.choreRowId}-${(completion?.queueWeekdays || []).join(',')}`

                            return (
                              <li key={scheduleKey} className="BethQueue-ChoreSchedule-Item">
                                <span className="BethQueue-ChoreSchedule-Label">{chore.chore}</span>
                                {renderQueueDayField({
                                  freq,
                                  frequencyLabel: chore.frequency,
                                  queueWeekdays: completion?.queueWeekdays,
                                  dueDayOfWeek: completion?.dueDayOfWeek,
                                  disabled: scheduleSaveStatus === 'saving',
                                  onQueueWeekdaysChange: (days) => saveChoreSchedule(chore, 'queueWeekdays', days),
                                  onDueDayChange: (value) => saveChoreSchedule(chore, 'dueDayOfWeek', value),
                                  queueWeekdayOptions,
                                })}
                                <select
                                  className="BethQueue-ChoreSchedule-Select"
                                  value={timeValue}
                                  disabled={scheduleSaveStatus === 'saving'}
                                  onChange={(e) => saveChoreSchedule(chore, 'preferredTimeOfDay', e.target.value)}
                                >
                                  <option value="">No preference</option>
                                  {timeOfDayOptions.map((option) => (
                                    <option key={option.rowId} value={option.rowId}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              )}

          {seedStatus === 'ready' && schedule.personRowId != null && totalQueueItems === 0 && (
            <p className="RobeyQueue-Empty">Nothing in the queue right now.</p>
          )}

          {seedStatus === 'ready' && schedule.personRowId != null && (
            <>
              <div className="RobeyQueue-WeekNav">
                <button
                  type="button"
                  className="RobeyQueue-WeekNav-Button"
                  onClick={() => setWeekOffset((prev) => prev - 1)}
                >
                  Previous week
                </button>
                <span className="RobeyQueue-WeekNav-Label">{weekNavLabel}</span>
                {!isViewingCurrentWindow && (
                  <button
                    type="button"
                    className="RobeyQueue-WeekNav-Button"
                    onClick={() => setWeekOffset(0)}
                  >
                    Today
                  </button>
                )}
                <button
                  type="button"
                  className="RobeyQueue-WeekNav-Button RobeyQueue-WeekNav-Button-Next"
                  onClick={() => setWeekOffset((prev) => prev + 1)}
                >
                  Next week
                </button>
              </div>

              <div className="RobeyQueue-Filter">
                <span className="RobeyQueue-Filter-Label">View</span>
                <button
                  type="button"
                  className={`RobeyQueue-Filter-Button${isShowingAllDays ? ' RobeyQueue-Filter-Button-Active' : ''}`}
                  onClick={showAllDays}
                >
                  All
                </button>
                {schedule.days.map((day) => {
                  const dayKey = getDayKey(day.dayIndex)

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      className={`RobeyQueue-Filter-Button${isDaySelected(dayKey) && !isShowingAllDays ? ' RobeyQueue-Filter-Button-Active' : ''}`}
                      onClick={() => selectDay(dayKey)}
                    >
                      {day.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="RobeyQueue-Filter-Button RobeyQueue-Filter-Button-Clear"
                  onClick={clearDaySelection}
                >
                  Clear
                </button>
              </div>

              {catchUpCount > 0 && isViewingCurrentWindow && (
                <div className="RobeyQueue-CatchUpBar">
                  <button
                    type="button"
                    className={`RobeyQueue-CatchUp-Button${showCatchUp ? ' RobeyQueue-CatchUp-Button-Active' : ''}`}
                    onClick={() => setShowCatchUp((prev) => !prev)}
                  >
                    Catch up
                    <span className="RobeyQueue-CatchUp-Count">{catchUpCount}</span>
                  </button>
                </div>
              )}

              {showCatchUp && catchUpCount > 0 && isViewingCurrentWindow && (
                <div className="RobeyQueue-CatchUp">
                  <h3 className="RobeyQueue-CatchUp-Title">Catch up</h3>
                  <p className="RobeyQueue-CatchUp-Note">
                    These were due on a past day and were not checked off.
                  </p>
                  <ul className="RobeyQueue-CatchUp-List">
                    {schedule.catchUpItems.map((item) => renderQueueItem(item, {
                      draggable: false,
                      showMissedDay: true,
                    }))}
                  </ul>
                </div>
              )}

              {(totalVisibleItems > 0 || allScheduledCount > 0 || schedule.asNeededItems.length > 0) && (
                <>
                  {scheduledCount > 0 && visibleDays.length > 0 && (
                    <div
                      className="RobeyQueue-Days"
                      style={{ '--queue-visible-days': visibleDays.length }}
                    >
                      {visibleDays.map((day) => (
                        <div
                          key={day.dayIndex}
                          className={`RobeyQueue-Day${dragOverDayIndex === day.dayIndex ? ' RobeyQueue-Day-DragOver' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            setDragOverDayIndex(day.dayIndex)
                          }}
                          onDragLeave={() => {
                            if (dragOverDayIndex === day.dayIndex) {
                              setDragOverDayIndex(null)
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            handleDrop(day.dayIndex)
                          }}
                        >
                          <h3 className="RobeyQueue-Day-Title">{day.label}</h3>
                          <p className="RobeyQueue-Day-Count">
                            {day.items.length} {day.items.length === 1 ? 'item' : 'items'}
                          </p>

                          {day.items.length === 0 ? (
                            <p className="RobeyQueue-Day-Empty">Drop here</p>
                          ) : (
                            <ul className="RobeyQueue-Day-List">
                              {day.items.map((item) => renderQueueItem(item))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {allScheduledCount > 0 && visibleDays.length === 0 && (
                    <p className="RobeyQueue-Empty">No days selected. Click All or Clear to reset.</p>
                  )}

                  {schedule.asNeededItems.length > 0 && (
                    <div className="RobeyQueue-AsNeeded">
                      <h3 className="RobeyQueue-AsNeeded-Title">As Needed</h3>
                      <p className="RobeyQueue-AsNeeded-Count">
                        {schedule.asNeededItems.length}
                        {' '}
                        {schedule.asNeededItems.length === 1 ? 'item' : 'items'}
                      </p>
                      <ul className="RobeyQueue-AsNeeded-List">
                        {schedule.asNeededItems.map((item) => renderQueueItem(item, { draggable: false }))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {scheduleSaveStatus === 'error' && (
            <p className="RobeyQueue-Error">Could not save chore schedule. Try again.</p>
          )}

          {actionStatus === 'error' && (
            <p className="RobeyQueue-Error">Something went wrong. Try again.</p>
          )}
        </section>
      </div>
    </div>
  )
}

export default BethQueue
