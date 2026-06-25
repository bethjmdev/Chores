import { useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getChallengeColorMap, getChallengeNameStyle } from '../utils/challengeLevelColors'
import { sortChoresByPointsThenFrequency } from '../utils/sortChores'

function All({ choreInfo, setChoreInfo, whoList, challengeLevelsList, seedStatus }) {
  const [editingChoreRowId, setEditingChoreRowId] = useState(null)

  const whoMap = useMemo(
    () => Object.fromEntries(whoList.map((person) => [person.rowId, person.name])),
    [whoList],
  )

  const challengeColorMap = useMemo(
    () => getChallengeColorMap(challengeLevelsList),
    [challengeLevelsList],
  )

  const sortedChores = useMemo(
    () => sortChoresByPointsThenFrequency(choreInfo),
    [choreInfo],
  )

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
          )}
        </section>
      </div>
    </div>
  )
}

export default All
