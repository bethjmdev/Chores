import { useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getChallengeColorMap, getChallengeNameStyle } from '../utils/challengeLevelColors'
import { sortChoresByPointsThenFrequency } from '../utils/sortChores'

function All({ choreInfo, setChoreInfo, whoList, challengeLevelsList, frequencyOfList, seedStatus }) {
  const [editingChoreRowId, setEditingChoreRowId] = useState(null)
  const [filterChallenge, setFilterChallenge] = useState('')
  const [filterFrequency, setFilterFrequency] = useState('')
  const [choreInput, setChoreInput] = useState('')
  const [filterChoreRowId, setFilterChoreRowId] = useState('')
  const [choreListOpen, setChoreListOpen] = useState(false)

  const whoMap = useMemo(
    () => Object.fromEntries(whoList.map((person) => [person.rowId, person.name])),
    [whoList],
  )

  const challengeColorMap = useMemo(
    () => getChallengeColorMap(challengeLevelsList),
    [challengeLevelsList],
  )

  const choreSearchOptions = useMemo(
    () => [...choreInfo].sort((a, b) => (a.chore || '').localeCompare(b.chore || '')),
    [choreInfo],
  )

  const filteredChoreSearchOptions = useMemo(() => {
    const query = choreInput.trim().toLowerCase()
    if (!query) return choreSearchOptions

    return choreSearchOptions.filter((item) =>
      (item.chore || '').toLowerCase().includes(query),
    )
  }, [choreSearchOptions, choreInput])

  function handleChoreInputChange(value) {
    setChoreInput(value)
    setChoreListOpen(true)

    const match = choreSearchOptions.find(
      (item) => (item.chore || '').toLowerCase() === value.trim().toLowerCase(),
    )

    setFilterChoreRowId(match ? String(match.choreRowId) : '')
  }

  function handleChorePick(item) {
    setChoreInput(item.chore)
    setFilterChoreRowId(String(item.choreRowId))
    setChoreListOpen(false)
  }

  const sortedChores = useMemo(() => {
    let chores = choreInfo

    if (filterChallenge) {
      const levelId = Number(filterChallenge)
      chores = chores.filter((item) => item.challengeLevelId === levelId)
    }

    if (filterFrequency) {
      const freqId = Number(filterFrequency)
      chores = chores.filter((item) => item.freqId === freqId)
    }

    if (filterChoreRowId) {
      chores = chores.filter((item) => item.choreRowId === Number(filterChoreRowId))
    } else if (choreInput.trim()) {
      const query = choreInput.trim().toLowerCase()
      chores = chores.filter((item) => (item.chore || '').toLowerCase().includes(query))
    }

    return sortChoresByPointsThenFrequency(chores)
  }, [choreInfo, filterChallenge, filterFrequency, filterChoreRowId, choreInput])

  function handleClearFilters() {
    setFilterChallenge('')
    setFilterFrequency('')
    setChoreInput('')
    setFilterChoreRowId('')
    setChoreListOpen(false)
  }

  async function handleReassign(choreRowId, whoValue) {
    const whoRowId = whoValue === '' ? null : Number(whoValue)
    const currentItem = choreInfo.find((item) => item.choreRowId === choreRowId)
    if (!currentItem || currentItem.who === whoRowId) {
      setEditingChoreRowId(null)
      return
    }

    setChoreInfo((prev) =>
      prev.map((item) =>
        item.choreRowId === choreRowId
          ? {
              ...item,
              who: whoRowId,
              name: whoRowId != null ? whoMap[whoRowId] : null,
            }
          : item,
      ),
    )

    try {
      await setDoc(
        doc(db, 'Assigned_To', String(choreRowId)),
        { who: whoRowId, choreRowId },
        { merge: true },
      )
    } catch (err) {
      console.error('Failed to update assignment:', err)
      setChoreInfo((prev) =>
        prev.map((item) => (item.choreRowId === choreRowId ? currentItem : item)),
      )
    }

    setEditingChoreRowId(null)
  }

  return (
    <div className="All">
      <div className="All-Container">
        <header className="All-Header">
          <h2>All</h2>
          <p>All chores from Assigned_To. Double-click a row to reassign.</p>
        </header>
        <section className="All-Content">
          {seedStatus === 'loading' && <p className="All-Loading">Loading chores...</p>}
          {seedStatus === 'error' && <p className="All-Error">Could not load chores.</p>}
          {seedStatus === 'ready' && (
            <>
              <div className="All-SortBar">
                <label className="All-SortLabel" htmlFor="all-challenge-sort">Challenge</label>
                <select
                  id="all-challenge-sort"
                  className="All-SortSelect"
                  value={filterChallenge}
                  onChange={(e) => setFilterChallenge(e.target.value)}
                >
                  <option value="">All</option>
                  {challengeLevelsList.map((level) => (
                    <option key={level.rowId} value={level.rowId}>
                      {level.challenge}
                    </option>
                  ))}
                </select>

                <label className="All-SortLabel" htmlFor="all-frequency-sort">Frequency</label>
                <select
                  id="all-frequency-sort"
                  className="All-SortSelect"
                  value={filterFrequency}
                  onChange={(e) => setFilterFrequency(e.target.value)}
                >
                  <option value="">All</option>
                  {frequencyOfList.map((freq) => (
                    <option key={freq.rowId} value={freq.rowId}>
                      {freq.frequency}
                    </option>
                  ))}
                </select>

                <label className="All-SortLabel" htmlFor="all-chore-search">Chore</label>
                <div className="All-Combobox">
                  <input
                    id="all-chore-search"
                    type="text"
                    className="All-Combobox-Input"
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
                    <ul className="All-Combobox-List">
                      {filteredChoreSearchOptions.map((item) => (
                        <li key={item.choreRowId}>
                          <button
                            type="button"
                            className="All-Combobox-Option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleChorePick(item)}
                          >
                            {item.chore}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  className="All-SortButton-Clear"
                  onClick={handleClearFilters}
                >
                  Clear
                </button>
              </div>

              <ul className="All-List">
                {sortedChores.map((item) => (
                  <li
                    key={item.choreRowId}
                    className={`All-ListItem${editingChoreRowId === item.choreRowId ? ' All-ListItem-Editing' : ''}`}
                    onDoubleClick={() => setEditingChoreRowId(item.choreRowId)}
                  >
                    <div className="All-ListItem-Main">
                      <span className="All-ChoreName">{item.chore}</span>
                      {item.notes && <span className="All-ChoreNotes">{item.notes}</span>}
                      <div className="All-ListItem-Tags">
                        {item.challenge && (
                          <span
                            className="All-Tag All-Tag-Challenge"
                            style={getChallengeNameStyle(item.challenge, challengeColorMap)}
                          >
                            {item.challenge}
                          </span>
                        )}
                        {item.frequency && <span className="All-Tag All-Tag-Frequency">{item.frequency}</span>}
                        <span className="All-Tag All-Tag-Points">{item.points} pts</span>
                      </div>
                    </div>

                    <div className="All-ListItem-Assign">
                      {editingChoreRowId === item.choreRowId ? (
                        <select
                          className="All-AssignSelect"
                          autoFocus
                          value={item.who ?? ''}
                          onChange={(e) => handleReassign(item.choreRowId, e.target.value)}
                          onBlur={() => {
                            setTimeout(() => setEditingChoreRowId(null), 150)
                          }}
                        >
                          <option value="">Unassigned</option>
                          {whoList.map((person) => (
                            <option key={person.rowId} value={person.rowId}>
                              {person.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="All-AssignedTo">{item.name || 'Unassigned'}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default All
