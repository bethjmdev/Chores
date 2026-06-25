import { useMemo, useState } from 'react'
import { deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const emptyForm = {
  chore: '',
  freqId: '',
  challengeLevel: '',
  notes: '',
  active: '1',
}

function ManageChores({
  choresList,
  challengeLevelsList,
  frequencyOfList,
  seedStatus,
  reloadData,
}) {
  const [addForm, setAddForm] = useState(emptyForm)
  const [editingRowId, setEditingRowId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [saveStatus, setSaveStatus] = useState('idle')
  const [choreInput, setChoreInput] = useState('')
  const [filterChoreRowId, setFilterChoreRowId] = useState('')
  const [choreListOpen, setChoreListOpen] = useState(false)

  const frequencyMap = useMemo(
    () => Object.fromEntries(frequencyOfList.map((freq) => [freq.rowId, freq.frequency])),
    [frequencyOfList],
  )

  const challengeMap = useMemo(
    () => Object.fromEntries(challengeLevelsList.map((level) => [level.rowId, level.challenge])),
    [challengeLevelsList],
  )

  const sortedChores = useMemo(
    () => [...choresList].sort((a, b) => a.rowId - b.rowId),
    [choresList],
  )

  const choreSearchOptions = useMemo(
    () => [...choresList].sort((a, b) => (a.chore || '').localeCompare(b.chore || '')),
    [choresList],
  )

  const filteredChoreSearchOptions = useMemo(() => {
    const query = choreInput.trim().toLowerCase()
    if (!query) return choreSearchOptions

    return choreSearchOptions.filter((chore) =>
      (chore.chore || '').toLowerCase().includes(query),
    )
  }, [choreSearchOptions, choreInput])

  const filteredChores = useMemo(() => {
    let chores = sortedChores

    if (filterChoreRowId) {
      chores = chores.filter((chore) => chore.rowId === Number(filterChoreRowId))
    } else if (choreInput.trim()) {
      const query = choreInput.trim().toLowerCase()
      chores = chores.filter((chore) => (chore.chore || '').toLowerCase().includes(query))
    }

    return chores
  }, [sortedChores, filterChoreRowId, choreInput])

  function handleChoreInputChange(value) {
    setChoreInput(value)
    setChoreListOpen(true)

    const match = choreSearchOptions.find(
      (chore) => (chore.chore || '').toLowerCase() === value.trim().toLowerCase(),
    )

    setFilterChoreRowId(match ? String(match.rowId) : '')
  }

  function handleChorePick(chore) {
    setChoreInput(chore.chore)
    setFilterChoreRowId(String(chore.rowId))
    setChoreListOpen(false)
  }

  function clearChoreSearch() {
    setChoreInput('')
    setFilterChoreRowId('')
    setChoreListOpen(false)
  }

  function startEdit(chore) {
    setEditingRowId(chore.rowId)
    setEditForm({
      chore: chore.chore || '',
      freqId: chore.freqId != null ? String(chore.freqId) : '',
      challengeLevel: chore.challengeLevel != null ? String(chore.challengeLevel) : '',
      notes: chore.notes || '',
      active: chore.active === 0 ? '0' : '1',
    })
  }

  function cancelEdit() {
    setEditingRowId(null)
    setEditForm(emptyForm)
  }

  async function handleAdd(e) {
    e.preventDefault()

    if (!addForm.chore.trim() || !addForm.freqId || !addForm.challengeLevel) {
      return
    }

    setSaveStatus('saving')

    try {
      const maxRowId = choresList.reduce((max, chore) => Math.max(max, chore.rowId || 0), 0)
      const newRowId = maxRowId + 1

      await setDoc(doc(db, 'Chores', String(newRowId)), {
        rowId: newRowId,
        chore: addForm.chore.trim(),
        freqId: Number(addForm.freqId),
        challengeLevel: Number(addForm.challengeLevel),
        notes: addForm.notes.trim(),
        active: Number(addForm.active),
      })

      setAddForm(emptyForm)
      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to add chore:', err)
      setSaveStatus('error')
    }
  }

  async function handleSaveEdit(rowId) {
    if (!editForm.chore.trim() || !editForm.freqId || !editForm.challengeLevel) {
      return
    }

    setSaveStatus('saving')

    try {
      await setDoc(
        doc(db, 'Chores', String(rowId)),
        {
          rowId,
          chore: editForm.chore.trim(),
          freqId: Number(editForm.freqId),
          challengeLevel: Number(editForm.challengeLevel),
          notes: editForm.notes.trim(),
          active: Number(editForm.active),
        },
        { merge: true },
      )

      cancelEdit()
      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to update chore:', err)
      setSaveStatus('error')
    }
  }

  async function handleDelete(chore) {
    const choreName = chore.chore || `row ${chore.rowId}`
    if (!window.confirm(`Delete "${choreName}"?`)) {
      return
    }

    setSaveStatus('saving')

    try {
      await deleteDoc(doc(db, 'Chores', String(chore.rowId)))
      await deleteDoc(doc(db, 'Assigned_To', String(chore.rowId))).catch(() => {})

      if (editingRowId === chore.rowId) {
        cancelEdit()
      }

      await reloadData({ silent: true })
      setSaveStatus('idle')
    } catch (err) {
      console.error('Failed to delete chore:', err)
      setSaveStatus('error')
    }
  }

  function renderFormFields(form, setForm, idPrefix) {
    return (
      <>
        <div className="ManageChores-Form-Field">
          <label className="ManageChores-Form-Label" htmlFor={`${idPrefix}-chore`}>
            Chore
          </label>
          <input
            id={`${idPrefix}-chore`}
            type="text"
            className="ManageChores-Form-Input"
            value={form.chore}
            onChange={(e) => setForm((prev) => ({ ...prev, chore: e.target.value }))}
            required
          />
        </div>

        <div className="ManageChores-Form-Field">
          <label className="ManageChores-Form-Label" htmlFor={`${idPrefix}-frequency`}>
            Frequency
          </label>
          <select
            id={`${idPrefix}-frequency`}
            className="ManageChores-Form-Select"
            value={form.freqId}
            onChange={(e) => setForm((prev) => ({ ...prev, freqId: e.target.value }))}
            required
          >
            <option value="">Select frequency</option>
            {frequencyOfList.map((freq) => (
              <option key={freq.rowId} value={freq.rowId}>
                {freq.frequency}
              </option>
            ))}
          </select>
        </div>

        <div className="ManageChores-Form-Field">
          <label className="ManageChores-Form-Label" htmlFor={`${idPrefix}-challenge`}>
            Challenge
          </label>
          <select
            id={`${idPrefix}-challenge`}
            className="ManageChores-Form-Select"
            value={form.challengeLevel}
            onChange={(e) => setForm((prev) => ({ ...prev, challengeLevel: e.target.value }))}
            required
          >
            <option value="">Select challenge</option>
            {challengeLevelsList.map((level) => (
              <option key={level.rowId} value={level.rowId}>
                {level.challenge}
              </option>
            ))}
          </select>
        </div>

        <div className="ManageChores-Form-Field">
          <label className="ManageChores-Form-Label" htmlFor={`${idPrefix}-notes`}>
            Notes
          </label>
          <input
            id={`${idPrefix}-notes`}
            type="text"
            className="ManageChores-Form-Input"
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </div>

        <div className="ManageChores-Form-Field">
          <label className="ManageChores-Form-Label" htmlFor={`${idPrefix}-active`}>
            Active
          </label>
          <select
            id={`${idPrefix}-active`}
            className="ManageChores-Form-Select"
            value={form.active}
            onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.value }))}
          >
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </div>
      </>
    )
  }

  return (
    <div className="ManageChores">
      <div className="ManageChores-Container">
        <header className="ManageChores-Header">
          <h2>Manage Chores</h2>
          <p>Add, edit, or delete chores in the Chores table.</p>
        </header>

        <section className="ManageChores-Content">
          {seedStatus === 'loading' && <p className="ManageChores-Loading">Loading chores...</p>}
          {seedStatus === 'error' && <p className="ManageChores-Error">Could not load chores.</p>}

          {seedStatus === 'ready' && (
            <>
              <form className="ManageChores-Form" onSubmit={handleAdd}>
                <h3 className="ManageChores-Form-Title">Add chore</h3>
                <div className="ManageChores-Form-Grid">
                  {renderFormFields(addForm, setAddForm, 'add')}
                </div>
                <div className="ManageChores-Form-Actions">
                  <button
                    type="submit"
                    className="ManageChores-Button ManageChores-Button-Primary"
                    disabled={saveStatus === 'saving'}
                  >
                    Add
                  </button>
                </div>
              </form>

              <div className="ManageChores-SearchBar">
                <label className="ManageChores-SearchLabel" htmlFor="manage-chore-search">
                  Chore
                </label>
                <div className="ManageChores-Combobox">
                  <input
                    id="manage-chore-search"
                    type="text"
                    className="ManageChores-Combobox-Input"
                    value={choreInput}
                    onChange={(e) => handleChoreInputChange(e.target.value)}
                    onFocus={() => setChoreListOpen(true)}
                    onBlur={() => {
                      setTimeout(() => setChoreListOpen(false), 150)
                    }}
                    placeholder="Type or select a chore"
                    autoComplete="off"
                  />
                  {choreListOpen && filteredChoreSearchOptions.length > 0 && (
                    <ul className="ManageChores-Combobox-List">
                      {filteredChoreSearchOptions.map((chore) => (
                        <li key={chore.rowId}>
                          <button
                            type="button"
                            className="ManageChores-Combobox-Option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleChorePick(chore)}
                          >
                            {chore.chore}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  className="ManageChores-SearchButton-Clear"
                  onClick={clearChoreSearch}
                >
                  Clear
                </button>
              </div>

              <div className="ManageChores-Table-Wrap">
                <table className="ManageChores-Table">
                  <thead>
                    <tr>
                      <th>Chore</th>
                      <th>Frequency</th>
                      <th>Challenge</th>
                      <th>Notes</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChores.map((chore) => {
                      const isEditing = editingRowId === chore.rowId

                      if (isEditing) {
                        return (
                          <tr key={chore.rowId} className="ManageChores-Table-Row-Editing">
                            <td colSpan={6}>
                              <div className="ManageChores-EditForm">
                                <div className="ManageChores-Form-Grid">
                                  {renderFormFields(editForm, setEditForm, `edit-${chore.rowId}`)}
                                </div>
                                <div className="ManageChores-Form-Actions">
                                  <button
                                    type="button"
                                    className="ManageChores-Button ManageChores-Button-Primary"
                                    disabled={saveStatus === 'saving'}
                                    onClick={() => handleSaveEdit(chore.rowId)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="ManageChores-Button"
                                    onClick={cancelEdit}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr key={chore.rowId}>
                          <td>{chore.chore}</td>
                          <td>{frequencyMap[chore.freqId] || '—'}</td>
                          <td>{challengeMap[chore.challengeLevel] || '—'}</td>
                          <td>{chore.notes || '—'}</td>
                          <td>{chore.active === 0 ? 'No' : 'Yes'}</td>
                          <td>
                            <div className="ManageChores-Table-Actions">
                              <button
                                type="button"
                                className="ManageChores-Button"
                                onClick={() => startEdit(chore)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="ManageChores-Button ManageChores-Button-Delete"
                                onClick={() => handleDelete(chore)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {saveStatus === 'error' && (
                <p className="ManageChores-Error">Something went wrong. Try again.</p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default ManageChores
