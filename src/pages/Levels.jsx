import { useMemo, useState } from 'react'
import { getChallengeLevelStyle } from '../utils/challengeLevelColors'
import { sortChoresByFrequency } from '../utils/sortChores'

function getPersonKey(rowId) {
  return String(rowId)
}

function Levels({ choreInfo, whoList, challengeLevelsList, seedStatus }) {
  const [selectedPersonKeys, setSelectedPersonKeys] = useState(null)

  const isShowingAll = selectedPersonKeys === null

  const visibleWhoList = useMemo(() => {
    if (isShowingAll) return whoList
    return whoList.filter((person) => selectedPersonKeys.has(getPersonKey(person.rowId)))
  }, [whoList, selectedPersonKeys, isShowingAll])

  function showAllPeople() {
    setSelectedPersonKeys(null)
  }

  function clearSelection() {
    setSelectedPersonKeys(null)
  }

  function selectPerson(personKey) {
    setSelectedPersonKeys((prev) => {
      if (prev === null) {
        return new Set([personKey])
      }

      const next = new Set(prev)
      if (next.has(personKey)) {
        next.delete(personKey)
        return next.size === 0 ? null : next
      }

      next.add(personKey)
      return next
    })
  }

  function isPersonSelected(personKey) {
    if (isShowingAll) return true
    return selectedPersonKeys.has(personKey)
  }

  function getChoresForPersonAndLevel(whoRowId, challengeName) {
    const levelChores = choreInfo.filter(
      (item) => item.who === whoRowId && item.challenge === challengeName,
    )

    return sortChoresByFrequency(levelChores)
  }

  return (
    <div className="Levels">
      <div className="Levels-Container">
        <header className="Levels-Header">
          <h2>Levels</h2>
          <p>Assigned chores grouped by person and challenge level.</p>
        </header>
        <section className="Levels-Content">
          {seedStatus === 'loading' && <p className="Levels-Loading">Loading levels...</p>}
          {seedStatus === 'error' && <p className="Levels-Error">Could not load levels.</p>}
          {seedStatus === 'ready' && (
            <>
              <div className="AssignedChores-Filter">
                <span className="AssignedChores-Filter-Label">View</span>
                <button
                  type="button"
                  className={`AssignedChores-Filter-Button${isShowingAll ? ' AssignedChores-Filter-Button-Active' : ''}`}
                  onClick={showAllPeople}
                >
                  All
                </button>
                {whoList.map((person) => {
                  const personKey = getPersonKey(person.rowId)

                  return (
                    <button
                      key={personKey}
                      type="button"
                      className={`AssignedChores-Filter-Button${isPersonSelected(personKey) && !isShowingAll ? ' AssignedChores-Filter-Button-Active' : ''}`}
                      onClick={() => selectPerson(personKey)}
                    >
                      {person.name}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="AssignedChores-Filter-Button AssignedChores-Filter-Button-Clear"
                  onClick={clearSelection}
                >
                  Clear
                </button>
              </div>

              {visibleWhoList.length === 0 ? (
                <p className="AssignedChores-Empty">No columns selected. Click All or Clear to reset.</p>
              ) : (
                <div className="Levels-WhoColumns">
                  {visibleWhoList.map((person) => (
                    <div key={person.rowId} className="Levels-WhoColumn">
                      <div className="Levels-WhoColumn-Header">
                        <h3 className="Levels-WhoColumn-Title">{person.name}</h3>
                      </div>

                      <div
                        className="Levels-LevelColumns"
                        style={{ gridTemplateColumns: `repeat(${challengeLevelsList.length}, minmax(0, 1fr))` }}
                      >
                        {challengeLevelsList.map((level, levelIndex) => {
                          const levelChores = getChoresForPersonAndLevel(person.rowId, level.challenge)
                          const levelPoints = levelChores.reduce((sum, item) => sum + (item.points || 0), 0)

                          return (
                            <div
                              key={level.rowId}
                              className="Levels-LevelColumn"
                              style={getChallengeLevelStyle(levelIndex)}
                            >
                              <div className="Levels-LevelColumn-Header">
                                <h4 className="Levels-LevelColumn-Title">{level.challenge}</h4>
                                <div className="Levels-LevelColumn-Stats">
                                  <span className="Levels-LevelColumn-Count">{levelChores.length}</span>
                                  <span className="Levels-LevelColumn-Points">{levelPoints} pts</span>
                                </div>
                              </div>

                              <ul className="Levels-ChoreList">
                                {levelChores.map((item) => (
                                  <li key={item.choreRowId} className="Levels-ChoreListItem">
                                    <span className="Levels-ChoreName">{item.chore}</span>
                                    {item.frequency && (
                                      <span className="Levels-ChoreFrequency">{item.frequency}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default Levels
