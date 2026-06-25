import { useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getChallengeColorMap, getChallengeNameStyle } from '../utils/challengeLevelColors'
import { sortChoresByPointsThenFrequency } from '../utils/sortChores'

function All({ choreInfo, setChoreInfo, whoList, challengeLevelsList, frequencyOfList, seedStatus }) {
  const [editingChoreRowId, setEditingChoreRowId] = useState(null)
  const [filterChallenge, setFilterChallenge] = useState('')
  const [filterFrequency, setFilterFrequency] = useState('')

  const whoMap = useMemo(
    () => Object.fromEntries(whoList.map((person) => [person.rowId, person.name])),
    [whoList],
  )

  const challengeColorMap = useMemo(
    () => getChallengeColorMap(challengeLevelsList),
    [challengeLevelsList],
  )

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

    return sortChoresByPointsThenFrequency(chores)
  }, [choreInfo, filterChallenge, filterFrequency])

  function handleClearFilters() {
    setFilterChallenge('')
    setFilterFrequency('')
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
