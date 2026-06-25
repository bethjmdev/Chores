import { useEffect, useMemo, useState } from 'react'
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

const goodAtWhoRowId = 3

function getWhoRowId(entry) {
  return entry.who ?? entry.whoRowid ?? null
}

function getChoreRowId(entry) {
  return entry.chore ?? entry.choreRowid ?? null
}

function getIsSuccess(entry) {
  if (entry.isSuccess != null) {
    return Number(entry.isSuccess)
  }

  if (entry.isSuccessful != null) {
    return Number(entry.isSuccessful)
  }

  return null
}

function matchesWhoChore(entry, whoNum, choreNum) {
  return Number(getWhoRowId(entry)) === whoNum && Number(getChoreRowId(entry)) === choreNum
}

function getTrackingDocId(whoNum, choreNum) {
  return `${whoNum}_${choreNum}`
}

function findExistingEntries(whoRowId, choreRowId, entries) {
  const whoNum = Number(whoRowId)
  const choreNum = Number(choreRowId)

  return entries.filter((entry) => matchesWhoChore(entry, whoNum, choreNum))
}

function ChoreHover({ choreRowId, choreName, choreDetailsMap, children }) {
  const details = choreDetailsMap[choreRowId]

  return (
    <span className="Successful-ChoreHover">
      {children ?? choreName}
      <span className="Successful-ChoreHover-Tooltip">
        <span className="Successful-ChoreHover-Tooltip-Row">
          Challenge: {details?.challenge || '—'}
        </span>
        <span className="Successful-ChoreHover-Tooltip-Row">
          Frequency: {details?.frequency || '—'}
        </span>
        <span className="Successful-ChoreHover-Tooltip-Row">
          Assigned to: {details?.name || 'Unassigned'}
        </span>
      </span>
    </span>
  )
}

