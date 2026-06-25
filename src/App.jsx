import { useEffect, useRef, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'
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

const navItems = [
  'Points',
  'Levels',
  'Assigned Chores',
  'Successful?',
  'Completed Beth',
  'Completed Robey',
  'Robey Subcategories',
]

function renderActivePage(activeNav, props) {
  switch (activeNav) {
    case 'Points':
      return <Points />
    case 'Levels':
      return <Levels />
    case 'Assigned Chores':
      return <AssignedChores {...props} />
    case 'Successful?':
      return <Successful />
    case 'Completed Beth':
      return <CompletedBeth />
    case 'Completed Robey':
      return <CompletedRobey />
    case 'Robey Subcategories':
      return <RobeySubcategories />
    default:
      return <AssignedChores {...props} />
  }
}

function App() {
  const [seedStatus, setSeedStatus] = useState('loading')
  const [choreInfo, setChoreInfo] = useState([])
  const [activeNav, setActiveNav] = useState('Assigned Chores')
  const hasLoaded = useRef(false)

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

    async function loadData() {
      try {
        const [assignedToSnapshot, whoSnapshot, frequencySnapshot, challengeLevelsSnapshot, choresSnapshot] = await Promise.all([
          getDocs(collection(db, 'Assigned_To')),
          getDocs(collection(db, 'Who')),
          getDocs(collection(db, 'Frequency_Of')),
          getDocs(collection(db, 'Challenge_Levels')),
          getDocs(collection(db, 'Chores')),
        ])

        const assignedToData = assignedToSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        const whoData = whoSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        const frequencyOfData = frequencySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        const challengeLevelsData = challengeLevelsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        const choresData = choresSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        console.log('Assigned_To', assignedToData)
        console.log('Who', whoData)
        console.log('Frequency_Of', frequencyOfData)
        console.log('Challenge_Levels', challengeLevelsData)
        console.log('Chores', choresData)

        const whoMap = Object.fromEntries(whoData.map((person) => [person.rowId, person.name]))
        const choreMap = Object.fromEntries(choresData.map((chore) => [chore.rowId, chore.chore]))
        const challengeMap = Object.fromEntries(challengeLevelsData.map((level) => [level.rowId, level.challenge]))
        const frequencyMap = Object.fromEntries(frequencyOfData.map((freq) => [freq.rowId, freq.frequency]))
        const choreChallengeLevelMap = Object.fromEntries(choresData.map((chore) => [chore.rowId, chore.challengeLevel]))
        const choreFreqIdMap = Object.fromEntries(choresData.map((chore) => [chore.rowId, chore.freqId]))

        const joinedChoreInfo = assignedToData.map((assignment) => {
          const challengeLevelId = choreChallengeLevelMap[assignment.choreRowId]
          const freqId = choreFreqIdMap[assignment.choreRowId]

          return {
            choreRowId: assignment.choreRowId,
            name: assignment.who != null ? whoMap[assignment.who] : null,
            chore: choreMap[assignment.choreRowId] ?? null,
            challenge: challengeLevelId != null ? challengeMap[challengeLevelId] : null,
            frequency: freqId != null ? frequencyMap[freqId] : null,
          }
        })

        setChoreInfo(joinedChoreInfo)
        setSeedStatus('ready')

        joinedChoreInfo.forEach((item) => {
          console.log(item.choreRowId, item.name, item.chore, item.challenge, item.frequency)
        })
      } catch (err) {
        console.error('Failed to load data:', err)
        setSeedStatus('error')
      }
    }

    loadData()
  }, [])

  return (
    <div className="Chores">
      <div className="Chores-Container">
        <nav className="Chores-Navbar">
          <div className="Chores-Navbar-Top">
            <h1 className="Chores-Navbar-Logo">Chores</h1>
            <p className="Chores-Navbar-Tagline">Home management, simplified</p>
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
          {renderActivePage(activeNav, { choreInfo, seedStatus })}
        </main>
      </div>
    </div>
  )
}

export default App
