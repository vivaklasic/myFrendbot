import { useEffect, useRef, useState } from 'react';
import { Modality } from '@google/genai';
import BasicFace from '../basic-face/BasicFace';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import { createSystemInstructions } from '@/lib/prompts';
import { useAgent, useUser } from '@/lib/state';

export default function KeynoteCompanion() {
  const { client, connected, setConfig } = useLiveAPIContext();
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const user = useUser();
  const { current } = useAgent();
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [testSpreadsheetId, setTestSpreadsheetId] = useState('');
  const [testRange, setTestRange] = useState('A1:Z100');
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [toolCallStatus, setToolCallStatus] = useState<string>('Waiting...');

  const addDebugLog = (message: string) => {
    setDebugLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
    setToolCallStatus(message);
    console.log(message);
  };

  // Set the configuration for the Live API
  // Set the configuration for the Live API
useEffect(() => {
  setConfig({
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: current.voice },
      },
    },
    systemInstruction: {
      parts: [
        {
          text: "When user asks about trees or spreadsheet, FIRST call read_google_sheet(spreadsheetId='1k6D1x8D36OVPojdwPb9jDzwmWC92vdi9qJTqO-E4szU', range='A1:Z100'), THEN answer based on data received."
        },
      ],
    },
    tools: [
      {
        functionDeclarations: [
          {
            name: 'read_google_sheet',
            description: 'Read spreadsheet data. Call this immediately when user mentions trees or spreadsheet.',
            parameters: {
              type: 'OBJECT',
              properties: {
                spreadsheetId: {
                  type: 'STRING',
                  description: 'Spreadsheet ID',
                },
                range: {
                  type: 'STRING',
                  description: 'Range like A1:Z100',
                },
              },
              required: ['spreadsheetId', 'range'],
            },
          },
          {
            name: 'show_image',
            description: 'Show image from URL',
            parameters: {
              type: 'OBJECT',
              properties: {
                imageUrl: {
                  type: 'STRING',
                  description: 'Image URL',
                },
              },
              required: ['imageUrl'],
            },
          },
        ],
      },
    ],
  });
}, [setConfig, user, current]);

  // Функція для форматування даних таблиці
  const formatSheetData = (values: string[][]) => {
  if (!values || values.length === 0) {
    return 'Таблиця порожня';
  }

  const headers = values[0];
  const rows = values.slice(1);

  // Простий текстовий формат замість JSON
  let result = `Знайдено ${rows.length} рядків.\n\n`;
  
  rows.slice(0, 10).forEach((row, index) => {
    result += `Рядок ${index + 1}: `;
    headers.forEach((header, i) => {
      if (row[i]) {
        result += `${header}: ${row[i]}, `;
      }
    });
    result += '\n';
  });

  return result;
};

  // Тестова функція для перевірки сервера
  const testServerDirectly = async () => {
    if (!testSpreadsheetId) {
      addDebugLog('❌ Введіть Spreadsheet ID');
      return;
    }

    try {
      addDebugLog(`🔄 Запит до сервера: ${testSpreadsheetId}, ${testRange}`);
      
      const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          spreadsheetId: testSpreadsheetId, 
          range: testRange 
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        addDebugLog(`✅ Отримано ${data.data.length} рядків`);
        addDebugLog(`📊 Дані: ${JSON.stringify(data.data.slice(0, 3), null, 2)}...`);
        
        const formatted = formatSheetData(data.data);
        addDebugLog(`📝 Форматовані дані:\n${formatted.substring(0, 500)}...`);
      } else {
        addDebugLog(`❌ Помилка: ${data.error}`);
      }
    } catch (error: any) {
      addDebugLog(`❌ Помилка запиту: ${error.message}`);
    }
  };

  // Обробка tool calls від Gemini
  useEffect(() => {
    if (!client || !connected) return;

    const handleToolCall = async (toolCall: any) => {
      addDebugLog('📞 Tool call received: ' + JSON.stringify(toolCall));

      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            if (fc.name === 'read_google_sheet') {
              try {
                const { spreadsheetId, range } = fc.args;
                
                addDebugLog(`🔄 Gemini запитує: ${spreadsheetId}, ${range}`);
                
                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();
                
                addDebugLog(`📥 Відповідь сервера: ${JSON.stringify(data).substring(0, 200)}`);

                if (data.success && data.data) {
                  const formattedData = formatSheetData(data.data);
                  
                  addDebugLog(`✅ Надсилаємо Gemini ${data.data.length} рядків`);
                  
                  return {
                    id: fc.id,
                    name: fc.name,
                    response: formattedData
                  };
                } else {
                  addDebugLog(`❌ Помилка: ${data.error}`);
                  return {
                    id: fc.id,
                    name: fc.name,
                    response: `Error: ${data.error || 'Failed to read spreadsheet'}`
                  };
                }
              } catch (error: any) {
                addDebugLog(`❌ Exception: ${error.message}`);
                return {
                  id: fc.id,
                  name: fc.name,
                  response: `Error: ${error.message}`
                };
              }
            }

            if (fc.name === 'show_image') {
              try {
                const { imageUrl } = fc.args;
                addDebugLog(`🖼️ show_image викликано! URL: ${imageUrl}`);
                setCurrentImage(imageUrl);
                
                return {
                  id: fc.id,
                  name: fc.name,
                  response: 'Image displayed successfully'
                };
              } catch (error: any) {
                addDebugLog(`❌ show_image помилка: ${error.message}`);
                return {
                  id: fc.id,
                  name: fc.name,
                  response: `Error: ${error.message}`
                };
              }
            }

            return null;
          })
        );

        const validResponses = responses.filter(r => r !== null);
        addDebugLog(`📤 Відправляємо відповідь: ${JSON.stringify(validResponses).substring(0, 200)}`);
        
        client.sendToolResponse({
          functionResponses: validResponses,
        });
      }
    };

    client.on('toolcall', handleToolCall);

    return () => {
      client.off('toolcall', handleToolCall);
    };
  }, [client, connected]);

  return (
    <>
      <div className="keynote-companion">
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
        
        {/* STATUS INDICATOR */}
        <div style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: '#0f0',
          padding: '10px',
          borderRadius: '8px',
          fontSize: '12px',
          fontFamily: 'monospace',
          zIndex: 9999,
          wordBreak: 'break-word'
        }}>
          {toolCallStatus}
        </div>
        
        {/* Затемнення фону */}
        {currentImage && (
          <div
            onClick={() => setCurrentImage(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 999
            }}
          />
        )}
        
        {/* Canvas з зображенням */}
        {currentImage && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '90vw',
            maxWidth: '600px',
            height: 'auto',
            maxHeight: '80vh',
            border: '2px solid #ccc',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            padding: '20px'
          }}>
            <button
              onClick={() => setCurrentImage(null)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0,0,0,0.5)',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1001
              }}
            >
              ×
            </button>
            <img 
              src={currentImage} 
              alt="Content from spreadsheet"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
        )}

        {/* DEBUG PANEL */}
        {debugMode && (
          <div style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: '400px',
            maxHeight: '500px',
            backgroundColor: 'rgba(0,0,0,0.9)',
            color: '#0f0',
            fontFamily: 'monospace',
            fontSize: '12px',
            padding: '15px',
            borderRadius: '8px',
            zIndex: 2000,
            overflow: 'auto'
          }}>
            <div style={{ marginBottom: '10px', color: '#fff', fontWeight: 'bold' }}>
              🔧 Debug Panel
              <button 
                onClick={() => setDebugLog([])}
                style={{
                  marginLeft: '10px',
                  padding: '2px 8px',
                  fontSize: '10px',
                  background: '#444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <input
                type="text"
                placeholder="Spreadsheet ID"
                value={testSpreadsheetId}
                onChange={(e) => setTestSpreadsheetId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '5px',
                  background: '#222',
                  color: '#0f0',
                  border: '1px solid #444',
                  borderRadius: '4px'
                }}
              />
              <input
                type="text"
                placeholder="Range (A1:Z100)"
                value={testRange}
                onChange={(e) => setTestRange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '5px',
                  background: '#222',
                  color: '#0f0',
                  border: '1px solid #444',
                  borderRadius: '4px'
                }}
              />
              <button
                onClick={testServerDirectly}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0a0',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Test Server
              </button>
            </div>

            <div style={{ 
              maxHeight: '300px', 
              overflow: 'auto',
              fontSize: '11px',
              lineHeight: '1.4'
            }}>
              {debugLog.map((log, i) => (
                <div key={i} style={{ marginBottom: '5px' }}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <details className="info-overlay">
        <summary className="info-button">
          <span className="icon">info</span>
        </summary>
        <div className="info-text">
          <p>
            Experimental model from Google DeepMind. Adapted for the service. Speaks many languages. On iOS, disable AVR.
          </p>
          <button
            onClick={() => setDebugMode(!debugMode)}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              background: debugMode ? '#f00' : '#0a0',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {debugMode ? '🔴 Close Debug' : '🔧 Open Debug'}
          </button>
        </div>
      </details>
    </>
  );
}
