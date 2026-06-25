import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import {
  getFrequencyIntervalDays,
  isSubcategoryChecked,
  resetDueSubcategories,
} from '../utils/subcategoryDue'
import { sortChoresByFrequency } from '../utils/sortChores'
import { getQueueWeekdayOptions } from '../utils/robeyQueueSchedule'
import {
  getPreferredTimeOfDayLabel,
  parsePreferredTimeOfDayRowId,
} from '../utils/preferredTimeOfDay'

function getCompletionWhoRowId(entry) {
  return entry.who ?? entry.whoRowid ?? null
}

function getCompletionChoreRowId(entry) {
  return entry.chore ?? entry.choreRowid ?? null
}

const emptyAddForm = {
  choreRowId: '',
  label: '',
  dueDayOfWeek: '',
  preferredTimeOfDay: '',
}

const choreTimesCollapsedKey = 'robeySubcategories-choreTimesCollapsed'

function loadChoreTimesCollapsed() {
  try {
    return localStorage.getItem(choreTimesCollapsedKey) === 'true'
  } catch {
    return false
  }
}

function saveChoreTimesCollapsed(isCollapsed) {
  try {
    localStorage.setItem(choreTimesCollapsedKey, String(isCollapsed))
  } catch {
    // ignore storage errors
  }
}

