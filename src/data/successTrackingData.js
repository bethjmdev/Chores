import assignedToData from './assignedToData'

const successTrackingData = assignedToData
  .filter((item) => item.who != null)
  .map((item, index) => ({
    rowId: index + 1,
    whoRowid: item.who,
    choreRowid: item.choreRowId,
    isSuccessful: null,
  }))

export default successTrackingData
