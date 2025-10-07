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
                
                const response = await fetch('https://mc-pbot-google-sheets.vercel.app/api', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ spreadsheetId, range }),
                });

                const data = await response.json();

                if (data.success) {
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

            if (fc.name === 'show_image') {
              try {
                const { imageUrl } = fc.args;
                setCurrentImage(imageUrl);
                
                return {
                  name: fc.name,
                  id: fc.id,
                  response: {
                    result: {
                      success: true,
                      message: 'Image displayed',
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
      <div className="keynote-companion">
        <BasicFace canvasRef={faceCanvasRef!} color={current.bodyColor} />
      </div>
      
      {currentImage && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '90vw',
          maxWidth: '600px',
          height: 'auto',
          maxHeight: '70vh',
          border: '3px solid #333',
          borderRadius: '12px',
          overflow: 'hidden',
          backgroundColor: '#fff',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          zIndex: 1000,
          padding: '10px'
        }}>
          <button 
            onClick={() => setCurrentImage(null)}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: 'rgba(0,0,0,0.7)',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: '30px',
              height: '30px',
              cursor: 'pointer',
              fontSize: '18px',
              zIndex: 1001
            }}
          >
            ×
          </button>
          <img 
            src={currentImage} 
            alt="Content from spreadsheet"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain'
            }}
            onError={(e) => {
              console.error('Failed to load image:', currentImage);
              alert('Не удалось загрузить изображение. Проверьте, что ссылка - прямая ссылка на изображение (заканчивается на .jpg, .png и т.д.)');
              setCurrentImage(null);
            }}
          />
        </div>
      )}
      
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