function RobeySubcategories({
  choreInfo,
  choresList,
  whoList,
  frequencyOfList,
  robeySubcategoryList,
  whenCompletedList = [],
  timeOfDayList = [],
  seedStatus,
  reloadData,
}) {
  const [addForm, setAddForm] = useState(emptyAddForm)
  const [editingRowId, setEditingRowId] = useState(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDueDayOfWeek, setEditDueDayOfWeek] = useState('')
  const [editPreferredTimeOfDay, setEditPreferredTimeOfDay] = useState('')
  const [choreTimesCollapsed, setChoreTimesCollapsed] = useState(() => loadChoreTimesCollapsed())
  const [saveStatus, setSaveStatus] = useState('idle')
  const [nowTick, setNowTick] = useState(Date.now())
  const resetRunning = useRef(false)

  const robeyRowId = useMemo(
    () => whoList.find((person) => person.name === 'Robey')?.rowId ?? null,
    [whoList],
  )

  const frequencyLabelMap = useMemo(
    () => Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq.frequency])),
    [frequencyOfList],
  )

  const frequencyMap = useMemo(
    () => Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq])),
    [frequencyOfList],
  )

  const queueWeekdayOptions = useMemo(() => getQueueWeekdayOptions(), [])

  const timeOfDayOptions = useMemo(
    () => [...timeOfDayList].sort((a, b) => a.sort - b.sort),
    [timeOfDayList],
  )

  const robeyChores = useMemo(() => {
    if (robeyRowId == null) return []

    return sortChoresByFrequency(
      choreInfo.filter((item) => item.who === robeyRowId),
    )
  }, [choreInfo, robeyRowId])

  const robeySubcategories = useMemo(() => {
    if (robeyRowId == null) return []

    return robeySubcategoryList
      .filter((item) => item.whoRowId === robeyRowId && item.active !== 0)
      .sort((a, b) => {
        if (a.choreRowId !== b.choreRowId) {
          return a.choreRowId - b.choreRowId
        }

        const sortA = a.sort ?? 999
        const sortB = b.sort ?? 999
        if (sortA !== sortB) {
          return sortA - sortB
        }

        return a.rowId - b.rowId
      })
  }, [robeySubcategoryList, robeyRowId])

  const groupedSubcategories = useMemo(() => {
    const choreMap = Object.fromEntries(robeyChores.map((item) => [item.choreRowId, item]))
    const groups = new Map()

    robeySubcategories.forEach((subcategory) => {
      const parentChore = choreMap[subcategory.choreRowId]
      if (!parentChore) return

      if (!groups.has(subcategory.choreRowId)) {
        groups.set(subcategory.choreRowId, {
          parentChore,
          items: [],
        })
      }

      groups.get(subcategory.choreRowId).items.push(subcategory)
    })

    return [...groups.values()].sort((a, b) => {
      const sortA = a.parentChore.frequencySort ?? 999
      const sortB = b.parentChore.frequencySort ?? 999
      if (sortA !== sortB) {
        return sortA - sortB
      }

      return a.parentChore.choreRowId - b.parentChore.choreRowId
    })
  }, [robeySubcategories, robeyChores])

  const choreRowIdsWithSubcategories = useMemo(
    () => new Set(robeySubcategories.map((item) => item.choreRowId)),
    [robeySubcategories],
  )

  const choresWithoutSubcategories = useMemo(
    () => robeyChores.filter((item) => !choreRowIdsWithSubcategories.has(item.choreRowId)),
    [robeyChores, choreRowIdsWithSubcategories],
  )

  const completionMap = useMemo(() => {
    const map = new Map()

    if (robeyRowId == null) {
      return map
    }

    whenCompletedList.forEach((entry) => {
      const whoRowId = getCompletionWhoRowId(entry)
      const choreRowId = getCompletionChoreRowId(entry)

      if (whoRowId === robeyRowId && choreRowId != null) {
        map.set(choreRowId, entry)
      }
    })

    return map
  }, [whenCompletedList, robeyRowId])

  useEffect(() => {
    if (seedStatus !== 'ready') {
      return undefined
    }

    async function checkDueSubcategories() {
      if (resetRunning.current) {
        return
      }

      resetRunning.current = true

      try {
        const resetCount = await resetDueSubcategories(
          robeySubcategoryList,
          choresList,
          frequencyOfList,
        )

        setNowTick(Date.now())

        if (resetCount > 0) {
          await reloadData({ silent: true })
        }
      } catch (err) {
        console.error('Failed to reset due subcategories:', err)
      } finally {
        resetRunning.current = false
      }
    }

    const intervalId = setInterval(checkDueSubcategories, 60000)
    return () => clearInterval(intervalId)
  }, [seedStatus, robeySubcategoryList, choresList, frequencyOfList, reloadData])

  function getIntervalDays(freqId) {
    if (freqId == null) {
      return getFrequencyIntervalDays(null)
    }

    return getFrequencyIntervalDays(frequencyMap[freqId])
  }

  function toggleChoreTimesCollapsed() {
    setChoreTimesCollapsed((prev) => {
      const next = !prev
      saveChoreTimesCollapsed(next)
      return next
    })
  }

  function startEdit(subcategory) {
    setEditingRowId(subcategory.rowId)
    setEditLabel(subcategory.label || '')
    setEditDueDayOfWeek(
      subcategory.dueDayOfWeek != null ? String(subcategory.dueDayOfWeek) : '',
    )
    setEditPreferredTimeOfDay(
      subcategory.preferredTimeOfDay != null ? String(subcategory.preferredTimeOfDay) : '',
    )
  }

  function cancelEdit() {
    setEditingRowId(null)
    setEditLabel('')
    setEditDueDayOfWeek('')
    setEditPreferredTimeOfDay('')
  }

  async function saveChorePreferredTime(chore, preferredTimeOfDay) {
    if (robeyRowId == null) {
      return
    }

    setSaveStatus('saving')

    try {
      const nextTime = parsePreferredTimeOfDayRowId(preferredTimeOfDay)
      const completion = completionMap.get(chore.choreRowId)

      if (completion) {
        await setDoc(
          doc(db, 'When_Completed', String(completion.rowId ?? completion.id)),
          { preferredTimeOfDay: nextTime },
          { merge: true },
        )
      } else if (nextTime) {
        const choreRow = choresList.find((entry) => entry.rowId === chore.choreRowId)
        const maxRowId = whenCompletedList.reduce(
          (max, entry) => Math.max(max, entry.rowId || 0),
          0,
        )
        const newRowId = maxRowId + 1

        await setDoc(doc(db, 'When_Completed', String(newRowId)), {
          rowId: newRowId,
          whoRowid: robeyRowId,
          choreRowid: chore.choreRowId,
          freqRowid: choreRow?.freqId ?? chore.freqId ?? null,
          preferredTimeOfDay: nextTime,
          isCompleted: null,
          timestamp: null,
        })
      }

      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to save chore time:', err)
      setSaveStatus('error')
    }
  }

  async function handleAdd(e) {
    e.preventDefault()

    if (!addForm.choreRowId || !addForm.label.trim() || robeyRowId == null) {
      return
    }

    setSaveStatus('saving')

    try {
      const choreRowId = Number(addForm.choreRowId)
      const siblings = robeySubcategoryList.filter(
        (item) => item.choreRowId === choreRowId && item.whoRowId === robeyRowId,
      )
      const maxSort = siblings.reduce((max, item) => Math.max(max, item.sort || 0), 0)
      const maxRowId = robeySubcategoryList.reduce(
        (max, item) => Math.max(max, item.rowId || 0),
        0,
      )
      const newRowId = maxRowId + 1

      await setDoc(doc(db, 'RobeySubCategory', String(newRowId)), {
        rowId: newRowId,
        choreRowId,
        whoRowId: robeyRowId,
        label: addForm.label.trim(),
        sort: maxSort + 1,
        active: 1,
        completedAt: null,
        dueDayOfWeek: addForm.dueDayOfWeek === '' ? null : Number(addForm.dueDayOfWeek),
        preferredTimeOfDay: parsePreferredTimeOfDayRowId(addForm.preferredTimeOfDay),
      })

      setAddForm(emptyAddForm)
      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to add subcategory:', err)
      setSaveStatus('error')
    }
  }

  async function handleSaveEdit(rowId) {
    if (!editLabel.trim()) {
      return
    }

    setSaveStatus('saving')

    try {
      await setDoc(
        doc(db, 'RobeySubCategory', String(rowId)),
        {
          label: editLabel.trim(),
          dueDayOfWeek: editDueDayOfWeek === '' ? null : Number(editDueDayOfWeek),
          preferredTimeOfDay: parsePreferredTimeOfDayRowId(editPreferredTimeOfDay),
        },
        { merge: true },
      )

      cancelEdit()
      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to update subcategory:', err)
      setSaveStatus('error')
    }
  }

  async function handleDelete(subcategory) {
    const label = subcategory.label || `row ${subcategory.rowId}`
    if (!window.confirm(`Delete subcategory "${label}"?`)) {
      return
    }

    setSaveStatus('saving')

    try {
      await deleteDoc(doc(db, 'RobeySubCategory', String(subcategory.rowId)))

      if (editingRowId === subcategory.rowId) {
        cancelEdit()
      }

      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to delete subcategory:', err)
      setSaveStatus('error')
    }
  }

  async function handleToggleComplete(subcategory, parentChore) {
    const intervalDays = getIntervalDays(parentChore.freqId)
    const isChecked = isSubcategoryChecked(subcategory.completedAt, intervalDays, nowTick)
    const nextCompletedAt = isChecked ? null : Date.now()

    setSaveStatus('saving')

    try {
      await setDoc(
        doc(db, 'RobeySubCategory', String(subcategory.rowId)),
        {
          completedAt: nextCompletedAt,
          ...(nextCompletedAt != null
            ? {
              queueDueAt: null,
              ...(subcategory.dueDayOfWeek == null
                ? { dueDayOfWeek: new Date().getDay() }
                : {}),
            }
            : {}),
        },
        { merge: true },
      )

      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to update subcategory completion:', err)
      setSaveStatus('error')
    }
  }

  return (
    <div className="RobeySubcategories">
      <div className="RobeySubcategories-Container">
        <header className="RobeySubcategories-Header">
          <h2>Robey Subcategories</h2>
          <p>
            Split Robey&apos;s chores into sub-tasks or set a preferred time of day for any assigned chore.
            Frequency still comes from the parent chore.
          </p>
        </header>

        <section className="RobeySubcategories-Content">
          {seedStatus === 'loading' && (
            <p className="RobeySubcategories-Loading">Loading subcategories...</p>
          )}
          {seedStatus === 'error' && (
            <p className="RobeySubcategories-Error">Could not load subcategories.</p>
          )}

          {seedStatus === 'ready' && robeyRowId == null && (
            <p className="RobeySubcategories-Empty">Robey was not found in the Who table.</p>
          )}

          {seedStatus === 'ready' && robeyRowId != null && (
            <>
              {choresWithoutSubcategories.length > 0 && (
                <div className={`RobeySubcategories-ChoreTimes${choreTimesCollapsed ? ' RobeySubcategories-ChoreTimes-Collapsed' : ''}`}>
                  <div className="RobeySubcategories-ChoreTimes-Header">
                    <button
                      type="button"
                      className="RobeySubcategories-ChoreTimes-Toggle"
                      onClick={toggleChoreTimesCollapsed}
                      aria-expanded={!choreTimesCollapsed}
                    >
                      <span className="RobeySubcategories-ChoreTimes-Toggle-Icon" aria-hidden="true">
                        {choreTimesCollapsed ? '▸' : '▾'}
                      </span>
                      <span className="RobeySubcategories-ChoreTimes-Title">Chore times</span>
                      <span className="RobeySubcategories-ChoreTimes-Count">
                        {choresWithoutSubcategories.length}
                      </span>
                    </button>
                  </div>

                  {!choreTimesCollapsed && (
                    <>
                      <p className="RobeySubcategories-ChoreTimes-Note">
                        Set a preferred time for chores that are not split into subcategories.
                      </p>
                      <div className="RobeySubcategories-ChoreTimes-Table">
                        <div className="RobeySubcategories-ChoreTimes-Table-Header">
                          <span className="RobeySubcategories-ChoreTimes-Table-Header-Label">Chore</span>
                          <span className="RobeySubcategories-ChoreTimes-Table-Header-Label">Time of day</span>
                        </div>
                        <ul className="RobeySubcategories-ChoreTimes-List">
                          {choresWithoutSubcategories.map((chore) => {
                            const completion = completionMap.get(chore.choreRowId)
                            const timeValue = completion?.preferredTimeOfDay != null
                              ? String(completion.preferredTimeOfDay)
                              : ''

                            return (
                              <li key={chore.choreRowId} className="RobeySubcategories-ChoreTimes-Item">
                                <span className="RobeySubcategories-ChoreTimes-Label">{chore.chore}</span>
                                <select
                                  className="RobeySubcategories-ChoreTimes-Select"
                                  value={timeValue}
                                  disabled={saveStatus === 'saving'}
                                  onChange={(e) => saveChorePreferredTime(chore, e.target.value)}
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

              <form className="RobeySubcategories-Form" onSubmit={handleAdd}>
                <h3 className="RobeySubcategories-Form-Title">Add subcategory</h3>
                <div className="RobeySubcategories-Form-Grid">
                  <div className="RobeySubcategories-Form-Field">
                    <label className="RobeySubcategories-Form-Label" htmlFor="robey-sub-parent">
                      Parent chore
                    </label>
                    <select
                      id="robey-sub-parent"
                      className="RobeySubcategories-Form-Select"
                      value={addForm.choreRowId}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, choreRowId: e.target.value }))}
                      required
                    >
                      <option value="">Select chore</option>
                      {robeyChores.map((item) => (
                        <option key={item.choreRowId} value={item.choreRowId}>
                          {item.chore}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="RobeySubcategories-Form-Field">
                    <label className="RobeySubcategories-Form-Label" htmlFor="robey-sub-label">
                      Subcategory label
                    </label>
                    <input
                      id="robey-sub-label"
                      type="text"
                      className="RobeySubcategories-Form-Input"
                      value={addForm.label}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, label: e.target.value }))}
                      placeholder="e.g. bedroom, office, cam's room"
                      required
                    />
                  </div>

                  <div className="RobeySubcategories-Form-Field">
                    <label className="RobeySubcategories-Form-Label" htmlFor="robey-sub-day">
                      Queue day
                    </label>
                    <select
                      id="robey-sub-day"
                      className="RobeySubcategories-Form-Select"
                      value={addForm.dueDayOfWeek}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, dueDayOfWeek: e.target.value }))}
                    >
                      <option value="">Auto spread</option>
                      {queueWeekdayOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="RobeySubcategories-Form-Field">
                    <label className="RobeySubcategories-Form-Label" htmlFor="robey-sub-time">
                      Time of day
                    </label>
                    <select
                      id="robey-sub-time"
                      className="RobeySubcategories-Form-Select"
                      value={addForm.preferredTimeOfDay}
                      onChange={(e) => setAddForm((prev) => ({
                        ...prev,
                        preferredTimeOfDay: e.target.value,
                      }))}
                    >
                      <option value="">No preference</option>
                      {timeOfDayOptions.map((option) => (
                        <option key={option.rowId} value={option.rowId}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="RobeySubcategories-Form-Actions">
                  <button
                    type="submit"
                    className="RobeySubcategories-Button RobeySubcategories-Button-Primary"
                    disabled={saveStatus === 'saving' || robeyChores.length === 0}
                  >
                    Add
                  </button>
                </div>
              </form>

              {robeyChores.length === 0 && (
                <p className="RobeySubcategories-Empty">No chores assigned to Robey yet.</p>
              )}

              {groupedSubcategories.length === 0 && robeyChores.length > 0 && (
                <p className="RobeySubcategories-Empty">No subcategories yet. Add one above.</p>
              )}

              <div className="RobeySubcategories-Groups">
                {groupedSubcategories.map((group) => {
                  const frequencyLabel = frequencyLabelMap[group.parentChore.freqId] || '—'
                  const intervalDays = getIntervalDays(group.parentChore.freqId)

                  return (
                    <div key={group.parentChore.choreRowId} className="RobeySubcategories-Group">
                      <div className="RobeySubcategories-Group-Header">
                        <h3 className="RobeySubcategories-Group-Title">{group.parentChore.chore}</h3>
                        <span className="RobeySubcategories-Group-Frequency">{frequencyLabel}</span>
                      </div>

                      <ul className="RobeySubcategories-List">
                        {group.items.map((subcategory) => {
                          const isChecked = isSubcategoryChecked(
                            subcategory.completedAt,
                            intervalDays,
                            nowTick,
                          )
                          const isEditing = editingRowId === subcategory.rowId
                          const queueDayLabel = queueWeekdayOptions.find(
                            (option) => option.value === subcategory.dueDayOfWeek,
                          )?.label
                          const preferredTimeLabel = getPreferredTimeOfDayLabel(
                            subcategory.preferredTimeOfDay,
                            timeOfDayOptions,
                          )

                          return (
                            <li key={subcategory.rowId} className="RobeySubcategories-ListItem">
                              <div className="RobeySubcategories-ListItem-Main">
                                <label className="RobeySubcategories-CheckLabel">
                                  <input
                                    type="checkbox"
                                    className="RobeySubcategories-Checkbox"
                                    checked={isChecked}
                                    disabled={saveStatus === 'saving'}
                                    onChange={() => handleToggleComplete(subcategory, group.parentChore)}
                                  />
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      className="RobeySubcategories-EditInput"
                                      value={editLabel}
                                      onChange={(e) => setEditLabel(e.target.value)}
                                      autoFocus
                                    />
                                  ) : (
                                    <span className="RobeySubcategories-Label">{subcategory.label}</span>
                                  )}
                                </label>

                                {isEditing ? (
                                  <>
                                    <select
                                      className="RobeySubcategories-EditSelect"
                                      value={editDueDayOfWeek}
                                      onChange={(e) => setEditDueDayOfWeek(e.target.value)}
                                    >
                                      <option value="">Auto spread</option>
                                      {queueWeekdayOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className="RobeySubcategories-EditSelect"
                                      value={editPreferredTimeOfDay}
                                      onChange={(e) => setEditPreferredTimeOfDay(e.target.value)}
                                    >
                                      <option value="">No preference</option>
                                      {timeOfDayOptions.map((option) => (
                                        <option key={option.rowId} value={option.rowId}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                ) : (
                                  <>
                                    {queueDayLabel && (
                                      <span className="RobeySubcategories-QueueDay">{queueDayLabel}</span>
                                    )}
                                    {preferredTimeLabel && (
                                      <span className="RobeySubcategories-PreferredTime">
                                        {preferredTimeLabel}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>

                              <div className="RobeySubcategories-ListItem-Actions">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      className="RobeySubcategories-Button RobeySubcategories-Button-Primary"
                                      disabled={saveStatus === 'saving'}
                                      onClick={() => handleSaveEdit(subcategory.rowId)}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      className="RobeySubcategories-Button"
                                      onClick={cancelEdit}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="RobeySubcategories-Button"
                                      onClick={() => startEdit(subcategory)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="RobeySubcategories-Button RobeySubcategories-Button-Delete"
                                      onClick={() => handleDelete(subcategory)}
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>

              {saveStatus === 'error' && (
                <p className="RobeySubcategories-Error">Something went wrong. Try again.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default RobeySubcategories
