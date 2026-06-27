import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import {
  resetDueSubcategories,
} from '../utils/subcategoryDue'
import { supportsQueueDayOfWeek, supportsQueueWeekdaysPicker, getQueueWeekdayPickCount, normalizeQueueWeekdays } from '../utils/frequencyQueue'
import { sortChoresByFrequency } from '../utils/sortChores'
import { getQueueWeekdayOptions, savePersonChoreSchedule, buildCompletionMap } from '../utils/robeyQueueSchedule'
import {
  getPreferredTimeOfDayLabel,
  parsePreferredTimeOfDayRowId,
} from '../utils/preferredTimeOfDay'

const emptyAddForm = {
  choreRowId: '',
  label: '',
  dueDayOfWeek: '',
  queueWeekdays: [],
  preferredTimeOfDay: '',
}

const choreTimesCollapsedKey = 'robeySubcategories-choreTimesCollapsed'

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
    <div className="RobeySubcategories-Weekdays">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`RobeySubcategories-Weekday-Button${selected.has(option.value) ? ' RobeySubcategories-Weekday-Button-Active' : ''}`}
          disabled={disabled || (!selected.has(option.value) && selected.size >= pickLimit)}
          onClick={() => toggle(option.value)}
          title={option.label}
        >
          {option.label.slice(0, 3)}
        </button>
      ))}
      <span className="RobeySubcategories-Weekdays-Count">
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
        disabled={false}
        onChange={onQueueWeekdaysChange}
        options={queueWeekdayOptions}
      />
    )
  }

  if (supportsQueueDayOfWeek(freq, frequencyLabel)) {
    return (
      <select
        className="RobeySubcategories-ChoreTimes-Select"
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

  return <span className="RobeySubcategories-ChoreTimes-Na">—</span>
}

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
  const [editQueueWeekdays, setEditQueueWeekdays] = useState([])
  const [editPreferredTimeOfDay, setEditPreferredTimeOfDay] = useState('')
  const [choreTimesCollapsed, setChoreTimesCollapsed] = useState(() => loadChoreTimesCollapsed())
  const [saveStatus, setSaveStatus] = useState('idle')
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

  const scheduleRows = useMemo(() => {
    const choreMap = Object.fromEntries(robeyChores.map((item) => [item.choreRowId, item]))
    const rows = []

    robeySubcategories.forEach((subcategory) => {
      const parentChore = choreMap[subcategory.choreRowId]
      if (!parentChore) {
        return
      }

      rows.push({
        key: `sub-${subcategory.rowId}`,
        type: 'subcategory',
        label: subcategory.label,
        parentChore: parentChore.chore,
        frequencySort: parentChore.frequencySort ?? 999,
        freq: frequencyMap[parentChore.freqId],
        frequencyLabel: parentChore.frequency,
        subcategory,
        chore: parentChore,
      })
    })

    choresWithoutSubcategories.forEach((chore) => {
      rows.push({
        key: `chore-${chore.choreRowId}`,
        type: 'chore',
        label: chore.chore,
        parentChore: null,
        frequencySort: chore.frequencySort ?? 999,
        freq: frequencyMap[chore.freqId],
        frequencyLabel: chore.frequency,
        subcategory: null,
        chore,
      })
    })

    return rows.sort((a, b) => {
      if (a.frequencySort !== b.frequencySort) {
        return a.frequencySort - b.frequencySort
      }

      const parentA = a.parentChore || a.label
      const parentB = b.parentChore || b.label
      if (parentA !== parentB) {
        return parentA.localeCompare(parentB)
      }

      return a.label.localeCompare(b.label)
    })
  }, [robeySubcategories, choresWithoutSubcategories, robeyChores, frequencyMap])

  const completionMap = useMemo(
    () => buildCompletionMap(whenCompletedList, robeyRowId),
    [whenCompletedList, robeyRowId],
  )

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
    setEditQueueWeekdays(normalizeQueueWeekdays(subcategory.queueWeekdays) ?? [])
    setEditPreferredTimeOfDay(
      subcategory.preferredTimeOfDay != null ? String(subcategory.preferredTimeOfDay) : '',
    )
  }

  function cancelEdit() {
    setEditingRowId(null)
    setEditLabel('')
    setEditDueDayOfWeek('')
    setEditQueueWeekdays([])
    setEditPreferredTimeOfDay('')
  }

  async function saveChoreSchedule(chore, field, value) {
    if (robeyRowId == null) {
      return
    }

    setSaveStatus('saving')

    try {
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

      await savePersonChoreSchedule({
        chore,
        personRowId: robeyRowId,
        whenCompletedList,
        choresList,
        patch,
      })

      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to save chore schedule:', err)
      setSaveStatus('error')
    }
  }

  async function saveSubcategorySchedule(subcategory, field, value) {
    setSaveStatus('saving')

    try {
      const patch = {}

      if (field === 'preferredTimeOfDay') {
        patch.preferredTimeOfDay = parsePreferredTimeOfDayRowId(value)
      }

      if (field === 'dueDayOfWeek') {
        patch.dueDayOfWeek = value === '' ? null : Number(value)
        if (value !== '') {
          patch.queueWeekdays = null
        }
      }

      if (field === 'queueWeekdays') {
        const savedQueueWeekdays = normalizeQueueWeekdays(value)
        patch.queueWeekdays = savedQueueWeekdays
        if (savedQueueWeekdays) {
          patch.dueDayOfWeek = null
        }
      }

      await setDoc(
        doc(db, 'RobeySubCategory', String(subcategory.rowId)),
        patch,
        { merge: true },
      )

      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to save subcategory schedule:', err)
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

      const savedQueueWeekdays = normalizeQueueWeekdays(addForm.queueWeekdays)

      await setDoc(doc(db, 'RobeySubCategory', String(newRowId)), {
        rowId: newRowId,
        choreRowId,
        whoRowId: robeyRowId,
        label: addForm.label.trim(),
        sort: maxSort + 1,
        active: 1,
        completedAt: null,
        dueDayOfWeek: savedQueueWeekdays ? null : (addForm.dueDayOfWeek === '' ? null : Number(addForm.dueDayOfWeek)),
        queueWeekdays: savedQueueWeekdays,
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
      const savedQueueWeekdays = normalizeQueueWeekdays(editQueueWeekdays)

      await setDoc(
        doc(db, 'RobeySubCategory', String(rowId)),
        {
          label: editLabel.trim(),
          dueDayOfWeek: savedQueueWeekdays ? null : (editDueDayOfWeek === '' ? null : Number(editDueDayOfWeek)),
          queueWeekdays: savedQueueWeekdays,
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

  return (
    <div className="RobeySubcategories">
      <div className="RobeySubcategories-Container">
        <header className="RobeySubcategories-Header">
          <h2>Robey Subcategories</h2>
          <p>
            Split Robey&apos;s chores into sub-tasks, then assign queue days and time in Chore schedule.
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
              {scheduleRows.length > 0 && (
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
                      <span className="RobeySubcategories-ChoreTimes-Title">Chore schedule</span>
                      <span className="RobeySubcategories-ChoreTimes-Count">
                        {scheduleRows.length}
                      </span>
                    </button>
                  </div>

                  {!choreTimesCollapsed && (
                    <>
                      <p className="RobeySubcategories-ChoreTimes-Note">
                        Assign schedule and time for each subcategory or whole chore.
                        For 2–3×/week or 5×/week, tap the day buttons (Sun–Sat).
                      </p>
                      <div className="RobeySubcategories-ChoreTimes-Table">
                        <div className="RobeySubcategories-ChoreTimes-Table-Header">
                          <span className="RobeySubcategories-ChoreTimes-Table-Header-Label">Task</span>
                          <span className="RobeySubcategories-ChoreTimes-Table-Header-Label">Schedule</span>
                          <span className="RobeySubcategories-ChoreTimes-Table-Header-Label">Time of day</span>
                        </div>
                        <ul className="RobeySubcategories-ChoreTimes-List">
                          {scheduleRows.map((row) => {
                            const scheduleSource = row.type === 'subcategory'
                              ? row.subcategory
                              : completionMap.get(row.chore.choreRowId)
                            const timeValue = scheduleSource?.preferredTimeOfDay != null
                              ? String(scheduleSource.preferredTimeOfDay)
                              : ''

                            return (
                              <li key={row.key} className="RobeySubcategories-ChoreTimes-Item">
                                <span className="RobeySubcategories-ChoreTimes-Label">
                                  {row.label}
                                  {row.parentChore && (
                                    <span className="RobeySubcategories-ChoreTimes-ParentInline">
                                      {' · '}
                                      {row.parentChore}
                                    </span>
                                  )}
                                </span>
                                {renderQueueDayField({
                                  freq: row.freq,
                                  frequencyLabel: row.chore.frequency,
                                  queueWeekdays: scheduleSource?.queueWeekdays,
                                  dueDayOfWeek: scheduleSource?.dueDayOfWeek,
                                  disabled: saveStatus === 'saving',
                                  onQueueWeekdaysChange: (days) => {
                                    if (row.type === 'subcategory') {
                                      saveSubcategorySchedule(row.subcategory, 'queueWeekdays', days)
                                      return
                                    }
                                    saveChoreSchedule(row.chore, 'queueWeekdays', days)
                                  },
                                  onDueDayChange: (value) => {
                                    if (row.type === 'subcategory') {
                                      saveSubcategorySchedule(row.subcategory, 'dueDayOfWeek', value)
                                      return
                                    }
                                    saveChoreSchedule(row.chore, 'dueDayOfWeek', value)
                                  },
                                  queueWeekdayOptions,
                                })}
                                <select
                                  className="RobeySubcategories-ChoreTimes-Select"
                                  value={timeValue}
                                  disabled={saveStatus === 'saving'}
                                  onChange={(e) => {
                                    if (row.type === 'subcategory') {
                                      saveSubcategorySchedule(row.subcategory, 'preferredTimeOfDay', e.target.value)
                                      return
                                    }
                                    saveChoreSchedule(row.chore, 'preferredTimeOfDay', e.target.value)
                                  }}
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
                      onChange={(e) => setAddForm((prev) => ({
                        ...prev,
                        choreRowId: e.target.value,
                        dueDayOfWeek: '',
                        queueWeekdays: [],
                      }))}
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
                      placeholder="ex. empty dishwasher"
                      required
                    />
                  </div>

                  <div className="RobeySubcategories-Form-Field RobeySubcategories-Form-Field-Full">
                    <span className="RobeySubcategories-Form-Label">Schedule</span>
                    {renderQueueDayField({
                      freq: frequencyMap[robeyChores.find(
                        (item) => item.choreRowId === Number(addForm.choreRowId),
                      )?.freqId],
                      frequencyLabel: robeyChores.find(
                        (item) => item.choreRowId === Number(addForm.choreRowId),
                      )?.frequency,
                      queueWeekdays: addForm.queueWeekdays,
                      dueDayOfWeek: addForm.dueDayOfWeek,
                      disabled: saveStatus === 'saving' || !addForm.choreRowId,
                      onQueueWeekdaysChange: (days) => setAddForm((prev) => ({
                        ...prev,
                        queueWeekdays: days,
                        dueDayOfWeek: '',
                      })),
                      onDueDayChange: (value) => setAddForm((prev) => ({
                        ...prev,
                        dueDayOfWeek: value,
                        queueWeekdays: [],
                      })),
                      queueWeekdayOptions,
                    })}
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

                  return (
                    <div key={group.parentChore.choreRowId} className="RobeySubcategories-Group">
                      <div className="RobeySubcategories-Group-Header">
                        <h3 className="RobeySubcategories-Group-Title">{group.parentChore.chore}</h3>
                        <span className="RobeySubcategories-Group-Frequency">{frequencyLabel}</span>
                      </div>

                      <ul className="RobeySubcategories-List">
                        {group.items.map((subcategory) => {
                          const isEditing = editingRowId === subcategory.rowId
                          const parentFreq = frequencyMap[group.parentChore.freqId]
                          const customWeekdays = normalizeQueueWeekdays(subcategory.queueWeekdays)
                          const queueDaysLabel = supportsQueueWeekdaysPicker(parentFreq, group.parentChore.frequency)
                            ? (customWeekdays?.length
                              ? customWeekdays
                                .map((day) => queueWeekdayOptions.find((option) => option.value === day)?.label)
                                .filter(Boolean)
                                .join(', ')
                              : null)
                            : queueWeekdayOptions.find(
                              (option) => option.value === subcategory.dueDayOfWeek,
                            )?.label
                          const preferredTimeLabel = getPreferredTimeOfDayLabel(
                            subcategory.preferredTimeOfDay,
                            timeOfDayOptions,
                          )

                          return (
                            <li key={subcategory.rowId} className="RobeySubcategories-ListItem">
                              <div className="RobeySubcategories-ListItem-Main">
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

                                {isEditing ? (
                                  <>
                                    {renderQueueDayField({
                                      freq: parentFreq,
                                      frequencyLabel: group.parentChore.frequency,
                                      queueWeekdays: editQueueWeekdays,
                                      dueDayOfWeek: editDueDayOfWeek,
                                      disabled: saveStatus === 'saving',
                                      onQueueWeekdaysChange: (days) => {
                                        setEditQueueWeekdays(days)
                                        setEditDueDayOfWeek('')
                                      },
                                      onDueDayChange: (value) => {
                                        setEditDueDayOfWeek(value)
                                        setEditQueueWeekdays([])
                                      },
                                      queueWeekdayOptions,
                                    })}
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
                                    {queueDaysLabel && (
                                      <span className="RobeySubcategories-QueueDay">{queueDaysLabel}</span>
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
