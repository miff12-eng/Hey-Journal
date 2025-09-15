import RecordButton from '../RecordButton'

export default function RecordButtonExample() {
  const handleRecordingStart = () => {
    console.log('Recording started')
  }

  const handleRecordingStop = (audioBlob: Blob) => {
    console.log('Recording stopped, audio blob size:', audioBlob.size)
  }

  const handleTranscriptionUpdate = (text: string) => {
    console.log('Transcription update:', text)
  }

  return (
    <div className=\"flex items-center justify-center p-8 bg-background\">
      <RecordButton
        onRecordingStart={handleRecordingStart}
        onRecordingStop={handleRecordingStop}
        onTranscriptionUpdate={handleTranscriptionUpdate}
      />
    </div>
  )
}