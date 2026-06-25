function AssignedChores({ choreInfo, seedStatus }) {
  return (
    <div className="AssignedChores">
      <div className="AssignedChores-Container">
        <header className="AssignedChores-Header">
          <h2>Assigned Chores</h2>
          <p>Everything on your list, all in one place.</p>
        </header>
        <section className="AssignedChores-Content">
          {seedStatus === 'loading' && <p className="AssignedChores-Loading">Loading chores...</p>}
          {seedStatus === 'error' && <p className="AssignedChores-Error">Could not load chores.</p>}
          {seedStatus === 'ready' && (
            <ul className="AssignedChores-List">
              {choreInfo.map((item) => (
                <li key={item.choreRowId} className="AssignedChores-ListItem">
                  <span className="AssignedChores-ChoreName">{item.chore}</span>
                  {item.name && <span className="AssignedChores-Tag AssignedChores-Tag-Name">{item.name}</span>}
                  {item.challenge && <span className="AssignedChores-Tag AssignedChores-Tag-Challenge">{item.challenge}</span>}
                  {item.frequency && <span className="AssignedChores-Tag AssignedChores-Tag-Frequency">{item.frequency}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default AssignedChores
