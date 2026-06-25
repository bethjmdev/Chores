import { useMemo, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

function AssignedChores({ choreInfo, setChoreInfo, whoList, seedStatus }) {
  const [draggedChoreRowId, setDraggedChoreRowId] = useState(null)
  const [dragOverWho, setDragOverWho] = useState(null)

  const whoMap = useMemo(
    () => Object.fromEntries(whoList.map((person) => [person.rowId, person.name])),
    [whoList],
  )

  const sections = useMemo(() => {
    const whoSections = whoList.map((person) => ({
      whoRowId: person.rowId,
      title: person.name,
    }))

    return [
      ...whoSections,
      { whoRowId: null, title: 'Unassigned' },
    ]
  }, [whoList])

  function getChoresForSection(whoRowId) {
    return choreInfo.filter((item) => {
      if (whoRowId === null) return item.who == null
      return item.who === whoRowId
    })
  }

  async function handleDrop(targetWhoRowId) {
    if (draggedChoreRowId == null) return

    const choreRowId = draggedChoreRowId
    const currentItem = choreInfo.find((item) => item.choreRowId === choreRowId)
    if (!currentItem || currentItem.who === targetWhoRowId) {
      setDraggedChoreRowId(null)
      setDragOverWho(null)
      return
    }

    setChoreInfo((prev) =>
      prev.map((item) =>
        item.choreRowId === choreRowId
          ? {
              ...item,
              who: targetWhoRowId,
              name: targetWhoRowId != null ? whoMap[targetWhoRowId] : null,
            }
          : item,
      ),
    )

    try {
      await updateDoc(doc(db, 'Assigned_To', String(choreRowId)), {
        who: targetWhoRowId,
      })
    } catch (err) {
      console.error('Failed to update assignment:', err)
      setChoreInfo((prev) =>
        prev.map((item) => (item.choreRowId === choreRowId ? currentItem : item)),
      )
    }

    setDraggedChoreRowId(null)
    setDragOverWho(null)
  }

  return (
    <div className="AssignedChores">
      <div className="AssignedChores-Container">
        <header className="AssignedChores-Header">
          <h2>Assigned Chores</h2>
          <p>Drag chores between people to reassign.</p>
        </header>
        <section className="AssignedChores-Content">
          {seedStatus === 'loading' && <p className="AssignedChores-Loading">Loading chores...</p>}
          {seedStatus === 'error' && <p className="AssignedChores-Error">Could not load chores.</p>}
          {seedStatus === 'ready' && (
            <div className="AssignedChores-Columns">
              {sections.map((section) => {
                const sectionKey = section.whoRowId ?? 'unassigned'
                const sectionChores = getChoresForSection(section.whoRowId)

                return (
                  <div
                    key={sectionKey}
                    className={`AssignedChores-Column${dragOverWho === sectionKey ? ' AssignedChores-Column-DragOver' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOverWho(sectionKey)
                    }}
                    onDragLeave={() => setDragOverWho(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleDrop(section.whoRowId)
                    }}
                  >
                    <div className="AssignedChores-Column-Header">
                      <h3 className="AssignedChores-Column-Title">{section.title}</h3>
                      <span className="AssignedChores-Column-Count">{sectionChores.length}</span>
                    </div>

                    <ul className="AssignedChores-List">
                      {sectionChores.map((item) => (
                        <li
                          key={item.choreRowId}
                          className={`AssignedChores-ListItem${draggedChoreRowId === item.choreRowId ? ' AssignedChores-ListItem-Dragging' : ''}`}
                          draggable
                          onDragStart={() => setDraggedChoreRowId(item.choreRowId)}
                          onDragEnd={() => {
                            setDraggedChoreRowId(null)
                            setDragOverWho(null)
                          }}
                        >
                          <span className="AssignedChores-ChoreName">{item.chore}</span>
                          {item.challenge && (
                            <span className="AssignedChores-Tag AssignedChores-Tag-Challenge">{item.challenge}</span>
                          )}
                          {item.frequency && (
                            <span className="AssignedChores-Tag AssignedChores-Tag-Frequency">{item.frequency}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default AssignedChores
