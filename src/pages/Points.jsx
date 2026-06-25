import { useMemo } from 'react'

function Points({ choreInfo, whoList, seedStatus }) {
  const pointsByWho = useMemo(() => {
    return whoList.map((person) => {
      const assignedChores = choreInfo.filter((item) => item.who === person.rowId)
      const totalPoints = assignedChores.reduce((sum, item) => sum + (item.points || 0), 0)

      return {
        rowId: person.rowId,
        name: person.name,
        choreCount: assignedChores.length,
        totalPoints,
      }
    })
  }, [choreInfo, whoList])

  const grandTotal = useMemo(
    () => pointsByWho.reduce((sum, person) => sum + person.totalPoints, 0),
    [pointsByWho],
  )

  return (
    <div className="Points">
      <div className="Points-Container">
        <header className="Points-Header">
          <h2>Points</h2>
          <p>Points added up from each person&apos;s assigned chores.</p>
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
                    <span className="Points-Total">{person.totalPoints} pts</span>
                  </li>
                ))}
              </ul>
              <div className="Points-GrandTotal">
                <span>Combined total</span>
                <strong>{grandTotal} pts</strong>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default Points
