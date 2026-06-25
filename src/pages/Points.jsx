import { useMemo } from 'react'
import { getChallengeLevelStyle } from '../utils/challengeLevelColors'

function Points({ choreInfo, whoList, challengeLevelsList, seedStatus }) {
  const pointsByWho = useMemo(() => {
    return whoList.map((person) => {
      const assignedChores = choreInfo.filter((item) => item.who === person.rowId)

      const levelBreakdown = challengeLevelsList.map((level) => {
        const levelChores = assignedChores.filter((item) => item.challenge === level.challenge)
        const levelPoints = levelChores.reduce((sum, item) => sum + (item.points || 0), 0)

        return {
          challenge: level.challenge,
          choreCount: levelChores.length,
          levelPoints,
        }
      })

      const totalPoints = levelBreakdown.reduce((sum, level) => sum + level.levelPoints, 0)

      return {
        rowId: person.rowId,
        name: person.name,
        choreCount: assignedChores.length,
        totalPoints,
        levelBreakdown,
      }
    })
  }, [choreInfo, whoList, challengeLevelsList])

  const grandTotal = useMemo(
    () => pointsByWho.reduce((sum, person) => sum + person.totalPoints, 0),
    [pointsByWho],
  )

  const combinedBreakdown = useMemo(() => {
    return challengeLevelsList.map((level, levelIndex) => {
      const levelChores = choreInfo.filter((item) => item.challenge === level.challenge)
      const levelPoints = levelChores.reduce((sum, item) => sum + (item.points || 0), 0)

      return {
        challenge: level.challenge,
        choreCount: levelChores.length,
        levelPoints,
        levelIndex,
      }
    })
  }, [choreInfo, challengeLevelsList])

  const combinedChoreCount = useMemo(
    () => combinedBreakdown.reduce((sum, level) => sum + level.choreCount, 0),
    [combinedBreakdown],
  )

  return (
    <div className="Points">
      <div className="Points-Container">
        <header className="Points-Header">
          <h2>Points</h2>
          <p>Points by person, broken down by challenge level.</p>
        </header>
        <section className="Points-Content">
          {seedStatus === 'loading' && <p className="Points-Loading">Loading points...</p>}
          {seedStatus === 'error' && <p className="Points-Error">Could not load points.</p>}
          {seedStatus === 'ready' && (
            <>
              <ul className="Points-List">
                {pointsByWho.map((person) => (
                  <li key={person.rowId} className="Points-ListItem">
                    <div className="Points-ListItem-Info">
                      <span className="Points-Name">{person.name}</span>
                      <span className="Points-ChoreCount">{person.choreCount} chores</span>
                    </div>

                    <div className="Points-BubbleRow">
                      {person.levelBreakdown.map((level, levelIndex) => (
                        <div
                          key={level.challenge}
                          className="Points-LevelBubble"
                          style={getChallengeLevelStyle(levelIndex)}
                        >
                          <span className="Points-LevelBubble-Name">{level.challenge}</span>
                          <span className="Points-LevelBubble-Count">{level.choreCount} chores</span>
                          <span className="Points-LevelBubble-Points">{level.levelPoints} pts</span>
                        </div>
                      ))}
                      <div className="Points-LevelBubble Points-TotalBubble">
                        <span className="Points-LevelBubble-Name">Total</span>
                        <span className="Points-LevelBubble-Count">{person.choreCount} chores</span>
                        <span className="Points-LevelBubble-Points">{person.totalPoints} pts</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="Points-GrandTotal">
                <span className="Points-GrandTotal-Label">Combined total</span>
                <div className="Points-BubbleRow Points-GrandTotal-Bubbles">
                  {combinedBreakdown.map((level) => (
                    <div
                      key={level.challenge}
                      className="Points-LevelBubble"
                      style={getChallengeLevelStyle(level.levelIndex)}
                    >
                      <span className="Points-LevelBubble-Name">{level.challenge}</span>
                      <span className="Points-LevelBubble-Count">{level.choreCount} chores</span>
                      <span className="Points-LevelBubble-Points">{level.levelPoints} pts</span>
                    </div>
                  ))}
                  <div className="Points-LevelBubble Points-TotalBubble">
                    <span className="Points-LevelBubble-Name">Total</span>
                    <span className="Points-LevelBubble-Count">{combinedChoreCount} chores</span>
                    <span className="Points-LevelBubble-Points">{grandTotal} pts</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default Points
