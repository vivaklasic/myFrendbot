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
  const [spreadsheetData, setSpreadsheetData] = useState<any[]>([]);

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
              description: 'Read data from Google Sheets spreadsheet. Use this when user asks about data in their spreadsheet or provides a spreadsheet ID.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  spreadsheetId: {
                    type: 'STRING',
                    description: 'The Google Sheets spreadsheet ID (from the URL)',
                  },
                  range: {
                    type: 'STRING',
                    description: 'The range to read, e.g. "A1:Z100" or "Sheet1!A1:B10"',
                  },
                },
                required: ['spreadsheetId', 'range'],
              },
            },
            {
              name: 'show_image',
              description: 'Display an image on the canvas. Use this when you want to show an image from the spreadsheet to the user.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  imageUrl: {
                    type: 'STRING',
                    description: 'The URL of the image to display',
                  },
                  description: {
                    type: 'STRING',
                    description: 'Optional description of the image',
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

  // Обробка tool calls від Gemini
  useEffect(() => {
    if (!client || !connected) return;

    const handleToolCall = async (toolCall: any) => {
      console.log('Tool call received:', toolCall);

      if (toolCall.functionCalls) {
        const responses = await Promise.all(
          toolCall.functionCalls.map(async (fc: any) => {
            // Читання Google Sheets
            if (fc.name === 'read_google_sheet') {
              try {
                const { spreadsheetId, range } = fc.args;
                
                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();

                if (data.success) {
                  // Зберігаємо дані таблиці
                  setSpreadsheetData(data.data);
                  
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: true,
                        data: data.data,
                        rowCount: data.data.length,
                      },
                    },
                  };
                } else {
                  return {
                    name: fc.name,
                    id: fc.id,
                    response: {
                      result: {
                        success: false,
                        error: data.error || 'Failed to read spreadsheet',
                      },
                    },
                  };
                }
              } catch (error: any) {
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: false,
                      error: error.message,
                    },
                  },
                };
              }
            }

            // Показати зображення
            if (fc.name === 'show_image') {
              try {
                const { imageUrl, description } = fc.args;
                
                // Встановлюємо URL зображення для відображення
                setCurrentImage(imageUrl);
                
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: true,
                      message: `Image displayed: ${description || imageUrl}`,
                    },
                  },
                };
              } catch (error: any) {
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: false,
                      error: error.message,
                    },
                  },
                };
              }
            }

            return null;
          })
        );

        // Відправляємо результати назад в Gemini
        client.sendToolResponse({
          functionResponses: responses.filter(r => r !== null),
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
      <div className="keynote-companion" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
        
        {/* Канвас для зображень */}
        {currentImage && (
          <div style={{
            width: '400px',
            height: '400px',
            border: '2px solid #ccc',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img 
              src={currentImage} 
              alt="Content from spreadsheet"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain'
              }}
              onError={(e) => {
                console.error('Failed to load image:', currentImage);
                e.currentTarget.style.display = 'none';
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
