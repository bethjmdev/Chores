import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import { ensureFrequencyQueueConfig, clearMultiDayQueuePins } from './utils/frequencyQueue'
import { resetDueSubcategories, syncRobeySubcategoryAssignment } from './utils/subcategoryDue'
import { seedTimeOfDayIfEmpty, ensureTimeOfDayConfig } from './seedTimeOfDay'
// import { seedChoresIfEmpty } from './seedChores'
// import { seedFrequencyOfIfEmpty } from './seedFrequencyOf'
// import { seedWhoIfEmpty } from './seedWho'
// import { seedChallengeLevelsIfEmpty } from './seedChallengeLevels'
// import { seedAssignedToIfEmpty } from './seedAssignedTo'
// import { seedWhenCompletedIfEmpty } from './seedWhenCompleted'
// import { seedSuccessTrackingIfEmpty } from './seedSuccessTracking'
import './App.css'
import Points from './pages/Points'
import Levels from './pages/Levels'
import AssignedChores from './pages/AssignedChores'
import Successful from './pages/Successful'
import CompletedBeth from './pages/CompletedBeth'
import CompletedRobey from './pages/CompletedRobey'
import RobeySubcategories from './pages/RobeySubcategories'
import RobeyQueue from './pages/RobeyQueue'
import BethQueue from './pages/BethQueue'
import All from './pages/All'
import ManageChores from './pages/ManageChores'

const navItems = [
  'Assigned Chores',
  'All',
  'Levels',
  'Points',
  'Successful?',
  //   'Completed Beth',
  'Beth Queue',
  // 'Completed Robey',
  'Robey Subcategories',
  'Robey Queue',
  'Manage Chores',
]

function renderActivePage(activeNav, props) {
  switch (activeNav) {
    case 'Points':
      return <Points {...props} />
    case 'All':
      return <All {...props} />
    case 'Levels':
      return <Levels {...props} />
    case 'Assigned Chores':
      return <AssignedChores {...props} />
    case 'Successful?':
      return <Successful {...props} />
    case 'Manage Chores':
      return <ManageChores {...props} />
    case 'Completed Beth':
      return <CompletedBeth />
    case 'Completed Robey':
      return <CompletedRobey />
    case 'Robey Subcategories':
      return <RobeySubcategories {...props} />
    case 'Robey Queue':
      return <RobeyQueue {...props} />
    case 'Beth Queue':
      return <BethQueue {...props} />
    default:
      return <AssignedChores {...props} />
  }
}

