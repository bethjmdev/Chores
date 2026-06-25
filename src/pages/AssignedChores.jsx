import { useMemo, useState } from 'react'
import { collection, doc, getDocs, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { getChallengeColorMap, getChallengeNameStyle } from '../utils/challengeLevelColors'
import { sortChoresByFrequency } from '../utils/sortChores'
import { useViewSelection } from '../utils/viewSelectionStorage'

const ASSIGNED_VIEW_STORAGE_KEY = 'chores-view-assigned-chores'

function getSectionKey(whoRowId) {
  return whoRowId ?? 'unassigned'
}

function getTrackingWhoRowId(entry) {
  return entry.who ?? entry.whoRowid ?? null
}

function getTrackingChoreRowId(entry) {
  return entry.chore ?? entry.choreRowid ?? null
}

function getTrackingIsSuccess(entry) {
  if (entry.isSuccess != null) {
    return Number(entry.isSuccess)
  }

  if (entry.isSuccessful != null) {
    return Number(entry.isSuccessful)
  }

  return null
}

async function hasFailureInTracking(whoRowId, choreRowId) {
  const snapshot = await getDocs(collection(db, 'Success_Tracking'))

  return snapshot.docs.some((docSnap) => {
    const data = docSnap.data()
    return (
      getTrackingWhoRowId(data) === whoRowId &&
      getTrackingChoreRowId(data) === choreRowId &&
      getTrackingIsSuccess(data) === 0
    )
  })
}

function AssignedChores({ choreInfo, setChoreInfo, whoList, challengeLevelsList, seedStatus, reloadData }) {
  const [draggedChoreRowId, setDraggedChoreRowId] = useState(null)
  const [dragOverWho, setDragOverWho] = useState(null)
  const [assignWarning, setAssignWarning] = useState(null)

  const sectionKeys = useMemo(
    () => whoList.map((person) => getSectionKey(person.rowId)).concat(['unassigned']),
    [whoList],
  )

  const [selectedSectionKeys, setSelectedSectionKeys] = useViewSelection(
    ASSIGNED_VIEW_STORAGE_KEY,
    sectionKeys,
  )

  const challengeColorMap = useMemo(
    () => getChallengeColorMap(challengeLevelsList),
    [challengeLevelsList],
  )

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

  const isShowingAll = selectedSectionKeys === null

  const visibleSections = useMemo(() => {
    if (isShowingAll) return sections
    return sections.filter((section) => selectedSectionKeys.has(getSectionKey(section.whoRowId)))
  }, [sections, selectedSectionKeys, isShowingAll])

  function showAllSections() {
    setSelectedSectionKeys(null)
  }

  function clearSelection() {
    setSelectedSectionKeys(null)
  }

  function selectSection(sectionKey) {
    setSelectedSectionKeys((prev) => {
      if (prev === null) {
        return new Set([sectionKey])
      }

      const next = new Set(prev)
      if (next.has(sectionKey)) {
        next.delete(sectionKey)
        return next.size === 0 ? null : next
      }

      next.add(sectionKey)
      return next
    })
  }

  function isSectionSelected(sectionKey) {
    if (isShowingAll) return true
    return selectedSectionKeys.has(sectionKey)
  }

  function getChoresForSection(whoRowId) {
    const sectionChores = choreInfo.filter((item) => {
      if (whoRowId === null) return item.who == null
      return item.who === whoRowId
    })

    return sortChoresByFrequency(sectionChores)
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

    const shouldWarn =
      targetWhoRowId != null &&
      (await hasFailureInTracking(targetWhoRowId, choreRowId))

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

      if (shouldWarn) {
        setAssignWarning({
          choreName: currentItem.chore || `Chore ${choreRowId}`,
          personName: whoMap[targetWhoRowId],
        })
      }

      if (reloadData) {
        await reloadData({ silent: true })
      }
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
            <>
              <div className="AssignedChores-Filter">
                <span className="AssignedChores-Filter-Label">View</span>
                <button
                  type="button"
                  className={`AssignedChores-Filter-Button${isShowingAll ? ' AssignedChores-Filter-Button-Active' : ''}`}
                  onClick={showAllSections}
                >
                  All
                </button>
                {sections.map((section) => {
                  const sectionKey = getSectionKey(section.whoRowId)

                  return (
                    <button
                      key={sectionKey}
                      type="button"
                      className={`AssignedChores-Filter-Button${isSectionSelected(sectionKey) && !isShowingAll ? ' AssignedChores-Filter-Button-Active' : ''}`}
                      onClick={() => selectSection(sectionKey)}
                    >
                      {section.title}
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

              {visibleSections.length === 0 ? (
                <p className="AssignedChores-Empty">No columns selected. Click All or Clear to reset.</p>
              ) : (
                <div className="AssignedChores-Columns">
                  {visibleSections.map((section) => {
                const sectionKey = getSectionKey(section.whoRowId)
                const sectionChores = getChoresForSection(section.whoRowId)
                const sectionPoints = sectionChores.reduce((sum, item) => sum + (item.points || 0), 0)

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
                      <div className="AssignedChores-Column-Stats">
                        <span className="AssignedChores-Column-Count">{sectionChores.length}</span>
                        <span className="AssignedChores-Column-Points">{sectionPoints} pts</span>
                      </div>
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
                          {item.notes && (
                            <span className="AssignedChores-ChoreNotes">{item.notes}</span>
                          )}
                          {item.challenge && (
                            <span
                              className="AssignedChores-Tag AssignedChores-Tag-Challenge"
                              style={getChallengeNameStyle(item.challenge, challengeColorMap)}
                            >
                              {item.challenge}
                            </span>
                          )}
                          {item.points > 0 && (
                            <span className="AssignedChores-Tag AssignedChores-Tag-Points">{item.points} pt{item.points !== 1 ? 's' : ''}</span>
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
            </>
          )}
        </section>
      </div>

      {assignWarning && (
        <div className="AssignedChores-Warning-Overlay">
          <div className="AssignedChores-Warning">
            <h3 className="AssignedChores-Warning-Title">Success_Tracking warning</h3>
            <p className="AssignedChores-Warning-Text">
              <strong>{assignWarning.choreName}</strong> is marked unsuccessful (0) for{' '}
              <strong>{assignWarning.personName}</strong> in Success_Tracking.
            </p>
            <p className="AssignedChores-Warning-Note">The chore was still assigned.</p>
            <button
              type="button"
              className="AssignedChores-Warning-Button"
              onClick={() => setAssignWarning(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AssignedChores
