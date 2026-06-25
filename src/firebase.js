import { initializeApp } from 'firebase/app'
import { getAnalytics } from 'firebase/analytics'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyC4WUOb1jEIbeNB4lINlhIS6it3it5VHXM',
  authDomain: 'chores-middleton.firebaseapp.com',
  projectId: 'chores-middleton',
  storageBucket: 'chores-middleton.firebasestorage.app',
  messagingSenderId: '516018209563',
  appId: '1:516018209563:web:3a6a1803132c1ad99549be',
  measurementId: 'G-EL38HRZRHM',
}

const app = initializeApp(firebaseConfig)
const analytics = getAnalytics(app)

export const auth = getAuth(app)
export const db = getFirestore(app)
export { analytics }
export default app
