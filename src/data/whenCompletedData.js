import assignedToData from './assignedToData'
import choresData from './choresData'

const choreFreqMap = Object.fromEntries(choresData.map((chore) => [chore.rowId, chore.freqId]))

const whenCompletedData = assignedToData
  .filter((item) => item.who != null)
  .map((item, index) => ({
    rowId: index + 1,
    whoRowid: item.who,
    choreRowid: item.choreRowId,
    freqRowid: choreFreqMap[item.choreRowId],
    isCompleted: null,
    timestamp: null,
  }))

export default whenCompletedData
