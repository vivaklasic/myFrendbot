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
            text: createSystemInstructions(current, user),
          },
        ],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'read_google_sheet',
              description: 'Read data from Google Sheets spreadsheet. Returns formatted data with headers. Use this when user asks about data in their spreadsheet.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  spreadsheetId: {
                    type: 'STRING',
                    description: 'The Google Sheets spreadsheet ID (from the URL)',
                  },
                  range: {
                    type: 'STRING',
                    description: 'The range to read, e.g. "A1:Z100" or "Sheet1!A1:B10". Include headers in the range.',
                  },
                },
                required: ['spreadsheetId', 'range'],
              },
            },
            {
              name: 'show_image',
              description: 'Display an image on the canvas. Use this when the spreadsheet data contains image URLs and you want to show them to the user.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  imageUrl: {
                    type: 'STRING',
                    description: 'The URL of the image to display',
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

    // Перший рядок - це заголовки
    const headers = values[0];
    const rows = values.slice(1);

    // Форматуємо як масив об'єктів для кращого розуміння
    const formattedData = rows.map((row, index) => {
      const rowData: Record<string, string> = {};
      headers.forEach((header, i) => {
        rowData[header] = row[i] || '';
      });
      return { rowNumber: index + 2, ...rowData }; // +2 бо 1 - заголовки, і рахуємо з 1
    });

    return JSON.stringify({
      headers: headers,
      totalRows: rows.length,
      data: formattedData
    }, null, 2);
  };

  // Обробка tool calls від Gemini
  useEffect(() => {
    if (!client || !connected) return;

    const handleToolCall = async (toolCall: any) => {
      console.log('Tool call received:', toolCall);

      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            if (fc.name === 'read_google_sheet') {
              try {
                const { spreadsheetId, range } = fc.args;
                
                console.log('Запит до Google Sheets:', { spreadsheetId, range });
                
                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();
                
                console.log('Відповідь від сервера:', data);

                if (data.success && data.data) {
                  const formattedData = formatSheetData(data.data);
                  
                  console.log('Форматовані дані:', formattedData);
                  
                  // ВИПРАВЛЕНА СТРУКТУРА: дані безпосередньо в response
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      output: formattedData,
                      success: true,
                      rowCount: data.data.length
                    },
                  };
                } else {
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      error: data.error || 'Failed to read spreadsheet',
                      success: false
                    },
                  };
                }
              } catch (error: any) {
                console.error('Помилка читання таблиці:', error);
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    error: error.message,
                    success: false
                  },
                };
              }
            }

            if (fc.name === 'show_image') {
              try {
                const { imageUrl } = fc.args;
                console.log('Показуємо зображення:', imageUrl);
                setCurrentImage(imageUrl);
                
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    output: 'Image displayed successfully',
                    success: true
                  },
                };
              } catch (error: any) {
                console.error('Помилка показу зображення:', error);
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    error: error.message,
                    success: false
                  },
                };
              }
            }

            return null;
          })
        );

        const validResponses = responses.filter(r => r !== null);
        console.log('Надсилаємо відповіді:', validResponses);
        
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
      </div>
      
      <details className="info-overlay">
        <summary className="info-button">
          <span className="icon">info</span>
        </summary>
        <div className="info-text">
          <p>
            Experimental model from Google DeepMind. Adapted for the service. Speaks many languages. On iOS, disable AVR.
          </p>
        </div>
      </details>
    </>
  );
}
