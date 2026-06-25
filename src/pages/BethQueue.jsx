import { useMemo, useState } from 'react'
import { buildBethQueueSchedule, saveQueueCompletion, saveQueueDayMove, MAX_QUEUE_DAYS } from '../utils/robeyQueueSchedule'
import { useViewSelection } from '../utils/viewSelectionStorage'

const QUEUE_VIEW_STORAGE_KEY = 'chores-view-beth-queue-days'

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
  seedStatus,
  reloadData,
}) {
  const [draggedItemKey, setDraggedItemKey] = useState(null)
  const [dragOverDayIndex, setDragOverDayIndex] = useState(null)
  const [showCatchUp, setShowCatchUp] = useState(false)
  const [actionStatus, setActionStatus] = useState('idle')

  const dayKeys = useMemo(
    () => Array.from({ length: MAX_QUEUE_DAYS }, (_, dayIndex) => getDayKey(dayIndex)),
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
    }),
    [
      whoList,
      choreInfo,
      choresList,
      whenCompletedList,
      frequencyOfList,
      timeOfDayList,
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
    return (
      <li
        key={item.key}
        className={`RobeyQueue-Day-ListItem${draggedItemKey === item.key ? ' RobeyQueue-Day-ListItem-Dragging' : ''}`}
        draggable={draggable && actionStatus !== 'saving'}
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
            disabled={actionStatus === 'saving'}
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
    if (draggedItemKey == null || schedule.personRowId == null) {
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
            Check off when done — it leaves that day and comes back after the frequency interval.
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

          {seedStatus === 'ready' && schedule.personRowId != null && totalQueueItems === 0 && (
            <p className="RobeyQueue-Empty">Nothing in the queue right now.</p>
          )}

          {seedStatus === 'ready' && schedule.personRowId != null && (
            <>
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

              {catchUpCount > 0 && (
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

              {showCatchUp && catchUpCount > 0 && (
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
                    <div className="RobeyQueue-Days">
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

          {actionStatus === 'error' && (
            <p className="RobeyQueue-Error">Something went wrong. Try again.</p>
          )}
        </section>
      </div>
    </div>
  )
}

export default BethQueue