function App() {
  const [seedStatus, setSeedStatus] = useState('loading')
  const [choreInfo, setChoreInfo] = useState([])
  const [choresList, setChoresList] = useState([])
  const [whoList, setWhoList] = useState([])
  const [challengeLevelsList, setChallengeLevelsList] = useState([])
  const [frequencyOfList, setFrequencyOfList] = useState([])
  const [robeySubcategoryList, setRobeySubcategoryList] = useState([])
  const [whenCompletedList, setWhenCompletedList] = useState([])
  const [timeOfDayList, setTimeOfDayList] = useState([])
  const [activeNav, setActiveNav] = useState('Assigned Chores')
  const hasLoaded = useRef(false)

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setSeedStatus('loading')
    }

    try {
      await seedTimeOfDayIfEmpty()

      const [assignedToSnapshot, whoSnapshot, frequencySnapshot, challengeLevelsSnapshot, choresSnapshot, robeySubcategorySnapshot, whenCompletedSnapshot, timeOfDaySnapshot] = await Promise.all([
        getDocs(collection(db, 'Assigned_To')),
        getDocs(collection(db, 'Who')),
        getDocs(collection(db, 'Frequency_Of')),
        getDocs(collection(db, 'Challenge_Levels')),
        getDocs(collection(db, 'Chores')),
        getDocs(collection(db, 'RobeySubCategory')),
        getDocs(collection(db, 'When_Completed')),
        getDocs(collection(db, 'Time_Of_Day')),
      ])

      const assignedToData = assignedToSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      const whoData = whoSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      const frequencyOfData = frequencySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      const challengeLevelsData = challengeLevelsSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      const choresData = choresSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      const robeySubcategoryData = robeySubcategorySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      const whenCompletedData = whenCompletedSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      const timeOfDayData = timeOfDaySnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))

      await ensureFrequencyQueueConfig(frequencyOfData)
      await ensureTimeOfDayConfig(timeOfDayData)
      await clearMultiDayQueuePins({
        robeySubcategoryList: robeySubcategoryData,
        whenCompletedList: whenCompletedData,
        choresList: choresData,
        frequencyOfList: frequencyOfData,
      })
      await resetDueSubcategories(robeySubcategoryData, choresData, frequencyOfData)

      const whoMap = Object.fromEntries(whoData.map((person) => [person.rowId, person.name]))
      const challengeMap = Object.fromEntries(challengeLevelsData.map((level) => [level.rowId, level.challenge]))
      const pointsMap = Object.fromEntries(challengeLevelsData.map((level) => [level.rowId, level.points]))
      const frequencyMap = Object.fromEntries(frequencyOfData.map((freq) => [freq.rowId, freq.frequency]))
      const frequencySortMap = Object.fromEntries(frequencyOfData.map((freq) => [freq.rowId, freq.sort]))

      const assignedToMap = Object.fromEntries(
        assignedToData.map((assignment) => [assignment.choreRowId, assignment.who ?? null]),
      )

      const joinedChoreInfo = choresData.map((chore) => {
        const who = assignedToMap[chore.rowId] ?? null
        const challengeLevelId = chore.challengeLevel
        const freqId = chore.freqId

        return {
          choreRowId: chore.rowId,
          who,
          name: who != null ? whoMap[who] : null,
          chore: chore.chore ?? null,
          notes: chore.notes?.trim() ? chore.notes.trim() : null,
          challenge: challengeLevelId != null ? challengeMap[challengeLevelId] : null,
          challengeLevelId: challengeLevelId ?? null,
          points: challengeLevelId != null ? pointsMap[challengeLevelId] : 0,
          frequency: freqId != null ? frequencyMap[freqId] : null,
          freqId: freqId ?? null,
          frequencySort: freqId != null ? frequencySortMap[freqId] : null,
        }
      })

      await syncRobeySubcategoryAssignment({
        choreInfo: joinedChoreInfo,
        robeySubcategoryList: robeySubcategoryData,
        whoList: whoData,
      })

      setWhoList(whoData.sort((a, b) => a.rowId - b.rowId))
      setChallengeLevelsList(challengeLevelsData.sort((a, b) => a.rowId - b.rowId))
      setFrequencyOfList(frequencyOfData.sort((a, b) => a.sort - b.sort))
      setChoresList(choresData.sort((a, b) => a.rowId - b.rowId))
      setRobeySubcategoryList(robeySubcategoryData.sort((a, b) => a.rowId - b.rowId))
      setWhenCompletedList(whenCompletedData.sort((a, b) => (a.rowId || 0) - (b.rowId || 0)))
      setTimeOfDayList(timeOfDayData.sort((a, b) => a.sort - b.sort))
      setChoreInfo(joinedChoreInfo)
      setSeedStatus('ready')
    } catch (err) {
      console.error('Failed to load data:', err)
      setSeedStatus('error')
    }
  }, [])

  useEffect(() => {
    if (hasLoaded.current) return
    hasLoaded.current = true

    // Promise.all([
    //   seedChoresIfEmpty(),
    //   seedFrequencyOfIfEmpty(),
    //   seedWhoIfEmpty(),
    //   seedChallengeLevelsIfEmpty(),
    //   seedAssignedToIfEmpty(),
    //   seedWhenCompletedIfEmpty(),
    //   seedSuccessTrackingIfEmpty(),
    // ])
    //   .then(async ([chores, frequency, who, challengeLevels, assignedTo, whenCompleted, successTracking]) => {
    //     const anySeeded =
    //       chores.seeded ||
    //       frequency.seeded ||
    //       who.seeded ||
    //       challengeLevels.seeded ||
    //       assignedTo.seeded ||
    //       whenCompleted.seeded ||
    //       successTracking.seeded
    //     setSeedStatus(anySeeded ? 'seeded' : 'ready')

    loadData()
  }, [loadData])

  return (
    <div className="Chores">
      <div className="Chores-Container">
        <nav className="Chores-Navbar">
          <div className="Chores-Navbar-Top">
            <h1 className="Chores-Navbar-Logo">Chores</h1>
          </div>
          <div className="Chores-Navbar-Buttons">
            {navItems.map((label) => (
              <button
                key={label}
                type="button"
                className={`Chores-Navbar-Button${activeNav === label ? ' Chores-Navbar-Button-Active' : ''}`}
                onClick={() => setActiveNav(label)}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        <main className="Chores-Home">
          {renderActivePage(activeNav, {
            choreInfo,
            setChoreInfo,
            choresList,
            whoList,
            challengeLevelsList,
            frequencyOfList,
            robeySubcategoryList,
            whenCompletedList,
            timeOfDayList,
            seedStatus,
            reloadData: loadData,
          })}
        </main>
      </div>
    </div>
  )
}

export default App
