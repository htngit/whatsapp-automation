import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import { saveAs } from 'file-saver'
import axios from 'axios'

// API URLs - using proxy configuration
const API_SEND_URL = '/send-messages'
const API_STATUS_URL = '/api/whatsapp-status'
const API_INIT_URL = '/api/init-whatsapp'
const API_CLOSE_URL = '/api/close-whatsapp'
const API_UPDATE_DELAY_URL = '/api/update-delay'

/**
 * WhatsApp Automation App Component
 * Provides interface for uploading CSV contacts and sending messages via WhatsApp
 */
function App() {
  const [file, setFile] = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('info') // 'info', 'success', 'error'
  const [whatsappReady, setWhatsappReady] = useState(false)
  const [whatsappStatus, setWhatsappStatus] = useState('Checking WhatsApp status...')
  const [initializingWhatsapp, setInitializingWhatsapp] = useState(false)
  const [sessionState, setSessionState] = useState(null)
  const [messageDelay, setMessageDelay] = useState(5000)
  const [delayInput, setDelayInput] = useState(5000)
  const [updatingDelay, setUpdatingDelay] = useState(false)
  const [closingSession, setClosingSession] = useState(false)
  const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0, nextDelay: 0 })

  /**
   * Handles CSV file upload and parsing
   * @param {Event} event - The file input change event
   */
  // Robust CSV parser function
  const parseCSVRobust = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        let csvText = e.target.result
        
        // Clean the CSV text
        csvText = csvText.replace(/^\uFEFF/, '') // Remove BOM
        csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n') // Normalize line endings
        csvText = csvText.trim() // Remove leading/trailing whitespace
        
        console.log('=== CSV PREPROCESSING ===')
        console.log('Cleaned CSV text (first 200 chars):', csvText.substring(0, 200))
        
        // Try different parsing configurations
        const configurations = [
          // Standard quoted CSV
          {
            name: 'Standard Quoted CSV',
            config: {
              header: true,
              delimiter: ',',
              skipEmptyLines: true,
              quotes: true,
              quoteChar: '"',
              escapeChar: '"',
              fastMode: false,
              transformHeader: (header) => header.toLowerCase().trim(),
              transform: (value) => value ? value.trim() : '',
            }
          },
          // Semicolon delimiter with quotes
          {
            name: 'Semicolon Quoted CSV',
            config: {
              header: true,
              delimiter: ';',
              skipEmptyLines: true,
              quotes: true,
              quoteChar: '"',
              escapeChar: '"',
              fastMode: false,
              transformHeader: (header) => header.toLowerCase().trim(),
              transform: (value) => value ? value.trim() : '',
            }
          },
          // Tab delimiter with quotes
          {
            name: 'Tab Quoted CSV',
            config: {
              header: true,
              delimiter: '\t',
              skipEmptyLines: true,
              quotes: true,
              quoteChar: '"',
              escapeChar: '"',
              fastMode: false,
              transformHeader: (header) => header.toLowerCase().trim(),
              transform: (value) => value ? value.trim() : '',
            }
          },
          // Unquoted comma CSV (fallback)
          {
            name: 'Unquoted Comma CSV',
            config: {
              header: true,
              delimiter: ',',
              skipEmptyLines: true,
              quotes: false,
              fastMode: false,
              transformHeader: (header) => header.toLowerCase().trim(),
              transform: (value) => value ? value.trim() : '',
            }
          }
        ]
        
        let bestResult = null
        let bestScore = 0
        
        for (const { name, config } of configurations) {
          console.log(`Trying configuration: ${name}`)
          
          const result = Papa.parse(csvText, config)
          
          console.log(`Result for '${name}':`, {
            dataLength: result.data.length,
            fields: result.meta.fields,
            errors: result.errors.length,
            firstRow: result.data[0],
            sampleData: result.data.slice(0, 2)
          })
          
          // Score this result
          const hasRequiredFields = result.meta.fields && 
            result.meta.fields.includes('name') && 
            result.meta.fields.includes('phone') && 
            result.meta.fields.includes('message')
          
          const hasValidData = result.data.length > 0 && 
            result.data.some(row => row.name && row.phone && row.message)
          
          const score = (hasRequiredFields ? 100 : 0) + 
                       (hasValidData ? 75 : 0) + 
                       (result.data.length > 0 ? 25 : 0) + 
                       (result.errors.length === 0 ? 25 : 0)
          
          console.log(`Score for '${name}': ${score}`)
          
          if (score > bestScore) {
            bestScore = score
            bestResult = result
            console.log(`New best result: ${name} with score ${score}`)
          }
        }
        
        // If no good result found, try manual parsing as last resort
        if (bestResult && bestScore >= 100) {
          console.log('Using best result with score:', bestScore)
          resolve(bestResult)
        } else {
          console.log('All Papa Parse configurations failed, trying manual parsing...')
          
          // Manual parsing fallback
          try {
            const lines = csvText.split('\n').filter(line => line.trim())
            if (lines.length < 2) {
              reject(new Error('CSV file must have at least a header and one data row'))
              return
            }
            
            const headerLine = lines[0]
            const dataLines = lines.slice(1)
            
            console.log('Manual parsing - Header line:', headerLine)
            console.log('Manual parsing - Data lines:', dataLines.slice(0, 2))
            
            // Try to parse header
            let headers = []
            if (headerLine.includes(',')) {
              headers = headerLine.split(',').map(h => h.replace(/"/g, '').trim().toLowerCase())
            } else if (headerLine.includes(';')) {
              headers = headerLine.split(';').map(h => h.replace(/"/g, '').trim().toLowerCase())
            } else {
              reject(new Error('Could not detect delimiter in CSV header'))
              return
            }
            
            console.log('Manual parsing - Detected headers:', headers)
            
            // Check if required headers exist
            if (!headers.includes('name') || !headers.includes('phone') || !headers.includes('message')) {
              reject(new Error(`Missing required columns. Found: ${headers.join(', ')}. Required: name, phone, message`))
              return
            }
            
            // Parse data rows
            const data = []
            const delimiter = headerLine.includes(',') ? ',' : ';'
            
            for (const line of dataLines) {
              if (!line.trim()) continue
              
              // Simple CSV parsing with quote handling
              const values = []
              let current = ''
              let inQuotes = false
              
              for (let i = 0; i < line.length; i++) {
                const char = line[i]
                
                if (char === '"') {
                  inQuotes = !inQuotes
                } else if (char === delimiter && !inQuotes) {
                  values.push(current.trim().replace(/^"|"$/g, ''))
                  current = ''
                } else {
                  current += char
                }
              }
              values.push(current.trim().replace(/^"|"$/g, ''))
              
              // Create row object
              const row = {}
              headers.forEach((header, index) => {
                row[header] = values[index] || ''
              })
              
              data.push(row)
            }
            
            console.log('Manual parsing - Parsed data:', data)
            
            const manualResult = {
              data: data,
              errors: [],
              meta: {
                fields: headers
              }
            }
            
            resolve(manualResult)
            
          } catch (manualError) {
            console.error('Manual parsing also failed:', manualError)
            reject(new Error(`Could not parse CSV file. Please ensure your CSV has the format: name,phone,message with proper comma separation. Error: ${manualError.message}`))
          }
        }
      }
      
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file, 'UTF-8')
    })
  }

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0]
    setFile(uploadedFile)

    if (uploadedFile) {
      console.log('=== CSV PARSING DEBUG START ===')
      
      try {
        const results = await parseCSVRobust(uploadedFile)
        
        console.log('Final CSV parsing results:', results)
        console.log('CSV data length:', results.data?.length)
        console.log('CSV headers:', results.meta?.fields)
        console.log('CSV errors:', results.errors)
        
        if (results.errors && results.errors.length > 0) {
          console.log('CSV parsing warnings:', results.errors)
          setStatus(`Warning: Some rows had parsing issues, but proceeding with valid data.`)
          setStatusType('warning')
        }
        
        // Check if data exists
        if (!results.data || results.data.length === 0) {
          setStatus('File CSV kosong atau tidak dapat dibaca')
          setStatusType('error')
          return
        }
        
        console.log('First row sample:', results.data[0])
        
        // Validate CSV structure
        const validContacts = results.data.filter((contact, index) => {
          console.log(`--- Processing contact ${index + 1} ---`)
          console.log('Raw contact:', contact)
          console.log('Available keys:', Object.keys(contact))
          
          // Skip empty rows
          if (!contact || Object.keys(contact).length === 0) {
            console.log('Skipping empty contact')
            return false
          }
          
          // Handle different possible column names (now all lowercase due to transformHeader)
           const name = contact.name || contact.nama || ''
           const phone = contact.phone || contact.telepon || ''
           const message = contact.message || contact.pesan || ''
          
          console.log('Extracted name:', `"${name}"`, 'Type:', typeof name)
          console.log('Extracted phone:', `"${phone}"`, 'Type:', typeof phone)
          console.log('Extracted message:', `"${message}"`, 'Type:', typeof message)
          
          const hasName = name && typeof name === 'string' && name.trim() !== ''
          const hasPhone = phone && typeof phone === 'string' && phone.trim() !== ''
          const hasMessage = message && typeof message === 'string' && message.trim() !== ''
          
          console.log('Has name:', hasName)
          console.log('Has phone:', hasPhone)
          console.log('Has message:', hasMessage)
          
          const isValid = hasName && hasPhone && hasMessage
          console.log('Contact valid:', isValid)
          
          // Return normalized contact if valid
          if (isValid) {
            return {
              name: name.trim(),
              phone: phone.trim(),
              message: message.trim()
            }
          }
          
          return false
        }).filter(Boolean) // Remove false values
        
        console.log('=== FINAL RESULTS ===')
        console.log('Total processed contacts:', results.data.length)
        console.log('Valid contacts count:', validContacts.length)
        console.log('Valid contacts:', validContacts)
        console.log('=== CSV PARSING DEBUG END ===')
        
        setContacts(validContacts)
        
        if (validContacts.length > 0) {
          setStatus(`${validContacts.length} kontak valid ditemukan dan siap dikirim`)
          setStatusType('success')
        } else {
          setStatus('Tidak ada kontak valid dalam file. Pastikan file CSV memiliki kolom "name", "phone" dan "message" dengan data yang lengkap')
          setStatusType('error')
        }
      } catch (error) {
        console.error('CSV parsing error:', error)
        setStatus(`Error parsing CSV file: ${error.message}`)
        setStatusType('error')
      }
    }
  }

  /**
   * Downloads a template CSV file for contacts
   */
  const downloadTemplate = () => {
    const csvContent = 'name,phone,message\nJohn Doe,+6281234567890,Halo John ini adalah pesan otomatis dari WhatsApp Automation\nJane Smith,+6281234567891,Selamat siang Jane ini adalah pesan otomatis kedua'
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    saveAs(blob, 'whatsapp_template.csv')
  }

  /**
   * Check WhatsApp connection status
   */
  const checkWhatsAppStatus = async () => {
    try {
      const response = await axios.get(API_STATUS_URL)
      setWhatsappReady(response.data.ready)
      setWhatsappStatus(response.data.message)
      setSessionState(response.data.sessionState)
      if (response.data.delay) {
        setMessageDelay(response.data.delay)
        setDelayInput(response.data.delay)
      }
    } catch (error) {
      console.error('Error checking WhatsApp status:', error)
      setWhatsappReady(false)
      setWhatsappStatus('Error checking WhatsApp status')
      setSessionState(null)
    }
  }

  /**
   * Close WhatsApp session
   */
  const closeWhatsAppSession = async () => {
    setClosingSession(true)
    setWhatsappStatus('Closing WhatsApp session...')
    
    try {
      const response = await axios.post(API_CLOSE_URL)
      setWhatsappStatus(response.data.message)
      setWhatsappReady(false)
      setSessionState(response.data.sessionState)
    } catch (error) {
      console.error('Error closing WhatsApp session:', error)
      setWhatsappStatus(`Error: ${error.response?.data?.message || error.message}`)
    } finally {
      setClosingSession(false)
    }
  }

  /**
   * Update message delay configuration
   */
  const updateMessageDelay = async () => {
    if (delayInput < 1000) {
      setStatus('Delay minimal adalah 1000ms (1 detik)')
      setStatusType('error')
      return
    }
    
    setUpdatingDelay(true)
    
    try {
      const response = await axios.post(API_UPDATE_DELAY_URL, { delay: delayInput })
      setMessageDelay(response.data.delay)
      setStatus(`Delay berhasil diupdate menjadi ${response.data.delay}ms`)
      setStatusType('success')
    } catch (error) {
      console.error('Error updating delay:', error)
      setStatus(`Error: ${error.response?.data?.message || error.message}`)
      setStatusType('error')
    } finally {
      setUpdatingDelay(false)
    }
  }

  /**
   * Initialize WhatsApp Web
   */
  const initializeWhatsApp = async () => {
    setInitializingWhatsapp(true)
    setWhatsappStatus('Initializing WhatsApp Web...')
    
    try {
      const response = await axios.post(API_INIT_URL)
      setWhatsappStatus(response.data.message)
      setSessionState(response.data.sessionState)
      
      // Start checking status periodically after initialization
      const checkInterval = setInterval(async () => {
        await checkWhatsAppStatus()
        // If WhatsApp is ready, stop checking
        if (whatsappReady) {
          clearInterval(checkInterval)
        }
      }, 5000) // Check every 5 seconds
      
      // Clear interval after 2 minutes to avoid infinite checking
      setTimeout(() => clearInterval(checkInterval), 120000)
    } catch (error) {
      console.error('Error initializing WhatsApp:', error)
      setWhatsappStatus(`Error: ${error.response?.data?.message || error.message}`)
    } finally {
      setInitializingWhatsapp(false)
    }
  }

  /**
   * Sends WhatsApp messages to contacts via backend API
   */
  const startAutomation = async () => {
    if (contacts.length === 0) {
      setStatus('Tidak ada kontak untuk dikirim. Silakan upload file CSV terlebih dahulu.')
      setStatusType('error')
      return
    }

    // Check if WhatsApp is ready
    if (!whatsappReady) {
      setStatus('WhatsApp belum siap. Silakan inisialisasi WhatsApp terlebih dahulu.')
      setStatusType('error')
      return
    }

    setLoading(true)
    setSendingProgress({ current: 0, total: contacts.length, nextDelay: messageDelay })
    setStatus(`Mengirim pesan ke ${contacts.length} kontak dengan delay ${messageDelay}ms...`)
    setStatusType('info')

    try {
      // Send contacts and delay configuration to backend
      const response = await axios.post(API_SEND_URL, {
        contacts: contacts,
        delay: messageDelay
      })
      
      setStatus(`${response.data.message} (Delay: ${response.data.delay}ms)`)
      setStatusType('success')
      setSendingProgress({ current: 0, total: 0, nextDelay: 0 })
    } catch (error) {
      console.error('Error sending messages:', error)
      setStatus(`Error: ${error.response?.data?.message || error.message}`)
      setStatusType('error')
      setSendingProgress({ current: 0, total: 0, nextDelay: 0 })
    } finally {
      setLoading(false)
    }
  }

  /**
   * Check WhatsApp status when component mounts
   */
  useEffect(() => {
    checkWhatsAppStatus()
    
    // Check status every 30 seconds
    const intervalId = setInterval(checkWhatsAppStatus, 30000)
    
    // Clean up interval on component unmount
    return () => clearInterval(intervalId)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-600">WhatsApp Automation</h1>
          <p className="text-gray-600 mt-2">Upload CSV dan kirim pesan WhatsApp secara massal</p>
        </div>
        
        {/* WhatsApp Status */}
        <div className="mb-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Status WhatsApp & Pengaturan</h2>
          
          {/* Session Status */}
          <div className="mb-4 p-4 bg-white rounded-lg border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full mr-2 ${whatsappReady ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="font-medium">{whatsappReady ? 'WhatsApp Siap' : 'WhatsApp Belum Siap'}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{whatsappStatus}</p>
                {sessionState && (
                  <div className="text-xs text-gray-400 mt-1">
                    Active tabs: {sessionState.activeTabs?.length || 0} | 
                    Last activity: {sessionState.lastActivity ? new Date(sessionState.lastActivity).toLocaleTimeString() : 'Never'}
                  </div>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={initializeWhatsApp}
                  disabled={initializingWhatsapp}
                  className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${initializingWhatsapp ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  {initializingWhatsapp ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Initializing...
                    </>
                  ) : 'Initialize WhatsApp'}
                </button>
                
                {whatsappReady && (
                  <button
                    onClick={closeWhatsAppSession}
                    disabled={closingSession}
                    className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${closingSession ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                  >
                    {closingSession ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Closing...
                      </>
                    ) : 'Reset Session'}
                  </button>
                )}
              </div>
            </div>
          </div>
          
          {/* Delay Configuration */}
          <div className="p-4 bg-white rounded-lg border">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Pengaturan Delay Antar Pesan</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Delay (milliseconds)</label>
                <input
                  type="number"
                  min="1000"
                  step="500"
                  value={delayInput}
                  onChange={(e) => setDelayInput(parseInt(e.target.value) || 1000)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Minimal 1000ms"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Current: {messageDelay}ms ({(messageDelay / 1000).toFixed(1)} detik)
                </p>
              </div>
              
              <button
                onClick={updateMessageDelay}
                disabled={updatingDelay || delayInput < 1000}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-colors ${updatingDelay || delayInput < 1000 ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}
              >
                {updatingDelay ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating...
                  </>
                ) : 'Update Delay'}
              </button>
            </div>
            
            <div className="mt-3 text-xs text-gray-500">
              <p><strong>Rekomendasi:</strong></p>
              <p>• 2000ms (2 detik) - Cepat, risiko tinggi</p>
              <p>• 5000ms (5 detik) - Seimbang (default)</p>
              <p>• 10000ms (10 detik) - Aman, lambat</p>
            </div>
          </div>
        </div>
        
        {/* Status Message */}
        {status && (
          <div className={`mb-6 p-4 rounded-md ${
            statusType === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 
            statusType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {status}
          </div>
        )}
        
        {/* CSV Upload Section */}
        <div className="mb-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
          <h2 className="text-lg font-medium text-gray-900 mb-4">1. Upload File CSV</h2>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Pilih file CSV</label>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleFileUpload}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
              />
              {file && <p className="mt-2 text-sm text-gray-500">File: {file.name}</p>}
            </div>
            
            <div className="sm:self-end">
              <button 
                onClick={downloadTemplate} 
                className="py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-md text-sm font-medium text-gray-700 transition-colors flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Template
              </button>
            </div>
          </div>
          
          <p className="mt-2 text-xs text-gray-500">
            Format CSV: kolom <code className="bg-gray-100 px-1 py-0.5 rounded">name</code> (nama kontak), <code className="bg-gray-100 px-1 py-0.5 rounded">phone</code> (nomor telepon) dan <code className="bg-gray-100 px-1 py-0.5 rounded">message</code> (pesan yang akan dikirim)
          </p>
        </div>
        
        {/* Contact Preview */}
        {contacts.length > 0 && (
          <div className="mb-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 mb-4">2. Preview Data ({contacts.length} kontak)</h2>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-md">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomor Telepon</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pesan</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contacts.slice(0, 5).map((contact, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{contact.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{contact.phone}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">{contact.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {contacts.length > 5 && (
                <div className="mt-2 text-xs text-gray-500 text-center">
                  + {contacts.length - 5} kontak lainnya
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Start Automation Button */}
        <div className="mt-8">
          <h2 className="text-lg font-medium text-gray-900 mb-4">3. Mulai Otomasi</h2>
          
          {/* Progress Indicator */}
          {loading && sendingProgress.total > 0 && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">
                  Mengirim pesan {sendingProgress.current} dari {sendingProgress.total}
                </span>
                <span className="text-sm text-blue-700">
                  {Math.round((sendingProgress.current / sendingProgress.total) * 100)}%
                </span>
              </div>
              
              <div className="w-full bg-blue-200 rounded-full h-2 mb-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${(sendingProgress.current / sendingProgress.total) * 100}%` }}
                ></div>
              </div>
              
              {sendingProgress.nextDelay > 0 && sendingProgress.current < sendingProgress.total && (
                <p className="text-xs text-blue-600">
                  Delay berikutnya: {(sendingProgress.nextDelay / 1000).toFixed(1)} detik
                </p>
              )}
            </div>
          )}
          
          <button
            onClick={startAutomation}
            disabled={loading || contacts.length === 0 || !whatsappReady}
            className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-base font-medium text-white ${
              loading || contacts.length === 0 || !whatsappReady 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
            }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Mengirim Pesan...
              </>
            ) : 'Mulai Kirim Pesan WhatsApp'}
          </button>
          
          <div className="mt-2 text-xs text-gray-500 text-center space-y-1">
            <p>
              {!whatsappReady && 'WhatsApp belum siap. '}
              {contacts.length === 0 && 'Upload file CSV terlebih dahulu. '}
              {whatsappReady && contacts.length > 0 && `Siap mengirim ${contacts.length} pesan dengan delay ${(messageDelay / 1000).toFixed(1)} detik.`}
            </p>
            <p>
              Pastikan status WhatsApp sudah "Siap" dan file CSV sudah diupload sebelum memulai otomasi.
            </p>
          </div>
        </div>
        
        {/* Instructions */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <h3 className="text-sm font-medium text-gray-900">Petunjuk Penggunaan:</h3>
          <ol className="mt-2 text-sm text-gray-500 list-decimal list-inside space-y-1">
            <li>Klik tombol "Initialize WhatsApp Web" untuk memulai sesi WhatsApp</li>
            <li>Scan QR code yang muncul di browser dengan aplikasi WhatsApp di ponsel Anda</li>
            <li>Tunggu hingga status WhatsApp berubah menjadi "WhatsApp Siap"</li>
            <li>Download template CSV atau buat file CSV dengan format yang sesuai</li>
            <li>Upload file CSV yang berisi nomor telepon dan pesan</li>
            <li>Periksa preview data untuk memastikan data sudah benar</li>
            <li>Klik tombol "Mulai Kirim Pesan WhatsApp" untuk memulai otomasi</li>
            <li>Tunggu hingga proses selesai</li>
          </ol>
        </div>
      </div>
      
      <footer className="mt-8 text-center text-xs text-gray-500">
        &copy; {new Date().getFullYear()} WhatsApp Automation Tool
      </footer>
    </div>
  )
}

export default App