function Successful({ whoList, choreInfo, seedStatus }) {
  const [selectedWho, setSelectedWho] = useState('')
  const [choreInput, setChoreInput] = useState('')
  const [selectedChore, setSelectedChore] = useState('')
  const [choreListOpen, setChoreListOpen] = useState(false)
  const [isSuccess, setIsSuccess] = useState('')
  const [trackingList, setTrackingList] = useState([])
  const [trackingStatus, setTrackingStatus] = useState('loading')
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [updatingFailureKey, setUpdatingFailureKey] = useState(null)

  const whoMap = useMemo(
    () => Object.fromEntries(whoList.map((person) => [person.rowId, person.name])),
    [whoList],
  )

  const whoFormOptions = useMemo(
    () => whoList.filter((person) => person.rowId !== goodAtWhoRowId),
    [whoList],
  )

  const choreMap = useMemo(
    () => Object.fromEntries(choreInfo.map((item) => [item.choreRowId, item.chore])),
    [choreInfo],
  )

  const choreDetailsMap = useMemo(
    () => Object.fromEntries(choreInfo.map((item) => [item.choreRowId, item])),
    [choreInfo],
  )

  const failuresByWho = useMemo(() => {
    const grouped = Object.fromEntries(whoList.map((person) => [person.rowId, []]))
    const seen = new Set()

    trackingList.forEach((entry) => {
      if (getIsSuccess(entry) !== 0) return

      const whoRowId = getWhoRowId(entry)
      const choreRowId = getChoreRowId(entry)
      if (whoRowId == null || choreRowId == null) return

      const key = `${whoRowId}-${choreRowId}`
      if (seen.has(key)) return
      seen.add(key)

      if (!grouped[whoRowId]) {
        grouped[whoRowId] = []
      }

      grouped[whoRowId].push({
        choreRowId,
        choreName: choreMap[choreRowId] || choreRowId,
      })
    })

    Object.values(grouped).forEach((failures) => {
      failures.sort((a, b) => String(a.choreName).localeCompare(String(b.choreName)))
    })

    return grouped
  }, [trackingList, whoList, choreMap])

  const sharedWeakChores = useMemo(() => {
    const otherWhoIds = whoList
      .filter((person) => person.rowId !== goodAtWhoRowId)
      .map((person) => person.rowId)

    if (otherWhoIds.length === 0) return []

    const failuresByChore = {}

    trackingList.forEach((entry) => {
      if (getIsSuccess(entry) !== 0) return

      const whoRowId = getWhoRowId(entry)
      const choreRowId = getChoreRowId(entry)
      if (whoRowId == null || choreRowId == null) return

      if (!failuresByChore[choreRowId]) {
        failuresByChore[choreRowId] = new Set()
      }

      failuresByChore[choreRowId].add(whoRowId)
    })

    return Object.entries(failuresByChore)
      .filter(([, whoIds]) => {
        const everyoneElseFailed = otherWhoIds.every((whoRowId) => whoIds.has(whoRowId))
        const goodPersonDidNotFail = !whoIds.has(goodAtWhoRowId)
        return everyoneElseFailed && goodPersonDidNotFail
      })
      .map(([choreRowId]) => ({
        choreRowId: Number(choreRowId),
        choreName: choreMap[choreRowId] || choreRowId,
      }))
      .sort((a, b) => String(a.choreName).localeCompare(String(b.choreName)))
  }, [trackingList, whoList, choreMap])

  const choreOptions = useMemo(
    () => [...choreInfo].sort((a, b) => (a.chore || '').localeCompare(b.chore || '')),
    [choreInfo],
  )

  const filteredChoreOptions = useMemo(() => {
    const query = choreInput.trim().toLowerCase()
    if (!query) return choreOptions

    return choreOptions.filter((item) =>
      (item.chore || '').toLowerCase().includes(query),
    )
  }, [choreOptions, choreInput])

  function resolveChoreRowId(inputValue = choreInput) {
    const match = choreOptions.find(
      (item) => (item.chore || '').toLowerCase() === inputValue.trim().toLowerCase(),
    )

    return match ? String(match.choreRowId) : ''
  }

  function handleChoreInputChange(value) {
    setChoreInput(value)
    setChoreListOpen(true)
    setSelectedChore(resolveChoreRowId(value))
  }

  function handleChorePick(item) {
    setChoreInput(item.chore)
    setSelectedChore(String(item.choreRowId))
    setChoreListOpen(false)
  }

  function clearChoreSelection() {
    setChoreInput('')
    setSelectedChore('')
    setChoreListOpen(false)
  }

  async function loadTracking() {
    setTrackingStatus('loading')

    try {
      const snapshot = await getDocs(collection(db, 'Success_Tracking'))
      const data = snapshot.docs.map((entry) => ({
        id: entry.id,
        ...entry.data(),
      }))

      data.sort((a, b) => {
        const rowA = a.rowId ?? Number(a.id) ?? 0
        const rowB = b.rowId ?? Number(b.id) ?? 0
        return rowB - rowA
      })

      setTrackingList(data)
      setTrackingStatus('ready')
    } catch (err) {
      console.error('Failed to load Success_Tracking:', err)
      setTrackingStatus('error')
    }
  }

  useEffect(() => {
    loadTracking()
  }, [])

  function handleWhoChange(value) {
    setSelectedWho(value)
  }

  async function handleMarkSuccessful(whoRowId, choreRowId) {
    const failureKey = `${whoRowId}-${choreRowId}`
    if (updatingFailureKey === failureKey) return

    const matchingEntries = trackingList.filter(
      (entry) =>
        matchesWhoChore(entry, whoRowId, choreRowId) &&
        getIsSuccess(entry) === 0,
    )

    if (matchingEntries.length === 0) return

    setUpdatingFailureKey(failureKey)

    try {
      await Promise.all(
        matchingEntries.map((entry) =>
          setDoc(
            doc(db, 'Success_Tracking', entry.id),
            { isSuccess: 1, isSuccessful: 1 },
            { merge: true },
          ),
        ),
      )

      setTrackingList((prev) =>
        prev.map((entry) => {
          const isMatch = matchingEntries.some((match) => match.id === entry.id)
          if (!isMatch) return entry
          return { ...entry, isSuccess: 1, isSuccessful: 1 }
        }),
      )
    } catch (err) {
      console.error('Failed to mark chore successful:', err)
      await loadTracking()
    } finally {
      setUpdatingFailureKey(null)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const choreRowId = selectedChore || resolveChoreRowId()

    if (!selectedWho || !choreRowId || isSuccess === '') {
      return
    }

    setSubmitStatus('saving')

    try {
      const whoNum = Number(selectedWho)
      const choreNum = Number(choreRowId)
      const successVal = Number(isSuccess)
      const docId = getTrackingDocId(whoNum, choreNum)

      const snapshot = await getDocs(collection(db, 'Success_Tracking'))
      const allEntries = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))

      const matchingEntries = findExistingEntries(whoNum, choreNum, allEntries)
      const existingByDocId = allEntries.find((entry) => entry.id === docId)

      let rowId = existingByDocId?.rowId ?? matchingEntries[0]?.rowId
      if (rowId == null) {
        rowId =
          allEntries.reduce((max, entry) => {
            const entryRowId = entry.rowId ?? Number(entry.id) ?? 0
            return entryRowId > max ? entryRowId : max
          }, 0) + 1
      }

      await setDoc(
        doc(db, 'Success_Tracking', docId),
        {
          rowId,
          who: whoNum,
          chore: choreNum,
          isSuccess: successVal,
          isSuccessful: successVal,
        },
        { merge: true },
      )

      const duplicateEntries = matchingEntries.filter((entry) => entry.id !== docId)
      if (duplicateEntries.length > 0) {
        await Promise.all(
          duplicateEntries.map((entry) => deleteDoc(doc(db, 'Success_Tracking', entry.id))),
        )
      }

      clearChoreSelection()
      setIsSuccess('')
      setSubmitStatus('saved')
      await loadTracking()
      setTimeout(() => setSubmitStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to log success:', err)
      setSubmitStatus('error')
    }
  }

  const whoWithFailures = whoList.filter(
    (person) => (failuresByWho[person.rowId] || []).length > 0,
  )

  return (
    <div className="Successful">
      <div className="Successful-Container">
        <header className="Successful-Header">
          <h2>Successful?</h2>
          <p>Log whether a chore was completed successfully.</p>
        </header>

        <section className="Successful-Content">
          {seedStatus === 'loading' && <p className="Successful-Loading">Loading...</p>}
          {seedStatus === 'error' && <p className="Successful-Error">Could not load chores data.</p>}

          {seedStatus === 'ready' && (
            <>
              <form className="Successful-Form" onSubmit={handleSubmit}>
                <div className="Successful-Form-Field">
                  <label className="Successful-Form-Label" htmlFor="successful-who">
                    Who
                  </label>
                  <select
                    id="successful-who"
                    className="Successful-Form-Select"
                    value={selectedWho}
                    onChange={(e) => handleWhoChange(e.target.value)}
                    required
                  >
                    <option value="">Select person</option>
                    {whoFormOptions.map((person) => (
                      <option key={person.rowId} value={person.rowId}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="Successful-Form-Field">
                  <label className="Successful-Form-Label" htmlFor="successful-chore">
                    Chore
                  </label>
                  <div className="Successful-Form-Combobox">
                    <input
                      id="successful-chore"
                      type="text"
                      className="Successful-Form-Input"
                      value={choreInput}
                      onChange={(e) => handleChoreInputChange(e.target.value)}
                      onFocus={() => setChoreListOpen(true)}
                      onBlur={() => {
                        setTimeout(() => setChoreListOpen(false), 150)
                      }}
                      placeholder="Type or select a chore"
                      autoComplete="off"
                      required
                    />
                    {choreListOpen && filteredChoreOptions.length > 0 && (
                      <ul className="Successful-Form-Combobox-List">
                        {filteredChoreOptions.map((item) => (
                          <li key={item.choreRowId}>
                            <button
                              type="button"
                              className="Successful-Form-Combobox-Option"
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
                </div>

                <fieldset className="Successful-Form-Field Successful-Form-Field-Radio">
                  <legend className="Successful-Form-Label">Successful?</legend>
                  <div className="Successful-Form-RadioGroup">
                    <label className="Successful-Form-RadioLabel">
                      <input
                        type="radio"
                        name="isSuccess"
                        value="1"
                        checked={isSuccess === '1'}
                        onChange={(e) => setIsSuccess(e.target.value)}
                        required
                      />
                      Yes
                    </label>
                    <label className="Successful-Form-RadioLabel">
                      <input
                        type="radio"
                        name="isSuccess"
                        value="0"
                        checked={isSuccess === '0'}
                        onChange={(e) => setIsSuccess(e.target.value)}
                        required
                      />
                      No
                    </label>
                  </div>
                </fieldset>

                <div className="Successful-Form-Actions">
                  <button
                    type="submit"
                    className="Successful-Form-Button"
                    disabled={submitStatus === 'saving'}
                  >
                    {submitStatus === 'saving' ? 'Saving...' : 'Log'}
                  </button>
                  {submitStatus === 'saved' && (
                    <span className="Successful-Form-Message Successful-Form-Message-Success">
                      Logged.
                    </span>
                  )}
                  {submitStatus === 'error' && (
                    <span className="Successful-Form-Message Successful-Form-Message-Error">
                      Could not save.
                    </span>
                  )}
                </div>
              </form>

              <div className="Successful-Display-Section">
                <h3 className="Successful-Display-Title">Not good at...</h3>
                <p className="Successful-Display-Hint">Double-click a chore to mark it successful.</p>

                {trackingStatus === 'loading' && (
                  <p className="Successful-Loading">Loading logs...</p>
                )}
                {trackingStatus === 'error' && (
                  <p className="Successful-Error">Could not load Success_Tracking.</p>
                )}

                {trackingStatus === 'ready' && whoWithFailures.length === 0 && (
                  <p className="Successful-Empty">No failures logged yet.</p>
                )}

                {trackingStatus === 'ready' && whoWithFailures.length > 0 && (
                  <div className="Successful-Failures-List">
                    {whoWithFailures.map((person) => (
                      <div key={person.rowId} className="Successful-Failures-Who">
                        <h4 className="Successful-Failures-Who-Name">{person.name}</h4>
                        <ul className="Successful-Failures-Who-Chores">
                          {failuresByWho[person.rowId].map((failure) => (
                            <li
                              key={failure.choreRowId}
                              className={`Successful-Failures-Who-ChoreItem${updatingFailureKey === `${person.rowId}-${failure.choreRowId}` ? ' Successful-Failures-Who-ChoreItem-Updating' : ''}`}
                              onDoubleClick={() => handleMarkSuccessful(person.rowId, failure.choreRowId)}
                            >
                              <ChoreHover
                                choreRowId={failure.choreRowId}
                                choreName={failure.choreName}
                                choreDetailsMap={choreDetailsMap}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="Successful-WeakBubble-Section">
                <h3 className="Successful-Display-Title">
                  Everyone except {whoMap[goodAtWhoRowId] || 'row 3'} struggles with
                </h3>

                {trackingStatus === 'ready' && sharedWeakChores.length === 0 && (
                  <p className="Successful-Empty">No shared weak spots yet.</p>
                )}

                {trackingStatus === 'ready' && sharedWeakChores.length > 0 && (
                  <div className="Successful-WeakBubble-Row">
                    {sharedWeakChores.map((chore) => (
                      <div key={chore.choreRowId} className="Successful-WeakBubble">
                        <ChoreHover
                          choreRowId={chore.choreRowId}
                          choreName={chore.choreName}
                          choreDetailsMap={choreDetailsMap}
                        >
                          <span className="Successful-WeakBubble-Name">{chore.choreName}</span>
                        </ChoreHover>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default Successful
